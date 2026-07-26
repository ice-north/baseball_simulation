// ============================================================
// 監督移籍システム - src/game/managerTransfer.js
//
// 年度末に、プレイヤー（監督）が別カテゴリのチームへ移籍できるようにする。
// 大学 → 社会人 → 独立リーグ、のようにカテゴリを跨いだ監督キャリアを実現する。
//
// 【なぜ実現できるか】
// 本ゲームはどのモードで開始しても TEAMS_DATA に全カテゴリ（独立・社会人300・大学234）が
// 生成され、選手プール（高校生・大学・リリース）も共有された「1つの日本球界」になっている。
// モードの違いは実質「どのチームを操作し、どのカレンダー/スケジュールで進行するか」だけ。
// したがって移籍とは、操作対象チームと進行設定を差し替える操作に他ならない。
//
// 【差し替える4点】
//   1. leagueConfig（App.jsx が userTeamName = allTeams[0] として参照する）
//   2. seasonData.settings（カテゴリ別のカレンダー・対戦相手・試合数）
//   3. WORLD_DATA.mode / userLeagueId（+ 独立リーグは並行世界の入替）
//   4. gameMode（画面ルーティング）
// ============================================================

import { TEAMS_DATA } from '../teams-data.js';
import { WORLD_DATA } from '../corporate/worldData.js';
import { INDEPENDENT_LEAGUES } from '../corporate/independentLeagueData.js';
import { UNIVERSITY_REGIONS } from '../university/universityTeamsData.js';
import { generateFullSeasonSchedule } from '../season/scheduleGenerator.js';
import { initializeStandings } from '../season/seasonManager.js';

/** チームがどのカテゴリに属するかを判定する */
export const getTeamCategory = (teamName) => {
  const team = TEAMS_DATA[teamName];
  if (!team) return null;
  if (team.universityData || team.universityTeamId) return 'university';
  if (team.independentLeagueId) return 'independent';
  if (team.corporateData) return team.corporateData.type === 'club' ? 'club' : 'corporate';
  return null;
};

export const CATEGORY_LABEL = {
  university: '大学',
  corporate: '社会人',
  club: 'クラブ',
  independent: '独立リーグ',
};

/** 移籍可能なチーム一覧をカテゴリ別に返す（現在のチームは除く） */
export const getTransferCandidates = (currentTeamName) => {
  const groups = { university: [], corporate: [], club: [], independent: [] };
  for (const [name, team] of Object.entries(TEAMS_DATA)) {
    if (name === currentTeamName) continue;
    if (!team?.players?.length) continue;
    const cat = getTeamCategory(name);
    if (!cat || !groups[cat]) continue;
    const data = team.universityData || team.corporateData || {};
    groups[cat].push({
      name,
      rank: data.rank || 'C',
      reputation: Math.round(data.reputation ?? 0),
      rosterSize: team.players.length,
      leagueId: team.independentLeagueId || data.region || null,
      leagueName: team.independentLeagueId
        ? (INDEPENDENT_LEAGUES[team.independentLeagueId]?.name || '独立リーグ')
        : (team.universityData
          ? (UNIVERSITY_REGIONS.find(r => r.id === team.universityData.region)?.name || '大学リーグ')
          : (team.corporateData?.region || '社会人')),
    });
  }
  const RANK_ORDER = { S: 0, A: 1, B: 2, C: 3, D: 4 };
  Object.values(groups).forEach(list =>
    list.sort((a, b) => (RANK_ORDER[a.rank] - RANK_ORDER[b.rank]) || b.reputation - a.reputation)
  );
  return groups;
};

// --- カテゴリ別に「新しい進行設定」を組み立てる ---

const buildIndependentSetup = (teamName, calendarYear) => {
  const leagueId = TEAMS_DATA[teamName].independentLeagueId;
  const leagueDef = INDEPENDENT_LEAGUES[leagueId];
  // 並行世界に登録済みの名簿があれば優先（昇降格や増減が反映されているため）
  const parallel = WORLD_DATA.independentLeagues?.[leagueId];
  const teamNames = parallel?.teams?.length
    ? [...parallel.teams]
    : (leagueDef?.teams || []).map(t => t.name).filter(n => TEAMS_DATA[n]);
  if (!teamNames.includes(teamName)) teamNames.unshift(teamName);
  // ユーザーチームを先頭へ（App.jsx が allTeams[0] を自チームとして扱う）
  const ordered = [teamName, ...teamNames.filter(n => n !== teamName)];

  const gamesPerSeason = leagueDef?.gamesPerSeason || 60;
  const leagueFormat = leagueDef?.leagueFormat || 'single';
  // 翌年のスケジュール・順位表は年度進行（レギュレーション確認画面）が
  // settings.teamNames から生成するため、ここでは作らない。

  return {
    gameMode: 'normal',
    leagueConfig: {
      format: leagueFormat,
      teamsPerLeague: ordered.length,
      leagues: [{ name: leagueDef?.name || '独立リーグ', teams: ordered }],
    },
    settings: {
      teamsCount: ordered.length,
      teamNames: ordered,
      teamAbbreviations: ordered.map(n => TEAMS_DATA[n]?.abbreviation || n.slice(0, 3)),
      gamesPerSeason,
      useDH: leagueDef?.useDH || false,
      leagueFormat,
      leagueNames: leagueDef?.leagueNames || null,
      playoffFormat: leagueDef?.playoffFormat || 'short',
      maxExtraInnings: 12,
      preset: leagueId,
      leagueName: leagueDef?.name || '独立リーグ',
    },
    worldMode: 'independent',
    userLeagueId: leagueId,
  };
};

const buildCorporateSetup = (teamName) => {
  const team = TEAMS_DATA[teamName];
  const isClub = team.corporateData?.type === 'club';
  const allCorporateTeamNames = Object.keys(TEAMS_DATA).filter(n => {
    const t = TEAMS_DATA[n];
    return t?.corporateData && !t.independentLeagueId && !t.universityData;
  });
  return {
    gameMode: 'corporate',
    leagueConfig: {
      format: 'tournament',
      teamsPerLeague: allCorporateTeamNames.length,
      leagues: [{ name: isClub ? 'クラブ野球' : '社会人野球', teams: [teamName] }],
    },
    settings: {
      teamsCount: allCorporateTeamNames.length,
      teamNames: [teamName],
      teamAbbreviations: [team.abbreviation || teamName.slice(0, 3)],
      gamesPerSeason: 0,
      useDH: true,
      leagueFormat: 'tournament',
      corporateMode: true,
      clubMode: isClub,
      corporateTeamId: team.corporateTeamId || null,
      allCorporateTeamNames,
    },
    worldMode: 'corporate',
    userLeagueId: 'corporate',
  };
};

const buildUniversitySetup = (teamName) => {
  const team = TEAMS_DATA[teamName];
  const region = team.universityData?.region;
  const league = WORLD_DATA.universityLeagues?.[region];
  const numDivisions = league?.numDivisions || (league?.divisions ? 2 : 1);

  // 移籍先が所属する部を特定する（部制リーグは同じ部のチームだけが対戦相手）
  let userDivision = 1;
  let divTeams = league?.divTeams?.[1] || [];
  if (league?.divTeams) {
    for (let d = 1; d <= numDivisions; d++) {
      if (league.divTeams[d]?.includes(teamName)) { userDivision = d; divTeams = league.divTeams[d]; break; }
    }
  }
  if (!divTeams?.length) {
    divTeams = Object.keys(TEAMS_DATA).filter(n => TEAMS_DATA[n]?.universityData?.region === region);
  }
  const ordered = [teamName, ...divTeams.filter(n => n !== teamName)];

  // WORLD_DATA のユーザー大学情報を更新してからスケジュール・順位表を取得する
  WORLD_DATA.universityLeague = {
    userTeam: teamName,
    userRegion: region,
    userDivision,
    numDivisions,
    leagueTeams: ordered,
  };
  const regionName = UNIVERSITY_REGIONS.find(r => r.id === region)?.name || '大学リーグ';

  return {
    gameMode: 'university',
    leagueConfig: {
      format: 'single',
      teamsPerLeague: ordered.length,
      leagues: [{ name: regionName + (numDivisions >= 2 ? ` ${userDivision}部` : ''), teams: ordered }],
    },
    settings: {
      teamsCount: ordered.length,
      teamNames: ordered,
      teamAbbreviations: ordered.map(n => TEAMS_DATA[n]?.abbreviation || n.slice(0, 3)),
      gamesPerSeason: 30,
      useDH: false,
      leagueFormat: 'single',
      universityMode: true,
      universityTeamId: team.universityTeamId || team.universityData?.id || null,
      universityRegion: region,
    },
    worldMode: 'university',
    userLeagueId: region,
  };
};

/**
 * 監督を別チームへ移籍させる。年度末（オフシーズン）に呼ぶこと。
 *
 * @param {string} targetTeamName 移籍先チーム名
 * @param {Object} ctx { seasonData, setSeasonData, setLeagueConfig, setGameMode, setSelectedMonth }
 * @returns {Object} { success, error?, category, from, to }
 */
export const transferManagerTo = (targetTeamName, ctx) => {
  const { seasonData, setSeasonData, setLeagueConfig, setGameMode, setSelectedMonth } = ctx || {};
  const target = TEAMS_DATA[targetTeamName];
  if (!target) return { success: false, error: 'チームが見つかりません' };

  const category = getTeamCategory(targetTeamName);
  if (!category) return { success: false, error: '移籍できないチームです' };

  const fromTeamName = seasonData?.settings?.teamNames?.[0] || null;
  if (fromTeamName === targetTeamName) return { success: false, error: '既にそのチームの監督です' };

  // 翌年の暦年（オフシーズンで移籍 → 翌シーズンから指揮）
  const nextYear = (seasonData?.year || 1) + 1;
  const calendarYear = 2024 + nextYear - 1;

  let setup;
  try {
    if (category === 'independent') setup = buildIndependentSetup(targetTeamName, calendarYear);
    else if (category === 'university') setup = buildUniversitySetup(targetTeamName);
    else setup = buildCorporateSetup(targetTeamName);
  } catch (e) {
    return { success: false, error: `移籍先の設定生成に失敗しました: ${e.message}` };
  }

  // --- 独立リーグの並行世界を入れ替える ---
  // 旧・自リーグは背景シミュレーションへ戻し、新・自リーグは自分で消化するため外す。
  const prevLeagueId = WORLD_DATA.userLeagueId;
  const prevWasIndependent = !seasonData?.settings?.corporateMode && !seasonData?.settings?.universityMode;
  if (!WORLD_DATA.independentLeagues) WORLD_DATA.independentLeagues = {};
  if (prevWasIndependent && prevLeagueId && fromTeamName) {
    const prevTeams = seasonData?.settings?.teamNames || [];
    if (prevTeams.length > 0 && !WORLD_DATA.independentLeagues[prevLeagueId]) {
      const prevDef = INDEPENDENT_LEAGUES[prevLeagueId];
      WORLD_DATA.independentLeagues[prevLeagueId] = {
        name: prevDef?.name || seasonData?.settings?.leagueName || '独立リーグ',
        teams: [...prevTeams],
        // プリセット定義が無いカスタムリーグでも翌年以降スケジュールを再生成できるよう、
        // レギュレーションを控えておく（resetIndependentLeagueSchedules が参照する）
        regulation: {
          gamesPerSeason: seasonData?.settings?.gamesPerSeason || 60,
          leagueFormat: seasonData?.settings?.leagueFormat || 'single',
          leagueNames: seasonData?.settings?.leagueNames || null,
        },
        schedule: generateFullSeasonSchedule({
          teams: prevTeams,
          gamesPerSeason: seasonData?.settings?.gamesPerSeason || 60,
          startDate: { year: calendarYear, month: 4, day: 1 },
          endDate: { year: calendarYear, month: 9, day: 30 },
          leagueFormat: seasonData?.settings?.leagueFormat || 'single',
          leagueNames: seasonData?.settings?.leagueNames,
        }),
        standings: initializeStandings(prevTeams),
        results: [],
      };
    }
  }
  if (category === 'independent' && WORLD_DATA.independentLeagues[setup.userLeagueId]) {
    delete WORLD_DATA.independentLeagues[setup.userLeagueId];
  }

  // --- WORLD_DATA を更新 ---
  WORLD_DATA.mode = setup.worldMode;
  WORLD_DATA.userLeagueId = setup.userLeagueId;
  if (setup.worldMode !== 'university') WORLD_DATA.universityLeague = WORLD_DATA.universityLeague || null;
  WORLD_DATA.corporateLeague = WORLD_DATA.corporateLeague || { teams: {}, userTeam: null };
  WORLD_DATA.corporateLeague.userTeam = setup.worldMode === 'corporate' ? targetTeamName : null;
  // 大会類は新シーズンで作り直す
  WORLD_DATA._universityScout = null;

  // --- 監督キャリア履歴を記録 ---
  if (!Array.isArray(WORLD_DATA.managerCareer)) WORLD_DATA.managerCareer = [];
  WORLD_DATA.managerCareer.push({
    year: seasonData?.year || 1,
    from: fromTeamName,
    to: targetTeamName,
    category,
    categoryLabel: CATEGORY_LABEL[category] || category,
  });

  // --- React state を差し替え ---
  setLeagueConfig?.(setup.leagueConfig);
  setGameMode?.(setup.gameMode);
  // settings（＝所属カテゴリ・対戦相手）のみ差し替える。
  // 完了したシーズンの standings / results / 大会結果はそのまま残す:
  //   - オフシーズン画面が今季成績を表示し、年鑑にも記録するため
  //   - 翌年のスケジュール・順位表は advanceToNextYear が settings から再生成するため
  setSeasonData?.(prev => ({
    ...prev,
    settings: setup.settings,
    _managerTransferredFrom: fromTeamName,
  }));
  setSelectedMonth?.(4);

  return { success: true, category, from: fromTeamName, to: targetTeamName };
};
