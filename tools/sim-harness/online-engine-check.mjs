import assert from 'node:assert/strict';
import { createLeague, defaultPhasePlan, submitPhase, advanceLeagueDay, loadLeagueWorld } from '../../server/leagueEngine.mjs';
import { captureWorld } from '../../server/worldSnapshot.mjs';
import { nextProgressionAt } from '../../src/online/shared.js';

assert.equal(nextProgressionAt('2026-10-27T23:00:00Z'), '2026-10-28T01:30:00.000Z');
assert.equal(nextProgressionAt('2026-10-28T14:00:00Z'), '2026-10-28T23:00:00.000Z');
assert.equal(nextProgressionAt('2026-10-28T13:59:59Z'), '2026-10-28T14:00:00.000Z');
let now = new Date('2026-10-28T00:00:00Z');
const league = createLeague({ members: [{ userId: 'a' }, { userId: 'b' }], now: now.toISOString() });
const seen = [];
function resolve() {
  const phase = league.phase;
  seen.push(phase.kind);
  const defaults = league.members.map(m => defaultPhasePlan(league, m.teamName));
  assert.deepEqual(defaults[0], defaultPhasePlan(league, league.members[0].teamName), '標準案は再読込しても同じ');
  for (const [i, member] of league.members.entries()) {
    submitPhase(league, member.userId, { phaseId: phase.id, plan: defaults[i], ready: true }, now.toISOString());
    if (i === 0) assert.equal(league.status, 'waiting', '一人の決定では進めない');
  }
}
resolve();
resolve();
assert.equal(league.status, 'running');
const game = structuredClone(league.game);
loadLeagueWorld(league);
assert.deepEqual(captureWorld(), game, '未完了の背景大会も含めて完全に復元する');
const startYear = league.season.year;
let days = 0;
while (league.season.year === startYear && days < 300) {
  if (league.status === 'waiting') resolve();
  else {
    now = new Date(now.getTime() + 4 * 3600000);
    advanceLeagueDay(league, `acceptance:${days}`, now.toISOString());
    days++;
    if (days % 40 === 0) console.log(`online-engine: ${days}日 / ${JSON.stringify(league.season.currentDate)}`);
  }
}
assert.equal(league.season.year, 2, '実試合を消化して2年目に到達する');
assert.equal(league.history.length, 1);
assert.deepEqual(seen, ['initial_tryout', 'camp', 'contract', 'tryout', 'offseason']);
assert.ok(league.history[0].standings.every(s => s.gamesPlayed === 75));
resolve();
assert.equal(league.status, 'running');
assert.deepEqual(league.season.currentDate, { year: 2025, month: 4, day: 1 });
assert.ok(league.season.standings.every(s => s.gamesPlayed === 0));
for (const name of league.season.settings.teamNames) {
  const team = league.game.teams[name];
  assert.ok(team.players.length >= 9);
  assert.ok(team.players.every(p => !(p.seasonStats?.batting?.games > 0) && !(p.seasonStats?.pitching?.gamesStarted > 0)), '自リーグへ架空の次年度成績を注入しない');
}
console.log(`online-engine-check PASS (${days}日・2年目開幕)`);
