// ============================================================
// 新しい見た目（試作）の絵: 球団マーク・選手の顔・調子の顔を**描く手順の一覧**で返す。
//
//   { box: [x, y, w, h], clip: { cx, cy, r } | null, items: [図形, …] }
//
//   図形は path / circle / ellipse / rect / text の5種類だけ。`c: true` の図形は clip の丸で切る。
//   色は '#rrggbb'、`op` は不透明度、`sw` は線の太さ。字はいつも中央ぞろえ（x が字の中心）。
//
// ⚠ SVG の文字列にしないのは、アプリ（Compose の Canvas）でも同じ一覧から描くため。
//    アプリの写しは `mobile/shared/.../LookArt.kt`。変えたら両方を直し、`mobile/tools/expect-look.mjs`
//    で期待値を書き出し直す（アプリの `LookTest` が、この一覧と字面まで同じかを確かめる）。
// ⚠ 乱数を引く回数は**年齢や調子で変えない**。条件の中で引くと、誕生日を境に
//    同じ選手の顔がまるごと別人になる（見本の作り方にあった穴）。
// ⚠ 座標は小数2桁に丸める（アプリと文字列で比べられるように）。
// ============================================================
import { hash, rng, pick } from './rng.js';

const r2 = (v) => Math.round(v * 100) / 100;

/** 色を暗く（k<0）・明るく（k>0）する */
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255];
  const f = (v) =>
    Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `#${ch.map((v) => f(v).toString(16).padStart(2, '0')).join('')}`;
}

// ---- 球団マーク（帽子のマーク） -----------------------------------------
function monoText(look, size, fill, stroke, sw, dy = 0) {
  const two = [...look.mono].length > 1;
  const jp = look.font === 'jp';
  const fs = two ? size * (jp ? 0.5 : 0.62) : jp ? size * 0.82 : size;
  return {
    t: 'text',
    x: 50,
    y: r2(50 + fs * (jp ? 0.36 : 0.35) + dy),
    size: r2(fs),
    font: look.font,
    fill,
    stroke,
    sw,
    text: look.mono,
    ls: two && !jp ? -2 : 0,
  };
}

/** 球団マーク（100×100） */
export function emblemArt(look) {
  const { c1, c2, c3, style } = look;
  const items = [];
  if (style === 'shield') {
    items.push({ t: 'path', d: 'M50 4 L90 16 Q90 64 50 96 Q10 64 10 16 Z', fill: c1, stroke: c2, sw: 4 });
    items.push({ t: 'path', d: 'M50 12 L82 21 Q82 60 50 87 Q18 60 18 21 Z', stroke: c3, sw: 1.5, op: 0.7 });
    items.push(monoText(look, 50, c3, c2, 4));
  } else if (style === 'diamond') {
    items.push({ t: 'path', d: 'M50 3 L97 50 L50 97 L3 50 Z', fill: c1, stroke: c2, sw: 4 });
    items.push({ t: 'path', d: 'M50 14 L86 50 L50 86 L14 50 Z', stroke: c3, sw: 1.5, op: 0.75 });
    items.push(monoText(look, 44, c3, c2, 4));
  } else if (style === 'script') {
    items.push({ t: 'circle', cx: 50, cy: 50, r: 47, fill: c1, stroke: c2, sw: 3 });
    items.push({ t: 'text', x: 51, y: 70, size: 66, font: look.font, fill: c2, stroke: shade(c1, -0.4), sw: 3, text: look.mono, ls: 0 });
  } else if (style === 'block' || style === 'slab') {
    // 帽子に直接縫った字（丸の地）
    items.push({ t: 'circle', cx: 50, cy: 50, r: 47, fill: c1, stroke: c3 === '#ffffff' ? c2 : c3, sw: 3 });
    items.push(monoText(look, 62, c2, c3, 3));
  } else {
    // circle: 二重の輪と両脇の点
    items.push({ t: 'circle', cx: 50, cy: 50, r: 47, fill: c1, stroke: c2, sw: 3 });
    items.push({ t: 'circle', cx: 50, cy: 50, r: 38, stroke: c2, sw: 1.5 });
    items.push(monoText(look, [...look.mono].length > 1 ? 52 : 46, c3, c2, 3, 2));
    items.push({ t: 'circle', cx: 17, cy: 50, r: 2.2, fill: c2 });
    items.push({ t: 'circle', cx: 83, cy: 50, r: 2.2, fill: c2 });
  }
  return { box: [0, 0, 100, 100], clip: null, items };
}

// ---- 選手・指導者の顔 ------------------------------------------------------
const SKINS = ['#f7dcc0', '#f3cfae', '#eec29b', '#e2ad84', '#cf9468', '#a8704a'];
const HAIRS = ['#1d1916', '#26201b', '#33271f', '#4a3426', '#6b4c33'];
const GREY = '#8a8580';
/** 番記者の背広 */
const SUIT = '#3f3f46';
const INK = '#2a211c';
/** 白髪になる見込み（年をとるほど。同じ人は一度白髪になれば戻らない） */
const greyChance = (age) => (age >= 55 ? 0.85 : age >= 45 ? 0.6 : age >= 36 ? 0.4 : 0);

/**
 * 選手の顔（見る枠は 12,11 から 76×76）。
 * @param seed 選手の id（名前は同名の別人がいるので使わない）
 * @param look 帽子の球団（`teamLook`。所属が無ければ `NEUTRAL_LOOK`）
 * @param level 調子（ゲームの段: 4 絶好調 … 0 絶不調、null は普通の顔）
 * @param suit 背広（番記者）。帽子の代わりに前髪、ユニフォームの代わりに背広とネクタイ（色は `look.c1`）。ひげは無し
 */
export function faceArt({ seed, look, age = 25, level = null, suit = false }) {
  const r = rng(hash(seed));
  // ⚠ 引く回数を固定する（上の注意）。並べた順に引く
  const skinRoll = r();
  const skinLight = pick(r, SKINS.slice(0, 4));
  const skinDark = pick(r, SKINS.slice(3));
  const hairPick = pick(r, HAIRS);
  const greyRoll = r();
  const jaw = 19 + r() * 4;
  const browType = Math.floor(r() * 4);
  const eyeType = Math.floor(r() * 4);
  const hairType = Math.floor(r() * 3);
  const glasses = r() < 0.1;
  const beardRoll = r();

  const skin = skinRoll < 0.85 ? skinLight : skinDark;
  const grey = greyRoll < greyChance(age);
  const hair = grey ? GREY : hairPick;
  const beard = suit
    ? ''
    : age >= 27 && beardRoll < 0.22
      ? 'beard'
      : age >= 24 && beardRoll < 0.4
        ? 'stubble'
        : age >= 30 && beardRoll < 0.5
          ? 'mustache'
          : '';
  // 見本は 0 が絶好調。ゲームは 4 が絶好調なので裏返す
  const cond = Number.isInteger(level) ? 4 - level : 2;
  const { c1, c2, c3 } = look;
  const cap = c1;
  const visor = shade(c1, -0.25);
  const skinD = shade(skin, -0.14);
  const J = r2(jaw);
  const L = (d) => r2(50 - J + d);
  const R = (d) => r2(50 + J + d);
  const items = [];
  const add = (item) => items.push({ ...item, c: true });

  items.push({ t: 'circle', cx: 50, cy: 49, r: 38, fill: shade(c1, 0.82) });
  // 首と体（ユニフォーム。番記者は背広）
  add({ t: 'rect', x: 43, y: 68, w: 14, h: 14, fill: skinD });
  if (suit) {
    add({ t: 'path', d: 'M10 104 Q12 82 36 77 L64 77 Q88 82 90 104 Z', fill: SUIT });
    add({ t: 'path', d: 'M39 77 L50 95 L61 77 Z', fill: '#ffffff' });
    add({ t: 'path', d: 'M48.4 79 L51.6 79 L52.6 91 L50 95 L47.4 91 Z', fill: c1 });
    add({ t: 'path', d: 'M36 77 L44 90 M64 77 L56 90', stroke: shade(SUIT, -0.35), sw: 1.2 });
  } else {
    add({ t: 'path', d: 'M10 104 Q12 82 36 77 L64 77 Q88 82 90 104 Z', fill: '#f6f3ec' });
    add({ t: 'path', d: 'M38 77 L50 90 L62 77', stroke: c1, sw: 3.2, join: 'round' });
    add({ t: 'path', d: 'M10 104 Q12 82 36 77', stroke: c2 === '#ffffff' || c2 === '#f8fafc' ? c1 : c2, sw: 2 });
    add({ t: 'path', d: 'M90 104 Q88 82 64 77', stroke: c2 === '#ffffff' || c2 === '#f8fafc' ? c1 : c2, sw: 2 });
  }
  // 後ろ髪・耳
  if (hairType === 2) add({ t: 'path', d: 'M28 42 Q24 62 32 66 L68 66 Q76 62 72 42 Z', fill: hair });
  add({ t: 'ellipse', cx: L(-1), cy: 57, rx: 4, ry: 6, fill: skin });
  add({ t: 'ellipse', cx: R(1), cy: 57, rx: 4, ry: 6, fill: skin });
  // 頭
  add({ t: 'path', d: `M${L(0)} 46 Q${L(0)} 79 50 80 Q${R(0)} 79 ${R(0)} 46 Z`, fill: skin });
  // もみあげ
  const sb = hairType === 0 ? 6 : 10;
  add({ t: 'path', d: `M${L(0)} 44 L${L(4)} 44 L${L(4)} ${46 + sb} Q${L(1)} ${46 + sb} ${L(0)} ${44 + sb} Z`, fill: hair });
  add({ t: 'path', d: `M${R(0)} 44 L${R(-4)} 44 L${R(-4)} ${46 + sb} Q${R(-1)} ${46 + sb} ${R(0)} ${44 + sb} Z`, fill: hair });
  // ひげ
  if (beard === 'beard') {
    add({ t: 'path', d: `M${L(1)} 60 Q${L(3)} 82 50 83 Q${R(-3)} 82 ${R(-1)} 60 Q${R(-4)} 76 50 77 Q${L(4)} 76 ${L(1)} 60 Z`, fill: hair, op: 0.9 });
    add({ t: 'path', d: 'M42 69 Q50 66 58 69 Q50 70 42 69 Z', fill: hair });
  } else if (beard === 'stubble') {
    add({ t: 'path', d: `M${L(1)} 62 Q${L(3)} 81 50 81 Q${R(-3)} 81 ${R(-1)} 62 Q${R(-4)} 74 50 75 Q${L(4)} 74 ${L(1)} 62 Z`, fill: hair, op: 0.22 });
  } else if (beard === 'mustache') {
    add({ t: 'path', d: 'M42 69.5 Q50 65.5 58 69.5 Q50 71 42 69.5 Z', fill: hair });
  }
  // 前髪（番記者）。分け目は髪の型で左・右・まん中
  if (suit) {
    const part = [44, 56, 50][hairType];
    // 頭の上（帽子が無いので、額から上も肌で描いてから前髪をのせる）
    add({ t: 'path', d: `M${L(0)} 48 Q${L(0)} 24 50 24 Q${R(0)} 24 ${R(0)} 48 Z`, fill: skin });
    add({ t: 'path', d: `M${L(-2)} 52 Q${L(-4)} 22 50 21 Q${R(4)} 22 ${R(2)} 52 Q${R(-1)} 40 ${part} 36 Q${L(1)} 40 ${L(-2)} 52 Z`, fill: hair });
  }
  // 帽子
  if (!suit) add({ t: 'path', d: `M${L(-3)} 45 Q${L(-3)} 19 50 18 Q${R(3)} 19 ${R(3)} 45 Z`, fill: cap });
  if (!suit) add({ t: 'path', d: 'M50 18 L50 45', stroke: shade(cap, -0.3), sw: 0.8, op: 0.6 });
  if (!suit) add({ t: 'circle', cx: 50, cy: 18.6, r: 2.3, fill: shade(cap, -0.3) });
  if (look.mono && !suit) {
    const two = [...look.mono].length > 1;
    const script = look.style === 'script';
    const size = look.font === 'jp' ? (two ? 8 : 11) : two ? 10 : script ? 17 : 14;
    add({ t: 'text', x: 50, y: script ? 40 : 38.5, size, font: look.font, fill: c2, stroke: c3, sw: 0.8, text: look.mono, ls: two && look.font !== 'jp' ? -0.5 : 0 });
  }
  if (!suit) {
    add({ t: 'path', d: `M${L(-6)} 45 Q50 39 ${R(6)} 45 Q${R(7)} 50 ${R(2)} 50.5 Q50 46 ${L(-2)} 50.5 Q${L(-7)} 50 ${L(-6)} 45 Z`, fill: visor });
    add({ t: 'path', d: `M${L(1)} 50.5 Q50 47 ${R(-1)} 50.5 L${R(-1)} 52.5 Q50 49.5 ${L(1)} 52.5 Z`, fill: '#000000', op: 0.12 });
  }
  // 眉
  const by = cond === 0 ? 52 : 53.5;
  const worried = cond >= 3;
  const sad = cond === 4;
  const browW = browType === 2 ? 2.6 : 1.8;
  const browInk = grey ? '#6a6560' : INK;
  const brow = (x1, y1, x2, y2, c) =>
    add({ t: 'path', d: `M${x1} ${r2(y1)} Q${r2((x1 + x2) / 2)} ${r2(c)} ${x2} ${r2(y2)}`, stroke: browInk, sw: browW, cap: 'round' });
  if (worried) {
    brow(36, by, 45, by - (sad ? 3 : 1.6), by - 1);
    brow(64, by, 55, by - (sad ? 3 : 1.6), by - 1);
  } else if (browType === 3) {
    brow(36, by - 1.2, 45, by + 0.8, by - 0.6);
    brow(64, by - 1.2, 55, by + 0.8, by - 0.6);
  } else if (browType === 1) {
    brow(36, by + 0.5, 45, by + 0.5, by - 2.2);
    brow(64, by + 0.5, 55, by + 0.5, by - 2.2);
  } else {
    brow(36, by, 45, by, by - 0.8);
    brow(64, by, 55, by, by - 0.8);
  }
  // 目
  const ey = 59;
  const eye = (cx) => {
    if (cond === 0) {
      add({ t: 'path', d: `M${r2(cx - 3.2)} ${ey + 0.8} Q${cx} ${ey - 3.2} ${r2(cx + 3.2)} ${ey + 0.8}`, stroke: INK, sw: 2, cap: 'round' });
    } else if (eyeType === 0) {
      add({ t: 'ellipse', cx, cy: ey, rx: 2.2, ry: 2.8, fill: INK });
      add({ t: 'circle', cx: r2(cx + 0.8), cy: ey - 1, r: 0.8, fill: '#ffffff' });
    } else if (eyeType === 1) {
      add({ t: 'circle', cx, cy: ey, r: 1.9, fill: INK });
    } else if (eyeType === 2) {
      add({ t: 'path', d: `M${r2(cx - 3.4)} ${ey} Q${cx} ${r2(ey - 2.4)} ${r2(cx + 3.4)} ${ey}`, stroke: INK, sw: 1.6, cap: 'round' });
      add({ t: 'circle', cx, cy: r2(ey + 0.2), r: 1.3, fill: INK });
    } else {
      add({ t: 'ellipse', cx, cy: ey, rx: 3, ry: 2.2, fill: '#ffffff' });
      add({ t: 'circle', cx, cy: ey, r: 1.7, fill: INK });
      add({ t: 'path', d: `M${r2(cx - 3.2)} ${r2(ey - 1.2)} Q${cx} ${ey - 3} ${r2(cx + 3.2)} ${r2(ey - 1.2)}`, stroke: INK, sw: 1 });
    }
  };
  eye(41);
  eye(59);
  // 目じりのしわ（33歳から）・ほうれい線（45歳から）
  if (age >= 33) add({ t: 'path', d: 'M33.5 58 l-2 -1 M33.5 60 l-2 1 M66.5 58 l2 -1 M66.5 60 l2 1', stroke: skinD, sw: 0.9 });
  if (age >= 45) add({ t: 'path', d: 'M43 64 Q40.5 68 42 71.5 M57 64 Q59.5 68 58 71.5', stroke: skinD, sw: 0.9 });
  if (glasses) {
    add({ t: 'circle', cx: 41, cy: 59, r: 5.6, stroke: '#2b2b2b', sw: 1.5 });
    add({ t: 'circle', cx: 59, cy: 59, r: 5.6, stroke: '#2b2b2b', sw: 1.5 });
    add({ t: 'path', d: 'M46.6 58.5 Q50 57 53.4 58.5', stroke: '#2b2b2b', sw: 1.5 });
  }
  // 鼻
  add({ t: 'path', d: 'M50 61 Q48 66 50.5 66.6', stroke: skinD, sw: 1.4, cap: 'round' });
  // ほお（若い選手と絶好調）
  if (age <= 22 || cond === 0) {
    add({ t: 'circle', cx: 35, cy: 66, r: 3.4, fill: '#ff8a80', op: 0.35 });
    add({ t: 'circle', cx: 65, cy: 66, r: 3.4, fill: '#ff8a80', op: 0.35 });
  }
  // 口
  const my = 72;
  if (cond === 0) {
    add({ t: 'path', d: `M42.5 ${my - 1.5} Q50 ${my - 2.5} 57.5 ${my - 1.5} Q56 ${my + 6} 50 ${my + 6} Q44 ${my + 6} 42.5 ${my - 1.5} Z`, fill: '#7a2a22' });
    add({ t: 'path', d: `M43.5 ${r2(my - 1.2)} Q50 ${my - 2} 56.5 ${r2(my - 1.2)} L56 ${r2(my + 0.8)} Q50 ${r2(my + 0.2)} 44 ${r2(my + 0.8)} Z`, fill: '#ffffff' });
  } else if (cond === 1) {
    add({ t: 'path', d: `M44 ${my - 1} Q50 ${my + 4} 56 ${my - 1}`, stroke: INK, sw: 1.7, cap: 'round' });
  } else if (cond === 2) {
    add({ t: 'path', d: `M45.5 ${r2(my + 0.5)} L54.5 ${r2(my + 0.5)}`, stroke: INK, sw: 1.7, cap: 'round' });
  } else if (cond === 3) {
    add({ t: 'path', d: `M45 ${my + 2} Q50 ${r2(my - 1.5)} 55 ${my + 2}`, stroke: INK, sw: 1.7, cap: 'round' });
  } else {
    add({ t: 'path', d: `M44 ${r2(my + 1.5)} q1.5 -2 3 0 t3 0 t3 0 t3 0`, stroke: INK, sw: 1.6, cap: 'round' });
  }
  // 汗（絶不調）・きらり（絶好調）は丸の外まで出す
  if (cond === 4) items.push({ t: 'path', d: 'M73 36 Q75 42 72 45 Q69 42 72 36 Z', fill: '#5ab4f0', stroke: '#ffffff', sw: 0.8 });
  if (cond === 0) items.push({ t: 'path', d: 'M76 20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z', fill: '#ffcf3f', stroke: '#ffffff', sw: 0.6 });
  return { box: [12, 11, 76, 76], clip: { cx: 50, cy: 49, r: 38 }, items };
}

// ---- 調子の顔（絵文字の代わり。24×24） --------------------------------------
/** 調子の色（ゲームの段: 0 絶不調 … 4 絶好調） */
export const CONDITION_FACE_COLORS = ['#8a6fd1', '#5d9cec', '#f2d54b', '#ffa93a', '#ff5a3c'];

export function conditionArt(level) {
  const c = CONDITION_FACE_COLORS[level] || '#94a3b8';
  const ink = '#2a1d14';
  const items = [];
  if (level === 4)
    items.push({ t: 'path', d: 'M12 0.5 Q15 3 13.5 5 Q16 4 16 2 Q19 6 15 7.5 L9 7.5 Q5 6 8 2 Q8 4.5 10.5 5 Q9 2.5 12 0.5 Z', fill: '#ffcf3f' });
  items.push({ t: 'circle', cx: 12, cy: 12.5, r: 10, fill: c, stroke: shade(c, -0.35), sw: 1 });
  const eyes = (y) => {
    items.push({ t: 'circle', cx: 9, cy: y, r: 1.3, fill: ink });
    items.push({ t: 'circle', cx: 15, cy: y, r: 1.3, fill: ink });
  };
  if (level === 4) {
    items.push({ t: 'path', d: 'M7 13 Q12 20 17 13 Z', fill: ink });
    items.push({ t: 'path', d: 'M7.5 9.5 q1.5 -2 3 0 M13.5 9.5 q1.5 -2 3 0', stroke: ink, sw: 1.3, cap: 'round' });
  } else if (level === 3) {
    eyes(9.5);
    items.push({ t: 'path', d: 'M8 13.5 Q12 17 16 13.5', stroke: ink, sw: 1.4, cap: 'round' });
  } else if (level === 2) {
    eyes(10);
    items.push({ t: 'path', d: 'M9 15 L15 15', stroke: ink, sw: 1.4, cap: 'round' });
  } else if (level === 1) {
    eyes(10);
    items.push({ t: 'path', d: 'M8.5 16 Q12 13 15.5 16', stroke: ink, sw: 1.4, cap: 'round' });
  } else {
    items.push({ t: 'path', d: 'M7.5 9 L10.5 10.5 M16.5 9 L13.5 10.5', stroke: ink, sw: 1.3, cap: 'round' });
    items.push({ t: 'path', d: 'M8 16 q1 -1.5 2 0 t2 0 t2 0 t2 0', stroke: ink, sw: 1.3, cap: 'round' });
    items.push({ t: 'path', d: 'M19.5 4 Q21.5 7.5 19.5 9 Q17.5 7.5 19.5 4 Z', fill: '#bfe3ff' });
  }
  return { box: [0, 0, 24, 24], clip: null, items };
}
