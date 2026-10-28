import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../../server/storage/fileStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { nextProgressionAt } from '../../src/online/shared.js';
const dir = await mkdtemp(join(tmpdir(), 'pennant-clock-'));
try {
  const store = new FileStore(join(dir, 'state.gz'));
  await store.transaction((b) => {
    b.league = {
      schema: 1,
      engineVersion: 'online-1',
      revision: 1,
      status: 'waiting',
      phase: {},
      members: [{ userId: 'a' }],
    };
    b.sessions.a = 'active';
  });
  let now = '2026-10-28T01:29:59.000Z';
  const service = new LeagueService(store, {
    members: [{ userId: 'a' }],
    adminId: 'a',
    clock: () => now,
  });
  // イベント計算が10:30の境界をまたぐ。実試合の検証とは別の遅延fixture。
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
    payload: {},
  });
  const league = (await store.read()).league;
  assert.equal(
    league.nextAdvanceAt,
    '2026-10-28T04:00:00.000Z',
    '処理開始ではなく完了後の未来の枠を使う',
  );
  assert.equal(league.updatedAt, now);
  console.log('online-clock-check PASS（決定処理が進行時刻をまたぐ境界）');
} finally {
  await rm(dir, { recursive: true, force: true });
}
