// 球団色（`src/online/teamColors.js`）の検査。
//
// ⚠ いしだ 2026-11-19「主に画面が地味な点を修正して欲しい」で入れた色。
//    **読めない色を足さないための歯止め**がここ。色を足す・濃さを変えるときは、
//    この検査が通る値にすること（通らない色は画面で溶ける）。
// ⚠ 地の色は `src/index.css` の `:root` から読む（トークンが動いたら一緒に動く。
//    検査に値を書き写すと、地色を変えたときに古い前提のまま通ってしまう）。
//   node tools/sim-harness/online-team-color-check.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEAM_PALETTE, setTeamColors, teamColor } from '../../src/online/teamColors.js';

const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
const token = (name) => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  assert.ok(m, `${name} が src/index.css に無い`);
  return m[1];
};
const PAPER = token('surface-0'); // 画面の地（明るい紙）
const CARD = token('surface-2'); // カード（濃い面）
const WHITE = '#ffffff';
const DARK = '#0f172a'; // 明るい色の上に置く文字（`.online-team-mark.is-card`）

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// ① 12球団ぶんあり、色が重なっていない（同じ色の球団が2つあると見分けられない）
assert.equal(TEAM_PALETTE.length, 12, `色が${TEAM_PALETTE.length}組（12球団ぶん要る）`);
assert.equal(new Set(TEAM_PALETTE.map((c) => c.deep)).size, 12, '濃い色が重なっている');
assert.equal(new Set(TEAM_PALETTE.map((c) => c.bright)).size, 12, '明るい色が重なっている');
assert.equal(new Set(TEAM_PALETTE.map((c) => c.key)).size, 12, '色の名前が重なっている');

// ② 読めること（`src/index.css` の「文字色の決まり」と同じ 4.5:1）
for (const c of TEAM_PALETTE) {
  const onDeep = contrast(c.deep, WHITE);
  assert.ok(onDeep >= 4.5, `${c.label}: 濃い色に白文字が読めない（${onDeep.toFixed(2)}:1）`);
  const onBright = contrast(c.bright, DARK);
  assert.ok(onBright >= 4.5, `${c.label}: 明るい色に暗い文字が読めない（${onBright.toFixed(2)}:1）`);
  // ③ 形が見えること（非文字は 3:1）。カードの上の帯・マークがカードに溶けない
  const band = contrast(c.bright, CARD);
  assert.ok(band >= 3, `${c.label}: 明るい色がカードに溶ける（${band.toFixed(2)}:1）`);
  // ⚠ 紙の上の濃い色は 2.26〜4.16 までしか無く、3:1 を満たさない組がある。
  //    だから紙の上の札には**暗い縁**を付けてある（`online.css` の `.is-paper`）。
  //    ここでは「紙より暗いこと」だけを見る（縁が無くても沈んで見える向きを保つ）
  assert.ok(lum(c.deep) < lum(PAPER), `${c.label}: 濃い色が紙より明るい（紙の上で浮く）`);
}

// ④ 割り当て: 12球団に重ならずに配る。⚠ **並べ替えた順**で配るので、
//    渡す順が変わっても（昇降格で `teamNames` の並びが変わっても）同じ色になる
{
  const names = Array.from({ length: 12 }, (_, i) => `球団${String.fromCharCode(65 + i)}`);
  setTeamColors(names);
  const first = names.map((n) => teamColor(n).key);
  assert.equal(new Set(first).size, 12, '12球団に同じ色が配られた');
  setTeamColors([...names].reverse());
  assert.deepEqual(names.map((n) => teamColor(n).key), first, '渡す順で色が変わる');
  // ⚠ 知らない球団でも必ず色が返る（画面が色無しで崩れないように）
  const other = teamColor('よその球団');
  assert.ok(TEAM_PALETTE.includes(other), '知らない球団に色が無い');
  assert.equal(teamColor('よその球団').key, other.key, '同じ名前で色が変わる');
}

console.log(
  `online-team-color-check PASS（12色・白/暗い文字が ${Math.min(
    ...TEAM_PALETTE.map((c) => Math.min(contrast(c.deep, WHITE), contrast(c.bright, DARK))),
  ).toFixed(2)}:1 以上・カードとの差が ${Math.min(
    ...TEAM_PALETTE.map((c) => contrast(c.bright, CARD)),
  ).toFixed(2)}:1 以上）`,
);
