import { expectedNaturalGrowth } from '../season/growthSystem.js';

// ============================================================
// 一人用の画面に出す「自然成長」。
//
// ⚠ いしだ 2026-11-20「表示を自然成長の平均と合わせたい」。
//    以前は `growthPotential + growthModifier`（0.30〜1.80 の素の係数）をそのまま
//    「成長」として出していたが、これは**年齢がまったく入らない**数字で、
//    30代の選手でも 1.0 以上と出る一方、実際の年度替わりでは衰えていた。
//    出すのは**来季の年度替わりで主要な能力が1つあたり何点動くか**（`expectedNaturalGrowth`）。
//    1.00 なら「主要な能力が平均+1」・0.00 なら横ばい・マイナスは衰え。
//
// ⚠ 中身は本番と同じ計算（`makeGrower` の `peek`）なので、**選手を書き換えない**。
// ⚠ 一人用の自軍は独立リーグ（`CATEGORY_GROWTH.independent`・ランクC相当の 0.90）。
//    ほかのカテゴリの選手を同じ列に並べても目安として読めるよう、既定はこれで通す。
// ⚠ オンラインは `server/projection.mjs` が `naturalGrowth` として同じ関数で出す
//    （向こうは `online` の育成の性格）。文言は `src/online/playerInfo.js` と揃える。
// ============================================================

/** 選手の自然成長（能力1つあたり・年）。小数2桁 */
export const naturalGrowthOf = (player) => expectedNaturalGrowth(player, 'independent');

/** 数字の見た目（符号付き。横ばいは ±0.00） */
export const naturalGrowthText = (value) => {
  const v = Number(value) || 0;
  if (Math.abs(v) < 0.005) return '±0.00';
  return `${v > 0 ? '+' : '-'}${Math.abs(v).toFixed(2)}`;
};

/**
 * 色（数値表示用）。能力値の色（`getAbilityColor`）と同じ並びで、
 * **0 付近を灰・マイナスを青**にして衰えが一目で分かるようにする。
 */
export const naturalGrowthColor = (value) => {
  const v = Number(value) || 0;
  if (v >= 1.20) return 'text-pink-400';
  if (v >= 0.80) return 'text-red-400';
  if (v >= 0.50) return 'text-orange-400';
  if (v >= 0.30) return 'text-yellow-400';
  if (v >= 0.10) return 'text-green-400';
  if (v >= -0.05) return 'text-gray-300';
  return 'text-blue-400';
};

/** 吹き出しの説明（表の数字に付ける） */
export const naturalGrowthTitle = (player) => {
  const v = naturalGrowthOf(player);
  const gp = player?.growthPotential ?? 1.0;
  const gm = player?.growthModifier || 0;
  return `来季の年度替わりで主要な能力が1つあたり平均${naturalGrowthText(v)}点\n`
    + `素質${gp.toFixed(2)}・出場による変動${gm >= 0 ? '+' : ''}${gm.toFixed(2)}・年齢${player?.age ?? '?'}歳から`;
};
