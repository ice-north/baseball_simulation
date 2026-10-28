import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { withDeadline } from './lib/deadline.mjs';
const base = process.env.ONLINE_TEST_URL || 'http://localhost:3000';
assert.ok(
  ['localhost', '127.0.0.1'].includes(new URL(base).hostname),
  'ローカル環境だけを検証する',
);
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROME_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHROME_CHANNEL }
    : {}),
  headless: true,
});
const errors = [];
try {
  const pc = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const other = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const p = await pc.newPage();
  const b = await other.newPage();
  const m = await phone.newPage();
  for (const page of [p, b, m])
    page.on('pageerror', (e) => errors.push(e.message));
  const waitIdle = async (page) => {
    await page
      .getByText('処理中です。画面を閉じずにお待ちください…')
      .waitFor({ state: 'hidden', timeout: 290000 });
  };
  const click = async (page, text) => {
    if (
      ['更新', 'ログアウト', '進行時刻'].includes(text) &&
      !(await page.getByRole('button', { name: text, exact: true }).count()) &&
      (await page
        .getByRole('button', { name: 'メニュー', exact: true })
        .count())
    )
      await page.getByRole('button', { name: 'メニュー', exact: true }).click();
    await page.getByRole('button', { name: text, exact: true }).click();
    await waitIdle(page);
  };
  async function login(page, player) {
    await page.goto(`${base}/online`);
    await page.getByText('ローカル検証モード', { exact: false }).waitFor();
    await click(page, `プレイヤー${player}で入る`);
  }
  await p.goto(base);
  await p
    .getByRole('link', { name: 'オンラインペナント', exact: true })
    .waitFor();
  await login(p, 1);
  await p
    .getByRole('button', { name: 'リーグを作成', exact: true })
    .waitFor({ timeout: 30000 });
  await click(p, 'リーグを作成');
  await click(p, '手続き');
  await p
    .getByRole('button', { name: 'この内容で決定', exact: true })
    .waitFor();
  await p.locator('.online-candidate').first().waitFor();
  await login(m, 2);
  await m.setViewportSize({ width: 320, height: 640 });
  await click(m, '手続き');
  await m
    .getByRole('button', { name: 'この内容で決定', exact: true })
    .waitFor();
  const decisionBox = await m
    .getByRole('button', { name: 'この内容で決定', exact: true })
    .boundingBox();
  assert.ok(
    decisionBox.y >= 0 && decisionBox.y + decisionBox.height <= 640 - 48,
    '小さいスマホでも決定ボタンがスクロールせず押せる',
  );
  assert.ok(
    await m.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight * 1.3,
    ),
    '初期編成の確認も長いスクロールにしない',
  );
  await m.screenshot({
    path: '/tmp/baseball-online-mobile-decision.png',
    fullPage: true,
  });
  await click(m, 'ホーム');
  await click(m, 'ログアウト');
  await m.setViewportSize({ width: 390, height: 844 });

  const draftTab = await pc.newPage();
  draftTab.on('pageerror', (e) => errors.push(e.message));
  await draftTab.goto(`${base}/online`);
  await click(draftTab, '手続き');
  await draftTab.locator('input[type=number]').fill('23');
  await click(draftTab, '下書きを保存');
  await click(p, '更新');
  await click(p, '下書きを保存');
  await p
    .getByText(
      '保存済みの提出が更新されています。最新の提出を読み直してください',
      { exact: false },
    )
    .waitFor();
  await click(p, '最新の提出を読み直す');
  assert.equal(await p.locator('input[type=number]').inputValue(), '23');
  await p.locator('input[type=number]').fill('24');
  await click(p, '下書きを保存');
  assert.equal(
    await p.locator('.online-edit-notice').count(),
    0,
    'キー順が異なる自分の提出を競合と誤認しない',
  );
  await draftTab.close();
  await p.screenshot({
    path: '/tmp/baseball-online-desktop-tryout.png',
    fullPage: true,
  });
  await click(p, 'この内容で決定');
  await login(b, 2);
  await click(b, '手続き');
  await click(b, 'この内容で決定');
  await click(p, '更新');
  await click(p, 'この内容で決定');
  await click(b, '更新');
  await click(b, 'この内容で決定');
  await click(p, '更新');
  await click(p, '進行時刻');
  await p.getByRole('dialog', { name: '進行時刻', exact: true }).waitFor();
  await p.keyboard.press('Escape');
  await p
    .getByRole('dialog', { name: '進行時刻', exact: true })
    .waitFor({ state: 'hidden' });
  await click(p, '編成');
  await p.getByRole('heading', { name: '編成・采配', exact: true }).waitFor();
  // 数値選手IDを文字列へ変えずに保存できることを実画面から確認。
  const selects = p.locator('.online-lineup select');
  const first = await selects.nth(0).inputValue();
  const second = await selects.nth(1).inputValue();
  await selects.nth(0).selectOption(second);
  await selects.nth(1).selectOption(first);
  let releaseSave;
  let saveStarted;
  const savingStarted = new Promise((resolve) => {
    saveStarted = resolve;
  });
  await p.route('**/api/online?*', async (route) => {
    if (
      new URL(route.request().url()).searchParams.get('action') === 'command'
    ) {
      saveStarted();
      await new Promise((resolve) => {
        releaseSave = resolve;
      });
    }
    await route.continue();
  });
  await p.getByRole('button', { name: '編成を保存', exact: true }).click();
  await withDeadline(savingStarted, '編成保存の開始');
  assert.ok(
    await selects.nth(0).isDisabled(),
    '保存の応答待ち中は入力を変更できない',
  );
  releaseSave();
  await waitIdle(p);
  await p.unroute('**/api/online?*');
  assert.ok(await selects.nth(0).isEnabled());
  await p.getByText('保存しました', { exact: true }).waitFor();
  await p.screenshot({
    path: '/tmp/baseball-online-desktop.png',
    fullPage: true,
  });
  const lineupTab = await pc.newPage();
  lineupTab.on('pageerror', (e) => errors.push(e.message));
  await lineupTab.goto(`${base}/online`);
  await click(lineupTab, '編成');
  await p.getByRole('button', { name: '2番を上げる', exact: true }).click();
  await click(lineupTab, '采配');
  await lineupTab.getByLabel('打撃方針').selectOption('patient');
  await click(lineupTab, '編成を保存');
  await click(p, '更新');
  await click(p, '編成を保存');
  await p.getByText('編成が更新されています。', { exact: false }).waitFor();
  await click(p, '編集を戻す');
  await click(p, '采配');
  assert.equal(await p.getByLabel('打撃方針').inputValue(), 'patient');
  await click(p, '打順・守備');
  await lineupTab.close();
  await login(m, 1);
  await m.getByRole('button', { name: '打順', exact: true }).click();
  await m.getByRole('button', { name: '2番を上げる', exact: true }).click();
  await click(m, '編成を保存');
  assert.equal(
    await m.getByRole('heading', { name: '編成・采配', exact: true }).count(),
    0,
    'スマホでPC画面をマウントしない',
  );
  assert.ok(
    await m.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    '390pxで横にはみ出さない',
  );
  await m.screenshot({
    path: '/tmp/baseball-online-mobile-lineup.png',
    fullPage: true,
  });
  const saveBox = await m
    .getByRole('button', { name: '編成を保存', exact: true })
    .boundingBox();
  assert.ok(
    saveBox.y >= 0 && saveBox.y + saveBox.height <= 844 - 48,
    '打順の保存ボタンがスクロールせず押せる',
  );
  await click(p, '更新');
  await p
    .getByText('別の端末でログインしたため閲覧のみです。', { exact: false })
    .waitFor();
  await m.getByRole('button', { name: 'ホーム', exact: true }).click();
  await m.screenshot({
    path: '/tmp/baseball-online-mobile.png',
    fullPage: true,
  });
  // 別のプロフィールからログインし、実試合の結果が両端末へ届くことを確認。
  const admin = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const a = await admin.newPage();
  a.on('pageerror', (e) => errors.push(e.message));
  await login(a, 1);
  await click(a, '管理');
  for (let i = 0; i < 3; i++) await click(a, '検証用：1日進める');
  await click(m, '更新');
  await m.getByRole('button', { name: '試合', exact: true }).click();
  await m.locator('.online-score').first().waitFor();
  assert.ok(
    await m.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await m.screenshot({
    path: '/tmp/baseball-online-mobile-results.png',
    fullPage: true,
  });
  // 同じoriginでも一人用の保存キーへ書き込まない。
  assert.deepEqual(await m.evaluate(() => Object.keys(localStorage)), [
    'baseball-online-auth-v1',
  ]);
  for (const width of [320, 375, 430, 767]) {
    await m.setViewportSize({ width, height: 844 });
    for (const tab of ['ホーム', '試合', '打順', '手続き']) {
      await click(m, 'ホーム');
      if (tab !== 'ホーム') await click(m, tab);
      const metrics = await m.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        viewport: innerHeight,
        viewportWidth: innerWidth,
      }));
      assert.ok(
        metrics.width <= metrics.viewportWidth,
        `${width}px ${tab}で横にはみ出さない`,
      );
      assert.ok(
        metrics.height <= metrics.viewport * 1.3,
        `${width}px ${tab}で長いスクロールを要求しない: ${JSON.stringify(metrics)}`,
      );
    }
  }
  await m.setViewportSize({ width: 390, height: 844 });
  await click(m, 'ホーム');
  await m
    .getByRole('button', { name: 'リーグ便り・過去のシーズン →', exact: true })
    .click();
  assert.ok((await m.locator('.online-news-list article').count()) <= 4);
  assert.ok(
    await m.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight * 1.3,
    ),
    '96人のトライアウト結果も4件ずつ表示する',
  );
  await m.screenshot({
    path: '/tmp/baseball-online-mobile-news.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    'online-ui-check PASS（PC2人・別スマホ・編成保存・端末交代・実試合結果・320〜767px / Chrome実操作）',
  );
} finally {
  await browser.close();
}
