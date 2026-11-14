// PC版スタメン設定（`src/online/LineupBoard.jsx`）の編集の中身（`src/online/lineupEdit.js`）。
//
// ⚠ 見るのは「どの操作も**サーバーが受け付ける形**を崩さない」こと。正本は
//    `validateLineup`（`src/online/shared.js`）。以前の画面は ✕ で外す・守備位置を
//    コンボボックスで選ぶ作りで、途中に保存できない形（7人・同じ位置に2人）を経由した。
// ⚠ 休養の疲労・適性の下限はサーバー（`server/dailyLineup.mjs`）と同じ値であること。
import assert from 'node:assert/strict';
import {
  FIELD_POSITIONS,
  positionFitness,
  playablePositions,
  orderFromLineup,
  battingOrderFromOrder,
  swapOrder,
  swapPositions,
  replaceStarter,
  benchFielders,
  benchPitchers,
  bestFieldPosition,
  groupBench,
  candidatesFor,
  orderProblems,
  REST_FATIGUE,
  LOW_FITNESS,
  FRESH_FATIGUE,
} from '../../src/online/lineupEdit.js';
import {
  validateLineup,
  SUBSTITUTE_MIN_FITNESS,
} from '../../src/online/shared.js';
import { FIELDER_REST_FATIGUE } from '../../server/dailyLineup.mjs';
import {
  rebaseLineupSave,
  LINEUP_BOARD_KEYS,
  PITCHING_BOARD_KEYS,
} from '../../src/online/lineupBridge.js';

assert.equal(
  REST_FATIGUE,
  FIELDER_REST_FATIGUE,
  '休養の疲労がサーバーとずれた',
);
assert.equal(
  LOW_FITNESS,
  SUBSTITUTE_MIN_FITNESS,
  '適性の下限（代役選びの下限）とずれた',
);
{
  // 代役になれる控えの疲労は、サーバーの代役選びの値そのもの（画面の説明に出す）
  const { readFile } = await import('node:fs/promises');
  const server = await readFile(
    new URL('../../server/dailyLineup.mjs', import.meta.url),
    'utf8',
  );
  assert.match(
    server,
    /const FRESH_FATIGUE = SUBSTITUTE_FRESH_FATIGUE;/,
    '代役の疲労の値がサーバーと別に書かれている',
  );
  assert.equal(FRESH_FATIGUE, 40);
}

// --- 名簿: 野手12人（各位置1人＋控え4人）と投手3人
const fielder = (id, position, fitness = {}) => ({
  id,
  name: `野手${id}`,
  position,
  isActive: true,
  fatigue: id % 3 === 0 ? 50 : 0,
  positionFitness: { [position]: 100, ...fitness },
});
const roster = [
  ...FIELD_POSITIONS.map((pos, i) => fielder(i + 1, pos)),
  fielder(9, 'catcher', { first: 70 }),
  fielder(10, 'short', { second: 90, third: 65 }),
  fielder(11, 'second', { short: 80 }),
  fielder(12, 'center', { left: 95, right: 85 }),
  { id: 21, name: '投手21', position: 'pitcher', isActive: true, pitching: {} },
  { id: 22, name: '投手22', position: 'pitcher', isActive: true, pitching: {} },
  { id: 23, name: '投手23', position: 'pitcher', isActive: true, pitching: {} },
  { ...fielder(30, 'left'), isActive: false },
];
const lineup = {
  battingOrder: [
    ...FIELD_POSITIONS.map((position, i) => ({
      playerId: i + 1,
      position,
      battingOrder: 8 - i,
    })),
  ],
  starters: [21, 22],
  pitcherRoles: { 23: 'closer' },
};
const team = { players: roster };
const valid = (order) =>
  validateLineup(team, {
    battingOrder: battingOrderFromOrder(order),
    starters: lineup.starters,
  });

// 保存済みの打順から作る（打順の番号順に並べ直す）
const start = orderFromLineup(lineup);
assert.deepEqual(
  start.map((e) => e.playerId),
  [8, 7, 6, 5, 4, 3, 2, 1],
  '保存済みの打順の順に並ばない',
);
assert.deepEqual(orderProblems(start, roster), []);
valid(start);

// 投手が9番に入った古い形でも、投手は編集に入れない
assert.equal(
  orderFromLineup({
    battingOrder: [
      ...lineup.battingOrder,
      { playerId: 21, position: 'pitcher', battingOrder: 9 },
    ],
  }).length,
  8,
);

// 送る形は1〜8に振り直す
assert.deepEqual(
  battingOrderFromOrder(start).map((e) => e.battingOrder),
  [1, 2, 3, 4, 5, 6, 7, 8],
);

// --- 3つの操作は、どれを何度重ねてもサーバーが受け付ける形のまま
let order = start;
const steps = [
  (o) => swapOrder(o, 7, 0),
  (o) => swapOrder(o, 1, 5),
  (o) => swapPositions(o, 0, 3),
  (o) => replaceStarter(o, 2, benchFielders(roster, o)[0].id),
  (o) => swapOrder(o, 0, 7),
  (o) => swapPositions(o, 6, 7),
  (o) => replaceStarter(o, 7, benchFielders(roster, o).at(-1).id),
];
for (let round = 0; round < 3; round++)
  for (const step of steps) {
    order = step(order);
    assert.equal(order.length, 8);
    assert.deepEqual(
      orderProblems(order, roster),
      [],
      '操作で保存できない形になった',
    );
    valid(order);
  }

// 打順の入れ替え（クリック・ドラッグ）: 2人だけが入れ替わり、間の選手は動かない
{
  const swapped = swapOrder(start, 0, 2);
  assert.deepEqual(
    swapped.slice(0, 3).map((e) => e.playerId),
    [6, 7, 8],
  );
  assert.equal(swapped[0].position, start[2].position);
  assert.deepEqual(
    swapped.slice(3).map((e) => e.playerId),
    start.slice(3).map((e) => e.playerId),
    '入れ替えた2人より下の選手がずれた',
  );
}
// 守備位置の入れ替え: 打順はそのまま、位置だけ交換
{
  const swapped = swapPositions(start, 0, 1);
  assert.deepEqual(
    swapped.map((e) => e.playerId),
    start.map((e) => e.playerId),
  );
  assert.equal(swapped[0].position, start[1].position);
  assert.equal(swapped[1].position, start[0].position);
  assert.notEqual(swapped[0], start[0], '元の配列の要素を書き換えた');
  assert.equal(start[0].position, 'right');
}
// 交代: 打順と守備位置を引き継ぐ。スタメンの選手とは交代しない
{
  const replaced = replaceStarter(start, 0, 12);
  assert.deepEqual(replaced[0], { playerId: 12, position: start[0].position });
  assert.equal(replaceStarter(start, 0, 5), start, 'スタメン同士を交代させた');
}

// --- 控え: 投手と抹消中を出さない。捕手・内野・外野で括る
{
  const bench = benchFielders(roster, start);
  assert.deepEqual(
    bench.map((p) => p.id),
    [9, 10, 11, 12],
  );
  assert.deepEqual(
    groupBench(bench).map((g) => [g.id, g.players.map((p) => p.id)]),
    [
      ['catcher', [9]],
      ['infield', [10, 11]],
      ['outfield', [12]],
    ],
  );
  // 二塁の候補は二塁の適性順（本職100 → 遊撃手の90 → …）
  assert.deepEqual(
    candidatesFor(bench, 'second').map((p) => p.id),
    [11, 10, 9, 12],
  );
  // 本職は適性の値が無くても100、無い位置は0
  assert.equal(positionFitness({ position: 'first' }, 'first'), 100);
  assert.equal(positionFitness({ position: 'first' }, 'short'), 0);
  assert.deepEqual(
    playablePositions(roster.find((p) => p.id === 10)).map((e) => e.position),
    ['short', 'second', 'third'],
  );
}

// --- 二刀流: 投手も野手の枠に入れられる（控えの投手は別に出す）
{
  assert.deepEqual(
    benchPitchers(roster, start).map((p) => p.id),
    [21, 22, 23],
    '控えの投手が出ない',
  );
  const twoWay = replaceStarter(start, 0, 21);
  assert.deepEqual(
    orderProblems(twoWay, roster),
    [],
    '投手を野手の枠に入れられない',
  );
  valid(twoWay);
  assert.deepEqual(
    benchPitchers(roster, twoWay).map((p) => p.id),
    [22, 23],
    '野手の枠に入った投手が控えに残る',
  );
  // 守るなら一番合う位置（投手の本職の「投手」は出さない）
  assert.equal(
    bestFieldPosition({
      position: 'pitcher',
      positionFitness: { pitcher: 100, second: 76, short: 54 },
    }),
    'second',
  );
  // 抹消中の選手は投手でも野手でも入れない
  const inactive = replaceStarter(start, 0, 30);
  assert.ok(orderProblems(inactive, roster).length, '抹消中の選手を通した');
}

// --- スマホから受け取った崩れた打順（7人・同じ位置に2人）も、8枠に整えて交代で直せる
{
  const seven = orderFromLineup({
    battingOrder: lineup.battingOrder.filter((e) => e.position !== 'short'),
  });
  assert.equal(seven.length, 8, '7人の打順が8枠にならない');
  const empty = seven.findIndex((e) => e.playerId == null);
  assert.equal(
    seven[empty].position,
    'short',
    '空きの枠に空いた位置が付かない',
  );
  assert.ok(
    orderProblems(seven, roster).some((m) => m.includes('空いている打順')),
    '空きの枠を見逃した',
  );
  assert.equal(battingOrderFromOrder(seven).length, 7, '空きの枠を送った');
  const filled = replaceStarter(seven, empty, 10);
  assert.deepEqual(orderProblems(filled, roster), []);
  valid(filled);

  const doubled = orderFromLineup({
    battingOrder: lineup.battingOrder.map((e) =>
      e.position === 'left' ? { ...e, position: 'right' } : e,
    ),
  });
  assert.deepEqual(
    [...new Set(doubled.map((e) => e.position))].sort(),
    [...FIELD_POSITIONS].sort(),
    '同じ位置の2人目が空いた位置へ回らない',
  );
  assert.deepEqual(orderProblems(doubled, roster), []);
  valid(doubled);

  // 抹消中の選手は起用できない（名簿には居る）
  const inactive = start.map((e, i) => (i === 0 ? { ...e, playerId: 30 } : e));
  assert.ok(orderProblems(inactive, roster).length > 0, '抹消中を見逃した');
}

// --- 崩れた保存（名簿に居ない選手）は理由を出し、交代で直せる
{
  const broken = start.map((e, i) => (i === 4 ? { ...e, playerId: 999 } : e));
  assert.ok(orderProblems(broken, roster).length > 0, '居ない選手を見逃した');
  assert.throws(() => valid(broken));
  const fixed = replaceStarter(broken, 4, 9);
  assert.deepEqual(orderProblems(fixed, roster), []);
  valid(fixed);
}

// --- PCは打順と投手起用を別々に保存する。片方の保存がもう片方を消さない
{
  const latest = { ...lineup, starters: [22, 21] }; // 投手起用だけ先に保存された
  const payload = rebaseLineupSave(
    { battingOrder: battingOrderFromOrder(order) },
    lineup,
    latest,
    LINEUP_BOARD_KEYS,
  );
  assert.deepEqual(
    payload.starters,
    [22, 21],
    'スタメンの保存で先発の順を古い値に戻した',
  );
  assert.deepEqual(
    payload.baseLineup.starters,
    [22, 21],
    '照合の起点が最新でない',
  );
  assert.deepEqual(payload.battingOrder, battingOrderFromOrder(order));
  const latest2 = { ...lineup, battingOrder: battingOrderFromOrder(order) };
  const pitchers = rebaseLineupSave(
    { battingOrder: lineup.battingOrder, starters: [21], pitcherRoles: {} },
    lineup,
    latest2,
    PITCHING_BOARD_KEYS,
  );
  assert.deepEqual(
    pitchers.battingOrder,
    latest2.battingOrder,
    '投手起用の保存で、スタメン設定で保存した打順を古い値に戻した',
  );
  assert.deepEqual(pitchers.starters, [21]);
}

console.log(
  'online-lineup-board-check PASS（どの操作もサーバーが受け付ける形 / 打順・守備・交代 / 控えの括りと候補の並び / 崩れた保存の直し方 / 投手を野手の枠に / 打順と投手起用の別保存）',
);
