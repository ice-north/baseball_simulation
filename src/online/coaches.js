// ============================================================
// 指導者（監督・投手コーチ・野手コーチ）
//
// いしだ依頼（2026-11-09「CPU球団に個性を持たせる」）。仕様書:
// https://claude.ai/artifact/HN144s1P83tcUtWbSdH7yU
//
// 【何をするものか】全12球団に監督・投手コーチ・野手コーチの3人を置き、
// **その人の考え方と性格で球団ごとの野球の色を出す**。
//
// 【ビジョンが軸】（いしだ依頼 2026-11-10「作りたいチームを軸に」。案:
// https://claude.ai/artifact/8daopGmJUsa6EkP8vz87Yy ）
// 1人ずつ「攻めの型 × 守りの型 × 時間軸」と看板（攻めか守り）を持ち、
// 考え方（采配）・好む選手・キャンプの方針は**そこから決める**（乱数でばらばらに振らない）。
// 性格（気質・こだわり・任せ方）は「どうやるか」を受け持つ。
//
// ⚠ **監督は人の采配の肩代わり。能力を上げる効果は一切持たせない**（いしだ指定
//    2026-11-10「監督バフはナシ」「強さが変わるとこのシステムがブレます」）。
//    型でチームの強さを変えない。一人用の社会人モードのスタッフ
//    （`src/corporate/staffData.js`）は「打撃指導 70」のような数字で練習の伸びを
//    足すが、ここは考え方と性格だけ。
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
import { poleStats, playerWish } from '../season/trainingPolicy.js';
import { overallScore } from './tryoutPlan.js';

/** 役職。⚠ 監督とコーチは同じ「指導者」。役職は配属で決まる（コーチから監督へも上がる） */
export const COACH_ROLES = ['manager', 'pitching', 'batting'];
export const ROLE_LABELS = {
  manager: '監督',
  pitching: '投手コーチ',
  batting: '野手コーチ',
};

/**
 * 考え方。値は -2〜2 の整数（0 が標準）。
 * `domain` はその考え方を受け持つ役職（監督とコーチの考えの食い違い `conflictOf` に使う）。
 * ⚠ 値はビジョンから決める（`viewsFromVision`）。乱数は小さな揺らぎだけ。
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

/**
 * 性格。値は -2〜2 の整数。「どうやるか」を受け持つ（何を目指すかはビジョン）。
 * ⚠ 前の「起用（若手好き）」は時間軸（育成⇔勝負）に、「戦い方（攻め/守り）」と
 *    「選手との接し方」は「こだわり」にまとめた（二重に持つと筋の通らない人が出る）。
 */
export const PERSONALITY = {
  temper: { label: '気質', low: '我慢強い', high: '短気' },
  stubborn: { label: 'こだわり', low: '柔軟', high: '頑固' },
  trust: { label: '任せ方', low: 'ワンマン', high: '任せる' },
};
export const PERSONALITY_KEYS = Object.keys(PERSONALITY);
/**
 * 語り口（見た目だけの性格。売り込みや手記の文体が変わる。采配には効かない）。
 * レビューの「あとで足せる案」（いしだ「重くなければ入れて」2026-11-10）
 */
export const VOICES = { talkative: '多弁', quiet: '寡黙', logical: '理論派', spirit: '熱血' };

// ------------------------------------------------------------
// ビジョン（攻めの型 × 守りの型 × 時間軸 と、看板）
//
// ⚠ 攻めと守りの両方を持つ（前の案の「戦い方5つから1つ」では、長打の監督は投手が、
//    投手王国の監督は打線が「おまかせ」になり、試合の半分に色が出なかった）。
//    看板の側を強く、もう一方を控えめに出す。
// ⚠ コーチも同じ形で持つ。コーチの間は受け持ちの側だけが効き（投手コーチは守り、
//    野手コーチは攻め）、監督に上がると両方が効く。
// 型ごとに1か所にまとめる:
//   - `noun` は紙面の「〇〇と〇〇の野球」、`phrase` / `joint` は「足でかき回し、継投で逃げ切る」
//   - `pref` は好む選手（トライアウトの加点・トレードの見る目・軸の選手。`prefBonus` のキー）
//   - `views` は考え方の向き（`viewsFromVision`。看板の側は1倍、もう一方は `SUB_SIDE` 倍）。
//     機動力は小技と走塁、長打は強攻と積極打撃、つなぐは慎重な打撃と小技。先発で押すは先発に
//     長く任せて三振を狙い、継投でつなぐは早めの継投、打たせて守るは打たせて取る
//   - `pitch` / `quiet` / `reason` は売り込みの文（ふつう / 寡黙な人 / 理論派が看板の型に添える理屈）
// ------------------------------------------------------------
export const ATTACK_TYPES = {
  speed: {
    label: '機動力', noun: '機動力', phrase: '足でかき回す', joint: '足でかき回し',
    pref: 'speed',
    views: { smallBall: 1.6, running: 1.8 },
    pitch: 'うちは足で勝つ。塁に出たら何かが起きる野球をやる。',
    quiet: '足で勝つ。',
    reason: '盗塁と進塁で、1点を取る確率を上げる。',
  },
  power: {
    label: '長打', noun: '長打', phrase: '一発で決める', joint: '一発で決め',
    pref: 'power',
    views: { smallBall: -1.8, hitting: 1.6, running: -0.4 },
    pitch: '一発で試合を決める。打席では思い切り振ってほしい。',
    quiet: '一発で決める。',
    reason: '長打は1本で流れを変える。数字もそう出ている。',
  },
  contact: {
    label: 'つなぐ', noun: 'つなぎ', phrase: '四球とミートでつなぐ', joint: '四球とミートでつなぎ',
    pref: 'contact',
    views: { smallBall: 0.6, hitting: -1.6 },
    pitch: '四球でもいい。つないでつないで点を取る。',
    quiet: 'つないで点を取る。',
    reason: '出塁率が上がれば、得点は必ず増える。',
  },
};
export const DEFENSE_TYPES = {
  rotation: {
    label: '先発で押す', noun: '先発', phrase: '先発で押し切る', joint: '先発で押し切り',
    pref: 'stamina',
    views: { pitching: 1.0, bullpen: -1.6 },
    pitch: '先発には長いイニングを任せる。',
    quiet: '先発に任せる。',
    reason: '先発が長く投げれば、ブルペンの疲れも減る。',
  },
  bullpen: {
    label: '継投でつなぐ', noun: '継投', phrase: '継投で逃げ切る', joint: '継投で逃げ切り',
    pref: 'velocity',
    views: { pitching: 0.6, bullpen: 1.6 },
    pitch: '投手は早めにつないで、継投で逃げ切る。',
    quiet: '継投で逃げ切る。',
    reason: '打順が3巡目に入る前に代えるのが理屈に合う。',
  },
  fielding: {
    label: '打たせて守る', noun: '守り', phrase: '守備で1点を守る', joint: '守備で1点を守り',
    pref: 'control',
    views: { pitching: -1.6, smallBall: 0.4, bench: 0.6 },
    pitch: '打たせて取って、守りで1点を守る。',
    quiet: '守り勝つ。',
    reason: '四球を減らして打たせて取れば、失点は減る。',
  },
};
const SIDE_TYPES = { attack: ATTACK_TYPES, defense: DEFENSE_TYPES };
/** 時間軸。主に「誰を使うか」（若手か実績か）に効く */
export const HORIZONS = {
  develop: { label: '育成', phrase: '若手を使って育てる' },
  middle: { label: '中間', phrase: '成績を見て入れ替える' },
  win: { label: '勝負', phrase: '今年勝ちに行く' },
};
/** コーチの受け持ちの側（投手コーチは守りの型、野手コーチは攻めの型。コーチの間はその側だけが効く） */
export const ROLE_SIDE = { pitching: 'defense', batting: 'attack' };
/** 看板でない側の効き（看板の側は 1） */
const SUB_SIDE = 0.6;
const DEFAULT_VISION = { attack: 'contact', defense: 'rotation', flagship: 'attack', horizon: 'middle' };

/** その人のビジョン（無い・壊れた値は標準で埋める） */
export function visionOf(coach) {
  const v = coach?.vision || {};
  return {
    attack: Object.hasOwn(ATTACK_TYPES, v.attack) ? v.attack : DEFAULT_VISION.attack,
    defense: Object.hasOwn(DEFENSE_TYPES, v.defense) ? v.defense : DEFAULT_VISION.defense,
    flagship: v.flagship === 'defense' || v.flagship === 'attack' ? v.flagship : DEFAULT_VISION.flagship,
    horizon: Object.hasOwn(HORIZONS, v.horizon) ? v.horizon : DEFAULT_VISION.horizon,
  };
}

/** 看板の側なら 1、そうでなければ控えめ（`SUB_SIDE`） */
const sideWeight = (coach, side) => (visionOf(coach).flagship === side ? 1 : SUB_SIDE);

/**
 * その席で効く型の名前（投手コーチは守りの型「継投でつなぐ」、野手コーチは攻めの型「機動力」）。
 * 監督（両方が効く）は null。
 */
export function roleTypeLabel(coach, role) {
  const side = ROLE_SIDE[role];
  return side ? SIDE_TYPES[side][visionOf(coach)[side]].label : null;
}

/** 若手を使うか（育成 1・中間 0・勝負 -1）。トライアウト・退団・トレードの年齢の見方 */
const horizonYouth = (coach) => {
  const h = visionOf(coach).horizon;
  return h === 'develop' ? 1 : h === 'win' ? -1 : 0;
};

/**
 * 育成観（個性をどこまで伸ばすか）。保存は2つの値 `{ who, line }`:
 *   - `who` … 誰を尖らせるか（all 全員 / sharp 尖った選手だけ / none 誰も）
 *   - `line` … どこまで伸ばしたらバランスに戻すか（長所の線 65・70・80。null は線なし）
 * 画面には4つの名前で出す（`growthLabel`）。
 */
export const GROWTH_STYLES = {
  extreme: '徹底して尖らせる',
  staged: '一定まで尖らせて整える',
  shape: '選手の形に合わせる',
  complete: '穴のない選手に',
};
export const GROWTH_LINES = [65, 70, 80];
export function growthOf(coach) {
  const g = coach?.growth || {};
  const who = ['all', 'sharp', 'none'].includes(g.who) ? g.who : 'sharp';
  const line = who !== 'none' && GROWTH_LINES.includes(Number(g.line)) ? Number(g.line) : null;
  return { who, line };
}
export function growthStyleOf(coach) {
  const { who, line } = growthOf(coach);
  return who === 'none' ? 'complete' : who === 'sharp' ? 'shape' : line == null ? 'extreme' : 'staged';
}

/**
 * 好む選手（トライアウトの小さな加点・トレードの見る目）。ビジョンから決まる。
 * 野手は攻めの型、投手は守りの型。「打たせて守る」は守備の良い野手も好む。
 */
export const PITCHER_PREFS = { stamina: 'スタミナのある先発', velocity: '球の速い投手', control: '制球の良い投手' };
export const HITTER_PREFS = { speed: '俊足', power: '長打', contact: '巧打', defense: '守備の良い野手' };
export function prefsOf(coach) {
  const v = visionOf(coach);
  return {
    hitter: ATTACK_TYPES[v.attack].pref,
    pitcher: DEFENSE_TYPES[v.defense].pref,
    fielder: v.defense === 'fielding' ? 'defense' : null,
  };
}

// 得意分野（`specialty`: manager / pitching / batting）は、向いている席（CPUの空席埋めで効く）と、
// 看板の決まりやすさ（投手コーチ向きの人は守りが看板になりやすい）。
// ⚠ 画面には出さない（最初の3人は席と同じものに決め打ちで、出しても意味が無い）

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

/** 好みの加点の上限（1つあたり ±12点。候補の点数の揺らぎ±8と同じくらい） */
const PREF_CAP = 12;
const prefBonus = (pref, p) => {
  const capped = (v) => Math.max(-PREF_CAP, Math.min(PREF_CAP, v));
  switch (pref) {
    case 'velocity':
      return capped(((p.pitching?.velocity || 140) - 140) * 0.8);
    case 'control':
      return capped(((p.pitching?.control || 50) - 50) * 0.4);
    case 'stamina':
      return capped(((p.pitching?.stamina || 100) - 100) * 0.25);
    case 'power':
      return capped(((p.batting?.power || 50) - 50) * 0.4);
    case 'contact':
      return capped(((p.batting?.meet || 50) - 50) * 0.4);
    case 'speed':
      return capped(((p.physical?.speed || 50) - 50) * 0.4);
    case 'defense':
      return capped(((p.fielding?.defense || 50) - 50) * 0.4);
    default:
      return 0;
  }
};

/**
 * トライアウトの選び方に渡す球団の事情（`selectPlayerForAI` の `teamContext`）。
 *
 * - `winRate` … 若手を取るか即戦力を取るか。監督の「編成」（時間軸から決まる）と
 *   前年の勝率で決まる（もとからある「勝率で寄せる」仕組みをそのまま使う）
 * - `bonus` … 型に合う選手への小さな加点（1つ最大±12点。候補の点数の揺らぎ±8と同じくらい）
 *
 * 投手の好みは投手コーチ（守りの型）、野手の好みは野手コーチ（攻めの型）。監督の任せ度で
 * 監督の好みと混ぜる。監督の好みは看板の側が強い。
 * 監督が居なければ null（人の球団で監督が空席＝自分で）。
 */
export function tryoutContext(staff, { lastWinRate = 0.5 } = {}) {
  const manager = staff?.manager;
  if (!manager) return null;
  const w = delegationOf(manager);
  const build = viewOf(manager, 'build');
  const mine = prefsOf(manager);
  const pitchPrefs = [
    [mine.pitcher, (staff.pitching ? 1 - w : 1) * sideWeight(manager, 'defense')],
    [staff.pitching && prefsOf(staff.pitching).pitcher, staff.pitching ? w : 0],
  ];
  const hitPrefs = [
    [mine.hitter, (staff.batting ? 1 - w : 1) * sideWeight(manager, 'attack')],
    [staff.batting && prefsOf(staff.batting).hitter, staff.batting ? w : 0],
    // 「打たせて守る」監督は守備の良い野手も（控えめに）
    [mine.fielder, 0.4 * sideWeight(manager, 'defense')],
  ];
  const youth = horizonYouth(manager);
  return {
    winRate: Math.max(0, Math.min(1, 0.5 + 0.12 * build + 0.5 * ((lastWinRate ?? 0.5) - 0.5))),
    bonus: (p) => {
      const prefs = p.position === 'pitcher' ? pitchPrefs : hitPrefs;
      let score = 0;
      for (const [pref, weight] of prefs) if (pref && weight) score += prefBonus(pref, p) * weight;
      // 育成は若手、勝負はベテラン（20歳以下と27歳以上に±2点ずつ）
      const age = p.age || 22;
      if (age <= 20) score += youth * 2;
      else if (age >= 27) score -= youth * 2;
      return score;
    },
  };
}

/** 退団の選び方の偏り（育成の監督ほどベテランを早めに出す。`getAIReleaseCandidates`） */
export function releaseBias(staff) {
  const manager = staff?.manager;
  return manager ? { youth: horizonYouth(manager) } : null;
}

/** トレードの見る目の幅（±10%）。⚠ 広いと、人がその差で何度も得をする（CPUは1.05倍で受ける） */
export const TRADE_FACTOR_LIMIT = 0.1;

/**
 * CPU球団がトレードで選手を見る目（`tradeValueOf` にかける倍率。0.9〜1.1）。
 * 育成の監督は若手を高く、勝負の監督はいまの主力の年齢（27歳以上）を高く見る（最大±6%）。
 * 型に合う選手も少し高く見る（最大±3%）。
 * ⚠ 上乗せ（`CPU_ACCEPT_MARGIN`）は全球団そのまま。見る目だけを変える。
 */
export function tradeFactor(staff, player) {
  const manager = staff?.manager;
  if (!manager || !player) return 1;
  const build = viewOf(manager, 'build');
  const youth = horizonYouth(manager);
  const age = player.age || 25;
  let f = 1;
  if (age <= 23) f += -0.025 * build + 0.01 * youth;
  else if (age >= 27) f += 0.025 * build - 0.01 * youth;
  const prefs = prefsOf(manager);
  f += (prefBonus(player.position === 'pitcher' ? prefs.pitcher : prefs.hitter, player) / PREF_CAP) * 0.03;
  return Math.max(1 - TRADE_FACTOR_LIMIT, Math.min(1 + TRADE_FACTOR_LIMIT, f));
}

/** 「穴のない選手に」で短所を埋めに行く開き（その段階の長所と短所の差） */
const PATCH_GAP = 15;

/**
 * その指導者が1人の選手に当てるキャンプの方針（`{ direction, phase }`）。
 *
 * - 段階（phase）は時間軸から: 育成は23歳以下に基礎体力、勝負は技術、中間は本人の希望。
 *   ⚠ 柔軟な人（こだわり -1 以下）は、段階を本人の希望に合わせる（やる気を落とさない）
 * - 方向（direction）は育成観から（`growthOf`）:
 *   - 全員を尖らせる … 長所が線に届くまで「長所」、届いたら「短所」（線なしならずっと長所）
 *   - 尖った選手だけ … 尖った選手は線まで「長所」、ほかは「全体」（バランスを個性として伸ばす）。
 *     尖った選手かどうかは選手の希望（`playerWish`）と同じ物差し（技術の長所と短所の開き）
 *   - 誰も尖らせない … 開きが大きければ「短所」、小さければ「全体」
 * ⚠ どれも人がキャンプの画面で選べる方針。伸びを足す効果は無い。
 * ⚠ 「何を伸ばすか」（メインの練習の割り当て）は次の段（いまは方針から練習を決める既定のまま）。
 */
export function growthPolicy(coach, player) {
  const { who, line } = growthOf(coach);
  const horizon = visionOf(coach).horizon;
  const wish = playerWish(player);
  const age = player?.age ?? 25;
  let phase = horizon === 'develop' ? (age <= 23 ? 'physique' : 'skill') : horizon === 'win' ? 'skill' : wish.phase;
  if (clampInt(coach?.personality?.stubborn) <= -1) phase = wish.phase;
  const pole = poleStats(player, phase);
  if (!Number.isFinite(pole.bestValue)) return { direction: 'balanced', phase };
  const belowLine = line == null || pole.bestValue < line;
  const direction =
    who === 'all'
      ? belowLine ? 'sharpen' : 'patch'
      : who === 'sharp'
        ? wish.direction === 'sharpen' && belowLine ? 'sharpen' : 'balanced'
        : pole.bestValue - pole.worstValue >= PATCH_GAP ? 'patch' : 'balanced';
  return { direction, phase };
}

/**
 * キャンプの方針（選手ごとの上書き）。投手は投手コーチ、野手は野手コーチの育成観。
 * コーチが居なければ監督（人の球団は `strictSeats` で「自分で」）。誰も居なければ null（標準のまま）。
 */
export function campPlan(staff, roster, { strictSeats = false } = {}) {
  const pick = (role) =>
    staff?.[role] || (strictSeats ? null : staff?.manager) || null;
  const players = {};
  let any = false;
  for (const player of roster || []) {
    const coach = pick(player.position === 'pitcher' ? 'pitching' : 'batting');
    if (!coach) continue;
    any = true;
    players[player.id] = growthPolicy(coach, player);
  }
  return any ? { policy: { mode: 'team', direction: 'balanced', phase: 'skill' }, players } : null;
}

// ------------------------------------------------------------
// 説明の文（画面・紙面で同じ文を使う。サーバーでだけ作る）
// ------------------------------------------------------------

/** 攻めと守りの型（`ATTACK_TYPES` / `DEFENSE_TYPES` の1つずつ）を看板の側から順に2つ */
const sidesOf = (coach) => {
  const v = visionOf(coach);
  const attack = ATTACK_TYPES[v.attack];
  const defense = DEFENSE_TYPES[v.defense];
  return v.flagship === 'defense' ? [defense, attack] : [attack, defense];
};

/** その人の野球の一言（紙面の言葉。「機動力と継投の野球」。看板が先） */
export function coachColor(coach) {
  if (!coach) return '';
  const [flag, other] = sidesOf(coach);
  return `${flag.noun}と${other.noun}の野球`;
}

/** ビジョンの見出し（「足でかき回し、継投で逃げ切る」。看板が先） */
export function visionHeadline(coach) {
  if (!coach) return '';
  const [flag, other] = sidesOf(coach);
  return `${flag.joint}、${other.phrase}`;
}

/**
 * ビジョンの内訳（「攻め 機動力（看板）・守り 継投でつなぐ・育成」）。
 * `role` がコーチの席なら、受け持ちの側に「（受け持ち）」を付ける（コーチの間はその側だけが効く）。
 */
export function visionText(coach, role = null) {
  if (!coach) return '';
  const v = visionOf(coach);
  const mark = (side) => {
    const words = [
      v.flagship === side ? '看板' : null,
      ROLE_SIDE[role] === side ? '受け持ち' : null,
    ].filter(Boolean);
    return words.length ? `（${words.join('・')}）` : '';
  };
  return `攻め ${ATTACK_TYPES[v.attack].label}${mark('attack')}・守り ${DEFENSE_TYPES[v.defense].label}${mark('defense')}・${HORIZONS[v.horizon].label}`;
}

/** 育成観の一言（「一定まで尖らせて整える（長所70まで）」） */
export function growthLabel(coach) {
  const { line } = growthOf(coach);
  return `${GROWTH_STYLES[growthStyleOf(coach)]}${line != null ? `（長所${line}まで）` : ''}`;
}

/** 好む選手の一言（「野手は俊足、投手は球の速い投手」） */
export function preferenceText(coach) {
  const p = prefsOf(coach);
  return [
    `野手は${HITTER_PREFS[p.hitter]}${p.fielder ? `と${HITTER_PREFS[p.fielder]}` : ''}`,
    `投手は${PITCHER_PREFS[p.pitcher]}`,
  ].join('、');
}

const HORIZON_PITCH = {
  develop: '若い選手は失敗していい。使いながら育てる。',
  middle: '調子と成績を見て、使う選手を決める。',
  win: '今年勝つ。結果を出した選手を使う。',
};
const GROWTH_PITCH = {
  extreme: '長所は伸ばせるだけ伸ばす。',
  staged: 'まず武器を作り、それから穴を埋める。',
  shape: '選手それぞれの形を大事にしたい。',
  complete: '穴のない選手に育てたい。',
};
const REGRET_PITCH = '前はやり方にこだわりすぎた。今度は選手の声も聞く。';

/**
 * 売り込みの文（本人の言葉。市場で選ぶときの判断材料）。看板の側から語る。
 * 語り口（`voice`）で文体が変わる。監督を解任された人は「前回の反省」を添える
 * （市場にいる間と、反省を活かして監督に戻った年。`mellowOnReturn`）。
 * `year` は今の年（戻った年かを見る）。
 * ⚠ 文はサーバーでだけ使う（PC・スマホ・アプリで同じ文を出す）
 */
export function pitchText(coach, { year = null } = {}) {
  if (!coach) return '';
  const [flag, other] = sidesOf(coach);
  const regret = regretPending(coach) || (year != null && coach.mellowedAt === year) ? [REGRET_PITCH] : [];
  if (coach.voice === 'quiet') return [...regret, flag.quiet, other.quiet, 'あとは結果で見せる。'].join('');
  return [
    ...regret,
    flag.pitch,
    other.pitch,
    coach.voice === 'logical' ? flag.reason : null,
    HORIZON_PITCH[visionOf(coach).horizon],
    GROWTH_PITCH[growthStyleOf(coach)],
    coach.voice === 'spirit' ? '気持ちで負けたら終わりだ。最後まで全力でやる。' : null,
    coach.voice === 'talkative' ? 'とにかく見ていてほしい。面白い野球をやりますよ。' : null,
  ]
    .filter(Boolean)
    .join('');
}

/** 軸の選手を選ぶ主力の範囲（力の上位。野手はほぼスタメン、投手は先発と勝ちパターン） */
const KEY_POOL = { hitter: 9, pitcher: 6 };

/**
 * 軸の選手（キーマン。効果は無く説明だけ）。看板が攻めなら野手2人と投手1人、守りなら投手2人と
 * 野手1人。主力（力の上位 `KEY_POOL`）のうち、型に合う順に（同じなら力の順）。
 */
export function keyPlayers(coach, roster = []) {
  const prefs = prefsOf(coach);
  const byId = (a, b) => String(a.id).localeCompare(String(b.id));
  const pick = (group, n) =>
    roster
      .filter((p) => (p.position === 'pitcher') === (group === 'pitcher'))
      .map((p) => ({ p, power: overallScore(p), fit: prefBonus(prefs[group], p) }))
      .sort((a, b) => b.power - a.power || byId(a.p, b.p))
      .slice(0, KEY_POOL[group])
      .sort((a, b) => b.fit - a.fit || b.power - a.power || byId(a.p, b.p))
      .slice(0, n)
      .map((x) => x.p);
  return visionOf(coach).flagship === 'defense'
    ? [...pick('pitcher', 2), ...pick('hitter', 1)]
    : [...pick('hitter', 2), ...pick('pitcher', 1)];
}

/** 監督を解任されて、まだ反省を活かしていない（次に監督になるとき丸くなる） */
const regretPending = (coach) => (coach?.fired || 0) > (coach?.mellowed || 0);

/**
 * 解任された監督が、再び監督になるとき、こだわりが1段やわらぐ（「前回の反省」）。
 * 解任1回につき1度だけ。返り値は丸くなったか。
 * ⚠ 采配の強さは変わらない。こだわりが効くのはキャンプの段階を選手の希望に合わせるかだけ。
 */
export function mellowOnReturn(coach, year) {
  if (!regretPending(coach)) return false;
  coach.mellowed = coach.fired;
  coach.mellowedAt = year;
  const stubborn = clampInt(coach.personality?.stubborn);
  if (stubborn > -2) coach.personality = { ...coach.personality, stubborn: stubborn - 1 };
  return true;
}

/** 性格の一言（「短気・頑固」）。標準の軸は出さない */
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
  if (!words.length) words.push('穏やか');
  if (VOICES[coach?.voice]) words.push(VOICES[coach.voice]);
  return words.join('・');
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

const HORIZON_BUILD = { develop: -1.8, middle: 0, win: 1.8 };

/** ビジョンと性格から7つの考え方の向き（小数）を作る（型の `views`）。揺らぎは生成で足す */
export function viewsFromVision(vision, personality = {}) {
  const v = visionOf({ vision });
  const out = Object.fromEntries(VIEW_KEYS.map((k) => [k, 0]));
  const add = (table, weight) => {
    for (const [k, x] of Object.entries(table || {})) out[k] += x * weight;
  };
  add(ATTACK_TYPES[v.attack].views, sideWeight({ vision: v }, 'attack'));
  add(DEFENSE_TYPES[v.defense].views, sideWeight({ vision: v }, 'defense'));
  out.build += HORIZON_BUILD[v.horizon];
  // 気質: 短気ほど継投が早く、代打・守備固めも早め（我慢強いと遅め）
  const t = clampInt(personality.temper);
  out.bullpen += 0.3 * t;
  out.bench += 0.3 * t - 0.3;
  return out;
}

/**
 * 引退した選手の現役時代の姿から、ビジョンの寄せ方を作る（`generateCoach` の `lean`）。
 * 俊足は機動力、長距離砲は長打、巧打者はつなぐ、守備の名手は打たせて守る。
 * 投手はスタミナがあれば先発で押す、球が速ければ継投でつなぐ、制球が良ければ打たせて守る。
 */
export function leanFromPlayer(player) {
  if (!player) return {};
  if (player.position === 'pitcher') {
    const p = player.pitching || {};
    const defense =
      (p.stamina || 100) >= 130 ? 'rotation' : (p.velocity || 140) >= 148 ? 'bullpen' : (p.control || 50) >= 65 ? 'fielding' : null;
    // ⚠ 目立つ能力が無ければ寄せない（看板は得意分野から決まる）
    return defense ? { defense, flagship: 'defense' } : {};
  }
  const speed = player.physical?.speed || 50;
  const power = player.batting?.power || 50;
  const meet = player.batting?.meet || 50;
  const eye = player.batting?.eye || 50;
  const attack =
    power >= 70 && power >= speed ? 'power' : speed >= 70 ? 'speed' : meet >= 70 && eye >= 60 ? 'contact' : null;
  const defense = (player.fielding?.defense || 50) >= 70 ? 'fielding' : null;
  return {
    ...(attack ? { attack } : {}),
    ...(defense ? { defense } : {}),
    ...(attack ? { flagship: 'attack' } : defense ? { flagship: 'defense' } : {}),
  };
}

/**
 * 指導者を1人作る。
 *
 * - `position` … 現役時代の守備の括り（pitcher / catcher / infield / outfield）。省けば乱数
 * - `specialty` … 得意分野（manager / pitching / batting）。省けば現役時代から決める
 * - `lean` … ビジョンの寄せ方 `{ attack, defense, flagship, horizon }`（引退選手のコーチ化で使う）
 * - `usedNames` … 既に使っている名前（同じ名前の指導者を作らない）
 *
 * ⚠ 乱数を引く順を変えると、同じ種でも顔ぶれが変わる（作り直しの再現は検査で見る）。
 */
export function generateCoach({
  id,
  age,
  position,
  specialty,
  lean = {},
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
    stubborn: fixed?.stubborn ?? intPersonality(),
    trust: fixed?.trust ?? intPersonality(),
  };
  // ビジョン。投手コーチ向きの人は守り、野手コーチ向きの人は攻めが看板になりやすい
  const attack = lean.attack || pickWeighted({ speed: 1, power: 1, contact: 1 });
  const defense = lean.defense || pickWeighted({ rotation: 1, bullpen: 1, fielding: 1 });
  const defenseFirst = spec === 'pitching' ? 0.75 : spec === 'batting' ? 0.25 : 0.5;
  const flagship = lean.flagship || (rand() < defenseFirst ? 'defense' : 'attack');
  const horizon = lean.horizon || pickWeighted({ develop: 30, middle: 40, win: 30 });
  const vision = { attack, defense, flagship, horizon };
  // 育成観（誰を尖らせるか × どこまで）
  const style = pickWeighted({ extreme: 15, staged: 40, shape: 30, complete: 15 });
  const line = style === 'staged' || style === 'shape' ? Number(pickWeighted({ 65: 1, 70: 2, 80: 1 })) : null;
  const growth = { who: style === 'shape' ? 'sharp' : style === 'complete' ? 'none' : 'all', line };
  const voice = pickWeighted({ talkative: 1, quiet: 1, logical: 1, spirit: 1 });
  // 考え方はビジョンから。揺らぎは小さく（筋の通らない人を作らない）
  const base = viewsFromVision(vision, personality);
  const views = {};
  for (const key of VIEW_KEYS) {
    const v = clampInt(base[key] + noise(0.45));
    views[key] = (VIEWS[key].oneSided ? Math.min(0, v) : v) || 0;
  }
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
    vision,
    growth,
    voice,
    views,
    personality,
    status: 'free',
    job: null,
    career: [],
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
  if (role === 'manager') mellowOnReturn(coach, year);
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
