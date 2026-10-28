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
  projectTeamInfo,
  projectGameInfo,
  projectGames,
} from '../../server/projection.mjs';
import { situationalCandidates } from '../../server/situationalLabels.mjs';
import { zeroLine, addCounts, rates } from '../../src/online/recordStats.js';
import { storedGame } from '../../server/recordedViews.mjs';
import { saveLineup } from '../../server/lineupCommand.mjs';
import { projectLineup } from '../../server/projection.mjs';
import {
  TACTIC_DEFAULTS,
  tacticalChance,
  tacticalDamageLimit,
  tacticalPitchLimit,
} from '../../src/online/tactics.js';
import { performanceFor } from '../../server/performanceLabels.mjs';
import { createReplay } from '../../server/replayRecord.mjs';
import { replayPitchResult, replayLabel } from '../../src/online/replayText.js';
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
  runnerOut: (e) => assert.ok(e.outs > 0),
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
for (const seed of [1, 2, 17, 29, 93, 119, 283, 701]) {
  restoreWorld(before);
  const expected = autoSimulateGame(home, away, false, seed),
    expectedWorld = captureWorld();
  restoreWorld(before);
  const recorder = createReplay();
  const actual = autoSimulateGame(home, away, false, seed, {
    start: recorder.start,
    replay: recorder.frame,
    pitchDetail: recorder.pitchDetail,
    plateAppearance() {},
    runnerOut() {},
  });
  assert.deepEqual(
    actual,
    expected,
    `全投球観測で試合結果/RNGを変えない: ${seed}`,
  );
  assert.deepEqual(
    captureWorld(),
    expectedWorld,
    `全投球観測で試合後の世界を変えない: ${seed}`,
  );
}
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
const replayBefore = captureWorld();
const replayPlain = autoSimulateGame(home, away, false, 70281);
const replayPlainWorld = captureWorld();
restoreWorld(replayBefore);
const result = autoSimulateGame(home, away, false, 70281, observer);
assert.deepEqual(
  result,
  replayPlain,
  '全投球・開始名簿の記録でも試合結果/RNGを変えない',
);
assert.deepEqual(
  captureWorld(),
  replayPlainWorld,
  '観戦記録でも試合後の世界を変えない',
);
recorder.finish(game, result, observer);
const replay = observer.replayRecord;
assert.ok(replay.frames.length > 100, '実投球・走塁の経過を保存');
assert.equal(replay.frames.at(-1).homeScore, result.homeScore);
assert.equal(replay.frames.at(-1).awayScore, result.awayScore);
for (const f of replay.frames.filter((f) => f.kind === 'pitch')) {
  assert.equal(
    typeof f.pitchResult,
    'string',
    '打席結果と独立した実投球結果を記録',
  );
  if (f.result === 'walk') assert.equal(replayPitchResult(f), 'ball');
  if (f.result === 'strikeout')
    assert.ok(
      ['called_strike', 'swinging_strike'].includes(replayPitchResult(f)),
    );
}
assert.equal(
  replayPitchResult({ result: 'walk' }),
  'ball',
  '旧記録の四球もボールとして描画',
);
assert.equal(replayLabel({ result: 'foul_2strike' }), 'ファウル');
assert.ok(
  replay.frames
    .filter((f) => f.kind === 'pitch')
    .every(
      (f) =>
        Number.isFinite(f.pitch?.velocity) && typeof f.pitch.type === 'string',
    ),
);
assert.ok(
  !JSON.stringify(replay.teams).includes('strategy'),
  '観戦用の選手情報へ戦術や契約を含めない',
);
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
const p = (id) => ({
  id,
  name: `選手${id}`,
  position: 'center',
  batting: { bats: 'left' },
});
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
assert.equal(br.bats, 'left', '打者左右は通常ゲームと同じbatting.batsを使う');
assert.equal(
  comparisonForSeason(tiny.records.seasons[1]).byBats.left.risp.pa,
  1,
);
assert.equal(br.stats.batting.atBats, 0);
assert.equal(br.stats.batting.sacrificeFlies, 1);
assert.equal(br.stats.batting.plateAppearances, 1);
assert.equal(br.splits.batting.firstPitch.pa, 1);
assert.equal(br.splits.batting.pinch.pa, 1);
assert.equal(rates(br.splits.batting.risp).obp, 0);
// 倍率の平均0・両区分の必要量・リーグ左右差補正。
const line = (hits, pa = 20) => ({
  ...zeroLine(),
  pa: pa * 4,
  atBats: pa * 4,
  hits: hits * 4,
});
const record = {
  bats: 'left',
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
  byBats: { left: { left: line(10), right: line(2) } },
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
    { bats: 'left', splits: { batting: b, pitching: p }, starts, games },
    { splits: { batting: lb, pitching: {} }, byBats: { left: lb } },
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
// 少数・僅差は偶然の変動として表示しない。大きな差も打者左右の期待差なら除外。
assert.ok(
  !candidateIds({ risp: line(8, 15), emptyRisp: line(7, 15) }).batting.some(
    (c) => c.id.startsWith('chance-'),
  ),
);
assert.ok(
  !candidateIds({ risp: line(7, 10), emptyRisp: line(1, 10) }).batting.some(
    (c) => c.id.startsWith('chance-'),
  ),
);
assert.ok(
  !candidateIds(
    { pinch: line(7), normal: line(6) },
    {},
    { pinch: line(6) },
  ).batting.some((c) => c.id === 'pinch-hit'),
);
const sameHand = {
  bats: 'left',
  splits: { batting: { left: line(2), right: line(10) }, pitching: {} },
};
assert.ok(
  !situationalCandidates(sameHand, {
    splits: { batting: { left: line(5), right: line(5) } },
    byBats: { left: sameHand.splits.batting },
  }).batting.some((c) => c.id.startsWith('left-')),
);
assert.ok(
  !situationalCandidates(sameHand, {
    splits: { batting: { left: line(5), right: line(5) } },
  }).batting.some((c) => c.id.startsWith('left-')),
  '旧記録の打者左右が不明なら推測しない',
);
// 同一打者へファウル後安打/四球、バント安打、ポップフライ、初球安打を入力する。
const buntTiny = structuredClone(tiny);
buntTiny.records = null;
const buntRecorder = createRecorder(buntTiny, teams),
  buntGame = { ...g, id: 8 },
  buntObserver = buntRecorder.begin(buntGame);
for (const e of [
  {
    bunt: 'sacrifice',
    buntOutcome: 'bunt_foul',
    pitches: 2,
    result: { type: 'single' },
    delta: { atBats: 1, hits: 1 },
  },
  {
    bunt: 'sacrifice',
    buntOutcome: 'bunt_foul',
    pitches: 5,
    result: { type: 'walk' },
    delta: { walks: 1 },
  },
  {
    bunt: 'sacrifice',
    buntOutcome: 'bunt_fair',
    result: { type: 'bunt_fair' },
    delta: { atBats: 1, hits: 1 },
  },
  {
    bunt: 'sacrifice',
    buntOutcome: 'bunt_popup',
    result: { type: 'bunt_popup' },
    delta: { atBats: 1 },
  },
  { result: { type: 'single' }, delta: { atBats: 1, hits: 1 } },
])
  buntObserver.plateAppearance({ ...event, ...e });
buntRecorder.finish(
  buntGame,
  {
    ...result,
    homeTeam: {
      name: 'A',
      players: [
        {
          ...teams.A.players[0],
          battingOrder: 1,
          gameStats: { batting: {}, pitching: {}, fielding: {} },
        },
      ],
    },
    awayTeam: { name: 'B', players: [] },
  },
  buntObserver,
);
const buntRecord = Object.values(buntTiny.records.seasons[1].players).find(
  (p) => p.id === 1,
);
assert.equal(
  buntRecord.splits.batting.all.buntAttempts,
  2,
  'ファウル後の通常打撃を犠打成功率から除く',
);
assert.equal(
  buntRecord.splits.batting.all.buntSuccess,
  1,
  '実際のバント安打だけを成功にする',
);
assert.equal(
  buntRecord.splits.batting.firstPitch.pa,
  1,
  '初球バントは初球打ちから除く',
);
let randomState = 2801;
const random = () =>
  (randomState = (1664525 * randomState + 1013904223) >>> 0) / 4294967296;
let noiseLabels = 0;
for (let sample = 0; sample < 1000; sample++) {
  const nullLine = () => ({
    ...zeroLine(),
    pa: 60,
    atBats: 60,
    hits: Array.from({ length: 60 }, () => random() < 0.25).filter(Boolean)
      .length,
  });
  if (
    candidateIds({ risp: nullLine(), emptyRisp: nullLine() }).batting.some(
      (c) => c.id.startsWith('chance-'),
    )
  )
    noiseLabels++;
}
assert.ok(
  noiseLabels < 100,
  `同じ実力の1000標本へ過剰付与しない: ${noiseLabels}`,
);
const legacyGame = storedGame(
  {
    season: {
      year: 1,
      results: [
        {
          gameId: 9,
          result: {
            homeTeam: {
              name: 'A',
              players: [
                { id: 1, gameStats: { batting: { hitByPitch: 1 } } },
                { id: 2, gameStats: { batting: { sacrificeBunts: 1 } } },
              ],
            },
            awayTeam: { name: 'B', players: [] },
          },
        },
      ],
    },
  },
  9,
  1,
);
assert.equal(
  legacyGame.teams.A.length,
  2,
  '死球/犠打だけの代打も旧ボックスから落とさない',
);
const beforePublic = JSON.stringify(league);
const opposing = projectTeamInfo({ league }, 'a', away);
assert.equal(opposing.teamName, away);
assert.equal(opposing.roster.length, league.game.teams[away].players.length);
assert.ok(opposing.roster.every((p) => p.publicOnly && !p.detailAvailable));
for (const key of [
  'lineup',
  'strategy',
  'phase',
  'nextStarterId',
  'submissions',
])
  assert.ok(!Object.hasOwn(opposing, key));
assert.ok(opposing.roster.every((p) => !Object.hasOwn(p, 'growthPotential')));
assert.equal(
  JSON.stringify(league),
  beforePublic,
  '相手球団の閲覧は世界を変えない',
);
assert.throws(
  () => projectTeamInfo({ league }, 'stranger', away),
  (e) => e.status === 403,
);
assert.throws(
  () => projectTeamInfo({ league }, 'a', 'constructor'),
  (e) => e.status === 404,
);
// 閲覧権限と保存後・過去年の参照を確認。
const own = league.game.teams[home].players.find((p) =>
  Object.values(season.players).some((r) => r.key === p.onlinePlayerId),
);
const info = projectPlayerInfo({ league }, 'a', own.id);
assert.ok(info.periods.some((p) => p.id === 'career'));
assert.equal(projectGameInfo({ league }, 'a', 1, 1).gameId, 1);
const ownReplay = projectGameInfo({ league }, 'a', 1, 1).replay;
assert.ok(ownReplay.appliedPlan);
assert.equal(ownReplay.appliedTeam, home);
assert.ok(
  !Object.hasOwn(ownReplay, 'appliedPlans'),
  '観戦でも相手の事前設定を公開しない',
);
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
// 事前方針の境界と、未指定/既定値で同じ試合が続くことを確認。
assert.equal(tacticalChance(0.4, undefined), 0.4);
assert.equal(tacticalChance(0.4, 'never'), 0);
assert.ok(Math.abs(tacticalChance(0.4, 'aggressive') - 0.6) < 1e-12);
assert.equal(tacticalPitchLimit(100, false, { starterLimit: 60 }), 60);
assert.equal(tacticalPitchLimit(35, true, { starterLimit: 60 }), 35);
assert.equal(tacticalDamageLimit(40, { hook: 'early' }), 30);
const tacticalLeague = structuredClone(league);
const tacticalTeam = tacticalLeague.game.teams[home];
tacticalLeague.status = 'running';
const tacticalPlan = structuredClone(projectLineup(tacticalTeam));
const activePitchers = tacticalTeam.players.filter(
  (p) => p.position === 'pitcher' && p.isActive !== false,
);
tacticalPlan.pitcherRoles = Object.fromEntries(
  activePitchers.map((p) => [
    p.id,
    tacticalPlan.starters.includes(p.id) ? 'opener' : 'auto_r',
  ]),
);
const relievers = activePitchers.filter(
  (p) => !tacticalPlan.starters.includes(p.id),
);
if (relievers[0]) tacticalPlan.pitcherRoles[relievers[0].id] = 'closer';
tacticalPlan.tactics = {
  ...TACTIC_DEFAULTS,
  sacrificeBunt: 'never',
  starterLimit: 60,
};
const unchangedTactical = JSON.stringify(tacticalTeam);
for (const tactics of [
  { sacrificeBunt: ['never'] },
  { hook: ['early'] },
  { starterLimit: [60] },
  { starterLimit: '60' },
  { pinchHitFrom: false },
])
  assert.throws(
    () => saveLineup(tacticalLeague, 'a', { ...tacticalPlan, tactics }),
    /不正/,
    '配列や型違いを采配の値として受け付けない',
  );
assert.throws(
  () =>
    saveLineup(tacticalLeague, 'a', {
      ...tacticalPlan,
      pitcherRoles: {
        ...tacticalPlan.pitcherRoles,
        [tacticalPlan.starters[0]]: ['opener'],
      },
    }),
  /役割/,
  '配列を投手の役割として受け付けない',
);
assert.throws(
  () =>
    saveLineup(tacticalLeague, 'a', {
      ...tacticalPlan,
      tactics: { hook: 'unknown' },
    }),
  /不正/,
);
assert.throws(
  () =>
    saveLineup(tacticalLeague, 'a', {
      ...tacticalPlan,
      pitcherRoles: { foreign: 'closer' },
    }),
  /自球団/,
);
assert.equal(
  JSON.stringify(tacticalTeam),
  unchangedTactical,
  '不正な方針で編成を一部だけ保存しない',
);
saveLineup(tacticalLeague, 'a', tacticalPlan);
assert.equal(tacticalTeam.onlineTactics.sacrificeBunt, 'never');
assert.equal(tacticalTeam.onlineTactics.starterLimit, 60);
if (relievers[0])
  assert.equal(tacticalTeam.pitchingRotation.closer, relievers[0].id);
if (relievers[0]) {
  const legacy = structuredClone(tacticalLeague),
    team = legacy.game.teams[home];
  delete team.pitchingRotation.pitcherRoles;
  const legacyPlan = projectLineup(team);
  assert.equal(
    legacyPlan.pitcherRoles[relievers[0].id],
    'closer',
    '旧形式の抑え指定を役割欄へ引き継ぐ',
  );
  saveLineup(legacy, 'a', legacyPlan);
  assert.equal(team.pitchingRotation.closer, relievers[0].id);
}

loadLeagueWorld(league);
const neutralBefore = captureWorld();
const withoutPolicy = autoSimulateGame(home, away, false, 81991);
restoreWorld(neutralBefore);
for (const name of [home, away])
  TEAMS_DATA[name].onlineTactics = { ...TACTIC_DEFAULTS };
const withNeutralPolicy = autoSimulateGame(home, away, false, 81991);
// 方針自体はチーム返却値に含まれるので、その追加メタデータだけ外して比較する。
for (const team of [withNeutralPolicy.homeTeam, withNeutralPolicy.awayTeam])
  delete team.onlineTactics;
assert.deepEqual(
  withNeutralPolicy,
  withoutPolicy,
  '既定の事前方針は元の試合結果/RNGを変えない',
);
restoreWorld(neutralBefore);
for (const name of [home, away]) {
  TEAMS_DATA[name].onlineTactics = {
    ...TACTIC_DEFAULTS,
    sacrificeBunt: 'never',
    squeeze: 'never',
    safetyBunt: 'never',
    pinchHit: 'never',
    defensiveSub: 'never',
    starterLimit: 60,
  };
  TEAMS_DATA[name].strategy = {
    ...TEAMS_DATA[name].strategy,
    baseRunning: 'never',
  };
}
const noBunts = [];
const configuredResult = autoSimulateGame(home, away, false, 81991, {
  plateAppearance: (e) => noBunts.push(e),
});
assert.ok(
  noBunts.every((e) => !e.bunt && !e.pinchHit),
  '設定したバント/代打禁止が実試合で反映される',
);
assert.ok(
  [configuredResult.homeTeam, configuredResult.awayTeam].every((t) =>
    t.players.every(
      (p) =>
        !(
          p.gameStats?.batting?.stolenBases ||
          p.gameStats?.batting?.caughtStealing
        ),
    ),
  ),
  '盗塁禁止を反映',
);
restoreWorld(neutralBefore);
console.log = log;
console.log(
  'online-records-check PASS（通常試合/RNGの同一性・完了打席/犠飛/未完了・左右/代打/得点圏・比較値確定・通算・閲覧権限・重複防止）',
);
export { league as recordedFixture };
