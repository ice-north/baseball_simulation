import assert from 'node:assert/strict';
import { createLeague } from '../../server/leagueEngine.mjs';
import { captureWorld, restoreWorld } from '../../server/worldSnapshot.mjs';
import {
  generateStaff,
  getStaffIdCounter,
  setStaffIdCounter,
} from '../../src/corporate/staffData.js';
import { withSeededRandom } from '../../src/game/rng.js';
const config = {
  members: [{ userId: 'a' }, { userId: 'b' }],
  seed: 17,
  now: '2026-10-28T00:00:00Z',
};
const first = createLeague(config);
const signature = (game) =>
  Object.entries(game.teams)
    .filter(([, team]) => team.corporateData?.staff)
    .map(([name, team]) => [name, team.corporateData.staff]);
const second = createLeague(config);
const firstStaff = signature(first.game);
const secondStaff = signature(second.game);
const mismatch = firstStaff.findIndex(
  (entry, index) =>
    JSON.stringify(entry) !== JSON.stringify(secondStaff[index]),
);
assert.equal(mismatch, -1, '作成失敗後の再実行でもスタッフの採番を変えない');
const snapshot = captureWorld();
const expected = withSeededRandom(42, () => generateStaff('coach'));
generateStaff('manager');
restoreWorld(snapshot);
const replay = withSeededRandom(42, () => generateStaff('coach'));
assert.deepEqual(
  replay,
  expected,
  '復元後も同じ乱数から同じスタッフを生成する',
);
assert.equal(getStaffIdCounter(), snapshot.staffIdCounter + 1);
// 旧スナップショットの互換: 採番が未保存なら既存の最大IDから再開する。
const legacy = structuredClone(snapshot);
delete legacy.staffIdCounter;
delete legacy.staffNames;
setStaffIdCounter(5000);
restoreWorld(legacy);
const ids = signature(legacy).flatMap(([, staff]) => staff.map((s) => s.id));
assert.ok(generateStaff('trainer').id > Math.max(...ids));
console.log(
  'online-snapshot-check PASS（再作成・採番の完全復元・旧形式の最大IDフォールバック）',
);
