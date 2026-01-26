// ============================================================
// トライアウトシステム - tryoutSystem.js
// 選手獲得システム（年次トライアウト、ドラフト）
// ============================================================

import { generateRandomPlayerName } from '../data/playerNames.js';

/**
 * 利き手を決定（リアルな分布）
 * - 右投右打: 50%
 * - 右投左打: 30%
 * - 左投左打: 15%
 * - 右投両打: 5%
 * - 左投右打: 0%（基本的に存在しない）
 */
function determineHandedness() {
  const rand = Math.random() * 100;
  if (rand < 50) {
    return { throws: 'right', bats: 'right' };
  } else if (rand < 80) {
    return { throws: 'right', bats: 'left' };
  } else if (rand < 95) {
    return { throws: 'left', bats: 'left' };
  } else {
    return { throws: 'right', bats: 'switch' };
  }
}

/**
 * 左投げ選手のポジションを決定
 * 左投げは投手、一塁手、外野手が99%、捕手は1%
 */
function getPositionForLeftHander() {
  const rand = Math.random() * 100;
  if (rand < 40) {
    return 'pitcher';
  } else if (rand < 55) {
    return 'first';
  } else if (rand < 70) {
    return 'left';
  } else if (rand < 85) {
    return 'center';
  } else if (rand < 99) {
    return 'right';
  } else {
    return 'catcher'; // 1%の確率で左投げ捕手
  }
}

/**
 * 一芸に秀でた選手タイプを生成
 */
function getSpecialistType() {
  const types = [
    'speedster',      // 俊足だが打撃弱い
    'slugger',        // パワーはあるが守備走塁弱い
    'defender',       // 守備の名手だが打撃弱い
    'contactHitter',  // ミートはいいがパワー無い
    'fireballer',     // 球速は速いがスタミナ制球弱い
    'controlPitcher', // 制球はいいが球速遅い
    'ironman',        // スタミナあるが球速制球弱い
  ];
  return types[Math.floor(Math.random() * types.length)];
}

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
    // 利き手を決定
    const handedness = determineHandedness();
    const throws = handedness.throws;
    const bats = handedness.bats;

    // 投手と野手を1:1の比率で生成（ただし左投げは制限あり）
    let isPitcher = Math.random() < 0.5;
    let position;

    if (throws === 'left') {
      // 左投げの場合、ポジションを制限
      position = getPositionForLeftHander();
      isPitcher = position === 'pitcher';
    } else {
      // 右投げの場合は自由にポジション決定
      position = isPitcher ? 'pitcher' : fieldPositions[Math.floor(Math.random() * fieldPositions.length)];
    }

    // 一芸に秀でた選手かどうか（20%の確率）
    const isSpecialist = Math.random() < 0.2;
    const specialistType = isSpecialist ? getSpecialistType() : null;

    // 投球フォームを先に決定（能力に影響するため）
    // オーバースロー45%、スリークォーター40%、サイドスロー10%、アンダースロー5%
    const formRand = Math.random() * 100;
    let pitchingForm;
    if (formRand < 45) {
      pitchingForm = 'overhand';
    } else if (formRand < 85) {
      pitchingForm = 'threeQuarter';
    } else if (formRand < 95) {
      pitchingForm = 'sidearm';
    } else {
      pitchingForm = 'submarine';
    }

    // ランダムな名前生成
    const name = generateRandomPlayerName();

    // 能力値生成（一芸選手の場合は特殊な分布）
    const abilities = generateAbilities(isPitcher, position, isSpecialist, specialistType, pitchingForm);

    const player = {
      id: i,
      name: name,
      age: Math.floor(Math.random() * 8) + 18,  // 18-25歳
      position: position,
      battingOrder: 0,
      isStarter: false,
      batting: {
        meet: abilities.meet,
        power: abilities.power,
        eye: abilities.eye,
        bats: bats,
        steal: abilities.steal
      },
      physical: {
        speed: abilities.speed,
        arm: abilities.arm,
        throws: throws
      },
      fielding: {
        defense: abilities.defense
      },
      catching: {
        lead: position === 'catcher' ? Math.floor(Math.random() * 36) + 40 : Math.floor(Math.random() * 26) + 25
      },
      pitching: {
        velocity: abilities.velocity,
        control: abilities.control,
        stamina: abilities.stamina,
        form: pitchingForm,
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
      fatigue: 0, // 疲労度（投げた球数分蓄積、1日20回復）
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
 * 能力値を生成（一芸選手対応、フォーム別球速調整）
 * 重要: 球速・ミート・パワーは一芸でも最大Aランク(79)まで
 */
function generateAbilities(isPitcher, position, isSpecialist, specialistType, pitchingForm) {
  // フォームによる球速・制球の調整
  // サイドスロー・アンダースローは球速-10、制球+15
  const isSideOrUnder = pitchingForm === 'sidearm' || pitchingForm === 'submarine';
  const velocityAdjust = isSideOrUnder ? -10 : 0;
  const controlAdjust = isSideOrUnder ? 15 : 0;

  // 通常の能力値範囲（平均+2ポイント調整済み、投手能力は-3調整）
  const normalAbilities = {
    // 野手能力
    meet: isPitcher ? randRange(20, 45) : randRange(35, 70),
    power: isPitcher ? randRange(15, 40) : randRange(30, 65),
    eye: isPitcher ? randRange(30, 55) : randRange(35, 75),
    steal: isPitcher ? randRange(15, 30) : randRange(25, 75),
    speed: isPitcher ? randRange(35, 60) : randRange(35, 75),
    arm: isPitcher ? randRange(45, 70) : randRange(35, 75),
    defense: isPitcher ? randRange(45, 70) : randRange(35, 75),
    // 投手能力（フォーム調整適用、-3調整済み）
    velocity: isPitcher ? Math.min(randRange(127, 147) + velocityAdjust, 152) : randRange(115, 130),
    control: isPitcher ? Math.min(randRange(42, 72) + controlAdjust, 87) : randRange(35, 60),
    stamina: isPitcher ? randRange(102, 162) : randRange(55, 95)
  };

  if (!isSpecialist) {
    return normalAbilities;
  }

  // 一芸に秀でた選手の能力調整
  // 注意: 球速・ミート・パワーの最大値は79（Aランク）
  switch (specialistType) {
    case 'speedster':
      // 俊足だが打撃弱い（+5調整済み）
      return {
        ...normalAbilities,
        speed: randRange(85, 99),
        steal: randRange(80, 95),
        meet: randRange(30, 50),
        power: randRange(20, 40),
        defense: randRange(60, 80)
      };

    case 'slugger':
      // パワーはあるが守備走塁弱い（パワー最大79、+5調整済み）
      return {
        ...normalAbilities,
        power: randRange(70, 79),  // 最大Aランク
        meet: randRange(45, 65),
        speed: randRange(25, 45),
        steal: randRange(15, 30),
        defense: randRange(30, 50),
        arm: randRange(40, 60)
      };

    case 'defender':
      // 守備の名手だが打撃弱い（+5調整済み）
      return {
        ...normalAbilities,
        defense: randRange(85, 99),
        arm: randRange(75, 90),
        meet: randRange(35, 55),
        power: randRange(25, 45),
        speed: randRange(55, 75)
      };

    case 'contactHitter':
      // ミートはいいがパワー無い（ミート最大79、+5調整済み）
      return {
        ...normalAbilities,
        meet: randRange(70, 79),  // 最大Aランク
        eye: randRange(75, 90),
        power: randRange(25, 45),
        speed: randRange(50, 70)
      };

    case 'fireballer':
      // 球速は速いがスタミナ制球弱い（投手用、-3調整済み）
      // 球速最大はフォーム調整後で最大152km/h（オーバー/スリークォーター）または142km/h（サイド/アンダー）
      if (isPitcher) {
        const baseVelocity = randRange(145, 154);
        return {
          ...normalAbilities,
          velocity: Math.min(baseVelocity + velocityAdjust, 152),  // 最大152
          control: Math.min(randRange(27, 47) + controlAdjust, 62),
          stamina: randRange(72, 102)
        };
      }
      return normalAbilities;

    case 'controlPitcher':
      // 制球はいいが球速遅い（投手用、-3調整済み）
      if (isPitcher) {
        return {
          ...normalAbilities,
          velocity: Math.max(randRange(122, 137) + velocityAdjust, 112),
          control: Math.min(randRange(77, 92) + controlAdjust, 99),
          stamina: randRange(112, 152)
        };
      }
      return normalAbilities;

    case 'ironman':
      // スタミナあるが球速制球弱い（投手用、-3調整済み）
      if (isPitcher) {
        return {
          ...normalAbilities,
          velocity: Math.min(randRange(127, 142) + velocityAdjust, 149),
          control: Math.min(randRange(37, 57) + controlAdjust, 72),
          stamina: randRange(172, 202)
        };
      }
      return normalAbilities;

    default:
      return normalAbilities;
  }
}

/**
 * 範囲内のランダム整数を生成
 */
function randRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
