// ============================================================
// CLAUDE.md の腐り検査
//
// この作品の開発は「文書に書いた“こうなっているはず”と実測がずれた瞬間に
// 不具合が見つかる」という形で回っている。だから**腐った文書は、無い文書より悪い**
// ——権威に見えるので、間違った前提のまま作業が進む。
//
// 実際に見つかった腐り（この検査を作る動機）:
//   - App.jsx のセクション行番号表が「RENDER: L2131」と書いてあるのに実際は L2995。
//     しかも同じ表が App.jsx と CLAUDE.md の2箇所にあり、両方とも腐っていた
//   - `ROLE_INFO` を現在形で参照していたが、実際の名前は `PITCHER_ROLES`
//   - `practiceOffset` / `declineRate` を現在の実装として説明していたが、
//     成長エンジンを2項モデルへ書き換えたときに消えていた
//   - ファイル行数の申告が最大56%ずれていた（simulation-logic.js 675→1055）
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Report } from './lib/report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const md = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');

// ソース全体を1本に（識別子の実在確認用）
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
  // ⚠ **CSS も走査対象に入れること**。CLAUDE.md は `.btn-primary` / `--accent` /
  //    `body` のようなCSS側の名前も参照する。JSだけ見ていると誤検知する
  //    （実際、地色を body に敷いた追記で `html` が未解決として引っ掛かった）。
  return /\.(js|jsx|mjs|css)$/.test(e.name) ? [p] : [];
});
const srcFiles = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'tools'))];
const blob = srcFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');
// ⚠ **ファイル名ではなく中身を読むこと**。`.join('\n')` でファイル名を並べただけ
//    だったので、`vite.config.js` の中の識別子（`strictPort` 等）を照合できず、
//    実在するのに未解決として弾いていた。ルート直下の設定ファイルは
//    `package.json` の scripts や `vite.config.js` の設定名を文書が参照する。
const rootCfg = fs.readdirSync(ROOT)
  .filter(f => /\.(js|json|cjs)$/.test(f))
  .map(f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return f; } })
  .join('\n');

// ⚠ **「もう存在しない」と明示して書いてあるものは腐りではない**。
//    失敗の記録・撤廃の記録はこの作品の資産なので、消させてはいけない。
//    ここに足すときは「なぜ src に無いのか」を必ず書くこと。
const REMOVED_ON_PURPOSE = {
  lastGameResults: '描画されていなかった state。「昨日の結果」実装時に除去（歴史の記録）',
  defenseShift:    '守備シフト廃止時に state ごと除去（歴史の記録）',
  corpExpBonus:    'カテゴリ加点の撤廃で削除（歴史の記録）',
  SHAPE_BY_PITCH:  'pitchShape.PITCH_AXIS_SIDE に一本化して削除（歴史の記録）',
  batterCommitRate: 'commitRateFor へ改名（見出しに「→」で明示）',
  practiceOffset:  '成長の2項モデル化で置き換え（歴史の記録）',
  declineRate:     '同上',
  EGRESS_BLOCKED:  'egressプロキシのエラー文字列。コードではない',
};

const r = new Report('■ CLAUDE.md の腐り検査');

// --- 1) 参照している識別子が実在するか -------------------------------
const idRe = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
const SKIP = /^(true|false|null|undefined|if|for|const|let|return|new|Math|Date|Object|Array|JSON|String|Number|npm|node|git|src|tools|window|document|React|number|string|boolean)$/;
const ids = [...new Set([...md.matchAll(/`([^`\n]{3,60})`/g)]
  .map(m => m[1].replace(/\(\)$/, '').trim())
  .filter(x => idRe.test(x) && !SKIP.test(x)))];

const dangling = ids.filter(id => {
  const head = id.split('.')[0];
  if (head.length < 3) return false;
  if (REMOVED_ON_PURPOSE[id] || REMOVED_ON_PURPOSE[head]) return false;
  return !blob.includes(head) && !rootCfg.includes(head) && !fs.existsSync(path.join(ROOT, id));
});
r.assert('参照する識別子がsrcに実在', dangling.length === 0,
  `${ids.length}件を照合${dangling.length ? ' / 未解決: ' + dangling.join(', ') : ''}`);

// --- 2) ファイル行数の申告が実測と合っているか -----------------------
let worstDrift = 0, worstName = '';
for (const m of md.matchAll(/`(src\/[^`]+\.(?:js|jsx))`\s*\(~(\d+)行\)/g)) {
  const [, rel, claimed] = m;
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { worstDrift = 999; worstName = rel + '(存在しない)'; continue; }
  const actual = fs.readFileSync(p, 'utf8').split('\n').length;
  const drift = Math.abs(actual - +claimed) / +claimed * 100;
  if (drift > worstDrift) { worstDrift = drift; worstName = `${rel} 申告${claimed}/実測${actual}`; }
}
r.band('ファイル行数の申告ずれ(最大)', worstDrift, 0, 15, v => `${v.toFixed(0)}%`);
r.info('  最もずれているもの', worstName);

// --- 3) 参照している src のパスが実在するか --------------------------
const paths = [...new Set([...md.matchAll(/`(src\/[A-Za-z0-9_\-/]+\.(?:js|jsx|css))`/g)].map(m => m[1]))];
const missingPaths = paths.filter(p => !fs.existsSync(path.join(ROOT, p)));
r.assert('参照するファイルパスが実在', missingPaths.length === 0,
  `${paths.length}件を照合${missingPaths.length ? ' / 無い: ' + missingPaths.join(', ') : ''}`);

// --- 4) App.jsx のセクションマーカー ---------------------------------
// ⚠ 行番号を文書に書かせないための仕組み。マーカーが消えたら検知する
const appjsx = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
const markers = [...appjsx.matchAll(/\/\/ \[SECTION: ([A-Z_]+)\]/g)].map(m => m[1]);
const wantSections = ['APP_STATE', 'GAME_HANDLERS', 'THROW_PITCH', 'GAME_CONTROLS',
                      'GAME_SETUP', 'SEASON_PROGRESS', 'RENDER'];
const lostMarkers = wantSections.filter(x => !markers.includes(x));
r.assert('App.jsxのSECTIONマーカー', lostMarkers.length === 0,
  `${markers.length}個検出${lostMarkers.length ? ' / 欠落: ' + lostMarkers.join(', ') : ''}`);

// ⚠ 行番号を書き戻していないか（腐りの再発）
const hasLineTable = /\[SECTION: [A-Z_]+\]\s*L\d+/.test(appjsx) || /\| *L\d+-\d+ *\|/.test(md);
r.assert('セクション行番号を書いていない', !hasLineTable,
  hasLineTable ? '行番号の表が復活している（grepで引く方式に戻すこと）' : 'grepで引く方式を維持');

r.print();
process.exit(r.passed ? 0 : 1);
