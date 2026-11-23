// ============================================================
// 新しい見た目（試作）: 「動きで見る」の絵。夜の球場を本塁の後ろの斜め上から見下ろし、
// 選手（球団の色の小さな人形）と球を `playMotion.js` の軌跡どおりに動かす。
//
// ⚠ 描くのは canvas。動きの中身（どこへ・いつ）は全部 `playMotion.js` が決め、ここは描くだけ。
// ⚠ 入のときだけ出す（呼ぶ側の `LivePlays` が見る）。動きを減らす設定の端末では最後の絵だけ出す。
// ============================================================
import React, { useEffect, useMemo, useRef } from 'react';
import { teamLook, NEUTRAL_LOOK } from './teamLook.js';
import { hash, rng } from './rng.js';
import { BASES, at, fenceOf, motionOf, sample } from './playMotion.js';

const W = 640;
const H = 360;
const FOCAL = 560;
const CY = 165;
const CAM = [0, -55, 50];
const TARGET = [0, 52, 0];
const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const norm = (a) => {
  const l = Math.hypot(...a);
  return a.map((x) => x / l);
};
const FWD = norm(sub(TARGET, CAM));
const UP = [0, -FWD[2], FWD[1]]; // [1,0,0] × FWD
/** 球場の点（x, y, 高さ z。メートル）→ 画面 [x, y, 1mの画素] */
function project(x, y, z = 0) {
  const v = sub([x, y, z], CAM);
  const zc = dot(v, FWD);
  return [W / 2 + (FOCAL * v[0]) / zc, CY - (FOCAL * dot(v, UP)) / zc, FOCAL / zc];
}
const BATTER_BOX = [-1.3, 0.2];
const SKIN = '#f0c8a0';

function polygon(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y, z = 0], i) => {
    const [sx, sy] = project(x, y, z);
    if (i) ctx.lineTo(sx, sy);
    else ctx.moveTo(sx, sy);
  });
  ctx.closePath();
}

/** 動かない物（空・スタンド・照明・グラウンド）。本拠地の色でフェンス */
function drawStadium(ctx, fence) {
  const r = rng(hash(`motion:${fence.name || ''}`));
  const sky = ctx.createLinearGradient(0, 0, 0, 170);
  sky.addColorStop(0, '#040817');
  sky.addColorStop(1, '#1c2b58');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.5})`;
    ctx.fillRect(r() * W, r() * 70, 1.2, 1.2);
  }
  // ファウルグラウンド（スタンドの下の両脇まで）
  polygon(ctx, [[-260, -50], [260, -50], [260, 260], [-260, 260]]);
  ctx.fillStyle = '#245f3c';
  ctx.fill();
  // スタンド（フェンスの外の斜面）と客
  const arc = (rad, z, from = -52, to = 52) => {
    const pts = [];
    for (let d = from; d <= to; d += 2) pts.push([...at(d, fenceOf(Math.max(-45, Math.min(45, d))) + rad), z]);
    return pts;
  };
  polygon(ctx, [...arc(0, 2.6), ...arc(40, 26).reverse()]);
  ctx.fillStyle = '#121a30';
  ctx.fill();
  const crowd = ['#e2e8f0', fence.c1, fence.c2, '#f8d7a8', '#94a3b8'];
  for (let i = 0; i < 900; i++) {
    const d = -52 + r() * 104;
    const k = r();
    const [sx, sy, s] = project(...at(d, fenceOf(Math.max(-45, Math.min(45, d))) + 3 + k * 35), 3 + k * 22);
    ctx.fillStyle = crowd[Math.floor(r() * crowd.length)];
    ctx.globalAlpha = 0.35 + r() * 0.4;
    ctx.fillRect(sx, sy, Math.max(1, s * 0.9), Math.max(1, s * 0.9));
  }
  ctx.globalAlpha = 1;
  // 照明塔（光の輪）
  for (const d of [-58, -24, 24, 58]) {
    const base = at(d, fenceOf(Math.max(-45, Math.min(45, d))) + 42);
    const [bx, by] = project(...base, 20);
    const [tx, ty, s] = project(...base, 48);
    ctx.strokeStyle = '#2a3554';
    ctx.lineWidth = Math.max(1.5, s * 1.2);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    const glow = ctx.createRadialGradient(tx, ty, 0, tx, ty, 46);
    glow.addColorStop(0, 'rgba(255,248,220,0.95)');
    glow.addColorStop(0.15, 'rgba(255,240,190,0.55)');
    glow.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(tx - 46, ty - 46, 92, 92);
    ctx.fillStyle = '#fffbe8';
    ctx.fillRect(tx - s * 4, ty - s * 2, s * 8, s * 4);
  }
  // 芝（扇）と縞
  const fan = [[0, -3]];
  for (let d = -45; d <= 45; d += 3) fan.push(at(d, fenceOf(d)));
  ctx.save();
  polygon(ctx, fan);
  ctx.fillStyle = '#2d8a4b';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#34985a';
  for (let x = -96; x < 96; x += 16) polygon(ctx, [[x, -5], [x + 8, -5], [x + 8, 130], [x, 130]]), ctx.fill();
  // 外野の土（フェンス際）
  const track = [];
  for (let d = -46; d <= 46; d += 3) track.push(at(d, fenceOf(Math.max(-45, Math.min(45, d))) - 5));
  for (let d = 46; d >= -46; d -= 3) track.push(at(d, fenceOf(Math.max(-45, Math.min(45, d))) + 1));
  polygon(ctx, track);
  ctx.fillStyle = '#9a6a45';
  ctx.fill();
  ctx.restore();
  // 内野の土（マウンドを中心に半径29mの弧）と内野の芝
  const dirt = [[0, -4]];
  for (let d = -45; d <= 45; d += 3) {
    const rad = (d * Math.PI) / 180;
    const s = 18.4 * Math.sin(rad);
    dirt.push(at(d, 18.4 * Math.cos(rad) + Math.sqrt(29 * 29 - s * s)));
  }
  polygon(ctx, dirt);
  ctx.fillStyle = '#c08552';
  ctx.fill();
  polygon(ctx, [[0, 3.5], at(45, 24.5), at(0, 35.5), at(-45, 24.5)]);
  ctx.fillStyle = '#34985a';
  ctx.fill();
  polygon(ctx, Array.from({ length: 16 }, (_, i) => [2.7 * Math.cos((i * Math.PI) / 8), 18.4 + 2.7 * Math.sin((i * Math.PI) / 8)]));
  ctx.fillStyle = '#c08552';
  ctx.fill();
  // ファウルライン
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.2;
  for (const d of [-45, 45]) {
    const [x0, y0] = project(0, 0);
    const [x1, y1] = project(...at(d, fenceOf(d)));
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  // フェンス（本拠地の色）
  const wallBottom = [];
  const wallTop = [];
  for (let d = -45; d <= 45; d += 3) {
    const p = at(d, fenceOf(d));
    wallBottom.push([...p, 0]);
    wallTop.push([...p, 3]);
  }
  polygon(ctx, [...wallBottom, ...wallTop.reverse()]);
  ctx.fillStyle = fence.c1;
  ctx.fill();
  ctx.strokeStyle = fence.c2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  wallTop.forEach((p, i) => {
    const [sx, sy] = project(...p);
    if (i) ctx.lineTo(sx, sy);
    else ctx.moveTo(sx, sy);
  });
  ctx.stroke();
  // 塁と本塁
  ctx.fillStyle = '#ffffff';
  BASES.slice(1).forEach(([x, y]) => {
    polygon(ctx, [[x - 0.6, y], [x, y + 0.6], [x + 0.6, y], [x, y - 0.6]]);
    ctx.fill();
  });
  polygon(ctx, [[-0.45, 0.3], [0.45, 0.3], [0.45, 0], [0, -0.45], [-0.45, 0]]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  for (const sx of [-1, 1]) {
    polygon(ctx, [[sx * 0.7, -1], [sx * 1.9, -1], [sx * 1.9, 1.3], [sx * 0.7, 1.3]]);
    ctx.stroke();
  }
}

/** 人形（球団の色）。`run` は走っている足の向き、`bat` はバットの角度（null で持たない） */
function drawFigure(ctx, x, y, look, { run = 0, bat = null, alpha = 1, glove = false } = {}) {
  const [sx, sy, s] = project(x, y);
  const k = Math.max(5, s * 2.3);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(sx, sy, k * 0.42, k * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1b2236';
  ctx.lineWidth = Math.max(1.2, k * 0.17);
  ctx.lineCap = 'round';
  const step = Math.sin(run) * k * 0.18;
  ctx.beginPath();
  ctx.moveTo(sx - k * 0.13, sy - k * 0.75);
  ctx.lineTo(sx - k * 0.15 + step, sy - k * 0.05);
  ctx.moveTo(sx + k * 0.13, sy - k * 0.75);
  ctx.lineTo(sx + k * 0.15 - step, sy - k * 0.05);
  ctx.stroke();
  // 胴（ユニフォーム）と肩の線
  ctx.fillStyle = look.c1;
  ctx.beginPath();
  ctx.roundRect(sx - k * 0.32, sy - k * 1.42, k * 0.64, k * 0.72, k * 0.18);
  ctx.fill();
  ctx.fillStyle = look.c2;
  ctx.fillRect(sx - k * 0.32, sy - k * 0.86, k * 0.64, k * 0.1);
  // 顔と帽子
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(sx, sy - k * 1.66, k * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = look.c2;
  ctx.beginPath();
  ctx.arc(sx, sy - k * 1.72, k * 0.31, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(sx - k * 0.05, sy - k * 1.74, k * 0.42, k * 0.08);
  if (glove) {
    ctx.fillStyle = '#7c4a24';
    ctx.beginPath();
    ctx.arc(sx - k * 0.4, sy - k * 1.05, k * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
  if (bat != null) {
    const hx = sx + k * 0.25;
    const hy = sy - k * 1.15;
    ctx.strokeStyle = '#e8c48a';
    ctx.lineWidth = Math.max(1.5, k * 0.12);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx + Math.cos(bat) * k * 0.95, hy - Math.sin(bat) * k * 0.95);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** 大きな文字（「アウト」「ホームラン！」） */
function drawMark(ctx, mark, age) {
  const fade = Math.min(1, age * 6) * Math.max(0, Math.min(1, (1.3 - age) * 3));
  if (fade <= 0) return;
  const size = mark.small ? 22 : 34;
  ctx.globalAlpha = fade;
  ctx.font = `900 ${size}px "Dela Gothic One", "Zen Kaku Gothic New", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#0b1220';
  const y = mark.small ? 112 : 78;
  const pop = 1 + Math.max(0, 0.15 - age) * 2;
  ctx.save();
  ctx.translate(W / 2, y);
  ctx.scale(pop, pop);
  ctx.strokeText(mark.text, 0, 0);
  ctx.fillStyle = mark.tone === 'run' ? '#fca5a5' : mark.tone === 'out' ? '#f8fafc' : '#fde68a';
  ctx.fillText(mark.text, 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** 時間 t の絵 */
function drawFrame(ctx, bg, motion, t, offense, defense) {
  ctx.drawImage(bg, 0, 0, W, H);
  const actors = [];
  for (let n = 1; n <= 9; n++) {
    const tr = motion.fielders[n];
    const p = sample(tr, t);
    const prev = sample(tr, t - 0.05);
    const moving = Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 0.05;
    actors.push({ y: p[1], draw: () => drawFigure(ctx, p[0], p[1], defense, { run: moving ? t * 14 : 0, glove: n !== 2 }) });
  }
  for (const r of motion.runners) {
    if (r.appear != null && t < r.appear) continue;
    let alpha = 1;
    if (r.outAt != null && t > r.outAt + 0.5) alpha = Math.max(0, 1 - (t - r.outAt - 0.5) * 2);
    if (r.homeAt != null && t > r.homeAt + 0.3) alpha = Math.max(0, 1 - (t - r.homeAt - 0.3) * 2);
    if (alpha <= 0) continue;
    let p = sample(r.track, t);
    const prev = sample(r.track, t - 0.05);
    const moving = Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 0.05;
    let bat = null;
    if (r.start === 0 && motion.batter) {
      const left = r.track.length > 1 ? r.track[1][0] : Infinity;
      if (t < left) {
        p = BATTER_BOX;
        // 構え → 振る（0.15秒で回す）
        const sw = motion.batter.swingAt;
        const u = sw == null ? 0 : Math.max(0, Math.min(1, (t - sw) / 0.15));
        bat = 2.2 - u * 3.6;
      }
    }
    actors.push({ y: p[1], draw: () => drawFigure(ctx, p[0], p[1], offense, { run: moving ? t * 16 : 0, bat, alpha }) });
  }
  // 遠い順に描く
  actors.sort((a, b) => b.y - a.y).forEach((a) => a.draw());
  // 球（地面に影）
  const b = sample(motion.ball, t);
  if (b && t >= 0.3) {
    const [gx, gy, gs] = project(b[0], b[1], 0);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(gx, gy, Math.max(1.5, gs * 0.35), Math.max(0.8, gs * 0.14), 0, 0, Math.PI * 2);
    ctx.fill();
    const [bx, by, bs] = project(b[0], b[1], b[2]);
    // 尾（少し前の位置を薄く）
    for (const [lag, op] of [[0.12, 0.18], [0.06, 0.35]]) {
      const q = sample(motion.ball, t - lag);
      const [qx, qy, qs] = project(q[0], q[1], q[2]);
      ctx.fillStyle = `rgba(253,230,138,${op})`;
      ctx.beginPath();
      ctx.arc(qx, qy, Math.max(2.4, qs * 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(3, bs * 0.32), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // 文字はいちばん新しい1つ
  const live = motion.marks.filter((m) => m.t <= t && t < m.t + 1.3);
  if (live.length) drawMark(ctx, live[live.length - 1], t - live[live.length - 1].t);
}

/**
 * 「動きで見る」の絵。
 * @param scene `liveScenes` の1つ
 * @param before その場面の前の塁
 * @param speed 1 か 2
 * @param replayKey 変えると頭から
 * @param onDone 動きが終わったとき
 */
export default function PlayMotion({ scene, before, home, offenseTeam, defenseTeam, speed = 1, replayKey = 0, onDone }) {
  const canvasRef = useRef(null);
  const motion = useMemo(() => motionOf(scene, before), [scene, before]);
  const fence = teamLook(home) || NEUTRAL_LOOK;
  const offense = teamLook(offenseTeam) || NEUTRAL_LOOK;
  const defense = teamLook(defenseTeam) || NEUTRAL_LOOK;
  // 球場は場面が変わっても同じなので1度だけ描く
  const bg = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.scale(dpr, dpr);
    drawStadium(ctx, fence);
    return c;
  }, [fence]);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !bg) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      drawFrame(ctx, bg, motion, motion.duration, offense, defense);
      doneRef.current?.();
      return undefined;
    }
    let frame = 0;
    let start = null;
    let finished = false;
    const tick = (now) => {
      if (start == null) start = now;
      const t = Math.min(motion.duration, ((now - start) / 1000) * speed);
      drawFrame(ctx, bg, motion, t, offense, defense);
      if (t >= motion.duration) {
        if (!finished) {
          finished = true;
          doneRef.current?.();
        }
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [motion, bg, speed, replayKey, offense, defense]);
  return (
    <canvas
      ref={canvasRef}
      className="online-motion-canvas"
      width={W}
      height={H}
      role="img"
      aria-label={`動きで見る: ${scene.phrase || ''}`}
    />
  );
}
