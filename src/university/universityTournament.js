// ============================================================
// 大学野球トーナメント
// 全日本大学野球選手権大会（6月）・明治神宮野球大会（11月）
// 各リーグ優勝チームによる全国大会
// ============================================================

import { WORLD_DATA } from '../corporate/worldData.js';
import { UNIVERSITY_TEAMS, UNIVERSITY_REGIONS } from './universityTeamsData.js';
import { TEAMS_DATA } from '../teams-data.js';
import {
  createBracket,
  recordResult,
  autoPlayBracket,
  simulateQuickMatch,
  assignMainTournamentDates,
  simulateBracketRoundOnDate,
  getRoundName,
} from '../corporate/toshitaikou.js';

// 全26リーグから優勝チームを取得（1部優勝チームのみ）
export function getLeagueChampions(seasonKey, userSeasonData = null) {
  const champions = [];
  const userRegion = WORLD_DATA.mode === 'university' ? WORLD_DATA.userLeagueId : null;

  for (const region of UNIVERSITY_REGIONS) {
    let champion = null;

    if (region.id === userRegion && userSeasonData) {
      const userDiv = WORLD_DATA.universityLeague?.userDivision || 1;
      if (!region.divisions || userDiv === 1) {
        // ユーザーが1部（または部制なし）: userSeasonData.standings から取得
        const standings = userSeasonData.standings;
        if (standings && standings.length > 0) {
          const sorted = [...standings].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
          champion = sorted[0].team;
        }
      } else {
        // ユーザーが2部以下: WORLD_DATA の1部standings から1部優勝チームを取得
        // 2部優勝チームは全日本・明治神宮大会に出場資格なし
        const league = WORLD_DATA.universityLeagues?.[region.id];
        const seasonData = league?.[seasonKey];
        if (seasonData?.standings1?.length > 0) {
          const sorted = [...seasonData.standings1].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
          champion = sorted[0].team;
        }
      }
    } else {
      // 他リーグ: WORLD_DATA から取得
      const league = WORLD_DATA.universityLeagues?.[region.id];
      if (!league) continue;
      const seasonData = league[seasonKey];
      if (!seasonData) continue;

      if (league.divisions) {
        // 東都: 1部の優勝チーム
        const standings = seasonData.standings1;
        if (standings && standings.length > 0) {
          const sorted = [...standings].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
          champion = sorted[0].team;
        }
      } else {
        const standings = seasonData.standings;
        if (standings && standings.length > 0) {
          const sorted = [...standings].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
          champion = sorted[0].team;
        }
      }
    }

    if (champion) {
      const teamDef = UNIVERSITY_TEAMS.find(t => t.name === champion);
      champions.push({
        name: champion,
        region: region.id,
        regionName: region.name,
        rank: teamDef?.rank || 'C',
        teamDef,
      });
    }
  }

  return champions;
}

// トーナメント用のteamDefsMapを作成
function buildTeamDefsMap(champions) {
  const map = {};
  for (const c of champions) {
    map[c.name] = {
      name: c.name,
      displayName: c.name,
      rank: c.rank,
      region: c.region,
      type: 'university',
    };
  }
  return map;
}

// 全日本大学野球選手権大会を生成（6月）
export function generateUniversityChampionship(userSeasonData, calendarYear = 2024) {
  const champions = getLeagueChampions('spring', userSeasonData);
  if (champions.length === 0) return null;

  const teamNames = champions.map(c => c.name);
  const teamDefsMap = buildTeamDefsMap(champions);

  // ランク順でシード（S→A→B→C→D）
  const RANK_ORDER = { S: 0, A: 1, B: 2, C: 3, D: 4 };
  teamNames.sort((a, b) => (RANK_ORDER[teamDefsMap[a].rank] || 4) - (RANK_ORDER[teamDefsMap[b].rank] || 4));

  const bracket = createBracket(teamNames);
  if (bracket) { bracket.achievementTournament = '全日本大学選手権'; bracket.achievementGameYear = calendarYear - 2023; }
  assignMainTournamentDates(bracket, { year: calendarYear, month: 6, day: 10 }, 4);

  const userRegion = WORLD_DATA.universityLeague?.userRegion;
  const userTeamName = WORLD_DATA.universityLeague?.userTeam;
  const userQualified = teamNames.includes(userTeamName);

  return {
    name: '全日本大学野球選手権大会',
    bracket,
    teams: champions,
    teamDefsMap,
    champion: null,
    runnerUp: null,
    phase: 'playing',
    userQualified,
  };
}

// 明治神宮野球大会を生成（11月）
export function generateMeijiJinguTournament(userSeasonData, calendarYear = 2024) {
  const champions = getLeagueChampions('fall', userSeasonData);
  if (champions.length === 0) return null;

  const teamNames = champions.map(c => c.name);
  const teamDefsMap = buildTeamDefsMap(champions);

  const RANK_ORDER = { S: 0, A: 1, B: 2, C: 3, D: 4 };
  teamNames.sort((a, b) => (RANK_ORDER[teamDefsMap[a].rank] || 4) - (RANK_ORDER[teamDefsMap[b].rank] || 4));

  const bracket = createBracket(teamNames);
  if (bracket) { bracket.achievementTournament = '明治神宮大会'; bracket.achievementGameYear = calendarYear - 2023; }
  assignMainTournamentDates(bracket, { year: calendarYear, month: 11, day: 10 }, 4);

  const userTeamName = WORLD_DATA.universityLeague?.userTeam;
  const userQualified = teamNames.includes(userTeamName);

  return {
    name: '明治神宮野球大会',
    bracket,
    teams: champions,
    teamDefsMap,
    champion: null,
    runnerUp: null,
    phase: 'playing',
    userQualified,
  };
}

// トーナメントを日付ベースで進行
export function simulateUniversityTournamentOnDate(tournament, dateObj, userTeamName = null) {
  if (!tournament || tournament.phase === 'done') return;
  const bracket = tournament.bracket;
  if (!bracket) return;

  simulateBracketRoundOnDate(bracket, tournament.teamDefsMap, dateObj, userTeamName);

  if (bracket.champion) {
    tournament.champion = bracket.champion;
    // 決勝の敗者を準優勝に
    const finalRound = bracket.rounds[bracket.rounds.length - 1];
    if (finalRound && finalRound[0]) {
      tournament.runnerUp = finalRound[0].loser;
    }
    tournament.phase = 'done';
  }
}

// トーナメントを全自動で消化
export function autoPlayUniversityTournament(tournament) {
  if (!tournament || tournament.phase === 'done') return;
  autoPlayBracket(tournament.bracket, tournament.teamDefsMap);
  if (tournament.bracket.champion) {
    tournament.champion = tournament.bracket.champion;
    const finalRound = tournament.bracket.rounds[tournament.bracket.rounds.length - 1];
    if (finalRound && finalRound[0]) {
      tournament.runnerUp = finalRound[0].loser;
    }
    tournament.phase = 'done';
  }
}

// ユーザーの試合を検出
export function getUserUniversityTournamentMatchOnDate(tournament, dateObj, userTeamName) {
  if (!tournament || tournament.phase === 'done' || !userTeamName) return null;
  const bracket = tournament.bracket;
  if (!bracket?.matchDates) return null;

  for (let r = 0; r < bracket.rounds.length; r++) {
    for (let m = 0; m < bracket.rounds[r].length; m++) {
      const match = bracket.rounds[r][m];
      if (match.winner || match.isBye) continue;
      if (match.team1 !== userTeamName && match.team2 !== userTeamName) continue;

      const matchDate = bracket.matchDates?.[r]?.[m];
      if (!matchDate) continue;
      if (matchDate.year === dateObj.year && matchDate.month === dateObj.month && matchDate.day === dateObj.day) {
        return { roundIdx: r, matchIdx: m, match, tournament };
      }
    }
  }
  return null;
}

// カレンダー表示用の日程リスト（ラウンド×日付で重複排除）
export function getUniversityTournamentDatesForCalendar(tournament, userTeamName) {
  if (!tournament?.bracket?.matchDates) return [];
  const dates = [];
  const bracket = tournament.bracket;
  const seen = new Set();

  for (let r = 0; r < bracket.rounds.length; r++) {
    for (let m = 0; m < bracket.rounds[r].length; m++) {
      const match = bracket.rounds[r][m];
      if (match.isBye) continue;
      const matchDate = bracket.matchDates?.[r]?.[m];
      if (!matchDate) continue;

      const isUserMatch = match.team1 === userTeamName || match.team2 === userTeamName;
      const roundName = getRoundName(bracket, r);
      const key = `${r}-${matchDate.month}-${matchDate.day}`;

      if (isUserMatch) {
        dates.push({
          date: matchDate,
          label: `${tournament.name} ${roundName}`,
          isUserMatch: true,
          done: !!match.winner,
          type: 'main',
        });
      } else if (!seen.has(key)) {
        seen.add(key);
        const allDone = bracket.rounds[r].every(mt => mt.isBye || !!mt.winner);
        dates.push({
          date: matchDate,
          label: `${tournament.name} ${roundName}`,
          isUserMatch: false,
          done: allDone,
          type: 'main',
        });
      }
    }
  }
  return dates;
}
