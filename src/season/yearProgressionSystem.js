// ============================================================
// 年間進行システム - yearProgressionSystem.js
// シーズン終了処理、年度更新、引退、解雇
// 年齢カーブによる成長・衰退システム
// ============================================================

import { createSeasonData, initializeStandings } from './seasonManager.js';
import { generateFullSeasonSchedule } from './scheduleGenerator.js';

/**
 * チームから選手IDを除去した際にlineupSettings/pitchingRotationを清掃
 * @param {Object} team - チームデータ
 * @param {string} playerId - 除去された選手ID
 */
export function cleanupPlayerReferences(team, playerId) {
  // lineupSettings.battingOrderから除去
  if (team.lineupSettings?.battingOrder) {
    const idx = team.lineupSettings.battingOrder.findIndex(e => e.playerId === playerId);
    if (idx !== -1) {
      team.lineupSettings.battingOrder.splice(idx, 1);
    }
  }

  // pitchingRotationから除去
  const rotation = team.pitchingRotation;
  if (!rotation) return;

  if (rotation.starters) {
    const idx = rotation.starters.indexOf(playerId);
    if (idx !== -1) rotation.starters.splice(idx, 1);
  }
  if (rotation.closer === playerId) {
    rotation.closer = null;
  }
  if (rotation.setupMen) {
    const idx = rotation.setupMen.indexOf(playerId);
    if (idx !== -1) rotation.setupMen.splice(idx, 1);
  }
  if (rotation.middleRelievers) {
    const idx = rotation.middleRelievers.indexOf(playerId);
    if (idx !== -1) rotation.middleRelievers.splice(idx, 1);
  }
  // pitcherRolesマップからも除去
  if (rotation.pitcherRoles) {
    delete rotation.pitcherRoles[playerId];
  }
  // reliefFatigueからも除去
  if (rotation.reliefFatigue) {
    delete rotation.reliefFatigue[playerId];
  }
}

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
      id: battingLeader.id,
      name: battingLeader.name,
      team: battingLeader.teamName,
      avg: (battingLeader.seasonStats.batting.hits / battingLeader.seasonStats.batting.atBats).toFixed(3)
    };

    // 本塁打王
    const hrLeader = qualifiedBatters.reduce((best, p) =>
      p.seasonStats.batting.homeruns > best.seasonStats.batting.homeruns ? p : best
    );
    awards.homeRunKing = {
      id: hrLeader.id,
      name: hrLeader.name,
      team: hrLeader.teamName,
      homeruns: hrLeader.seasonStats.batting.homeruns
    };

    // 打点王
    const rbiLeader = qualifiedBatters.reduce((best, p) =>
      p.seasonStats.batting.rbis > best.seasonStats.batting.rbis ? p : best
    );
    awards.rbiKing = {
      id: rbiLeader.id,
      name: rbiLeader.name,
      team: rbiLeader.teamName,
      rbis: rbiLeader.seasonStats.batting.rbis
    };

    // 盗塁王
    const sbLeader = qualifiedBatters.reduce((best, p) =>
      p.seasonStats.batting.stolenBases > best.seasonStats.batting.stolenBases ? p : best
    );
    awards.stolenBaseKing = {
      id: sbLeader.id,
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
      id: eraLeader.id,
      name: eraLeader.name,
      team: eraLeader.teamName,
      era: era.toFixed(2)
    };

    // 最多勝
    const winsLeader = qualifiedPitchers.reduce((best, p) =>
      p.seasonStats.pitching.wins > best.seasonStats.pitching.wins ? p : best
    );
    awards.winsLeader = {
      id: winsLeader.id,
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
        id: savesLeader.id,
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
      id: soLeader.id,
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
 * NPBドラフト候補条件を判定
 * 能力ベース評価 + シーズン個人成績ボーナス（1位+10pt、2位+5pt）
 * 統一指名ライン: 220pt
 * @param {Object} player - 選手データ
 * @param {number} awardBonus - シーズン個人成績ボーナス（デフォルト0）
 * @returns {Object} - { isDraftEligible: boolean, reasons: string[], totalScore: number }
 */
export function checkNPBDraftEligibility(player, awardBonus = 0) {
  const isPitcher = player.position === 'pitcher';
  const DRAFT_THRESHOLD = isPitcher ? 230 : 260; // 投手230pt、野手260pt
  const reasons = [];
  const age = player.age || 20;

  // 30歳以上はドラフト指名対象外
  if (age >= 30) {
    return { isDraftEligible: false, reasons: [], totalScore: 0 };
  }

  // 能力ベースのドラフト評価（年齢が若いほど低い能力でも指名される）
  // 年齢ボーナス: 若い選手ほど将来性で高評価、大卒年齢(22歳)が基準(±0)
  const ageBonusMap = { 19: 20, 20: 15, 21: 10, 22: 0, 23: -5, 24: -10, 25: -15, 26: -20, 27: -30, 28: -40, 29: -50 };
  const ageBonus = ageBonusMap[age] !== undefined ? ageBonusMap[age] : (age < 19 ? 20 : -50);

  let baseScore = 0;

  if (isPitcher) {
    const velocity = player.pitching?.velocity || 0;
    const control = player.pitching?.control || 0;
    const stamina = player.pitching?.stamina || 0;
    const arsenal = player.pitching?.arsenal || [];
    const bestBreaking = arsenal.filter(a => a.type !== 'straight').reduce((max, a) => Math.max(max, a.level || 0), 0);

    // 総合投手力 = 球速評価 + 制球 + スタミナ/2 + 変化球 + 年齢ボーナス
    const velocityScore = Math.max(0, (velocity - 130) * 2); // 130km以上で評価
    baseScore = velocityScore + control + stamina * 0.5 + bestBreaking * 0.5 + ageBonus;
    const totalScore = baseScore + awardBonus;

    if (totalScore >= DRAFT_THRESHOLD) {
      reasons.push(`投手力${Math.round(baseScore)}pt`);
      if (awardBonus > 0) reasons.push(`成績ボーナス+${awardBonus}pt`);
      reasons.push(`総合${Math.round(totalScore)}pt`);
      if (velocity >= 148) reasons.push(`球速${velocity}km`);
      if (control >= 75) reasons.push(`制球力${control}`);
      if (bestBreaking >= 70) reasons.push(`変化球${bestBreaking}`);
      if (age <= 22) reasons.push(`${age}歳の将来性`);
    }
  } else {
    const meet = player.batting?.meet || 0;
    const power = player.batting?.power || 0;
    const eye = player.batting?.eye || 0;
    const speed = player.physical?.speed || 0;
    const defense = player.fielding?.defense || 0;
    const arm = player.physical?.arm || 0;

    // 総合野手力 = ミート + パワー + 選球眼/2 + 走力/3 + 守備/3 + 肩/3 + 年齢ボーナス
    baseScore = meet + power + eye * 0.5 + speed * 0.3 + defense * 0.3 + arm * 0.3 + ageBonus;
    const totalScore = baseScore + awardBonus;

    if (totalScore >= DRAFT_THRESHOLD) {
      reasons.push(`野手力${Math.round(baseScore)}pt`);
      if (awardBonus > 0) reasons.push(`成績ボーナス+${awardBonus}pt`);
      reasons.push(`総合${Math.round(totalScore)}pt`);
      if (meet >= 75) reasons.push(`ミート${meet}`);
      if (power >= 75) reasons.push(`パワー${power}`);
      if (speed >= 80) reasons.push(`俊足${speed}`);
      if (defense >= 80) reasons.push(`守備${defense}`);
      if (age <= 22) reasons.push(`${age}歳の将来性`);
    }
  }

  return {
    isDraftEligible: reasons.length > 0,
    reasons,
    totalScore: baseScore + awardBonus
  };
}

/**
 * シーズン個人成績ランキングからボーナスを計算
 * 各部門1位: +10pt、2位: +5pt
 * 打撃: 首位打者、本塁打王、打点王、盗塁王
 * 投手: 最優秀防御率、最多勝、最多セーブ、最多奪三振
 * @param {Object} allTeams - TEAMS_DATA
 * @returns {Object} - playerId -> { bonus: number, awards: string[] }
 */
function computeSeasonAwardBonuses(allTeams) {
  const bonusMap = {}; // playerId -> { bonus, awards }

  const addBonus = (playerId, points, awardName) => {
    if (!bonusMap[playerId]) bonusMap[playerId] = { bonus: 0, awards: [] };
    bonusMap[playerId].bonus += points;
    bonusMap[playerId].awards.push(awardName);
  };

  // 全選手を収集
  const allPlayers = [];
  Object.entries(allTeams).forEach(([teamName, team]) => {
    if (!team.players) return;
    team.players.forEach(player => {
      if (player.seasonStats) {
        allPlayers.push(player);
      }
    });
  });

  // 打撃ランキング（規定打席: 100打席以上）
  const qualifiedBatters = allPlayers.filter(p => p.seasonStats?.batting?.atBats >= 100);

  if (qualifiedBatters.length >= 1) {
    // 首位打者（打率）
    const baSorted = [...qualifiedBatters].sort((a, b) => {
      const avgA = a.seasonStats.batting.hits / a.seasonStats.batting.atBats;
      const avgB = b.seasonStats.batting.hits / b.seasonStats.batting.atBats;
      return avgB - avgA;
    });
    addBonus(baSorted[0].id, 10, '首位打者1位');
    if (baSorted.length >= 2) addBonus(baSorted[1].id, 5, '首位打者2位');

    // 本塁打王
    const hrSorted = [...qualifiedBatters].sort((a, b) =>
      (b.seasonStats.batting.homeruns || 0) - (a.seasonStats.batting.homeruns || 0)
    );
    addBonus(hrSorted[0].id, 10, '本塁打王1位');
    if (hrSorted.length >= 2) addBonus(hrSorted[1].id, 5, '本塁打王2位');

    // 打点王
    const rbiSorted = [...qualifiedBatters].sort((a, b) =>
      (b.seasonStats.batting.rbis || 0) - (a.seasonStats.batting.rbis || 0)
    );
    addBonus(rbiSorted[0].id, 10, '打点王1位');
    if (rbiSorted.length >= 2) addBonus(rbiSorted[1].id, 5, '打点王2位');

    // 盗塁王
    const sbSorted = [...qualifiedBatters].sort((a, b) =>
      (b.seasonStats.batting.stolenBases || 0) - (a.seasonStats.batting.stolenBases || 0)
    );
    addBonus(sbSorted[0].id, 10, '盗塁王1位');
    if (sbSorted.length >= 2) addBonus(sbSorted[1].id, 5, '盗塁王2位');
  }

  // 投手ランキング（規定投球回: 30イニング以上）
  const qualifiedPitchers = allPlayers.filter(p => p.seasonStats?.pitching?.inningsPitched >= 30);

  if (qualifiedPitchers.length >= 1) {
    // 最優秀防御率（低いほど良い）
    const eraSorted = [...qualifiedPitchers].sort((a, b) => {
      const eraA = a.seasonStats.pitching.inningsPitched > 0
        ? (a.seasonStats.pitching.earnedRuns * 27) / a.seasonStats.pitching.inningsPitched : 99.99;
      const eraB = b.seasonStats.pitching.inningsPitched > 0
        ? (b.seasonStats.pitching.earnedRuns * 27) / b.seasonStats.pitching.inningsPitched : 99.99;
      return eraA - eraB;
    });
    addBonus(eraSorted[0].id, 10, '最優秀防御率1位');
    if (eraSorted.length >= 2) addBonus(eraSorted[1].id, 5, '最優秀防御率2位');

    // 最多勝
    const winsSorted = [...qualifiedPitchers].sort((a, b) =>
      (b.seasonStats.pitching.wins || 0) - (a.seasonStats.pitching.wins || 0)
    );
    addBonus(winsSorted[0].id, 10, '最多勝1位');
    if (winsSorted.length >= 2) addBonus(winsSorted[1].id, 5, '最多勝2位');

    // 最多奪三振
    const soSorted = [...qualifiedPitchers].sort((a, b) =>
      (b.seasonStats.pitching.strikeouts || 0) - (a.seasonStats.pitching.strikeouts || 0)
    );
    addBonus(soSorted[0].id, 10, '最多奪三振1位');
    if (soSorted.length >= 2) addBonus(soSorted[1].id, 5, '最多奪三振2位');
  }

  // 最多セーブ（規定投球回不要、セーブ1以上）
  const savePitchers = allPlayers.filter(p => (p.seasonStats?.pitching?.saves || 0) > 0);
  if (savePitchers.length >= 1) {
    const savesSorted = [...savePitchers].sort((a, b) =>
      (b.seasonStats.pitching.saves || 0) - (a.seasonStats.pitching.saves || 0)
    );
    addBonus(savesSorted[0].id, 10, '最多セーブ1位');
    if (savesSorted.length >= 2) addBonus(savesSorted[1].id, 5, '最多セーブ2位');
  }

  return bonusMap;
}

/**
 * NPBドラフト処理
 * 全チームの選手をチェックし、ドラフト対象者を抽出・処理
 * シーズン個人成績ボーナス付き（1位+10pt、2位+5pt）
 * @param {Object} allTeams - TEAMS_DATA
 * @returns {Object} - { draftedPlayers, nearMissPlayers }
 */
export function processNPBDraft(allTeams) {
  const PITCHER_THRESHOLD = 230;
  const FIELDER_THRESHOLD = 260;

  const NPB_TEAMS = [
    '読売ジャイアンツ', '阪神タイガース', '横浜DeNAベイスターズ',
    '広島東洋カープ', '中日ドラゴンズ', 'ヤクルトスワローズ',
    'オリックス・バファローズ', 'ソフトバンクホークス', '西武ライオンズ',
    '楽天ゴールデンイーグルス', '千葉ロッテマリーンズ', '日本ハムファイターズ'
  ];

  // シーズン個人成績ボーナスを計算
  const awardBonusMap = computeSeasonAwardBonuses(allTeams);

  const draftedPlayers = [];
  const nearMissPlayers = [];

  Object.entries(allTeams).forEach(([teamName, team]) => {
    if (!team.players) return;
    team.players.forEach(player => {
      const playerBonus = awardBonusMap[player.id]?.bonus || 0;
      const playerAwards = awardBonusMap[player.id]?.awards || [];
      const { isDraftEligible, reasons, totalScore } = checkNPBDraftEligibility(player, playerBonus);
      if (isDraftEligible) {
        const npbTeam = NPB_TEAMS[Math.floor(Math.random() * NPB_TEAMS.length)];
        // 殿堂入り判定
        const hofResult = checkHallOfFame(player);
        // ドラフト順位を算出: 閾値から10ptごとに育成→6位→5位→4位→3位→2位→1位
        const isPitcherForRound = player.position === 'pitcher';
        const threshold = isPitcherForRound ? PITCHER_THRESHOLD : FIELDER_THRESHOLD;
        const overThreshold = totalScore - threshold;
        const DRAFT_ROUND_LABELS = ['育成指名', 'ドラフト6位', 'ドラフト5位', 'ドラフト4位', 'ドラフト3位', 'ドラフト2位', 'ドラフト1位'];
        const roundIndex = Math.min(Math.floor(overThreshold / 10), DRAFT_ROUND_LABELS.length - 1);
        const draftRound = DRAFT_ROUND_LABELS[Math.max(0, roundIndex)];

        draftedPlayers.push({
          player,
          teamName,
          npbTeam,
          reasons,
          draftRound,
          position: player.position,
          age: player.age,
          name: player.name,
          playerId: player.id,
          hallOfFame: hofResult.isHallOfFame,
          hofReason: hofResult.reason,
          careerStats: player.careerStats ? JSON.parse(JSON.stringify(player.careerStats)) : null,
          yearsPlayed: player.yearsPlayed || 1,
          awardBonus: playerBonus,
          seasonAwards: playerAwards
        });
      } else {
        // 惜しかった選手の判定（ドラフト基準の85%以上）
        const { totalScore: playerScore } = checkNPBDraftEligibility(player, playerBonus);
        const isPitcher = player.position === 'pitcher';
        const threshold = isPitcher ? PITCHER_THRESHOLD : FIELDER_THRESHOLD;
        const nearMissThreshold = Math.round(threshold * 0.85);
        if (playerScore >= nearMissThreshold && playerScore < threshold) {
          const nearReasons = [];
          nearReasons.push(`${isPitcher ? '投手' : '野手'}力${Math.round(playerScore)}pt（あと${Math.round(threshold - playerScore)}pt）`);
          if (playerBonus > 0) nearReasons.push(`成績ボーナス+${playerBonus}pt`);
          nearMissPlayers.push({
            name: player.name,
            teamName,
            position: player.position,
            age: player.age,
            reasons: nearReasons
          });
        }
      }
    });
  });

  // === プロ輩出ボーナスを適用 ===
  const teamDraftCounts = {};
  draftedPlayers.forEach(({ teamName }) => {
    teamDraftCounts[teamName] = (teamDraftCounts[teamName] || 0) + 1;
  });

  const proBonus = [];

  Object.entries(teamDraftCounts).forEach(([teamName, count]) => {
    const team = allTeams[teamName];
    if (!team) return;

    // 1. 育成評価ボーナス: プロ輩出1人ごとに+3、34人輩出で最高評価(100)
    if (!team.developmentReputation) team.developmentReputation = 0;
    if (!team.totalProPlayersProduced) team.totalProPlayersProduced = 0;
    team.totalProPlayersProduced += count;
    const reputationGain = count * 3;
    team.developmentReputation = Math.min(100, team.developmentReputation + reputationGain);

    // 2. 指導効果: プロ入り選手と一緒にプレーしていた若手に能力ブースト
    const youngPlayers = team.players.filter(p => p.age <= 25);
    let boostedCount = 0;
    youngPlayers.forEach(player => {
      // 各能力にランダムで+1～3のボーナス（プロの影響を受けた成長）
      const boostAmount = Math.floor(Math.random() * 3) + 1;
      if (player.position === 'pitcher') {
        const stat = ['control', 'stamina'][Math.floor(Math.random() * 2)];
        if (stat === 'stamina') {
          player.pitching.stamina = Math.min(200, player.pitching.stamina + boostAmount * 2);
        } else {
          player.pitching[stat] = Math.min(100, player.pitching[stat] + boostAmount);
        }
      } else {
        const stats = ['meet', 'power', 'eye'];
        const stat = stats[Math.floor(Math.random() * stats.length)];
        player.batting[stat] = Math.min(100, player.batting[stat] + boostAmount);
      }
      boostedCount++;
    });

    proBonus.push({
      teamName,
      draftCount: count,
      reputationGain,
      currentReputation: team.developmentReputation,
      boostedYoungPlayers: boostedCount
    });
  });

  // ドラフト対象者をチームから除外（lineupSettings/pitchingRotationも清掃）
  draftedPlayers.forEach(({ playerId, teamName }) => {
    const team = allTeams[teamName];
    if (team) {
      cleanupPlayerReferences(team, playerId);
      team.players = team.players.filter(p => p.id !== playerId);
    }
  });

  return { draftedPlayers, nearMissPlayers, proBonus };
}

/**
 * 殿堂入り条件を判定
 * 投手: 通算100勝、または通算30セーブ、または通算600奪三振
 * 野手: 通算打率.300以上、または通算150本塁打、または通算1000安打
 * @param {Object} player - 選手データ
 * @returns {Object} - { isHallOfFame: boolean, reason: string }
 */
export function checkHallOfFame(player) {
  const isPitcher = player.position === 'pitcher';

  // 通算成績
  const careerStats = player.careerStats || { batting: {}, pitching: {} };
  const careerWins = careerStats.pitching?.wins || 0;
  const careerStrikeouts = careerStats.pitching?.strikeouts || 0;
  const careerSaves = careerStats.pitching?.saves || 0;
  const careerHits = careerStats.batting?.hits || 0;
  const careerAtBats = careerStats.batting?.atBats || 0;
  const careerHomeruns = careerStats.batting?.homeruns || 0;
  const careerAvg = careerAtBats > 0 ? careerHits / careerAtBats : 0;

  if (isPitcher) {
    if (careerWins >= 100) return { isHallOfFame: true, reason: `通算${careerWins}勝の名投手` };
    if (careerSaves >= 30) return { isHallOfFame: true, reason: `通算${careerSaves}セーブの守護神` };
    if (careerStrikeouts >= 600) return { isHallOfFame: true, reason: `通算${careerStrikeouts}奪三振のストライカー` };
  } else {
    if (careerAvg >= 0.300 && careerAtBats >= 500) return { isHallOfFame: true, reason: `通算打率${careerAvg.toFixed(3)}の安打製造機` };
    if (careerHomeruns >= 150) return { isHallOfFame: true, reason: `通算${careerHomeruns}本塁打のスラッガー` };
    if (careerHits >= 1000) return { isHallOfFame: true, reason: `通算${careerHits}安打の名選手` };
  }

  return { isHallOfFame: false, reason: '' };
}

/**
 * 引退・殿堂入り判定
 * @param {Object} player - 選手データ
 * @returns {Object} - { shouldRetire: boolean, hallOfFame: boolean, reason: string, draftEligible: boolean, draftReasons: string[] }
 */
export function checkRetirement(player) {
  const age = player.age || 20;

  // 殿堂入り判定（新しい条件を使用）
  const { isHallOfFame: hallOfFame, reason: hofReason } = checkHallOfFame(player);

  // NPBドラフト候補判定
  const { isDraftEligible: draftEligible, reasons: draftReasons } = checkNPBDraftEligibility(player);

  // 引退判定
  let shouldRetire = false;
  let reason = hofReason;

  // 1. 40歳以上は必ず引退
  if (age >= 40) {
    shouldRetire = true;
    if (!reason) reason = '年齢による引退';
  }
  // 2. 35歳以上で成績不振
  else if (age >= 35) {
    const recentGames = (player.seasonStats?.batting?.games || 0) + (player.seasonStats?.pitching?.games || 0);
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

  return { shouldRetire, hallOfFame, reason, draftEligible, draftReasons };
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
    const retiredIds = [];

    team.players.forEach(player => {
      const { shouldRetire, hallOfFame, reason } = checkRetirement(player);

      if (shouldRetire) {
        retiredIds.push(player.id);
        retirements.push({
          name: player.name,
          team: teamName,
          age: player.age,
          position: player.position,
          throws: player.physical?.throws || 'right',
          bats: player.batting?.bats || 'right',
          hallOfFame,
          reason,
          careerStats: player.careerStats
        });
      } else {
        remainingPlayers.push(player);
      }
    });

    // lineupSettings/pitchingRotationから引退選手の参照を清掃
    retiredIds.forEach(id => cleanupPlayerReferences(team, id));

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
export function resetSeasonStats(allTeams, year) {
  const updatedTeams = {};

  Object.entries(allTeams).forEach(([teamName, team]) => {
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => {
        // シーズン成績を通算成績に加算（古いセーブデータ対応: || 0）
        const cb = player.careerStats.batting;
        const sb = player.seasonStats.batting;
        const updatedCareerBatting = {
          games: (cb.games || 0) + (sb.games || 0),
          atBats: (cb.atBats || 0) + (sb.atBats || 0),
          hits: (cb.hits || 0) + (sb.hits || 0),
          doubles: (cb.doubles || 0) + (sb.doubles || 0),
          triples: (cb.triples || 0) + (sb.triples || 0),
          homeruns: (cb.homeruns || 0) + (sb.homeruns || 0),
          rbis: (cb.rbis || 0) + (sb.rbis || 0),
          walks: (cb.walks || 0) + (sb.walks || 0),
          strikeouts: (cb.strikeouts || 0) + (sb.strikeouts || 0),
          stolenBases: (cb.stolenBases || 0) + (sb.stolenBases || 0),
          errors: (cb.errors || 0) + (sb.errors || 0),
          fieldingChances: (cb.fieldingChances || 0) + (sb.fieldingChances || 0)
        };

        const cp = player.careerStats.pitching;
        const sp = player.seasonStats.pitching;
        const updatedCareerPitching = {
          games: (cp.games || 0) + (sp.games || 0),
          wins: (cp.wins || 0) + (sp.wins || 0),
          losses: (cp.losses || 0) + (sp.losses || 0),
          saves: (cp.saves || 0) + (sp.saves || 0),
          holds: (cp.holds || 0) + (sp.holds || 0),
          inningsPitched: (cp.inningsPitched || 0) + (sp.inningsPitched || 0),
          runsAllowed: (cp.runsAllowed || 0) + (sp.runsAllowed || 0),
          earnedRuns: (cp.earnedRuns || 0) + (sp.earnedRuns || 0),
          hits: (cp.hits || 0) + (sp.hits || 0),
          homeruns: (cp.homeruns || 0) + (sp.homeruns || 0),
          walks: (cp.walks || 0) + (sp.walks || 0),
          strikeouts: (cp.strikeouts || 0) + (sp.strikeouts || 0),
          pitches: (cp.pitches || 0) + (sp.pitches || 0),
          qualityStarts: (cp.qualityStarts || 0) + (sp.qualityStarts || 0),
          highQualityStarts: (cp.highQualityStarts || 0) + (sp.highQualityStarts || 0)
        };

        // 前年成績を保存してからシーズン成績をリセット
        const statsHistoryEntry = {
          year: year || '?',
          batting: JSON.parse(JSON.stringify(player.seasonStats.batting)),
          pitching: JSON.parse(JSON.stringify(player.seasonStats.pitching))
        };
        const existingHistory = player.statsHistory || [];
        return {
          ...player,
          statsHistory: [...existingHistory, statsHistoryEntry],
          previousSeasonStats: JSON.parse(JSON.stringify(player.seasonStats)),
          careerStats: {
            batting: updatedCareerBatting,
            pitching: updatedCareerPitching
          },
          seasonStats: {
            batting: { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0, errors: 0, fieldingChances: 0 },
            pitching: { games: 0, wins: 0, losses: 0, saves: 0, holds: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0, hits: 0, homeruns: 0, walks: 0, strikeouts: 0, pitches: 0, qualityStarts: 0, highQualityStarts: 0 }
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

        // 各タイトルをチェック（IDで照合、IDがない場合は名前で照合）
        const matchAward = (award) => award && (award.id ? award.id === player.id : award.name === player.name);

        if (matchAward(awards.battingChampion)) {
          achievements.push({ year: 0, title: '首位打者' });
        }
        if (matchAward(awards.homeRunKing)) {
          achievements.push({ year: 0, title: '本塁打王' });
        }
        if (matchAward(awards.rbiKing)) {
          achievements.push({ year: 0, title: '打点王' });
        }
        if (matchAward(awards.stolenBaseKing)) {
          achievements.push({ year: 0, title: '盗塁王' });
        }
        if (matchAward(awards.eraChampion)) {
          achievements.push({ year: 0, title: '最優秀防御率' });
        }
        if (matchAward(awards.winsLeader)) {
          achievements.push({ year: 0, title: '最多勝' });
        }
        if (matchAward(awards.savesLeader)) {
          achievements.push({ year: 0, title: '最多セーブ' });
        }
        if (matchAward(awards.strikeoutKing)) {
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
  updatedTeams = resetSeasonStats(updatedTeams, seasonData.year);

  // 4. 選手の年齢を更新
  updatedTeams = updateAllPlayerAges(updatedTeams);

  // 4.5. 年齢カーブによる成長・衰退を適用
  const { updatedTeams: teamsAfterAgeCurve, ageReports } = applyAgeCurveChanges(updatedTeams);
  updatedTeams = teamsAfterAgeCurve;

  // 5. 引退処理
  const { updatedTeams: teamsAfterRetirement, retirements } = processRetirements(updatedTeams);

  // 6. 新シーズンデータ作成
  const newYear = seasonData.year + 1;
  const newSeasonData = createSeasonData(newYear);
  newSeasonData.settings = { ...seasonData.settings };

  // スケジュールはレギュレーション設定後に生成するため、ここでは空のまま
  // 順位表のみ初期化
  const teams = Object.keys(teamsAfterRetirement);
  newSeasonData.schedule = [];
  newSeasonData.standings = initializeStandings(teams);

  return {
    newSeasonData,
    updatedTeams: teamsAfterRetirement,
    awards,
    retirements,
    ageReports
  };
};

// ============================================================
// 年齢カーブによる成長・衰退システム
// 若い: フィジカル成長しやすい、24歳前後: 技術が伸びやすい
// 28歳前後: 微成長、32歳: 衰え開始、36歳: 顕著な衰え
// ただし個人差が大きく、例外的な選手も出る
// ============================================================

// フィジカル系能力（若いほど伸びやすい）
const PHYSICAL_STATS = ['speed', 'arm', 'stamina', 'velocity'];
// 技術系能力（24歳前後でピーク成長）
const TECHNICAL_STATS = ['meet', 'power', 'eye', 'control', 'defense', 'steal'];

/**
 * 年齢に基づく成長・衰退の基礎値を算出
 * 返り値は -3.0 〜 +3.0 程度の範囲（ランダム偏差含まず）
 */
function getAgeGrowthBase(age, isPhysical) {
  if (isPhysical) {
    // フィジカル: 18-22で大きく伸びる、23-27で微増、28以降は衰退
    if (age <= 20) return 2.5;
    if (age <= 22) return 1.8;
    if (age <= 25) return 0.8;
    if (age <= 28) return 0.1;
    if (age <= 31) return -0.5;
    if (age <= 34) return -1.2;
    if (age <= 37) return -2.0;
    return -3.0;
  } else {
    // 技術: 18-21で微増、22-26でよく伸びる、27-30で微増、31以降衰退
    if (age <= 21) return 1.0;
    if (age <= 24) return 2.2;
    if (age <= 27) return 1.5;
    if (age <= 30) return 0.3;
    if (age <= 33) return -0.3;
    if (age <= 36) return -1.0;
    return -2.0;
  }
}

/**
 * シーズン終了時の年齢カーブによる能力変動を適用
 * 個人差を大きくし、傾向からの逸脱を許容する
 * @param {Object} allTeams - 全チームデータ
 * @returns {Object} - { updatedTeams, ageReports }
 */
export function applyAgeCurveChanges(allTeams) {
  const updatedTeams = {};
  const ageReports = [];

  Object.entries(allTeams).forEach(([teamName, team]) => {
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => {
        const age = player.age || 20;
        let updatedPlayer = JSON.parse(JSON.stringify(player));
        const changes = [];

        // 全能力について年齢カーブを適用
        const allStats = [...PHYSICAL_STATS, ...TECHNICAL_STATS];

        allStats.forEach(stat => {
          const isPhysical = PHYSICAL_STATS.includes(stat);
          const base = getAgeGrowthBase(age, isPhysical);

          // 個人差: 標準偏差2.0のランダム偏差（大きな個人差を出す）
          // Box-Muller変換で正規分布を生成
          const u1 = Math.random() || 0.001;
          const u2 = Math.random();
          const normalRandom = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          const variance = normalRandom * 2.0;

          // 最終変動値（四捨五入、±0の場合もある）
          let change = Math.round(base + variance);

          // 能力値を取得・更新
          const statPath = getStatPath(stat);
          if (!statPath) return;

          const currentValue = getNestedValue(updatedPlayer, statPath);
          if (currentValue == null) return;

          // 球速は変動幅を2倍に（スケールが大きいため）
          if (stat === 'velocity') change = Math.round((base + variance) * 1.5);
          // スタミナも変動幅を2倍
          if (stat === 'stamina') change = Math.round((base + variance) * 1.5);

          const newValue = Math.max(1, currentValue + change);

          if (change !== 0) {
            updatedPlayer = setNestedValue(updatedPlayer, statPath, newValue);
            changes.push({
              stat, statName: getStatName(stat),
              before: currentValue, after: newValue, change
            });
          }
        });

        if (changes.length > 0) {
          ageReports.push({
            name: player.name, team: teamName, age, changes
          });
        }

        return updatedPlayer;
      })
    };
  });

  return { updatedTeams, ageReports };
}

// ============================================================
// キャンプ練習システム（経験値→成長、年齢カーブ考慮）
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
  },
  breaking: {
    name: '変化球練習',
    icon: '🌀',
    description: '変化球レベルを強化',
    targets: ['breaking'],
    category: 'pitching'
  },
  newpitch: {
    name: '新球種習得',
    icon: '✨',
    description: '新しい変化球を覚える（投手のみ）',
    targets: ['newpitch'],
    category: 'pitching'
  }
};

/**
 * サブ練習メニュー（基礎体力・弱点補強系）
 */
export const SUB_TRAINING_MENUS = {
  running: {
    name: 'ランニング',
    icon: '🏃',
    description: '基礎体力UP（走力+スタミナ微増）',
    targets: ['speed', 'stamina_sub'],
  },
  muscle: {
    name: '筋トレ',
    icon: '💪',
    description: 'パワー+肩力微増',
    targets: ['power', 'arm'],
  },
  stretch: {
    name: 'ストレッチ',
    icon: '🧘',
    description: '怪我予防・全能力微増',
    targets: ['all_minor'],
  },
  defense_sub: {
    name: '守備補強',
    icon: '🧤',
    description: '非適正ポジションの守備練習',
    targets: ['defense', 'fitness'],
  },
  form_change: {
    name: 'フォーム改造',
    icon: '🔄',
    description: '投球フォーム変更に挑戦（成功20%/失敗で制球低下）',
    targets: ['control', 'meet'],
  },
  switch_hit: {
    name: '打席変更',
    icon: '↔️',
    description: '打席変更に挑戦（失敗でミート低下リスク）',
    targets: ['switch_bats'],
  },
  newpitch: {
    name: '新球種習得',
    icon: '✨',
    description: '新しい変化球を覚える（投手のみ）',
    targets: ['newpitch'],
  },
  subposition: {
    name: 'サブポジ練習',
    icon: '🔀',
    description: '指定ポジションの守備練習（適正大幅UP）',
    targets: ['subposition'],
  },
  clead_study: {
    name: 'Cリード学習',
    icon: '🧠',
    description: 'キャッチャーリード向上（リード+1~3）',
    targets: ['clead'],
  },
};

/**
 * サブ練習を実行（メイン練習の半分程度の効果）
 * @param {Object} player - 選手
 * @param {string} subType - サブ練習タイプ
 * @param {Object} options - オプション { targetPosition, targetForm, targetBats }
 */
export function executeSubTraining(player, subType, options = {}) {
  const menu = SUB_TRAINING_MENUS[subType];
  if (!menu) return { player, growthReport: [] };

  const growthReport = [];
  const growthAmount = () => Math.random() < 0.4 ? (Math.random() < 0.3 ? 2 : 1) : 0;

  switch (subType) {
    case 'running': {
      const spd = growthAmount();
      if (spd > 0 && player.physical) {
        player.physical.speed = Math.min(100, (player.physical.speed || 50) + spd);
        growthReport.push({ statName: '走力', before: player.physical.speed - spd, after: player.physical.speed, growth: spd });
      }
      if (player.pitching?.stamina && Math.random() < 0.2) {
        player.pitching.stamina = Math.min(200, player.pitching.stamina + 1);
        growthReport.push({ statName: 'スタミナ', before: player.pitching.stamina - 1, after: player.pitching.stamina, growth: 1 });
      }
      break;
    }
    case 'muscle': {
      const pwr = growthAmount();
      if (pwr > 0 && player.batting) {
        player.batting.power = Math.min(100, (player.batting.power || 50) + pwr);
        growthReport.push({ statName: 'パワー', before: player.batting.power - pwr, after: player.batting.power, growth: pwr });
      }
      const arm = Math.random() < 0.25 ? 1 : 0;
      if (arm > 0 && player.physical) {
        player.physical.arm = Math.min(100, (player.physical.arm || 50) + arm);
        growthReport.push({ statName: '肩力', before: player.physical.arm - arm, after: player.physical.arm, growth: arm });
      }
      break;
    }
    case 'stretch': {
      // 全能力微増（10%の確率で各能力+1）
      const stats = [
        { key: 'batting.meet', name: 'ミート' },
        { key: 'batting.power', name: 'パワー' },
        { key: 'physical.speed', name: '走力' },
        { key: 'physical.arm', name: '肩力' },
        { key: 'fielding.defense', name: '守備' },
      ];
      stats.forEach(({ key, name }) => {
        if (Math.random() < 0.1) {
          const [obj, prop] = key.split('.');
          if (player[obj]) {
            const old = player[obj][prop] || 50;
            player[obj][prop] = Math.min(100, old + 1);
            growthReport.push({ statName: name, before: old, after: old + 1, growth: 1 });
          }
        }
      });
      break;
    }
    case 'defense_sub': {
      const def = growthAmount();
      if (def > 0 && player.fielding) {
        player.fielding.defense = Math.min(100, (player.fielding.defense || 50) + def);
        growthReport.push({ statName: '守備', before: player.fielding.defense - def, after: player.fielding.defense, growth: def });
      }
      // 守備適正も微増
      if (player.positionFitness && Math.random() < 0.3) {
        const positions = Object.keys(player.positionFitness);
        const weakPos = positions.filter(p => (player.positionFitness[p] || 0) < 70);
        if (weakPos.length > 0) {
          const pos = weakPos[Math.floor(Math.random() * weakPos.length)];
          const old = player.positionFitness[pos] || 0;
          player.positionFitness[pos] = Math.min(100, old + 3);
          growthReport.push({ statName: `${POSITION_NAMES_MAP[pos] || pos}適正`, before: old, after: old + 3, growth: 3 });
        }
      }
      break;
    }
    case 'form_change': {
      if (player.position === 'pitcher' && player.pitching) {
        const currentForm = player.pitching.form || 'threeQuarter';
        const forms = ['overhand', 'threeQuarter', 'sidearm', 'submarine'];
        const targetForm = options.targetForm && options.targetForm !== currentForm
          ? options.targetForm
          : forms.filter(f => f !== currentForm)[Math.floor(Math.random() * (forms.length - 1))];
        const FORM_NAMES = { overhand: 'オーバー', threeQuarter: 'スリークォーター', sidearm: 'サイド', submarine: 'アンダー' };
        // ハイリスクハイリターン: 20%で成功、成功時は制球+球速ボーナス、失敗時は制球低下
        if (Math.random() < 0.20) {
          player.pitching.form = targetForm;
          growthReport.push({ statName: 'フォーム', before: FORM_NAMES[currentForm], after: FORM_NAMES[targetForm], growth: 0, isAwakening: true });
          // 成功ボーナス: 制球+3~5
          const bonus = Math.floor(Math.random() * 3) + 3;
          const oldCtrl = player.pitching.control || 50;
          player.pitching.control = oldCtrl + bonus;
          growthReport.push({ statName: '制球', before: oldCtrl, after: player.pitching.control, growth: bonus });
        } else {
          growthReport.push({ statName: 'フォーム改造', before: FORM_NAMES[currentForm], after: '変更失敗', growth: 0 });
          // 失敗ペナルティ: 制球-1~3
          const penalty = Math.floor(Math.random() * 3) + 1;
          if (player.pitching.control > 20) {
            const oldCtrl = player.pitching.control;
            player.pitching.control = Math.max(15, oldCtrl - penalty);
            growthReport.push({ statName: '制球', before: oldCtrl, after: player.pitching.control, growth: player.pitching.control - oldCtrl });
          }
        }
      } else if (player.batting) {
        // 野手のフォーム改造: ミート微増（従来通り）
        const mt = growthAmount();
        if (mt > 0) {
          player.batting.meet = Math.min(100, (player.batting.meet || 50) + mt);
          growthReport.push({ statName: 'ミート', before: player.batting.meet - mt, after: player.batting.meet, growth: mt });
        }
      }
      break;
    }
    case 'switch_hit': {
      const currentBats = player.batting?.bats || player.physical?.bats || 'right';
      const targetBats = options.targetBats && options.targetBats !== currentBats
        ? options.targetBats
        : (currentBats === 'switch' ? null : 'switch');
      const BATS_NAMES = { right: '右打', left: '左打', switch: '両打' };
      if (!targetBats || targetBats === currentBats) {
        growthReport.push({ statName: '打席変更', before: BATS_NAMES[currentBats], after: '変更不要', growth: 0 });
        break;
      }
      // ハイリスクハイリターン: switch→片打は30%、片打→switchは15%、片打→反対は20%
      const isToSwitch = targetBats === 'switch';
      const isFromSwitch = currentBats === 'switch';
      const successRate = isToSwitch ? 0.15 : isFromSwitch ? 0.30 : 0.20;
      if (Math.random() < successRate) {
        if (!player.batting) player.batting = {};
        player.batting.bats = targetBats;
        growthReport.push({ statName: '打席', before: BATS_NAMES[currentBats], after: BATS_NAMES[targetBats], growth: 0, isAwakening: true });
        // ミート微減リスク（switchへの場合のみ）
        if (isToSwitch && player.batting.meet > 30) {
          const penalty = Math.floor(Math.random() * 3) + 1;
          const oldMeet = player.batting.meet;
          player.batting.meet = Math.max(20, oldMeet - penalty);
          growthReport.push({ statName: 'ミート', before: oldMeet, after: player.batting.meet, growth: player.batting.meet - oldMeet });
        }
      } else {
        growthReport.push({ statName: '打席変更', before: BATS_NAMES[currentBats], after: '変更失敗', growth: 0 });
        // 失敗ペナルティ: ミート-1~2
        if (player.batting?.meet > 25) {
          const penalty = Math.floor(Math.random() * 2) + 1;
          const oldMeet = player.batting.meet;
          player.batting.meet = Math.max(20, oldMeet - penalty);
          growthReport.push({ statName: 'ミート', before: oldMeet, after: player.batting.meet, growth: player.batting.meet - oldMeet });
        }
      }
      break;
    }
    case 'newpitch': {
      // 新球種習得（サブ練習版 - 成功率低め）
      if (player.position === 'pitcher' && player.pitching) {
        const allPitchTypes = ['slider', 'curve', 'fork', 'changeup', 'sinker', 'cutter', 'knuckle', 'shoot'];
        const currentArsenal = (player.pitching.arsenal || []).map(a => a.type);
        const available = allPitchTypes.filter(t => !currentArsenal.includes(t));
        if (available.length > 0 && Math.random() < 0.12) {
          const newType = available[Math.floor(Math.random() * available.length)];
          const level = 20 + Math.floor(Math.random() * 20);
          if (!player.pitching.arsenal) player.pitching.arsenal = [{ type: 'straight', level: 50 }];
          player.pitching.arsenal.push({ type: newType, level });
          growthReport.push({ statName: '新球種', before: '-', after: `${getPitchTypeName(newType)}Lv${level}`, growth: 0, isAwakening: true });
        } else if (available.length === 0) {
          growthReport.push({ statName: '新球種', before: '-', after: '習得済み', growth: 0 });
        } else {
          growthReport.push({ statName: '新球種', before: '-', after: '習得失敗', growth: 0 });
        }
      }
      break;
    }
    case 'clead_study': {
      if (!player.catching) player.catching = {};
      const gain = Math.floor(Math.random() * 3) + 1; // 1~3
      const old = player.catching.lead || 40;
      player.catching.lead = Math.min(100, old + gain);
      growthReport.push({ statName: 'Cリード', before: old, after: player.catching.lead, growth: gain });
      break;
    }
    case 'subposition': {
      // サブポジション練習 - 指定ポジションまたはランダムの適正を上げる（成長3倍）
      if (!player.positionFitness) player.positionFitness = {};
      const allPos = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
      const nonMainPos = allPos.filter(p => p !== player.position);
      let picked = options.targetPosition;
      if (!picked || picked === player.position || !allPos.includes(picked)) {
        // 指定なしならランダム（弱いポジション優先）
        const weakPositions = nonMainPos.filter(p => (player.positionFitness[p] || 0) < 80);
        const targets = weakPositions.length > 0 ? weakPositions : nonMainPos;
        picked = targets[Math.floor(Math.random() * targets.length)];
      }
      if (picked) {
        // 3倍成長: 元(50%で0,30%で3,20%で5) → 常に成長、9-15程度
        const baseGain = Math.floor(Math.random() * 7) + 9; // 9-15
        const old = player.positionFitness[picked] || 0;
        player.positionFitness[picked] = Math.min(100, old + baseGain);
        const actual = player.positionFitness[picked] - old;
        growthReport.push({ statName: `${POSITION_NAMES_MAP[picked] || picked}適正`, before: old, after: player.positionFitness[picked], growth: actual });
      }
      break;
    }
  }

  return { player, growthReport };
}

const POSITION_NAMES_MAP = { pitcher: '投', catcher: '捕', first: '一', second: '二', third: '三', short: '遊', left: '左', center: '中', right: '右' };

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
 * ポジション経験による成長ボーナス倍率を算出
 * 外野: バランス成長、二塁/遊撃: 走力・守備、三塁/一塁: 打撃、捕手: 守備・肩
 */
function getPositionGrowthBonus(player, targetStat) {
  const posExp = player.positionExperience || {};
  const totalGames = Object.values(posExp).reduce((a, b) => a + b, 0);
  if (totalGames === 0) return 1.0;

  // 各ポジションの成長傾向（stat → bonus倍率）
  const positionBonusMap = {
    // 二塁・遊撃: 走力、守備が伸びやすい
    second:  { speed: 1.4, defense: 1.4, steal: 1.3, arm: 1.1, meet: 1.0, power: 0.9 },
    short:   { speed: 1.4, defense: 1.4, steal: 1.3, arm: 1.2, meet: 1.0, power: 0.9 },
    // 三塁・一塁: 打撃が伸びやすい
    third:   { power: 1.4, meet: 1.3, arm: 1.2, defense: 1.0, speed: 0.9, steal: 0.9 },
    first:   { power: 1.5, meet: 1.4, eye: 1.2, defense: 0.9, speed: 0.9, steal: 0.8 },
    // 外野: バランス成長
    left:    { speed: 1.2, meet: 1.1, power: 1.1, arm: 1.1, defense: 1.1, steal: 1.1 },
    center:  { speed: 1.3, defense: 1.2, meet: 1.1, steal: 1.2, arm: 1.0, power: 1.0 },
    right:   { arm: 1.3, power: 1.2, meet: 1.1, speed: 1.1, defense: 1.1, steal: 1.0 },
    // 捕手: 守備・肩が伸びやすい
    catcher: { defense: 1.5, arm: 1.4, meet: 1.0, power: 0.9, speed: 0.8, steal: 0.8 },
  };

  // 加重平均でボーナスを計算
  let weightedBonus = 0;
  Object.entries(posExp).forEach(([pos, games]) => {
    const bonusMap = positionBonusMap[pos] || {};
    const bonus = bonusMap[targetStat] || 1.0;
    weightedBonus += bonus * (games / totalGames);
  });

  return weightedBonus || 1.0;
}

/**
 * 打順経験による成長ボーナス倍率を算出
 * 1番: 走力、2-3番: バランス、4番: パワー、5番: パワー/打撃、下位: 守備
 */
function getBattingOrderGrowthBonus(player, targetStat) {
  const boExp = player.battingOrderExperience || {};
  const totalGames = Object.values(boExp).reduce((a, b) => a + b, 0);
  if (totalGames === 0) return 1.0;

  const orderBonusMap = {
    1: { speed: 1.4, steal: 1.4, meet: 1.2, eye: 1.2, power: 0.9 },
    2: { meet: 1.3, speed: 1.2, eye: 1.2, steal: 1.1, power: 1.0, defense: 1.0 },
    3: { meet: 1.3, power: 1.2, eye: 1.1, speed: 1.1, defense: 1.0 },
    4: { power: 1.5, meet: 1.2, eye: 1.1, speed: 0.9, steal: 0.8 },
    5: { power: 1.3, meet: 1.2, eye: 1.1, arm: 1.0 },
    6: { defense: 1.2, meet: 1.1, power: 1.1, arm: 1.1 },
    7: { defense: 1.2, arm: 1.1, meet: 1.0, speed: 1.1 },
    8: { defense: 1.3, arm: 1.2, speed: 1.1 },
    9: { /* 投手枠: ボーナスなし */ },
  };

  let weightedBonus = 0;
  Object.entries(boExp).forEach(([order, games]) => {
    const bonusMap = orderBonusMap[parseInt(order)] || {};
    const bonus = bonusMap[targetStat] || 1.0;
    weightedBonus += bonus * (games / totalGames);
  });

  return weightedBonus || 1.0;
}

// 利用可能な全変化球（新球種習得用）
const ALL_PITCH_TYPES = [
  'slider', 'curve', 'fork', 'changeup', 'sinker', 'shoot',
  'cutter', 'splitter', 'twoSeam', 'palm', 'knuckle'
];

/**
 * キャンプ練習を実行（1クール分）
 * 成長量は1/4に調整済み
 * @param {Object} player - 選手データ
 * @param {string} trainingType - 練習メニューのキー
 * @param {string} [newPitchType] - 新球種習得時の球種キー
 * @returns {Object} - 成長結果 { player, growthReport }
 */
export function executeCampTraining(player, trainingType, newPitchType) {
  const menu = TRAINING_MENUS[trainingType];
  if (!menu) {
    console.warn(`Unknown training type: ${trainingType}`);
    return { player, growthReport: [] };
  }

  const experience = player.experience || 0;
  const age = player.age || 20;
  const growthReport = [];
  let updatedPlayer = JSON.parse(JSON.stringify(player));

  // 変化球練習の場合
  if (trainingType === 'breaking') {
    const arsenal = updatedPlayer.pitching?.arsenal || [];
    const nonStraight = arsenal.filter(p => p.type !== 'straight');
    if (nonStraight.length > 0) {
      nonStraight.forEach(pitch => {
        const ageBase = getAgeGrowthBase(age, false);
        const ageMultiplier = Math.max(0.3, 1.0 + ageBase * 0.15);
        // 成長量1/6: 元(1-3 + 1-4) → 1/6（元1/4の2/3）
        const rawGrowth = (Math.floor(Math.random() * 3) + 1 + Math.floor(Math.random() * 4) + 1) * ageMultiplier;
        const growth = Math.max(1, Math.round(rawGrowth * 0.167));
        const before = pitch.level;
        pitch.level = before + growth; // 上限なし
        growthReport.push({
          stat: 'breaking',
          statName: `${getPitchTypeName(pitch.type)}`,
          before, after: pitch.level, growth: pitch.level - before, isAwakening: false
        });
      });
    }
    return { player: updatedPlayer, growthReport };
  }

  // 新球種習得の場合
  if (trainingType === 'newpitch') {
    const arsenal = updatedPlayer.pitching?.arsenal || [];
    const existingTypes = arsenal.map(p => p.type);
    const targetType = newPitchType || ALL_PITCH_TYPES.find(t => !existingTypes.includes(t));
    if (targetType && !existingTypes.includes(targetType)) {
      const newId = arsenal.length > 0 ? Math.max(...arsenal.map(a => a.id)) + 1 : 1;
      const startLevel = Math.floor(Math.random() * 10) + 10; // 10-19
      arsenal.push({ id: newId, type: targetType, level: startLevel });
      updatedPlayer.pitching.arsenal = arsenal;
      growthReport.push({
        stat: 'newpitch',
        statName: `${getPitchTypeName(targetType)}習得`,
        before: 0, after: startLevel, growth: startLevel, isAwakening: false
      });
    } else {
      growthReport.push({
        stat: 'newpitch',
        statName: '習得失敗（全球種習得済み）',
        before: 0, after: 0, growth: 0, isAwakening: false
      });
    }
    return { player: updatedPlayer, growthReport };
  }

  // 通常の能力練習（成長量1/6 = 元1/4の2/3）
  menu.targets.forEach(targetStat => {
    const isPhysical = PHYSICAL_STATS.includes(targetStat);
    const ageBase = getAgeGrowthBase(age, isPhysical);
    const ageMultiplier = Math.max(0.3, 1.0 + ageBase * 0.15);
    const posBonus = getPositionGrowthBonus(player, targetStat);
    const boBonus = getBattingOrderGrowthBonus(player, targetStat);
    const expBonus = posBonus * boBonus;

    // 元の成長量を1/6に: (base + focus) * 0.167（元1/4の2/3）
    const rawBase = (Math.floor(Math.random() * 3) + 1) * ageMultiplier * expBonus;
    const rawFocus = (Math.floor(Math.random() * 4) + 1) * ageMultiplier * expBonus;
    const baseGrowth = Math.round((rawBase + rawFocus) * 0.167);

    // 覚醒判定
    const awakeningChance = Math.floor(experience / 10);
    const isAwakening = Math.random() * 100 < awakeningChance;
    const awakeningGrowth = isAwakening ? Math.round((Math.floor(Math.random() * 10) + 5) * 0.167) : 0;

    const statPath = getStatPath(targetStat);
    if (statPath) {
      const currentValue = getNestedValue(updatedPlayer, statPath) || 50;

      // 高能力値の成長減衰（覚醒分は減衰しない）
      let adjustedBaseGrowth = baseGrowth;
      if (targetStat === 'velocity') {
        // 球速155km以上は伸びにくくなる（超過1kmごとに成長量20%減衰）
        if (currentValue >= 155) {
          const overAmount = currentValue - 155;
          const dampFactor = Math.max(0.1, 1.0 - overAmount * 0.2);
          adjustedBaseGrowth = Math.max(0, Math.round(baseGrowth * dampFactor));
        }
      } else {
        // 球速以外: 能力値80以上で伸びにくくなる（超過1ごとに成長量3%減衰）
        if (currentValue >= 80) {
          const overAmount = currentValue - 80;
          const dampFactor = Math.max(0.1, 1.0 - overAmount * 0.03);
          adjustedBaseGrowth = Math.max(0, Math.round(baseGrowth * dampFactor));
        }
      }

      const totalGrowth = Math.max(0, adjustedBaseGrowth + awakeningGrowth);
      const newValue = currentValue + totalGrowth;
      updatedPlayer = setNestedValue(updatedPlayer, statPath, newValue);
      growthReport.push({
        stat: targetStat,
        statName: getStatName(targetStat),
        before: currentValue, after: newValue,
        growth: newValue - currentValue, isAwakening
      });
    }
  });

  // 経験値を消費（練習に使った分の一部をリセット）
  updatedPlayer.experience = Math.floor(experience * 0.3);
  updatedPlayer.positionExperience = {};
  updatedPlayer.battingOrderExperience = {};

  return { player: updatedPlayer, growthReport };
}

/**
 * 球種名を取得
 */
function getPitchTypeName(type) {
  const names = {
    straight: 'ストレート', slider: 'スライダー', curve: 'カーブ',
    fork: 'フォーク', changeup: 'チェンジアップ', sinker: 'シンカー',
    shoot: 'シュート', cutter: 'カッター', splitter: 'スプリッター',
    twoSeam: 'ツーシーム', palm: 'パーム', knuckle: 'ナックル'
  };
  return names[type] || type;
}
export { ALL_PITCH_TYPES, getPitchTypeName };

/**
 * チーム全体のキャンプ練習を実行
 * @param {Object} team - チームデータ
 * @param {Object} trainingAssignments - { playerId: trainingType } の形式
 * @param {Object} [newPitchSelections] - { playerId: pitchType } 新球種選択
 * @returns {Object} - { updatedTeam, allReports }
 */
export function executeTeamCampTraining(team, trainingAssignments, newPitchSelections = {}) {
  const allReports = [];
  const updatedPlayers = team.players.map(player => {
    const trainingType = trainingAssignments[player.id];
    if (!trainingType) {
      const autoTraining = player.position === 'pitcher' ? 'stamina' : 'batting';
      const { player: trained, growthReport } = executeCampTraining(player, autoTraining);
      allReports.push({ player: trained, trainingType: autoTraining, growthReport });
      return trained;
    }

    const newPitchType = trainingType === 'newpitch' ? newPitchSelections[player.id] : undefined;
    const { player: trained, growthReport } = executeCampTraining(player, trainingType, newPitchType);
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

// ============================================================
// 派遣システム（大学・プロキャンプ）
// キャンプ期間中に若くて能力の低い選手を派遣
// キャンプ練習の代わりに大幅パワーアップして即帰還
// ============================================================

/** 派遣先の定義 */
export const DISPATCH_DESTINATIONS = {
  university: {
    name: '大学野球留学',
    icon: '🎓',
    desc: 'キャンプ期間に大学で集中特訓。フィジカルが大きく伸びる',
    maxAge: 22,         // 22歳以下
    maxOverall: 55,     // 総合力55以下
    growthProfile: 'physical', // フィジカル系メイン
  },
  proCamp: {
    name: 'プロ研修',
    icon: '🏟️',
    desc: 'キャンプ期間にプロ球団で特訓。技術系が大きく伸びる',
    maxAge: 24,         // 24歳以下
    maxOverall: 50,     // 総合力50以下
    growthProfile: 'technical', // 技術系メイン
  },
};

/**
 * 選手の総合力を計算（派遣適格判定用）
 * 投手: (velocity-115)*1.5 + control + stamina/3 を3で割った平均
 * 野手: (meet + power + speed + defense) / 4
 */
export function calcPlayerOverall(player) {
  if (player.position === 'pitcher') {
    const vel = ((player.pitching?.velocity || 130) - 115) * 1.5;
    const ctrl = player.pitching?.control || 40;
    const sta = (player.pitching?.stamina || 80) / 3;
    return Math.round((vel + ctrl + sta) / 3);
  } else {
    const meet = player.batting?.meet || 30;
    const power = player.batting?.power || 30;
    const speed = player.physical?.speed || 30;
    const defense = player.fielding?.defense || 30;
    return Math.round((meet + power + speed + defense) / 4);
  }
}

/** 派遣枠の上限 */
export const DISPATCH_LIMITS = {
  perTeamPerDest: 1,  // 各チーム、各派遣先に1人ずつ
  leagueTotal: 8,     // リーグ全体で合計8人
};

/**
 * 派遣可能かどうか判定
 * @param {Object} player - 選手データ
 * @param {string} destKey - 派遣先キー ('university' or 'proCamp')
 * @param {Object} options - { teamPlayers, allTeams }
 *   teamPlayers: 同じチームの選手配列（チーム枠判定用）
 *   allTeams: 全チームデータ（リーグ枠判定用）TEAMS_DATAオブジェクト
 * @returns {{ eligible: boolean, reason: string }}
 */
export function checkDispatchEligibility(player, destKey, options = {}) {
  const dest = DISPATCH_DESTINATIONS[destKey];
  if (!dest) return { eligible: false, reason: '不明な派遣先' };

  if (player.dispatchedThisCamp) return { eligible: false, reason: '今キャンプで派遣済み' };
  if ((player.age || 20) > dest.maxAge) return { eligible: false, reason: `${dest.maxAge}歳以下のみ` };

  const overall = calcPlayerOverall(player);
  if (overall > dest.maxOverall) return { eligible: false, reason: `総合力${dest.maxOverall}以下のみ (現在${overall})` };

  // チーム内の同派遣先の枠チェック
  const teamPlayers = options.teamPlayers || [];
  const teamDestCount = teamPlayers.filter(p => p.dispatchedThisCamp === destKey).length;
  if (teamDestCount >= DISPATCH_LIMITS.perTeamPerDest) {
    return { eligible: false, reason: `${dest.name}の枠は各チーム${DISPATCH_LIMITS.perTeamPerDest}人まで` };
  }

  // リーグ全体の派遣枠チェック
  if (options.allTeams) {
    let leagueTotal = 0;
    Object.values(options.allTeams).forEach(team => {
      (team.players || []).forEach(p => {
        if (p.dispatchedThisCamp) leagueTotal++;
      });
    });
    if (leagueTotal >= DISPATCH_LIMITS.leagueTotal) {
      return { eligible: false, reason: `リーグ全体の派遣枠(${DISPATCH_LIMITS.leagueTotal}人)が満員` };
    }
  }

  return { eligible: true, reason: '' };
}

/**
 * 選手をキャンプ中に派遣し、即座に大幅成長させて帰還させる
 * キャンプ練習の代わりとして使う（派遣した選手は通常練習不可）
 * @param {Object} player - 選手データ（直接変更）
 * @param {string} destKey - 派遣先キー
 * @returns {{ growthReport: Array }} 成長レポート
 */
export function executeDispatchTraining(player, destKey) {
  const dest = DISPATCH_DESTINATIONS[destKey];
  if (!dest) return { growthReport: [] };

  const growthReport = [];

  if (player.position === 'pitcher') {
    if (dest.growthProfile === 'technical') {
      // 大学: 制球と変化球が大幅UP、球速も少し
      const ctrlGrowth = Math.floor(Math.random() * 10) + 8; // +8~17
      const before = player.pitching.control;
      player.pitching.control = Math.min(99, before + ctrlGrowth);
      growthReport.push({ statName: '制球', before, after: player.pitching.control, growth: player.pitching.control - before });

      const velGrowth = Math.floor(Math.random() * 3) + 1; // +1~3
      const vBefore = player.pitching.velocity;
      player.pitching.velocity = Math.max(vBefore, Math.min(155, vBefore + velGrowth));
      growthReport.push({ statName: '球速', before: vBefore, after: player.pitching.velocity, growth: player.pitching.velocity - vBefore });

      // 変化球レベルUP
      const arsenal = player.pitching?.arsenal || [];
      arsenal.filter(p => p.type !== 'straight').forEach(pitch => {
        const pGrowth = Math.floor(Math.random() * 8) + 5;
        const pBefore = pitch.level;
        pitch.level = pBefore + pGrowth;
        growthReport.push({ statName: `${getPitchTypeName(pitch.type)}`, before: pBefore, after: pitch.level, growth: pitch.level - pBefore });
      });

      // スタミナも少し
      const staBefore = player.pitching.stamina;
      const staGrowth = Math.floor(Math.random() * 10) + 5;
      player.pitching.stamina = Math.min(200, staBefore + staGrowth);
      growthReport.push({ statName: 'スタミナ', before: staBefore, after: player.pitching.stamina, growth: player.pitching.stamina - staBefore });
    } else {
      // プロ研修: 球速が劇的UP、スタミナも
      const velGrowth = Math.floor(Math.random() * 5) + 4; // +4~8
      const vBefore = player.pitching.velocity;
      player.pitching.velocity = Math.max(vBefore, Math.min(158, vBefore + velGrowth));
      growthReport.push({ statName: '球速', before: vBefore, after: player.pitching.velocity, growth: player.pitching.velocity - vBefore });

      const staGrowth = Math.floor(Math.random() * 15) + 10;
      const staBefore = player.pitching.stamina;
      player.pitching.stamina = Math.min(200, staBefore + staGrowth);
      growthReport.push({ statName: 'スタミナ', before: staBefore, after: player.pitching.stamina, growth: player.pitching.stamina - staBefore });

      const ctrlGrowth = Math.floor(Math.random() * 4) + 2;
      const cBefore = player.pitching.control;
      player.pitching.control = Math.min(99, cBefore + ctrlGrowth);
      growthReport.push({ statName: '制球', before: cBefore, after: player.pitching.control, growth: player.pitching.control - cBefore });
    }
  } else {
    // 野手
    if (dest.growthProfile === 'technical') {
      // 大学: ミート・選球眼・守備が大幅UP
      const meetGrowth = Math.floor(Math.random() * 10) + 8;
      const mBefore = player.batting.meet;
      player.batting.meet = Math.min(99, mBefore + meetGrowth);
      growthReport.push({ statName: 'ミート', before: mBefore, after: player.batting.meet, growth: player.batting.meet - mBefore });

      const eyeGrowth = Math.floor(Math.random() * 8) + 6;
      const eBefore = player.batting.eye;
      player.batting.eye = Math.min(99, eBefore + eyeGrowth);
      growthReport.push({ statName: '選球眼', before: eBefore, after: player.batting.eye, growth: player.batting.eye - eBefore });

      const defGrowth = Math.floor(Math.random() * 6) + 5;
      const dBefore = player.fielding.defense;
      player.fielding.defense = Math.min(99, dBefore + defGrowth);
      growthReport.push({ statName: '守備', before: dBefore, after: player.fielding.defense, growth: player.fielding.defense - dBefore });

      // パワーも少し
      const powGrowth = Math.floor(Math.random() * 4) + 2;
      const pBefore = player.batting.power;
      player.batting.power = Math.min(99, pBefore + powGrowth);
      growthReport.push({ statName: 'パワー', before: pBefore, after: player.batting.power, growth: player.batting.power - pBefore });
    } else {
      // プロ研修: パワー・走力・肩が劇的UP
      const powGrowth = Math.floor(Math.random() * 10) + 8;
      const pBefore = player.batting.power;
      player.batting.power = Math.min(99, pBefore + powGrowth);
      growthReport.push({ statName: 'パワー', before: pBefore, after: player.batting.power, growth: player.batting.power - pBefore });

      const spdGrowth = Math.floor(Math.random() * 8) + 6;
      const sBefore = player.physical.speed;
      player.physical.speed = Math.min(99, sBefore + spdGrowth);
      growthReport.push({ statName: '走力', before: sBefore, after: player.physical.speed, growth: player.physical.speed - sBefore });

      const armGrowth = Math.floor(Math.random() * 6) + 4;
      const aBefore = player.physical.arm;
      player.physical.arm = Math.min(99, aBefore + armGrowth);
      growthReport.push({ statName: '肩力', before: aBefore, after: player.physical.arm, growth: player.physical.arm - aBefore });

      // ミートも少し
      const meetGrowth = Math.floor(Math.random() * 4) + 2;
      const mBefore = player.batting.meet;
      player.batting.meet = Math.min(99, mBefore + meetGrowth);
      growthReport.push({ statName: 'ミート', before: mBefore, after: player.batting.meet, growth: player.batting.meet - mBefore });
    }
  }

  // 覚醒チャンス: 20%の確率でランダムな能力が大幅UP
  if (Math.random() < 0.2) {
    if (player.position === 'pitcher') {
      const awakeStats = [
        { path: 'pitching.velocity', name: '球速', max: 160 },
        { path: 'pitching.control', name: '制球', max: 99 },
      ];
      const pick = awakeStats[Math.floor(Math.random() * awakeStats.length)];
      const current = getNestedValue(player, pick.path) || 50;
      const bonus = Math.floor(Math.random() * 8) + 5; // +5~12
      const newVal = Math.min(pick.max, current + bonus);
      setNestedValueMut(player, pick.path, newVal);
      growthReport.push({ statName: `${pick.name}(覚醒!)`, before: current, after: newVal, growth: newVal - current, isAwakening: true });
    } else {
      const awakeStats = [
        { path: 'batting.meet', name: 'ミート', max: 99 },
        { path: 'batting.power', name: 'パワー', max: 99 },
        { path: 'physical.speed', name: '走力', max: 99 },
      ];
      const pick = awakeStats[Math.floor(Math.random() * awakeStats.length)];
      const current = getNestedValue(player, pick.path) || 30;
      const bonus = Math.floor(Math.random() * 8) + 5;
      const newVal = Math.min(pick.max, current + bonus);
      setNestedValueMut(player, pick.path, newVal);
      growthReport.push({ statName: `${pick.name}(覚醒!)`, before: current, after: newVal, growth: newVal - current, isAwakening: true });
    }
  }

  // 派遣済みフラグ（派遣先キーを格納）
  player.dispatchedThisCamp = destKey;

  return { growthReport };
}

/** ミュータブルなsetNestedValue（player直接変更用） */
function setNestedValueMut(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}
