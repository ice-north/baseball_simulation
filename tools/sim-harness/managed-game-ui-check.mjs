// 一人用の采配の試合を画面で通す（ブラウザ）。`npm run check:ui:managed`（ビルドしてから実行）。
//
// 大学野球で始めて開幕し、自分の試合を「試合采配」→「試合開始」→「試合終了まで」で2試合通す
// （1試合目は「おまかせ」入、2試合目は切）。采配の試合は 2026-11-24 に1球の計算・CPU の采配・
// 成績の書き戻しを自動の試合の正本へつないだ（managed-game-check が関数を直接見る）。
// ここでは画面の中で最後まで動くこと・ページの例外が出ないこと・結果の画面が出ることを見る。
// 所要時間は約2分。スクリーンショットは /tmp/baseball-managed-*.png に残す。
import assert from 'node:assert/strict';
import { driver, launchBrowser, startPreview } from './lib/singleplayer.mjs';

const stop = await startPreview();
const browser = await launchBrowser();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 300)); });
page.on('dialog', d => d.accept());
const ui = driver(page);
let failed = null;
try {
  await ui.newUniversityGame();
  for (const omakase of [true, false]) {
    for (let i = 0; i < 20; i++) {
      if (await page.getByRole('button', { name: /試合采配/ }).count()) break;
      await ui.dismissHint();
      await page.getByRole('button', { name: /1日進める/ }).first().click();
      await page.waitForTimeout(700);
    }
    await page.getByRole('button', { name: /試合采配/ }).click();
    await page.getByRole('button', { name: /試合開始/ }).click();
    await page.getByRole('button', { name: /試合終了まで/ }).waitFor({ timeout: 30000 });
    if (!omakase) await page.getByRole('button', { name: /おまかせ ON/ }).first().click();
    await page.getByRole('button', { name: /試合終了まで/ }).click();
    await page.getByRole('button', { name: /結果確定・翌日へ/ }).waitFor({ timeout: 180000 });
    const text = await page.locator('body').innerText();
    assert.match(text, /試合終了|サヨナラ/, '試合の終わりの知らせが出ていない');
    assert.match(text, /勝利投手|引き分け/, '結果の画面に勝利投手が出ていない');
    const changes = text.match(/投手交代[^\n]*/g) || [];
    console.log(`- おまかせ${omakase ? '入' : '切'}: ${(text.match(/試合終了[^\n]*|サヨナラ[^\n]*/) || [''])[0]}（投手交代の知らせ ${changes.length}件）`);
    await page.screenshot({ path: `/tmp/baseball-managed-${omakase ? 'on' : 'off'}.png` });
    await page.getByRole('button', { name: /結果確定・翌日へ/ }).click();
    await page.waitForTimeout(1500);
  }
  assert.deepEqual(errors, [], 'ページの例外・console.error が出た');
} catch (e) {
  failed = e;
  await page.screenshot({ path: '/tmp/baseball-managed-failure.png' }).catch(() => {});
} finally {
  await browser.close();
  await stop();
}
if (failed) { console.error(errors.join('\n')); throw failed; }
console.log('■ 一人用の采配の試合（画面）: OK（おまかせ入・切で最後まで通る）');
