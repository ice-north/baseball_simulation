// PC版のトレード画面（`src/online/TradeScreen.jsx`）を実画面で操作する。
// 配布HTML（dist/index.html）を開き、通信はこの検査の中のリーグへつなぐ
// （`lib/serviceRoute.mjs`。サーバーもシーズンの進行も要らない）。
//
// 見ること（「比べて決められること」が主目的）:
//  - 届いた提案は、出す選手ともらう選手が**同じ列の表**に並び、交換のあとの
//    両球団の人数と構成が出る
//  - 新しい提案は、守備位置ごとに**自球団と相手の選手が1枚の表**（列がそろう）。
//    行を押すと交換案に入り、交換のあとの構成が変わって見える
//  - 名簿が成り立たない交換（捕手を全部出す）は、理由が出て提案できない
//  - 提案すると、サーバーに「出す＝自球団の選手・もらう＝相手の選手」の向きで届く
//  - 逆提案は、元の中身を選んだ状態で開き、**提案した側から見た向き**で送られる
//  - 読み直しても相手の表が消えない（読み直すたびに「読んでいます…」にしない）
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createTestStore } from './lib/testStore.mjs';
import { routeToService } from './lib/serviceRoute.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import {
  resolvePhaseNow,
  advanceLeagueDay,
} from '../../server/leagueEngine.mjs';
import { rosterCounts } from '../../src/utils/constants.js';

const html = await readFile(
  new URL('../../dist/index.html', import.meta.url),
  'utf8',
);
const base = 'http://localhost:3000';

// --- 2人のリーグ（開幕して数日） ---------------------------------------
const dir = await mkdtemp(join(tmpdir(), 'online-trade-ui-'));
const store = createTestStore(join(dir, 'league.json'));
const clock = () => '2026-10-26T15:00:00.000Z';
const service = new LeagueService(store, {
  members: [{ userId: 'a', label: 'A' }],
  adminId: 'a',
  clock,
});
const sa = (await service.login('a')).sessionId;
const sb = (await service.login('b')).sessionId;
let seq = 0;
const live = () => store.read().then((b) => b.league);
const send = async (user, session, type, payload) => {
  const l = await live();
  seq += 1;
  return service.command(user, session, {
    requestId: `trade-ui-${type}-${seq}`,
    revision: l?.revision ?? 0,
    type,
    payload,
  });
};
await send('a', sa, 'create');
await send('b', sb, 'join', {});
for (const [user, session] of [
  ['a', sa],
  ['b', sb],
]) {
  const l = await live();
  if (!l.phase || l.phase.kind !== 'pack_select') break;
  await send(user, session, 'submit', {
    phaseId: l.phase.id,
    plan: { packId: l.packs[user === 'a' ? 0 : 1].id },
    ready: true,
    baseSubmission: null,
  });
}
await store.transaction((bundle) => {
  const l = bundle.league;
  for (let i = 0; i < 5 && l.phase; i++) resolvePhaseNow(l, clock());
  for (let d = 0; d < 3; d++) advanceLeagueDay(l, `trade-ui-${d}`, clock());
  l.revision++;
  return { value: null };
});
const started = await live();
const teamA = started.members.find((m) => m.userId === 'a').teamName;
const teamB = started.members.find((m) => m.userId === 'b').teamName;
const rosterOf = (l, name) => l.game.teams[name].players;
const infield = ['first', 'second', 'third', 'short'];
// b から a へ: a の投手1人 ⇔ b の内野手1人
const wantedPitcher = rosterOf(started, teamA).find((p) => p.position === 'pitcher');
const offeredInfielder = rosterOf(started, teamB).find((p) =>
  infield.includes(p.position),
);
await send('b', sb, 'tradeOffer', {
  to: teamA,
  offer: [offeredInfielder.id],
  want: [wantedPitcher.id],
});

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROME_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHROME_CHANNEL }
    : {}),
  headless: true,
});
const errors = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  await routeToService(context, { service, userId: 'a', sessionId: sa });
  await context.route(`${base}/online`, (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${base}/online`);
  const nav = p.locator('.online-page-nav');
  await nav.getByRole('button', { name: 'トレード', exact: true }).click();

  // --- 届いた提案: 同じ列の表と、交換のあとの名簿 -----------------------
  const incoming = p
    .locator('.online-trade-card')
    .filter({ hasText: 'からの提案' });
  await incoming.locator('tr[data-player]').first().waitFor();
  const sideNames = (scope, side) =>
    scope
      .locator(`tbody[data-side="${side}"] tr[data-player] .online-player-name`)
      .allInnerTexts();
  assert.deepEqual(
    await sideNames(incoming, 'give'),
    [wantedPitcher.name],
    '届いた提案で、出す選手（自球団の投手）が「出す」に出ていない',
  );
  assert.deepEqual(
    await sideNames(incoming, 'get'),
    [offeredInfielder.name],
    '届いた提案で、もらう選手（相手の内野手）が「もらう」に出ていない',
  );
  // 能力と今季成績の列がある（名前だけの一覧に戻っていない）
  const headers = await incoming.locator('thead th').allInnerTexts();
  for (const label of ['総合', '速', '制', 'ミ', 'パ', '打率', '防御率'])
    assert.ok(
      headers.some((h) => h.trim() === label),
      `届いた提案の表に「${label}」の列が無い`,
    );
  const countsA = rosterCounts(rosterOf(started, teamA));
  const impactA = incoming.locator(
    `.online-trade-impact-team[data-team="${teamA}"]`,
  );
  const impactText = (await impactA.innerText()).replace(/\s+/g, '');
  assert.ok(
    impactText.includes(`投${countsA.pitcher}→${countsA.pitcher - 1}`) &&
      impactText.includes(`内${countsA.infielder}→${countsA.infielder + 1}`),
    `交換のあとの自球団の構成が出ていない: ${impactText}`,
  );

  // --- 相手の一覧にCPU球団も出す -----------------------------------------
  // ⚠ **1人で遊んでいる間もトレードが使えること**。以前は参加者の球団だけを
  //    相手にしていて、CPU11球団に対して何も出せなかった。
  // ⚠ 人の球団を**先に**並べ、CPUにはそう書く（返事が返るまでの時間が違う）
  {
    const picker = p
      .locator('.online-trade-composer')
      .last()
      .getByRole('group', { name: '相手の球団' });
    const names = (await picker.getByRole('button').allInnerTexts()).map((t) =>
      t.trim(),
    );
    assert.equal(
      names.length,
      started.season.settings.teamNames.length - 1,
      `相手に出ている球団の数がちがう: ${names.join('/')}`,
    );
    assert.ok(
      names.some((n) => n.includes('（CPU）')),
      `CPU球団が相手に出ていない: ${names.join('/')}`,
    );
    assert.ok(
      !names[0].includes('（CPU）'),
      `人の球団が先に並んでいない: ${names.join('/')}`,
    );
    assert.equal(
      names.filter((n) => !n.includes('（CPU）')).length,
      1,
      `人の球団の数がちがう: ${names.join('/')}`,
    );
  }

  // --- 新しい提案: 1枚の表で選ぶ → 交換案 → 提案 ------------------------
  const composer = p.locator('.online-trade-composer').last();
  await composer
    .locator('tbody[data-side="get"] tr[data-player]')
    .first()
    .waitFor();
  assert.equal(
    await composer.locator('table.online-trade-table').count(),
    1,
    '自球団と相手が1枚の表になっていない（列がそろわない）',
  );
  const choose = (label) =>
    composer
      .getByRole('group', { name: '守備位置' })
      .getByRole('button', { name: new RegExp(`^${label}`) })
      .click();
  const deal = composer.locator('.online-trade-deal');
  const submit = deal.getByRole('button', { name: 'この内容で提案する' });
  assert.ok(await submit.isDisabled(), '何も選んでいないのに提案できる');
  // 自球団の投手（表の先頭＝総合の最上位）を出し、相手の内野手をもらう
  const myPitcherRow = composer
    .locator('tbody[data-side="give"] tr[data-player]')
    .first();
  const myPitcherId = Number(await myPitcherRow.getAttribute('data-player'));
  await myPitcherRow.click();
  await choose('内野手');
  const theirRow = composer
    .locator('tbody[data-side="get"] tr[data-player]')
    .first();
  const theirId = Number(await theirRow.getAttribute('data-player'));
  await theirRow.click();
  const dealGive = await deal
    .locator('.online-trade-deal-side.is-give .online-trade-deal-name b')
    .allInnerTexts();
  const dealGet = await deal
    .locator('.online-trade-deal-side.is-get .online-trade-deal-name b')
    .allInnerTexts();
  const byId = (name, id) => rosterOf(started, name).find((x) => x.id === id);
  assert.deepEqual(dealGive, [byId(teamA, myPitcherId).name], '交換案の「出す」が違う');
  assert.deepEqual(dealGet, [byId(teamB, theirId).name], '交換案の「もらう」が違う');
  const dealImpact = (
    await deal
      .locator(`.online-trade-impact-team[data-team="${teamA}"]`)
      .innerText()
  ).replace(/\s+/g, '');
  assert.ok(
    dealImpact.includes(`投${countsA.pitcher}→${countsA.pitcher - 1}`),
    `交換案に交換のあとの構成が出ていない: ${dealImpact}`,
  );
  // 守備位置のボタンに、選んだ人数が出る（別の守備位置に選んだ選手を忘れない）
  assert.ok(
    (await composer
      .getByRole('group', { name: '守備位置' })
      .getByRole('button', { name: /^投手（1人選択）/ })
      .count()) === 1,
    '守備位置のボタンに選んだ人数が出ていない',
  );

  await p.screenshot({ path: '/tmp/baseball-online-trade.png', fullPage: false });
  // ⚠ **名簿が成り立たない交換は提案できない**（理由を出す）。捕手を全部出す
  await choose('捕手');
  const catcherRows = composer.locator('tbody[data-side="give"] tr[data-player]');
  const catchers = await catcherRows.count();
  for (let i = 0; i < catchers; i++) await catcherRows.nth(i).click();
  await deal.getByRole('alert').filter({ hasText: '捕手が居なくなります' }).waitFor();
  assert.ok(await submit.isDisabled(), '捕手が居なくなる交換を提案できる');
  // 交換案の「外す」で戻す
  for (let i = 0; i < catchers; i++)
    await deal
      .locator('.online-trade-deal-side.is-give')
      .getByRole('button', { name: /を外す$/ })
      .last()
      .click();
  assert.ok(await submit.isEnabled(), '捕手を外しても提案できない');
  await submit.click();
  await p.waitForFunction(
    () => !document.querySelector('.online-trade-deal-side.is-give li'),
  );
  const sent = (await live()).trades.find((t) => t.from === 'a');
  assert.ok(sent, '提案がサーバーに届いていない');
  assert.deepEqual(
    [sent.offer, sent.want],
    [[myPitcherId], [theirId]],
    '提案の向きが違う（出す＝自球団・もらう＝相手）',
  );

  // --- 逆提案: 元の中身を選んだ状態で開き、提案した側から見た向きで送る ---
  await incoming.getByRole('button', { name: '逆提案する' }).click();
  const counter = incoming.locator('.online-trade-composer');
  await counter.locator('tbody[data-side="get"] tr[data-player]').first().waitFor();
  const counterDeal = counter.locator('.online-trade-deal');
  assert.deepEqual(
    await counterDeal
      .locator('.online-trade-deal-side.is-give .online-trade-deal-name b')
      .allInnerTexts(),
    [wantedPitcher.name],
    '逆提案が元の「出す」を選んだ状態で開かない',
  );
  assert.deepEqual(
    await counterDeal
      .locator('.online-trade-deal-side.is-get .online-trade-deal-name b')
      .allInnerTexts(),
    [offeredInfielder.name],
    '逆提案が元の「もらう」を選んだ状態で開かない',
  );
  // 出す投手を、別の投手（表の2番目以降で、元と違う人）に替える
  const counterGive = counter.locator('tbody[data-side="give"] tr[data-player]');
  await counterGive.filter({ hasText: wantedPitcher.name }).click();
  const other = counterGive.filter({ hasNotText: wantedPitcher.name }).first();
  const otherId = Number(await other.getAttribute('data-player'));
  await other.click();
  await counterDeal.getByRole('button', { name: 'この内容で返す' }).click();
  // ⚠ 向きを取り違えると、サーバーが「出す選手が名簿にいません」で断り、
  //    逆提案の欄が閉じない
  await incoming
    .locator('.online-trade-composer')
    .waitFor({ state: 'detached', timeout: 15000 })
    .catch(async () => {
      assert.fail(
        `逆提案が通らない（向きの取り違えなど）: ${await p.locator('[role="alert"]').allInnerTexts()}`,
      );
    });
  const countered = (await live()).trades.find((t) => t.from === 'b');
  assert.ok(countered?.countered, '逆提案がサーバーに届いていない');
  // ⚠ `offer` はいつも**提案した側（b）**が出す選手
  assert.deepEqual(
    [countered.offer, countered.want],
    [[offeredInfielder.id], [otherId]],
    '逆提案の向きが違う（offer は提案した側が出す選手）',
  );
  assert.deepEqual(errors, []);
  console.log(
    'online-trade-ui-check PASS（届いた提案を同じ列で比べる・交換後の構成 / 相手にCPU球団も出る・人が先 / 1枚の表で選ぶ・交換案 / 成り立たない交換は提案できない / 提案と逆提案の向き）',
  );
} finally {
  await browser.close();
}
