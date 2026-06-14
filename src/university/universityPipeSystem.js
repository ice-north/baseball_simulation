// ============================================================
// 大学パイプシステム
// チーム内のOB（大学出身選手）を通じて大学との繋がりを構築
// パイプがある大学への派遣枠が増える
// ============================================================

import { UNIVERSITY_TEAMS, getUniversityTeamById, getUniversityTeamsByRank } from './universityTeamsData.js';

/**
 * チームの大学パイプ一覧を取得
 * OBの人数に応じてパイプ強度が決まる
 * @param {Object} teamData - TEAMS_DATA[teamName]
 * @returns {Array<{ universityId, universityName, rank, obCount, pipeStrength, specialties, obPlayers }>}
 */
export function getUniversityPipes(teamData) {
  const players = teamData?.players || [];
  const obMap = {};

  for (const p of players) {
    if (!p.universityTeamId) continue;
    if (!obMap[p.universityTeamId]) {
      obMap[p.universityTeamId] = [];
    }
    obMap[p.universityTeamId].push(p);
  }

  const pipes = [];
  for (const [uniIdStr, obPlayers] of Object.entries(obMap)) {
    const uniId = Number(uniIdStr);
    const uni = getUniversityTeamById(uniId);
    if (!uni) continue;

    pipes.push({
      universityId: uniId,
      universityName: uni.name,
      rank: uni.rank,
      specialties: uni.specialties || [],
      obCount: obPlayers.length,
      pipeStrength: calcPipeStrength(obPlayers.length),
      obPlayers: obPlayers.map(p => ({ id: p.id, name: p.name })),
    });
  }

  pipes.sort((a, b) => b.pipeStrength - a.pipeStrength || b.obCount - a.obCount);
  return pipes;
}

/**
 * OB人数からパイプ強度を計算
 * 1人→1, 2人→2, 3人以上→3（上限）
 */
function calcPipeStrength(obCount) {
  if (obCount >= 3) return 3;
  return obCount;
}

/**
 * パイプ強度から大学派遣の追加枠数を返す
 * 強度1→枠1人, 強度2→枠2人, 強度3→枠3人
 */
export function getDispatchSlots(pipeStrength) {
  return Math.min(3, pipeStrength);
}

/**
 * チームが大学派遣で利用可能な大学一覧（パイプあり）を取得
 * 派遣枠数も付与
 * @param {Object} teamData
 * @returns {Array<{ universityId, universityName, rank, specialties, slots, obCount }>}
 */
export function getAvailableUniversityDispatches(teamData) {
  const pipes = getUniversityPipes(teamData);
  return pipes.map(pipe => ({
    universityId: pipe.universityId,
    universityName: pipe.universityName,
    rank: pipe.rank,
    specialties: pipe.specialties,
    slots: getDispatchSlots(pipe.pipeStrength),
    obCount: pipe.obCount,
    obPlayers: pipe.obPlayers,
  }));
}

/**
 * 特定の大学への派遣残り枠を計算
 * @param {Object} teamData
 * @param {number} universityId
 * @returns {number} 残り枠数（0なら派遣不可）
 */
export function getRemainingDispatchSlots(teamData, universityId) {
  const pipes = getUniversityPipes(teamData);
  const pipe = pipes.find(p => p.universityId === universityId);
  if (!pipe) return 0;

  const maxSlots = getDispatchSlots(pipe.pipeStrength);
  const players = teamData?.players || [];
  const dispatched = players.filter(
    p => p.dispatchedThisCamp === 'university' && p.dispatchUniversityId === universityId
  ).length;

  return Math.max(0, maxSlots - dispatched);
}

/**
 * 初期選手に大学出身情報をランダム割り当て
 * ゲーム開始時に呼び出し、既存選手にOB情報を付与する
 * @param {Array} players - 選手配列
 * @param {Object} options - { universityRate: 大卒率(0-1), teamRank: チームランク }
 */
export function assignInitialUniversityBackgrounds(players, options = {}) {
  const universityRate = options.universityRate ?? 0.55;
  const teamRank = options.teamRank || 'B';

  const rankWeights = {
    S: { S: 0.20, A: 0.30, B: 0.25, C: 0.15, D: 0.10 },
    A: { S: 0.15, A: 0.25, B: 0.30, C: 0.20, D: 0.10 },
    B: { S: 0.08, A: 0.20, B: 0.30, C: 0.25, D: 0.17 },
    C: { S: 0.05, A: 0.12, B: 0.25, C: 0.30, D: 0.28 },
    D: { S: 0.02, A: 0.08, B: 0.20, C: 0.30, D: 0.40 },
  };

  const weights = rankWeights[teamRank] || rankWeights.B;

  for (const player of players) {
    if (player.universityTeamId) continue;
    if (Math.random() > universityRate) continue;

    const rank = pickWeightedRank(weights);
    const candidates = getUniversityTeamsByRank(rank);
    if (candidates.length === 0) continue;

    const uni = candidates[Math.floor(Math.random() * candidates.length)];
    player.universityTeamId = uni.id;
    player.universityName = uni.name;
    player.universityRank = rank;
    if (!player.origin || player.origin === 'corporate_candidate') {
      player.origin = 'university';
    }
  }
}

function pickWeightedRank(weights) {
  const roll = Math.random();
  let cumulative = 0;
  for (const [rank, w] of Object.entries(weights)) {
    cumulative += w;
    if (roll < cumulative) return rank;
  }
  return 'B';
}

/**
 * パイプ情報のサマリーを取得（UI表示用）
 * @param {Object} teamData
 * @returns {{ totalPipes, totalSlots, pipes }}
 */
export function getPipeSummary(teamData) {
  const pipes = getAvailableUniversityDispatches(teamData);
  return {
    totalPipes: pipes.length,
    totalSlots: pipes.reduce((sum, p) => sum + p.slots, 0),
    pipes,
  };
}
