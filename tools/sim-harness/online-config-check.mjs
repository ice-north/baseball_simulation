// 設定不備の診断が「足りない変数の名前」を返し、**値を漏らさない**ことを検査する。
//
// ⚠ この検査を作る動機: `api/online.mjs` が構築時の例外を全部同じ503へ潰しており、
//    URL欠落・キー欠落・UUID重複・Cron秘密値の長さ不足が**すべて同じ文面**になっていた。
//    プログラマーでない人が本番環境を設定する前提なので、原因を切り分けられないと詰む。
// ⚠ 逆に、親切にしようとして**値まで出すと秘密値が漏れる**。名前だけ、を守らせる。
import assert from 'node:assert/strict';
import { missingOnlineConfig } from '../../server/production.mjs';
import handler from '../../api/online.mjs';

const FULL = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-xxx',
  SUPABASE_SERVICE_ROLE_KEY: 'service-xxx',
  ONLINE_ADMIN: 'uuid-1',
  ONLINE_CRON_SECRET: 'x'.repeat(32),
};

// 揃っていれば何も返さない
assert.deepEqual(missingOnlineConfig(FULL), []);

// 1つずつ欠けたとき、その名前だけが挙がる
assert.deepEqual(missingOnlineConfig({ ...FULL, SUPABASE_URL: undefined }), ['SUPABASE_URL']);
assert.deepEqual(missingOnlineConfig({ ...FULL, SUPABASE_ANON_KEY: '' }), ['SUPABASE_ANON_KEY']);
assert.deepEqual(missingOnlineConfig({ ...FULL, SUPABASE_SERVICE_ROLE_KEY: '' }), ['SUPABASE_SERVICE_ROLE_KEY']);
assert.deepEqual(missingOnlineConfig({ ...FULL, ONLINE_ADMIN: '' }), ['ONLINE_ADMIN']);

// ⚠ httpsでないURLは「設定済み」に見えるが使えない。欠落と同じ扱いにする
assert.deepEqual(missingOnlineConfig({ ...FULL, SUPABASE_URL: 'http://example.co' }), ['SUPABASE_URL']);

// ⚠ Cron秘密値は長さまで見る（短いと総当たりで進行を叩かれる）
assert.deepEqual(missingOnlineConfig({ ...FULL, ONLINE_CRON_SECRET: 'x'.repeat(31) }), [
  'ONLINE_CRON_SECRET(32文字以上が必要)',
]);

// 何も無いときは5件すべてを挙げる（1件ずつ直させない）
assert.equal(missingOnlineConfig({}).length, 5);

// --- 実際の応答 -------------------------------------------------
// ⚠ **値が本文に出ていないこと**をここで押さえる
for (const key of Object.keys(FULL)) delete process.env[key];
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'SECRET-ANON-VALUE';

const chunks = [];
const res = { statusCode: 0, setHeader() {}, end(body) { chunks.push(body); } };
await handler({ method: 'GET', url: '/api/online?action=config', headers: {} }, res);
const body = chunks.join('');
const payload = JSON.parse(body);

assert.equal(res.statusCode, 503);
assert.equal(payload.code, 'config');
assert.deepEqual(payload.missing, [
  'SUPABASE_SERVICE_ROLE_KEY',
  'ONLINE_ADMIN',
  'ONLINE_CRON_SECRET',
]);
assert.ok(!body.includes('SECRET-ANON-VALUE'), '秘密値が応答に漏れている');
assert.ok(!body.includes('example.supabase.co'), 'URLが応答に漏れている');

console.log('■ オンライン設定の診断: OK（不足5種の切り分け / 値を漏らさない）');
