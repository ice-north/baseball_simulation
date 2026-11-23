// ============================================================
// 新しい見た目（試作）段3の絵: 今日の一戦の札の背景（夜の球場）と、打席速報の球場の図。
// 描く手順の一覧で返す（形は `art.js` と同じ。path / circle / ellipse / rect / text）。
//
// ⚠ 一覧にはぼかし（グラデーション）が無いので、空の色は帯を重ね、照明の光は薄い丸を重ねて出す。
// ⚠ アプリ（`mobile/shared/.../LookScene.kt`）に写してある。変えたら両方を直し、
//    `node mobile/tools/expect-look.mjs > mobile/shared/src/jvmTest/resources/look-expected.json`
//    で期待値を書き出し直す（答え合わせはアプリの `LookTest`）。
// ⚠ path の字に入れる数は r2 で丸める（アプリは小数2桁までの数しか Web と同じ字にできない。`jsNum`）。
// ⚠ 乱数を引く回数は客の入りで変えない（入りで客の数を変えると、星と旗の並びまで変わる）。
//    客は決まった数だけ引き、入りに応じて先頭から何人を描くかだけを変える。
// ============================================================
import { hash, rng, pick } from './rng.js';
import { shade } from './art.js';

const r2 = (v) => Math.round(v * 100) / 100;

/** 山あいの土地（球場の後ろを山にする）。ほかは海 */
const MOUNTAIN_CITIES = new Set([
  '旭川', '盛岡', '山形', '郡山', '宇都宮', '前橋', '高崎', '川越', '大宮', '八王子', '立川', '相模原',
  '甲府', '長野', '松本', '岐阜', '豊田', '岡崎', '奈良', '十勝', '会津', '上州', '武蔵', '多摩',
  '信州', '飛騨', '丹波', '但馬', '筑豊', '阿蘇', '霧島', '東大阪', '久留米',
]);
/** 球場の後ろの景色（'sea' 海・'mountain' 山）。土地の名前（漢字）から */
export const stadiumScene = (city) => (MOUNTAIN_CITIES.has(city) ? 'mountain' : 'sea');

/** 客の入り（0.35〜1）。順位が上・連勝中ほど入る。`rank` は1位が1 */
export function crowdLevel(rank, teams, streak = 0) {
  const n = Math.max(2, teams || 12);
  const byRank = rank ? 1 - (Math.min(n, Math.max(1, rank)) - 1) / (n - 1) : 0.5;
  const hot = Math.max(-3, Math.min(5, streak || 0)) * 0.04;
  return r2(Math.max(0.35, Math.min(1, 0.45 + byRank * 0.45 + hot)));
}

const STADIUM_W = 760;
const STADIUM_H = 300;
/** スタンドの上の縁の高さ（x の位置で） */
const standTop = (x) => {
  const t = (x - STADIUM_W / 2) / (STADIUM_W / 2);
  return 172 - 64 * (1 - t * t);
};
const CROWD_MAX = 420;

/**
 * 夜の球場（760×300）。照明・旗・フェンスは本拠地の球団の色。
 * @param look 本拠地の球団の見た目（`teamLook`）
 * @param scene 'sea' | 'mountain'
 * @param crowd 客の入り（0〜1）
 */
export function stadiumArt({ look, scene = 'sea', crowd = 0.7, seed = '' }) {
  const W = STADIUM_W;
  const H = STADIUM_H;
  const r = rng(hash(`stadium:${seed || look.name}`));
  const items = [];
  // 空（下ほど明るい帯）
  items.push({ t: 'rect', x: 0, y: 0, w: W, h: H, fill: '#070d22' });
  for (let i = 0; i < 8; i++) items.push({ t: 'rect', x: 0, y: 40 + i * 14, w: W, h: 160, fill: '#2c3f73', op: 0.12 });
  for (let i = 0; i < 50; i++) {
    const cx = r2(r() * W);
    const cy = r2(r() * 95);
    const rad = r2(0.3 + r() * 1.1);
    items.push({ t: 'circle', cx, cy, r: rad, fill: '#ffffff', op: r2(0.3 + r() * 0.6) });
  }
  // 後ろの景色
  if (scene === 'mountain') {
    items.push({ t: 'path', d: 'M0 140 L90 84 L150 116 L240 60 L330 114 L420 78 L520 124 L620 72 L760 120 L760 160 L0 160 Z', fill: '#1a2550' });
    items.push({ t: 'path', d: 'M240 60 L258 72 L246 74 Z M620 72 L640 84 L626 86 Z M90 84 L104 93 L94 95 Z', fill: '#dfe6f5', op: 0.7 });
  } else {
    items.push({ t: 'path', d: 'M0 128 Q120 108 240 120 Q330 100 420 118 L420 140 L0 140 Z', fill: '#14204a' });
    items.push({ t: 'rect', x: 0, y: 128, w: W, h: 30, fill: '#0c1838' });
    for (let i = 0; i < 14; i++) {
      const x = r2(r() * W);
      const y = r2(132 + r() * 20);
      items.push({ t: 'rect', x, y, w: r2(10 + r() * 30), h: 1.2, fill: '#8fb3ff', op: 0.35 });
    }
    items.push({ t: 'rect', x: W - 120, y: 100, w: 6, h: 32, fill: '#dfe6f5' });
    items.push({ t: 'circle', cx: W - 117, cy: 98, r: 4, fill: '#fff6c0' });
    items.push({ t: 'path', d: `M${W - 117} 98 L${W + 40} 84 L${W + 40} 112 Z`, fill: '#fff6c0', op: 0.12 });
  }
  // スタンドと客。⚠ 客は CROWD_MAX 人ぶん乱数を引き、入りのぶんだけ描く
  items.push({ t: 'path', d: `M-20 ${H} L-20 ${r2(standTop(-20))} Q${W / 2} 44 ${W + 20} ${r2(standTop(W + 20))} L${W + 20} ${H} Z`, fill: '#1a2140' });
  items.push({ t: 'path', d: `M-20 ${r2(standTop(-20) + 12)} Q${W / 2} 56 ${W + 20} ${r2(standTop(W + 20) + 12)}`, stroke: look.c1, sw: 5 });
  const colors = [look.c1, look.c2, '#e2e8f0', '#94a3b8', shade(look.c1, 0.4), '#f87171'];
  const shown = Math.round(CROWD_MAX * Math.max(0, Math.min(1, crowd)));
  for (let i = 0; i < CROWD_MAX; i++) {
    const x = r() * W;
    const y = standTop(x) + 14 + r() * 40;
    const fill = pick(r, colors);
    if (i < shown) items.push({ t: 'circle', cx: r2(x), cy: r2(y), r: 1.6, fill, op: 0.85 });
  }
  // 旗（球団の2色を交互に）
  for (let i = 0; i <= 16; i++) {
    const x = r2(i * (W / 16));
    const y = r2(standTop(x) + 6);
    items.push({ t: 'path', d: `M${x} ${y} L${x} ${r2(y - 16)} L${r2(x + 11)} ${r2(y - 12)} L${x} ${r2(y - 8)}`, fill: i % 2 ? look.c1 : look.c2, stroke: '#1e293b', sw: 0.6 });
  }
  // 照明塔（光は薄い丸を重ねる）
  for (const [x, top] of [[70, 30], [200, 14], [W - 200, 14], [W - 70, 30]]) {
    items.push({ t: 'rect', x: x - 2, y: top + 20, w: 4, h: 190 - top, fill: '#2b3557' });
    for (let k = 0; k < 6; k++) items.push({ t: 'circle', cx: x, cy: top + 10, r: 72 - k * 11, fill: '#fff3b0', op: 0.045 });
    items.push({ t: 'rect', x: x - 18, y: top, w: 36, h: 20, fill: '#3a4770' });
    for (let a = 0; a < 4; a++) for (let b = 0; b < 2; b++) items.push({ t: 'circle', cx: r2(x - 13 + a * 8.6), cy: top + 5 + b * 9, r: 3, fill: '#fffbe0' });
  }
  // 外野フェンス（球団の色）・芝・内野
  items.push({ t: 'path', d: `M-20 228 Q${W / 2} 168 ${W + 20} 228 L${W + 20} 242 Q${W / 2} 182 -20 242 Z`, fill: look.c1 });
  items.push({ t: 'path', d: `M-20 228 Q${W / 2} 168 ${W + 20} 228`, stroke: look.c2, sw: 3 });
  items.push({ t: 'path', d: `M-20 242 Q${W / 2} 182 ${W + 20} 242 L${W + 20} ${H} L-20 ${H} Z`, fill: '#2f8f4e' });
  for (let i = 0; i < 5; i++)
    items.push({ t: 'path', d: `M-20 ${252 + i * 12} Q${W / 2} ${194 + i * 14} ${W + 20} ${252 + i * 12}`, stroke: '#ffffff', sw: 7, op: i % 2 ? 0.05 : 0.09 });
  const cx = W / 2;
  items.push({ t: 'path', d: `M${cx} ${H - 6} L${cx - 130} ${H - 42} L${cx} ${H - 78} L${cx + 130} ${H - 42} Z`, fill: '#c98b55' });
  items.push({ t: 'path', d: `M${cx} ${H - 18} L${cx - 96} ${H - 44} L${cx} ${H - 68} L${cx + 96} ${H - 44} Z`, fill: '#3a9a57' });
  items.push({ t: 'ellipse', cx, cy: H - 44, rx: 14, ry: 5, fill: '#c98b55' });
  items.push({ t: 'path', d: `M${cx} ${H - 6} L-40 ${H - 130} M${cx} ${H - 6} L${W + 40} ${H - 130}`, stroke: '#ffffff', sw: 1.6, op: 0.85 });
  for (const [x, y] of [[cx - 130, H - 42], [cx, H - 78], [cx + 130, H - 42]]) items.push({ t: 'rect', x: x - 4, y: y - 3, w: 8, h: 6, fill: '#ffffff' });
  items.push({ t: 'ellipse', cx, cy: H - 60, rx: 300, ry: 90, fill: '#ffffff', op: 0.05 });
  return { box: [0, 0, W, H], clip: null, items };
}

// ---- 打席速報の球場の図（160×136。左上が (20, 16)） --------------------------
// 本塁を (100, 142) に置き、1m を 0.95 目盛りで描く（中堅 122m のフェンスが上の端に収まる）
const HX = 100;
const HY = 142;
const M = 0.95;
const at = (dir, dist) => {
  const a = (dir * Math.PI) / 180;
  return [r2(HX + Math.sin(a) * dist * M), r2(HY - Math.cos(a) * dist * M)];
};
/** フェンスまでの距離（`simulation-logic.js` の `judgeFielderReach` と同じ形: 両翼100m・中堅122m） */
const fenceOf = (dir) => 100 + 22 * Math.cos((Math.abs(dir) * Math.PI) / 90);
const BASE_DIST = 27.43;

/**
 * 打席速報の球場の図。走者・打球の線と落ちた所を描く。
 * @param fence 本拠地の球団の見た目（フェンスの色）
 * @param offense 攻撃側の球団の見た目（走者の色）
 * @param bases 塁の走者（一塁＝1・二塁＝2・三塁＝4 の和）
 * @param batted 打球 `{ pos, dir, dist, la }` か null
 * @param code 打席の記号（本塁打はフェンスの外に落とす）
 * @param runs その打席で入った点
 */
export function fieldArt({ fence, offense, bases = 0, batted = null, code = '', runs = 0 }) {
  const items = [];
  items.push({ t: 'rect', x: 20, y: 16, w: 160, h: 136, fill: '#0b1220' });
  // 外野（フェンスの形の扇）
  const arc = [];
  for (let d = -45; d <= 45; d += 5) arc.push(at(d, fenceOf(d)));
  const arcPath = arc.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  items.push({ t: 'path', d: `M${HX} ${HY} ${arc.map(([x, y]) => `L${x} ${y}`).join(' ')} Z`, fill: '#2f8f4e' });
  items.push({ t: 'path', d: arcPath, stroke: fence.c1, sw: 4, join: 'round' });
  items.push({ t: 'path', d: arcPath, stroke: fence.c2, sw: 1, join: 'round' });
  // 内野（土・芝・マウンド）
  const b1 = at(45, BASE_DIST);
  const b2 = at(0, BASE_DIST * Math.SQRT2);
  const b3 = at(-45, BASE_DIST);
  const dirt = [at(45, 38), at(0, 50), at(-45, 38)];
  items.push({ t: 'path', d: `M${HX} ${HY + 4} L${dirt[0][0]} ${dirt[0][1]} Q${HX} ${r2(dirt[1][1] - 6)} ${dirt[2][0]} ${dirt[2][1]} Z`, fill: '#c98b55' });
  const g = [at(45, 22), at(0, 31), at(-45, 22)];
  items.push({ t: 'path', d: `M${HX} ${HY - 4} L${g[0][0]} ${g[0][1]} L${g[1][0]} ${g[1][1]} L${g[2][0]} ${g[2][1]} Z`, fill: '#3a9a57' });
  const mound = at(0, 18.4);
  items.push({ t: 'circle', cx: mound[0], cy: mound[1], r: 2.6, fill: '#c98b55' });
  // ファウルライン
  items.push({ t: 'path', d: `M${HX} ${HY} L${arc[0][0]} ${arc[0][1]} M${HX} ${HY} L${arc[arc.length - 1][0]} ${arc[arc.length - 1][1]}`, stroke: '#ffffff', sw: 0.8, op: 0.8 });
  // 塁（走者の居る塁は攻撃側の色の丸）
  [b1, b2, b3].forEach(([x, y], i) => {
    items.push({ t: 'path', d: `M${x} ${r2(y - 3.2)} L${r2(x + 3.2)} ${y} L${x} ${r2(y + 3.2)} L${r2(x - 3.2)} ${y} Z`, fill: '#ffffff' });
    if (bases & (1 << i)) items.push({ t: 'circle', cx: x, cy: r2(y - 1), r: 5.2, fill: offense.c2, stroke: offense.c1, sw: 1.6 });
  });
  items.push({ t: 'path', d: `M${HX - 3} ${HY - 1} L${HX + 3} ${HY - 1} L${HX + 3} ${HY + 1.5} L${HX} ${HY + 4} L${HX - 3} ${HY + 1.5} Z`, fill: '#ffffff' });
  // 打球（ゴロはまっすぐ、フライ・ライナーは弧）。落ちた所に球
  if (batted) {
    const home = code === '本';
    // 本塁打はフェンスのすぐ外（図の枠に収める）、ほかはフェンスの内側に落とす
    const wall = fenceOf(batted.dir);
    const dist = home ? wall + 7 : Math.min(batted.dist, wall - 2);
    const [x, y] = at(batted.dir, Math.max(8, dist));
    if (batted.la < 10) {
      items.push({ t: 'path', d: `M${HX} ${HY - 2} L${x} ${y}`, stroke: '#fde68a', sw: 1.6, cap: 'round' });
    } else {
      const lift = Math.min(60, 10 + batted.la * 0.8);
      const [mx, my] = at(batted.dir, Math.max(8, dist) / 2);
      items.push({ t: 'path', d: `M${HX} ${HY - 2} Q${mx} ${r2(my - lift)} ${x} ${y}`, stroke: '#fde68a', sw: 1.6, cap: 'round' });
    }
    items.push({ t: 'circle', cx: x, cy: y, r: 3.2, fill: '#ffffff', stroke: '#fde68a', sw: 1.2 });
  }
  if (runs > 0) {
    items.push({ t: 'rect', x: HX + 8, y: HY - 9, w: 26, h: 12, fill: '#f87171' });
    items.push({ t: 'text', x: HX + 21, y: HY + 0.5, size: 9, font: 'jp', fill: '#ffffff', text: `${runs}点` });
  }
  return { box: [20, 16, 160, 136], clip: null, items };
}
