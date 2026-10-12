// ============================================================
// スコープ検証 - 未定義の識別子を静的に検出する
//
// 【なぜ必要か】
// 采配モード（App.jsx）はReactコンポーネントの中に閉じているため、
// sim-harness では一度も実行されない。自動シミュレーションだけが
// テストされている状態で、**采配モードのスコープ由来のバグは
// ブラウザで踏むまで分からない**。
//
// 実際に起きた事故:
//   simulateSinglePitch から currentBatter（simulatePitch のローカル）を参照し、
//   投球のたびに ReferenceError で試合が進まなくなった。
//   ビルドは通り、season-check も全項目PASSしていた。
//
// `useGameStrategy.js` の冒頭にも「別関数からローカル変数を参照して
// ReferenceError」を構造的に防ぐ、と書いてある通り、この作品では
// 繰り返し起きているパターン。ここで機械的に潰す。
// ============================================================

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
const traverse = _traverse.default || _traverse;

const ROOT = new URL('../../src', import.meta.url).pathname;

// ブラウザ/Node のグローバル。ここに無いものを未定義とみなす
const GLOBALS = new Set([
  'window', 'document', 'console', 'Math', 'JSON', 'Object', 'Array', 'String',
  'Number', 'Boolean', 'Date', 'RegExp', 'Error', 'TypeError', 'Promise', 'Set',
  'Map', 'WeakMap', 'WeakSet', 'Symbol', 'Infinity', 'NaN', 'undefined', 'globalThis',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
  'localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'alert', 'confirm', 'prompt',
  'Blob', 'File', 'FileReader', 'URL', 'TextEncoder', 'TextDecoder', 'Intl',
  'structuredClone', 'CompressionStream', 'DecompressionStream', 'Response', 'Request',
  'btoa', 'atob', 'crypto', 'performance', 'navigator', 'location', 'history',
  'process', 'Buffer', 'React', 'HTMLElement', 'Event', 'CustomEvent', 'AbortController',
  'Uint8Array', 'Int8Array', 'Float32Array', 'Float64Array', 'ArrayBuffer', 'DataView',
  'Proxy', 'Reflect', 'BigInt', 'queueMicrotask', 'reportError', 'DOMParser', 'Image',
]);

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFiles(p));
    else if (/\.(js|jsx)$/.test(name)) out.push(p);
  }
  return out;
}

const problems = [];
const warnings = [];
for (const file of jsFiles(ROOT)) {
  const code = readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  } catch (e) {
    problems.push({ file, line: e.loc?.line ?? 0, name: `構文エラー: ${e.message}` });
    continue;
  }
  traverse(ast, {
    ReferencedIdentifier(path) {
      const { name } = path.node;
      if (GLOBALS.has(name)) return;
      if (path.scope.hasBinding(name, true)) return;
      // `typeof x` は未宣言でも例外にならない。クラッシュはしないが、
      // 「常に undefined になるガード」＝到達しない分岐なので警告として出す
      const p = path.parent;
      if (p?.type === 'UnaryExpression' && p.operator === 'typeof') {
        warnings.push({ file, line: path.node.loc?.start.line ?? 0, name });
        return;
      }
      problems.push({ file, line: path.node.loc?.start.line ?? 0, name });
    },
  });
}

const rel = (f) => relative(new URL('../..', import.meta.url).pathname, f);
console.log('\n\x1b[1m■ スコープ検証（未定義の識別子）\x1b[0m');
console.log('─────────────────────────────────────────────');
for (const w of warnings) {
  console.log(`  \x1b[33m!\x1b[0m ${rel(w.file)}:${w.line}  typeof ${w.name} は常に 'undefined'（到達しない分岐）`);
}
if (problems.length === 0) {
  console.log(`  \x1b[32m✓\x1b[0m 未定義の参照なし  \x1b[2m(${jsFiles(ROOT).length}ファイル)\x1b[0m`);
  console.log('─────────────────────────────────────────────');
  console.log('  \x1b[32m\x1b[1mPASS\x1b[0m');
} else {
  for (const p of problems.slice(0, 40)) {
    console.log(`  \x1b[31m✗\x1b[0m ${rel(p.file)}:${p.line}  \x1b[1m${p.name}\x1b[0m は未定義`);
  }
  if (problems.length > 40) console.log(`  … 他 ${problems.length - 40} 件`);
  console.log('─────────────────────────────────────────────');
  console.log(`  \x1b[31m\x1b[1mFAIL\x1b[0m — ${problems.length} 件`);
  process.exitCode = 1;
}
