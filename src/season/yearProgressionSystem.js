// ============================================================
// 年間進行システム - yearProgressionSystem.js
// シーズン終了処理、年度更新、引退、解雇
// 年齢カーブによる成長・衰退システム
// ============================================================

import { createSeasonData, initializeStandings } from './seasonManager.js';
import { generateFullSeasonSchedule } from './scheduleGenerator.js';
import { PHYSICAL_STATS, TECHNICAL_STATS, getAgeGrowthBase, getStatPath, getStatName, getNestedValue, setNestedValue } from './growthUtils.js';
export { TRAINING_MENUS, SUB_TRAINING_MENUS, executeTeamCampTraining, executeSubTraining, executeCampTraining, ALL_PITCH_TYPES, getPitchTypeName, FORM_PITCH_AFFINITY, calculateSeasonExperience, updateAllPlayersExperience } from './campTraining.js';
export { DISPATCH_DESTINATIONS, DISPATCH_LIMITS, calcPlayerOverall, checkDispatchEligibility, executeDispatchTraining, resolveDispatchTraining } from './dispatchSystem.js';

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

function collectAllPlayers(allTeams) {
  const allPlayers = [];
  const seenIds = new Set();
  Object.entries(allTeams).forEach(([teamName, team]) => {
    team.players.forEach(player => {
      if (player.id != null && seenIds.has(player.id)) return;
      if (player.id != null) seenIds.add(player.id);
      allPlayers.push({ ...player, teamName });
    });
  });
  return allPlayers;
}

/**
 * シーズン終了処理
 */
export function processSeasonEnd(seasonData, allTeams) {
  const awards = {
    champion: null, battingChampion: null, homeRunKing: null,
    rbiKing: null, stolenBaseKing: null, eraChampion: null,
    winsLeader: null, savesLeader: null, strikeoutKing: null
  };

  if (seasonData.standings && seasonData.standings.length > 0) {
    const sortedStandings = [...seasonData.standings].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      return b.winRate - a.winRate;
    });
    awards.champion = sortedStandings[0].team;
  }

  const allPlayers = collectAllPlayers(allTeams);
  const qualifiedBatters = allPlayers.filter(p => p.seasonStats.batting.atBats >= 100);
  const qualifiedPitchers = allPlayers.filter(p => p.seasonStats.pitching.inningsPitched >= 30);

  const findLeader = (players, getValue, ascending = false) => {
    if (players.length === 0) return null;
    return players.reduce((best, p) =>
      ascending ? (getValue(p) < getValue(best) ? p : best) : (getValue(p) > getValue(best) ? p : best)
    );
  };
  const toAward = (player, statObj) => player ? { id: player.id, name: player.name, team: player.teamName, ...statObj } : null;
  const getBattingAvg = (p) => p.seasonStats.batting.atBats > 0 ? p.seasonStats.batting.hits / p.seasonStats.batting.atBats : 0;
  const getEra = (p) => p.seasonStats.pitching.inningsPitched > 0 ? (p.seasonStats.pitching.earnedRuns * 27) / p.seasonStats.pitching.inningsPitched : 99.99;

  if (qualifiedBatters.length > 0) {
    const ba = findLeader(qualifiedBatters, getBattingAvg);
    awards.battingChampion = toAward(ba, { avg: getBattingAvg(ba).toFixed(3) });
    const hr = findLeader(qualifiedBatters, p => p.seasonStats.batting.homeruns);
    awards.homeRunKing = toAward(hr, { homeruns: hr.seasonStats.batting.homeruns });
    const rbi = findLeader(qualifiedBatters, p => p.seasonStats.batting.rbis);
    awards.rbiKing = toAward(rbi, { rbis: rbi.seasonStats.batting.rbis });
    const sb = findLeader(qualifiedBatters, p => p.seasonStats.batting.stolenBases);
    awards.stolenBaseKing = toAward(sb, { stolenBases: sb.seasonStats.batting.stolenBases });
  }

  if (qualifiedPitchers.length > 0) {
    const eraL = findLeader(qualifiedPitchers, getEra, true);
    awards.eraChampion = toAward(eraL, { era: getEra(eraL).toFixed(2) });
    const winsL = findLeader(qualifiedPitchers, p => p.seasonStats.pitching.wins);
    awards.winsLeader = toAward(winsL, { wins: winsL.seasonStats.pitching.wins });
    const soL = findLeader(qualifiedPitchers, p => p.seasonStats.pitching.strikeouts);
    awards.strikeoutKing = toAward(soL, { strikeouts: soL.seasonStats.pitching.strikeouts });
  }

  const savesL = findLeader(allPlayers, p => p.seasonStats.pitching.saves || 0);
  if (savesL && (savesL.seasonStats.pitching.saves || 0) > 0) {
    awards.savesLeader = toAward(savesL, { saves: savesL.seasonStats.pitching.saves });
  }

  return awards;
};

/**
 * ランキングのスナップショットを生成（シーズン確定時に呼び出し）
 * プレーオフ後にseasonDataに保存し、選手が引退/解雇されても成績が残る
 */
export function snapshotRankings(allTeams) {
  const allPlayers = collectAllPlayers(allTeams);

  const buildRanking = (filterFn, getValue, formatValue, ascending = false) => {
    return allPlayers.filter(filterFn)
      .map(p => {
        const sv = getValue(p);
        return { rank: 0, name: p.name, team: p.teamName, value: formatValue ? formatValue(sv) : sv, sortValue: sv };
      })
      .sort((a, b) => ascending ? a.sortValue - b.sortValue : b.sortValue - a.sortValue)
      .slice(0, 10)
      .map((p, i) => ({ ...p, rank: i + 1 }));
  };

  const hasBatAB = p => p.seasonStats?.batting?.atBats > 0;
  const hasIP = p => p.seasonStats?.pitching?.inningsPitched > 0;

  return {
    battingAverage: buildRanking(hasBatAB, p => p.seasonStats.batting.hits / p.seasonStats.batting.atBats, v => v.toFixed(3)),
    homeRuns: buildRanking(p => p.seasonStats?.batting?.homeruns > 0, p => p.seasonStats.batting.homeruns),
    rbis: buildRanking(p => p.seasonStats?.batting?.rbis > 0, p => p.seasonStats.batting.rbis),
    stolenBases: buildRanking(p => p.seasonStats?.batting?.stolenBases > 0, p => p.seasonStats.batting.stolenBases),
    era: buildRanking(hasIP, p => (p.seasonStats.pitching.earnedRuns * 27) / p.seasonStats.pitching.inningsPitched, v => v.toFixed(2), true),
    wins: buildRanking(p => p.seasonStats?.pitching?.wins > 0, p => p.seasonStats.pitching.wins),
    holds: buildRanking(p => p.seasonStats?.pitching?.holds > 0, p => p.seasonStats.pitching.holds),
    saves: buildRanking(p => p.seasonStats?.pitching?.saves > 0, p => p.seasonStats.pitching.saves),
  };
}

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
  const ageBonusMap = { 18: 25, 19: 20, 20: 15, 21: 10, 22: 0, 23: -5, 24: -10, 25: -15, 26: -20, 27: -30, 28: -40, 29: -50 };
  const ageBonus = ageBonusMap[age] !== undefined ? ageBonusMap[age] : (age < 18 ? 25 : -50);

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
  const bonusMap = {};
  const addBonus = (playerId, points, awardName) => {
    if (!bonusMap[playerId]) bonusMap[playerId] = { bonus: 0, awards: [] };
    bonusMap[playerId].bonus += points;
    bonusMap[playerId].awards.push(awardName);
  };

  const allPlayers = [];
  Object.values(allTeams).forEach(team => {
    if (!team.players) return;
    team.players.forEach(p => { if (p.seasonStats) allPlayers.push(p); });
  });

  const getBattingAvg = p => p.seasonStats.batting.atBats > 0 ? p.seasonStats.batting.hits / p.seasonStats.batting.atBats : 0;
  const getEra = p => p.seasonStats.pitching.inningsPitched > 0 ? (p.seasonStats.pitching.earnedRuns * 27) / p.seasonStats.pitching.inningsPitched : 99.99;

  const awardRanking = (players, getValue, title, ascending = false) => {
    if (players.length === 0) return;
    const sorted = [...players].sort((a, b) => ascending ? getValue(a) - getValue(b) : getValue(b) - getValue(a));
    addBonus(sorted[0].id, 10, `${title}1位`);
    if (sorted.length >= 2) addBonus(sorted[1].id, 5, `${title}2位`);
  };

  const qualifiedBatters = allPlayers.filter(p => p.seasonStats?.batting?.atBats >= 100);
  awardRanking(qualifiedBatters, getBattingAvg, '首位打者');
  awardRanking(qualifiedBatters, p => p.seasonStats.batting.homeruns || 0, '本塁打王');
  awardRanking(qualifiedBatters, p => p.seasonStats.batting.rbis || 0, '打点王');
  awardRanking(qualifiedBatters, p => p.seasonStats.batting.stolenBases || 0, '盗塁王');

  const qualifiedPitchers = allPlayers.filter(p => p.seasonStats?.pitching?.inningsPitched >= 30);
  awardRanking(qualifiedPitchers, getEra, '最優秀防御率', true);
  awardRanking(qualifiedPitchers, p => p.seasonStats.pitching.wins || 0, '最多勝');
  awardRanking(qualifiedPitchers, p => p.seasonStats.pitching.strikeouts || 0, '最多奪三振');

  const savePitchers = allPlayers.filter(p => (p.seasonStats?.pitching?.saves || 0) > 0);
  awardRanking(savePitchers, p => p.seasonStats.pitching.saves || 0, '最多セーブ');

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
      players: team.players.map(player => finalizePlayerSeason(player, year))
    };
  });

  return updatedTeams;
};

/**
 * 選手1人分のシーズン終了処理（シーズン成績→通算加算、履歴追加、リセット）
 * resetSeasonStats の中身を1選手向けに抽出したもの。
 * 解雇プールに入る選手など、TEAMS_DATA の外でもシーズン終了処理を適用するために使う。
 * @param {Object} player - 選手オブジェクト
 * @param {number} year - シーズン年
 * @returns {Object} - シーズン終了処理済みの選手オブジェクト（新しいインスタンス）
 */
export function finalizePlayerSeason(player, year) {
  // 既に同じ年で終了処理済みの選手はそのまま返す
  // （解雇→再トライアウトで別チームに拾われた選手が、オフシーズンの resetSeasonStats で
  //  再度シーズン終了処理されるのを防ぐ）
  if (player.seasonFinalizedYear && player.seasonFinalizedYear === year) {
    return player;
  }
  const cb = player.careerStats?.batting || {};
  const sb = player.seasonStats?.batting || {};
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

  const cp = player.careerStats?.pitching || {};
  const sp = player.seasonStats?.pitching || {};
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

  const statsHistoryEntry = {
    year: year || '?',
    batting: JSON.parse(JSON.stringify(player.seasonStats?.batting || {})),
    pitching: JSON.parse(JSON.stringify(player.seasonStats?.pitching || {})),
    abilities: {
      meet: player.batting?.meet || 0,
      power: player.batting?.power || 0,
      speed: player.physical?.speed || 0,
      arm: player.physical?.arm || 0,
      defense: player.fielding?.defense || 0,
      eye: player.batting?.eye || 0,
      steal: player.batting?.steal || 0,
      velocity: player.pitching?.velocity || 0,
      control: player.pitching?.control || 0,
      stamina: player.pitching?.stamina || 0,
      catcherLead: player.catching?.lead,
      arsenal: player.pitching?.arsenal ? JSON.parse(JSON.stringify(player.pitching.arsenal)) : [],
      age: player.age || 0
    }
  };
  const existingHistory = player.statsHistory || [];
  return {
    ...player,
    seasonFinalizedYear: year || '?',
    statsHistory: [...existingHistory, statsHistoryEntry],
    previousSeasonStats: JSON.parse(JSON.stringify(player.seasonStats || {})),
    careerStats: {
      batting: updatedCareerBatting,
      pitching: updatedCareerPitching
    },
    seasonStats: {
      batting: { games: 0, atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0, errors: 0, fieldingChances: 0 },
      pitching: { games: 0, wins: 0, losses: 0, saves: 0, holds: 0, inningsPitched: 0, runsAllowed: 0, earnedRuns: 0, hits: 0, homeruns: 0, walks: 0, strikeouts: 0, pitches: 0, qualityStarts: 0, highQualityStarts: 0 }
    }
  };
}

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
 * 成長率変動の更新（シーズン終了時に呼び出し）
 * - 疲労酷使: 高疲労で出場し続けた選手は成長率ダウン
 * - 優勝経験: 優勝チーム全員+0.05
 */
export function updateGrowthModifiers(allTeams, awards) {
  const championTeam = awards?.champion;

  Object.entries(allTeams).forEach(([teamName, team]) => {
    if (!team.players) return;
    const isChampion = teamName === championTeam;

    team.players.forEach(player => {
      // 前年の変動は半減して引き継ぎ（徐々にゼロに戻る）
      let modifier = (player.growthModifier || 0) * 0.5;

      const fatigue = player.fatigue || 0;
      const battingGames = player.seasonStats?.batting?.games || 0;
      const pitchingGames = player.seasonStats?.pitching?.games || 0;
      const totalGames = Math.max(battingGames, pitchingGames);

      if (fatigue >= 120 && totalGames >= 40) {
        modifier -= 0.10;
      } else if (fatigue >= 100 && totalGames >= 35) {
        modifier -= 0.05;
      }

      if (isChampion) {
        modifier += 0.05;
      }

      player.growthModifier = Math.max(-0.3, Math.round(modifier * 100) / 100);
    });
  });
}

/**
 * 次年度への完全移行
 * @param {Object} seasonData - 現在のシーズンデータ
 * @param {Object} allTeams - 全チームデータ
 * @returns {Object} - { newSeasonData, updatedTeams, awards, retirements }
 */
export function advanceToNextYear(seasonData, allTeams) {
  // 1. シーズン終了処理（表彰）
  // ドラフト前にfrozenAwardsが確定済みならそれを使用（指名選手がランキングから消えるのを防ぐ）
  const awards = seasonData.frozenAwards || processSeasonEnd(seasonData, allTeams);

  // 2. タイトルを選手に記録
  let updatedTeams = recordAwardsToPlayers(allTeams, awards);

  // 2.5. 成長率変動を更新（疲労酷使ペナルティ・優勝ボーナス）
  updateGrowthModifiers(updatedTeams, awards);

  // 2.8. ランキングをスナップショット（ドラフト前に確定済みならそのまま使用）
  if (!seasonData.finalRankings) {
    seasonData.finalRankings = snapshotRankings(updatedTeams);
  }

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

  // 年齢カーブの結果を新シーズンデータに保存（キャンプ画面で表示用）
  newSeasonData.ageReports = ageReports;

  return {
    newSeasonData,
    updatedTeams: teamsAfterRetirement,
    awards,
    retirements,
    ageReports
  };
};

/**
 * 箱庭モード用の次年度移行
 * 成長・加齢・引退をスキップし、表彰とスタッツリセットのみ行う
 * @param {Object} seasonData - 現在のシーズンデータ
 * @param {Object} allTeams - 全チームデータ
 * @returns {Object} - { newSeasonData, updatedTeams, awards, retirements: [] }
 */
export function advanceToNextYearSandbox(seasonData, allTeams) {
  // 1. シーズン終了処理（表彰）- 確定済みのfrozenAwardsがあればそれを使用
  const awards = seasonData.frozenAwards || processSeasonEnd(seasonData, allTeams);

  // 2. タイトルを選手に記録
  let updatedTeams = recordAwardsToPlayers(allTeams, awards);

  // 3. シーズン統計を通算に加算してリセット
  updatedTeams = resetSeasonStats(updatedTeams, seasonData.year);

  // 箱庭モード: 加齢・成長・引退はスキップ

  // 4. 新シーズンデータ作成
  const newYear = seasonData.year + 1;
  const newSeasonData = createSeasonData(newYear);
  newSeasonData.settings = { ...seasonData.settings };

  const teams = Object.keys(updatedTeams);
  newSeasonData.schedule = [];
  newSeasonData.standings = initializeStandings(teams);

  return {
    newSeasonData,
    updatedTeams,
    awards,
    retirements: [],
    ageReports: {}
  };
};

// ============================================================
// 年齢カーブによる成長・衰退システム
// 若い: フィジカル成長しやすい、24歳前後: 技術が伸びやすい
// 28歳前後: 微成長、32歳: 衰え開始、36歳: 顕著な衰え
// ただし個人差が大きく、例外的な選手も出る
// ============================================================


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
          const variance = normalRandom * 1.0;

          // 才能依存の能力は年齢カーブでの成長も抑制（衰退方向は通常通り）
          const AGE_TALENT_MULT = { arm: 0.5, speed: 0.6, power: 0.8, velocity: 0.8 };
          const ageTalentMult = AGE_TALENT_MULT[stat] ?? 1.0;

          const potential = Math.max(0.3, Math.min(1.8, (player.growthPotential ?? 1.0) + (player.growthModifier || 0)));
          // 最終変動値（四捨五入、±0の場合もある）
          let rawChange = base + variance;
          // 成長方向のみ才能補正+成長ポテンシャル（衰退はそのまま）
          let change = rawChange > 0
            ? Math.round(rawChange * ageTalentMult * potential)
            : Math.round(rawChange);

          // 能力値を取得・更新
          const statPath = getStatPath(stat);
          if (!statPath) return;

          const currentValue = getNestedValue(updatedPlayer, statPath);
          if (currentValue == null) return;

          // 球速は変動幅を1.2倍に（スケールが大きいため）
          if (stat === 'velocity') change = rawChange > 0
            ? Math.round(rawChange * 1.2 * ageTalentMult * potential)
            : Math.round(rawChange * 1.2);
          // スタミナも変動幅を1.2倍（成長方向のみポテンシャル適用）
          if (stat === 'stamina') change = rawChange > 0
            ? Math.round(rawChange * 1.2 * potential)
            : Math.round(rawChange * 1.2);

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



/**
 * シーズン開始時に全選手の能力値をスナップショットとして記録
 * キャンプ完了（開幕直前）に呼び出す
 */
export function snapshotAbilityHistory(allTeams, year) {
  Object.values(allTeams).forEach(team => {
    if (!team.players) return;
    team.players.forEach(player => {
      if (!player.growthHistory) player.growthHistory = [];
      // 同じ年の記録が既にあれば上書き
      const existing = player.growthHistory.findIndex(h => h.year === year);
      const snapshot = {
        year,
        meet:     player.batting?.meet     || 0,
        power:    player.batting?.power    || 0,
        speed:    player.physical?.speed   || 0,
        arm:      player.physical?.arm     || 0,
        defense:  player.fielding?.defense || 0,
        velocity: player.pitching?.velocity || 0,
        control:  player.pitching?.control  || 0,
        stamina:  player.pitching?.stamina  || 0,
      };
      if (existing !== -1) {
        player.growthHistory[existing] = snapshot;
      } else {
        player.growthHistory.push(snapshot);
      }
    });
  });
}
