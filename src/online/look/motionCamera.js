// ============================================================
// 新しい見た目（試作）「動きで見る」: 画面への写し方とカメラ。
//
// 球場は本塁の後ろの斜め上から見る（`project`）。絵は横640×縦480の「世界の絵」で、
// 画面（横640×縦360）はその一部を拡大して映す窓。カメラは窓の中心と倍率だけを動かす
// （望遠で寄る・振るのと同じ。球場の絵は1度描いたものを使い回せる）。
//
// ⚠ カメラは「球と、いま大事な人」が窓に収まるように決める（`poisAt`）。
//    投球は投手と打者に寄り、打球は球と捕る野手を追い、捕った後は走者と送球の先まで引く。
// ⚠ ここは計算だけ（canvas を触らない）。同じ場面はいつも同じカメラになる。
// ============================================================
import { BASES, CONTACT, FIELDER_HOME, sample } from './playMotion.js';

/** 世界の絵の大きさ */
export const WORLD_W = 640;
export const WORLD_H = 480;
/** 画面（窓）の大きさ */
export const VIEW_W = 640;
export const VIEW_H = 360;
/** 人形の高さ（m）。実物より大きく描く */
export const FIGURE_M = 2.9;

const FOCAL = 520;
const CX = WORLD_W / 2;
const CY = 296;
const CAM = [0, -64, 40];
const TARGET = [0, 58, 0];
const LEN = Math.hypot(TARGET[0] - CAM[0], TARGET[1] - CAM[1], TARGET[2] - CAM[2]);
const FY = (TARGET[1] - CAM[1]) / LEN;
const FZ = (TARGET[2] - CAM[2]) / LEN;

/** 球場の点（x, y, 高さ z。メートル）→ 世界の絵の [x, y, 1mの長さ] */
export function project(x, y, z = 0) {
  const vy = y - CAM[1];
  const vz = z - CAM[2];
  const depth = vy * FY + vz * FZ;
  const up = vy * -FZ + vz * FY;
  const k = FOCAL / depth;
  return [CX + x * k, CY - up * k, k];
}

const K_HOME = project(0, 0, 0)[2];
/**
 * 奥行き y にいる人形の高さ（m）。
 * ⚠ 遠近のままだと外野の人が本塁の人の4割の大きさになり、だれが捕ったか見えない。遠い人ほど少し大きく描く
 */
export const figureM = (y) => FIGURE_M * Math.max(1, Math.min(1.4, (K_HOME / project(0, y, 0)[2]) ** 0.32));

/** 倍率の幅 */
const ZOOM_MIN = 1;
const ZOOM_MAX = 2.8;
const STEP = 1 / 30;
/** 窓の縁からの余白（世界の絵の長さ） */
const PAD_X = 52;
const PAD_TOP = 40;
const PAD_BOTTOM = 30;

const moving = (track, t) => {
  if (!track || track.length < 2) return false;
  const a = sample(track, t - 0.12);
  const b = sample(track, t + 0.12);
  return Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.25;
};

/**
 * いま窓に収めたい点（球場の座標）。
 * @returns `{ pts: [[x, y, z]], ball: [x, y, z] | null }`（`ball` は窓から出してはいけない球）
 */
export function poisAt(motion, t) {
  const pts = [];
  const add = (x, y, z = 0) => pts.push([x, y, z]);
  const person = (x, y) => {
    add(x, y, 0);
    add(x, y, figureM(y));
  };
  const infield = () => {
    person(0, -2);
    person(FIELDER_HOME[1][0], FIELDER_HOME[1][1]);
  };
  // 投球まで: 投手と打者。走りだした走者（盗塁）も
  if (t < CONTACT) {
    infield();
    add(-3, 0);
    add(3, 0);
    for (const r of motion.runners) if (moving(r.track, t)) person(...sample(r.track, t));
    return { pts, ball: null };
  }
  const live = t < motion.settle + 0.3;
  const ball = sample(motion.ball, t);
  const homer = motion.events.find((e) => e.kind === 'homer');
  if (homer && t >= homer.t) {
    // 本塁打: 入った所と夜空（花火）をしばらく映し、あとは塁を回る走者へ寄る
    if (t < homer.t + 2.6) {
      add(homer.x, homer.y, 6);
      add(homer.x * 0.7, homer.y, 44);
      add(homer.x * 0.5, homer.y - 30, 0);
    } else {
      infield();
      for (let b = 1; b <= 3; b++) person(...BASES[b]);
    }
    return { pts, ball: null };
  }
  if (live) {
    add(ball[0], ball[1], ball[2]);
    add(ball[0], ball[1], 0);
  }
  const main = motion.main;
  const fielded = !main || t >= main.t - 0.25;
  // 打球を捕る野手
  if (main && t < main.t + 0.35) person(...sample(motion.fielders[main.fielder], t));
  // 送球の行き先
  for (const a of motion.acts) if (a.kind === 'throw' && t >= a.t - 0.3 && t <= a.until + 0.4) person(a.to[0], a.to[1]);
  // 走っている走者（内野の打球は初めから。外野の打球は捕ってから）
  const near = !main || Math.hypot(main.at[0], main.at[1]) < 48;
  if (live && (fielded || near)) for (const r of motion.runners) if (moving(r.track, t)) person(...sample(r.track, t));
  // 落ち着いた後: 内野と塁の走者
  if (!live) {
    infield();
    for (const r of motion.runners) if (r.target >= 1 && r.target <= 3) person(...BASES[r.target]);
  }
  return { pts, ball: live ? ball : null };
}

/** 点の並びを収める窓（中心と倍率） */
function frameOf(pts) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    const [sx, sy] = project(p[0], p[1], p[2]);
    x0 = Math.min(x0, sx);
    x1 = Math.max(x1, sx);
    y0 = Math.min(y0, sy);
    y1 = Math.max(y1, sy);
  }
  const w = x1 - x0 + PAD_X * 2;
  const h = y1 - y0 + PAD_TOP + PAD_BOTTOM;
  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, VIEW_W / w, VIEW_H / h));
  return { x: (x0 + x1) / 2, y: (y0 - PAD_TOP + y1 + PAD_BOTTOM) / 2, zoom };
}

/** 窓が世界の絵からはみ出さないようにする */
function inWorld(cam) {
  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom));
  const hw = VIEW_W / 2 / zoom;
  const hh = VIEW_H / 2 / zoom;
  return {
    x: Math.max(hw, Math.min(WORLD_W - hw, cam.x)),
    y: Math.max(hh, Math.min(WORLD_H - hh, cam.y)),
    zoom,
  };
}

/** 球が窓から出ないよう、窓を球の方へ寄せる（縁から `margin`） */
function keepBall(cam, ball, margin = 30) {
  const [bx, by] = project(ball[0], ball[1], ball[2]);
  const hw = VIEW_W / 2 / cam.zoom - margin / cam.zoom;
  const hh = VIEW_H / 2 / cam.zoom - margin / cam.zoom;
  return {
    x: Math.max(bx - hw, Math.min(bx + hw, cam.x)),
    y: Math.max(by - hh, Math.min(by + hh, cam.y)),
    zoom: cam.zoom,
  };
}

/** 場面の頭のカメラ（内野と、塁にいる走者） */
function restOf(motion) {
  const pts = [
    [0, -2, 0],
    [0, -2, FIGURE_M],
    [FIELDER_HOME[1][0], FIELDER_HOME[1][1], FIGURE_M],
  ];
  for (const r of motion.runners) if (r.start > 0) pts.push([BASES[r.start][0], BASES[r.start][1], 0], [BASES[r.start][0], BASES[r.start][1], FIGURE_M]);
  return inWorld(frameOf(pts));
}

/**
 * 場面のカメラの軌跡 `[t, x, y, 倍率]`（1/30秒ごと。なめらかに追う）。
 * `x`・`y` は窓の中心（世界の絵の座標）
 */
export function cameraTrack(motion) {
  const out = [];
  let cam = restOf(motion);
  // 頭は少し引いた所から寄る
  cam = inWorld({ ...cam, zoom: cam.zoom * 0.82 });
  for (let t = 0; t <= motion.duration + STEP; t += STEP) {
    const { pts, ball } = poisAt(motion, t);
    const want = inWorld(frameOf(pts));
    const kp = 1 - Math.exp(-STEP * 5.5);
    // 引くのは速く、寄るのはゆっくり
    const kz = 1 - Math.exp(-STEP * (want.zoom < cam.zoom ? 5 : 2.4));
    cam = { x: cam.x + (want.x - cam.x) * kp, y: cam.y + (want.y - cam.y) * kp, zoom: cam.zoom + (want.zoom - cam.zoom) * kz };
    if (ball) cam = keepBall(cam, ball);
    cam = inWorld(cam);
    out.push([t, cam.x, cam.y, cam.zoom]);
  }
  return out;
}

/** 時間 t のカメラ `{ x, y, zoom }` */
export function cameraAt(track, t) {
  const [x, y, zoom] = sample(track, t);
  return { x, y, zoom };
}

/** 球が窓の中にあるか（検査用） */
export function ballInView(cam, ball) {
  const [bx, by] = project(ball[0], ball[1], ball[2]);
  const vx = (bx - cam.x) * cam.zoom + VIEW_W / 2;
  const vy = (by - cam.y) * cam.zoom + VIEW_H / 2;
  return vx >= 0 && vx <= VIEW_W && vy >= 0 && vy <= VIEW_H;
}
