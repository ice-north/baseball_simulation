// 途中参加の流れと、選手の能力の説明を、PC版の実画面で確かめる。
// 配布HTML（dist/index.html）を開き、通信はこの検査の中のリーグへつなぐ
// （`lib/serviceRoute.mjs`。サーバーもシーズンの進行も要らない）。
//
// 見ること:
//  - 進行中のリーグに参加し、セットを選ぶと「参加の準備ができました」に切り替わる
//    （いしだ指摘 2026-11-08: セットと名前を決めた後も画面がそのままで、済んだのか
//    分からなかった）。自分の球団になる日時と、ホームへ・選び直す の2つを出す
//  - 選び直すとセットの一覧に戻り、別のセットを選ぶとまた準備完了に戻る
//  - ホームに「開幕待ち」が出て、手続きの帯（決めてください）は出ない
//  - 選手の詳細で能力名を押すと、何にどう効くかの説明が出る（体幹など）
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { seasonService, routeToService } from './lib/serviceRoute.mjs';
import { ABILITY_HELP } from '../../src/online/playerInfo.js';

const html = await readFile(
  new URL('../../dist/index.html', import.meta.url),
  'utf8',
);
const base = 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
try {
  const fixture = await seasonService({ days: 3 });
  const session = (await fixture.service.login('p2')).sessionId;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const { commands } = await routeToService(context, {
    service: fixture.service,
    userId: 'p2',
    sessionId: session,
  });
  await context.route(`${base}/online`, (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/online`);
  await page.getByRole('button', { name: '参加する', exact: true }).click();
  await page.getByRole('button', { name: '初期メンバー選択を開く' }).first().click();

  // --- セットを選ぶ → 準備完了 ---------------------------------------
  const cards = page.locator('.online-pack-card');
  await cards.nth(2).click();
  const packName = (await cards.nth(2).locator('strong').innerText()).trim();
  await page.getByRole('button', { name: 'このセットにする', exact: true }).click();
  const ready = page.locator('.online-join-ready');
  await ready.waitFor();
  const readyText = await ready.innerText();
  assert.ok(readyText.includes(`「${packName}」`), `準備完了に選んだセットが出ない: ${readyText}`);
  assert.match(readyText, /\d+\/\d+\([日月火水木金土]\) \d+:\d\d の開幕から/, `自分の球団になる日時が出ない: ${readyText}`);
  assert.equal(await cards.count(), 0, '選び終えたのにセットの一覧が出たまま');
  // 名前も同じ画面で決められる
  await page.locator('.online-identity input').nth(0).fill('テスト球団');
  await page.locator('.online-identity input').nth(1).fill('テスト');
  await page.getByRole('button', { name: 'この名前にする', exact: true }).click();
  await page.getByText('「テスト球団」（テスト）で登録しました。').waitFor();
  await ready.waitFor();

  // --- 選び直す → 別のセット → また準備完了 -------------------------
  await page.getByRole('button', { name: 'セットを選び直す', exact: true }).click();
  await cards.first().waitFor();
  await cards.nth(4).click();
  const nextName = (await cards.nth(4).locator('strong').innerText()).trim();
  await page.getByRole('button', { name: 'このセットにする', exact: true }).click();
  await ready.waitFor();
  assert.ok(
    (await ready.innerText()).includes(`「${nextName}」`),
    '選び直したセットが準備完了に出ない',
  );
  assert.deepEqual(
    commands.map((c) => c.type),
    ['join', 'pack', 'profile', 'pack'],
    '送った命令がちがう',
  );

  // --- ホームへ → 開幕待ち ---------------------------------------
  await page.getByRole('button', { name: 'ホームへ', exact: true }).click();
  const waiting = page.locator('.online-procedure-banner.is-waiting');
  await waiting.waitFor();
  assert.ok(
    (await waiting.innerText()).includes(`「${nextName}」`),
    'ホームの開幕待ちに選んだセットが出ない',
  );
  assert.equal(
    await page.getByText('初期メンバー選択を決めてください').count(),
    0,
    '選び終えたのに手続きの帯が残っている',
  );
  assert.match(
    await page.locator('.online-nav-waiting').innerText(),
    /開幕待ち/,
    '左上に開幕待ちが出ない',
  );
  await page.screenshot({ path: '/tmp/online-join-home.png' });

  // --- 選手の詳細で能力の説明 -------------------------------------
  await page.getByRole('button', { name: '選手成績', exact: true }).click();
  const name = page.locator('main .online-player-name').first();
  await name.waitFor();
  await name.click();
  const detail = page.locator('.online-detail-grid');
  await detail.waitFor();
  const blocks = await detail.locator('h4').allInnerTexts();
  assert.ok(
    blocks.some((t) => t.startsWith('成長の素質') && t.includes('試合には効かない')) &&
      blocks.includes('体力・精神'),
    `能力が効き方で分かれていない: ${blocks.join(' / ')}`,
  );
  await detail.locator('dt.has-help', { hasText: '体幹' }).click();
  const help = detail.locator('.online-ability-help');
  await help.waitFor();
  assert.ok(
    (await help.innerText()).includes(ABILITY_HELP['体幹']),
    '体幹を押しても説明が出ない',
  );
  await detail.locator('dt.has-help', { hasText: '体幹' }).click();
  assert.equal(await help.count(), 0, 'もう一度押しても説明が閉じない');
  await page.screenshot({ path: '/tmp/online-join-detail.png' });

  assert.deepEqual(errors, [], `画面のエラー: ${errors.join(' / ')}`);
  console.log(
    '■ 途中参加の画面: OK（選ぶと準備完了・日時 / 選び直し / ホームの開幕待ち / 能力の説明）',
  );
} finally {
  await browser.close();
}
