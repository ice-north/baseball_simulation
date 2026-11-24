// 球団ロゴの画面検査。配布HTML（dist/index.html）を開く。サーバー不要（先に vite build）。
//   npm run check:online:logo-ui
//
// 見ること:
//   - 新しい見た目（試作）が切のとき: 「ロゴを作る」の入口が無く、絵の形（/look/logo-icons.json）を読まない
//   - 入のとき: 順位表の12球団にロゴが出て、絵の形を読むのは1回だけ。左メニューに「ロゴを作る」
//   - 小窓: 1 おまかせ＝候補12個（押すと見本が変わる・別の候補を出せる）、2 少し変える＝型を送る・頭文字を打つ、
//     3 こだわる＝見本の部品を押して選ぶ・大きさと色を変える・足す・消す
//   - 保存すると `profile` 命令でロゴが送られ、左メニューのマークが変わる。開き直すと「自動のロゴに戻す」が出て、戻せる
//   - 絵の素材の作者の表示が小窓にある（利用条件。消さない）
//   - スマホ: メニュー（☰）から開ける。横にはみ出さない
//   画面写真は `LOOK_SHOTS=<置き場>` を付けると書き出す
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { withDeadline } from './lib/deadline.mjs';
import { launchBrowser, distHtml } from './lib/browser.mjs';
import { seasonService, routeToService } from './lib/serviceRoute.mjs';

const html = await distHtml();
const base = 'http://localhost:3000';
const LOOK_KEY = 'baseball-online-look-v1';
const SHOTS = process.env.LOOK_SHOTS || '';
const browser = await launchBrowser();
const errors = [];
// ⚠ 絵の形を配布HTMLに埋め込むと、切の人まで重くなる（280KB）
assert.ok(!html.includes('M253.7 20.4c-8.8 0.1-17.4 0.8-25.9 2.3'), '絵の形が配布HTMLに埋め込まれた');

async function open(fixture, contextOptions, { look = false } = {}) {
  const context = await browser.newContext({ deviceScaleFactor: SHOTS ? 2 : 1, ...contextOptions });
  if (look) await context.addInitScript((key) => localStorage.setItem(key, 'new'), LOOK_KEY);
  const { commands } = await routeToService(context, fixture);
  await context.route(`${base}/online`, (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await context.route(`${base}/fonts/*.woff2`, async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    return route.fulfill({ contentType: 'font/woff2', body: await readFile(new URL(`../../public/fonts/${name}`, import.meta.url)) });
  });
  const iconLoads = { n: 0 };
  await context.route(`${base}/look/logo-icons.json`, async (route) => {
    iconLoads.n += 1;
    return route.fulfill({
      contentType: 'application/json',
      body: await readFile(new URL('../../public/look/logo-icons.json', import.meta.url)),
    });
  });
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${base}/online`);
  return { p, context, commands, iconLoads };
}
/** 絵の中身（描く手順の違いを見るための文字列） */
const markOf = (locator) => locator.evaluate((e) => e.innerHTML);
/** 画面写真（小窓はふわっと出るので、出きってから撮る） */
async function shot(target, name) {
  if (!SHOTS) return;
  await new Promise((done) => setTimeout(done, 350));
  await target.screenshot({ path: `${SHOTS}/${name}.png` });
}

await withDeadline(
  (async () => {
    const fixture = await seasonService({ days: 6 });

    // --- 切: 入口が無く、絵の形も読まない ----------------------------------
    {
      const { p, context, iconLoads } = await open(fixture, { viewport: { width: 1440, height: 1000 } });
      const nav = p.locator('.online-page-nav');
      await nav.getByRole('button', { name: '名前を変える' }).waitFor();
      assert.equal(await nav.getByRole('button', { name: 'ロゴを作る' }).count(), 0, '切なのにロゴを作る入口が出ている');
      assert.equal(await p.locator('.online-look-art').count(), 0);
      assert.equal(iconLoads.n, 0, '切なのに絵の形を読んだ');
      await context.close();
    }

    // --- PC（入） ---------------------------------------------------------
    {
      const { p, context, commands, iconLoads } = await open(fixture, { viewport: { width: 1440, height: 1000 } }, { look: true });
      const nav = p.locator('.online-page-nav');
      await nav.getByRole('button', { name: 'ロゴを作る' }).waitFor();
      // 順位表の12球団にロゴ（部品の重ね＝`data-li` の付いた図形がある）
      const marks = p.locator('.online-standings .online-team-mark');
      assert.equal(await marks.count(), 12);
      await p.waitForFunction(() => document.querySelectorAll('.online-standings .online-team-mark [data-li]').length >= 12);
      assert.equal(new Set(await marks.evaluateAll((els) => els.map((e) => e.innerHTML))).size, 12, '同じロゴの球団がある');
      const navMark = nav.locator('.online-nav-mark');
      // 絵の形が届くと、絵を使うロゴは絵つきで描き直す
      await p.waitForFunction(() => document.querySelector('.online-nav-mark path[d]'));
      const before = await markOf(navMark);
      await shot(p.locator('.online-standings').first(), 'logo-standings-pc');
      await shot(nav, 'logo-nav-pc');

      await nav.getByRole('button', { name: 'ロゴを作る' }).click();
      const dialog = p.locator('.online-logo-dialog[open]');
      await dialog.waitFor();
      const stage = dialog.locator('.online-logo-stage');
      // 1 おまかせ: 候補は12個。開いた直後の見本は、いまのロゴ（自動＝候補の1つめ）
      const cands = dialog.locator('.online-logo-cands button');
      assert.equal(await cands.count(), 12);
      await p.waitForFunction(() => document.querySelectorAll('.online-logo-cands path[d]').length >= 12);
      assert.match(await dialog.locator('.online-logo-foot').textContent(), /game-icons\.net.*CC BY 3\.0/, '絵の素材の作者の表示が無い');
      assert.equal(await dialog.getByRole('button', { name: '自動のロゴに戻す' }).count(), 0, '作っていないのに戻すボタンが出ている');
      await shot(dialog, 'logo-editor-pick-pc');
      const first = await markOf(stage);
      await cands.nth(3).click();
      const picked = await markOf(stage);
      assert.notEqual(picked, first, '候補を押しても見本が変わらない');
      const candsBefore = await markOf(dialog.locator('.online-logo-cands'));
      await dialog.getByRole('button', { name: '別の候補を出す' }).click();
      assert.notEqual(await markOf(dialog.locator('.online-logo-cands')), candsBefore, '別の候補が出ない');
      // 候補はどれも違う絵
      assert.ok(new Set(await cands.evaluateAll((els) => els.map((e) => e.innerHTML))).size >= 11, '候補が重なっている');

      // 2 少し変える: 型を送ると見本が変わる。頭文字を打つと字が変わる
      await dialog.getByRole('button', { name: '2 少し変える' }).click();
      await dialog.getByRole('button', { name: '型を次へ' }).click();
      const tuned = await markOf(stage);
      assert.notEqual(tuned, picked, '型を送っても見本が変わらない');
      for (let i = 0; i < 12 && (await dialog.locator('.online-logo-knob output').first().textContent()) !== '台座に頭文字'; i++)
        await dialog.getByRole('button', { name: '型を次へ' }).click();
      await dialog.getByLabel('頭文字を打つ').fill('QZ');
      assert.ok((await stage.locator('text').allTextContents()).includes('QZ'), '打った頭文字がロゴに出ない');
      assert.ok((await dialog.locator('.online-logo-picker button').count()) >= 200, '絵の一覧が出ない');
      await shot(dialog, 'logo-editor-tune-pc');

      // 3 こだわる: 見本の部品を押すと選ばれる（枠が出る）。大きさを変える・足す・消す
      await stage.locator('text').first().click();
      await dialog.locator('.online-logo-frame').waitFor();
      assert.equal(await dialog.getByRole('button', { name: '3 こだわる' }).getAttribute('aria-pressed'), 'true');
      const layersBefore = await dialog.locator('.online-logo-layers li').count();
      const size = dialog.getByLabel('大きさ');
      const crafted0 = await markOf(stage);
      await size.fill('40');
      assert.notEqual(await markOf(stage), crafted0, '大きさを変えても見本が変わらない');
      await dialog.getByRole('button', { name: '＋台座・飾り' }).click();
      assert.equal(await dialog.locator('.online-logo-layers li').count(), layersBefore + 1);
      await shot(dialog, 'logo-editor-craft-pc');
      await dialog.getByRole('button', { name: '消す' }).click();
      assert.equal(await dialog.locator('.online-logo-layers li').count(), layersBefore);
      // 手を入れたあとに 1・2 へ戻ると、消える旨を知らせる
      await dialog.getByRole('button', { name: '2 少し変える' }).click();
      assert.match(await dialog.getByRole('note').textContent(), /手直しは消えます/);

      // 色の組を変えると、見本の色が変わる
      const colored0 = await markOf(stage);
      await dialog.locator('.online-logo-palettes button[aria-pressed="false"]').nth(5).click();
      assert.notEqual(await markOf(stage), colored0, '色の組を変えても見本が変わらない');

      // 保存: profile 命令でロゴが送られ、左メニューのマークが変わる
      const want = await markOf(stage);
      await dialog.getByRole('button', { name: 'このロゴを保存する' }).click();
      await dialog.waitFor({ state: 'detached' });
      const sent = commands.filter((c) => c.type === 'profile').at(-1);
      assert.ok(sent?.payload?.logo?.layers?.length, 'ロゴが送られていない');
      assert.equal(sent.payload.logo.colors.length, 3);
      await p.waitForFunction((old) => document.querySelector('.online-nav-mark')?.innerHTML !== old, before);
      assert.ok((await navMark.locator('text').allTextContents()).includes('QZ'), '保存したロゴが左メニューに出ない');
      assert.ok(want.includes('QZ'));
      // 球団の色（帯と区切りの色）も選んだ色になる
      const c2 = await p.evaluate(() => getComputedStyle(document.querySelector('.online')).getPropertyValue('--team-c2').trim());
      assert.equal(c2, sent.payload.logo.colors[1], '選んだ色が球団の色になっていない');
      await shot(nav, 'logo-nav-saved-pc');

      // 開き直すと保存したロゴから始まり、自動に戻せる
      await p.reload();
      await nav.getByRole('button', { name: 'ロゴを作る' }).click();
      await dialog.waitFor();
      assert.ok((await stage.locator('text').allTextContents()).includes('QZ'), '保存したロゴから始まらない');
      await dialog.getByRole('button', { name: '自動のロゴに戻す' }).click();
      await dialog.waitFor({ state: 'detached' });
      assert.equal(commands.filter((c) => c.type === 'profile').at(-1).payload.logo, null);
      await p.waitForFunction(() => !document.querySelector('.online-nav-mark')?.textContent.includes('QZ'));
      assert.equal(iconLoads.n, 2, '絵の形を何度も読んでいる（開くたびに1回のはず）');
      await context.close();
    }

    // --- スマホ（入） -----------------------------------------------------
    {
      const { p, context } = await open(fixture, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, { look: true });
      await p.locator('.online-mobile-overview .online-team-mark').waitFor();
      await p.getByRole('button', { name: 'メニュー', exact: true }).click();
      await p.locator('.online-mobile-menu-panel').getByRole('button', { name: 'ロゴを作る' }).click();
      const dialog = p.locator('.online-logo-dialog[open]');
      await dialog.waitFor();
      await p.waitForFunction(() => document.querySelectorAll('.online-logo-cands path[d]').length >= 12);
      assert.equal(await dialog.locator('.online-logo-cands button').count(), 12);
      const wide = await dialog.evaluate((d) => d.scrollWidth - d.clientWidth);
      assert.ok(wide <= 1, `スマホで小窓が横にはみ出した（${wide}px）`);
      await shot(p, 'logo-editor-pick-sp');
      await dialog.getByRole('button', { name: '2 少し変える' }).click();
      assert.ok((await dialog.evaluate((d) => d.scrollWidth - d.clientWidth)) <= 1, 'スマホの「少し変える」が横にはみ出した');
      await shot(p, 'logo-editor-tune-sp');
      await dialog.locator('.online-logo-stage [data-li]').last().tap();
      await dialog.locator('.online-logo-frame').waitFor();
      assert.ok((await dialog.evaluate((d) => d.scrollWidth - d.clientWidth)) <= 1, 'スマホの「こだわる」が横にはみ出した');
      await shot(p, 'logo-editor-craft-sp');
      await dialog.getByRole('button', { name: '閉じる' }).click();
      await dialog.waitFor({ state: 'detached' });
      await context.close();
    }
  })(),
  'online-logo-ui-check',
  180_000,
);
await browser.close();
assert.deepEqual(errors, [], `画面のエラー: ${errors.join('\n')}`);
console.log('online-logo-ui-check: ok');
