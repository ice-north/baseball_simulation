// 招待リンクを実画面で通す（`src/online/Invites.jsx`）。
// 配布HTML（dist/index.html）を開き、通信は**本番と同じ HTTP の振り分け**（`server/http.mjs`）へ
// つなぐ。ローカル検証モードでは招待を使えないので、認証とアカウント作りだけ差し替える。
//
// 見ること:
//  - 管理者が「リーグ管理」→「招待リンクを作る」でリンクを得られる（未使用の一覧に載る）
//  - そのリンクを別の端末（スマホ）で開くと登録画面が出て、メールとパスワードを決めると
//    ログインした状態で「リーグに参加する」へ進む。URL から合言葉が消える
//  - 使ったリンクをもう一度開くと「使用済み」と出て、ログイン画面へ戻れる
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchBrowser, distHtml } from './lib/browser.mjs';
import { createTestStore } from './lib/testStore.mjs';
import { AUTH_KEY } from './lib/serviceRoute.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { createHandler } from '../../server/http.mjs';
import { failureShots } from './lib/failureShots.mjs';

const html = await distHtml();
const base = 'http://localhost:3000';
const shots = process.env.INVITE_UI_SHOTS || null;

const dir = await mkdtemp(join(tmpdir(), 'online-invite-ui-'));
const store = createTestStore(join(dir, 'league.json'));
const service = new LeagueService(store, {
  members: [{ userId: 'admin', label: '管理者' }],
  adminId: 'admin',
  clock: () => '2026-10-26T15:00:00.000Z',
});
const adminSession = (await service.login('admin')).sessionId;
await service.command('admin', adminSession, { requestId: 'create-0', revision: 0, type: 'create' });

// 本番の振り分けに、認証とアカウント作りだけ差し替えたもの
const accounts = new Map();
const handler = createHandler(service, {
  authenticate: async (header) => header?.replace(/^Bearer /, '') || null,
  signIn: async ({ email, password }) => {
    const account = accounts.get(email);
    if (!account || account.password !== password)
      throw Object.assign(new Error('認証に失敗しました'), { status: 401 });
    return { accessToken: account.id, refreshToken: 'r', expiresAt: Date.now() + 3600000, userId: account.id };
  },
  createAccount: async ({ email, password }) => {
    const id = `user-${accounts.size + 1}`;
    accounts.set(email, { id, password });
    return id;
  },
});
const serve = async (context) => {
  await context.route(`${base}/online*`, (route) =>
    route.request().url().includes('/api/')
      ? route.fallback()
      : route.fulfill({ contentType: 'text/html', body: html }),
  );
  await context.route('**/api/online?*', async (route) => {
    const request = route.request();
    let status = 200;
    let body = '';
    await handler(
      {
        method: request.method(),
        url: new URL(request.url()).pathname + new URL(request.url()).search,
        headers: { host: 'localhost:3000', ...request.headers() },
        body: request.method() === 'POST' ? request.postDataJSON() : undefined,
      },
      {
        setHeader() {},
        set statusCode(value) {
          status = value;
        },
        end(value) {
          body = value;
        },
      },
    );
    return route.fulfill({ status, contentType: 'application/json', body });
  });
};

const browser = await launchBrowser();
const errors = [];
try {
  // --- 管理者（PC）: リンクを作る ---------------------------------------
  const pc = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await pc.addInitScript(
    ({ key, auth }) => localStorage.setItem(key, JSON.stringify(auth)),
    { key: AUTH_KEY, auth: { userId: 'admin', sessionId: adminSession, accessToken: 'admin' } },
  );
  await pc.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await serve(pc);
  const p = await pc.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${base}/online`);
  await p.getByRole('button', { name: 'リーグ管理', exact: true }).first().click();
  await p.getByRole('heading', { name: '参加者を招待' }).waitFor();
  await p.getByText('ありません。').waitFor();
  await p.getByRole('button', { name: '招待リンクを作る', exact: true }).click();
  const field = p.getByLabel('招待リンク');
  await field.waitFor();
  const link = await field.inputValue();
  assert.match(link, /^http:\/\/localhost:3000\/online\?invite=[\w-]{30,}$/, 'リンクの形が違う');
  await p.getByRole('button', { name: 'コピー', exact: true }).click();
  await p.getByRole('button', { name: 'コピーしました', exact: true }).waitFor();
  assert.equal(await p.locator('.online-owner-list li').filter({ hasText: 'に作成' }).count(), 1, '未使用の一覧に載らない');
  if (shots)
    await p.getByRole('heading', { name: '参加者を招待' }).locator('..').screenshot({ path: `${shots}/invite-admin.png` });

  // --- 招待された人（スマホ）: 登録して参加へ ----------------------------
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await serve(phone);
  const m = await phone.newPage();
  m.on('pageerror', (e) => errors.push(e.message));
  await m.goto(link);
  await m.getByRole('heading', { name: 'リーグに招待されました' }).waitFor();
  await m.getByLabel('メールアドレス').fill('friend@example.test');
  await m.getByLabel('パスワード（8文字以上）').fill('password-123');
  await m.getByLabel('パスワード（確認）').fill('password-999');
  await m.getByText('パスワードが一致していません。').waitFor();
  assert.ok(await m.getByRole('button', { name: '登録して参加へ進む' }).isDisabled(), '食い違ったまま送れる');
  await m.getByLabel('パスワード（確認）').fill('password-123');
  if (shots) await m.screenshot({ path: `${shots}/invite-signup.png` });
  await m.getByRole('button', { name: '登録して参加へ進む' }).click();
  await m.getByRole('heading', { name: 'リーグに参加する' }).waitFor();
  assert.equal(new URL(m.url()).search, '', 'URL に合言葉が残っている');
  assert.equal(accounts.get('friend@example.test')?.id, 'user-1');
  if (shots) await m.screenshot({ path: `${shots}/invite-joined.png` });

  // --- 使ったリンクをもう一度開く ---------------------------------------
  const again = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await serve(again);
  const a = await again.newPage();
  await a.goto(link);
  await a.getByText('この招待リンクは使用済みです', { exact: false }).waitFor();
  await a.getByRole('button', { name: 'ログイン画面へ' }).click();
  await a.getByRole('button', { name: 'ログイン', exact: true }).waitFor();

  // 管理者の一覧からは消える（画面を開き直すと読み直す）
  await p.getByRole('button', { name: 'ホーム', exact: true }).first().click();
  await p.getByRole('button', { name: 'リーグ管理', exact: true }).first().click();
  await p.getByText('ありません。').waitFor();
  assert.deepEqual(errors, []);
  console.log('online-invite-ui-check: ok（管理者がリンクを作る / スマホで登録して参加画面へ / 使用済みは断る）');
} catch (error) {
  await failureShots(browser, 'online-invite-ui');
  throw error;
} finally {
  await browser.close();
}
