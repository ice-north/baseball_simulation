#!/usr/bin/env node
// ============================================================
// 遅い投手のナックル（`VELOCITY_DROP_MODE` の準備用）
//
// 全投手を「球速V・ナックルLv100だけ（ストレート封印）」にしたリーグを、
// **同じロスター・同じ日程**で off / on の2回走らせて防御率を比べる。
// 使い方: node tools/sim-harness/knuckle-probe.mjs [シード=3] [試合数=60]
// ============================================================
import './lib/bootstrap.mjs';
import { SRC } from './lib/bootstrap.mjs';
import { buildLeague, runSeason, TEAMS_DATA } from './lib/league.mjs';
import { aggregateStats } from './lib/stats.mjs';

const { VELOCITY_DROP_MODE, pitchVelocityDrop } = await import(SRC + '/utils/constants.js');
const SEEDS = +process.argv[2] || 3, G = +process.argv[3] || 60;
const o = console.log; console.log = () => {}; console.warn = () => {};

// knuckle=true: ナックルLv100だけ（ストレート封印） / false: ストレートだけ（比較の基準）
const setPitchers = (names, v, knuckle = true) => {
  for (const n of names) for (const p of TEAMS_DATA[n].players) {
    if (p.position !== 'pitcher') continue;
    p.pitching.velocity = v;
    p.pitching.arsenal = knuckle
      ? [{ id: 1, type: 'straight', level: 50, sealed: true }, { id: 2, type: 'knuckle', level: 100 }]
      : [{ id: 1, type: 'straight', level: 50 }];
  }
};
const reset = (names) => { for (const n of names) for (const p of TEAMS_DATA[n].players) { p.seasonStats = { batting: {}, pitching: {} }; p.fatigue = 0; } };

// ⚠ **速さごとに別のリーグを作らないこと**。ロスターの引きが速さの差より大きく、
//    防御率の絶対値が比べられなくなる（実際に 4.93 / 3.90 / 4.56 / 3.72 と非単調に出た）。
//    シードごとにリーグを1つ作り、全ての速さ・全ての設定を同じロスターで回す
const SPEEDS = [100, 115, 130, 145];
const acc = {};   // acc[v][mode] = [era...]
for (let s = 0; s < SEEDS; s++) {
  const names = buildLeague(6, 28, 1);
  const saved = structuredClone(Object.fromEntries(names.map(n => [n, TEAMS_DATA[n].players])));
  for (const v of SPEEDS) for (const mode of ['base', 'off', 'on']) {
    for (const n of names) TEAMS_DATA[n].players = structuredClone(saved[n]);
    setPitchers(names, v, mode !== 'base');
    reset(names);
    VELOCITY_DROP_MODE.scaleWithFastball = mode === 'on';
    runSeason(names, G);
    ((acc[v] ||= {})[mode] ||= []).push(aggregateStats(TEAMS_DATA, names).era);
  }
}
VELOCITY_DROP_MODE.scaleWithFastball = false;
const m = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const rows = SPEEDS.map(v => {
  const a = acc[v];
  const off = pitchVelocityDrop('knuckle', 100, v);
  VELOCITY_DROP_MODE.scaleWithFastball = true;
  const on = pitchVelocityDrop('knuckle', 100, v);
  VELOCITY_DROP_MODE.scaleWithFastball = false;
  return `  ${String(v).padStart(3)}km   到達 off ${Math.round(v - off)} / on ${Math.round(v - on)}km   防御率 ストレートだけ ${m(a.base).toFixed(2)} → ナックル off ${m(a.off).toFixed(2)}（${(m(a.off) - m(a.base)).toFixed(2)}）/ on ${m(a.on).toFixed(2)}（${(m(a.on) - m(a.base)).toFixed(2)}）`;
});
console.log = o;
o(`ナックルLv100だけの投手（ストレート封印）・6チーム×${G}試合×${SEEDS}シード・同一ロスター`);
rows.forEach(r => o(r));
