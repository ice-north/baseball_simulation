// ============================================================
// ポテンシャル（将来性）評価 - src/season/potential.js
//
// 現在の総合力・年齢・成長率(growthPotential)・プロ意識から、その選手が
// 到達しうる「ピーク総合力」を推定し、将来性グレード(S/A/B/C/D)を返す。
// ③の成長システムと同じ観点（若く成長率が高いほど伸びる／プロ意識で伸長）で、
// スカウトやドラフトの「素材を見抜く」判断材料にする。
//
// あくまで推定値（scouting estimate）であり、実際の到達点は起用法・キャンプ・
// 派遣・怪我のない前提での近似。UIでは「予測」として不確実性込みで見せる。
// ============================================================

import { calcPlayerOverall } from './dispatchSystem.js';

// グレード境界（総合力→グレード）
const GRADE_CUTS = [
  { g: 'S', min: 78 }, { g: 'A', min: 66 }, { g: 'B', min: 54 }, { g: 'C', min: 42 }, { g: 'D', min: 0 },
];
export function overallToGrade(ov) {
  for (const c of GRADE_CUTS) if (ov >= c.min) return c.g;
  return 'D';
}

export const GRADE_COLOR = {
  S: 'text-pink-300', A: 'text-red-300', B: 'text-orange-300', C: 'text-yellow-300', D: 'text-gray-300',
};
export const GRADE_BG = {
  S: 'bg-pink-900/40 border-pink-600/50', A: 'bg-red-900/40 border-red-600/50',
  B: 'bg-orange-900/40 border-orange-600/50', C: 'bg-yellow-900/30 border-yellow-600/40',
  D: 'bg-gray-800/60 border-gray-600/40',
};

// ピーク年齢の推定（成長率が高い/プロ意識が高いほど後ろ倒し）
function estimatePeakAge(gp, discipline) {
  const a = 25 + (gp - 1.0) * 8 + Math.max(0, discipline - 60) * 0.035;
  return Math.max(24, Math.min(31, Math.round(a)));
}

/**
 * 選手のピーク総合力・将来性グレードを推定する。
 * @returns {{ current:number, peak:number, peakAge:number, upside:number,
 *             grade:string, currentGrade:string, matured:boolean }}
 */
export function projectPeak(player) {
  const current = calcPlayerOverall(player);
  const gp = Math.max(0.3, player.growthPotential ?? 1.0);
  const discipline = player.personality?.discipline ?? 50;
  const age = player.age ?? 22;
  const peakAge = estimatePeakAge(gp, discipline);

  // 既にピーク年齢以上なら伸びしろはほぼ無し
  if (age >= peakAge) {
    const g = overallToGrade(current);
    return { current, peak: current, peakAge: age, upside: 0, grade: g, currentGrade: g, matured: true };
  }

  // 将来へ向けて年次成長を素朴に積み上げる（期待値・乱数なし）。
  // 若いほど・成長率が高いほど1年の伸びが大きく、ピークに近づくと逓減。
  let ov = current;
  for (let y = age + 1; y <= peakAge; y++) {
    const youthMult = y <= 24 ? 1.0 : y <= 27 ? 0.65 : 0.4;
    // 成長率ぶんの伸び＋プロ意識ぶんの練習成長（高プロ意識ほど伸び続ける）
    const annual = Math.max(0, gp - 0.7) * 4.6 * youthMult
                 + Math.max(0, discipline - 65) * 0.035 * youthMult;
    ov += annual;
  }
  const peak = Math.min(99, Math.round(ov));
  return {
    current, peak, peakAge,
    upside: peak - current,
    grade: overallToGrade(peak),
    currentGrade: overallToGrade(current),
    matured: false,
  };
}
