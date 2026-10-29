import { SupabaseStore } from './storage/supabaseStore.mjs';
import { LeagueService } from './leagueService.mjs';
import { createHandler } from './http.mjs';
import { requireOnline, OnlineError } from '../src/online/shared.js';

/**
 * 不足・不正なサーバー環境変数の**名前**を返す。
 *
 * ⚠ **値は絶対に含めないこと**。返すのは変数名と、長さなどの条件だけ。
 * ⚠ `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` もここで見る。
 *    以前は `SupabaseStore` の中まで行って別のメッセージで落ちており、
 *    呼び出し元の `api/online.mjs` が全部同じ503へ潰していた。
 */
export function missingOnlineConfig(env = process.env) {
  const missing = [];
  if (!env.SUPABASE_URL?.startsWith('https://')) missing.push('SUPABASE_URL');
  if (!env.SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!env.ONLINE_MEMBER_1) missing.push('ONLINE_MEMBER_1');
  if (!env.ONLINE_MEMBER_2) missing.push('ONLINE_MEMBER_2');
  else if (env.ONLINE_MEMBER_1 === env.ONLINE_MEMBER_2) {
    missing.push('ONLINE_MEMBER_2(ONLINE_MEMBER_1と同じ値)');
  }
  if (!env.ONLINE_CRON_SECRET) missing.push('ONLINE_CRON_SECRET');
  else if (env.ONLINE_CRON_SECRET.length < 32) {
    missing.push('ONLINE_CRON_SECRET(32文字以上が必要)');
  }
  return missing;
}
let handler;
export function productionHandler() {
  if (handler) return handler;
  const {
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    SUPABASE_ANON_KEY: anonKey,
    ONLINE_MEMBER_1: first,
    ONLINE_MEMBER_2: second,
    ONLINE_CRON_SECRET: cronSecret,
  } = process.env;
  const missing = missingOnlineConfig(process.env);
  if (missing.length) {
    const error = new OnlineError(
      'オンライン環境の初期設定が必要です',
      503,
      'config',
    );
    error.missing = missing;
    throw error;
  }
  const members = [
    { userId: first, label: 'プレイヤー1' },
    { userId: second, label: 'プレイヤー2' },
  ];
  const store = new SupabaseStore({ url, serviceKey, members, adminId: first });
  const service = new LeagueService(store, { members, adminId: first });
  const auth = async (path, options = {}) => {
    const response = await fetch(`${url}/auth/v1/${path}`, {
      ...options,
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
    requireOnline(
      response.ok,
      '認証に失敗しました。ログインし直してください',
      401,
      'auth',
    );
    return response.json();
  };
  const tokenView = (result) => ({
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: Date.now() + result.expires_in * 1000,
    userId: result.user.id,
  });
  handler = createHandler(service, {
    cronSecret,
    authenticate: async (header) => {
      requireOnline(
        /^Bearer [^ ]+$/.test(header || ''),
        'ログインしてください',
        401,
      );
      return (await auth('user', { headers: { Authorization: header } })).id;
    },
    signIn: async (body) => {
      requireOnline(
        typeof body?.email === 'string' && typeof body?.password === 'string',
        'メールアドレスとパスワードを入力してください',
      );
      return tokenView(
        await auth('token?grant_type=password', {
          method: 'POST',
          body: JSON.stringify({ email: body.email, password: body.password }),
        }),
      );
    },
    refresh: async (body) => {
      requireOnline(
        typeof body?.refreshToken === 'string',
        'ログインし直してください',
        401,
      );
      return tokenView(
        await auth('token?grant_type=refresh_token', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: body.refreshToken }),
        }),
      );
    },
  });
  return handler;
}
