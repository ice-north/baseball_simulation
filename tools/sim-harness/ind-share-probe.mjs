#!/usr/bin/env node
// ============================================================
// ドラフトの独立リーグ出身の比率（目標10%）
//
// 実ワールドを Y 年進め、`IKU_SOURCE_BONUS.independent`（育成指名の大穴加点）を
// 差し替えながら指名の出どころを巡目別に数える。
//
// ⚠ **合成ワールドの `draft-check` とは別の数字が出る**（実測で 実ワールド12% 対 合成8%）。
// ⚠ **巡目別に見ないと原因が分からない**。独立の指名は育成枠に集まるので、
//    全体の 12% は「R1 2-5% / R2+ 6-8% / 育成 27-34%」の加重平均でしかない。
// ⚠ **`CATEGORY_GROWTH.independent.gain` はレバーではない**。0.62→0.88 を掃引しても
//    12%→11% しか動かず（しかも向きが逆で誤差内）、巡目別の内訳もほぼ平ら。
//    `randomHuntTool` が**候補プールの中での相対的な尖り**で並べるので、独立の成長を
//    一律に下げても全員が同じだけ下がって尖りの順位が動かないため。
// ⚠ **run ごとの振れは ±1pt**（同設定4回で 12/11/12/12%）。1回の測定で 1pt の差を
//    読まないこと。かつて別のプローブの単発値（14%）を「目標より4pt多い」と
//    記録していたが、測り直すと 11.75% だった
//
// 使い方: node tools/sim-harness/ind-share-probe.mjs [年数=8] [bonus,bonus,...]
// ============================================================
import './lib/bootstrap.mjs';
const { bootstrapWorld, advanceYear } = await import('./lib/world.mjs');
const { IKU_SOURCE_BONUS } = await import(new URL('../../src/season/npbDraft.js', import.meta.url).href);

const Y = +process.argv[2] || 8;
const BONUSES = (process.argv[3] || String(IKU_SOURCE_BONUS.independent)).split(',').map(Number);
const o = console.log; console.log = () => {}; console.warn = () => {};
const src = (s) => s === 'university_team' ? 'university' : s;
const rows = [];
for (const bonus of BONUSES) {
  IKU_SOURCE_BONUS.independent = bonus;
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
  rows.push({ bonus, all, byRound, indAge, n: Object.values(all).reduce((a, b) => a + b, 0), pct });
}
console.log = o;
o(`実ワールド ${Y}年・ドラフトの出どころ（目標 高校30 / 大学40 / 社会人15 / 独立10%）`);
for (const r of rows) {
  const p = (k) => r.pct(r.all, k).toFixed(0);
  o(`\n■ IKU_SOURCE_BONUS.independent ${r.bonus}   n=${r.n}`);
  o(`  全体   高校 ${p('highschool')}% / 大学 ${p('university')}% / 社会人 ${p('corporate')}% / 独立 ${p('independent')}%`);
  for (const rd of ['R1', 'R2+', '育成']) if (r.byRound[rd])
    o(`  ${rd.padEnd(4)} 独立 ${r.pct(r.byRound[rd], 'independent').toFixed(0)}%  (n=${Object.values(r.byRound[rd]).reduce((a, b) => a + b, 0)})`);
  o(`  独立の年齢: ` + Object.entries(r.indAge).sort((a, b) => a[0] - b[0]).map(([a, v]) => `${a}:${v}`).join(' '));
}
