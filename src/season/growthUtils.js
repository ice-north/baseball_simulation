// ============================================================
// 成長システム共通ユーティリティ
// ============================================================

export const PHYSICAL_STATS = ['speed', 'arm', 'stamina', 'velocity', 'bodyStamina', 'recovery'];
export const TECHNICAL_STATS = ['meet', 'power', 'eye', 'control', 'defense', 'steal', 'bunt'];

// ============================================================
// 成長の弧（年齢曲線）— 「使い方の結果」として創発する設計
//
// 早熟/晩成は生まれつきの宿命ではなく、キャリアの使われ方から結果的にそうなる。
//   ・酷使（頑丈さを超える出場）  → 摩耗(careerWear)が溜まり、体感年齢が上がって
//                                  早くピークアウトする（＝結果的に早熟）
//   ・温存＋プロ意識で大事に育成  → 摩耗が溜まらず体感年齢が若く保たれ、晩年まで
//                                  伸び続ける（＝結果的に大器晩成・長持ち）
// player.growthType は「わずかな生まれつきの傾き」(±1歳)だけを与える隠しシード
// （＝"結果そうなった"程度の誤差）。UIには出さない。ageShift の主役は careerWear。
// ============================================================
export const GROWTH_TYPES = {
  early:    { label: '早熟寄り', lean: +1 },
  standard: { label: '標準',     lean:  0 },
  late:     { label: '晩成寄り', lean: -1 },
  sustain:  { label: '息長寄り', lean: -1 },
};

// 生成時の隠しシード比率（合計100）。ほぼ標準、両翼はわずかな誤差。
const GROWTH_TYPE_WEIGHTS = { early: 22, standard: 50, late: 22, sustain: 6 };

// 重み付きランダムで隠しシードを1つ選ぶ。
export function pickGrowthType() {
  const total = Object.values(GROWTH_TYPE_WEIGHTS).reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of Object.entries(GROWTH_TYPE_WEIGHTS)) {
    r -= w;
    if (r < 0) return key;
  }
  return 'standard';
}

// 生まれつきのわずかな傾き（±1歳）。表示しない隠し値。
export function getInnateArcLean(player) {
  return GROWTH_TYPES[player?.growthType]?.lean ?? 0;
}

// キャリアの摩耗(careerWear)＋隠しシードから、年齢カーブの体感年齢シフトを求める。
// 正 = 早くピークアウト（酷使の結果）、負 = 若さを保ち伸び続ける（温存の結果）。
export function computeCareerAgeShift(player) {
  const shift = getInnateArcLean(player) + (player?.careerWear || 0);
  return Math.max(-4, Math.min(5, shift));
}

// その年の使用負荷(usageRatio: チーム最多出場を1とした相対値)から摩耗の増減を求める。
// 頑丈さ(bodyStamina/recovery)の許容を超えて使うほど摩耗が増え、
// プロ意識(discipline)が高いと自己管理で摩耗を抑える。軽負荷なら微回復。
export function careerWearDelta(player, usageRatio) {
  const bodyStamina = player.physical?.bodyStamina ?? 50;
  const recovery = player.physical?.recovery ?? 50;
  const durability = (bodyStamina + recovery) / 2;            // 0-100
  const discipline = player.personality?.discipline ?? 50;
  // 許容使用率: 頑丈なほど酷使に耐える（0.55〜0.85）
  const tolerance = 0.55 + (durability / 100) * 0.30;
  let delta = (usageRatio - tolerance) * 1.1;
  if (delta > 0) {
    // 酷使: プロ意識で摩耗を軽減（discipline100で-45%）
    delta *= 1 - (discipline / 100) * 0.45;
  } else {
    // 軽負荷: 温存による若さ維持は控えめ
    delta *= 0.5;
  }
  return Math.max(-0.35, Math.min(0.6, delta));
}

// 年齢カーブの基礎成長量。ageShift（体感年齢のずれ）でキャリアの弧を変える。
export function getAgeGrowthBase(age, isPhysical, ageShift = 0) {
  const a = age + ageShift;
  if (isPhysical) {
    if (a <= 20) return 0.8;
    if (a <= 22) return 0.6;
    if (a <= 24) return 0.3;
    if (a <= 25) return 0.0;
    if (a <= 28) return -0.5;
    if (a <= 31) return -1.2;
    if (a <= 34) return -2.5;
    return -4.0;
  } else {
    if (a <= 21) return 0.3;
    if (a <= 24) return 0.9;
    if (a <= 25) return 0.0;
    if (a <= 28) return -0.4;
    if (a <= 31) return -0.8;
    if (a <= 34) return -1.8;
    return -3.0;
  }
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
