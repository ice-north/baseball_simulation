// PC のスポーツ新聞（`src/online/SportsPaper.jsx`）を実画面で開く。
// 配布HTML（dist/index.html）を開き、通信はこの検査の中のリーグへつなぐ（`lib/serviceRoute.mjs`）。
//
// 見ること:
//  - ホームのリーグ順位の見出しの右に「スポーツ新聞」ボタンがあり、見出しの高さが変わらない
//    （PC のホームは 1000px に収める）
//  - 押すと紙面が開く。地元紙の1面（見出し・得点板・記事）、2面（チーム面）、3面（記録面。成績表）
//  - 全国紙に切り替えられる（題字が NEXT STAGE、1部戦線・2部戦線）
//  - 紙面の文に「null」「undefined」「NaN」が出ない
//  - Esc で閉じる
// PAPER_SHOTS=<dir> を付けると各面の画面写真を書き出す（目で確かめる用）。
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { launchBrowser, distHtml } from './lib/browser.mjs';
import { seasonService, routeToService } from './lib/serviceRoute.mjs';
import { failureShots } from './lib/failureShots.mjs';

const html = await distHtml();
const base = 'http://localhost:3000';
const shots = process.env.PAPER_SHOTS || null;
const browser = await launchBrowser();
const errors = [];
try {
  const fixture = await seasonService({ days: 12 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await routeToService(context, fixture);
  await context.route(`${base}/online`, (route) => route.fulfill({ contentType: 'text/html', body: html }));
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${base}/online`);
  const head = p.locator('.online-standings-head');
  await head.waitFor();
  const button = head.getByRole('button', { name: 'スポーツ新聞' });
  assert.equal(await button.count(), 1, 'リーグ順位の見出しにスポーツ新聞のボタンが無い');
  const box = await head.boundingBox();
  assert.ok(box.height <= 34, `見出しの行が高くなった（${box.height}px）`);
  const pageHeight = await p.evaluate(() => document.documentElement.scrollHeight);
  if (shots) await p.screenshot({ path: join(shots, 'paper-home.png') });

  await button.click();
  const dialog = p.locator('.online-paper-dialog');
  await dialog.waitFor();
  const paper = dialog.locator('.online-paper');
  await paper.locator('.paper-masthead').waitFor();
  const checkText = async (label) => {
    const text = await paper.innerText();
    for (const bad of ['null', 'undefined', 'NaN']) assert.ok(!text.includes(bad), `${label}に「${bad}」が出た:\n${text}`);
    return text;
  };
  // 地元紙1面
  const front = await checkText('地元紙1面');
  assert.match(front, /球報/, '地元紙の題字が無い');
  assert.ok((await paper.locator('.paper-article').count()) >= 2, '1面の記事が少ない');
  assert.ok((await paper.locator('.paper-board').count()) === 1, '1面の得点板が無い');
  if (shots) await p.screenshot({ path: join(shots, 'paper-local-1.png') });
  // 2面・3面
  const tab = (name) => dialog.getByRole('tab', { name, exact: true });
  await tab('2面').click();
  await paper.locator('.paper-team').waitFor();
  await checkText('地元紙2面');
  assert.ok((await paper.locator('.paper-team-side table').count()) >= 1, '2面のチームの今が無い');
  if (shots) await p.screenshot({ path: join(shots, 'paper-local-2.png') });
  await tab('3面').click();
  await paper.locator('.paper-record').waitFor();
  await checkText('地元紙3面');
  assert.equal(await paper.locator('.paper-box').count(), 2, '3面の成績表が2球団ぶん無い');
  if (shots) await p.screenshot({ path: join(shots, 'paper-local-3.png') });
  // 全国紙
  await tab('全国紙').click();
  await paper.locator('.paper-front').waitFor();
  const national = await checkText('全国紙');
  assert.match(national, /NEXT STAGE/, '全国紙の題字が無い');
  assert.match(national, /1部戦線/, '全国紙に1部戦線が無い');
  if (shots) await p.screenshot({ path: join(shots, 'paper-national.png') });
  // Esc で閉じる
  await p.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await p.evaluate(() => document.documentElement.scrollHeight), pageHeight, '閉じたあとホームの高さが変わった');
  assert.deepEqual(errors, [], `画面の例外: ${errors.join('\n')}`);
  console.log('online-paper-ui-check: OK');
} catch (e) {
  await failureShots(browser, 'online-paper-ui');
  throw e;
} finally {
  await browser.close();
}
