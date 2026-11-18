// 社会人（企業・クラブ）と独立リーグの最初の名簿に、投手が足りているか。
// ⚠ 以前は残りの枠を能力だけで選んでいて、D ランクのクラブ（13〜17人）の約3%が投手1人で
//    始まっていた。その1人が抜けると投手0人になり、大学モードの2年目に試合が
//    「投手が取得できません」で壊れた（generateCorporateRoster で最低人数を先に取る）。
//   node tools/sim-harness/corporate-roster-check.mjs
import './lib/bootstrap.mjs';
import { SRC } from './lib/bootstrap.mjs';
import assert from 'node:assert/strict';

const { generateCorporateRoster } = await import(SRC + '/corporate/corporateInit.js');
const quiet = (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
};

const cases = [
  { def: { id: 39, name: '検証クラブD', type: 'club', rank: 'D' }, runs: 300 },
  { def: { id: 30, name: '検証クラブC', type: 'club', rank: 'C' }, runs: 60 },
  { def: { id: 3, name: '検証クラブB', type: 'club', rank: 'B' }, runs: 30 },
  { def: { id: 1, name: '検証企業D', type: 'corporate', rank: 'D' }, runs: 60 },
  { def: { id: 2, name: '検証企業S', type: 'corporate', rank: 'S' }, runs: 20 },
  { def: { id: 'il_test', name: '検証独立D', rank: 'D' }, runs: 60 },
];
const lines = [];
for (const { def, runs } of cases) {
  const counts = {};
  for (let i = 0; i < runs; i++) {
    const roster = quiet(() => generateCorporateRoster(def, 1));
    const pitchers = roster.filter((p) => p.position === 'pitcher').length;
    counts[pitchers] = (counts[pitchers] || 0) + 1;
    assert.ok(pitchers >= 4, `${def.name}（${roster.length}人）の投手が ${pitchers} 人で始まった（4人以上のはず）`);
    assert.ok(roster.some((p) => p.position === 'catcher'), `${def.name} に捕手がいない`);
  }
  lines.push(`${def.name} ${JSON.stringify(counts)}`);
}
console.log(`corporate-roster-check PASS（最初の名簿の投手は4人以上: ${lines.join(' / ')}）`);
