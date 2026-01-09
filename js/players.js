// ============================================================
// 選手データ - players.js
// デフォルト選手データと成績初期化関数
// ============================================================

/**
 * 選手の成績初期値を作成
 */
const createPlayerStats = () => ({
  batting: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0 },
  pitching: { outs: 0, runsAllowed: 0, strikeouts: 0, walks: 0, pitches: 0 }
});

/**
 * ホームチーム用のデフォルト選手を生成
 */
const createDefaultPlayers = () => {
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 30 }
        ]
      },
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'changeup', level: 40 }
        ]
      }
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 35 }
        ]
      }
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'fork', level: 30 }
        ]
      }
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 35 }
        ]
      }
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'curve', level: 35 }
        ]
      }
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 40 }
        ]
      }
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'sinker', level: 30 }
        ]
      }
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 70 },
          { id: 3, type: 'curve', level: 50 },
          { id: 4, type: 'fork', level: 60 }
        ]
      }
    }
  ].map(p => ({ ...p, stats: p.stats || createPlayerStats() }));
};

/**
 * アウェイチーム用のデフォルト選手を生成
 */
const createAwayPlayers = () => {
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'changeup', level: 35 }
        ]
      }
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 40 }
        ]
      }
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'sinker', level: 30 }
        ]
      }
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'fork', level: 35 }
        ]
      }
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 30 }
        ]
      }
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'cutter', level: 40 }
        ]
      }
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'curve', level: 25 }
        ]
      }
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
        arsenal: [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 75 },
          { id: 3, type: 'fork', level: 65 },
          { id: 4, type: 'curve', level: 55 }
        ]
      }
    }
  ].map(p => ({ ...p, stats: p.stats || createPlayerStats() }));
};
