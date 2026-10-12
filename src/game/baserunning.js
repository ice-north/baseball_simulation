// ============================================================
// 内野ゴロでの走者進塁 - baserunning.js
//
// 采配モードと自動シミュレーションで共有する「ゴロGO・進塁打」の判定。
//
// 【なぜ必要か】
// 従来 out の処理には外野フライのタッチアップしか無く、内野ゴロでは走者が
// 一切動かなかった。実際の野球で散発の走者を還す主力はこの進塁なので、
// 走者が溜まらない試合ほど得点が作れず、BaseRuns予測との比が
//   制球10(走者多)97% → 制球85(走者少)81%
// と、投手が good なほど乖離が広がっていた。
//
// 【一塁走者は対象外】
// 「打者アウト＋走者は一塁のまま」は「二塁でフォースアウト＋打者は一塁で生存」と
// 同じ盤面・同じアウト数なので、野手選択の表現としてすでに正しい。
// 三塁・二塁の走者にはこの読み替えが効かないため、そこだけを補う。
// ============================================================

/**
 * 内野ゴロ（2アウト未満）での走者進塁を判定する。
 * 塁の表現がエンジンごとに違う（走者オブジェクト / boolean）ため、
 * ここでは判定結果だけを返し、実際の塁の書き換えは呼び出し側で行う。
 *
 * @param {boolean} hasThird  三塁に走者がいるか
 * @param {boolean} hasSecond 二塁に走者がいるか
 * @param {number} infieldDefense 内野4人の平均守備力（前進守備・打球処理の速さ）
 * @param {number} thirdSpeed  三塁走者の走力
 * @param {number} secondSpeed 二塁走者の走力
 * @returns {{scoreFromThird: boolean, secondToThird: boolean}}
 */
export function resolveGroundOutAdvance({
  hasThird = false, hasSecond = false,
  infieldDefense = 50, thirdSpeed = 50, secondSpeed = 50,
} = {}) {
  // 三塁走者の生還（ゴロGO）。前進守備を敷ける守備力の高い内野ほど本塁で刺す。
  // 実際は打球の方向と内野の守備位置で決まり、総合すると4〜5割が還る。
  const scoreFromThird = hasThird &&
    Math.random() < 0.50 - (infieldDefense - 50) * 0.004 + (thirdSpeed - 50) * 0.002;

  // 二塁走者の三塁進塁（進塁打）。右方向の打球でのみ進めるので約半分。
  // 三塁が空く場合だけ（三塁走者が還った直後も含む）。
  const secondToThird = hasSecond && (!hasThird || scoreFromThird) &&
    Math.random() < 0.50 - (infieldDefense - 50) * 0.003 + (secondSpeed - 50) * 0.002;

  return { scoreFromThird, secondToThird };
}

/**
 * 安打での積極進塁（単打で 2塁→本塁 / 1塁→3塁、二塁打で 1塁→本塁）を判定する。
 *
 * 【以前の問題】
 *  - 2アウトでは積極進塁を禁止していた。実際は逆で、2アウトの走者は打球を
 *    確認せずスタートを切るため最も積極的になる（単打での2塁走者の生還は
 *    0アウトで約5割、2アウトでは約8.5割）。
 *  - 二塁打に積極進塁が無く、1塁走者は必ず3塁で停止していた（実際は約45%が生還）。
 *  - 采配モードにはこの仕組み自体が無く、自動シミュレーションと得点力が違っていた。
 *
 * @returns {{attempt: boolean, thrownOut: boolean}}
 *   attempt=true かつ thrownOut=false なら1つ余分に進塁、thrownOut=true なら捕殺
 */
export function tryExtraAdvance({
  hitType, fromBase, runnerSpeed = 55, avgArm = 60,
  currentOuts = 0, throwerArm = null, cutoffDefense = 60,
} = {}) {
  const eligible = (hitType === 'single' && fromBase <= 1) || (hitType === 'double' && fromBase === 0);
  if (!eligible) return { attempt: false, thrownOut: false };

  const baseTry = hitType === 'double' ? 0.45          // 二塁打: 1塁→本塁
    : fromBase === 1 ? 0.55 : 0.22;                     // 単打: 2塁→本塁 / 1塁→3塁
  const twoOutBonus = currentOuts >= 2 ? 0.30 : 0;      // 2アウトはゴロゴーで走る
  const tryChance = Math.max(0, Math.min(0.92,
    baseTry + twoOutBonus + (runnerSpeed - 55) / 100 * 0.6 - (avgArm - 55) / 100 * 0.4));
  if (Math.random() >= tryChance) return { attempt: false, thrownOut: false };

  // 捕殺成功率: 肩60・カット60・走力55 で約22%。肩が強く走者が遅いほど刺せる
  const arm = throwerArm ?? avgArm;
  const throwOut = Math.max(0.02, Math.min(0.45,
    0.22 + (arm - 60) / 100 * 0.45 + (cutoffDefense - 60) / 100 * 0.20
      - (runnerSpeed - 55) / 100 * 0.45));
  return { attempt: true, thrownOut: Math.random() < throwOut };
}
