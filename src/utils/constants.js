// ============================================================
// 定数データ - constants.js
// 変化球の効果や物理計算の定数を定義
// ============================================================

/**
 * 変化球の効果設定
 * whiffBonus: 空振り率への影響
 * groundballBonus: ゴロ率への影響
 * weakBonus: 弱い打球への影響
 * velocityMinus: ストレートからの球速減少
 */
export const BALL_EFFECTS = {
  straight: {
    name: 'ストレート',
    whiffBonus: 0,
    groundballBonus: 0,
    weakBonus: -0.04,
    velocityMinus: 0
  },
  twoSeam: {
    name: 'ツーシーム',
    whiffBonus: -0.05,
    groundballBonus: 0.12,
    weakBonus: 0.12,
    velocityMinus: 5
  },
  slider: {
    name: 'スライダー',
    whiffBonus: 0.09,
    groundballBonus: 0.05,
    weakBonus: -0.02,
    velocityMinus: 12
  },
  curve: {
    name: 'カーブ',
    whiffBonus: 0.04,
    groundballBonus: 0.06,
    weakBonus: 0,
    velocityMinus: 23
  },
  fork: {
    name: 'フォーク',
    whiffBonus: 0.09,
    groundballBonus: 0.06,
    weakBonus: 0.13,
    velocityMinus: 17
  },
  changeup: {
    name: 'チェンジアップ',
    whiffBonus: 0.03,
    groundballBonus: 0.14,
    weakBonus: 0.02,
    velocityMinus: 21
  },
  sinker: {
    name: 'シンカー',
    whiffBonus: 0,
    groundballBonus: 0.15,
    weakBonus: 0.23,
    velocityMinus: 8
  },
  shoot: {
    name: 'シュート',
    whiffBonus: 0,
    groundballBonus: 0.12,
    weakBonus: 0.23,
    velocityMinus: 5
  },
  cutter: {
    name: 'カッター',
    whiffBonus: 0,
    groundballBonus: 0.09,
    weakBonus: 0.2,
    velocityMinus: 5
  },
  splitter: {
    name: 'スプリッター',
    whiffBonus: 0.09,
    groundballBonus: 0.05,
    weakBonus: 0.05,
    velocityMinus: 7
  },
  palm: {
    name: 'パーム',
    whiffBonus: 0.05,
    groundballBonus: 0.07,
    weakBonus: 0.11,
    velocityMinus: 22
  },
  knuckle: {
    name: 'ナックル',
    whiffBonus: 0.1,
    groundballBonus: 0.02,
    weakBonus: 0.15,
    velocityMinus: 30
  }
};

/**
 * 投球フォームの効果設定
 * velocityBonus: 球速への影響（km/h）
 * verticalBreakBonus: 縦変化への影響（カーブ、フォーク等の効果補正）
 * horizontalBreakBonus: 横変化への影響（スライダー、シュート等の効果補正）
 * whiffBonus: 空振り率への影響（サイドスロー・アンダースローは同じ利き腕の打者に対してのみ適用）
 *            例: 左サイドスローは左打者に強い、右アンダースローは右打者に強い
 */
export const PITCHING_FORM_EFFECTS = {
  overhand: {
    name: 'オーバースロー',
    velocityBonus: 3,
    verticalBreakBonus: 0.15,      // 縦の変化球が15%効果的
    horizontalBreakBonus: 0,
    whiffBonus: 0
  },
  threeQuarter: {
    name: 'スリークォーター',
    velocityBonus: 0,
    verticalBreakBonus: 0.05,
    horizontalBreakBonus: 0.05,
    whiffBonus: 0
  },
  sidearm: {
    name: 'サイドスロー',
    velocityBonus: -2,
    verticalBreakBonus: -0.05,
    horizontalBreakBonus: 0.15,    // 横の変化球が15%効果的
    whiffBonus: 0.03               // 同じ利き腕の打者に対して+3%（例: 左サイドは左打者に強い）
  },
  submarine: {
    name: 'アンダースロー',
    velocityBonus: -5,
    verticalBreakBonus: 0.1,       // 浮き上がる軌道でカーブが効く
    horizontalBreakBonus: 0.05,
    whiffBonus: 0.05               // 同じ利き腕の打者に対して+5%（例: 右アンダーは右打者に強い）
  }
};

/**
 * 投球フォームと相性の良い変化球（ボーナス適用）
 */
export const FORM_PITCH_SYNERGY = {
  overhand: ['curve', 'fork', 'splitter', 'knuckle'],      // 縦変化
  threeQuarter: [],                                         // すべて平均的
  sidearm: ['slider', 'shoot', 'cutter', 'twoSeam'],       // 横変化
  submarine: ['sinker', 'curve', 'palm']                    // 浮き上がり系
};

/**
 * 物理計算の定数
 */
// BABIP校正係数（参考値：現在は直接アウト率を指定）
export const BABIP_CALIBRATION = 0.32;

// 反発係数（バットとボールの衝突）
export const COR = 0.45;

/**
 * ポジション名（日本語表記）
 */
export const POSITION_NAMES = {
  pitcher: '投',
  catcher: '捕',
  first: '一',
  second: '二',
  third: '三',
  short: '遊',
  left: '左',
  center: '中',
  right: '右'
};

/**
 * ポジション別の色設定（背景色）
 */
export const POSITION_COLORS = {
  pitcher: 'bg-red-600 text-white',
  catcher: 'bg-blue-600 text-white',
  first: 'bg-yellow-600 text-white',
  second: 'bg-yellow-600 text-white',
  third: 'bg-yellow-600 text-white',
  short: 'bg-yellow-600 text-white',
  left: 'bg-green-600 text-white',
  center: 'bg-green-600 text-white',
  right: 'bg-green-600 text-white'
};

/**
 * 利き手ラベル（日本語表記）
 */
export const HAND_LABELS = {
  right: '右',
  left: '左',
  switch: '両'
};

// Already exported as individual named exports above
