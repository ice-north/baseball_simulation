import assert from 'node:assert/strict';
import {
  battingMetrics,
  pitchingMetrics,
  leagueComparison,
  performanceFor,
} from '../../server/performanceLabels.mjs';
import { projectLeague } from '../../server/projection.mjs';
import {
  ONLINE_SCHEMA,
  ONLINE_ENGINE_VERSION,
} from '../../src/online/shared.js';
const batting = {
  atBats: 100,
  hits: 25,
  doubles: 4,
  triples: 0,
  homeruns: 2,
  walks: 10,
  strikeouts: 20,
  sacrificeBunts: 0,
  hitByPitch: 0,
  stolenBases: 0,
  caughtStealing: 0,
};
const pitching = {
  inningsPitched: 54,
  strikeouts: 12,
  walks: 4,
  homeruns: 2,
  earnedRuns: 6,
};
const player = (bat = {}, pit = {}) => ({
  id: 1,
  name: '確認選手',
  position: 'pitcher',
  seasonStats: {
    batting: { ...batting, ...bat },
    pitching: { ...pitching, ...pit },
  },
});
const baseline = {
  batting: battingMetrics(batting),
  pitching: pitchingMetrics(pitching),
};
const ids = (p, category = 'batting', base = baseline) =>
  performanceFor(p, base)[category].labels.map((l) => l.id);
assert.ok(ids(player({ hits: 40 })).includes('average'));
assert.ok(
  ids(player({ atBats: 200, hits: 57 })).includes('average'),
  '平均+.035の境界を含める',
);
assert.ok(
  ids(player({ hits: 40, doubles: 10, homeruns: 10 })).includes('power'),
);
assert.ok(
  !ids(player({ hits: 40, doubles: 10, homeruns: 10 })).includes('extra-base'),
);
assert.ok(ids(player({ doubles: 12, homeruns: 2 })).includes('extra-base'));
assert.ok(ids(player({ walks: 25 })).includes('eye'));
assert.ok(!ids(player({ walks: 25 })).includes('on-base'));
assert.ok(ids(player({ hits: 32 })).includes('on-base'));
assert.ok(ids(player({ strikeouts: 28 })).includes('strikeout'));
assert.ok(ids(player({ strikeouts: 40 })).includes('whiff'));
assert.ok(!ids(player({ strikeouts: 40 })).includes('strikeout'));
assert.ok(
  ids(player({ stolenBases: 8, caughtStealing: 2 })).includes('steal-good'),
);
assert.ok(
  ids(player({ stolenBases: 5, caughtStealing: 5 })).includes('steal-bad'),
);
assert.ok(
  !ids(player({ stolenBases: 6, caughtStealing: 4 })).includes('steal-bad'),
);
assert.ok(
  !ids(player({ stolenBases: 7, caughtStealing: 2 })).includes('steal-good'),
);
const missingSteals = player({ stolenBases: 20 });
delete missingSteals.seasonStats.batting.caughtStealing;
assert.ok(
  !ids(missingSteals).includes('steal-good'),
  '未記録の盗塁死を0と解釈しない',
);
assert.ok(ids(player({}, { strikeouts: 20 }), 'pitching').includes('pitch-k'));
assert.ok(ids(player({}, { walks: 8 }), 'pitching').includes('pitch-bb'));
assert.ok(ids(player({}, { homeruns: 4 }), 'pitching').includes('pitch-hr'));
assert.ok(
  ids(player({}, { walks: 0 }), 'pitching').includes('control'),
  '実測四球0は制球安定の対象',
);
const missingBB = player();
delete missingBB.seasonStats.pitching.walks;
assert.deepEqual(ids(missingBB, 'pitching'), []);
assert.deepEqual(
  ids(
    player({
      atBats: 10,
      hits: 9,
      doubles: 0,
      homeruns: 0,
      walks: 0,
      strikeouts: 0,
    }),
  ),
  [],
  '50打席未満',
);
assert.deepEqual(
  ids(player({}, { inningsPitched: 44 }), 'pitching'),
  [],
  '15回未満',
);
assert.ok(
  ids(player({}, { inningsPitched: 45, walks: 0 }), 'pitching').includes(
    'control',
  ),
);
const zero = {
  batting: { ...baseline.batting, iso: 0, hrRate: 0, bbRate: 0, kRate: 0 },
  pitching: { ...baseline.pitching, k9: 0, bb9: 0, hr9: 0 },
};
assert.deepEqual(ids(player(), 'pitching', zero), []);
assert.ok(
  !ids(player(), 'batting', zero).some((id) =>
    ['power', 'extra-base', 'eye', 'whiff', 'strikeout'].includes(id),
  ),
);
assert.equal(
  battingMetrics({ ...batting, atBats: 0, hits: 0, doubles: 0, homeruns: 0 })
    .avg,
  null,
);
assert.equal(pitchingMetrics({ ...pitching, inningsPitched: 0 }).era, null);
const mixed = player({ hits: 40, strikeouts: 55 });
assert.ok(
  ids(mixed).includes('average') && ids(mixed).includes('whiff'),
  '正負が併存する',
);
assert.equal(
  performanceFor(
    player({
      hits: 45,
      doubles: 10,
      homeruns: 15,
      walks: 50,
      strikeouts: 100,
      stolenBases: 10,
    }),
    baseline,
  ).batting.labels.length,
  3,
);
const league = {
  // ⚠ 版を載せること。`projectLeague` は古い形のリーグを投影せず
  //    「更新を取り込みます」だけ返すので、載せ忘れると `roster` が無くなる
  schema: ONLINE_SCHEMA,
  engineVersion: ONLINE_ENGINE_VERSION,
  revision: 1,
  members: [{ userId: 'a', teamName: 'A' }],
  season: {
    year: 1,
    settings: { teamNames: ['A', 'B', 'C', 'D'] },
    results: [],
    schedule: [],
    standings: [],
  },
  game: {
    teams: Object.fromEntries(
      ['A', 'B', 'C', 'D'].map((name, i) => [
        name,
        { players: [player({ atBats: (i + 1) * 100, hits: 25 })] },
      ]),
    ),
  },
  history: [],
  notices: [],
};
league.game.teams.OTHER = { players: [player({ atBats: 10000, hits: 9000 })] };
const comparison = leagueComparison(league);
assert.equal(
  comparison.batting.avg,
  100 / 1000,
  '四球団全員の安打/打数合計。背景リーグは混ぜない',
);
const before = JSON.stringify(league);
const originalRandom = Math.random;
try {
  Math.random = () => {
    throw new Error('ラベル表示で乱数を消費してはいけない');
  };
  const view = projectLeague({ league, sessions: { a: 's' } }, 'a', 's', 'a');
  assert.deepEqual(
    view.roster[0].performance,
    performanceFor(league.game.teams.A.players[0], comparison),
  );
  assert.equal(
    view.roster[0].performance.batting.metrics.avg,
    0.25,
    '投手ポジションでも打撃成績を捨てない',
  );
  assert.equal(view.roster[0].performance.pitching.metrics.k9, 6);
  assert.deepEqual(
    view,
    projectLeague({ league, sessions: { a: 's' } }, 'a', 's', 'a'),
    '表示は決定的',
  );
} finally {
  Math.random = originalRandom;
}
assert.equal(
  JSON.stringify(league),
  before,
  '元の状態やラベルを保存・変更しない',
);
assert.deepEqual(
  performanceFor(player(), null).batting.labels,
  [],
  '比較対象がなければ判定しない',
);
assert.deepEqual(performanceFor({}).pitching.labels, []);
console.log(
  'online-label-check PASS（基本ラベル・欠損/0/出場量・四球団の加重平均・正負/排他/上限・投打両方・非破壊・乱数不使用）',
);
