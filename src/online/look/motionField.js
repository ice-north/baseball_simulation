// ============================================================
// 新しい見た目（試作）「動きで見る」: 球場の寸法と、人の定位置。
//
// ⚠ 長さの単位はメートル。座標は本塁が原点、x は一塁側が正、y はセンター方向。
// ⚠ ここは数だけ（動きは `playMotion.js`、守備の持ち場は `motionDefense.js`）。
//    グラウンドの縁（`inGround`）は `motionStadium.js` の壁の絵と同じ形。
// ============================================================

const BASE = 27.43;
const HALF = BASE / Math.SQRT2;
/** 本塁・一塁・二塁・三塁 */
export const BASES = [
  [0, 0],
  [HALF, HALF],
  [0, HALF * 2],
  [-HALF, HALF],
];
/** 向き（-45 三塁線 … 45 一塁線）と距離 → 座標 */
export const at = (dir, dist) => {
  const r = (dir * Math.PI) / 180;
  return [dist * Math.sin(r), dist * Math.cos(r)];
};
/** フェンスまでの距離（両翼100m・中堅122m）。⚠ `sceneArt.js` の図と同じ形 */
export const fenceOf = (dir) => 100 + 22 * Math.cos((Math.abs(dir) * Math.PI) / 90);

/** 守備の位置の番号 */
export const P = 1;
export const C = 2;
export const B1 = 3;
export const B2 = 4;
export const B3 = 5;
export const SS = 6;
export const LF = 7;
export const CF = 8;
export const RF = 9;

/** 守備の定位置（1 投手 … 9 ライト）。0 は使わない */
export const FIELDER_HOME = [
  null,
  [0, 18.4],
  [0, -1.6],
  at(37, 29),
  at(13, 40),
  at(-37, 29),
  at(-13, 40),
  at(-28, 80),
  at(0, 90),
  at(28, 80),
];

/** 球審（捕手の後ろ。打者の反対側に半歩ずれて、捕手を隠さない）と塁審（一塁・二塁・三塁）の定位置 */
export const UMPIRE_HOME = [
  [1.3, -3.1],
  [BASES[1][0] + 3, BASES[1][1] + 5],
  [-5, BASES[2][1] + 7],
  [BASES[3][0] - 3, BASES[3][1] + 5],
];

/** 本塁で送球を受ける所（塁の少し前） */
export const HOME_SPOT = [0, 0.3];
/** 塁（1〜3）と本塁（4）で送球を受ける所 */
export const baseSpot = (b) => (b % 4 === 0 ? HOME_SPOT : BASES[b]);

export const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerp = (a, b, u) => a + (b - a) * u;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** `from` から `to` の方へ `len` だけ進んだ所（行きすぎない） */
export const toward = (from, to, len) => {
  const u = Math.min(1, len / Math.max(dist2(from, to), 0.1));
  return [lerp(from[0], to[0], u), lerp(from[1], to[1], u)];
};

/**
 * グラウンドの中へ寄せる（外野フェンス・ファウルゾーンの壁・バックネットから `margin` 手前まで）。
 * ⚠ 壁の形は `motionStadium.js` の `rim` と同じ（ファウルゾーンの幅は本塁の横で19m、ポールの所で6m）
 */
export function inGround(p, margin = 2.5) {
  const [x, y] = p;
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x);
  const s = (ax + y) / Math.SQRT2; // 塁線に沿った距離
  const w = (ax - y) / Math.SQRT2; // 塁線から外（ファウル側）への距離
  if (w <= 0) {
    // フェアの中: フェンスの手前
    const r = Math.hypot(x, y);
    const max = fenceOf((Math.atan2(ax, y) * 180) / Math.PI) - margin;
    return r > max ? [(x * max) / r, (y * max) / r] : [x, y];
  }
  if (s <= 0) {
    // 本塁の後ろ: バックネットの手前
    const r = Math.hypot(x, y);
    const max = 19 - margin;
    return r > max ? [(x * max) / r, (y * max) / r] : [x, y];
  }
  const max = 6 + 13 * (1 - Math.min(100, s) / 100) - margin;
  if (w <= max) return [x, y];
  return [(sign * (s + max)) / Math.SQRT2, (s - max) / Math.SQRT2];
}
