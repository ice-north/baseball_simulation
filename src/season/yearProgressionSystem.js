// ============================================================
// 年間進行システム - yearProgressionSystem.js
// シーズン終了処理、年度更新、引退、解雇
// 年齢カーブによる成長・衰退システム
// ============================================================

import { createSeasonData, initializeStandings } from './seasonManager.js';
import { generateFullSeasonSchedule } from './scheduleGenerator.js';
import { PHYSICAL_STATS, TECHNICAL_STATS, getAgeGrowthBase, getStatPath, getStatName, getNestedValue, setNestedValue } from './growthUtils.js';
import { PITCHING_FORM_EFFECTS } from '../utils/constants.js';
import { generateHighSchoolClass, assignCareerPaths, enrollInUniversity, processUniversityYear, universityPool, highSchoolPool, processHighSchoolNPBDraft, distributeHighSchoolGraduates } from './universityPool.js';
import { initializeUniversityLeagues } from '../university/universityLeagueManager.js';
import { getUniversityLeagueSchedule, getUniversityLeagueStandings } from '../university/universityInit.js';
import { WORLD_DATA } from '../corporate/worldData.js';
import { releasedPlayersPool, TEAMS_DATA } from '../teams-data.js';
import { updateAllTeamReputations, updateAllRanks, advanceSponsors } from '../corporate/corporateInit.js';
import { extractTournamentSeeds } from '../corporate/toshitaikou.js';
import { advanceStaffYear } from '../corporate/staffData.js';
import { generateRandomPlayerName } from '../data/playerNames.js';
export { TRAINING_MENUS, SUB_TRAINING_MENUS, executeTeamCampTraining, executeSubTraining, executeCampTraining, ALL_PITCH_TYPES, getPitchTypeName, FORM_PITCH_AFFINITY, calculateSeasonExperience, updateAllPlayersExperience, applyMotivationEffect, applyBatteryMentalEffect } from './campTraining.js';
export { DISPATCH_DESTINATIONS, DISPATCH_LIMITS, calcPlayerOverall, checkDispatchEligibility, executeDispatchTraining, resolveDispatchTraining } from './dispatchSystem.js';

/**
 * 4月: 高校3年生を生成して高校生プールに格納
 * シーズン開始時に呼び出される
 * @param {number} year - ゲーム内年度
 * @returns {number} 生成人数
 */
export function generateAprilHighSchoolClass(year) {
  if (highSchoolPool.year === year && highSchoolPool.players.length > 0) {
    return highSchoolPool.players.length;
  }
  const players = generateHighSchoolClass(year, 1500);
  highSchoolPool.players = players;
  highSchoolPool.year = year;
  return players.length;
}

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

  const getOPS = p => {
    const s = p.seasonStats.batting;
    const obp = (s.hits + s.walks) / (s.atBats + s.walks);
    const totalBases = (s.hits - (s.doubles || 0) - (s.triples || 0) - s.homeruns) + (s.doubles || 0) * 2 + (s.triples || 0) * 3 + s.homeruns * 4;
    return obp + totalBases / s.atBats;
  };
  const getWHIP = p => {
    const s = p.seasonStats.pitching;
    return ((s.hits || 0) + (s.walks || 0)) / (s.inningsPitched / 3);
  };

  return {
    battingAverage: buildRanking(hasBatAB, p => p.seasonStats.batting.hits / p.seasonStats.batting.atBats, v => v.toFixed(3)),
    homeRuns: buildRanking(p => p.seasonStats?.batting?.homeruns > 0, p => p.seasonStats.batting.homeruns),
    rbis: buildRanking(p => p.seasonStats?.batting?.rbis > 0, p => p.seasonStats.batting.rbis),
    stolenBases: buildRanking(p => p.seasonStats?.batting?.stolenBases > 0, p => p.seasonStats.batting.stolenBases),
    ops: buildRanking(hasBatAB, getOPS, v => v.toFixed(3)),
    era: buildRanking(hasIP, p => (p.seasonStats.pitching.earnedRuns * 27) / p.seasonStats.pitching.inningsPitched, v => v.toFixed(2), true),
    whip: buildRanking(hasIP, getWHIP, v => v.toFixed(2), true),
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
 * 能力ベース + 年齢補正 + 成長力 + 知名度（通算蓄積）+ シーズン成績ボーナス
 * @param {Object} player - 選手データ
 * @param {number} awardBonus - シーズン個人成績ボーナス（デフォルト0）
 * @returns {Object} - { isDraftEligible: boolean, reasons: string[], totalScore: number }
 */
export function checkNPBDraftEligibility(player, awardBonus = 0) {
  const isPitcher = player.position === 'pitcher';
  const reasons = [];
  const age = player.age || 20;

  if (age >= 30) {
    return { isDraftEligible: false, reasons: [], totalScore: 0 };
  }

  // 年齢ボーナス（NPBスカウトは若い選手の将来性を重視）
  const ageBonusMap = { 18: 55, 19: 45, 20: 30, 21: 20, 22: 8, 23: 0, 24: -10, 25: -22, 26: -35, 27: -48, 28: -60, 29: -75 };
  const ageBonus = ageBonusMap[age] !== undefined ? ageBonusMap[age] : (age < 18 ? 55 : -75);

  // 将来性投影倍率（若い選手の能力を伸びしろ込みで評価）
  const potentialMult = age <= 18 ? 1.25 : age <= 19 ? 1.15 : age <= 20 ? 1.08 : age <= 21 ? 1.04 : 1.0;

  // 成長力ボーナス（若い選手ほど成長力が大きく評価される）
  const gp = player.growthPotential || 1.0;
  const gpBonus = age <= 19 ? Math.max(0, (gp - 0.7) * 65)
               : age <= 22 ? Math.max(0, (gp - 0.8) * 50)
               : Math.max(0, (gp - 1.0) * 15);

  // 知名度ボーナス
  const fame = player.fame || 0;
  const fameBonus = Math.round(fame * 0.3);

  let baseScore = 0;

  if (isPitcher) {
    const velocity = player.pitching?.velocity || 0;
    const control = player.pitching?.control || 0;
    const stamina = player.pitching?.stamina || 0;
    const arsenal = player.pitching?.arsenal || [];
    const bestBreaking = arsenal.filter(a => a.type !== 'straight').reduce((max, a) => Math.max(max, a.level || 0), 0);

    const velocityScore = Math.max(0, (velocity - 100) * 1.2);
    const abilityScore = (velocityScore + control * 1.2 + stamina * 0.6 + bestBreaking * 0.7) * potentialMult;
    baseScore = abilityScore + ageBonus + gpBonus + fameBonus;
    const totalScore = baseScore + awardBonus;

    reasons.push(`投手力${Math.round(abilityScore)}pt`);
    if (fameBonus > 0) reasons.push(`知名度+${fameBonus}pt`);
    if (awardBonus > 0) reasons.push(`成績ボーナス+${awardBonus}pt`);
    reasons.push(`総合${Math.round(totalScore)}pt`);
    if (velocity >= 148) reasons.push(`球速${velocity}km`);
    if (control >= 75) reasons.push(`制球力${control}`);
    if (bestBreaking >= 70) reasons.push(`変化球${bestBreaking}`);
    if (age <= 22) reasons.push(`${age}歳の将来性`);
  } else {
    const meet = player.batting?.meet || 0;
    const power = player.batting?.power || 0;
    const eye = player.batting?.eye || 0;
    const speed = player.physical?.speed || 0;
    const defense = player.fielding?.defense || 0;
    const arm = player.physical?.arm || 0;

    const abilityScore = (meet * 1.2 + power * 1.1 + eye * 0.6 + speed * 0.4 + defense * 0.4 + arm * 0.3) * potentialMult;
    baseScore = abilityScore + ageBonus + gpBonus + fameBonus;
    const totalScore = baseScore + awardBonus;

    reasons.push(`野手力${Math.round(abilityScore)}pt`);
    if (fameBonus > 0) reasons.push(`知名度+${fameBonus}pt`);
    if (awardBonus > 0) reasons.push(`成績ボーナス+${awardBonus}pt`);
    reasons.push(`総合${Math.round(totalScore)}pt`);
    if (meet >= 75) reasons.push(`ミート${meet}`);
    if (power >= 75) reasons.push(`パワー${power}`);
    if (speed >= 80) reasons.push(`俊足${speed}`);
    if (defense >= 80) reasons.push(`守備${defense}`);
    if (age <= 22) reasons.push(`${age}歳の将来性`);
  }

  return {
    isDraftEligible: true,
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
 * NPBドラフト処理（統一評価・グローバルTop-N方式）
 *
 * 全ソース（高校/大学/社会人/独立）から候補を収集し、
 * 統一スコアで評価して上位~120名をドラフト指名する。
 * 各ソースの比率は選手の質から自然に決まる。
 *
 * 目標比率（タレント調整の指標）:
 *   高校30%, 大学35%, 社会人20%, 独立14%, その他1%
 *   1位は高校+大学80%, 社会人20%が自然に実現される（生成能力差による）
 *
 * @param {Object} allTeams - TEAMS_DATA
 * @param {number} gameYear - 現在のゲーム年度
 * @returns {Object} - { draftedPlayers, nearMissPlayers, proBonus, draftBySource }
 */
export function processNPBDraft(allTeams, gameYear = 1) {
  const NPB_TEAMS = [
    '読売ジャイアンツ', '阪神タイガース', '横浜DeNAベイスターズ',
    '広島東洋カープ', '中日ドラゴンズ', 'ヤクルトスワローズ',
    'オリックス・バファローズ', 'ソフトバンクホークス', '西武ライオンズ',
    '楽天ゴールデンイーグルス', '千葉ロッテマリーンズ', '日本ハムファイターズ'
  ];
  const DRAFT_ROUND_LABELS = ['育成指名', 'ドラフト6位', 'ドラフト5位', 'ドラフト4位', 'ドラフト3位', 'ドラフト2位', 'ドラフト1位'];

  const awardBonusMap = computeSeasonAwardBonuses(allTeams);

  // === 全ソースから候補を収集し、統一スコアで評価 ===
  const allCandidates = [];

  // 1. チーム選手（社会人 / 独立リーグ / 大学）
  Object.entries(allTeams).forEach(([teamName, team]) => {
    if (!team.players) return;
    const source = team.corporateData ? 'corporate'
                 : team.universityData ? 'university_team'
                 : team.independentLeagueId ? 'independent'
                 : 'independent';
    team.players.forEach(player => {
      if (player.age >= 30) return;
      // 年齢制限: 独立リーグは19歳以上、社会人は21歳以上、大学は3年生以上(20歳以上)
      if (source === 'independent' && player.age < 19) return;
      if (source === 'corporate' && player.age < 21) return;
      if (source === 'university_team' && player.age < 20) return;
      const bonus = awardBonusMap[player.id]?.bonus || 0;
      const awards = awardBonusMap[player.id]?.awards || [];
      const { totalScore } = checkNPBDraftEligibility(player, bonus);
      allCandidates.push({
        player, teamName, score: totalScore, bonus, awards, source,
        hofResult: checkHallOfFame(player),
      });
    });
  });

  // 2. 高校生プール
  highSchoolPool.players.forEach(player => {
    const { totalScore } = checkNPBDraftEligibility(player, 0);
    allCandidates.push({
      player, teamName: player.highSchool?.name || '高校', score: totalScore, bonus: 0, awards: [],
      source: 'highschool',
    });
  });

  // 3. 大学3〜4年生
  Object.entries(universityPool).forEach(([enrollYear, cohort]) => {
    if (!cohort) return;
    const ey = parseInt(enrollYear);
    cohort.forEach(entry => {
      const yearsInUni = gameYear - ey;
      if (yearsInUni >= 3) {
        const { totalScore } = checkNPBDraftEligibility(entry.player, 0);
        allCandidates.push({
          player: entry.player, teamName: entry.universityTeamName || '大学', score: totalScore,
          bonus: 0, awards: [], source: 'university',
          enrollYear: ey, universityRank: entry.universityRank,
        });
      }
    });
  });

  // === スコア順にソートし、上位~120名を指名 ===
  allCandidates.sort((a, b) => b.score - a.score);

  // 各NPBチームの指名枠: 本指名6巡 + 育成 = 最大7巡 × 12球団 = 84名
  // 実際は5-7巡が多い → 60-84名の本指名 + 育成指名
  const numTeams = NPB_TEAMS.length;
  const mainRounds = 5 + Math.floor(Math.random() * 2); // 5〜6巡
  const mainSlots = mainRounds * numTeams;
  const ikuSlots = Math.floor(Math.random() * 3) * numTeams; // 0〜2巡の育成
  const totalSlots = mainSlots + ikuSlots;
  const MIN_DRAFT_SCORE = 80;
  const eligible = allCandidates.filter(c => c.score >= MIN_DRAFT_SCORE);
  const selected = eligible.slice(0, Math.min(totalSlots, eligible.length));

  // === 指名エントリ生成ヘルパー ===
  const createDraftEntry = (candidate, npbTeam, roundLabel) => {
    const { player, teamName, score, bonus = 0, awards = [], source, hofResult } = candidate;
    const isPitcher = player.position === 'pitcher';
    const reasons = [];
    if (source === 'highschool') reasons.push(`高卒ドラフト: 潜在能力${Math.round(score)}pt`);
    else if (source === 'university' || source === 'university_team') reasons.push(`大卒ドラフト: 総合力${Math.round(score)}pt`);
    else reasons.push(`${isPitcher ? '投手' : '野手'}力${Math.round(score)}pt`);
    if (bonus > 0) reasons.push(`成績ボーナス+${bonus}pt`);
    return {
      player, teamName, npbTeam, reasons, draftRound: roundLabel,
      position: player.position, age: player.age,
      name: player.name, playerId: player.id,
      hallOfFame: hofResult?.isHallOfFame || false,
      hofReason: hofResult?.reason || null,
      careerStats: player.careerStats ? JSON.parse(JSON.stringify(player.careerStats)) : null,
      yearsPlayed: player.yearsPlayed || (source === 'highschool' || source === 'university' ? 0 : 1),
      awardBonus: candidate.bonus || 0, seasonAwards: candidate.awards || [],
      source, score,
    };
  };

  const draftedPlayers = [];
  const nearMissPlayers = [];
  const shuffledTeams = [...NPB_TEAMS].sort(() => Math.random() - 0.5);
  const takenIds = new Set();

  // セ・パ別に順位をランダム決定（NPBシーズンは未シミュレーションのため）
  const CE_TEAMS = NPB_TEAMS.slice(0, 6);
  const PA_TEAMS = NPB_TEAMS.slice(6, 12);
  const ceStandings = [...CE_TEAMS].sort(() => Math.random() - 0.5);
  const paStandings = [...PA_TEAMS].sort(() => Math.random() - 0.5);
  // セパの左右配置を半々でランダム決定
  const ceFirst = Math.random() < 0.5;
  // グリッド表示用（セ1位,パ1位,セ2位,パ2位,...の順 or パ1位,セ1位,...の順）
  const npbStandings = [];
  for (let i = 0; i < 6; i++) {
    if (ceFirst) {
      npbStandings.push(ceStandings[i], paStandings[i]);
    } else {
      npbStandings.push(paStandings[i], ceStandings[i]);
    }
  }
  // ウェーバー制: 右下→左上（下位球団から指名）
  const waiverOrder = [...npbStandings].reverse();
  // 逆ウェーバー制: 左上→右下（上位球団から指名）
  const reverseWaiverOrder = [...npbStandings];

  // === 1巡目: 同時指名 + 抽選 + 外れ再指名ループ ===
  const firstRoundData = { phases: [] };
  const MAX_CONTESTED = 8;
  const MAX_PHASES = 5;

  const settledTeams = {};
  let teamsToProcess = [...shuffledTeams];

  for (let phaseI = 0; phaseI < MAX_PHASES && teamsToProcess.length > 0; phaseI++) {
    const phase = { picks: [], lotteryResults: [] };

    const teamPick = {};
    teamsToProcess.forEach(team => {
      let bestCand = null, bestPref = -Infinity;
      for (const c of eligible) {
        if (takenIds.has(c.player.id)) continue;
        const noise = (Math.random() - 0.5) * 30;
        const pref = c.score + noise;
        if (pref > bestPref) { bestPref = pref; bestCand = c; }
      }
      teamPick[team] = bestCand;
    });

    const playerCompetitors = {};
    for (const [team, cand] of Object.entries(teamPick)) {
      if (!cand) continue;
      const id = cand.player.id;
      if (!playerCompetitors[id]) playerCompetitors[id] = [];
      playerCompetitors[id].push(team);
    }

    if (phaseI === 0) {
      const allPickedIds = new Set(Object.values(teamPick).filter(Boolean).map(c => c.player.id));
      const countContested = () => {
        let c = 0;
        for (const teams of Object.values(playerCompetitors)) {
          if (teams.length > 1) c += teams.length;
        }
        return c;
      };
      while (countContested() > MAX_CONTESTED) {
        let maxId = null, maxLen = 0;
        for (const [id, teams] of Object.entries(playerCompetitors)) {
          if (teams.length > maxLen) { maxLen = teams.length; maxId = id; }
        }
        if (!maxId || maxLen <= 1) break;
        const team = playerCompetitors[maxId].pop();
        let bestCand = null, bestScore = -Infinity;
        for (const c of eligible) {
          if (allPickedIds.has(c.player.id) || takenIds.has(c.player.id)) continue;
          if (c.score > bestScore) { bestScore = c.score; bestCand = c; }
        }
        if (!bestCand) break;
        allPickedIds.add(bestCand.player.id);
        teamPick[team] = bestCand;
        if (!playerCompetitors[bestCand.player.id]) playerCompetitors[bestCand.player.id] = [];
        playerCompetitors[bestCand.player.id].push(team);
      }
    }

    for (const team of teamsToProcess) {
      const cand = teamPick[team];
      if (!cand) continue;
      const id = cand.player.id;
      const contested = (playerCompetitors[id]?.length || 0) > 1;
      phase.picks.push({
        npbTeam: team, name: cand.player.name, position: cand.player.position,
        teamName: cand.teamName, source: cand.source, playerId: id, contested,
      });
    }

    const phaseLosers = new Set();
    for (const [playerId, teams] of Object.entries(playerCompetitors)) {
      if (teams.length <= 1) continue;
      const winner = teams[Math.floor(Math.random() * teams.length)];
      teams.filter(t => t !== winner).forEach(t => phaseLosers.add(t));
      phase.lotteryResults.push({
        playerName: teamPick[teams[0]].player.name,
        playerId: parseInt(playerId),
        competitors: [...teams], winner,
      });
    }

    for (const team of teamsToProcess) {
      if (!phaseLosers.has(team) && teamPick[team]) {
        settledTeams[team] = teamPick[team];
        takenIds.add(teamPick[team].player.id);
      }
    }

    firstRoundData.phases.push(phase);
    teamsToProcess = [...phaseLosers];
  }

  if (teamsToProcess.length > 0) {
    const fallbackPhase = { picks: [], lotteryResults: [] };
    for (const team of teamsToProcess) {
      let bestCand = null, bestScore = -Infinity;
      for (const c of eligible) {
        if (takenIds.has(c.player.id)) continue;
        if (c.score > bestScore) { bestScore = c.score; bestCand = c; }
      }
      if (bestCand) {
        settledTeams[team] = bestCand;
        takenIds.add(bestCand.player.id);
        fallbackPhase.picks.push({
          npbTeam: team, name: bestCand.player.name, position: bestCand.player.position,
          teamName: bestCand.teamName, source: bestCand.source, playerId: bestCand.player.id, contested: false,
        });
      }
    }
    if (fallbackPhase.picks.length > 0) firstRoundData.phases.push(fallbackPhase);
  }

  for (const team of shuffledTeams) {
    const cand = settledTeams[team];
    if (!cand) continue;
    draftedPlayers.push(createDraftEntry(cand, team, 'ドラフト1位'));
  }

  // === 2巡目以降: ウェーバー/逆ウェーバー交互制 ===
  let eligibleIdx = 0;
  for (let round = 1; round < mainRounds + (ikuSlots > 0 ? Math.ceil(ikuSlots / numTeams) : 0); round++) {
    const isIku = round >= mainRounds;
    const ikuRound = round - mainRounds + 1;
    const roundLabel = isIku ? `育成${ikuRound}巡目` : DRAFT_ROUND_LABELS[Math.min(6, 6 - round)];
    const teamOrder = round % 2 === 1 ? waiverOrder : reverseWaiverOrder;

    for (let t = 0; t < numTeams; t++) {
      while (eligibleIdx < eligible.length && takenIds.has(eligible[eligibleIdx].player.id)) eligibleIdx++;
      if (eligibleIdx >= eligible.length) break;
      const npbTeam = teamOrder[t % numTeams];
      const candidate = eligible[eligibleIdx];
      takenIds.add(candidate.player.id);
      eligibleIdx++;
      draftedPlayers.push(createDraftEntry(candidate, npbTeam, roundLabel));
    }
  }

  // === 惜しかった選手 ===
  const draftedIds = new Set(draftedPlayers.map(d => d.playerId));
  const lowestDraftedScore = draftedPlayers.length > 0 ? Math.min(...draftedPlayers.map(d => d.score)) : 0;
  const nearThreshold = lowestDraftedScore * 0.90;
  allCandidates.forEach(candidate => {
    if (draftedIds.has(candidate.player.id)) return;
    if (candidate.score >= nearThreshold && candidate.score < lowestDraftedScore) {
      const isPitcher = candidate.player.position === 'pitcher';
      const sourceLabel = { highschool: '高校', university: '大学', corporate: '', independent: '' }[candidate.source] || '';
      nearMissPlayers.push({
        name: candidate.player.name,
        teamName: candidate.teamName,
        position: candidate.player.position,
        age: candidate.player.age,
        source: candidate.source,
        reasons: [`${sourceLabel}${isPitcher ? '投手' : '野手'}力${Math.round(candidate.score)}pt（あと${Math.round(lowestDraftedScore - candidate.score)}pt）`]
      });
    }
  });

  // === プロ輩出ボーナス（チーム所属選手のみ） ===
  const teamDraftCounts = {};
  draftedPlayers.forEach(({ teamName, source }) => {
    if (source === 'highschool' || source === 'university') return;
    teamDraftCounts[teamName] = (teamDraftCounts[teamName] || 0) + 1;
  });

  const proBonus = [];
  Object.entries(teamDraftCounts).forEach(([teamName, count]) => {
    const team = allTeams[teamName];
    if (!team) return;

    if (!team.developmentReputation) team.developmentReputation = 0;
    if (!team.totalProPlayersProduced) team.totalProPlayersProduced = 0;
    team.totalProPlayersProduced += count;
    const reputationGain = count * 3;
    team.developmentReputation = Math.min(100, team.developmentReputation + reputationGain);

    const youngPlayers = team.players.filter(p => p.age <= 25);
    let boostedCount = 0;
    youngPlayers.forEach(player => {
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
      teamName, draftCount: count, reputationGain,
      currentReputation: team.developmentReputation,
      boostedYoungPlayers: boostedCount
    });
  });

  // === 各プールから指名者を除去 ===
  draftedPlayers.forEach(({ playerId, teamName, source }) => {
    if (source === 'corporate' || source === 'independent' || source === 'university_team') {
      const team = allTeams[teamName];
      if (team) {
        cleanupPlayerReferences(team, playerId);
        team.players = team.players.filter(p => p.id !== playerId);
      }
    }
  });

  const hsDraftedIds = new Set(draftedPlayers.filter(d => d.source === 'highschool').map(d => d.playerId));
  if (hsDraftedIds.size > 0) {
    highSchoolPool.players = highSchoolPool.players.filter(p => !hsDraftedIds.has(p.id));
  }

  const uniDraftedIds = new Set(draftedPlayers.filter(d => d.source === 'university').map(d => d.playerId));
  if (uniDraftedIds.size > 0) {
    Object.keys(universityPool).forEach(enrollYear => {
      const cohort = universityPool[enrollYear];
      if (!cohort) return;
      universityPool[enrollYear] = cohort.filter(entry => !uniDraftedIds.has(entry.player.id));
      if (universityPool[enrollYear].length === 0) delete universityPool[enrollYear];
    });
  }

  const draftBySource = {
    highschool: draftedPlayers.filter(d => d.source === 'highschool').length,
    university: draftedPlayers.filter(d => d.source === 'university' || d.source === 'university_team').length,
    corporate: draftedPlayers.filter(d => d.source === 'corporate').length,
    independent: draftedPlayers.filter(d => d.source === 'independent').length,
    total: draftedPlayers.length,
  };

  return { draftedPlayers, nearMissPlayers, proBonus, draftBySource, firstRoundData, npbStandings, highSchoolDrafted: draftBySource.highschool };
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
          careerStats: player.careerStats,
          draftInfo: player.draftInfo || null,
          yearsPlayed: player.yearsPlayed
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
    fatigue: 0,
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

  // タイトル別の知名度上昇量
  const FAME_TITLE_1ST = 15;
  const FAME_TITLE_2ND = 8;

  // 2位の選手IDを収集
  const runnerUpIds = new Set();
  const allPlayers = [];
  Object.values(allTeams).forEach(team => {
    if (team.players) team.players.forEach(p => allPlayers.push(p));
  });
  const collectRunnerUp = (getStat, filterFn, ascending = false) => {
    const qualified = allPlayers.filter(filterFn);
    if (qualified.length < 2) return;
    const sorted = [...qualified].sort((a, b) => ascending ? getStat(a) - getStat(b) : getStat(b) - getStat(a));
    runnerUpIds.add(sorted[1].id);
  };
  const getBattingAvg = p => p.seasonStats?.batting?.atBats > 0 ? p.seasonStats.batting.hits / p.seasonStats.batting.atBats : 0;
  const getEra = p => p.seasonStats?.pitching?.inningsPitched > 0 ? (p.seasonStats.pitching.earnedRuns * 27) / p.seasonStats.pitching.inningsPitched : 99.99;
  const batFilter = p => (p.seasonStats?.batting?.atBats || 0) >= 100;
  const pitFilter = p => (p.seasonStats?.pitching?.inningsPitched || 0) >= 30;
  collectRunnerUp(getBattingAvg, batFilter);
  collectRunnerUp(p => p.seasonStats?.batting?.homeruns || 0, batFilter);
  collectRunnerUp(p => p.seasonStats?.batting?.rbis || 0, batFilter);
  collectRunnerUp(p => p.seasonStats?.batting?.stolenBases || 0, batFilter);
  collectRunnerUp(getEra, pitFilter, true);
  collectRunnerUp(p => p.seasonStats?.pitching?.wins || 0, pitFilter);
  collectRunnerUp(p => p.seasonStats?.pitching?.strikeouts || 0, pitFilter);
  collectRunnerUp(p => p.seasonStats?.pitching?.saves || 0, p => (p.seasonStats?.pitching?.saves || 0) > 0);

  Object.entries(allTeams).forEach(([teamName, team]) => {
    updatedTeams[teamName] = {
      ...team,
      players: team.players.map(player => {
        const achievements = [...(player.professionalCareer?.achievements || [])];
        let fameGain = 0;

        const matchAward = (award) => award && (award.id ? award.id === player.id : award.name === player.name);

        if (matchAward(awards.battingChampion)) {
          achievements.push({ year: 0, title: '首位打者' });
          fameGain += FAME_TITLE_1ST;
        }
        if (matchAward(awards.homeRunKing)) {
          achievements.push({ year: 0, title: '本塁打王' });
          fameGain += FAME_TITLE_1ST;
        }
        if (matchAward(awards.rbiKing)) {
          achievements.push({ year: 0, title: '打点王' });
          fameGain += FAME_TITLE_1ST;
        }
        if (matchAward(awards.stolenBaseKing)) {
          achievements.push({ year: 0, title: '盗塁王' });
          fameGain += FAME_TITLE_1ST;
        }
        if (matchAward(awards.eraChampion)) {
          achievements.push({ year: 0, title: '最優秀防御率' });
          fameGain += FAME_TITLE_1ST;
        }
        if (matchAward(awards.winsLeader)) {
          achievements.push({ year: 0, title: '最多勝' });
          fameGain += FAME_TITLE_1ST;
        }
        if (matchAward(awards.savesLeader)) {
          achievements.push({ year: 0, title: '最多セーブ' });
          fameGain += FAME_TITLE_1ST;
        }
        if (matchAward(awards.strikeoutKing)) {
          achievements.push({ year: 0, title: '最多奪三振' });
          fameGain += FAME_TITLE_1ST;
        }

        // 2位にも知名度加算
        if (runnerUpIds.has(player.id)) {
          fameGain += FAME_TITLE_2ND;
        }

        // 規定到達で出場実績による微量加算（毎シーズン+2）
        const batAB = player.seasonStats?.batting?.atBats || 0;
        const pitIP = player.seasonStats?.pitching?.inningsPitched || 0;
        if (batAB >= 100 || pitIP >= 30) {
          fameGain += 2;
        }

        const currentFame = player.fame || 0;

        return {
          ...player,
          fame: Math.min(100, currentFame + fameGain),
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
 * - 年齢減衰: 24歳以降、毎年growthPotentialが減少（加齢による衰え）
 * - 疲労酷使: 高疲労で出場し続けた選手は成長率ダウン
 * - 優勝経験: 優勝チーム全員+0.05
 */
export function updateGrowthModifiers(allTeams, awards) {
  const championTeam = awards?.champion;

  Object.entries(allTeams).forEach(([teamName, team]) => {
    if (!team.players) return;
    const isChampion = teamName === championTeam;

    team.players.forEach(player => {
      // 年齢による成長ポテンシャル減衰: 24歳から(age-23)*0.05ずつ加速
      const age = player.age || 18;
      if (age >= 24) {
        const agePenalty = (age - 23) * 0.05;
        player.growthPotential = Math.round(((player.growthPotential || 1.0) - agePenalty) * 100) / 100;
      }

      // シーズン中に蓄積された変動を半減して次年度に引き継ぎ（徐々にゼロに戻る）
      let modifier = (player.growthModifier || 0) * 0.5;

      if (isChampion) {
        modifier += 0.05;
      }

      player.growthModifier = Math.max(-0.3, Math.round(modifier * 100) / 100);
    });
  });
}

/**
 * 大学モード: TEAMS_DATA上のチームから4年生を卒業させ、新入生を補充
 * - 4年生(age>=22)は卒業 → NPBドラフト済みは除去済み、残りは進路振り分け
 * - 全チームに推薦入学+一般入部で新1年生を補充
 */
function processUniversityTeamGraduation(allTeams, seasonData, currentYear) {
  const report = {
    graduated: [],
    recruited: [],
    npbDrafted: [],
    postGradPaths: { corporate: 0, independent: 0, retired: 0 },
  };

  for (const [teamName, teamData] of Object.entries(allTeams)) {
    if (!teamData?.players || !teamData.universityData) continue;
    const rank = teamData.universityData.rank || 'C';

    // 4年生を特定（年齢22歳以上、または universityYear >= 4）
    const graduates = [];
    const remaining = [];
    teamData.players.forEach(p => {
      if (p.age >= 22 || (p.universityYear && p.universityYear >= 4)) {
        graduates.push(p);
      } else {
        remaining.push(p);
      }
    });

    // 卒業生の進路振り分け
    graduates.forEach(grad => {
      const score = grad.position === 'pitcher'
        ? ((grad.pitching?.velocity || 120) - 120) * 1.5 + (grad.pitching?.control || 0) + (grad.pitching?.stamina || 0) * 0.4
        : (grad.batting?.meet || 0) + (grad.batting?.power || 0) + (grad.batting?.eye || 0) * 0.5 + (grad.physical?.speed || 0) * 0.3;

      grad.isStarter = false;
      grad.battingOrder = 0;
      grad.origin = 'university';
      grad.isReleasedCandidate = true;

      if (score >= 120) {
        grad.postGradPath = 'corporate';
        report.postGradPaths.corporate++;
        releasedPlayersPool.push(grad);
      } else if (score >= 80) {
        grad.postGradPath = 'independent';
        report.postGradPaths.independent++;
        releasedPlayersPool.push(grad);
      } else {
        grad.postGradPath = 'retired';
        report.postGradPaths.retired++;
      }

      report.graduated.push({
        name: grad.name,
        team: teamName,
        position: grad.position,
        age: grad.age,
        path: grad.postGradPath,
        stats: grad.position === 'pitcher'
          ? { velocity: grad.pitching?.velocity, control: grad.pitching?.control, stamina: grad.pitching?.stamina }
          : { meet: grad.batting?.meet, power: grad.batting?.power, eye: grad.batting?.eye, speed: grad.physical?.speed },
        careerStats: grad.careerStats ? {
          batting: { atBats: grad.careerStats.batting?.atBats || 0, hits: grad.careerStats.batting?.hits || 0, homeruns: grad.careerStats.batting?.homeruns || 0 },
          pitching: { wins: grad.careerStats.pitching?.wins || 0, saves: grad.careerStats.pitching?.saves || 0, inningsPitched: grad.careerStats.pitching?.inningsPitched || 0 },
        } : null,
      });
    });

    // 在校生の学年を進める
    remaining.forEach(p => {
      if (p.universityYear) p.universityYear++;
    });

    // 新入生を補充（卒業人数分 + ロスター下限調整）
    const targetSize = getUniversityTargetRosterSize(rank);
    const neededCount = Math.max(graduates.length, targetSize - remaining.length);
    const newPlayers = generateUniversityFreshmen(neededCount, rank, teamName, teamData, currentYear);

    report.recruited.push(...newPlayers.map(p => ({
      name: p.name,
      team: teamName,
      position: p.position,
      type: p.recruitType,
    })));

    // ロスター更新（splice方式でTEAMS_DATAを直接変更）
    teamData.players.splice(0, teamData.players.length, ...remaining, ...newPlayers);
  }

  return report;
}

// ランク別目標ロスターサイズ
function getUniversityTargetRosterSize(rank) {
  const sizes = { S: 30, A: 27, B: 24, C: 22, D: 20 };
  return sizes[rank] || 22;
}

// 新入生を生成（推薦入学 + 一般入部）
function generateUniversityFreshmen(count, rank, teamName, teamData, currentYear) {
  const newPlayers = [];
  const maxId = Object.values(TEAMS_DATA).flatMap(t => t.players || []).reduce((max, p) => Math.max(max, p.id || 0), 0);

  // 推薦枠: ランクに応じて(S: 40%, A: 30%, B: 20%, C: 15%, D: 10%)
  const recommendRate = { S: 0.4, A: 0.3, B: 0.2, C: 0.15, D: 0.1 };
  const recCount = Math.max(1, Math.round(count * (recommendRate[rank] || 0.15)));
  const genCount = count - recCount;

  for (let i = 0; i < count; i++) {
    const isRecommended = i < recCount;
    const player = generateFreshmanPlayer(maxId + newPlayers.length + 1, rank, isRecommended);
    player.universityTeamId = teamData.universityTeamId;
    player.universityTeamName = teamName;
    player.universityYear = 1;
    player.recruitType = isRecommended ? 'recommended' : 'general';
    if (!player.careerHistory) player.careerHistory = [];
    player.careerHistory.push({ type: 'university', year: currentYear + 1, label: teamName });
    newPlayers.push(player);
  }

  return newPlayers;
}

// 新入生1人を生成
function generateFreshmanPlayer(id, teamRank, isRecommended) {
  const name = generateRandomPlayerName();

  const isPitcher = Math.random() < 0.35;
  const position = isPitcher ? 'pitcher' : ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'][Math.floor(Math.random() * 8)];

  const handRoll = Math.random() * 100;
  let throws, bats;
  if (handRoll < 42) { throws = 'right'; bats = 'right'; }
  else if (handRoll < 72) { throws = 'right'; bats = 'left'; }
  else if (handRoll < 82) { throws = 'right'; bats = 'switch'; }
  else if (handRoll < 94) { throws = 'left'; bats = 'left'; }
  else if (handRoll < 97) { throws = 'left'; bats = 'switch'; }
  else { throws = 'left'; bats = 'right'; }

  // 推薦入学は能力が高い、一般入部は低め
  const rankBase = { S: 40, A: 35, B: 30, C: 25, D: 20 };
  const base = (rankBase[teamRank] || 25) + (isRecommended ? 10 : 0);
  const variance = () => Math.floor(Math.random() * 15) - 5;

  const meet = Math.max(5, base + variance());
  const power = Math.max(5, base + variance());
  const eye = Math.max(5, base - 5 + variance());
  const speed = Math.max(5, base + variance());
  const arm = Math.max(5, base + variance());
  const defense = Math.max(5, base + variance());
  const steal = Math.max(5, base - 10 + variance());

  const velBase = { S: 138, A: 135, B: 131, C: 127, D: 123 };
  const velocity = (velBase[teamRank] || 128) + (isRecommended ? 3 : 0) + Math.floor(Math.random() * 6) - 2;
  const control = Math.max(10, base + variance());
  const stamina = 60 + Math.floor(Math.random() * 40);

  const forms = ['overhand', 'three_quarter', 'sidearm', 'underhand'];
  const formWeights = [50, 30, 15, 5];
  let formRoll = Math.random() * 100, formIdx = 0;
  for (let i = 0; i < formWeights.length; i++) {
    formRoll -= formWeights[i];
    if (formRoll <= 0) { formIdx = i; break; }
  }

  const pitchTypes = ['slider', 'curve', 'fork', 'changeup', 'sinker', 'cutter', 'shoot'];
  const arsenal = [{ id: 1, type: pitchTypes[Math.floor(Math.random() * pitchTypes.length)], level: 15 + Math.floor(Math.random() * 25) }];
  if (Math.random() < 0.4) {
    let second = pitchTypes[Math.floor(Math.random() * pitchTypes.length)];
    if (second !== arsenal[0].type) arsenal.push({ id: 2, type: second, level: 10 + Math.floor(Math.random() * 20) });
  }

  const positionFitness = { pitcher: 0, catcher: 0, first: 0, second: 0, third: 0, short: 0, left: 0, center: 0, right: 0 };
  positionFitness[position] = 80 + Math.floor(Math.random() * 21);
  if (!isPitcher && Math.random() < 0.3) {
    const subPos = ['first', 'second', 'third', 'short', 'left', 'center', 'right'].filter(p => p !== position);
    positionFitness[subPos[Math.floor(Math.random() * subPos.length)]] = 30 + Math.floor(Math.random() * 30);
  }

  const norm = () => Math.max(1, Math.min(100, Math.round(50 + (Math.sqrt(-2 * Math.log(Math.random() || 0.001)) * Math.cos(2 * Math.PI * Math.random())) * 18)));
  const growthPotential = 0.7 + Math.random() * 0.6;

  return {
    id,
    name,
    age: 18,
    position,
    battingOrder: 0,
    isStarter: false,
    isTwoWay: false,
    batting: { meet, power, eye, bats, steal, bunt: Math.max(5, Math.round(meet * 0.4 + speed * 0.3 + Math.random() * 15)) },
    physical: { speed, arm, throws, bodyStamina: 40 + Math.floor(Math.random() * 20), recovery: 40 + Math.floor(Math.random() * 20), muscle: 30 + Math.floor(Math.random() * 20), dexterity: 30 + Math.floor(Math.random() * 20) },
    fielding: { defense },
    catching: { lead: position === 'catcher' ? 30 + Math.floor(Math.random() * 20) : 10 },
    pitching: { velocity, control, stamina, form: forms[formIdx], arsenal },
    traits: [],
    positionFitness,
    personality: { discipline: norm(), mental: norm() },
    growthPotential,
    growthModifier: 0,
    fame: 0,
    experience: 0,
    fatigue: 0,
    seasonStats: { batting: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, walks: 0, strikeouts: 0, rbis: 0, stolenBases: 0, caughtStealing: 0, sacrificeBunts: 0 }, pitching: { inningsPitched: 0, hits: 0, walks: 0, strikeouts: 0, earnedRuns: 0, wins: 0, losses: 0, saves: 0, gamesStarted: 0, gamesRelieved: 0, battersFaced: 0, homeruns: 0 } },
    careerStats: { batting: { atBats: 0, hits: 0, doubles: 0, triples: 0, homeruns: 0, walks: 0, strikeouts: 0, rbis: 0, stolenBases: 0 }, pitching: { inningsPitched: 0, hits: 0, walks: 0, strikeouts: 0, earnedRuns: 0, wins: 0, losses: 0, saves: 0, gamesStarted: 0, gamesRelieved: 0 } },
    careerHistory: [{ type: 'highschool', label: '高校卒' }],
  };
}

// ============================================================
// 独立リーグAIチームのロスター補充
// リリースプール（高卒/大卒/社会人/元チーム選手）から獲得し、
// 不足分は新規生成で埋める
// ============================================================

const TARGET_ROSTER_SIZE = 24;

function scorePlayerForRecruitment(p) {
  const base = p.position === 'pitcher'
    ? ((p.pitching?.velocity || 130) - 115) * 2 + (p.pitching?.control || 0) + (p.pitching?.stamina || 0) * 0.3
    : ((p.batting?.meet || 0) + (p.batting?.power || 0) + (p.physical?.speed || 0) + (p.fielding?.defense || 0)) / 4;
  const originBonus = (p.origin === 'independent_candidate' || p.postGradPath === 'independent') ? 15 : 0;
  return base + originBonus;
}

function replenishIndependentLeagueRosters(allTeams, currentYear) {
  const userTeamName = Object.keys(allTeams)[0];

  // 補充が必要なAI独立リーグチームを収集（ユーザーのリーグのライバルも含む）
  const teamsNeedingPlayers = [];
  for (const [teamName, team] of Object.entries(allTeams)) {
    if (teamName === userTeamName) continue;
    if (!team?.players) continue;
    // 社会人チーム・大学チームは除外
    if (team.corporateTeamId || team.corporateData || team.universityData) continue;

    const needed = Math.max(0, TARGET_ROSTER_SIZE - team.players.length);
    if (needed > 0) {
      teamsNeedingPlayers.push({ teamName, team, needed });
    }
  }

  if (teamsNeedingPlayers.length === 0) return;

  // プール候補をスコア順にソート
  const poolCandidates = releasedPlayersPool
    .map(p => ({ player: p, score: scorePlayerForRecruitment(p) }))
    .sort((a, b) => b.score - a.score);

  // プールの60%をAIチームに配分、40%はユーザーのトライアウト用に残す
  const maxTake = Math.floor(poolCandidates.length * 0.6);
  const totalNeeded = teamsNeedingPlayers.reduce((sum, t) => sum + t.needed, 0);
  const availableFromPool = Math.min(maxTake, totalNeeded);

  // チーム順をシャッフルして公平に配分（ラウンドロビン）
  const shuffled = [...teamsNeedingPlayers].sort(() => Math.random() - 0.5);
  const recruitedIds = new Set();
  let taken = 0;
  let candidateIdx = 0;

  // ラウンドロビン: 各チームに1人ずつ順番に配る
  let anyRecruited = true;
  while (anyRecruited && taken < availableFromPool) {
    anyRecruited = false;
    for (const teamInfo of shuffled) {
      if (teamInfo.needed <= 0) continue;
      // 次のまだ獲得されていない候補を探す
      while (candidateIdx < poolCandidates.length && recruitedIds.has(poolCandidates[candidateIdx].player.id)) {
        candidateIdx++;
      }
      if (candidateIdx >= poolCandidates.length) break;
      if (taken >= availableFromPool) break;

      const candidate = poolCandidates[candidateIdx];
      const p = JSON.parse(JSON.stringify(candidate.player));
      p.isStarter = false;
      p.battingOrder = 0;
      p.seasonStats = { batting: {}, pitching: {}, fielding: {} };
      p.careerHistory = p.careerHistory || [];
      p.careerHistory.push({ type: 'independent', label: `${teamInfo.teamName}入団`, year: currentYear + 1 });
      teamInfo.team.players.push(p);
      recruitedIds.add(candidate.player.id);
      teamInfo.needed--;
      taken++;
      candidateIdx++;
      anyRecruited = true;
    }
  }

  // プールから獲得した選手を削除（残りはユーザーのトライアウト候補として残る）
  for (let i = releasedPlayersPool.length - 1; i >= 0; i--) {
    if (recruitedIds.has(releasedPlayersPool[i].id)) {
      releasedPlayersPool.splice(i, 1);
    }
  }

  // プールで足りない分は新規選手を生成
  let nextId = (currentYear + 1) * 10000 + 8000;
  for (const teamInfo of shuffled) {
    while (teamInfo.needed > 0) {
      const newPlayer = generateIndependentNewcomer(nextId++, currentYear + 1);
      newPlayer.careerHistory = [{ type: 'independent', label: `${teamInfo.teamName}入団`, year: currentYear + 1 }];
      teamInfo.team.players.push(newPlayer);
      teamInfo.needed--;
    }
  }
}

function generateIndependentNewcomer(id, year) {
  const isPitcher = Math.random() < 0.45;
  const age = 18 + Math.floor(Math.random() * 5);
  const nameObj = generateRandomPlayerName();

  const baseAbility = () => 20 + Math.floor(Math.random() * 30);
  const lowAbility = () => 10 + Math.floor(Math.random() * 25);

  if (isPitcher) {
    return {
      id,
      name: nameObj.last + nameObj.first,
      age,
      position: 'pitcher',
      throws: Math.random() < 0.3 ? 'left' : 'right',
      bats: Math.random() < 0.4 ? 'left' : 'right',
      pitching: {
        velocity: 125 + Math.floor(Math.random() * 15),
        control: baseAbility(),
        stamina: 50 + Math.floor(Math.random() * 40),
        breakingBalls: [
          { type: 'slider', level: 20 + Math.floor(Math.random() * 30) },
          ...(Math.random() < 0.5 ? [{ type: 'curve', level: 15 + Math.floor(Math.random() * 25) }] : []),
        ],
      },
      batting: { meet: lowAbility(), power: lowAbility(), eye: lowAbility() },
      physical: { speed: baseAbility(), arm: baseAbility(), stamina: 50 + Math.floor(Math.random() * 30), bodyStamina: 40 + Math.floor(Math.random() * 30), recovery: 40 + Math.floor(Math.random() * 30) },
      fielding: { defense: lowAbility(), catcher: 0, positionFitness: {} },
      experience: 0,
      growthPotential: 0.7 + Math.random() * 0.6,
      growthModifier: 0,
      fame: 0,
      seasonStats: { batting: {}, pitching: {}, fielding: {} },
      careerStats: { batting: {}, pitching: {}, fielding: {} },
      form: Math.random() < 0.85 ? 'overhand' : (Math.random() < 0.5 ? 'sidearm' : 'threeQuarter'),
      isStarter: false,
      battingOrder: 0,
      traits: [],
    };
  }

  const fieldPositions = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  const position = fieldPositions[Math.floor(Math.random() * fieldPositions.length)];

  return {
    id,
    name: nameObj.last + nameObj.first,
    age,
    position,
    throws: Math.random() < 0.15 ? 'left' : 'right',
    bats: Math.random() < 0.35 ? 'left' : (Math.random() < 0.1 ? 'switch' : 'right'),
    pitching: { velocity: 110 + Math.floor(Math.random() * 15), control: lowAbility(), stamina: 30 + Math.floor(Math.random() * 20), breakingBalls: [] },
    batting: { meet: baseAbility(), power: baseAbility(), eye: baseAbility() },
    physical: { speed: baseAbility(), arm: baseAbility(), stamina: 50 + Math.floor(Math.random() * 30), bodyStamina: 40 + Math.floor(Math.random() * 30), recovery: 40 + Math.floor(Math.random() * 30) },
    fielding: { defense: baseAbility(), catcher: position === 'catcher' ? 30 + Math.floor(Math.random() * 30) : 0, positionFitness: { [position]: 80 + Math.floor(Math.random() * 20) } },
    experience: 0,
    growthPotential: 0.7 + Math.random() * 0.6,
    growthModifier: 0,
    fame: 0,
    seasonStats: { batting: {}, pitching: {}, fielding: {} },
    careerStats: { batting: {}, pitching: {}, fielding: {} },
    isStarter: false,
    battingOrder: 0,
    traits: [],
  };
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

  // 2.6. 全チームの注目度・ランクを更新（社会人＋独立＋大学）
  let rankChanges = [];
  let staffRetirements = [];
  rankChanges = updateAllRanks(seasonData);
  if (seasonData.settings?.corporateMode) {
    const userTeamName = Object.keys(updatedTeams)[0];
    for (const [teamName, teamData] of Object.entries(updatedTeams)) {
      if (teamData?.corporateData) {
        advanceSponsors(teamData.corporateData);
        const isUser = teamName === userTeamName;
        const retired = advanceStaffYear(teamData.corporateData.staff, !isUser, teamData.corporateData.rank);
        if (isUser && retired.length > 0) {
          staffRetirements = retired;
        }
      }
    }
  }

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

  // 5.5. 大学プール処理: 在学生の成長 + 卒業生を排出
  const currentYear = seasonData.year;
  const { graduates: uniGraduates, report: uniReport } = processUniversityYear(currentYear);
  // 卒業生の進路を能力別に振り分け
  // NPBドラフト漏れの大学卒業生 → 社会人候補 / 独立候補 / 引退
  const gradScored = uniGraduates.map(g => ({
    player: g,
    score: (g.position === 'pitcher'
      ? (g.pitching?.velocity - 120) * 1.5 + (g.pitching?.control || 0) + (g.pitching?.stamina || 0) * 0.4
      : (g.batting?.meet || 0) + (g.batting?.power || 0) + (g.batting?.eye || 0) * 0.5 + (g.physical?.speed || 0) * 0.3)
  }));
  gradScored.sort((a, b) => b.score - a.score);
  const corpCut = Math.floor(gradScored.length * 0.35);
  const indCut = corpCut + Math.floor(gradScored.length * 0.25);
  gradScored.forEach((entry, i) => {
    const grad = entry.player;
    grad.isStarter = false;
    grad.battingOrder = 0;
    grad.origin = 'university';
    grad.isReleasedCandidate = true;
    if (i < corpCut) {
      grad.postGradPath = 'corporate';
    } else if (i < indCut) {
      grad.postGradPath = 'independent';
    } else {
      grad.postGradPath = 'retired';
    }
    if (grad.postGradPath !== 'retired') {
      releasedPlayersPool.push(grad);
    }
  });

  // 5.6. 高校生プールの残り（ドラフト漏れ）をランク別に進路振り分け
  // 高校生プールは4月に生成、10月ドラフトで上位が除去済み
  let hsDistribution = { university: {}, corporate: [], independent: [], retired: [] };
  if (highSchoolPool.players.length > 0) {
    hsDistribution = distributeHighSchoolGraduates(currentYear + 1);
    // ランク別に大学入学
    enrollInUniversity(hsDistribution.university, currentYear + 1);
    // 社会人候補はリリースプールへ
    hsDistribution.corporate.forEach(p => {
      p.isStarter = false;
      p.battingOrder = 0;
      releasedPlayersPool.push(p);
    });
    // 独立候補もリリースプールへ
    hsDistribution.independent.forEach(p => {
      p.isStarter = false;
      p.battingOrder = 0;
      releasedPlayersPool.push(p);
    });
  }

  // 5.7. 大学モード: 4年生卒業＋ロスター入れ替え（TEAMS_DATA上のチーム）
  let universityGraduationReport = null;
  if (seasonData.settings?.universityMode) {
    universityGraduationReport = processUniversityTeamGraduation(teamsAfterRetirement, seasonData, currentYear);
  }

  // 5.8. 独立リーグAIチームの補充（リリースプールから獲得＋新人生成）
  if (!seasonData.settings?.corporateMode && !seasonData.settings?.universityMode) {
    replenishIndependentLeagueRosters(teamsAfterRetirement, currentYear);
  }

  // 6. 新シーズンデータ作成
  const newYear = seasonData.year + 1;
  const newSeasonData = createSeasonData(newYear);
  newSeasonData.settings = { ...seasonData.settings };

  // 社会人モード: トーナメントシード引き継ぎ
  if (seasonData.settings?.corporateMode) {
    newSeasonData.schedule = [];
    newSeasonData.standings = [];
    newSeasonData.tournamentSeeds = extractTournamentSeeds(seasonData);
    // 前年都市対抗チャンピオン引き継ぎ
    if (seasonData.toshitaikou?.mainTournament?.champion) {
      newSeasonData.prevToshitaikouChampion = seasonData.toshitaikou.mainTournament.champion;
    }
    // 大会結果アーカイブ
    const prevHistory = seasonData.tournamentHistory || [];
    const yearRecord = { year: seasonData.year, calendarYear: seasonData.currentDate?.year };
    const rt = seasonData.regionalTournament;
    if (rt?.phase === 'done' && rt.brackets) {
      yearRecord.regional = {};
      Object.entries(rt.brackets).forEach(([rid, region]) => {
        yearRecord.regional[rid] = { regionName: region.regionName, champion: region.champion };
      });
    }
    const td = seasonData.toshitaikou;
    if (td?.generated) {
      yearRecord.toshitaikou = { champion: td.champion, runnerUp: td.runnerUp };
      if (td.qualifiers) {
        yearRecord.toshitaikouQualifiers = {};
        Object.entries(td.qualifiers).forEach(([rid, q]) => {
          yearRecord.toshitaikouQualifiers[rid] = { regionName: q.regionName, qualifiedTeams: q.qualifiedTeams || [] };
        });
      }
    }
    const ns = seasonData.nihonSenshuken;
    if (ns?.generated) {
      yearRecord.senshuken = { champion: ns.champion, runnerUp: ns.runnerUp };
    }
    const cs = seasonData.clubSenshuken;
    if (cs?.generated) {
      yearRecord.club = { champion: cs.champion, runnerUp: cs.runnerUp };
    }
    newSeasonData.tournamentHistory = [...prevHistory, yearRecord];
  } else if (seasonData.settings?.universityMode) {
    // 大学モード: 新シーズンのスケジュール・順位表を大学リーグから取得
    const regionId = seasonData.settings.universityRegion;
    newSeasonData.schedule = [];
    newSeasonData.standings = [];
    // 大会結果アーカイブ
    const prevHistory = seasonData.tournamentHistory || [];
    const yearRecord = { year: seasonData.year, calendarYear: seasonData.currentDate?.year };
    if (seasonData.universityChampionship?.phase === 'done') {
      yearRecord.universityChampionship = {
        champion: seasonData.universityChampionship.champion,
        runnerUp: seasonData.universityChampionship.runnerUp,
      };
    }
    if (seasonData.meijiJingu?.phase === 'done') {
      yearRecord.meijiJingu = {
        champion: seasonData.meijiJingu.champion,
        runnerUp: seasonData.meijiJingu.runnerUp,
      };
    }
    newSeasonData.tournamentHistory = [...prevHistory, yearRecord];
    if (universityGraduationReport) {
      newSeasonData.universityGraduationReport = universityGraduationReport;
    }
  } else {
    // 独立リーグモード: スケジュールはレギュレーション設定後に生成
    const teams = Object.keys(teamsAfterRetirement);
    newSeasonData.schedule = [];
    newSeasonData.standings = initializeStandings(teams);
  }

  // 年齢カーブの結果を新シーズンデータに保存（キャンプ画面で表示用）
  newSeasonData.ageReports = ageReports;
  // 大学プールの状態を記録
  const uniEnrollCount = Object.values(hsDistribution.university).reduce((sum, arr) => sum + arr.length, 0);
  const gradCorpCount = gradScored.filter(e => e.player.postGradPath === 'corporate').length;
  const gradIndCount = gradScored.filter(e => e.player.postGradPath === 'independent').length;
  const gradRetiredCount = gradScored.filter(e => e.player.postGradPath === 'retired').length;
  newSeasonData.universityReport = {
    graduated: uniReport.graduated,
    newEnrollment: uniEnrollCount,
    corporateCount: hsDistribution.corporate.length,
    independentCount: hsDistribution.independent.length,
    retiredCount: hsDistribution.retired.length,
    growing: uniReport.grown,
    gradPaths: { corporate: gradCorpCount, independent: gradIndCount, retired: gradRetiredCount },
  };

  // 大学リーグの新シーズン初期化
  if (WORLD_DATA.initialized) {
    initializeUniversityLeagues(newSeasonData.currentDate?.year || 2024);
  }

  // 大学モード: リーグ再初期化後にスケジュール・順位表を設定
  if (seasonData.settings?.universityMode) {
    const regionId = seasonData.settings.universityRegion;
    const teamNames = Object.keys(teamsAfterRetirement);
    newSeasonData.schedule = getUniversityLeagueSchedule(regionId);
    newSeasonData.standings = getUniversityLeagueStandings(regionId, teamNames);
  }

  // ランク変動レポートを新シーズンデータに保存
  if (rankChanges.length > 0) {
    newSeasonData.rankChanges = rankChanges;
  }

  // スタッフ退職レポートを新シーズンデータに保存
  if (staffRetirements.length > 0) {
    newSeasonData.staffRetirements = staffRetirements;
  }

  return {
    newSeasonData,
    updatedTeams: teamsAfterRetirement,
    awards,
    retirements,
    ageReports,
    rankChanges,
    universityGraduationReport,
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

  if (WORLD_DATA.initialized) {
    initializeUniversityLeagues(newSeasonData.currentDate?.year || 2024);
  }

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

          // 筋力/器用さによる成長方向の補正（成長方向のみ適用、衰退には影響しない）
          const MUSCLE_STATS = ['power', 'arm', 'speed', 'velocity', 'bodyStamina'];
          const DEXTERITY_STATS = ['meet', 'eye', 'defense', 'control', 'steal'];
          const muscle = player.physical?.muscle ?? 50;
          const dexterity = player.physical?.dexterity ?? 50;
          let physiqueMult = 1.0;
          if (MUSCLE_STATS.includes(stat)) {
            physiqueMult = 0.5 + (muscle / 100) * 1.0;
          } else if (DEXTERITY_STATS.includes(stat)) {
            physiqueMult = 0.5 + (dexterity / 100) * 1.0;
          }

          const effectiveRaw = (player.growthPotential ?? 1.0) + (player.growthModifier || 0);
          const growthPotential = Math.max(0, Math.min(1.8, effectiveRaw));
          const decayMult = effectiveRaw < 0 ? 1 + Math.abs(effectiveRaw) * 0.5 : 1.0;

          // プロ意識: 衰退を緩和（プロ意識100=60%, 50=80%, 0=100%の衰退速度）
          const discipline = player.personality?.discipline ?? 50;
          const decayDiscMult = 1.0 - (discipline / 100) * 0.4;

          // 最終変動値（四捨五入、±0の場合もある）
          let rawChange = base + variance;
          // 成長方向: ポテンシャル + 筋力/器用さ補正（プロ意識は練習に集中）
          // 衰退方向: マイナスポテンシャルで加速 + プロ意識で緩和
          let change = rawChange > 0
            ? Math.round(rawChange * ageTalentMult * growthPotential * physiqueMult)
            : Math.round(rawChange * decayMult * decayDiscMult);

          // 能力値を取得・更新
          const statPath = getStatPath(stat);
          if (!statPath) return;

          const currentValue = getNestedValue(updatedPlayer, statPath);
          if (currentValue == null) return;

          // フォーム別成長補正
          const formEff = PITCHING_FORM_EFFECTS[updatedPlayer.pitching?.form] || PITCHING_FORM_EFFECTS.threeQuarter;
          const formVelMult = stat === 'velocity' ? (formEff.velocityGrowthMult || 1.0) : 1.0;
          const formCtrlMult = stat === 'control' ? (formEff.controlGrowthMult || 1.0) : 1.0;

          // 球速は変動幅を1.2倍に（スケールが大きいため）+ フォーム補正 + 筋力補正
          if (stat === 'velocity') change = rawChange > 0
            ? Math.round(rawChange * 1.2 * ageTalentMult * growthPotential * formVelMult * physiqueMult)
            : Math.round(rawChange * 1.2 * decayMult * decayDiscMult);
          // 制球はフォーム補正適用（器用さ補正は既にchangeに適用済み）
          if (stat === 'control' && rawChange > 0) change = Math.round(change * formCtrlMult);
          // スタミナも変動幅を1.2倍（成長方向のみポテンシャル適用）
          if (stat === 'stamina') change = rawChange > 0
            ? Math.round(rawChange * 1.2 * growthPotential)
            : Math.round(rawChange * 1.2 * decayMult * decayDiscMult);

          const newValue = Math.max(1, currentValue + change);

          if (change !== 0) {
            updatedPlayer = setNestedValue(updatedPlayer, statPath, newValue);
            changes.push({
              stat, statName: getStatName(stat),
              before: currentValue, after: newValue, change
            });

            // 球速⇔肩力の連動
            if (stat === 'velocity') {
              const armChange = Math.round(change * 0.5);
              if (armChange !== 0) {
                const armPath = getStatPath('arm');
                const currentArm = getNestedValue(updatedPlayer, armPath);
                if (currentArm != null) {
                  const newArm = Math.max(1, Math.min(99, currentArm + armChange));
                  if (newArm !== currentArm) {
                    updatedPlayer = setNestedValue(updatedPlayer, armPath, newArm);
                    changes.push({ stat: 'arm', statName: getStatName('arm'), before: currentArm, after: newArm, change: newArm - currentArm });
                  }
                }
              }
            }
            if (stat === 'arm' && player.position !== 'pitcher') {
              const velChange = Math.round(change * 0.5);
              if (velChange !== 0) {
                const velPath = getStatPath('velocity');
                const currentVel = getNestedValue(updatedPlayer, velPath);
                if (currentVel != null) {
                  const newVel = Math.max(100, Math.min(150, currentVel + velChange));
                  if (newVel !== currentVel) {
                    updatedPlayer = setNestedValue(updatedPlayer, velPath, newVel);
                    changes.push({ stat: 'velocity', statName: getStatName('velocity'), before: currentVel, after: newVel, change: newVel - currentVel });
                  }
                }
              }
            }
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
