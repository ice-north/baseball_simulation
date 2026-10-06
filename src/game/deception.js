// ============================================================
// 球の出どころ（deception） - deception.js
//
// 成瀬善久のように、**球速も決め球も無いのに打たれない**投手がいる。
// 球持ちが長く、体の陰から腕が出てくるのでリリースが見えないタイプ。
// 本作には「球速」「変化球」「制球」しか無く、この軸が存在しなかった。
//
// 【球速を上げるのと同じではない】ここが設計の要。
//   ・打者の反応時間を削る（タイミング窓）        … 球速と同じ効果
//   ・**球種とコースを見分けにくくする**            … 球速には無い効果
//     （グリップもリリースポイントも見えないので、何が来るか判断できない）
// 後者があるので「遅いのに読めない」＝ 球速に頼らない投手が成立する。
//
// 逆に「出どころが分かりやすい」投手は、同じ球速・同じ持ち球でも打たれる。
//
// 【なぜセーブに持たないか】
// 生成箇所は高校生プール・大学プール・トライアウト・社会人初期化…と散在しており、
// 左右の比率(handedness.js)で「生成元ごとに値がバラつく」事故を既に一度起こしている。
// 出どころの見づらさは生涯変わらない先天的な特性なので、**選手の名前とIDから
// 決定的に導出**する。生成側を1行も触らずに全投手が持て、既存セーブもそのまま動く
// （`batterZone.js` のコース適性とまったく同じ方針）。
//
// `player.pitching.deception` を明示的に置けばそちらが優先される
// （将来のキャンプでの育成・検証用の差し替え）。
// ============================================================

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** FNV-1a + avalanche。同じ文字列からは常に同じ値 */
function hash32(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

const unit = (h) => h / 4294967296;

/** 一様乱数3つの平均で釣鐘型にする（Irwin-Hall）。範囲 -1〜+1、σ≈0.33 */
function bell(key, seed) {
  const a = unit(hash32(key, seed));
  const b = unit(hash32(key, seed ^ 0x9e3779b9));
  const c = unit(hash32(key, seed ^ 0x85ebca6b));
  return (a + b + c - 1.5) / 1.5;
}

export const DECEPTION_MID = 50;
const DECEPTION_SD = 45;   // bell(σ0.33) × 45 ≒ σ15。実測レンジは概ね 18〜82

const cache = new WeakMap();

/**
 * 投手の「球の出どころの見づらさ」。0=丸見え 〜 100=まったく見えない。
 * 野手に問うと 50（中立）を返す。
 */
export function getDeception(player) {
  if (!player) return DECEPTION_MID;
  const explicit = player.pitching?.deception;
  if (typeof explicit === 'number') return clamp(explicit, 0, 100);
  if (!player.pitching) return DECEPTION_MID;
  const hit = cache.get(player);
  if (hit !== undefined) return hit;
  // IDはチーム内でしか一意でない（players.js は 1〜9）ので名前と混ぜる
  const key = `${player.name || ''}#${player.id ?? 0}`;
  const v = Math.round(clamp(DECEPTION_MID + bell(key, 0x1b873593) * DECEPTION_SD, 5, 95));
  cache.set(player, v);
  return v;
}

/** -1（丸見え）〜 +1（見えない）に正規化。物理側はこの形で受け取る */
export const deceptionAxis = (deception = DECEPTION_MID) =>
  clamp((deception - DECEPTION_MID) / 50, -1, 1);

// 表示用。実測の分布（σ15）に対して両端が数%ずつになる区切り
const LABELS = [
  [76, '出どころが見えない'],
  [64, 'やや出どころが見づらい'],
  [37, ''],
  [25, 'やや出どころが分かりやすい'],
  [0, '出どころが丸見え'],
];

export function describeDeception(deception) {
  for (const [lo, label] of LABELS) if (deception >= lo) return label;
  return '';
}
