// ============================================================
// 平行世界マネージャー
// 非ユーザーリーグの試合を日付進行に合わせて自動シミュレーション
// ============================================================

import { WORLD_DATA } from './worldData.js';
import { TEAMS_DATA } from '../teams-data.js';
import { autoSimulateGame } from '../game/autoSimulation.js';
import { simulateUniversityLeagueDate, getAllUniversityLeagues } from '../university/universityLeagueManager.js';

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

export { getAllUniversityLeagues };
