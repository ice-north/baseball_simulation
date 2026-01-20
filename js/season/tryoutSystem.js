// ============================================================
// トライアウトシステム - tryoutSystem.js
// 選手獲得システム（年次トライアウト、ドラフト）
// ============================================================

/**
 * トライアウト候補者を生成
 * @param {number} year - 年数（1年目は30人/チーム、2年目以降は15人/チーム）
 * @param {number} teamCount - チーム数
 * @returns {Array} トライアウト候補者の配列
 */
window.generateTryoutCandidates = function(year, teamCount) {
  const candidatesPerTeam = year === 1 ? 30 : 15;
  const totalCandidates = teamCount * candidatesPerTeam;
  const candidates = [];

  const positions = ['pitcher', 'catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  const surnames = ['佐藤', '鈴木', '高橋', '田中', '渡辺', '伊藤', '山本', '中村', '小林', '加藤',
                    '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水'];
  const givenNames = ['太郎', '次郎', '三郎', '四郎', '健', '勇', '誠', '翔', '大輝', '隼人',
                      '翼', '颯', '陸', '蓮', '湊', '律', '奏', '樹', '海斗', '悠真'];

  for (let i = 1; i <= totalCandidates; i++) {
    const position = positions[Math.floor(Math.random() * positions.length)];
    const isPitcher = position === 'pitcher';

    // ランダムな名前生成
    const surname = surnames[Math.floor(Math.random() * surnames.length)];
    const givenName = givenNames[Math.floor(Math.random() * givenNames.length)];
    const name = `${surname} ${givenName}`;

    const player = {
      id: i,
      name: name,
      age: Math.floor(Math.random() * 8) + 18,  // 18-25歳
      position: position,
      battingOrder: 0,
      isStarter: false,
      batting: {
        meet: isPitcher ? Math.floor(Math.random() * 30) + 20 : Math.floor(Math.random() * 50) + 40,
        power: isPitcher ? Math.floor(Math.random() * 30) + 15 : Math.floor(Math.random() * 50) + 35,
        eye: isPitcher ? Math.floor(Math.random() * 30) + 30 : Math.floor(Math.random() * 50) + 40,
        bats: Math.random() > 0.7 ? 'left' : Math.random() > 0.9 ? 'switch' : 'right',
        steal: isPitcher ? Math.floor(Math.random() * 20) + 10 : Math.floor(Math.random() * 60) + 20
      },
      physical: {
        speed: isPitcher ? Math.floor(Math.random() * 30) + 35 : Math.floor(Math.random() * 50) + 40,
        arm: isPitcher ? Math.floor(Math.random() * 30) + 45 : Math.floor(Math.random() * 50) + 40,
        throws: Math.random() > 0.8 ? 'left' : 'right'
      },
      fielding: {
        defense: isPitcher ? Math.floor(Math.random() * 30) + 45 : Math.floor(Math.random() * 50) + 40
      },
      catching: {
        lead: position === 'catcher' ? Math.floor(Math.random() * 40) + 50 : Math.floor(Math.random() * 30) + 30
      },
      pitching: {
        velocity: isPitcher ? Math.floor(Math.random() * 25) + 135 : Math.floor(Math.random() * 20) + 115,
        control: isPitcher ? Math.floor(Math.random() * 40) + 50 : Math.floor(Math.random() * 30) + 35,
        stamina: isPitcher ? Math.floor(Math.random() * 80) + 120 : Math.floor(Math.random() * 50) + 50,
        form: ['overhand', 'threeQuarter', 'sidearm', 'submarine'][Math.floor(Math.random() * 4)],
        arsenal: isPitcher ? generateRandomArsenal() : [
          { id: 1, type: 'straight', level: 100 },
          { id: 2, type: 'slider', level: 50 }
        ]
      },
      positionFitness: generatePositionFitness(position),
      professionalCareer: {
        isDrafted: false,
        draftYear: null,
        draftTeam: null,
        achievements: []
      },
      seasonStats: {
        batting: { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 },
        pitching: { games: 0, wins: 0, losses: 0, saves: 0, holds: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0, hits: 0, homeruns: 0, walks: 0, strikeouts: 0, pitches: 0 }
      },
      careerStats: {
        batting: { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 },
        pitching: { games: 0, wins: 0, losses: 0, saves: 0, holds: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0, hits: 0, homeruns: 0, walks: 0, strikeouts: 0, pitches: 0 }
      }
    };

    candidates.push(player);
  }

  return candidates;
};

/**
 * ランダムな変化球を生成
 */
function generateRandomArsenal() {
  const pitchTypes = ['straight', 'twoSeam', 'slider', 'curve', 'fork', 'changeup',
                      'sinker', 'shoot', 'cutter', 'splitter', 'palm', 'knuckle'];
  const arsenalSize = Math.floor(Math.random() * 3) + 2; // 2-4種類
  const arsenal = [];
  const usedTypes = new Set();

  // ストレートは必ず含める
  arsenal.push({ id: 1, type: 'straight', level: 100 });
  usedTypes.add('straight');

  for (let i = 2; i <= arsenalSize; i++) {
    const availableTypes = pitchTypes.filter(t => !usedTypes.has(t));
    if (availableTypes.length === 0) break;

    const selectedType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
    const level = Math.floor(Math.random() * 50) + 50; // 50-100
    arsenal.push({ id: i, type: selectedType, level });
    usedTypes.add(selectedType);
  }

  return arsenal;
}

/**
 * ポジション適性を生成
 */
function generatePositionFitness(mainPosition) {
  const fitness = {
    pitcher: 30, catcher: 30, first: 30,
    second: 30, third: 30, short: 30,
    left: 30, center: 30, right: 30
  };

  // メインポジションは100
  fitness[mainPosition] = 100;

  // 隣接ポジションに適性を付与
  const positionGroups = {
    pitcher: [],
    catcher: ['first'],
    first: ['catcher', 'third'],
    second: ['short', 'third'],
    third: ['first', 'second', 'short'],
    short: ['second', 'third'],
    left: ['center', 'right'],
    center: ['left', 'right'],
    right: ['left', 'center']
  };

  if (positionGroups[mainPosition]) {
    positionGroups[mainPosition].forEach(adj => {
      fitness[adj] = Math.floor(Math.random() * 30) + 60; // 60-90
    });
  }

  return fitness;
}

/**
 * 選手の推薦ランクを計算（S/A/B/C/D）
 * @param {Object} player - 選手データ
 * @returns {string} - 'S', 'A', 'B', 'C', 'D'
 */
window.calculatePlayerRank = function(player) {
  const isPitcher = player.position === 'pitcher';
  let totalScore = 0;

  if (isPitcher) {
    // 投手評価: 球速、制球、スタミナ、変化球
    const velocityScore = (player.pitching.velocity - 130) * 2; // 130km/h基準
    const controlScore = player.pitching.control;
    const staminaScore = player.pitching.stamina / 2;
    const arsenalScore = player.pitching.arsenal.reduce((sum, pitch) => sum + pitch.level, 0) / player.pitching.arsenal.length;

    totalScore = (velocityScore * 0.3) + (controlScore * 0.25) + (staminaScore * 0.25) + (arsenalScore * 0.2);
  } else {
    // 野手評価: ミート、パワー、走力、守備、肩
    const meetScore = player.batting.meet;
    const powerScore = player.batting.power;
    const speedScore = player.physical.speed;
    const defenseScore = player.fielding.defense;
    const armScore = player.physical.arm;

    totalScore = (meetScore * 0.3) + (powerScore * 0.25) + (speedScore * 0.2) + (defenseScore * 0.15) + (armScore * 0.1);
  }

  // ランク判定
  if (totalScore >= 80) return 'S';
  if (totalScore >= 70) return 'A';
  if (totalScore >= 60) return 'B';
  if (totalScore >= 50) return 'C';
  return 'D';
};

/**
 * スネークドラフト順序を生成
 * @param {Array} teams - チーム名の配列（例: ['ユーザー', 'AI1', 'AI2', 'AI3']）
 * @param {number} rounds - ラウンド数
 * @returns {Array} ドラフト順序の配列
 */
window.generateSnakeDraftOrder = function(teams, rounds) {
  const draftOrder = [];

  for (let round = 0; round < rounds; round++) {
    if (round % 2 === 0) {
      // 偶数ラウンド: 通常順
      teams.forEach(team => draftOrder.push({ round: round + 1, team }));
    } else {
      // 奇数ラウンド: 逆順（スネークドラフト）
      [...teams].reverse().forEach(team => draftOrder.push({ round: round + 1, team }));
    }
  }

  return draftOrder;
};

/**
 * AIチームの選手選択ロジック
 * @param {Array} candidates - 残りの候補者
 * @param {Object} currentRoster - 現在のロスター
 * @returns {Object} 選択された選手
 */
window.selectPlayerForAI = function(candidates, currentRoster = {}) {
  // 必要なポジションを判定
  const rosterCounts = {
    pitcher: 0,
    catcher: 0,
    infielder: 0,  // first, second, third, short
    outfielder: 0  // left, center, right
  };

  Object.values(currentRoster).forEach(player => {
    if (player.position === 'pitcher') rosterCounts.pitcher++;
    else if (player.position === 'catcher') rosterCounts.catcher++;
    else if (['first', 'second', 'third', 'short'].includes(player.position)) rosterCounts.infielder++;
    else rosterCounts.outfielder++;
  });

  // 優先度設定（不足しているポジションを優先）
  let preferredPositions = [];
  if (rosterCounts.pitcher < 10) preferredPositions.push('pitcher');
  if (rosterCounts.catcher < 2) preferredPositions.push('catcher');
  if (rosterCounts.infielder < 6) preferredPositions.push('first', 'second', 'third', 'short');
  if (rosterCounts.outfielder < 6) preferredPositions.push('left', 'center', 'right');

  // ランクでフィルタ（S/A/Bを優先）
  const rankedCandidates = candidates.map(c => ({
    ...c,
    rank: window.calculatePlayerRank(c)
  }));

  const topCandidates = rankedCandidates.filter(c => ['S', 'A', 'B'].includes(c.rank));
  const pool = topCandidates.length > 0 ? topCandidates : rankedCandidates;

  // 優先ポジションから選択
  if (preferredPositions.length > 0) {
    const preferredCandidates = pool.filter(c => preferredPositions.includes(c.position));
    if (preferredCandidates.length > 0) {
      // ランクが高い順にソート
      preferredCandidates.sort((a, b) => {
        const rankOrder = { S: 5, A: 4, B: 3, C: 2, D: 1 };
        return rankOrder[b.rank] - rankOrder[a.rank];
      });
      return preferredCandidates[0];
    }
  }

  // 優先ポジションがない場合は最高ランクを選択
  pool.sort((a, b) => {
    const rankOrder = { S: 5, A: 4, B: 3, C: 2, D: 1 };
    return rankOrder[b.rank] - rankOrder[a.rank];
  });

  return pool[0];
};

console.log('✅ トライアウトシステム読み込み完了');
