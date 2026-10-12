// ============================================================
// 盗塁 - stealing.js
//
// **采配モードと自動シミュレーションで共有する**盗塁の試行判断と成否。
// 以前は2エンジンが完全に別のモデルを持っていた:
//
//   自動シミュ … 成功率 = (走力-25)×1.8 - 捕手肩×0.3 - 制球×0.1 + 乱数±10
//                **盗塁スキル(steal)を一切見ていなかった**（走力だけ）
//   采配モード … 試行率 = 盗塁スキル^1.5×0.18 + 走力×0.02 - 捕手肩×0.18 …
//                成功率 = 0.30 + 走力×0.60 + … から捕手の肩を二乗で引く別式
//                左投手の牽制ボーナス・三塁盗塁の左投げペナルティも独自
//
// 同じ選手・同じ場面でもスキップと采配で結果が別世界になっていたので統一する。
//
// 【較正の基準】実NPB: 盗塁 0.55/チーム/試合・成功率 72-75%。
// 試行はおよそ 0.75/試合。
// ============================================================

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 成功率の基準。走力55・盗塁55・捕手肩60・制球55 でおよそ 72%
const BASE = 0.46;
const SPEED_W = 0.0055;    // 走力の寄与（走力100で +0.25）
const STEAL_W = 0.0035;    // 盗塁スキルの寄与（100で +0.16）
const ARM_W = 0.0060;      // 捕手の肩（100で -0.36）
const QUICK_W = 0.0012;    // 投手のクイック（制球で近似。100で -0.09）
// 三塁盗塁は捕手の送球が難しく成功しやすいが、失敗の代償が大きいので試行は少ない
const THIRD_BONUS = 0.06;
// 左投手は一塁走者を見ているので走りにくい（三塁盗塁には効かない）
const LEFTY_HOLD = 0.05;

/**
 * 盗塁の成功率（0〜1）。
 * @param {number} toBase 2 = 二塁盗塁 / 3 = 三塁盗塁
 */
export function stealSuccessRate({
  runnerSpeed = 55, runnerSteal = 50, catcherArm = 60,
  pitcherControl = 55, pitcherThrows = 'right', toBase = 2,
} = {}) {
  let p = BASE
    + (runnerSpeed - 55) * SPEED_W
    + (runnerSteal - 50) * STEAL_W
    - (catcherArm - 60) * ARM_W
    - (pitcherControl - 55) * QUICK_W;
  if (toBase === 3) p += THIRD_BONUS;
  else if (pitcherThrows === 'left') p -= LEFTY_HOLD;
  return clamp(p, 0.05, 0.95);
}

// 試行率。**成功率が見込めるときだけ走る**形にして、
// 走塁方針（aggressive/normal/conservative）で強弱を付ける
const ATTEMPT_STRATEGY = { aggressive: 1.55, normal: 1.0, conservative: 0.45 };
// 三塁盗塁は失敗の代償が大きいので、同じ成功率でも試行は少ない
const THIRD_ATTEMPT = 0.28;

/**
 * その1球で盗塁を試みる確率（0〜1）。
 * 打席あたりではなく**1球あたり**なので小さい値になる。
 */
export function stealAttemptRate({
  successRate = 0.7, runnerSteal = 50, outs = 0, toBase = 2,
  strategy = 'normal', batterIsGood = false,
} = {}) {
  // 成功率が低い場面では走らない（65%を境に急に減る）
  const worth = clamp((successRate - 0.55) / 0.25, 0, 1);
  // 走る気のある走者ほど仕掛ける
  const will = 0.150 + (clamp(runnerSteal, 0, 100) / 100) * 0.395;
  let p = worth * will * (ATTEMPT_STRATEGY[strategy] ?? 1.0);
  if (toBase === 3) p *= THIRD_ATTEMPT;
  // 2アウトは走者を進めても得点に直結しにくいので控える
  if (outs >= 2) p *= 0.55;
  // 好打者が打席にいるなら走らせない（併殺の心配も少ない）
  if (batterIsGood) p *= 0.7;
  return clamp(p, 0, 0.9);
}
