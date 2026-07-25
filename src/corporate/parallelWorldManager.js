// ============================================================
// 平行世界マネージャー
// 非ユーザーリーグの試合を日付進行に合わせて自動シミュレーション
// ============================================================

import { WORLD_DATA } from './worldData.js';
import { TEAMS_DATA } from '../teams-data.js';
import { autoSimulateGame } from '../game/autoSimulation.js';
import { simulateUniversityLeagueDate, getAllUniversityLeagues, processSpringPromotionRelegation, regenerateFallSchedules } from '../university/universityLeagueManager.js';
import { generateUniversityChampionship, generateMeijiJinguTournament, autoPlayUniversityTournament } from '../university/universityTournament.js';
import { INDEPENDENT_LEAGUES } from './independentLeagueData.js';
import { recordTeamAchievement } from '../season/achievements.js';

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

    // 大学全国大会（非大学モード: バックグラウンド自動消化）
    if (WORLD_DATA.mode !== 'university') {
      const { month, day } = currentDate;
      if (!WORLD_DATA._uniTournaments) WORLD_DATA._uniTournaments = {};

      // 全日本大学野球選手権大会（6月10日）
      if (month === 6 && day === 10 && !WORLD_DATA._uniTournaments.ucDone) {
        const uc = generateUniversityChampionship(null, currentDate.year);
        if (uc) {
          autoPlayUniversityTournament(uc);
          WORLD_DATA._uniTournaments.uc = uc;
          WORLD_DATA._uniTournaments.ucDone = true;
        }
      }

      // 明治神宮野球大会（11月10日）
      if (month === 11 && day === 10 && !WORLD_DATA._uniTournaments.mjDone) {
        const mj = generateMeijiJinguTournament(null, currentDate.year);
        if (mj) {
          autoPlayUniversityTournament(mj);
          WORLD_DATA._uniTournaments.mj = mj;
          WORLD_DATA._uniTournaments.mjDone = true;
        }
      }
    }
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
// 各独立リーグの優勝チームによる単一トーナメント（最大16チーム）
// 2リーグ制のリーグは各サブリーグから1チームずつ出場
// ============================================================

const extractLeagueChampions = (standings, teamOrder, leagueId, leagueDef, fallbackName) => {
  if (!standings || standings.length === 0) return [];
  const results = [];
  const format = leagueDef?.leagueFormat || 'single';

  if (format === 'two' && teamOrder && teamOrder.length >= 4) {
    const half = Math.floor(teamOrder.length / 2);
    const l1Set = new Set(teamOrder.slice(0, half));
    const l2Set = new Set(teamOrder.slice(half));
    const subNames = leagueDef?.leagueNames || ['第1リーグ', '第2リーグ'];

    const l1 = [...standings].filter(s => l1Set.has(s.team)).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
    const l2 = [...standings].filter(s => l2Set.has(s.team)).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);

    if (l1[0]) results.push({ team: l1[0].team, league: leagueId, leagueName: subNames[0] });
    if (l2[0]) results.push({ team: l2[0].team, league: leagueId, leagueName: subNames[1] });
  } else {
    const sorted = [...standings].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
    if (sorted[0]) results.push({ team: sorted[0].team, league: leagueId, leagueName: fallbackName || leagueId });
  }
  return results;
};

export const generateGrandChampionship = (userLeagueId, userStandings, userSettings = null, gameYear = null) => {
  const champions = [];

  // ユーザーのリーグ
  if (userStandings && userStandings.length > 0) {
    const leagueDef = userLeagueId ? INDEPENDENT_LEAGUES[userLeagueId] : null;
    const teamOrder = userSettings?.teamNames || userStandings.map(s => s.team);
    const effectiveFormat = userSettings?.leagueFormat || leagueDef?.leagueFormat || 'single';
    const effectiveDef = leagueDef || { leagueFormat: effectiveFormat, leagueNames: userSettings?.leagueNames };
    const name = leagueDef?.name || userSettings?.leagueName || 'ユーザーリーグ';
    champions.push(...extractLeagueChampions(userStandings, teamOrder, userLeagueId || '__user__', effectiveDef, name));
  }

  // 他の独立リーグ（平行世界）
  for (const [leagueId, leagueData] of Object.entries(WORLD_DATA.independentLeagues)) {
    if (!leagueData?.standings || leagueData.standings.length === 0) continue;
    const leagueDef = INDEPENDENT_LEAGUES[leagueId];
    champions.push(...extractLeagueChampions(leagueData.standings, leagueData.teams, leagueId, leagueDef, leagueData.name));
  }

  if (champions.length < 2) return null;

  // ブラケット生成（最大16チーム）
  const teamNames = champions.map(c => c.team);
  const maxBracketSize = 16;
  const rawSize = Math.pow(2, Math.ceil(Math.log2(Math.max(2, teamNames.length))));
  const size = Math.min(maxBracketSize, rawSize);
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
    achievementGameYear: gameYear,
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
      if (match.winner) continue;              // 既に決着済み
      if (!match.team1 && !match.team2) continue; // 空カード（対戦相手なし）

      let winner;
      if (match.team1 && match.team2) {
        const home = TEAMS_DATA[match.team1];
        const away = TEAMS_DATA[match.team2];
        if (home && away) {
          const result = autoSimulateGame(match.team1, match.team2, true);
          // トーナメントは決着必須。延長引き分け(result.winner=null)は
          // スコアで判定し、それでも同点なら上位シード(team1)勝ちとする。
          winner = result.homeScore > result.awayScore ? match.team1
                 : result.awayScore > result.homeScore ? match.team2
                 : match.team1;
          match.score = `${result.homeScore}-${result.awayScore}`;
        } else {
          winner = match.team1;
          match.score = 'W/O';
        }
      } else {
        // 不戦勝（byeで片方だけ在籍）→ その team が次に進出。
        // これを処理しないと空きスロットがnullのまま決勝まで伝播し、
        // champion=null / done=false となりグランドCSが確定しない。
        winner = match.team1 || match.team2;
        match.isBye = true;
        match.score = 'BYE';
      }

      match.winner = winner;
      // 敗者も記録する（年度末のランク計算がブラケットからElo変動を算出するため）
      if (!match.isBye && match.team1 && match.team2) {
        match.loser = winner === match.team1 ? match.team2 : match.team1;
      }
      advanceWinner(rounds, r, m, winner);

      if (r === rounds.length - 1) {
        gc.bracket.champion = winner;
        gc.bracket.runnerUp = winner === match.team1 ? match.team2 : match.team1;
        gc.done = true;
        // 独立リーグ日本一を選手経歴に記録
        recordTeamAchievement(gc.bracket.champion, { tournament: 'グランドチャンピオンシップ', gameYear: gc.achievementGameYear });
        if (gc.bracket.runnerUp) recordTeamAchievement(gc.bracket.runnerUp, { tournament: 'グランドチャンピオンシップ', gameYear: gc.achievementGameYear, isRunnerUp: true });
      }
    }
  }
};

export { getAllUniversityLeagues, processSpringPromotionRelegation, regenerateFallSchedules };
