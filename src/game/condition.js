// ============================================================
// コンディションシステム - condition.js
// パワプロ準拠の5段階コンディション
// ============================================================

import { TEAMS_DATA } from '../teams-data.js';

// コンディション定数
export const CONDITION_LEVELS = {
  BEST: 4,       // 絶好調
  GOOD: 3,       // 好調
  NORMAL: 2,     // 普通
  BAD: 1,        // 不調
  WORST: 0       // 絶不調
};

export const CONDITION_LABELS = {
  [CONDITION_LEVELS.BEST]: '絶好調',
  [CONDITION_LEVELS.GOOD]: '好調',
  [CONDITION_LEVELS.NORMAL]: '普通',
  [CONDITION_LEVELS.BAD]: '不調',
  [CONDITION_LEVELS.WORST]: '絶不調'
};

export const CONDITION_COLORS = {
  [CONDITION_LEVELS.BEST]: 'text-red-500',
  [CONDITION_LEVELS.GOOD]: 'text-orange-400',
  [CONDITION_LEVELS.NORMAL]: 'text-yellow-300',
  [CONDITION_LEVELS.BAD]: 'text-blue-400',
  [CONDITION_LEVELS.WORST]: 'text-blue-700'
};

export const CONDITION_BG_COLORS = {
  [CONDITION_LEVELS.BEST]: 'bg-red-500',
  [CONDITION_LEVELS.GOOD]: 'bg-orange-400',
  [CONDITION_LEVELS.NORMAL]: 'bg-yellow-300',
  [CONDITION_LEVELS.BAD]: 'bg-blue-400',
  [CONDITION_LEVELS.WORST]: 'bg-blue-700'
};

export const CONDITION_ICONS = {
  [CONDITION_LEVELS.BEST]: '🔥',
  [CONDITION_LEVELS.GOOD]: '😊',
  [CONDITION_LEVELS.NORMAL]: '😐',
  [CONDITION_LEVELS.BAD]: '😞',
  [CONDITION_LEVELS.WORST]: '😰'
};

// 打撃への影響（ミート・パワー）
export const CONDITION_BATTING_MODIFIER = {
  [CONDITION_LEVELS.BEST]: 5,
  [CONDITION_LEVELS.GOOD]: 2,
  [CONDITION_LEVELS.NORMAL]: 0,
  [CONDITION_LEVELS.BAD]: -2,
  [CONDITION_LEVELS.WORST]: -5
};

// 投手への影響（制球）
export const CONDITION_PITCHING_MODIFIER = {
  [CONDITION_LEVELS.BEST]: 10,
  [CONDITION_LEVELS.GOOD]: 5,
  [CONDITION_LEVELS.NORMAL]: 0,
  [CONDITION_LEVELS.BAD]: -5,
  [CONDITION_LEVELS.WORST]: -10
};

/**
 * コンディションの基本確率分布
 * 絶好調10% 好調15% 普通50% 不調15% 絶不調10%
 */
const BASE_WEIGHTS = {
  [CONDITION_LEVELS.BEST]: 10,
  [CONDITION_LEVELS.GOOD]: 15,
  [CONDITION_LEVELS.NORMAL]: 50,
  [CONDITION_LEVELS.BAD]: 15,
  [CONDITION_LEVELS.WORST]: 10
};

/**
 * 年齢によるコンディション変動幅の調整
 * 若いほど好不調の波が大きい、年齢が高いほど安定（普通寄り）
 * @param {number} age - 選手の年齢
 * @returns {Object} 調整された重み
 */
const getAgeAdjustedWeights = (age) => {
  // 安定度: 若い(18歳)=0.0, ベテラン(38歳)=1.0
  const stability = Math.min(1.0, Math.max(0.0, (age - 18) / 20));

  // 安定度が高いほど普通の確率が上がり、極端な状態が減る
  const extremeReduction = stability * 0.6; // 最大60%の極端状態削減

  const bestWeight = BASE_WEIGHTS[CONDITION_LEVELS.BEST] * (1 - extremeReduction);
  const worstWeight = BASE_WEIGHTS[CONDITION_LEVELS.WORST] * (1 - extremeReduction);
  const goodWeight = BASE_WEIGHTS[CONDITION_LEVELS.GOOD] * (1 - extremeReduction * 0.3);
  const badWeight = BASE_WEIGHTS[CONDITION_LEVELS.BAD] * (1 - extremeReduction * 0.3);
  const normalWeight = 100 - bestWeight - worstWeight - goodWeight - badWeight;

  return {
    [CONDITION_LEVELS.BEST]: bestWeight,
    [CONDITION_LEVELS.GOOD]: goodWeight,
    [CONDITION_LEVELS.NORMAL]: normalWeight,
    [CONDITION_LEVELS.BAD]: badWeight,
    [CONDITION_LEVELS.WORST]: worstWeight
  };
};

/**
 * コンディションの推移（1日ごと）
 * 現在の状態から急激に変わりにくいようにする
 * @param {number} currentCondition - 現在のコンディション
 * @param {number} age - 選手の年齢
 * @returns {number} 新しいコンディション
 */
export const updateCondition = (currentCondition, age) => {
  const weights = getAgeAdjustedWeights(age);

  // 現在のコンディションからの変動: 1段階以上は変わりにくい
  // 隣接する状態へは変動しやすい、2段階以上は大きく確率が下がる
  const transitionWeights = {};
  for (let level = 0; level <= 4; level++) {
    const distance = Math.abs(level - currentCondition);
    let multiplier;
    if (distance === 0) multiplier = 3.0;    // 現状維持が最も多い
    else if (distance === 1) multiplier = 1.0; // 隣接は自然な変動
    else if (distance === 2) multiplier = 0.15; // 2段階は稀
    else multiplier = 0.02;                     // 3段階以上は極稀

    transitionWeights[level] = weights[level] * multiplier;
  }

  // 重み付きランダム選択
  const totalWeight = Object.values(transitionWeights).reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  for (let level = 0; level <= 4; level++) {
    random -= transitionWeights[level];
    if (random <= 0) return level;
  }

  return CONDITION_LEVELS.NORMAL; // フォールバック
};

/**
 * 選手のコンディションを初期化
 * @param {Object} player - 選手オブジェクト
 */
export const initializeCondition = (player) => {
  if (player.condition === undefined || player.condition === null) {
    player.condition = CONDITION_LEVELS.NORMAL;
  }
};

/**
 * 全チームの全選手のコンディションを更新（日次）
 */
export const updateAllPlayersCondition = () => {
  if (!TEAMS_DATA) return;

  Object.keys(TEAMS_DATA).forEach(teamName => {
    const team = TEAMS_DATA[teamName];
    if (!team || !team.players) return;

    team.players.forEach(player => {
      initializeCondition(player);
      const age = player.age || 25;
      player.condition = updateCondition(player.condition, age);
    });
  });
};

/**
 * 全チームの全選手のコンディションを初期化（ゲーム開始時やロード時）
 */
export const initializeAllPlayersCondition = () => {
  if (!TEAMS_DATA) return;

  Object.keys(TEAMS_DATA).forEach(teamName => {
    const team = TEAMS_DATA[teamName];
    if (!team || !team.players) return;

    team.players.forEach(player => {
      initializeCondition(player);
    });
  });
};

/**
 * コンディションを考慮した打撃能力値を取得
 * @param {Object} player - 選手オブジェクト
 * @returns {Object} { meet, power } コンディション補正済み
 */
export const getConditionAdjustedBatting = (player) => {
  const condition = player.condition ?? CONDITION_LEVELS.NORMAL;
  const mod = CONDITION_BATTING_MODIFIER[condition] || 0;
  return {
    meet: (player.batting?.meet || 50) + mod,
    power: (player.batting?.power || 50) + mod
  };
};

/**
 * コンディションを考慮した制球能力値を取得
 * @param {Object} player - 選手オブジェクト
 * @returns {number} コンディション補正済み制球値
 */
export const getConditionAdjustedControl = (player) => {
  const condition = player.condition ?? CONDITION_LEVELS.NORMAL;
  const mod = CONDITION_PITCHING_MODIFIER[condition] || 0;
  return (player.pitching?.control || 50) + mod;
};
