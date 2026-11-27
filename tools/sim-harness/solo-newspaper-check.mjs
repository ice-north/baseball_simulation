// 一人用のスポーツ新聞1面（`buildTeamPageData`）の材料を直接確かめる（監査16）。
// ⚠ 連勝・連敗は直近5試合だけで数えていたので、8連勝でも「5連勝」と出ていた。
// 画面の部品は node から直接読めない（JSX）ので、esbuild で1本にまとめてから読む。
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const result = await build({
  stdin: {
    contents: "export { buildTeamPageData } from '../../src/components/dateProgress/Newspaper.jsx';",
    resolveDir: here, loader: 'jsx',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, jsx: 'automatic',
  loader: { '.js': 'jsx', '.css': 'empty' }, logLevel: 'error',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
const dir = await mkdtemp(join(tmpdir(), 'solo-paper-'));
try {
  const file = join(dir, 'paper.mjs');
  await writeFile(file, result.outputFiles[0].text);
  const { buildTeamPageData } = await import(pathToFileURL(file).href);
  const me = '自軍';
  // 1敗のあと8連勝（日付順）
  const verdicts = ['L', 'W', 'W', 'W', 'W', 'W', 'W', 'W', 'W'];
  const schedule = verdicts.map((v, i) => ({
    date: { month: 4, day: i + 1 }, home: me, away: '相手',
    result: { homeScore: v === 'W' ? 3 : 1, awayScore: v === 'W' ? 1 : 3 },
  }));
  const data = buildTeamPageData({ schedule, standings: [], currentDate: { month: 4, day: 20 } }, me, null);
  assert.equal(data.recent.length, 5, '直近の試合は5つまで');
  assert.equal(data.streak, 8, `8連勝が ${data.streak} 連勝と数えられた`);
  console.log('■ 一人用の新聞1面: OK（連勝は直近5試合で止まらない）');
} finally {
  await rm(dir, { recursive: true, force: true });
}
