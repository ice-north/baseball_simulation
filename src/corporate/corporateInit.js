// ============================================================
// 社会人野球 初期化システム
// チーム選択後の選手生成・スタッフ生成・ゲーム開始処理
// ============================================================

import { generateTryoutCandidates, selectPlayerForAI, generateScoutComment } from '../season/tryoutSystem.js';
import { generateStaff } from './staffData.js';
import { getTeamsByRegion, getAllTeamsEffective, REGIONS } from './corporateTeamsData.js';
import { initializeWorld, WORLD_DATA } from './worldData.js';
import { TEAMS_DATA, clearReleasedPlayersPool } from '../teams-data.js';

const RANK_ABILITY_OFFSET = {
  S: 18, A: 10, B: 3, C: -3, D: -8,
};

const RANK_GROWTH_OFFSET = {
  S: 0.12, A: 0.06, B: 0.0, C: -0.03, D: -0.06,
};

const RANK_STAFF_CONFIG = {
  S: { coach: 3, manager: 1, trainer: 1 },
  A: { coach: 2, manager: 1, trainer: 1 },
  B: { coach: 2, manager: 1, trainer: 0 },
  C: { coach: 1, manager: 1, trainer: 0 },
  D: { coach: 1, manager: 0, trainer: 0 },
};

const BUDGET_BY_RANK = { S: 90, A: 70, B: 50, C: 35, D: 20 };

let corporatePlayerIdBase = 20000;

const applyRankOffset = (player, rank) => {
  const offset = RANK_ABILITY_OFFSET[rank] || 0;
  const growthOffset = RANK_GROWTH_OFFSET[rank] || 0;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  player.batting.meet = clamp(player.batting.meet + offset, 1, 99);
  player.batting.power = clamp(player.batting.power + offset, 1, 99);
  player.batting.eye = clamp(player.batting.eye + offset, 1, 99);
  player.batting.steal = clamp(player.batting.steal + Math.floor(offset * 0.5), 1, 99);
  player.batting.bunt = clamp(player.batting.bunt + Math.floor(offset * 0.3), 1, 99);

  player.physical.speed = clamp(player.physical.speed + Math.floor(offset * 0.7), 1, 99);
  player.physical.arm = clamp(player.physical.arm + Math.floor(offset * 0.7), 1, 99);

  player.fielding.defense = clamp(player.fielding.defense + Math.floor(offset * 0.8), 1, 99);

  player.pitching.velocity = clamp(player.pitching.velocity + Math.floor(offset * 0.4), 100, 165);
  player.pitching.control = clamp(player.pitching.control + Math.floor(offset * 0.8), 1, 99);
  player.pitching.stamina = clamp(player.pitching.stamina + Math.floor(offset * 0.5), 30, 150);

  player.growthPotential = clamp(player.growthPotential + growthOffset, 0.5, 1.5);

  if (player.age < 22) {
    player.age += 22 - player.age + Math.floor(Math.random() * 6);
  }
};

// 社会人チームの選手25名を生成
export const generateCorporateRoster = (teamDef, year = 1) => {
  const rank = teamDef.rank || 'C';
  const rosterSize = 25;

  const candidates = generateTryoutCandidates(year, 2, true);

  // ID衝突回避: チームごとにユニークなオフセットを付与
  corporatePlayerIdBase += 1000;
  candidates.forEach((p, i) => { p.id = corporatePlayerIdBase + i; });

  candidates.forEach(p => applyRankOffset(p, rank));

  const roster = [];
  const remaining = [...candidates];
  for (let i = 0; i < rosterSize && remaining.length > 0; i++) {
    const pick = selectPlayerForAI(remaining, roster);
    if (!pick) break;
    const idx = remaining.findIndex(c => c.id === pick.id);
    if (idx >= 0) remaining.splice(idx, 1);
    roster.push(pick);
  }

  roster.forEach(p => { p.scoutComment = generateScoutComment(p); });
  return roster;
};

export const generateInitialStaff = (rank) => {
  const config = RANK_STAFF_CONFIG[rank] || RANK_STAFF_CONFIG.C;
  const staff = [];
  for (const [role, count] of Object.entries(config)) {
    for (let i = 0; i < count; i++) {
      const grade = rank === 'S' || rank === 'A' ? null : (rank === 'D' ? 'D' : null);
      staff.push(generateStaff(role, grade));
    }
  }
  return staff;
};

// 同地区＋近隣地区からリーグ参加チームを選出
const selectLeagueTeams = (userTeamDef, targetCount) => {
  const userRegion = userTeamDef.region;
  const userId = userTeamDef.id;

  // 同地区チーム（自分以外）
  let pool = getTeamsByRegion(userRegion).filter(t => t.id !== userId);

  // 足りなければ隣接地区から補充
  if (pool.length < targetCount) {
    const regionIds = REGIONS.map(r => r.id);
    const idx = regionIds.indexOf(userRegion);
    const neighbors = [
      regionIds[idx - 1], regionIds[idx + 1],
      regionIds[idx - 2], regionIds[idx + 2],
    ].filter(Boolean);

    for (const nRegion of neighbors) {
      if (pool.length >= targetCount) break;
      const extras = getTeamsByRegion(nRegion);
      pool = pool.concat(extras);
    }
  }

  // 強さ順でソートして、S/A/B/C/Dをバランスよく選ぶ
  pool.sort((a, b) => {
    const order = { S: 0, A: 1, B: 2, C: 3, D: 4 };
    return (order[a.rank] || 3) - (order[b.rank] || 3);
  });

  // ユーザーランクに近いチームを優先的に選出
  const userRankOrder = { S: 0, A: 1, B: 2, C: 3, D: 4 }[userTeamDef.rank] ?? 2;
  pool.sort((a, b) => {
    const aOrder = { S: 0, A: 1, B: 2, C: 3, D: 4 }[a.rank] ?? 3;
    const bOrder = { S: 0, A: 1, B: 2, C: 3, D: 4 }[b.rank] ?? 3;
    return Math.abs(aOrder - userRankOrder) - Math.abs(bOrder - userRankOrder);
  });

  return pool.slice(0, targetCount);
};

// チーム名の略称を生成
const makeAbbreviation = (name) => {
  if (name.length <= 3) return name;
  // 英字チーム名は先頭3文字大文字
  if (/^[A-Za-z]/.test(name)) return name.slice(0, 3).toUpperCase();
  return name.slice(0, 3);
};

// 社会人モードの完全初期化
export const initializeCorporateGame = (teamDef) => {
  corporatePlayerIdBase = 20000;

  initializeWorld('corporate');
  Object.keys(TEAMS_DATA).forEach(key => delete TEAMS_DATA[key]);
  clearReleasedPlayersPool();

  // ユーザーチーム
  const userTeamName = teamDef.displayName || teamDef.name;
  const userRoster = generateCorporateRoster(teamDef, 1);
  const userStaff = generateInitialStaff(teamDef.rank);

  TEAMS_DATA[userTeamName] = {
    name: userTeamName,
    abbreviation: makeAbbreviation(userTeamName),
    players: userRoster,
    pitchingRotation: null,
    corporateTeamId: teamDef.id,
    corporateData: {
      rank: teamDef.rank,
      region: teamDef.region,
      city: teamDef.city,
      type: teamDef.type,
      budget: teamDef.budget || BUDGET_BY_RANK[teamDef.rank] || 35,
      staff: userStaff,
    },
  };

  // 同地区の実在チームから対戦相手を選出
  const aiTeamDefs = selectLeagueTeams(teamDef, 7);
  const aiTeamNames = [];

  for (const aiDef of aiTeamDefs) {
    const aiName = aiDef.displayName || aiDef.name;
    // 同名チーム回避
    if (TEAMS_DATA[aiName]) continue;

    const aiRoster = generateCorporateRoster(aiDef, 1);
    const aiStaff = generateInitialStaff(aiDef.rank);

    TEAMS_DATA[aiName] = {
      name: aiName,
      abbreviation: makeAbbreviation(aiName),
      players: aiRoster,
      pitchingRotation: null,
      corporateTeamId: aiDef.id,
      corporateData: {
        rank: aiDef.rank,
        region: aiDef.region,
        city: aiDef.city,
        type: aiDef.type,
        budget: aiDef.budget || BUDGET_BY_RANK[aiDef.rank] || 35,
        staff: aiStaff,
      },
    };

    aiTeamNames.push(aiName);
  }

  const allTeamNames = [userTeamName, ...aiTeamNames];

  WORLD_DATA.corporateLeague.userTeam = userTeamName;
  WORLD_DATA.corporateLeague.teams = {};
  for (const name of allTeamNames) {
    WORLD_DATA.corporateLeague.teams[name] = TEAMS_DATA[name];
  }

  return {
    userTeamName,
    allTeamNames,
    roster: userRoster,
    staff: userStaff,
  };
};
