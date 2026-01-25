// ============================================================
// レギュレーション設定 - regulationSettings.js
// オフシーズン（12月）に変更可能な設定項目
// ============================================================

import { SEASON_PHASES } from './seasonManager.js';

/**
 * デフォルトレギュレーション設定
 */
export const DEFAULT_REGULATIONS = {
  useDH: false,           // DH制
  gamesPerSeason: 60,     // 年間試合数（チームあたり）
  teamsCount: 4,          // チーム数
  playoffFormat: 'single', // プレーオフ形式
  maxExtraInnings: 12,    // 延長最大回数
  roster: {
    starters: 9,          // スタメン人数
    benchFielders: 8,     // 控え野手数
    benchPitchers: 7      // 控え投手数
  }
};

/**
 * レギュレーション設定の検証
 * @param {Object} regulations - 設定オブジェクト
 * @returns {Object} {valid: boolean, errors: string[]}
 */
export const validateRegulations = (regulations) => {
  const errors = [];

  // チーム数の検証（最低2チーム、最大12チーム）
  if (regulations.teamsCount < 2 || regulations.teamsCount > 12) {
    errors.push('チーム数は2〜12の間で設定してください');
  }

  // 年間試合数の検証（チーム数に応じて調整）
  const minGames = (regulations.teamsCount - 1) * 2; // 最低でも各チームと2試合
  const maxGames = (regulations.teamsCount - 1) * 50; // 最大で各チームと50試合

  if (regulations.gamesPerSeason < minGames || regulations.gamesPerSeason > maxGames) {
    errors.push(`年間試合数は${minGames}〜${maxGames}の間で設定してください`);
  }

  // 延長回数の検証
  if (regulations.maxExtraInnings < 0 || regulations.maxExtraInnings > 30) {
    errors.push('延長最大回数は0〜30の間で設定してください');
  }

  // ロスター検証
  if (regulations.roster.starters < 8 || regulations.roster.starters > 10) {
    errors.push('スタメン人数は8〜10の間で設定してください');
  }

  if (regulations.roster.benchFielders < 0 || regulations.roster.benchFielders > 15) {
    errors.push('控え野手数は0〜15の間で設定してください');
  }

  if (regulations.roster.benchPitchers < 0 || regulations.roster.benchPitchers > 15) {
    errors.push('控え投手数は0〜15の間で設定してください');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * レギュレーション変更が可能かチェック
 * @param {string} phase - 現在のフェーズ
 * @returns {boolean}
 */
export const canModifyRegulations = (phase) => {
  return phase === SEASON_PHASES.OFF_SEASON;
};

/**
 * プレーオフ形式の説明を取得
 * @param {string} format - 形式
 * @returns {string} 説明文
 */
export const getPlayoffFormatDescription = (format) => {
  const descriptions = {
    'single': '1位 vs 2位の対戦（3戦2勝制、最大3試合）',
    'double': '4チームトーナメント（1位vs4位、2位vs3位 → 決勝）',
    'tournament': 'トーナメント制（3位vs4位 → 勝者vs2位 → 勝者vs1位）',
    'top2': '上位2チーム対決（5戦3勝制、最大5試合）',
    'split': '前期・後期優勝チーム対決（3戦2勝制）',
    'none': 'プレーオフなし（レギュラーシーズンの優勝チームが年間王者）'
  };
  return descriptions[format] || '';
};

/**
 * レギュレーション設定のプリセット（実在の独立リーグ）
 */
export const REGULATION_PRESETS = {
  shikoku: {
    name: '四国アイランドリーグplus',
    description: '前期38試合＋後期38試合、前後期優勝者による決戦',
    regulations: {
      useDH: false,
      gamesPerSeason: 76,  // 前期38＋後期38
      teamsCount: 4,
      playoffFormat: 'split',  // 前期・後期優勝チーム対決
      maxExtraInnings: 12,
      roster: { starters: 9, benchFielders: 8, benchPitchers: 7 }
    }
  },
  bc: {
    name: 'BCリーグ',
    description: '2リーグ制（4チーム×2）、両リーグ優勝チームによる決戦',
    regulations: {
      useDH: false,
      gamesPerSeason: 58,
      teamsCount: 8,  // 2リーグ×4チーム
      playoffFormat: 'single',  // 両リーグ優勝チーム対決（3戦2勝制）
      maxExtraInnings: 12,
      roster: { starters: 9, benchFielders: 8, benchPitchers: 7 }
    }
  },
  kyushu: {
    name: '九州アジアリーグ',
    description: '年間76試合、トーナメント制プレーオフ',
    regulations: {
      useDH: false,
      gamesPerSeason: 76,
      teamsCount: 4,
      playoffFormat: 'tournament',  // 3位vs4位→勝者vs2位→勝者vs1位
      maxExtraInnings: 12,
      roster: { starters: 9, benchFielders: 8, benchPitchers: 7 }
    }
  },
  hokkaido: {
    name: '北海道フロンティアリーグ',
    description: '年間54試合、上位2チームによる決戦',
    regulations: {
      useDH: false,
      gamesPerSeason: 54,
      teamsCount: 4,
      playoffFormat: 'top2',  // 上位2チーム、5戦3勝制
      maxExtraInnings: 12,
      roster: { starters: 9, benchFielders: 8, benchPitchers: 7 }
    }
  },
  kansai: {
    name: '関西独立リーグ',
    description: '年間48試合、プレーオフなし',
    regulations: {
      useDH: false,
      gamesPerSeason: 48,
      teamsCount: 6,
      playoffFormat: 'none',  // プレーオフなし
      maxExtraInnings: 12,
      roster: { starters: 9, benchFielders: 8, benchPitchers: 7 }
    }
  },
  // 汎用プリセット（参考用）
  independent: {
    name: '独立リーグ（汎用）',
    description: '標準的な独立リーグ設定',
    regulations: {
      useDH: false,
      gamesPerSeason: 60,
      teamsCount: 4,
      playoffFormat: 'single',
      maxExtraInnings: 12,
      roster: { starters: 9, benchFielders: 8, benchPitchers: 7 }
    }
  },
  professional: {
    name: 'プロ野球（参考）',
    description: 'NPB標準設定',
    regulations: {
      useDH: true,
      gamesPerSeason: 143,
      teamsCount: 6,
      playoffFormat: 'double',
      maxExtraInnings: 12,
      roster: { starters: 9, benchFielders: 8, benchPitchers: 7 }
    }
  }
};

/**
 * プリセットを適用
 * @param {string} presetName - プリセット名
 * @returns {Object} レギュレーション設定
 */
export const applyPreset = (presetName) => {
  const preset = REGULATION_PRESETS[presetName];
  return preset ? { ...preset.regulations } : { ...DEFAULT_REGULATIONS };
};

// ES module exports
