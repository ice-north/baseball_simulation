import { createHash } from 'node:crypto';

/**
 * 認証（アクセストークン → 利用者ID）の答えを、同じ関数の中でしばらく覚えておく。
 *
 * 【なぜ】画面を開くたび・選手を押すたびに、Supabase の認証（`/auth/v1/user`）へ
 *   1往復していた。読み込みの待ちの一部はこの往復で、答えはトークンが同じ間は変わらない。
 *
 * ⚠ **トークンの期限（JWT の exp）より長く覚えないこと**。期限の過ぎたトークンは
 *    必ず Supabase に聞き直し、そこで 401 になる（端末はトークンを更新し直す）。
 * ⚠ 覚えるのは本人だと確かめられた答えだけ。失敗（401・障害）は覚えない。
 * ⚠ 書き込みは別に端末のセッション（`X-Online-Session`）を照合するので、ここで少し古い答えを
 *    使っても、締め出した端末から書けるようにはならない。
 */
export const AUTH_CACHE_MS = 5 * 60000;
const AUTH_CACHE_MAX = 500;

/** `Bearer <JWT>` の期限（ミリ秒）。読めなければ null（そのときは `ttl` だけで切る） */
export function tokenExpiresAt(header) {
  try {
    const payload = String(header).split(' ')[1].split('.')[1];
    const exp = JSON.parse(Buffer.from(payload, 'base64url').toString()).exp;
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * @param lookup 本当の照会（`header` → 利用者ID）。例外はそのまま呼んだ側へ返す
 */
export function cachedAuthenticate(lookup, { now = Date.now, ttl = AUTH_CACHE_MS, max = AUTH_CACHE_MAX } = {}) {
  const cache = new Map();
  return async (header) => {
    // トークンそのものは鍵にしない（覚えておく表にトークンを並べない）
    const key = createHash('sha256').update(String(header)).digest('hex');
    const hit = cache.get(key);
    if (hit && hit.until > now()) return hit.userId;
    if (hit) cache.delete(key);
    const userId = await lookup(header);
    const at = now();
    const until = Math.min(at + ttl, tokenExpiresAt(header) ?? Infinity);
    if (userId && until > at) {
      cache.set(key, { userId, until });
      // 古いものから捨てる（Map は入れた順）
      while (cache.size > max) cache.delete(cache.keys().next().value);
    }
    return userId;
  };
}
