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
};

// ES module exports
