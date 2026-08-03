// ============================================================
// 配球の3次元（左右・高低・奥行き） - pitchSequence.js
//
// 【配球とは「1球ごとの最適解」ではなく「並べ方」】
// 段階1〜3で1球ごとの位置と球種は表現できたが、**前の球との関係**が無かった。
// 実際の配球は
//   ・内角高め → 外角低め のように**対角へ動かす**（左右と高低を同時に変える）
//   ・速球のあとに変化球、という**奥行き**（緩急）
//   ・上下左右前後の3次元で揺さぶる
// で成り立っていて、打者は「前の球からどれだけ動いたか」に対応させられる。
//
// 【ただし同じ配球を続けると読まれる】
// 毎球きれいに対角へ動かすと、内角高め↔外角低めの往復になって
// 2球で一巡してしまう。これは最も読みやすい配球でもある。
// そこで**直近の要求と同じ引き出しを使うと打者に読まれる**ようにし、
// 「揺さぶる」と「散らす」の両立を捕手に要求する。
//
// 【この3つは全部リードに乗る】
//   1. 弱点を突く      … pitchZone.pickTargetCell（段階3）
//   2. 対角へ動かす    … ここ（sequenceShift）
//   3. 引き出しを散らす … ここ（repeatCount）
// リード0なら3つとも効かず、要求は完全にランダムになる。
//
// 【重要な発見】自動シミュレーションは `result.lastPitch` を一度も返しておらず、
// 前球の情報が常に null だった。そのため既存の緩急ペナルティ(speedDiffPenalty)も
// トンネリング効果(getTunnelingEffect)も**一度も発火していなかった**。
// つまり奥行きの次元は仕様として存在するだけで、リーグ成績には無関係だった。
// ============================================================

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 直近何球を「引き出し」の記憶として持つか。
// **4球必要**。3球だと内角高め↔外角低めの往復（A,B,A,B）で直近3球が [B,A,B] になり、
// 次のAの重複が1回にしか見えない。4球なら [A,B,A,B] で2回と数えられ、
// 「対角の往復は最も読みやすい配球でもある」という関係が表現できる。
const MEMORY = 4;

/** 打者から見た大まかな帯（外/中/内・高/中/低・速球/変化球） */
const colBand = (col) => (col <= 1 ? 0 : col === 2 ? 1 : 2);
const rowBand = (row) => (row <= 1 ? 0 : row === 2 ? 1 : 2);

/** 1球を「引き出し」1つに畳む。18通り */
export const drawerOf = (col, row, isBreaking) =>
  colBand(col) * 6 + rowBand(row) * 2 + (isBreaking ? 1 : 0);

/** 打席ごとの配球メモリ */
export function createSequence() {
  return { calls: [] };
}

/** 投げ終わった球を記憶する */
export function pushCall(seq, { col, row, isBreaking, velocity }) {
  if (!seq) return;
  seq.calls.push({ col, row, isBreaking, velocity, drawer: drawerOf(col, row, isBreaking) });
  if (seq.calls.length > MEMORY) seq.calls.shift();
}

export const lastCall = (seq) => (seq && seq.calls.length ? seq.calls[seq.calls.length - 1] : null);

// ============================================================
// 「崩された」の記憶
//
// どんなにパワーのある打者でも、前の球でタイミングを崩されたら次は当てにいく。
// 物理エンジン側は既に `powerTransferRate = meetQuality^0.6` で
// 「崩されたスイングにはパワーが乗らない」を表現しているが、それは**結果**の話で、
// 打者が**次の球で構え直す**（振り方を変える）という判断が無かった。
// ここは打席内の記憶なので配球メモリと同じ場所に置く。
// ============================================================

// これ以上の芯品質なら「崩されていない」とみなす境界
const FOOLED_OK = 0.55;
// 見送った1球で timing がどれだけ戻るか（完全には戻らない）
const FOOLED_DECAY = 0.5;

/**
 * 振った結果を記憶する。`meetQuality` が null/undefined なら空振り（＝完全に崩された）。
 * @returns {void}
 */
export function pushSwingQuality(seq, meetQuality) {
  if (!seq) return;
  seq.fooled = meetQuality == null ? 1
    : clamp(1 - meetQuality / FOOLED_OK, 0, 1);
}

/** 見送った（振らなかった）。崩れは残るが少し戻る */
export function decayFooled(seq) {
  if (!seq || !seq.fooled) return;
  seq.fooled *= FOOLED_DECAY;
}

/** 直前のスイングでどれだけ崩されているか（0=芯で捉えた 〜 1=空振り） */
export const fooledLevel = (seq) => (seq && seq.fooled) || 0;

/**
 * 前の球からどれだけ動いたか（0〜1強）。打者はこれが大きいほど対応しにくい。
 *
 * 左右と高低が**両方**動いたときに `diagonal` が乗るのが対角線攻めの表現。
 * 内角高め→外角低め は lateral/vertical/diagonal が全部立つので最大になる。
 * 同じ所へ2球続けると0。
 */
export function sequenceShift(prev, cur) {
  if (!prev || !cur) return null;
  const lateral = clamp(Math.abs(cur.col - prev.col) / 3, 0, 1);
  const vertical = clamp(Math.abs(cur.row - prev.row) / 3, 0, 1);
  // 奥行き: 球速差の比率。遅い投手ほど同じ差でも体感の緩急が大きい
  const base = Math.max(prev.velocity || 140, cur.velocity || 140);
  const depth = clamp(Math.abs((prev.velocity || 140) - (cur.velocity || 140)) / base / 0.15, 0, 1);
  const diagonal = Math.min(lateral, vertical);
  return clamp(lateral * 0.28 + vertical * 0.28 + depth * 0.24 + diagonal * 0.30, 0, 1);
}

// 基準は**リード0（＝完全にランダムに要求した場合）の平均シフト量**。
// 実測で 0.444（リード46で0.478 / リード100で0.519）。
// ここを0点にすると「でたらめに散らしただけでは何も得しない」形になり、
// 配球で稼いだぶんだけが成績に出る。平均を引かずに素の shift を効かせると、
// 球種や位置の分布を変えていないのにリーグ全体の打率が動いてしまう。
export const AVG_SHIFT = 0.444;

/**
 * 前球からの揺さぶりが打者の実効ミートに与える補正。
 * リーグ平均で±0。よく動かせた球は打ちにくく、同じ所へ続けた球は打たれやすい。
 */
export function shiftMeetAdjust(shift) {
  if (shift == null) return 0;
  return -(shift - AVG_SHIFT) * SHIFT_MEET;
}
const SHIFT_MEET = 14;

/**
 * その引き出しを直近で何回使ったか（0〜MEMORY）。
 * 対角線の往復（内角高め↔外角低め）は2球で一巡するので、
 * ここに必ず引っ掛かる。「毎回対角に攻めるのも善し悪し」はこの項で表現される。
 */
export function repeatCount(seq, col, row, isBreaking) {
  if (!seq || !seq.calls.length) return 0;
  const d = drawerOf(col, row, isBreaking);
  let n = 0;
  for (const c of seq.calls) if (c.drawer === d) n++;
  return n;
}

/**
 * 打者が「次はここだ」と読める確率。
 * 同じ引き出しが続くほど上がる。選球眼の高い打者ほど読む。
 *
 * 的中したときの効果は球種の読みと同じ（`calculatePhysicsContact` の
 * タイミング窓が1.3倍）。新しい物理の係数を増やさずに済む。
 */
// 引き出しを4球すべて同じにしたときの読まれる確率。
// ここが弱いと「毎回きれいに対角へ動かす」が単純に最善になってしまい、
// 配球に「散らす」という判断が要らなくなる。実測で 0.34 では
// 「対角一辺倒・散らさない」が最善のままだった（下記の方針比較）。
const READ_MAX = 0.60;

// **要求の偏りそのものを読む**（段階7）。
// 捕手が弱点を突きにいくほど softmax が尖り、次にどこへ来るかが読みやすくなる。
// これが無いと弱点狙い（段階3）に代償がまったく無く、
// 「常に最も効くセルへ要求する」が無条件に最善になってしまう。
const CONCENTRATION_W = 0.60;

/**
 * @param {number} readSignal 捕手の要求の偏り（0〜1）。resolvePitchLocation が返す。
 *   投手が目標を外した球では0になる（張っていてもそこに来ないため）。
 */
export function locationReadChance(seq, col, row, isBreaking, batterEye = 50, readSignal = 0) {
  const n = repeatCount(seq, col, row, isBreaking);
  if (n === 0 && readSignal <= 0) return 0;
  const eyeMult = 1 + (clamp(batterEye, 0, 100) - 50) / 100 * 0.6;
  const base = (n / MEMORY) * READ_MAX + readSignal * CONCENTRATION_W;
  return clamp(base * eyeMult, 0, 0.60);
}

/**
 * 捕手がセルを選ぶときの「配球としての良さ」。弱点狙いに足し込む。
 * 前球から動かせるほど高く、直近で使った引き出しほど低い。
 *
 * @returns 概ね -1.0 〜 +0.6
 */
const MOVE_W = 1.0;
// 「同じ引き出しを続けない」を捕手がどれだけ意識するか。
// **単独では効果が測れない**（0にしても 現行との差 -0.030 ± 0.047）。
// 対角へ動かせば自然に引き出しも変わるため、この項の仕事は大半が重複している。
// 配球の判断として実在するので残しているが、上げても下がる（1.0で+0.014）。
const REPEAT_W = 0.45;

export function sequenceScore(seq, cell, velocity, isBreaking) {
  const prev = lastCall(seq);
  const cur = { col: cell[0], row: cell[1], velocity };
  const shift = sequenceShift(prev, cur);
  const move = shift == null ? 0 : (shift - AVG_SHIFT);
  const repeat = repeatCount(seq, cell[0], cell[1], isBreaking);
  // MOVE_W を上げすぎると「毎回きっちり対角」になって読まれる側に倒れる。
  // 実測（リード81・制球85）で 1.0 に対し 2.5 は防御率 +0.030 ± 0.028 と悪化した。
  return move * MOVE_W - repeat * REPEAT_W;
}
