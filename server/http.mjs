import { requireOnline, OnlineError } from '../src/online/shared.js';
export function createHandler(
  service,
  {
    local = false,
    allowStep = false,
    authenticate,
    signIn,
    refresh,
    cronSecret,
    // 招待リンクからアカウントを作る（本番は Supabase の管理API。`production.mjs`）
    createAccount,
  } = {},
) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(req.url, 'http://localhost');
      const action = url.searchParams.get('action') || 'view';
      requireOnline(
        ['GET', 'POST'].includes(req.method),
        '未対応のメソッドです',
        405,
      );
      // ブラウザからのクロスオリジン書き込みを拒否する。Bearer認証も必須。
      if (req.headers.origin)
        requireOnline(
          new URL(req.headers.origin).host === req.headers.host ||
            (local &&
              ['http://localhost:3000', 'http://127.0.0.1:3000'].includes(
                req.headers.origin,
              )),
          '別サイトから操作できません',
          403,
        );
      let body = req.body;
      if (req.method === 'POST' && body === undefined) {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          chunks.push(buffer);
          bytes += buffer.length;
          requireOnline(bytes <= 64000, '送信内容が大きすぎます', 413);
        }
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          body = raw ? JSON.parse(raw) : {};
        } catch {
          throw new OnlineError('JSONが不正です');
        }
      }
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          throw new OnlineError('JSONが不正です');
        }
      }
      if (body)
        requireOnline(
          Buffer.byteLength(JSON.stringify(body)) <= 64000,
          '送信内容が大きすぎます',
          413,
        );
      let value;
      if (action === 'config' && req.method === 'GET')
        value = { local, allowStep: allowStep || local };
      else if (action === 'tick') {
        requireOnline(
          req.method === 'POST' &&
            cronSecret &&
            req.headers.authorization === `Bearer ${cronSecret}`,
          '定期処理の認証が必要です',
          401,
        );
        value = await service.tick();
      } else if (action === 'login' && req.method === 'POST') {
        let auth;
        if (local) {
          requireOnline(
            ['player1', 'player2'].includes(body?.user),
            'テスト用参加者を選んでください',
            401,
          );
          auth = { userId: body.user, accessToken: `local:${body.user}` };
        } else auth = await signIn(body);
        // ⚠ 端末の種類（アプリは 'app'）。ブラウザ1台とアプリ1台まで同時に操作できる
        value = { ...auth, ...(await service.login(auth.userId, body?.client)) };
      } else if (action === 'inviteCheck' && req.method === 'GET')
        // 招待リンクを開いたとき（ログイン前）。まだ使えるかだけ返す
        value = await service.checkInvite(url.searchParams.get('invite'));
      else if (action === 'inviteRedeem' && req.method === 'POST') {
        // ⚠ **ログイン前に通す唯一の書き込み**。合言葉（招待リンク）が無いと何もできない。
        //    公開サインアップは無効のままで、アカウントはサーバーが管理者の鍵で作る
        requireOnline(
          !local && createAccount,
          'ローカル検証モードでは招待リンクを使えません',
          400,
        );
        const email = typeof body?.email === 'string' ? body.email.trim() : '';
        const password = typeof body?.password === 'string' ? body.password : '';
        requireOnline(
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254,
          'メールアドレスを正しく入力してください',
        );
        requireOnline(password.length >= 8, 'パスワードは8文字以上にしてください');
        requireOnline(password.length <= 72, 'パスワードは72文字以下にしてください');
        await service.redeemInvite(body?.invite, () =>
          createAccount({ email, password }),
        );
        const auth = await signIn({ email, password });
        value = { ...auth, ...(await service.login(auth.userId, body?.client)) };
      } else if (action === 'refresh' && req.method === 'POST' && !local)
        value = await refresh(body);
      else {
        const userId = local
          ? req.headers.authorization?.replace(/^Bearer local:/, '')
          : await authenticate(req.headers.authorization);
        // ⚠ **ここで参加者かどうかを見ないこと**。`service.members` は
        //    リーグを作るときの種（管理者1人）でしかなく、招待で増えた人は
        //    入っていない。ここで弾くと、参加した人が全リクエストで401になる
        //    （実機で踏んだ。検査は service を直接叩くのでこの層を通らない）。
        //    ここで確かめるのは「本人であること」だけ。
        //    何ができるかは `LeagueService` 側が参加者一覧を見て決める。
        requireOnline(userId, 'ログインしてください', 401);
        const sessionId = req.headers['x-online-session'];
        value = await routeSignedIn(service, {
          action,
          method: req.method,
          url,
          body,
          userId,
          sessionId,
        });
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(value));
    } catch (error) {
      res.statusCode = error.status || 503;
      if (!error.status) console.error('online request failed:', error.stack);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: error.status
            ? error.message
            : 'サーバー処理に失敗しました。再読込して状態を確認してください',
          code: error.code || 'server',
        }),
      );
    }
  };
}

/**
 * ログインした人の操作の振り分け（`?action=…`）。本人の確かめ（`userId`）は呼ぶ側で済ませておく。
 * ⚠ 検査が画面の通信を検査の中の service へつなぐとき（`tools/sim-harness/lib/serviceRoute.mjs`）も
 *    これを使う。写しを持つと、足した操作が検査の側だけ 404 になる
 */
export function routeSignedIn(service, { action, method, url, body, userId, sessionId }) {
  if (action === 'logout' && method === 'POST')
    return service.logout(userId, sessionId);
  if (action === 'view' && method === 'GET')
    return service.view(
      userId,
      sessionId,
      // 手元のビューの世代（`viewGeneration`）。同じなら中身を送らない
      /^\d+$/.test(url.searchParams.get('since') || '')
        ? Number(url.searchParams.get('since'))
        : null,
    );
  if (action === 'defaults' && method === 'GET')
    return service.defaults(userId, sessionId);
  if (action === 'team' && method === 'GET')
    return service.teamInfo(userId, url.searchParams.get('team'));
  if (action === 'player' && method === 'GET')
    return service.playerInfo(userId, url.searchParams.get('id'));
  if (action === 'games' && method === 'GET')
    return service.games(
      userId,
      Object.fromEntries(url.searchParams),
    );
  if (action === 'game' && method === 'GET')
    return service.gameInfo(
      userId,
      url.searchParams.get('id'),
      url.searchParams.get('year'),
    );
  // 取引の記録（トレード・退団・入団）。`year` で年度を選ぶ
  if (action === 'transactions' && method === 'GET')
    return service.transactions(
      userId,
      Object.fromEntries(url.searchParams),
    );
  // 画面を開いた・アプリに戻った（最後に来た時刻。おるすばんを解く）
  if (action === 'presence' && method === 'POST')
    return service.presence(userId, sessionId);
  // 招待リンク（管理者だけ）。一覧と、作る・取り消す
  if (action === 'invites' && method === 'GET')
    return service.invites(userId, sessionId);
  if (action === 'invites' && method === 'POST')
    return service.inviteCommand(userId, sessionId, body);
  if (action === 'command' && method === 'POST')
    return service.command(userId, sessionId, body);
  throw new OnlineError('操作先が見つかりません', 404);
}
