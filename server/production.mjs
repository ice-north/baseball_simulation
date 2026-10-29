import { SupabaseStore } from './storage/supabaseStore.mjs';
import { LeagueService } from './leagueService.mjs';
import { createHandler } from './http.mjs';
import { requireOnline } from '../src/online/shared.js';
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
  requireOnline(
    first && second && first !== second && anonKey && cronSecret?.length >= 32,
    'オンライン環境の初期設定が必要です',
    503,
  );
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
