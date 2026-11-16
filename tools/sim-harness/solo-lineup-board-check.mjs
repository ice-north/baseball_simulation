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

console.log('solo-lineup-board-check OK');
