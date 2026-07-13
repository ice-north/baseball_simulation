// ============================================================
// 年間進行システム - yearProgressionSystem.js
// シーズン終了処理、年度更新、引退、解雇
// 年齢カーブによる成長・衰退システム
// ============================================================

import { createSeasonData, initializeStandings } from './seasonManager.js';
import { generateFullSeasonSchedule } from './scheduleGenerator.js';
import { PHYSICAL_STATS, TECHNICAL_STATS, getAgeGrowthBase, getStatPath, getStatName, getNestedValue, setNestedValue } from './growthUtils.js';
import { PITCHING_FORM_EFFECTS } from '../utils/constants.js';
import { generateHighSchoolClass, assignCareerPaths, enrollInUniversity, processUniversityYear, universityPool, highSchoolPool, processHighSchoolNPBDraft, distributeHighSchoolGraduates, HIGH_SCHOOL_CLASS_SIZE } from './universityPool.js';
import { initializeUniversityLeagues, processUniversityPromotionRelegation } from '../university/universityLeagueManager.js';
import { getUniversityLeagueSchedule, getUniversityLeagueStandings } from '../university/universityInit.js';
import { generatePositionFitness } from './tryoutSystem.js';
import { syncPositionToFitness, getVelocityCap, getVelocityCatchupMult } from '../utils/physics.js';
import { WORLD_DATA } from '../corporate/worldData.js';
import { releasedPlayersPool, TEAMS_DATA } from '../teams-data.js';
import { addToReleasedPool, replaceReleasedPool, removeFromReleasedPoolByIds } from '../state/pools.js';
import { addToRoster, replaceRoster } from '../state/roster.js';
// 成長・衰退の計算は growthSystem.js に抽出。内部利用のため import し、
// 従来 export されていた3関数は互換性維持のため再エクスポートする。
import { updateGrowthModifiers, applyFreeAgentGrowth, applyCorporatePlayerGrowth, applyAgeCurveChanges } from './growthSystem.js';
// CPU並行世界のロスター管理（大学卒業/新入生・社会人/独立の戦力外/補充）は rosterProgression.js に抽出
import { processUniversityTeamGraduation, releaseCPUCorporatePlayers, replenishCorporateRosters, replenishIndependentLeagueRosters } from './rosterProgression.js';
export { updateGrowthModifiers, applyCorporatePlayerGrowth, applyAgeCurveChanges };
import { updateAllTeamReputations, updateAllRanks, advanceSponsors, applyReputationDecay, applyUniversityReputationDecay, resetIndependentLeagueSchedules } from '../corporate/corporateInit.js';
import { extractTournamentSeeds } from '../corporate/toshitaikou.js';
import { advanceStaffYear } from '../corporate/staffData.js';
import { generateRandomPlayerName } from '../data/playerNames.js';
export { TRAINING_MENUS, SUB_TRAINING_MENUS, executeTeamCampTraining, executeSubTraining, executeCampTraining, ALL_PITCH_TYPES, getPitchTypeName, FORM_PITCH_AFFINITY, calcSecondAffinity, calculateSeasonExperience, updateAllPlayersExperience, applyMotivationEffect, applyBatteryMentalEffect } from './campTraining.js';
export { DISPATCH_DESTINATIONS, DISPATCH_LIMITS, calcPlayerOverall, checkDispatchEligibility, executeDispatchTraining, resolveDispatchTraining, getUniversityDispatchOptions, getAvailableDispatchKeys } from './dispatchSystem.js';

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
  const players = generateHighSchoolClass(year, HIGH_SCHOOL_CLASS_SIZE);
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
    if (idx !== -1) {
      rotation.starters.splice(idx, 1);
      if (rotation.starters.length > 0) {
        rotation.currentStarterIndex = (rotation.currentStarterIndex || 0) % rotation.starters.length;
      } else {
        rotation.currentStarterIndex = 0;
      }
    }
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

  // 大学/社会人モード等では自チームリーグのみを対象にする
  const eligibleTeamNames = seasonData.settings?.teamNames;
  const filteredTeams = eligibleTeamNames?.length
    ? Object.fromEntries(Object.entries(allTeams).filter(([name]) => eligibleTeamNames.includes(name)))
    : allTeams;
  const allPlayers = collectAllPlayers(filteredTeams);
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
export function snapshotRankings(allTeams, eligibleTeamNames) {
  const filteredTeams = eligibleTeamNames?.length
    ? Object.fromEntries(Object.entries(allTeams).filter(([name]) => eligibleTeamNames.includes(name)))
    : allTeams;
  const allPlayers = collectAllPlayers(filteredTeams);

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

  // 大学所属選手: 4年生(22歳)のみ指名対象
  if (player.universityTeamId || player.universityYear) {
    if (age < 22) return { isDraftEligible: false, reasons: ['大学4年生のみ指名可'], totalScore: 0 };
  }

  // 年齢ボーナス（若い選手の将来性を評価）
  // 実際のNPBドラフトでは高校生が1巡目の3-5人を占める
  const ageBonusMap = { 18: 33, 19: 27, 20: 15, 21: 8, 22: 5, 23: 2, 24: 0, 25: -10, 26: -22, 27: -35, 28: -50, 29: -65 };
  const ageBonus = ageBonusMap[age] !== undefined ? ageBonusMap[age] : (age < 18 ? 33 : -65);

  // 将来性投影倍率（若い選手の能力を伸びしろ込みで評価）
  const potentialMult = age <= 18 ? 1.22 : age <= 19 ? 1.15 : age <= 20 ? 1.06 : age <= 21 ? 1.02 : 1.0;

  // 成長力ボーナス（若い選手ほど成長力が大きく評価される）
  const gp = player.growthPotential || 1.0;
  const gpBonus = age <= 19 ? Math.max(0, (gp - 0.60) * 45)
               : age <= 22 ? Math.max(0, (gp - 0.8) * 25)
               : Math.max(0, (gp - 1.0) * 15);

  // 知名度ボーナス
  const fame = player.fame || 0;
  const fameBonus = Math.round(fame * 0.3);

  let baseScore = 0;

  // 年齢別評価傾向: 高校生=素材(フィジカル)重視、社会人=技術(完成度)重視
  const isYoung = age <= 19;
  const isMature = age >= 22;

  if (isPitcher) {
    const velocity = player.pitching?.velocity || 0;
    const control = player.pitching?.control || 0;
    const stamina = player.pitching?.stamina || 0;
    const arsenal = player.pitching?.arsenal || [];
    const breakingBalls = arsenal.filter(a => a.type !== 'straight');
    const bestBreaking = breakingBalls.reduce((max, a) => Math.max(max, a.level || 0), 0);
    const arsenalCount = breakingBalls.filter(a => (a.level || 0) >= 20).length;

    // 年齢別ウェイト: 高校生は球速重視、社会人は制球・変化球重視
    const velBase = isYoung ? 1.5 : isMature ? 0.9 : 1.1;
    const vel140 = isYoung ? 4.0 : isMature ? 2.5 : 3.0;
    const vel150 = isYoung ? 5.0 : isMature ? 3.0 : 3.5;
    const ctrlW = isYoung ? 0.7 : isMature ? 1.4 : 1.1;
    const staW = isYoung ? 0.15 : isMature ? 0.35 : 0.25;
    const breakW = isYoung ? 0.5 : isMature ? 1.0 : 0.8;

    let velocityScore = Math.max(0, (velocity - 110) * velBase);
    if (velocity >= 140) velocityScore += (velocity - 140) * vel140;
    if (velocity >= 150) velocityScore += (velocity - 150) * vel150;

    const breakingScore = bestBreaking * breakW + (arsenalCount >= 3 ? 12 : arsenalCount >= 2 ? 5 : 0);

    let rawAbility = velocityScore + control * ctrlW + stamina * staW + breakingScore;

    // 高校生: 肩力(フィジカル素材)を加点、変則フォーム(アンダー/サイド)は指名されにくい
    if (isYoung) {
      rawAbility += (player.physical?.arm || 0) * 0.3;
      const form = player.pitching?.form;
      if (form === 'submarine') rawAbility -= 20;
      else if (form === 'sidearm') rawAbility -= 10;
    }
    // 社会人: 変則フォームは技術・希少性として評価
    if (isMature) {
      const form = player.pitching?.form;
      if (form === 'submarine') rawAbility += 8;
      else if (form === 'sidearm') rawAbility += 5;
    }

    const abilityScore = rawAbility * potentialMult;

    const abilityFactor = Math.min(1.0, rawAbility / 120);
    const gpBonusScaled = age <= 19 ? Math.max(0, (gp - 0.60) * 45) * abilityFactor
                        : age <= 22 ? Math.max(0, (gp - 0.8) * 25) * abilityFactor
                        : Math.max(0, (gp - 1.0) * 15);

    baseScore = abilityScore + ageBonus + gpBonusScaled + fameBonus;
    const totalScore = baseScore + awardBonus;

    reasons.push(`投手力${Math.round(abilityScore)}pt`);
    if (fameBonus > 0) reasons.push(`知名度+${fameBonus}pt`);
    if (awardBonus > 0) reasons.push(`成績ボーナス+${awardBonus}pt`);
    reasons.push(`総合${Math.round(totalScore)}pt`);
    if (isYoung && velocity >= 140) reasons.push(`球速${velocity}km`);
    if (!isYoung && velocity >= 148) reasons.push(`球速${velocity}km`);
    if (isMature && control >= 65) reasons.push(`制球力${control}`);
    if (isMature && bestBreaking >= 60) reasons.push(`変化球${bestBreaking}`);
    if (age <= 22) reasons.push(`${age}歳の将来性`);
  } else {
    const meet = player.batting?.meet || 0;
    const power = player.batting?.power || 0;
    const eye = player.batting?.eye || 0;
    const speed = player.physical?.speed || 0;
    const defense = player.fielding?.defense || 0;
    const arm = player.physical?.arm || 0;

    // 年齢別ウェイト: 高校生はパワー/足/肩、社会人はミート/選球眼/守備
    const meetW = isYoung ? 0.6 : isMature ? 1.3 : 1.0;
    const powerW = isYoung ? 1.4 : isMature ? 0.8 : 1.0;
    const eyeW = isYoung ? 0.2 : isMature ? 0.8 : 0.5;
    const speedW = isYoung ? 0.8 : isMature ? 0.3 : 0.4;
    const defW = isYoung ? 0.2 : isMature ? 0.7 : 0.4;
    const armW = isYoung ? 0.6 : isMature ? 0.2 : 0.3;

    const rawAbility = meet * meetW + power * powerW + eye * eyeW + speed * speedW + defense * defW + arm * armW;
    const abilityScore = rawAbility * potentialMult;

    const abilityFactor = Math.min(1.0, rawAbility / 130);
    const gpBonusScaled = age <= 19 ? Math.max(0, (gp - 0.60) * 45) * abilityFactor
                        : age <= 22 ? Math.max(0, (gp - 0.8) * 25) * abilityFactor
                        : Math.max(0, (gp - 1.0) * 15);

    baseScore = abilityScore + ageBonus + gpBonusScaled + fameBonus;
    const totalScore = baseScore + awardBonus;

    reasons.push(`野手力${Math.round(abilityScore)}pt`);
    if (fameBonus > 0) reasons.push(`知名度+${fameBonus}pt`);
    if (awardBonus > 0) reasons.push(`成績ボーナス+${awardBonus}pt`);
    reasons.push(`総合${Math.round(totalScore)}pt`);
    if (isYoung && power >= 55) reasons.push(`パワー${power}`);
    if (isYoung && speed >= 65) reasons.push(`俊足${speed}`);
    if (isYoung && arm >= 65) reasons.push(`強肩${arm}`);
    if (isMature && meet >= 60) reasons.push(`ミート${meet}`);
    if (isMature && defense >= 65) reasons.push(`守備${defense}`);
    if (isMature && eye >= 55) reasons.push(`選球眼${eye}`);
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

  // === 安全策: 高校生プールが空なら即座に生成 ===
  if (highSchoolPool.players.length === 0 && gameYear >= 1) {
    console.warn(`[NPBDraft] 高校生プールが空です（Year ${gameYear}）。自動生成します。`);
    const hsPlayers = generateHighSchoolClass(gameYear, HIGH_SCHOOL_CLASS_SIZE);
    highSchoolPool.players = hsPlayers;
    highSchoolPool.year = gameYear;
  }

  // === 全ソースから候補を収集し、統一スコアで評価 ===
  const allCandidates = [];

  // 1. チーム選手（社会人 / 独立リーグ / 大学）
  Object.entries(allTeams).forEach(([teamName, team]) => {
    if (!team.players) return;
    const source = team.independentLeagueId ? 'independent'
                 : team.corporateData ? 'corporate'
                 : team.universityData ? 'university_team'
                 : 'independent';
    team.players.forEach(player => {
      if (player.age >= 30) return;
      if (source === 'university_team') {
        // 大学: 4年生（22歳）のみ指名対象
        if (player.age < 22 || (player.universityYear && player.universityYear < 4)) return;
      } else if (source === 'corporate') {
        // 社会人: 高卒3年目(21歳〜)、大卒2年目(24歳〜)
        // 大卒社会人は23歳で入社→2年目の24歳でドラフト、翌年25歳でNPB入り
        const hasUniHistory = player.careerHistory?.some(h => h.type === 'university');
        if (hasUniHistory) {
          if (player.age < 24) return;
        } else {
          if (player.age < 21) return;
        }
      }
      // 独立リーグ: 年齢制限なし（1年目から指名対象）
      const baseBonus = awardBonusMap[player.id]?.bonus || 0;
      // 大卒社会人経験ボーナス: age25-26はageBonus(-10〜-22)を補正
      const hasUniHistoryForBonus = source === 'corporate' && player.careerHistory?.some(h => h.type === 'university');
      const corpExpBonus = hasUniHistoryForBonus && player.age >= 25 && player.age <= 26
        ? Math.max(0, (27 - player.age) * 5)  // 25歳:+10, 26歳:+5
        : 0;
      const bonus = baseBonus + corpExpBonus;
      const awards = awardBonusMap[player.id]?.awards || [];
      const { totalScore } = checkNPBDraftEligibility(player, bonus);
      const isClub = source === 'corporate' && team.corporateData?.type === 'club';
      allCandidates.push({
        player, teamName, score: totalScore, bonus, awards, source, isClub,
        hofResult: checkHallOfFame(player),
      });
    });
  });

  // 2. 高校生プール
  highSchoolPool.players.forEach(player => {
    const { totalScore } = checkNPBDraftEligibility(player, 0);
    allCandidates.push({
      player, teamName: player.highSchool?.name ? player.highSchool.name + '高' : '高校', score: totalScore, bonus: 0, awards: [],
      source: 'highschool',
    });
  });

  // 3. 大学4年生（22歳）のみ
  Object.entries(universityPool).forEach(([enrollYear, cohort]) => {
    if (!cohort) return;
    const ey = parseInt(enrollYear);
    cohort.forEach(entry => {
      const yearsInUni = gameYear - ey;
      if (yearsInUni >= 4 || entry.player.age >= 22) {
        const { totalScore } = checkNPBDraftEligibility(entry.player, 0);
        allCandidates.push({
          player: entry.player, teamName: entry.universityTeamName || '大学', score: totalScore,
          bonus: 0, awards: [], source: 'university',
          enrollYear: ey, universityRank: entry.universityRank,
        });
      }
    });
  });

  // === 候補数の診断ログ ===
  const sourceCounts = { highschool: 0, university: 0, university_team: 0, corporate: 0, independent: 0 };
  allCandidates.forEach(c => { sourceCounts[c.source] = (sourceCounts[c.source] || 0) + 1; });
  console.log(`[NPBDraft Year${gameYear}] 候補数: 高校${sourceCounts.highschool} 大学pool${sourceCounts.university} 大学team${sourceCounts.university_team} 社会人${sourceCounts.corporate} 独立${sourceCounts.independent} 合計${allCandidates.length}`);

  // === スコア順にソートし、候補の質に応じて指名 ===
  allCandidates.sort((a, b) => b.score - a.score);

  const numTeams = NPB_TEAMS.length;
  const MIN_DRAFT_SCORE = 80;
  const MIN_IKU_SCORE = 65;
  const eligible = allCandidates.filter(c => c.score >= MIN_IKU_SCORE);
  const mainEligible = allCandidates.filter(c => c.score >= MIN_DRAFT_SCORE);

  // 候補の質で本指名巡数を決定（良い候補が多いほど多巡）
  const mainCandPerTeam = Math.floor(mainEligible.length / numTeams);
  const baseMainRounds = mainCandPerTeam >= 8 ? 6 : mainCandPerTeam >= 6 ? 5 : 4;

  // 球団ごとの指名枠を個別に設定
  const IKU_HEAVY_TEAMS = new Set(['読売ジャイアンツ', 'ソフトバンクホークス', '西武ライオンズ', 'オリックス・バファローズ']);
  const teamDraftLimits = {};
  NPB_TEAMS.forEach(team => {
    // 本指名: baseMainRounds ± 1のバラつき
    const mainVariance = Math.floor(Math.random() * 3) - 1;
    const mainPicks = Math.max(3, Math.min(7, baseMainRounds + mainVariance));
    // 育成: 全球団が参加。育成積極球団は2-4名、それ以外は1-2名
    const isIkuHeavy = IKU_HEAVY_TEAMS.has(team);
    const ikuPicks = isIkuHeavy
      ? 2 + Math.floor(Math.random() * 3)
      : 1 + Math.floor(Math.random() * 2);
    teamDraftLimits[team] = { mainPicks, ikuPicks, mainDone: 0, ikuDone: 0 };
  });
  const eligibleSourceCounts = { highschool: 0, university: 0, corporate: 0, independent: 0 };
  eligible.forEach(c => {
    const src = c.source === 'university_team' ? 'university' : c.source;
    eligibleSourceCounts[src] = (eligibleSourceCounts[src] || 0) + 1;
  });
  const totalMainSlots = Object.values(teamDraftLimits).reduce((s, t) => s + t.mainPicks, 0);
  const totalIkuSlots = Object.values(teamDraftLimits).reduce((s, t) => s + t.ikuPicks, 0);
  console.log(`[NPBDraft Year${gameYear}] eligible(≥${MIN_IKU_SCORE}): 高校${eligibleSourceCounts.highschool} 大学${eligibleSourceCounts.university} 社会人${eligibleSourceCounts.corporate} 独立${eligibleSourceCounts.independent} 合計${eligible.length} / 本指名枠=${totalMainSlots} 育成枠=${totalIkuSlots}`);

  // === スコア分布の診断ログ ===
  const scoresBySource = { highschool: [], university: [], corporate: [], independent: [] };
  eligible.forEach(c => {
    const src = c.source === 'university_team' ? 'university' : c.source;
    if (scoresBySource[src]) scoresBySource[src].push(c.score);
  });
  for (const [src, scores] of Object.entries(scoresBySource)) {
    if (scores.length === 0) continue;
    scores.sort((a, b) => b - a);
    const top5 = scores.slice(0, 5).map(s => Math.round(s));
    const median = scores.length > 0 ? Math.round(scores[Math.floor(scores.length / 2)]) : 0;
    console.log(`[NPBDraft] ${src} scores: top5=[${top5}] median=${median} count=${scores.length}`);
  }
  const top12 = eligible.slice(0, 12);
  const top12Sources = { highschool: 0, university: 0, corporate: 0, independent: 0 };
  top12.forEach(c => {
    const src = c.source === 'university_team' ? 'university' : c.source;
    top12Sources[src] = (top12Sources[src] || 0) + 1;
  });
  console.log(`[NPBDraft] Top12(1st round pool): HS=${top12Sources.highschool} 大学=${top12Sources.university} 社会人=${top12Sources.corporate} 独立=${top12Sources.independent}`);
  const top120 = eligible.slice(0, Math.min(120, eligible.length));
  const top120Sources = { highschool: 0, university: 0, corporate: 0, independent: 0 };
  top120.forEach(c => {
    const src = c.source === 'university_team' ? 'university' : c.source;
    top120Sources[src] = (top120Sources[src] || 0) + 1;
  });
  console.log(`[NPBDraft] Top120(full draft): HS=${top120Sources.highschool} 大学=${top120Sources.university} 社会人=${top120Sources.corporate} 独立=${top120Sources.independent}`);

  const maxMainRounds = Math.max(...NPB_TEAMS.map(t => teamDraftLimits[t].mainPicks));
  const maxIkuRounds = Math.max(...NPB_TEAMS.map(t => teamDraftLimits[t].ikuPicks));

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
      source, score, isClub: candidate.isClub || false,
    };
  };

  const draftedPlayers = [];
  const nearMissPlayers = [];
  const shuffledTeams = [...NPB_TEAMS].sort(() => Math.random() - 0.5);
  const takenIds = new Set();

  // === チーム構成バランス追跡 ===
  const teamDraftTracker = {};
  NPB_TEAMS.forEach(team => {
    teamDraftTracker[team] = { pitchers: 0, batters: 0, highschool: 0, university: 0, corporate: 0, independent: 0, total: 0, ageYoung: 0, ageMid: 0, ageOld: 0 };
  });

  const updateDraftTracker = (team, candidate) => {
    const tracker = teamDraftTracker[team];
    if (!tracker) return;
    tracker.total++;
    if (candidate.player.position === 'pitcher') {
      tracker.pitchers++;
    } else {
      tracker.batters++;
    }
    const src = candidate.source === 'university_team' ? 'university' : candidate.source;
    if (tracker[src] !== undefined) tracker[src]++;
    // 年齢グループ追跡
    const age = candidate.player.age || 20;
    if (age <= 19) tracker.ageYoung++;
    else if (age <= 22) tracker.ageMid++;
    else tracker.ageOld++;
  };

  const getBalancePenalty = (team, candidate, tracker) => {
    const t = tracker[team];
    if (!t || t.total < 2) return 0;
    let penalty = 0;
    const isPitcher = candidate.player.position === 'pitcher';
    const pitcherRatio = t.pitchers / t.total;
    const batterRatio = t.batters / t.total;

    // 投手/野手バランス: 65%超で強ペナルティ、75%超でさらに強化
    if (isPitcher && t.total >= 2) {
      if (pitcherRatio >= 0.75) penalty += -40 - (t.pitchers - 2) * 15;
      else if (pitcherRatio >= 0.65) penalty += -20;
    }
    if (!isPitcher && t.total >= 2) {
      if (batterRatio >= 0.75) penalty += -40 - (t.batters - 2) * 15;
      else if (batterRatio >= 0.65) penalty += -20;
    }

    // ソース別バランス: 60%超で同一ソース偏りペナルティ、75%超でさらに強化
    const src = candidate.source === 'university_team' ? 'university' : candidate.source;
    const srcCount = t[src] || 0;
    if (t.total >= 2 && srcCount >= 2) {
      const sourceRatio = srcCount / t.total;
      if (sourceRatio >= 0.75) penalty += -35 - (srcCount - 2) * 10;
      else if (sourceRatio >= 0.60) penalty += -15;
    }

    // 年齢グループバランス: 60%超で偏りペナルティ、75%超でさらに強化
    const age = candidate.player.age || 20;
    const ageGroup = age <= 19 ? 'ageYoung' : age <= 22 ? 'ageMid' : 'ageOld';
    const ageCount = t[ageGroup] || 0;
    if (t.total >= 2 && ageCount >= 2) {
      const ageRatio = ageCount / t.total;
      if (ageRatio >= 0.75) penalty += -30 - (ageCount - 2) * 10;
      else if (ageRatio >= 0.60) penalty += -12;
    }

    return penalty;
  };

  // === 球団別好み（チーム固有の選手評価バイアス） ===
  // 各球団がランダムに好みを持ち、1巡目・2巡目以降の指名に影響
  const teamPreferences = {};
  NPB_TEAMS.forEach(team => {
    const pitcherBias = (Math.random() - 0.5) * 30;   // -15〜+15: 投手好き/野手好き
    const youthBias = (Math.random() - 0.5) * 20;     // -10〜+10: 若手好き/即戦力好き
    const powerBias = (Math.random() - 0.5) * 16;     // -8〜+8: パワー重視/技巧重視
    const speedBias = (Math.random() - 0.5) * 12;     // -6〜+6: 俊足重視/鈍足許容
    const sourceBias = {};
    ['highschool', 'university', 'university_team', 'corporate', 'independent'].forEach(s => {
      sourceBias[s] = (Math.random() - 0.5) * 14;     // -7〜+7: ソース別好み
    });
    teamPreferences[team] = { pitcherBias, youthBias, powerBias, speedBias, sourceBias };
  });

  const getTeamPreferenceScore = (team, candidate) => {
    const pref = teamPreferences[team];
    if (!pref) return 0;
    const p = candidate.player;
    let bonus = 0;
    bonus += p.position === 'pitcher' ? pref.pitcherBias : -pref.pitcherBias;
    bonus += (p.age <= 20 ? pref.youthBias : p.age >= 24 ? -pref.youthBias : 0);
    if (p.position !== 'pitcher') {
      bonus += ((p.batting?.power || 0) >= 55 ? pref.powerBias : -pref.powerBias * 0.5);
      bonus += ((p.physical?.speed || 0) >= 65 ? pref.speedBias : -pref.speedBias * 0.5);
    }
    bonus += pref.sourceBias[candidate.source] || 0;
    return bonus;
  };

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
      // 上位候補に絞って評価（全候補を見るのは不要）
      const topN = eligible.filter(c => !takenIds.has(c.player.id)).slice(0, 40);
      for (const c of topN) {
        const prefBonus = getTeamPreferenceScore(team, c);
        const noise = (Math.random() - 0.5) * 20;
        const pref = c.score + prefBonus + noise;
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
        const altCands = eligible.filter(c => !allPickedIds.has(c.player.id) && !takenIds.has(c.player.id)).slice(0, 30);
        let bestCand = null, bestScore = -Infinity;
        for (const c of altCands) {
          const prefBonus = getTeamPreferenceScore(team, c);
          const pref = c.score + prefBonus + (Math.random() - 0.5) * 15;
          if (pref > bestScore) { bestScore = pref; bestCand = c; }
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
      const remaining = eligible.filter(c => !takenIds.has(c.player.id)).slice(0, 30);
      let bestCand = null, bestScore = -Infinity;
      for (const c of remaining) {
        const prefBonus = getTeamPreferenceScore(team, c);
        const pref = c.score + prefBonus + (Math.random() - 0.5) * 15;
        if (pref > bestScore) { bestScore = pref; bestCand = c; }
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
    updateDraftTracker(team, cand);
    if (teamDraftLimits[team]) teamDraftLimits[team].mainDone++;
  }

  // === 2巡目以降（本指名のみ）: ウェーバー/逆ウェーバー交互制 ===
  for (let round = 1; round < maxMainRounds; round++) {
    const teamOrder = round % 2 === 1 ? waiverOrder : reverseWaiverOrder;
    for (const npbTeam of teamOrder) {
      const limits = teamDraftLimits[npbTeam];
      if (limits.mainDone >= limits.mainPicks) continue;
      const remaining = mainEligible.filter(c => !takenIds.has(c.player.id));
      if (remaining.length === 0) continue;
      const searchWindow = remaining.slice(0, Math.max(8, Math.ceil(remaining.length * 0.15)));
      let bestCand = null, bestPref = -Infinity;
      for (const c of searchWindow) {
        const prefBonus = getTeamPreferenceScore(npbTeam, c);
        const balancePenalty = getBalancePenalty(npbTeam, c, teamDraftTracker);
        const noise = (Math.random() - 0.5) * 10;
        const pref = c.score + prefBonus * 0.7 + noise + balancePenalty;
        if (pref > bestPref) { bestPref = pref; bestCand = c; }
      }
      if (!bestCand) continue;
      const pickOrder = limits.mainDone + 1;
      takenIds.add(bestCand.player.id);
      draftedPlayers.push(createDraftEntry(bestCand, npbTeam, `ドラフト${pickOrder}位`));
      updateDraftTracker(npbTeam, bestCand);
      limits.mainDone++;
    }
  }

  // === 育成指名: 純粋ウェーバー制（全球団参加、下位から指名） ===
  // 育成スコア: 成長力・プロ意識・出身源（高校/独立/クラブ）を重視した再評価
  const ikuEligible = allCandidates
    .filter(c => !takenIds.has(c.player.id))
    .map(c => {
      const gp = c.player.growthPotential || 1.0;
      const discipline = c.player.personality?.discipline || 50;
      let ikuScore = c.score                                   // 現在能力ベース
        + Math.max(0, gp - 1.0) * 60                          // 成長力ボーナス（gp1.3→+18, gp1.5→+30）
        + Math.max(0, discipline - 40) * 0.6;                 // プロ意識ボーナス（80→+24）
      // 大穴出身ボーナス: 高校・独立・クラブを優先
      if (c.source === 'highschool') ikuScore += 22;
      else if (c.source === 'independent') ikuScore += 18;
      else if (c.isClub) ikuScore += 18;
      return { ...c, ikuScore };
    })
    .sort((a, b) => b.ikuScore - a.ikuScore);

  for (let ikuRound = 1; ikuRound <= maxIkuRounds; ikuRound++) {
    // 1巡目: ウェーバー（下位から）、2巡目: 逆ウェーバー（上位から）
    const teamOrder = ikuRound % 2 === 1 ? waiverOrder : reverseWaiverOrder;
    for (const npbTeam of teamOrder) {
      const limits = teamDraftLimits[npbTeam];
      if (limits.ikuDone >= limits.ikuPicks) continue;
      const remaining = ikuEligible.filter(c => !takenIds.has(c.player.id));
      if (remaining.length === 0) continue;
      const searchWindow = remaining.slice(0, 20);
      let bestCand = null, bestPref = -Infinity;
      for (const c of searchWindow) {
        const prefBonus = getTeamPreferenceScore(npbTeam, c);
        const balancePenalty = getBalancePenalty(npbTeam, c, teamDraftTracker);
        const noise = (Math.random() - 0.5) * 12;
        const pref = c.ikuScore + prefBonus * 0.5 + noise + balancePenalty;
        if (pref > bestPref) { bestPref = pref; bestCand = c; }
      }
      if (!bestCand) continue;
      const ikuPickRound = limits.ikuDone + 1;
      takenIds.add(bestCand.player.id);
      draftedPlayers.push(createDraftEntry(bestCand, npbTeam, `育成${ikuPickRound}巡目`));
      updateDraftTracker(npbTeam, bestCand);
      limits.ikuDone++;
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

  // 大学スポーツ推薦スカウトリストの候補にNPB指名情報を付与（候補はdeep copyのためpool削除では反映されない）
  if (WORLD_DATA._universityScout?.candidates) {
    const hsDraftMap = new Map();
    draftedPlayers.forEach(({ playerId, npbTeam, draftRound, source }) => {
      if (source === 'highschool') hsDraftMap.set(playerId, { team: npbTeam, round: draftRound });
    });
    if (hsDraftMap.size > 0) {
      WORLD_DATA._universityScout.candidates.forEach(c => {
        const info = hsDraftMap.get(c.id);
        if (info) {
          c._npbDrafted = info;
          c._approaching = false; // 接近中止
        }
      });
    }
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
    corporate: draftedPlayers.filter(d => d.source === 'corporate' && !d.isClub).length,
    independent: draftedPlayers.filter(d => d.source === 'independent').length,
    club: draftedPlayers.filter(d => d.isClub).length,
    total: draftedPlayers.length,
  };
  const firstRoundSources = { highschool: 0, university: 0, corporate: 0, independent: 0, club: 0 };
  draftedPlayers.filter(d => d.draftRound === 'ドラフト1位').forEach(d => {
    const src = (d.source === 'university_team') ? 'university' : (d.isClub ? 'club' : d.source);
    firstRoundSources[src] = (firstRoundSources[src] || 0) + 1;
  });
  console.log(`[NPBDraft] 結果: 総数${draftBySource.total} | 高校${draftBySource.highschool} 大学${draftBySource.university} 社会人${draftBySource.corporate} 独立${draftBySource.independent} クラブ${draftBySource.club}`);
  console.log(`[NPBDraft] 1位: 高校${firstRoundSources.highschool} 大学${firstRoundSources.university} 社会人${firstRoundSources.corporate} 独立${firstRoundSources.independent}`);

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

  // 40歳以上は強制引退
  // 29〜39歳の引退は processRetirements() で能力順位ベースに一括判定
  if (age >= 40) {
    shouldRetire = true;
    if (!reason) reason = '年齢による引退';
  }

  return { shouldRetire, hallOfFame, reason, draftEligible, draftReasons };
};

// 引退スコア計算（能力による引退優先度。低いほど先に引退）
function calcRetirementScore(player) {
  if (player.position === 'pitcher') {
    return (player.pitching?.velocity || 120) * 0.5
         + (player.pitching?.control  || 30)  * 0.3
         + (player.pitching?.stamina  || 50)  * 0.2;
  }
  return (player.batting?.meet      || 30) * 0.35
       + (player.batting?.power     || 20) * 0.25
       + (player.batting?.eye       || 20) * 0.15
       + (player.physical?.speed    || 30) * 0.15
       + (player.fielding?.defense  || 30) * 0.10;
}

/**
 * 全チームの引退処理
 * 40歳以上: 強制引退
 * 29〜39歳: 各年齢×ポジション別にグローバルで能力下位 (age-28)×5% を引退
 *   29歳→下位5%, 30歳→下位10%, ..., 39歳→下位55%
 * @param {Object} allTeams - 全チームデータ
 * @returns {Object} - { updatedTeams, retirements }
 */
export function processRetirements(allTeams) {
  const retireIds = new Set();

  // Step 1: 年齢×ポジション別にグローバル収集
  const groups = {};  // `${age}_pitcher` or `${age}_fielder` → player[]
  for (const team of Object.values(allTeams)) {
    for (const player of team.players || []) {
      const age = player.age || 20;
      if (age >= 40) {
        retireIds.add(player.id);
        continue;
      }
      if (age < 29) continue;
      const posKey = player.position === 'pitcher' ? 'pitcher' : 'fielder';
      const key = `${age}_${posKey}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(player);
    }
  }

  // Step 2: 各グループで能力下位 X% を引退マーク
  for (const [key, players] of Object.entries(groups)) {
    const age = parseInt(key.split('_')[0]);
    const retireCount = Math.floor(players.length * (age - 28) * 0.05);
    if (retireCount <= 0) continue;
    players
      .slice()
      .sort((a, b) => calcRetirementScore(a) - calcRetirementScore(b))
      .slice(0, retireCount)
      .forEach(p => retireIds.add(p.id));
  }

  // Step 3: チームから除去して引退記録を生成
  const updatedTeams = {};
  const retirements = [];

  for (const [teamName, team] of Object.entries(allTeams)) {
    const retired   = (team.players || []).filter(p => retireIds.has(p.id));
    const remaining = (team.players || []).filter(p => !retireIds.has(p.id));

    retired.forEach(player => {
      const { isHallOfFame: hallOfFame, reason: hofReason } = checkHallOfFame(player);
      retirements.push({
        name:       player.name,
        team:       teamName,
        age:        player.age,
        position:   player.position,
        throws:     player.physical?.throws || 'right',
        bats:       player.batting?.bats   || 'right',
        hallOfFame,
        reason:     hofReason || (player.age >= 40 ? '年齢による引退' : '引退'),
        careerStats: player.careerStats,
        draftInfo:  player.draftInfo || null,
        yearsPlayed: player.yearsPlayed,
      });
      cleanupPlayerReferences(team, player.id);
    });

    updatedTeams[teamName] = { ...team, players: remaining };
  }

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



// ============================================================
// CPU並行世界チームのシーズン成績を自動生成
// resetSeasonStats 後に呼び出すことで通算成績に積み上がりつつ、
// 引退判定・成長計算でも利用できる状態にする
// ============================================================
function simulateParallelWorldStats(allTeams) {
  const userTeamName = Object.keys(allTeams)[0];

  for (const [teamName, team] of Object.entries(allTeams)) {
    if (teamName === userTeamName) continue;
    if (!team?.players?.length) continue;

    // チームタイプ別試合数
    let seasonGames;
    if (team.universityData) {
      seasonGames = 26;          // 大学: 春13+秋13
    } else if (team.independentLeagueId) {
      seasonGames = 90;          // 独立リーグ
    } else if (team.corporateData?.type === 'club') {
      seasonGames = 20;          // クラブ: 地域リーグ
    } else if (team.corporateData) {
      seasonGames = 45;          // 社会人企業
    } else {
      continue;
    }

    const pitchers = team.players.filter(p => p.position === 'pitcher');
    const fielders = team.players.filter(p => p.position !== 'pitcher');

    // チーム総合力 → 勝率推定
    const teamScore = team.players.reduce((s, p) => {
      return s + (p.position === 'pitcher'
        ? Math.max(0, (p.pitching?.velocity || 120) - 110) * 0.5 + (p.pitching?.control || 30) * 0.5
        : (p.batting?.meet || 30) * 0.4 + (p.batting?.power || 20) * 0.3 + (p.physical?.speed || 30) * 0.15 + (p.fielding?.defense || 30) * 0.15);
    }, 0) / Math.max(1, team.players.length);
    const winRate = Math.min(0.75, Math.max(0.25, 0.25 + teamScore / 120));

    // --- 野手: 能力順に出場時間を配分 ---
    const sortedFielders = [...fielders].sort((a, b) =>
      (b.batting?.meet || 0) + (b.batting?.power || 0) - ((a.batting?.meet || 0) + (a.batting?.power || 0))
    );
    sortedFielders.forEach((p, i) => {
      const rate = i < 9
        ? 0.85 - i * 0.025
        : Math.max(0.12, 0.52 - (i - 9) * 0.07);
      const gamesPlayed = Math.max(1, Math.round(seasonGames * rate * (0.85 + Math.random() * 0.3)));
      const atBats = Math.round(gamesPlayed * (3.2 + Math.random() * 0.8));
      const meetF = (p.batting?.meet || 30) / 100;
      const hitRate = Math.min(0.38, Math.max(0.14, meetF * 0.4 + (Math.random() - 0.5) * 0.04));
      const hits = Math.round(atBats * hitRate);
      const pwrF = (p.batting?.power || 20) / 100;
      const hr = Math.round(atBats * pwrF * 0.06 * (0.7 + Math.random() * 0.6));
      const eyeF = (p.batting?.eye || 25) / 80;

      if (!p.seasonStats) p.seasonStats = {};
      p.seasonStats.batting = {
        games: gamesPlayed,
        atBats,
        hits,
        homeruns: hr,
        rbis: Math.round(hr * 2.2 + hits * 0.22 + Math.random() * 4),
        walks: Math.round(atBats * 0.08 * (0.6 + eyeF)),
        strikeouts: Math.round(atBats * (0.22 - meetF * 0.08)),
        doubles: Math.round(hits * 0.18),
        triples: Math.round(hits * 0.03),
        stolenBases: Math.round(gamesPlayed * (p.physical?.speed || 30) / 220 * (0.7 + Math.random() * 0.6)),
        caughtStealing: 0,
        sacrificeBunts: Math.round(gamesPlayed * 0.05),
      };
    });

    // --- 投手: 先発・リリーフで按分 ---
    const sortedPitchers = [...pitchers].sort((a, b) =>
      (Math.max(0, (b.pitching?.velocity || 120) - 110) * 0.5 + (b.pitching?.control || 30))
      - (Math.max(0, (a.pitching?.velocity || 120) - 110) * 0.5 + (a.pitching?.control || 30))
    );
    const starterCount = Math.min(5, Math.max(1, Math.round(pitchers.length * 0.35)));

    sortedPitchers.forEach((p, i) => {
      const ctrlF = (p.pitching?.control || 30) / 80;
      const velF = Math.max(0, ((p.pitching?.velocity || 120) - 110)) / 45;
      const era = Math.min(7.5, Math.max(1.5, 5.5 - ctrlF * 2.5 - velF * 1.2 + (Math.random() - 0.5) * 0.8));

      if (!p.seasonStats) p.seasonStats = {};

      if (i < starterCount) {
        const starts = Math.max(1, Math.round(seasonGames / starterCount * (0.85 + Math.random() * 0.3)));
        const avgIP = 4.0 + (p.pitching?.stamina || 60) / 60 * 2.5;
        const ip = Math.round(starts * avgIP);
        p.seasonStats.pitching = {
          games: starts,
          gamesStarted: starts,
          gamesRelieved: 0,
          inningsPitched: ip,
          wins: Math.round(starts * winRate * 0.5 * (0.7 + Math.random() * 0.6)),
          losses: Math.round(starts * (1 - winRate) * 0.5 * (0.7 + Math.random() * 0.6)),
          saves: 0,
          earnedRuns: Math.round(ip * era / 9),
          strikeouts: Math.round(ip * (1.0 + ctrlF * 0.8) * (0.8 + Math.random() * 0.4)),
          walks: Math.round(ip * Math.max(0.1, 0.5 - ctrlF * 0.3) * (0.8 + Math.random() * 0.4)),
          hits: Math.round(ip * (0.9 + (1 - velF) * 0.3)),
          homeruns: Math.round(ip * 0.06),
          battersFaced: Math.round(ip * 3.5),
        };
      } else {
        const isCloser = i === starterCount;
        const numRelievers = Math.max(1, pitchers.length - starterCount);
        const apps = Math.max(2, Math.round(
          seasonGames * (isCloser ? 0.35 : 0.22) / numRelievers * (0.8 + Math.random() * 0.4)
        ));
        const ip = Math.round(apps * (isCloser ? 1.0 : 1.3));
        p.seasonStats.pitching = {
          games: apps,
          gamesStarted: 0,
          gamesRelieved: apps,
          inningsPitched: ip,
          wins: Math.round(apps * 0.08 * (0.7 + Math.random() * 0.6)),
          losses: Math.round(apps * 0.06 * (0.7 + Math.random() * 0.6)),
          saves: isCloser ? Math.round(apps * winRate * 0.55 * (0.8 + Math.random() * 0.4)) : 0,
          earnedRuns: Math.round(ip * era / 9),
          strikeouts: Math.round(ip * (1.2 + ctrlF * 0.6) * (0.8 + Math.random() * 0.4)),
          walks: Math.round(ip * Math.max(0.1, 0.4 - ctrlF * 0.2) * (0.8 + Math.random() * 0.4)),
          hits: Math.round(ip * (0.85 + (1 - velF) * 0.25)),
          homeruns: Math.round(ip * 0.05),
          battersFaced: Math.round(ip * 3.4),
        };
      }
    });
  }
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

  // 2.6. 年度末の注目度減衰を適用してからランク判定
  for (const teamData of Object.values(updatedTeams)) {
    if (teamData?.corporateData) {
      if (teamData.independentLeagueId) {
        applyUniversityReputationDecay(teamData);
      } else {
        applyReputationDecay(teamData);
      }
    }
    if (teamData?.universityData) {
      applyUniversityReputationDecay(teamData);
    }
  }
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
        // 赤字ペナルティは11/30のBudgetSettlementScreenで適用済み
        teamData.corporateData.scoutMissions = [];
        teamData.corporateData.scoutTasks = {};
        teamData.corporateData.favoritePlayerIds = {};
        teamData.corporateData.autoInvestFilter = null;
      }
    }
  }

  // 2.8. ランキングをスナップショット（ドラフト前に確定済みならそのまま使用）
  if (!seasonData.finalRankings) {
    seasonData.finalRankings = snapshotRankings(updatedTeams);
  }

  // 3. シーズン統計を通算に加算してリセット
  updatedTeams = resetSeasonStats(updatedTeams, seasonData.year);

  // 3.5. CPU並行世界チームにシーズン成績を注入
  // resetSeasonStats後に入れることで通算成績に正しく積み上がり、
  // 以降の引退判定(step5)・成長計算(step4.6)でも使われる
  simulateParallelWorldStats(updatedTeams);

  // 4. 選手の年齢を更新
  updatedTeams = updateAllPlayerAges(updatedTeams);
  // 自由契約選手も加齢（チームなしだが時間は経過する）
  releasedPlayersPool.forEach(p => { p.age = (p.age || 20) + 1; });

  // 4.5. 年齢カーブによる成長・衰退を適用
  const { updatedTeams: teamsAfterAgeCurve, ageReports } = applyAgeCurveChanges(updatedTeams);
  updatedTeams = teamsAfterAgeCurve;

  // 4.6. 社会人/独立チームの若手選手に実戦経験による成長を適用
  applyCorporatePlayerGrowth(updatedTeams);

  // 4.7. 自由契約選手の自主トレ成長（クラブ所属と同等: discipline主導・環境なし）
  applyFreeAgentGrowth(releasedPlayersPool);

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
      addToReleasedPool(grad);
    }
  });

  // 5.55. 大学チームの4年生卒業＋ロスター入れ替え
  // universityMode だけでなく社会人/独立モードでもTEAMS_DATA大学チームがある場合に実行
  // ※distributeHighSchoolGraduates より先に実行してプールから一般入部を選出する
  let universityGraduationReport = null;
  const hasPopulatedUniversityTeams = Object.values(teamsAfterRetirement).some(
    t => t?.universityData && (t.players?.length || 0) > 0
  );
  if (hasPopulatedUniversityTeams) {
    universityGraduationReport = processUniversityTeamGraduation(teamsAfterRetirement, seasonData, currentYear);
  }

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
      addToReleasedPool(p);
    });
    // 独立候補もリリースプールへ
    hsDistribution.independent.forEach(p => {
      p.isStarter = false;
      p.battingOrder = 0;
      addToReleasedPool(p);
    });
  }

  // 5.75. CPU社会人・独立チームの自動戦力外通告（非社会人モードのみ）
  // 社会人モードは CorporateDepartureScreen の AI 放出処理が担当するため除外
  if (!seasonData.settings?.corporateMode) {
    releaseCPUCorporatePlayers(teamsAfterRetirement, currentYear);
  }

  // ━━━ 入団優先度: S社会人 → A社会人 → 独立リーグ → B社会人 → C/D社会人 → クラブ ━━━

  // 5.8a. S/Aランク社会人AIチームのロスター補充（最優先: 高品質選手を先に確保）
  replenishCorporateRosters(teamsAfterRetirement, currentYear, ['S', 'A']);

  // 5.8b. 独立リーグAIチームの補充（S/Aに続いてプールから選択）
  replenishIndependentLeagueRosters(teamsAfterRetirement, currentYear);

  // 5.9. B/C/DランクAIチームのロスター補充（独立リーグ後の残り選手。C/Dはプロ意識・成長率も考慮）
  replenishCorporateRosters(teamsAfterRetirement, currentYear, ['B', 'C', 'D']);

  // 5.92. クラブチームへの選手供給（最後の受け皿: 社会人・独立に入れなかった選手）
  // ※旧 step 5.65 から移動 — クラブが最下位優先度になるよう社会人/独立の後に処理
  const clubTeamEntries = Object.entries(teamsAfterRetirement).filter(([, t]) => t.corporateData?.type === 'club');
  if (clubTeamEntries.length === 0 && universityGraduationReport?.clubGraduates?.length > 0) {
    // 大学モード: TEAMS_DATAにクラブチームがないため、club卒業生をリリースプールへ
    universityGraduationReport.clubGraduates.forEach(p => {
      p.isStarter = false;
      p.battingOrder = 0;
      addToReleasedPool(p);
    });
  }
  if (clubTeamEntries.length > 0) {
    // クラブ候補者収集
    const clubCandidatesRaw = [];
    if (universityGraduationReport?.clubGraduates) {
      clubCandidatesRaw.push(...universityGraduationReport.clubGraduates);
    }
    // 大学プール卒業生で「引退」判定の一部
    gradScored.forEach(entry => {
      if (entry.player.postGradPath === 'retired' && Math.random() < 0.3) {
        clubCandidatesRaw.push(entry.player);
      }
    });
    // 高校卒で「引退」判定の選手の一部
    if (hsDistribution.retired) {
      hsDistribution.retired.forEach(p => {
        if (Math.random() < 0.15) clubCandidatesRaw.push(p);
      });
    }
    // リリースプールから30歳以下の一部（企業・独立からの退団者）
    for (let i = releasedPlayersPool.length - 1; i >= 0; i--) {
      const p = releasedPlayersPool[i];
      if (p.age && p.age <= 30 && Math.random() < 0.1) {
        clubCandidatesRaw.push(p);
        releasedPlayersPool.splice(i, 1);
      }
    }

    if (clubCandidatesRaw.length > 0) {
      // クラブ向け採点: 能力 + プロ意識 + 成長率（クラブはdisciplineが成長を左右するため）
      const scoreForClub = (p) => {
        const abil = p.position === 'pitcher'
          ? (p.pitching?.velocity || 130) * 0.5 + (p.pitching?.control || 0) * 0.3 + (p.pitching?.stamina || 0) * 0.2
          : (p.batting?.meet || 0) * 0.35 + (p.batting?.power || 0) * 0.25
            + (p.batting?.eye || 0) * 0.15 + (p.physical?.speed || 0) * 0.15 + (p.fielding?.defense || 0) * 0.10;
        const disc = p.personality?.discipline ?? 50;
        const gp   = p.growthPotential || 1.0;
        return abil * 0.50 + disc * 0.35 + Math.max(0, (gp - 1.0)) * 100 * 0.15;
      };

      // プロ意識が一定以上の選手のみクラブへ（あまりにも低い選手は野球から離れる）
      const clubCandidates = clubCandidatesRaw
        .filter(p => (p.personality?.discipline ?? 50) >= 35)
        .sort((a, b) => scoreForClub(b) - scoreForClub(a));

      const sortedClubs = clubTeamEntries
        .map(([name, team]) => ({ name, team, count: team.players?.length || 0 }))
        .sort((a, b) => a.count - b.count);

      const CLUB_ROSTER_CAP = 35;
      // 投手/野手バランスチェック用
      const getClubPitcherRatio = (clubInfo) => {
        const total    = clubInfo.team.players?.length || 0;
        const pitchers = (clubInfo.team.players || []).filter(p => p.position === 'pitcher').length;
        return total > 0 ? pitchers / total : 0.35;
      };

      for (const p of clubCandidates) {
        // 人数が最も少ないクラブを選択（投手/野手バランスも考慮）
        const needsPitcher = sortedClubs.some(c => c.count < CLUB_ROSTER_CAP && getClubPitcherRatio(c) < 0.30);
        const targetClub = sortedClubs.find(c => {
          if (c.count >= CLUB_ROSTER_CAP) return false;
          const ratio = getClubPitcherRatio(c);
          if (p.position === 'pitcher' && ratio > 0.45) return false; // 投手過多クラブへは入れない
          if (p.position !== 'pitcher' && needsPitcher && ratio < 0.25) return false; // 投手不足クラブには野手より投手を
          return true;
        }) || sortedClubs.find(c => c.count < CLUB_ROSTER_CAP);

        if (!targetClub || !targetClub.team.players) continue;
        p._nextYearTeam = targetClub.name;
        const player = { ...p };
        player.isStarter   = false;
        player.battingOrder = 0;
        if (!player.careerHistory) player.careerHistory = [];
        player.careerHistory.push({ type: 'club_join', year: currentYear + 1, label: `${targetClub.name}入部` });
        addToRoster(targetClub.team, player);
        targetClub.count++;
        sortedClubs.sort((a, b) => a.count - b.count);
      }
    }
  }

  // 5.95. リリースプール整理: 33歳以上を先に除去してからサイズ上限を適用
  {
    const beforeAge = releasedPlayersPool.filter(p => (p.age || 0) < 33);
    if (beforeAge.length !== releasedPlayersPool.length) {
      replaceReleasedPool(beforeAge);
    }
    const poolCap = seasonData.settings?.universityMode ? 300 : 400;
    if (releasedPlayersPool.length > poolCap) {
      const scoredPool = releasedPlayersPool.map((p, i) => ({
        p, i,
        s: p.position === 'pitcher'
          ? (p.pitching?.velocity || 130) + (p.pitching?.control || 0) * 0.5
          : (p.batting?.meet || 0) + (p.batting?.power || 0) + (p.physical?.speed || 0) * 0.3,
      })).sort((a, b) => b.s - a.s).slice(0, poolCap);
      const keep = new Set(scoredPool.map(e => e.i));
      const trimmed = releasedPlayersPool.filter((_, i) => keep.has(i));
      replaceReleasedPool(trimmed);
    }
  }

  // 5.98. 卒業レポートに nextYearTeam を転記（5.9/5.92 の配属完了後）
  // 実際の配属先チームのタイプに合わせて path ラベルも更新する
  if (universityGraduationReport?.graduated) {
    universityGraduationReport.graduated.forEach(entry => {
      if (entry._playerRef?._nextYearTeam) {
        entry.nextYearTeam = entry._playerRef._nextYearTeam;
        const destTeam = teamsAfterRetirement[entry.nextYearTeam];
        if (destTeam) {
          if (destTeam.independentLeagueId) entry.path = 'independent';
          else if (destTeam.corporateData?.type === 'club') entry.path = 'club';
          else if (destTeam.corporateData) entry.path = 'corporate';
        }
      }
      delete entry._playerRef;
    });
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
    // 独立リーグモード: リーグ優勝・プレーオフ結果をアーカイブ
    const prevHistory = seasonData.tournamentHistory || [];
    const yearRecord = { year: seasonData.year, calendarYear: seasonData.currentDate?.year };
    if (awards.champion) yearRecord.leagueChampion = awards.champion;
    // プレーオフ決勝の優勝チームを集計
    const playoffFinals = (seasonData.schedule || []).filter(g =>
      g.phase === 'playoffs' && g.playoffRound === 'final' && g.result && !g.result.cancelled
    );
    if (playoffFinals.length > 0) {
      const teamWins = {};
      playoffFinals.forEach(g => {
        const winner = g.result.homeScore > g.result.awayScore ? g.home : g.away;
        teamWins[winner] = (teamWins[winner] || 0) + 1;
      });
      const sorted = Object.entries(teamWins).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) yearRecord.playoffChampion = sorted[0][0];
    }
    newSeasonData.tournamentHistory = [...prevHistory, yearRecord];
    // スケジュールはレギュレーション設定後に生成
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

  // 大学リーグの入替戦 → 新シーズン初期化 + 社会人トーナメント結果リセット
  let universityPromotions = [];
  if (WORLD_DATA.initialized) {
    // 大学モード2部制: ユーザー部の成績をWORLD_DATAの秋季順位表に同期してから入替戦判定
    // （ユーザー部の試合はseasonData.standingsにのみ記録され、WORLD_DATA側は0のまま。
    //   またleague.fall.doneも立たないためprocessUniversityPromotionRelegationがスキップする）
    if (seasonData.settings?.universityMode && WORLD_DATA.universityLeague) {
      const ul = WORLD_DATA.universityLeague;
      const regionId = ul.userRegion || seasonData.settings?.universityRegion;
      const userDiv = ul.userDivision || 1;
      const uLeague = WORLD_DATA.universityLeagues?.[regionId];
      if (uLeague?.divisions && uLeague.fall) {
        const standingsKey = `standings${userDiv}`;
        if (uLeague.fall[standingsKey] && seasonData.standings?.length) {
          uLeague.fall[standingsKey].forEach(s => {
            const found = seasonData.standings.find(st => st.team === s.team);
            if (found) {
              s.wins = found.wins || 0;
              s.losses = found.losses || 0;
              s.draws = found.draws || 0;
              s.winRate = found.winRate || 0;
              s.gamesPlayed = found.gamesPlayed || 0;
            }
          });
          uLeague.fall[standingsKey].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
        }
        uLeague.fall.done = true;
      }
    }
    universityPromotions = processUniversityPromotionRelegation();
    const nextCalendarYear = newSeasonData.currentDate?.year || 2025;
    initializeUniversityLeagues(nextCalendarYear);
    resetIndependentLeagueSchedules(nextCalendarYear);
    WORLD_DATA.corporateToshitaikou = null;
    WORLD_DATA.corporateNihonSenshuken = null;
    WORLD_DATA.corporateClubSenshuken = null;
    WORLD_DATA.corporateRegionalTournament = null;
    WORLD_DATA._universityScout = null;
  }

  // 大学モード: リーグ再初期化後にスケジュール・順位表を設定
  if (seasonData.settings?.universityMode) {
    const regionId = seasonData.settings.universityRegion;
    newSeasonData.schedule = getUniversityLeagueSchedule(regionId);
    // 入替でユーザーの部が変わった場合、settings.teamNamesも更新
    const leagueTeams = WORLD_DATA.universityLeague?.leagueTeams || seasonData.settings.teamNames;
    newSeasonData.standings = getUniversityLeagueStandings(regionId, leagueTeams);
    newSeasonData.settings.teamNames = [...leagueTeams];
    newSeasonData.settings.teamsCount = leagueTeams.length;
    newSeasonData.settings.teamAbbreviations = leagueTeams.map(n => n.slice(0, 3));
  }

  // ランク変動レポートを新シーズンデータに保存
  if (rankChanges.length > 0) {
    newSeasonData.rankChanges = rankChanges;
  }

  // スタッフ退職レポートを新シーズンデータに保存
  if (staffRetirements.length > 0) {
    newSeasonData.staffRetirements = staffRetirements;
  }

  // 赤字ペナルティレポート（BudgetSettlementScreenで設定済みの場合のみ引き継ぐ）
  if (seasonData.deficitPenalties?.length > 0) {
    newSeasonData.deficitPenalties = seasonData.deficitPenalties;
  }

  if (universityPromotions.length > 0) {
    newSeasonData.universityPromotions = universityPromotions;
  }

  return {
    newSeasonData,
    updatedTeams: teamsAfterRetirement,
    awards,
    retirements,
    ageReports,
    rankChanges,
    universityGraduationReport,
    universityPromotions,
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
    const nextCalYear = newSeasonData.currentDate?.year || 2025;
    initializeUniversityLeagues(nextCalYear);
    resetIndependentLeagueSchedules(nextCalYear);
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
