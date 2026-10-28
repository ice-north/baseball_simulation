import assert from 'node:assert/strict';
import {
  createLeague,
  defaultPhasePlan,
  submitPhase,
  loadLeagueWorld,
} from '../../server/leagueEngine.mjs';
import { captureWorld, restoreWorld } from '../../server/worldSnapshot.mjs';
import { TEAMS_DATA } from '../../src/teams-data.js';
import { autoSimulateGame } from '../../src/game/autoSimulation.js';
import {
  createRecorder,
  comparisonForSeason,
  freezeComparison,
} from '../../server/recordedStats.mjs';
import {
  projectPlayerInfo,
  projectGameInfo,
  projectGames,
} from '../../server/projection.mjs';
import { situationalCandidates } from '../../server/situationalLabels.mjs';
import { zeroLine, addCounts, rates } from '../../src/online/recordStats.js';
import { performanceFor } from '../../server/performanceLabels.mjs';
const log = console.log;
console.log = () => {};
const now = '2026-10-28T00:00:00.000Z';
const league = createLeague({
  members: [{ userId: 'a' }, { userId: 'b' }],
  now,
});
while (league.phase) {
  const phaseId = league.phase.id;
  const plans = league.members.map((m) => defaultPhasePlan(league, m.teamName));
  league.members.forEach((m, i) =>
    submitPhase(
      league,
      m.userId,
      { phaseId, plan: plans[i], ready: true },
      now,
    ),
  );
}
loadLeagueWorld(league);
const [home, away] = league.season.settings.teamNames;
const before = captureWorld();
const plain = autoSimulateGame(home, away, false, 70281);
const plainWorld = captureWorld();
restoreWorld(before);
const events = [];
const observed = autoSimulateGame(home, away, false, 70281, {
  plateAppearance: (e) => events.push(e),
});
assert.deepEqual(
  observed,
  plain,
  '観測の有無で同一シードの試合結果・交代・選手成績を変えない',
);
assert.deepEqual(
  captureWorld(),
  plainWorld,
  '通常ゲームの世界に追加記録を書き込まない',
);
assert.ok(events.filter((e) => e.completed).length > 40);
for (const name of [home, away]) {
  const total = events
    .filter((e) => e.offense === name && e.completed)
    .reduce(
      (sum, e) =>
        sum +
        e.delta.atBats +
        e.delta.walks +
        e.delta.hitByPitch +
        e.delta.sacrificeBunts,
      0,
    );
  const expected = (
    name === home ? observed.homeTeam : observed.awayTeam
  ).players.reduce((sum, p) => {
    const b = p.gameStats.batting;
    return sum + b.atBats + b.walks + b.hitByPitch + (b.sacrificeBunts || 0);
  }, 0);
  assert.equal(total, expected, '完了打席だけを一度記録する');
}
restoreWorld(before);
const recorder = createRecorder(league, TEAMS_DATA);
const game = { id: 1, date: { year: 2024, month: 4, day: 1 }, home, away };
const observer = recorder.begin(game);
const result = autoSimulateGame(home, away, false, 70281, observer);
recorder.finish(game, result, observer);
league.game = captureWorld();
const season = league.records.seasons[1];
for (const r of Object.values(season.players)) {
  assert.equal(
    (r.splits.batting.risp?.pa || 0) + (r.splits.batting.emptyRisp?.pa || 0),
    r.stats.batting.plateAppearances,
  );
  assert.equal(
    (r.splits.batting.left?.pa || 0) + (r.splits.batting.right?.pa || 0),
    r.stats.batting.plateAppearances,
  );
  assert.equal(
    (r.splits.batting.pinch?.pa || 0) + (r.splits.batting.normal?.pa || 0),
    r.stats.batting.plateAppearances,
  );
  assert.equal(r.splits.pitching.all?.pa || 0, r.stats.pitching.battersFaced);
  assert.equal(
    r.splits.pitching.all?.outs || 0,
    r.stats.pitching.inningsPitched,
    '走者アウトと打席アウトを投球回に一致させる',
  );
  if (r.stats.batting.plateAppearances)
    assert.equal(
      r.stats.batting.atBats +
        r.stats.batting.walks +
        r.stats.batting.hitByPitch +
        r.stats.batting.sacrificeBunts +
        r.stats.batting.sacrificeFlies,
      r.stats.batting.plateAppearances,
    );
}
assert.throws(() => recorder.finish(game, result, observer), /重複/);
freezeComparison(league);
const frozen = JSON.stringify(comparisonForSeason(season));
delete season.players[Object.keys(season.players)[0]];
assert.equal(
  JSON.stringify(comparisonForSeason(season)),
  frozen,
  '年度確定比較値は退団後も保持',
);
// 別の簡潔なfixtureで、未完了・犠飛・併殺・代打・初球の境界を明示する。
const tiny = {
  season: { year: 1, results: [], settings: { teamNames: ['A', 'B'] } },
  records: null,
};
const p = (id) => ({ id, name: `選手${id}`, position: 'center' });
const teams = { A: { players: [p(1)] }, B: { players: [p(2)] } };
const r = createRecorder(tiny, teams),
  g = { id: 7, date: game.date, home: 'A', away: 'B' },
  o = r.begin(g);
const event = {
  offense: 'A',
  defense: 'B',
  batterId: 1,
  pitcherId: 2,
  starter: true,
  inning: 1,
  throws: 'left',
  pinchHit: true,
  risp: true,
  dpPossible: true,
  pitches: 1,
  twoStrikes: false,
  fouls: 0,
  bunt: null,
  completed: true,
  delta: { atBats: 1, rbis: 1 },
  result: { type: 'out', isOutfieldFly: true },
};
o.plateAppearance(event);
o.plateAppearance({ ...event, completed: false, delta: {}, result: null });
const gp = { outs: 1, pitches: 1, earnedRuns: 1, runsAllowed: 1 };
r.finish(
  g,
  {
    homeScore: 1,
    awayScore: 0,
    winner: 'A',
    homeTeam: {
      name: 'A',
      players: [
        {
          ...teams.A.players[0],
          battingOrder: 1,
          gameStats: {
            batting: { atBats: 1, rbis: 1 },
            pitching: {},
            fielding: {},
          },
        },
      ],
    },
    awayTeam: {
      name: 'B',
      players: [
        {
          ...teams.B.players[0],
          battingOrder: 9,
          gameStats: { batting: {}, pitching: gp, fielding: {} },
        },
      ],
    },
    decisions: {},
  },
  o,
);
const br = Object.values(tiny.records.seasons[1].players).find(
  (p) => p.id === 1,
);
assert.equal(br.stats.batting.atBats, 0);
assert.equal(br.stats.batting.sacrificeFlies, 1);
assert.equal(br.stats.batting.plateAppearances, 1);
assert.equal(br.splits.batting.firstPitch.pa, 1);
assert.equal(br.splits.batting.pinch.pa, 1);
assert.equal(rates(br.splits.batting.risp).obp, 0);
// 倍率の平均0・両区分の必要量・リーグ左右差補正。
const line = (hits, pa = 20) => ({ ...zeroLine(), pa, atBats: pa, hits });
const record = {
  splits: {
    batting: {
      risp: line(10),
      emptyRisp: line(2),
      left: line(10),
      right: line(2),
      all: { ...zeroLine(), buntAttempts: 10, buntSuccess: 9 },
    },
    pitching: {},
  },
  games: [],
  starts: [],
};
const comparison = {
  splits: { batting: { left: line(10), right: line(2) }, pitching: {} },
};
const candidates = situationalCandidates(record, comparison);
assert.ok(candidates.batting.some((c) => c.id === 'chance-good'));
assert.ok(candidates.batting.some((c) => c.id === 'bunt-good'));
assert.ok(
  !candidates.batting.some((c) => c.id === 'left-good'),
  'リーグ全体の左右差を差し引く',
);
record.splits.batting.risp.pa = 14;
assert.ok(
  !situationalCandidates(record, comparison).batting.some(
    (c) => c.id === 'chance-good',
  ),
);
const chosen = performanceFor(
  {
    seasonStats: {
      batting: {
        atBats: 100,
        hits: 30,
        doubles: 4,
        triples: 0,
        homeruns: 3,
        walks: 10,
        strikeouts: 20,
        sacrificeBunts: 0,
      },
    },
  },
  null,
  {
    batting: [
      ...candidates.batting,
      ...candidates.batting.map((c, i) => ({ ...c, id: `extra${i}` })),
    ],
    pitching: [],
  },
);
assert.ok(chosen.batting.labels.length <= 3);
const candidateIds = (b = {}, p = {}, lb = {}, starts = [], games = []) =>
  situationalCandidates(
    { splits: { batting: b, pitching: p }, starts, games },
    { splits: { batting: lb, pitching: {} } },
  );
assert.ok(
  candidateIds({ risp: line(2), emptyRisp: line(10) }).batting.some(
    (c) => c.id === 'chance-bad',
  ),
);
assert.ok(
  candidateIds({}, { risp: line(2), emptyRisp: line(10) }).pitching.some(
    (c) => c.id === 'pinch-good',
  ),
);
assert.ok(
  candidateIds({}, { risp: line(10), emptyRisp: line(2) }).pitching.some(
    (c) => c.id === 'pinch-bad',
  ),
);
assert.ok(
  candidateIds(
    { left: line(10), right: line(2) },
    {},
    { left: line(5), right: line(5) },
  ).batting.some((c) => c.id === 'left-good'),
);
assert.ok(
  candidateIds(
    { left: line(2), right: line(10) },
    {},
    { left: line(5), right: line(5) },
  ).batting.some((c) => c.id === 'left-bad'),
);
assert.ok(
  candidateIds(
    { pinch: line(10), normal: line(2) },
    {},
    { pinch: line(4) },
  ).batting.some((c) => c.id === 'pinch-hit'),
);
assert.ok(
  candidateIds(
    { firstPitch: line(10) },
    {},
    { firstPitch: line(3) },
  ).batting.some((c) => c.id === 'first-pitch'),
);
assert.ok(
  candidateIds(
    { twoStrikes: { ...line(8), strikeouts: 2 } },
    {},
    { twoStrikes: { ...line(2), strikeouts: 4 } },
  ).batting.some((c) => c.id === 'persistent'),
);
assert.ok(
  candidateIds({
    all: { ...zeroLine(), buntAttempts: 10, buntSuccess: 4 },
  }).batting.some((c) => c.id === 'bunt-bad'),
);
assert.ok(
  candidateIds(
    { all: { ...zeroLine(), dpChances: 20, doublePlays: 10 } },
    {},
    { all: { ...zeroLine(), dpChances: 20, doublePlays: 2 } },
  ).batting.some((c) => c.id === 'double-play'),
);
assert.ok(
  !candidateIds(
    { all: { ...zeroLine(), dpChances: 20, doublePlays: 10 } },
    {},
    { all: { ...zeroLine(), dpChances: 20, doublePlays: 0 } },
  ).batting.some((c) => c.id === 'double-play'),
);
const starters = (early, middle, late) =>
  Array.from({ length: 3 }, () => ({ early, middle, late }));
assert.ok(
  candidateIds(
    {},
    {},
    {},
    starters(line(2), line(10), zeroLine()),
  ).pitching.some((c) => c.id === 'start-good'),
);
assert.ok(
  candidateIds(
    {},
    {},
    {},
    starters(line(10), line(2), zeroLine()),
  ).pitching.some((c) => c.id === 'start-bad'),
);
const improving = starters(
  { ...line(10), strikeouts: 1 },
  { ...line(5), strikeouts: 3 },
  { ...line(2), strikeouts: 5 },
);
assert.ok(
  candidateIds({}, {}, {}, improving).pitching.some(
    (c) => c.id === 'strong-finish',
  ),
);
assert.ok(
  !candidateIds({}, {}, {}, [
    ...improving,
    { early: line(10), middle: zeroLine(), late: zeroLine() },
  ]).pitching.some((c) => c.id === 'strong-finish'),
  '短い先発を除外して尻上がりを付けない',
);
assert.ok(
  candidateIds(
    {},
    {},
    {},
    [],
    Array.from({ length: 20 }, (_, i) => ({ atBats: 4, hits: i < 10 ? 2 : 0 })),
  ).batting.some((c) => c.id === 'multi-hit'),
);
assert.ok(
  !candidateIds(
    {},
    {},
    {},
    [],
    Array.from({ length: 20 }, () => ({ atBats: 4, hits: 1 })),
  ).batting.some((c) => c.id === 'multi-hit'),
  '同じ打率でも安打の集中が無ければ固め打ちを付けない',
);
// 閲覧権限と保存後・過去年の参照を確認。
const own = league.game.teams[home].players.find((p) =>
  Object.values(season.players).some((r) => r.key === p.onlinePlayerId),
);
const info = projectPlayerInfo({ league }, 'a', own.id);
assert.ok(info.periods.some((p) => p.id === 'career'));
assert.equal(projectGameInfo({ league }, 'a', 1, 1).gameId, 1);
assert.equal(projectGames({ league }, 'a', { year: 1 }).count, 1);
assert.throws(
  () => projectPlayerInfo({ league }, 'stranger', own.id),
  (e) => e.status === 403,
);
assert.throws(
  () => projectGameInfo({ league }, 'stranger', 1, 1),
  (e) => e.status === 403,
);
assert.throws(
  () => projectGameInfo({ league }, 'a', 'constructor', 1),
  (e) => e.status === 400,
);
assert.throws(
  () => projectGames({ league }, 'a', { page: -1 }),
  (e) => e.status === 400,
);
assert.deepEqual(
  addCounts({ atBats: 1 }, { atBats: { bad: true } }),
  { atBats: 1 },
  '入れ子を数値加算しない',
);
console.log = log;
console.log(
  'online-records-check PASS（通常試合/RNGの同一性・完了打席/犠飛/未完了・左右/代打/得点圏・比較値確定・通算・閲覧権限・重複防止）',
);
