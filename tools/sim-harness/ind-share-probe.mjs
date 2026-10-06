#!/usr/bin/env node
// ============================================================
// ドラフトの独立リーグ出身の比率（目標10%）
//
// 実ワールドを Y 年進め、`CATEGORY_GROWTH.independent.gain` を差し替えながら
// 指名の出どころを巡目別に数える。⚠ **合成ワールドの `draft-check` とは別の数字が出る**
// （実測で 実ワールド14% 対 合成8%）。独立は育成指名に偏るので、
// **巡目別に見ないと原因が分からない**（実測: R1 5% / R2+ 9% / 育成 33%）。
//
// 使い方: node tools/sim-harness/ind-share-probe.mjs [年数=8] [gain,gain,...]
// ============================================================
import './lib/bootstrap.mjs';
const { bootstrapWorld, advanceYear } = await import('./lib/world.mjs');
const { CATEGORY_GROWTH } = await import(new URL('../../src/season/growthSystem.js', import.meta.url).href);

const Y = +process.argv[2] || 8;
const GAINS = (process.argv[3] || String(CATEGORY_GROWTH.independent.gain)).split(',').map(Number);
const o = console.log; console.log = () => {}; console.warn = () => {};
const src = (s) => s === 'university_team' ? 'university' : s;
const rows = [];
for (const gain of GAINS) {
  CATEGORY_GROWTH.independent.gain = gain;
  let { seasonData } = bootstrapWorld();
  const byRound = {}, all = {}, indAge = {};
  for (let y = 0; y < Y; y++) {
    const r = advanceYear(seasonData); seasonData = r.nextSeasonData;
    for (const d of r.draftedPlayers || []) {
      const k = src(d.source);
      const rd = d.draftRound === 'ドラフト1位' ? 'R1' : /育成/.test(d.draftRound) ? '育成' : 'R2+';
      (byRound[rd] ||= {})[k] = (byRound[rd][k] || 0) + 1;
      all[k] = (all[k] || 0) + 1;
      if (k === 'independent') indAge[d.age] = (indAge[d.age] || 0) + 1;
    }
  }
  const pct = (m, k) => { const t = Object.values(m).reduce((a, b) => a + b, 0); return t ? (m[k] || 0) / t * 100 : 0; };
  rows.push({ gain, all, byRound, indAge, n: Object.values(all).reduce((a, b) => a + b, 0), pct });
}
console.log = o;
o(`実ワールド ${Y}年・ドラフトの出どころ（独立の目標 10%）`);
for (const r of rows) {
  const p = (k) => r.pct(r.all, k).toFixed(0);
  o(`\n■ independent.gain ${r.gain}   n=${r.n}`);
  o(`  全体   高校 ${p('highschool')}% / 大学 ${p('university')}% / 社会人 ${p('corporate')}% / 独立 ${p('independent')}%`);
  for (const rd of ['R1', 'R2+', '育成']) if (r.byRound[rd])
    o(`  ${rd.padEnd(4)} 独立 ${r.pct(r.byRound[rd], 'independent').toFixed(0)}%  (n=${Object.values(r.byRound[rd]).reduce((a, b) => a + b, 0)})`);
  o(`  独立の年齢: ` + Object.entries(r.indAge).sort((a, b) => a[0] - b[0]).map(([a, v]) => `${a}:${v}`).join(' '));
}
