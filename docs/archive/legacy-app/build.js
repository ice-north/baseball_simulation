#!/usr/bin/env node

/**
 * ビルドスクリプト
 * 分割されたJavaScriptファイルを1つのHTMLファイルに結合します
 */

const fs = require('fs');
const path = require('path');

console.log('🔨 ビルド開始...\n');

// 外部JavaScriptファイルを読み込み
const constantsJS = fs.readFileSync('js/constants.js', 'utf8');
const playersJS = fs.readFileSync('js/players.js', 'utf8');
const simulationJS = fs.readFileSync('js/simulation-logic.js', 'utf8');

console.log('✅ JavaScriptファイルを読み込みました');

// index.htmlを読み込み
let html = fs.readFileSync('index.html', 'utf8');

console.log('✅ index.htmlを読み込みました');

// 外部ファイル読み込み部分を置換
const replacementScript = `  <script src="https://cdn.tailwindcss.com"></script>
  <!-- 以下、結合されたJavaScript -->
  <script>
${constantsJS}
  </script>
  <script>
${playersJS}
  </script>
  <script>
${simulationJS}
  </script>`;

html = html.replace(
  /  <script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\s+<!-- 外部JavaScriptファイルを読み込み -->\s+<script src="js\/constants\.js"><\/script>\s+<script src="js\/players\.js"><\/script>\s+<script src="js\/simulation-logic\.js"><\/script>/,
  replacementScript
);

console.log('✅ JavaScriptを統合しました');

// distフォルダがなければ作成
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
  console.log('✅ distフォルダを作成しました');
}

// 結合版を出力
const outputPath = 'dist/baseball-simulator-combined.html';
fs.writeFileSync(outputPath, html);

console.log(`\n🎉 ビルド完了！`);
console.log(`📁 出力先: ${outputPath}`);
console.log(`📊 ファイルサイズ: ${Math.round(html.length / 1024)} KB\n`);
