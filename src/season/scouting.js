// ============================================================
// スカウト精度（情報の霧）- src/season/scouting.js
//
// 自チーム以外／アマチュアの選手は、能力や将来性を「確定値」ではなく
// 精度に応じた「幅（レンジ）」で見せる。知名度(fame)が高い選手は誰もが
// 知っており精度が高く、無名の原石は霧が濃い。個別に調査(_scoutLevel)を
// 重ねると精度が上がり、確定値に近づく。ゲームの知名度システムと整合。
// ============================================================

// スカウト精度 0.30〜1.00。自チーム選手は常に 1.0（把握済み）。
export function getScoutAccuracy(player, opts = {}) {
  if (opts.owned) return 1.0;
  const fame = player.fame || 0;
  const scoutLevel = player._scoutLevel || 0;       // 個別調査の回数（0-3）
  const eyeBonus = opts.teamScoutEye != null ? Math.max(0, opts.teamScoutEye - 50) / 50 * 0.10 : 0;
  const acc = 0.32 + (fame / 100) * 0.44 + scoutLevel * 0.16 + eyeBonus;
  return Math.max(0.30, Math.min(1.0, acc));
}

// 調査で上げられる最大レベル
export const MAX_SCOUT_LEVEL = 3;

// 真の値と精度から推定レンジを求める。精度が高いほど幅が狭い。
export function abilityRange(trueValue, accuracy, spread = 16) {
  const margin = Math.round((1 - accuracy) * spread);
  return {
    lo: Math.max(1, trueValue - margin),
    hi: Math.min(99, trueValue + margin),
    margin,
    exact: margin <= 1,
  };
}

// レンジの表示文字列（確定なら単一値）。
export function formatRange(trueValue, accuracy, spread = 16) {
  const r = abilityRange(trueValue, accuracy, spread);
  return r.exact ? `${trueValue}` : `${r.lo}〜${r.hi}`;
}

// 精度のラベルと確度ドット数（1-3）。
export function accuracyMeta(accuracy) {
  if (accuracy >= 0.95) return { label: '確定', dots: 3, color: 'text-cyan-300' };
  if (accuracy >= 0.70) return { label: '精度 高', dots: 3, color: 'text-green-300' };
  if (accuracy >= 0.50) return { label: '精度 中', dots: 2, color: 'text-yellow-300' };
  return { label: '精度 低', dots: 1, color: 'text-orange-300' };
}
