#!/usr/bin/env node
// ============================================================
// 塁の状態の共通関数（`src/game/baseState.js`）の検査
//
// 采配モードは塁に `true`、自動シミュは走者オブジェクトを置いている。
// 移行の途中で両方が混ざっても壊れないことを確かめる:
//   ① 走者オブジェクトを置けば、どの操作の後も**同じオブジェクト**が動く（作り直さない）
//   ② `true` と混ざっても人数が保たれる（誰も消えない・増えない）
//   ③ 行き先が埋まっていれば上書きしない（盗塁の悪送球で三塁走者が消えた事故の再発防止）
// 終了コード: 全PASSで0、FAILで1。
// ============================================================
import './lib/bootstrap.mjs';
import { SRC } from './lib/bootstrap.mjs';
import { Report } from './lib/report.mjs';

const B = await import(SRC + '/game/baseState.js');
const r = new Report('■ 塁の状態の共通関数（baseState.js）');
const A = { id: 1, name: 'A' }, Bn = { id: 2, name: 'B' }, C = { id: 3, name: 'C' }, bat = { id: 9, name: '打者' };

// ① 押し出し: 満塁で四球 → 三塁のCが生還、A/Bは1つずつ進み打者が一塁
{
  const { bases, scored } = B.forceAdvance([A, Bn, C], bat);
  r.assert('押し出しで同じ走者が進む', bases[0] === bat && bases[1] === A && bases[2] === Bn && scored[0] === C, '');
}
// 一塁と三塁で四球 → 三塁は詰まっていないので動かない
{
  const { bases, scored } = B.forceAdvance([A, false, C], bat);
  r.assert('詰まっていない走者は動かない', bases[2] === C && bases[1] === A && scored.length === 0, '');
}
// ② 安打: 二塁打で一塁のAは三塁、二塁のBは生還
{
  const { bases, scored } = B.advanceAll([A, Bn, false], 2, bat);
  r.assert('二塁打の基本進塁で同じ走者が動く', bases[1] === bat && bases[2] === A && scored.length === 1 && scored[0] === Bn, '');
}
// 本塁打で全員と打者が生還し塁が空く
{
  const { bases, scored } = B.advanceAll([A, true, C], 4, bat);
  r.assert('本塁打で全員生還（true 混在でも数が合う）', B.countRunners(bases) === 0 && scored.length === 4, `scored ${scored.length}`);
}
// ③ 行き先が埋まっていれば動かない
{
  const { bases, moved } = B.moveRunner([false, Bn, C], 1, 2);
  r.assert('埋まっている塁へは上書きしない', !moved && bases[1] === Bn && bases[2] === C, '');
}
// 盗塁（二塁へ）と生還
{
  const s1 = B.moveRunner([A, false, false], 0, 1);
  const s2 = B.moveRunner(s1.bases, 1, 3);
  r.assert('盗塁・生還で同じ走者が動く', s1.bases[1] === A && s2.scored[0] === A && B.countRunners(s2.bases) === 0, '');
}
// true（旧形式）でも人数は保たれ、runnerOf は null を返す
{
  const { bases } = B.forceAdvance([true, true, false], true);
  r.assert('true だけでも人数が保たれる', B.countRunners(bases) === 3 && B.runnerOf(bases[0]) === null, '');
  r.assert('asFlags は boolean の配列', JSON.stringify(B.asFlags([A, false, true])) === '[true,false,true]', '');
}
// 失策で出塁した印は、塁を移っても走者に追随する（自責点の判定）
{
  const E = { id: 7, name: '失策で出塁', onError: true };
  r.assert('失策出塁の走者を見分けられる', B.isUnearnedRunner(E) && !B.isUnearnedRunner(A) && !B.isUnearnedRunner(true), '');
  const s1 = B.forceAdvance([E, false, false], bat);          // 四球で E が二塁へ
  const s2 = B.moveRunner(s1.bases, 1, 2);                    // 暴投で三塁へ
  r.assert('押し出し・暴投で印が追随する', B.isUnearnedRunner(s2.bases[2]) && B.unearnedAt(s2.bases, 2) === 1, '');
  const s3 = B.advanceAll(s2.bases, 2, bat);                  // 二塁打で生還
  r.assert('生還した走者の印を数えられる', s3.scored.filter(B.isUnearnedRunner).length === 1 && B.unearnedAt(s3.bases, 2) === 0, '');
  r.assert('印の無い走者は自責のまま', B.unearnedAt([A, Bn, C], 2) === 0, '');
}
// 入力を書き換えない（React の state をそのまま渡しても安全）
{
  const src = [A, Bn, false];
  B.advanceAll(src, 1, bat); B.moveRunner(src, 0, 2); B.removeRunner(src, 1);
  r.assert('入力の配列を書き換えない', src[0] === A && src[1] === Bn && src[2] === false, '');
}
r.print();
process.exit(r.passed ? 0 : 1);
