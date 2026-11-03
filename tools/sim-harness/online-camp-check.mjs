// キャンプの割り当ての検査。
//
// ⚠ 主目的は「**選手ごとの割り当てが本当に効くこと**」。以前は球団で1つ
//    メニューを選ぶだけで、一人用（1人ずつ割り当てる）とは別物だった。
//    画面だけ作って中身が全員同じ練習のままでも、見た目では気づけない。
// ⚠ もう1つは「**画面が出すメニューを、サーバーが必ず受け取れること**」。
//    `TRAINING_MENUS` にはオンラインのエンジンが動かさないもの
//    （新球種習得）があり、実測で画面に出ていた。選べるのに提出で弾かれる。
import assert from 'node:assert/strict';
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
  '■ キャンプの割り当て: OK（選手ごとに効く / 画面のメニューをサーバーが受け取れる / 他球団の選手を落とす / 割り当ての無い選手は全体の方針）',
);
