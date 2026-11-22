// 一人用のスタメン設定の表（`src/components/lineup/SoloLineupBoard.jsx`）の編集の中身
// （`src/components/lineup/soloLineupOrder.js`）。
//
// ⚠ 見るのは「どの操作も**試合を組む側（`ensureCompleteLineup`）が手を入れずに使える形**を
//    崩さない」こと。DH制（野手9枠）と DH 無し（野手8枠＋9番投手）の両方で確かめる。
//    オンラインの表（`lineupEdit.js`）は DH 無し固定なので、DH はここでしか見ていない。
import assert from 'node:assert/strict';
import { swapOrder, swapPositions, replaceStarter, benchFielders, positionFitness } from '../../src/online/lineupEdit.js';
import { orderFromTeam, writeOrder, sameOrder, slotPositions, candidatesForSlot, orderProblems } from '../../src/components/lineup/soloLineupOrder.js';
import { ensureCompleteLineup } from '../../src/game/lineup.js';
import { generateOptimalLineup, REST_POLICIES } from '../../src/game/lineupGenerator.js';

const FIELD = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
const clone = (v) => JSON.parse(JSON.stringify(v));
let id = 0;
const fielder = (position, extra = {}) => ({ id: ++id, name: `野手${id}`, position, batting: { meet: 50, power: 50, eye: 50 }, positionFitness: { [position]: 100 }, ...extra });
const pitcher = () => ({ id: ++id, name: `投手${id}`, position: 'pitcher', pitching: { velocity: 140 } });

function makeTeam(useDH) {
  id = 0;
  const starters = FIELD.map((pos) => fielder(pos));
  const dh = fielder('first', { batting: { meet: 80, power: 80, eye: 80 } });
  // ⚠ 控えの打撃は**ばらばらにする**（DH の候補の並びを本当に確かめるため）。全員 50 だと
  //    どう並べても「打撃の順」になり、検査が何も見ていなかった。並び（遊・左・捕）は打撃の順ではない
  const bench = [
    fielder('short', { positionFitness: { short: 100, second: 90 }, batting: { meet: 30, power: 40, eye: 35 } }),
    fielder('left', { batting: { meet: 70, power: 65, eye: 60 } }),
    fielder('catcher', { batting: { meet: 52, power: 45, eye: 50 } }),
  ];
  const pitchers = [pitcher(), pitcher(), pitcher()];
  const players = [...starters, dh, ...bench, ...pitchers];
  const battingOrder = starters.map((p, i) => ({ playerId: p.id, position: p.position, battingOrder: i + 1 }));
  if (useDH) battingOrder.push({ playerId: dh.id, position: 'dh', battingOrder: 9 });
  else battingOrder.push({ playerId: pitchers[0].id, position: 'pitcher', battingOrder: 9 });
  return {
    players,
    lineupSettings: { battingOrder, benchPlayers: [], substitutionRules: { pinchHitter: [], pinchRunner: [] } },
    pitchingRotation: { starters: pitchers.map((p) => p.id), middleRelievers: [], closers: [], currentStarterIndex: 0 },
  };
}

/** 試合を組む側が手を入れずに使えるか（打順・守備・選手が変わらない） */
function untouchedByGame(team, useDH) {
  const before = clone(team.lineupSettings.battingOrder).filter((e) => e.position !== 'pitcher');
  const copy = clone(team);
  assert.equal(ensureCompleteLineup(copy, useDH), true, '試合を組めない形になった');
  const after = copy.lineupSettings.battingOrder.filter((e) => e.position !== 'pitcher');
  const key = (list) => list.map((e) => `${e.battingOrder}:${e.playerId}:${e.position}`).sort().join(',');
  assert.equal(key(after), key(before), '試合を組む側が打順・守備を直した（表の書いた形が崩れている）');
}

for (const useDH of [false, true]) {
  const label = useDH ? 'DH制' : 'DH無し';
  const team = makeTeam(useDH);
  const lineupRef = team.lineupSettings.battingOrder;
  let order = orderFromTeam(team, useDH);
  assert.equal(order.length, useDH ? 9 : 8, `${label}: 野手の枠の数`);
  assert.deepEqual([...order.map((e) => e.position)].sort(), [...slotPositions(useDH)].sort(), `${label}: 守備位置が1つずつ`);
  assert.deepEqual(orderProblems(order, team.players), [], `${label}: 初めの形に問題がある`);

  // 3つの操作を順に書いて、読み直すと同じ形・試合側もそのまま使える
  const steps = [
    (o) => swapOrder(o, 0, 3),
    (o) => swapPositions(o, 1, useDH ? 8 : 5),
    (o) => replaceStarter(o, 2, benchFielders(team.players, o)[0].id),
  ];
  for (const step of steps) {
    order = step(order);
    writeOrder(team, order, useDH, team.pitchingRotation.starters[0]);
    assert.equal(team.lineupSettings.battingOrder, lineupRef, `${label}: 打順の配列を差し替えた（同じ配列のまま書くこと）`);
    assert.ok(sameOrder(orderFromTeam(team, useDH), order), `${label}: 書いて読み直すと形が変わる`);
    const pitcherRows = team.lineupSettings.battingOrder.filter((e) => e.position === 'pitcher');
    assert.equal(pitcherRows.length, useDH ? 0 : 1, `${label}: 9番の投手の枠`);
    if (!useDH) assert.equal(pitcherRows[0].battingOrder, 9);
    untouchedByGame(team, useDH);
  }

  // DH の候補は打撃の能力の順、守備位置の候補は適性の順
  const bench = benchFielders(team.players, order);
  const second = candidatesForSlot(bench, 'second').map((p) => positionFitness(p, 'second'));
  assert.ok(second[0] >= 90 && second.every((v, i) => i === 0 || second[i - 1] >= v), `${label}: 二塁の候補が適性の順でない`);
  // DH の候補（`candidatesForSlot` の打撃＝ミート＋パワー＋選球眼の順）。DH 無しでも並べ方は同じ
  const hit = (p) => p.batting.meet + p.batting.power + p.batting.eye;
  const dhList = candidatesForSlot(bench, 'dh').map(hit);
  assert.equal(new Set(bench.map(hit)).size, bench.length, `${label}: 検査の前提（控えの打撃が全員違う）が崩れた`);
  assert.notDeepEqual(bench.map(hit), [...bench.map(hit)].sort((a, b) => b - a), `${label}: 検査の前提（控えの並びが打撃の順でない）が崩れた`);
  assert.deepEqual(dhList, [...bench.map(hit)].sort((a, b) => b - a), `${label}: DH の候補が打撃の順でない: ${dhList}`);
}

// 以前の画面で作った形: DH 無しで投手が3番に居る → 打順の順に詰め、投手は9番へ
{
  const team = makeTeam(false);
  const bo = team.lineupSettings.battingOrder;
  const p = bo.find((e) => e.position === 'pitcher');
  const third = bo.find((e) => e.battingOrder === 3);
  p.battingOrder = 3;
  third.battingOrder = 9;
  const order = orderFromTeam(team, false);
  assert.equal(order.length, 8);
  assert.ok(order.every((e) => e.playerId != null), '投手が9番以外に居る形で空きができた');
  assert.equal(order[7].playerId, third.playerId, '9番だった野手が8番に来ていない');
  writeOrder(team, order, false, team.pitchingRotation.starters[0]);
  untouchedByGame(team, false);
}

// DH 無しの形を DH 制で読む（年の途中でレギュレーションを替えた）: 空きの枠が DH で出る
{
  const team = makeTeam(false);
  const order = orderFromTeam(team, true);
  assert.equal(order.length, 9);
  assert.equal(order[8].playerId, null);
  assert.equal(order[8].position, 'dh');
  assert.ok(orderProblems(order, team.players).length > 0, '空きの枠を知らせていない');
}

// ============================================================
// 「自動: 標準／打撃重視／守備重視」が**疲労と調子を見ること**
//
// ⚠ いしだ 2026-11-22「スタメン設定の疲労による自動設定が効いていないように感じます」。
//    CPU の組むスタメン（`autoSimulation.js`）は疲労で入れ替えるのに、一人用の自動は
//    `fatigue` も `condition` も読んでいなかった（素の能力だけで組んでいた）。
// ⚠ **実力差を覆すほどにはしない**。控えより20高い主力は疲労65までスタメンに残る。
// ============================================================
{
  const mkFielder = (i, base, fatigue = 0, condition = 2) => ({
    id: 1000 + i,
    name: `自動${i}`,
    position: 'shortstop',
    isActive: true,
    fatigue,
    condition,
    batting: { meet: base, power: base, eye: base, steal: 30, bunt: 30, bats: 'right' },
    physical: { speed: base, arm: base, build: 'medium', bodyStamina: 50, recovery: 50 },
    fielding: { defense: base },
    positionFitness: Object.fromEntries(FIELD.map((pos) => [pos, 80])),
  });
  const makeAutoTeam = (starBase, benchBase, fatigue, condition = 2) => ({
    name: 'T',
    players: [
      mkFielder(0, starBase, fatigue, condition),
      ...Array.from({ length: 8 }, (_, i) => mkFielder(i + 1, 55)),
      ...Array.from({ length: 3 }, (_, i) => mkFielder(i + 9, benchBase)),
      { id: 2000, name: '投手', position: 'pitcher', isActive: true, fatigue: 0,
        pitching: { velocity: 140, control: 50, stamina: 110, arsenal: [] }, physical: { arm: 50 } },
    ],
    pitchingRotation: { starters: [2000], currentStarterIndex: 0 },
  });
  const starts = (starBase, benchBase, fatigue, condition = 2, policy = undefined) => {
    const team = makeAutoTeam(starBase, benchBase, fatigue, condition);
    if (policy !== undefined) team.restPolicy = policy;
    generateOptimalLineup('T', 'standard', team);
    const star = team.players.find((p) => p.id === 1000);
    return (star.battingOrder || 0) > 0 && star.battingOrder <= 9;
  };
  /** その設定で、控えに譲る疲労（5刻み。最後まで出続けたら 999） */
  const restsAt = (starBase, benchBase, policy) => {
    for (let f = 0; f <= 100; f += 5) if (!starts(starBase, benchBase, f, 2, policy)) return f;
    return 999;
  };
  assert.ok(starts(60, 50, 0), '疲労0の主力がスタメンに入らない（検査の作りが壊れている）');
  assert.ok(starts(60, 50, 20), '疲労20で外している（軽い疲れで主力を外さない）');
  assert.ok(!starts(60, 50, 60), '疲労60でも主力がスタメンに残る＝疲労を見ていない');
  // ⚠ 実力差は覆らない（控えより20高い主力は疲労45までは残る）
  assert.ok(starts(70, 50, 45), '実力差のある主力まで疲労で外している');
  // ⚠ 調子も見る（絶不調は同格の選手に譲る）
  assert.ok(starts(56, 55, 0, 2), '平常の主力がスタメンに入らない（検査の作りが壊れている）');
  assert.ok(!starts(56, 55, 0, 0), '絶不調でも同格の選手に譲らない＝調子を見ていない');

  // ⚠ **スタメン設定で選べる4段**（いしだ 2026-11-22「もっと敏感に、疲労を感じ取ってほしい。
  //    設定方法もスタメン設定でできるように」）。`team.restPolicy` に残る。
  //    控えより10高い主力が控えに譲る疲労: 見ない95 / 控えめ55 / 標準40 / 積極的25
  assert.deepEqual(Object.keys(REST_POLICIES), ['none', 'low', 'normal', 'high'], '休ませ方の段が変わっている');
  const steps = ['none', 'low', 'normal', 'high'].map((k) => restsAt(60, 50, k));
  assert.ok(
    steps[0] > steps[1] && steps[1] > steps[2] && steps[2] > steps[3],
    `休ませ方の段が順になっていない（見ない/控えめ/標準/積極的 = ${steps.join('/')}）`,
  );
  assert.ok(steps[2] <= 45, `標準でも疲労${steps[2]}まで出続ける（もっと敏感に、の指示）`);
  assert.ok(steps[3] <= 30, `積極的でも疲労${steps[3]}まで出続ける`);
  assert.ok(steps[1] >= 50, `控えめなのに疲労${steps[1]}で外している`);
  // ⚠ 「見ない」でも**打撃の目減りは残る**（疲れた選手の打撃が落ちるのは実際に起きること）。
  //    極端に疲れれば、ほぼ同格の控えには譲る
  assert.ok(restsAt(56, 55, 'none') <= 60, '「見ない」で打撃の目減りまで消えている');
  // 未設定・知らない名前は標準
  assert.equal(restsAt(60, 50, undefined), steps[2], '未設定のときに標準で動いていない');
  assert.equal(restsAt(60, 50, 'いいかげん'), steps[2], '知らない設定のときに標準で動いていない');
}

console.log('solo-lineup-board-check OK（疲労・調子を見る自動設定を含む）');
