// ============================================================
// expect-*.mjs の締め: 期待値（Web 版の答え）を書き出すか、`--check` なら書き出し済みの
// 期待値（mobile/shared/src/jvmTest/resources/ の下）と同じかを比べる。
// ⚠ `--check` は run-checks.mjs の quick で回る（Web 版だけ直したときに気づく）。
// ============================================================
import fs from 'node:fs';

/**
 * @param {string} text 期待値の JSON（1行）
 * @param {{ script: string, file: string, also: string }} where
 *   script: 書き出す道具の名前（expect-logic.mjs）/ file: resources からの場所 / also: 一緒に揃えるアプリの所
 */
export function emitExpected(text, { script, file, also }) {
  if (!process.argv.includes('--check')) {
    process.stdout.write(text + '\n');
    return;
  }
  const name = file.split('/').pop();
  const now = fs.readFileSync(new URL(`../shared/src/jvmTest/resources/${file}`, import.meta.url), 'utf8');
  if (now.trim() !== text) {
    console.error(
      `${name} が古い。node mobile/tools/${script} > mobile/shared/src/jvmTest/resources/${file} で書き出し直し、${also}`,
    );
    process.exit(1);
  }
  console.log(`${name} は Web 版の答えと一致しています`);
}
