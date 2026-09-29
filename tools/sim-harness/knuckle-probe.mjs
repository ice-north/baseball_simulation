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

const setPitchers = (names, v) => {
  for (const n of names) for (const p of TEAMS_DATA[n].players) {
    if (p.position !== 'pitcher') continue;
    p.pitching.velocity = v;
    p.pitching.arsenal = [
      { id: 1, type: 'straight', level: 50, sealed: true },
      { id: 2, type: 'knuckle', level: 100 },
    ];
  }
};
const reset = (names) => { for (const n of names) for (const p of TEAMS_DATA[n].players) { p.seasonStats = { batting: {}, pitching: {} }; p.fatigue = 0; } };

const rows = [];
for (const v of [100, 115, 130, 145]) {
  const acc = { off: [], on: [] };
  for (let s = 0; s < SEEDS; s++) {
    const names = buildLeague(6, 28, 1);
    setPitchers(names, v);
    const saved = structuredClone(Object.fromEntries(names.map(n => [n, TEAMS_DATA[n].players])));
    for (const mode of ['off', 'on']) {
      for (const n of names) TEAMS_DATA[n].players = structuredClone(saved[n]);
      reset(names);
      VELOCITY_DROP_MODE.scaleWithFastball = mode === 'on';
      runSeason(names, G);
      acc[mode].push(aggregateStats(TEAMS_DATA, names).era);
    }
  }
  VELOCITY_DROP_MODE.scaleWithFastball = false;
  const off = pitchVelocityDrop('knuckle', 100, v);
  VELOCITY_DROP_MODE.scaleWithFastball = true;
  const on = pitchVelocityDrop('knuckle', 100, v);
  VELOCITY_DROP_MODE.scaleWithFastball = false;
  const m = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  rows.push(`  ${String(v).padStart(3)}km   到達 off ${Math.round(v - off)}km / on ${Math.round(v - on)}km   防御率 off ${m(acc.off).toFixed(2)} / on ${m(acc.on).toFixed(2)}`);
}
console.log = o;
o(`ナックルLv100だけの投手（ストレート封印）・6チーム×${G}試合×${SEEDS}シード・同一ロスター`);
rows.forEach(r => o(r));
