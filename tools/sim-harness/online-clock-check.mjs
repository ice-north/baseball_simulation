import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestStore, MemoryStore } from './lib/testStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { nextProgressionAt, ONLINE_SCHEMA, ONLINE_ENGINE_VERSION } from '../../src/online/shared.js';
const dir = await mkdtemp(join(tmpdir(), 'pennant-clock-'));
try {
  const store = createTestStore(join(dir, 'state.gz'));
  await store.transaction((b) => {
    b.league = {
      schema: ONLINE_SCHEMA,
      engineVersion: ONLINE_ENGINE_VERSION,
      revision: 1,
      status: 'waiting',
      phase: {},
      members: [{ userId: 'a' }],
    };
    b.sessions.a = 'active';
  });
  // ⚠ **境界は「枠そのものの時刻」にまたがらせること**。枠でない時刻を
  //    またいでも、開始で計算しても完了で計算しても同じ枠になり、この検査は
  //    **何も判別しなくなる**（1ターン＝1時間の頃に 10:29:59→10:30:01 で
  //    そうなっていた。45分刻みにしたら今度は 09:59:59→10:00:01 がそうなった）。
  //    いまの枠は45分刻みなので JST 10:30（= 01:30Z）をまたがせる。
  let now = '2026-10-28T01:29:59.000Z';
  const service = new LeagueService(store, {
    members: [{ userId: 'a' }],
    adminId: 'a',
    clock: () => now,
  });
  // イベント計算が10:00（JST）の境界をまたぐ。実試合の検証とは別の遅延fixture。
  service.engine = async (fn) =>
    fn({
      submitPhase(l, user, plan, startedAt) {
        l.status = 'running';
        l.phase = null;
        l.nextAdvanceAt = nextProgressionAt(startedAt);
        now = '2026-10-28T01:30:01.000Z';
      },
    });
  await service.command('a', 'active', {
    requestId: 'clock:boundary',
    revision: 1,
    type: 'submit',
    payload: { baseSubmission: null },
  });
  const league = (await store.read()).league;
  assert.equal(
    league.nextAdvanceAt,
    '2026-10-28T02:15:00.000Z',
    '処理開始ではなく完了後の未来の枠を使う',
  );
  assert.equal(league.updatedAt, now);
  // --- 遅れた定期進行で止まらないこと ----------------------------------
  // ⚠ **これが実際に起きた**。「15分以上遅れたら停止」は1ターン＝1時間の頃の値で、
  //    45分ターンにしたとき取り残された。毎時だけ叩く古いcronのままだと、枠を
  //    外した回が必ず15分超の遅れになり、**1ターン進んだ次の時間に必ず停止**して
  //    いた（画面は「進みません」になり、リーグ管理で再開するしかない）。
  // ⚠ 1回の進行で進むのはいつも1ターンなので、遅れても取り戻しの連打は起きない。
  //    止めるのは「本当に長く動いていない」ときだけでよい。
  {
    const clockStore = createTestStore(join(dir, 'late.gz'));
    let at = '2026-10-28T00:00:00.000Z';
    const service2 = new LeagueService(clockStore, {
      members: [{ userId: 'a' }],
      adminId: 'a',
      clock: () => at,
    });
    const setUp = (nextAdvanceAt) =>
      clockStore.transaction((b) => {
        b.league = {
          schema: ONLINE_SCHEMA,
          engineVersion: ONLINE_ENGINE_VERSION,
          revision: 1,
          status: 'running',
          phase: null,
          members: [{ userId: 'a', teamName: 'A' }],
          nextAdvanceAt,
          season: { year: 1, currentDate: { year: 2024, month: 4, day: 1 } },
        };
        return { value: null };
      });
    // 進行そのものは別の検査が見る。ここでは「遅れをどう扱うか」だけを見たいので
    // エンジンは何もしない差し替えにする
    service2.engine = async (fn) => fn({ advanceLeagueDay() {} });
    const lateness = async (minutes) => {
      const due = '2026-10-28T00:00:00.000Z';
      await setUp(due);
      at = new Date(Date.parse(due) + minutes * 60000).toISOString();
      await service2.tick();
      return (await clockStore.read()).league;
    };
    // ⚠ 1ターン（45分）ぶんを超える遅れでも**止めない**。毎時cronの揺らぎで
    //    毎回止まっていたのがこれ
    for (const minutes of [1, 16, 46, 120]) {
      const l = await lateness(minutes);
      assert.equal(
        l.status,
        'running',
        `${minutes}分の遅れで止まった: ${l.error}`,
      );
    }
    // ⚠ 本当に長く動いていないときは止める（管理者に見てもらう）
    const stalled = await lateness(8 * 60);
    assert.equal(stalled.status, 'error', '何時間も止まっていたのに進めた');
    assert.match(stalled.error, /長く止まって/, '理由が出ていない');
    assert.equal(stalled.nextAdvanceAt, null, '止めたのに次の時刻が残っている');
  }
  // --- 打ち切られて終わらない定期処理を繰り返さないこと -------------------
  // ⚠ Vercel の300秒で打ち切られると、例外の処理（status を error にする所）を通らず保存も
  //    変わらない。以前はリースが切れるたびに同じ日を最初からやり直し、`STALL_AFTER_MS`
  //    （≒6時間）まで約10分おきに繰り返して、そのたびに参加者の操作を「処理中」で弾いた
  //    （監査 2026-11-23）。同じ試行が3回続けて終わらなければ error で止める。
  // 打ち切りは「エンジンが返らないまま、別の呼び出し（次の cron）が来る」でまねる。
  // 呼び出しごとに保存先を作り直す（同じパスなら保存も印も同じものを見る。本番の別の関数の起動にあたる）
  {
    const path = join(dir, 'killed.gz');
    const due = '2026-10-28T00:00:00.000Z';
    const at = '2026-10-28T00:10:00.000Z';
    const league = (patch = {}) => ({
      schema: ONLINE_SCHEMA,
      engineVersion: ONLINE_ENGINE_VERSION,
      seed: 7,
      revision: 1,
      status: 'running',
      phase: null,
      members: [{ userId: 'a', teamName: 'A' }],
      nextAdvanceAt: due,
      season: { year: 1, currentDate: { year: 2024, month: 4, day: 1 } },
      ...patch,
    });
    const setUp = (patch) =>
      new MemoryStore(path).transaction((b) => {
        b.league = league(patch);
        return { value: null };
      });
    const service = () =>
      new LeagueService(new MemoryStore(path), { members: [{ userId: 'a' }], adminId: 'a', clock: () => at });
    // エンジンに入ったところで止まる（返らない）定期処理
    const killed = async () => {
      const s = service();
      let entered;
      const started = new Promise((resolve) => (entered = resolve));
      s.engine = () => {
        entered();
        return new Promise(() => {});
      };
      s.tick();
      await started;
    };
    let calls = 0;
    const finishing = () => {
      const s = service();
      s.engine = async (fn) => {
        calls++;
        return fn({ advanceLeagueDay() {}, autoResolvePhase(l) { l.phase = null; l.status = 'running'; } });
      };
      return s.tick();
    };
    await setUp();
    for (let i = 0; i < 3; i++) await killed();
    await finishing();
    let l = (await new MemoryStore(path).read()).league;
    assert.equal(calls, 0, '3回続けて終わらなかったのに4回目もやり直した');
    assert.equal(l.status, 'error', '打ち切りが続いても止めない');
    assert.match(l.error, /3回続けて時間内に終わりませんでした/, '止めた理由が出ていない');
    assert.equal(l.nextAdvanceAt, null);
    // 止めた後はやり直さない（管理者の再開を待つ）
    await finishing();
    assert.equal(calls, 0, '止めた後もやり直している');
    // 止めたことを公開した時点で回数は消える。再開（同じ枠に戻す）すると最初から数え直して進む
    await setUp();
    await finishing();
    assert.equal(calls, 1, '再開しても回数が残っていて進まない');
    assert.equal((await new MemoryStore(path).read()).league.status, 'running');
    // ⚠ 正常に終われば回数を消す。2回打ち切られた後に終わり、同じ枠でまた2回打ち切られても、
    //    3回目は止めずにやり直す（消していなければ合わせて4回で止まる）
    calls = 0;
    await setUp();
    for (let i = 0; i < 2; i++) await killed();
    await finishing();
    assert.equal(calls, 1, '2回の打ち切りの後でやり直さない');
    await setUp();
    for (let i = 0; i < 2; i++) await killed();
    await finishing();
    assert.equal(calls, 2, '正常に終わったのに回数が消えていない');
    assert.equal((await new MemoryStore(path).read()).league.status, 'running');
    // 手続きの締め切りの自動決定でも同じ
    calls = 0;
    const phase = { id: '1:stove', kind: 'stove', deadline: due, submissions: {} };
    await setUp({ status: 'waiting', phase, nextAdvanceAt: null });
    for (let i = 0; i < 3; i++) await killed();
    await finishing();
    l = (await new MemoryStore(path).read()).league;
    assert.equal(calls, 0, '締め切りの自動決定を4回目もやり直した');
    assert.equal(l.status, 'error');
    assert.match(l.error, /締め切りの自動決定が3回続けて/);
    // 再開（待機に戻す）と最初から数え直す
    await setUp({ status: 'waiting', phase, nextAdvanceAt: null });
    await finishing();
    assert.equal(calls, 1, '再開しても締め切りの自動決定をやり直さない');
  }
  console.log(
    'online-clock-check PASS（決定処理が進行時刻をまたぐ境界 / 遅れた定期進行で止まらない / 打ち切りが3回続けば止める）',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
