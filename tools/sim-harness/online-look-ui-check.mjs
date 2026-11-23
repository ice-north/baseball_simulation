// 新しい見た目（試作）の画面検査。配布HTML（dist/index.html）を開く。サーバー不要（先に vite build）。
//   npm run check:online:look-ui
//
// 見ること:
//   - 既定は切。切のときは絵（`.online-look-art`）を1つも描かず、調子は今までの絵文字のまま
//   - PC の見出しの「新しい見た目（試作）」で入にすると、順位表・左メニューに球団マーク、
//     スタメン設定に選手の顔、選手の詳細に顔と段位の字、調子は自前の顔になる
//   - 入／切は端末に覚える（開き直しても入のまま）。リーグの球団でない名前にはマークを描かない
//   - スマホはメニュー（☰）から切り替えられる
//   - 字: 入のときだけ見出しが LookHead・数字が LookNum。見出しの中の注記と新聞は今までの字のまま。
//     見出しのフォント（public/fonts/、約450KB）は入にするまで読まない
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { withDeadline } from './lib/deadline.mjs';
import { seasonService, routeToService } from './lib/serviceRoute.mjs';

const html = await readFile(new URL('../../dist/index.html', import.meta.url), 'utf8');
const base = 'http://localhost:3000';
const LOOK_KEY = 'baseball-online-look-v1';
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROME_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHROME_CHANNEL } : {}),
  headless: true,
});
const errors = [];
const headFont = await readFile(new URL('../../public/fonts/look-head.woff2', import.meta.url));
let headFontLoads = 0;
const fontOf = (p, selector) => p.evaluate((sel) => getComputedStyle(document.querySelector(sel)).fontFamily, selector);
const EMOJI = /[🔥😊😐😞😰]/u;

async function open(contextOptions) {
  const fixture = await seasonService({ days: 6 });
  const context = await browser.newContext(contextOptions);
  await routeToService(context, fixture);
  await context.route(`${base}/online`, (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await context.route(`${base}/fonts/look-head.woff2`, (route) => {
    headFontLoads += 1;
    return route.fulfill({ contentType: 'font/woff2', body: headFont });
  });
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${base}/online`);
  return { p, context };
}

await withDeadline(
  (async () => {
    // --- PC -------------------------------------------------------------
    {
      const { p, context } = await open({ viewport: { width: 1440, height: 1000 } });
      const nav = p.locator('.online-page-nav');
      await nav.getByRole('button', { name: 'スタメン設定', exact: true }).waitFor();
      const toggle = p.locator('.online-header').getByRole('button', { name: /新しい見た目（試作）/ });
      // 既定は切
      assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
      assert.equal(await p.locator('.online-look-art').count(), 0, '切なのに絵が出ている');
      assert.equal(await p.locator('.online.online-look').count(), 0);
      const standingsNames = await p.locator('.online-standings tbody th').count();
      assert.ok(standingsNames >= 12, '順位表が出ていない');
      assert.doesNotMatch(await fontOf(p, '.online'), /LookNum/, '切なのに数字の字が変わっている');
      assert.doesNotMatch(await fontOf(p, '.online h2'), /LookHead/, '切なのに見出しの字が変わっている');
      await p.evaluate(() => document.fonts.ready);
      assert.equal(headFontLoads, 0, '切なのに見出しのフォントを読んだ');

      // 入にする
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
      await p.locator('.online.online-look').waitFor();
      assert.equal(
        await p.evaluate((key) => localStorage.getItem(key), LOOK_KEY),
        'new',
        '入／切を端末に覚えていない',
      );
      // 左メニューの自球団と、順位表の12球団にマーク
      assert.equal(await p.locator('.online-nav-context .online-team-mark').count(), 1);
      assert.equal(await p.locator('.online-standings .online-team-mark').count(), 12);
      // 自球団の色が CSS に渡っている
      const c2 = await p.evaluate(() =>
        getComputedStyle(document.querySelector('.online')).getPropertyValue('--team-c2').trim(),
      );
      assert.match(c2, /^#[0-9a-f]{6}$/, '自球団の色が渡っていない');
      // マークの字が空でない（英字か漢字）
      const monos = await p.locator('.online-standings .online-team-mark text').allTextContents();
      assert.equal(monos.length, 12);
      assert.equal(new Set(monos).size, 12, `12球団の字が重なった: ${monos}`);
      // 字: 見出しと数字。見出しの中の注記は本文の字に戻す
      assert.match(await fontOf(p, '.online'), /^LookNum,/);
      assert.match(await fontOf(p, '.online h2'), /^LookHead,/);
      assert.match(await fontOf(p, '.online h2 small'), /^LookNum,/, '見出しの中の注記まで見出しの字になった');
      await p.waitForFunction(() => document.fonts.check('16px LookHead'));
      assert.ok(headFontLoads > 0, '入なのに見出しのフォントを読んでいない');
      // 新聞は新聞の字のまま
      await p.locator('.online-paper-open').click();
      await p.locator('.online-paper h2').first().waitFor();
      assert.doesNotMatch(await fontOf(p, '.online-paper h2'), /LookHead/, '新聞の見出しまで変わった');
      await p.keyboard.press('Escape');
      await p.locator('.online-paper-dialog[open]').waitFor({ state: 'hidden' });

      // スタメン設定: 顔・調子の顔
      await nav.getByRole('button', { name: 'スタメン設定', exact: true }).click();
      await p.locator('.online-lineup-person').first().waitFor();
      assert.ok((await p.locator('.online-lineup-person .online-face').count()) >= 9, '選手の顔が出ていない');
      const conditionText = await p.locator('.online-lineup-person .online-condition').first().textContent();
      assert.doesNotMatch(conditionText, EMOJI, '入なのに調子が絵文字のまま');
      assert.ok(await p.locator('.online-lineup-person .online-condition-face').count());

      // 選手の詳細: 顔と段位の字
      await p.locator('.online-lineup-person .online-player-name').first().click();
      const dialog = p.locator('.online-player-dialog[open]');
      await dialog.waitFor();
      assert.equal(await dialog.locator('header .online-face').count(), 1);
      const chips = await dialog.locator('.online-rank-chip').allTextContents();
      assert.ok(chips.length >= 10, '段位の字が出ていない');
      for (const c of chips) assert.match(c, /^[SABCDEF]$/);
      await p.keyboard.press('Escape');

      // 開き直しても入のまま
      await p.reload();
      await nav.getByRole('button', { name: 'スタメン設定', exact: true }).waitFor();
      await p.locator('.online.online-look').waitFor();

      // 切に戻すと絵が消え、調子は絵文字に戻る
      await toggle.click();
      await nav.getByRole('button', { name: 'スタメン設定', exact: true }).click();
      await p.locator('.online-lineup-person').first().waitFor();
      assert.equal(await p.locator('.online-look-art').count(), 0, '切に戻しても絵が残った');
      const emoji = await p.locator('.online-lineup-person .online-condition').first().textContent();
      assert.match(emoji, EMOJI);
      assert.equal(await p.evaluate((key) => localStorage.getItem(key), LOOK_KEY), null);
      assert.doesNotMatch(await fontOf(p, '.online h1'), /LookHead/, '切に戻しても見出しの字が残った');
      await context.close();
    }

    // --- スマホ -----------------------------------------------------------
    {
      const { p, context } = await open({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      await p.getByRole('button', { name: 'メニュー', exact: true }).click();
      const toggle = p.locator('.online-mobile-menu-panel').getByRole('button', { name: /新しい見た目（試作）/ });
      assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
      await toggle.click();
      // 押すとメニューは閉じ、ホームの球団名にマークが付く
      await p.locator('.online.online-look').waitFor();
      assert.equal(await p.locator('.online-mobile-overview .online-team-mark').count(), 1);
      // スマホの順位表は名前を1行に保つためマークを出さない
      const shown = await p
        .locator('.online-standings .online-team-mark')
        .evaluateAll((els) => els.filter((el) => getComputedStyle(el).display !== 'none').length);
      assert.equal(shown, 0, 'スマホの順位表にマークが出ている');
      // 打順: 顔
      await p.getByRole('button', { name: '打順', exact: true }).first().click();
      await p.locator('.online-tap-name').first().waitFor();
      assert.ok((await p.locator('.online-tap-line1 .online-face').count()) >= 9);
      await context.close();
    }
  })(),
  'online-look-ui-check',
  120_000,
);
await browser.close();
assert.deepEqual(errors, [], `画面のエラー: ${errors.join('\n')}`);
console.log('online-look-ui-check: ok');
