// 一人用の采配の試合を画面で通す（ブラウザ）。`npm run check:ui:managed`（ビルドしてから実行）。
//
// 大学野球で始めて開幕し、自分の試合を試合前の窓の「試合采配」→「試合終了まで」で2試合通す
// （1試合目は「おまかせ」入、2試合目は切。入／切は試合前の窓で選ぶ。以前は「試合采配」のあとに
// 2つ目のスタメン画面があり、そこで選んで「試合開始」を押していた）。采配の試合は 2026-11-24 に1球の計算・CPU の采配・
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
  // キー操作（監査16）: 左メニューの別の項目に合わせて Enter を押すと、その画面が開き、日は進まない
  // （以前は nav のボタンを全部キー操作の例外から外していたので、1日進むだけで画面は替わらなかった）
  {
    await ui.dismissHint();
    const dateOf = () => page.locator('h2 + div').first().innerText();
    const before = await dateOf();
    await page.getByRole('button', { name: /セーブ＆ロード/ }).focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    assert.equal(await page.getByRole('button', { name: /セーブ＆ロード/ }).getAttribute('aria-current'), 'page',
      '左メニューの項目に合わせて Enter を押しても、その画面が開かない');
    assert.equal(await dateOf(), before, '左メニューの項目で Enter を押したら日が進んだ');
    await page.getByRole('button', { name: /日程進行/ }).click();
    await page.waitForTimeout(500);
  }
  for (const omakase of [true, false]) {
    for (let i = 0; i < 20; i++) {
      if (await page.getByRole('button', { name: /試合采配/ }).count()) break;
      await ui.dismissHint();
      await page.getByRole('button', { name: /1日進める/ }).first().click();
      await page.waitForTimeout(700);
    }
    // 試合前の窓の「おまかせ采配 入／切」（前の試合の選択を覚えている）
    const toggle = page.getByRole('button', { name: /おまかせ采配/ });
    if ((await toggle.getAttribute('aria-pressed')) !== String(omakase)) await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), String(omakase), '試合前の窓でおまかせ采配を選べない');
    await page.getByRole('button', { name: /試合采配/ }).click();
    // 2つ目のスタメン画面を挟まず、すぐ試合が始まる
    await page.getByRole('button', { name: /試合終了まで/ }).waitFor({ timeout: 30000 });
    assert.equal(await page.getByRole('button', { name: /試合開始/ }).count(), 0, '「試合采配」のあとにまたスタメン画面が出た');
    assert.ok(await page.getByRole('button', { name: omakase ? /おまかせ ON/ : /おまかせ OFF/ }).count(),
      '試合前の窓で選んだおまかせ采配が試合に引き継がれていない');
    await page.getByRole('button', { name: /試合終了まで/ }).click();
    await page.getByRole('button', { name: /結果確定・翌日へ/ }).waitFor({ timeout: 180000 });
    // 確定ボタンは進行の列（1球の場所）に出て、送らずに見えること（以前は結果の欄の下で、900pxの画面の外）
    assert.equal(await page.getByRole('button', { name: /結果確定・翌日へ/ }).count(), 1, '確定ボタンが1つでない');
    const endBox = await page.getByRole('button', { name: /結果確定・翌日へ/ }).boundingBox();
    assert.ok(endBox && endBox.y >= 0 && endBox.y + endBox.height <= 900, `確定ボタンが画面の外: ${JSON.stringify(endBox)}`);
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
