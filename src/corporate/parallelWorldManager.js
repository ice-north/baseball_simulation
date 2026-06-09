// ============================================================
// 平行世界マネージャー
// 非ユーザーリーグの試合を日付進行に合わせて自動シミュレーション
// ============================================================

import { WORLD_DATA } from './worldData.js';
import { TEAMS_DATA } from '../teams-data.js';
import { autoSimulateGame } from '../game/autoSimulation.js';
import { simulateUniversityLeagueDate, getAllUniversityLeagues } from '../university/universityLeagueManager.js';
import { INDEPENDENT_LEAGUES } from './independentLeagueData.js';

const getScheduleByDateForLeague = (schedule, date) => {
  if (!schedule || !date) return [];
  return schedule.filter(g =>
    g.date?.year === date.year &&
    g.date?.month === date.month &&
    g.date?.day === date.day &&
    !g.result
  );
};

const updateLeagueStandings = (standings, homeTeam, awayTeam, homeScore, awayScore) => {
  const standingHome = standings.find(s => s.team === homeTeam);
  const standingAway = standings.find(s => s.team === awayTeam);
  if (!standingHome || !standingAway) return;

  standingHome.gamesPlayed++;
  standingAway.gamesPlayed++;

  if (homeScore > awayScore) {
    standingHome.wins++;
    standingAway.losses++;
  } else if (awayScore > homeScore) {
    standingAway.wins++;
    standingHome.losses++;
  } else {
    standingHome.draws = (standingHome.draws || 0) + 1;
    standingAway.draws = (standingAway.draws || 0) + 1;
  }

  standingHome.winRate = standingHome.gamesPlayed > 0 ? standingHome.wins / standingHome.gamesPlayed : 0;
  standingAway.winRate = standingAway.gamesPlayed > 0 ? standingAway.wins / standingAway.gamesPlayed : 0;

  standings.sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
};

export const simulateParallelWorldDate = (currentDate) => {
  if (!WORLD_DATA.initialized) return;

  // 大学リーグ
  if (WORLD_DATA.universityLeagues && Object.keys(WORLD_DATA.universityLeagues).length > 0) {
    simulateUniversityLeagueDate(currentDate);
  }

  for (const [leagueId, leagueData] of Object.entries(WORLD_DATA.independentLeagues)) {
    if (!leagueData || !leagueData.schedule) continue;

    const gamesToday = getScheduleByDateForLeague(leagueData.schedule, currentDate);
    for (const game of gamesToday) {
      const homeTeam = TEAMS_DATA[game.home];
      const awayTeam = TEAMS_DATA[game.away];
      if (!homeTeam || !awayTeam) continue;

      const result = autoSimulateGame(game.home, game.away);
      game.result = {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        winner: result.winner,
      };

      updateLeagueStandings(leagueData.standings, game.home, game.away, result.homeScore, result.awayScore);

      if (!leagueData.results) leagueData.results = [];
      leagueData.results.push({
        date: { ...currentDate },
        home: game.home,
        away: game.away,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        winner: result.winner,
      });
    }
  }
};

export const getParallelLeagueStandings = (leagueId) => {
  const league = WORLD_DATA.independentLeagues?.[leagueId];
  return league?.standings || [];
};

export const getParallelLeagueResults = (leagueId, limit = 10) => {
  const league = WORLD_DATA.independentLeagues?.[leagueId];
  if (!league?.results) return [];
  return league.results.slice(-limit);
};

export const getAllParallelLeagues = () => {
  if (!WORLD_DATA.initialized) return [];
  return Object.entries(WORLD_DATA.independentLeagues)
    .filter(([, data]) => data != null)
    .map(([id, data]) => ({
      id,
      name: data.name,
      teams: data.teams,
      standings: data.standings,
      gamesPlayed: data.standings?.reduce((sum, s) => sum + (s.gamesPlayed || 0), 0) / Math.max(1, data.teams?.length || 1),
    }));
};

// ============================================================
// グランドチャンピオンシップ
// 各独立リーグの1位チームによるトーナメント（9月末〜10月初）
// ============================================================

export const generateGrandChampionship = (userLeagueId, userStandings) => {
  const champions = [];

  // ユーザーのリーグの1位
  if (userStandings && userStandings.length > 0) {
    const sorted = [...userStandings].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
    champions.push({ team: sorted[0].team, league: userLeagueId });
  }

  // 他リーグの1位
  for (const [leagueId, leagueData] of Object.entries(WORLD_DATA.independentLeagues)) {
    if (!leagueData?.standings || leagueData.standings.length === 0) continue;
    const sorted = [...leagueData.standings].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
    champions.push({ team: sorted[0].team, league: leagueId });
  }

  if (champions.length < 2) return null;

  const teamNames = champions.map(c => c.team);
  const size = Math.pow(2, Math.ceil(Math.log2(teamNames.length)));
  const rounds = [];
  const numRounds = Math.log2(size);

  for (let r = 0; r < numRounds; r++) {
    const matchCount = size / Math.pow(2, r + 1);
    rounds.push(Array.from({ length: matchCount }, () => ({
      team1: null, team2: null, winner: null, score: null, isBye: false,
    })));
  }

  for (let i = 0; i < size; i++) {
    const matchIdx = Math.floor(i / 2);
    if (i % 2 === 0) rounds[0][matchIdx].team1 = teamNames[i] || null;
    else rounds[0][matchIdx].team2 = teamNames[i] || null;
  }

  // BYE処理
  for (const match of rounds[0]) {
    if (match.team1 && !match.team2) {
      match.winner = match.team1;
      match.isBye = true;
      advanceWinner(rounds, 0, rounds[0].indexOf(match), match.team1);
    } else if (!match.team1 && match.team2) {
      match.winner = match.team2;
      match.isBye = true;
      advanceWinner(rounds, 0, rounds[0].indexOf(match), match.team2);
    }
  }

  return {
    champions,
    bracket: { size, teamCount: teamNames.length, rounds, champion: null, runnerUp: null },
    generated: true,
    done: false,
  };
};

function advanceWinner(rounds, roundIdx, matchIdx, winner) {
  const nextRound = roundIdx + 1;
  if (nextRound >= rounds.length) return;
  const nextMatchIdx = Math.floor(matchIdx / 2);
  if (matchIdx % 2 === 0) rounds[nextRound][nextMatchIdx].team1 = winner;
  else rounds[nextRound][nextMatchIdx].team2 = winner;
}

export const autoPlayGrandChampionship = (gc) => {
  if (!gc?.bracket) return;
  const { rounds } = gc.bracket;

  for (let r = 0; r < rounds.length; r++) {
    for (let m = 0; m < rounds[r].length; m++) {
      const match = rounds[r][m];
      if (match.winner || !match.team1 || !match.team2) continue;

      const home = TEAMS_DATA[match.team1];
      const away = TEAMS_DATA[match.team2];
      if (home && away) {
        const result = autoSimulateGame(match.team1, match.team2);
        match.winner = result.winner;
        match.score = `${result.homeScore}-${result.awayScore}`;
      } else {
        match.winner = match.team1;
        match.score = 'W/O';
      }

      advanceWinner(rounds, r, m, match.winner);

      if (r === rounds.length - 1) {
        gc.bracket.champion = match.winner;
        gc.bracket.runnerUp = match.winner === match.team1 ? match.team2 : match.team1;
        gc.done = true;
      }
    }
  }
};

export { getAllUniversityLeagues };
