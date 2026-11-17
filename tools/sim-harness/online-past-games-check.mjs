// 終わった年の試合の記録を別に保存する（先方回答 F1）の通し検査。
//   1年目を最後まで進めて2年目に入り、よく使う命令（ビュー・編成の保存・選手や球団を開く）が
//   **終わった年の試合の記録を読まずに**（軽い読みのまま）済むことを見る。
//   読んでしまうと、命令のたびに全体を読み直すことになり、分けた意味が無い。
//   node tools/sim-harness/online-past-games-check.mjs
import assert from 'node:assert/strict';
import { createTestStore } from './lib/testStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';

const quiet = async (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
};
const store = createTestStore('past-games-check');
const service = new LeagueService(store, { local: true, adminId: 'p1', members: [{ userId: 'p1' }] });
const session = (await service.login('p1')).sessionId;
let seq = 0;
const view = () => service.view('p1', session);
const send = async (type, payload) =>
  service.command('p1', session, { requestId: `past-games-${++seq}`, revision: (await view()).revision ?? 0, type, payload });

await quiet(async () => {
  await send('create');
  await send('testmode', { on: true });
  for (let guard = 0; guard < 200 && (await view()).year < 2; guard++) {
    const v = await view();
    if (v.status === 'running') await send('step', { turns: 24 });
    else await send('resolve');
  }
});
let v = await view();
assert.equal(v.year, 2, '2年目に入らない');
// 年度更新が済んで2年目のシーズン（または手続き）に居る。1年目の試合の記録は別の部分にある
const bundle = await store.read();
assert.ok(bundle.league.records.seasons[1]?.games && Object.keys(bundle.league.records.seasons[1].games).length > 100, '1年目の試合の記録が全体の読みで戻らない');
assert.ok(bundle.league.records.seasons[1].teamSplits, '年度更新で球団ごとの成績（teamSplits）を作っていない');

// よく使う命令が軽い読みのまま（全体を読み直していない）
const lightOnly = async (label, fn) => {
  await fn();
  assert.equal(store.lastMode, 'light', `${label}で全体を読んだ`);
  assert.equal(store.lastAttempts, 1, `${label}で全体を読み直した（終わった年の試合に触った）`);
};
// 手続き中なら抜けるまで進める（編成の保存はシーズン中に見る）
await quiet(async () => {
  for (let guard = 0; guard < 20 && (await view()).status !== 'running'; guard++) await send('resolve');
});
v = await view();
assert.equal(v.status, 'running', '2年目のシーズンに入らない');
const lineup = v.lineup;
await lightOnly('編成の保存', () =>
  send('lineup', {
    ...lineup,
    battingOrder: lineup.battingOrder.map((e, i, all) => ({ ...e, battingOrder: all.length - i })),
    baseLineup: lineup,
  }),
);
await lightOnly('名前の変更', () => send('profile', { teamName: v.teamName, playerName: 'P1' }));
console.log(`online-past-games-check PASS（2年目・1年目の試合 ${Object.keys(bundle.league.records.seasons[1].games).length} 件は別の部分）`);
