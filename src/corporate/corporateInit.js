// ============================================================
// 社会人野球 初期化システム
// チーム選択後の選手生成・スタッフ生成・ゲーム開始処理
// ============================================================

import { generateTryoutCandidates, selectPlayerForAI, generateScoutComment } from '../season/tryoutSystem.js';
import { generateStaff } from './staffData.js';
import { getTeamsByRegion, REGIONS } from './corporateTeamsData.js';
import { initializeWorld, WORLD_DATA } from './worldData.js';
import { TEAMS_DATA, clearReleasedPlayersPool } from '../teams-data.js';

// ============================================================
// ランク別チーム構成
// 独立リーグ ≒ A～Cの範囲
// S: プロ注目4-5人 / A: プロ注目2-3人 / B: プロ注目1人程度
// C: たまにプロ輩出 / D: ごく稀にプロが出る
// ============================================================

const RANK_CONFIG = {
  S: {
    teamOffset: 5,       // チーム全体の底上げ（独立リーグより少し上）
    starCount: [4, 5],   // プロ注目選手の人数
    starBoost: [20, 28], // スター選手の能力追加幅
    starGrowth: 0.15,    // スター選手のgrowthPotential追加
  },
  A: {
    teamOffset: 3,
    starCount: [2, 3],
    starBoost: [18, 25],
    starGrowth: 0.12,
  },
  B: {
    teamOffset: 0,       // 独立リーグ平均レベル
    starCount: [0, 1],   // 0-1人（80%で1人）
    starBoost: [15, 22],
    starGrowth: 0.10,
  },
  C: {
    teamOffset: -3,      // 独立リーグ下位レベル
    starCount: [0, 0],   // スター枠なし
    starBoost: [0, 0],
    starGrowth: 0,
    proChance: 0.06,     // 各選手6%でプロ候補レベルに覚醒（25人中1-2人程度）
    proBoost: [10, 16],
  },
  D: {
    teamOffset: -6,
    starCount: [0, 0],
    starBoost: [0, 0],
    starGrowth: 0,
    proChance: 0.02,     // 各選手2%（25人中0-1人、大半は0人）
    proBoost: [8, 13],
  },
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

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// チーム全体のベース補正（独立リーグとの差）
const applyTeamOffset = (player, offset) => {
  if (offset === 0) return;

  player.batting.meet = clamp(player.batting.meet + offset, 1, 99);
  player.batting.power = clamp(player.batting.power + offset, 1, 99);
  player.batting.eye = clamp(player.batting.eye + offset, 1, 99);
  player.batting.steal = clamp(player.batting.steal + Math.floor(offset * 0.5), 1, 99);
  player.batting.bunt = clamp(player.batting.bunt + Math.floor(offset * 0.3), 1, 99);

  player.physical.speed = clamp(player.physical.speed + Math.floor(offset * 0.7), 1, 99);
  player.physical.arm = clamp(player.physical.arm + Math.floor(offset * 0.7), 1, 99);

  player.fielding.defense = clamp(player.fielding.defense + Math.floor(offset * 0.8), 1, 99);

  player.pitching.velocity = clamp(player.pitching.velocity + Math.floor(offset * 0.3), 100, 165);
  player.pitching.control = clamp(player.pitching.control + Math.floor(offset * 0.8), 1, 99);
  player.pitching.stamina = clamp(player.pitching.stamina + Math.floor(offset * 0.5), 30, 150);
};

// プロ注目選手への個別ブースト
const applyStarBoost = (player, boostRange, growthBonus) => {
  const isPitcher = player.position === 'pitcher';
  const boost = randInt(boostRange[0], boostRange[1]);

  if (isPitcher) {
    // 投手スター: 球速・制球・変化球が突出
    player.pitching.velocity = clamp(player.pitching.velocity + randInt(3, 8), 100, 160);
    player.pitching.control = clamp(player.pitching.control + boost, 1, 99);
    player.pitching.stamina = clamp(player.pitching.stamina + Math.floor(boost * 0.6), 30, 150);
    player.physical.arm = clamp(player.physical.arm + Math.floor(boost * 0.7), 1, 99);
    // 変化球も強化
    if (player.pitching.arsenal) {
      for (const pitch of player.pitching.arsenal) {
        if (pitch.name !== 'ストレート') {
          pitch.level = clamp((pitch.level || 30) + randInt(10, 25), 1, 99);
        }
      }
    }
  } else {
    // 野手スター: 打撃の主要能力が突出
    player.batting.meet = clamp(player.batting.meet + boost, 1, 99);
    player.batting.power = clamp(player.batting.power + Math.floor(boost * 0.85), 1, 99);
    player.batting.eye = clamp(player.batting.eye + Math.floor(boost * 0.8), 1, 99);
    player.physical.speed = clamp(player.physical.speed + Math.floor(boost * 0.5), 1, 99);
    player.fielding.defense = clamp(player.fielding.defense + Math.floor(boost * 0.6), 1, 99);
    player.physical.arm = clamp(player.physical.arm + Math.floor(boost * 0.5), 1, 99);
  }

  player.growthPotential = clamp((player.growthPotential || 1.0) + growthBonus, 0.5, 1.5);
};

// 社会人なので年齢を調整（22-30歳、独立リーグより高め）
const adjustCorporateAge = (player) => {
  if (player.age < 22) {
    player.age += 22 - player.age + Math.floor(Math.random() * 6);
  }
};

// 社会人チームの選手25名を生成
export const generateCorporateRoster = (teamDef, year = 1) => {
  const rank = teamDef.rank || 'C';
  const cfg = RANK_CONFIG[rank] || RANK_CONFIG.C;
  const rosterSize = 25;

  // 独立リーグと同じ生成システムで候補を作る（これがA～Cレベル）
  const candidates = generateTryoutCandidates(year, 2, true);

  // ID衝突回避
  corporatePlayerIdBase += 1000;
  candidates.forEach((p, i) => { p.id = corporatePlayerIdBase + i; });

  // チーム全体のベース補正
  candidates.forEach(p => {
    applyTeamOffset(p, cfg.teamOffset);
    adjustCorporateAge(p);
  });

  // AIドラフトでバランスの良い25名を選出
  const roster = [];
  const remaining = [...candidates];
  for (let i = 0; i < rosterSize && remaining.length > 0; i++) {
    const pick = selectPlayerForAI(remaining, roster);
    if (!pick) break;
    const idx = remaining.findIndex(c => c.id === pick.id);
    if (idx >= 0) remaining.splice(idx, 1);
    roster.push(pick);
  }

  // スター選手を選出してブースト
  const starCount = randInt(cfg.starCount[0], cfg.starCount[1]);
  if (starCount > 0) {
    // 投手と野手バランスよくスターを配置
    const pitchers = roster.filter(p => p.position === 'pitcher');
    const fielders = roster.filter(p => p.position !== 'pitcher');
    const starPitcherCount = Math.min(pitchers.length, Math.max(1, Math.floor(starCount * 0.4)));
    const starFielderCount = starCount - starPitcherCount;

    // 能力の高い順にスター候補をソート
    pitchers.sort((a, b) => (b.pitching.velocity + b.pitching.control) - (a.pitching.velocity + a.pitching.control));
    fielders.sort((a, b) => (b.batting.meet + b.batting.power) - (a.batting.meet + a.batting.power));

    for (let i = 0; i < starPitcherCount && i < pitchers.length; i++) {
      applyStarBoost(pitchers[i], cfg.starBoost, cfg.starGrowth);
    }
    for (let i = 0; i < starFielderCount && i < fielders.length; i++) {
      applyStarBoost(fielders[i], cfg.starBoost, cfg.starGrowth);
    }
  }

  // C/Dランク: 確率でプロ候補レベルが出現
  if (cfg.proChance && cfg.proBoost) {
    for (const p of roster) {
      if (Math.random() < cfg.proChance) {
        applyStarBoost(p, cfg.proBoost, 0.08);
      }
    }
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

  let pool = getTeamsByRegion(userRegion).filter(t => t.id !== userId);

  if (pool.length < targetCount) {
    const regionIds = REGIONS.map(r => r.id);
    const idx = regionIds.indexOf(userRegion);
    const neighbors = [
      regionIds[idx - 1], regionIds[idx + 1],
      regionIds[idx - 2], regionIds[idx + 2],
    ].filter(Boolean);

    for (const nRegion of neighbors) {
      if (pool.length >= targetCount) break;
      pool = pool.concat(getTeamsByRegion(nRegion));
    }
  }

  const userRankOrder = { S: 0, A: 1, B: 2, C: 3, D: 4 }[userTeamDef.rank] ?? 2;
  pool.sort((a, b) => {
    const aOrder = { S: 0, A: 1, B: 2, C: 3, D: 4 }[a.rank] ?? 3;
    const bOrder = { S: 0, A: 1, B: 2, C: 3, D: 4 }[b.rank] ?? 3;
    return Math.abs(aOrder - userRankOrder) - Math.abs(bOrder - userRankOrder);
  });

  return pool.slice(0, targetCount);
};

const makeAbbreviation = (name) => {
  if (name.length <= 3) return name;
  if (/^[A-Za-z]/.test(name)) return name.slice(0, 3).toUpperCase();
  return name.slice(0, 3);
};

// 社会人モードの完全初期化
export const initializeCorporateGame = (teamDef) => {
  corporatePlayerIdBase = 20000;

  initializeWorld('corporate');
  Object.keys(TEAMS_DATA).forEach(key => delete TEAMS_DATA[key]);
  clearReleasedPlayersPool();

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

  const aiTeamDefs = selectLeagueTeams(teamDef, 7);
  const aiTeamNames = [];

  for (const aiDef of aiTeamDefs) {
    const aiName = aiDef.displayName || aiDef.name;
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

  return { userTeamName, allTeamNames, roster: userRoster, staff: userStaff };
};
