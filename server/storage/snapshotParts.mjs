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
//   pastGames   … 終わった年（今季より前）の試合の記録（records.seasons[年].games）。
//                  1年で約22MB（展開後）増え、軽い読みでも毎回読んでいた（先方回答 F1）。
//                  records の中のその場所には印（`PAST_GAMES`）を置き、全体を読むときに戻す。
//                  軽い読みでは印を番人に差し替える（触ったら全体を読み直す）
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

// ⚠ 3: 終わった年の試合の記録を分けた形（pastGames）。2 の保存もそのまま読める。
//    上げたのは、この形を知らない古いコードに戻したとき、包みを読まずに断らせるため
//    （2 だと読めてしまい、印の文字列を試合の一覧として読む）
export const SNAPSHOT_FORMAT = 3;
const READABLE_FORMATS = [2, 3];
/** 終わった年の試合の記録を別の部分へ出したあとに残す印 */
export const PAST_GAMES = '@pastGames';
const WORLD_KEYS = ['pools', 'world', 'released'];

export class NeedsFullWorld extends Error {
  constructor(reason) {
    super(`軽い読み込みでは足りません（${reason}）`);
    this.name = 'NeedsFullWorld';
  }
}

/** 分けた形か（古い保存は bundle そのもの） */
export const isSplitSnapshot = (snapshot) =>
  READABLE_FORMATS.includes(snapshot?.snapshotFormat);

/**
 * 記録から、終わった年（`year` より前）の試合の記録を抜き出す。元の記録は変えない。
 * ⚠ 抜いた場所に印を置く（キーの順を変えないため。全体を読んだとき1文字も違わないこと）
 */
function splitPastGames(records, year) {
  if (!isObject(records?.seasons) || !Number.isFinite(year)) return { records };
  let pastGames = null;
  let seasons = null;
  for (const [key, season] of Object.entries(records.seasons)) {
    // ⚠ 印のまま来た（軽い読みの記録を全体の保存に回した）なら止める。黙って飛ばすと
    //    pastGames にその年が入らず、次に読むとき戻せなくてリーグが読めなくなる
    if (season?.games === PAST_GAMES)
      throw new Error(`終わった年（${key}）の試合の記録が印のまま保存されようとしました`);
    if (!(Number(key) < year) || !isObject(season?.games)) continue;
    pastGames ||= {};
    seasons ||= { ...records.seasons };
    pastGames[key] = season.games;
    seasons[key] = { ...season, games: PAST_GAMES };
  }
  return pastGames ? { records: { ...records, seasons }, pastGames } : { records };
}

/** 印の場所に、終わった年の試合の記録を戻す（その場で書き換える） */
function restorePastGames(records, pastGames) {
  for (const [key, season] of Object.entries(records?.seasons || {}))
    if (season?.games === PAST_GAMES) {
      if (!isObject(pastGames?.[key])) throw new Error(`終わった年（${key}）の試合の記録が見つかりません`);
      season.games = pastGames[key];
    }
  return records;
}

/**
 * 全体の bundle を芯と部分に分ける。返す core は保存用の包み（部分の参照は呼ぶ側が入れる）。
 * 元の bundle は変えない。
 */
export function splitBundle(bundle) {
  const order = { bundle: Object.keys(bundle) };
  const { backup, ...rest } = bundle;
  const parts = {};
  // ⚠ 部分に出すのは**オブジェクト（配列を含む）だけ**。null や文字列を番人に差し替えると、
  //    `if (bundle.backup)` のような真偽の判定が、番人に触れないまま逆の答えになる
  if (isObject(backup)) parts.backup = backup;
  else if (backup !== undefined) rest.backup = backup;
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
  // 番人の形（配列か）。`Array.isArray` は番人を通らずに中身の形を答えるので、元と揃える
  order.arrays = [];
  for (const key of WORLD_KEYS)
    if (Object.hasOwn(game, key) && isObject(game[key])) {
      world[key] = game[key];
      if (Array.isArray(game[key])) order.arrays.push(key);
      delete game[key];
    }
  if (Array.isArray(backup)) order.arrays.push('backup');
  parts.world = world;
  const { records, ...leagueRest } = league;
  if (records !== undefined) {
    const split = splitPastGames(records, league.season?.year);
    parts.records = split.records;
    if (split.pastGames) parts.pastGames = split.pastGames;
  }
  return { core: { ...rest, league: { ...leagueRest, game } }, order, parts };
}

const isObject = (value) => value !== null && typeof value === 'object';

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
    if (parts.records !== undefined) nextLeague.records = restorePastGames(parts.records, parts.pastGames);
    bundle.league = ordered(order.league, nextLeague);
  }
  return ordered(order?.bundle, bundle);
}

/**
 * 命令を「まず軽い読み、だめなら全体で読み直して」走らせる。
 * ⚠ **本番（`SupabaseStore.transaction`）と検査用の保存（`MemoryStore.transaction`）で
 *    同じこの判定を使う**。両方に書き写していると、片方だけ直したときに検査が本番の
 *    取りこぼしを捕まえられなくなる。
 *
 * - `load(light)` … 保存を読む。軽い読みなら `run` に `assembleLight` の返り値を入れて返す
 * - `attempt(loaded)` … 命令を走らせ、`{ outcome, prepared, ... }` を返す。
 *   `prepared` は変更を保存する形（軽い読みなら `run.inspect(bundle)`。null は保存できない）
 *
 * 全体で読み直すのは、軽い読みで: 番人（世界・記録）に触れた（命令が例外を握りつぶしても
 * 印は残る）・複製で落ちた（`DataCloneError`。番人は複製できない）・変更があるのに
 * 軽い読みのまま保存できない（リーグや世界を差し替えた）とき。
 * 返り値は `attempt` の返り値に、読んだもの（`loaded`）と読んだ回数（`attempts`）を足したもの。
 */
export async function runWithLightRead({ full = false, load, attempt, onEscalate = () => {} }) {
  let light = !full;
  for (let attempts = 1; ; attempts++) {
    const loaded = await load(light);
    const run = loaded.run || null;
    let result;
    try {
      result = await attempt(loaded);
    } catch (error) {
      if (run && (run.tracker.touched || error?.name === 'DataCloneError')) {
        onEscalate(run.tracker.touched, error);
        light = false;
        continue;
      }
      throw error;
    }
    if (run && (run.tracker.touched || (!result.outcome?.unchanged && !result.prepared))) {
      onEscalate(run.tracker.touched, null);
      light = false;
      continue;
    }
    return { ...result, loaded, attempts };
  }
}

/**
 * 軽い読み: 芯と records だけで bundle を作り、world・backup は番人に差し替える。
 * `parts` に records が無く `refs` にはあるとき（読むだけの処理）は、records も番人にする。
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
      order?.arrays?.includes(label) ? [] : {},
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
  // 終わった年の試合の記録の番人（年 → 番人）
  const pastGuards = {};
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
      if (order.game?.includes(key) && !Object.hasOwn(game, key)) game[key] = guards[key] = guard(key);
    const nextLeague = { ...league, game: ordered(order.game, game) };
    if (parts.records !== undefined) {
      // ⚠ 終わった年の試合の記録は読まない。印の場所を番人にする（触ったら全体を読み直す）
      nextLeague.records = parts.records;
      for (const [key, season] of Object.entries(parts.records?.seasons || {}))
        if (season?.games === PAST_GAMES) season.games = pastGuards[key] = guard(`終わった年の試合 ${key}`);
    }
    // 記録も読まなかった（読むだけの処理。`SupabaseStore.readLight`）なら、記録も番人にする
    else if (refs.records) nextLeague.records = guard('records');
    bundle.league = ordered(order.league, nextLeague);
  }
  const shaped = ordered(order?.bundle, bundle);
  const original = { league: shaped.league, game: shaped.league?.game };
  const originalYear = shaped.league?.season?.year;
  /**
   * 保存する記録: 番人を印に戻した写し。番人を差し替えていた（終わった年の試合を書き換えた）なら null
   * ⚠ 番人のまま JSON にすると、番人に触れて落ちる
   */
  const withPastMarkers = (records) => {
    const years = Object.keys(pastGuards);
    if (!years.length || !isObject(records?.seasons)) return records;
    const seasons = { ...records.seasons };
    for (const key of years) {
      const season = seasons[key];
      if (!season || season.games !== pastGuards[key]) return null;
      seasons[key] = { ...season, games: PAST_GAMES };
    }
    return { ...records, seasons };
  };
  /**
   * 命令のあと: 番人に触っていない・形を差し替えていないなら、保存する芯と部分を返す。
   * 差し替えていた（リーグを作り直した・世界の部分を置き換えた）ら null（全体でやり直す）。
   */
  const inspect = (after) => {
    if (tracker.touched) return null;
    if (after.league !== original.league) return null;
    if (after.league && after.league.game !== original.game) return null;
    if (refs.backup && after.backup !== guards.backup) return null;
    // 退避が新しくオブジェクトとして入った（退避の命令）なら、全体で分け直す
    if (!refs.backup && isObject(after.backup)) return null;
    // 芯に置く形（番人と、部分から戻した記録を外す）。null などの値はそのまま芯に残す
    const coreOf = (source) => {
      const out = { ...source };
      if (refs.backup) delete out.backup;
      return out;
    };
    const nextOrder = { ...order, bundle: Object.keys(after) };
    if (after.league && !teamsProxy)
      // 分けていないリーグ（球団の一覧が無い形）は芯にまるごと入っている
      return { core: coreOf(after), order: nextOrder, records: undefined, whole: true };
    if (!after.league) return { core: coreOf(after), order: nextOrder, records: undefined };
    const game = after.league.game;
    if (game.teams !== teamsProxy) return null;
    for (const key of WORLD_KEYS) {
      if (guards[key] && game[key] !== guards[key]) return null;
      // 番人の無い（元は null などだった）所へオブジェクトが入ったら、全体で分け直す
      if (!guards[key] && isObject(game[key])) return null;
    }
    // リーグの球団の入れ替え（昇降格など）は全体で分け直す
    const names = after.league.season?.settings?.teamNames;
    if (!Array.isArray(names) || names.length !== Object.keys(teamsTarget).length || names.some((n) => !Object.hasOwn(teamsTarget, n)))
      return null;
    const { records: liveRecords, ...leagueRest } = after.league;
    // 年が変わった（今季より前の年が増えた）なら、全体で分け直す
    if (after.league.season?.year !== originalYear) return null;
    const records = withPastMarkers(liveRecords);
    if (records === null) return null;
    const coreGame = { ...game, teams: teamsTarget };
    for (const key of Object.keys(guards)) delete coreGame[key];
    const coreOut = coreOf(after);
    coreOut.league = { ...leagueRest, game: coreGame };
    nextOrder.league = Object.keys(after.league);
    nextOrder.game = Object.keys(game);
    return { core: coreOut, order: nextOrder, records };
  };
  return { bundle: shaped, tracker, inspect };
}
