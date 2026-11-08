import assert from 'node:assert/strict';
import { AUTH_KEY } from '../../src/online/api.js';
import {
  readAuth,
  persistRefresh,
  clearAuth,
} from '../../src/online/authState.js';
import { cachedAuthenticate, AUTH_CACHE_MS } from '../../server/authCache.mjs';
const entries = new Map();
const storage = {
  getItem: (key) => entries.get(key) ?? null,
  setItem: (key, value) => entries.set(key, value),
  removeItem: (key) => entries.delete(key),
};
const old = { userId: 'a', sessionId: 'old', accessToken: 'access1' };
const newer = { ...old, sessionId: 'new', accessToken: 'access2' };
storage.setItem(AUTH_KEY, JSON.stringify(newer));
assert.equal(
  persistRefresh(old, { ...old, accessToken: 'late' }, storage),
  false,
);
assert.deepEqual(
  readAuth(storage),
  newer,
  '古いタブの更新が最新ログインを上書きしない',
);
clearAuth(old, storage);
assert.deepEqual(
  readAuth(storage),
  newer,
  '旧端末のログアウトで最新端末の情報を削除しない',
);
clearAuth(newer, storage);
assert.equal(
  persistRefresh(newer, { ...newer, accessToken: 'late' }, storage),
  false,
);
assert.equal(
  readAuth(storage),
  null,
  'ログアウト後の遅い応答で認証情報を復活させない',
);
storage.setItem(AUTH_KEY, JSON.stringify(old));
const fresh = { ...old, accessToken: 'fresh' };
assert.equal(persistRefresh(old, fresh, storage), true);
assert.equal(
  persistRefresh(old, { ...old, accessToken: 'late' }, storage),
  false,
);
assert.deepEqual(
  readAuth(storage),
  fresh,
  '同じセッションでも新しいトークンを巻き戻さない',
);
storage.setItem(AUTH_KEY, '{}');
assert.equal(readAuth(storage), null);

// --- サーバーの認証の覚え（server/authCache.mjs） ---------------------
{
  const jwt = (exp) =>
    `Bearer x.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.y`;
  let clock = 1_000_000_000_000;
  const calls = [];
  const authenticate = cachedAuthenticate(
    async (header) => {
      calls.push(header);
      if (header.includes('bad')) throw Object.assign(new Error('認証に失敗'), { status: 401 });
      return 'user-a';
    },
    { now: () => clock },
  );
  const long = jwt(clock / 1000 + 3600);
  assert.equal(await authenticate(long), 'user-a');
  assert.equal(await authenticate(long), 'user-a');
  assert.equal(calls.length, 1, '同じトークンを毎回 Supabase に聞いている');
  clock += AUTH_CACHE_MS + 1;
  await authenticate(long);
  assert.equal(calls.length, 2, '覚える時間を過ぎても聞き直さない');
  // 期限が覚える時間より先に来るトークンは、期限で聞き直す
  const short = jwt(clock / 1000 + 30);
  await authenticate(short);
  clock += 31_000;
  await authenticate(short);
  assert.equal(calls.length, 4, 'トークンの期限を過ぎても覚えたままにしている');
  // 失敗は覚えない
  await assert.rejects(() => authenticate('Bearer bad'));
  await assert.rejects(() => authenticate('Bearer bad'));
  assert.equal(calls.length, 6, '失敗した照会を覚えている');
}

console.log(
  'online-auth-check PASS（旧タブ・ログアウト・遅延更新・不正保存値・サーバーの認証の覚え）',
);
