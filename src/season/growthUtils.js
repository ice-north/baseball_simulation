// ============================================================
// 成長システム共通ユーティリティ
// ============================================================

export const PHYSICAL_STATS = ['speed', 'arm', 'stamina', 'velocity', 'bodyStamina', 'recovery'];
export const TECHNICAL_STATS = ['meet', 'power', 'eye', 'control', 'defense', 'steal', 'bunt'];

// ============================================================
// 成長アーキタイプ（年齢曲線のタイプ）
//
// 各選手に固有のキャリアの弧を持たせる。ageShift は年齢曲線上の「体感年齢」を
// ずらす: 早熟は曲線を先取り（早くピークに達し早く衰える）、大器晩成は遅らせる
// （晩年まで伸び、衰えも遅い）。declineMult は衰退方向の傾きを微調整する。
//   early   早熟型   : 若くしてピーク、衰えも早い
//   standard標準型   : 従来カーブ
//   late    大器晩成 : 20代後半まで伸び、ピークが遅い
//   sustain 長持ち型 : ピークは標準的だが衰えが非常に緩やか（息の長い選手）
// ============================================================
export const GROWTH_TYPES = {
  early:    { label: '早熟型',   short: '早熟', ageShift: +3, declineMult: 1.35, color: 'text-orange-300' },
  standard: { label: '標準型',   short: '標準', ageShift:  0, declineMult: 1.00, color: 'text-gray-300' },
  late:     { label: '大器晩成', short: '晩成', ageShift: -4, declineMult: 0.95, color: 'text-cyan-300' },
  sustain:  { label: '長持ち型', short: '長持', ageShift: -1, declineMult: 0.55, color: 'text-green-300' },
};

// 生成時の出現比率（合計100）。標準が過半、早熟と大器晩成が両翼、長持ちは希少。
const GROWTH_TYPE_WEIGHTS = { early: 22, standard: 50, late: 22, sustain: 6 };

// 重み付きランダムで成長タイプを1つ選ぶ。
export function pickGrowthType() {
  const total = Object.values(GROWTH_TYPE_WEIGHTS).reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of Object.entries(GROWTH_TYPE_WEIGHTS)) {
    r -= w;
    if (r < 0) return key;
  }
  return 'standard';
}

export function getGrowthTypeMeta(growthType) {
  return GROWTH_TYPES[growthType] || GROWTH_TYPES.standard;
}

// 年齢カーブの基礎成長量。growthType により体感年齢をずらし、キャリアの弧を変える。
export function getAgeGrowthBase(age, isPhysical, growthType = 'standard') {
  const meta = GROWTH_TYPES[growthType] || GROWTH_TYPES.standard;
  // 体感年齢: 早熟(+3)は曲線を先取り、大器晩成(-4)は遅らせる
  const a = age + meta.ageShift;
  let base;
  if (isPhysical) {
    if (a <= 20) base = 0.8;
    else if (a <= 22) base = 0.6;
    else if (a <= 24) base = 0.3;
    else if (a <= 25) base = 0.0;
    else if (a <= 28) base = -0.5;
    else if (a <= 31) base = -1.2;
    else if (a <= 34) base = -2.5;
    else base = -4.0;
  } else {
    if (a <= 21) base = 0.3;
    else if (a <= 24) base = 0.9;
    else if (a <= 25) base = 0.0;
    else if (a <= 28) base = -0.4;
    else if (a <= 31) base = -0.8;
    else if (a <= 34) base = -1.8;
    else base = -3.0;
  }
  // 衰退方向のみタイプ別に傾きを調整（長持ちは緩やか、早熟は急）
  if (base < 0) base *= meta.declineMult;
  return base;
}

export function getStatPath(statKey) {
  const pathMap = {
    meet: 'batting.meet',
    power: 'batting.power',
    eye: 'batting.eye',
    steal: 'batting.steal',
    speed: 'physical.speed',
    arm: 'physical.arm',
    bodyStamina: 'physical.bodyStamina',
    recovery: 'physical.recovery',
    defense: 'fielding.defense',
    velocity: 'pitching.velocity',
    control: 'pitching.control',
    stamina: 'pitching.stamina',
    bunt: 'batting.bunt',
  };
  return pathMap[statKey] || null;
}

export function getStatName(statKey) {
  const nameMap = {
    meet: 'ミート',
    power: 'パワー',
    eye: '選球眼',
    steal: '盗塁',
    speed: '走力',
    arm: '肩力',
    defense: '守備',
    velocity: '球速',
    control: '制球',
    stamina: 'スタミナ',
    bodyStamina: '体力',
    recovery: '回復',
    bunt: 'バント'
  };
  return nameMap[statKey] || statKey;
}

export function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => (o || {})[k], obj);
}

export function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const result = JSON.parse(JSON.stringify(obj));
  let current = result;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
  return result;
}

export function setNestedValueMut(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}
