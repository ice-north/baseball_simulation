// オンラインの見た目を写真に撮る道具（検査ではない）。
//   npx vite build && node tools/sim-harness/look-shot.mjs <出す場所>
// ホーム（PC・スマホ）・自球団の札・順位表を撮る。見た目を直したときの前後の比べに使う。
// ⚠ 順位は**作り物**（見た目を見るためだけ。試合は回していない）。
// ⚠ ファイル名を `-check.mjs` にしないこと（`run-checks.mjs` の登録の検査に引っかかる）。
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createTestStore } from './lib/testStore.mjs';
import { routeToService } from './lib/serviceRoute.mjs';
import { LeagueService } from '../../server/leagueService.mjs';

const html = await readFile(new URL('../../dist/index.html', import.meta.url), 'utf8');
const base = 'http://localhost:3000';
const out = process.argv[2] || '/tmp';

const dir = await mkdtemp(join(tmpdir(), 'look-shot-'));
const store = createTestStore(join(dir, 'league.json'));
const clock = () => '2026-10-26T15:00:00.000Z';
const service = new LeagueService(store, {
  members: [{ userId: 'admin', label: '管理者' }],
  adminId: 'admin',
  clock,
});
const sessionId = (await service.login('admin')).sessionId;
await service.command('admin', sessionId, { requestId: 'create-0', revision: 0, type: 'create' });
const created = (await store.read()).league;
await service.command('admin', sessionId, {
  requestId: 'packpick-0',
  revision: created.revision,
  type: 'submit',
  payload: { phaseId: created.phase.id, plan: { packId: created.packs[0].id }, ready: true, baseSubmission: null },
});
// 見た目を見るための作り物の順位（シーズン中の形）
await store.transaction((bundle) => {
  const l = bundle.league;
  l.season.currentDate = { year: 1, month: 7, day: 12 };
  l.phase = null;
  l.status = 'running';
  l.season.standings = l.season.standings.map((s, i) => {
    const wins = 62 - i * 3;
    const losses = 40 + i * 3;
    return { ...s, wins, losses, draws: i % 3, winRate: wins / (wins + losses), gamesPlayed: wins + losses + (i % 3) };
  });
  return [];
});

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 2 });
await routeToService(context, { service, store, sessionId, userId: 'admin' });
await context.route(`${base}/online`, (route) => route.fulfill({ contentType: 'text/html', body: html }));
const p = await context.newPage();
p.on('pageerror', (e) => console.log('pageerror:', e.message));
await p.goto(`${base}/online`);
await p.locator('.online-standings').first().waitFor();
await p.screenshot({ path: `${out}/home.png` });
await p.locator('.online-card').first().screenshot({ path: `${out}/hero.png` });
await p.locator('.online-standings').first().screenshot({ path: `${out}/standings.png` });
// スマホ幅も
const sp = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
await routeToService(sp, { service, store, sessionId, userId: 'admin' });
await sp.route(`${base}/online`, (route) => route.fulfill({ contentType: 'text/html', body: html }));
const m = await sp.newPage();
await m.goto(`${base}/online`);
await m.waitForTimeout(1200);
await m.screenshot({ path: `${out}/mobile.png` });
await browser.close();
console.log('撮った:', out);
