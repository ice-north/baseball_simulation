// 検査用: オンラインのリーグを作って、試合の箱（`plays` つき）を `count` 試合ぶん返す。
import { quiet } from './quiet.mjs';
import { createLeague, defaultPhasePlan, submitPhase, advanceLeagueDay } from '../../../server/leagueEngine.mjs';

export function sampleOnlineGames(count = 18, seed = 'plays') {
  let now = new Date('2026-10-28T00:00:00Z');
  const league = quiet(() => createLeague({ members: [{ userId: 'a' }], now: now.toISOString() }));
  const gamesOf = () => league.records?.seasons?.[league.season.year]?.games || {};
  let days = 0;
  while (days < 200 && Object.keys(gamesOf()).length < count) {
    if (league.status === 'waiting') {
      for (const m of league.members)
        quiet(() =>
          submitPhase(league, m.userId, { phaseId: league.phase.id, plan: defaultPhasePlan(league, m.teamName), ready: true }, now.toISOString()),
        );
      continue;
    }
    now = new Date(now.getTime() + 4 * 3600000);
    quiet(() => advanceLeagueDay(league, `${seed}:${days}`, now.toISOString()));
    days++;
  }
  return Object.values(gamesOf());
}
