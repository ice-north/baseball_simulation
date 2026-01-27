// ============================================================
// 年間進行システム - yearProgressionSystem.js
// シーズン終了処理、年度更新、引退、解雇
// ============================================================

import { createSeasonData, initializeStandings } from './seasonManager.js';

/**
 * シーズン終了処理
 * @param {Object} seasonData - シーズンデータ
 * @param {Object} allTeams - 全チームデータ
 * @returns {Object} - 表彰結果と統計
 */
export function processSeasonEnd(seasonData, allTeams) {
  const awards = {
    champion: null,           // 優勝チーム
    battingChampion: null,    // 首位打者
    homeRunKing: null,        // 本塁打王
    rbiKing: null,            // 打点王
    stolenBaseKing: null,     // 盗塁王
    eraChampion: null,        // 最優秀防御率
    winsLeader: null,         // 最多勝
    savesLeader: null,        // 最多セーブ
    strikeoutKing: null       // 最多奪三振
  };

  // 優勝チーム確定
  if (seasonData.standings && seasonData.standings.length > 0) {
    const sortedStandings = [...seasonData.standings].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      return b.winRate - a.winRate;
    });
    awards.champion = sortedStandings[0].team;
  }

  // 個人タイトル集計
  const allPlayers = [];
  Object.entries(allTeams).forEach(([teamName, team]) => {
    team.players.forEach(player => {
      allPlayers.push({
        ...player,
        teamName: teamName
      });
    });
  });

  // 打撃タイトル
  const qualifiedBatters = allPlayers.filter(p =>
    p.seasonStats.batting.atBats >= 100
  );

  if (qualifiedBatters.length > 0) {
    // 首位打者（最高打率）
    const battingLeader = qualifiedBatters.reduce((best, p) => {
      const avg = p.seasonStats.batting.atBats > 0
        ? p.seasonStats.batting.hits / p.seasonStats.batting.atBats
        : 0;
      const bestAvg = best.seasonStats.batting.atBats > 0
        ? best.seasonStats.batting.hits / best.seasonStats.batting.atBats
        : 0;
      return avg > bestAvg ? p : best;
    });
    awards.battingChampion = {
      name: battingLeader.name,
      team: battingLeader.teamName,
      avg: (battingLeader.seasonStats.batting.hits / battingLeader.seasonStats.batting.atBats).toFixed(3)
    };

    // 本塁打王
    const hrLeader = qualifiedBatters.reduce((best, p) =>
      p.seasonStats.batting.homeruns > best.seasonStats.batting.homeruns ? p : best
    );
    awards.homeRunKing = {
      name: hrLeader.name,
      team: hrLeader.teamName,
      homeruns: hrLeader.seasonStats.batting.homeruns
    };

    // 打点王
    const rbiLeader = qualifiedBatters.reduce((best, p) =>
      p.seasonStats.batting.rbis > best.seasonStats.batting.rbis ? p : best
    );
    awards.rbiKing = {
      name: rbiLeader.name,
      team: rbiLeader.teamName,
      rbis: rbiLeader.seasonStats.batting.rbis
    };

    // 盗塁王
    const sbLeader = qualifiedBatters.reduce((best, p) =>
      p.seasonStats.batting.stolenBases > best.seasonStats.batting.stolenBases ? p : best
    );
    awards.stolenBaseKing = {
      name: sbLeader.name,
      team: sbLeader.teamName,
      stolenBases: sbLeader.seasonStats.batting.stolenBases
    };
  }

  // 投手タイトル
  const qualifiedPitchers = allPlayers.filter(p =>
    p.seasonStats.pitching.inningsPitched >= 30
  );

  if (qualifiedPitchers.length > 0) {
    // 最優秀防御率
    const eraLeader = qualifiedPitchers.reduce((best, p) => {
      const era = p.seasonStats.pitching.inningsPitched > 0
        ? (p.seasonStats.pitching.earnedRuns * 27) / p.seasonStats.pitching.inningsPitched
        : 99.99;
      const bestEra = best.seasonStats.pitching.inningsPitched > 0
        ? (best.seasonStats.pitching.earnedRuns * 27) / best.seasonStats.pitching.inningsPitched
        : 99.99;
      return era < bestEra ? p : best;
    });
    const era = (eraLeader.seasonStats.pitching.earnedRuns * 27) / eraLeader.seasonStats.pitching.inningsPitched;
    awards.eraChampion = {
      name: eraLeader.name,
      team: eraLeader.teamName,
      era: era.toFixed(2)
    };

    // 最多勝
    const winsLeader = qualifiedPitchers.reduce((best, p) =>
      p.seasonStats.pitching.wins > best.seasonStats.pitching.wins ? p : best
    );
    awards.winsLeader = {
      name: winsLeader.name,
      team: winsLeader.teamName,
      wins: winsLeader.seasonStats.pitching.wins
    };

    // 最多セーブ
    const savesLeader = allPlayers.reduce((best, p) =>
      p.seasonStats.pitching.saves > best.seasonStats.pitching.saves ? p : best
    );
    if (savesLeader.seasonStats.pitching.saves > 0) {
      awards.savesLeader = {
        name: savesLeader.name,
        team: savesLeader.teamName,
        saves: savesLeader.seasonStats.pitching.saves
      };
    }

    // 最多奪三振
    const soLeader = qualifiedPitchers.reduce((best, p) =>
      p.seasonStats.pitching.strikeouts > best.seasonStats.pitching.strikeouts ? p : best
    );
    awards.strikeoutKing = {
      name: soLeader.name,
      team: soLeader.teamName,
      strikeouts: soLeader.seasonStats.pitching.strikeouts
    };
  }

  return awards;
};

/**
 * 全選手の年齢を1歳増やす
 * @param {Object} allTeams - 全チームデータ
 * @returns {Object} - 更新されたチームデータ
 */
export function updateAllPlayerAges(allTeams) {
  const updatedTeams = {};

  Object.entries(allTeams).forEach(([teamName, team]) => {
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => ({
        ...player,
        age: (player.age || 20) + 1
      }))
    };
  });

  return updatedTeams;
};

/**
 * 引退・殿堂入り判定
 * @param {Object} player - 選手データ
 * @returns {Object} - { shouldRetire: boolean, hallOfFame: boolean, reason: string }
 */
export function checkRetirement(player) {
  const age = player.age || 20;
  const isPitcher = player.position === 'pitcher';

  // 通算成績
  const careerGames = player.careerStats.batting.games + player.careerStats.pitching.games;
  const careerHits = player.careerStats.batting.hits;
  const careerHomeruns = player.careerStats.batting.homeruns;
  const careerWins = player.careerStats.pitching.wins;

  // 殿堂入り基準（独立リーグ設定）
  let hallOfFame = false;
  let reason = '';

  if (isPitcher) {
    // 投手: 100勝以上で殿堂入り
    if (careerWins >= 100) {
      hallOfFame = true;
      reason = `通算${careerWins}勝の名投手`;
    }
  } else {
    // 野手: 1000本安打または200本塁打で殿堂入り
    if (careerHits >= 1000) {
      hallOfFame = true;
      reason = `通算${careerHits}安打の名選手`;
    } else if (careerHomeruns >= 200) {
      hallOfFame = true;
      reason = `通算${careerHomeruns}本塁打の強打者`;
    }
  }

  // 引退判定
  let shouldRetire = false;

  // 1. 40歳以上は必ず引退
  if (age >= 40) {
    shouldRetire = true;
    if (!reason) reason = '年齢による引退';
  }
  // 2. 35歳以上で成績不振
  else if (age >= 35) {
    const recentGames = player.seasonStats.batting.games + player.seasonStats.pitching.games;
    if (recentGames < 10) {
      shouldRetire = true;
      if (!reason) reason = '出場機会減少のため引退';
    }
  }
  // 3. ランダム引退（30歳以上で5%）
  else if (age >= 30 && Math.random() < 0.05) {
    shouldRetire = true;
    if (!reason) reason = '自己都合による引退';
  }

  return { shouldRetire, hallOfFame, reason };
};

/**
 * 全チームの引退処理
 * @param {Object} allTeams - 全チームデータ
 * @returns {Object} - { updatedTeams, retirements }
 */
export function processRetirements(allTeams) {
  const updatedTeams = {};
  const retirements = [];

  Object.entries(allTeams).forEach(([teamName, team]) => {
    const remainingPlayers = [];

    team.players.forEach(player => {
      const { shouldRetire, hallOfFame, reason } = checkRetirement(player);

      if (shouldRetire) {
        retirements.push({
          name: player.name,
          team: teamName,
          age: player.age,
          position: player.position,
          hallOfFame,
          reason,
          careerStats: player.careerStats
        });
      } else {
        remainingPlayers.push(player);
      }
    });

    updatedTeams[teamName] = {
      ...team,
      players: remainingPlayers
    };
  });

  return { updatedTeams, retirements };
};

/**
 * 選手解雇
 * @param {Object} team - チームデータ
 * @param {number} playerId - 解雇する選手のID
 * @returns {Object} - 更新されたチームデータ
 */
export function releasePlayer(team, playerId) {
  return {
    ...team,
    players: team.players.filter(p => p.id !== playerId)
  };
};

/**
 * シーズン統計をリセット
 * @param {Object} allTeams - 全チームデータ
 * @returns {Object} - 更新されたチームデータ
 */
export function resetSeasonStats(allTeams) {
  const updatedTeams = {};

  Object.entries(allTeams).forEach(([teamName, team]) => {
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => {
        // シーズン成績を通算成績に加算
        const updatedCareerBatting = {
          games: player.careerStats.batting.games + player.seasonStats.batting.games,
          atBats: player.careerStats.batting.atBats + player.seasonStats.batting.atBats,
          hits: player.careerStats.batting.hits + player.seasonStats.batting.hits,
          doubles: player.careerStats.batting.doubles + player.seasonStats.batting.doubles,
          triples: player.careerStats.batting.triples + player.seasonStats.batting.triples,
          homeruns: player.careerStats.batting.homeruns + player.seasonStats.batting.homeruns,
          rbis: player.careerStats.batting.rbis + player.seasonStats.batting.rbis,
          walks: player.careerStats.batting.walks + player.seasonStats.batting.walks,
          strikeouts: player.careerStats.batting.strikeouts + player.seasonStats.batting.strikeouts,
          stolenBases: player.careerStats.batting.stolenBases + player.seasonStats.batting.stolenBases
        };

        const updatedCareerPitching = {
          games: player.careerStats.pitching.games + player.seasonStats.pitching.games,
          wins: player.careerStats.pitching.wins + player.seasonStats.pitching.wins,
          losses: player.careerStats.pitching.losses + player.seasonStats.pitching.losses,
          saves: player.careerStats.pitching.saves + player.seasonStats.pitching.saves,
          holds: player.careerStats.pitching.holds + player.seasonStats.pitching.holds,
          inningsPitched: player.careerStats.pitching.inningsPitched + player.seasonStats.pitching.inningsPitched,
          runsAllowed: player.careerStats.pitching.runsAllowed + player.seasonStats.pitching.runsAllowed,
          earnedRuns: player.careerStats.pitching.earnedRuns + player.seasonStats.pitching.earnedRuns,
          hits: player.careerStats.pitching.hits + player.seasonStats.pitching.hits,
          homeruns: player.careerStats.pitching.homeruns + player.seasonStats.pitching.homeruns,
          walks: player.careerStats.pitching.walks + player.seasonStats.pitching.walks,
          strikeouts: player.careerStats.pitching.strikeouts + player.seasonStats.pitching.strikeouts,
          pitches: player.careerStats.pitching.pitches + player.seasonStats.pitching.pitches
        };

        // シーズン成績をリセット
        return {
          ...player,
          careerStats: {
            batting: updatedCareerBatting,
            pitching: updatedCareerPitching
          },
          seasonStats: {
            batting: { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 },
            pitching: { games: 0, wins: 0, losses: 0, saves: 0, holds: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0, hits: 0, homeruns: 0, walks: 0, strikeouts: 0, pitches: 0 }
          }
        };
      })
    };
  });

  return updatedTeams;
};

/**
 * タイトル獲得記録を選手に追加
 * @param {Object} allTeams - 全チームデータ
 * @param {Object} awards - 表彰結果
 * @returns {Object} - 更新されたチームデータ
 */
export function recordAwardsToPlayers(allTeams, awards) {
  const updatedTeams = {};

  Object.entries(allTeams).forEach(([teamName, team]) => {
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => {
        const achievements = [...(player.professionalCareer?.achievements || [])];

        // 各タイトルをチェック
        if (awards.battingChampion?.name === player.name) {
          achievements.push({ year: 0, title: '首位打者' }); // yearは後で設定
        }
        if (awards.homeRunKing?.name === player.name) {
          achievements.push({ year: 0, title: '本塁打王' });
        }
        if (awards.rbiKing?.name === player.name) {
          achievements.push({ year: 0, title: '打点王' });
        }
        if (awards.stolenBaseKing?.name === player.name) {
          achievements.push({ year: 0, title: '盗塁王' });
        }
        if (awards.eraChampion?.name === player.name) {
          achievements.push({ year: 0, title: '最優秀防御率' });
        }
        if (awards.winsLeader?.name === player.name) {
          achievements.push({ year: 0, title: '最多勝' });
        }
        if (awards.savesLeader?.name === player.name) {
          achievements.push({ year: 0, title: '最多セーブ' });
        }
        if (awards.strikeoutKing?.name === player.name) {
          achievements.push({ year: 0, title: '最多奪三振' });
        }

        return {
          ...player,
          professionalCareer: {
            ...(player.professionalCareer || {}),
            achievements
          }
        };
      })
    };
  });

  return updatedTeams;
};

/**
 * 次年度への完全移行
 * @param {Object} seasonData - 現在のシーズンデータ
 * @param {Object} allTeams - 全チームデータ
 * @returns {Object} - { newSeasonData, updatedTeams, awards, retirements }
 */
export function advanceToNextYear(seasonData, allTeams) {
  // 1. シーズン終了処理（表彰）
  const awards = processSeasonEnd(seasonData, allTeams);

  // 2. タイトルを選手に記録
  let updatedTeams = recordAwardsToPlayers(allTeams, awards);

  // 3. シーズン統計を通算に加算してリセット
  updatedTeams = resetSeasonStats(updatedTeams);

  // 4. 選手の年齢を更新
  updatedTeams = updateAllPlayerAges(updatedTeams);

  // 5. 引退処理
  const { updatedTeams: teamsAfterRetirement, retirements } = processRetirements(updatedTeams);

  // 6. 新シーズンデータ作成
  const newYear = seasonData.year + 1;
  const newSeasonData = createSeasonData(newYear);
  newSeasonData.settings = { ...seasonData.settings };

  // スケジュール生成
  const teams = Object.keys(teamsAfterRetirement);
  const schedule = generateFullSeasonSchedule({
    teams,
    gamesPerSeason: newSeasonData.settings.gamesPerSeason,
    startDate: { year: 2024 + newYear, month: 3, day: 1 },
    endDate: { year: 2024 + newYear, month: 9, day: 30 }
  });

  newSeasonData.schedule = schedule;
  newSeasonData.standings = initializeStandings(teams);

  return {
    newSeasonData,
    updatedTeams: teamsAfterRetirement,
    awards,
    retirements
  };
};

// ============================================================
// キャンプ練習システム（経験値→成長）
// ============================================================

/**
 * 練習メニュー定義
 * 各練習メニューは特定の能力値を成長させる
 */
export const TRAINING_MENUS = {
  batting: {
    name: '打撃練習',
    icon: '🏏',
    description: 'ミート・パワーを強化',
    targets: ['meet', 'power'],
    category: 'batting'
  },
  baserunning: {
    name: '走塁練習',
    icon: '🏃',
    description: '走力・盗塁を強化',
    targets: ['speed', 'steal'],
    category: 'batting'
  },
  fielding: {
    name: '守備練習',
    icon: '🧤',
    description: '守備力・肩力を強化',
    targets: ['defense', 'arm'],
    category: 'fielding'
  },
  stamina: {
    name: 'スタミナ練習',
    icon: '💪',
    description: '投手スタミナを強化',
    targets: ['stamina'],
    category: 'pitching'
  },
  control: {
    name: '制球練習',
    icon: '🎯',
    description: '制球力を強化',
    targets: ['control'],
    category: 'pitching'
  },
  velocity: {
    name: '球速練習',
    icon: '⚡',
    description: '球速を強化（投手のみ）',
    targets: ['velocity'],
    category: 'pitching'
  },
  eye: {
    name: '選球眼練習',
    icon: '👁️',
    description: '選球眼を強化',
    targets: ['eye'],
    category: 'batting'
  }
};

/**
 * シーズン終了時に経験値を集計
 * 投手: 登板数 + 投球回数
 * 野手: 出場試合数 + 打席数/3
 * フル稼働で年間約250ポイント
 * @param {Object} player - 選手データ
 */
export function calculateSeasonExperience(player) {
  const pitchingStats = player.seasonStats?.pitching || {};
  const battingStats = player.seasonStats?.batting || {};

  const pitcherExp = (pitchingStats.games || 0) + Math.floor(pitchingStats.inningsPitched || 0);
  const batterExp = (battingStats.games || 0) + Math.floor((battingStats.atBats || 0) / 3);

  // 投手はピッチング経験を、野手はバッティング経験を採用
  const isPitcher = player.position === 'pitcher';
  return isPitcher ? pitcherExp : batterExp;
}

/**
 * 全選手の経験値を更新（シーズン終了時に呼ぶ）
 * @param {Object} allTeams - 全チームデータ
 */
export function updateAllPlayersExperience(allTeams) {
  const updatedTeams = {};

  Object.entries(allTeams).forEach(([teamName, team]) => {
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => {
        const gainedExp = calculateSeasonExperience(player);
        return {
          ...player,
          experience: (player.experience || 0) + gainedExp
        };
      })
    };
  });

  return updatedTeams;
}

/**
 * キャンプ練習を実行
 * @param {Object} player - 選手データ
 * @param {string} trainingType - 練習メニューのキー
 * @returns {Object} - 成長結果 { player, growthReport }
 */
export function executeCampTraining(player, trainingType) {
  const menu = TRAINING_MENUS[trainingType];
  if (!menu) {
    console.warn(`Unknown training type: ${trainingType}`);
    return { player, growthReport: [] };
  }

  const experience = player.experience || 0;
  const growthReport = [];
  let updatedPlayer = { ...player };

  // 各対象能力について成長判定
  menu.targets.forEach(targetStat => {
    // 1. 基本練習効果: 1-3ポイント
    const baseGrowth = Math.floor(Math.random() * 3) + 1;

    // 2. 集中練習効果: 1-4ポイント
    const focusGrowth = Math.floor(Math.random() * 4) + 1;

    // 3. 覚醒判定: 経験10につき1%の確率で爆発成長
    const awakeningChance = Math.floor(experience / 10);
    const isAwakening = Math.random() * 100 < awakeningChance;
    const awakeningGrowth = isAwakening ? Math.floor(Math.random() * 10) + 5 : 0; // 5-14ポイント

    const totalGrowth = baseGrowth + focusGrowth + awakeningGrowth;

    // 能力値を更新
    const statPath = getStatPath(targetStat);
    if (statPath) {
      const currentValue = getNestedValue(updatedPlayer, statPath) || 50;
      const newValue = Math.min(currentValue + totalGrowth, 99); // 最大99
      updatedPlayer = setNestedValue(updatedPlayer, statPath, newValue);

      growthReport.push({
        stat: targetStat,
        statName: getStatName(targetStat),
        before: currentValue,
        after: newValue,
        growth: newValue - currentValue,
        isAwakening: isAwakening
      });
    }
  });

  // 経験値を消費（練習に使った分の一部をリセット）
  updatedPlayer.experience = Math.floor(experience * 0.3); // 70%消費

  return { player: updatedPlayer, growthReport };
}

/**
 * チーム全体のキャンプ練習を実行
 * @param {Object} team - チームデータ
 * @param {Object} trainingAssignments - { playerId: trainingType } の形式
 * @returns {Object} - { updatedTeam, allReports }
 */
export function executeTeamCampTraining(team, trainingAssignments) {
  const allReports = [];
  const updatedPlayers = team.players.map(player => {
    const trainingType = trainingAssignments[player.id];
    if (!trainingType) {
      // 練習未指定の選手は自動選択
      const autoTraining = player.position === 'pitcher' ? 'stamina' : 'batting';
      const { player: trained, growthReport } = executeCampTraining(player, autoTraining);
      allReports.push({ player: trained, trainingType: autoTraining, growthReport });
      return trained;
    }

    const { player: trained, growthReport } = executeCampTraining(player, trainingType);
    allReports.push({ player: trained, trainingType, growthReport });
    return trained;
  });

  return {
    updatedTeam: { ...team, players: updatedPlayers },
    allReports
  };
}

// ヘルパー関数
function getStatPath(statKey) {
  const pathMap = {
    meet: 'batting.meet',
    power: 'batting.power',
    eye: 'batting.eye',
    steal: 'batting.steal',
    speed: 'physical.speed',
    arm: 'physical.arm',
    defense: 'fielding.defense',
    velocity: 'pitching.velocity',
    control: 'pitching.control',
    stamina: 'pitching.stamina'
  };
  return pathMap[statKey];
}

function getStatName(statKey) {
  const nameMap = {
    meet: 'ミート',
    power: 'パワー',
    eye: '選球眼',
    steal: '盗塁',
    speed: '走力',
    arm: '肩力',
    defense: '守備',
    velocity: '球速',
    control: '制球',
    stamina: 'スタミナ'
  };
  return nameMap[statKey] || statKey;
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => (o || {})[k], obj);
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const result = JSON.parse(JSON.stringify(obj));
  let current = result;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
  return result;
}
