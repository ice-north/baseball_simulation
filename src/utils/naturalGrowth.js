import { expectedNaturalGrowth, naturalGrowthPlanOf } from '../season/growthSystem.js';

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
// ⚠ **所属球団を渡すこと**。社会人・独立・クラブで育成の性格（`CATEGORY_GROWTH`）も
//    球団の格（`teamRankMult`）も違う。以前は独立リーグ・ランクCで決め打ちしていて、
//    クラブの20歳・能力40が +1.11 と出て実際は +0.04 だった。
//    区分の決め方は年度替わりと同じ `naturalGrowthPlanOf`。
// ⚠ 年齢曲線で伸びない選手（大学の在学生＝`applyUniversityGrowth`、プロ、所属の無い選手）は
//    null を返し、画面は「—」を出す。
// ⚠ オンラインは `server/projection.mjs` が `naturalGrowth` として同じ関数で出す
//    （向こうは `online` の育成の性格）。文言は `src/online/playerInfo.js` と揃える。
// ============================================================

/** 選手の自然成長（能力1つあたり・年）。小数2桁。年齢曲線で伸びない選手は null */
export const naturalGrowthOf = (player, team) => {
  // ⚠ オンラインの選手はサーバーが出した値（`naturalGrowth`。`online` の区分）をそのまま使う。
  //    オンラインの編成画面（`OnlineLineup`）はこの一人用の画面を流用しており、手元の
  //    `team` には一人用の区分を決める手がかり（社会人・独立）が無い
  if (Number.isFinite(player?.naturalGrowth)) return player.naturalGrowth;
  const plan = naturalGrowthPlanOf(team);
  if (!plan || !player) return null;
  return expectedNaturalGrowth(player, plan.category, plan.rankMult, { team });
};

/** 数字の見た目（符号付き。横ばいは ±0.00。出せない選手は「—」） */
export const naturalGrowthText = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const v = Number(value);
  if (Math.abs(v) < 0.005) return '±0.00';
  return `${v > 0 ? '+' : '-'}${Math.abs(v).toFixed(2)}`;
};

/**
 * 色（数値表示用）。能力値の色（`getAbilityColor`）と同じ並びで、
 * **0 付近を灰・マイナスを青**にして衰えが一目で分かるようにする。
 */
export const naturalGrowthColor = (value) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'text-gray-500';
  const v = Number(value);
  // ⚠ 段は**実際に出る幅**に合わせる（年齢曲線の山が +1.2〜1.3、30代後半は -5 まで）
  if (v >= 1.10) return 'text-pink-400';
  if (v >= 0.80) return 'text-red-400';
  if (v >= 0.50) return 'text-orange-400';
  if (v >= 0.25) return 'text-yellow-400';
  if (v >= 0.10) return 'text-green-400';
  if (v >= -0.05) return 'text-gray-300';
  // 衰えは2段。年1点を超えて落ちる選手は**もう戦力として崩れていく**ので分ける
  if (v >= -1.00) return 'text-blue-400';
  return 'text-blue-500';
};

/** 吹き出しの説明（表の数字に付ける） */
export const naturalGrowthTitle = (player, team) => {
  const v = naturalGrowthOf(player, team);
  if (v === null) return '年度替わりの年齢による伸び（自然成長）の対象外（大学の在学生・プロ・所属なし）';
  const gp = player?.growthPotential ?? 1.0;
  const gm = player?.growthModifier || 0;
  return `来季の年度替わりで主要な能力が1つあたり平均${naturalGrowthText(v)}点\n`
    + `素質${gp.toFixed(2)}・出場による変動${gm >= 0 ? '+' : ''}${gm.toFixed(2)}・年齢${player?.age ?? '?'}歳から`;
};
