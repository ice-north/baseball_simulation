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
  leagueFormat: 'single', // リーグ形式: 'single'=1リーグ, 'two'=2リーグ制
  playoffFormat: 'short', // プレーオフ形式: 'short'=3戦2勝, 'full'=5戦3勝, 'tournament'=4チームトーナメント
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

  // 年間試合数の検証
  const tc = regulations.teamsCount;
  const maxGames = 150;

  if (regulations.gamesPerSeason < 1 || regulations.gamesPerSeason > maxGames) {
    errors.push(`年間試合数は1〜${maxGames}の間で設定してください`);
  } else if (regulations.leagueFormat !== 'two') {
    const d = Math.max(1, tc - 1);
    if (regulations.gamesPerSeason % d !== 0) {
      errors.push(`年間試合数はチーム数-1(${d})の倍数で設定してください`);
    }
  }

  // 延長回数の検証
  if (regulations.maxExtraInnings < 0 || regulations.maxExtraInnings > 30) {
    errors.push('延長最大回数は0〜30の間で設定してください');
  }

  // ロスター検証（roster未設定の場合はデフォルト値を適用）
  const roster = regulations.roster || { starters: 9, benchFielders: 8, benchPitchers: 7 };
  if (roster.starters < 8 || roster.starters > 10) {
    errors.push('スタメン人数は8〜10の間で設定してください');
  }

  if (roster.benchFielders < 0 || roster.benchFielders > 15) {
    errors.push('控え野手数は0〜15の間で設定してください');
  }

  if (roster.benchPitchers < 0 || roster.benchPitchers > 15) {
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
export const getPlayoffFormatDescription = (format, leagueFormat) => {
  if (leagueFormat === 'two') {
    const descriptions = {
      'short': '両リーグ1位同士の対決（3戦2勝制）',
      'full': '両リーグ1位同士の対決（5戦3勝制）',
      'tournament': '両リーグの1位と2位による4チームトーナメント（準決勝+決勝、各5戦3勝制）'
    };
    return '【2リーグ制】' + (descriptions[format] || '');
  }
  const descriptions = {
    'short': '1位 vs 2位の対決（3戦2勝制）',
    'full': '1位 vs 2位の対決（5戦3勝制）',
    'tournament': '上位4チームトーナメント（1位vs4位、2位vs3位 → 決勝、各5戦3勝制）'
  };
  return descriptions[format] || '';
};

/**
 * レギュレーション設定のプリセット（実在の独立リーグ）
 */
export const REGULATION_PRESETS = {
  shikoku: {
    name: '四国アイランドリーグplus',
    description: '年間75試合、1位vs2位の3戦2勝制プレーオフ',
    regulations: {
      useDH: false,
      gamesPerSeason: 75,
      teamsCount: 4,
      playoffFormat: 'short',
      maxExtraInnings: 12,
      roster: { starters: 9, benchFielders: 8, benchPitchers: 7 }
    }
  },
  bc: {
    name: 'BCリーグ',
    description: '2リーグ制（4チーム×2）、両リーグ優勝チームによる決戦',
    regulations: {
      useDH: false,
      gamesPerSeason: 54,
      teamsCount: 8,
      leagueFormat: 'two',
      leagueNames: ['ルートインBC信越', 'ルートインBC北陸'],
      playoffFormat: 'short',
      maxExtraInnings: 12,
      roster: { starters: 9, benchFielders: 8, benchPitchers: 7 }
    }
  },
  kyushu: {
    name: '九州アジアリーグ',
    description: '年間75試合、4チームトーナメント制プレーオフ',
    regulations: {
      useDH: false,
      gamesPerSeason: 75,
      teamsCount: 4,
      playoffFormat: 'tournament',
      maxExtraInnings: 12,
      roster: { starters: 9, benchFielders: 8, benchPitchers: 7 }
    }
  },
  hokkaido: {
    name: '北海道フロンティアリーグ',
    description: '年間57試合、1位vs2位の5戦3勝制プレーオフ',
    regulations: {
      useDH: false,
      gamesPerSeason: 57,
      teamsCount: 4,
      playoffFormat: 'full',
      maxExtraInnings: 12,
      roster: { starters: 9, benchFielders: 8, benchPitchers: 7 }
    }
  },
  kansai: {
    name: '関西独立リーグ',
    description: '年間60試合、1位vs2位の3戦2勝制プレーオフ',
    regulations: {
      useDH: false,
      gamesPerSeason: 60,
      teamsCount: 6,
      playoffFormat: 'short',
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
