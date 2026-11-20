// 球団の歩み（`TeamHistoryChart.jsx`）の位置の計算。画面の部品と分けて、検査から読めるようにしてある
import { PYRAMID_LEAGUES, TEAMS_PER_LEAGUE, compareLeagueStanding } from './pyramidLeague.js';

const tierOfName = (name) => PYRAMID_LEAGUES.find((l) => l.name === name)?.tier ?? null;

/** 年表の1行 → 縦軸の位置（1始まり。1部1位＝1） */
export function slotOf(season) {
  const tier = tierOfName(season.league);
  if (tier == null || !season.rank) return null;
  return tier * TEAMS_PER_LEAGUE + season.rank;
}

/**
 * 今季の途中の順位（年表の行と同じ形）。試合が無ければ null。
 * ⚠ 順位は順位表と同じ並べ方（`compareLeagueStanding`。同率は勝利数 → 球団名）
 */
export function currentSeasonRow(view, teamName) {
  const leagueId = view.teamLeagues?.[teamName];
  const league = PYRAMID_LEAGUES.find((l) => l.id === leagueId);
  if (!league || !view.standings?.length) return null;
  const rows = view.standings.filter((s) => view.teamLeagues[s.team] === leagueId).sort(compareLeagueStanding);
  const row = rows.find((s) => s.team === teamName);
  if (!row || row.wins + row.losses + (row.draws || 0) === 0) return null;
  return {
    year: view.year,
    league: league.name,
    rank: rows.indexOf(row) + 1,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws || 0,
    current: true,
  };
}

