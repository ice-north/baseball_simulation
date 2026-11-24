// ============================================================
// 球団ロゴを**描く手順の一覧**にする（`art.js` と同じ形。`Art.jsx` の `ArtSvg` がそのまま描ける）。
//
//   図形に `tf: [x, y, r, sx, sy, ox, oy]` が付く。意味は
//     「(ox, oy) だけずらす → (sx, sy) 倍にする → r 度回す → (x, y) へ動かす」
//   （SVG の `translate(x y) rotate(r) scale(sx sy) translate(ox oy)`）。
//   `po: 1` の図形は、ふちを先に描いてから塗る（ふちの内側半分が塗りに隠れる）。
//   `li` は何枚目の部品か（ロゴを作る画面が、押された部品を知るのに使う）。
//
// ⚠ 絵の形（`icons`）は別に読み込む（`logoIcons.js`）。まだ届いていない絵は飛ばして描く。
// ⚠ アーチの字は1字ずつ置いて回す（字を道に沿わせる機能はアプリの Canvas に無い）。
//    字の幅は `logoParts.js` の表の数で決める（測らない）。
// ⚠ アプリに写すときは、数字を小数2桁に丸めるところまで同じにする（`r2`）。
// ============================================================
import { LOGO_SHAPES, logoColors, colorOf, charWidth, INK } from './logoParts.js';
import { LOGO_TEXT_UNIT, LOGO_ARC_GAP } from './logoBuild.js';
import { openLayer } from './logoData.js';

const r2 = (v) => Math.round(v * 100) / 100;
/** 倍率は小数4桁（絵の倍率は 0.1 前後なので、2桁では粗い） */
const r4 = (v) => Math.round(v * 10000) / 10000;
/** 絵の箱は 512×512。ロゴの箱（100）へ縮める倍率 */
const ICON_UNIT = 100 / 512;
/** ロゴの箱。ふちが 100×100 の外へ出るぶんの余白を取る */
export const LOGO_BOX = [-4, -4, 108, 108];
/** これ以下の大きさ（px）で出すときは小さい版を使う（表や一覧の中のマーク。名前の字は潰れて読めない） */
export const LOGO_MINI_SIZE = 32;

function textItems(L, colors, li) {
  const fs = r2(LOGO_TEXT_UNIT * L.s);
  const jp = L.font === 'jp';
  const dy = r2(fs * (jp ? 0.36 : 0.35));
  const fill = colorOf(colors, L.c);
  const edge = L.o !== undefined && L.ow ? { stroke: colorOf(colors, L.o), sw: r2(L.ow), join: 'round' } : null;
  const flip = L.f ? -1 : 1;
  const one = (text, tf, paint) => ({ t: 'text', x: 0, y: dy, size: fs, font: L.font, text, ls: 0, tf, li, ...paint });
  if (!L.arc) return [one(L.t, [r2(L.x), r2(L.y), r2(L.r), flip, 1, 0, 0], { fill, ...edge })];
  const R = Math.abs(L.arc);
  const top = L.arc > 0;
  const chars = [...L.t];
  const widths = chars.map((ch) => charWidth(ch, L.font) * fs * LOGO_ARC_GAP + (L.ow || 0) * 0.5);
  const turn = (L.r * Math.PI) / 180;
  let at = -widths.reduce((a, b) => a + b, 0) / 2 / R;
  const places = chars.map((ch, i) => {
    const mid = at + widths[i] / 2 / R;
    at += widths[i] / R;
    // 弧の上の点（部品の中心から見て）。部品ごとの回転と反転もここで掛ける
    const px = R * Math.sin(mid) * flip;
    const py = top ? -R * Math.cos(mid) : R * Math.cos(mid);
    const x = L.x + px * Math.cos(turn) - py * Math.sin(turn);
    const y = L.y + px * Math.sin(turn) + py * Math.cos(turn);
    const deg = ((top ? mid : -mid) * 180 * flip) / Math.PI + L.r;
    return { ch, tf: [r2(x), r2(y), r2(deg), flip, 1, 0, 0] };
  });
  // ⚠ ふちは全部の字を先に描く（1字ずつふち→塗りの順だと、隣の字のふちが前の字の塗りに乗る）
  const out = [];
  if (edge) for (const p of places) out.push(one(p.ch, p.tf, { ...edge }));
  for (const p of places) out.push(one(p.ch, p.tf, { fill }));
  return out;
}

function shapeItems(L, colors, icons, li) {
  const shape = Object.hasOwn(LOGO_SHAPES, L.k) ? LOGO_SHAPES[L.k] : null;
  const d = shape ? shape.d : icons && Object.hasOwn(icons, L.k) ? icons[L.k] : null;
  if (!d) return [];
  const unit = shape ? 1 : ICON_UNIT;
  const off = shape ? -50 : -256;
  const k = L.s * unit;
  const tf = [r2(L.x), r2(L.y), r2(L.r), r4((L.f ? -1 : 1) * k), r4(k), off, off];
  // ⚠ 線の太さは変形で一緒に拡大されるので、倍率で割っておく（どの大きさの部品でもふちは同じ太さ）
  const item = { t: 'path', d, tf, li };
  if (L.line) {
    item.stroke = colorOf(colors, L.c);
    item.sw = r2(L.line / k);
  } else {
    item.fill = colorOf(colors, L.c);
    if (L.o !== undefined && L.ow) {
      item.stroke = colorOf(colors, L.o);
      item.sw = r2(L.ow / k);
      item.join = 'round';
      item.po = 1;
    }
  }
  const out = [item];
  if (shape?.d2)
    out.push({ t: 'path', d: shape.d2, tf, li, stroke: colorOf(colors, L.o !== undefined ? L.o : INK), sw: r2(2.4 / k), cap: 'round' });
  return out;
}

/**
 * 部品の重ねを描く手順にする。
 * @param layers 部品の重ね（保存の形のままでよい）
 * @param teamColors 球団の色 [地, 差し色, 縁]
 * @param icons 絵の形（`{ 名前: d }`。まだ無ければ null）
 */
export function logoArt(layers, teamColors, icons = null) {
  const colors = logoColors(teamColors);
  const items = [];
  (layers || []).forEach((raw, li) => {
    const L = openLayer(raw);
    items.push(...(L.k === 'text' ? textItems(L, colors, li) : shapeItems(L, colors, icons, li)));
  });
  return { box: LOGO_BOX, clip: null, items };
}

/** 重ねに、絵（別に読み込む形）を使う部品があるか */
export const logoNeedsIcons = (layers) =>
  (layers || []).some((L) => L.k !== 'text' && !Object.hasOwn(LOGO_SHAPES, L.k));

/**
 * 出す大きさに合う重ねを選ぶ。小さいとき（`LOGO_MINI_SIZE` 以下）は小さい版、無ければそのまま。
 * @param logo ビューのロゴ（`layers`・`mini`）
 */
export const logoLayersFor = (logo, size) => (size <= LOGO_MINI_SIZE && logo?.mini?.length ? logo.mini : logo?.layers) || [];
