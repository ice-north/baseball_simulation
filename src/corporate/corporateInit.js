// ============================================================
// 社会人野球 初期化システム
// チーム選択後の選手生成・スタッフ生成・ゲーム開始処理
// ============================================================
//
// ドラフト指名バランス設計:
//   NPBドラフト全体 ~120名/年、うち社会人出身 ~15%(18名)
//   全300チーム(S:10 A:23 B:32 C:53 D:182)から18-20名前後
//   総選手数 ~6,700名、うちプロ注目 ~457名(6.8%)
//
//   2段階構造:
//   ① プロ注目（スカウトが視察）= スター枠 or 確率覚醒
//   ② ドラフト指名級（実際にNPBが獲る）= スターの中で更にエリート
//
//   期待値:
//     S 10×4.5星 ×20%エリート = ~9名  (注目率12.7%)
//     A 23×2.5星 ×12%         = ~7名  (注目率7.7%)
//     B 32×0.5星 ×6%          = ~1名  (注目率1.9%)
//     C 53チーム  確率覚醒10%   = ~1-2名 (注目率10.0%)
//     D 182チーム 確率覚醒6%   = ~0-1名 (注目率6.0%)
//     合計 ≒ 18-20名
// ============================================================

import { generateTryoutCandidates, selectPlayerForAI, generateScoutComment } from '../season/tryoutSystem.js';
import { generateStaff } from './staffData.js';
import { getTeamsByRegion, REGIONS, getAllTeamsEffective } from './corporateTeamsData.js';
import { initializeWorld, WORLD_DATA } from './worldData.js';
import { TEAMS_DATA, clearReleasedPlayersPool } from '../teams-data.js';
import { INDEPENDENT_LEAGUES, ALL_INDEPENDENT_LEAGUE_IDS } from './independentLeagueData.js';
import { generateFullSeasonSchedule } from '../season/scheduleGenerator.js';
import { initializeStandings } from '../season/seasonManager.js';
import { initializeUniversityLeagues } from '../university/universityLeagueManager.js';

// ============================================================
// ランク別チーム構成
// 独立リーグ ≒ A～Cの範囲
// ============================================================

const RANK_CONFIG = {
  S: {
    teamOffset: 10,        // 社会人強豪は独立リーグより大幅に上
    starCount: [4, 5],     // プロ注目選手（スカウトが視察するレベル）
    starBoost: [12, 18],   // 注目選手の能力追加（確実に頭一つ抜ける）
    starGrowth: 0.10,
    eliteChance: 0.20,     // 注目選手のうち20%が真のドラフト候補
    eliteBoost: [10, 15],  // エリートへの追加ブースト
    eliteGrowth: 0.15,
  },
  A: {
    teamOffset: 7,
    starCount: [2, 3],
    starBoost: [10, 16],
    starGrowth: 0.08,
    eliteChance: 0.12,
    eliteBoost: [10, 15],
    eliteGrowth: 0.13,
  },
  B: {
    teamOffset: 4,         // 独立リーグ平均より上
    starCount: [0, 1],
    starBoost: [8, 14],
    starGrowth: 0.06,
    eliteChance: 0.06,
    eliteBoost: [10, 15],
    eliteGrowth: 0.10,
  },
  C: {
    teamOffset: 1,
    starCount: [0, 0],
    proChance: 0.10,       // 25人×10% ≈ 2.5人/チーム がプロ注目レベルに
    proBoost: [10, 16],
    proGrowth: 0.08,
  },
  D: {
    teamOffset: -3,
    starCount: [0, 0],
    proChance: 0.06,       // 20人×6% ≈ 1.2人/チーム（クラブチームからプロ輩出もある）
    proBoost: [8, 14],
    proGrowth: 0.06,
  },
};

// 独立リーグ専用設定（プロを目指す選手の集まり → 社会人より高いスター率）
// 20チーム ~515人から年15名前後のNPB指名を目標
//   B 10×2星 ×20%エリート = ~4名
//   C 8チーム  星0-1 + 覚醒12% = ~4-5名
//   D 2チーム  覚醒8%          = ~0-1名
//   + シーズン中のfame/成績ボーナスで +5-6名
//   合計 ≒ 13-16名
const INDEPENDENT_RANK_CONFIG = {
  B: {
    teamOffset: 4,
    starCount: [1, 3],
    starBoost: [10, 16],
    starGrowth: 0.08,
    eliteChance: 0.20,
    eliteBoost: [10, 15],
    eliteGrowth: 0.12,
  },
  C: {
    teamOffset: 1,
    starCount: [0, 1],
    starBoost: [8, 14],
    starGrowth: 0.06,
    eliteChance: 0.08,
    eliteBoost: [8, 12],
    eliteGrowth: 0.08,
    proChance: 0.12,
    proBoost: [10, 16],
    proGrowth: 0.08,
  },
  D: {
    teamOffset: -3,
    starCount: [0, 0],
    proChance: 0.08,
    proBoost: [8, 14],
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

// ランク×種別ごとのロースターサイズ [min, max]
const ROSTER_SIZE = {
  S: { corporate: [33, 38], club: [28, 33] },
  A: { corporate: [30, 35], club: [25, 30] },
  B: { corporate: [25, 30], club: [22, 27] },
  C: { corporate: [22, 27], club: [20, 24] },
  D: { corporate: [20, 24], club: [16, 20] },
};

// ランク別球速キャップ・最低保証・追加減速（corporateモード用）
// floorは「チームで一番遅い投手」の下限、capは「スター以外の上限」
// D: クラブチーム → 105-133km（技巧派〜本格派まで幅広い）
// C: 育成型 → 112-138km
// B: 中堅 → 120-145km
// A: 強豪 → 125-150km（自然に150km出せる選手も）
// S: 超強豪 → 128-152km（プロ予備軍レベル）
const RANK_VELOCITY_CAP = { S: 152, A: 150, B: 145, C: 138, D: 133 };
const RANK_VELOCITY_FLOOR = { S: 128, A: 125, B: 120, C: 112, D: 105 };
const RANK_VELOCITY_REDUCTION = { S: 0, A: -3, B: -5, C: -8, D: -15 };

// ランク別の投手制球追加補正（teamOffsetだけでは不十分なので投手専用補正）
const RANK_CONTROL_OFFSET = { S: 8, A: 5, B: 0, C: -5, D: -15 };

// ランク別の制球キャップ（社会人野球はプロ未満）
// 通常選手の上限。スター/プロ注目は+8まで許容
const RANK_CONTROL_CAP = { S: 78, A: 72, B: 65, C: 55, D: 45 };

// ランク別の変化球レベル倍率（Dランクはアマチュアレベル）
const RANK_ARSENAL_MULT = { S: 1.1, A: 1.0, B: 0.85, C: 0.65, D: 0.45 };

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
    player.pitching.velocity = clamp(player.pitching.velocity + randInt(3, 7), 100, 155);
    player.pitching.control = clamp(player.pitching.control + boost, 1, 99);
    player.pitching.stamina = clamp(player.pitching.stamina + Math.floor(boost * 0.6), 30, 150);
    player.physical.arm = clamp(player.physical.arm + Math.floor(boost * 0.6), 1, 99);
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

// 社会人/独立リーグチームの選手を生成（ランク×種別でロースターサイズが変動）
export const generateCorporateRoster = (teamDef, year = 1) => {
  const rank = teamDef.rank || 'C';
  const type = teamDef.type || 'corporate';
  const isIndependent = String(teamDef.id || '').startsWith('il_');
  const cfg = (isIndependent ? INDEPENDENT_RANK_CONFIG[rank] : null) || RANK_CONFIG[rank] || RANK_CONFIG.C;
  const sizeRange = ROSTER_SIZE[rank]?.[type] || ROSTER_SIZE.C.corporate;
  const rosterSize = randInt(sizeRange[0], sizeRange[1]);

  // 候補者数をロースターの1.5倍以上確保
  const candidateTeams = Math.max(2, Math.ceil(rosterSize / 25));
  const candidates = generateTryoutCandidates(year, candidateTeams, true);

  corporatePlayerIdBase += 1000;
  candidates.forEach((p, i) => { p.id = corporatePlayerIdBase + i; });

  const velReduction = RANK_VELOCITY_REDUCTION[rank] || 0;
  const velCap = RANK_VELOCITY_CAP[rank] || 155;

  const velFloor = RANK_VELOCITY_FLOOR[rank] || 120;

  const controlOffset = RANK_CONTROL_OFFSET[rank] || 0;
  const controlCap = RANK_CONTROL_CAP[rank] || 65;
  const arsenalMult = RANK_ARSENAL_MULT[rank] || 1.0;

  candidates.forEach(p => {
    // === 個人才能バラつき（三角分布: -8〜+8、中央集中） ===
    const talent = randInt(-4, 4) + randInt(-4, 4);
    p.batting.meet = clamp(p.batting.meet + talent + randInt(-4, 4), 1, 99);
    p.batting.power = clamp(p.batting.power + talent + randInt(-4, 4), 1, 99);
    p.batting.eye = clamp(p.batting.eye + talent + randInt(-3, 3), 1, 99);
    p.batting.steal = clamp(p.batting.steal + randInt(-5, 5), 1, 99);
    p.physical.speed = clamp(p.physical.speed + talent + randInt(-4, 4), 1, 99);
    p.physical.arm = clamp(p.physical.arm + talent + randInt(-4, 4), 1, 99);
    p.fielding.defense = clamp(p.fielding.defense + talent + randInt(-4, 4), 1, 99);

    applyTeamOffset(p, cfg.teamOffset);
    adjustCorporateAge(p);

    if (p.position === 'pitcher') {
      // 球速: ランク補正 + 個人差（三角分布 -12〜+12）
      const velJitter = randInt(-6, 6) + randInt(-6, 6);
      p.pitching.velocity = clamp(p.pitching.velocity + velReduction + velJitter, velFloor, velCap);
      // 制球: ランク補正 + 個人差（-10〜+10）、ランク別キャップ適用
      const ctrlJitter = randInt(-7, 7) + randInt(-3, 3);
      p.pitching.control = clamp(p.pitching.control + controlOffset + ctrlJitter, 1, controlCap);
      // 変化球: ランク倍率 + 個人差
      if (p.pitching.arsenal) {
        for (const pitch of p.pitching.arsenal) {
          if (pitch.name !== 'ストレート' && pitch.type !== 'straight') {
            const arsenalJitter = randInt(-10, 10);
            pitch.level = clamp(Math.round(pitch.level * arsenalMult) + arsenalJitter, 5, 99);
          }
        }
      }
    } else {
      p.pitching.velocity = clamp(p.pitching.velocity + velReduction, 100, velCap);
    }

    // 10%: 一芸特化選手（ひとつの分野だけ突出）
    if (Math.random() < 0.10) {
      if (p.position === 'pitcher') {
        const roll = Math.random();
        if (roll < 0.35) {
          p.pitching.velocity = clamp(p.pitching.velocity + randInt(5, 10), velFloor, velCap + 5);
        } else if (roll < 0.70) {
          p.pitching.control = clamp(p.pitching.control + randInt(8, 15), 1, controlCap + 5);
        } else {
          if (p.pitching.arsenal) {
            for (const pitch of p.pitching.arsenal) {
              if (pitch.name !== 'ストレート' && pitch.type !== 'straight') {
                pitch.level = clamp(pitch.level + randInt(10, 20), 5, 99);
              }
            }
          }
        }
      } else {
        const roll = Math.random();
        const boost = randInt(8, 15);
        if (roll < 0.25) {
          p.batting.meet = clamp(p.batting.meet + boost, 1, 99);
        } else if (roll < 0.50) {
          p.batting.power = clamp(p.batting.power + boost, 1, 99);
        } else if (roll < 0.75) {
          p.physical.speed = clamp(p.physical.speed + boost, 1, 99);
        } else {
          p.fielding.defense = clamp(p.fielding.defense + boost, 1, 99);
        }
      }
    }
  });

  const roster = [];
  const remaining = [...candidates];
  const maxPitchers = Math.max(6, Math.min(15, Math.round(rosterSize * 0.4)));
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

  // スター/プロ注目も含め制球上限を強制（通常cap + 8が絶対上限）
  const ctrlMax = controlCap + 8;
  roster.forEach(p => {
    if (p.position === 'pitcher') {
      p.pitching.control = Math.min(p.pitching.control, ctrlMax);
    }
    p.scoutComment = generateScoutComment(p);
  });
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

  // 大学リーグ初期化
  initializeUniversityLeagues(2024);

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

  // 大学リーグ初期化
  initializeUniversityLeagues(2024);
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
