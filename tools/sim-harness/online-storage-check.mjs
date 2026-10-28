import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { SupabaseStore } from '../../server/storage/supabaseStore.mjs';
import { createHandler } from '../../server/http.mjs';
import { Readable } from 'node:stream';
let row = { generation: 0, snapshot_path: null, previous_paths: [], sessions: {}, views: {} };
const objects = new Map(); let lease = null; let rejectPublish = false; let loseResponse = false; let gets = 0;
const fetchImpl = async (url, options) => {
  const path = new URL(url).pathname;
  const body = options.headers['Content-Type'] === 'application/json' ? JSON.parse(options.body) : options.body;
  let value;
  if (path.endsWith('/online_claim')) { if (lease) value = []; else { lease = body.p_token; value = [{ ...row }]; } }
  else if (path.endsWith('/online_release')) { if (lease === body.p_token) lease = null; value = null; }
  else if (path.endsWith('/online_publish')) {
    if (rejectPublish) { value = false; lease = null; }
    else {
      assert.equal(lease, body.p_token); assert.equal(row.generation, body.p_generation);
      row = { generation: row.generation + 1, snapshot_path: body.p_path, previous_paths: [row.snapshot_path, ...row.previous_paths].filter(Boolean).slice(0, 2), views: body.p_views, sessions: body.p_sessions }; lease = null; value = true;
      if (loseResponse) { loseResponse = false; throw new Error('応答喪失'); }
    }
  } else if (path.endsWith('/online_control')) value = [row];
  else if (path === '/storage/v1/object/online-world') { for (const p of body.prefixes) objects.delete(p); value = {}; }
  else if (path.startsWith('/storage/v1/object/online-world/')) {
    const key = path.split('/online-world/')[1];
    if (options.method === 'POST') { assert.ok(!objects.has(key)); objects.set(key, body); value = {}; }
    else { gets++; return new Response(objects.get(key)); }
  } else throw new Error(path);
  return new Response(JSON.stringify(value));
};
const store = new SupabaseStore({ url: 'https://fixture.test', serviceKey: 'test-only', members: [{ userId: 'a' }, { userId: 'b' }], adminId: 'a', fetchImpl });
await store.transaction(b => { b.sessions.a = 'session'; return { value: 1 }; });
assert.equal((await store.read()).sessions.a, 'session');
const count = gets;
assert.equal((await store.readView('a', 'session')).setupRequired, true);
assert.equal(gets, count, '閲覧で巨大スナップショットを読まない');
await assert.rejects(store.transaction(b => { b.sessions.a = 'bad'; throw new Error('failed'); }));
assert.equal((await store.read()).sessions.a, 'session');
rejectPublish = true;
await assert.rejects(store.transaction(b => { b.sessions.a = 'expired'; }), error => error.code === 'lease');
assert.equal((await store.read()).sessions.a, 'session', '期限切れの処理は公開されない');
rejectPublish = false; loseResponse = true;
await assert.rejects(store.transaction(b => { b.sessions.a = 'committed'; }));
assert.equal((await store.read()).sessions.a, 'committed', '公開応答を失っても公開済みオブジェクトを削除しない');
for (let i = 0; i < 5; i++) await store.transaction(b => { b.sessions.a = String(i); });
assert.equal(row.previous_paths.length, 2);
// 失敗時に残す未参照オブジェクト以外は3世代だけ。公開済み世代はすべて存在する。
for (const p of [row.snapshot_path, ...row.previous_paths]) assert.ok(objects.has(p));
lease = 'other';
await assert.rejects(store.transaction(() => {}), error => error.code === 'busy'); lease = null;
// HTTP認証、メソッド、JSON/CORS、ユーザーID偽装の入口を確認する。
const handler = createHandler({ members: [{ userId: 'a' }], view: async () => ({ ok: true }) }, { local: false, authenticate: async header => { assert.equal(header, 'Bearer valid'); return 'a'; }, cronSecret: 'secret' });
async function http(action, method, body, headers = {}) {
  const req = Readable.from(body ? [body] : []); Object.assign(req, { url: `/?action=${action}`, method, headers: { host: 'site.test', authorization: 'Bearer valid', ...headers } });
  const res = { statusCode: 200, setHeader() {}, end(v) { this.body = JSON.parse(v); } }; await handler(req, res); return res;
}
assert.equal((await http('view', 'GET')).statusCode, 200);
assert.equal((await http('view', 'GET', null, { origin: 'https://other.test' })).statusCode, 403);
assert.equal((await http('command', 'POST', '{')).statusCode, 400);
assert.equal((await http('tick', 'POST', '{}')).statusCode, 401);
assert.equal((await http('view', 'DELETE')).statusCode, 405);
console.log('online-storage-check PASS（Storage公開境界・リース失効・応答喪失・小さい閲覧・HTTP入口 / 外部サービスはfixture）');
