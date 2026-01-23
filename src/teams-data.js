// ============================================================
// チームデータ - teams-data.js
// 4チーム分の選手データ
// ============================================================

// 注: createPlayerStats() は players.js で定義済み

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
 * チームCの選手データ（新規作成）
 */
export const createTeamCPlayers = () => {
  return [
    { id: 1, name: 'スピードスター', position: 'center', battingOrder: 1,
      batting: { meet: 72, power: 48, eye: 68, bats: 'right', steal: 80 },
      physical: { speed: 85, arm: 58, throws: 'right' }, fielding: { defense: 72 }, catching: { lead: 38 },
      pitching: { velocity: 128, control: 48, stamina: 85, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 32 }] },
      positionFitness: { pitcher: 22, catcher: 28, first: 38, second: 48, third: 38, short: 48, left: 78, center: 100, right: 78 },
      stats: createPlayerStats() },
    { id: 2, name: 'コンタクトヒッター', position: 'second', battingOrder: 2,
      batting: { meet: 78, power: 42, eye: 72, bats: 'left', steal: 62 },
      physical: { speed: 68, arm: 62, throws: 'right' }, fielding: { defense: 78 }, catching: { lead: 42 },
      pitching: { velocity: 132, control: 52, stamina: 88, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'changeup', level: 38 }] },
      positionFitness: { pitcher: 28, catcher: 32, first: 52, second: 100, third: 52, short: 62, left: 38, center: 32, right: 38 },
      stats: createPlayerStats() },
    { id: 3, name: 'クリーンナップ', position: 'short', battingOrder: 3,
      batting: { meet: 68, power: 78, eye: 62, bats: 'right', steal: 42 },
      physical: { speed: 58, arm: 72, throws: 'right' }, fielding: { defense: 68 }, catching: { lead: 48 },
      pitching: { velocity: 138, control: 48, stamina: 98, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 38 }] },
      positionFitness: { pitcher: 28, catcher: 32, first: 72, second: 52, third: 82, short: 100, left: 48, center: 48, right: 48 },
      stats: createPlayerStats() },
    { id: 4, name: 'ビッグバット', position: 'first', battingOrder: 4,
      batting: { meet: 62, power: 85, eye: 58, bats: 'right', steal: 28 },
      physical: { speed: 48, arm: 68, throws: 'right' }, fielding: { defense: 65 }, catching: { lead: 45 },
      pitching: { velocity: 140, control: 50, stamina: 105, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'fork', level: 42 }] },
      positionFitness: { pitcher: 30, catcher: 25, first: 100, second: 40, third: 50, short: 45, left: 65, center: 55, right: 60 },
      stats: createPlayerStats() },
    { id: 5, name: '堅守職人', position: 'third', battingOrder: 5,
      batting: { meet: 65, power: 68, eye: 62, bats: 'right', steal: 35 },
      physical: { speed: 55, arm: 80, throws: 'right' }, fielding: { defense: 82 }, catching: { lead: 52 },
      pitching: { velocity: 138, control: 55, stamina: 110, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 45 }] },
      positionFitness: { pitcher: 35, catcher: 30, first: 55, second: 48, third: 100, short: 72, left: 50, center: 45, right: 50 },
      stats: createPlayerStats() },
    { id: 6, name: 'キャッチャー', position: 'catcher', battingOrder: 6,
      batting: { meet: 60, power: 58, eye: 65, bats: 'right', steal: 25 },
      physical: { speed: 45, arm: 75, throws: 'right' }, fielding: { defense: 70 }, catching: { lead: 75 },
      pitching: { velocity: 120, control: 55, stamina: 70, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 35 }] },
      positionFitness: { pitcher: 35, catcher: 100, first: 28, second: 25, third: 25, short: 25, left: 22, center: 22, right: 22 },
      stats: createPlayerStats() },
    { id: 7, name: '外野の要', position: 'left', battingOrder: 7,
      batting: { meet: 65, power: 62, eye: 60, bats: 'left', steal: 50 },
      physical: { speed: 70, arm: 70, throws: 'right' }, fielding: { defense: 72 }, catching: { lead: 48 },
      pitching: { velocity: 135, control: 50, stamina: 95, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'cutter', level: 40 }] },
      positionFitness: { pitcher: 25, catcher: 22, first: 45, second: 38, third: 40, short: 38, left: 100, center: 82, right: 85 },
      stats: createPlayerStats() },
    { id: 8, name: 'ライトガード', position: 'right', battingOrder: 8,
      batting: { meet: 62, power: 65, eye: 58, bats: 'right', steal: 45 },
      physical: { speed: 65, arm: 78, throws: 'right' }, fielding: { defense: 70 }, catching: { lead: 50 },
      pitching: { velocity: 138, control: 52, stamina: 100, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 42 }] },
      positionFitness: { pitcher: 22, catcher: 20, first: 40, second: 35, third: 40, short: 35, left: 82, center: 80, right: 100 },
      stats: createPlayerStats() },
    { id: 9, name: 'エースロケット', position: 'pitcher', battingOrder: 9,
      batting: { meet: 35, power: 30, eye: 45, bats: 'right', steal: 18 },
      physical: { speed: 45, arm: 55, throws: 'right' }, fielding: { defense: 55 }, catching: { lead: 55 },
      pitching: { velocity: 152, control: 72, stamina: 175, form: 'overhand',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 75 }, { id: 3, type: 'fork', level: 65 }, { id: 4, type: 'changeup', level: 55 }] },
      positionFitness: { pitcher: 100, catcher: 28, first: 22, second: 22, third: 22, short: 22, left: 22, center: 22, right: 22 },
      stats: createPlayerStats() },
  ];
};

/**
 * チームCのベンチ
 */
export const createTeamCBench = () => {
  return [
    { id: 10, name: 'セカンドエース', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 38, power: 32, eye: 48, bats: 'right', steal: 20 },
      physical: { speed: 48, arm: 58, throws: 'right' }, fielding: { defense: 58 }, catching: { lead: 58 },
      pitching: { velocity: 148, control: 68, stamina: 168, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 70 }, { id: 3, type: 'splitter', level: 60 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 },
      stats: createPlayerStats() },
    { id: 11, name: 'ユーティリティ', position: 'second', isStarter: false, battingOrder: 0,
      batting: { meet: 68, power: 52, eye: 62, bats: 'right', steal: 55 },
      physical: { speed: 72, arm: 62, throws: 'right' }, fielding: { defense: 68 }, catching: { lead: 45 },
      pitching: { velocity: 125, control: 55, stamina: 75, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 35 }] },
      positionFitness: { pitcher: 25, catcher: 30, first: 70, second: 95, third: 70, short: 85, left: 55, center: 50, right: 55 },
      stats: createPlayerStats() },
    { id: 12, name: '代打の切り札', position: 'first', isStarter: false, battingOrder: 0,
      batting: { meet: 62, power: 82, eye: 55, bats: 'left', steal: 25 },
      physical: { speed: 48, arm: 60, throws: 'right' }, fielding: { defense: 62 }, catching: { lead: 42 },
      pitching: { velocity: 130, control: 48, stamina: 85, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 35 }] },
      positionFitness: { pitcher: 25, catcher: 22, first: 100, second: 45, third: 55, short: 40, left: 70, center: 60, right: 65 },
      stats: createPlayerStats() },
    { id: 13, name: '俊足外野', position: 'center', isStarter: false, battingOrder: 0,
      batting: { meet: 65, power: 45, eye: 68, bats: 'left', steal: 78 },
      physical: { speed: 88, arm: 58, throws: 'right' }, fielding: { defense: 72 }, catching: { lead: 40 },
      pitching: { velocity: 122, control: 45, stamina: 70, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'curve', level: 28 }] },
      positionFitness: { pitcher: 20, catcher: 20, first: 35, second: 45, third: 35, short: 45, left: 95, center: 100, right: 90 },
      stats: createPlayerStats() },
    { id: 14, name: '左の代打', position: 'left', isStarter: false, battingOrder: 0,
      batting: { meet: 60, power: 75, eye: 58, bats: 'left', steal: 30 },
      physical: { speed: 52, arm: 65, throws: 'left' }, fielding: { defense: 60 }, catching: { lead: 40 },
      pitching: { velocity: 128, control: 50, stamina: 80, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'changeup', level: 38 }] },
      positionFitness: { pitcher: 22, catcher: 20, first: 70, second: 40, third: 45, short: 38, left: 100, center: 75, right: 80 },
      stats: createPlayerStats() },
    { id: 15, name: '強肩外野', position: 'right', isStarter: false, battingOrder: 0,
      batting: { meet: 58, power: 68, eye: 55, bats: 'right', steal: 40 },
      physical: { speed: 65, arm: 85, throws: 'right' }, fielding: { defense: 68 }, catching: { lead: 42 },
      pitching: { velocity: 135, control: 52, stamina: 90, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'cutter', level: 40 }] },
      positionFitness: { pitcher: 20, catcher: 22, first: 40, second: 35, third: 40, short: 35, left: 80, center: 82, right: 100 },
      stats: createPlayerStats() },
    { id: 16, name: '内野守備', position: 'short', isStarter: false, battingOrder: 0,
      batting: { meet: 65, power: 48, eye: 62, bats: 'right', steal: 52 },
      physical: { speed: 68, arm: 72, throws: 'right' }, fielding: { defense: 78 }, catching: { lead: 45 },
      pitching: { velocity: 125, control: 52, stamina: 80, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 35 }] },
      positionFitness: { pitcher: 22, catcher: 25, first: 50, second: 88, third: 75, short: 100, left: 40, center: 38, right: 40 },
      stats: createPlayerStats() },
    { id: 17, name: 'サブキャッチャー', position: 'catcher', isStarter: false, battingOrder: 0,
      batting: { meet: 55, power: 52, eye: 62, bats: 'right', steal: 20 },
      physical: { speed: 40, arm: 70, throws: 'right' }, fielding: { defense: 65 }, catching: { lead: 70 },
      pitching: { velocity: 120, control: 52, stamina: 65, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 32 }] },
      positionFitness: { pitcher: 28, catcher: 100, first: 25, second: 22, third: 22, short: 22, left: 20, center: 20, right: 20 },
      stats: createPlayerStats() },
    { id: 18, name: 'セットアッパー', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 30, power: 28, eye: 40, bats: 'right', steal: 15 },
      physical: { speed: 42, arm: 52, throws: 'right' }, fielding: { defense: 52 }, catching: { lead: 48 },
      pitching: { velocity: 148, control: 68, stamina: 100, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 75 }, { id: 3, type: 'fork', level: 60 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 },
      stats: createPlayerStats() },
    { id: 19, name: 'クローザー', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 28, power: 25, eye: 38, bats: 'right', steal: 12 },
      physical: { speed: 40, arm: 50, throws: 'right' }, fielding: { defense: 50 }, catching: { lead: 42 },
      pitching: { velocity: 153, control: 73, stamina: 80, form: 'overhand',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 80 }, { id: 3, type: 'splitter', level: 70 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 },
      stats: createPlayerStats() },
    { id: 20, name: 'サウスポー', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 32, power: 28, eye: 42, bats: 'left', steal: 18 },
      physical: { speed: 42, arm: 52, throws: 'left' }, fielding: { defense: 52 }, catching: { lead: 48 },
      pitching: { velocity: 140, control: 62, stamina: 90, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 65 }, { id: 3, type: 'changeup', level: 55 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 },
      stats: createPlayerStats() },
    { id: 21, name: 'ロングリリーフ', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 34, power: 30, eye: 44, bats: 'right', steal: 16 },
      physical: { speed: 42, arm: 50, throws: 'right' }, fielding: { defense: 54 }, catching: { lead: 50 },
      pitching: { velocity: 138, control: 58, stamina: 150, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 60 }, { id: 3, type: 'curve', level: 50 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 },
      stats: createPlayerStats() },
    { id: 22, name: 'サイドスロー', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 30, power: 26, eye: 40, bats: 'left', steal: 14 },
      physical: { speed: 40, arm: 48, throws: 'left' }, fielding: { defense: 50 }, catching: { lead: 44 },
      pitching: { velocity: 130, control: 64, stamina: 85, form: 'sidearm',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 70 }, { id: 3, type: 'shoot', level: 65 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 },
      stats: createPlayerStats() },
    { id: 23, name: 'アンダースロー', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 28, power: 24, eye: 38, bats: 'right', steal: 12 },
      physical: { speed: 38, arm: 46, throws: 'right' }, fielding: { defense: 48 }, catching: { lead: 42 },
      pitching: { velocity: 128, control: 68, stamina: 95, form: 'submarine',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 75 }, { id: 3, type: 'curve', level: 60 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 },
      stats: createPlayerStats() },
    { id: 24, name: '期待の若手', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 38, power: 32, eye: 48, bats: 'right', steal: 18 },
      physical: { speed: 44, arm: 52, throws: 'right' }, fielding: { defense: 56 }, catching: { lead: 52 },
      pitching: { velocity: 142, control: 62, stamina: 160, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 65 }, { id: 3, type: 'fork', level: 55 }, { id: 4, type: 'changeup', level: 50 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 },
      stats: createPlayerStats() },
  ];
};

/**
 * チームDの選手データ（新規作成）
 */
export const createTeamDPlayers = () => {
  return [
    { id: 1, name: 'リードオフマン', position: 'center', battingOrder: 1,
      batting: { meet: 74, power: 46, eye: 70, bats: 'left', steal: 82 },
      physical: { speed: 82, arm: 60, throws: 'right' }, fielding: { defense: 74 }, catching: { lead: 40 },
      pitching: { velocity: 126, control: 46, stamina: 82, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 30 }] },
      positionFitness: { pitcher: 20, catcher: 26, first: 36, second: 46, third: 36, short: 46, left: 76, center: 100, right: 76 },
      stats: createPlayerStats() },
    { id: 2, name: 'テーブルセッター', position: 'second', battingOrder: 2,
      batting: { meet: 76, power: 44, eye: 74, bats: 'right', steal: 64 },
      physical: { speed: 72, arm: 64, throws: 'right' }, fielding: { defense: 76 }, catching: { lead: 44 },
      pitching: { velocity: 134, control: 54, stamina: 92, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'changeup', level: 40 }] },
      positionFitness: { pitcher: 26, catcher: 30, first: 50, second: 100, third: 50, short: 60, left: 36, center: 30, right: 36 },
      stats: createPlayerStats() },
    { id: 3, name: 'パワーヒッター', position: 'short', battingOrder: 3,
      batting: { meet: 66, power: 82, eye: 60, bats: 'right', steal: 38 },
      physical: { speed: 56, arm: 76, throws: 'right' }, fielding: { defense: 72 }, catching: { lead: 50 },
      pitching: { velocity: 136, control: 46, stamina: 102, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 36 }] },
      positionFitness: { pitcher: 26, catcher: 30, first: 70, second: 50, third: 80, short: 100, left: 46, center: 46, right: 46 },
      stats: createPlayerStats() },
    { id: 4, name: 'スラッガー', position: 'first', battingOrder: 4,
      batting: { meet: 64, power: 88, eye: 56, bats: 'left', steal: 26 },
      physical: { speed: 46, arm: 66, throws: 'left' }, fielding: { defense: 68 }, catching: { lead: 48 },
      pitching: { velocity: 138, control: 48, stamina: 108, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'fork', level: 40 }] },
      positionFitness: { pitcher: 28, catcher: 26, first: 100, second: 38, third: 48, short: 42, left: 62, center: 52, right: 58 },
      stats: createPlayerStats() },
    { id: 5, name: '強打三塁手', position: 'third', battingOrder: 5,
      batting: { meet: 66, power: 72, eye: 64, bats: 'right', steal: 32 },
      physical: { speed: 52, arm: 82, throws: 'right' }, fielding: { defense: 80 }, catching: { lead: 54 },
      pitching: { velocity: 136, control: 52, stamina: 112, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 42 }] },
      positionFitness: { pitcher: 32, catcher: 28, first: 52, second: 46, third: 100, short: 70, left: 48, center: 42, right: 48 },
      stats: createPlayerStats() },
    { id: 6, name: '正捕手', position: 'catcher', battingOrder: 6,
      batting: { meet: 62, power: 60, eye: 68, bats: 'right', steal: 22 },
      physical: { speed: 42, arm: 78, throws: 'right' }, fielding: { defense: 72 }, catching: { lead: 78 },
      pitching: { velocity: 122, control: 58, stamina: 72, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 38 }] },
      positionFitness: { pitcher: 32, catcher: 100, first: 26, second: 22, third: 22, short: 22, left: 20, center: 20, right: 20 },
      stats: createPlayerStats() },
    { id: 7, name: '左の巧打者', position: 'left', battingOrder: 7,
      batting: { meet: 68, power: 58, eye: 62, bats: 'left', steal: 48 },
      physical: { speed: 68, arm: 68, throws: 'left' }, fielding: { defense: 70 }, catching: { lead: 46 },
      pitching: { velocity: 132, control: 48, stamina: 92, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'cutter', level: 38 }] },
      positionFitness: { pitcher: 22, catcher: 20, first: 42, second: 36, third: 38, short: 36, left: 100, center: 80, right: 82 },
      stats: createPlayerStats() },
    { id: 8, name: 'レーザービーム', position: 'right', battingOrder: 8,
      batting: { meet: 64, power: 68, eye: 60, bats: 'right', steal: 42 },
      physical: { speed: 62, arm: 82, throws: 'right' }, fielding: { defense: 72 }, catching: { lead: 52 },
      pitching: { velocity: 140, control: 54, stamina: 102, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 44 }] },
      positionFitness: { pitcher: 24, catcher: 22, first: 42, second: 32, third: 38, short: 32, left: 84, center: 82, right: 100 },
      stats: createPlayerStats() },
    { id: 9, name: 'エースクレバー', position: 'pitcher', battingOrder: 9,
      batting: { meet: 38, power: 32, eye: 48, bats: 'left', steal: 20 },
      physical: { speed: 48, arm: 58, throws: 'left' }, fielding: { defense: 58 }, catching: { lead: 58 },
      pitching: { velocity: 150, control: 75, stamina: 180, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 78 }, { id: 3, type: 'changeup', level: 68 }, { id: 4, type: 'curve', level: 58 }] },
      positionFitness: { pitcher: 100, catcher: 26, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 },
      stats: createPlayerStats() },
  ];
};

/**
 * チームDのベンチ
 */
export const createTeamDBench = () => {
  return [
    { id: 10, name: '先発二番手', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 36, power: 30, eye: 46, bats: 'right', steal: 18 },
      physical: { speed: 46, arm: 56, throws: 'right' }, fielding: { defense: 56 }, catching: { lead: 56 },
      pitching: { velocity: 146, control: 66, stamina: 165, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 68 }, { id: 3, type: 'splitter', level: 58 }] },
      positionFitness: { pitcher: 100, catcher: 24, first: 18, second: 18, third: 18, short: 18, left: 18, center: 18, right: 18 },
      stats: createPlayerStats() },
    { id: 11, name: 'スーパーサブ', position: 'second', isStarter: false, battingOrder: 0,
      batting: { meet: 70, power: 54, eye: 64, bats: 'left', steal: 58 },
      physical: { speed: 74, arm: 64, throws: 'right' }, fielding: { defense: 70 }, catching: { lead: 48 },
      pitching: { velocity: 128, control: 58, stamina: 78, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 38 }] },
      positionFitness: { pitcher: 28, catcher: 32, first: 72, second: 98, third: 72, short: 88, left: 58, center: 52, right: 58 },
      stats: createPlayerStats() },
    { id: 12, name: '代打のスラッガー', position: 'first', isStarter: false, battingOrder: 0,
      batting: { meet: 60, power: 84, eye: 52, bats: 'right', steal: 22 },
      physical: { speed: 46, arm: 58, throws: 'right' }, fielding: { defense: 60 }, catching: { lead: 40 },
      pitching: { velocity: 128, control: 46, stamina: 82, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 32 }] },
      positionFitness: { pitcher: 22, catcher: 20, first: 100, second: 42, third: 52, short: 38, left: 68, center: 58, right: 62 },
      stats: createPlayerStats() },
    { id: 13, name: 'センターの控え', position: 'center', isStarter: false, battingOrder: 0,
      batting: { meet: 68, power: 48, eye: 70, bats: 'right', steal: 80 },
      physical: { speed: 86, arm: 60, throws: 'right' }, fielding: { defense: 74 }, catching: { lead: 42 },
      pitching: { velocity: 124, control: 48, stamina: 72, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'curve', level: 30 }] },
      positionFitness: { pitcher: 22, catcher: 22, first: 38, second: 48, third: 38, short: 48, left: 92, center: 100, right: 88 },
      stats: createPlayerStats() },
    { id: 14, name: '代打左打者', position: 'left', isStarter: false, battingOrder: 0,
      batting: { meet: 62, power: 78, eye: 60, bats: 'left', steal: 32 },
      physical: { speed: 54, arm: 68, throws: 'left' }, fielding: { defense: 62 }, catching: { lead: 42 },
      pitching: { velocity: 130, control: 52, stamina: 82, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'changeup', level: 40 }] },
      positionFitness: { pitcher: 24, catcher: 22, first: 72, second: 42, third: 48, short: 40, left: 100, center: 78, right: 82 },
      stats: createPlayerStats() },
    { id: 15, name: '強肩右翼', position: 'right', isStarter: false, battingOrder: 0,
      batting: { meet: 60, power: 70, eye: 58, bats: 'right', steal: 42 },
      physical: { speed: 68, arm: 88, throws: 'right' }, fielding: { defense: 70 }, catching: { lead: 44 },
      pitching: { velocity: 138, control: 54, stamina: 92, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'cutter', level: 42 }] },
      positionFitness: { pitcher: 22, catcher: 24, first: 42, second: 38, third: 42, short: 38, left: 82, center: 84, right: 100 },
      stats: createPlayerStats() },
    { id: 16, name: '内野のサブ', position: 'short', isStarter: false, battingOrder: 0,
      batting: { meet: 68, power: 50, eye: 64, bats: 'right', steal: 54 },
      physical: { speed: 70, arm: 74, throws: 'right' }, fielding: { defense: 80 }, catching: { lead: 48 },
      pitching: { velocity: 128, control: 54, stamina: 82, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 38 }] },
      positionFitness: { pitcher: 24, catcher: 28, first: 52, second: 90, third: 78, short: 100, left: 42, center: 40, right: 42 },
      stats: createPlayerStats() },
    { id: 17, name: '控え捕手', position: 'catcher', isStarter: false, battingOrder: 0,
      batting: { meet: 58, power: 54, eye: 64, bats: 'right', steal: 18 },
      physical: { speed: 38, arm: 72, throws: 'right' }, fielding: { defense: 68 }, catching: { lead: 72 },
      pitching: { velocity: 118, control: 50, stamina: 62, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 30 }] },
      positionFitness: { pitcher: 30, catcher: 100, first: 24, second: 20, third: 20, short: 20, left: 18, center: 18, right: 18 },
      stats: createPlayerStats() },
    { id: 18, name: '中継ぎエース', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 32, power: 30, eye: 42, bats: 'right', steal: 16 },
      physical: { speed: 44, arm: 54, throws: 'right' }, fielding: { defense: 54 }, catching: { lead: 50 },
      pitching: { velocity: 150, control: 70, stamina: 102, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 78 }, { id: 3, type: 'fork', level: 62 }] },
      positionFitness: { pitcher: 100, catcher: 26, first: 22, second: 22, third: 22, short: 22, left: 22, center: 22, right: 22 },
      stats: createPlayerStats() },
    { id: 19, name: 'ストッパー', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 30, power: 26, eye: 40, bats: 'right', steal: 14 },
      physical: { speed: 42, arm: 52, throws: 'right' }, fielding: { defense: 52 }, catching: { lead: 44 },
      pitching: { velocity: 156, control: 76, stamina: 84, form: 'overhand',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 84 }, { id: 3, type: 'splitter', level: 74 }] },
      positionFitness: { pitcher: 100, catcher: 26, first: 22, second: 22, third: 22, short: 22, left: 22, center: 22, right: 22 },
      stats: createPlayerStats() },
    { id: 20, name: '左のワンポイント', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 34, power: 30, eye: 44, bats: 'left', steal: 20 },
      physical: { speed: 44, arm: 54, throws: 'left' }, fielding: { defense: 54 }, catching: { lead: 50 },
      pitching: { velocity: 144, control: 66, stamina: 94, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 70 }, { id: 3, type: 'changeup', level: 60 }] },
      positionFitness: { pitcher: 100, catcher: 26, first: 22, second: 22, third: 22, short: 22, left: 22, center: 22, right: 22 },
      stats: createPlayerStats() },
    { id: 21, name: 'イニング喰い', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 36, power: 32, eye: 46, bats: 'right', steal: 18 },
      physical: { speed: 44, arm: 52, throws: 'right' }, fielding: { defense: 56 }, catching: { lead: 52 },
      pitching: { velocity: 142, control: 62, stamina: 158, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 64 }, { id: 3, type: 'curve', level: 54 }] },
      positionFitness: { pitcher: 100, catcher: 26, first: 22, second: 22, third: 22, short: 22, left: 22, center: 22, right: 22 },
      stats: createPlayerStats() },
    { id: 22, name: 'サイドハンド', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 32, power: 28, eye: 42, bats: 'right', steal: 16 },
      physical: { speed: 42, arm: 50, throws: 'right' }, fielding: { defense: 52 }, catching: { lead: 46 },
      pitching: { velocity: 134, control: 68, stamina: 90, form: 'sidearm',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 74 }, { id: 3, type: 'shoot', level: 70 }] },
      positionFitness: { pitcher: 100, catcher: 26, first: 22, second: 22, third: 22, short: 22, left: 22, center: 22, right: 22 },
      stats: createPlayerStats() },
    { id: 23, name: 'アンダーハンド', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 30, power: 26, eye: 40, bats: 'right', steal: 14 },
      physical: { speed: 40, arm: 48, throws: 'right' }, fielding: { defense: 50 }, catching: { lead: 44 },
      pitching: { velocity: 132, control: 72, stamina: 100, form: 'submarine',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 80 }, { id: 3, type: 'curve', level: 64 }] },
      positionFitness: { pitcher: 100, catcher: 26, first: 22, second: 22, third: 22, short: 22, left: 22, center: 22, right: 22 },
      stats: createPlayerStats() },
    { id: 24, name: 'ルーキー', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 40, power: 36, eye: 50, bats: 'right', steal: 22 },
      physical: { speed: 48, arm: 56, throws: 'right' }, fielding: { defense: 60 }, catching: { lead: 56 },
      pitching: { velocity: 146, control: 66, stamina: 170, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 70 }, { id: 3, type: 'fork', level: 60 }, { id: 4, type: 'changeup', level: 54 }] },
      positionFitness: { pitcher: 100, catcher: 26, first: 22, second: 22, third: 22, short: 22, left: 22, center: 22, right: 22 },
      stats: createPlayerStats() },
  ];
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
