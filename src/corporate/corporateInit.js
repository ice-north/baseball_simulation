// ============================================================
// 社会人野球 初期化システム
// チーム選択後の選手生成・スタッフ生成・ゲーム開始処理
// ============================================================

import { generateTryoutCandidates, selectPlayerForAI, generateScoutComment } from '../season/tryoutSystem.js';
import { generateStaff } from './staffData.js';
import { RANK_ABILITY_RANGE } from './corporateTeamsData.js';
import { initializeWorld, WORLD_DATA } from './worldData.js';
import { TEAMS_DATA, clearReleasedPlayersPool } from '../teams-data.js';

// ランク別の選手能力調整値（generateTryoutCandidatesで生成後に適用）
const RANK_ABILITY_OFFSET = {
  S: 18,
  A: 10,
  B: 3,
  C: -3,
  D: -8,
};

// ランク別のgrowthPotential調整
const RANK_GROWTH_OFFSET = {
  S: 0.12,
  A: 0.06,
  B: 0.0,
  C: -0.03,
  D: -0.06,
};

// ランク別の初期スタッフ構成
const RANK_STAFF_CONFIG = {
  S: { coach: 3, manager: 1, trainer: 1 },
  A: { coach: 2, manager: 1, trainer: 1 },
  B: { coach: 2, manager: 1, trainer: 0 },
  C: { coach: 1, manager: 1, trainer: 0 },
  D: { coach: 1, manager: 0, trainer: 0 },
};

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

  // 社会人なので平均年齢を上げる（22-30歳くらい）
  if (player.age < 22) {
    const ageUp = 22 - player.age + Math.floor(Math.random() * 6);
    player.age += ageUp;
  }
};

// 社会人チームの選手25名を生成
export const generateCorporateRoster = (teamDef, year = 1) => {
  const rank = teamDef.rank || 'C';
  const rosterSize = 25;

  // まずトライアウトシステムで候補選手を生成
  const candidates = generateTryoutCandidates(year, 2, true);

  // ランクに応じて能力値を調整
  candidates.forEach(p => applyRankOffset(p, rank));

  // AIドラフト方式でバランスの良い25名を選出
  const roster = [];
  const remaining = [...candidates];

  for (let i = 0; i < rosterSize && remaining.length > 0; i++) {
    const pick = selectPlayerForAI(remaining, roster);
    if (!pick) break;
    const idx = remaining.findIndex(c => c.id === pick.id);
    if (idx >= 0) remaining.splice(idx, 1);
    roster.push(pick);
  }

  // スカウトコメントを再生成（ランク補正後の能力で）
  roster.forEach(p => {
    p.scoutComment = generateScoutComment(p);
  });

  return roster;
};

// 初期スタッフを生成
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

// 社会人モードの完全初期化
export const initializeCorporateGame = (teamDef) => {
  // ワールドデータ初期化
  initializeWorld('corporate');

  // TEAMS_DATAをクリア
  Object.keys(TEAMS_DATA).forEach(key => delete TEAMS_DATA[key]);
  clearReleasedPlayersPool();

  // ユーザーチームの選手を生成
  const roster = generateCorporateRoster(teamDef, 1);
  const staff = generateInitialStaff(teamDef.rank);

  // TEAMS_DATAにユーザーチームを登録
  const teamName = teamDef.displayName || teamDef.name;
  TEAMS_DATA[teamName] = {
    name: teamName,
    abbreviation: teamName.slice(0, 3),
    players: roster,
    pitchingRotation: null,
    corporateTeamId: teamDef.id,
    corporateData: {
      rank: teamDef.rank,
      region: teamDef.region,
      city: teamDef.city,
      type: teamDef.type,
      budget: teamDef.budget || 50,
      staff: staff,
    },
  };

  // 対戦相手用のAIチームを3チーム生成（同地区の他チーム or ランダム）
  const aiTeamNames = generateAIOpponentTeams(teamDef, 3);

  // WORLD_DATAにチーム情報を保存
  WORLD_DATA.corporateLeague.userTeam = teamName;
  WORLD_DATA.corporateLeague.teams = { [teamName]: TEAMS_DATA[teamName] };

  return {
    userTeamName: teamName,
    allTeamNames: [teamName, ...aiTeamNames],
    roster,
    staff,
  };
};

// AI対戦相手チームを生成
const generateAIOpponentTeams = (userTeamDef, count) => {
  const names = [];
  const ranks = ['B', 'C', 'A', 'D', 'B', 'C'];

  for (let i = 0; i < count; i++) {
    const aiRank = ranks[i % ranks.length];
    const aiName = `対戦チーム${String.fromCharCode(65 + i)}`;
    const aiRoster = generateCorporateRoster({ rank: aiRank }, 1);

    TEAMS_DATA[aiName] = {
      name: aiName,
      abbreviation: String.fromCharCode(0xFF21 + i),
      players: aiRoster,
      pitchingRotation: null,
      corporateData: {
        rank: aiRank,
        region: userTeamDef.region,
        budget: { S: 90, A: 70, B: 50, C: 35, D: 20 }[aiRank] || 35,
        staff: generateInitialStaff(aiRank),
      },
    };

    names.push(aiName);
  }

  return names;
};
