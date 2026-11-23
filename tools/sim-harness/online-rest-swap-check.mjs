// 疲れた野手をその日だけ休ませるとき・自動でスタメンを組むときの、守備の適性の扱い。
//
// ⚠ 先方指摘（2026-11-20）「CPU監督などの、疲労などによる自動スタメン入れ替え、守備適性的なところが雑」。
//    以前は休ませる人の守備位置にそのまま入れる控えだけを探していたので、
//    - 遊撃手を休ませたいのに控えに遊撃を守れる人が居ないと休めない（二塁手を回せば休めるのに）
//    - 疲れ切った選手（疲労120以上）の代わりに捕手が二塁や中堅に入る
//    - 一人用のCPUは遊撃→二塁→…と1か所ずつ取るので、後ろの守備ほど穴になる
//    ことがあった。ここは小さな名簿の場面と、本物の初期の名簿12球団の全部の場面で確かめる。
import { quietAsync } from './lib/quiet.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './lib/bootstrap.mjs';
import { createTestStore } from './lib/testStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { defaultPhasePlan } from '../../server/leagueEngine.mjs';
import { prepareDailyLineup, restTiredFielders } from '../../server/dailyLineup.mjs';
import { ensureCompleteLineup, fieldFitness } from '../../src/game/lineup.js';
import { generateAILineup } from '../../src/game/autoSimulation.js';
import { planRest } from '../../src/online/restPlan.js';
import { lineupNotes } from '../../src/online/tapLineup.js';
import {
  FIELDER_REST_FATIGUE,
  FIELDER_FORCE_REST_FATIGUE,
  SUBSTITUTE_MIN_FITNESS,
} from '../../src/online/shared.js';

const POSITIONS = ['catcher', 'first', 'second', 'short', 'third', 'left', 'center', 'right'];
// 本職だけを守れる8人（適性は本職100・ほかは0）と、投手1人
const team = (extra = [], tune = {}) => {
  const players = POSITIONS.map((position, i) => ({
    id: i + 1,
    position,
    fatigue: 0,
    positionFitness: {},
    batting: { meet: 50, power: 50 },
    ...(tune[position] || {}),
  }));
  players.push({ id: 99, position: 'pitcher', fatigue: 0 });
  return {
    players: [...players, ...extra],
    pitchingRotation: { starters: [99], currentStarterIndex: 0 },
    lineupSettings: {
      battingOrder: [
        ...POSITIONS.map((position, i) => ({ playerId: i + 1, position, battingOrder: i + 1 })),
        { playerId: 99, position: 'pitcher', battingOrder: 9 },
      ],
    },
  };
};
const at = (t, position) => t.lineupSettings.battingOrder.find((e) => e.position === position)?.playerId;
const snapshot = (t) => JSON.stringify(t.lineupSettings.battingOrder);

// --- 1. 守備を移して休ませる（遊撃手が疲れ、控えは二塁手だけ。二塁手は遊撃も守れる）
{
  const t = team(
    [{ id: 20, position: 'second', fatigue: 0, positionFitness: { short: 40 }, batting: { meet: 50, power: 50 } }],
    { short: { fatigue: FIELDER_REST_FATIGUE + 5 }, second: { positionFitness: { short: 85 } } },
  );
  const before = snapshot(t);
  const restore = restTiredFielders(t);
  assert.notEqual(at(t, 'short'), 4, '遊撃手を休ませていない（二塁手を遊撃へ回せば休める）');
  assert.equal(at(t, 'short'), 3, '二塁手が遊撃へ回っていない');
  assert.equal(at(t, 'second'), 20, '控えの二塁手が二塁に入っていない');
  restore();
  assert.equal(snapshot(t), before, '試合の後に打順と守備位置が元に戻っていない');
}

// --- 2. ふつうの疲れでは、組み直しても下限に届かなければ休ませない
{
  const t = team(
    [{ id: 20, position: 'catcher', fatigue: 0, positionFitness: { short: 30 } }],
    { short: { fatigue: FIELDER_REST_FATIGUE + 5 } },
  );
  restTiredFielders(t);
  assert.equal(at(t, 'short'), 4, '守れる組み合わせが無いのに、ふつうの疲れで守備の穴を開けた');
}

// --- 3. 疲れ切った選手は休ませる。そのとき守備の穴はいちばん小さく（捕手を二塁に入れない）
{
  // 二塁手が疲れ切った。控えは捕手（二塁30）と外野手（二塁55）。一塁手は二塁を70で守れる
  const t = team(
    [
      { id: 20, position: 'catcher', fatigue: 0, positionFitness: { second: 30, first: 30 } },
      { id: 21, position: 'left', fatigue: 0, positionFitness: { second: 55, first: 65 } },
    ],
    { second: { fatigue: FIELDER_FORCE_REST_FATIGUE + 5 }, first: { positionFitness: { second: 70 } } },
  );
  const restore = restTiredFielders(t);
  assert.notEqual(at(t, 'second'), 3, '疲れ切った二塁手を休ませていない');
  assert.notEqual(at(t, 'second'), 20, '捕手を二塁に入れた（ほかに組みようがあるのに）');
  const byId = new Map(t.players.map((p) => [p.id, p]));
  for (const e of t.lineupSettings.battingOrder)
    if (e.position !== 'pitcher')
      assert.ok(
        fieldFitness(byId.get(e.playerId), e.position) >= SUBSTITUTE_MIN_FITNESS,
        `下限を割る守備が残った: ${e.position}`,
      );
  restore();
}

// --- 4. 打順に空きができたときの穴埋めは、適性の合う控えを合う位置へ（名簿の並びで選ばない）
{
  const t = team([
    { id: 20, position: 'left', fatigue: 0, positionFitness: { catcher: 0 } },
    { id: 21, position: 'catcher', fatigue: 0, positionFitness: {} },
  ]);
  t.players.find((p) => p.id === 1).isActive = false; // 捕手が抹消
  assert.ok(ensureCompleteLineup(t, false), '打順を埋められない');
  assert.equal(at(t, 'catcher'), 21, '空いた捕手に控えの捕手を入れていない（外野手を入れた）');
}

// --- 5. 一人用のCPUの打順作りは守備をまとめて決める（遊撃も守れる捕手を遊撃に取らない）
{
  const t = team([
    // 遊撃が本職より打てる捕手が1人だけ。ほかに捕手は居ない
    { id: 30, position: 'short', fatigue: 0, positionFitness: { short: 80 }, batting: { meet: 40, power: 40 } },
  ]);
  t.players.find((p) => p.id === 1).positionFitness = { catcher: 90, short: 85 };
  t.players.find((p) => p.id === 1).batting = { meet: 90, power: 90 };
  // 遊撃手（id 4）を疲れ切らせる → 遊撃は控え（id 30）か捕手（id 1）
  t.players.find((p) => p.id === 4).fatigue = 130;
  for (const p of t.players) if (p.position !== 'pitcher') p.positionFitness[p.position] ??= 100;
  generateAILineup(t, '__check__');
  const catcher = t.players.find((p) => p.battingOrder > 0 && p.position === 'catcher');
  assert.equal(catcher?.id, 1, '捕手を遊撃に取って、捕手を守れない選手を捕手にした');
}

// --- 5b. 二刀流の先発の日（2026-11-20 監査）。休養は、先発投手として野手の枠を抜ける二刀流を
//     残る先発に数えない。以前は二刀流（二塁手。遊撃も守れる）を遊撃へ回して疲れた遊撃手を休ませる
//     案を作り、その後 `benchTwoWayStarter` が二刀流の抜けた遊撃に休ませた遊撃手を戻していた
//     （画面は「休みます」）。画面の見込み（`lineupNotes` に次の先発を渡す）と試合の日が同じになるか
{
  const FIELD8 = POSITIONS;
  const fit = (own, extra = {}) =>
    Object.fromEntries(FIELD8.map((p) => [p, p === own ? 100 : (extra[p] ?? 20)]));
  const P = (id, position, o = {}) => ({
    id,
    position,
    isActive: true,
    fatigue: 0,
    batting: { meet: 60, power: 60 },
    positionFitness: fit(position, o.fit),
    ...o,
  });
  const make = (extra = []) => ({
    players: [
      P(1, 'catcher'), P(2, 'first'),
      P(3, 'second', { fit: { short: 90 }, pitching: { stamina: 60 } }), // 二刀流（次の先発）
      P(4, 'short', { fatigue: FIELDER_REST_FATIGUE + 20 }),
      P(5, 'third'), P(6, 'left'), P(7, 'center'), P(8, 'right'),
      P(10, 'second', { fit: { short: 30 } }), P(11, 'catcher'), P(12, 'left'),
      ...extra,
      P(20, 'pitcher'), P(21, 'pitcher'),
    ],
    pitchingRotation: { starters: [3, 20, 21], currentStarterIndex: 0 },
    lineupSettings: {
      battingOrder: [
        ...FIELD8.map((position, i) => ({ playerId: i + 1, position, battingOrder: i + 1 })),
        { playerId: 20, position: 'pitcher', battingOrder: 9 },
      ],
    },
  });
  const check = (t, label) => {
    const order = t.lineupSettings.battingOrder.filter((e) => e.position !== 'pitcher');
    const inOrder = new Set(t.lineupSettings.battingOrder.map((e) => e.playerId));
    const bench = t.players.filter((p) => !inOrder.has(p.id) && p.position !== 'pitcher');
    const said = lineupNotes(order, t.players, bench, {}, 3)
      .filter((n) => n.kind === 'rest')
      .map((n) => [order[n.index].playerId, n.text.includes('休みます')]);
    const saved = snapshot(t);
    const restore = prepareDailyLineup(t, 'T');
    const today = t.lineupSettings.battingOrder;
    const plays = today.some((e) => e.playerId === 4);
    assert.deepEqual(said, [[4, !plays]], `${label}: 画面の見込みと試合の日の遊撃手が食い違う`);
    assert.ok(today.some((e) => e.playerId === 3 && e.position === 'pitcher'), `${label}: 二刀流が先発に回っていない`);
    assert.equal(new Set(today.map((e) => e.playerId)).size, 9, `${label}: 同じ選手が2回並んだ`);
    restore();
    assert.equal(snapshot(t), saved, `${label}: 試合の後に打順が元に戻っていない`);
    return plays;
  };
  // 遊撃を守れる控えが居ない → 二刀流が抜けると遊撃手は休めない（画面も「休めません」）
  assert.equal(check(make(), '控えに遊撃手なし'), true, '休めないはずの遊撃手が休んだ');
  // 遊撃を守れる控えが居る → 休ませ、二刀流の抜けた枠にも戻さない
  assert.equal(
    check(make([P(13, 'short')]), '控えに遊撃手あり'),
    false,
    '休ませた遊撃手が二刀流の抜けた枠に戻った',
  );
}

// --- 5c. 起用できない先発（登録を外れた）が居る打順では休養を組まない（2026-11-20 監査）。
//     以前は抹消中の二塁手を遊撃へ移して遊撃手を休ませ、後で `ensureCompleteLineup` が
//     抹消中の選手を外して休ませた遊撃手で埋め、戻すと同じ選手が2枠・二塁が欠けて保存された
{
  const t = team(
    [{ id: 20, position: 'second', fatigue: 0, positionFitness: { second: 100, short: 30 }, batting: { meet: 50, power: 50 } }],
    {
      short: { fatigue: FIELDER_REST_FATIGUE + 20 },
      second: { isActive: false, positionFitness: { second: 100, short: 90 } },
    },
  );
  const restore = restTiredFielders(t);
  assert.ok(ensureCompleteLineup(t, false), '打順を埋められない');
  restore();
  const field = t.lineupSettings.battingOrder.filter((e) => e.position !== 'pitcher');
  assert.equal(new Set(field.map((e) => e.playerId)).size, 8, '戻した打順に同じ選手が2回並んだ');
  assert.equal(new Set(field.map((e) => e.position)).size, 8, '戻した打順で守備位置が欠けた');
  assert.equal(planRest(
    POSITIONS.map((position, i) => ({ player: t.players[i], position })),
    [],
  ), null, '起用できない先発が居るのに休養を組んだ');
}

// --- 6. 本物の初期の名簿（12球団）で、疲れたレギュラーの全部の組み合わせ
const dir = await mkdtemp(join(tmpdir(), 'rest-swap-'));
let league;
try {
  const store = createTestStore(join(dir, 'state.gz'));
  const service = new LeagueService(store, {
    members: [{ userId: 'admin', label: '管理者' }],
    adminId: 'admin',
    allowStep: true,
    clock: () => '2026-10-26T15:00:00.000Z',
  });
  const sessionId = (await service.login('admin')).sessionId;
  let seq = 0;
  const send = async (type, payload) => {
    const l = (await store.read()).league;
    seq += 1;
    return service.command('admin', sessionId, {
      requestId: `rest-${type}-${seq}`,
      revision: l?.revision ?? 0,
      type,
      payload,
    });
  };
  await quietAsync(() => send('create'));
  for (let i = 0; i < 4; i += 1) {
    const l = (await store.read()).league;
    if (!l.phase) break;
    await send('submit', {
      phaseId: l.phase.id,
      plan: defaultPhasePlan(l, l.members[0].teamName),
      ready: true,
      baseSubmission: null,
    });
  }
  league = (await store.read()).league;
} finally {
  await rm(dir, { recursive: true, force: true });
}

const measure = (level) => {
  const r = { wanted: 0, rested: 0, slots: 0, low: 0, notesAgree: 0, cases: 0 };
  for (const name of league.season.settings.teamNames) {
    const base = league.game.teams[name];
    const ids = base.lineupSettings.battingOrder
      .filter((e) => e.position !== 'pitcher')
      .map((e) => e.playerId);
    const scenes = [];
    for (const a of ids) scenes.push([a]);
    for (let i = 0; i < ids.length; i += 1)
      for (let j = i + 1; j < ids.length; j += 1) scenes.push([ids[i], ids[j]]);
    for (const tired of scenes) {
      const t = structuredClone(base);
      for (const p of t.players) p.fatigue = tired.includes(p.id) ? level : 10;
      const before = new Map(t.lineupSettings.battingOrder.map((e) => [e.playerId, e.position]));
      const saved = snapshot(t);
      // 画面の見込み（スマホの「気になる所」）が、試合の日の入れ替えと同じになるか
      const order = t.lineupSettings.battingOrder.filter((e) => e.position !== 'pitcher');
      const inOrder = new Set(t.lineupSettings.battingOrder.map((e) => e.playerId));
      const bench = t.players.filter((p) => !inOrder.has(p.id) && p.position !== 'pitcher');
      // ⚠ 打順の要素は入れ替えで書き換わるので、先に選手を読んでおく
      const said = lineupNotes(order, t.players, bench, {})
        .filter((n) => n.kind === 'rest' && n.text.includes('休みます'))
        .map((n) => order[n.index].playerId);
      const restore = restTiredFielders(t);
      const byId = new Map(t.players.map((p) => [p.id, p]));
      const now = t.lineupSettings.battingOrder;
      r.cases += 1;
      r.wanted += tired.length;
      const rested = tired.filter((id) => !now.some((e) => e.playerId === id));
      r.rested += rested.length;
      if (said.length === rested.length && said.every((id) => rested.includes(id))) r.notesAgree += 1;
      assert.equal(new Set(now.map((e) => e.playerId)).size, 9, '同じ選手が2回並んだ');
      assert.equal(
        new Set(now.filter((e) => e.position !== 'pitcher').map((e) => e.position)).size,
        8,
        '守備位置が重なった',
      );
      for (const e of now) {
        if (e.position === 'pitcher' || before.get(e.playerId) === e.position) continue;
        const fit = fieldFitness(byId.get(e.playerId), e.position);
        r.slots += 1;
        if (fit < SUBSTITUTE_MIN_FITNESS) r.low += 1;
      }
      restore();
      assert.equal(snapshot(t), saved, '試合の後に打順が元に戻っていない');
    }
  }
  return r;
};
const normal = measure(FIELDER_REST_FATIGUE + 20);
const broken = measure(FIELDER_FORCE_REST_FATIGUE + 10);
const share = (r) => ((r.rested / r.wanted) * 100).toFixed(1);
console.log(
  `  疲労${FIELDER_REST_FATIGUE + 20}: 休めた${share(normal)}% 入れ替えた守備${normal.slots}（下限割れ${normal.low}）`,
);
console.log(
  `  疲労${FIELDER_FORCE_REST_FATIGUE + 10}: 休めた${share(broken)}% 入れ替えた守備${broken.slots}（下限割れ${broken.low}）`,
);
assert.equal(normal.low, 0, 'ふつうの疲れで下限を割る守備を作った');
// 以前は 92% だった（同じ守備位置の控えしか見なかった）。組み直しで 97〜98%
assert.ok(normal.rested / normal.wanted >= 0.95, `ふつうの疲れで休めない場面が多い: ${share(normal)}%`);
assert.equal(broken.rested, broken.wanted, '疲れ切った選手を休ませていない');
// 以前は入れ替えた守備の 8%（70枠）が適性30前後だった。組み直しで 2% ほど（控えの顔ぶれで穴が避けられない場面だけ）
assert.ok(broken.low / broken.slots <= 0.04, `疲れ切った選手の代わりに下限を割る守備が多い: ${broken.low}/${broken.slots}`);
assert.equal(normal.notesAgree, normal.cases, '画面の「休みます」と試合の日の入れ替えが食い違う');
assert.equal(broken.notesAgree, broken.cases, '画面の「休みます」と試合の日の入れ替えが食い違う（疲れ切った選手）');
// planRest は休ませる人が居なければ null
assert.equal(planRest([], []), null);
console.log('■ 自動スタメンの守備の適性: OK（守備を移して休ませる / 下限を割らない / 疲れ切った選手の穴を小さく / 穴埋め / CPUの打順作り / 二刀流の先発の日 / 起用できない先発 / 画面の見込みと一致 / 戻す）');
