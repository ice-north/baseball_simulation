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
const BALL_EFFECTS = {
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
    whiffBonus: 0.07,
    groundballBonus: 0,
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
    whiffBonus: 0.04,
    groundballBonus: 0.1,
    weakBonus: 0.01,
    velocityMinus: 19
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
    whiffBonus: 0.07,
    groundballBonus: 0.04,
    weakBonus: 0.01,
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
 * whiffBonus: 打者の慣れにくさによる空振り率への影響
 */
const PITCHING_FORM_EFFECTS = {
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
    whiffBonus: 0.03               // 慣れていない打者が多い
  },
  submarine: {
    name: 'アンダースロー',
    velocityBonus: -5,
    verticalBreakBonus: 0.1,       // 浮き上がる軌道でカーブが効く
    horizontalBreakBonus: 0.05,
    whiffBonus: 0.05               // 非常に珍しいフォーム
  }
};

/**
 * 投球フォームと相性の良い変化球（ボーナス適用）
 */
const FORM_PITCH_SYNERGY = {
  overhand: ['curve', 'fork', 'splitter', 'knuckle'],      // 縦変化
  threeQuarter: [],                                         // すべて平均的
  sidearm: ['slider', 'shoot', 'cutter', 'twoSeam'],       // 横変化
  submarine: ['sinker', 'curve', 'palm']                    // 浮き上がり系
};

/**
 * 物理計算の定数
 */
// BABIP校正係数（参考値：現在は直接アウト率を指定）
const BABIP_CALIBRATION = 0.32;

// 反発係数（バットとボールの衝突）
const COR = 0.45;
