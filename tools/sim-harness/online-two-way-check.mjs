// 二刀流の起用（投手を野手で、野手を投手で）の検査。
//
// ⚠ 主目的は「**画面で組んだ二刀流の起用が、保存・試合の日・組み直しを通っても
//    そのまま残ること**」（いしだ指摘: 二刀流が売りなのに、投手は投手・野手は野手
//    でしか出られなかった）。
//   - 投手をスタメンの野手に入れられる / 野手を先発ローテ・救援に入れられる
//   - 先発の日だけ9番・投手に回り、空いた打順は控えが入る。試合の後は元の打順に戻る
//   - 投手起用に加えていない野手は救援に入らない（全員が「おまかせ」で投げない）
//   - 組み直し（CPUの打順作り）が選手の守備位置の登録を書き換えない
//   - 戻した後に同じ選手が2回並ばない（9番は野手に入っていない先発で仮に埋める）
//   - 控えは守れて疲れていない野手から。野手の控えが居なくても日を進められる
import assert from 'node:assert/strict';
import './lib/bootstrap.mjs';
import {
  createLeague,
  defaultPhasePlan,
  submitPhase,
  saveLineup,
  loadLeagueWorld,
  captureLeagueWorld,
  advanceLeagueDay,
} from '../../server/leagueEngine.mjs';
import {
  prepareDailyLineup,
  benchTwoWayStarter,
} from '../../server/dailyLineup.mjs';
import { ensureCompleteLineup } from '../../src/game/lineup.js';
import { getPositionFitness } from '../../src/utils/physics.js';
import { autoSimulateGame } from '../../src/game/autoSimulation.js';
import { TEAMS_DATA } from '../../src/teams-data.js';

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

const league = quiet(() =>
  createLeague({ members: [{ userId: 'a' }], now: NOW }),
);
for (let i = 0; i < 4 && league.phase; i += 1)
  quiet(() =>
    submitPhase(
      league,
      'a',
      {
        phaseId: league.phase.id,
        plan: defaultPhasePlan(league, league.members[0].teamName),
        ready: true,
      },
      NOW,
    ),
  );
const own = league.members[0].teamName;
const team = () => league.game.teams[own];
const roster = () => team().players;
const find = (id) => roster().find((p) => p.id === id);
const registered = new Map(roster().map((p) => [p.id, p.position]));

// --- 二刀流の編成を保存する --------------------------------------------
const pitchers = roster().filter((p) => p.position === 'pitcher');
const fielders = roster().filter((p) => p.position !== 'pitcher');
const saved = team().lineupSettings.battingOrder.filter((e) => e.battingOrder <= 8);
const starters = [...team().pitchingRotation.starters];
// 先発ローテの1番手の投手を、6番・右翼にも入れる（先発と野手の兼任）
const twoWay = starters[0];
// 救援に入っていない野手を先発ローテの末尾に入れ、別の野手を中継ぎに加える
const order = saved.map((e) => ({ ...e }));
const rightSlot = order.find((e) => e.position === 'right');
const replacedFielder = rightSlot.playerId;
rightSlot.playerId = twoWay;
const benchFielders = fielders.filter(
  (p) => !order.some((e) => e.playerId === p.id),
);
assert.ok(benchFielders.length >= 3, '前提: 控えの野手が3人以上いる');
const fielderStarter = benchFielders[0].id;
const fielderReliever = benchFielders[1].id;
const untouched = benchFielders[2].id;
const plan = {
  battingOrder: order,
  starters: [...starters, fielderStarter].slice(0, 8),
  pitcherRoles: {
    ...Object.fromEntries(
      Object.entries(team().pitchingRotation.pitcherRoles || {}).filter(
        ([id]) => registered.get(Number(id)) === 'pitcher',
      ),
    ),
    [fielderStarter]: 'auto_s',
    [fielderReliever]: 'long',
  },
};
// ⚠ 保存は `league.game` に直に書く（世界を読み込んでから書き戻すと消える）
saveLineup(league, 'a', plan);
{
  const rot = team().pitchingRotation;
  assert.ok(rot.starters.includes(fielderStarter), '野手を先発ローテに入れられない');
  assert.ok(
    rot.middleRelievers.includes(fielderReliever),
    '野手を救援（ロングリリーフ）に入れられない',
  );
  assert.equal(rot.pitcherRoles[fielderReliever], 'long', '野手の役割が残っていない');
  // ⚠ 加えていない野手は救援に入らない
  assert.ok(
    !rot.middleRelievers.includes(untouched) && !rot.relievers.includes(untouched),
    '投手起用に加えていない野手が救援に入っている',
  );
  const ninth = team().lineupSettings.battingOrder.filter((e) => e.battingOrder === 9);
  assert.equal(ninth.length, 1, '9番が1人でない');
  // ⚠ 次の先発が野手の打順にも居るので、9番は野手に入っていない先発で仮に埋める
  assert.notEqual(ninth[0].playerId, twoWay, '9番に野手の打順の選手を重ねた');
  // 守備位置の登録はそのまま
  assert.equal(find(twoWay).position, 'pitcher', '二刀流の投手の登録が変わった');
  assert.notEqual(find(fielderStarter).position, 'pitcher', '野手の登録が変わった');
}

// --- 先発の日: 9番・投手に回り、空いた打順は控えが入る。試合の後は戻る ---------
{
  loadLeagueWorld(league);
  const live = TEAMS_DATA[own];
  live.pitchingRotation.currentStarterIndex = 0;
  const restore = prepareDailyLineup(live, own);
  const day = live.lineupSettings.battingOrder;
  const ninth = day.find((e) => e.battingOrder === 9);
  assert.equal(ninth.playerId, twoWay, '先発の日に二刀流の選手が9番・投手に回っていない');
  assert.equal(ninth.position, 'pitcher');
  const right = day.find((e) => e.position === 'right');
  assert.ok(right && right.playerId !== twoWay, '先発の日に右翼が空いた・兼ねたまま');
  assert.equal(day.length, 9, '先発の日の打順が9人でない');
  assert.equal(new Set(day.map((e) => e.playerId)).size, 9, '先発の日に同じ選手が2回いる');
  restore();
  const after = live.lineupSettings.battingOrder;
  assert.equal(
    after.find((e) => e.position === 'right')?.playerId,
    twoWay,
    '先発の日のあとで二刀流の選手が右翼に戻っていない（スタメンから消えていく）',
  );
  // ⚠ 戻すと9番（今日の先発）と右翼が同じ選手になる。9番は次の先発に替える
  assert.equal(
    new Set(after.map((e) => e.playerId)).size,
    after.length,
    '先発の日のあとで同じ選手が2回並んでいる（9番と右翼）',
  );
  league.game = captureLeagueWorld();
}

// --- 野手の先発の日: 野手が投げる ---------------------------------------
{
  const index = team().pitchingRotation.starters.indexOf(fielderStarter);
  assert.ok(index >= 0);
  team().pitchingRotation.currentStarterIndex = index;
  // 試合のある日まで進める（休養日を飛ばす）
  league.status = 'running';
  for (let n = 0; n < 5; n += 1) {
    const before = find(fielderStarter).seasonStats?.pitching?.games || 0;
    quiet(() => advanceLeagueDay(league, `twoway:${n}`, NOW));
    const pitched = find(fielderStarter).seasonStats?.pitching?.games || 0;
    if (pitched > before) break;
    if (n === 4) assert.fail('野手の先発が5日のうちに一度も投げていない');
    team().pitchingRotation.currentStarterIndex = index;
  }
  assert.ok(
    (find(fielderStarter).seasonStats?.pitching?.games || 0) >= 1,
    '先発ローテの野手が投げていない',
  );
  // 二刀流の選手は打順に残っている
  assert.ok(
    team().lineupSettings.battingOrder.some(
      (e) => e.playerId === twoWay && e.position === 'right',
    ),
    '試合を進めたら二刀流の選手が右翼から外れた',
  );
  assert.equal(
    find(replacedFielder) && find(replacedFielder).position,
    registered.get(replacedFielder),
    '控えに回った野手の登録が変わった',
  );
}

// --- 組み直し（CPUの打順作り）が登録を書き換えない ----------------------
{
  for (const [name, t] of Object.entries(league.game.teams)) {
    if (!t.players?.length || !league.season.settings.teamNames.includes(name)) continue;
    // CPU球団でも、打順に入った選手の登録がその日の守備位置に書き換わらない
    const pitcherSlots = (t.lineupSettings?.battingOrder || []).filter(
      (e) => e.position !== 'pitcher',
    );
    for (const e of pitcherSlots) {
      const p = t.players.find((x) => x.id === e.playerId);
      if (!p) continue;
      assert.ok(
        p.position !== 'pitcher' || p.isTwoWay || name === own,
        `${name} の ${p.name}（投手・二刀流でない）が${e.position}を守っている`,
      );
    }
  }
}

// --- 控えの選び方と、野手の控えが居ない日 -------------------------------
// ⚠ 組み直しの確かめ（`refreshTeamPlan`）と同じ手順: 控えに任せて
//    `ensureCompleteLineup` で確かめ、すぐ戻す。同じ選手が2回並ばないこと
const startTwoWay = (live) => {
  const rot = live.pitchingRotation;
  rot.currentStarterIndex = rot.starters.indexOf(twoWay);
  assert.ok(rot.currentStarterIndex >= 0, '二刀流の選手がローテから消えた');
  live.players.find((p) => p.id === twoWay).fatigue = 0;
};
{
  loadLeagueWorld(league);
  const live = TEAMS_DATA[own];
  startTwoWay(live);
  const undo = benchTwoWayStarter(live);
  assert.ok(ensureCompleteLineup(live, false), '組み直しの確かめで打順が組めない');
  undo();
  const kept = live.lineupSettings.battingOrder;
  assert.equal(
    kept.find((e) => e.position === 'right')?.playerId,
    twoWay,
    '組み直しの確かめで二刀流の選手が右翼から外れた',
  );
  assert.equal(
    new Set(kept.map((e) => e.playerId)).size,
    kept.length,
    '組み直しの確かめのあとで同じ選手が2回並んでいる',
  );
}
{
  // 守れる控えのうち一番合う選手が疲れていたら、次に合う疲れていない選手
  loadLeagueWorld(league);
  const live = TEAMS_DATA[own];
  startTwoWay(live);
  const inOrder = new Set(live.lineupSettings.battingOrder.map((e) => e.playerId));
  const fit = (p) => (p.position === 'right' ? 100 : getPositionFitness(p, 'right', 0));
  const able = live.players
    .filter((p) => p.isActive !== false && p.position !== 'pitcher' && !inOrder.has(p.id))
    .filter((p) => fit(p) >= 60)
    .sort((a, b) => fit(b) - fit(a));
  assert.ok(able.length >= 2, '右翼を守れる控えが2人居ない（検査の前提）');
  able[0].fatigue = 90;
  for (const p of able.slice(1)) p.fatigue = 0;
  const restore = prepareDailyLineup(live, own);
  const right = live.lineupSettings.battingOrder.find((e) => e.position === 'right');
  assert.notEqual(right.playerId, able[0].id, '疲れた控えを二刀流の選手の代わりに出した');
  assert.ok(
    able.slice(1).some((p) => p.id === right.playerId),
    '守れて疲れていない控えを選んでいない',
  );
  restore();
}
{
  // 野手の控えが全員出られなくても、ローテの外の投手が右翼を埋めて日を進められる
  loadLeagueWorld(league);
  const live = TEAMS_DATA[own];
  startTwoWay(live);
  const inOrder = new Set(live.lineupSettings.battingOrder
    .filter((e) => e.position !== 'pitcher').map((e) => e.playerId));
  for (const p of live.players)
    if (p.position !== 'pitcher' && !inOrder.has(p.id)) p.isActive = false;
  const restore = prepareDailyLineup(live, own);
  const day = live.lineupSettings.battingOrder;
  const right = live.players.find(
    (p) => p.id === day.find((e) => e.position === 'right')?.playerId,
  );
  assert.ok(right && right.id !== twoWay, '野手の控えが居ない日に右翼が空いた');
  assert.equal(right.position, 'pitcher', '右翼を埋めたのが投手でない');
  assert.ok(
    !live.pitchingRotation.starters.includes(right.id),
    'ローテの投手を右翼に回した',
  );
  assert.equal(new Set(day.map((e) => e.playerId)).size, 9, '同じ選手が2回いる');
  restore();
  assert.equal(
    live.lineupSettings.battingOrder.find((e) => e.position === 'right')?.playerId,
    twoWay,
    '野手の控えが居ない日のあとで二刀流の選手が右翼に戻っていない',
  );
}

console.log(
  '■ 二刀流の起用: OK（投手を野手で・野手を先発と救援で保存できる / 先発の日だけ9番に回って控えが埋め、試合の後に戻る / 野手の先発が投げる / 加えていない野手は救援に入らない / 登録を書き換えない / 戻した後に同じ選手が並ばない / 控えは守れて疲れていない野手から・野手が居なければローテの外の投手）',
);

// 救援へ回る野手の代役がいなければ続投する。抹消中の控えは戻さない。
for (const benchKind of ['inactive', 'fielder', 'pitcher']) {
  loadLeagueWorld(league);
  const live = TEAMS_DATA[own];
  const order = live.lineupSettings.battingOrder;
  const starterId = order.find((e) => e.position === 'pitcher').playerId;
  const fielderId = order.find((e) => e.position === 'catcher').playerId;
  const activeIds = new Set(order.map((e) => e.playerId));
  const extra = live.players.find((p) =>
    !activeIds.has(p.id) && (benchKind === 'pitcher' ? p.position === 'pitcher' : p.position !== 'pitcher'),
  );
  assert.ok(extra, '検査用の控えがいない');
  live.players = live.players.filter((p) => activeIds.has(p.id) || p.id === extra.id);
  for (const p of live.players) {
    p.isActive = p.id !== extra.id || benchKind !== 'inactive';
    p.fatigue = 0;
  }
  live.players.find((p) => p.id === starterId).pitching.stamina = 10;
  live.pitchingRotation = {
    starters: [starterId], currentStarterIndex: 0, middleRelievers: [fielderId],
    setupMen: [], closer: null, relievers: [fielderId], reliefFatigue: {},
    pitcherRoles: { [starterId]: 'opener', [fielderId]: 'long' },
  };
  let frames = 0;
  const away = league.season.settings.teamNames.find((n) => n !== own);
  const result = quiet(() => autoSimulateGame(own, away, false, 123, {
    plateAppearance() {},
    replay(frame) {
      if (frame.kind !== 'matchup') return;
      frames += 1;
      const lineup = frame.lineups[own];
      assert.equal(lineup.length, 9, `${benchKind}: 救援登板で守備・打順が8人になった`);
      assert.equal(new Set(lineup.map((p) => p.id)).size, 9);
      assert.equal(new Set(lineup.map((p) => p.order)).size, 9);
      if (frame.top) assert.equal(new Set(lineup.map((p) => p.position)).size, 9, '守備位置が重複');
      if (benchKind === 'inactive')
        assert.ok(!lineup.some((p) => p.id === extra.id), '抹消中の控えが試合に出た');
    },
  }));
  assert.ok(frames > 0, '試合を観測していない');
  const appearances = result.pitcherAppearances.home.map((p) => p.id);
  assert.equal(appearances.includes(fielderId), benchKind !== 'inactive', '野手救援の可否が代役の有無と合わない');
}
console.log('■ 二刀流の救援: OK（代役の有無を確認 / 抹消選手を使わない / 守備と打順を9人に保つ）');
