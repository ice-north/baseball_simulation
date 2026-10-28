import assert from 'node:assert/strict';
import {
  createLeague,
  defaultPhasePlan,
  submitPhase,
  advanceLeagueDay,
} from '../../server/leagueEngine.mjs';
const now = '2026-10-28T00:00:00.000Z';
const league = createLeague({
  members: [{ userId: 'a' }, { userId: 'b' }],
  now,
});
function resolveDefaults() {
  const phaseId = league.phase.id;
  for (const member of league.members)
    submitPhase(
      league,
      member.userId,
      { phaseId, plan: defaultPhasePlan(league, member.teamName), ready: true },
      now,
    );
}
resolveDefaults();
resolveDefaults();
// ドラフトで人数が減った状態のfixture。日付を飛ばす通年受入ではない。
const member = league.members[0];
const roster = league.game.teams[member.teamName];
roster.players = roster.players
  .filter((p) => p.position !== 'pitcher')
  .slice(0, 4);
league.season.currentDate = { year: 2024, month: 11, day: 8 };
league.season.phase = 'off_season';
advanceLeagueDay(league, 'recovery:contract', now);
assert.equal(
  league.phase.kind,
  'contract',
  '試合のない日は編成不足でも契約日まで進める',
);
assert.throws(
  () =>
    submitPhase(
      league,
      'a',
      {
        phaseId: league.phase.id,
        plan: { releaseIds: [roster.players[0].id] },
        ready: true,
      },
      now,
    ),
  /新たな退団/,
);
submitPhase(
  league,
  'a',
  { phaseId: league.phase.id, plan: { releaseIds: [] }, ready: true },
  now,
);
submitPhase(
  league,
  'b',
  {
    phaseId: league.phase.id,
    plan: defaultPhasePlan(league, league.members[1].teamName),
    ready: true,
  },
  now,
);
advanceLeagueDay(league, 'recovery:tryout', now);
assert.equal(league.phase.kind, 'tryout');
resolveDefaults();
const recovered = league.game.teams[member.teamName];
assert.equal(recovered.players.length, 24);
assert.ok(recovered.players.some((p) => p.position === 'pitcher'));
assert.ok(recovered.players.some((p) => p.position === 'catcher'));
console.log(
  'online-roster-recovery-check PASS（ドラフト後4人・投手不在→契約確認→補強で24人）',
);
