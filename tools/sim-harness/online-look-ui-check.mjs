// 新しい見た目（試作）の画面検査。配布HTML（dist/index.html）を開く。サーバー不要（先に vite build）。
//   npm run check:online:look-ui
//
// 見ること:
//   - 既定は切。切のときは絵（`.online-look-art`）を1つも描かず、調子は今までの絵文字のまま
//   - PC の見出しの「新しい見た目（試作）」で入にすると、順位表・左メニューに球団マーク、
//     スタメン設定に選手の顔、選手の詳細に顔と段位の字、調子は自前の顔になる
//   - 入／切は端末に覚える（開き直しても入のまま）。リーグの球団でない名前にはマークを描かない
//   - スマホはメニュー（☰）から切り替えられる
//   - 字: 入のときだけ見出しが LookHead・本文が LookNum（数字と英字）＋LookJP（日本語）。見出しの中の注記と新聞は今までの字のまま。
//     字（public/fonts/。日本語は1つ約450KB）は配布HTMLに埋め込まず、入にするまで1つも読まない
//   - 段3: 入のときだけホームの頭に今日の一戦の札、試合の小窓に打席速報（送ると場面が進む）
//   - 動きで見る: 入のときだけ試合の小窓に出る。球場と選手を canvas に描き、動きが終わると自動で次の打席へ
//   - 段4: 入のときだけホームに番記者のメモ。優勝などが決まったら球団の出来事の場面を1度だけ出す
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
// 新しい見た目の字（public/fonts/）。読んだ回数を名前ごとに数える
const fontLoads = {};
const loadedFonts = () => Object.keys(fontLoads).sort();
const fontOf = (p, selector) => p.evaluate((sel) => getComputedStyle(document.querySelector(sel)).fontFamily, selector);
const EMOJI = /[🔥😊😐😞😰]/u;
const LOOK_FONTS = [
  'look-alfaslab.woff2',
  'look-body-bold.woff2',
  'look-body-regular.woff2',
  'look-graduate.woff2',
  'look-head.woff2',
  'look-num-bold.woff2',
  'look-num-regular.woff2',
  'look-yellowtail.woff2',
];
// ⚠ 字を配布HTMLに埋め込むと、切の人まで重くなる
assert.doesNotMatch(html, /font\/woff2;base64|LookGraduate[^}]*data:/, '新しい見た目の字が配布HTMLに埋め込まれた');

/**
 * @param look 入にして開く
 * @param patchView ビューを書き換える（場面を出すために、決まったレースを足すなど）
 */
async function open(contextOptions, { look = false, patchView = null } = {}) {
  const fixture = await seasonService({ days: 6 });
  if (patchView) {
    const view = fixture.service.view.bind(fixture.service);
    fixture.service.view = async (...args) => patchView(await view(...args));
  }
  const context = await browser.newContext(contextOptions);
  if (look) await context.addInitScript((key) => localStorage.setItem(key, 'new'), LOOK_KEY);
  await routeToService(context, fixture);
  await context.route(`${base}/online`, (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await context.route(`${base}/fonts/*.woff2`, async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    fontLoads[name] = (fontLoads[name] ?? 0) + 1;
    const body = await readFile(new URL(`../../public/fonts/${name}`, import.meta.url));
    return route.fulfill({ contentType: 'font/woff2', body });
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
      assert.deepEqual(loadedFonts(), [], '切なのに新しい見た目の字を読んだ');
      // 段3: 切のときは今日の一戦の札も打席速報も出さない
      assert.equal(await p.locator('.online-today-game').count(), 0, '切なのに今日の一戦の札が出ている');
      assert.equal(await p.locator('.online-reporter-memo').count(), 0, '切なのに番記者のメモが出ている');
      await p.locator('.online-slot-record').first().click();
      await p.locator('.online-scoreboard').first().waitFor();
      assert.equal(await p.getByRole('button', { name: '打席速報' }).count(), 0, '切なのに打席速報が出ている');
      assert.equal(await p.getByRole('button', { name: '動きで見る' }).count(), 0, '切なのに動きで見るが出ている');
      await p.keyboard.press('Escape');
      await p.locator('.online-scoreboard').first().waitFor({ state: 'detached' });

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
      // 球団マークの字（Graduate・Alfa Slab・Yellowtail のどれか）も、描いたものは読む
      const markFonts = await p
        .locator('.online-standings .online-team-mark text')
        .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('font-family').split(',')[0]))]);
      const wanted = ['16px LookHead', '16px LookJP', 'bold 16px LookJP', '16px LookNum'];
      for (const f of markFonts) if (f.startsWith('Look')) wanted.push(`16px ${f}`);
      await p.waitForFunction((list) => list.every((f) => document.fonts.check(f)), wanted);
      for (const name of ['look-body-bold.woff2', 'look-body-regular.woff2', 'look-head.woff2', 'look-num-regular.woff2'])
        assert.ok(loadedFonts().includes(name), `入なのに ${name} を読んでいない`);
      for (const name of loadedFonts()) assert.ok(LOOK_FONTS.includes(name), `知らない字を読んだ: ${name}`);
      // 新聞は新聞の字のまま
      await p.locator('.online-paper-open').click();
      await p.locator('.online-paper h2').first().waitFor();
      assert.doesNotMatch(await fontOf(p, '.online-paper h2'), /LookHead/, '新聞の見出しまで変わった');
      await p.keyboard.press('Escape');
      await p.locator('.online-paper-dialog[open]').waitFor({ state: 'hidden' });

      // 段3: ホームの頭に今日の一戦の札（球場の夜景・両球団のマーク・先発の顔）
      const today = p.locator('.online-today-game');
      await today.waitFor();
      assert.equal(await today.locator('.online-stadium-art').count(), 1, '札に球場の絵が無い');
      assert.equal(await today.locator('.online-today-side .online-team-mark').count(), 2, '札に両球団のマークが無い');
      assert.ok((await today.locator('.online-today-starter .online-face').count()) >= 1, '札に先発の顔が無い');
      // 段4: 番記者のメモ（背広の顔とひとこと）
      const memo = p.locator('.online-reporter-memo');
      await memo.waitFor();
      assert.equal(await memo.locator('.online-face').count(), 1, '番記者の顔が無い');
      assert.match(await memo.locator('small').textContent(), /番　\S/, '番記者の名前が無い');
      assert.ok((await memo.locator('p').count()) >= 1, '番記者のひとことが無い');
      // 試合の小窓に打席速報。送ると場面が進む
      await p.locator('.online-slot-record').first().click();
      await p.getByRole('button', { name: '打席速報' }).click();
      const live = p.locator('.online-live');
      await live.waitFor();
      assert.equal(await live.locator('.online-field-art').count(), 1, '打席速報に球場の図が無い');
      assert.ok((await live.locator('.online-live-telop strong').textContent()).trim(), '実況の文が無い');
      await live.getByRole('button', { name: '次の打席 ▶' }).click();
      assert.match(await live.locator('.online-live-controls small').textContent(), /^2 \//, '打席が進まない');
      // 動きで見る: canvas に球場が描かれ、自動にすると動きが終わってから次の打席へ進む
      await p.getByRole('button', { name: '動きで見る' }).click();
      const motion = p.locator('.online-live[data-motion]');
      await motion.waitFor();
      const canvas = motion.locator('canvas.online-motion-canvas');
      await canvas.waitFor();
      // 絵は字を読んでから描きはじめる（待つのは最大1.2秒）
      const colorsOf = () =>
        canvas.evaluate((c) => {
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          const colors = new Set();
          for (let i = 0; i < d.length; i += 4 * 97) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
          return colors.size;
        });
      let painted = 0;
      for (let i = 0; i < 25 && painted <= 50; i++) {
        await p.waitForTimeout(200);
        painted = await colorsOf();
      }
      assert.ok(painted > 50, `動きで見るの絵が描かれていない（色${painted}）`);
      // 結果の文は、動きが終わるまで出さない
      assert.equal(await motion.locator('.online-live-telop[data-wait]').count(), 1, '動きが終わる前に結果の文が出ている');
      if (process.env.LOOK_SHOTS) await motion.screenshot({ path: `${process.env.LOOK_SHOTS}/motion-pc.png` });
      await motion.getByRole('button', { name: '×2' }).click();
      await motion.locator('.online-live-telop:not([data-wait])').waitFor({ timeout: 20000 });
      assert.equal(await motion.locator('.online-live-flow li[data-now]').count(), 1, '動きが終わっても結果の行が出ない');
      await motion.getByRole('button', { name: '▶ 自動' }).click();
      await p.waitForFunction(
        () => /^[2-9]|^\d{2}/.test(document.querySelector('.online-live[data-motion] .online-live-controls small')?.textContent || ''),
        null,
        { timeout: 20000 },
      );
      await p.keyboard.press('Escape');
      await motion.waitFor({ state: 'detached' });

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

    // --- 段4: 球団の出来事の場面（優勝が決まったビュー）。閉じたら2度は出さない ----
    {
      const won = (v) => ({
        ...v,
        races: [{ league: 'A', leagueName: '1部', kind: 'first', team: v.teamName, magic: 0, clinched: true, rival: null, left: 0 }],
      });
      const { p, context } = await open({ viewport: { width: 1440, height: 1000 } }, { look: true, patchView: won });
      const scene = p.getByRole('dialog', { name: '1部優勝！' });
      await scene.waitFor();
      assert.equal(await scene.locator('.online-stadium-art').count(), 1, '場面に球場の絵が無い');
      assert.ok((await scene.locator('.online-face').count()) >= 1, '場面に顔が無い');
      assert.ok((await scene.locator('.online-event-talk p').textContent()).trim(), '場面の台詞が無い');
      await scene.getByRole('button', { name: '閉じる' }).click();
      await scene.waitFor({ state: 'detached' });
      await p.reload();
      await p.locator('.online-today-game').waitFor();
      assert.equal(await p.locator('.online-event-scene').count(), 0, '見た場面がもう1度出た');
      await context.close();
    }
    // 切のときは決まっても出さない
    {
      const won = (v) => ({ ...v, races: [{ league: 'A', leagueName: '1部', kind: 'first', team: v.teamName, magic: 0, clinched: true, left: 0 }] });
      const { p, context } = await open({ viewport: { width: 1440, height: 1000 } }, { patchView: won });
      await p.locator('.online-page-nav').getByRole('button', { name: 'スタメン設定', exact: true }).waitFor();
      assert.equal(await p.locator('.online-event-scene').count(), 0, '切なのに場面が出た');
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
  180_000,
);
await browser.close();
assert.deepEqual(errors, [], `画面のエラー: ${errors.join('\n')}`);
console.log('online-look-ui-check: ok');
