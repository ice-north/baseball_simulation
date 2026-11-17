// 契約更改の表（`src/online/contractTable.js`）の並べ替え。
//   node tools/sim-harness/online-contract-table-check.mjs
//
// ⚠ 見るもの:
//    1. 列を選ばないときは守備位置の区分の順（投・捕・内・外）、同じ区分は名簿の順
//    2. 値の無い選手（野手の球速・投手の打撃）は、上向きでも下向きでも末尾
//    3. 同じ値は名簿の順（並べ替えるたびに入れ替わらない）
//    4. 小さいほど良い列（防御率）は既定の向きが小さい順。年齢（値の無い選手が居る列）も向きのとおり
import assert from 'node:assert/strict';
import { contractColumns, sortContractRoster } from '../../src/online/contractTable.js';

const column = (id) => {
  const c = contractColumns().find((x) => x.id === id);
  assert.ok(c, `列 ${id} が無い`);
  return c;
};
const fielder = (id, position, meet) => ({
  id,
  name: `野手${id}`,
  position,
  batting: { meet, power: 50, eye: 50 },
  physical: {},
  fielding: {},
});
const pitcher = (id, velocity, age) => ({
  id,
  name: `投手${id}`,
  position: 'pitcher',
  age,
  pitching: { velocity, control: 50, stamina: 50 },
  physical: {},
});
const roster = [
  fielder(1, 'left', 60),
  pitcher(2, 150, 30),
  fielder(3, 'catcher', 40),
  fielder(4, 'short', 60),
  pitcher(5, 140, 22),
  fielder(6, 'first', 80),
];
const ids = (list) => list.map((p) => p.id);

// 1. 列なし: 投・捕・内・外、同じ区分は名簿の順
assert.deepEqual(ids(sortContractRoster(roster, null)), [2, 5, 3, 4, 6, 1], '既定の並びが守備位置の区分の順でない');

// 2・3. ミート: 下向きは高い順・同じ値（1と4）は名簿の順・投手（値なし）は末尾
const meet = column('meet');
assert.deepEqual(ids(sortContractRoster(roster, meet, 'desc')), [6, 1, 4, 3, 2, 5], 'ミートの下向きが違う');
// 上向きでも、値の無い投手は末尾のまま（同じ値は名簿の順のまま）
assert.deepEqual(ids(sortContractRoster(roster, meet, 'asc')), [3, 1, 4, 6, 2, 5], 'ミートの上向きが違う（値の無い選手が先頭に来た？）');

// 2. 球速: 野手は値なしで末尾
const velocity = column('velocity');
assert.deepEqual(ids(sortContractRoster(roster, velocity, 'desc')).slice(0, 2), [2, 5], '球速の下向きが違う');
assert.deepEqual(ids(sortContractRoster(roster, velocity, 'asc')).slice(0, 2), [5, 2], '球速の上向きが違う');

// 4. 防御率は小さいほど良い（列の既定の向きは asc）。年齢は値のある2人だけが先に、向きのとおり
assert.equal(column('stat:era').dir, 'asc', '防御率の列の既定の向きが小さい順でない');
const age = column('age');
assert.deepEqual(ids(sortContractRoster(roster, age, 'asc')), [5, 2, 1, 3, 4, 6], '年齢の上向きが違う');
assert.deepEqual(ids(sortContractRoster(roster, age, 'desc')), [2, 5, 1, 3, 4, 6], '年齢の下向きが違う');

// 元の名簿は書き換えない
assert.deepEqual(ids(roster), [1, 2, 3, 4, 5, 6], '並べ替えで元の名簿を書き換えた');

console.log('online-contract-table-check PASS（既定の並び・値の無い選手は末尾・同じ値は名簿の順・年齢・防御率の向き）');
