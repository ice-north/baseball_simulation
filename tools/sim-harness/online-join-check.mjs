// 招待と参加をAPIの経路で通す検査。
//
// ⚠ 主目的は「**招待された人が実際に入れること**」。
//    参加の道には鶏と卵の罠がある——参加するにはログインが要るが、
//    ログインに参加者であることを求めると、招待された人は永遠に入れない。
//    ここでその経路を丸ごと通す。
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../../server/storage/fileStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { PYRAMID_LEAGUES } from '../../src/online/pyramidLeague.js';

const dir = await mkdtemp(join(tmpdir(), 'pennant-join-'));
try {
  const store = new FileStore(join(dir, 'state.gz'));
  const service = new LeagueService(store, {
    members: [{ userId: 'admin', label: '管理者' }],
    adminId: 'admin',
    clock: () => '2026-10-30T00:00:00.000Z',
  });

  const adminSession = (await service.login('admin')).sessionId;
  const run = (userId, sessionId, type, revision, payload) =>
    service.command(userId, sessionId, {
      requestId: `${type}-${revision}-${userId}`,
      revision,
      type,
      payload,
    });

  // --- リーグを作る（管理者だけ） -----------------------------------
  await run('admin', adminSession, 'create', 0);
  let view = await service.view('admin', adminSession);
  assert.ok(view.teamName, '管理者に球団が割り当たる');
  const bottomTier = Math.max(...PYRAMID_LEAGUES.map((l) => l.tier));
  const league0 = (await store.read()).league;
  assert.equal(
    league0.teams.find((t) => t.name === view.teamName).league,
    PYRAMID_LEAGUES.find((l) => l.tier === bottomTier).id,
    '最下層から始まる',
  );

  // --- 招待されていない人 -------------------------------------------
  // ⚠ ログインは通る（通さないとコードを入れる画面に来られない）
  const guestSession = (await service.login('guest')).sessionId;
  const guestView = await service.view('guest', guestSession);
  assert.ok(guestView.joinRequired, '参加前は「参加が必要」と返す');
  assert.ok(!guestView.teamName, '球団はまだ持たない');
  assert.equal(guestView.isAdmin, false);

  // コード無しでは入れない
  await assert.rejects(
    () => run('guest', guestSession, 'join', guestView.revision, { code: 'XXXXXXXX' }),
    /招待コードが違います/,
  );

  // --- 管理者が招待コードを発行 --------------------------------------
  // ⚠ 管理者以外は作れない
  const guestRevision = (await service.view('guest', guestSession)).revision;
  await assert.rejects(
    () => run('guest', guestSession, 'invite', guestRevision),
    /管理者だけ/,
  );
  let adminView = await service.view('admin', adminSession);
  await run('admin', adminSession, 'invite', adminView.revision);
  const league1 = (await store.read()).league;
  assert.equal(league1.invites.length, 1, '招待コードが1つ増える');
  // ⚠ **revision が進むこと**。楽観ロックの要で、進め忘れると2人が同時に
  //    操作したとき片方が黙って消える。操作ごとに直接押さえる
  //    （「2回目の発行が効くか」だけで見ていたら、join 側の進め忘れを
  //    まったく検出できなかった）。
  assert.ok(league1.revision > league0.revision, '発行で revision が進む');
  const code = league1.invites[0].code;
  assert.equal(code.length, 8);
  assert.equal(league1.invites[0].usedBy, null, '未使用で発行される');

  // --- 招待された人が参加する ----------------------------------------
  const before = league1.members.length;
  await run('guest', guestSession, 'join', league1.revision, {
    code,
    teamName: '多摩川ブリーズ',
  });
  const league2 = (await store.read()).league;
  assert.equal(league2.members.length, before + 1, '参加者が増える');
  assert.ok(league2.revision > league1.revision, '参加で revision が進む');
  const joined = league2.members.find((m) => m.userId === 'guest');
  assert.ok(joined, '参加者として記録される');
  assert.equal(joined.displayName, '多摩川ブリーズ');
  // ⚠ 内部名は引き継いだ球団のまま（記録の選手キーが迷子になるため）
  assert.ok(
    league2.teams.some(
      (t) => t.name === joined.teamName && t.displayName === '多摩川ブリーズ',
    ),
    '表示名だけを付け替える',
  );
  assert.equal(league2.teams.length, 12, '球団数は変わらない');
  assert.equal(
    league2.teams.find((t) => t.name === joined.teamName).league,
    PYRAMID_LEAGUES.find((l) => l.tier === bottomTier).id,
    '途中参加は最下層に入る',
  );

  // 参加後は自分の球団が見える
  const afterView = await service.view('guest', guestSession);
  assert.ok(!afterView.joinRequired, '参加後は「参加が必要」を返さない');
  assert.equal(afterView.teamName, joined.teamName);

  // --- 招待コードは使い捨て -------------------------------------------
  const other = (await service.login('other')).sessionId;
  await assert.rejects(
    () => run('other', other, 'join', league2.revision, { code }),
    /使用済み/,
  );
  // 同じ人が二重に参加できない（新しいコードでも）
  adminView = await service.view('admin', adminSession);
  await run('admin', adminSession, 'invite', adminView.revision);
  const league3 = (await store.read()).league;
  const code2 = league3.invites.find((i) => !i.usedBy).code;
  await assert.rejects(
    () => run('guest', guestSession, 'join', league3.revision, { code: code2 }),
    /すでに参加しています/,
  );

  console.log(
    '■ 招待と参加: OK（非参加者もログインできる / 管理者だけが発行 / 使い捨て / 最下層へ入る）',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
