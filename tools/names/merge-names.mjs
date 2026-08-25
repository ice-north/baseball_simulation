// ============================================================
// 名前DB（src/data/playerNames.js）への追加ツール
//
//   node tools/names/merge-names.mjs --surnames <file> --given <file> [--weight 0.012] [--dry]
//
// 入力は**素のテキスト**でよい。1行1件でも、空白・読点・カンマ区切りで
// 1行にずらっと並べてもよい（全角空白・全角カンマも受ける）。
// `#` で始まる行はコメントとして無視する。
//
// ⚠ **実在する名前だけを入れること**。高校名で「市郡名 × 接尾辞」の機械生成を
//    やって「高槻工業」のような実在しない校名が混ざった前例がある。
//    このツールは重複と不正な文字を弾くだけで、実在するかどうかは判定できない。
//
// ⚠ **重みは正規化されるので絶対値に意味はない**（`weightedRandomSelect` が
//    合計で割る）。意味があるのは**他の名前との比**だけ。
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET = path.join(ROOT, 'src/data/playerNames.js');

// --- 引数 ------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DRY = argv.includes('--dry');
// 姓の追加分の重み。既存の最小は 0.004（324件）。実データの累積カーブ
// （上位1000で68%）に寄せるには、この帯を厚くする必要がある。
const SUR_W = Number(arg('--weight', 0.012));
// 名は既存が全件 0.033 の一様。**一様のまま揃える**こと（片方だけ重みを
// 持たせると、新しく足した名前だけが出やすい／出にくいという偏りになる）。
const GIVEN_W = 0.033;

// --- 入力の読み取り --------------------------------------------------
// 1行1件でも、空白・カンマ区切りの羅列でも同じように読む
const readList = (file) => {
  if (!file) return [];
  const raw = fs.readFileSync(path.resolve(file), 'utf8');
  return raw.split('\n')
    .filter(l => !l.trim().startsWith('#'))
    .flatMap(l => l.split(/[\s,、,]+/u))
    .map(s => s.replace(/[\s　]/gu, '').trim())
    .filter(Boolean);
};

// 名前として通す文字（漢字・ひらがな・カタカナ・長音）。
// 読みガナや注記が混ざっていたら弾いて報告する
const NAME_OK = /^[一-鿿々〇぀-ゟ゠-ヿーヶヵ]{1,6}$/u;

// --- 既存DBの読み取り ------------------------------------------------
const src = fs.readFileSync(TARGET, 'utf8');
const parseArray = (key) => {
  const head = src.indexOf(`${key}: [`);
  if (head < 0) throw new Error(`${key} が見つからない`);
  const end = src.indexOf('\n  ]', head);
  const body = src.slice(head, end);
  return [...body.matchAll(/\{\s*name:\s*'([^']+)',\s*weight:\s*([\d.]+)\s*\}/g)]
    .map(m => ({ name: m[1], weight: Number(m[2]) }));
};

const merge = (key, cands, weight, label) => {
  const cur = parseArray(key);
  // ⚠ 既存にも重複がありうる（実際に「足立」が2件あった）。ここで畳む
  const seen = new Map();
  const dupInDb = [];
  for (const x of cur) {
    if (seen.has(x.name)) { dupInDb.push(x.name); continue; }
    seen.set(x.name, x);
  }

  const bad = [], already = [], dupInFile = [], added = [];
  const fileSeen = new Set();
  for (const n of cands) {
    if (!NAME_OK.test(n)) { bad.push(n); continue; }
    if (fileSeen.has(n)) { dupInFile.push(n); continue; }
    fileSeen.add(n);
    if (seen.has(n)) { already.push(n); continue; }
    added.push(n);
    seen.set(n, { name: n, weight });
  }

  const out = [...seen.values()];
  const show = (a, n = 8) => a.slice(0, n).join(' ') + (a.length > n ? ` …他${a.length - n}件` : '');
  console.log(`\n【${label}】 ${cur.length}件 → ${out.length}件`);
  console.log(`  追加            ${added.length}件`);
  if (dupInDb.length)   console.log(`  既存DBの重複を除去  ${dupInDb.length}件  ${show(dupInDb)}`);
  if (already.length)   console.log(`  既にあった      ${already.length}件  ${show(already)}`);
  if (dupInFile.length) console.log(`  リスト内で重複    ${dupInFile.length}件  ${show(dupInFile)}`);
  if (bad.length)       console.log(`  ⚠ 名前として読めない ${bad.length}件  ${show(bad)}`);
  return out;
};

const surnames  = merge('surnames',  readList(arg('--surnames')), SUR_W,   '姓');
const givenNames = merge('givenNames', readList(arg('--given')),  GIVEN_W, '名');

// --- 分布の測定（実データと比べる） ----------------------------------
const eff = (a) => { const t = a.reduce((s, x) => s + x.weight, 0);
  return 1 / a.reduce((s, x) => s + (x.weight / t) ** 2, 0); };
const cum = (a, n) => { const t = a.reduce((s, x) => s + x.weight, 0);
  return a.slice(0, n).reduce((s, x) => s + x.weight, 0) / t * 100; };

console.log('\n【姓の分布】（実データ: 上位100=33% / 500=55% / 1000=68%）');
console.log(`  上位100 ${cum(surnames, 100).toFixed(0)}%  上位500 ${cum(surnames, 500).toFixed(0)}%`
          + `  上位1000 ${cum(surnames, 1000).toFixed(0)}%  実効 ${eff(surnames).toFixed(0)}`);

// 24人ロスターに同じ姓が2人以上いる確率（生成の体感に一番近い指標）
const pick = (a) => { const t = a.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * t; for (const x of a) { r -= x.weight; if (r <= 0) return x.name; }
  return a[a.length - 1].name; };
let hit = 0;
for (let i = 0; i < 4000; i++) {
  const s = new Set(); let d = false;
  for (let j = 0; j < 24; j++) { const n = pick(surnames); if (s.has(n)) d = true; s.add(n); }
  if (d) hit++;
}
console.log(`  24人ロスターに同じ姓が2人以上 ${(hit / 40).toFixed(1)}%`);

let dup = 0; const bag = new Set();
for (let i = 0; i < 5000; i++) {
  const f = pick(surnames) + ' ' + pick(givenNames);
  if (bag.has(f)) dup++; bag.add(f);
}
console.log(`  1学年5000人の同姓同名 ${dup}人 (${(dup / 50).toFixed(1)}%)`);

// --- 書き出し --------------------------------------------------------
if (DRY) { console.log('\n--dry のため書き込みはしていない'); process.exit(0); }

const entries = (a) => a.map((x, i) =>
  `    { name: '${x.name}', weight: ${x.weight} }${i === a.length - 1 ? '' : ','}`).join('\n');
const tail = src.slice(src.indexOf('\n};') + 3);

fs.writeFileSync(TARGET,
`// 選手名データベース（実際の名前の出現頻度に基づく重み付け）
// 姓: ${surnames.length}件（実際のパーセンテージを重みとして使用）
// 名: ${givenNames.length}件（均等に${GIVEN_W}）
//
// ⚠ 足すときは tools/names/merge-names.mjs を通すこと。手で書き足すと
//    重複が混ざる（実際に「足立」が2件入っていた）。

export const PLAYER_NAMES = {
  surnames: [
${entries(surnames)}
  ],
  givenNames: [
${entries(givenNames)}
  ]
};${tail}`);

console.log(`\n書き出した: src/data/playerNames.js`);
