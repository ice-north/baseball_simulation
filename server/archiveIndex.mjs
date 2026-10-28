import { projectPlayerInfo } from './projection.mjs';
import { storedGame } from './recordedViews.mjs';
export function buildArchiveIndex(bundle, retainedYears = []) {
  const league = bundle.league;
  if (!league) return null;
  const players = {};
  for (const member of league.members) {
    players[member.userId] = {};
    for (const p of league.game.teams[member.teamName].players) {
      const info = projectPlayerInfo(bundle, member.userId, p.id);
      delete info.revision;
      players[member.userId][p.id] = info;
    }
  }
  const games = {};
  const years = new Set([
    league.season.year,
    ...Object.keys(league.records?.seasons || {}).map(Number),
  ]);
  for (const year of years) {
    if (retainedYears.includes(String(year))) continue;
    const ids = new Set(
      Object.keys(league.records?.seasons?.[year]?.games || {}),
    );
    if (year === league.season.year)
      for (const game of league.season.results) ids.add(String(game.gameId));
    games[year] = Object.fromEntries(
      [...ids].map((id) => [id, storedGame(league, id, year)]),
    );
  }
  return { players, games };
}
export function archiveReferences(meta) {
  return new Set(
    [meta, ...(meta?.previous || [])]
      .filter(Boolean)
      .flatMap((index) => [
        index.players?.path,
        ...Object.values(index.games || {}).map((x) => x.path),
      ])
      .filter(Boolean),
  );
}
