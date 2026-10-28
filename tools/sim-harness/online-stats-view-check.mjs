import assert from 'node:assert/strict';
import {
  STAT_GROUPS,
  statGroup,
  formatStat,
  sortedRoster,
  conditionValue,
} from '../../src/online/statsView.js';
import { performanceFor } from '../../server/performanceLabels.mjs';
import { createSeasonStats } from '../../src/players.js';
import { getAbilityRank } from '../../src/utils/constants.js';
import { abilityRows } from '../../src/online/playerInfo.js';
const player = (id, runs = id) => {
  const seasonStats = createSeasonStats();
  Object.assign(seasonStats.batting, {
    atBats: 100,
    hits: 30,
    doubles: 10,
    triples: 0,
    homeruns: 5,
    walks: 10,
    hitByPitch: 2,
    rbis: runs,
    stolenBases: 8,
    caughtStealing: 2,
    fieldingChances: 20,
    errors: 1,
  });
  Object.assign(seasonStats.pitching, {
    inningsPitched: 54,
    hits: 8,
    walks: 2,
    strikeouts: 20,
    earnedRuns: 3,
  });
  const p = {
    id,
    name: `選手${id}`,
    seasonStats,
    condition: 0,
    fatigue: 12,
    age: 20,
  };
  p.performance = performanceFor(p, null);
  return p;
};
const source = player(1);
const value = (category, group, key, p = source) =>
  statGroup(category, group)
    .columns.find((c) => c.id === key)
    .get(p);
assert.equal(value('batting', 'sabers', 'slg'), 0.55);
assert.equal(value('batting', 'sabers', 'obp'), 0.375);
assert.ok(Math.abs(value('batting', 'sabers', 'ops') - 0.925) < 1e-12);
assert.equal(value('batting', 'sabers', 'iso'), 0.25);
assert.ok(Math.abs(value('pitching', 'sabers', 'whip') - 10 / 18) < 1e-12);
assert.equal(value('pitching', 'sabers', 'kbb'), 10);
assert.equal(value('pitching', 'sabers', 'k9'), 10);
assert.equal(value('pitching', 'sabers', 'bb9'), 1);
assert.equal(value('batting', 'running', 'stealRate'), 0.8);
assert.equal(value('batting', 'fielding', 'fieldRate'), 0.95);
const bb0 = player(2);
bb0.seasonStats.pitching.walks = 0;
assert.equal(value('pitching', 'sabers', 'kbb', bb0), Infinity);
bb0.seasonStats.pitching.strikeouts = 0;
assert.equal(value('pitching', 'sabers', 'kbb', bb0), null);
delete bb0.seasonStats.pitching.walks;
assert.equal(
  value('pitching', 'sabers', 'kbb', bb0),
  null,
  '欠損を与四球0にしない',
);
for (const [category, s] of Object.entries(createSeasonStats())) {
  const fields = new Set(
    STAT_GROUPS[category].flatMap((group) => group.columns.map((c) => c.id)),
  );
  for (const key of Object.keys(s))
    assert.ok(
      fields.has(key === 'inningsPitched' ? 'outs' : key),
      `${category}.${key}に閲覧導線がある`,
    );
}
const roster = Array.from({ length: 24 }, (_, i) => player(i + 1, i + 1));
const original = JSON.stringify(roster);
const rbis = statGroup('batting', 'basic').columns.find((c) => c.id === 'rbis');
assert.equal(
  sortedRoster(roster, rbis, 'desc')[0].id,
  24,
  '全選手でソートしてからページを切り出す',
);
assert.equal(sortedRoster(roster, rbis, 'asc')[0].id, 1);
assert.equal(JSON.stringify(roster), original, 'ソートで元の名簿を変更しない');
const unknown = player(25);
delete unknown.seasonStats.batting.rbis;
for (const direction of ['asc', 'desc'])
  assert.equal(
    sortedRoster([...roster, unknown], rbis, direction).at(-1).id,
    25,
    '欠損は両方向で末尾',
  );
const ties = [player(9, 10), player(2, 10)];
assert.deepEqual(
  sortedRoster(ties, rbis, 'desc').map((p) => p.id),
  [9, 2],
  '同値は元の順',
);
const kbb = statGroup('pitching', 'sabers').columns.find((c) => c.id === 'kbb');
bb0.seasonStats.pitching.walks = 0;
bb0.seasonStats.pitching.strikeouts = 1;
assert.equal(
  sortedRoster([source, bb0], kbb, 'desc')[0].id,
  2,
  '∞も正しく並べる',
);
assert.equal(formatStat(kbb, Infinity), '∞');
assert.equal(formatStat(kbb, null), '—');
for (const column of statGroup('pitching', 'abilities').columns) {
  for (const value of [0, 40, 60, 80, 100, 140, 180]) {
    assert.equal(
      formatStat(column, value),
      getAbilityRank(
        value,
        column.format === 'velocity',
        column.format === 'stamina',
      ),
    );
    assert.equal(
      formatStat(column, value, true),
      String(value),
      '詳細は換算前の実数値',
    );
  }
  assert.equal(formatStat(column, null), '—', '欠損を最低ランクにしない');
}
assert.equal(
  value('batting', 'state', 'ability', {
    physical: { speed: 70 },
    batting: { speed: 20 },
  }),
  70,
  '走力は身体能力を参照',
);
assert.equal(
  abilityRows(
    {
      physical: { speed: 70 },
      pitching: { velocity: 140, stamina: 120 },
      batting: { meet: 0 },
    },
    'physical',
  )[0][1],
  70,
);
assert.equal(abilityRows({ batting: { meet: 0 } }, 'batting')[0][1], 0);
assert.equal(abilityRows({}, 'physical')[0][1], null);
const outs = statGroup('pitching', 'basic').columns.find(
  (c) => c.id === 'outs',
);
assert.equal(formatStat(outs, 5), '1.2');
assert.equal(conditionValue(source), 0);
assert.equal(value('batting', 'state', 'condition'), 0);
assert.equal(conditionValue({}), null);
assert.equal(conditionValue({ condition: 8 }), null);
assert.equal(formatStat(statGroup('batting', 'state').columns[0], 0), '絶不調');
assert.equal(
  statGroup('batting', 'sabers').columns.find((c) => c.id === 'ops')
    .approximate,
  true,
  'OPSの概算を明示',
);
console.log(
  'online-stats-view-check PASS（既存項目の閲覧・OPS/WHIP等・欠損/0/∞・全名簿ソート・安定順序・状態と投球回）',
);
