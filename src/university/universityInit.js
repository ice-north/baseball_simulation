// ============================================================
// 大学モード初期化
// ユーザーのリーグ全チームにロスターを生成し、TEAMS_DATAに配置
// ============================================================

import { TEAMS_DATA, clearReleasedPlayersPool, initializeAllPitchingRotations } from '../teams-data.js';
import { WORLD_DATA, initializeWorld } from '../corporate/worldData.js';
import { UNIVERSITY_TEAMS, UNIVERSITY_REGIONS } from './universityTeamsData.js';
import { initializeUniversityLeagues } from './universityLeagueManager.js';
import { generateCorporateRoster, initializeCorporateParallelWorld } from '../corporate/corporateInit.js';
import { seedInitialUniversityClasses, warmUpPlayerPipeline, clearUniversityPool, clearHighSchoolPool } from '../season/universityPool.js';

// 大学チームの学年あたり人数（1〜4年生 × 人数 = 総在籍数）
const UNI_PLAYERS_PER_GRADE = { S: 14, A: 12, B: 10, C: 8, D: 6 };

// プレイヤーチームの最大ロスター人数
const USER_TEAM_MAX_ROSTER = 60;

// 大学チーム用の能力キャップ（社会人より低め、高校生ベース+成長）
const UNI_VELOCITY_CAP = { S: 150, A: 148, B: 143, C: 136, D: 130 };
const UNI_CONTROL_CAP = { S: 72, A: 66, B: 58, C: 48, D: 38 };
const UNI_BATTING_CAP = { S: 68, A: 62, B: 55, C: 47, D: 40 };

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// ユーザーチームのベンチ登録選手を初期化（投手10名+野手15名=25名）
const BENCH_LIMIT = 25;
// 必須確保ポジション（各1名以上）
const REQUIRED_POSITIONS = ['catcher', 'short', 'second', 'third', 'first', 'left', 'center', 'right'];
const initializeActiveRoster = (players) => {
  players.forEach(p => { p.isActive = false; });
  const score = (p) => p.position === 'pitcher'
    ? (p.pitching?.velocity || 0) * 0.4 + (p.pitching?.control || 0) * 0.35 + (p.pitching?.stamina || 0) * 0.25
    : (p.batting?.meet || 0) * 0.4 + (p.batting?.power || 0) * 0.25 + (p.fielding?.defense || 0) * 0.2 + (p.physical?.speed || 0) * 0.15;
  const pitchers = [...players.filter(p => p.position === 'pitcher')].sort((a, b) => score(b) - score(a));
  const fielders = [...players.filter(p => p.position !== 'pitcher')].sort((a, b) => score(b) - score(a));
  const pitcherSlots = Math.round(BENCH_LIMIT * 0.4); // 10
  const fielderSlots = BENCH_LIMIT - pitcherSlots;    // 15

  // 必須ポジションを1名ずつ確保してから残りをスコア順
  const activated = new Set();
  for (const pos of REQUIRED_POSITIONS) {
    if (activated.size >= fielderSlots) break;
    const best = fielders.find(p => p.position === pos && !activated.has(p.id));
    if (best) { best.isActive = true; activated.add(best.id); }
  }
  // 残り野手枠はスコア順
  for (const p of fielders) {
    if (activated.size >= fielderSlots) break;
    if (!activated.has(p.id)) { p.isActive = true; activated.add(p.id); }
  }
  pitchers.slice(0, pitcherSlots).forEach(p => { p.isActive = true; });
};

const makeAbbreviation = (name) => {
  if (name.length <= 3) return name;
  return name.slice(0, 3);
};

// 大学生の年齢分布（18-21歳、1-4年生）
// ※オフシーズンにupdateAllPlayerAgesで+1されるため、初期値は-1した値を設定
const assignUniversityAge = (player) => {
  const roll = Math.random();
  if (roll < 0.25) player.age = 18;       // 1年生
  else if (roll < 0.50) player.age = 19;  // 2年生
  else if (roll < 0.75) player.age = 20;  // 3年生
  else player.age = 21;                   // 4年生
};

// 大学チームのロスターを生成（学年別人数を均等に配分）
const generateUniversityRoster = (teamDef, isUserTeam = false) => {
  const rank = teamDef.rank || 'C';
  const velCap = UNI_VELOCITY_CAP[rank] || 140;
  const ctrlCap = UNI_CONTROL_CAP[rank] || 50;
  const batCap = UNI_BATTING_CAP[rank] || 50;

  const perGrade = UNI_PLAYERS_PER_GRADE[rank] || 8;
  const totalSize = isUserTeam
    ? Math.min(perGrade * 4, USER_TEAM_MAX_ROSTER)
    : perGrade * 4;

  // corporateInitのgenerateRosterを流用してベースを作成（サイズ指定）
  const fakeDef = {
    ...teamDef,
    type: 'corporate',
    id: `uni_${teamDef.id}`,
  };
  const roster = generateCorporateRoster(fakeDef, 1, totalSize);

  // 大学生用に年齢・能力を調整し、学年を均等に配分
  roster.forEach((p, i) => {
    // 学年を均等配分: grade 1〜4 を繰り返す
    const grade = (i % 4) + 1;
    p.age = 17 + grade; // 1年生=18歳、2年生=19歳、3年生=20歳、4年生=21歳（オフシーズンに+1されて卒業判定）

    // 大学生らしい能力レンジに調整（ソフトキャップ）
    if (p.position === 'pitcher') {
      if (p.pitching.velocity > velCap) {
        const excess = p.pitching.velocity - velCap;
        p.pitching.velocity = velCap + Math.round(excess * 0.3);
      }
      if (p.pitching.control > ctrlCap) {
        const excess = p.pitching.control - ctrlCap;
        p.pitching.control = ctrlCap + Math.round(excess * 0.3);
      }
    }
    p.batting.meet = Math.min(p.batting.meet, batCap + randInt(0, 5));
    p.batting.power = Math.min(p.batting.power, batCap + randInt(0, 5));
    p.batting.eye = Math.min(p.batting.eye, batCap + randInt(0, 3));

    p.careerHistory = [
      { type: 'highschool', label: '高校卒' },
      { type: 'university', year: 1, label: teamDef.name },
    ];

    // 大学モード専用フラグ
    p.universityTeamId = teamDef.id;
    p.universityTeamName = teamDef.name;
    p.universityYear = grade;
  });

  return roster;
};

// ============================================================
// 大学モードの完全初期化
// ============================================================

export const initializeUniversityGame = (teamDef) => {
  initializeWorld('university', teamDef.region);
  Object.keys(TEAMS_DATA).forEach(key => delete TEAMS_DATA[key]);
  clearReleasedPlayersPool();
  clearUniversityPool();
  clearHighSchoolPool();

  const userTeamName = teamDef.name;
  const userRegion = teamDef.region;
  const allTeamNames = [];
  let userRoster = null;

  // ユーザーのリーグの全チームを取得
  const leagueTeams = UNIVERSITY_TEAMS.filter(t => t.region === userRegion);
  const regionDef = UNIVERSITY_REGIONS.find(r => r.id === userRegion);
  const numDivisions = regionDef?.divisions || 1;

  // 部制の場合、ユーザーが所属する部を判定
  let userDivision = 1;
  if (numDivisions >= 2) {
    const perDiv = Math.floor(leagueTeams.length / numDivisions);
    const userIdx = leagueTeams.findIndex(t => t.name === userTeamName);
    userDivision = Math.floor(userIdx / perDiv) + 1;
    if (userDivision > numDivisions) userDivision = numDivisions;
  }

  const createTeamEntry = (def) => {
    const name = def.name;
    const roster = generateUniversityRoster(def);
    TEAMS_DATA[name] = {
      name,
      abbreviation: makeAbbreviation(name),
      players: roster,
      pitchingRotation: null,
      universityTeamId: def.id,
      universityData: {
        rank: def.rank,
        region: def.region,
        budget: def.budget,
        leagueName: UNIVERSITY_REGIONS.find(r => r.id === def.region)?.name || '',
        reputation: { S: 85, A: 65, B: 40, C: 20, D: 5 }[def.rank] || 20,
        proDraftCount: 0,
        tournamentWins: 0,
      },
    };
    return roster;
  };

  // ユーザーチームを最初に追加（最大60人制限あり）
  const userDef = leagueTeams.find(d => d.name === userTeamName);
  if (userDef) {
    const roster = generateUniversityRoster(userDef, true);
    // ベンチ登録選手を初期化: 投手10名+野手15名=25名をアクティブに
    initializeActiveRoster(roster);
    TEAMS_DATA[userDef.name] = {
      name: userDef.name,
      abbreviation: makeAbbreviation(userDef.name),
      players: roster,
      pitchingRotation: null,
      universityTeamId: userDef.id,
      universityData: {
        rank: userDef.rank,
        region: userDef.region,
        budget: userDef.budget,
        leagueName: UNIVERSITY_REGIONS.find(r => r.id === userDef.region)?.name || '',
        reputation: { S: 85, A: 65, B: 40, C: 20, D: 5 }[userDef.rank] || 20,
        proDraftCount: 0,
        tournamentWins: 0,
      },
    };
    userRoster = roster;
  }

  // 同リーグの全チームをTEAMS_DATAに追加（部制でも全チーム生成）
  for (const def of leagueTeams) {
    if (TEAMS_DATA[def.name]) continue;
    createTeamEntry(def);
  }

  // 部制の場合、ユーザーの部のチーム名のみをallTeamNamesに
  if (numDivisions >= 2) {
    const perDiv = Math.floor(leagueTeams.length / numDivisions);
    const divTeams = leagueTeams.slice((userDivision - 1) * perDiv, userDivision * perDiv);
    divTeams.forEach(t => allTeamNames.push(t.name));
  } else {
    leagueTeams.forEach(t => allTeamNames.push(t.name));
  }
  // ユーザーチームを先頭に移動（App.jsxが allTeams[0] をユーザーチームとして使うため）
  const userNameIdx = allTeamNames.indexOf(userTeamName);
  if (userNameIdx > 0) {
    allTeamNames.splice(userNameIdx, 1);
    allTeamNames.unshift(userTeamName);
  }

  // 大学リーグ初期化（全16リーグ）
  initializeUniversityLeagues(2024);

  // パイプラインウォームアップ（他リーグの大学生 + 社会人補充）
  warmUpPlayerPipeline(1);

  // 社会人チーム＋独立リーグも並行世界として生成
  initializeCorporateWorldForUniversity();

  // 全チームの投手ローテーション初期化
  initializeAllPitchingRotations();

  // WORLD_DATA に大学リーグ情報を設定
  WORLD_DATA.universityLeague = {
    userTeam: userTeamName,
    userRegion,
    userDivision,
    numDivisions,
    leagueTeams: allTeamNames,
  };

  const divLabel = numDivisions >= 2 ? ` ${userDivision}部` : '';
  return {
    userTeamName,
    allTeamNames,
    roster: userRoster,
    leagueName: (UNIVERSITY_REGIONS.find(r => r.id === userRegion)?.name || '') + divLabel,
    userDivision,
    numDivisions,
  };
};

// 社会人・独立リーグを並行世界として生成（大学モード用）
const initializeCorporateWorldForUniversity = () => {
  initializeCorporateParallelWorld(Object.keys(TEAMS_DATA));
};

// ユーザーのリーグスケジュールをseasonData.schedule形式で取得
export const getUniversityLeagueSchedule = (regionId) => {
  const league = WORLD_DATA.universityLeagues?.[regionId];
  if (!league) return [];

  const schedule = [];
  let idCounter = 0;

  // 部制の場合、ユーザーの部のチーム名セットでフィルタ
  const userDiv = WORLD_DATA.universityLeague?.userDivision || 1;
  const divTeamSet = (league.divisions && league.divTeams?.[userDiv])
    ? new Set(league.divTeams[userDiv])
    : null;

  for (const seasonKey of ['spring', 'fall']) {
    const seasonData = league[seasonKey];
    if (!seasonData?.schedule) continue;
    for (const game of seasonData.schedule) {
      if (divTeamSet && !divTeamSet.has(game.home)) continue;
      schedule.push({
        id: idCounter++,
        date: { ...game.date },
        home: game.home,
        away: game.away,
        result: game.result || null,
        season: game.season,
      });
    }
  }

  return schedule;
};

// 春季入替後の新divTeamsでユーザーの秋季スケジュールを取得
export const getUserFallSchedule = (regionId) => {
  const league = WORLD_DATA.universityLeagues?.[regionId];
  if (!league?.fall?.schedule) return [];
  const userDiv = WORLD_DATA.universityLeague?.userDivision || 1;
  const divTeamSet = (league.divisions && league.divTeams?.[userDiv])
    ? new Set(league.divTeams[userDiv])
    : null;
  return league.fall.schedule
    .filter(g => !divTeamSet || divTeamSet.has(g.home))
    .map((g, i) => ({ id: i, date: { ...g.date }, home: g.home, away: g.away, result: null, season: 'fall' }));
};

// ユーザーリーグの順位表を初期化（部制の場合はユーザーの部のみ）
export const getUniversityLeagueStandings = (regionId, teamNames) => {
  const league = WORLD_DATA.universityLeagues?.[regionId];
  const userDiv = WORLD_DATA.universityLeague?.userDivision || 1;

  // 部制の場合、ユーザーの部のチームのみ
  let filteredNames = teamNames;
  if (league?.divisions && league.divTeams?.[userDiv]) {
    const divSet = new Set(league.divTeams[userDiv]);
    filteredNames = teamNames.filter(n => divSet.has(n));
  }

  return filteredNames.map(name => ({
    team: name,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0,
    gamesPlayed: 0,
  }));
};
