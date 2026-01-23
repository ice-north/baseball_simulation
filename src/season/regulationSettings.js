// ============================================================
// レギュレーション設定 - regulationSettings.js
// オフシーズン（12月）に変更可能な設定項目
// ============================================================

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
    'single': '1位 vs 2位の対戦（3戦先取制、最大5試合）',
    'double': '4チームトーナメント（1位vs4位、2位vs3位 → 決勝）',
    'none': 'プレーオフなし（レギュラーシーズンの優勝チームが年間王者）'
  };
  return descriptions[format] || '';
};

/**
 * レギュレーション設定のプリセット
 */
export const REGULATION_PRESETS = {
  independent: {
    name: '独立リーグ',
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
    name: 'プロ野球',
    regulations: {
      useDH: true,
      gamesPerSeason: 143,
      teamsCount: 6,
      playoffFormat: 'double',
      maxExtraInnings: 12,
      roster: { starters: 9, benchFielders: 8, benchPitchers: 7 }
    }
  },
  highSchool: {
    name: '高校野球',
    regulations: {
      useDH: false,
      gamesPerSeason: 40,
      teamsCount: 8,
      playoffFormat: 'none',
      maxExtraInnings: 15,
      roster: { starters: 9, benchFielders: 2, benchPitchers: 9 }
    }
  },
  college: {
    name: '大学野球',
    regulations: {
      useDH: true,
      gamesPerSeason: 52,
      teamsCount: 6,
      playoffFormat: 'single',
      maxExtraInnings: 12,
      roster: { starters: 9, benchFielders: 6, benchPitchers: 8 }
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
