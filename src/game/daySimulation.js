// 当日の実試合・順位・成績の記録。UIとサーバーで同じ経路を使う。
import { TEAMS_DATA } from '../teams-data.js';
import { SEASON_PHASES, updatePlayoffProgress } from '../season/seasonManager.js';
import { getScheduleByDate } from '../season/scheduleGenerator.js';
import { autoSimulateGame } from './autoSimulation.js';
import { scheduledGameSeed } from './rng.js';
import { decisionsFromResult } from './pitcherDecisions.js';

export const simulateScheduledGamesOnDate = (sData, recording = null) => {
  const gamesOnDate = getScheduleByDate(sData.schedule, sData.currentDate);
  if (gamesOnDate.length === 0) return { data: sData, results: [] };
  let updatedSchedule = [...sData.schedule];
  const scheduleIndexById = new Map(sData.schedule.map((game, index) => [game.id, index]));
  let updatedStandings = sData.standings.map(entry => ({ ...entry }));
  let updatedResults = [...sData.results];
  const gameResults = [];
  gamesOnDate.forEach(game => {
    if (game.result) return;
    const homeTeam = TEAMS_DATA[game.home];
    const awayTeam = TEAMS_DATA[game.away];
    if (!homeTeam || !awayTeam) return;
    const seed = scheduledGameSeed(game);
    const observer = recording?.begin(game);
    const result = autoSimulateGame(game.home, game.away, false, seed, observer);
    recording?.finish(game, result, observer);
    const decisions = result.decisions || decisionsFromResult(result);
    const isHomeWin = result.homeScore > result.awayScore;
    // 記録は autoSimulateGame が済ませている（二重に積まない）
    const scheduleIndex = scheduleIndexById.get(game.id) ?? -1;
    const decisionsForDisplay = {
      winningPitcher: decisions.winningPitcher ? { id: decisions.winningPitcher.id, name: decisions.winningPitcher.name } : null,
      losingPitcher: decisions.losingPitcher ? { id: decisions.losingPitcher.id, name: decisions.losingPitcher.name } : null,
      savePitcher: decisions.savePitcher ? { id: decisions.savePitcher.id, name: decisions.savePitcher.name } : null,
      holdPitchers: decisions.holdPitchers.map(p => ({ id: p.id, name: p.name }))
    };
    const resultWithChanges = { ...result, pitcherChanges: result.pitcherChanges || [], decisions: decisionsForDisplay };
    if (scheduleIndex !== -1) updatedSchedule[scheduleIndex] = { ...game, rngSeed: seed, result: resultWithChanges };
    gameResults.push({ gameId: game.id, home: game.home, away: game.away, homeScore: result.homeScore, awayScore: result.awayScore, winner: result.winner, decisions, pitcherChanges: result.pitcherChanges || [] });
    updatedResults.push({ gameId: game.id, date: { ...sData.currentDate }, home: game.home, away: game.away, result: resultWithChanges });
    const standingHome = updatedStandings.find(s => s.team === game.home);
    const standingAway = updatedStandings.find(s => s.team === game.away);
    if (game.phase !== SEASON_PHASES.PLAYOFFS && standingHome && standingAway) {
      standingHome.gamesPlayed++; standingAway.gamesPlayed++;
      if (result.homeScore > result.awayScore) { standingHome.wins++; standingAway.losses++; }
      else if (result.awayScore > result.homeScore) { standingAway.wins++; standingHome.losses++; }
      else { standingHome.draws = (standingHome.draws || 0) + 1; standingAway.draws = (standingAway.draws || 0) + 1; }
      standingHome.winRate = standingHome.gamesPlayed > 0 ? standingHome.wins / standingHome.gamesPlayed : 0;
      standingAway.winRate = standingAway.gamesPlayed > 0 ? standingAway.wins / standingAway.gamesPlayed : 0;
    }
  });
  updatedStandings.sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
  let updatedData = { ...sData, schedule: updatedSchedule, standings: updatedStandings, results: updatedResults };
  // プレーオフ進行を更新（シリーズ決着・TBD確定）
  if (sData.phase === SEASON_PHASES.PLAYOFFS) {
    updatedData = updatePlayoffProgress(updatedData);
  }
  return { data: updatedData, results: gameResults };
};
