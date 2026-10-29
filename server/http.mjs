import { requireOnline, OnlineError } from '../src/online/shared.js';
export function createHandler(
  service,
  { local = false, allowStep = false, authenticate, signIn, refresh, cronSecret } = {},
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
        value = { ...auth, ...(await service.login(auth.userId)) };
      } else if (action === 'refresh' && req.method === 'POST' && !local)
        value = await refresh(body);
      else {
        const userId = local
          ? req.headers.authorization?.replace(/^Bearer local:/, '')
          : await authenticate(req.headers.authorization);
        requireOnline(
          service.members.some((m) => m.userId === userId),
          'ログインしてください',
          401,
        );
        const sessionId = req.headers['x-online-session'];
        if (action === 'logout' && req.method === 'POST')
          value = await service.logout(userId, sessionId);
        else if (action === 'view' && req.method === 'GET')
          value = await service.view(userId, sessionId);
        else if (action === 'defaults' && req.method === 'GET')
          value = await service.defaults(userId, sessionId);
        else if (action === 'team' && req.method === 'GET')
          value = await service.teamInfo(userId, url.searchParams.get('team'));
        else if (action === 'player' && req.method === 'GET')
          value = await service.playerInfo(userId, url.searchParams.get('id'));
        else if (action === 'games' && req.method === 'GET')
          value = await service.games(
            userId,
            Object.fromEntries(url.searchParams),
          );
        else if (action === 'game' && req.method === 'GET')
          value = await service.gameInfo(
            userId,
            url.searchParams.get('id'),
            url.searchParams.get('year'),
          );
        else if (action === 'command' && req.method === 'POST')
          value = await service.command(userId, sessionId, body);
        else throw new OnlineError('操作先が見つかりません', 404);
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
