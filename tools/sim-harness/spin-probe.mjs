#!/usr/bin/env node
// ============================================================
// 回転数(spinRate)の効き方プローブ
//
// ① 球種別プローブ: 物理エンジン(calculatePhysicsContact)を直接叩いて、
//    回転0/50/100 で球種ごとの空振り率がどう動くかを測る。
//    「ストレートに大きく・変化球に少し」という設計意図の検証用。
// ② シーズンプローブ: 実物の試合エンジンでフルシーズンを回し、
//    全投手の回転数を揃えたときのリーグ K/9・防御率を測る。
//    能力の**総価値**が改修前後で動いていないかの確認用（重いので --season 指定時のみ）。
//
// 使い方:
//   node tools/sim-harness/spin-probe.mjs            # ①のみ（数秒）
//   node tools/sim-harness/spin-probe.mjs --season   # ①+②（1〜2分）
// ============================================================

import './lib/bootstrap.mjs';
import { SRC } from './lib/bootstrap.mjs';

const { calculatePhysicsContact } = await import(SRC + '/simulation-logic.js');
const { pitchVelocityDrop } = await import(SRC + '/utils/constants.js');

const SPINS = [0, 25, 50, 75, 100];
const TYPES = ['straight', 'slider', 'curve', 'fork', 'changeup', 'twoSeam'];
const N = 40000;

// 平均的な投手・打者
const BATTER = { meet: 55, power: 55, eye: 55, bats: 'right' };
const BASE_VELO = 143;
const LEVEL = 60;

function whiffRate(type, spinRate) {
  const pitcher = { velocity: BASE_VELO, throws: 'right', form: 'threeQuarter', spinRate };
  const velocity = BASE_VELO - pitchVelocityDrop(type, LEVEL);
  const pitch = { type, level: LEVEL, velocity };
  let whiff = 0;
  for (let i = 0; i < N; i++) {
    if (!calculatePhysicsContact(pitcher, BATTER, false, pitch, 0, {}).isContact) whiff++;
  }
  return whiff / N * 100;
}

console.log(`\n▶ 球種別の空振り率（投手${BASE_VELO}km・変化量${LEVEL}・打者ミート55、各${N}スイング）`);
const rows = [];
for (const type of TYPES) {
  const r = { 球種: type };
  for (const s of SPINS) r[`回転${s}`] = whiffRate(type, s).toFixed(1) + '%';
  const lo = whiffRate(type, 0), hi = whiffRate(type, 100);
  r['0→100'] = (hi - lo >= 0 ? '+' : '') + (hi - lo).toFixed(1) + 'pt';
  rows.push(r);
}
console.table(rows);

if (!process.argv.includes('--season')) {
  console.log('（シーズン測定は --season を付けて実行）\n');
  process.exit(0);
}

const { buildLeague, runSeason, TEAMS_DATA } = await import('./lib/league.mjs');
const { aggregateStats } = await import('./lib/stats.mjs');

const TEAMS = 8, GAMES = 100, SEEDS = 2;
console.log(`\n▶ シーズン測定: 全投手の回転数を揃えて ${TEAMS}チーム×${GAMES}試合×${SEEDS}シード`);
const srows = [];
for (const spin of SPINS) {
  const acc = { k9: 0, era: 0, avg: 0, bb9: 0 };
  for (let s = 0; s < SEEDS; s++) {
    const names = buildLeague(TEAMS, 28, 1);
    for (const n of names) {
      for (const p of TEAMS_DATA[n].players) {
        if (p.pitching) p.pitching.spinRate = spin;
      }
    }
    runSeason(names, GAMES);
    const st = aggregateStats(TEAMS_DATA, names);
    acc.k9 += st.k9; acc.era += st.era; acc.avg += st.avg; acc.bb9 += st.bb9;
  }
  srows.push({
    回転: spin,
    'K/9': (acc.k9 / SEEDS).toFixed(2),
    '防御率': (acc.era / SEEDS).toFixed(2),
    '被打率': (acc.avg / SEEDS).toFixed(3),
    'BB/9': (acc.bb9 / SEEDS).toFixed(2),
  });
}
console.table(srows);
console.log('');
