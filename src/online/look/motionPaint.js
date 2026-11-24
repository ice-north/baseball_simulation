// ============================================================
// 新しい見た目（試作）「動きで見る」: 1コマを描く。
//
// `makeStage` で場面の用意（動き・カメラ・ユニフォームの色）をし、`paintFrame` が時間 t の絵を描く。
// 重ねる順: 球場（描き置き）→ スコアボードの字 → 客席のフラッシュ → 土ぼこり → 球の影 →
// 人（奥から）→ 球と尾 → 打った瞬間の光・花火 →
// 画面に貼る物（四隅の暗がり・右上の見取り図・打者の名札・点の「+1」・文字の帯）。
//
// ⚠ 動きの中身は `playMotion.js`、カメラは `motionCamera.js`、姿勢は `motionPose.js` が決める。
//    ここと `motionFigure.js`・`motionStadium.js` は描くだけ（React を知らない。検査や見本からも呼べる）。
// ============================================================
import { hash, rng } from './rng.js';
import { shade } from './art.js';
import { motionOf, sample, BASES, CONTACT, PITCH_RELEASE } from './playMotion.js';
import { cameraTrack, cameraAt, project, figureM, WORLD_W, WORLD_H, VIEW_W, VIEW_H, FIGURE_M } from './motionCamera.js';
import { actorsAt, holderAt, BATTER_BOX } from './motionPose.js';
import { drawFigure, kitOf } from './motionFigure.js';
import { paintStadium, scoreboardRect } from './motionStadium.js';

const HEAD_FONT = 'LookHead, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
const BODY_FONT = 'LookJP, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
const NUM_FONT = 'LookNum, "Arial Narrow", Arial, sans-serif';
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (v) => 1 - (1 - clamp01(v)) ** 3;
const backOut = (v) => {
  const u = clamp01(v) - 1;
  return 1 + 2.2 * u * u * u + 1.2 * u * u;
};

/** 角の丸い四角の道（`ctx.roundRect` は古い Safari に無い） */
function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- 球場の描き置き（試合ごとに1枚。2試合ぶんまで覚える） ----
const STADIUMS = new Map();
/**
 * 球場の絵（世界の絵を `scale` 倍で描いた canvas）。
 * @returns `{ canvas, spots }` | null（canvas が使えない所）
 */
export function stadiumOf({ home, away, scene, scale, tag = '' }) {
  if (typeof document === 'undefined') return null;
  // `tag` は字が読めたかどうか（読める前に描いた絵を使い回さない）
  const key = `${home.name}|${home.c1}|${home.mono}|${away.name}|${away.c1}|${scene}|${scale}|${tag}`;
  const hit = STADIUMS.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(WORLD_W * scale);
  canvas.height = Math.round(WORLD_H * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  const made = { canvas, ...paintStadium(ctx, { home, away, scene }) };
  if (STADIUMS.size >= 2) STADIUMS.delete(STADIUMS.keys().next().value);
  STADIUMS.set(key, made);
  return made;
}

/**
 * 場面の用意。
 * @param scene `liveScenes` の1つ、`before` その前の塁
 * @param home, away 球団の見た目（`teamLook`）。`names` は `{ home, away }` スコアボードの短い名前
 */
export function makeStage({ scene, before, home, away, names }) {
  const motion = motionOf(scene, before);
  const offenseHome = scene.offense === 'home';
  const off = offenseHome ? home : away;
  const def = offenseHome ? away : home;
  const kits = {
    fielder: kitOf(def, !offenseHome, 'fielder'),
    pitcher: kitOf(def, !offenseHome, 'pitcher'),
    catcher: kitOf(def, !offenseHome, 'catcher'),
    runner: kitOf(off, offenseHome, 'runner'),
    coach: kitOf(off, offenseHome, 'coach'),
    umpire: kitOf(off, false, 'umpire'),
  };
  const r = rng(hash(`fx:${scene.inning}${scene.half}:${scene.batter?.name || ''}:${scene.code}`));
  // 花火（本塁打）: 上がる場所と色
  const homer = motion.events.find((e) => e.kind === 'homer');
  const fireworks = homer
    ? Array.from({ length: 6 }, (_, i) => ({
        t: homer.t + 0.15 + i * 0.38,
        x: 110 + r() * 420,
        y: 34 + r() * 70,
        color: [off.c2, '#fde68a', '#ffffff', shade(off.c1, 0.45), '#fca5a5', off.c2][i],
        seed: Math.floor(r() * 1e6),
      }))
    : [];
  return { scene, motion, camera: cameraTrack(motion), kits, off, def, home, away, names: names || { home: '', away: '' }, offenseHome, fireworks, seed: Math.floor(r() * 1e6) };
}

/** 絵の座標 → 画面（窓）の座標 */
const toView = (cam, p) => [(p[0] - cam.x) * cam.zoom + VIEW_W / 2, (p[1] - cam.y) * cam.zoom + VIEW_H / 2];

function paintBoardText(ctx, stage, t) {
  const { scene, motion, names, home, away } = stage;
  const [x, y, w, h] = scoreboardRect();
  const scored = motion.scoreTimes.filter((s) => s <= t).length;
  const score = { ...scene.scoreBefore };
  score[scene.offense] += scored;
  const outs = Math.min(scene.outs, scene.outsBefore + motion.marks.filter((m) => m.tone === 'out' && m.t <= t).length);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const row = h / 2;
  ctx.textBaseline = 'middle';
  [
    ['away', away, names.away],
    ['home', home, names.home],
  ].forEach(([side, look, name], i) => {
    const cy = y + row * (i + 0.5);
    ctx.fillStyle = look.c1;
    ctx.fillRect(x + 3, cy - row * 0.34, 3.2, row * 0.68);
    ctx.fillStyle = look.c2;
    ctx.fillRect(x + 6.2, cy - row * 0.34, 1, row * 0.68);
    // 攻撃中の側に印
    if (scene.offense === side) {
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.moveTo(x + 9.5, cy - 2.6);
      ctx.lineTo(x + 13, cy);
      ctx.lineTo(x + 9.5, cy + 2.6);
      ctx.fill();
    }
    ctx.fillStyle = '#e5e7eb';
    ctx.font = `700 ${row * 0.5}px ${BODY_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(name, x + 15, cy + 0.3, w * 0.4);
    ctx.fillStyle = '#fbbf24';
    ctx.font = `700 ${row * 0.78}px ${NUM_FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(String(score[side]), x + w * 0.66, cy + 0.6);
  });
  // 回とアウト
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.7, y + 3);
  ctx.lineTo(x + w * 0.7, y + h - 3);
  ctx.stroke();
  ctx.fillStyle = '#e5e7eb';
  ctx.textAlign = 'center';
  ctx.font = `700 ${row * 0.46}px ${BODY_FONT}`;
  ctx.fillText(`${scene.inning}回${scene.half === 't' ? '表' : '裏'}`, x + w * 0.85, y + row * 0.5);
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = i < outs ? '#ef4444' : '#27303f';
    ctx.beginPath();
    ctx.arc(x + w * 0.85 + (i - 0.5) * row * 0.52, y + row * 1.5, row * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 客席のフラッシュ（点が入った・本塁打のあと） */
function paintFlashes(ctx, stage, spots, t) {
  const { motion } = stage;
  let power = 0;
  for (const e of motion.events) {
    if (e.kind === 'homer' && t >= e.t) power = Math.max(power, 1 - clamp01((t - e.t - 2.4) / 1.2));
    if (e.kind === 'score' && t >= e.t) power = Math.max(power, 0.5 * (1 - clamp01((t - e.t - 0.6) / 0.8)));
  }
  if (power <= 0 || !spots.length) return;
  const frame = Math.floor(t * 14);
  const r = rng(stage.seed + frame * 7919);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const n = Math.round(46 * power);
  for (let i = 0; i < n; i++) {
    const [x, y] = spots[Math.floor(r() * spots.length)];
    const s = 0.7 + r() * 1.5;
    ctx.fillStyle = `rgba(255,255,240,${0.55 + r() * 0.45})`;
    ctx.fillRect(x - s / 2, y - s / 2, s, s);
    ctx.fillStyle = 'rgba(255,255,240,0.2)';
    ctx.fillRect(x - s * 1.6, y - 0.2, s * 3.2, 0.4);
  }
  ctx.restore();
}

/** 土ぼこり（弾んだ所・滑りこんだ塁） */
function paintDust(ctx, stage, t) {
  for (const e of stage.motion.events) {
    if (e.kind !== 'bounce' && e.kind !== 'slide') continue;
    const life = e.kind === 'slide' ? 0.85 : 0.5;
    const age = t - e.t;
    if (age < 0 || age > life) continue;
    const u = age / life;
    const r = rng(hash(`dust:${e.t}:${e.x}`));
    const n = e.kind === 'slide' ? 9 : 5;
    const [sx, sy, s] = project(e.x, e.y, 0);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = (0.3 + r() * 1.3) * (e.kind === 'slide' ? 1.5 : 0.8) * easeOut(u);
      const rise = (0.2 + r() * 0.9) * u * (e.kind === 'slide' ? 1.3 : 0.7);
      ctx.fillStyle = `rgba(226,196,160,${0.55 * (1 - u)})`;
      ctx.beginPath();
      ctx.arc(sx + Math.cos(a) * d * s, sy + Math.sin(a) * d * s * 0.4 - rise * s, s * (0.25 + 0.55 * u) * (0.6 + r() * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** 球（影・尾・球）。野手が持っている間は描かない */
function paintBall(ctx, stage, t, zoom) {
  const { motion } = stage;
  if (holderAt(motion, t)) return;
  const b = sample(motion.ball, t);
  const [gx, gy, gs] = project(b[0], b[1], 0);
  ctx.fillStyle = `rgba(0,0,0,${0.38 - Math.min(0.24, b[2] * 0.012)})`;
  ctx.beginPath();
  ctx.ellipse(gx, gy, Math.max(gs * 0.4, 1 / zoom), Math.max(gs * 0.15, 0.4 / zoom), 0, 0, Math.PI * 2);
  ctx.fill();
  const [bx, by, bs] = project(b[0], b[1], b[2]);
  const rad = Math.max(bs * 0.36, 1.35 / zoom);
  // 尾（少し前の位置をつないで、先ほど細く薄く）
  const gold = motion.code === '本' && t > CONTACT;
  let prev = [bx, by];
  for (let k = 1; k <= 9; k++) {
    const tt = t - k * 0.022;
    if (tt < PITCH_RELEASE) break;
    const q = sample(motion.ball, tt);
    const [qx, qy] = project(q[0], q[1], q[2]);
    ctx.strokeStyle = gold ? `rgba(253,224,71,${0.5 * (1 - k / 10)})` : `rgba(255,255,255,${0.42 * (1 - k / 10)})`;
    ctx.lineWidth = rad * 1.7 * (1 - k / 11);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(prev[0], prev[1]);
    ctx.lineTo(qx, qy);
    ctx.stroke();
    prev = [qx, qy];
  }
  ctx.fillStyle = '#0b1220';
  ctx.beginPath();
  ctx.arc(bx, by, rad * 1.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(bx, by, rad, 0, Math.PI * 2);
  ctx.fill();
  if (rad * zoom > 2.4) {
    // 縫い目
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = rad * 0.22;
    ctx.beginPath();
    ctx.arc(bx - rad * 0.9, by, rad * 0.8, -0.8, 0.8);
    ctx.stroke();
  }
}

/** 打った瞬間の光・捕った輪 */
function paintSparks(ctx, stage, t) {
  for (const e of stage.motion.events) {
    const age = t - e.t;
    if (age < 0) continue;
    if (e.kind === 'contact' && age < 0.22) {
      const u = age / 0.22;
      const [sx, sy, s] = project(e.x, e.y, 1);
      const R = s * (e.big ? 3.4 : 2.2) * (0.5 + u);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,244,200,${1 - u})`;
      ctx.lineWidth = s * 0.28 * (1 - u) + 0.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + 0.3;
        const r0 = R * (i % 2 ? 0.35 : 0.2);
        const r1 = R * (i % 2 ? 0.75 : 1.15);
        ctx.moveTo(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0);
        ctx.lineTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1);
      }
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - u)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, R * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (e.kind === 'catch' && age < 0.3) {
      const u = age / 0.3;
      const [sx, sy, s] = project(e.x, e.y, e.z || 1.4);
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - u)})`;
      ctx.lineWidth = s * 0.2 * (1 - u) + 0.15;
      ctx.beginPath();
      ctx.arc(sx, sy, s * (0.5 + 1.8 * easeOut(u)), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** 花火（本塁打）。夜空に上がって開く */
function paintFireworks(ctx, stage, t) {
  if (!stage.fireworks.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const f of stage.fireworks) {
    const age = t - f.t;
    if (age < 0 || age > 1.7) continue;
    const r = rng(f.seed);
    if (age < 0.28) {
      // 上がる筋
      const u = age / 0.28;
      ctx.strokeStyle = 'rgba(255,240,200,0.8)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(f.x, f.y + 70 * (1 - u) + 10);
      ctx.lineTo(f.x, f.y + 70 * (1 - u));
      ctx.stroke();
      continue;
    }
    const u = (age - 0.28) / 1.42;
    const spread = easeOut(u * 1.6);
    const fade = 1 - clamp01((u - 0.45) / 0.55);
    const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 46);
    glow.addColorStop(0, `rgba(255,255,255,${0.16 * fade})`);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(f.x - 46, f.y - 46, 92, 92);
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + r() * 0.2;
      const len = (20 + r() * 20) * spread;
      const drop = 14 * u * u;
      const x = f.x + Math.cos(a) * len;
      const y = f.y + Math.sin(a) * len * 0.9 + drop;
      const x0 = f.x + Math.cos(a) * len * 0.78;
      const y0 = f.y + Math.sin(a) * len * 0.78 * 0.9 + drop * 0.8;
      ctx.globalAlpha = fade * (0.55 + r() * 0.45);
      ctx.strokeStyle = i % 3 ? f.color : '#ffffff';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** 文字の帯の色（調子ごと） */
function ribbonColors(tone, stage) {
  if (tone === 'out') return { fill: '#111827', bar: '#ef4444', text: '#ffffff' };
  if (tone === 'run') return { fill: '#f59e0b', bar: '#fef3c7', text: '#1c1917' };
  if (tone === 'walk') return { fill: '#1e3a5f', bar: '#7dd3fc', text: '#e0f2fe' };
  if (tone === 'error') return { fill: '#7c2d12', bar: '#fdba74', text: '#ffedd5' };
  return { fill: stage.off.c1, bar: stage.off.c2, text: '#ffffff' };
}

/** 大きな文字（斜めの帯が左から入る。本塁打は中央に大きく） */
function paintMarks(ctx, stage, t) {
  const live = stage.motion.marks.filter((m) => m.text && t >= m.t && t < m.t + (m.tone === 'homer' ? 3 : 1.5));
  if (!live.length) return;
  const m = live[live.length - 1];
  const age = t - m.t;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (m.tone === 'homer') {
    const pop = backOut(age / 0.35);
    const out = 1 - clamp01((age - 2.6) / 0.4);
    ctx.globalAlpha = clamp01(age / 0.12) * out;
    // ⚠ 球場全体が映る場面。上のスコアボードに重ねない
    ctx.translate(VIEW_W / 2, VIEW_H * 0.62);
    ctx.rotate(-0.05);
    ctx.scale(pop, pop);
    // 後ろの光の筋
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6 + age * 0.5;
      const g = ctx.createLinearGradient(0, 0, Math.cos(a) * 190, Math.sin(a) * 190);
      g.addColorStop(0, 'rgba(253,224,71,0.34)');
      g.addColorStop(1, 'rgba(253,224,71,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a - 0.09) * 190, Math.sin(a - 0.09) * 190);
      ctx.lineTo(Math.cos(a + 0.09) * 190, Math.sin(a + 0.09) * 190);
      ctx.fill();
    }
    ctx.restore();
    ctx.font = `900 50px ${HEAD_FONT}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#0b1220';
    ctx.strokeText(m.text, 0, 0);
    ctx.lineWidth = 5;
    ctx.strokeStyle = stage.off.c1;
    ctx.strokeText(m.text, 0, 0);
    const gold = ctx.createLinearGradient(0, -26, 0, 26);
    gold.addColorStop(0, '#fffbeb');
    gold.addColorStop(0.5, '#fde047');
    gold.addColorStop(1, '#f59e0b');
    ctx.fillStyle = gold;
    ctx.fillText(m.text, 0, 0);
    if (m.sub) {
      ctx.font = `900 20px ${HEAD_FONT}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#0b1220';
      ctx.strokeText(m.sub, 0, -48);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(m.sub, 0, -48);
    }
    ctx.restore();
    return;
  }
  const c = ribbonColors(m.tone, stage);
  const slide = backOut(age / 0.26);
  const out = clamp01((age - 1.25) / 0.25);
  ctx.globalAlpha = clamp01(age / 0.1) * (1 - out);
  ctx.font = `900 25px ${HEAD_FONT}`;
  const w = Math.max(150, ctx.measureText(m.text).width + 76);
  const h = 42;
  const cx = VIEW_W / 2 - (1 - slide) * 120 + out * 60;
  const cy = VIEW_H - 62;
  const skew = 14;
  const shape = (inset) => {
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + skew + inset, cy - h / 2 + inset);
    ctx.lineTo(cx + w / 2 + skew - inset, cy - h / 2 + inset);
    ctx.lineTo(cx + w / 2 - skew - inset, cy + h / 2 - inset);
    ctx.lineTo(cx - w / 2 - skew + inset, cy + h / 2 - inset);
    ctx.closePath();
  };
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.save();
  ctx.translate(3, 4);
  shape(0);
  ctx.fill();
  ctx.restore();
  shape(0);
  ctx.fillStyle = c.fill;
  ctx.fill();
  ctx.save();
  shape(0);
  ctx.clip();
  // 左の差し色と、上半分の照り
  ctx.fillStyle = c.bar;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2 - skew, cy - h / 2);
  ctx.lineTo(cx - w / 2 + skew + 13, cy - h / 2);
  ctx.lineTo(cx - w / 2 - skew + 13, cy + h / 2);
  ctx.lineTo(cx - w / 2 - skew - 14, cy + h / 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(cx - w, cy - h / 2, w * 2, h * 0.46);
  ctx.restore();
  shape(0);
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = c.text;
  ctx.fillText(m.text, cx + 8, cy + 1.5);
  ctx.restore();
}

/** 打者の名札（投球の前だけ） */
function paintNameTag(ctx, stage, cam, t) {
  const name = stage.scene.batter?.name;
  if (!name || !stage.motion.batter) return;
  const alpha = clamp01(t / 0.25) * (1 - clamp01((t - (CONTACT - 0.15)) / 0.2));
  if (alpha <= 0) return;
  const p = project(BATTER_BOX[0], BATTER_BOX[1], FIGURE_M + 0.5);
  const [vx, vy] = toView(cam, p);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 12px ${BODY_FONT}`;
  const w = ctx.measureText(name).width + 20;
  const x = Math.max(6, Math.min(VIEW_W - w - 6, vx - w / 2 - 26));
  const y = Math.max(6, vy - 22);
  ctx.fillStyle = 'rgba(11,18,32,0.82)';
  rounded(ctx, x, y, w, 20, 4);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = stage.off.c2;
  ctx.fillRect(x, y, 4, 20);
  ctx.restore();
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x + 11, y + 10.5);
  ctx.restore();
}

/** 点が入った時に本塁から上がる「+1」 */
function paintScorePops(ctx, stage, cam, t) {
  const p = toView(cam, project(0, 0, 2.5));
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 22px ${NUM_FONT}`;
  ctx.lineJoin = 'round';
  for (const st of stage.motion.scoreTimes) {
    const age = t - st;
    if (age < 0 || age > 1) continue;
    ctx.globalAlpha = clamp01(age / 0.1) * (1 - clamp01((age - 0.65) / 0.35));
    const y = p[1] - 14 - 26 * easeOut(age);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#0b1220';
    ctx.strokeText('+1', p[0], y);
    ctx.fillStyle = '#fde047';
    ctx.fillText('+1', p[0], y);
  }
  ctx.restore();
}

/**
 * 右上の小さな見取り図（内野・走者・球）。カメラが外野へ行っている間も、走者がどこまで進んだか分かる。
 * @param actors `actorsAt` の返り値（打者と走者だけ使う）
 */
function paintRadar(ctx, stage, actors, t) {
  const W = 62;
  const H = 56;
  const x0 = VIEW_W - W - 8;
  const y0 = 8;
  const K = 0.98;
  const at = (x, y) => [x0 + W / 2 + x * K, y0 + H - 9 - y * K];
  ctx.save();
  ctx.fillStyle = 'rgba(9,14,28,0.72)';
  rounded(ctx, x0, y0, W, H, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.clip();
  // 内野（芝のひし形と走る道）
  ctx.beginPath();
  [0, 1, 2, 3].forEach((b, i) => {
    const [px, py] = at(BASES[b][0], BASES[b][1]);
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = '#2f7d4a';
  ctx.fill();
  ctx.strokeStyle = '#c08552';
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.stroke();
  for (let b = 0; b <= 3; b++) {
    const [px, py] = at(BASES[b][0], BASES[b][1]);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(px, py - 2.6);
    ctx.lineTo(px + 2.6, py);
    ctx.lineTo(px, py + 2.6);
    ctx.lineTo(px - 2.6, py);
    ctx.fill();
  }
  // 球（内野にある間）
  if (t >= PITCH_RELEASE) {
    const b = sample(stage.motion.ball, t);
    const [bx, by] = at(b[0], b[1]);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bx, by, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // 打者と走者（どの球団でも芝の上で見える黄色）
  for (const a of actors) {
    if (a.kit !== 'off' || a.key === 'deck') continue;
    const [px, py] = at(a.pos[0], a.pos[1]);
    ctx.globalAlpha = a.alpha;
    ctx.fillStyle = '#fde047';
    ctx.strokeStyle = '#0b1220';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(px, py, 3.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// 四隅を暗くする輪（毎コマ作らず、絵ごとに1つ）
const vignettes = new WeakMap();
function vignetteOf(ctx) {
  let vg = vignettes.get(ctx);
  if (!vg) {
    vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.52, VIEW_H * 0.42, VIEW_W / 2, VIEW_H * 0.52, VIEW_W * 0.68);
    vg.addColorStop(0, 'rgba(3,7,20,0)');
    vg.addColorStop(1, 'rgba(3,7,20,0.5)');
    vignettes.set(ctx, vg);
  }
  return vg;
}

/**
 * 時間 t の絵を描く。
 * @param ctx 画面の canvas（幅 `width` 画素。縦は 9/16）
 * @param stadium `stadiumOf` の返り値
 */
export function paintFrame(ctx, stage, stadium, t, width) {
  const { motion } = stage;
  const S = width / VIEW_W;
  const cam = cameraAt(stage.camera, t);
  // 強い当たりで画面が少しゆれる
  let shakeX = 0;
  let shakeY = 0;
  const hitE = motion.events.find((e) => e.kind === 'contact' && e.big && t >= e.t && t < e.t + 0.22);
  if (hitE) {
    const k = 1 - (t - hitE.t) / 0.22;
    shakeX = Math.sin(t * 90) * 2.2 * k;
    shakeY = Math.cos(t * 70) * 1.6 * k;
  }
  ctx.setTransform(S * cam.zoom, 0, 0, S * cam.zoom, S * (VIEW_W / 2 - cam.x * cam.zoom + shakeX), S * (VIEW_H / 2 - cam.y * cam.zoom + shakeY));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(stadium.canvas, 0, 0, WORLD_W, WORLD_H);
  paintBoardText(ctx, stage, t);
  paintFlashes(ctx, stage, stadium.spots, t);
  paintDust(ctx, stage, t);
  // 打者が置いたバット
  const batter = motion.runners.find((r) => r.start === 0);
  if (batter && batter.track.length > 1 && t > batter.track[1][0] + 0.15 && !motion.batter?.bunt) {
    const a = project(-2.3, 0.1, 0);
    const b = project(-1.35, 0.75, 0);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0b1220';
    ctx.lineWidth = a[2] * 0.2;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.strokeStyle = '#e2bd83';
    ctx.lineWidth = a[2] * 0.11;
    ctx.stroke();
  }
  // 人（奥から手前へ）
  const actors = actorsAt(motion, t, { offenseHome: stage.offenseHome }).sort((a, b) => b.pos[1] - a.pos[1]);
  for (const a of actors) {
    const [sx, sy, s] = project(a.pos[0], a.pos[1], 0);
    const h = s * figureM(a.pos[1]);
    const kit = a.kit === 'ump' ? stage.kits.umpire : a.kit === 'coach' ? stage.kits.coach : a.kit === 'off' ? stage.kits.runner : stage.kits[a.role] || stage.kits.fielder;
    drawFigure(ctx, sx, sy, h, kit, a.pose, { alpha: a.alpha, px: h * cam.zoom * S });
  }
  paintBall(ctx, stage, t, cam.zoom);
  paintSparks(ctx, stage, t);
  paintFireworks(ctx, stage, t);

  // ---- 画面に貼る物 ----
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.fillStyle = vignetteOf(ctx);
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // 本塁打が入った瞬間の光
  const homer = motion.events.find((e) => e.kind === 'homer');
  if (homer && t >= homer.t && t < homer.t + 0.35) {
    ctx.fillStyle = `rgba(255,250,220,${0.4 * (1 - (t - homer.t) / 0.35)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  paintRadar(ctx, stage, actors, t);
  paintNameTag(ctx, stage, cam, t);
  paintScorePops(ctx, stage, cam, t);
  paintMarks(ctx, stage, t);
}
