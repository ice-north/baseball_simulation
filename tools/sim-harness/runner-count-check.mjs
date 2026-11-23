#!/usr/bin/env node
// ============================================================
// 安打の打席で走者が消えないか・三塁打の打者が三塁に残るか（自動試合）
//
// 安打（本塁打を除く）の打席ごとに
//   打席の前の走者 ＋ 打者 ＝ 打席の後の走者 ＋ 生還 ＋ アウト
// が成り立つかを数える。以前は次の2つで崩れていた:
//   ① 三塁打の打者が三塁に残らず、必ず生還していた（advanceRunners の `advancement < 3`）
//   ② 積極進塁に「先の走者が止まった塁へは進まない」門番が無く、一・二塁の単打で
//      二塁走者が三塁に止まり一塁走者も三塁を狙うと、先の走者が黙って消えていた（打席の約0.2%）
//
// 使い方: node tools/sim-harness/runner-count-check.mjs [試合数]
// ============================================================
import './lib/bootstrap.mjs';
import { Report } from './lib/report.mjs';
import { buildLeague } from './lib/league.mjs';
import { autoSimulateGame } from '../../src/game/autoSimulation.js';

const GAMES = Number(process.argv[2]) || 400;
const count = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);

const names = buildLeague(8, 28, 1);
let pa = 0, hitPA = 0, lost = 0, triples = 0, tripleOnThird = 0;
const samples = [];
for (let g = 0; g < GAMES; g++) {
  const home = names[g % names.length];
  const away = names[(g + 1 + (g >> 3) % (names.length - 1)) % names.length];
  let halfKey = null, prevEnd = 0;
  autoSimulateGame(home, away, false, 5000 + g, {
    plateAppearance(p) {
      // 打席の前の塁＝同じ回の表裏の直前の打席の後の塁（回が替われば空）
      const key = `${p.inning}-${p.offense}`;
      const start = key === halfKey ? prevEnd : 0;
      halfKey = key; prevEnd = p.endBases;
      if (!p.completed) return;
      pa++;
      if (p.delta.hits !== 1 || p.delta.homeruns) return;
      hitPA++;
      // 打球の前に盗塁死・牽制死で減ったアウトも数える
      const outsBefore = (p.resultStartOuts ?? p.pitcherOuts) - p.pitcherOuts;
      const outs = p.outs + outsBefore;
      if (outs < 3 && count(p.endBases) + p.runs + outs < count(start) + 1) {
        lost++;
        if (samples.length < 5) samples.push(`前=${start} 後=${p.endBases} 生還=${p.runs} アウト=${outs}`);
      }
      if (p.delta.triples) { triples++; if (p.endBases & 4) tripleOnThird++; }
    },
  });
}

const r = new Report(`■ 安打の打席の走者の数（${GAMES}試合）`);
r.info('打席', pa);
r.info('安打の打席（本塁打を除く）', hitPA);
r.assert('走者が消えた打席', lost === 0, lost ? `${lost}件 例: ${samples.join(' / ')}` : '0件');
r.assert('三塁打の打者が三塁に残る', triples > 0 && tripleOnThird === triples, `${tripleOnThird}/${triples}`);
r.print();
process.exit(r.passed ? 0 : 1);
