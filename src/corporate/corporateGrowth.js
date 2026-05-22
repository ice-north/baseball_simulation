// ============================================================
// 社会人野球 成長システム（コーチ品質ベース）
// 既存の成長計算ロジックを使い、倍率の源泉だけ変える
// ============================================================

import { getTeamStaffBonus } from './staffData.js';

// 独立リーグ: experience/10 ベースで成長率が上がる
// 社会人: コーチの指導能力ベースで成長率が決まる

// 練習タイプ → 参照するスタッフ能力のマッピング
const TRAINING_TO_STAFF = {
  batting: 'battingCoach',
  fielding: 'fieldRunCoach',
  baserunning: 'fieldRunCoach',
  pitching: 'pitchingCoach',
  control: 'pitchingCoach',
  velocity: 'pitchingCoach',
  stamina: 'fitness',
  physical: 'fitness',
  battery: 'batteryCoach',
  newPitch: 'pitchingCoach',
  eye: 'battingCoach',
  bunt: 'battingCoach',
};

// コーチ能力値 → 成長倍率を返す
// 独立リーグの experience ベースの growthModifier と同じスケール感にする
// 能力50 = 1.0倍（標準）、能力80 = 1.3倍、能力30 = 0.7倍
export const getCorporateGrowthModifier = (staffList, trainingType) => {
  if (!staffList || staffList.length === 0) return 0.7; // スタッフなし = 低成長

  const bonus = getTeamStaffBonus(staffList);
  const key = TRAINING_TO_STAFF[trainingType] || 'battingCoach';
  const val = bonus[key] || 50;

  // 能力0→0.5倍、50→1.0倍、100→1.5倍（線形）
  return 0.5 + (val / 100);
};

// モチベーション効果: チーム全体の練習意欲に影響
// 高いと全練習に微ボーナス（+0〜10%）
export const getMotivationBonus = (staffList) => {
  if (!staffList || staffList.length === 0) return 1.0;
  const bonus = getTeamStaffBonus(staffList);
  const motivation = bonus.motivation || 50;
  return 1.0 + (motivation - 50) / 500; // 50→+0%, 80→+6%, 100→+10%
};

// 怪我予防率: bodyCare + fitness の合算で怪我リスクを軽減
// 返り値: 0.5〜1.0（1.0で怪我しない、0.5でケアなし）
export const getInjuryPrevention = (staffList) => {
  if (!staffList || staffList.length === 0) return 0.5;
  const bonus = getTeamStaffBonus(staffList);
  const care = ((bonus.bodyCare || 50) + (bonus.fitness || 50)) / 2;
  return 0.5 + (care / 200); // 0→0.5, 50→0.75, 100→1.0
};

// 覚醒発生率の計算
// 独立リーグ: experience/15 ベース
// 社会人: コーチの該当能力/20 ベース（良いコーチほど覚醒を引き出す）
export const getCorporateAwakeningRate = (staffList, trainingType) => {
  if (!staffList || staffList.length === 0) return 0.02; // 最低2%

  const bonus = getTeamStaffBonus(staffList);
  const key = TRAINING_TO_STAFF[trainingType] || 'battingCoach';
  const val = bonus[key] || 50;
  return Math.min(0.15, val / 2000 + 0.02); // 2%〜15%
};
