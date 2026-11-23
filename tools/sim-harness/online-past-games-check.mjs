// 終わった年の試合の記録を別に保存する（先方回答 F1）の通し検査。
//   1年目を最後まで進めて2年目に入り、よく使う命令（ビュー・編成の保存・選手や球団を開く）が
//   **終わった年の試合の記録を読まずに**（軽い読みのまま）済むことを見る。
//   読んでしまうと、命令のたびに全体を読み直すことになり、分けた意味が無い。
//   node tools/sim-harness/online-past-games-check.mjs
import { quietAsync } from './lib/quiet.mjs';
import assert from 'node:assert/strict';
import { createTestStore } from './lib/testStore.mjs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { LeagueService } from '../../server/leagueService.mjs';
import { SupabaseStore } from '../../server/storage/supabaseStore.mjs';

const store = createTestStore('past-games-check');
const service = new LeagueService(store, { local: true, adminId: 'p1', members: [{ userId: 'p1' }] });
const session = (await service.login('p1')).sessionId;
let seq = 0;
const view = () => service.view('p1', session);
const send = async (type, payload) =>
  service.command('p1', session, { requestId: `past-games-${++seq}`, revision: (await view()).revision ?? 0, type, payload });

await quietAsync(async () => {
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
await quietAsync(async () => {
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

// 世界を読む処理（手で進める・定期進行）は、世界まで読んで**終わった年の試合だけ読まない**
// （`assembleWorld`）。終わった年の試合は1年で約22MBずつ増え、全部を読むと年々重くなっていた
const pastCount = Object.keys(bundle.league.records.seasons[1].games).length;
const worldOnly = async (label, fn) => {
  await quietAsync(fn);
  assert.equal(store.lastMode, 'world', `${label}で終わった年の試合まで読んだ`);
  assert.equal(store.lastAttempts, 1, `${label}で全部を読み直した（終わった年の試合に触った）`);
  const whole = await store.read();
  assert.equal(
    Object.keys(whole.league.records.seasons[1].games).length,
    pastCount,
    `${label}の保存の後、終わった年の試合が全体の読みで戻らない`,
  );
};
const dayBefore = JSON.stringify((await view()).currentDate);
await worldOnly('手で進める', () => send('step', { turns: 1 }));
{
  // 定期進行（`tick`）。リーグの写し（`cloneLeague`）が番人を複製しないこと
  const league = (await store.read()).league;
  const at = new Date(Date.parse(league.nextAdvanceAt) + 60000).toISOString();
  const ticker = new LeagueService(store, { local: true, adminId: 'p1', members: [{ userId: 'p1' }], clock: () => at });
  await worldOnly('定期進行', () => ticker.tick());
  assert.equal((await store.read()).league.status, 'running', '定期進行で止まった');
}
assert.notEqual(JSON.stringify((await view()).currentDate), dayBefore, '日が進まない');

// 本番の保存（SupabaseStore）でも、世界を読む処理は終わった年の試合を取りに行かず、上げ直さない。
// 触ったら全部を読み直して、その変更も残る
{
  const objects = new Map();
  let row = { generation: 0, snapshot_path: null, previous_paths: [], sessions: {}, views: {} };
  const downloads = [];
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    const body = options.headers['Content-Type'] === 'application/json' ? JSON.parse(options.body) : options.body;
    let value = null;
    if (path.endsWith('/online_claim')) value = [{ ...row }];
    else if (path.endsWith('/online_release')) value = null;
    else if (path.endsWith('/online_publish')) {
      row = {
        generation: row.generation + 1,
        snapshot_path: body.p_path,
        previous_paths: [row.snapshot_path, ...row.previous_paths].filter(Boolean).slice(0, 2),
        views: body.p_views,
        sessions: body.p_sessions,
      };
      value = true;
    } else if (path.endsWith('/online_control')) value = [row];
    else if (path === '/storage/v1/object/online-world') value = {};
    else if (path.startsWith('/storage/v1/object/online-world/')) {
      const key = path.split('/online-world/')[1];
      if (options.method === 'POST') {
        objects.set(key, body);
        value = {};
      } else {
        downloads.push(key);
        return objects.has(key) ? new Response(objects.get(key)) : new Response('{}', { status: 404 });
      }
    } else throw new Error(path);
    return new Response(JSON.stringify(value));
  };
  const supa = new SupabaseStore({ url: 'https://fixture.test', serviceKey: 'test-only', members: [{ userId: 'p1' }], adminId: 'p1', fetchImpl });
  const whole = await store.read();
  objects.set('snapshots/legacy.json.gz', gzipSync(JSON.stringify(whole)));
  row.snapshot_path = 'snapshots/legacy.json.gz';
  // 1回目で分けた形になる
  await supa.transaction((b) => { b.league.revision += 1; });
  const pastPath = JSON.parse(gunzipSync(objects.get(row.snapshot_path))).parts.pastGames?.path;
  assert.ok(pastPath, '前提: 終わった年の試合が別の部分にある');
  downloads.length = 0;
  let calls = 0;
  await supa.transaction((b) => {
    calls++;
    b.league.game.pools.highSchool.players.pop();
    b.league.notices.unshift({ type: 'past-games-check' });
    b.league.revision += 1;
  }, { full: true });
  assert.equal(calls, 1, '世界を読む処理を読み直した');
  assert.equal(downloads.includes(pastPath), false, '世界を読む処理が終わった年の試合を取りに行った');
  const snap = JSON.parse(gunzipSync(objects.get(row.snapshot_path)));
  assert.equal(snap.parts.pastGames.path, pastPath, '終わった年の試合を上げ直した');
  let back = await supa.read();
  assert.equal(Object.keys(back.league.records.seasons[1].games).length, pastCount, '終わった年の試合が戻らない');
  assert.equal(back.league.game.pools.highSchool.players.length, whole.league.game.pools.highSchool.players.length - 1, '世界の変更が残らない');
  assert.equal(back.league.notices[0].type, 'past-games-check');
  // 終わった年の試合に触ったら、全部を読み直してやり直す
  calls = 0;
  const firstGame = Object.keys(whole.league.records.seasons[1].games)[0];
  await supa.transaction((b) => {
    calls++;
    b.league.records.seasons[1].games[firstGame] = { ...b.league.records.seasons[1].games[firstGame], note: 'touched' };
    b.league.revision += 1;
  }, { full: true });
  assert.equal(calls, 2, '終わった年の試合に触っても読み直さない');
  back = await supa.read();
  assert.equal(back.league.records.seasons[1].games[firstGame].note, 'touched', '読み直した変更が残らない');
  assert.equal(Object.keys(back.league.records.seasons[1].games).length, pastCount);
}
console.log(`online-past-games-check PASS（2年目・1年目の試合 ${Object.keys(bundle.league.records.seasons[1].games).length} 件は別の部分）`);
