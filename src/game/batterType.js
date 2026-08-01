// ============================================================
// 打者の狙い方（野村克也の4分類） - batterType.js
//
//   A型 直球対応・理想型   直球に重点を置きつつ変化球にも対応する。天才打者向け
//   B型 コース特化型       内角か外角か、打つコースを絞って待つ
//   C型 方向決定型         引っ張りか流しか、打つ方向を決めて待つ
//   D型 球種ヤマ張り型     ストレートか変化球かにヤマを張る。読んで生き残る型
//
// 【型は選ぶものではなく能力から決まる】
// 「イチローのように打ちたい」は誰でも思うが、それができるのはミートが
// 突出した打者だけ。読んで生き残るのは不器用な打者。
// だから型は `batting` の能力から導出し、選手の個性として表に出す。
//
// 【既存の読みモデルにそのまま乗る】
// 段階7で「球種とコースを別々に張り、当たった数でタイミング窓が変わる」
// (+2=×1.50 / +1=×1.30 / -1=×0.84) という土台ができている。
// 4分類は**その土台の「何を張るか」を変えるだけ**で表現できる。
// ============================================================

import { getZoneProfile } from './batterZone.js';

export const BATTER_TYPE_LABEL = { A: 'A型 直球対応', B: 'B型 コース狙い', C: 'C型 方向決め', D: 'D型 ヤマ張り' };
export const BATTER_TYPE_NOTE = {
  A: '直球に重点を置きつつ変化球にも対応する。読み外しの代償を負わない理想型',
  B: '内角か外角か、得意な方に絞って待つ。逆のコースは見送るので四球が増える',
  C: '引っ張りか流しか、方向を決めて待つ。打球方向が偏る代わりに準備ができる',
  D: '球種にヤマを張る。当たれば強く振れるが、外せば体が泳ぐ',
};

/**
 * 打者の型。ミートが突出していればA、あとは選球眼／パワーの相対的な強みで決まる。
 * どれも平凡なら「読んで生き残る」D型。
 */
export function getBatterType(player) {
  const b = player?.batting;
  if (!b) return 'D';
  const meet = b.meet ?? 50, eye = b.eye ?? 50, power = b.power ?? 50;
  // 天才型。直球を待ちながら変化球にも対応できるのはミートが突出した打者だけ
  if (meet >= 66) return 'A';
  const eyeEdge = eye - meet;      // ミートより選球眼が勝る＝コースを絞れる
  const powEdge = power - meet;    // ミートよりパワーが勝る＝方向を決めて振り抜く
  if (eyeEdge >= 2 && eyeEdge >= powEdge) return 'B';
  if (powEdge >= 2) return 'C';
  return 'D';
}

/**
 * カウント別に「張る」確率。追い込まれたら当てにいく。
 * A型は常に直球に備えているので、この確率は使わない。
 */
export function commitRateFor(type, { balls = 0, strikes = 0 } = {}) {
  if (type === 'A') return 1;
  // B型は「あらかじめ打つコースを絞り込む」型なので、追い込まれるまで常時絞る。
  // 30%程度にしていたときは +2 と -1 が相殺して型の個性が何も出なかった
  // （実測 OPS +0.006 ± 0.006）。絞る頻度そのものがB型の identity。
  if (type === 'B') return strikes >= 2 ? 0.18 : 0.72;
  return strikes >= 2 ? 0.10
    : balls > strikes ? 0.45
      : strikes > balls ? 0.18
        : 0.30;
}

const band = (v) => (v <= 1 ? -1 : v === 2 ? 0 : 1);   // -1=外角/高め, 0=真ん中, +1=内角/低め

// B型が「張っていない側」を見送る強さ。
// コースを絞るということは、逆のコースには手を出さないということ。
// これがB型の本体で、無いと +2/-1 が相殺して型として何の個性も出ない
// （実測 OPS +0.006 ± 0.006 で誤差内だった）。
// 見送るぶん四球が増え、見逃しストライクも増える。選球眼型の稼ぎ方になる。
const B_TAKE = 0.55;    // 逆のコースを振る確率の倍率
const B_ATTACK = 1.12;  // 張った側を振る確率の倍率

/**
 * AI打者の狙いを解決する。
 *
 * @returns {{level:number, dirBias:number, swingMult:number}}
 *   level     読みレベル（-1〜+2）。`calculatePhysicsContact` のタイミング窓に効く
 *   dirBias   C型が決めた打球方向（-1=流し / +1=引っ張り / 0=なし）
 *   swingMult スイング確率の倍率（B型が張っていない側を見送る）
 */
export function resolveAiBatterGuess({
  type, player, balls = 0, strikes = 0, isBreaking = false, col = 2, guessRight = false,
} = {}) {
  if (type === 'A') {
    // 直球に重点を置きつつ変化球にも対応する。**外し（負の値）が無いのが理想型**。
    // ミート66以上という条件自体が厳しいので、能力の対価として素直に強くしてある。
    return { level: Math.min(2, (isBreaking ? 0 : 1) + (guessRight ? 1 : 0)), dirBias: 0, swingMult: 1 };
  }

  if (!(Math.random() < commitRateFor(type, { balls, strikes }))) {
    // 張らなかった打席は従来どおりの読み合い
    return { level: guessRight ? 1 : 0, dirBias: 0, swingMult: 1 };
  }

  if (type === 'D') {
    // 球種にヤマを張る。当たれば強く振れるが外せば泳ぐ
    return { level: guessRight ? 2 : -1, dirBias: 0, swingMult: 1 };
  }

  // B型・C型は「コース」を張る。**待つのは自分の得意な側**。
  // 得意な側で待つので、捕手が弱点を突いてくるほど裏をかかれる形になる。
  const profile = getZoneProfile(player);
  const wait = (profile.inside ?? 0) > 0 ? -1 : 1;   // 内角に弱ければ外角を待つ
  const b = band(col);
  const hit = b === wait;
  const missed = b === -wait;

  if (type === 'C') {
    // 方向を決めて待つ。内角を待てば引っ張り、外角を待てば流し打ち。
    // 準備は出来るが読みの利得はB型より小さく、代わりに打球方向が寄る。
    return { level: hit ? 1 : missed ? -1 : 0, dirBias: wait, swingMult: 1 };
  }
  // B型: コースを絞り切る。張った側は強く振り、逆のコースは見送る。
  // 「絞る」＝手を出す範囲を狭めることなので、四球と見逃しが増える
  return {
    level: hit ? 2 : missed ? -1 : 0, dirBias: 0,
    swingMult: hit ? B_ATTACK : missed ? B_TAKE : 1,
  };
}
