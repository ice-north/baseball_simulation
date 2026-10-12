// ============================================================
// 名前DB（src/data/playerNames.js）への追加ツール
//
//   node tools/names/merge-names.mjs --surnames <file> --given <file> \
//        [--weight 0.012] [--pop-base 85000000] [--limit 5000] [--dry] \
//        [--drop-given "徳次郎,喜代和"] [--drop-surnames <file>]
//
// 入力は**素のテキスト**でよい。1行1件でも、空白・読点・カンマ区切りで
// 1行にずらっと並べてもよい（全角空白・全角カンマも受ける）。
// `#` で始まる行はコメントとして無視する。
//
// **順位つきの表もそのまま読める**（`3191位<TAB>中司<TAB>およそ3,900人`）。
// 人数が付いていればそこから重みを出す（`人数 ÷ pop-base × 100`）。
// ⚠ `pop-base` は日本の総人口ではなく**既存DBが使っている物差し**。
//    DBに既にある名前（朴3500人・陳3400人）の重みから逆算して 85,000,000。
//    ここを 124,000,000（実際の総人口）にすると新規分だけ2割軽くなり、
//    既存の裾（0.005）との間に段差ができる。
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
// 人数が付いていないときの姓の重み（既存の最小は 0.004）
const SUR_W = Number(arg('--weight', 0.012));
// 人数 → 重み の物差し。既存DBの重みから逆算した値（上のコメント参照）
const POP_BASE = Number(arg('--pop-base', 85_000_000));
// 総件数の上限。超えたぶんは**新規のうち重みの軽い順**に落とす
const LIMIT = arg('--limit') ? Number(arg('--limit')) : Infinity;
// 名は既存が全件 0.033 の一様。**一様のまま揃える**こと（片方だけ重みを
// 持たせると、新しく足した名前だけが出やすい／出にくいという偏りになる）。
const GIVEN_W = 0.033;
// 削除。ファイルパスでも、カンマ区切りで直接書いてもよい
const dropList = (v) => !v ? new Set()
  : new Set((fs.existsSync(path.resolve(v)) ? fs.readFileSync(path.resolve(v), 'utf8') : v)
      .split(/[\s,、,\n]+/u).map(s => s.trim()).filter(Boolean));

// --- 入力の読み取り --------------------------------------------------
// 1行1件でも、空白・カンマ区切りの羅列でも、順位つきの表でも同じように読む
const RANKED = /^\s*(\d+)\s*位[\t 　]+([^\t 　]+)[\t 　]+(?:およそ)?([\d,]+)\s*人/u;
const readList = (file, defWeight) => {
  if (!file) return [];
  const raw = fs.readFileSync(path.resolve(file), 'utf8');
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(RANKED);
    if (m) {
      const pop = Number(m[3].replace(/,/g, ''));
      // 有効数字が足りないと裾が全部同じ重みに丸まる。4桁まで残す
      out.push({ name: m[2].trim(), weight: Number((pop / POP_BASE * 100).toFixed(4)), pop, rank: Number(m[1]) });
      continue;
    }
    for (const s of line.split(/[\s,、,]+/u)) {
      const n = s.replace(/[\s　]/gu, '').trim();
      if (n) out.push({ name: n, weight: defWeight });
    }
  }
  return out;
};

// 名前として通す文字（漢字・ひらがな・カタカナ・長音）。
// 読みガナや注記が混ざっていたら弾いて報告する。
// ⚠ **CJK互換漢字(U+F900-FAFF)を必ず含めること**。`松﨑` の「﨑」（立つ崎）や
//    `髙` はここにあり、常用の `一-鿿` からは外れる。実在する姓なので弾いてはいけない
//    （実際に 松﨑・野﨑・石﨑・大﨑 の4件を落としていた）。
const NAME_OK = /^[㐀-䶿一-鿿豈-﫿々〇ぁ-ゟ゠-ヿ]{1,6}$/u;

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

const merge = (key, cands, label, limit = Infinity, drop = new Set()) => {
  const cur = parseArray(key);
  // ⚠ 既存にも重複がありうる（実際に「足立」が2件あった）。ここで畳む
  const seen = new Map();
  const dupInDb = [];
  for (const x of cur) {
    if (seen.has(x.name)) { dupInDb.push(x.name); continue; }
    seen.set(x.name, x);
  }

  const bad = [], already = [], dupInFile = [], added = [];
  const addedRank = new Map();
  const fileSeen = new Set();
  for (const c of cands) {
    if (!NAME_OK.test(c.name)) { bad.push(c.name); continue; }
    if (fileSeen.has(c.name)) { dupInFile.push(c.name); continue; }
    fileSeen.add(c.name);
    if (seen.has(c.name)) {
      already.push(c.name);
      // ⚠ 既存が下限に張り付いている（0.004）ところへ実際の人数が来たら、
      //    そちらを正とする。放っておくと「新規の方が既存より重い」逆転が残る
      if (c.pop && seen.get(c.name).weight > c.weight) seen.set(c.name, { name: c.name, weight: c.weight });
      continue;
    }
    added.push(c.name);
    addedRank.set(c.name, c.rank ?? Infinity);
    seen.set(c.name, { name: c.name, weight: c.weight });
  }

  // 上限を超えたぶんは**新規のうち順位が下のものから**落とす。
  // ⚠ 重みだけで並べてはいけない。裾は同人数（2100人）で何十件も並ぶので、
  //    同点のときに入力の**先に出てきた方**＝順位が上の方から消える
  const dropped = [];
  if (seen.size > limit) {
    const order = added.map(n => seen.get(n))
      .sort((a, b) => a.weight - b.weight || addedRank.get(b.name) - addedRank.get(a.name));
    for (const x of order) { if (seen.size <= limit) break; seen.delete(x.name); dropped.push(x.name); }
  }

  // 明示的な削除指定
  const removed = [], notFound = [];
  for (const n of drop) { if (seen.delete(n)) removed.push(n); else notFound.push(n); }

  const out = [...seen.values()];
  const show = (a, n = 8) => a.slice(0, n).join(' ') + (a.length > n ? ` …他${a.length - n}件` : '');
  console.log(`\n【${label}】 ${cur.length}件 → ${out.length}件`);
  console.log(`  追加            ${added.length - dropped.length}件`);
  if (removed.length)   console.log(`  指定により削除    ${removed.length}件  ${show(removed)}`);
  if (notFound.length)  console.log(`  ⚠ 削除指定が見つからない ${notFound.length}件  ${show(notFound)}`);
  if (dropped.length)   console.log(`  上限で落とした    ${dropped.length}件  ${show(dropped)}`);
  if (dupInDb.length)   console.log(`  既存DBの重複を除去  ${dupInDb.length}件  ${show(dupInDb)}`);
  if (already.length)   console.log(`  既にあった      ${already.length}件  ${show(already)}`);
  if (dupInFile.length) console.log(`  リスト内で重複    ${dupInFile.length}件  ${show(dupInFile)}`);
  if (bad.length)       console.log(`  ⚠ 名前として読めない ${bad.length}件  ${show(bad)}`);
  return out;
};

const surnames   = merge('surnames',   readList(arg('--surnames'), SUR_W),   '姓', LIMIT,
                         dropList(arg('--drop-surnames')));
const givenNames = merge('givenNames', readList(arg('--given'),    GIVEN_W), '名', LIMIT,
                         dropList(arg('--drop-given')));

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
