// ============================================================
// トライアウトシステム - tryoutSystem.js
// 選手獲得システム（年次トライアウト、ドラフト）
// ============================================================

import { generateRandomPlayerName } from '../data/playerNames.js';

/**
 * トライアウト候補者を生成
 * @param {number} year - 年数（1年目は30人/チーム、2年目以降は15人/チーム）
 * @param {number} teamCount - チーム数
 * @returns {Array} トライアウト候補者の配列
 */
export function generateTryoutCandidates(year, teamCount) {
  const candidatesPerTeam = year === 1 ? 30 : 15;
  const totalCandidates = teamCount * candidatesPerTeam;
  const candidates = [];

  const fieldPositions = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];

  for (let i = 1; i <= totalCandidates; i++) {
    // 投手と野手を1:1の比率で生成
    const isPitcher = Math.random() < 0.5;
    const position = isPitcher ? 'pitcher' : fieldPositions[Math.floor(Math.random() * fieldPositions.length)];

    // ランダムな名前生成（選手名データベースから3000×3000の重み付き選択）
    const name = generateRandomPlayerName();

    const player = {
      id: i,
      name: name,
      age: Math.floor(Math.random() * 8) + 18,  // 18-25歳
      position: position,
      battingOrder: 0,
      isStarter: false,
      batting: {
        // 独立リーグ設定：能力値を全体的に低く
        meet: isPitcher ? Math.floor(Math.random() * 26) + 15 : Math.floor(Math.random() * 41) + 30,  // 投手15-40、野手30-70
        power: isPitcher ? Math.floor(Math.random() * 26) + 10 : Math.floor(Math.random() * 41) + 25, // 投手10-35、野手25-65
        eye: isPitcher ? Math.floor(Math.random() * 26) + 25 : Math.floor(Math.random() * 41) + 30,   // 投手25-50、野手30-70
        bats: Math.random() > 0.7 ? 'left' : Math.random() > 0.9 ? 'switch' : 'right',
        steal: isPitcher ? Math.floor(Math.random() * 16) + 10 : Math.floor(Math.random() * 51) + 20  // 投手10-25、野手20-70
      },
      physical: {
        speed: isPitcher ? Math.floor(Math.random() * 26) + 30 : Math.floor(Math.random() * 41) + 30, // 投手30-55、野手30-70
        arm: isPitcher ? Math.floor(Math.random() * 26) + 40 : Math.floor(Math.random() * 41) + 30,   // 投手40-65、野手30-70
        throws: Math.random() > 0.8 ? 'left' : 'right'
      },
      fielding: {
        defense: isPitcher ? Math.floor(Math.random() * 26) + 40 : Math.floor(Math.random() * 41) + 30 // 投手40-65、野手30-70
      },
      catching: {
        lead: position === 'catcher' ? Math.floor(Math.random() * 36) + 40 : Math.floor(Math.random() * 26) + 25 // 捕手40-75、その他25-50
      },
      pitching: {
        velocity: isPitcher ? Math.floor(Math.random() * 21) + 125 : Math.floor(Math.random() * 16) + 110, // 投手125-145、野手110-125
        control: isPitcher ? Math.floor(Math.random() * 31) + 40 : Math.floor(Math.random() * 26) + 30,    // 投手40-70、野手30-55
        stamina: isPitcher ? Math.floor(Math.random() * 61) + 100 : Math.floor(Math.random() * 41) + 50,   // 投手100-160、野手50-90
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
}

/**
 * ランダムな変化球を生成
 */
export const generateRandomArsenal = () => {
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
export const generatePositionFitness = (mainPosition) => {
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
export function calculatePlayerRank(player) {
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
export function generateSnakeDraftOrder(teams, rounds) {
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
 * ロスターの能力バランスを分析
 * @param {Array} roster - 現在のロスター（配列形式）
 * @returns {Object} 能力バランス分析結果
 */
export function analyzeRosterBalance(roster) {
  if (!roster || roster.length === 0) {
    return {
      pitchers: { count: 0, avgStamina: 0, avgVelocity: 0, avgControl: 0 },
      fielders: { count: 0, avgOffense: 0, avgDefense: 0, avgSpeed: 0 }
    };
  }

  const pitchers = roster.filter(p => p.position === 'pitcher');
  const fielders = roster.filter(p => p.position !== 'pitcher');

  // 投手分析
  const pitcherAnalysis = {
    count: pitchers.length,
    avgStamina: 0,
    avgVelocity: 0,
    avgControl: 0
  };

  if (pitchers.length > 0) {
    pitcherAnalysis.avgStamina = pitchers.reduce((sum, p) => sum + p.pitching.stamina, 0) / pitchers.length;
    pitcherAnalysis.avgVelocity = pitchers.reduce((sum, p) => sum + p.pitching.velocity, 0) / pitchers.length;
    pitcherAnalysis.avgControl = pitchers.reduce((sum, p) => sum + p.pitching.control, 0) / pitchers.length;
  }

  // 野手分析
  const fielderAnalysis = {
    count: fielders.length,
    avgOffense: 0,  // ミート + パワーの平均
    avgDefense: 0,
    avgSpeed: 0
  };

  if (fielders.length > 0) {
    fielderAnalysis.avgOffense = fielders.reduce((sum, p) => sum + (p.batting.meet + p.batting.power) / 2, 0) / fielders.length;
    fielderAnalysis.avgDefense = fielders.reduce((sum, p) => sum + p.fielding.defense, 0) / fielders.length;
    fielderAnalysis.avgSpeed = fielders.reduce((sum, p) => sum + p.physical.speed, 0) / fielders.length;
  }

  return {
    pitchers: pitcherAnalysis,
    fielders: fielderAnalysis
  };
}

/**
 * 選手の価値をロスターバランスを考慮してスコア化
 * @param {Object} player - 選手データ
 * @param {Object} rosterAnalysis - ロスター分析結果
 * @returns {number} 選手の価値スコア（高いほど優先）
 */
export function calculatePlayerValueScore(player, rosterAnalysis) {
  const rank = calculatePlayerRank(player);
  const rankScore = { S: 100, A: 80, B: 60, C: 40, D: 20 }[rank] || 0;
  let bonusScore = 0;

  if (player.position === 'pitcher') {
    const { avgStamina, avgVelocity, avgControl } = rosterAnalysis.pitchers;

    // スタミナが不足している場合、スタミナの高い投手にボーナス
    if (avgStamina < 120 && player.pitching.stamina >= 140) {
      bonusScore += 30;
    } else if (avgStamina < 130 && player.pitching.stamina >= 140) {
      bonusScore += 15;
    }

    // 球速が高い投手ばかりの場合、制球力の高い投手にボーナス
    if (avgVelocity >= 135 && player.pitching.control >= 60) {
      bonusScore += 20;
    }

    // 制球力が低い投手が多い場合、制球力の高い投手にボーナス
    if (avgControl < 50 && player.pitching.control >= 60) {
      bonusScore += 25;
    }

    // バランス型投手にもボーナス（全能力が平均以上）
    if (player.pitching.stamina >= 130 && player.pitching.velocity >= 135 && player.pitching.control >= 55) {
      bonusScore += 10;
    }

  } else {
    const { avgOffense, avgDefense, avgSpeed } = rosterAnalysis.fielders;

    // 打撃偏重チームの場合、守備・走力特化型にボーナス
    if (avgOffense >= 50) {
      if (player.fielding.defense >= 65) {
        bonusScore += 25; // 守備職人
      }
      if (player.physical.speed >= 65) {
        bonusScore += 20; // 俊足
      }
    }

    // 守備が弱いチームの場合、守備の良い選手にボーナス
    if (avgDefense < 45 && player.fielding.defense >= 60) {
      bonusScore += 20;
    }

    // 足が遅いチームの場合、俊足選手にボーナス
    if (avgSpeed < 45 && player.physical.speed >= 65) {
      bonusScore += 20;
    }

    // 打撃が弱いチームの場合、打撃の良い選手にボーナス
    if (avgOffense < 40) {
      const offense = (player.batting.meet + player.batting.power) / 2;
      if (offense >= 55) {
        bonusScore += 25;
      }
    }

    // 5ツール型選手にボーナス
    const offense = (player.batting.meet + player.batting.power) / 2;
    if (offense >= 55 && player.physical.speed >= 60 && player.fielding.defense >= 60) {
      bonusScore += 15; // バランス型
    }
  }

  return rankScore + bonusScore;
}

/**
 * AIチームの選手選択ロジック（改良版）
 * @param {Array} candidates - 残りの候補者
 * @param {Array} currentRoster - 現在のロスター（配列形式）
 * @returns {Object} 選択された選手
 */
export function selectPlayerForAI(candidates, currentRoster = []) {
  // ロスター配列をオブジェクトから配列に変換（後方互換性のため）
  let rosterArray = currentRoster;
  if (!Array.isArray(currentRoster)) {
    rosterArray = Object.values(currentRoster);
  }

  // ポジション別カウント
  const rosterCounts = {
    pitcher: 0,
    catcher: 0,
    infielder: 0,
    outfielder: 0
  };

  rosterArray.forEach(player => {
    if (player.position === 'pitcher') rosterCounts.pitcher++;
    else if (player.position === 'catcher') rosterCounts.catcher++;
    else if (['first', 'second', 'third', 'short'].includes(player.position)) rosterCounts.infielder++;
    else rosterCounts.outfielder++;
  });

  // ロスターの能力バランスを分析
  const rosterAnalysis = analyzeRosterBalance(rosterArray);

  // 優先ポジション設定（不足しているポジション）
  let preferredPositions = [];
  if (rosterCounts.pitcher < 10) preferredPositions.push('pitcher');
  if (rosterCounts.catcher < 2) preferredPositions.push('catcher');
  if (rosterCounts.infielder < 6) preferredPositions.push('first', 'second', 'third', 'short');
  if (rosterCounts.outfielder < 6) preferredPositions.push('left', 'center', 'right');

  // 全候補者に価値スコアを付与
  const scoredCandidates = candidates.map(player => ({
    ...player,
    valueScore: calculatePlayerValueScore(player, rosterAnalysis),
    isPreferredPosition: preferredPositions.includes(player.position)
  }));

  // ポジション優先度ボーナスを適用
  scoredCandidates.forEach(candidate => {
    if (candidate.isPreferredPosition) {
      // 不足ポジションには大きなボーナス
      if (rosterCounts[candidate.position === 'pitcher' ? 'pitcher' :
                       candidate.position === 'catcher' ? 'catcher' :
                       ['first', 'second', 'third', 'short'].includes(candidate.position) ? 'infielder' : 'outfielder'] === 0) {
        candidate.valueScore += 50; // 0人の場合は最優先
      } else {
        candidate.valueScore += 30; // 不足している場合
      }
    }
  });

  // スコアが高い順にソート
  scoredCandidates.sort((a, b) => b.valueScore - a.valueScore);

  // デバッグログ（トップ5を表示）
  if (scoredCandidates.length > 0) {
    console.log('🤖 AI選択 - トップ5候補:');
    scoredCandidates.slice(0, 5).forEach((c, i) => {
      const posName = {
        pitcher: '投手', catcher: '捕手', first: '一', second: '二',
        third: '三', short: '遊', left: '左', center: '中', right: '右'
      }[c.position];
      console.log(`  ${i+1}. ${c.name} (${posName}) - スコア:${c.valueScore.toFixed(1)}`);
    });
  }

  return scoredCandidates[0];
}
