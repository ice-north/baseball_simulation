// 指導者（監督・コーチ）の画面（`src/online/StaffPage.jsx`）を実画面で操作する。
// 配布HTML（dist/index.html）を開き、通信はこの検査の中のリーグへつなぐ
// （`lib/serviceRoute.mjs`。サーバーもシーズンの進行も要らない）。
//   npm run build && node tools/sim-harness/online-staff-ui-check.mjs
//
// 見ること（リーグはセットを選んだ直後＝キャンプの間）:
//  - PC の左メニュー「指導者」: 3人のカード・任せ方・采配の内訳・市場・各球団の指導者
//  - 任せ方は押しただけでは送らず、「任せ方を保存」でまとめて1回だけ送る
//  - 野手コーチを解任すると空席になり、スタメンと打順の任せ方は「自分で」しか選べない
//  - 市場から呼ぶと席が埋まる
//  - 方針・采配の項目の下に「→ 中身（決めた人）」が出る
//  - 任せ方・方針・采配を変えたまま別のページへ移ると、左メニューに未保存の印が出る
//  - 他球団を選ぶと、その球団の指導者（CPU球団なら采配の内訳も）が出る
//  - スマホ（390px）のホームの「指導者」から同じ中身が開く
// 画面の写しは /tmp/baseball-online-staff-*.png
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';
import { routeToService } from './lib/serviceRoute.mjs';
import { join } from 'node:path';
import { createTestStore } from './lib/testStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';

const html = await readFile(new URL('../../dist/index.html', import.meta.url), 'utf8');
const base = 'http://localhost:3000';

/** セットを選んでキャンプに入ったリーグ（参加者は管理者1人） */
async function campService() {
  const dir = await mkdtemp(join(tmpdir(), 'online-staff-ui-'));
  const store = createTestStore(join(dir, 'league.json'));
  const clock = () => '2026-10-26T15:00:00.000Z';
  const service = new LeagueService(store, {
    members: [{ userId: 'admin', label: '管理者' }],
    adminId: 'admin',
    clock,
  });
  const sessionId = (await service.login('admin')).sessionId;
  await service.command('admin', sessionId, { requestId: 'create-0', revision: 0, type: 'create' });
  const created = (await store.read()).league;
  await service.command('admin', sessionId, {
    requestId: 'packpick-0',
    revision: created.revision,
    type: 'submit',
    payload: { phaseId: created.phase.id, plan: { packId: created.packs[0].id }, ready: true, baseSubmission: null },
  });
  const league = (await store.read()).league;
  assert.equal(league.phase?.kind, 'camp', 'セットを選んでもキャンプに入らない');
  return { service, store, userId: 'admin', sessionId };
}

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROME_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHROME_CHANNEL } : {}),
  headless: true,
});
const errors = [];
try {
  const fixture = await campService();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const { commands } = await routeToService(context, fixture);
  await context.route(`${base}/online`, (route) => route.fulfill({ contentType: 'text/html', body: html }));
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${base}/online`);
  const nav = p.locator('.online-page-nav');
  const go = (label) => nav.getByRole('button', { name: label, exact: true }).click();
  // 左メニューの未保存の印（u1 中11）。⚠ 以前はスタメン設定・投手起用にしか出ず、
  //   任せ方・方針・采配は変えたまま移っても何も出なかった
  const unsavedMark = (label) =>
    nav.getByRole('button', { name: label, exact: true }).getByLabel('保存していない変更');
  const goHome = async () => {
    await go('ホーム');
    await nav.locator('.online-nav-home[aria-current="page"]').waitFor();
  };
  await nav.getByRole('button', { name: '指導者', exact: true }).waitFor();
  await go('指導者');
  const cards = p.locator('.online-staff-grid').first().locator('.online-staff-card');
  await cards.first().waitFor();
  assert.equal(await cards.count(), 3, '首脳陣のカードが3枚でない');
  for (const role of ['監督', '投手コーチ', '野手コーチ'])
    assert.ok((await cards.allInnerTexts()).some((t) => t.includes(role)), `${role}のカードが無い`);
  assert.ok(await p.getByRole('heading', { name: '市場（呼べる指導者）' }).isVisible(), 'キャンプなのに市場が出ない');
  assert.ok(await p.getByRole('heading', { name: '各球団の指導者' }).isVisible(), '各球団の指導者の表が無い');
  assert.ok(await p.getByRole('heading', { name: '試合中の采配（実際の動き）' }).isVisible(), '采配の内訳が無い');
  await p.screenshot({ path: '/tmp/baseball-online-staff-pc.png', fullPage: true });

  // 任せ方: 投手起用を「任せる」、キャンプを「自分で」に。⚠ 押しただけでは送らず、
  //   「任せ方を保存」で1回だけ送る（いしだ指摘 2026-11-10: 1つ押すたびに保存が走るのは微妙）
  const area = (label) => p.locator('.online-choice', { has: p.locator('.online-choice-label', { hasText: label }) });
  const pressed = (label) => area(label).locator('button[aria-pressed="true"]').innerText();
  const modesCard = p.locator('section.online-card', { has: p.getByRole('heading', { name: '任せ方', exact: true }) });
  const saveModes = modesCard.getByRole('button', { name: '任せ方を保存', exact: true });
  assert.equal(await pressed('投手起用'), '意見を聞く', '既定の任せ方が「意見を聞く」でない');
  assert.ok(await saveModes.isDisabled(), '変えていないのに任せ方を保存できる');
  const sentBefore = commands.length;
  await area('投手起用').getByRole('button', { name: '任せる', exact: true }).click();
  await area('キャンプ').getByRole('button', { name: '自分で', exact: true }).click();
  assert.equal(await pressed('投手起用'), '任せる', '押した任せ方が画面に出ない');
  assert.equal(commands.length, sentBefore, '保存を押す前に任せ方を送っている');
  assert.ok(await modesCard.getByText('保存していない変更があります（2件）').isVisible(), '未保存の件数が出ない');
  // 変えたまま別のページへ移ると、左メニューの「指導者」に印。戻ると下書きはそのまま
  await goHome();
  assert.equal(await unsavedMark('指導者').count(), 1, '任せ方を変えたまま移っても左メニューに印が出ない');
  assert.equal(await unsavedMark('方針・采配').count(), 0, '変えていない方針・采配に印が出る');
  await go('指導者');
  await modesCard.getByText('保存していない変更があります（2件）').waitFor();
  // 戻して押し直すと、その分野は変更なしに戻る
  await area('キャンプ').getByRole('button', { name: '意見を聞く', exact: true }).click();
  await area('キャンプ').getByRole('button', { name: '自分で', exact: true }).click();
  await saveModes.click();
  await p.getByText('任せ方を変えました', { exact: false }).waitFor();
  assert.equal(commands.length, sentBefore + 1, '任せ方の保存が1回でない');
  assert.deepEqual(commands.at(-1).payload, { modes: { pitching: 'delegate', camp: 'self' } });
  assert.equal(await pressed('投手起用'), '任せる', '保存した任せ方が出ない');
  assert.ok(await modesCard.getByText('保存済み', { exact: true }).isVisible(), '保存したのに未保存のまま');
  await goHome();
  assert.equal(await unsavedMark('指導者').count(), 0, '任せ方を保存したのに印が残る');
  await go('指導者');
  await cards.first().waitFor();

  // 野手コーチを解任 → 空席・スタメンと打順は「自分で」だけ
  // ⚠ 席は 監督・投手コーチ・野手コーチ の順（どのカードにも「野手コーチと入れ替える」がある）
  const battingCard = cards.nth(2);
  assert.equal(await battingCard.locator('.online-eyebrow').innerText(), '野手コーチ');
  await battingCard.getByRole('button', { name: '解任する', exact: true }).click();
  await p.getByText('指導者を入れ替えました', { exact: false }).waitFor();
  await cards.filter({ hasText: '空席' }).first().waitFor();
  assert.equal(await pressed('スタメンと打順'), '自分で', '野手コーチがいないのに任せ方が自分でにならない');
  assert.ok(
    await area('スタメンと打順').getByRole('button', { name: '任せる', exact: true }).isDisabled(),
    '空いた席の分野を任せられる',
  );
  // 市場から野手コーチに呼ぶ
  const market = p.locator('section', { has: p.getByRole('heading', { name: '市場（呼べる指導者）' }) });
  await market.getByRole('button', { name: '野手コーチに呼ぶ', exact: true }).first().click();
  await p.getByText('指導者を入れ替えました', { exact: false }).waitFor();
  await p.waitForFunction(() => !document.querySelector('.online-staff-card.is-empty'));
  assert.equal(await pressed('スタメンと打順'), '意見を聞く', '呼んだあとも自分でのまま');
  await p.screenshot({ path: '/tmp/baseball-online-staff-pc-after.png', fullPage: true });

  // 他球団（CPU）の指導者
  const selector = p.locator('.online-team-selector select');
  const options = await selector.locator('option').evaluateAll((list) => list.map((o) => o.value));
  await selector.selectOption(options.find((v, i) => i > 0 && v));
  await p.getByText('球団の期待', { exact: false }).first().waitFor();
  assert.ok(await p.getByRole('heading', { name: '試合中の采配（実際の動き）' }).isVisible(), 'CPU球団の采配の内訳が出ない');
  await p.screenshot({ path: '/tmp/baseball-online-staff-pc-other.png', fullPage: true });

  // 方針・采配の項目の下に「→ 中身（決めた人）」
  await go('方針・采配');
  await p.locator('.online-staff-actual').first().waitFor();
  assert.ok((await p.locator('.online-staff-actual').count()) > 0, '方針・采配に指導者の中身が出ない');
  // 方針・采配を変えたまま移ると、左メニューの「方針・采配」に印。取り消すと消える
  await p
    .locator('.online-staff-choice')
    .first()
    .locator('button[aria-pressed="false"]')
    .first()
    .click();
  await goHome();
  assert.equal(await unsavedMark('方針・采配').count(), 1, '方針・采配を変えたまま移っても左メニューに印が出ない');
  await go('方針・采配');
  await p.getByRole('button', { name: '変更を取り消す', exact: true }).click();
  await goHome();
  assert.equal(await unsavedMark('方針・采配').count(), 0, '取り消したのに方針・采配の印が残る');
  await go('方針・采配');
  await p.locator('.online-staff-actual').first().waitFor();
  await p.screenshot({ path: '/tmp/baseball-online-staff-tactics.png', fullPage: true });

  // スマホ: ホームの「指導者」から
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(`${base}/online`);
  await p.getByRole('button', { name: '指導者', exact: true }).first().click();
  await p.locator('.online-staff-card').first().waitFor();
  assert.ok((await p.locator('.online-staff-card').count()) >= 3, 'スマホで指導者のカードが出ない');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 1, `スマホで横にはみ出す（${overflow}px）`);
  await p.screenshot({ path: '/tmp/baseball-online-staff-mobile.png', fullPage: true });

  assert.deepEqual(errors, [], `画面のエラー: ${errors.join(' / ')}`);
  console.log('online-staff-ui-check PASS（PC の指導者ページ・任せ方・解任と市場・他球団・方針の中身・スマホ）');
} finally {
  await browser.close();
}
