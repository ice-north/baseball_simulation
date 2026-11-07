// 守備位置の登録を変える（コンバート）の検査。
//
// ⚠ 主目的は「**名簿と編成を壊さないこと**」。登録を変えるだけの操作に見えるが、
//    打順と投手起用がその登録を前提にしているので、組み直さないと
//    「野手になった選手が登板順に残る」「投手になった選手が守備に就く」。
// ⚠ 能力は足さない。選手は元から投打の能力と守備適性を持っているので、
//    登録を変えるだけで成り立つ（下手なまま守るのがコンバート）。
import assert from 'node:assert/strict';
import './lib/bootstrap.mjs';
import {
  createLeague,
  defaultPhasePlan,
  submitPhase,
  convertPosition,
  loadLeagueWorld,
  captureLeagueWorld,
} from '../../server/leagueEngine.mjs';
import { CONVERT_POSITIONS, ROSTER_LIMIT } from '../../src/online/shared.js';

const NOW = '2026-10-26T15:00:00.000Z';
const quiet = (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
};

const league = quiet(() =>
  createLeague({ members: [{ userId: 'a' }], now: NOW }),
);
// 初期メンバー選択を済ませて名簿を配る
for (let i = 0; i < 4 && league.phase; i += 1)
  submitPhase(
    league,
    'a',
    {
      phaseId: league.phase.id,
      plan: defaultPhasePlan(league, league.members[0].teamName),
      ready: true,
    },
    NOW,
  );
const own = league.members[0].teamName;
const act = (fn) => {
  loadLeagueWorld(league);
  const out = fn();
  league.game = captureLeagueWorld();
  return out;
};
const roster = () => league.game.teams[own].players;
const find = (id) => roster().find((p) => p.id === id);
const rotationOf = () => league.game.teams[own].pitchingRotation;
const orderOf = () =>
  league.game.teams[own].lineupSettings?.battingOrder || [];
const bullpen = () => {
  const r = rotationOf();
  return [
    ...(r.starters || []),
    ...(r.middleRelievers || []),
    ...(r.setupMen || []),
    ...(r.closer != null ? [r.closer] : []),
  ];
};

assert.ok(roster().length > 0, '前提: 名簿が配られている');

// --- 選択肢 -----------------------------------------------------------
// ⚠ DHは守備位置ではない（打順の枠）
assert.ok(!CONVERT_POSITIONS.includes('dh'), 'DHを守備位置にしている');
assert.equal(CONVERT_POSITIONS.length, 9, '守備位置が9つでない');

// --- 投手 → 野手 -------------------------------------------------------
// ⚠ 登板順に残したままにしないこと。残ると「野手が先発する」日程になる
{
  const pitcher = roster().find(
    (p) => p.position === 'pitcher' && (rotationOf().starters || []).includes(p.id),
  );
  assert.ok(pitcher, '前提: 先発ローテに投手が居る');
  act(() =>
    convertPosition(league, 'a', { playerId: pitcher.id, position: 'left' }),
  );
  assert.equal(find(pitcher.id).position, 'left', '登録が変わっていない');
  assert.ok(
    !bullpen().includes(pitcher.id),
    '野手になった選手が投手起用に残っている（その日に投げる）',
  );
  // ⚠ **能力は足さない**。慣れない位置の適性は低いまま
  assert.ok(
    (find(pitcher.id).positionFitness?.left ?? 0) < 100,
    '守備適性を勝手に上げている',
  );
  assert.ok(
    find(pitcher.id).pitching?.velocity > 0,
    '投手の能力を消している（戻せなくなる）',
  );
}

// --- 野手 → 投手 -------------------------------------------------------
// ⚠ 打順に野手として残したままにしないこと
{
  const fielder = roster().find(
    (p) => p.position !== 'pitcher' && p.position !== 'catcher',
  );
  act(() =>
    convertPosition(league, 'a', { playerId: fielder.id, position: 'pitcher' }),
  );
  assert.equal(find(fielder.id).position, 'pitcher', '登録が変わっていない');
  const slot = orderOf().find((e) => e.playerId === fielder.id);
  assert.ok(
    !slot || slot.position === 'pitcher',
    `投手になった選手が${slot?.position}を守ったままになっている`,
  );
  // ⚠ 投手起用のどこかに入ること（入らないと試合で1度も投げない）
  assert.ok(
    bullpen().includes(fielder.id),
    '投手になった選手がどの投手起用の欄にも入っていない',
  );
}

// --- 編成が成り立っていること -----------------------------------------
// ⚠ 組み直しを忘れると、名簿に居ない・守備位置の合わない打順が残る
{
  const ids = new Set(roster().map((p) => p.id));
  const order = orderOf();
  assert.ok(order.length >= 8, `打順が組まれていない: ${order.length}人`);
  for (const e of order)
    assert.ok(ids.has(e.playerId), '打順に名簿外の選手が残っている');
  for (const e of order) {
    const p = find(e.playerId);
    if (e.position === 'pitcher' || e.position === 'dh') continue;
    assert.notEqual(
      p.position,
      'pitcher',
      `${p.name}（投手）が${e.position}を守っている`,
    );
  }
  for (const id of bullpen())
    assert.equal(
      find(id)?.position,
      'pitcher',
      '投手起用の欄に野手が入っている',
    );
}

// --- 受け付けない変更 --------------------------------------------------
const rejects = (payload, pattern, message) => {
  assert.throws(() => act(() => convertPosition(league, 'a', payload)), pattern, message);
};
rejects({ playerId: roster()[0].id, position: 'dh' }, /守備位置の指定/, 'DHへ変えられた');
rejects({ playerId: -1, position: 'left' }, /名簿にいません/, '居ない選手を変えられた');
rejects(
  { playerId: roster()[0].id, position: roster()[0].position },
  /すでにその守備位置/,
  '同じ位置へ変えられた',
);
// ⚠ **名簿が成り立たなくなる変更は受け付けない**（トレードと同じ `rosterShortfall`）。
//    最後の捕手を外野手にすると、試合を組めない球団ができる
{
  const catchers = roster().filter((p) => p.position === 'catcher');
  assert.ok(catchers.length > 0, '前提: 捕手が居る');
  for (const c of catchers.slice(1))
    act(() => convertPosition(league, 'a', { playerId: c.id, position: 'left' }));
  const last = roster().filter((p) => p.position === 'catcher');
  assert.equal(last.length, 1, '前提: 捕手が1人になった');
  rejects(
    { playerId: last[0].id, position: 'left' },
    /名簿が成り立ちません/,
    '最後の捕手を外野手にできた',
  );
  // 投手も同じ（最後の1人は外せない）
  const pitchers = roster().filter((p) => p.position === 'pitcher');
  for (const p of pitchers.slice(1))
    act(() => convertPosition(league, 'a', { playerId: p.id, position: 'right' }));
  const lastPitcher = roster().filter((p) => p.position === 'pitcher');
  assert.equal(lastPitcher.length, 1, '前提: 投手が1人になった');
  rejects(
    { playerId: lastPitcher[0].id, position: 'right' },
    /名簿が成り立ちません/,
    '最後の投手を野手にできた',
  );
}

// ⚠ 他人の球団の選手は変えられない（サーバーが自分の名簿からしか探さない）
assert.throws(
  () => act(() => convertPosition(league, 'b', { playerId: roster()[0].id, position: 'left' })),
  /参加者ではありません/,
  '参加していない人が登録を変えられた',
);

assert.ok(roster().length <= ROSTER_LIMIT, '名簿の人数が壊れた');
console.log(
  '■ 守備位置の変更: OK（投手⇔野手・編成を組み直す・能力は足さない・名簿が成り立たない変更は受け付けない）',
);
