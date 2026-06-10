// ============================================================
// 大学リーグマネージャー
// 16リーグの春季・秋季リーグ戦スケジュール生成・試合シミュレーション
// divisions対応: UNIVERSITY_REGIONSのdivisionsフィールドで自動分割
// ============================================================

import { UNIVERSITY_REGIONS, UNIVERSITY_TEAMS } from './universityTeamsData.js';
import { WORLD_DATA } from '../corporate/worldData.js';

const RANK_STRENGTH = { S: 78, A: 65, B: 50, C: 38, D: 25 };

// 春季: 4/5〜6/5, 秋季: 9/6〜11/5（秋季リーグ→明治神宮大会前に終了）
const SPRING = { startMonth: 4, startDay: 5, endMonth: 6, endDay: 5 };
const FALL   = { startMonth: 9, startDay: 6, endMonth: 11, endDay: 5 };

function generateRoundRobin(teams) {
  const n = teams.length;
  const rounds = [];
  const list = [...teams];
  if (n % 2 !== 0) list.push(null);
  const len = list.length;
  for (let r = 0; r < len - 1; r++) {
    const round = [];
    for (let i = 0; i < len / 2; i++) {
      const a = list[i];
      const b = list[len - 1 - i];
      if (a && b) round.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    rounds.push(round);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}

function generateLeagueSchedule(teamNames, year, season) {
  const cfg = season === 'spring' ? SPRING : FALL;
  const rounds = generateRoundRobin(teamNames);

  // 6巡（各カード6試合＝1チーム30試合/季）
  const allGames = [];
  for (let pass = 0; pass < 6; pass++) {
    for (const round of rounds) {
      for (const g of round) {
        allGames.push(pass % 2 === 0
          ? { home: g.home, away: g.away }
          : { home: g.away, away: g.home });
      }
    }
  }

  // 日程に配置（火・水・土・日に試合）
  const gameDays = ['tue', 'wed', 'sat', 'sun'];
  const dates = [];
  for (let m = cfg.startMonth; m <= cfg.endMonth; m++) {
    const daysInMonth = new Date(year, m, 0).getDate();
    const startD = (m === cfg.startMonth) ? cfg.startDay : 1;
    const endD = (m === cfg.endMonth) ? cfg.endDay : daysInMonth;
    for (let d = startD; d <= endD; d++) {
      const dow = new Date(year, m - 1, d).getDay();
      if (dow === 2 || dow === 3 || dow === 6 || dow === 0) {
        dates.push({ year, month: m, day: d });
      }
    }
  }

  const schedule = [];
  const maxPerDay = Math.floor(teamNames.length / 2);
  const totalDaysNeeded = Math.ceil(allGames.length / maxPerDay);
  const step = Math.max(1, Math.floor(dates.length / totalDaysNeeded));

  let dateIdx = 0;
  let gamesOnCurrentDate = 0;

  for (let i = 0; i < allGames.length; i++) {
    if (dateIdx >= dates.length) dateIdx = dates.length - 1;
    schedule.push({
      id: i,
      date: { ...dates[dateIdx] },
      home: allGames[i].home,
      away: allGames[i].away,
      result: null,
      season,
    });
    gamesOnCurrentDate++;
    if (gamesOnCurrentDate >= maxPerDay) {
      gamesOnCurrentDate = 0;
      dateIdx += step;
    }
  }

  return schedule;
}

function simulateUniversityGame(homeName, awayName) {
  const homeTeam = UNIVERSITY_TEAMS.find(t => t.name === homeName);
  const awayTeam = UNIVERSITY_TEAMS.find(t => t.name === awayName);
  const homeStr = (RANK_STRENGTH[homeTeam?.rank] || 50) + (Math.random() * 30 - 15);
  const awayStr = (RANK_STRENGTH[awayTeam?.rank] || 50) + (Math.random() * 30 - 15);

  const homeWinProb = homeStr / (homeStr + awayStr) + 0.03;
  const homeWins = Math.random() < homeWinProb;

  const baseRuns = () => Math.floor(Math.random() * 5) + Math.floor(Math.random() * 3);
  let homeScore = baseRuns();
  let awayScore = baseRuns();
  if (homeWins && homeScore <= awayScore) homeScore = awayScore + Math.floor(Math.random() * 3) + 1;
  if (!homeWins && awayScore <= homeScore) awayScore = homeScore + Math.floor(Math.random() * 3) + 1;

  return { homeScore, awayScore, winner: homeWins ? homeName : awayName };
}

function updateStandings(standings, home, away, homeScore, awayScore) {
  const sh = standings.find(s => s.team === home);
  const sa = standings.find(s => s.team === away);
  if (!sh || !sa) return;
  sh.gamesPlayed++;
  sa.gamesPlayed++;
  if (homeScore > awayScore) { sh.wins++; sa.losses++; }
  else if (awayScore > homeScore) { sa.wins++; sh.losses++; }
  else { sh.draws = (sh.draws || 0) + 1; sa.draws = (sa.draws || 0) + 1; }
  sh.winRate = sh.gamesPlayed > 0 ? sh.wins / sh.gamesPlayed : 0;
  sa.winRate = sa.gamesPlayed > 0 ? sa.wins / sa.gamesPlayed : 0;
  standings.sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
}

// ============================================================
// Public API
// ============================================================

export function initializeUniversityLeagues(year) {
  if (!WORLD_DATA.universityLeagues) WORLD_DATA.universityLeagues = {};

  for (const region of UNIVERSITY_REGIONS) {
    const teams = UNIVERSITY_TEAMS.filter(t => t.region === region.id);
    const teamNames = teams.map(t => t.name);
    const numDivisions = region.divisions || 1;

    if (numDivisions >= 2) {
      const perDiv = Math.floor(teams.length / numDivisions);
      const divTeams = {};
      for (let d = 1; d <= numDivisions; d++) {
        divTeams[d] = teams.slice((d - 1) * perDiv, d * perDiv).map(t => t.name);
      }

      const makeSeason = (season) => {
        let schedule = [];
        const standings = {};
        for (let d = 1; d <= numDivisions; d++) {
          schedule = schedule.concat(generateLeagueSchedule(divTeams[d], year, season));
          standings[`standings${d}`] = divTeams[d].map(t => ({ team: t, wins: 0, losses: 0, draws: 0, winRate: 0, gamesPlayed: 0 }));
        }
        return { schedule, ...standings, done: false };
      };

      WORLD_DATA.universityLeagues[region.id] = {
        name: region.name,
        regionId: region.id,
        teams: teamNames,
        divisions: true,
        numDivisions,
        div1Teams: divTeams[1],
        div2Teams: divTeams[2],
        divTeams,
        spring: makeSeason('spring'),
        fall: makeSeason('fall'),
        results: [],
      };
    } else {
      WORLD_DATA.universityLeagues[region.id] = {
        name: region.name,
        regionId: region.id,
        teams: teamNames,
        divisions: false,
        numDivisions: 1,
        spring: {
          schedule: generateLeagueSchedule(teamNames, year, 'spring'),
          standings: teamNames.map(t => ({ team: t, wins: 0, losses: 0, draws: 0, winRate: 0, gamesPlayed: 0 })),
          done: false,
        },
        fall: {
          schedule: generateLeagueSchedule(teamNames, year, 'fall'),
          standings: teamNames.map(t => ({ team: t, wins: 0, losses: 0, draws: 0, winRate: 0, gamesPlayed: 0 })),
          done: false,
        },
        results: [],
      };
    }
  }
}

export function simulateUniversityLeagueDate(currentDate) {
  const leagues = WORLD_DATA.universityLeagues;
  if (!leagues) return;

  // 大学モードではユーザーのリーグをスキップ（seasonData.schedule経由で管理）
  const userRegion = WORLD_DATA.mode === 'university' ? WORLD_DATA.userLeagueId : null;

  for (const [regionId, league] of Object.entries(leagues)) {
    if (regionId === userRegion) continue;
    for (const seasonKey of ['spring', 'fall']) {
      const seasonData = league[seasonKey];
      if (!seasonData || seasonData.done) continue;

      const gamesToday = seasonData.schedule.filter(g =>
        g.date?.year === currentDate.year &&
        g.date?.month === currentDate.month &&
        g.date?.day === currentDate.day &&
        !g.result
      );

      for (const game of gamesToday) {
        const result = simulateUniversityGame(game.home, game.away);
        game.result = result;

        if (league.divisions && league.divTeams) {
          const numDiv = league.numDivisions || 2;
          let divIdx = 1;
          for (let d = 1; d <= numDiv; d++) {
            if (league.divTeams[d]?.includes(game.home)) { divIdx = d; break; }
          }
          const standings = seasonData[`standings${divIdx}`];
          updateStandings(standings, game.home, game.away, result.homeScore, result.awayScore);
        } else {
          updateStandings(seasonData.standings, game.home, game.away, result.homeScore, result.awayScore);
        }

        if (!league.results) league.results = [];
        league.results.push({
          date: { ...currentDate },
          season: seasonKey === 'spring' ? '春' : '秋',
          home: game.home,
          away: game.away,
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          winner: result.winner,
        });
      }

      const remaining = seasonData.schedule.filter(g => !g.result).length;
      if (remaining === 0) seasonData.done = true;
    }
  }
}

export function getAllUniversityLeagues() {
  const leagues = WORLD_DATA.universityLeagues;
  if (!leagues) return [];

  return Object.entries(leagues).map(([id, data]) => {
    const springDone = data.spring?.done || false;
    const fallDone = data.fall?.done || false;
    const fallHasGames = data.fall?.schedule?.some(g => g.result) || false;

    // 秋季開始前は春季結果を表示
    let displayKey, seasonLabel;
    if (!springDone) {
      displayKey = 'spring'; seasonLabel = '春季';
    } else if (!fallDone && !fallHasGames) {
      displayKey = 'spring'; seasonLabel = '春季終了';
    } else if (!fallDone) {
      displayKey = 'fall'; seasonLabel = '秋季';
    } else {
      displayKey = 'fall'; seasonLabel = '秋季終了';
    }

    const seasonData = data[displayKey];
    let standings, totalGames, playedGames;
    totalGames = seasonData?.schedule?.length || 0;
    playedGames = seasonData?.schedule?.filter(g => g.result)?.length || 0;

    if (data.divisions) {
      const numDiv = data.numDivisions || 2;
      standings = {};
      for (let d = 1; d <= numDiv; d++) {
        standings[`div${d}`] = seasonData?.[`standings${d}`] || [];
      }
    } else {
      standings = seasonData?.standings || [];
    }

    return {
      id,
      name: data.name,
      teams: data.teams,
      divisions: data.divisions,
      numDivisions: data.numDivisions || 1,
      currentSeason: seasonLabel,
      standings,
      totalGames,
      playedGames,
      springDone,
      fallDone,
    };
  });
}

export function resetUniversityLeagues() {
  if (WORLD_DATA.universityLeagues) {
    WORLD_DATA.universityLeagues = {};
  }
}
