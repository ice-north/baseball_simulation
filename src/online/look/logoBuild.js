// ============================================================
// 球団ロゴを「型」から作る。
//
// 型は**重ね方のお手本**で、作るのは部品の重ね（`logoParts.js` の先頭の注）だけ。
// 保存するのは出来上がった重ねなので、型から作ったあとに1枚ずつ崩せる。
//
//   レシピ { tpl 型, base 台座, motif 絵, font 書体, scheme 配色の番号, ini 頭文字を2字に, word ことばを愛称に,
//           mono 頭文字（打ちかえたとき）, text ことば（打ちかえたとき） }
//   球団   { name 内部名, mono 頭文字, city 土地（英字なら大文字）, nick 愛称, latin 英字か, colors [地, 差し色, 縁] }
//
// ⚠ ここは**表示のための計算だけ**で、試合の計算には関わらない。乱数は `rng.js`（種つき）だけを使い、
//    同じ球団・同じ回なら「おまかせ」の候補はいつも同じ並びになる。
// ⚠ サーバーもここを呼ぶ（ロゴを作っていない球団とCPU球団の分を、ビューに載せるため。
//    `server/projection.mjs`）。DOM も React も読まないこと。
// ⚠ アプリは作る側を持たず、ビューに載った重ねを描くだけ（`logoArt.js` の写し）。
// ============================================================
import { hash, rng } from './rng.js';
import {
  LOGO_SHAPES,
  LOGO_BASES,
  LOGO_FONTS,
  LOGO_LATIN_FONTS,
  LOGO_TEXT_MAX,
  WHITE,
  INK,
  logoColors,
  contrast,
  luminance,
  textWidth,
  charWidth,
  isLatinText,
} from './logoParts.js';
import { motifsFor } from './logoMotifs.js';

const n2 = (v) => Math.round(v * 100) / 100;
/** 字の大きさは `40 × s`（s が1で、箱の4割の高さ） */
export const LOGO_TEXT_UNIT = 40;
/** アーチの字送り: 内側で字がぶつからないよう少し広げる（ふちの分は `ow × 0.5` を足す） */
export const LOGO_ARC_GAP = 1.14;

// ---- 部品1枚 ----------------------------------------------------------------
const P = (k, o = {}) => ({ k, x: 50, y: 50, s: 1, r: 0, c: 0, ...o });
const T = (t, o = {}) => ({ k: 'text', t, x: 50, y: 50, s: 1, r: 0, c: 0, font: 'graduate', arc: 0, ...o });
/** 重ねをまとめて傾ける（箱の中心で回す） */
function tilt(layers, deg) {
  const a = (deg * Math.PI) / 180;
  const co = Math.cos(a);
  const si = Math.sin(a);
  for (const L of layers) {
    const dx = L.x - 50;
    const dy = L.y - 50;
    L.x = n2(50 + dx * co - dy * si);
    L.y = n2(50 + dx * si + dy * co);
    L.r = (L.r || 0) + deg;
  }
  return layers;
}
/** 幅 `maxW` に収まる字の大きさ（`maxS` まで） */
const fit = (text, font, maxW, maxS) =>
  n2(Math.min(maxS, maxW / Math.max(0.2, textWidth(text, font) * LOGO_TEXT_UNIT)));
/** 弧の長さ `maxArc` に収まる字の大きさ */
function arcFit(text, font, maxArc, maxS, ow) {
  const chars = [...text];
  const w = chars.reduce((a, ch) => a + charWidth(ch, font), 0) * LOGO_TEXT_UNIT * LOGO_ARC_GAP;
  return n2(Math.min(maxS, (maxArc - chars.length * ow * 0.5) / Math.max(0.2, w)));
}

// ---- 配色 --------------------------------------------------------------------
/**
 * 配色（地・字・差し色）の組。読めない組は外す。1つ目が球団の色の素直な使い方
 * @param colors `logoColors` の5色
 */
export function logoSchemes(colors) {
  const out = [];
  const seen = new Set();
  for (const bg of [0, 1, 2, INK])
    for (const fg of [2, 1, 0, WHITE, INK])
      for (const ac of [1, 2, 0]) {
        const [B, F, A] = [colors[bg], colors[fg], colors[ac]];
        if (B === F || B === A || F === A) continue;
        if (contrast(B, F) < 3.6 || contrast(B, A) < 1.5) continue;
        const key = B + F + A;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ bg, fg, ac });
      }
  // ⚠ どの組も読めない色（3色とも近い明るさ）を選ばれても、空にはしない
  if (!out.length) out.push({ bg: INK, fg: WHITE, ac: 0 });
  return out.slice(0, 10);
}
/** ふちの色: 暗い塗りには明るいふち、明るい塗りには暗いふち（暗い画面でも形が見える） */
function edgeFor(colors, fill, fg) {
  const F = colors[fill];
  const G = colors[fg];
  if (luminance(F) > 0.3) return contrast(G, F) >= 3 && luminance(G) < luminance(F) ? fg : INK;
  return luminance(G) > 0.5 ? fg : WHITE;
}
const bestOn = (colors, bg, list) =>
  list.reduce((a, b) => (contrast(colors[b], colors[bg]) > contrast(colors[a], colors[bg]) ? b : a));

// ---- 型（重ね方のお手本） ------------------------------------------------------
const baseOf = (c) => LOGO_SHAPES[c.base].base;
const plinth = (c) => [P(c.base, { c: c.S.bg, o: c.rim, ow: 4 }), P(c.base, { s: 0.84, c: c.S.fg, line: 1.3 })];

export const LOGO_TEMPLATES = {
  emblem: {
    name: '台座に絵',
    f(c) {
      const b = baseOf(c);
      return [...plinth(c), P(c.motif, { x: b.cx, y: b.cy, s: n2(0.6 * b.cs), c: c.S.fg })];
    },
  },
  mono: {
    name: '台座に頭文字',
    f(c) {
      const b = baseOf(c);
      return [
        ...plinth(c),
        T(c.mono, { x: b.cx, y: b.cy + 1, s: fit(c.mono, c.mfont, 54 * b.cs, 1.4 * b.cs), c: c.S.fg, o: c.S.ac, ow: 3, font: c.mfont }),
      ];
    },
  },
  crest: {
    name: '台座に絵と名前',
    f(c) {
      const b = baseOf(c);
      return [
        ...plinth(c),
        P(c.motif, { x: b.cx, y: n2(b.cy - 11 * b.cs), s: n2(0.42 * b.cs), c: c.S.fg }),
        T(c.WORD, { x: b.cx, y: n2(b.cy + 22 * b.cs), s: fit(c.WORD, c.wfont, 48 * b.cs, 0.4 * b.cs), c: c.acOn, font: c.wfont }),
      ];
    },
  },
  duo: {
    name: '絵と頭文字',
    f(c) {
      const two = [...c.mono].length > 1;
      return [
        P(c.motif, { x: 44, y: 44, s: 0.84, c: c.S.bg, o: c.eBg, ow: 3 }),
        T(c.mono, { x: 70, y: 72, s: two ? 0.85 : 1.2, c: c.S.ac, o: c.eAc, ow: 5, font: c.mfont }),
      ];
    },
  },
  roundel: {
    name: '輪に名前',
    f(c) {
      const f = c.wfont;
      // 上の弧は土地（ことばを打ちかえたらそのことば）、下の弧は愛称
      const upper = c.typed ? c.WORD : c.CITY;
      const lower = c.NICK || c.CITY;
      return [
        P('circle', { c: c.S.bg, o: c.rim, ow: 3 }),
        P('circle', { s: 0.6, c: c.S.fg, line: 1.2 }),
        P(c.motif, { s: 0.38, c: c.S.fg }),
        T(upper, { arc: 38.5, s: arcFit(upper, f, 88, 0.3, 0), c: c.S.fg, font: f }),
        T(lower, { arc: -38.5, s: arcFit(lower, f, 88, 0.3, 0), c: c.acOn, font: f }),
        P('star', { x: 10.5, s: 0.07, c: c.acOn }),
        P('star', { x: 89.5, s: 0.07, c: c.acOn }),
      ];
    },
  },
  script: {
    name: '筆記体',
    f(c) {
      return tilt(
        [
          P('swoosh', { x: 52, y: 62, s: 0.96, c: c.S.ac, o: c.eAc, ow: 2.5 }),
          T(c.Word, { y: 50, s: fit(c.Word, c.sfont, 88, 1.05), c: c.S.bg, o: c.eBg, ow: 4, font: c.sfont }),
          P(c.motif, { x: 80, y: 22, s: 0.26, c: c.S.ac, o: c.eAc, ow: 2 }),
        ],
        -7,
      );
    },
  },
  bats: {
    name: '交差バット',
    f(c) {
      const b = baseOf(c);
      const k = 0.58;
      return [
        P('bat', { r: 42, c: c.S.ac, o: c.eAc, ow: 2.5 }),
        P('bat', { r: -42, c: c.S.ac, o: c.eAc, ow: 2.5 }),
        P(c.base, { s: k, c: c.S.bg, o: c.eBg, ow: 3 }),
        T(c.mono, {
          x: n2(50 + (b.cx - 50) * k),
          y: n2(50 + (b.cy - 50) * k + 1),
          s: fit(c.mono, c.mfont, 50 * b.cs * k, 1.3 * b.cs * k),
          c: c.S.fg,
          font: c.mfont,
        }),
      ];
    },
  },
  ribbon: {
    name: '絵とリボン',
    f(c) {
      return [
        P(c.motif, { y: 40, s: 0.72, c: c.S.bg, o: c.eBg, ow: 3 }),
        P('banner', { y: 81, c: c.S.ac, o: c.eAc, ow: 2.5 }),
        T(c.WORD, { y: 81, s: fit(c.WORD, c.wfont, 68, 0.34), c: bestOn(c.colors, c.S.ac, [c.S.bg, c.S.fg, INK, WHITE]), font: c.wfont }),
      ];
    },
  },
  cap: {
    name: '帽子の字',
    f(c) {
      const m = [...c.mono];
      if (m.length < 2) return [T(c.mono, { s: 2.1, c: c.S.bg, o: c.eBg, ow: 6, font: c.mfont })];
      return [
        T(m[0], { x: 37, y: 40, s: 1.55, c: c.S.bg, o: c.eBg, ow: 5, font: c.mfont }),
        T(m.slice(1).join(''), { x: 63, y: 60, s: 1.55, c: c.S.ac, o: c.eAc, ow: 5, font: c.mfont }),
      ];
    },
  },
  pennant: {
    name: 'ペナント',
    f(c) {
      return tilt(
        [
          P('pennant', { c: c.S.bg, o: c.rim, ow: 3 }),
          P(c.motif, { x: 19, s: 0.25, c: c.S.fg }),
          T(c.WORD, { x: 55, y: 50, s: fit(c.WORD, c.wfont, 44, 0.36), c: c.S.fg, font: c.wfont }),
        ],
        -10,
      );
    },
  },
  arch: {
    name: 'アーチの名前',
    f(c) {
      return [
        T(c.WORD, { y: 64, arc: 44, s: arcFit(c.WORD, c.wfont, 106, 0.5, 3), c: c.S.bg, o: c.eBg, ow: 3, font: c.wfont }),
        P(c.motif, { y: 64, s: 0.52, c: c.S.ac, o: c.eAc, ow: 2.5 }),
      ];
    },
  },
};
export const LOGO_TEMPLATE_KEYS = Object.keys(LOGO_TEMPLATES);

// ---- 球団 → 型に渡す材料 --------------------------------------------------------
const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);
const clip = (s, max = LOGO_TEXT_MAX) => [...String(s || '')].slice(0, max).join('');

/** レシピを使える値に直す（知らない型・台座・書体が来ても落ちない） */
export function normalRecipe(R = {}) {
  return {
    tpl: Object.hasOwn(LOGO_TEMPLATES, R.tpl) ? R.tpl : 'mono',
    base: LOGO_BASES.includes(R.base) ? R.base : 'circle',
    motif: typeof R.motif === 'string' ? R.motif : 'baseball-bat',
    font: LOGO_LATIN_FONTS.includes(R.font) ? R.font : 'graduate',
    scheme: Number.isInteger(R.scheme) && R.scheme >= 0 ? R.scheme : 0,
    ini: R.ini ? 1 : 0,
    word: R.word ? 1 : 0,
    // 打った頭文字は2字まで（画面の欄と同じ）
    mono: clip(String(R.mono || '').trim(), 2),
    text: clip(R.text).trim(),
  };
}

function context(team, recipe) {
  const R = normalRecipe(recipe);
  const colors = logoColors(team.colors);
  const schemes = logoSchemes(colors);
  const S = schemes[R.scheme % schemes.length];
  const city = team.city || '';
  const nick = team.nick || '';
  // 頭文字: 打ちかえた字 → 2字（土地＋愛称） → 球団の字（リーグの中で重ならないように決めたもの）
  const two = team.latin && city && nick ? city[0] + nick[0] : '';
  const mono = [...(R.mono || (R.ini && two) || team.mono || city[0] || '？')].slice(0, 2).join('');
  // ことば: 打ちかえた字 → 愛称 → 土地（英字の名前は、筆記体のときだけ頭文字を大きく残りを小さく）
  const word = R.text || (R.word && nick ? nick : city) || mono;
  const typed = !!R.text;
  const upper = typed || !team.latin ? word : word.toUpperCase();
  const script = LOGO_FONTS[R.font].script;
  const monoLatin = isLatinText(mono);
  const wordLatin = isLatinText(word);
  return {
    colors,
    S,
    base: R.base,
    motif: R.motif,
    mono,
    typed,
    // 筆記体は1字だけ（2字の筆記体は読めない）。英字でない字は和文の書体
    mfont: !monoLatin ? 'jp' : script && [...mono].length > 1 ? 'graduate' : R.font,
    wfont: !wordLatin ? 'jp' : script ? 'graduate' : R.font,
    sfont: !wordLatin ? 'jp' : 'yellowtail',
    CITY: clip(team.city || mono),
    NICK: clip(team.nick),
    WORD: clip(upper),
    Word: clip(typed || !team.latin ? word : capitalize(word)),
    acOn: contrast(colors[S.ac], colors[S.bg]) >= 2.4 ? S.ac : S.fg,
    eBg: edgeFor(colors, S.bg, S.fg),
    eAc: edgeFor(colors, S.ac, S.fg),
    // 台座のふち: 地も差し色も暗い組は、暗い画面で沈むので明るいふちにする
    rim: luminance(colors[S.bg]) < 0.12 && luminance(colors[S.ac]) < 0.12 ? edgeFor(colors, S.bg, S.fg) : S.ac,
  };
}

/** レシピから部品の重ねを作る */
export function buildLogoLayers(team, recipe) {
  const c = context(team, recipe);
  return LOGO_TEMPLATES[normalRecipe(recipe).tpl].f(c);
}

/**
 * 小さく出すとき（順位表など）の重ね。細かい絵はつぶれるので、台座と頭文字だけにする。
 * `kind`: 'mono' 台座に頭文字（既定） / 'letter' 字だけ / 'motif' 台座に絵
 */
export function buildLogoMini(team, recipe, kind = 'mono') {
  const c = context(team, recipe);
  const b = baseOf(c);
  if (kind === 'letter') return [T(c.mono, { s: fit(c.mono, c.mfont, 84, 2.1), c: c.S.bg, o: c.eBg, ow: 7, font: c.mfont })];
  const plate = P(c.base, { c: c.S.bg, o: c.rim, ow: 6 });
  if (kind === 'motif') return [plate, P(c.motif, { x: b.cx, y: b.cy, s: n2(0.7 * b.cs), c: c.S.fg })];
  return [plate, T(c.mono, { x: b.cx, y: b.cy + 1, s: fit(c.mono, c.mfont, 62 * b.cs, 1.6 * b.cs), c: c.S.fg, font: c.mfont })];
}
export const LOGO_MINI_KINDS = [
  ['mono', '台座に頭文字'],
  ['letter', '字だけ'],
  ['motif', '台座に絵'],
  ['same', 'ロゴをそのまま縮める'],
];

/** その球団の「おまかせ」に出す絵 */
export const teamMotifs = (team) => motifsFor(team.nickname, team.name);

/**
 * 「おまかせ」の候補（1回に12個のレシピ）。同じ球団・同じ色・同じ回なら、いつも同じ並び。
 * ⚠ 乱数を引く回数は候補ごとに5回で固定（条件の中で引かない）
 */
export function logoCandidates(team, page = 0) {
  const r = rng(hash(`${team.name}:logo:${page}`));
  const tpls = [...LOGO_TEMPLATE_KEYS];
  for (let i = tpls.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [tpls[i], tpls[j]] = [tpls[j], tpls[i]];
  }
  const mine = teamMotifs(team);
  const nSchemes = logoSchemes(logoColors(team.colors)).length;
  const out = [];
  for (let i = 0; i < 12; i++) {
    const a = r();
    const b = r();
    const c = r();
    const d = r();
    const e = r();
    out.push({
      tpl: tpls[(i + page) % tpls.length],
      base: LOGO_BASES[Math.floor(a * LOGO_BASES.length)],
      motif: mine[(i + page + Math.floor(i / mine.length)) % mine.length],
      font: LOGO_LATIN_FONTS[Math.floor(b * LOGO_LATIN_FONTS.length)],
      scheme: c < 0.45 ? 0 : Math.floor(c * nSchemes),
      ini: d < 0.6 ? 0 : 1,
      word: e < 0.5 ? 0 : 1,
    });
  }
  return out;
}

/** レシピ1つから、保存する形のロゴ（重ね・小さい版・レシピ）を作る */
export function logoFromRecipe(team, recipe, miniKind = 'mono') {
  const rec = normalRecipe(recipe);
  const layers = buildLogoLayers(team, rec);
  return { layers, mini: miniKind === 'same' ? null : buildLogoMini(team, rec, miniKind), rec };
}

/**
 * ロゴを作っていない球団（CPU球団も）のロゴ。「おまかせ」の1番目。
 * ⚠ 型や絵の表を変えると、作っていない球団のロゴはみな変わる（保存していないので）
 */
export function autoLogo(team) {
  const { layers, mini } = logoFromRecipe(team, logoCandidates(team, 0)[0]);
  return { layers, mini };
}

/**
 * 球団の材料（`teamLook.js` の見た目と、名前の元 `nameSource`）をまとめる。
 * @param look `buildTeamLooks` の1球団ぶん（`name`・`mono`・`c1`〜`c3`）
 * @param source `nameSource(name, labels)`（`latin`・`city`・`nick`）
 * @param nickname 表示の愛称（絵を選ぶのに使う。`teamLabels` の `nickname`）
 */
export const logoTeam = (look, source, nickname) => ({
  name: look.name,
  mono: look.mono,
  latin: source.latin,
  city: source.city,
  nick: source.nick,
  nickname: nickname || '',
  colors: [look.c1, look.c2, look.c3],
});
