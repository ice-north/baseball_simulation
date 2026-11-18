// 招待リンクの検査（`server/invites.mjs`・`LeagueService` の招待・HTTP の入口）。
//
// 確かめること:
//   - 作れるのは管理者だけ。保存には合言葉そのものを残さない（ハッシュだけ）
//   - 1つのリンクで作れるアカウントは1つ。期限切れ・取り消し・使用済みは断る
//   - アカウントを作るのに失敗したら、リンクはもう一度使える
//   - 使用済みの印を付け損ねて押さえが残ったリンクは、時間が経っても使えるように戻らない
//   - 招待はリーグの版（revision）を上げない（送信中の提出を弾かない）
//   - 登録した人はそのままログインした状態になり、参加の画面（joinRequired）へ進む
//   - リーグが満員なら、アカウントを作る前に断る
import assert from 'node:assert/strict';
import { createTestStore } from './lib/testStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { createHandler } from '../../server/http.mjs';
import { claimInvite, createInvite, INVITE_CLAIM_MS, INVITE_DAYS, INVITE_OPEN_MAX } from '../../server/invites.mjs';

let now = '2026-11-18T00:00:00.000Z';
const store = createTestStore(`/tmp/pennant-invite-${process.pid}.gz`);
const service = new LeagueService(store, {
  members: [{ userId: 'admin', label: '管理者' }],
  adminId: 'admin',
  clock: () => now,
});
const adminSession = (await service.login('admin')).sessionId;
const otherSession = (await service.login('someone')).sessionId;

const rejects = async (promise, pattern, message) =>
  assert.rejects(promise, (error) => pattern.test(error.message), message);

// --- 作るのは管理者だけ ---------------------------------------------------
await rejects(service.inviteCommand('someone', otherSession, { type: 'create' }), /管理者だけ/, '参加者が招待を作れた');
await rejects(service.invites('someone', otherSession), /管理者だけ/, '参加者が招待の一覧を見られた');
await rejects(service.inviteCommand('admin', 'stale', { type: 'create' }), /別の端末/, '古い端末から招待を作れた');

const made = await service.inviteCommand('admin', adminSession, { type: 'create' });
assert.match(made.token, /^[\w-]{30,}$/);
assert.equal(made.invites.length, 1);
assert.equal(
  Date.parse(made.expiresAt) - Date.parse(now),
  INVITE_DAYS * 86400000,
  '期限が7日になっていない',
);
{
  const saved = JSON.stringify(await store.read());
  assert.ok(!saved.includes(made.token), '合言葉そのものが保存に残っている');
  const listed = await service.invites('admin', adminSession);
  assert.ok(!JSON.stringify(listed).includes('hash'), '一覧にハッシュが出ている');
}
assert.deepEqual(await service.checkInvite(made.token), { expiresAt: made.expiresAt });
await rejects(service.checkInvite('x'.repeat(32)), /正しくない/, 'でたらめな合言葉が通った');
await rejects(service.checkInvite('../'), /正しくありません/, '形の違う合言葉が通った');

// --- 作るのに失敗したら、もう一度使える -----------------------------------
await rejects(
  service.redeemInvite(made.token, async () => {
    throw new Error('このメールアドレスはもう登録されています');
  }),
  /もう登録/,
);
assert.deepEqual(await service.checkInvite(made.token), { expiresAt: made.expiresAt }, '失敗のあとリンクが使えなくなった');

// --- 同時に押しても1つしか作れない ----------------------------------------
{
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const first = service.redeemInvite(made.token, async () => {
    await gate;
    return 'guest-1';
  });
  // 1つ目がアカウントを作っている間（押さえ中）
  await new Promise((resolve) => setTimeout(resolve, 20));
  await rejects(service.redeemInvite(made.token, async () => 'guest-2'), /登録の途中/, '押さえ中に2つ目を作れた');
  release();
  assert.equal(await first, 'guest-1');
}
await rejects(service.redeemInvite(made.token, async () => 'guest-3'), /使用済み/, '使ったリンクでもう1つ作れた');
await rejects(service.checkInvite(made.token), /使用済み/);
assert.equal((await service.invites('admin', adminSession)).invites.length, 0, '使った招待が一覧に残っている');

// --- 期限切れ・取り消し ---------------------------------------------------
const old = await service.inviteCommand('admin', adminSession, { type: 'create' });
const revoked = await service.inviteCommand('admin', adminSession, { type: 'create' });
assert.equal(revoked.invites.length, 2);
const afterRevoke = await service.inviteCommand('admin', adminSession, { type: 'revoke', id: revoked.id });
assert.equal(afterRevoke.revoked, 1);
assert.deepEqual(afterRevoke.invites.map((i) => i.id), [old.id], '取り消したもの以外まで消えた');
await rejects(service.redeemInvite(revoked.token, async () => 'x'), /取り消されて/);
now = new Date(Date.parse(now) + INVITE_DAYS * 86400000 + 1000).toISOString();
await rejects(service.redeemInvite(old.token, async () => 'x'), /期限が切れて/);
assert.equal((await service.invites('admin', adminSession)).invites.length, 0, '期限切れが一覧に残っている');

// --- 使えない合言葉ではロックを取らない（ログイン前に誰でも叩ける入口） -------
{
  const original = store.transaction.bind(store);
  let locks = 0;
  store.transaction = (...args) => {
    locks += 1;
    return original(...args);
  };
  await rejects(service.redeemInvite('y'.repeat(32), async () => 'x'), /正しくない/);
  await rejects(service.redeemInvite(old.token, async () => 'x'), /期限が切れて/);
  await rejects(service.redeemInvite('../', async () => 'x'), /正しくありません/);
  store.transaction = original;
  assert.equal(locks, 0, '使えない合言葉で保存のロックを取った');
}

// --- 使用済みの印を付け損ねたら、押さえが古くなってもリンクは戻らない ------
{
  const bundle = { invites: [] };
  const { token } = createInvite(bundle, now);
  claimInvite(bundle, token, now); // ここで関数が止まった（印も外しも来ない）
  const later = new Date(Date.parse(now) + INVITE_CLAIM_MS + 1000).toISOString();
  assert.throws(() => claimInvite(bundle, token, later), /途中で止まり/, '止まった押さえのリンクで2つ目を作れた');
  const svc = new LeagueService(createTestStore(`/tmp/pennant-invite-stall-${process.pid}.gz`), { clock: () => later });
  svc.store.read = async () => bundle;
  svc.store.readLight = undefined;
  await rejects(svc.checkInvite(token), /途中で止まり/, '止まった押さえのリンクが開けた');
}

// --- 作りすぎの歯止め -----------------------------------------------------
{
  const bundle = { invites: [] };
  for (let i = 0; i < INVITE_OPEN_MAX; i += 1) createInvite(bundle, now);
  assert.throws(() => createInvite(bundle, now), /未使用の招待/);
}

// --- リーグが満員なら、アカウントを作る前に断る ---------------------------
{
  const bundle = {
    invites: [],
    league: {
      season: { settings: { teamNames: ['A', 'B'] } },
      members: [{ userId: 'a' }, { userId: 'b' }],
    },
  };
  const { token } = createInvite(bundle, now);
  assert.throws(() => claimInvite(bundle, token, now), /空いている球団がありません/);
  bundle.league.members.pop();
  assert.ok(claimInvite(bundle, token, now), '空きがあるのに断った');
}

// --- 招待はリーグの版を上げない -------------------------------------------
{
  const before = JSON.stringify((await store.read()).league);
  await service.inviteCommand('admin', adminSession, { type: 'create' });
  assert.equal(JSON.stringify((await store.read()).league), before, '招待でリーグが書き換わった');
}

// --- HTTP の入口: 登録してそのままログインした状態になる ---------------------
{
  const accounts = new Map();
  const handler = createHandler(service, {
    authenticate: async (header) => header?.replace(/^Bearer /, '') || null,
    signIn: async ({ email, password }) => {
      const account = accounts.get(email);
      if (!account || account.password !== password) throw Object.assign(new Error('認証に失敗しました'), { status: 401 });
      return { accessToken: account.id, refreshToken: 'r', expiresAt: Date.now() + 3600000, userId: account.id };
    },
    createAccount: async ({ email, password }) => {
      if (accounts.has(email)) throw Object.assign(new Error('このメールアドレスはもう登録されています'), { status: 409 });
      const id = `user-${accounts.size + 1}`;
      accounts.set(email, { id, password });
      return id;
    },
  });
  const call = async (method, query, body, auth) => {
    let status = 200;
    let text = '';
    await handler(
      {
        method,
        url: `/api/online?${new URLSearchParams(query)}`,
        headers: {
          host: 'example.test',
          ...(auth ? { authorization: `Bearer ${auth.accessToken}`, 'x-online-session': auth.sessionId } : {}),
        },
        body,
      },
      {
        setHeader() {},
        set statusCode(value) {
          status = value;
        },
        end(value) {
          text = value;
        },
      },
    );
    return { status, json: JSON.parse(text) };
  };
  const adminAuth = { accessToken: 'admin', sessionId: adminSession };
  const created = await call('POST', { action: 'invites' }, { type: 'create' }, adminAuth);
  assert.equal(created.status, 200, created.json.error);
  const token = created.json.token;
  const listed = await call('GET', { action: 'invites' }, undefined, adminAuth);
  assert.ok(listed.json.invites.some((i) => i.id === created.json.id));
  assert.equal((await call('GET', { action: 'inviteCheck', invite: token })).status, 200);

  const bad = await call('POST', { action: 'inviteRedeem' }, { invite: token, email: 'new@example.test', password: 'short' });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /8文字以上/);
  assert.equal((await call('GET', { action: 'inviteCheck', invite: token })).status, 200, '入力の誤りでリンクが使えなくなった');

  const ok = await call('POST', { action: 'inviteRedeem' }, { invite: token, email: 'new@example.test', password: 'password-123' });
  assert.equal(ok.status, 200, ok.json.error);
  assert.equal(ok.json.userId, 'user-1');
  assert.ok(ok.json.sessionId && ok.json.accessToken, 'ログインした状態で返っていない');
  const view = await call('GET', { action: 'view' }, undefined, ok.json);
  assert.equal(view.status, 200, view.json.error);
  assert.ok(view.json.joinRequired || view.json.setupRequired, '登録した人が参加の画面へ進めない');

  const again = await call('POST', { action: 'inviteRedeem' }, { invite: token, email: 'other@example.test', password: 'password-123' });
  assert.equal(again.status, 409);
  assert.equal(accounts.size, 1, '使ったリンクでアカウントが増えた');

  const local = createHandler(service, { local: true });
  let status = 0;
  await local(
    { method: 'POST', url: '/api/online?action=inviteRedeem', headers: { host: 'x' }, body: { invite: token, email: 'a@b.cd', password: 'password-123' } },
    { setHeader() {}, set statusCode(v) { status = v; }, end() {} },
  );
  assert.equal(status, 400, 'ローカル検証モードで招待が通った');
}

console.log('online-invite-check: ok');
