import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { withDeadline } from './lib/deadline.mjs';
import { tryoutService, routeToService } from './lib/serviceRoute.mjs';
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
  // ⚠ PCの左メニューは「ホーム」「選手成績」「試合結果」「スタメン設定」「投手起用」
  //    「方針・采配」「現在の手続き」「リーグ管理」（守備分析はスタメン設定の表に入れた）。スマホのホームの
  //    ボタンは「試合」「打順」「手続き」のまま
  async function login(page, player) {
    await page.goto(`${base}/online`);
    await page.getByText('ローカル検証モード', { exact: false }).waitFor();
    await click(page, `プレイヤー${player}で入る`);
  }
  // --- 年末のトライアウト（希望リスト） -------------------------------------
  // ⚠ 開幕前の手続きは初期メンバーセットの選択になり（d37ef49）、希望リストは
  //    年末まで出てこない。1シーズン回すと遅いので、エンジンで直にトライアウトを
  //    開いたリーグを作り、画面の通信だけをそこへつなぐ（lib/serviceRoute.mjs）
  {
    const fixture = await tryoutService();
    const tc = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await routeToService(tc, fixture);
    const t = await tc.newPage();
    t.on('pageerror', (e) => errors.push(e.message));
    await t.goto(`${base}/online`);
    await click(t, '現在の手続き');
    await t
      .getByRole('button', { name: 'この内容で決定', exact: true })
      .waitFor();
    // ⚠ トライアウトは「希望リスト＋候補を探す」の2欄。候補が1行も出ない
    //    （＝選べない）状態で先へ進まないよう、両方が描けていることを見る
    await t.locator('.online-tryout-wanted .online-tryout-list li').first().waitFor();
    await t.locator('.online-tryout-pool .online-tryout-list li').first().waitFor();
    // ⚠ 希望リストの操作は**獲得予定を基準に**動くこと。以前は希望順の位置で
    //    動かしていて、当時の初期編成（24人＝目標構成の合計ちょうど）では
    //    「指名に加える」が候補の約9割で何も起きず、「↓」で選手が消えたりした
    {
      const wantedNames = async () =>
        (
          await t
            .locator('.online-tryout-wanted > ol.online-tryout-list > li .online-tryout-person button')
            .allInnerTexts()
        ).map((s) => s.trim());
      const start = await wantedNames();
      await t
        .locator('.online-tryout-pool .online-segments button', { hasText: '投手' })
        .click();
      const row = t
        .locator('.online-tryout-pool .online-tryout-list li:not([data-wanted])')
        .first();
      const name = (
        await row.locator('.online-tryout-person button').first().innerText()
      ).trim();
      await row.getByRole('button', { name: '指名に加える', exact: true }).click();
      const added = await wantedNames();
      assert.ok(added.includes(name), '「指名に加える」で獲得予定に入らない');
      assert.equal(added.length, start.length, '指名で獲得予定の人数が変わった');
      assert.equal(
        (
          await t
            .locator('.online-tryout-pool .online-tryout-list li', { hasText: name })
            .locator('.online-tryout-mark')
            .innerText()
        ).trim(),
        `指名中 ${added.indexOf(name) + 1}位`,
        '「指名中 N位」が獲得予定の番号とずれる',
      );
      await t
        .getByRole('button', { name: `${added[0]}の希望順位を下げる`, exact: true })
        .click();
      const moved = await wantedNames();
      assert.equal(moved[1], added[0], '↓で1つ下がらない');
      assert.deepEqual([...moved].sort(), [...added].sort(), '↓で顔ぶれが変わった');
      await click(t, '標準案に戻す');
      assert.deepEqual(await wantedNames(), start, '標準案に戻らない');
      // 重視する能力の重みから、評価値の順でおすすめを作れる
      const scoresOf = async (selector) =>
        (await t.locator(`${selector} .online-tryout-score`).allInnerTexts()).map((text) =>
          Number(text.replace(/[^0-9]/g, '')),
        );
      await t.getByText('重視する能力（評価値の重み）', { exact: true }).click();
      await t.getByLabel('パワーの重み', { exact: true }).fill('5');
      await t.getByLabel('ミートの重み', { exact: true }).fill('0');
      await t
        .getByRole('button', { name: 'この重みでおすすめ順を作る', exact: true })
        .click();
      const weighted = await scoresOf('.online-tryout-wanted > ol.online-tryout-list');
      assert.equal(weighted.length, start.length, '重みのおすすめで獲得予定の人数が変わった');
      assert.ok(
        weighted.every((v, i) => i === 0 || weighted[i - 1] >= v),
        `獲得予定が評価の高い順になっていない: ${weighted.join(',')}`,
      );
      assert.notDeepEqual(await wantedNames(), start, '重みを変えてもおすすめが変わらない');
      const poolScores = await scoresOf('.online-tryout-pool .online-tryout-list');
      assert.ok(
        poolScores.every((v, i) => i === 0 || poolScores[i - 1] >= v),
        '候補が評価値の順に並んでいない',
      );
      await t.getByRole('button', { name: '重みを標準に戻す', exact: true }).click();
      await click(t, '標準案に戻す');
      assert.deepEqual(await wantedNames(), start, '標準案に戻らない');
      assert.equal(
        await t.getByText('おすすめ順を作り直しました', { exact: false }).count(),
        0,
        '標準案に戻したのに「作り直しました」が残っている',
      );
      await t
        .locator('.online-tryout-pool .online-segments button', { hasText: '全部' })
        .click();
    }
    await tc.close();
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
  await click(p, '現在の手続き');
  await p
    .getByRole('button', { name: 'この内容で決定', exact: true })
    .waitFor();
  // ⚠ 開幕前は20の初期メンバーセットから1つ選ぶ
  await p.locator('.online-pack-card').nth(1).waitFor();
  await login(m, 2);
  // ⚠ 開発用サーバーの初期参加者は管理者1人だけ。プレイヤー2はログイン直後に
  //    参加画面が出るので、先に参加する（招待コードを廃止したときに取り残された）。
  //    ⚠ 参加画面では名前を聞かない（セットの下で決める）
  await click(m, '参加する');
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
  await click(draftTab, '現在の手続き');
  // セットのカードを押して中身を見て、「このセットにする」で選ぶ。
  // ⚠ 標準案のセットは球団名で決まる（どれが選択中かは決め打ちできない）ので、
  //    いま選んでいない・`avoid` に無い最初のセットを選ぶ
  const choosePack = async (page, avoid = []) => {
    const cards = page.locator('.online-pack-card');
    await cards.nth(1).waitFor();
    for (let i = 0; i < (await cards.count()); i++) {
      const card = cards.nth(i);
      const name = (await card.locator('strong').innerText()).trim();
      if ((await card.getAttribute('aria-pressed')) === 'true' || avoid.includes(name))
        continue;
      await card.click();
      await click(page, 'このセットにする');
      return name;
    }
    throw new Error('選べるセットが無い');
  };
  const chosenPack = async (page) =>
    (
      await page
        .locator('.online-pack-card[aria-pressed="true"] strong')
        .innerText()
    ).trim();
  const otherTabPack = await choosePack(draftTab);
  await click(draftTab, '下書きを保存');
  await click(p, '更新');
  await choosePack(p, [otherTabPack]);
  await click(p, '下書きを保存');
  await p
    .getByText(
      '保存済みの提出が更新されています。最新の提出を読み直してください',
      { exact: false },
    )
    .waitFor();
  await click(p, '最新の提出を読み直す');
  assert.equal(await chosenPack(p), otherTabPack, '別タブの下書きを読み直せる');
  await choosePack(p, [otherTabPack]);
  await click(p, '下書きを保存');
  assert.equal(
    await p.locator('.online-edit-notice').count(),
    0,
    'キー順が異なる自分の提出を競合と誤認しない',
  );
  await draftTab.close();
  await p.screenshot({
    path: '/tmp/baseball-online-desktop-packs.png',
    fullPage: true,
  });
  await click(p, 'この内容で決定');
  await login(b, 2);
  await click(b, '現在の手続き');
  await click(b, 'この内容で決定');
  // セットを配り終えるとキャンプが開く。
  // ⚠ **キャンプには「この内容で決定」が無い**。1クールずつその場で実行する
  //    形なので、提出して締め切りを待つものが無い（`CampPlanner`）。
  //    4クール回し終えた人から決定済みになり、2人とも終わると開幕する。
  for (const page of [p, b]) {
    await click(page, '更新');
    await page.getByRole('heading', { name: 'キャンプ', exact: true }).waitFor();
    for (let round = 1; round <= 4; round += 1)
      await click(page, `第${round}クール練習を実行`);
  }
  await click(p, '更新');
  await click(p, '進行時刻');
  await p.getByRole('dialog', { name: '進行時刻', exact: true }).waitFor();
  await p.keyboard.press('Escape');
  await p
    .getByRole('dialog', { name: '進行時刻', exact: true })
    .waitFor({ state: 'hidden' });
  // --- PCの投手起用（`PitchingBoard.jsx`。先発ローテ→救援の1枚の表） -----------
  // 先発の登板順。1つ下げる＝その行を選んで次の行を押す（先発どうしは登板順の入れ替え）
  const starterOrder = (page) =>
    page
      .locator('tbody[aria-label="先発ローテーション"] tr[data-starter] .online-player-name')
      .allInnerTexts();
  const lowerStarter = async (page, name) => {
    const index = (await starterOrder(page)).indexOf(name);
    assert.ok(index >= 0, `${name}が先発に居ない`);
    await page.getByRole('button', { name: `先発${index + 1}番手を選ぶ`, exact: true }).click();
    await page
      .getByRole('button', { name: `先発${index + 2}番手と入れ替える`, exact: true })
      .click();
  };
  const pitchingInert = (page) =>
    page.locator('.online-lineup-board[inert]:has(.online-pitch-table)').count();
  await click(p, '投手起用');
  await p.locator('tr[data-starter]').first().waitFor();
  const savedOrder = await starterOrder(p);
  assert.ok(savedOrder.length >= 2, '先発の登板順が出ていない');
  // 元に戻す／やり直す（ボタンと Ctrl+Z / Ctrl+Shift+Z）
  await lowerStarter(p, savedOrder[0]);
  const movedOrder = await starterOrder(p);
  assert.equal(movedOrder[1], savedOrder[0], '登板順が1つ下がらない');
  await p
    .locator('.online-page-nav')
    .getByLabel('保存していない変更')
    .first()
    .waitFor();
  await click(p, '元に戻す');
  assert.deepEqual(await starterOrder(p), savedOrder, '元に戻すで戻らない');
  assert.ok(
    await p.getByRole('button', { name: '保存', exact: true }).isDisabled(),
    '元に戻したら保存するものは無い',
  );
  await click(p, 'やり直す');
  assert.deepEqual(await starterOrder(p), movedOrder, 'やり直すで進まない');
  await p.keyboard.press('Control+z');
  assert.deepEqual(await starterOrder(p), savedOrder, 'Ctrl+Zで戻らない');
  await p.keyboard.press('Control+Shift+z');
  assert.deepEqual(await starterOrder(p), movedOrder, 'Ctrl+Shift+Zで進まない');
  // ページを移っても未保存の編集が残る（隠すだけで外さない）
  await click(p, '選手成績');
  await click(p, '投手起用');
  assert.deepEqual(await starterOrder(p), movedOrder, 'ページ移動で編集が消えた');
  // 保存の応答待ちの間は触れない（送信中の編集が保存後の作り直しで消えるため）
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
  await p.getByRole('button', { name: '保存', exact: true }).click();
  await withDeadline(savingStarted, '編成保存の開始');
  assert.equal(await pitchingInert(p), 1, '保存の応答待ち中は編成を変更できない');
  assert.ok(await p.getByRole('button', { name: '元に戻す', exact: true }).isDisabled());
  releaseSave();
  await waitIdle(p);
  await p.unroute('**/api/online?*');
  await p.getByText('保存しました', { exact: true }).waitFor();
  assert.equal(await pitchingInert(p), 0);
  // 数値の選手IDのまま保存できたことを、読み直した画面で確かめる
  await p.reload();
  await click(p, '投手起用');
  await p.locator('tr[data-starter]').first().waitFor();
  assert.deepEqual(await starterOrder(p), movedOrder, '保存した登板順が残らない');
  await p.screenshot({
    path: '/tmp/baseball-online-desktop.png',
    fullPage: false,
  });
  // ⚠ 「方針・采配」と「投手起用」は**同じ編成を別の画面で編集する**。
  //    片方を保存しても、もう片方の未保存の編集は保存できること
  //    （自分の項目だけを最新の編成に載せて送る `rebaseLineupSave`）
  const lineupTab = await pc.newPage();
  lineupTab.on('pageerror', (e) => errors.push(e.message));
  await lineupTab.goto(`${base}/online`);
  await click(lineupTab, '方針・采配');
  await lowerStarter(p, movedOrder[0]);
  const editedOrder = await starterOrder(p);
  await lineupTab
    .getByRole('group', { name: '打撃方針', exact: true })
    .getByRole('button', { name: '慎重', exact: true })
    .click();
  await click(lineupTab, '保存');
  await click(p, '更新');
  await click(p, '保存');
  assert.equal(await pitchingInert(p), 0);
  await p.getByText('保存しました', { exact: true }).waitFor();
  await click(p, '方針・采配');
  assert.equal(
    (
      await p
        .getByRole('group', { name: '打撃方針', exact: true })
        .locator('[aria-pressed="true"]')
        .innerText()
    ).trim(),
    '慎重',
    '投手起用の保存で、別の画面で保存した方針を古い値に戻さない',
  );
  await click(p, '投手起用');
  assert.deepEqual(await starterOrder(p), editedOrder);
  // 同じ項目を別のタブで先に保存されたら、本当の食い違いとして止める
  await click(lineupTab, '更新');
  await click(lineupTab, '投手起用');
  await lowerStarter(lineupTab, editedOrder[0]);
  await click(lineupTab, '保存');
  await lowerStarter(p, editedOrder[1]);
  await click(p, '保存');
  await p.getByText('編成がほかの画面で更新されています。', { exact: false }).first().waitFor();
  await click(p, '変更を取り消す');
  await click(p, '更新');
  assert.deepEqual(
    await starterOrder(p),
    await starterOrder(lineupTab),
    '取り消すと別のタブで保存した編成になる',
  );
  await lineupTab.close();
  await login(m, 1);
  await m.getByRole('button', { name: '打順', exact: true }).click();
  await m.getByRole('button', { name: '2番を上げる', exact: true }).click();
  await click(m, '編成を保存');
  assert.equal(
    await m.locator('.online-lineup-board, .online-page-nav').count(),
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
  await click(a, 'リーグ管理');
  // ⚠ ボタンの名前は「1ターン進める（ゲーム内1日）」（検証モードを足したときに変わった）
  for (let i = 0; i < 3; i++) await click(a, '1ターン進める（ゲーム内1日）');
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
  const boxResponse = m.waitForResponse(
    (response) => new URL(response.url()).searchParams.get('action') === 'game',
  );
  await m
    .getByRole('button', { name: /の試合成績$/ })
    .first()
    .click();
  const boxData = await (await boxResponse).json();
  assert.ok(
    boxData.teams?.[boxData.home]?.length > 0,
    '実試合から保存された個人成績を取得',
  );
  const box = m.getByRole('dialog', { name: '試合成績', exact: true });
  await box.locator('tbody tr').first().waitFor();
  await box
    .getByRole('button', { name: '試合成績を閉じる', exact: true })
    .click();
  const historyResponse = m.waitForResponse(
    (response) =>
      new URL(response.url()).searchParams.get('action') === 'games',
  );
  await click(m, '過去の試合・個人成績');
  assert.ok((await (await historyResponse).json()).count > 0);
  await m
    .getByRole('button', { name: '試合記録を閉じる', exact: true })
    .click();
  await click(m, 'ホーム');
  await click(m, '選手成績');
  const playerResponse = m.waitForResponse(
    (response) =>
      new URL(response.url()).searchParams.get('action') === 'player',
  );
  await m.locator('.online-roster-row').first().click();
  const playerData = await (await playerResponse).json();
  assert.ok(
    playerData.periods.find((period) => period.id === 'current')?.seasonStats
      ?.batting?.measured,
    '実APIの対人記録と期間を閲覧',
  );
  const playerDialog = m.getByRole('dialog');
  // ⚠ **選手の詳細はタブで分けない**。札と経歴・成績・能力を一度に出す
  //    （`PlayerDetailBody`）。以前は「成績／能力・人物／場面別」の3タブだった
  await playerDialog.locator('.online-career').waitFor();
  await playerDialog.getByRole('heading', { name: '成績' }).waitFor();
  await playerDialog.getByRole('heading', { name: '能力' }).waitFor();
  // 場面別だけは任意で開く（行数が多く1画面に入らない）
  await playerDialog
    .getByRole('button', { name: '場面別の成績を見る', exact: true })
    .click();
  await playerDialog
    .getByRole('button', { name: '場面別の成績を閉じる', exact: true })
    .waitFor();
  await playerDialog
    .getByRole('button', { name: '選手成績を閉じる', exact: true })
    .click();
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
  assert.ok((await m.locator('.online-news-list article').count()) <= 8);
  assert.ok(
    await m.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight * 1.3,
    ),
    '96人のトライアウト結果も1行8件ずつ表示する',
  );
  await m.screenshot({
    path: '/tmp/baseball-online-mobile-news.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    'online-ui-check PASS（PC2人・別スマホ・トライアウト希望リスト・セット選択の下書き競合・編成の元に戻す/保存中ロック/別画面との同時編集・端末交代・実試合結果・320〜767px / Chrome実操作）',
  );
} finally {
  await browser.close();
}
