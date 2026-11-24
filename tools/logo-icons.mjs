// 球団ロゴの絵の形（パス）を書き出す。
//   npm pack @iconify-json/game-icons && tar xzf iconify-json-game-icons-*.tgz   （作業用のフォルダで）
//   node tools/logo-icons.mjs <展開した package/icons.json>
// 書き出す先は `public/look/logo-icons.json`（{ 名前: パスの d }。512×512 の箱）。
//
// - 絵は game-icons.net（https://game-icons.net 。Lorc・Delapouite ほか）の CC BY 3.0。
//   **作者の表示が要る**（`public/look/LICENSE-game-icons.txt` と、ロゴを作る画面の下の1行）。
// - 使う絵の名前は `src/online/look/logoMotifs.js`。足したらこれを回し直す。
// - 配布 HTML には埋め込まない（新しい見た目を入にした人だけが読む。約290KB）。
// - 小数は1桁に丸める（元は3桁。丸めても 100px では見分けがつかず、4割ほど軽くなる）。
import fs from 'node:fs';
import { LOGO_ICON_NAMES } from '../src/online/look/logoMotifs.js';

const source = process.argv[2];
if (!source) {
  console.error('使い方: node tools/logo-icons.mjs <@iconify-json/game-icons の icons.json>');
  process.exit(1);
}
const set = JSON.parse(fs.readFileSync(source, 'utf8'));

/** 数と命令に分けて、小数1桁で書き直す（「1.5.03」のように詰めて書いた数も正しく分ける） */
function round(d) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g);
  let out = '';
  let first = true;
  for (const t of tokens) {
    if (/[a-zA-Z]/.test(t)) {
      out += t;
      first = true;
      continue;
    }
    const v = String(Math.round(parseFloat(t) * 10) / 10);
    out += (first || v.startsWith('-') ? '' : ' ') + v;
    first = false;
  }
  return out;
}

const icons = {};
for (const name of LOGO_ICON_NAMES) {
  const icon = set.icons[name];
  if (!icon) throw new Error(`絵が見つからない: ${name}`);
  // ⚠ どの絵も1本のパス。2本以上の絵を足すなら、描く側（`logoArt.js`）も直すこと
  const paths = icon.body.match(/<path/g) || [];
  const d = icon.body.match(/ d="([^"]+)"/);
  if (paths.length !== 1 || !d) throw new Error(`1本のパスではない: ${name}`);
  // 弧（a）の旗を詰めて書いた絵（「a1 1 0 01 2 3」）は上の分け方では読めない
  for (const arc of d[1].match(/[aA][^a-zA-Z]*/g) || []) {
    const n = (arc.slice(1).match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || []).length;
    if (n % 7 !== 0) throw new Error(`弧の書き方を読めない: ${name}`);
  }
  icons[name] = round(d[1]);
}
const out = new URL('../public/look/logo-icons.json', import.meta.url);
fs.writeFileSync(out, `${JSON.stringify(icons)}\n`);
console.log(`${Object.keys(icons).length} 点、${fs.statSync(out).size} バイト`);
