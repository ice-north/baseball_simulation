#!/usr/bin/env node
// ============================================================
// NPBドラフト比率検証
//
// 実物の processNPBDraft を、各ソース(高校/大学/社会人/クラブ/独立)の実物
// ジェネレーターで用意した合成ワールドに対して回し、指名の内訳を検証する。
//
// 主目的は「クラブチームの過剰指名」の回帰検出。クラブの初期能力スケールが
// 正しければ新規クラブ選手はほぼ指名されない（設計目標: クラブ輩出は年約2名）。
// クラブの初期能力を引き上げるような回帰が入るとクラブシェアが跳ね、ここで検出できる。
//
// 使い方:
//   node tools/sim-harness/draft-check.mjs [シード数]
//
// 終了コード: 全PASSで0、FAILで1。
//
// 【growYears】社会人・独立・クラブは4年ぶん `applyCorporatePlayerGrowth` を
// 回してから指名する。これが無いと生成直後のロスターを指名することになり、
// カテゴリ別の成長を変えても構成比が動かない（＝較正できない）。
// ============================================================

import './lib/bootstrap.mjs';
import { Report } from './lib/report.mjs';
import { runDraft } from './lib/draftworld.mjs';

const SEEDS = Number(process.argv[2]) || 3;
console.log(`\n▶ NPBドラフト比率検証: ${SEEDS}シード`);

const sum = { total: 0, club: 0, eligibleUniversity: 0,
              highschool: 0, university: 0, corporate: 0, independent: 0 };
for (let s = 0; s < SEEDS; s++) {
  // ⚠ **growYears を必ず指定すること**。0 だと社会人・独立・クラブが
  //    「生成した直後のロスター」のまま指名され、`applyCorporatePlayerGrowth` を
  //    一度も通らない。カテゴリ別の成長を変えても構成比が1%も動かず、
  //    実ゲームと食い違う（実際にこれで空振りした）。
  const r = runDraft(6, { growYears: 4 });
  sum.total += r.total;
  sum.club += r.club;
  sum.eligibleUniversity += r.eligibleUniversity;
  for (const k of Object.keys(r.bySource)) sum[k] += r.bySource[k];
}
const avg = (x) => x / SEEDS;
const total = avg(sum.total);
const pct = (x) => total > 0 ? (avg(x) / total * 100) : 0;

const r = new Report(`■ 指名内訳（${SEEDS}シード平均・${total.toFixed(0)}名指名）`);
// --- 合否判定（回帰トリップワイヤ）---
r.band('総指名数',        total, 60, 160, v => v.toFixed(0) + '名');
r.band('クラブ指名シェア', pct(sum.club), 0, 8, v => v.toFixed(1) + '%');
r.assert('大学生が指名対象に収集されている', avg(sum.eligibleUniversity) > 50,
  `適格大学生 ${avg(sum.eligibleUniversity).toFixed(0)}名`);
r.band('高校シェア(暴走検出)', pct(sum.highschool), 0, 85, v => v.toFixed(0) + '%');
r.assert('全ソースが指名に出現', avg(sum.highschool) > 0 && avg(sum.university) > 0 &&
  avg(sum.corporate) > 0 && avg(sum.independent) > 0, '');

// --- 参考: フル内訳 vs CLAUDE.md目標(高30/大35/社20/独14) ---
r.info('高校',   `${avg(sum.highschool).toFixed(0)}名 (${pct(sum.highschool).toFixed(0)}%)  目標30%`);
r.info('大学',   `${avg(sum.university).toFixed(0)}名 (${pct(sum.university).toFixed(0)}%)  目標40%`);
r.info('社会人', `${avg(sum.corporate).toFixed(0)}名 (${pct(sum.corporate).toFixed(0)}%)  目標15%`);
r.info('独立',   `${avg(sum.independent).toFixed(0)}名 (${pct(sum.independent).toFixed(0)}%)  目標10%`);
r.info('クラブ', `${avg(sum.club).toFixed(1)}名 (設計目標: 年約2名)`);
r.print();

console.log('  注) 高校シェアは合成ワールドの大学成長忠実度に依存するため、');
console.log('      高/大の比率そのものは合否ではなく参考値。クラブシェアと構造健全性が合否対象。\n');

process.exit(r.passed ? 0 : 1);
