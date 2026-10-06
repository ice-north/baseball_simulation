#!/usr/bin/env node
// ============================================================
// 遅い投手のナックル（`pitchBreakEfficiency` / `KNUCKLE_TIMING`）
//
// 全投手を「球速V・ナックルLv100だけ（ストレート封印）」にしたリーグと
// 「ストレートだけ」のリーグを、**同じロスター・同じ日程**で回して防御率を比べる。
// 見るもの: ナックル投手の防御率が直球の速さにどれだけ左右されるか（100km と 145km の差）と、
//           ナックルへの転向で得をするのが遅い投手ほど大きいか
// 使い方: node tools/sim-harness/knuckle-probe.mjs [シード=3] [試合数=60]
//         KNUCKLE_INDEP=0.5 のように渡すと `KNUCKLE_TIMING.indep` を差し替えて測れる
// ⚠ **速さごとに別のリーグを作らないこと**。ロスターの引きが速さの差より大きく、
//    防御率の絶対値が比べられなくなる（実際に 4.93 / 3.90 / 4.56 / 3.72 と非単調に出た）
// ⚠ 3シード×60試合では同じ設定でも基準が 4.06 と 5.00 に振れた。結論は 8シード×80試合で出す
// ============================================================
import './lib/bootstrap.mjs';
import { SRC } from './lib/bootstrap.mjs';
import { buildLeague, runSeason, TEAMS_DATA } from './lib/league.mjs';
import { aggregateStats } from './lib/stats.mjs';

const { KNUCKLE_TIMING } = await import(SRC + '/utils/constants.js');
if (process.env.KNUCKLE_INDEP != null) KNUCKLE_TIMING.indep = Number(process.env.KNUCKLE_INDEP);
const SEEDS = +process.argv[2] || 3, G = +process.argv[3] || 60;
const o = console.log; console.log = () => {}; console.warn = () => {};

// knuckle=true: ナックルLv100だけ（ストレート封印） / false: ストレートだけ（比較の基準）
const setPitchers = (names, v, knuckle) => {
  for (const n of names) for (const p of TEAMS_DATA[n].players) {
    if (p.position !== 'pitcher') continue;
    p.pitching.velocity = v;
    p.pitching.arsenal = knuckle
      ? [{ id: 1, type: 'straight', level: 50, sealed: true }, { id: 2, type: 'knuckle', level: 100 }]
      : [{ id: 1, type: 'straight', level: 50 }];
  }
};
const reset = (names) => { for (const n of names) for (const p of TEAMS_DATA[n].players) { p.seasonStats = { batting: {}, pitching: {} }; p.fatigue = 0; } };

const SPEEDS = [100, 115, 130, 145];
const acc = {};   // acc[v].base / acc[v].knuckle = [era...]
for (let s = 0; s < SEEDS; s++) {
  const names = buildLeague(6, 28, 1);
  const saved = structuredClone(Object.fromEntries(names.map(n => [n, TEAMS_DATA[n].players])));
  for (const v of SPEEDS) for (const mode of ['base', 'knuckle']) {
    for (const n of names) TEAMS_DATA[n].players = structuredClone(saved[n]);
    setPitchers(names, v, mode === 'knuckle');
    reset(names);
    runSeason(names, G);
    ((acc[v] ||= {})[mode] ||= []).push(aggregateStats(TEAMS_DATA, names).era);
  }
}
const m = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log = o;
o(`ナックルLv100だけの投手（ストレート封印）・6チーム×${G}試合×${SEEDS}シード・同一ロスター・indep ${KNUCKLE_TIMING.indep}`);
for (const v of SPEEDS) {
  const a = acc[v];
  o(`  ${String(v).padStart(3)}km   防御率 ストレートだけ ${m(a.base).toFixed(2)} → ナックル ${m(a.knuckle).toFixed(2)}（${(m(a.knuckle) - m(a.base)).toFixed(2)}）`);
}
const gap = (k) => m(acc[100][k]) - m(acc[145][k]);
o(`  100km と 145km の差: ストレートだけ ${gap('base').toFixed(2)} / ナックル ${gap('knuckle').toFixed(2)}`);
