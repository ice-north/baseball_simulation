// ============================================================
// 選手データ - players.js
// デフォルト選手データと成績初期化関数
// ============================================================

/**
 * 選手の成績初期値を作成
 */
export const createPlayerStats = () => ({
  batting: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0 },
  pitching: { outs: 0, runsAllowed: 0, strikeouts: 0, walks: 0, pitches: 0 }
});

/**
 * シーズン成績の初期値を作成
 */
export const createSeasonStats = () => ({
  batting: {
    games: 0,
    atBats: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    homeruns: 0,
    rbis: 0,
    walks: 0,
    strikeouts: 0,
    stolenBases: 0
  },
  pitching: {
    games: 0,
    wins: 0,
    losses: 0,
    saves: 0,
    holds: 0,
    inningsPitched: 0, // アウト数で記録（3アウト=1イニング）
    runsAllowed: 0,
    earnedRuns: 0,
    hits: 0,
    homeruns: 0,
    walks: 0,
    strikeouts: 0,
    pitches: 0
  }
});

/**
 * 通算成績の初期値を作成
 */
export const createCareerStats = () => ({
  batting: {
    games: 0,
    atBats: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    homeruns: 0,
    rbis: 0,
    walks: 0,
    strikeouts: 0,
    stolenBases: 0
  },
  pitching: {
    games: 0,
    wins: 0,
    losses: 0,
    saves: 0,
    holds: 0,
    inningsPitched: 0,
    runsAllowed: 0,
    earnedRuns: 0,
    hits: 0,
    homeruns: 0,
    walks: 0,
    strikeouts: 0,
    pitches: 0
  }
});

/**
 * 選手に背番号を割り当てる（IDをそのまま使用）
 */
export const assignJerseyNumbers = (players) => {
  return players.map(p => ({ ...p, number: p.id }));
};

/**
 * ホームチーム用のデフォルト選手を生成
 */
export const createDefaultPlayers = () => {
  return [
    {
      id: 1,
      name: '俊足巧打',
      position: 'center',
      battingOrder: 1,
      batting: { meet: 70, power: 50, eye: 65, bats: 'right', steal: 75 },
      physical: { speed: 80, arm: 60, throws: 'right' },
      fielding: { defense: 70 },
      catching: { lead: 40 },
      pitching: {
        velocity: 125, control: 45, stamina: 80,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 30 }
        ]
      },
      positionFitness: { pitcher: 20, catcher: 30, first: 40, second: 50, third: 40, short: 50, left: 80, center: 100, right: 80 },
      stats: createPlayerStats()
    },
    {
      id: 2,
      name: '技巧派',
      position: 'second',
      battingOrder: 2,
      batting: { meet: 75, power: 45, eye: 70, bats: 'left', steal: 65 },
      physical: { speed: 70, arm: 65, throws: 'right' },
      fielding: { defense: 75 },
      catching: { lead: 45 },
      pitching: {
        velocity: 130, control: 50, stamina: 90,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'changeup', level: 40 }
        ]
      },
      positionFitness: { pitcher: 25, catcher: 30, first: 55, second: 100, third: 55, short: 65, left: 40, center: 35, right: 40 }
    },
    {
      id: 3,
      name: '主砲',
      position: 'short',
      battingOrder: 3,
      batting: { meet: 65, power: 80, eye: 60, bats: 'right', steal: 40 },
      physical: { speed: 55, arm: 75, throws: 'right' },
      fielding: { defense: 70 },
      catching: { lead: 50 },
      pitching: {
        velocity: 135, control: 45, stamina: 100,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 35 }
        ]
      },
      positionFitness: { pitcher: 25, catcher: 30, first: 50, second: 65, third: 60, short: 100, left: 40, center: 35, right: 40 }
    },
    {
      id: 4,
      name: '大砲',
      position: 'first',
      battingOrder: 4,
      batting: { meet: 60, power: 90, eye: 55, bats: 'right', steal: 30 },
      physical: { speed: 45, arm: 60, throws: 'right' },
      fielding: { defense: 65 },
      catching: { lead: 40 },
      pitching: {
        velocity: 130, control: 40, stamina: 90,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'fork', level: 30 }
        ]
      },
      positionFitness: { pitcher: 25, catcher: 30, first: 100, second: 55, third: 50, short: 50, left: 40, center: 30, right: 40 }
    },
    {
      id: 5,
      name: '中距離砲',
      position: 'third',
      battingOrder: 5,
      batting: { meet: 65, power: 75, eye: 60, bats: 'right', steal: 50 },
      physical: { speed: 60, arm: 70, throws: 'right' },
      fielding: { defense: 65 },
      catching: { lead: 45 },
      pitching: {
        velocity: 132, control: 48, stamina: 95,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 35 }
        ]
      },
      positionFitness: { pitcher: 25, catcher: 30, first: 50, second: 55, third: 100, short: 60, left: 45, center: 35, right: 45 }
    },
    {
      id: 6,
      name: 'バランス型',
      position: 'left',
      battingOrder: 6,
      batting: { meet: 60, power: 60, eye: 60, bats: 'left', steal: 55 },
      physical: { speed: 65, arm: 65, throws: 'right' },
      fielding: { defense: 60 },
      catching: { lead: 50 },
      pitching: {
        velocity: 128, control: 50, stamina: 85,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'curve', level: 35 }
        ]
      },
      positionFitness: { pitcher: 20, catcher: 20, first: 40, second: 35, third: 40, short: 35, left: 100, center: 85, right: 80 }
    },
    {
      id: 7,
      name: '守備職人',
      position: 'right',
      battingOrder: 7,
      batting: { meet: 55, power: 50, eye: 65, bats: 'right', steal: 60 },
      physical: { speed: 70, arm: 80, throws: 'right' },
      fielding: { defense: 75 },
      catching: { lead: 48 },
      pitching: {
        velocity: 135, control: 52, stamina: 100,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 40 }
        ]
      },
      positionFitness: { pitcher: 20, catcher: 20, first: 40, second: 35, third: 40, short: 35, left: 80, center: 85, right: 100 }
    },
    {
      id: 8,
      name: '正捕手',
      position: 'catcher',
      battingOrder: 8,
      batting: { meet: 55, power: 55, eye: 60, bats: 'right', steal: 25 },
      physical: { speed: 40, arm: 75, throws: 'right' },
      fielding: { defense: 70 },
      catching: { lead: 70 },
      pitching: {
        velocity: 120, control: 45, stamina: 70,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'sinker', level: 30 }
        ]
      },
      positionFitness: { pitcher: 30, catcher: 100, first: 25, second: 25, third: 25, short: 25, left: 20, center: 20, right: 20 }
    },
    {
      id: 9,
      name: '先発投手',
      position: 'pitcher',
      battingOrder: 9,
      batting: { meet: 40, power: 35, eye: 50, bats: 'right', steal: 20 },
      physical: { speed: 40, arm: 50, throws: 'right' },
      fielding: { defense: 55 },
      catching: { lead: 55 },
      pitching: {
        velocity: 145, control: 65, stamina: 200,
        form: 'overhand',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 70 },
          { id: 3, type: 'curve', level: 50 },
          { id: 4, type: 'fork', level: 60 }
        ]
      },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 }
    }
  ].map(p => ({ ...p, stats: p.stats || createPlayerStats() }));
};

/**
 * アウェイチーム用のデフォルト選手を生成
 */
export const createAwayPlayers = () => {
  return [
    {
      id: 1,
      name: '韋駄天',
      position: 'center',
      battingOrder: 1,
      batting: { meet: 65, power: 45, eye: 70, bats: 'left', steal: 85 },
      physical: { speed: 90, arm: 55, throws: 'right' },
      fielding: { defense: 75 },
      catching: { lead: 35 },
      pitching: {
        velocity: 130, control: 40, stamina: 75,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'curve', level: 25 }
        ]
      }
    },
    {
      id: 2,
      name: '巧打者',
      position: 'second',
      battingOrder: 2,
      batting: { meet: 80, power: 40, eye: 75, bats: 'left', steal: 60 },
      physical: { speed: 65, arm: 60, throws: 'right' },
      fielding: { defense: 80 },
      catching: { lead: 50 },
      pitching: {
        velocity: 125, control: 55, stamina: 85,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'changeup', level: 35 }
        ]
      },
      positionFitness: { pitcher: 25, catcher: 30, first: 55, second: 100, third: 55, short: 65, left: 40, center: 35, right: 40 }
    },
    {
      id: 3,
      name: '安打製造機',
      position: 'short',
      battingOrder: 3,
      batting: { meet: 75, power: 65, eye: 65, bats: 'right', steal: 50 },
      physical: { speed: 70, arm: 80, throws: 'right' },
      fielding: { defense: 85 },
      catching: { lead: 45 },
      pitching: {
        velocity: 140, control: 50, stamina: 95,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 40 }
        ]
      },
      positionFitness: { pitcher: 25, catcher: 30, first: 50, second: 65, third: 60, short: 100, left: 40, center: 35, right: 40 }
    },
    {
      id: 4,
      name: '重砲',
      position: 'first',
      battingOrder: 4,
      batting: { meet: 55, power: 95, eye: 50, bats: 'left', steal: 20 },
      physical: { speed: 40, arm: 55, throws: 'left' },
      fielding: { defense: 60 },
      catching: { lead: 35 },
      pitching: {
        velocity: 125, control: 35, stamina: 80,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'sinker', level: 30 }
        ]
      },
      positionFitness: { pitcher: 25, catcher: 30, first: 100, second: 55, third: 50, short: 50, left: 40, center: 30, right: 40 }
    },
    {
      id: 5,
      name: '勝負強い',
      position: 'third',
      battingOrder: 5,
      batting: { meet: 60, power: 70, eye: 55, bats: 'right', steal: 45 },
      physical: { speed: 55, arm: 75, throws: 'right' },
      fielding: { defense: 70 },
      catching: { lead: 50 },
      pitching: {
        velocity: 138, control: 45, stamina: 90,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'fork', level: 35 }
        ]
      },
      positionFitness: { pitcher: 25, catcher: 30, first: 50, second: 55, third: 100, short: 60, left: 45, center: 35, right: 45 }
    },
    {
      id: 6,
      name: '粘り強い',
      position: 'left',
      battingOrder: 6,
      batting: { meet: 65, power: 55, eye: 70, bats: 'switch', steal: 50 },
      physical: { speed: 60, arm: 60, throws: 'right' },
      fielding: { defense: 65 },
      catching: { lead: 55 },
      pitching: {
        velocity: 132, control: 52, stamina: 88,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 30 }
        ]
      },
      positionFitness: { pitcher: 20, catcher: 20, first: 40, second: 35, third: 40, short: 35, left: 100, center: 85, right: 80 }
    },
    {
      id: 7,
      name: '強肩',
      position: 'right',
      battingOrder: 7,
      batting: { meet: 50, power: 60, eye: 55, bats: 'right', steal: 40 },
      physical: { speed: 65, arm: 90, throws: 'right' },
      fielding: { defense: 80 },
      catching: { lead: 40 },
      pitching: {
        velocity: 142, control: 48, stamina: 95,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'cutter', level: 40 }
        ]
      },
      positionFitness: { pitcher: 20, catcher: 20, first: 40, second: 35, third: 40, short: 35, left: 80, center: 85, right: 100 }
    },
    {
      id: 8,
      name: '扇の要',
      position: 'catcher',
      battingOrder: 8,
      batting: { meet: 50, power: 50, eye: 65, bats: 'right', steal: 15 },
      physical: { speed: 35, arm: 80, throws: 'right' },
      fielding: { defense: 75 },
      catching: { lead: 80 },
      pitching: {
        velocity: 115, control: 50, stamina: 65,
        form: 'threeQuarter',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'curve', level: 25 }
        ]
      },
      positionFitness: { pitcher: 30, catcher: 100, first: 25, second: 25, third: 25, short: 25, left: 20, center: 20, right: 20 }
    },
    {
      id: 9,
      name: 'エース',
      position: 'pitcher',
      battingOrder: 9,
      batting: { meet: 35, power: 30, eye: 45, bats: 'right', steal: 15 },
      physical: { speed: 45, arm: 55, throws: 'right' },
      fielding: { defense: 60 },
      catching: { lead: 50 },
      pitching: {
        velocity: 150, control: 70, stamina: 180,
        form: 'overhand',
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 75 },
          { id: 3, type: 'fork', level: 65 },
          { id: 4, type: 'curve', level: 55 }
        ]
      },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 }
    }
  ].map(p => ({ ...p, stats: p.stats || createPlayerStats() }));
};

/**
 * ホームチーム用の控え選手を生成
 */
export const createHomeBench = () => {
  return [
    // 控え野手（1-8番）
    { id: 10, name: '代打の切り札', position: 'first', isStarter: false, battingOrder: 0,
      batting: { meet: 65, power: 75, eye: 55, bats: 'right', steal: 30 },
      physical: { speed: 50, arm: 55, throws: 'right' }, fielding: { defense: 60 }, catching: { lead: 35 },
      pitching: { velocity: 120, control: 40, stamina: 70, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 25 }] },
      positionFitness: { pitcher: 25, catcher: 30, first: 100, second: 55, third: 50, short: 50, left: 40, center: 30, right: 40 } },
    { id: 11, name: '守備固め', position: 'second', isStarter: false, battingOrder: 0,
      batting: { meet: 55, power: 35, eye: 60, bats: 'right', steal: 55 },
      physical: { speed: 65, arm: 65, throws: 'right' }, fielding: { defense: 80 }, catching: { lead: 40 },
      pitching: { velocity: 125, control: 45, stamina: 75, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'curve', level: 25 }] },
      positionFitness: { pitcher: 25, catcher: 30, first: 55, second: 100, third: 55, short: 65, left: 40, center: 35, right: 40 } },
    { id: 12, name: '代走要員', position: 'center', isStarter: false, battingOrder: 0,
      batting: { meet: 60, power: 30, eye: 65, bats: 'left', steal: 85 },
      physical: { speed: 90, arm: 50, throws: 'right' }, fielding: { defense: 70 }, catching: { lead: 30 },
      pitching: { velocity: 118, control: 38, stamina: 65, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'changeup', level: 20 }] },
      positionFitness: { pitcher: 20, catcher: 20, first: 35, second: 35, third: 35, short: 35, left: 85, center: 100, right: 85 } },
    { id: 13, name: 'ユーティリティ', position: 'short', isStarter: false, battingOrder: 0,
      batting: { meet: 60, power: 55, eye: 60, bats: 'right', steal: 50 },
      physical: { speed: 60, arm: 70, throws: 'right' }, fielding: { defense: 65 }, catching: { lead: 45 },
      pitching: { velocity: 128, control: 48, stamina: 80, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 30 }] },
      positionFitness: { pitcher: 25, catcher: 30, first: 50, second: 65, third: 60, short: 100, left: 40, center: 35, right: 40 } },
    { id: 14, name: '若手有望株', position: 'third', isStarter: false, battingOrder: 0,
      batting: { meet: 58, power: 62, eye: 52, bats: 'right', steal: 45 },
      physical: { speed: 58, arm: 68, throws: 'right' }, fielding: { defense: 62 }, catching: { lead: 40 },
      pitching: { velocity: 130, control: 42, stamina: 85, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'fork', level: 28 }] },
      positionFitness: { pitcher: 25, catcher: 30, first: 50, second: 55, third: 100, short: 60, left: 45, center: 35, right: 45 } },
    { id: 15, name: 'ベテラン控え', position: 'left', isStarter: false, battingOrder: 0,
      batting: { meet: 65, power: 50, eye: 68, bats: 'left', steal: 35 },
      physical: { speed: 45, arm: 55, throws: 'left' }, fielding: { defense: 58 }, catching: { lead: 55 },
      pitching: { velocity: 122, control: 50, stamina: 70, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'changeup', level: 32 }] },
      positionFitness: { pitcher: 20, catcher: 20, first: 40, second: 35, third: 40, short: 35, left: 100, center: 85, right: 80 } },
    { id: 16, name: '外野手控え', position: 'right', isStarter: false, battingOrder: 0,
      batting: { meet: 52, power: 58, eye: 50, bats: 'right', steal: 48 },
      physical: { speed: 62, arm: 75, throws: 'right' }, fielding: { defense: 68 }, catching: { lead: 38 },
      pitching: { velocity: 135, control: 45, stamina: 90, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'cutter', level: 35 }] },
      positionFitness: { pitcher: 20, catcher: 20, first: 40, second: 35, third: 40, short: 35, left: 80, center: 85, right: 100 } },
    { id: 17, name: '控え捕手', position: 'catcher', isStarter: false, battingOrder: 0,
      batting: { meet: 50, power: 48, eye: 58, bats: 'right', steal: 20 },
      physical: { speed: 35, arm: 70, throws: 'right' }, fielding: { defense: 65 }, catching: { lead: 65 },
      pitching: { velocity: 115, control: 48, stamina: 60, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 28 }] },
      positionFitness: { pitcher: 30, catcher: 100, first: 25, second: 25, third: 25, short: 25, left: 20, center: 20, right: 20 } },
    // 控え投手（9-17番）
    { id: 18, name: 'セットアッパー', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 30, power: 25, eye: 40, bats: 'right', steal: 15 },
      physical: { speed: 40, arm: 50, throws: 'right' }, fielding: { defense: 50 }, catching: { lead: 45 },
      pitching: { velocity: 148, control: 68, stamina: 100, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 75 }, { id: 3, type: 'fork', level: 60 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 } },
    { id: 19, name: 'クローザー', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 28, power: 22, eye: 38, bats: 'right', steal: 12 },
      physical: { speed: 38, arm: 48, throws: 'right' }, fielding: { defense: 48 }, catching: { lead: 42 },
      pitching: { velocity: 152, control: 72, stamina: 80, form: 'overhand',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 80 }, { id: 3, type: 'splitter', level: 70 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 } },
    { id: 20, name: '中継ぎ左腕', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 32, power: 28, eye: 42, bats: 'left', steal: 18 },
      physical: { speed: 42, arm: 52, throws: 'left' }, fielding: { defense: 52 }, catching: { lead: 48 },
      pitching: { velocity: 140, control: 62, stamina: 90, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 65 }, { id: 3, type: 'changeup', level: 55 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 } },
    { id: 21, name: 'ロングリリーフ', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 35, power: 30, eye: 45, bats: 'right', steal: 16 },
      physical: { speed: 42, arm: 50, throws: 'right' }, fielding: { defense: 54 }, catching: { lead: 50 },
      pitching: { velocity: 138, control: 58, stamina: 150, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 60 }, { id: 3, type: 'curve', level: 50 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 } },
    { id: 22, name: 'サイド右腕', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 30, power: 26, eye: 40, bats: 'right', steal: 14 },
      physical: { speed: 40, arm: 48, throws: 'right' }, fielding: { defense: 50 }, catching: { lead: 44 },
      pitching: { velocity: 135, control: 65, stamina: 85, form: 'sidearm',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 70 }, { id: 3, type: 'shoot', level: 65 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 } },
    { id: 23, name: 'アンダー投手', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 28, power: 24, eye: 38, bats: 'right', steal: 12 },
      physical: { speed: 38, arm: 46, throws: 'right' }, fielding: { defense: 48 }, catching: { lead: 42 },
      pitching: { velocity: 128, control: 68, stamina: 95, form: 'submarine',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 75 }, { id: 3, type: 'curve', level: 60 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 } },
    { id: 24, name: '先発候補', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 38, power: 32, eye: 48, bats: 'right', steal: 18 },
      physical: { speed: 44, arm: 52, throws: 'right' }, fielding: { defense: 56 }, catching: { lead: 52 },
      pitching: { velocity: 142, control: 62, stamina: 160, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 65 }, { id: 3, type: 'fork', level: 55 }, { id: 4, type: 'changeup', level: 50 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 } }
    // 合計: 控え野手8人 + 控え投手7人 = 15人（スタメン9人と合わせて24人）
  ].map(p => ({ ...p, stats: p.stats || createPlayerStats() }));
};

/**
 * アウェイチーム用の控え選手を生成
 */
export const createAwayBench = () => {
  return [
    // 控え野手（1-8番）
    { id: 10, name: '代打職人', position: 'first', isStarter: false, battingOrder: 0,
      batting: { meet: 68, power: 72, eye: 58, bats: 'left', steal: 28 },
      physical: { speed: 48, arm: 58, throws: 'left' }, fielding: { defense: 58 }, catching: { lead: 38 },
      pitching: { velocity: 122, control: 42, stamina: 72, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 28 }] },
      positionFitness: { pitcher: 25, catcher: 30, first: 100, second: 55, third: 50, short: 50, left: 40, center: 30, right: 40 } },
    { id: 11, name: '内野控え', position: 'second', isStarter: false, battingOrder: 0,
      batting: { meet: 58, power: 38, eye: 62, bats: 'right', steal: 58 },
      physical: { speed: 68, arm: 68, throws: 'right' }, fielding: { defense: 82 }, catching: { lead: 42 },
      pitching: { velocity: 128, control: 48, stamina: 78, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'changeup', level: 28 }] },
      positionFitness: { pitcher: 25, catcher: 30, first: 55, second: 100, third: 55, short: 65, left: 40, center: 35, right: 40 } },
    { id: 12, name: '快足選手', position: 'center', isStarter: false, battingOrder: 0,
      batting: { meet: 62, power: 32, eye: 68, bats: 'right', steal: 88 },
      physical: { speed: 92, arm: 52, throws: 'right' }, fielding: { defense: 72 }, catching: { lead: 32 },
      pitching: { velocity: 120, control: 40, stamina: 68, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'curve', level: 22 }] },
      positionFitness: { pitcher: 20, catcher: 20, first: 35, second: 35, third: 35, short: 35, left: 85, center: 100, right: 85 } },
    { id: 13, name: '万能選手', position: 'short', isStarter: false, battingOrder: 0,
      batting: { meet: 62, power: 58, eye: 62, bats: 'switch', steal: 52 },
      physical: { speed: 62, arm: 72, throws: 'right' }, fielding: { defense: 68 }, catching: { lead: 48 },
      pitching: { velocity: 132, control: 50, stamina: 82, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 32 }] },
      positionFitness: { pitcher: 25, catcher: 30, first: 50, second: 65, third: 60, short: 100, left: 40, center: 35, right: 40 } },
    { id: 14, name: 'ルーキー', position: 'third', isStarter: false, battingOrder: 0,
      batting: { meet: 55, power: 65, eye: 50, bats: 'right', steal: 42 },
      physical: { speed: 55, arm: 65, throws: 'right' }, fielding: { defense: 60 }, catching: { lead: 38 },
      pitching: { velocity: 128, control: 40, stamina: 82, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'fork', level: 25 }] },
      positionFitness: { pitcher: 25, catcher: 30, first: 50, second: 55, third: 100, short: 60, left: 45, center: 35, right: 45 } },
    { id: 15, name: '外野控え1', position: 'left', isStarter: false, battingOrder: 0,
      batting: { meet: 60, power: 52, eye: 65, bats: 'left', steal: 38 },
      physical: { speed: 48, arm: 58, throws: 'left' }, fielding: { defense: 60 }, catching: { lead: 52 },
      pitching: { velocity: 125, control: 52, stamina: 72, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'changeup', level: 30 }] },
      positionFitness: { pitcher: 20, catcher: 20, first: 40, second: 35, third: 40, short: 35, left: 100, center: 85, right: 80 } },
    { id: 16, name: '外野控え2', position: 'right', isStarter: false, battingOrder: 0,
      batting: { meet: 54, power: 60, eye: 52, bats: 'right', steal: 50 },
      physical: { speed: 65, arm: 78, throws: 'right' }, fielding: { defense: 70 }, catching: { lead: 40 },
      pitching: { velocity: 138, control: 48, stamina: 92, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'cutter', level: 38 }] },
      positionFitness: { pitcher: 20, catcher: 20, first: 40, second: 35, third: 40, short: 35, left: 80, center: 85, right: 100 } },
    { id: 17, name: '第二捕手', position: 'catcher', isStarter: false, battingOrder: 0,
      batting: { meet: 52, power: 50, eye: 60, bats: 'right', steal: 18 },
      physical: { speed: 38, arm: 72, throws: 'right' }, fielding: { defense: 68 }, catching: { lead: 68 },
      pitching: { velocity: 118, control: 50, stamina: 62, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 30 }] },
      positionFitness: { pitcher: 30, catcher: 100, first: 25, second: 25, third: 25, short: 25, left: 20, center: 20, right: 20 } },
    // 控え投手（9-17番）
    { id: 18, name: '勝利の方程式', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 32, power: 28, eye: 42, bats: 'right', steal: 16 },
      physical: { speed: 42, arm: 52, throws: 'right' }, fielding: { defense: 52 }, catching: { lead: 48 },
      pitching: { velocity: 150, control: 70, stamina: 102, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 78 }, { id: 3, type: 'fork', level: 62 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 } },
    { id: 19, name: '守護神', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 30, power: 25, eye: 40, bats: 'right', steal: 14 },
      physical: { speed: 40, arm: 50, throws: 'right' }, fielding: { defense: 50 }, catching: { lead: 44 },
      pitching: { velocity: 155, control: 75, stamina: 82, form: 'overhand',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 82 }, { id: 3, type: 'splitter', level: 72 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 } },
    { id: 20, name: '左の中継ぎ', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 34, power: 30, eye: 44, bats: 'left', steal: 20 },
      physical: { speed: 44, arm: 54, throws: 'left' }, fielding: { defense: 54 }, catching: { lead: 50 },
      pitching: { velocity: 142, control: 64, stamina: 92, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 68 }, { id: 3, type: 'changeup', level: 58 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 } },
    { id: 21, name: 'イニングイーター', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 36, power: 32, eye: 46, bats: 'right', steal: 18 },
      physical: { speed: 44, arm: 52, throws: 'right' }, fielding: { defense: 56 }, catching: { lead: 52 },
      pitching: { velocity: 140, control: 60, stamina: 155, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 62 }, { id: 3, type: 'curve', level: 52 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 } },
    { id: 22, name: 'サイド左腕', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 32, power: 28, eye: 42, bats: 'left', steal: 16 },
      physical: { speed: 42, arm: 50, throws: 'left' }, fielding: { defense: 52 }, catching: { lead: 46 },
      pitching: { velocity: 132, control: 66, stamina: 88, form: 'sidearm',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 72 }, { id: 3, type: 'shoot', level: 68 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 } },
    { id: 23, name: 'サブマリン', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 30, power: 26, eye: 40, bats: 'right', steal: 14 },
      physical: { speed: 40, arm: 48, throws: 'right' }, fielding: { defense: 50 }, catching: { lead: 44 },
      pitching: { velocity: 130, control: 70, stamina: 98, form: 'submarine',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'sinker', level: 78 }, { id: 3, type: 'curve', level: 62 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 } },
    { id: 24, name: '若手先発', position: 'pitcher', isStarter: false, battingOrder: 0,
      batting: { meet: 40, power: 34, eye: 50, bats: 'right', steal: 20 },
      physical: { speed: 46, arm: 54, throws: 'right' }, fielding: { defense: 58 }, catching: { lead: 54 },
      pitching: { velocity: 144, control: 64, stamina: 165, form: 'threeQuarter',
        arsenal: [{ id: 1, type: 'straight', level: 100 }, { id: 2, type: 'slider', level: 68 }, { id: 3, type: 'fork', level: 58 }, { id: 4, type: 'changeup', level: 52 }] },
      positionFitness: { pitcher: 100, catcher: 25, first: 20, second: 20, third: 20, short: 20, left: 20, center: 20, right: 20 } }
    // 合計: 控え野手8人 + 控え投手7人 = 15人（スタメン9人と合わせて24人）
  ].map(p => ({ ...p, stats: p.stats || createPlayerStats() }));
};

// ES module exports
