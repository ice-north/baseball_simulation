import assert from 'node:assert/strict';
import { AUTH_KEY } from '../../src/online/api.js';
import {
  readAuth,
  persistRefresh,
  clearAuth,
} from '../../src/online/authState.js';
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
console.log(
  'online-auth-check PASS（旧タブ・ログアウト・遅延更新・不正保存値）',
);
