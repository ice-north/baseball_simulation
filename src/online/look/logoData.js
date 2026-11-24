// ============================================================
// 球団ロゴの保存の形と、受け取ったロゴの確かめ。
//
//   保存（`team.logo`）: { colors?: [地, 差し色, 縁], layers: [部品…], mini?: [部品…], rec?: レシピ }
//   ビュー（`teamLabels[球団].logo`）: 上に加えて colors を必ず持つ（選んでいなければ自動の色）。
//     ロゴを作っていない球団は「おまかせ」の1番目を載せ、`auto: 1` を付ける
//
// ⚠ **人が送ってくるものは全部ここを通す**（`membership.js` の `applyProfile`）。ロゴはほかの人の画面にも
//    出るので、知らない部品・桁外れの数・長い字をそのまま保存しない。直せるものは範囲に丸め、
//    直せないもの（知らない種類の部品）はその1枚を捨てる。
// ⚠ 既定の値（中心・等倍・回転なし・ふちなし）は保存しない。1枚がおよそ50バイトで済む。
// ============================================================
import {
  LOGO_SHAPES,
  LOGO_FONTS,
  LOGO_MAX_LAYERS,
  LOGO_MINI_MAX_LAYERS,
  LOGO_TEXT_MAX,
  isHexColor,
} from './logoParts.js';
import { isLogoIcon } from './logoMotifs.js';
import { normalRecipe } from './logoBuild.js';

/** 保存するロゴの大きさの上限（JSON の字数）。8枚＋小さい版4枚＋レシピでも 1.5KB に届かない */
export const LOGO_MAX_CHARS = 2400;

const num = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
};
/** 色: 球団の色の番号（0〜4）か '#rrggbb'。それ以外は `fallback` */
function color(v, fallback) {
  if (Number.isInteger(v) && v >= 0 && v <= 4) return v;
  const hex = typeof v === 'string' ? v.toLowerCase() : '';
  return isHexColor(hex) ? hex : fallback;
}
/** 字: 改行・制御文字を消して14字まで */
const text = (v) =>
  [...String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '')].slice(0, LOGO_TEXT_MAX).join('');

/** 部品1枚を確かめる。使えないものは null */
function cleanLayer(input) {
  if (!input || typeof input !== 'object') return null;
  const isText = input.k === 'text';
  if (!isText && !Object.hasOwn(LOGO_SHAPES, input.k) && !isLogoIcon(input.k)) return null;
  const L = { k: input.k };
  const x = num(input.x, -30, 130, 50);
  const y = num(input.y, -30, 130, 50);
  const s = num(input.s, 0.03, 3, 1);
  const r = num(input.r, -360, 360, 0);
  if (x !== 50) L.x = x;
  if (y !== 50) L.y = y;
  if (s !== 1) L.s = s;
  if (r !== 0) L.r = r;
  L.c = color(input.c, 0);
  const line = isText ? 0 : num(input.line, 0, 6, 0);
  if (line) L.line = line;
  else {
    const ow = num(input.ow, 0, 12, 0);
    const o = color(input.o, null);
    if (ow && o !== null) {
      L.o = o;
      L.ow = ow;
    }
  }
  if (input.f) L.f = 1;
  if (isText) {
    L.t = text(input.t);
    if (!L.t.trim()) return null;
    L.font = Object.hasOwn(LOGO_FONTS, input.font) ? input.font : 'graduate';
    const arc = num(input.arc, -90, 90, 0);
    // ⚠ 半径の小さい弧は字が1点に重なって読めないので、まっすぐにする
    if (Math.abs(arc) >= 8) L.arc = arc;
  }
  return L;
}
const cleanLayers = (list, max) =>
  (Array.isArray(list) ? list : []).slice(0, max * 2).map(cleanLayer).filter(Boolean).slice(0, max);

/** 球団の色3つ（'#rrggbb'）。3つそろっていなければ null */
export function cleanLogoColors(input) {
  if (!Array.isArray(input) || input.length !== 3) return null;
  const out = input.map((c) => (typeof c === 'string' ? c.toLowerCase() : ''));
  return out.every(isHexColor) ? out : null;
}

/**
 * 受け取ったロゴを保存の形に直す。部品が1枚も残らなければ null（＝自動のロゴに戻す）。
 * ⚠ 大きすぎるものは断らずに null を返す（呼ぶ側が「保存できません」を出す）
 */
export function cleanLogo(input) {
  if (!input || typeof input !== 'object') return null;
  const layers = cleanLayers(input.layers, LOGO_MAX_LAYERS);
  if (!layers.length) return null;
  const out = { layers };
  const colors = cleanLogoColors(input.colors);
  if (colors) out.colors = colors;
  const mini = cleanLayers(input.mini, LOGO_MINI_MAX_LAYERS);
  if (mini.length) out.mini = mini;
  if (input.rec && typeof input.rec === 'object') {
    const rec = normalRecipe(input.rec);
    // 絵の名前だけは表で確かめる（ほかは `normalRecipe` が知っている値に直す）
    if (!isLogoIcon(rec.motif)) rec.motif = 'baseball-bat';
    if (!rec.mono) delete rec.mono;
    if (!rec.text) delete rec.text;
    out.rec = rec;
  }
  return JSON.stringify(out).length <= LOGO_MAX_CHARS ? out : null;
}

/** 重ねを描くときの形に開く（省いた既定の値を埋める） */
export const openLayer = (L) => ({
  x: 50,
  y: 50,
  s: 1,
  r: 0,
  c: 0,
  ...(L.k === 'text' ? { font: 'graduate', arc: 0 } : null),
  ...L,
});
