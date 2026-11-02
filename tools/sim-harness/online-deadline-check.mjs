// フェーズの締め切りと自動決定の検査。
//
// ⚠ 主目的は「**1人が決めなくても週が進むこと**」。
//    非同期で遊ぶゲームなので、待ち続ける設計だと誰かの都合で全員が止まる。
// ⚠ 締め切りは曜日合わせも兼ねている。シーズンは月曜0時に始まり、
//    120ターン（24×5日）で金曜23時に終わる。そこから
//    土曜＝ストーブリーグ（締め切り 日曜0時）／日曜＝キャンプ（締め切り 月曜0時）。
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  jstWeekday,
  nextWeekdayStart,
  phaseDeadlineAt,
  PHASE_WEEKDAY,
  ONLINE_SCHEMA,
  seasonStartAt,
} from '../../src/online/shared.js';
import { SEASON_TURNS } from '../../src/online/pyramidLeague.js';
import { createTestStore } from './lib/testStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { defaultPhasePlan } from '../../server/leagueEngine.mjs';

// --- 日数の割り当て -------------------------------------------------
// ⚠ 120は6球団の総当たり（1巡5節）に割り切れる。144だと最後の1巡が途中で切れ、
//    相手によって対戦数が28と29に割れていた
assert.equal(SEASON_TURNS, 120);
assert.equal(SEASON_TURNS % 24, 0, '1日24ターンで割り切れる');
assert.equal(SEASON_TURNS / 24, 5, '試合は月〜金の5日');

// --- 曜日の計算 -----------------------------------------------------
// 2026-10-30T14:00Z = 10/30 23:00 JST（金曜）
assert.equal(jstWeekday('2026-10-30T14:00:00.000Z'), 5, '金曜');
assert.equal(jstWeekday('2026-10-30T15:00:00.000Z'), 6, '1時間後は土曜0時');

// ⚠ ちょうどその曜日の0時でも**次の週**を返す（先へ進むため）
const satMidnight = '2026-10-30T15:00:00.000Z'; // 土曜0時JST
assert.equal(nextWeekdayStart(satMidnight, 6), '2026-11-06T15:00:00.000Z');
assert.equal(nextWeekdayStart(satMidnight, 0), '2026-10-31T15:00:00.000Z', '翌日の日曜0時');

// --- フェーズの締め切り ---------------------------------------------
// ストーブリーグ（土曜担当）は日曜0時が締め切り
for (const kind of ['contract', 'tryout', 'offseason']) {
  assert.equal(PHASE_WEEKDAY[kind], 6, `${kind} は土曜`);
  assert.equal(
    phaseDeadlineAt(kind, satMidnight),
    '2026-10-31T15:00:00.000Z',
    `${kind} の締め切りは日曜0時`,
  );
}
// キャンプ（日曜担当）は月曜0時が締め切り
assert.equal(PHASE_WEEKDAY.camp, 0);
assert.equal(
  phaseDeadlineAt('camp', '2026-10-31T15:00:00.000Z'),
  '2026-11-01T15:00:00.000Z',
  'キャンプの締め切りは月曜0時',
);
// ⚠ 初期編成は締め切りを設けない（最初だけは全員を待つ）
assert.equal(phaseDeadlineAt('initial_tryout', satMidnight), null);

// ⚠ **担当の曜日を過ぎてから開いた手続きは、翌週まで待たせない**。
//    契約更改が日曜0時の締め切りで決まると、続くトライアウトは日曜に開く。
//    以前は「次の日曜0時」＝**7日後**が締め切りになり、1週間止まっていた
const sunOne = '2026-10-31T16:00:00.000Z'; // 日曜1時JST
assert.equal(
  phaseDeadlineAt('tryout', sunOne),
  '2026-11-01T04:00:00.000Z',
  '日曜に開いたトライアウトは12時間で締める（日曜13時）',
);
assert.equal(
  phaseDeadlineAt('offseason', '2026-11-01T05:00:00.000Z'),
  '2026-11-01T09:00:00.000Z',
  '日曜14時に開いたオフシーズンは4時間で締める（日曜18時）',
);
// 土曜のうちに開いたものは従来どおり日曜0時
assert.equal(
  phaseDeadlineAt('tryout', '2026-10-31T03:00:00.000Z'),
  '2026-10-31T15:00:00.000Z',
  '土曜に開いたトライアウトは日曜0時',
);
// 担当の曜日より前（金曜）に開いたものも、早めに締めずに日曜0時まで待つ
assert.equal(
  phaseDeadlineAt('contract', '2026-10-30T13:00:00.000Z'),
  '2026-10-31T15:00:00.000Z',
  '金曜に開いた契約更改は日曜0時',
);
// キャンプは遅れて開いても月曜0時（月曜0時が開幕の基準）
assert.equal(
  phaseDeadlineAt('camp', '2026-11-01T09:00:00.000Z'),
  '2026-11-01T15:00:00.000Z',
  'キャンプは月曜0時',
);

// ⚠ **開幕は月曜0時に揃える**。以前はキャンプが決まった次の正時に始まり、
//    火曜12時に全員が決めると火曜13時に開幕していた
assert.equal(
  seasonStartAt('2026-10-27T03:00:00.000Z'), // 火曜12時JST
  '2026-11-01T15:00:00.000Z',
  '火曜に決まったら次の月曜0時に開幕',
);
assert.equal(
  seasonStartAt('2026-11-01T15:00:05.000Z'), // 月曜0時すぎ（締め切りでの自動決定）
  '2026-11-01T16:00:00.000Z',
  '月曜に入ってから決まったら次の正時から始める（翌週まで待たせない）',
);

// --- 実際に自動決定されるか -----------------------------------------
const dir = await mkdtemp(join(tmpdir(), 'pennant-deadline-'));
try {
  const store = createTestStore(join(dir, 'state.gz'));
  let now = '2026-10-26T15:00:00.000Z'; // 月曜0時JST
  const service = new LeagueService(store, {
    members: [{ userId: 'admin', label: '管理者' }],
    adminId: 'admin',
    clock: () => now,
  });
  const adminSession = (await service.login('admin')).sessionId;
  const run = (userId, sessionId, type, revision, payload) =>
    service.command(userId, sessionId, {
      requestId: `${type}-${revision}-${userId}`,
      revision,
      type,
      payload,
    });

  await run('admin', adminSession, 'create', 0);
  // 2人目を入れる（1人だと提出した時点で必ず揃ってしまう）
  let view = await service.view('admin', adminSession);
  // ⚠ **本物のリーグから作ったビューに版の印が載ること**。
  //    印が無いと `LeagueService.view` が全部「古い形式です」で止める。
  //    `online-config-check` は作り物のビューで門番を見ているので、
  //    印を付け忘れた側はここでしか捕まらない（実際に取りこぼした）。
  assert.equal(view.schema, ONLINE_SCHEMA, 'ビューに版の印が無い');
  const guest = (await service.login('guest')).sessionId;
  await run('guest', guest, 'join', (await store.read()).league.revision, {
    teamName: 'テスト球団',
  });

  // 初期編成は締め切りが無いので、1人提出しても進まない
  const league = (await store.read()).league;
  assert.equal(league.phase.kind, 'initial_tryout');
  assert.equal(league.phase.deadline, null, '初期編成には締め切りが無い');
  // 締め切りが無いので、時間を飛ばしても自動決定されない
  now = '2026-11-30T15:00:00.000Z';
  assert.deepEqual(
    await service.tick(),
    { advanced: false },
    '締め切りが無いフェーズは時間では進まない',
  );

  // 2人とも提出すると次（キャンプ）へ進み、そちらには締め切りが付く
  now = '2026-10-26T15:00:00.000Z';
  for (const [userId, sessionId] of [
    ['admin', adminSession],
    ['guest', guest],
  ]) {
    const current = (await store.read()).league;
    if (current.phase?.kind !== 'initial_tryout') break;
    // ⚠ 提出の中身は engine の `submitPhase` にそのまま渡る。
    //    phaseId と plan が要る（検査用の省略形は通らない）
    const teamName = current.members.find((m) => m.userId === userId).teamName;
    await service.command(userId, sessionId, {
      requestId: `init-${userId}`,
      revision: current.revision,
      type: 'submit',
      payload: {
        phaseId: current.phase.id,
        plan: defaultPhasePlan(current, teamName),
        ready: true,
        baseSubmission: null,
      },
    });
  }
  const camp = (await store.read()).league;
  assert.equal(camp.phase?.kind, 'camp', '初期編成の次はキャンプ');
  assert.ok(camp.phase.deadline, 'キャンプには締め切りが付く');

  // ⚠ 本題。締め切りを過ぎたら、誰も提出していなくても先へ進む
  assert.equal(
    Object.keys(camp.phase.submissions).length,
    0,
    'まだ誰も提出していない',
  );
  now = camp.phase.deadline;
  // ⚠ **自動決定が失敗したら、止めて理由を残すこと**。以前はログに出すだけで
  //    保存を変えず、毎時同じ失敗を黙って繰り返していた（誰も気づけない）
  {
    const engine = service.engine;
    service.engine = async () => {
      throw new Error('検査用の失敗');
    };
    await service.tick();
    service.engine = engine;
    const stopped = (await store.read()).league;
    assert.equal(stopped.status, 'error', '自動決定の失敗で止まっていない');
    assert.match(stopped.error, /締め切りの自動決定に失敗しました（検査用の失敗）/);
    // 止めている間は、定期処理でやり直さない
    assert.deepEqual(await service.tick(), { advanced: false });
    assert.equal((await store.read()).league.status, 'error');
    // 管理者が再開すると待機に戻り、次の定期処理でやり直す
    await run('admin', adminSession, 'resume', stopped.revision);
    const resumed = (await store.read()).league;
    assert.equal(resumed.status, 'waiting', '再開で待機に戻らない');
    assert.ok(!resumed.error, '再開しても理由が残っている');
  }
  const result = await service.tick();
  assert.ok(result.advanced, '締め切りを過ぎたら進む');
  assert.deepEqual(result.autoResolved, ['camp'], 'キャンプが自動決定される');
  const after = (await store.read()).league;
  assert.ok(!after.phase, '手続きが終わっている');
  assert.equal(after.status, 'running', 'シーズンが始まっている');
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(
  '■ 締め切りと自動決定: OK（120ターン / 土=ストーブ・日=キャンプ / 未提出でも進む）',
);
