// 読み込みを減らす仕組みの検査（画面は開かない）。
//   - 読むだけの窓口の覚え（src/online/readCache.js）: 版が同じ間だけ使う・終わった試合は版に関係なく使う・
//     同時の読み込みを1本にまとめる・失敗は覚えない・捨てたあとに返った古い答えを覚えない・古いものから捨てる
//   - 前回のビューを残す（src/online/savedView.js）: 同じ人・同じ端末のログインのときだけ出す・
//     参加前の画面は残さない・容量不足でも落ちない・端末のログインが別の人（ログアウト済み）なら書かない・
//     版（schema）の違うビューは出さない
//   - サーバーの試合一覧（projectGames）: 1回に返す数（size）・勝敗投手は id と名前だけ
import assert from 'node:assert/strict';
import { createReadCache } from '../../src/online/readCache.js';
import {
  readSavedView,
  saveView,
  forgetView,
  readSavedConfig,
  saveConfig,
  VIEW_KEY,
} from '../../src/online/savedView.js';
import { AUTH_KEY } from '../../src/online/api.js';
import { ONLINE_SCHEMA } from '../../src/online/shared.js';
import { projectGames } from '../../server/projection.mjs';
import { decisionRefs, gameSummary } from '../../server/recordedViews.mjs';

// --- 読むだけの窓口の覚え ------------------------------------------------
{
  const cache = createReadCache({ limit: 3 });
  let calls = 0;
  const load = (value) => async () => {
    calls++;
    return value;
  };
  const a = await cache.get('player', { id: 1 }, 5, load({ name: 'A' }));
  assert.equal((await cache.get('player', { id: 1 }, 5, load({ name: 'B' }))).name, 'A');
  assert.equal(calls, 1, '同じ版で同じものを取り直している');
  assert.equal(cache.peek('player', { id: 1 }, 5), a, '覚えた答えをすぐ出せない');
  assert.equal(cache.peek('player', { id: '1' }, 5), a, '数字と文字の指定で別のものとして覚えている');
  assert.equal(cache.peek('player', { id: 1 }, 6), undefined, '版が上がっても古い答えを出している');
  assert.equal((await cache.get('player', { id: 1 }, 6, load({ name: 'C' }))).name, 'C');
  assert.equal(calls, 2);
  // 終わった試合は版に関係なく使う
  await cache.get('game', { id: 9, year: 1 }, 6, load({ id: 9 }));
  assert.deepEqual(cache.peek('game', { year: 1, id: 9 }, 7), { id: 9 }, '終わった試合を版ごとに取り直している');
  // 同時の読み込みは1本
  let release;
  const gate = new Promise((r) => (release = r));
  let slow = 0;
  const slowLoad = async () => {
    slow++;
    await gate;
    return { ok: true };
  };
  const both = Promise.all([
    cache.get('team', { team: 'X' }, 6, slowLoad),
    cache.get('team', { team: 'X' }, 6, slowLoad),
  ]);
  release();
  await both;
  assert.equal(slow, 1, '同時に開いた同じ読み込みを2本送っている');
  // 失敗は覚えない
  await assert.rejects(cache.get('games', { page: 0 }, 6, async () => {
    throw new Error('通信失敗');
  }));
  assert.equal(cache.peek('games', { page: 0 }, 6), undefined, '失敗を覚えている');
  // 捨てたあと（ログインし直し）に返ってきた古い答えは覚えない
  let late;
  const lateGate = new Promise((r) => (late = r));
  const pending = cache.get('player', { id: 2 }, 6, async () => {
    await lateGate;
    return { name: '前の人' };
  });
  cache.clear();
  late();
  await pending;
  assert.equal(cache.peek('player', { id: 2 }, 6), undefined, 'ログインし直す前の答えを覚えている');
  // 上限を超えたら古いものから捨てる
  for (const id of [10, 11, 12, 13]) await cache.get('player', { id }, 6, load({ id }));
  assert.equal(cache.peek('player', { id: 10 }, 6), undefined, '古いものを捨てていない');
  assert.deepEqual(cache.peek('player', { id: 13 }, 6), { id: 13 });
}

// --- 前回のビューを残す --------------------------------------------------
{
  const entries = new Map();
  const storage = {
    getItem: (k) => entries.get(k) ?? null,
    setItem: (k, v) => entries.set(k, v),
    removeItem: (k) => entries.delete(k),
  };
  const me = { userId: 'a', sessionId: 's1', accessToken: 't' };
  // ⚠ 残すのは端末でいまログインしている人のビューだけ（ログインは同じ入れ物の AUTH_KEY）
  entries.set(AUTH_KEY, JSON.stringify(me));
  const view = { schema: ONLINE_SCHEMA, teamName: 'A', revision: 3, viewGeneration: 12 };
  saveView(me, view, storage);
  assert.deepEqual(readSavedView(me, storage), view, '残したビューが読めない');
  assert.equal(readSavedView({ ...me, sessionId: 's2' }, storage), null, '別の端末のログインで前のビューを出している');
  assert.equal(readSavedView({ ...me, userId: 'b' }, storage), null, '別の人に前のビューを出している');
  assert.equal(readSavedView(null, storage), null);
  saveView(me, { joinRequired: true, revision: 3 }, storage);
  assert.equal(entries.has(VIEW_KEY), false, '参加前の画面を残している');
  saveView(me, view, storage);
  forgetView(storage);
  assert.equal(readSavedView(me, storage), null, 'ログアウトしても残っている');
  entries.set(VIEW_KEY, '{壊れた');
  assert.equal(readSavedView(me, storage), null);
  // ⚠ **別のタブでログアウトしたあと、古いタブの読み直しが前の人のビューを書き戻さない**。
  //    以前は書き戻していて、ログアウトしたのに前の人の名簿・成績が端末に残った
  forgetView(storage);
  entries.delete(AUTH_KEY);
  saveView(me, view, storage);
  assert.equal(entries.has(VIEW_KEY), false, 'ログアウトしたあとに前の人のビューを書き戻している');
  // 別の人がログインし直した端末に、前の人のタブが書き込まない（今の人の残したビューも消さない）
  const other = { userId: 'b', sessionId: 's9', accessToken: 'u' };
  entries.set(AUTH_KEY, JSON.stringify(other));
  saveView(other, { ...view, teamName: 'B' }, storage);
  saveView(me, view, storage);
  assert.equal(readSavedView(other, storage)?.teamName, 'B', '別の人のタブが今の人の残したビューを上書きした');
  saveView(me, { joinRequired: true }, storage);
  assert.equal(readSavedView(other, storage)?.teamName, 'B', '別の人のタブが今の人の残したビューを消した');
  // ⚠ **版の違うビューは出さない**（ゲームを更新した直後に、前の形のビューを描いて落ちないように）
  entries.set(AUTH_KEY, JSON.stringify(me));
  saveView(me, { ...view, schema: ONLINE_SCHEMA - 1 }, storage);
  assert.equal(readSavedView(me, storage), null, '版の違うビューを出している');
  saveView(me, { ...view, schema: undefined }, storage);
  assert.equal(readSavedView(me, storage), null, '版の無いビューを出している');
  const full = { ...storage, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.doesNotThrow(() => saveView(me, view, full), '容量不足で落ちる');
  saveConfig({ local: false, allowStep: true }, storage);
  assert.deepEqual(readSavedConfig(storage), { local: false, allowStep: true });
}

// --- サーバーの試合一覧 --------------------------------------------------
{
  const pitcher = (id) => ({ id, name: `投手${id}`, batting: { meet: 1 }, pitching: { velocity: 150 }, seasonStats: {} });
  const games = Array.from({ length: 20 }, (_, i) => ({
    gameId: i + 1,
    date: { month: 4, day: i + 1 },
    home: i % 2 ? 'A' : 'B',
    away: i % 2 ? 'B' : 'A',
    result: {
      homeScore: 1,
      awayScore: 0,
      decisions: { winningPitcher: pitcher(i), losingPitcher: pitcher(100 + i), savePitcher: null, holdPitchers: [pitcher(200 + i)] },
    },
  }));
  const bundle = {
    league: {
      members: [{ userId: 'a', teamName: 'A' }],
      season: { year: 1, results: games },
      records: { seasons: {} },
    },
  };
  const first = projectGames(bundle, 'a', {});
  assert.equal(first.size, 6, '既定の1ページの数が変わった');
  assert.equal(first.games.length, 6);
  const all = projectGames(bundle, 'a', { size: '200' });
  assert.equal(all.games.length, 20, '1回にまとめて読めない');
  assert.equal(all.count, 20);
  assert.throws(() => projectGames(bundle, 'a', { size: '201' }), /不正/);
  assert.throws(() => projectGames(bundle, 'a', { size: '0' }), /不正/);
  const d = all.games[0].decisions;
  assert.deepEqual(d.winningPitcher, { id: 19, name: '投手19' }, '勝ち投手に選手まるごとを載せている');
  assert.deepEqual(d.holdPitchers, [{ id: 219, name: '投手219' }]);
  assert.equal(d.savePitcher, null);
  assert.equal(decisionRefs(null), null);
  assert.ok(JSON.stringify(gameSummary(games[0])).length < 400, '一覧の1試合が重い');
}

console.log('online-read-cache-check PASS（読むだけの窓口の覚え・前回のビュー・試合一覧の数と勝敗投手）');
