// ============================================================
// 新しい見た目（試作）「動きで見る」: 夜の球場（動かない絵）を描く。
//
// 世界の絵（横640×縦480。`motionCamera.js`）を1度だけ描いて、カメラはその一部を映す。
// 奥から順に: 夜空（月・星・雲）→ 遠くの街の灯（山あいの土地は山並み）→ 照明塔 → 外野スタンドと客 →
// スコアボード → フェンス → 芝（刈り目の市松）と土 → 白線・塁 → 内野スタンド・ベンチ → 照明の光。
//
// ⚠ 表示専用。色は本拠地の球団（フェンス・スコアボード・一塁側と右翼の客）と相手（三塁側と左翼の客）。
// ⚠ 看板に実在の名前は入れない（距離の数字と、球団の頭文字だけ）。
// ============================================================
import { hash, rng } from './rng.js';
import { shade } from './art.js';
import { BASES, at, fenceOf } from './playMotion.js';
import { project, WORLD_W, WORLD_H } from './motionCamera.js';

const SQ = Math.SQRT1_2;
const MOUND = [0, 18.4];
/** スコアボード（球場の座標。中堅のスタンドの上） */
const BOARD = { x0: -27, x1: 27, y: fenceOf(0) + 37, z0: 17, z1: 37 };
/** 照明塔の向き */
const TOWERS = [-42, -17, 17, 42];

/** スコアボードの画面の四角 `[x, y, w, h]`（世界の絵の座標） */
export function scoreboardRect() {
  const a = project(BOARD.x0, BOARD.y, BOARD.z1);
  const b = project(BOARD.x1, BOARD.y, BOARD.z0);
  return [a[0], a[1], b[0] - a[0], b[1] - a[1]];
}

/** グラウンドの縁（外野フェンス → 一塁側の壁 → 本塁の後ろ → 三塁側の壁）。`[x, y, 外向きx, 外向きy]` */
function rim() {
  const out = [];
  for (let d = -45; d <= 45; d += 1.5) {
    const p = at(d, fenceOf(d));
    const n = at(d, 1);
    out.push([p[0], p[1], n[0], n[1]]);
  }
  const side = (sign) => {
    const pts = [];
    for (let s = 100; s >= 0; s -= 4) {
      const p = at(45 * sign, s);
      const w = 6 + 13 * (1 - s / 100);
      pts.push([p[0] + sign * SQ * w, p[1] - SQ * w, sign * SQ, -SQ]);
    }
    return pts;
  };
  const right = side(1);
  const back = [];
  for (let a = 141; a <= 219; a += 6) {
    const p = at(a, 19);
    const n = at(a, 1);
    back.push([p[0], p[1], n[0], n[1]]);
  }
  const left = side(-1).reverse();
  return { outfield: out, right, back, left, all: [...out, ...right, ...back, ...left] };
}

function path(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [sx, sy] = project(p[0], p[1], p[2] || 0);
    if (i) ctx.lineTo(sx, sy);
    else ctx.moveTo(sx, sy);
  });
  ctx.closePath();
}
function circle(cx, cy, r, n = 28) {
  return Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i * 2 * Math.PI) / n), cy + r * Math.sin((i * 2 * Math.PI) / n)]);
}

/** 夜空と遠景 */
function paintSky(ctx, r, scene) {
  const horizon = project(0, 4000, 0)[1];
  const sky = ctx.createLinearGradient(0, 0, 0, horizon + 30);
  sky.addColorStop(0, '#030716');
  sky.addColorStop(0.55, '#0a1330');
  sky.addColorStop(1, '#1b2a5a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  // 星
  for (let i = 0; i < 150; i++) {
    const x = r() * WORLD_W;
    const y = r() * (horizon - 6);
    const s = 0.35 + r() * 0.75;
    ctx.fillStyle = `rgba(255,255,255,${(0.25 + r() * 0.65) * (1 - (y / horizon) * 0.6)})`;
    ctx.fillRect(x, y, s, s);
  }
  // 月（左上）とにじみ
  const mx = 96;
  const my = 34;
  const halo = ctx.createRadialGradient(mx, my, 2, mx, my, 70);
  halo.addColorStop(0, 'rgba(220,230,255,0.35)');
  halo.addColorStop(1, 'rgba(220,230,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(mx - 70, my - 70, 140, 140);
  ctx.fillStyle = '#eef2ff';
  ctx.beginPath();
  ctx.arc(mx, my, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,175,215,0.35)';
  for (const [dx, dy, rr] of [
    [-3, -2, 2.2],
    [3, 2.5, 1.6],
    [1, -4, 1.1],
  ]) {
    ctx.beginPath();
    ctx.arc(mx + dx, my + dy, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  // 薄い雲
  for (let i = 0; i < 5; i++) {
    const cx = r() * WORLD_W;
    const cy = 22 + r() * (horizon - 50);
    const w = 70 + r() * 110;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w);
    g.addColorStop(0, 'rgba(120,140,200,0.10)');
    g.addColorStop(1, 'rgba(120,140,200,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.16);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = g;
    ctx.fillRect(cx - w, cy - w, w * 2, w * 2);
    ctx.restore();
  }
  // 地平線の下（スタンドの向こう）
  ctx.fillStyle = '#080e22';
  ctx.fillRect(0, horizon, WORLD_W, 80);
  if (scene === 'mountain') {
    // 山並み（奥は薄く、手前は濃く）
    for (const [base, amp, color] of [
      [horizon - 2, 26, '#16224a'],
      [horizon + 4, 16, '#0e1836'],
    ]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, horizon + 40);
      let y = base - amp * 0.5;
      for (let x = 0; x <= WORLD_W; x += 16) {
        y = Math.max(base - amp, Math.min(base, y + (r() - 0.5) * amp * 0.7));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(WORLD_W, horizon + 40);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // 海: 月の光の帯
    const sea = ctx.createLinearGradient(0, horizon, 0, horizon + 40);
    sea.addColorStop(0, '#12204a');
    sea.addColorStop(1, '#080e22');
    ctx.fillStyle = sea;
    ctx.fillRect(0, horizon, WORLD_W, 40);
    for (let i = 0; i < 26; i++) {
      const y = horizon + 1 + r() * 20;
      const w = 3 + r() * 12;
      ctx.fillStyle = `rgba(200,215,255,${0.05 + r() * 0.12})`;
      ctx.fillRect(mx - w / 2 + (r() - 0.5) * 22, y, w, 0.5);
    }
  }
  // 街の灯（暖かい色の点とにじみ）
  for (let i = 0; i < 170; i++) {
    const x = r() * WORLD_W;
    const y = horizon + 2 + r() * r() * 34;
    const warm = r() < 0.7;
    ctx.fillStyle = warm ? `rgba(255,214,150,${0.25 + r() * 0.5})` : `rgba(170,205,255,${0.25 + r() * 0.45})`;
    const s = 0.5 + r() * 1.1;
    ctx.fillRect(x, y, s, s);
  }
}

/** 照明塔（骨組みと灯の板）。光のにじみは最後に重ねる */
function towerSpots() {
  return TOWERS.map((d) => {
    const base = at(d, fenceOf(Math.max(-45, Math.min(45, d))) + 44);
    return { d, base, top: 52 };
  });
}
function paintTowers(ctx) {
  for (const t of towerSpots()) {
    const [x, y] = t.base;
    const foot = project(x, y, 14);
    const head = project(x, y, t.top - 5);
    const s = head[2];
    // 骨組み（2本の柱と筋交い）
    ctx.strokeStyle = '#2b3554';
    ctx.lineWidth = Math.max(0.5, s * 0.35);
    const w0 = s * 3.2;
    const w1 = s * 1.4;
    ctx.beginPath();
    ctx.moveTo(foot[0] - w0, foot[1]);
    ctx.lineTo(head[0] - w1, head[1]);
    ctx.moveTo(foot[0] + w0, foot[1]);
    ctx.lineTo(head[0] + w1, head[1]);
    for (let i = 0; i < 6; i++) {
      const u0 = i / 6;
      const u1 = (i + 1) / 6;
      const y0 = foot[1] + (head[1] - foot[1]) * u0;
      const y1 = foot[1] + (head[1] - foot[1]) * u1;
      const a0 = w0 + (w1 - w0) * u0;
      const a1 = w0 + (w1 - w0) * u1;
      ctx.moveTo(foot[0] - a0, y0);
      ctx.lineTo(foot[0] + a1, y1);
      ctx.moveTo(foot[0] + a0, y0);
      ctx.lineTo(foot[0] - a1, y1);
    }
    ctx.stroke();
    // 灯の板（本塁の方へ少し傾く）
    const pw = s * 17;
    const ph = s * 8.5;
    const px = head[0] - pw / 2 - (t.d / 42) * s * 2;
    const py = head[1] - ph;
    ctx.fillStyle = '#1a2238';
    ctx.fillRect(px - 0.6, py - 0.6, pw + 1.2, ph + 1.2);
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 7; col++) {
        ctx.fillStyle = '#fffbe6';
        ctx.fillRect(px + (col + 0.18) * (pw / 7), py + (row + 0.18) * (ph / 4), (pw / 7) * 0.64, (ph / 4) * 0.64);
      }
  }
}
function paintTowerGlow(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const t of towerSpots()) {
    const head = project(t.base[0], t.base[1], t.top - 1);
    const R = 60;
    const g = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], R);
    g.addColorStop(0, 'rgba(255,246,214,0.75)');
    g.addColorStop(0.12, 'rgba(255,240,200,0.32)');
    g.addColorStop(0.45, 'rgba(210,225,255,0.08)');
    g.addColorStop(1, 'rgba(210,225,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(head[0] - R, head[1] - R, R * 2, R * 2);
    // 横に流れる光の筋
    const streak = ctx.createLinearGradient(head[0] - 80, 0, head[0] + 80, 0);
    streak.addColorStop(0, 'rgba(255,246,214,0)');
    streak.addColorStop(0.5, 'rgba(255,246,214,0.5)');
    streak.addColorStop(1, 'rgba(255,246,214,0)');
    ctx.fillStyle = streak;
    ctx.fillRect(head[0] - 80, head[1] - 0.7, 160, 1.4);
    // グラウンドへ落ちる光の帯
    const aim = project(t.base[0] * 0.25, 55, 0);
    const beam = ctx.createLinearGradient(head[0], head[1], aim[0], aim[1]);
    beam.addColorStop(0, 'rgba(230,238,255,0.10)');
    beam.addColorStop(1, 'rgba(230,238,255,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(head[0] - 6, head[1]);
    ctx.lineTo(head[0] + 6, head[1]);
    ctx.lineTo(aim[0] + 90, aim[1]);
    ctx.lineTo(aim[0] - 90, aim[1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * スタンドの1段（縁から外へせり上がる斜面）と客。
 * @param line `[x, y, nx, ny]` の並び（縁の点と外向き）
 * @param o `{ z0, z1, depth, rows, gap, colors(i, u), fill, far }`
 * @param spots 光らせる席の置き場（`[x, y]` を足す）
 */
function paintTier(ctx, r, line, o, spots) {
  const at3 = (p, f) => [p[0] + p[2] * o.depth * f, p[1] + p[3] * o.depth * f, o.z0 + (o.z1 - o.z0) * f];
  // 斜面
  const inner = line.map((p) => at3(p, 0));
  const outer = line.map((p) => at3(p, 1)).reverse();
  path(ctx, [...inner, ...outer]);
  const top = project(...at3(line[Math.floor(line.length / 2)], 1));
  const bottom = project(...at3(line[Math.floor(line.length / 2)], 0));
  const g = ctx.createLinearGradient(0, top[1], 0, bottom[1]);
  g.addColorStop(0, '#0f1730');
  g.addColorStop(1, '#1d2946');
  ctx.fillStyle = o.fill || g;
  ctx.fill();
  // 客（奥の列から）
  for (let row = o.rows - 1; row >= 0; row--) {
    // 通路の列は空ける
    if (o.walk && row === o.walk) continue;
    const f = (row + 0.6) / o.rows;
    for (let i = 0; i < line.length - 1; i++) {
      const a = at3(line[i], f);
      const b = at3(line[i + 1], f);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(len / o.gap));
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        const x = a[0] + (b[0] - a[0]) * u;
        const y = a[1] + (b[1] - a[1]) * u;
        const [sx, sy, s] = project(x, y, a[2] + 0.45);
        if (sx < -4 || sx > WORLD_W + 4 || sy > WORLD_H + 4) {
          r();
          continue;
        }
        // 階段（縦の通路）と空席
        const seat = Math.round((i + u) * 7);
        if (o.stairs && seat % o.stairs === 0) continue;
        const roll = r();
        if (roll < (o.empty ?? 0.1)) {
          ctx.fillStyle = '#27334f';
          ctx.fillRect(sx - s * 0.3, sy - s * 0.3, s * 0.6, s * 0.5);
          continue;
        }
        const w = Math.max(0.55, s * 0.72);
        const h = Math.max(0.6, s * 0.85);
        ctx.fillStyle = o.colors(r, (i + u) / (line.length - 1));
        ctx.fillRect(sx - w / 2, sy - h * 0.55, w, h);
        // 頭
        ctx.fillStyle = roll > 0.6 ? '#e9c29c' : roll > 0.35 ? '#2a211b' : '#d3a67c';
        const hr = Math.max(0.42, s * 0.5);
        ctx.fillRect(sx - hr / 2, sy - h * 0.55 - hr * 0.85, hr, hr);
        if (spots && roll > 0.93) spots.push([sx, sy - h * 0.6]);
      }
    }
  }
}

/** 客の服の色を配る（球団の色が多い側と、そうでない側） */
function fanColors(own, other) {
  const plain = ['#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#475569', '#fde68a', '#fca5a5', '#bfdbfe'];
  return (r, ownShare) => {
    const v = r();
    if (v < ownShare * 0.62) return v < ownShare * 0.44 ? own.c1 : own.c2;
    if (v > 0.97) return other.c1;
    return plain[Math.floor(r() * plain.length)];
  };
}

/** 芝・土・白線・塁 */
function paintGround(ctx, r, R, home) {
  const ground = R.all.map((p) => [p[0], p[1]]);
  ctx.save();
  path(ctx, ground);
  ctx.fillStyle = '#2c8a4a';
  ctx.fill();
  ctx.clip();
  // 刈り目（縦と横の帯を重ねて市松にする）
  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  for (let x = -140; x < 140; x += 14) {
    path(ctx, [
      [x, -30],
      [x + 7, -30],
      [x + 7, 140],
      [x, 140],
    ]);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,30,10,0.11)';
  for (let y = -28; y < 140; y += 14) {
    path(ctx, [
      [-140, y],
      [140, y],
      [140, y + 7],
      [-140, y + 7],
    ]);
    ctx.fill();
  }
  // フェンス際の土（ウォーニングトラック）
  const track = [];
  for (let d = -46; d <= 46; d += 2) track.push(at(d, fenceOf(Math.max(-45, Math.min(45, d))) + 2));
  for (let d = 46; d >= -46; d -= 2) track.push(at(d, fenceOf(Math.max(-45, Math.min(45, d))) - 4.6));
  path(ctx, track);
  ctx.fillStyle = '#9c6b45';
  ctx.fill();
  // ファウルゾーンの壁際の土
  for (const side of [R.right, R.left]) {
    path(ctx, [...side.map((p) => [p[0], p[1]]), ...side.map((p) => [p[0] - p[2] * 2.6, p[1] - p[3] * 2.6]).reverse()]);
    ctx.fill();
  }
  // 内野の土（マウンドを中心に半径29mの弧。塁線の外へ少しはみ出す）
  // 弧の端は塁線の少し外（ファウル側）で、本塁の方へまっすぐ戻る
  const dirt = [[0, -1.6]];
  for (let a = 74; a >= -74; a -= 3) {
    const rad = (a * Math.PI) / 180;
    dirt.push([MOUND[0] + 29 * Math.sin(rad), MOUND[1] + 29 * Math.cos(rad)]);
  }
  path(ctx, dirt);
  const dirtFill = ctx.createLinearGradient(0, project(0, 48, 0)[1], 0, project(0, -4, 0)[1]);
  dirtFill.addColorStop(0, '#b97f4f');
  dirtFill.addColorStop(1, '#c98e5a');
  ctx.fillStyle = dirtFill;
  ctx.fill();
  // 内野の芝（塁線の内側。四隅は塁のまわりの土で丸く欠ける）
  const inset = 2.1;
  const H = BASES[1][0];
  path(ctx, [
    [0, inset * Math.SQRT2],
    [H - inset * Math.SQRT2, H],
    [0, 2 * H - inset * Math.SQRT2],
    [-H + inset * Math.SQRT2, H],
  ]);
  ctx.fillStyle = '#2f9150';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let k = -40; k < 60; k += 6) {
    path(ctx, [
      [k, 0],
      [k + 3, 0],
      [k + 3 - 60, 60],
      [k - 60, 60],
    ]);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#c38a57';
  for (const [bx, by] of [BASES[1], BASES[2], BASES[3]]) {
    path(ctx, circle(bx, by, 3.7));
    ctx.fill();
  }
  // 本塁のまわりとマウンド
  path(ctx, circle(0, 0, 4.3));
  ctx.fill();
  path(ctx, circle(MOUND[0], MOUND[1], 2.9));
  ctx.fillStyle = '#cf965f';
  ctx.fill();
  path(ctx, circle(MOUND[0], MOUND[1] - 0.3, 1.5));
  ctx.fillStyle = '#d9a26b';
  ctx.fill();
  // 土の粒（踏み跡）
  for (let i = 0; i < 520; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 31;
    const px = MOUND[0] + d * Math.sin(a);
    const py = MOUND[1] + d * Math.cos(a);
    if (Math.abs(px) > py + 4) continue;
    const [sx, sy, s] = project(px, py, 0);
    ctx.fillStyle = r() < 0.5 ? 'rgba(90,50,20,0.16)' : 'rgba(255,225,180,0.14)';
    ctx.fillRect(sx, sy, s * 0.5, s * 0.16);
  }
  // 次の打者の円と、本塁の後ろの球団の印
  ctx.fillStyle = '#c38a57';
  for (const sx of [-11, 11]) {
    path(ctx, circle(sx, -6.5, 1.5, 18));
    ctx.fill();
  }
  // 照明の当たり方（内野は明るく、隅は暗く）
  const pool = project(0, 30, 0);
  const light = ctx.createRadialGradient(pool[0], pool[1], 20, pool[0], pool[1], 360);
  light.addColorStop(0, 'rgba(255,255,225,0.14)');
  light.addColorStop(0.45, 'rgba(255,255,225,0.03)');
  light.addColorStop(1, 'rgba(0,10,40,0.34)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.restore();

  // 白線（ファウルライン・打席・コーチの枠）
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 0.9;
  for (const d of [-45, 45]) {
    const a = project(...at(d, 1.2));
    const b = project(...at(d, fenceOf(d)));
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  for (const sx of [-1, 1]) {
    path(ctx, [
      [sx * 0.6, -0.95],
      [sx * 1.85, -0.95],
      [sx * 1.85, 1.3],
      [sx * 0.6, 1.3],
    ]);
    ctx.stroke();
    // コーチの枠
    const c = [BASES[sx > 0 ? 1 : 3][0] + sx * 5.5, BASES[1][1] - 3];
    path(ctx, [
      [c[0] - 1.6, c[1] - 3.2],
      [c[0] + 1.6, c[1] - 3.2],
      [c[0] + 1.6, c[1] + 3.2],
      [c[0] - 1.6, c[1] + 3.2],
    ]);
    ctx.globalAlpha = 0.45;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  path(ctx, [
    [-0.65, -2.5],
    [0.65, -2.5],
    [0.65, -0.95],
    [-0.65, -0.95],
  ]);
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  ctx.globalAlpha = 1;
  // 塁（厚みのある白い座布団）と本塁、投手板
  for (const [bx, by] of [BASES[1], BASES[2], BASES[3]]) {
    const bag = [
      [bx - 0.42, by],
      [bx, by + 0.42],
      [bx + 0.42, by],
      [bx, by - 0.42],
    ];
    path(ctx, bag);
    ctx.fillStyle = '#b8bec9';
    ctx.fill();
    path(
      ctx,
      bag.map((p) => [p[0], p[1], 0.12]),
    );
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  path(ctx, [
    [-0.3, 0.3],
    [0.3, 0.3],
    [0.3, 0],
    [0, -0.3],
    [-0.3, 0],
  ]);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  path(ctx, [
    [-0.42, MOUND[1] - 0.1],
    [0.42, MOUND[1] - 0.1],
    [0.42, MOUND[1] + 0.1],
    [-0.42, MOUND[1] + 0.1],
  ]);
  ctx.fill();
  // 本塁の後ろの芝に、本拠地の球団の印（地面に寝かせて描く）
  if (home.mono) {
    const c = project(0, -8.6, 0);
    ctx.save();
    ctx.translate(c[0], c[1]);
    ctx.scale(1, 0.36);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = home.c1;
    ctx.beginPath();
    ctx.arc(0, 0, c[2] * 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = home.c2;
    ctx.lineWidth = c[2] * 0.35;
    ctx.stroke();
    ctx.fillStyle = home.c2;
    ctx.font = `900 ${c[2] * ([...home.mono].length > 1 ? 3.4 : 4.8)}px LookGraduate, "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(home.mono, 0, c[2] * 0.3);
    ctx.restore();
  }
}

/** 外野フェンス（当てもの・黄色い線・距離の数字・ポール） */
function paintWall(ctx, home) {
  const H = 3.4;
  const base = shade(home.c1, -0.35);
  for (let d = -45; d < 45; d += 3) {
    const p0 = at(d, fenceOf(d));
    const p1 = at(d + 3, fenceOf(d + 3));
    path(ctx, [
      [p0[0], p0[1], 0],
      [p1[0], p1[1], 0],
      [p1[0], p1[1], H],
      [p0[0], p0[1], H],
    ]);
    // 当てものの継ぎ目が見えるよう、1枚おきに少し明るく
    ctx.fillStyle = Math.round(d / 3) % 2 ? base : shade(base, 0.07);
    ctx.fill();
  }
  // 上の縁（本塁打の線）
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let d = -45; d <= 45; d += 1.5) {
    const [sx, sy] = project(...at(d, fenceOf(d)), H);
    if (d === -45) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  // 距離の数字
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [d, text] of [
    [-41, '100'],
    [-22, '116'],
    [0, '122'],
    [22, '116'],
    [41, '100'],
  ]) {
    const [sx, sy, s] = project(...at(d, fenceOf(d)), H * 0.48);
    ctx.font = `700 ${s * 2.1}px LookNum, "Arial Narrow", Arial, sans-serif`;
    ctx.fillText(text, sx, sy);
  }
  // 球団の色の帯（左中間・右中間）
  for (const d0 of [-34, -12, 8, 30]) {
    const pts = [];
    for (let d = d0; d <= d0 + 5; d += 1) pts.push([...at(d, fenceOf(d)), H * 0.8]);
    for (let d = d0 + 5; d >= d0; d -= 1) pts.push([...at(d, fenceOf(d)), H * 0.2]);
    path(ctx, pts);
    ctx.fillStyle = home.c2;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // ポール
  ctx.strokeStyle = '#facc15';
  for (const d of [-45, 45]) {
    const a = project(...at(d, fenceOf(d)), 0);
    const b = project(...at(d, fenceOf(d)), 16);
    ctx.lineWidth = Math.max(0.9, a[2] * 0.3);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
}

/** ファウルゾーンの壁とベンチ */
function paintSideWalls(ctx, R, home, away) {
  const H = 1.4;
  for (const [side, look] of [
    [R.right, home],
    [R.left, away],
  ]) {
    path(ctx, [...side.map((p) => [p[0], p[1], 0]), ...side.map((p) => [p[0], p[1], H]).reverse()]);
    ctx.fillStyle = '#122a44';
    ctx.fill();
    ctx.strokeStyle = shade(look.c1, 0.25);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    side.forEach((p, i) => {
      const [sx, sy] = project(p[0], p[1], H);
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    });
    ctx.stroke();
    // ベンチ（壁に開いた暗い口・屋根・並んだ選手の頭）
    const sign = side === R.right ? 1 : -1;
    const spot = (s, up) => {
      const p = at(45 * sign, s);
      const w = 6 + 13 * (1 - s / 100) - 0.2;
      return [p[0] + sign * SQ * w, p[1] - SQ * w, up];
    };
    path(ctx, [spot(8, 0), spot(27, 0), spot(27, 2.3), spot(8, 2.3)]);
    ctx.fillStyle = '#060a14';
    ctx.fill();
    for (let s = 9.5; s < 26.5; s += 1.5) {
      const [sx, sy, k] = project(...spot(s, 1.1));
      ctx.fillStyle = look === home ? '#f1f5f9' : look.c1;
      ctx.fillRect(sx - k * 0.32, sy - k * 0.1, k * 0.64, k * 0.7);
      ctx.fillStyle = '#e9c29c';
      ctx.beginPath();
      ctx.arc(sx, sy - k * 0.35, k * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = look.c1;
      ctx.beginPath();
      ctx.arc(sx, sy - k * 0.42, k * 0.31, Math.PI, 0);
      ctx.fill();
    }
    path(ctx, [spot(7, 2.3), spot(28, 2.3), spot(28, 2.9), spot(7, 2.9)]);
    ctx.fillStyle = look.c1;
    ctx.fill();
    const roofOut = (s) => {
      const p = spot(s, 2.9);
      return [p[0] + sign * SQ * 3, p[1] - SQ * 3, 3.2];
    };
    path(ctx, [spot(7, 2.9), spot(28, 2.9), roofOut(28), roofOut(7)]);
    ctx.fillStyle = '#3a4662';
    ctx.fill();
  }
}

/** スコアボードの枠（中の字は場面ごとに `PlayMotion.jsx` が描く）と、その下の暗い幕 */
function paintBoard(ctx, home) {
  // バックスクリーン（打者の目に入る所は暗い緑の幕）
  const eye = [];
  for (let d = -7; d <= 7; d += 1) eye.push([...at(d, fenceOf(d) + 1.5), 3.4]);
  for (let d = 7; d >= -7; d -= 1) eye.push([...at(d, fenceOf(d) + 24), 16]);
  path(ctx, eye);
  ctx.fillStyle = '#0d2a22';
  ctx.fill();
  const [x, y, w, h] = scoreboardRect();
  // 支える柱
  ctx.fillStyle = '#1a2238';
  ctx.fillRect(x + w * 0.16, y + h, w * 0.05, h * 0.55);
  ctx.fillRect(x + w * 0.79, y + h, w * 0.05, h * 0.55);
  ctx.fillStyle = '#141b2e';
  ctx.fillRect(x - 2.5, y - 6, w + 5, h + 8.5);
  ctx.fillStyle = home.c1;
  ctx.fillRect(x - 2.5, y - 6, w + 5, 4.5);
  ctx.fillStyle = home.c2;
  ctx.fillRect(x - 2.5, y - 1.9, w + 5, 0.8);
  ctx.fillStyle = '#05080f';
  ctx.fillRect(x, y, w, h);
}

/**
 * 球場を描く。
 * @param ctx 世界の絵（640×480）の座標に合わせた canvas
 * @param home, away 球団の見た目
 * @param scene 'sea' | 'mountain'
 * @returns `{ spots }` 客席の光らせる所 `[x, y]`
 */
export function paintStadium(ctx, { home, away, scene = 'sea' }) {
  const r = rng(hash(`motion-stadium:${home.name || ''}:${away.name || ''}`));
  const R = rim();
  const spots = [];
  paintSky(ctx, r, scene);
  paintTowers(ctx);
  // 外野スタンド（右翼は本拠地、左翼は相手の色が多い）
  const homeFans = fanColors(home, away);
  const awayFans = fanColors(away, home);
  const wide = [];
  for (let d = -58; d <= 58; d += 1.5) {
    const c = Math.max(-45, Math.min(45, d));
    const p = at(d, fenceOf(c) + (Math.abs(d) > 45 ? (Math.abs(d) - 45) * 0.9 : 0));
    const n = at(d, 1);
    wide.push([p[0], p[1], n[0], n[1]]);
  }
  paintTier(
    ctx,
    r,
    wide,
    {
      z0: 3.6,
      z1: 25,
      depth: 34,
      rows: 24,
      gap: 1.05,
      walk: 11,
      empty: 0.08,
      colors: (rr, u) => (u > 0.56 ? homeFans(rr, 0.75) : u < 0.34 ? awayFans(rr, 0.6) : homeFans(rr, 0.3)),
    },
    spots,
  );
  // スタンドの上の縁と旗
  ctx.strokeStyle = '#2a3554';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  wide.forEach((p, i) => {
    const [sx, sy] = project(p[0] + p[2] * 34, p[1] + p[3] * 34, 26);
    if (i) ctx.lineTo(sx, sy);
    else ctx.moveTo(sx, sy);
  });
  ctx.stroke();
  for (let d = -54; d <= 54; d += 9) {
    if (Math.abs(d) < 12) continue;
    const c = Math.max(-45, Math.min(45, d));
    const p = at(d, fenceOf(c) + 34);
    const a = project(p[0], p[1], 26);
    const b = project(p[0], p[1], 32);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.fillStyle = (d > 0 ? home : away)[Math.round(d / 9) % 2 ? 'c1' : 'c2'];
    ctx.beginPath();
    ctx.moveTo(b[0], b[1]);
    ctx.lineTo(b[0] + a[2] * 3.2, b[1] + a[2] * 0.9);
    ctx.lineTo(b[0], b[1] + a[2] * 1.9);
    ctx.closePath();
    ctx.fill();
  }
  paintBoard(ctx, home);
  paintGround(ctx, r, R, home);
  paintWall(ctx, home);
  // 内野スタンド（一塁側は本拠地、三塁側は相手）
  for (const [side, fans, share] of [
    [R.right, homeFans, 0.7],
    [R.left, awayFans, 0.55],
  ]) {
    paintTier(ctx, r, side, { z0: 1.6, z1: 19, depth: 32, rows: 24, gap: 0.95, walk: 12, stairs: 17, empty: 0.1, colors: (rr) => fans(rr, share) }, spots);
  }
  paintSideWalls(ctx, R, home, away);
  paintTowerGlow(ctx);
  return { spots };
}
