// ============================================================
// チームデータ - teams-data.js
// 動的チーム生成対応（最大12チーム）
// ============================================================

import { createPlayerStats, createSeasonStats, createCareerStats } from './players.js';

/**
 * チームデータ構造（動的に拡張可能）
 */
export const TEAMS_DATA = {};

/**
 * 指定したチーム数でTEAMS_DATAを初期化
 * @param {number} teamCount - チーム数（2-12）
 * @param {Array<string>} customNames - カスタムチーム名（省略時はチームA, B, C...）
 * @param {Array<string>} customAbbreviations - カスタム略称（省略時はＡ, Ｂ, Ｃ...）
 */
export const initializeTeamsForCount = (teamCount, customNames = null, customAbbreviations = null) => {
  // 既存のデータをクリア
  Object.keys(TEAMS_DATA).forEach(key => delete TEAMS_DATA[key]);

  // チーム名を決定（カスタム名または自動生成）
  const teamNames = [];
  for (let i = 0; i < teamCount; i++) {
    if (customNames && customNames[i]) {
      teamNames.push(customNames[i]);
    } else {
      teamNames.push(`チーム${String.fromCharCode(65 + i)}`); // A, B, C, D, E, F...
    }
  }

  // チームを作成
  teamNames.forEach((teamName, i) => {
    const abbr = (customAbbreviations && customAbbreviations[i]) || String.fromCharCode(0xFF21 + i);
    TEAMS_DATA[teamName] = {
      name: teamName,
      abbreviation: abbr,
      players: [],
      pitchingRotation: null
    };
  });

  return teamNames;
};

/**
 * チーム名から略称を取得するヘルパー
 * @param {string} teamName - チーム名
 * @returns {string} 略称（見つからない場合はチーム名の先頭4文字）
 */
export const getTeamAbbreviation = (teamName) => {
  if (!teamName) return '';
  const team = TEAMS_DATA[teamName];
  if (team && team.abbreviation) return team.abbreviation;
  return (teamName || '').slice(0, 3);
};

/**
 * チームAの選手データ（元のホームチーム）
 */
export const createTeamAPlayers = () => {
  return window.createDefaultPlayers ? window.createDefaultPlayers() : [];
};

/**
 * チームAのベンチ
 */
export const createTeamABench = () => {
  return window.createHomeBench ? window.createHomeBench() : [];
};

/**
 * チームBの選手データ（元のアウェイチーム）
 */
export const createTeamBPlayers = () => {
  return window.createAwayPlayers ? window.createAwayPlayers() : [];
};

/**
 * チームBのベンチ
 */
export const createTeamBBench = () => {
  return window.createAwayBench ? window.createAwayBench() : [];
};

/**
 * 全チームデータを初期化（4チームの場合）
 */
export const initializeTeamsData = () => {
  // デフォルト4チームを初期化
  initializeTeamsForCount(4);

  // players.jsの関数が読み込まれているか確認
  if (typeof createDefaultPlayers === 'function') {
    TEAMS_DATA['チームA'].players = [...createDefaultPlayers(), ...createHomeBench()];
  }
  if (typeof createAwayPlayers === 'function') {
    TEAMS_DATA['チームB'].players = [...createAwayPlayers(), ...createAwayBench()];
  }

  // 全選手に背番号と初期成績を設定
  Object.keys(TEAMS_DATA).forEach(teamName => {
    TEAMS_DATA[teamName].players = TEAMS_DATA[teamName].players.map((p, i) => ({
      ...p,
      number: p.id,
      stats: p.stats || createPlayerStats(),
      seasonStats: p.seasonStats || createSeasonStats(),
      careerStats: p.careerStats || createCareerStats()
    }));
  });

  // 全チームの投手ローテーションを初期化
  initializeAllPitchingRotations();
};

/**
 * 全チームの投手ローテーションを初期化
 */
export const initializeAllPitchingRotations = () => {
  Object.keys(TEAMS_DATA).forEach(teamName => {
    initializePitchingRotation(teamName);
  });
};

/**
 * 指定チームの投手ローテーションを初期化（リリーフ役割対応）
 */
export const initializePitchingRotation = (teamName) => {
  const team = TEAMS_DATA[teamName];
  if (!team || !team.players || team.players.length === 0) {
    return;
  }

  // 投手を抽出してスタミナでソート
  const pitchers = team.players.filter(p => p.position === 'pitcher');
  if (pitchers.length === 0) {
    return;
  }

  const sortedPitchers = [...pitchers].sort((a, b) =>
    (b.pitching?.stamina || 0) - (a.pitching?.stamina || 0)
  );

  // 先発（スタミナ130以上、最大5人）
  const starters = sortedPitchers
    .filter(p => (p.pitching?.stamina || 0) >= 130)
    .slice(0, 5);

  // スタミナ130以上が5人未満の場合、スタミナ上位から補充
  if (starters.length < 5) {
    const remaining = sortedPitchers
      .filter(p => !starters.includes(p))
      .slice(0, 5 - starters.length);
    starters.push(...remaining);
  }

  // 残りの投手（リリーフ候補）
  const relievers = sortedPitchers.filter(p => !starters.includes(p));

  // リリーフの役割を決定
  // 能力スコア = 球速×0.4 + 制球×0.4 + スタミナ×0.2
  const scoredRelievers = relievers.map(p => ({
    ...p,
    reliefScore: (p.pitching?.velocity || 130) * 0.4 +
                 (p.pitching?.control || 50) * 0.4 +
                 (p.pitching?.stamina || 80) * 0.2
  })).sort((a, b) => b.reliefScore - a.reliefScore);

  // クローザー（最高能力、1人）
  const closer = scoredRelievers[0] || null;

  // セットアッパー（2番目に高い能力、1-2人）
  const setupMen = scoredRelievers.slice(1, 3);

  // 中継ぎ（残り）
  const middleRelievers = scoredRelievers.slice(3);

  // 左のワンポイント候補を特定
  const leftSpecialists = relievers.filter(p =>
    p.physical?.throws === 'left' && (p.pitching?.stamina || 0) < 100
  );

  // ローテーション情報を保存
  team.pitchingRotation = {
    starters: starters.map(p => p.id),
    closer: closer ? closer.id : null,
    setupMen: setupMen.map(p => p.id),
    middleRelievers: middleRelievers.map(p => p.id),
    leftSpecialists: leftSpecialists.map(p => p.id),
    currentStarterIndex: 0,
    // リリーフ疲労管理
    reliefFatigue: {}
  };

  // 初期疲労を設定
  [...(closer ? [closer] : []), ...setupMen, ...middleRelievers].forEach(p => {
    team.pitchingRotation.reliefFatigue[p.id] = 0;
  });

};

/**
 * リリーフ投手を役割に基づいて選択
 * @param {string} teamName - チーム名
 * @param {string} situation - 状況 ('save', 'hold', 'middle', 'long', 'lefty')
 * @param {number} inning - 現在のイニング
 * @param {number} scoreDiff - 点差（正なら勝ち、負なら負け）
 * @returns {Object|null} 選択された投手
 */
export const selectReliefPitcher = (teamName, situation, inning, scoreDiff) => {
  const team = TEAMS_DATA[teamName];
  if (!team || !team.pitchingRotation) return null;

  const rotation = team.pitchingRotation;
  const fatigue = rotation.reliefFatigue || {};

  // 疲労が50以下の投手のみ選択可能
  const isAvailable = (pitcherId) => (fatigue[pitcherId] || 0) < 50;

  // 状況に応じた投手選択
  if (situation === 'save' && rotation.closer) {
    // セーブ場面: クローザー
    if (isAvailable(rotation.closer)) {
      return team.players.find(p => p.id === rotation.closer);
    }
  }

  if (situation === 'hold' || (inning >= 7 && Math.abs(scoreDiff) <= 2)) {
    // セットアップ場面: セットアッパー
    for (const id of rotation.setupMen) {
      if (isAvailable(id)) {
        return team.players.find(p => p.id === id);
      }
    }
  }

  if (situation === 'lefty' && rotation.leftSpecialists.length > 0) {
    // 左打者対策: 左のワンポイント
    for (const id of rotation.leftSpecialists) {
      if (isAvailable(id)) {
        return team.players.find(p => p.id === id);
      }
    }
  }

  // 通常の中継ぎ（疲労が少ない順）
  const availableMiddle = rotation.middleRelievers
    .filter(isAvailable)
    .sort((a, b) => (fatigue[a] || 0) - (fatigue[b] || 0));

  if (availableMiddle.length > 0) {
    return team.players.find(p => p.id === availableMiddle[0]);
  }

  // 全員疲労している場合、セットアッパーから選択
  for (const id of [...rotation.setupMen, rotation.closer].filter(Boolean)) {
    const p = team.players.find(p => p.id === id);
    if (p) return p;
  }

  return null;
};

/**
 * リリーフ投手の疲労を更新
 * @param {string} teamName - チーム名
 * @param {number} pitcherId - 投手ID
 * @param {number} pitchCount - 投球数
 */
export const updateReliefFatigue = (teamName, pitcherId, pitchCount) => {
  const team = TEAMS_DATA[teamName];
  if (!team || !team.pitchingRotation) return;

  if (!team.pitchingRotation.reliefFatigue) {
    team.pitchingRotation.reliefFatigue = {};
  }

  // 疲労を加算（投球数の半分）
  const currentFatigue = team.pitchingRotation.reliefFatigue[pitcherId] || 0;
  team.pitchingRotation.reliefFatigue[pitcherId] = currentFatigue + Math.floor(pitchCount / 2);
};

/**
 * 日付進行時にリリーフ疲労を回復
 * @param {string} teamName - チーム名
 * @param {number} days - 経過日数
 */
export const recoverReliefFatigue = (teamName, days = 1) => {
  const team = TEAMS_DATA[teamName];
  if (!team || !team.pitchingRotation || !team.pitchingRotation.reliefFatigue) return;

  Object.keys(team.pitchingRotation.reliefFatigue).forEach(id => {
    team.pitchingRotation.reliefFatigue[id] = Math.max(0,
      team.pitchingRotation.reliefFatigue[id] - (20 * days)
    );
  });
};

// ES module exports
