// 年代記の画面（PC）を目で確かめるためのスクショ。検査ではない（手で回す）。
//   node tools/sim-harness/lib/chronicle-shots.mjs <出力先>
// 開発サーバーの保存を作り（シーズン終盤まで進める）、vite の画面を開いて撮る。
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { FileStore } from '../../../server/storage/fileStore.mjs';
import { LeagueService } from '../../../server/leagueService.mjs';

const out = resolve(process.argv[2] || 'chronicle-shots');
mkdirSync(out, { recursive: true });
const file = join(out, 'league.json.gz');
const service = new LeagueService(new FileStore(file), {
  local: true,
  adminId: 'player1',
  members: [{ userId: 'player1', label: 'プレイヤー1' }],
});
const session = (await service.login('player1')).sessionId;
let seq = 0;
const view = () => service.view('player1', session);
const send = async (type, payload) =>
  service.command('player1', session, { requestId: `shot-${++seq}-${Date.now()}`, revision: (await view()).revision ?? 0, type, payload });
await send('create');
await send('testmode', { on: true });
for (let guard = 0; guard < 80; guard++) {
  const v = await view();
  const left = v.races?.some((r) => !r.clinched) && v.chronicle?.milestones?.length >= 5;
  if (left) break;
  if (v.status === 'running') await send('step', { turns: 8 });
  else await send('resolve');
}
console.log('場面できた');
const server = spawn('node', ['server/dev.mjs'], { env: { ...process.env, ONLINE_DATA_FILE: file, ONLINE_DISABLE_TIMER: '1' }, stdio: 'inherit' });
const vite = spawn('npx', ['vite', '--port', '3000', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 6000));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.goto('http://localhost:3000/online');
  await page.getByRole('button', { name: /プレイヤー1/ }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(out, 'home.png'), fullPage: true });
  await page.getByRole('button', { name: '球団史・記録' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(out, 'chronicle.png'), fullPage: true });
} finally {
  await browser.close();
  server.kill();
  vite.kill();
}
