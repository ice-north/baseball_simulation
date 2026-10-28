// 配布HTMLと実際のサーバーprojectionを接続する。通信/Authのみfixture。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { projectLeague } from '../../server/projection.mjs';
const html = await readFile(
  new URL('../../dist/index.html', import.meta.url),
  'utf8',
);
const player = (id, overrides = {}) => ({
  id,
  name: `成績選手${id}`,
  age: 22,
  condition: id % 5,
  fatigue: (id % 10) * 2,
  position: id === 9 ? 'pitcher' : 'center',
  batting: { meet: 50, power: 50 },
  pitching: {
    velocity: 140,
    control: 50,
    stamina: 120,
    spinRate: 65,
    form: 'threeQuarter',
    arsenal: [
      { type: 'straight', level: 100 },
      { type: 'slider', level: 45 },
    ],
  },
  physical: {
    speed: 70,
    arm: 65,
    throws: 'right',
    bodyStamina: 72,
    recovery: 68,
    muscle: 55,
    dexterity: 62,
    build: 'medium',
  },
  personality: { discipline: 70, mental: 55 },
  catching: { lead: 60 },
  positionFitness: {
    pitcher: 20,
    catcher: 50,
    first: 70,
    second: 80,
    third: 60,
    short: 50,
    left: 80,
    center: 100,
    right: 80,
  },
  seasonStats: {
    batting: {
      games: 30,
      atBats: 100,
      rbis: id === 24 ? 200 : 42,
      hitByPitch: 0,
      caughtStealing: 0,
      errors: 1,
      fieldingChances: 20,
      hits: 25,
      doubles: 4,
      triples: 0,
      homeruns: 2,
      walks: 10,
      strikeouts: 20,
      stolenBases: 0,
      sacrificeBunts: 0,
      ...overrides,
    },
    pitching: {
      games: 10,
      wins: 2,
      losses: 1,
      saves: 0,
      holds: 0,
      hits: 10,
      runsAllowed: 6,
      pitches: 500,
      qualityStarts: 4,
      highQualityStarts: 1,
      inningsPitched: 54,
      strikeouts: id === 9 ? 40 : 12,
      walks: id === 9 ? 0 : 4,
      homeruns: 2,
      earnedRuns: 4,
    },
  },
});
const stars = [
  player(1, { hits: 45, walks: 30, strikeouts: 65 }),
  ...Array.from({ length: 23 }, (_, i) => player(i + 2)),
];
// 初登板で1/3回・4失点なら防御率108.00。通常範囲の大きな値でも列を跨がない。
Object.assign(stars[0].seasonStats.pitching, {
  games: 1,
  wins: 0,
  losses: 1,
  hits: 3,
  walks: 2,
  strikeouts: 1,
  inningsPitched: 1,
  runsAllowed: 4,
  earnedRuns: 4,
  pitches: 30,
  qualityStarts: 0,
  highQualityStarts: 0,
});
const positions = [
  'catcher',
  'first',
  'second',
  'third',
  'short',
  'left',
  'center',
  'right',
];
const league = {
  revision: 1,
  status: 'running',
  season: {
    year: 1,
    currentDate: { year: 2024, month: 6, day: 1 },
    settings: { teamNames: ['A', 'B', 'C', 'D'] },
    results: [],
    schedule: [],
    standings: [],
  },
  members: [{ userId: 'a', teamName: 'A', label: '自分' }],
  history: [],
  notices: [],
  game: {
    teams: Object.fromEntries(
      ['A', 'B', 'C', 'D'].map((name) => [
        name,
        {
          players: name === 'A' ? stars : [player(100)],
          lineupSettings: {
            battingOrder: positions.map((position, i) => ({
              playerId: i + 1,
              position,
              battingOrder: i + 1,
            })),
          },
          pitchingRotation: { starters: [9] },
          strategy: {},
        },
      ]),
    ),
  },
};
const view = projectLeague(
  { league, sessions: { a: 'fixture' } },
  'a',
  'fixture',
  'a',
);
const beforeProjection = JSON.stringify(league);
const previousRandom = Math.random;
try {
  Math.random = () => {
    throw new Error('閲覧projectionで乱数を消費しない');
  };
  projectLeague({ league, sessions: { a: 'fixture' } }, 'a', 'fixture', 'a');
} finally {
  Math.random = previousRandom;
}
assert.equal(
  JSON.stringify(league),
  beforeProjection,
  '閲覧で元の世界を変更しない',
);
assert.equal(view.roster[0].physical.speed, 70);
assert.equal(view.roster[4].condition, 0, '絶不調0を欠損にしない');
assert.equal(
  view.roster[0].pitching.velocity,
  140,
  '野手の投球能力も閲覧できる',
);
assert.equal(view.nextStarterId, 9);
assert.equal(view.roster[0].performance.batting.labels.length, 3);
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROME_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHROME_CHANNEL }
    : {}),
  headless: true,
});
const errors = [];
let activeContext;
async function scene(width, height = 844, scale = 1) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    isMobile: width < 768,
  });
  activeContext = context;
  await context.tracing.start({ screenshots: true, snapshots: true });
  context.on('close', () => {
    if (activeContext === context) activeContext = null;
  });
  await context.addInitScript(() => {
    localStorage.setItem(
      'baseball-online-auth-v1',
      JSON.stringify({
        userId: 'a',
        sessionId: 'fixture',
        accessToken: 'fixture',
      }),
    );
    window.__onlineViewportChanges = [];
    const media = matchMedia('(max-width: 767px)');
    media.addEventListener('change', (event) => {
      window.__onlineViewportChanges.push({
        matches: event.matches,
        width: innerWidth,
        height: innerHeight,
      });
    });
  });
  await context.route('http://localhost:3000/**', async (route) => {
    if (route.request().resourceType() === 'document')
      return route.fulfill({ contentType: 'text/html', body: html });
    const action = new URL(route.request().url()).searchParams.get('action');
    assert.ok(
      ['config', 'view'].includes(action),
      '閲覧だけで更新APIを呼ばない',
    );
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(action === 'config' ? { local: true } : view),
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:3000/online');
  return { page, context };
}
try {
  const { page: p, context } = await scene(1440, 1000);
  await p.getByRole('button', { name: '選手', exact: true }).click();
  const first = p.locator('tbody tr').first();
  assert.equal(await first.locator('.online-stat-label').count(), 3);
  await p
    .getByRole('button', { name: '成績選手1の選手情報を見る', exact: true })
    .click();
  const dialog = p.getByRole('dialog', { name: '成績選手1', exact: true });
  await dialog.waitFor();
  await dialog.getByText('.450', { exact: true }).waitFor();
  await p.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(
    await p
      .getByRole('button', { name: '成績選手1の選手情報を見る', exact: true })
      .evaluate((e) => document.activeElement === e),
    'Escape後に選手名へフォーカスを戻す',
  );
  await p.getByRole('button', { name: '投球', exact: true }).click();
  await p
    .getByRole('button', { name: '成績選手9の選手情報を見る', exact: true })
    .click();
  await p
    .getByRole('dialog', { name: '成績選手9', exact: true })
    .getByText('制球安定', { exact: true })
    .waitFor();
  await p.keyboard.press('Escape');
  await p
    .getByRole('dialog', { name: '成績選手9', exact: true })
    .waitFor({ state: 'hidden' });
  assert.equal(
    await p
      .locator('.online-page-nav [aria-current="page"]')
      .getAttribute('aria-label'),
    '選手',
    '詳細を閉じても元の一覧に留まる',
  );
  await p.setViewportSize({ width: 700, height: 1000 });
  await p.locator('.online-mobile-controls').waitFor();
  await p.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(
    await p
      .locator('.online-page-nav [aria-current="page"]')
      .getAttribute('aria-label'),
    '選手',
    '表示形式を往復しても選手画面を維持する',
  );
  await p.screenshot({
    path: '/tmp/baseball-online-labels-desktop.png',
    fullPage: true,
  });
  assert.equal(
    await p
      .locator('.online-page-nav [aria-current="page"]')
      .getAttribute('aria-label'),
    '選手',
    '全体キャプチャ後も選手画面を維持する',
  );
  await p.getByRole('button', { name: '成績一覧', exact: true }).click();
  await p.getByLabel('成績の表示項目').selectOption('sabers');
  await p.getByRole('button', { name: 'OPSで並べ替え', exact: true }).click();
  await p
    .locator('.online-roster-rows article')
    .first()
    .getByRole('button', { name: '成績選手1の選手情報を見る', exact: true })
    .waitFor();
  await context.close();
  for (const width of [320, 360, 390, 767]) {
    const { page: m, context: c } = await scene(
      width,
      640,
      width === 360 ? 3 : 1,
    );
    await m.getByRole('button', { name: '打順', exact: true }).click();
    await m
      .getByRole('button', { name: '成績選手1の選手情報を見る', exact: true })
      .click();
    const d = m.getByRole('dialog', { name: '成績選手1', exact: true });
    await d.waitFor();
    await d.getByLabel('能力の表示項目').selectOption('physical');
    assert.equal(
      await d
        .locator('dt')
        .filter({ hasText: /^走力$/ })
        .locator('..')
        .locator('dd')
        .innerText(),
      '70',
    );
    await m.screenshot({
      path: `/tmp/baseball-online-mobile-abilities-${width}.png`,
      fullPage: true,
    });
    await d.getByLabel('能力の表示項目').selectOption('arsenal');
    await d.getByText('スライダー', { exact: true }).waitFor();
    await d.getByRole('button', { name: '成績', exact: true }).click();
    const detailBounds = await d.boundingBox();
    assert.ok(
      Math.abs(detailBounds.width - width) <= 1,
      'スマホの詳細パネルは画面幅いっぱいに使う',
    );
    assert.equal(await d.locator('.online-stat-label').count(), 3);
    await d.getByText('アベレージヒッター', { exact: true }).waitFor();
    assert.ok(
      await d.evaluate((e) => e.scrollHeight <= e.clientHeight + 1),
      '成績詳細は縦スクロール不要',
    );
    assert.ok(
      await m.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      '名前とラベルが横にはみ出さない',
    );
    await m.screenshot({
      path: `/tmp/baseball-online-labels-mobile-${width}.png`,
      fullPage: true,
    });
    await d
      .getByRole('button', { name: '選手成績を閉じる', exact: true })
      .click();
    await m.getByRole('button', { name: '2番を上げる', exact: true }).click();
    await m.getByRole('button', { name: 'メニュー', exact: true }).click();
    const menu = m.getByRole('dialog', { name: 'メニュー', exact: true });
    await menu.waitFor();
    await menu.getByRole('button', { name: '更新', exact: true }).waitFor();
    await m.screenshot({
      path: `/tmp/baseball-online-mobile-menu-${width}.png`,
      fullPage: true,
    });
    await m.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });
    assert.ok(
      await m
        .getByRole('button', { name: 'メニュー', exact: true })
        .evaluate((e) => e === document.activeElement),
      'メニューを閉じて下部ボタンにフォーカスが戻る',
    );
    await m
      .getByRole('button', { name: '投手・控えを含む選手成績 →', exact: true })
      .click();
    await m.waitForFunction(
      () =>
        document.querySelectorAll('.online-compact-roster article').length >= 9,
    );
    const labels = m
      .locator('.online-compact-roster article')
      .first()
      .locator('.online-stat-label');
    assert.equal(
      await labels.count(),
      3,
      '行の高さを変えずにラベルを最大3個表示する',
    );
    assert.deepEqual(await labels.allTextContents(), [
      'アベヒ',
      '選球眼',
      '扇風機',
    ]);
    assert.ok(
      (await labels.allTextContents()).every((text) => [...text].length <= 3),
      '一覧の略称は3文字以内',
    );
    assert.equal(
      await labels.first().getAttribute('aria-label'),
      'アベレージヒッター',
      '略称でも正式名を読み上げる',
    );
    assert.equal(
      await labels.first().getAttribute('title'),
      'アベレージヒッター',
    );
    assert.ok(
      await labels.evaluateAll((nodes) =>
        nodes.every((node) => {
          const box = node.getBoundingClientRect();
          return (
            box.right <=
              node
                .closest('button')
                .querySelector('.online-roster-values')
                .getBoundingClientRect().left -
                1 && box.height <= 20
          );
        }),
      ),
      '3個の札が成績の数値を圧迫せず44px行に収まる',
    );
    const firstRow = m.locator('.online-compact-roster article').first();
    assert.deepEqual(
      await firstRow.locator('.online-roster-values > span').allTextContents(),
      ['.450', '2', '42', '0'],
      '基本成績を4列で比較できる',
    );
    await m
      .getByRole('button', { name: '打点で並べ替え', exact: true })
      .click();
    await firstRow
      .getByRole('button', { name: '成績選手24の選手情報を見る', exact: true })
      .waitFor();
    await m
      .getByRole('button', { name: '打点で並べ替え', exact: true })
      .click();
    await firstRow
      .getByRole('button', { name: '成績選手1の選手情報を見る', exact: true })
      .waitFor();
    const groups = m.getByLabel('成績の表示項目');
    await groups.selectOption('sabers');
    assert.deepEqual(
      await firstRow.locator('.online-roster-values > span').allTextContents(),
      ['1.127', '.577', '.550', '.100'],
    );
    await m
      .getByText('※ 出塁率・OPS・打席関連は概算', { exact: true })
      .waitFor();
    await m.getByRole('button', { name: 'OPSで並べ替え', exact: true }).click();
    await firstRow
      .getByRole('button', { name: '成績選手1の選手情報を見る', exact: true })
      .waitFor();
    await m.getByRole('button', { name: 'OPSで並べ替え', exact: true }).click();
    await firstRow
      .getByRole('button', { name: '成績選手2の選手情報を見る', exact: true })
      .waitFor();
    await m.screenshot({
      path: `/tmp/baseball-online-mobile-sabers-${width}.png`,
      fullPage: true,
    });
    for (const id of await groups
      .locator('option')
      .evaluateAll((options) => options.map((option) => option.value))) {
      await groups.selectOption(id);
      assert.equal(
        await firstRow.locator('.online-roster-values > span').count(),
        4,
      );
      assert.ok(
        await firstRow
          .locator('.online-roster-values > span')
          .evaluateAll((cells) =>
            cells.every((cell) => cell.scrollWidth <= cell.clientWidth + 1),
          ),
        `${width}px ${id}で数値を切り落とさない: ${JSON.stringify(await firstRow.locator('.online-roster-values > span').evaluateAll((cells) => cells.map((cell) => ({ text: cell.textContent, w: cell.clientWidth, s: cell.scrollWidth, font: getComputedStyle(cell).fontSize }))))}`,
      );
      assert.ok(
        await m
          .locator('main')
          .evaluate(
            (element) => element.scrollHeight <= element.clientHeight + 1,
          ),
        '各項目群で縦スクロールなし',
      );
    }
    await groups.selectOption('abilities');
    await m.screenshot({
      path: `/tmp/baseball-online-mobile-grades-${width}.png`,
      fullPage: true,
    });
    assert.deepEqual(
      await firstRow.locator('.online-roster-values > span').allTextContents(),
      ['D', 'D', '—', 'B'],
      '一覧は既存PC判定の色付きランク',
    );
    await firstRow.getByRole('button').click();
    const numericDetail = m.getByRole('dialog');
    assert.deepEqual(
      await numericDetail.locator('.online-stat-grid dd').allTextContents(),
      ['50', '50', '—', '70'],
      '同じ能力でも詳細は実数値',
    );
    await m.keyboard.press('Escape');
    await groups.selectOption('state');
    await m
      .getByRole('button', { name: '調子で並べ替え', exact: true })
      .click();
    await firstRow.getByLabel('調子: 絶好調', { exact: true }).waitFor();
    await m.screenshot({
      path: `/tmp/baseball-online-mobile-state-${width}.png`,
      fullPage: true,
    });
    await groups.selectOption('basic');
    assert.equal(
      await m.locator('.online-mobile-controls button').count(),
      3,
      '下部の共通操作は戻る・ホーム・メニューのみ',
    );
    const controls = await m.locator('.online-mobile-controls').boundingBox();
    assert.ok(
      controls.y >= 590 && controls.y + controls.height <= 640,
      '操作を親指の届く下部に置く',
    );
    assert.equal(
      await m.locator('.online-header').count(),
      0,
      'ブランドヘッダを重ねない',
    );
    await m.screenshot({
      path: `/tmp/baseball-online-labels-roster-${width}.png`,
      fullPage: true,
    });
    assert.ok(
      await m.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
      '一覧のために画面全体をスクロールしない',
    );
    await m.getByRole('button', { name: '投球', exact: true }).click();
    for (const id of await groups
      .locator('option')
      .evaluateAll((options) => options.map((option) => option.value))) {
      await groups.selectOption(id);
      assert.ok(
        await firstRow
          .locator('.online-roster-values > span')
          .evaluateAll((cells) =>
            cells.every((cell) => cell.scrollWidth <= cell.clientWidth + 1),
          ),
        `${width}px 投球${id}で数値が収まる`,
      );
    }
    await groups.selectOption('basic');
    await firstRow.getByRole('button').click();
    await m.getByRole('dialog').getByText('108.00', { exact: true }).waitFor();
    await m.keyboard.press('Escape');
    await m
      .getByRole('button', { name: '成績選手9の選手情報を見る', exact: true })
      .click();
    await m
      .getByRole('dialog', { name: '成績選手9', exact: true })
      .getByText('制球安定', { exact: true })
      .waitFor();
    await m.keyboard.press('Escape');
    const pager = await m
      .getByRole('button', { name: '次のページ', exact: true })
      .boundingBox();
    assert.ok(pager.y + pager.height <= 592, 'ページ送りが画面内に収まる');
    const row = await m
      .locator('.online-compact-roster article')
      .last()
      .boundingBox();
    assert.ok(row.y + row.height <= pager.y, '最終行とページ送りが重ならない');
    await m.setViewportSize({ width, height: 844 });
    await m.waitForFunction(
      () =>
        document.querySelectorAll('.online-compact-roster article').length >=
        14,
    );
    while (
      await m
        .getByRole('button', { name: '次のページ', exact: true })
        .isEnabled()
    )
      await m.getByRole('button', { name: '次のページ', exact: true }).click();
    await m
      .getByRole('button', { name: '成績選手24の選手情報を見る', exact: true })
      .waitFor();
    await m.getByRole('button', { name: '戻る', exact: true }).click();
    await m.getByRole('heading', { name: '打順', exact: true }).waitFor();
    assert.equal(
      await m
        .locator('.online-lineup')
        .first()
        .getByRole('button', { name: '成績選手2の選手情報を見る', exact: true })
        .count(),
      1,
      '選手成績を見て戻っても編集中の打順を維持する',
    );
    await c.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    'online-label-ui-check PASS（配布HTMLと実projection・PC/スマホ320〜767px・1080x1920縦持ち・投打切替・詳細/閉じる/フォーカス・高さに応じた行数・ページ送り・閲覧のみ / 通信はfixture）',
  );
} catch (error) {
  if (activeContext) {
    for (const page of activeContext.pages())
      console.error(
        '失敗時の画面',
        JSON.stringify({
          url: page.url(),
          errors,
          viewportChanges: await page
            .evaluate(() => window.__onlineViewportChanges)
            .catch(() => null),
          state: await page
            .locator('body')
            .innerText()
            .catch(() => null),
        }),
      );
    await activeContext.tracing
      .stop({ path: '/tmp/baseball-online-label-ui-failure.zip' })
      .catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
}
