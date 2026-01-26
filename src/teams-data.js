// ============================================================
// チームデータ - teams-data.js
// 4チーム分の選手データ
// ============================================================

import { createPlayerStats, createSeasonStats, createCareerStats } from './players.js';

/**
 * チームデータ構造
 */
export const TEAMS_DATA = {
  'チームA': {
    name: 'チームA',
    players: [] // 後で設定
  },
  'チームB': {
    name: 'チームB',
    players: [] // 後で設定
  },
  'チームC': {
    name: 'チームC',
    players: [] // 後で設定
  },
  'チームD': {
    name: 'チームD',
    players: [] // 後で設定
  }
};

/**
 * チームAの選手データ（元のホームチーム）
 */
export const createTeamAPlayers = () => {
  // 元のcreateDefaultPlayers()のデータを使用
  return window.createDefaultPlayers ? window.createDefaultPlayers() : [];
};

/**
 * チームAのベンチ
 */
export const createTeamABench = () => {
  // 元のcreateHomeBench()のデータを使用
  return window.createHomeBench ? window.createHomeBench() : [];
};

/**
 * チームBの選手データ（元のアウェイチーム）
 */
export const createTeamBPlayers = () => {
  // 元のcreateAwayPlayers()のデータを使用
  return window.createAwayPlayers ? window.createAwayPlayers() : [];
};

/**
 * チームBのベンチ
 */
export const createTeamBBench = () => {
  // 元のcreateAwayBench()のデータを使用
  return window.createAwayBench ? window.createAwayBench() : [];
};

/**
 * チームCの選手データ（トライアウトで獲得）
 */
export const createTeamCPlayers = () => {
  return []; // トライアウトで選手を獲得
};

/**
 * チームCのベンチ（トライアウトで獲得）
 */
export const createTeamCBench = () => {
  return []; // トライアウトで選手を獲得
};

/**
 * チームDの選手データ（トライアウトで獲得）
 */
export const createTeamDPlayers = () => {
  return []; // トライアウトで選手を獲得
};

/**
 * チームDのベンチ（トライアウトで獲得）
 */
export const createTeamDBench = () => {
  return []; // トライアウトで選手を獲得
};

/**
 * 全チームデータを初期化
 */
export const initializeTeamsData = () => {
  // players.jsの関数が読み込まれているか確認
  if (typeof createDefaultPlayers === 'function') {
    TEAMS_DATA['チームA'].players = [...createDefaultPlayers(), ...createHomeBench()];
  }
  if (typeof createAwayPlayers === 'function') {
    TEAMS_DATA['チームB'].players = [...createAwayPlayers(), ...createAwayBench()];
  }

  // チームC、Dは新規データ
  TEAMS_DATA['チームC'].players = [...createTeamCPlayers(), ...createTeamCBench()];
  TEAMS_DATA['チームD'].players = [...createTeamDPlayers(), ...createTeamDBench()];

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
 * 指定チームの投手ローテーションを初期化
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

  // 先発（スタミナ140以上、最大5人）
  const starters = sortedPitchers
    .filter(p => (p.pitching?.stamina || 0) >= 140)
    .slice(0, 5);

  // スタミナ140以上が5人未満の場合、スタミナ上位から補充
  if (starters.length < 5) {
    const remaining = sortedPitchers
      .filter(p => !starters.includes(p))
      .slice(0, 5 - starters.length);
    starters.push(...remaining);
  }

  // 抑え（スタミナ140未満で能力が高い投手、最大2人）
  const closerCandidates = sortedPitchers
    .filter(p => (p.pitching?.stamina || 0) < 140)
    .sort((a, b) => {
      const aPower = (a.pitching?.velocity || 0) + (a.pitching?.control || 0);
      const bPower = (b.pitching?.velocity || 0) + (b.pitching?.control || 0);
      return bPower - aPower;
    })
    .slice(0, 2);

  // 中継ぎ（残りの投手）
  const middleRelievers = sortedPitchers.filter(p =>
    !starters.includes(p) && !closerCandidates.includes(p)
  );

  // ローテーション情報を保存
  team.pitchingRotation = {
    starters: starters.map(p => p.id),
    closers: closerCandidates.map(p => p.id),
    middleRelievers: middleRelievers.map(p => p.id),
    currentStarterIndex: 0
  };

  console.log(`✅ ${teamName}の投手ローテーション初期化完了 - 先発${starters.length}人`);
};

// ES module exports
