// ============================================================
// 社会人野球 初期化システム
// チーム選択後の選手生成・スタッフ生成・ゲーム開始処理
// ============================================================
//
// ドラフト指名バランス設計:
//   NPBドラフト全体 ~120名/年、うち社会人出身 ~15%(18名)
//   全179チーム(S:11 A:24 B:32 C:38 D:74)から18名前後
//
//   2段階構造:
//   ① プロ注目（スカウトが視察）= 各チームのスター枠
//   ② ドラフト指名級（実際にNPBが獲る）= スターの中で更にエリート
//
//   期待値:
//     S 11×4.5星 ×20%エリート = ~10名
//     A 24×2.5星 ×12%         = ~7名
//     B 32×0.5星 ×6%          = ~1名
//     C 38チーム  確率覚醒      = ~1名
//     D 74チーム  確率覚醒      = ~0名
//     合計 ≒ 19名 → 15-20名の範囲
// ============================================================

import { generateTryoutCandidates, selectPlayerForAI, generateScoutComment } from '../season/tryoutSystem.js';
import { generateStaff } from './staffData.js';
import { getTeamsByRegion, REGIONS, getAllTeamsEffective } from './corporateTeamsData.js';
import { initializeWorld, WORLD_DATA } from './worldData.js';
import { TEAMS_DATA, clearReleasedPlayersPool } from '../teams-data.js';
import { INDEPENDENT_LEAGUES, ALL_INDEPENDENT_LEAGUE_IDS } from './independentLeagueData.js';
import { generateFullSeasonSchedule } from '../season/scheduleGenerator.js';
import { initializeStandings } from '../season/seasonManager.js';

// ============================================================
// ランク別チーム構成
// 独立リーグ ≒ A～Cの範囲
// ============================================================

const RANK_CONFIG = {
  S: {
    teamOffset: 5,         // チーム全体の底上げ
    starCount: [4, 5],     // プロ注目選手（スカウトが視察するレベル）
    starBoost: [12, 18],   // 注目選手の能力追加（確実に頭一つ抜ける）
    starGrowth: 0.10,
    eliteChance: 0.20,     // 注目選手のうち20%が真のドラフト候補
    eliteBoost: [10, 15],  // エリートへの追加ブースト
    eliteGrowth: 0.15,
  },
  A: {
    teamOffset: 3,
    starCount: [2, 3],
    starBoost: [10, 16],
    starGrowth: 0.08,
    eliteChance: 0.12,
    eliteBoost: [10, 15],
    eliteGrowth: 0.13,
  },
  B: {
    teamOffset: 0,         // 独立リーグ平均
    starCount: [0, 1],
    starBoost: [8, 14],
    starGrowth: 0.06,
    eliteChance: 0.06,
    eliteBoost: [10, 15],
    eliteGrowth: 0.10,
  },
  C: {
    teamOffset: -3,
    starCount: [0, 0],
    proChance: 0.04,       // 25人×4% ≈ 1人/チーム がプロ注目レベルに
    proBoost: [8, 13],
    proGrowth: 0.08,
  },
  D: {
    teamOffset: -6,
    starCount: [0, 0],
    proChance: 0.012,      // 25人×1.2% ≈ 0.3人/チーム（3チームに1人程度）
    proBoost: [6, 10],
    proGrowth: 0.06,
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

// ランク別球速キャップ・追加減速（corporateモード用）
// D: クラブチーム → 平均120km台、速い人で133km
// C: 育成型 → 平均125km台、速い人で138km
// B: 中堅（独立リーグ平均） → 平均130km台、エースで143km
// A: 強豪 → 平均135km台、エースで148km
// S: 超強豪 → 平均138km台、エースで152km（プロ予備軍レベル）
const RANK_VELOCITY_CAP = { S: 152, A: 148, B: 143, C: 138, D: 133 };
const RANK_VELOCITY_REDUCTION = { S: 0, A: -3, B: -5, C: -8, D: -12 };

// ランク別の初期注目度（0-100）
// 注目度が高い → スカウト成功率UP、企業資金UP、優秀な選手が集まる
const RANK_INITIAL_REPUTATION = { S: 85, A: 65, B: 40, C: 20, D: 5 };

let corporatePlayerIdBase = 20000;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// チーム全体のベース補正
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

// プロ注目/エリートのブースト（投手・野手で異なる）
const applyBoost = (player, boostRange, growthBonus) => {
  const isPitcher = player.position === 'pitcher';
  const boost = randInt(boostRange[0], boostRange[1]);

  if (isPitcher) {
    player.pitching.velocity = clamp(player.pitching.velocity + randInt(2, 5), 100, 155);
    player.pitching.control = clamp(player.pitching.control + boost, 1, 99);
    player.pitching.stamina = clamp(player.pitching.stamina + Math.floor(boost * 0.6), 30, 150);
    player.physical.arm = clamp(player.physical.arm + Math.floor(boost * 0.5), 1, 99);
    if (player.pitching.arsenal) {
      for (const pitch of player.pitching.arsenal) {
        if (pitch.name !== 'ストレート') {
          pitch.level = clamp((pitch.level || 30) + randInt(8, 20), 1, 99);
        }
      }
    }
  } else {
    player.batting.meet = clamp(player.batting.meet + boost, 1, 99);
    player.batting.power = clamp(player.batting.power + Math.floor(boost * 0.85), 1, 99);
    player.batting.eye = clamp(player.batting.eye + Math.floor(boost * 0.8), 1, 99);
    player.physical.speed = clamp(player.physical.speed + Math.floor(boost * 0.5), 1, 99);
    player.fielding.defense = clamp(player.fielding.defense + Math.floor(boost * 0.6), 1, 99);
    player.physical.arm = clamp(player.physical.arm + Math.floor(boost * 0.5), 1, 99);
  }

  player.growthPotential = clamp((player.growthPotential || 1.0) + growthBonus, 0.5, 1.5);
};

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

  const candidates = generateTryoutCandidates(year, 2, true);

  corporatePlayerIdBase += 1000;
  candidates.forEach((p, i) => { p.id = corporatePlayerIdBase + i; });

  const velReduction = RANK_VELOCITY_REDUCTION[rank] || 0;
  const velCap = RANK_VELOCITY_CAP[rank] || 155;

  candidates.forEach(p => {
    applyTeamOffset(p, cfg.teamOffset);
    adjustCorporateAge(p);
    p.pitching.velocity = clamp(p.pitching.velocity + velReduction, 100, velCap);
  });

  const roster = [];
  const remaining = [...candidates];
  const maxPitchers = 9;
  for (let i = 0; i < rosterSize && remaining.length > 0; i++) {
    const pitcherCount = roster.filter(p => p.position === 'pitcher').length;
    let pool = remaining;
    if (pitcherCount >= maxPitchers) {
      pool = remaining.filter(p => p.position !== 'pitcher');
      if (pool.length === 0) pool = remaining;
    }
    const pick = selectPlayerForAI(pool, roster);
    if (!pick) break;
    const idx = remaining.findIndex(c => c.id === pick.id);
    if (idx >= 0) remaining.splice(idx, 1);
    roster.push(pick);
  }

  // S/A/Bランク: スター選手を選出してブースト
  const starCount = randInt(cfg.starCount[0], cfg.starCount[1]);
  if (starCount > 0) {
    const pitchers = roster.filter(p => p.position === 'pitcher');
    const fielders = roster.filter(p => p.position !== 'pitcher');
    const starPitcherCount = Math.min(pitchers.length, Math.max(1, Math.floor(starCount * 0.4)));
    const starFielderCount = starCount - starPitcherCount;

    pitchers.sort((a, b) => (b.pitching.velocity + b.pitching.control) - (a.pitching.velocity + a.pitching.control));
    fielders.sort((a, b) => (b.batting.meet + b.batting.power) - (a.batting.meet + a.batting.power));

    const stars = [];
    for (let i = 0; i < starPitcherCount && i < pitchers.length; i++) {
      applyBoost(pitchers[i], cfg.starBoost, cfg.starGrowth);
      stars.push(pitchers[i]);
    }
    for (let i = 0; i < starFielderCount && i < fielders.length; i++) {
      applyBoost(fielders[i], cfg.starBoost, cfg.starGrowth);
      stars.push(fielders[i]);
    }

    // スターの中からエリート（真のドラフト候補）を抽選
    if (cfg.eliteChance) {
      for (const star of stars) {
        if (Math.random() < cfg.eliteChance) {
          applyBoost(star, cfg.eliteBoost, cfg.eliteGrowth);
        }
      }
    }
  }

  // C/Dランク: 低確率でプロ注目レベルが出現
  if (cfg.proChance && cfg.proBoost) {
    for (const p of roster) {
      if (Math.random() < cfg.proChance) {
        applyBoost(p, cfg.proBoost, cfg.proGrowth || 0.06);
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

const makeAbbreviation = (name) => {
  if (name.length <= 3) return name;
  if (/^[A-Za-z]/.test(name)) return name.slice(0, 3).toUpperCase();
  return name.slice(0, 3);
};

// ============================================================
// 独立リーグチームの初期化（全4リーグ、ユーザーリーグは除外可）
// ============================================================

export const initializeIndependentLeagues = (excludeLeagueId = null, existingTeamNames = []) => {
  const existingSet = new Set(existingTeamNames);

  for (const leagueId of ALL_INDEPENDENT_LEAGUE_IDS) {
    if (leagueId === excludeLeagueId) continue;

    const leagueDef = INDEPENDENT_LEAGUES[leagueId];
    const teamNames = [];

    for (const teamDef of leagueDef.teams) {
      if (TEAMS_DATA[teamDef.name] || existingSet.has(teamDef.name)) continue;

      const roster = generateCorporateRoster(teamDef, 1);
      TEAMS_DATA[teamDef.name] = {
        name: teamDef.name,
        abbreviation: teamDef.abbreviation || makeAbbreviation(teamDef.name),
        players: roster,
        pitchingRotation: null,
        independentLeagueId: leagueId,
      };
      teamNames.push(teamDef.name);
    }

    const schedule = generateFullSeasonSchedule({
      teams: teamNames,
      gamesPerSeason: leagueDef.gamesPerSeason,
      startDate: { year: 2024, month: 4, day: 1 },
      endDate: { year: 2024, month: 9, day: 30 },
      leagueFormat: leagueDef.leagueFormat || 'single',
      leagueNames: leagueDef.leagueNames,
    });

    WORLD_DATA.independentLeagues[leagueId] = {
      name: leagueDef.name,
      teams: teamNames,
      schedule,
      standings: initializeStandings(teamNames),
      results: [],
    };
  }
};

// ============================================================
// 社会人モードの完全初期化（全チーム＋独立リーグのロスターを生成）
// ============================================================

export const initializeCorporateGame = (teamDef) => {
  corporatePlayerIdBase = 20000;

  initializeWorld('corporate', 'corporate');
  Object.keys(TEAMS_DATA).forEach(key => delete TEAMS_DATA[key]);
  clearReleasedPlayersPool();

  // 社会人179チーム生成
  const allTeamDefs = getAllTeamsEffective();
  const userTeamName = teamDef.displayName || teamDef.name;
  const allTeamNames = [];
  let userRoster = null;
  let userStaff = null;

  const createTeamEntry = (def) => {
    const name = def.displayName || def.name;
    const roster = generateCorporateRoster(def, 1);
    const staff = generateInitialStaff(def.rank);
    TEAMS_DATA[name] = {
      name,
      abbreviation: makeAbbreviation(name),
      players: roster,
      pitchingRotation: null,
      corporateTeamId: def.id,
      corporateData: {
        rank: def.rank, region: def.region, city: def.city, type: def.type,
        budget: def.budget || BUDGET_BY_RANK[def.rank] || 35,
        staff,
        reputation: RANK_INITIAL_REPUTATION[def.rank] || 5,
        proDraftCount: 0, tournamentWins: 0, yearlyBudgetBonus: 0,
      },
    };
    allTeamNames.push(name);
    return { roster, staff };
  };

  // ユーザーチームを最初に追加（Object.keys(TEAMS_DATA)[0]で取得されるため）
  const userDef = allTeamDefs.find(d => (d.displayName || d.name) === userTeamName);
  if (userDef) {
    const { roster, staff } = createTeamEntry(userDef);
    userRoster = roster;
    userStaff = staff;
  }

  for (const def of allTeamDefs) {
    const name = def.displayName || def.name;
    if (TEAMS_DATA[name]) continue;
    createTeamEntry(def);
  }

  WORLD_DATA.corporateLeague.userTeam = userTeamName;
  WORLD_DATA.corporateLeague.teams = {};
  for (const name of allTeamNames) {
    WORLD_DATA.corporateLeague.teams[name] = TEAMS_DATA[name];
  }

  // 独立リーグ4つも生成
  initializeIndependentLeagues(null, allTeamNames);

  return { userTeamName, allTeamNames, roster: userRoster, staff: userStaff };
};

// ============================================================
// 独立リーグモードの平行世界初期化
// ユーザーが独立リーグで遊ぶ時に、社会人+他の独立リーグを生成
// ============================================================

export const initializeParallelWorldForIndependent = (userLeagueId, userTeamNames) => {
  initializeWorld('independent', userLeagueId);
  corporatePlayerIdBase = 20000;

  // 社会人チーム全179チーム生成
  const allCorpDefs = getAllTeamsEffective();
  const corpTeamNames = [];
  for (const def of allCorpDefs) {
    const name = def.displayName || def.name;
    if (TEAMS_DATA[name]) continue;

    const roster = generateCorporateRoster(def, 1);
    const staff = generateInitialStaff(def.rank);
    TEAMS_DATA[name] = {
      name,
      abbreviation: makeAbbreviation(name),
      players: roster,
      pitchingRotation: null,
      corporateTeamId: def.id,
      corporateData: {
        rank: def.rank, region: def.region, city: def.city, type: def.type,
        budget: def.budget || BUDGET_BY_RANK[def.rank] || 35,
        staff,
        reputation: RANK_INITIAL_REPUTATION[def.rank] || 5,
        proDraftCount: 0, tournamentWins: 0, yearlyBudgetBonus: 0,
      },
    };
    corpTeamNames.push(name);
  }
  WORLD_DATA.corporateLeague.teams = {};
  for (const name of corpTeamNames) {
    WORLD_DATA.corporateLeague.teams[name] = TEAMS_DATA[name];
  }

  // ユーザーのリーグ以外の独立リーグを生成
  initializeIndependentLeagues(userLeagueId, [...userTeamNames, ...corpTeamNames]);
};

// ============================================================
// 注目度システム
// 勝つ → 注目度UP → 資金UP → 良いスタッフ → 良い選手 → 勝つ
// ============================================================

// 注目度の変動要因
const REPUTATION_GAINS = {
  win: 0.3,                // 1勝ごと
  tournamentWin: 8,        // 大会優勝
  tournamentRunnerUp: 4,   // 大会準優勝
  proDrafted: 12,          // プロ選手輩出
  seasonChampion: 15,      // リーグ優勝
};

const REPUTATION_DECAY = 2; // 年間自然減衰（実績なしなら忘れられる）

// 注目度 → 企業の年間追加資金（万円）
export const getReputationBudgetBonus = (reputation) => {
  if (reputation >= 80) return 50;  // 超有名 → +5000万
  if (reputation >= 60) return 35;
  if (reputation >= 40) return 20;
  if (reputation >= 20) return 10;
  return 0;
};

// 注目度 → スカウト成功率補正（1.0基準）
export const getReputationScoutBonus = (reputation) => {
  return 0.6 + (reputation / 100) * 0.8; // 0→0.6倍、50→1.0倍、100→1.4倍
};

// 注目度 → 入団希望選手の質補正
export const getReputationRecruitBonus = (reputation) => {
  return Math.floor(reputation / 10) - 2; // 0→-2、50→3、100→8
};

// シーズン終了時の注目度更新
export const updateReputation = (teamData, seasonResults) => {
  const cd = teamData.corporateData;
  if (!cd) return;

  let gain = 0;
  gain += (seasonResults.wins || 0) * REPUTATION_GAINS.win;
  if (seasonResults.isChampion) gain += REPUTATION_GAINS.seasonChampion;
  if (seasonResults.tournamentWin) gain += REPUTATION_GAINS.tournamentWin;
  if (seasonResults.tournamentRunnerUp) gain += REPUTATION_GAINS.tournamentRunnerUp;
  if (seasonResults.proDraftedCount) gain += seasonResults.proDraftedCount * REPUTATION_GAINS.proDrafted;

  cd.reputation = clamp(cd.reputation + gain - REPUTATION_DECAY, 0, 100);
  cd.yearlyBudgetBonus = getReputationBudgetBonus(cd.reputation);
  cd.proDraftCount += seasonResults.proDraftedCount || 0;
  cd.tournamentWins += seasonResults.tournamentWin ? 1 : 0;
};
