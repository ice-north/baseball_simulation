// ============================================================
// 指導者（監督・投手コーチ・野手コーチ）
//
// いしだ依頼（2026-11-09「CPU球団に個性を持たせる」）。仕様書:
// https://claude.ai/artifact/HN144s1P83tcUtWbSdH7yU
//
// 【何をするものか】全12球団に監督・投手コーチ・野手コーチの3人を置き、
// **その人の考え方と性格で球団ごとの野球の色を出す**。
//
// ⚠ **能力を上げる効果は一切持たせない**（いしだ指定）。一人用の社会人モードの
//    スタッフ（`src/corporate/staffData.js`）は「打撃指導 70」のような数字で
//    練習の伸びを足すが、ここは考え方と性格だけ。
// ⚠ 考え方は**いま人が選べる設定**（`tactics.js` の采配・方針）と、CPUが
//    使っている点数の重み（トライアウト・退団・トレードの返事）にだけ効かせる。
//    試合の計算に新しい補正は足さない。人が同じ設定を選べば同じ試合になる。
// ⚠ ここは**乱数を引かない純粋な計算**と、乱数を引く生成（`generateCoach`）を
//    分けてある。生成は必ず種を決めた中（`seeded` / `withSeededRandom`）で呼ぶこと。
//    同じリーグを作り直したら同じ顔ぶれにならないと、再現が崩れる。
// ============================================================
import { getRandomSurname, getRandomGivenName } from '../data/playerNames.js';
import { hashSeed, withSeededRandom } from '../game/rng.js';
import { TACTIC_FIELDS, STRATEGY_FIELDS } from './tactics.js';

/** 役職。⚠ 監督とコーチは同じ「指導者」。役職は配属で決まる（コーチから監督へも上がる） */
export const COACH_ROLES = ['manager', 'pitching', 'batting'];
export const ROLE_LABELS = {
  manager: '監督',
  pitching: '投手コーチ',
  batting: '野手コーチ',
};

/**
 * 考え方。値は -2〜2 の整数（0 が標準）。
 * `domain` はその考え方がはっきりしやすい得意分野（`specialty`）。
 */
export const VIEWS = {
  smallBall: { label: '小技', low: '少なめ', high: '多め', domain: 'manager' },
  // ⚠ 代打・守備固めは**遅らせる向きしか無い**（設定「○回以降」は使い始めを遅らせるだけで、
  //    標準のAIより多く使う手が無い）。だから値は -2〜0（生成で 0 を上限にする）
  bench: { label: '代打・守備固め', low: '遅め', high: '標準', domain: 'manager', oneSided: true },
  build: { label: '編成', low: '育成', high: '勝負', domain: 'manager' },
  pitching: { label: '投球', low: '打たせて取る', high: '三振狙い', domain: 'pitching' },
  bullpen: { label: '継投', low: '先発に任せる', high: '早め', domain: 'pitching' },
  hitting: { label: '打撃', low: '慎重', high: '積極', domain: 'batting' },
  running: { label: '走塁', low: '慎重', high: '積極', domain: 'batting' },
};
export const VIEW_KEYS = Object.keys(VIEWS);

/** 性格。値は -2〜2 の整数 */
export const PERSONALITY = {
  temper: { label: '気質', low: '我慢強い', high: '短気' },
  youth: { label: '起用', low: 'ベテラン好き', high: '若手好き' },
  trust: { label: '任せ方', low: 'ワンマン', high: '任せる' },
  boldness: { label: '戦い方', low: '守り', high: '攻め' },
};
export const PERSONALITY_KEYS = Object.keys(PERSONALITY);

/** 好む選手（トライアウトの小さな加点） */
export const PITCHER_PREFS = { velocity: '速球派', control: '技巧派' };
export const HITTER_PREFS = { power: '長打', contact: '巧打', speed: '俊足' };
/** キャンプの考え方。`fit` は選手ごとのおすすめ（画面の「おすすめ」と同じ決め方） */
export const CAMP_PREFS = {
  fit: '選手に合わせる',
  balanced: '全体を伸ばす',
  sharpen: '長所を伸ばす',
  patch: '短所を埋める',
};
export const CAMP_PHASE_PREFS = { skill: '技術', physique: '基礎体力' };

/** 得意分野（どの考え方がはっきりしているか） */
export const SPECIALTY_LABELS = {
  manager: '采配',
  pitching: '投手',
  batting: '野手',
};

/**
 * 人の球団が分野ごとに選ぶ任せ方。
 * ⚠ **既定は「意見を聞く」**（いしだ指定）。全部「自分で」にすれば、
 *    指導者を入れる前とまったく同じ動きになる（検査で確かめる）。
 */
export const STAFF_MODES = {
  self: '自分で',
  advice: '意見を聞く',
  delegate: '任せる',
};
export const DEFAULT_STAFF_MODE = 'advice';

/**
 * 分野。`owner` はその分野の判断を受け持つ役職（試合中の采配は項目ごとに違うので null）。
 */
export const STAFF_AREAS = {
  lineup: { label: 'スタメンと打順', owner: 'batting' },
  pitching: { label: '投手起用', owner: 'pitching' },
  tactics: { label: '試合中の采配', owner: null },
  tryout: { label: 'トライアウト', owner: 'manager' },
  release: { label: '退団', owner: 'manager' },
  camp: { label: 'キャンプ', owner: null },
};
export const STAFF_AREA_KEYS = Object.keys(STAFF_AREAS);
/** 手続きと、それを受け持つ任せ方の分野（トライアウト・契約更改の退団・キャンプ） */
export const PHASE_STAFF_AREA = { tryout: 'tryout', contract: 'release', camp: 'camp' };

/** 人の球団の任せ方（無ければ既定）。⚠ 保存は `member.staffModes`（無い人もいる） */
export function staffModesOf(member) {
  const saved = member?.staffModes || {};
  return Object.fromEntries(
    STAFF_AREA_KEYS.map((key) => [
      key,
      Object.hasOwn(STAFF_MODES, saved[key]) ? saved[key] : DEFAULT_STAFF_MODE,
    ]),
  );
}

// ------------------------------------------------------------
// 采配の項目と、受け持つ役職・考え方
// ------------------------------------------------------------

/**
 * 試合中の采配（`TACTIC_FIELDS`）の受け持ち。`[役職, 考え方]`。
 * ⚠ 代打を使うか（`pinchHit`）・守備固めを使うか（`defensiveSub`）は指導者が
 *    触らない（「使わない」は極端で、人が選ぶもの）。
 */
export const TACTIC_OWNERS = {
  sacrificeBunt: ['manager', 'smallBall'],
  squeeze: ['manager', 'smallBall'],
  safetyBunt: ['manager', 'smallBall'],
  pinchHitFrom: ['manager', 'bench'],
  defenseFrom: ['batting', 'bench'],
  hook: ['pitching', 'bullpen'],
  starterLimit: ['pitching', 'bullpen'],
};
/**
 * 方針（`STRATEGY_FIELDS`）の受け持ち。
 * ⚠ 守備方針（前進守備・シフト）は1試合ずっと効く極端な設定なので触らない。
 */
export const STRATEGY_OWNERS = {
  batting: ['batting', 'hitting'],
  pitching: ['pitching', 'pitching'],
  baseRunning: ['batting', 'running'],
};

/** 「AI判断」とみなす値（この値のときだけ、意見を聞くで指導者の考えが入る） */
const isAuto = (key, value) =>
  value === undefined ||
  value === null ||
  value === 'auto' ||
  ((key === 'pinchHitFrom' || key === 'defenseFrom' || key === 'starterLimit') &&
    Number(value) === 0);

/** 混ぜた考え方（小数）をどちらに倒すか。⚠ ±0.75 までは「標準」 */
const LEAN = 0.75;
const lean = (v) => (v <= -LEAN ? -1 : v >= LEAN ? 1 : 0);

/** 考え方 → 設定の値 */
function optionFor(key, v) {
  const side = lean(v);
  switch (key) {
    case 'sacrificeBunt':
    case 'squeeze':
    case 'safetyBunt':
      return side < 0 ? 'avoid' : side > 0 ? 'aggressive' : 'auto';
    case 'pinchHitFrom':
      // ⚠ 「多め」は表せない（いまのAIが6回から出すのが最も早い）。少なめだけ8回からにする
      return side < 0 ? 8 : 0;
    case 'defenseFrom':
      return side < 0 ? 9 : 0;
    case 'hook':
      return side < 0 ? 'patient' : side > 0 ? 'early' : 'auto';
    case 'starterLimit':
      // ⚠ 早めの継投が強い人だけ100球で代える（スタミナ100の先発の上限は95球なので、
      //    効くのはスタミナの多い先発だけ）
      return v >= 1.25 ? 100 : 0;
    case 'batting':
      return side < 0 ? 'patient' : side > 0 ? 'aggressive' : 'balanced';
    case 'pitching':
      return side < 0 ? 'contact' : side > 0 ? 'strikeout' : 'balanced';
    case 'baseRunning':
      return side < 0 ? 'conservative' : side > 0 ? 'aggressive' : 'normal';
    default:
      return undefined;
  }
}

/** 監督の任せ度（0〜1）。性格の「任せ方」から決まる */
export const delegationOf = (manager) =>
  manager ? (clampInt(manager.personality?.trust ?? 0) + 2) / 4 : 1;

// ⚠ `|| 0` で -0 を 0 にする（保存の JSON を通ると -0 は 0 になり、作り直しと食い違う）
const clampInt = (v) => Math.max(-2, Math.min(2, Math.round(Number(v) || 0))) || 0;
/** 呼び名（姓だけ。「山田監督」）。名前は「姓 名」 */
export const shortName = (coach) => String(coach?.name || '').split(/\s+/)[0];
const viewOf = (coach, key) => clampInt(coach?.views?.[key] ?? 0);

/**
 * 役職の受け持ちの判断に使う考え方（小数）と、決めた人の説明。
 *
 * - 監督の受け持ち … 監督の考え方だけ
 * - コーチの受け持ち … 監督とコーチを任せ度で混ぜる（ワンマン 0%〜任せる 100%）
 *
 * `strictSeats`: 人の球団。**席が空いている受け持ちは「自分で」**（いしだ指定）。
 *    CPUはコーチが空席なら監督が決める。
 * 返り値 null は「指導者は決めない」（保存した設定のまま）。
 */
export function blendView(staff, role, key, { strictSeats = false } = {}) {
  const manager = staff?.manager || null;
  const coach = role === 'manager' ? null : staff?.[role] || null;
  if (role === 'manager') {
    if (!manager) return null;
    return { value: viewOf(manager, key), by: `${shortName(manager)}監督` };
  }
  if (!coach) {
    if (strictSeats || !manager) return null;
    return { value: viewOf(manager, key), by: `${shortName(manager)}監督` };
  }
  if (!manager)
    return { value: viewOf(coach, key), by: `${shortName(coach)}${ROLE_LABELS[role]}` };
  const w = delegationOf(manager);
  const value = viewOf(manager, key) * (1 - w) + viewOf(coach, key) * w;
  // ⚠ 画面では「（…）」の中に入るので、ここに括弧を使わない
  const by =
    w === 0
      ? `${shortName(manager)}監督・ワンマン`
      : w === 1
        ? `${shortName(coach)}${ROLE_LABELS[role]}`
        : `${shortName(coach)}${ROLE_LABELS[role]}と${shortName(manager)}監督・任せ度${Math.round(w * 100)}%`;
  return { value, by };
}

const optionLabel = (fields, key, value) => {
  const options = fields[key]?.[1] || {};
  return options[value] ?? options[String(value)] ?? String(value);
};

/**
 * その日の采配・方針（試合で実際に使う値）と、画面に出す内訳。
 *
 * - CPU（`human: false`）… 指導者が全部決める（任せると同じ）
 * - 人・自分で … 保存した設定のまま。指導者は何もしない
 * - 人・意見を聞く … 「AI判断」の項目だけ指導者の考えで動く。方針（打撃など）は保存のまま
 * - 人・任せる … 采配も方針も指導者が決める
 *
 * ⚠ 返す `tactics` / `strategy` は**その日だけ当てる写し**。保存した設定を書き換えない
 *    （人が「自分で」に戻したとき、元の設定が残っているように）。
 */
export function staffTactics({
  staff,
  human = false,
  mode = 'delegate',
  tactics = {},
  strategy = {},
}) {
  const effectiveMode = human ? mode : 'delegate';
  const outTactics = { ...(tactics || {}) };
  const outStrategy = { ...(strategy || {}) };
  const lines = [];
  for (const [key, [label]] of Object.entries(TACTIC_FIELDS)) {
    const setting = tactics?.[key];
    const owner = TACTIC_OWNERS[key];
    let by = null;
    if (owner && effectiveMode !== 'self' && (effectiveMode === 'delegate' || isAuto(key, setting))) {
      const blended = blendView(staff, owner[0], owner[1], { strictSeats: human });
      if (blended) {
        outTactics[key] = optionFor(key, blended.value);
        by = blended.by;
      }
    }
    lines.push({
      field: 'tactics',
      key,
      label,
      setting: setting ?? null,
      settingLabel: optionLabel(
        TACTIC_FIELDS,
        key,
        setting ?? Object.keys(TACTIC_FIELDS[key][1])[0],
      ),
      value: outTactics[key] ?? null,
      valueLabel: optionLabel(
        TACTIC_FIELDS,
        key,
        outTactics[key] ?? Object.keys(TACTIC_FIELDS[key][1])[0],
      ),
      by,
    });
  }
  for (const [key, [label]] of Object.entries(STRATEGY_FIELDS)) {
    const setting = strategy?.[key];
    const owner = STRATEGY_OWNERS[key];
    let by = null;
    if (owner && effectiveMode === 'delegate') {
      const blended = blendView(staff, owner[0], owner[1], { strictSeats: human });
      if (blended) {
        outStrategy[key] = optionFor(key, blended.value);
        by = blended.by;
      }
    }
    lines.push({
      field: 'strategy',
      key,
      label,
      setting: setting ?? null,
      settingLabel: optionLabel(
        STRATEGY_FIELDS,
        key,
        setting ?? Object.keys(STRATEGY_FIELDS[key][1])[0],
      ),
      value: outStrategy[key] ?? null,
      valueLabel: optionLabel(
        STRATEGY_FIELDS,
        key,
        outStrategy[key] ?? Object.keys(STRATEGY_FIELDS[key][1])[0],
      ),
      by,
    });
  }
  return { tactics: outTactics, strategy: outStrategy, lines };
}

// ------------------------------------------------------------
// 編成（トライアウト・退団・トレードの返事・キャンプ）
// ------------------------------------------------------------

const prefBonus = (pref, p) => {
  const capped = (v) => Math.max(-12, Math.min(12, v));
  switch (pref) {
    case 'velocity':
      return capped(((p.pitching?.velocity || 140) - 140) * 0.8);
    case 'control':
      return capped(((p.pitching?.control || 50) - 50) * 0.4);
    case 'power':
      return capped(((p.batting?.power || 50) - 50) * 0.4);
    case 'contact':
      return capped(((p.batting?.meet || 50) - 50) * 0.4);
    case 'speed':
      return capped(((p.physical?.speed || 50) - 50) * 0.4);
    default:
      return 0;
  }
};

/**
 * トライアウトの選び方に渡す球団の事情（`selectPlayerForAI` の `teamContext`）。
 *
 * - `winRate` … 若手を取るか即戦力を取るか。監督の「編成」と前年の勝率で決まる
 *   （もとからある「勝率で寄せる」仕組みをそのまま使う）
 * - `bonus` … 好む選手への小さな加点（最大±12点。候補の点数の揺らぎ±8と同じくらい）
 *
 * 投手の好みは投手コーチ、野手の好みは野手コーチ（監督の任せ度で監督の好みと混ぜる）。
 * 監督が居なければ null（人の球団で監督が空席＝自分で）。
 */
export function tryoutContext(staff, { lastWinRate = 0.5 } = {}) {
  const manager = staff?.manager;
  if (!manager) return null;
  const w = delegationOf(manager);
  const build = viewOf(manager, 'build');
  const pitchPrefs = [
    [manager.prefs?.pitcher, staff.pitching ? 1 - w : 1],
    [staff.pitching?.prefs?.pitcher, staff.pitching ? w : 0],
  ];
  const hitPrefs = [
    [manager.prefs?.hitter, staff.batting ? 1 - w : 1],
    [staff.batting?.prefs?.hitter, staff.batting ? w : 0],
  ];
  const youth = clampInt(manager.personality?.youth);
  return {
    winRate: Math.max(0, Math.min(1, 0.5 + 0.12 * build + 0.5 * ((lastWinRate ?? 0.5) - 0.5))),
    bonus: (p) => {
      const prefs = p.position === 'pitcher' ? pitchPrefs : hitPrefs;
      let score = 0;
      for (const [pref, weight] of prefs) if (pref && weight) score += prefBonus(pref, p) * weight;
      // 若手好き・ベテラン好き（20歳以下と27歳以上に±2点ずつ）
      const age = p.age || 22;
      if (age <= 20) score += youth * 2;
      else if (age >= 27) score -= youth * 2;
      return score;
    },
  };
}

/** 退団の選び方の偏り（監督の「若手好き」。若手好きほどベテランを早めに出す） */
export function releaseBias(staff) {
  const manager = staff?.manager;
  return manager ? { youth: clampInt(manager.personality?.youth) } : null;
}

/**
 * CPU球団がトレードで選手を見る目（`tradeValueOf` にかける倍率）。
 * 育成の監督は若手を高く、勝負の監督はいまの主力の年齢（27歳以上）を高く見る。
 * ⚠ 上乗せ（`CPU_ACCEPT_MARGIN`）は全球団そのまま。見る目だけを変える。
 */
export function tradeFactor(staff, player) {
  const manager = staff?.manager;
  if (!manager || !player) return 1;
  const build = viewOf(manager, 'build');
  const youth = clampInt(manager.personality?.youth);
  const age = player.age || 25;
  let f = 1;
  if (age <= 23) f += -0.06 * build + 0.03 * youth;
  else if (age >= 27) f += 0.06 * build - 0.03 * youth;
  return Math.max(0.8, Math.min(1.2, f));
}

/**
 * キャンプの方針（選手ごとの上書き）。投手は投手コーチ、野手は野手コーチの考え方。
 * コーチが居なければ監督。誰も居なければ null（標準のまま）。
 *
 * `recommended`: 選手ごとのおすすめ（`trainingPolicy.playerPolicy` の recommended）を返す関数。
 *    「選手に合わせる」コーチはそれを使う。
 */
export function campPlan(staff, roster, recommended, { strictSeats = false } = {}) {
  const pick = (role) =>
    staff?.[role] || (strictSeats ? null : staff?.manager) || null;
  const players = {};
  let any = false;
  for (const player of roster || []) {
    const coach = pick(player.position === 'pitcher' ? 'pitching' : 'batting');
    if (!coach) continue;
    any = true;
    const style = coach.prefs?.camp || 'balanced';
    players[player.id] =
      style === 'fit'
        ? recommended(player)
        : { direction: style, phase: coach.prefs?.campPhase || 'skill' };
  }
  return any ? { policy: { mode: 'team', direction: 'balanced', phase: 'skill' }, players } : null;
}

// ------------------------------------------------------------
// 説明の文（画面・紙面で同じ文を使う。サーバーでだけ作る）
// ------------------------------------------------------------

const VIEW_PHRASES = {
  smallBall: ['強攻', '小技を多用'],
  bench: ['代打・守備固めは終盤だけ', null],
  build: ['育成重視', '勝負重視'],
  pitching: ['打たせて取る投球', '三振を狙う投球'],
  bullpen: ['先発に長く任せる', '継投は早め'],
  hitting: ['じっくり待つ打撃', '積極的に振る打撃'],
  running: ['走塁は慎重', '機動力野球'],
};

/** 「機動力野球・継投は早め」のような、その人の色の一言（強いものから2つ） */
export function coachColor(coach) {
  if (!coach) return '';
  const domainFirst = (key) => (VIEWS[key].domain === coach.specialty ? 1 : 0);
  const strong = VIEW_KEYS.map((key) => ({ key, v: viewOf(coach, key) }))
    .filter((x) => x.v !== 0)
    .sort(
      (a, b) =>
        Math.abs(b.v) - Math.abs(a.v) ||
        domainFirst(b.key) - domainFirst(a.key) ||
        VIEW_KEYS.indexOf(a.key) - VIEW_KEYS.indexOf(b.key),
    )
    .filter(({ key, v }) => VIEW_PHRASES[key][v < 0 ? 0 : 1])
    .slice(0, 2)
    .map(({ key, v }) => VIEW_PHRASES[key][v < 0 ? 0 : 1]);
  return strong.length ? strong.join('・') : '堅実な標準型';
}

/** 性格の一言（「短気・若手好き」）。標準の軸は出さない */
export function personalityText(coach) {
  const words = PERSONALITY_KEYS.filter((k) => k !== 'trust')
    .map((key) => {
      const v = clampInt(coach?.personality?.[key]);
      return v === 0 ? null : PERSONALITY[key][v < 0 ? 'low' : 'high'];
    })
    .filter(Boolean);
  const trust = clampInt(coach?.personality?.trust);
  if (trust <= -2) words.push('ワンマン');
  else if (trust >= 2) words.push('コーチに任せる');
  return words.join('・') || '穏やか';
}

/** 考え方の目盛り（数字ではなく「積極←→慎重」の位置。-2〜2） */
export function viewScale(coach) {
  return VIEW_KEYS.map((key) => {
    const value = viewOf(coach, key);
    const def = VIEWS[key];
    const word = value < 0 ? def.low : def.high;
    return {
      key,
      label: def.label,
      low: def.low,
      high: def.high,
      value,
      // ⚠ 片側だけの考え方（代打・守備固め）は -2〜0 の目盛り
      ...(def.oneSided ? { oneSided: true } : {}),
      text: value === 0 || (def.oneSided && value > 0) ? '標準' : `${Math.abs(value) === 1 ? 'やや' : ''}${word}`,
    };
  });
}

export function personalityScale(coach) {
  return PERSONALITY_KEYS.map((key) => {
    const value = clampInt(coach?.personality?.[key]);
    const def = PERSONALITY[key];
    return {
      key,
      label: def.label,
      low: def.low,
      high: def.high,
      value,
      text: value === 0 ? 'ふつう' : `${Math.abs(value) === 1 ? 'やや' : ''}${value < 0 ? def.low : def.high}`,
    };
  });
}

/** 経歴の一言（「元投手・湘南サンズで8年」「元内野手」） */
export function originText(coach) {
  const o = coach?.origin || {};
  const pos = POSITION_WORDS[o.position] || '選手';
  if (o.kind === 'player' && o.team)
    return `元${pos}（${o.teamLabel || o.team}${o.seasons ? `で${o.seasons}年` : ''}）`;
  return `元${pos}`;
}
const POSITION_WORDS = {
  pitcher: '投手',
  catcher: '捕手',
  infield: '内野手',
  outfield: '外野手',
};
export const positionGroup = (position) =>
  position === 'pitcher'
    ? 'pitcher'
    : position === 'catcher'
      ? 'catcher'
      : ['left', 'center', 'right'].includes(position)
        ? 'outfield'
        : 'infield';

// ------------------------------------------------------------
// 生成（乱数を引く。必ず種を決めた中で呼ぶこと）
// ------------------------------------------------------------

const rand = () => Math.random();
const pickWeighted = (table) => {
  const total = Object.values(table).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [key, weight] of Object.entries(table)) {
    r -= weight;
    if (r < 0) return key;
  }
  return Object.keys(table).at(-1);
};
/** 平均0・幅 sd の揺らぎ（12個の一様乱数の和。種で決まる） */
const noise = (sd) => {
  let s = 0;
  for (let i = 0; i < 12; i++) s += rand();
  return (s - 6) * sd;
};
const intPersonality = () => clampInt(noise(0.85));

/**
 * 指導者を1人作る。
 *
 * - `position` … 現役時代の守備の括り（pitcher / catcher / infield / outfield）。省けば乱数
 * - `specialty` … 得意分野（manager / pitching / batting）。省けば現役時代から決める
 * - `lean` … 現役時代の姿から寄せる考え方（引退選手のコーチ化で使う）
 * - `usedNames` … 既に使っている名前（同じ名前の指導者を作らない）
 *
 * ⚠ 考え方は得意分野のものがはっきりし、それ以外は弱まる（半分に丸める）。
 */
export function generateCoach({
  id,
  age,
  position,
  specialty,
  lean: pushes = {},
  personality: fixed,
  usedNames,
  origin = {},
}) {
  const pos =
    position ||
    pickWeighted({ pitcher: 40, catcher: 12, infield: 26, outfield: 22 });
  const spec =
    specialty ||
    pickWeighted(
      pos === 'pitcher'
        ? { pitching: 65, manager: 30, batting: 5 }
        : pos === 'catcher'
          ? { manager: 50, pitching: 30, batting: 20 }
          : { batting: 60, manager: 37, pitching: 3 },
    );
  const personality = {
    temper: fixed?.temper ?? intPersonality(),
    youth: fixed?.youth ?? intPersonality(),
    trust: fixed?.trust ?? intPersonality(),
    boldness: fixed?.boldness ?? intPersonality(),
  };
  const b = personality.boldness;
  const t = personality.temper;
  const y = personality.youth;
  // 性格から寄せる向き（攻め＝強攻・積極、守り＝小技・打たせて取る、短気＝継投早め…）
  const base = {
    smallBall: -0.45 * b,
    bench: 0.25 * t,
    build: -0.45 * y,
    pitching: 0.3 * b,
    bullpen: 0.45 * t,
    hitting: 0.4 * b,
    running: 0.25 * b,
  };
  const views = {};
  for (const key of VIEW_KEYS) {
    const raw = clampInt(base[key] + (pushes[key] || 0) + noise(0.9));
    const v = VIEWS[key].domain === spec ? raw : Math.trunc(raw / 2);
    views[key] = (VIEWS[key].oneSided ? Math.min(0, v) : v) || 0;
  }
  const campStyle = pickWeighted({ fit: 30, balanced: 35, sharpen: 20, patch: 15 });
  const prefs = {
    pitcher: pickWeighted({ velocity: 35 + 8 * b, control: 35 - 8 * b, none: 30 }),
    hitter: pickWeighted({
      power: 30 + 8 * b,
      contact: 25 - 4 * b,
      speed: 20 - 4 * b + (pushes.running || 0) * 6,
      none: 25,
    }),
    camp: campStyle,
    campPhase: rand() < 0.25 + 0.08 * y ? 'physique' : 'skill',
  };
  if (prefs.pitcher === 'none') prefs.pitcher = null;
  if (prefs.hitter === 'none') prefs.hitter = null;
  let name;
  for (let guard = 0; guard < 50; guard++) {
    name = `${getRandomSurname()} ${getRandomGivenName()}`;
    if (!usedNames?.has(name)) break;
  }
  usedNames?.add(name);
  return {
    id,
    name,
    age: age ?? 40 + Math.floor(rand() * 18),
    origin: { kind: 'new', ...origin, position: pos },
    specialty: spec,
    views,
    prefs,
    personality,
    status: 'free',
    job: null,
    career: [],
  };
}

/**
 * 引退した選手の現役時代の姿から、考え方の寄せ方を作る。
 * 俊足の野手は機動力、長打の野手は強攻・積極、制球の良い投手は打たせて取る、
 * 球の速い投手は三振狙い。
 */
export function leanFromPlayer(player) {
  if (!player) return {};
  if (player.position === 'pitcher') {
    const velocity = player.pitching?.velocity || 140;
    const control = player.pitching?.control || 50;
    return {
      pitching: velocity >= 148 ? 1 : control >= 65 ? -1 : 0,
      bullpen: (player.pitching?.stamina || 100) >= 130 ? -1 : 0,
    };
  }
  const speed = player.physical?.speed || 50;
  const power = player.batting?.power || 50;
  const meet = player.batting?.meet || 50;
  return {
    running: speed >= 70 ? 1.2 : speed <= 40 ? -0.6 : 0,
    smallBall: power >= 70 ? -1 : (player.batting?.bunt || 30) >= 60 ? 1 : 0,
    hitting: power >= 70 ? 1 : meet >= 70 && (player.batting?.eye || 50) >= 60 ? -1 : 0,
  };
}

// ------------------------------------------------------------
// 保存（`league.coaches`）の作り方
// ⚠ 保存の移行（`leagueMigration.js`）からも呼ぶので、サーバーの外（ここ）に置く
// ------------------------------------------------------------

/** 市場（どこにも属していない指導者）の人数の目安 */
export const MARKET_MIN = 8;

const usedNamesOf = (c) => new Set(Object.values(c.people).map((p) => p.name));

/** 指導者を1人作って名簿に入れる（市場に居る状態）。⚠ 種を決めた中で呼ぶ */
export function newCoach(c, options) {
  const id = `c${(c.seq = (c.seq || 0) + 1)}`;
  const coach = generateCoach({ ...options, id, usedNames: usedNamesOf(c) });
  c.people[id] = coach;
  return coach;
}

/** 球団の席に就ける（前の職は呼ぶ側で外しておく） */
export function assignCoach(c, teamName, role, coach, year) {
  c.teams[teamName] ||= { manager: null, pitching: null, batting: null };
  c.teams[teamName][role] = coach.id;
  coach.status = 'active';
  coach.job = { team: teamName, role, since: year, misses: 0 };
  coach.freeSince = null;
}

/**
 * リーグの指導者を最初から作る（新しいリーグ・版10へ上げたリーグ）。
 * 全球団に3人、市場に8人。球団の期待（ambition）と我慢強さ（patience）もここで決める。
 *
 * ⚠ **種はリーグの種から**。同じリーグなら何度作っても同じ顔ぶれになる
 *    （移行をやり直しても結果が変わらない）。
 */
export function createCoaches(league) {
  const year = league.season?.year || 1;
  const names =
    league.season?.settings?.teamNames || (league.teams || []).map((t) => t.name);
  const c = { seq: 0, people: {}, teams: {}, fronts: {}, events: [] };
  withSeededRandom(hashSeed(`${league.seed}:coaches:init`), () => {
    for (const name of names) {
      const r = Math.random();
      const p = Math.random();
      c.fronts[name] = {
        ambition: r < 0.3 ? 'high' : r < 0.8 ? 'mid' : 'low',
        patience: p < 0.15 ? 1 : p < 0.65 ? 2 : 3,
      };
      c.teams[name] = { manager: null, pitching: null, batting: null };
      const manager = newCoach(c, {
        specialty: 'manager',
        age: 45 + Math.floor(Math.random() * 18),
      });
      assignCoach(c, name, 'manager', manager, year);
      const pitching = newCoach(c, {
        position: Math.random() < 0.85 ? 'pitcher' : 'catcher',
        specialty: 'pitching',
        age: 36 + Math.floor(Math.random() * 20),
      });
      assignCoach(c, name, 'pitching', pitching, year);
      const batting = newCoach(c, {
        position: Math.random() < 0.5 ? 'infield' : 'outfield',
        specialty: 'batting',
        age: 36 + Math.floor(Math.random() * 20),
      });
      assignCoach(c, name, 'batting', batting, year);
    }
    for (let i = 0; i < MARKET_MIN; i++) {
      const coach = newCoach(c, {});
      coach.freeSince = year;
    }
  });
  return c;
}
