// 保存一式を「芯」と「部分」に分けて持つ形（server/storage/snapshotParts.mjs）の検査。
//   - 分けて戻すと1文字も違わない（キーの順も含む）
//   - 編成・名前・ログインは軽い読み（世界を読まない）のまま済む
//   - 世界に触れたら全体でやり直す。例外を握りつぶされても、複製（structuredClone）でも取りこぼさない
//   - 本番の保存（SupabaseStore）: 古い形を読める／軽い読みでは世界を取りに行かない／
//     変わらない部分は上げ直さない／3世代より古い部分は消す
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createTestStore } from './lib/testStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { SupabaseStore } from '../../server/storage/supabaseStore.mjs';
import {
  splitBundle,
  assembleBundle,
  assembleLight,
  NeedsFullWorld,
} from '../../server/storage/snapshotParts.mjs';

const store = createTestStore('parts-check');
let now = '2026-10-28T00:00:00.000Z';
const service = new LeagueService(store, {
  local: true,
  adminId: 'a',
  members: [{ userId: 'a' }, { userId: 'b' }],
  clock: () => now,
});
const sessions = { a: (await service.login('a')).sessionId, b: (await service.login('b')).sessionId };
let seq = 0;
const send = async (user, type, payload) =>
  service.command(user, sessions[user], {
    requestId: `parts-check:${++seq}`,
    revision: (await service.view(user, sessions[user])).revision ?? 0,
    type,
    payload,
  });
await send('a', 'create');
assert.equal(store.lastMode, 'full', 'リーグの作成は全体で読む');
sessions.a = (await service.login('a')).sessionId;
assert.equal(store.lastMode, 'light', 'ログインは世界を読まない');

// --- 分けて戻すと元どおり（キーの順も含めて JSON が一致）
{
  const bundle = await store.read();
  const text = JSON.stringify(bundle);
  const { core, order, parts } = splitBundle(bundle);
  assert.equal(JSON.stringify(bundle), text, '分けても元の一式を変えない');
  assert.ok(parts.world, '世界を部分に出す');
  const names = bundle.league.season.settings.teamNames;
  assert.deepEqual(Object.keys(core.league.game.teams).sort(), [...names].sort(), '芯にはリーグの球団だけ');
  assert.ok(Object.keys(parts.world.teams).length > 100, 'リーグ外の球団は世界の部分へ');
  assert.equal(core.league.game.pools, undefined);
  const back = assembleBundle(JSON.parse(JSON.stringify(core)), order, JSON.parse(JSON.stringify(parts)));
  assert.equal(JSON.stringify(back), text, '戻すと1文字も違わない（球団の並びも同じ）');
  assert.ok(JSON.stringify(core).length * 3 < text.length, `芯が十分小さい（${JSON.stringify(core).length} / ${text.length}）`);
}

// --- 軽い読みの番人
{
  const bundle = await store.read();
  const { core, order, parts } = splitBundle(bundle);
  const refs = Object.fromEntries(Object.keys(parts).map((n) => [n, {}]));
  const fresh = () =>
    assembleLight(JSON.parse(JSON.stringify(core)), order, { records: parts.records }, refs);
  const names = bundle.league.season.settings.teamNames;
  const outside = Object.keys(parts.world.teams)[0];
  const touches = [
    ['リーグ外の球団', (b) => b.league.game.teams[outside]],
    ['球団の一覧', (b) => Object.keys(b.league.game.teams)],
    ['球団の有無', (b) => outside in b.league.game.teams],
    ['高校生の母集団', (b) => b.league.game.pools.highSchool],
    ['世界', (b) => JSON.stringify(b.league.game.world)],
    ['球団の追加', (b) => { b.league.game.teams.新球団 = {}; }],
  ];
  for (const [label, touch] of touches) {
    const run = fresh();
    assert.throws(() => touch(run.bundle), NeedsFullWorld, `${label}に触れたら止まる`);
    assert.ok(run.tracker.touched, `${label}: 印が残る`);
    assert.equal(run.inspect(run.bundle), null, `${label}: 軽い読みのまま保存しない`);
  }
  // 番人は元の形（配列かどうか）を名乗る。`Array.isArray` は番人を通らないので、違うと黙って分岐が変わる
  {
    const run = fresh();
    for (const key of ['pools', 'world', 'released'])
      assert.equal(Array.isArray(run.bundle.league.game[key]), Array.isArray(bundle.league.game[key]), `${key} の形`);
    assert.equal(run.tracker.touched, null, '形を見るだけでは触れたことにならない');
  }
  // null などの値は部分に出さず芯に残す（番人に差し替えると真偽が逆になる）
  {
    const odd = structuredClone(bundle);
    odd.league.game.released = null;
    odd.backup = null;
    const split = splitBundle(odd);
    assert.equal(split.core.league.game.released, null);
    assert.equal(split.core.backup, null);
    assert.equal(split.parts.backup, undefined);
    const oddRefs = Object.fromEntries(Object.keys(split.parts).map((n) => [n, {}]));
    const run = assembleLight(JSON.parse(JSON.stringify(split.core)), split.order, { records: split.parts.records }, oddRefs);
    assert.equal(run.bundle.league.game.released, null, 'null は null のまま見える');
    assert.equal(run.bundle.backup, null);
    run.bundle.league.revision += 1;
    const out = run.inspect(run.bundle);
    assert.ok(out, 'null の項目があっても軽い読みのまま保存できる');
    assert.equal(out.core.league.game.released, null);
    assert.equal(out.core.backup, null);
    odd.league.revision += 1;
    assert.equal(
      JSON.stringify(assembleBundle(JSON.parse(JSON.stringify(out.core)), out.order, { ...split.parts, records: out.records })),
      JSON.stringify(odd),
      'null の項目も元どおりに戻る',
    );
  }
  // 例外を握りつぶしても印は残る
  const swallowed = fresh();
  try { swallowed.bundle.league.game.pools.x; } catch {}
  assert.equal(swallowed.inspect(swallowed.bundle), null, '握りつぶしても軽い読みのまま保存しない');
  // 複製は番人を通らずに落ちる（保存側が DataCloneError を見てやり直す）
  assert.throws(() => structuredClone(fresh().bundle.league), (e) => e.name === 'DataCloneError');
  // リーグの球団・手続きなどは自由に読み書きでき、保存する芯に入る
  const ok = fresh();
  ok.bundle.league.game.teams[names[0]].strategy = { batting: 'aggressive' };
  ok.bundle.league.revision += 1;
  assert.equal(names.every((n) => n in ok.bundle.league.game.teams), true);
  const prepared = ok.inspect(ok.bundle);
  assert.ok(prepared, '世界に触れなければ軽い読みのまま保存できる');
  assert.equal(prepared.core.league.game.teams[names[0]].strategy.batting, 'aggressive');
  assert.equal(prepared.core.league.revision, bundle.league.revision + 1);
  assert.equal(prepared.core.league.game.pools, undefined, '芯に番人を書き出さない');
  const merged = assembleBundle(JSON.parse(JSON.stringify(prepared.core)), prepared.order, { ...parts, records: prepared.records });
  bundle.league.game.teams[names[0]].strategy = { batting: 'aggressive' };
  bundle.league.revision += 1;
  assert.equal(JSON.stringify(merged), JSON.stringify(bundle), '軽い読みの保存を戻すと、全体で書いたのと同じ');
  // リーグを差し替えたら軽い読みのまま保存しない（全体で分け直す）
  const replaced = fresh();
  replaced.bundle.league = { ...replaced.bundle.league };
  assert.equal(replaced.inspect(replaced.bundle), null);
}

// --- 命令: 世界を読まない命令は軽い読みのまま、読む命令は全体でやり直して正しく済む
{
  for (let phase = 0; phase < 2; phase++)
    for (const user of ['a', 'b']) {
      const defaults = await service.defaults(user, sessions[user]);
      await send(user, 'submit', {
        phaseId: defaults.phaseId,
        plan: defaults.plan,
        ready: false,
        baseSubmission: (await service.view(user, sessions[user])).phase.submission,
      });
      assert.equal(store.lastMode, 'full', '提出は世界を読む（最初から全体で読む）');
      await send(user, 'submit', {
        phaseId: defaults.phaseId,
        plan: defaults.plan,
        ready: true,
        baseSubmission: (await service.view(user, sessions[user])).phase.submission,
      });
    }
  const view = await service.view('a', sessions.a);
  assert.equal(view.status, 'running', '全員の決定で手続きが解決する（世界を読むので全体でやり直す）');
  const before = await store.read();
  const lineup = view.lineup;
  const swapped = {
    ...lineup,
    battingOrder: lineup.battingOrder.map((e, i, all) => ({ ...e, battingOrder: all.length - i })),
    baseLineup: lineup,
  };
  await send('a', 'lineup', swapped);
  assert.equal(store.lastMode, 'light', '編成の保存は世界を読まない');
  await send('a', 'profile', { displayName: '分割検査', label: 'A' });
  assert.equal(store.lastMode, 'light', '名前の変更は世界を読まない');
  const after = await store.read();
  const { parts: beforeParts } = splitBundle(before);
  const { parts: afterParts } = splitBundle(after);
  assert.equal(JSON.stringify(afterParts.world), JSON.stringify(beforeParts.world), '軽い読みの保存で世界が変わらない');
  assert.deepEqual(
    (await service.view('a', sessions.a)).lineup.battingOrder.map((e) => e.playerId),
    swapped.battingOrder.map((e) => e.playerId),
    '軽い読みで保存した編成が読み直しで残る',
  );
  // ⚠ 守備位置の変更は世界を読む（`loadLeagueWorld`）。全体の印が無いと、
  //    軽く読んで番人に触り、毎回2回読んでいた
  {
    const league = (await store.read()).league;
    const me = league.members.find((m) => m.userId === 'a');
    const outfielder = league.game.teams[me.teamName].players.find(
      (p) => p.isActive !== false && ['left', 'center', 'right'].includes(p.position),
    );
    await send('a', 'convert', {
      playerId: outfielder.id,
      position: outfielder.position === 'left' ? 'right' : 'left',
    });
    assert.equal(store.lastMode, 'full', '守備位置の変更は世界を読む');
    assert.equal(store.lastAttempts, 1, '守備位置の変更を軽く読んでから全体で読み直している');
  }
  // 世界に触る処理を、全体の印なしで渡しても正しく済む（やり直し）
  const hsBefore = after.league.game.pools.highSchool.players.length;
  await store.transaction((b) => {
    b.league.game.pools.highSchool.players.pop();
    b.league.revision += 1;
  });
  assert.equal(store.lastMode, 'full');
  assert.equal((await store.read()).league.game.pools.highSchool.players.length, hsBefore - 1, 'やり直した全体の変更が残る');
  // 例外を握りつぶして世界に触っても、全体でやり直す（軽い読みの途中の変更は捨てる）
  let attempts = 0;
  await store.transaction((b) => {
    attempts++;
    b.league.notices.unshift({ type: 'parts-check', attempt: attempts });
    try { b.league.game.world.universityLeagues; } catch {}
  });
  assert.equal(attempts, 2, '握りつぶしても全体でやり直す');
  assert.equal((await store.read()).league.notices.filter((n) => n.type === 'parts-check').length, 1, '軽い読みの途中の変更は残らない');
  // 定期進行は最初から全体で読む
  now = new Date(Date.parse(view.nextAdvanceAt || now) + 60000).toISOString();
  await service.tick();
}

// --- 本番の保存（SupabaseStore）: Storage と RPC は手元のまねで動かす
{
  const objects = new Map();
  let row = { generation: 0, snapshot_path: null, previous_paths: [], sessions: {}, views: {} };
  let lease = null;
  const downloads = [];
  const uploads = [];
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    const body = options.headers['Content-Type'] === 'application/json' ? JSON.parse(options.body) : options.body;
    let value = null;
    if (path.endsWith('/online_claim')) {
      lease = body.p_token;
      value = [{ ...row }];
    } else if (path.endsWith('/online_release')) {
      lease = null;
    } else if (path.endsWith('/online_publish')) {
      assert.equal(lease, body.p_token);
      row = {
        generation: row.generation + 1,
        snapshot_path: body.p_path,
        previous_paths: [row.snapshot_path, ...row.previous_paths].filter(Boolean).slice(0, 2),
        views: body.p_views,
        sessions: body.p_sessions,
      };
      lease = null;
      value = true;
    } else if (path.endsWith('/online_control')) value = [row];
    else if (path === '/storage/v1/object/online-world') {
      for (const p of body.prefixes) objects.delete(p);
      value = {};
    } else if (path.startsWith('/storage/v1/object/online-world/')) {
      const key = path.split('/online-world/')[1];
      if (options.method === 'POST') {
        assert.ok(!objects.has(key));
        objects.set(key, body);
        uploads.push(key);
        value = {};
      } else {
        downloads.push(key);
        return objects.has(key) ? new Response(objects.get(key)) : new Response('{}', { status: 404 });
      }
    } else throw new Error(path);
    return new Response(JSON.stringify(value));
  };
  const supa = new SupabaseStore({ url: 'https://fixture.test', serviceKey: 'test-only', members: [{ userId: 'a' }], adminId: 'a', fetchImpl });
  // 古い形（bundle をまるごと1つ）を置いておく
  const legacy = await store.read();
  objects.set('snapshots/legacy.json.gz', gzipSync(JSON.stringify(legacy)));
  row.snapshot_path = 'snapshots/legacy.json.gz';
  assert.equal(JSON.stringify(await supa.read()), JSON.stringify(legacy), '古い形をそのまま読める');
  const team = legacy.league.members.find((m) => m.userId === 'a').teamName;
  const edit = (label) => (b) => {
    b.league.game.teams[team].strategy = { ...b.league.game.teams[team].strategy, note: label };
    b.league.revision += 1;
  };
  await supa.transaction(edit('1'));
  const first = JSON.parse(gunzipSync(objects.get(row.snapshot_path)));
  assert.equal(first.snapshotFormat, 2, '書くと分けた形になる');
  const worldPath = first.parts.world.path;
  const recordsPath = first.parts.records.path;
  const expected = structuredClone(legacy);
  expected.league.game.teams[team].strategy = { ...expected.league.game.teams[team].strategy, note: '1' };
  expected.league.revision += 1;
  assert.equal(JSON.stringify(await supa.read()), JSON.stringify(expected), '分けた形を読むと全体に戻る');
  downloads.length = 0;
  uploads.length = 0;
  await supa.transaction(edit('2'));
  assert.equal(downloads.some((p) => p === worldPath), false, '軽い読みでは世界を取りに行かない');
  assert.ok(downloads.includes(recordsPath), '記録はビューのために読む');
  assert.deepEqual(uploads.filter((p) => p.startsWith('parts/')), [], '変わらない部分は上げ直さない');
  const second = JSON.parse(gunzipSync(objects.get(row.snapshot_path)));
  assert.equal(second.parts.world.path, worldPath);
  assert.equal(second.parts.records.path, recordsPath);
  assert.ok(objects.get(row.snapshot_path).length * 3 < objects.get(worldPath).length, '芯は世界より十分小さい');
  assert.equal((await supa.read()).league.game.teams[team].strategy.note, '2');
  // 世界に触る命令は全体でやり直し、世界の部分を上げ直す。古い部分は3世代を過ぎたら消す
  await supa.transaction((b) => {
    b.league.game.pools.highSchool.players.pop();
    b.league.revision += 1;
  });
  const third = JSON.parse(gunzipSync(objects.get(row.snapshot_path)));
  assert.notEqual(third.parts.world.path, worldPath, '世界が変わったら上げ直す');
  assert.ok(objects.has(worldPath), '前の世代が指す部分は残す');
  for (let i = 3; i < 6; i++) await supa.transaction(edit(String(i)));
  assert.equal(objects.has(worldPath), false, '3世代より古い部分は消す');
  assert.ok(objects.has(third.parts.world.path), '今の世界は消さない');
  for (const p of [row.snapshot_path, ...row.previous_paths]) {
    const snap = JSON.parse(gunzipSync(objects.get(p)));
    for (const ref of Object.values(snap.parts)) assert.ok(objects.has(ref.path), '残す世代の部分はどれも残っている');
  }
  assert.equal((await supa.read()).league.game.teams[team].strategy.note, '5');
  // 画面の読み直し: 手元と同じ世代なら中身を送らない（`since`）。公開のたびに世代が上がる
  const viewer = new LeagueService(supa, { adminId: 'a', members: [{ userId: 'a' }] });
  const mySession = (await supa.read()).sessions.a;
  const whole = await viewer.view('a', mySession);
  assert.ok(Number.isInteger(whole.viewGeneration) && whole.teamName, 'ビューに世代が載る');
  const same = await viewer.view('a', mySession, whole.viewGeneration);
  assert.deepEqual(same, { unchanged: true, viewGeneration: whole.viewGeneration, writable: whole.writable }, '同じ世代なら中身を送らない');
  await supa.transaction(edit('6'));
  const next = await viewer.view('a', mySession, whole.viewGeneration);
  assert.equal(next.unchanged, undefined, '世代が変わったら中身を送る');
  assert.equal(next.viewGeneration, whole.viewGeneration + 1);
}
console.log('online-parts-check PASS（分けて戻すと一致・軽い読みの番人・命令ごとの読み方・本番の保存の世代と部分）');
