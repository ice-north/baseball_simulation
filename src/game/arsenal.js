// ============================================================
// 持ち球の「幅」 - arsenal.js
//
// 【従来の問題】打者の球種予測は `1 / 持ち球数` で、**何を持っているかを
// 一切見ていなかった**。スライダーとカットボールを持つ投手も、
// スライダーとシュートを持つ投手も、同じ「3球種」として扱われていた。
//
// 実際には
//   ・速球系と遅球系（奥行き）
//   ・グラブ側とアーム側（左右の変化）
//   ・伸びる球と落ちる球（縦）
// のように**性格が反対の球を組み合わせるほど読みにくい**。
// 逆にスライダーとカットボール、フォークとパームのように似た球を
// 並べても打者から見れば同じ引き出しなので、球種を増やした意味が薄い。
//
// 【表現の仕方】球種を3軸の座標に置き、**近い球どうしは互いを打ち消して
// 「実効的な持ち球数」を減らす**。この実効数を `guessSuccessRate` に渡すと、
// 幅のある持ち球ほど的中率が下がる＝読まれにくくなる。
//
// 軸は既存の定義をそのまま使う（新しい表を作ると必ず取り残される）:
//   奥行き … `BALL_EFFECTS.velocityMinus`（ストレートからの球速減）
//   横     … `pitchShape.ARM_SIDE`（-1=グラブ側 / +1=アーム側）
//   縦     … `pitchShape.NATURAL_LOW`（-1=伸びる / +1=落ちる）
// ============================================================

import { BALL_EFFECTS } from '../utils/constants.js';
import { PITCH_AXIS_SIDE, PITCH_AXIS_VERTICAL } from './pitchShape.js';

// 軸の重み。**横（左右の変化）が最も読み分けにくい**ので重くする。
// 奥行きは緩急として別途タイミングにも効いているので控えめ。
const W_DEPTH = 0.85;
const W_SIDE = 1.00;
const W_VERT = 0.70;

// この距離まで近いと「同じ引き出し」とみなす。
// スライダー(-1.0/0.6/12km) と カットボール(-0.75/-0.2/8km) の距離が
// おおよそ 0.85 なので、その辺りで強く似ていると判定される。
const SIMILAR_DIST = 1.25;

/** 球種を3軸の座標に置く。速度差は 30km/h を1.0に正規化 */
function axesOf(type) {
  return {
    d: (BALL_EFFECTS[type]?.velocityMinus ?? 0) / 30,
    x: PITCH_AXIS_SIDE[type] ?? 0,
    y: PITCH_AXIS_VERTICAL[type] ?? 0,
  };
}

/** 2球種の似ている度合い（0=まったく別 〜 1=ほぼ同じ） */
export function pitchSimilarity(a, b) {
  if (a === b) return 1;
  const p = axesOf(a), q = axesOf(b);
  const dist = Math.hypot(
    (p.d - q.d) * W_DEPTH,
    (p.x - q.x) * W_SIDE,
    (p.y - q.y) * W_VERT,
  );
  return Math.max(0, 1 - dist / SIMILAR_DIST);
}

/**
 * 実効的な持ち球数。似た球どうしは互いを打ち消して1未満に数える。
 *
 *   実効数 = Σ 1 / (1 + Σ 他の球との類似度)
 *
 * 例（ストレート＋2球種）:
 *   スライダー＋シュート … 反対方向なので 3.00（丸ごと3球種ぶん）
 *   スライダー＋カット   … 同じグラブ側なので 2.4 前後
 *   フォーク＋パーム     … ほぼ同じ落ちる球なので 2.2 前後
 *
 * 変化球レベルが低い球は「決まらない球」なので、実効数への寄与も小さくする。
 */
export function effectiveArsenalSize(arsenal) {
  const list = (arsenal || []).filter(b => b && b.type);
  if (list.length <= 1) return Math.max(1, list.length);
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    let overlap = 0;
    for (let j = 0; j < list.length; j++) {
      if (i === j) continue;
      overlap += pitchSimilarity(list[i].type, list[j].type);
    }
    // 未熟な変化球は引き出しとして数えきれない（ストレートは常に1.0）
    const lv = list[i].type === 'straight' ? 1
      : 0.55 + Math.min(1, (list[i].level ?? 50) / 100) * 0.45;
    total += lv / (1 + overlap);
  }
  return Math.max(1, total);
}
