// ============================================================
// 成長システム共通ユーティリティ
// ============================================================

export const PHYSICAL_STATS = ['speed', 'arm', 'stamina', 'velocity', 'bodyStamina', 'recovery'];
export const TECHNICAL_STATS = ['meet', 'power', 'eye', 'control', 'defense', 'steal', 'bunt'];


// 体幹(muscle)・器用さ(dexterity)がどの能力の成長に効くか。
// ⚠ **3箇所に同じ配列が別々に書かれていた**（`applyAgeCurveChanges` /
//    `campTraining` / 年次成長）。物差しを二重に作らないこと。
export const MUSCLE_STATS = ['power', 'arm', 'speed', 'velocity', 'bodyStamina'];
export const DEXTERITY_STATS = ['meet', 'eye', 'defense', 'control', 'steal', 'bunt'];

/**
 * 成長方向にのみ掛ける体格補正（既定 0.5〜1.5倍）。衰退には効かない。
 *
 * ⚠ **`w` で効きの幅を変えられる**。同じ倍率でも「掛かる回数」が違うため。
 *    キャンプは1クールで1能力にしか掛からないが、年次成長は**毎年・全能力**に
 *    掛かるので、同じ 0.5〜1.5 を使うと累積が桁違いになる
 *    （実測: 7年で 体幹20と100の差が +14.6。キャンプ経由は +6）。
 */
export function physiqueMultFor(player, stat, w = 1.0) {
  let raw = 1.0;
  if (MUSCLE_STATS.includes(stat)) raw = 0.5 + ((player?.physical?.muscle ?? 50) / 100);
  else if (DEXTERITY_STATS.includes(stat)) raw = 0.5 + ((player?.physical?.dexterity ?? 50) / 100);
  return 1.0 + (raw - 1.0) * w;
}

export function getAgeGrowthBase(age, isPhysical) {
  if (isPhysical) {
    if (age <= 20) return 0.8;
    if (age <= 22) return 0.6;
    if (age <= 24) return 0.3;
    if (age <= 25) return 0.0;
    if (age <= 28) return -0.5;
    if (age <= 31) return -1.2;
    if (age <= 34) return -2.5;
    return -4.0;
  } else {
    if (age <= 21) return 0.3;
    if (age <= 24) return 0.9;
    if (age <= 25) return 0.0;
    if (age <= 28) return -0.4;
    if (age <= 31) return -0.8;
    if (age <= 34) return -1.8;
    return -3.0;
  }
}

// 回復力(recovery)専用の年齢カーブ。若い頃がピークで、年々ゆるやかに低下する
// （成長方向なし）。加齢で回復が鈍る → 疲労が抜けにくい → 摩耗しやすい、という
// 疲労・摩耗システムと噛み合うフィードバックを生む。戻り値は常に ≤ 0。
export function getRecoveryAgeBase(age) {
  if (age <= 22) return 0;      // 22歳までは若さのピークを維持
  if (age <= 26) return -0.5;
  if (age <= 29) return -0.9;
  if (age <= 32) return -1.4;
  if (age <= 35) return -2.0;
  return -2.6;
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
