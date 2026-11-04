// キャンプの割り当ての検査。
//
// ⚠ 主目的は「**選手ごとの割り当てが本当に効くこと**」。以前は球団で1つ
//    メニューを選ぶだけで、一人用（1人ずつ割り当てる）とは別物だった。
//    画面だけ作って中身が全員同じ練習のままでも、見た目では気づけない。
// ⚠ もう1つは「**画面が出すメニューを、サーバーが必ず受け取れること**」。
//    `TRAINING_MENUS` にはオンラインのエンジンが動かさないもの
//    （新球種習得）があり、実測で画面に出ていた。選べるのに提出で弾かれる。
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../../server/storage/fileStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import {
  createLeague,
  submitPhase,
  loadLeagueWorld,
} from '../../server/leagueEngine.mjs';
import { captureWorld } from '../../server/worldSnapshot.mjs';
import { CAMP_MENUS } from '../../src/online/shared.js';
import { TRAINING_MENUS } from '../../src/season/campTraining.js';
import {
  DIRECTIONS,
  resolveTraining,
  playerWish,
} from '../../src/season/trainingPolicy.js';

const NOW = '2026-10-26T15:00:00.000Z';
const quiet = (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
};

/** セット選択まで済ませて、キャンプの手続きが開いたリーグを作る */
function leagueAtCamp() {
  const league = quiet(() =>
    createLeague({ members: [{ userId: 'a' }], now: NOW }),
  );
  assert.equal(league.phase.kind, 'pack_select', '前提: 開幕前はセット選択');
  quiet(() =>
    submitPhase(
      league,
      'a',
      {
        phaseId: league.phase.id,
        plan: { packId: league.packs[0].id },
        ready: true,
      },
      NOW,
    ),
  );
  assert.equal(league.phase.kind, 'camp', '前提: 次はキャンプ');
  return league;
}

const ownRoster = (league) =>
  league.game.teams[league.members[0].teamName].players;

/** 名簿の能力の合計。練習がどこを伸ばしたかを見る */
const totals = (players) => {
  const sum = (pick) => players.reduce((n, p) => n + (pick(p) || 0), 0);
  return {
    meet: sum((p) => p.batting?.meet),
    power: sum((p) => p.batting?.power),
    speed: sum((p) => p.physical?.speed),
    control: sum((p) => p.pitching?.control),
    velocity: sum((p) => p.pitching?.velocity),
    bodyStamina: sum((p) => p.physical?.bodyStamina),
  };
};

/** キャンプを、指定した割り当てで解決した結果の合計 */
function campWith(build) {
  const league = leagueAtCamp();
  const before = totals(ownRoster(league));
  const plan = { menu: 'standard', assignments: build(ownRoster(league)) };
  quiet(() =>
    submitPhase(
      league,
      'a',
      { phaseId: league.phase.id, plan, ready: true },
      NOW,
    ),
  );
  assert.notEqual(league.phase?.kind, 'camp', 'キャンプが解決していない');
  const after = totals(ownRoster(league));
  return Object.fromEntries(
    Object.keys(after).map((key) => [key, after[key] - before[key]]),
  );
}

// --- 画面が出すメニューを、サーバーが受け取れるか ----------------------
{
  // ⚠ 画面側の絞り込みと**同じ条件**をここでも見る。画面は `CAMP_MENUS` で
  //    絞っているので、絞りを外したときにここで落ちる
  const offered = (isPitcher) =>
    Object.entries(TRAINING_MENUS)
      .filter(
        ([key, menu]) =>
          CAMP_MENUS.includes(key) &&
          (isPitcher ? menu.category !== 'batting' : menu.category !== 'pitching'),
      )
      .map(([key]) => key);
  for (const isPitcher of [true, false]) {
    const list = offered(isPitcher);
    assert.ok(list.length >= 4, `${isPitcher ? '投手' : '野手'}のメニューが少なすぎる`);
    for (const key of list)
      assert.ok(CAMP_MENUS.includes(key), `${key} をサーバーが受け取れない`);
  }
  // ⚠ 投手に打撃練習、野手に投げ込みを出さない
  assert.ok(!offered(true).includes('batting'), '投手に打撃練習を出している');
  assert.ok(!offered(false).includes('control'), '野手に投げ込みを出している');
  // ⚠ **オンラインで動かさない練習を出さない**。実測で「新球種習得」が出ていた
  assert.ok(!offered(true).includes('newpitch'), '新球種習得を出している');
}

// --- まとめて割り当て（方針 → メニュー）がサーバーを通るか --------------
{
  const league = leagueAtCamp();
  const roster = ownRoster(league);
  for (const player of roster) {
    // ⚠ 本人の希望が読めること（画面が出す）
    const wish = playerWish(player);
    assert.ok(DIRECTIONS[wish.direction], `希望の方針が読めない: ${player.name}`);
    for (const direction of Object.keys(DIRECTIONS))
      for (const phase of ['physique', 'skill']) {
        const { main } = resolveTraining(player, direction, phase);
        assert.ok(
          CAMP_MENUS.includes(main),
          `方針から引いたメニューをサーバーが受け取れない: ${main}（${direction}/${phase}）`,
        );
      }
  }
}

// --- 提出の検証 ---------------------------------------------------------
{
  const league = leagueAtCamp();
  const roster = ownRoster(league);
  // 受け取れないメニューは弾く
  assert.throws(
    () =>
      quiet(() =>
        submitPhase(
          league,
          'a',
          {
            phaseId: league.phase.id,
            plan: { menu: 'standard', assignments: { [roster[0].id]: 'newpitch' } },
            ready: false,
          },
          NOW,
        ),
      ),
    /練習メニューが不正/,
  );
  // ⚠ **他球団の選手は落とす**。混ぜられると練習が飛ぶ
  quiet(() =>
    submitPhase(
      league,
      'a',
      {
        phaseId: league.phase.id,
        plan: {
          menu: 'standard',
          assignments: { [roster[0].id]: 'fielding', 999999999: 'batting' },
        },
        ready: false,
      },
      NOW,
    ),
  );
  const saved = league.phase.submissions.a.plan;
  assert.deepEqual(
    Object.keys(saved.assignments),
    [String(roster[0].id)],
    '名簿に居ない選手の割り当てが残っている',
  );
}

// --- 割り当てが本当に効くか（ここが本丸） -------------------------------
// ⚠ 同じ種のリーグを2回作り、**割り当てだけ**を変えて比べる。乱数の流れは
//    手続きのidから決まるので、差は割り当てによるものになる。
const all = (key) => (roster) =>
  Object.fromEntries(roster.map((p) => [p.id, key]));
const batting = campWith(all('batting'));
const running = campWith(all('baserunning'));
assert.ok(
  batting.meet > running.meet,
  `打撃練習でミートが伸びていない: 打撃${batting.meet} / 走塁${running.meet}`,
);
assert.ok(
  running.speed > batting.speed,
  `走塁練習で走力が伸びていない: 走塁${running.speed} / 打撃${batting.speed}`,
);

// 投手も同じ（投げ込みと球速練習を比べる）
const control = campWith(all('control'));
const velocity = campWith(all('velocity'));
assert.ok(
  control.control > velocity.control,
  `投げ込みで制球が伸びていない: 投げ込み${control.control} / 球速${velocity.control}`,
);
assert.ok(
  velocity.velocity > control.velocity,
  `球速練習で球速が伸びていない: 球速${velocity.velocity} / 投げ込み${control.velocity}`,
);

// --- 1クールずつ自分で実行する（ここが本丸） ---------------------------
// ⚠ **自分で回したクールを数えること**。数えないと、画面で4回やった球団が
//    締め切りでもう4回やって**8クールぶん**成長する。
{
  const dir = await mkdtemp(join(tmpdir(), 'pennant-camp-'));
  try {
    const store = new FileStore(join(dir, 'state.gz'));
    const service = new LeagueService(store, {
      members: [{ userId: 'admin', label: '管理者' }],
      adminId: 'admin',
      clock: () => NOW,
    });
    const admin = (await service.login('admin')).sessionId;
    let seq = 0;
    const send = async (type, payload) => {
      const l = (await store.read()).league;
      seq += 1;
      return service.command('admin', admin, {
        requestId: `campchk-${type}-${seq}`,
        revision: l?.revision ?? 0,
        type,
        payload,
      });
    };
    await send('create');
    const created = (await store.read()).league;
    await send('submit', {
      phaseId: created.phase.id,
      plan: { packId: created.packs[0].id },
      ready: true,
      baseSubmission: null,
    });
    const atCamp = (await store.read()).league;
    assert.equal(atCamp.phase.kind, 'camp', '前提: キャンプが開いている');
    const teamName = atCamp.members[0].teamName;
    const sumOf = (league) => totals(league.game.teams[teamName].players);
    const start = sumOf(atCamp);

    // ⚠ ビューに進み具合が載ること（載らないと画面が毎回「第1クール」になる）
    const view0 = await service.view('admin', admin);
    assert.equal(view0.phase.camp?.rounds, 0, 'クールの進みが渡っていない');
    assert.equal(view0.phase.camp?.total, 4, 'クール数が渡っていない');

    const roster = atCamp.game.teams[teamName].players;
    const round = (n) =>
      send('campRound', {
        round: n,
        policy: { direction: 'balanced', phase: 'skill' },
        main: Object.fromEntries(
          roster.map((p) => [
            p.id,
            p.position === 'pitcher' ? 'control' : 'batting',
          ]),
        ),
        sub: Object.fromEntries(roster.map((p) => [p.id, 'physique'])),
      });

    await round(1);
    const after1 = (await store.read()).league;
    assert.equal(after1.phase.camp.admin.rounds, 1, '1クール目が数えられていない');
    const one = sumOf(after1);
    assert.ok(one.meet > start.meet, '1クールで伸びていない');
    // ⚠ **サブ練習も実行すること**。基礎体力は「体力+2〜4/クール確定」なので、
    //    1クールで人数×2以上は必ず伸びる。メインだけ回していると伸びない
    assert.ok(
      one.bodyStamina - start.bodyStamina >= roster.length * 2,
      `サブ練習（基礎体力）が効いていない: 体力の伸び ${one.bodyStamina - start.bodyStamina}（${roster.length}人）`,
    );

    // ⚠ **同じクールを2回走らせない**。押し直しや再送で成長が二重に積まれる
    await assert.rejects(
      () => round(1),
      (e) => e.status === 409,
      '同じクールを2回実行できた',
    );
    // ⚠ 飛ばして先のクールも実行できない
    await assert.rejects(
      () => round(4),
      (e) => e.status === 409,
      'クールを飛ばして実行できた',
    );

    await round(2);
    const two = sumOf((await store.read()).league);
    assert.ok(two.meet > one.meet, '2クール目が効いていない');

    // ⚠ 残り2クールは締め切りで自動。合計4クールぶんで止まること
    await send('testmode', { on: true });
    await send('resolve');
    const done = (await store.read()).league;
    assert.notEqual(done.phase?.kind, 'camp', 'キャンプが終わっていない');
    const finished = sumOf(done);
    // 4クールぶんの伸びは、2クールぶんの伸びのおよそ2倍。8クール回っていたら
    // 3倍を超える（実測で2クール+4クール＝6クールぶんになっていた）
    const perTwo = two.meet - start.meet;
    const all4 = finished.meet - start.meet;
    assert.ok(
      all4 > perTwo,
      `残りのクールが回っていない: 2クール${perTwo} / 全部${all4}`,
    );
    assert.ok(
      all4 < perTwo * 2.6,
      `自分で回したぶんが数えられていない（二重に成長した）: 2クール${perTwo} / 全部${all4}`,
    );

    // ⚠ キャンプが終わったら打順が組み直されていること（空のまま開幕させない）
    const order = done.game.teams[teamName].lineupSettings?.battingOrder || [];
    assert.equal(order.length, 9, 'キャンプ後の打順が9人でない');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// --- 4クール終えたら、締め切りを待たずに次へ進むこと ---------------------
// ⚠ **印（`submissions[...].ready`）を直に立てても解決しない**。手続きを
//    解決するのは `submitPhase` の中（最後の1人が決定した瞬間）で、印だけ
//    立てると誰も解決しない。実測で、4クール終えてもキャンプが終わらず、
//    日付が1月1日のまま止まっていた。
{
  const dir = await mkdtemp(join(tmpdir(), 'pennant-camp4-'));
  try {
    const store = new FileStore(join(dir, 'state.gz'));
    const service = new LeagueService(store, {
      members: [{ userId: 'admin', label: '管理者' }],
      adminId: 'admin',
      clock: () => NOW,
    });
    const admin = (await service.login('admin')).sessionId;
    let seq = 0;
    const send = async (type, payload) => {
      const l = (await store.read()).league;
      seq += 1;
      return service.command('admin', admin, {
        requestId: `camp4-${type}-${seq}`,
        revision: l?.revision ?? 0,
        type,
        payload,
      });
    };
    await send('create');
    const created = (await store.read()).league;
    await send('submit', {
      phaseId: created.phase.id,
      plan: { packId: created.packs[0].id },
      ready: true,
      baseSubmission: null,
    });
    const atCamp = (await store.read()).league;
    const teamName = atCamp.members[0].teamName;
    const roster = atCamp.game.teams[teamName].players;
    for (let r = 1; r <= 4; r += 1)
      await send('campRound', {
        round: r,
        policy: { direction: 'balanced', phase: 'skill' },
        main: Object.fromEntries(
          roster.map((p) => [
            p.id,
            p.position === 'pitcher' ? 'control' : 'batting',
          ]),
        ),
        sub: Object.fromEntries(roster.map((p) => [p.id, 'physique'])),
      });
    const after = (await store.read()).league;
    assert.ok(!after.phase, '4クール終えてもキャンプが終わらない');
    assert.equal(after.status, 'running', '開幕待ちになっていない');
    // ⚠ キャンプが終わると日付が開幕日（4/1）へ動く。動いていなければ
    //    手続きの解決そのものが走っていない
    assert.equal(after.season.currentDate.month, 4, '日付が開幕日へ動いていない');
    assert.equal(after.season.currentDate.day, 1, '日付が開幕日へ動いていない');
    // ⚠ 5クール目は受け付けない
    await assert.rejects(
      () =>
        send('campRound', {
          round: 5,
          policy: { direction: 'balanced', phase: 'skill' },
          main: {},
          sub: {},
        }),
      (e) => e.status === 409,
      'キャンプが終わったのに実行できた',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ⚠ **割り当ての無い選手は全体の方針で埋める**（携帯・未提出の球団のため）。
//    1人だけ割り当てて、残りが既定のまま伸びることを見る
{
  const league = leagueAtCamp();
  const roster = ownRoster(league);
  const one = roster.find((p) => p.position !== 'pitcher');
  const before = totals(roster);
  quiet(() =>
    submitPhase(
      league,
      'a',
      {
        phaseId: league.phase.id,
        plan: { menu: 'baserunning', assignments: { [one.id]: 'batting' } },
        ready: true,
      },
      NOW,
    ),
  );
  const after = totals(ownRoster(league));
  assert.ok(
    after.speed - before.speed > 0,
    '割り当ての無い選手が全体の方針で練習していない',
  );
}

// ⚠ 世界を汚したまま終わらない（ほかの検査と同じプロセスで動くことがある）
loadLeagueWorld(leagueAtCamp());
captureWorld();

console.log(
  '■ キャンプ: OK（選手ごとに効く / 1クールずつ実行して数える / 同じクールを2回走らせない / 残りは締め切りで自動 / 画面のメニューをサーバーが受け取れる）',
);
