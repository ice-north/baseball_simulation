// ============================================================
// 球種ごとの「投げやすいコース」 - pitchShape.js
//
// これまで投球位置は球種と無関係だった。捕手はどの球種でも同じセルを要求でき、
// 投手はどのセルにも同じ精度で投げられた。実際は球種ごとに自然な高さと
// 横方向があり、そこへ要求すれば決まりやすく、逆へ要求すれば決まらない。
//
// 【高さ】ストレートは高め、変化球は低めが投げやすい
//   これは `getHeightPitchEffect`（高めの速球・低めの変化球は空振りが取れる）と
//   同じ向き。効く高さと投げやすい高さが一致するので、
//   「速球は高め／変化球は低め」が配球の基本形として自然に出る。
//
// 【横】球種は腕側かグラブ側のどちらかへ逃げる
//   スライダー・カッターはグラブ側 → 同じ利き手の打者には**外角へ逃げる**
//   シュート・シンカー・ツーシームは腕側 → 同じ利き手の打者には**内角へ食い込む**
//   左右が逆なら向きも逆になる。
//   グリッドは打者から見た向き（col 4 = その打者の内角）なので、
//   `armSide × (同じ利き手 ? +1 : -1)` だけで打者基準の向きに変換できる。
//
// 【変化球レベル】高いほど狙ったところに決まる（σが小さくなる）
// ============================================================

import { rowAxis, colAxis } from './pitchZone.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 球種の横変化。+1 = 腕側（シュート方向） / -1 = グラブ側（スライダー方向）。
 * 0 は縦変化主体で横には逃げない球種。
 */
const ARM_SIDE = {
  slider: -1.0, cutter: -0.75, curve: -0.5,
  shoot: 1.0, sinker: 0.8, twoSeam: 0.8, changeup: 0.45, palm: 0.3,
  fork: 0, splitter: 0, knuckle: 0, straight: 0,
};

/** 球種の縦の性格。+1 = 低めが自然（変化球） / -1 = 高めが自然（速球） */
const NATURAL_LOW = {
  straight: -1.0, twoSeam: -0.3, cutter: -0.2,
  slider: 0.6, curve: 0.9, fork: 1.0, splitter: 1.0,
  changeup: 0.8, sinker: 1.0, shoot: 0.3, palm: 0.7, knuckle: 0.4,
};

/**
 * その球種にとって自然なコース（打者から見た向き）。
 * @returns {{col:number, row:number}} それぞれ -1〜+1。col +1=内角 / row +1=低め
 */
export function naturalCourse(type, pitcherThrows, batterBats) {
  const arm = ARM_SIDE[type] ?? 0;
  // スイッチヒッターは常に投手と逆の打席に立つので「逆の利き手」で固定
  const sameHand = batterBats === 'switch' ? false
    : (pitcherThrows || 'right') === (batterBats || 'right');
  return { col: arm * (sameHand ? 1 : -1), row: NATURAL_LOW[type] ?? 0 };
}

// 捕手が「その球種に合ったコース」をどれだけ優先するか。
// 大きくすると全球が定型（速球は高め／スライダーは外角低め）になって読まれるため、
// 対角・散らし（pitchSequence）と釣り合う程度に留める。
const CALL_W = 0.55;

/**
 * 捕手のセル選択に足すスコア。球種に合ったセルほど高い。
 * `pickTargetCell` の softmax に他の項と並べて足す。
 *
 * ⚠ **誘い球(chase)には掛けない**。誘い球のセルはどれも枠のすぐ外だが
 * ストライクになる確率が揃っておらず、偏らせると四球が増える
 * （段階3の弱点狙いで同じ罠を踏んで BB/9 +0.34 を出した）。
 * 実測でも chase に掛けた版は四球率が 9.3%→10.3% に跳ねた。
 */
export function shapeCallScore(cell, natural, aim) {
  if (aim === 'chase') return 0;
  if (!natural || (!natural.col && !natural.row)) return 0;
  return (colAxis(cell[0]) * natural.col + rowAxis(cell[1]) * natural.row) * CALL_W * 0.5;
}

// 自然なコースと逆へ要求したときのばらつきの増え方。
// 0.18 で「自然な側 σ×0.82 / 逆側 σ×1.18」。
const SHAPE_SIGMA_W = 0.18;
// **中心はリーグの平均 fit**（実測 0.115）。捕手が球種に合ったコースを要求する
// ぶん fit の平均が正に寄るので、引かないとリーグ全体の σ が下がる
//（＝全投手の実質制球が上がる）。実測で防御率が 3.36→3.18 に落ちた。
// ここを引くと「自然なコースへ要求できたぶんの差」だけが成績に出る。
const FIT_MEAN = 0.115;
// 変化球レベルによるばらつき。レベル100で0、レベル0で+0.20セル。
// 「変化球レベルが高いほど思ったところに決まる」を σ に直接効かせる。
//
// ⚠ ここは**従来 `breakingControlPenalty` として制球値から引いていたものの
// 引っ越し先**。両方生かすと二重計上になり、変化球のばらつきが倍になって
// 四球が跳ねる。しかも旧実装は自動シミュ(100-level)×0.20 と
// 采配モード(100-level)×0.30 で係数が違っていた。ここに一本化して揃える。
const LEVEL_SIGMA_W = 0.20;

/**
 * 目標セルと球種から、ばらつき σ の倍率と加算量を返す。
 * @param {[number,number]} cell 目標セル
 * @param {{col:number,row:number}} natural naturalCourse の戻り値
 * @param {boolean} isBreaking
 * @param {number} level 変化球レベル
 */
export function shapeSigma(cell, natural, isBreaking, level = 50) {
  let mult = 1, add = 0;
  if (natural && (natural.col || natural.row)) {
    // 自然な向きとの一致度（-1〜+1）。一致していれば σ が小さくなる
    const fit = clamp(
      (colAxis(cell[0]) * natural.col + rowAxis(cell[1]) * natural.row) / 2, -1, 1);
    mult = 1 - (fit - FIT_MEAN) * SHAPE_SIGMA_W;
  }
  if (isBreaking) add = (1 - clamp(level, 0, 100) / 100) * LEVEL_SIGMA_W;
  return { mult, add };
}
