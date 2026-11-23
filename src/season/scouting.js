
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

// 精度のラベルと確度ドット数（1-3）。
export function accuracyMeta(accuracy) {
  if (accuracy >= 0.95) return { label: '確定', dots: 3, color: 'text-cyan-300' };
  if (accuracy >= 0.70) return { label: '精度 高', dots: 3, color: 'text-green-300' };
  if (accuracy >= 0.50) return { label: '精度 中', dots: 2, color: 'text-yellow-300' };
  return { label: '精度 低', dots: 1, color: 'text-orange-300' };
}
