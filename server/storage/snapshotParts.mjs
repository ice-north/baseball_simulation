// ============================================================
// 保存一式（bundle）を「芯」と「部分」に分けて持つ。
//
// 【なぜ】命令のたびに世界一式（並行世界の全球団・高校生の母集団・試合記録など。
//   開幕直後で展開後約53MB）を読み書きしており、編成を1つ保存するだけで数秒かかっていた。
//   ほとんどの命令が触るのはリーグの球団（12）と手続き・参加者だけなので、
//   めったに変わらない大きな部分を別に置き、要るときだけ読む。
//
// 【分け方】
//   芯（core）  … 下記以外すべて。リーグの球団（season.settings.teamNames）もここ
//   world       … リーグ外の球団・高校生の母集団（pools）・世界（world）・自由契約（released）
//   records     … 試合と選手の記録（league.records）。ビューを作るのに要るので軽い読みでも読む
//   backup      … 管理者の退避（bundle.backup）。退避・復元のときだけ
//
// 【軽い読み（light）】芯と records だけ読み、world と backup は「触ったら印を付けて
//   止まる」番人（Proxy）に差し替える。命令やビュー作りが番人に触ったら、
//   保存側は**最初から全体を読み直してやり直す**（`NeedsFullWorld`）。印は例外を
//   握りつぶされても残るので、途中で catch されても取りこぼさない。
//   → どの命令が世界を読むかを書き並べなくても、正しさは崩れない（並べるのは速さのため）。
//
// ⚠ 元に戻せる形にすること。全体を読んだときは、分ける前と JSON で1文字も違わない
//    （キーの順も含む。球団の並びはシミュレーションの順に効く）。`online-parts-check`。
// ============================================================

export const SNAPSHOT_FORMAT = 2;
const WORLD_KEYS = ['pools', 'world', 'released'];

export class NeedsFullWorld extends Error {
  constructor(reason) {
    super(`軽い読み込みでは足りません（${reason}）`);
    this.name = 'NeedsFullWorld';
  }
}

/** 分けた形か（古い保存は bundle そのもの） */
export const isSplitSnapshot = (snapshot) =>
  snapshot?.snapshotFormat === SNAPSHOT_FORMAT;

/**
 * 全体の bundle を芯と部分に分ける。返す core は保存用の包み（部分の参照は呼ぶ側が入れる）。
 * 元の bundle は変えない。
 */
export function splitBundle(bundle) {
  const order = { bundle: Object.keys(bundle) };
  const { backup, ...rest } = bundle;
  const parts = {};
  if (backup !== undefined) parts.backup = backup;
  const league = rest.league;
  const names = league?.season?.settings?.teamNames;
  if (!league?.game?.teams || !Array.isArray(names))
    return { core: rest, order, parts };
  order.league = Object.keys(league);
  order.game = Object.keys(league.game);
  const inLeague = new Set(names);
  const coreTeams = {};
  const otherTeams = {};
  for (const [name, team] of Object.entries(league.game.teams))
    (inLeague.has(name) ? coreTeams : otherTeams)[name] = team;
  // 球団の並び（全体）。軽い読みで「リーグ外の球団名」を見分けるのにも使う
  order.teams = Object.keys(league.game.teams);
  const game = { ...league.game, teams: coreTeams };
  const world = { teams: otherTeams };
  for (const key of WORLD_KEYS)
    if (Object.hasOwn(game, key)) {
      world[key] = game[key];
      delete game[key];
    }
  parts.world = world;
  const { records, ...leagueRest } = league;
  if (records !== undefined) parts.records = records;
  return { core: { ...rest, league: { ...leagueRest, game } }, order, parts };
}

const ordered = (keys, source) => {
  const out = {};
  for (const key of keys || []) if (Object.hasOwn(source, key)) out[key] = source[key];
  for (const key of Object.keys(source)) if (!Object.hasOwn(out, key)) out[key] = source[key];
  return out;
};

/** 芯と全部の部分から、分ける前の bundle に戻す */
export function assembleBundle(core, order, parts) {
  const bundle = { ...core };
  if (parts.backup !== undefined) bundle.backup = parts.backup;
  const league = bundle.league;
  if (league && order?.teams) {
    const world = parts.world || { teams: {} };
    const teams = {};
    for (const name of order.teams) {
      if (Object.hasOwn(league.game.teams, name)) teams[name] = league.game.teams[name];
      else if (Object.hasOwn(world.teams, name)) teams[name] = world.teams[name];
    }
    for (const [name, team] of Object.entries(league.game.teams))
      if (!Object.hasOwn(teams, name)) teams[name] = team;
    const game = { ...league.game, teams };
    for (const key of WORLD_KEYS)
      if (Object.hasOwn(world, key)) game[key] = world[key];
    const nextLeague = { ...league, game: ordered(order.game, game) };
    if (parts.records !== undefined) nextLeague.records = parts.records;
    bundle.league = ordered(order.league, nextLeague);
  }
  return ordered(order?.bundle, bundle);
}

/**
 * 軽い読み: 芯と records だけで bundle を作り、world・backup は番人に差し替える。
 * 返す `inspect(bundle)` は、命令のあとで「軽い読みのまま保存できるか」と、保存する芯を返す。
 */
export function assembleLight(core, order, parts, refs) {
  const tracker = { touched: null };
  const touch = (reason) => {
    tracker.touched ??= reason;
    throw new NeedsFullWorld(reason);
  };
  const guard = (label) =>
    new Proxy(
      {},
      {
        get: () => touch(label),
        set: () => touch(label),
        has: () => touch(label),
        ownKeys: () => touch(label),
        deleteProperty: () => touch(label),
        defineProperty: () => touch(label),
        getOwnPropertyDescriptor: () => touch(label),
        getPrototypeOf: () => touch(label),
      },
    );
  const bundle = { ...core };
  const guards = {};
  if (refs.backup) bundle.backup = guards.backup = guard('backup');
  const league = bundle.league;
  let teamsTarget = null;
  let teamsProxy = null;
  if (league && order?.teams) {
    teamsTarget = league.game.teams;
    const others = new Set(order.teams.filter((n) => !Object.hasOwn(teamsTarget, n)));
    const own = (key) => typeof key === 'symbol' || Object.hasOwn(teamsTarget, key);
    teamsProxy = new Proxy(teamsTarget, {
      get: (t, key, receiver) =>
        own(key) || !others.has(key) ? Reflect.get(t, key, receiver) : touch(`リーグ外の球団 ${key}`),
      has: (t, key) => (own(key) ? Reflect.has(t, key) : others.has(key) ? touch(`リーグ外の球団 ${key}`) : false),
      ownKeys: () => touch('球団の一覧'),
      getOwnPropertyDescriptor: (t, key) =>
        own(key) ? Reflect.getOwnPropertyDescriptor(t, key) : others.has(key) ? touch(`リーグ外の球団 ${key}`) : undefined,
      set: (t, key, value, receiver) => (own(key) ? Reflect.set(t, key, value, receiver) : touch(`球団の追加 ${String(key)}`)),
      defineProperty: (t, key, desc) => (own(key) ? Reflect.defineProperty(t, key, desc) : touch(`球団の追加 ${String(key)}`)),
      deleteProperty: (t, key) => touch(`球団の削除 ${String(key)}`),
    });
    const game = { ...league.game, teams: teamsProxy };
    for (const key of WORLD_KEYS)
      if (order.game?.includes(key)) game[key] = guards[key] = guard(key);
    const nextLeague = { ...league, game: ordered(order.game, game) };
    if (parts.records !== undefined) nextLeague.records = parts.records;
    bundle.league = ordered(order.league, nextLeague);
  }
  const shaped = ordered(order?.bundle, bundle);
  const original = { league: shaped.league, game: shaped.league?.game };
  /**
   * 命令のあと: 番人に触っていない・形を差し替えていないなら、保存する芯と部分を返す。
   * 差し替えていた（リーグを作り直した・世界の部分を置き換えた）ら null（全体でやり直す）。
   */
  const inspect = (after) => {
    if (tracker.touched) return null;
    if (after.league !== original.league) return null;
    if (after.league && after.league.game !== original.game) return null;
    if (refs.backup && after.backup !== guards.backup) return null;
    if (!refs.backup && after.backup !== undefined) return null;
    if (after.league && !teamsProxy) {
      // 分けていないリーグ（球団の一覧が無い形）は芯にまるごと入っている
      const { backup, ...rest } = after;
      return { core: rest, order: { ...order, bundle: Object.keys(after) }, records: undefined, whole: true };
    }
    if (after.league) {
      const game = after.league.game;
      if (game.teams !== teamsProxy) return null;
      for (const key of WORLD_KEYS)
        if (guards[key] ? game[key] !== guards[key] : Object.hasOwn(game, key)) return null;
      // リーグの球団の入れ替え（昇降格など）は全体で分け直す
      const names = after.league.season?.settings?.teamNames;
      if (!Array.isArray(names) || names.length !== Object.keys(teamsTarget).length || names.some((n) => !Object.hasOwn(teamsTarget, n)))
        return null;
    }
    const { backup, ...rest } = after;
    const coreOut = { ...rest };
    const nextOrder = { ...order, bundle: Object.keys(after) };
    if (after.league) {
      const { records, ...leagueRest } = after.league;
      const game = { ...after.league.game, teams: teamsTarget };
      for (const key of WORLD_KEYS) delete game[key];
      coreOut.league = { ...leagueRest, game };
      nextOrder.league = Object.keys(after.league);
      nextOrder.game = Object.keys(after.league.game);
      return { core: coreOut, order: nextOrder, records };
    }
    return { core: coreOut, order: nextOrder, records: undefined };
  };
  return { bundle: shaped, tracker, inspect };
}
