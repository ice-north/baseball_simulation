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
 * 物理計算の定数
 */
// BABIP校正係数（参考値：現在は直接アウト率を指定）
const BABIP_CALIBRATION = 0.32;

// 反発係数（バットとボールの衝突）
const COR = 0.45;
