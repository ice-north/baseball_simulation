// フェーズの締め切りと自動決定の検査。
//
// ⚠ 主目的は「**1人が決めなくても週が進むこと**」。
//    非同期で遊ぶゲームなので、待ち続ける設計だと誰かの都合で全員が止まる。
// ⚠ 締め切りは曜日合わせも兼ねている。シーズンは月曜0時に始まり、
//    160ターン（32×5日）で金曜23時15分に終わる。そこから
//    土曜＝ストーブリーグ（32ターンを3つで分け合う）／日曜＝キャンプ（32ターン）。
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
  PHASE_WINDOW_HOURS,
} from '../../src/online/shared.js';
import { SEASON_TURNS } from '../../src/online/pyramidLeague.js';
import {
  PROGRESSION_TIMES,
  TURNS_PER_DAY,
  TURN_MINUTES,
} from '../../src/online/shared.js';
import { createTestStore } from './lib/testStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { defaultPhasePlan, CAMP_ROUNDS } from '../../server/leagueEngine.mjs';
import { pendingProcedure } from '../../src/online/notices.js';

// --- 日数の割り当て -------------------------------------------------
// ⚠ 160は3連戦（4ターンで1カード）と6球団の総当たり（1巡5節）の両方に
//    割り切れる。40カード＝8巡で、どの相手とも24試合・本拠地12/12に揃う
assert.equal(SEASON_TURNS, 160);
assert.equal(
  SEASON_TURNS % TURNS_PER_DAY,
  0,
  `1日${TURNS_PER_DAY}ターンで割り切れる`,
);
assert.equal(SEASON_TURNS / TURNS_PER_DAY, 5, '試合は月〜金の5日');
// ⚠ **1週間が埋まること**。月〜金が試合、土曜がストーブリーグ、日曜がキャンプ。
//    ここが合わないと、開幕の曜日が毎シーズンずれていく
assert.equal(TURNS_PER_DAY * 7, SEASON_TURNS + TURNS_PER_DAY * 2, '1週224ターン');
assert.equal(
  PROGRESSION_TIMES.length,
  TURNS_PER_DAY,
  '進行する時刻の数が1日のターン数と合わない',
);
assert.equal(PROGRESSION_TIMES[0], '00:00');
assert.equal(PROGRESSION_TIMES[1], '00:45', `1ターン${TURN_MINUTES}分`);
assert.equal(PROGRESSION_TIMES.at(-1), '23:15');

// --- 曜日の計算 -----------------------------------------------------
// 2026-10-30T14:00Z = 10/30 23:00 JST（金曜）
assert.equal(jstWeekday('2026-10-30T14:00:00.000Z'), 5, '金曜');
assert.equal(jstWeekday('2026-10-30T15:00:00.000Z'), 6, '1時間後は土曜0時');

// ⚠ ちょうどその曜日の0時でも**次の週**を返す（先へ進むため）
const satMidnight = '2026-10-30T15:00:00.000Z'; // 土曜0時JST
assert.equal(nextWeekdayStart(satMidnight, 6), '2026-11-06T15:00:00.000Z');
assert.equal(nextWeekdayStart(satMidnight, 0), '2026-10-31T15:00:00.000Z', '翌日の日曜0時');

// --- フェーズの締め切り ---------------------------------------------
// ストーブリーグ（土曜担当）は**土曜の中で順番に**締め切る
for (const kind of ['contract', 'tryout', 'offseason']) {
  assert.equal(PHASE_WEEKDAY[kind], 6, `${kind} は土曜`);
  const deadline = phaseDeadlineAt(kind, satMidnight);
  assert.ok(
    deadline > satMidnight && deadline <= '2026-10-31T15:00:00.000Z',
    `${kind} の締め切りが土曜の中に無い: ${deadline}`,
  );
  assert.equal(
    deadline,
    new Date(
      Date.parse(satMidnight) + PHASE_WINDOW_HOURS[kind] * 3600000,
    ).toISOString(),
    `${kind} の締め切りが持ち時間と合わない`,
  );
}
// キャンプ（日曜担当）は月曜0時が締め切り
assert.equal(PHASE_WEEKDAY.camp, 0);
assert.equal(
  phaseDeadlineAt('camp', '2026-10-31T15:00:00.000Z'),
  '2026-11-01T15:00:00.000Z',
  'キャンプの締め切りは月曜0時',
);
// ⚠ **開幕前の手続きにも締め切りを置くこと**。以前は「最初の1回くらいは
//    全員を待とう」と設けなかったが、1人が決めないだけでリーグが永久に
//    止まった（実際に止まった）。時間による進行が絶対で、決めていない人は
//    標準案で押し通す。
// ⚠ 初期メンバー選択は土曜扱い（締め切り日曜0時）。こうすると次のキャンプが
//    月曜0時に締め切られて**月曜開幕**になる。日曜扱いにすると開幕が1週間ずれる
assert.equal(PHASE_WEEKDAY.pack_select, 6, '初期メンバー選択が土曜扱いでない');
assert.equal(
  phaseDeadlineAt('pack_select', satMidnight),
  '2026-10-31T15:00:00.000Z',
  '初期メンバー選択の締め切りは日曜0時',
);
// 初期メンバー選択 → キャンプ と続けると、開幕は月曜0時になる
assert.equal(
  phaseDeadlineAt('camp', phaseDeadlineAt('pack_select', satMidnight)),
  '2026-11-01T15:00:00.000Z',
  '初期メンバー選択から続けたときの開幕が月曜0時でない',
);
// ⚠ 土曜の夜にリーグを作ると、日曜0時の締め切りまで数分しか無かった（全員が標準案で決まる）。
//    12時間を切るときは翌週の日曜0時にする。全員が決めれば締め切りを待たずに進む
assert.equal(
  phaseDeadlineAt('initial_tryout', '2026-10-31T14:55:00.000Z'), // 土曜23:55
  '2026-11-07T15:00:00.000Z',
  '土曜の夜に作ったリーグの初期編成が数分で締まる',
);
assert.equal(
  phaseDeadlineAt('initial_tryout', '2026-10-31T02:00:00.000Z'), // 土曜11:00
  '2026-10-31T15:00:00.000Z',
  '12時間以上あれば従来どおり日曜0時',
);
// ⚠ いまの最初の手続きは初期メンバー選択。以前は `initial_tryout`（古い形）にしか
//    猶予が付いておらず、新しいリーグでは効いていなかった
assert.equal(
  phaseDeadlineAt('pack_select', '2026-10-31T14:55:00.000Z'), // 土曜23:55
  '2026-11-07T15:00:00.000Z',
  '土曜の夜に作ったリーグの初期メンバー選択が数分で締まる',
);
assert.equal(
  phaseDeadlineAt('pack_select', '2026-10-31T02:00:00.000Z'), // 土曜11:00
  '2026-10-31T15:00:00.000Z',
  '12時間以上あれば初期メンバー選択も従来どおり日曜0時',
);
assert.equal(phaseDeadlineAt('unknown_kind', satMidnight), null, '知らない種類は締め切り無し');

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
// --- 土曜（ストーブリーグ）の32ターンを3つで分け合う ------------------
// ⚠ 以前はどれも「翌日0時」を締め切りにしていたので、契約更改が締め切りまで
//    かかると続くトライアウトは日曜に開き、**キャンプの32ターンを食っていた**
//    （実測でストーブリーグ52ターン・キャンプ8ターン）。
// ⚠ 合計が担当日の24時間（32ターン）を超えないこと
assert.equal(
  PHASE_WINDOW_HOURS.offseason,
  24,
  '土曜の最後の手続きが日曜0時に締まらない',
);
assert.ok(
  PHASE_WINDOW_HOURS.contract < PHASE_WINDOW_HOURS.tryout &&
    PHASE_WINDOW_HOURS.tryout < PHASE_WINDOW_HOURS.offseason,
  '土曜の3つが順番に閉じない（同じ時刻だと2つ目以降が日曜へはみ出す）',
);
assert.equal(PHASE_WINDOW_HOURS.camp, 24, 'キャンプが日曜まるごとでない');
// 土曜に開いたものは**自分の持ち時間まで**（日曜0時ではない）
assert.equal(
  phaseDeadlineAt('contract', '2026-10-30T16:00:00.000Z'), // 土曜1時JST
  '2026-10-31T03:00:00.000Z',
  '契約更改が土曜12時に締まらない',
);
assert.equal(
  phaseDeadlineAt('tryout', '2026-10-31T03:00:00.000Z'), // 土曜12時JST
  '2026-10-31T12:00:00.000Z',
  'トライアウトが土曜21時に締まらない',
);
assert.equal(
  phaseDeadlineAt('offseason', '2026-10-31T12:30:00.000Z'), // 土曜21時半JST
  '2026-10-31T15:00:00.000Z',
  '年度更新が日曜0時に締まらない',
);
// 担当の曜日より前（金曜）に開いたものも、早めに締めずに自分の枠まで待つ
assert.equal(
  phaseDeadlineAt('contract', '2026-10-30T13:00:00.000Z'),
  '2026-10-31T03:00:00.000Z',
  '金曜に開いた契約更改が土曜12時に締まらない',
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
  '2026-11-01T15:45:00.000Z',
  '月曜に入ってから決まったら次の枠から始める（翌週まで待たせない）',
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

  // ⚠ **誰も提出していなくても、締め切りで開幕まで進むこと**。
  //    ここが「時間による進行が絶対」の本体。初期メンバー選択→キャンプ→開幕が
  //    1回の定期処理で通る（締め切りがどちらも過去になっているため）
  const league = (await store.read()).league;
  assert.equal(league.phase.kind, 'pack_select');
  assert.ok(league.phase.deadline, '初期メンバー選択に締め切りが無い');
  // ⚠ **手続きは1回の定期処理につき1つずつ解決する**。次の手続きの締め切りは
  //    「開いた時刻」から数えるので、まとめて片付きはしない。それでよい——
  //    止まらないことが大事で、急いで進めることが目的ではない
  // ⚠ **保存した下書きは、締め切りでもそのまま使うこと**。以前は下書きを捨てて
  //    標準案で決めていた（契約更改で「誰も解雇しない」と保存した球団が、
  //    標準案どおりに解雇された）。
  // ⚠ 下書きは **標準案とは別のセット**にする。同じセットだと、下書きを捨てて
  //    標準案で決めていても気づけない。
  const guestTeam = league.members.find((m) => m.userId === 'guest').teamName;
  const adminTeam = league.members.find((m) => m.userId === 'admin').teamName;
  const defaultPack = defaultPhasePlan(league, guestTeam).packId;
  const wanted = league.packs.find((p) => p.id !== defaultPack);
  assert.ok(wanted && wanted.id !== defaultPack, '前提: 別のセットが選べる');
  await run('guest', guest, 'submit', league.revision, {
    phaseId: league.phase.id,
    plan: { packId: wanted.id },
    ready: false,
    baseSubmission: null,
  });
  now = league.phase.deadline;
  const first = await service.tick();
  assert.ok(first.advanced, '締め切りを過ぎても進まない');
  assert.deepEqual(
    first.autoResolved,
    ['pack_select'],
    '初期メンバー選択が自動決定されない',
  );
  const camped = (await store.read()).league;
  assert.equal(camped.phase?.kind, 'camp', '初期メンバー選択の次はキャンプ');
  {
    const roster = camped.game.teams[guestTeam].players;
    assert.equal(roster.length, wanted.players.length, '人数がセットと合わない');
    // ⚠ **下書きで選んだセットが来ていること**（標準案に上書きされていない）
    assert.deepEqual(
      roster.map((p) => p.name).sort(),
      wanted.players.map((p) => p.name).sort(),
      '保存した下書きのセットが使われていない',
    );
    // 名簿として成り立っている
    assert.ok(roster.some((p) => p.position === 'catcher'), '捕手がいない');
    assert.ok(roster.some((p) => p.position === 'pitcher'), '投手がいない');
    assert.ok(
      roster.filter((p) => p.position !== 'pitcher').length >= 8,
      '野手が足りない',
    );
    // ⚠ 決めなかった管理者にも名簿が渡っていること
    const adminRoster = camped.game.teams[adminTeam].players;
    assert.equal(adminRoster.length, wanted.players.length, '未提出の球団に名簿が無い');
    assert.ok(
      !adminRoster.some((p) => roster.some((q) => q.id === p.id)),
      '同じセットが2球団に渡っている',
    );
  }
  assert.ok(camped.phase.deadline, 'キャンプに締め切りが無い');
  // ⚠ 開幕は**月曜0時**。初期メンバー選択を土曜扱いにしてあるのはこのため
  assert.equal(jstWeekday(camped.phase.deadline), 1, '開幕が月曜でない');

  // ⚠ **キャンプ（手続き中）でも打順を保存でき、開幕後もその打順が残ること**。
  //    以前は手続き中の保存を「この期間は編成変更できません」で弾き、
  //    さらにキャンプの解決で全球団の打順をおすすめに作り直していた。
  const guestView = await service.view('guest', guest);
  const swapped = guestView.lineup.battingOrder.map((e) => ({ ...e }));
  const leadoff = swapped.find((e) => e.battingOrder === 1);
  const twoHole = swapped.find((e) => e.battingOrder === 2);
  [leadoff.playerId, twoHole.playerId] = [twoHole.playerId, leadoff.playerId];
  [leadoff.position, twoHole.position] = [twoHole.position, leadoff.position];
  await run('guest', guest, 'lineup', guestView.revision, {
    ...guestView.lineup,
    battingOrder: swapped,
    baseLineup: guestView.lineup,
  });
  const savedOrder = swapped
    .sort((a, b) => a.battingOrder - b.battingOrder)
    .map((e) => e.playerId);

  now = camped.phase.deadline;
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
  const second = await service.tick();
  assert.deepEqual(second.autoResolved, ['camp'], 'キャンプが自動決定されない');
  const opened = (await store.read()).league;
  assert.ok(!opened.phase, '手続きが残っている');
  assert.equal(opened.status, 'running', '誰も提出していないのに開幕しない');
  assert.deepEqual(
    opened.game.teams[guestTeam].lineupSettings.battingOrder
      .filter((e) => e.position !== 'pitcher')
      .sort((a, b) => a.battingOrder - b.battingOrder)
      .map((e) => e.playerId),
    savedOrder,
    'キャンプ中に保存した打順が開幕で作り直された',
  );

  // ⚠ **全員が提出したら締め切り前でも進むこと**。時間は下限であって、
  //    待たせるためのものではない。別のリーグを立てて、その経路を見る
  const dir2 = await mkdtemp(join(tmpdir(), 'pennant-deadline2-'));
  try {
    const store2 = createTestStore(join(dir2, 'state.gz'));
    let clock2 = '2026-10-26T15:00:00.000Z';
    const service2 = new LeagueService(store2, {
      members: [{ userId: 'admin', label: '管理者' }],
      adminId: 'admin',
      clock: () => clock2,
    });
    const s2 = (await service2.login('admin')).sessionId;
    await service2.command('admin', s2, {
      requestId: 'create-2',
      revision: 0,
      type: 'create',
    });
    for (let i = 0; i < 4; i += 1) {
      const current = (await store2.read()).league;
      if (!current.phase) break;
      const teamName = current.members[0].teamName;
      await service2.command('admin', s2, {
        requestId: `submit2-${i}`,
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
    const done = (await store2.read()).league;
    assert.ok(!done.phase, '全員が提出しても手続きが残っている');
    assert.equal(done.status, 'running', '全員が提出しても開幕しない');
    // ⚠ 早く決まっても開幕は**月曜0時**のまま（`seasonStartAt`）。以前は
    //    提出の処理の最後で次の正時に書き換わり、火曜開幕になっていた
    assert.equal(
      done.nextAdvanceAt,
      seasonStartAt(clock2),
      '全員が早く決めたときに開幕が月曜0時からずれた',
    );
    assert.equal(jstWeekday(done.nextAdvanceAt), 1, '開幕が月曜でない');
    // ⚠ 締め切りより前でも開幕する（待たせない）
    assert.ok(
      Date.parse(clock2) < Date.parse(opened.phase?.deadline || '2999-01-01'),
      '前提: まだ締め切り前',
    );
  } finally {
    await rm(dir2, { recursive: true, force: true });
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

// ⚠ **キャンプを指導者に任せた人は待たない**（総合監査 2026-11-10 の判断7）。キャンプには
//    「決定」が無いので、以前は任せた人がいると、ほかの全員が4クール終えても締め切りまで
//    止まっていた。命令を通して、待つ人が居なくなる2つの経路を見る:
//    ほかの人が最後のクールを回したとき（`campRound`）／最後の1人が任せたとき（`staffModes`）
{
  const dir3 = await mkdtemp(join(tmpdir(), 'pennant-deadline3-'));
  try {
    const clock3 = '2026-10-26T15:00:00.000Z';
    // 記録の索引を作り直すか（保存側への知らせ）を見るため、命令の結果を控える
    let outcome = null;
    let store3 = null;
    let service3 = null;
    const sessions = {};
    let seq = 0;
    const send = async (userId, type, payload) => {
      const current = (await store3.read()).league;
      seq += 1;
      return service3.command(userId, sessions[userId], {
        requestId: `deleg-${type}-${seq}`,
        revision: current?.revision ?? 0,
        type,
        payload,
      });
    };
    // 2人のリーグを作り、初期メンバーを選んでキャンプに入ったところ
    const fresh = async () => {
      store3 = createTestStore(join(dir3, `state-${seq}.gz`));
      const transaction = store3.transaction.bind(store3);
      store3.transaction = (fn, options) =>
        transaction(async (bundle) => (outcome = await fn(bundle)), options);
      service3 = new LeagueService(store3, {
        members: [{ userId: 'admin', label: '管理者' }],
        adminId: 'admin',
        clock: () => clock3,
      });
      for (const userId of ['admin', 'guest'])
        sessions[userId] = (await service3.login(userId)).sessionId;
      await send('admin', 'create');
      await send('guest', 'join', { teamName: 'テスト球団' });
      for (const userId of ['admin', 'guest']) {
        const current = (await store3.read()).league;
        const member = current.members.find((m) => m.userId === userId);
        await send(userId, 'submit', {
          phaseId: current.phase.id,
          plan: defaultPhasePlan(current, member.teamName),
          ready: true,
          baseSubmission: null,
        });
      }
      const camp = (await store3.read()).league;
      assert.equal(camp.phase?.kind, 'camp', '前提: キャンプが開いている');
      return camp;
    };
    const rounds = async (userId) => {
      for (let round = 1; round <= CAMP_ROUNDS; round += 1)
        await send(userId, 'campRound', {
          round,
          policy: { direction: 'balanced', phase: 'skill' },
        });
    };
    {
      // ほかの人が最後のクールを回した時点で進む。任せた人の4クールは指導者が回す
      await fresh();
      await send('admin', 'staffModes', { modes: { camp: 'delegate' } });
      const adminView = await service3.view('admin', sessions.admin);
      assert.equal(adminView.phase.delegated, true, 'キャンプを任せた印がビューに無い');
      assert.equal(pendingProcedure(adminView), null, '任せたキャンプに「決めてください」が出る');
      const guestView = await service3.view('guest', sessions.guest);
      assert.ok(pendingProcedure(guestView), '自分で回す人に手続きの知らせが無い');
      const shown = guestView.members.find((m) => m.teamName === adminView.teamName);
      assert.ok(shown.delegated && shown.ready, '任せた球団が一覧で「検討中」のまま');
      await rounds('guest');
      const done = (await store3.read()).league;
      assert.ok(!done.phase, 'キャンプを任せた人を待って、締め切りまで進まない');
      assert.equal(done.status, 'running', 'ほかの全員が4クール終えても開幕しない');
      assert.equal(done.campResults.admin?.rounds, CAMP_ROUNDS, '任せた球団のクールが回っていない');
      assert.equal(done.campResults.guest?.rounds, CAMP_ROUNDS);
      assert.equal(jstWeekday(done.nextAdvanceAt), 1, '早く終わっても開幕は月曜');
    }
    {
      // 最後の1人が任せた時点で進む。⚠ 選手の能力が動くので、記録の索引は作り直す
      await fresh();
      await rounds('guest');
      const waiting = (await store3.read()).league;
      assert.equal(waiting.phase?.kind, 'camp', '前提: 任せていない人を待つ');
      await send('admin', 'staffModes', { modes: { tactics: 'delegate' } });
      assert.equal((await store3.read()).league.phase?.kind, 'camp', 'キャンプと関係の無い任せ方でキャンプが終わった');
      assert.equal(outcome?.archiveUnchanged, true, '前提: 任せ方だけの変更は索引を作り直さない');
      await send('admin', 'staffModes', { modes: { camp: 'delegate' } });
      const done = (await store3.read()).league;
      assert.ok(!done.phase, 'キャンプを任せても、締め切りまで進まない');
      assert.equal(done.status, 'running');
      assert.equal(done.campResults.admin?.rounds, CAMP_ROUNDS, '任せた球団のクールが回っていない');
      assert.ok(!outcome?.archiveUnchanged, '任せ方の変更で手続きが進んだのに、記録の索引を作り直さない');
    }
  } finally {
    await rm(dir3, { recursive: true, force: true });
  }
}

console.log(
  `■ 締め切りと自動決定: OK（${SEASON_TURNS}ターン / 初期メンバー選択にも締め切り / 誰も提出しなくても月曜に開幕 / 全員提出なら締め切り前でも開幕・それでも開幕は月曜 / キャンプを任せた人は待たない / 下書きのセットは締め切りでも使う / キャンプ中に保存した打順が開幕後も残る）`,
);
