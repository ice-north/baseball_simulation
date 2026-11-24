// ============================================================
// 球団ロゴの部品: 台座・飾りの図形、書体と字の幅、色の決まり。
//
// ロゴは**部品の重ね**（最大 `LOGO_MAX_LAYERS` 枚）。1枚が持つのは
//   k 種類（図形の名前・絵の名前・'text'） / x y 中心の位置（100×100 の箱） / s 大きさ / r 回転（度）
//   c 色 / o ふちの色 / ow ふちの太さ / f 左右反転 / line 線だけで描く太さ
//   字だけ: t 文字 / font 書体 / arc アーチの半径（＋は上の弧、−は下の弧、0 はまっすぐ）
// 色は球団の色の番号（0 地・1 差し色・2 縁・3 白・4 黒）か '#rrggbb'。番号で持つので、
// 球団の色を変えるとロゴ全体がついてくる。
//
// ⚠ 字の幅は**フォントから測らず、下の表の数で決める**。ブラウザとアプリで測った幅が少しずつ
//    違うと、同じロゴの字の大きさ・アーチの字送りが端末ごとに変わってしまう（答え合わせもできない）。
//    表は `public/fonts/look-*.woff2` の送り幅（1000分のいくつ）。字を差しかえたら測り直す
//    （`python3 tools/logo-font-widths.py`。表と字のファイルが同じかを比べる）。
// ⚠ アプリに写すときは、この表と図形の `d` をそのまま持っていく。
// ============================================================

export const LOGO_MAX_LAYERS = 8;
export const LOGO_MINI_MAX_LAYERS = 4;
/** 字は14字まで（土地のローマ字でいちばん長い HIGASHIOSAKA が12字） */
export const LOGO_TEXT_MAX = 14;
/** 色の番号: 0〜2 は球団の色（地・差し色・縁）、3 白、4 黒 */
export const WHITE = 3;
export const INK = 4;
export const LOGO_WHITE = '#ffffff';
export const LOGO_INK = '#14161c';

const r2 = (v) => Math.round(v * 100) / 100;
const poly = (pts) => `M${pts.map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L')}Z`;
/** とげの輪（n 個のとげ。外の半径 R・内の半径 r） */
function burst(n, R, r) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const q = i % 2 ? r : R;
    pts.push([50 + q * Math.cos(a), 50 + q * Math.sin(a)]);
  }
  return poly(pts);
}

/**
 * 図形（100×100 の箱。中心は 50,50）。`base` があるものは台座に使える:
 * `cx, cy` は中に置く絵や字の中心、`cs` は中身の大きさの倍率（丸を1として）。
 * `d2` は線だけで重ねる模様（ボールの縫い目）
 */
export const LOGO_SHAPES = {
  circle: { name: '丸', d: 'M50 3A47 47 0 1 1 49.99 3Z', base: { cx: 50, cy: 50, cs: 1 } },
  shield: { name: '盾', d: 'M50 4L90 16Q90 64 50 96Q10 64 10 16Z', base: { cx: 50, cy: 44, cs: 0.84 } },
  diamond: { name: 'ひし形', d: 'M50 3L97 50L50 97L3 50Z', base: { cx: 50, cy: 50, cs: 0.7 } },
  hex: {
    name: '六角',
    d: poly([[50, 3], [90.7, 26.5], [90.7, 73.5], [50, 97], [9.3, 73.5], [9.3, 26.5]]),
    base: { cx: 50, cy: 50, cs: 0.9 },
  },
  plate: { name: '本塁', d: 'M12 6H88V56L50 95L12 56Z', base: { cx: 50, cy: 40, cs: 0.8 } },
  oval: { name: 'だ円', d: 'M2 50A48 35 0 1 1 98 50A48 35 0 1 1 2 50Z', base: { cx: 50, cy: 50, cs: 0.74 } },
  seal: { name: 'ギザギザ', d: burst(20, 48, 42.5), base: { cx: 50, cy: 50, cs: 0.88 } },
  square: {
    name: '角丸',
    d: 'M16 6H84Q94 6 94 16V84Q94 94 84 94H16Q6 94 6 84V16Q6 6 16 6Z',
    base: { cx: 50, cy: 50, cs: 1 },
  },
  pennant: { name: 'ペナント', d: 'M4 16L97 50L4 84Z' },
  banner: { name: 'リボン', d: 'M3 39H97L90 50L97 61H3L10 50Z' },
  swoosh: { name: '流れ線', d: 'M4 54Q48 40 96 44Q62 50 34 62Q20 60 4 54Z' },
  bat: {
    name: 'バット',
    d: 'M47.6 95h4.8v-3.4h-1.1L52.7 42Q55.2 22 54.6 10Q54 3.5 50 3.5Q46 3.5 45.4 10Q44.8 22 47.3 42L48.7 91.6h-1.1Z',
  },
  star: { name: '星', d: burst(5, 48, 19.5) },
  ball: { name: 'ボール', d: 'M50 3A47 47 0 1 1 49.99 3Z', d2: 'M22 13Q40 50 22 87M78 13Q60 50 78 87' },
};
export const LOGO_BASES = Object.keys(LOGO_SHAPES).filter((k) => LOGO_SHAPES[k].base);
export const LOGO_SHAPE_KEYS = Object.keys(LOGO_SHAPES);

// ---- 書体 ------------------------------------------------------------------
/** ロゴに使える書体（`Art.jsx` の `FONTS` と同じ名前）。`script` は筆記体 */
export const LOGO_FONTS = {
  graduate: { name: 'カレッジ' },
  alfa: { name: 'スラブ' },
  yellowtail: { name: '筆記体', script: true },
  jp: { name: '和文' },
};
/** 英字のロゴで選べる書体（和文は英字でない字のときに自動で使う） */
export const LOGO_LATIN_FONTS = ['graduate', 'alfa', 'yellowtail'];

/** 字の送り幅（0x20〜0x7E。1000分のいくつ） */
const WIDTHS = {
  graduate: [350,260,400,650,650,940,674,240,352,352,467,650,200,509,200,392,650,650,650,650,650,650,650,650,650,650,200,200,650,650,650,519,950,657,684,600,690,636,596,620,792,392,540,669,556,946,812,650,624,650,699,600,580,740,687,1026,649,607,596,352,392,352,650,621,423,657,684,600,690,636,596,620,792,392,540,669,556,946,812,650,624,650,699,600,580,740,687,1026,649,607,596,352,317,352,650],
  alfa: [300,339,356,732,684,885,828,193,374,374,409,576,245,389,244,423,732,522,649,623,694,651,693,648,700,693,244,245,499,495,499,630,1148,806,775,722,804,713,632,782,840,420,666,835,653,1143,942,792,738,810,800,674,780,781,786,1207,800,776,689,325,424,325,413,600,403,615,662,562,658,594,384,654,696,346,313,678,350,1042,696,632,658,652,527,519,451,686,651,956,636,632,568,299,255,299,618],
  yellowtail: [208,327,338,543,434,667,451,191,366,366,366,415,238,317,232,378,427,228,376,411,439,388,411,342,400,399,338,343,342,429,342,536,718,587,684,568,785,602,581,632,750,280,642,717,721,772,647,638,722,680,733,668,567,740,668,896,589,665,615,366,378,366,500,385,400,407,373,365,412,317,360,418,393,203,221,368,258,608,391,366,391,409,349,368,215,396,364,554,371,390,359,439,375,439,387],
};
/** 和文の書体は端末のゴシックなので、英数は 0.62 字ぶん・ほかは1字ぶんと見る */
const JP_ASCII = 620;

/** 1字の幅（字の大きさを1として） */
export function charWidth(ch, font) {
  const code = ch.codePointAt(0);
  const table = WIDTHS[font];
  if (code >= 0x20 && code <= 0x7e) return (table ? table[code - 0x20] : JP_ASCII) / 1000;
  return 1;
}
/** 文字列の幅（字の大きさを1として） */
export function textWidth(text, font) {
  let w = 0;
  for (const ch of String(text)) w += charWidth(ch, font);
  return w;
}
/** 英数と記号だけか（そうでなければ和文の書体で描く） */
export const isLatinText = (s) => /^[\x20-\x7e]*$/.test(String(s));

// ---- 色 --------------------------------------------------------------------
const HEX = /^#[0-9a-f]{6}$/;
export const isHexColor = (c) => typeof c === 'string' && HEX.test(c);
/** 球団の色3つ＋白＋黒 */
export const logoColors = (c) => [c[0], c[1], c[2], LOGO_WHITE, LOGO_INK];
/** 色の番号か '#rrggbb' を色にする */
export const colorOf = (colors, c) => (typeof c === 'string' ? c : colors[c] || colors[0]);

/** 明るさ（0 黒〜1 白） */
export function luminance(hex) {
  const v = parseInt(hex.slice(1), 16);
  const f = (x) => {
    const k = x / 255;
    return k <= 0.03928 ? k / 12.92 : ((k + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(v >> 16) + 0.7152 * f((v >> 8) & 255) + 0.0722 * f(v & 255);
}
/** 2色の読みやすさ（1 同じ色〜21 白と黒） */
export function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
