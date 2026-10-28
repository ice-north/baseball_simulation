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
  position: id === 9 ? 'pitcher' : 'center',
  batting: { meet: 50, power: 50 },
  pitching: { velocity: 140, control: 50 },
  seasonStats: {
    batting: {
      atBats: 100,
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
  ...Array.from({ length: 8 }, (_, i) => player(i + 2)),
];
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
assert.equal(view.roster[0].performance.batting.labels.length, 3);
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROME_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHROME_CHANNEL }
    : {}),
  headless: true,
});
const errors = [];
async function scene(width, height = 844) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 768,
  });
  await context.addInitScript(() =>
    localStorage.setItem(
      'baseball-online-auth-v1',
      JSON.stringify({
        userId: 'a',
        sessionId: 'fixture',
        accessToken: 'fixture',
      }),
    ),
  );
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
    .getByRole('button', { name: '成績選手1の成績を見る', exact: true })
    .click();
  const dialog = p.getByRole('dialog', { name: '成績選手1', exact: true });
  await dialog.waitFor();
  await dialog.getByText('.450', { exact: true }).waitFor();
  await p.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.ok(
    await p
      .getByRole('button', { name: '成績選手1の成績を見る', exact: true })
      .evaluate((e) => document.activeElement === e),
    'Escape後に選手名へフォーカスを戻す',
  );
  await p.getByRole('button', { name: '投球', exact: true }).click();
  await p
    .getByRole('button', { name: '成績選手9の成績を見る', exact: true })
    .click();
  await p
    .getByRole('dialog', { name: '成績選手9', exact: true })
    .getByText('制球安定', { exact: true })
    .waitFor();
  await p.keyboard.press('Escape');
  await p.screenshot({
    path: '/tmp/baseball-online-labels-desktop.png',
    fullPage: true,
  });
  await context.close();
  for (const width of [320, 390, 767]) {
    const { page: m, context: c } = await scene(width, 640);
    await m.getByRole('button', { name: '打順', exact: true }).click();
    await m
      .getByRole('button', { name: '成績選手1の成績を見る', exact: true })
      .click();
    const d = m.getByRole('dialog', { name: '成績選手1', exact: true });
    await d.waitFor();
    assert.equal(await d.locator('.online-stat-label').count(), 3);
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
    await m
      .getByRole('button', { name: '投手・控えを含む選手成績 →', exact: true })
      .click();
    assert.equal(await m.locator('.online-compact-roster article').count(), 3);
    await m.screenshot({
      path: `/tmp/baseball-online-labels-roster-${width}.png`,
      fullPage: true,
    });
    assert.ok(
      await m.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
      '一覧は3件ずつで長い縦スクロールにしない',
    );
    await m.getByRole('button', { name: '投球', exact: true }).click();
    await m.getByRole('button', { name: '次のページ', exact: true }).click();
    await m.getByRole('button', { name: '次のページ', exact: true }).click();
    await m
      .getByRole('button', { name: '成績選手9の成績を見る', exact: true })
      .click();
    await m
      .getByRole('dialog', { name: '成績選手9', exact: true })
      .getByText('制球安定', { exact: true })
      .waitFor();
    await m.keyboard.press('Escape');
    await m.getByRole('button', { name: '← 打順に戻る', exact: true }).click();
    await m
      .getByRole('heading', { name: '打順の入れ替え', exact: true })
      .waitFor();
    assert.equal(
      await m
        .locator('.online-lineup')
        .first()
        .getByRole('button', { name: '成績選手2の成績を見る', exact: true })
        .count(),
      1,
      '選手成績を見て戻っても編集中の打順を維持する',
    );
    await c.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    'online-label-ui-check PASS（配布HTMLと実projection・PC/スマホ320〜767px・投打切替・詳細/閉じる/フォーカス・3件ページ・閲覧のみ / 通信はfixture）',
  );
} finally {
  await browser.close();
}
