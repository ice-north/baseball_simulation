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
//  - 成立につながる操作（提案・逆提案）は**確認を1段挟む**（出す・もらう選手、取り消せないこと、
//    片側が空なら注意）。CPU球団の答え（断った・受けた）を**文で**出す（u1 高3。以前は押した
//    瞬間に成立し、出たのは「保存しました」だけだった）
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
  tradeValueOf,
} from '../../server/leagueEngine.mjs';
import { tradeFactorFor } from '../../server/coachEngine.mjs';
import { CPU_ACCEPT_MARGIN } from '../../src/online/trades.js';
import { rosterCounts } from '../../src/utils/constants.js';
import { shortLastLines } from './lib/textWrap.mjs';
import { failureShots } from './lib/failureShots.mjs';

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
// 画面に出る球団名（名前を付けていれば表示名）
const labelOf = (l, name) => l.teams.find((t) => t.name === name)?.displayName || name;
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
  // --- スマホWeb: 返事が必要な提案をホームの帯で知らせる -----------------
  // ⚠ 知らせないと提案に気づかない（PC版の左メニューの数・アプリと同じ数え方。`notices.js`）。
  //    返事（受ける・断る）は帯から開く画面でする（このファイルの最後の段）
  {
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    await routeToService(phone, { service, userId: 'a', sessionId: sa });
    await phone.route(`${base}/online`, (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    const m = await phone.newPage();
    m.on('pageerror', (e) => errors.push(e.message));
    await m.goto(`${base}/online`);
    const banner = m
      .getByRole('status')
      .filter({ hasText: '返事が必要なトレードの提案が1件あります' });
    await banner.waitFor();
    // ⚠ 以前は「PCかアプリで返事してください」と書くだけで、スマホWebでは返事ができなかった
    //    （判断1・案B ②）。帯から返事の画面へ行ける
    assert.equal(
      await banner.getByRole('button', { name: '返事する', exact: true }).count(),
      1,
      'ホームの帯から返事の画面へ行けない',
    );
    await phone.close();
  }
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
  // ⚠ 地色の上の見出し（「返事が必要な提案」）は地色用の濃い文字（`--ink`）にする。
  //    カード用の明るい文字のままで、明るい地色との差が 1.7:1 しかなかった
  const headingContrast = await p
    .locator('.online-trade-heading')
    .first()
    .evaluate((node) => {
      const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
      let ground = null;
      for (let n = node; n && !ground; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(c)) ground = c;
      }
      const lum = (c) => {
        const [r, g, b] = rgb(c).map((v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const [hi, lo] = [lum(getComputedStyle(node).color), lum(ground)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    });
  assert.ok(
    headingContrast >= 4.5,
    `トレードの見出しが地色の上で読みにくい（${headingContrast.toFixed(2)}:1）`,
  );
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
  // ⚠ **押してもすぐには送らない**。出す・もらう選手と、成立したら取り消せないことを見せる
  await submit.click();
  const confirm = deal.getByRole('group', { name: 'トレードの確認' });
  await confirm.waitFor();
  const confirmText = await confirm.innerText();
  assert.ok(
    confirmText.includes(byId(teamA, myPitcherId).name) &&
      confirmText.includes(byId(teamB, theirId).name),
    `確認に出す・もらう選手の名前が無い: ${confirmText}`,
  );
  assert.match(confirmText, /取り消せません/, '確認に「取り消せない」ことが書かれていない');
  assert.equal(
    (await live()).trades.filter((t) => t.from === 'a').length,
    0,
    '確認の前に提案を送っている',
  );
  await confirm.getByRole('button', { name: '提案を送る', exact: true }).click();
  await p.waitForFunction(
    () => !document.querySelector('.online-trade-deal-side.is-give li'),
  );
  // 参加者の球団へは「申し込んだ・相手の返事待ち」と出す（成立とは書かない）
  await deal
    .locator('.online-trade-result')
    .filter({ hasText: `${labelOf(started, teamB)}へ提案しました` })
    .waitFor();
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
  await counterDeal
    .getByRole('group', { name: 'トレードの確認' })
    .getByRole('button', { name: '逆提案を送る', exact: true })
    .click();
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
  await p
    .locator('.online-trade-result')
    .filter({ hasText: `${labelOf(started, teamB)}へ逆提案を返しました` })
    .waitFor();
  // ⚠ `offer` はいつも**提案した側（b）**が出す選手
  assert.deepEqual(
    [countered.offer, countered.want],
    [[offeredInfielder.id], [otherId]],
    '逆提案の向きが違う（offer は提案した側が出す選手）',
  );

  // --- CPU球団へ: 片側が空なら注意・断られたら理由・受けたら成立の文 ------------
  {
    const l = await live();
    const humansNow = new Set(l.members.map((m) => m.teamName));
    const cpuTeam = l.season.settings.teamNames.find((name) => !humansNow.has(name));
    await composer
      .getByRole('group', { name: '相手の球団' })
      .getByRole('button', { name: `${labelOf(l, cpuTeam)}（CPU）`, exact: true })
      .click();
    await choose('投手');
    const getRows = composer.locator('tbody[data-side="get"] tr[data-player]');
    await getRows.first().waitFor();
    // もらうだけ（出す選手なし）→ 確認で注意 → CPUは断る（理由を交換案の下に出す）
    await getRows.first().click();
    await submit.click();
    const cpuConfirm = deal.getByRole('group', { name: 'トレードの確認' });
    await cpuConfirm.waitFor();
    const askOnly = await cpuConfirm.innerText();
    assert.match(askOnly, /出す選手がいません/, '片側が空なのに注意が出ない');
    assert.match(askOnly, /CPU球団はその場で答えます/, 'CPU球団がその場で答えることを書いていない');
    await cpuConfirm.getByRole('button', { name: '提案を送る', exact: true }).click();
    await deal
      .locator('.online-trade-result.is-bad')
      .filter({ hasText: '応じませんでした' })
      .waitFor();
    assert.equal(
      (await live()).trades.filter((t) => t.toTeam === cpuTeam).length,
      0,
      '断られた提案が残っている',
    );
    await getRows.first().click(); // 選び直す（外す）
    // ⚠ 受ける組み合わせ: CPUの値踏み（`cpuTradeDecision`）で、出す投手の値打ちが
    //    もらう投手の値打ちの CPU_ACCEPT_MARGIN 倍以上になる2人を選ぶ
    const factor = tradeFactorFor(l, cpuTeam);
    const price = (p) => Math.max(1, tradeValueOf(p) * factor(p));
    const pitchersOf = (name) =>
      rosterOf(l, name).filter((p) => p.position === 'pitcher');
    const best = pitchersOf(teamA).sort((a, b) => price(b) - price(a))[0];
    const worst = pitchersOf(cpuTeam).sort((a, b) => price(a) - price(b))[0];
    assert.ok(
      price(best) >= price(worst) * CPU_ACCEPT_MARGIN,
      '検査の前提: 受ける組み合わせが作れない',
    );
    await composer.locator(`tbody[data-side="give"] tr[data-player="${best.id}"]`).click();
    await composer.locator(`tbody[data-side="get"] tr[data-player="${worst.id}"]`).click();
    await submit.click();
    await cpuConfirm.waitFor();
    assert.doesNotMatch(
      await cpuConfirm.innerText(),
      /選手がいません/,
      '両側に選手がいるのに片側が空の注意が出る',
    );
    await cpuConfirm.getByRole('button', { name: '提案を送る', exact: true }).click();
    const accepted = deal
      .locator('.online-trade-result')
      .filter({ hasText: `${labelOf(l, cpuTeam)}が受けました。トレードが成立しました` });
    await accepted.waitFor();
    const acceptedText = await accepted.innerText();
    assert.ok(
      acceptedText.includes(best.name) && acceptedText.includes(worst.name),
      `成立の文に出した・来た選手の名前が無い: ${acceptedText}`,
    );
    const after = await live();
    assert.ok(
      rosterOf(after, teamA).some((p) => p.id === worst.id) &&
        !rosterOf(after, teamA).some((p) => p.id === best.id),
      'CPU球団が受けたのに選手が入れ替わっていない',
    );
  }
  // --- スマホWeb: 届いた提案に受ける・断るで返事する（判断1・案B ②） ---------------
  // ⚠ 以前はホームの帯で「PCかアプリで返事してください」と知らせるだけで、スマホWebだけの人は
  //    答えられなかった。PCと同じ部品・同じ命令（`tradeRespond`）・同じ確認（`DealConfirm`）。
  //    新しい提案と逆提案はPCかアプリのまま（スマホWebには出さない）
  {
    const l = await live();
    const ofGroup = (name, positions) =>
      rosterOf(l, name).filter((p) => positions.includes(p.position));
    const outfield = ['left', 'center', 'right'];
    // b → a を2件: 外野手どうし（受ける）と、内野手どうし（断る）
    const keepOut = ofGroup(teamA, outfield)[0];
    const takeOut = ofGroup(teamB, outfield)[0];
    const keepIn = ofGroup(teamA, infield).at(-1);
    const takeIn = ofGroup(teamB, infield).at(-1);
    await send('b', sb, 'tradeOffer', { to: teamA, offer: [takeOut.id], want: [keepOut.id] });
    await send('b', sb, 'tradeOffer', { to: teamA, offer: [takeIn.id], want: [keepIn.id] });
    const phone = await browser.newContext({
      viewport: { width: 320, height: 760 },
      isMobile: true,
    });
    await routeToService(phone, { service, userId: 'a', sessionId: sa });
    await phone.route(`${base}/online`, (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    const m = await phone.newPage();
    m.on('pageerror', (e) => errors.push(e.message));
    await m.goto(`${base}/online`);
    const banner = m
      .getByRole('status')
      .filter({ hasText: '返事が必要なトレードの提案が2件あります' });
    await banner.waitFor();
    assert.deepEqual(
      await shortLastLines(m, '.online-procedure-banner'),
      [],
      '320px でトレードの帯の文字が1字だけ次の行に落ちる',
    );
    await banner.getByRole('button', { name: '返事する', exact: true }).click();
    const cards = m.locator('.online-trade-card');
    const outCard = cards.filter({ hasText: takeOut.name });
    const inCard = cards.filter({ hasText: takeIn.name });
    await outCard.locator('.online-trade-impact').waitFor();
    await inCard.locator('.online-trade-impact').waitFor();
    // 出す選手ともらう選手（名前を押すと能力と成績を開ける）
    assert.deepEqual(
      [
        await outCard.locator('.online-trade-deal-side.is-give .online-trade-deal-name button').allInnerTexts(),
        await outCard.locator('.online-trade-deal-side.is-get .online-trade-deal-name button').allInnerTexts(),
      ],
      [[keepOut.name], [takeOut.name]],
      'スマホの返事で、出す選手ともらう選手が出ていない',
    );
    // 逆提案はスマホWebに出さない（PCかアプリ）
    assert.equal(
      await m.getByRole('button', { name: '逆提案する', exact: true }).count(),
      0,
      'スマホWebに逆提案が出ている',
    );
    // 320px で横に送らない・はみ出さない・1字だけ次の行に落ちない
    const fit = await m.evaluate(() => {
      const out = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push('横スクロール');
      for (const n of document.querySelectorAll('main *')) {
        if (!n.checkVisibility()) continue;
        const r = n.getBoundingClientRect();
        if (r.width && r.right > innerWidth + 1) out.push(`はみ出し ${n.className}`);
      }
      for (const n of document.querySelectorAll('.online-trade-card .online-actions button')) {
        if (n.getBoundingClientRect().height < 40) out.push(`低いボタン ${n.innerText}`);
      }
      return [...new Set(out)].slice(0, 8);
    });
    assert.deepEqual(fit, [], '320px でトレードの返事が幅に収まらない');
    assert.deepEqual(await shortLastLines(m, 'main'), [], '320px でトレードの返事の文字が1字だけ次の行に落ちる');
    // 受ける: 確認を1段挟む（PCと同じ言葉）→ 成立
    await outCard.getByRole('button', { name: 'この内容で成立させる', exact: true }).click();
    const confirm = outCard.getByRole('group', { name: 'トレードの確認' });
    await confirm.waitFor();
    assert.match(await confirm.innerText(), /取り消せません/, 'スマホの確認に取り消せないことが無い');
    assert.ok(
      (await live()).trades.some((t) => t.offer[0] === takeOut.id),
      '確認の前に成立させている',
    );
    await confirm.getByRole('button', { name: '成立させる', exact: true }).click();
    await m
      .locator('.online-trade-result')
      .filter({ hasText: 'トレードが成立しました' })
      .waitFor();
    const afterAccept = await live();
    assert.ok(
      rosterOf(afterAccept, teamA).some((p) => p.id === takeOut.id) &&
        !rosterOf(afterAccept, teamA).some((p) => p.id === keepOut.id),
      'スマホで受けたのに選手が入れ替わっていない',
    );
    // 断る: スマホでは確認を挟む（押し違えやすく、断った提案は戻せない。アプリと同じ）
    await inCard.getByRole('button', { name: '断る', exact: true }).click();
    const rejectConfirm = inCard.getByRole('group', { name: '断る前の確認' });
    await rejectConfirm.waitFor();
    assert.ok(
      (await live()).trades.some((t) => t.offer[0] === takeIn.id),
      '確認の前に断っている',
    );
    await rejectConfirm.getByRole('button', { name: '戻る', exact: true }).click();
    await rejectConfirm.waitFor({ state: 'detached' });
    await inCard.getByRole('button', { name: '断る', exact: true }).click();
    await rejectConfirm.getByRole('button', { name: '断る', exact: true }).click();
    await m
      .locator('.online-trade-result')
      .filter({ hasText: 'からの提案を断りました' })
      .waitFor();
    assert.ok(
      !(await live()).trades.some((t) => t.offer[0] === takeIn.id),
      'スマホで断った提案が残っている',
    );
    await m.getByText('返事が必要な提案はありません。', { exact: true }).waitFor();
    await phone.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    'online-trade-ui-check PASS（届いた提案を同じ列で比べる・交換後の構成 / 相手にCPU球団も出る・人が先 / 1枚の表で選ぶ・交換案 / 成り立たない交換は提案できない / 提案と逆提案の向き / 送る前の確認（選手・取り消せない・片側が空の注意） / CPU球団の答えを文で出す（断った・受けた） / スマホWebのホームで返事が必要な提案を知らせる / スマホWebで受ける・断る（どちらも確認つき））',
  );
} catch (error) {
  await failureShots(browser, 'online-trade-ui');
  throw error;
} finally {
  await browser.close();
}
