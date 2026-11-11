// 一人用の通し検査（ブラウザ）。`npm run check:ui`（ビルドしてから実行）。
//
//   独立リーグで新しく始める → 初回のトライアウト（選ぶ→指名する・取り消す）→ 途中で保存して
//   読み直し、続きから指名する
//   大学野球で新しく始める → 春のキャンプ → 開幕 → 30日早送り → 保存して読み直す
//   → 下まで送って7日進めても位置はそのまま・画面を替えたら一番上から
//   → 次の区切り（夏季合宿）→ 合宿 → 秋季リーグ → 次の区切り（ドラフト前のフェーズ移行）
//   → ドラフト会議の画面が出る
//
// 画面が真っ白になる・ボタンが反応しない・ページの例外、を遊ぶ前に捕まえるのが目的。
// 成績の数字の妥当性は season-check などのハーネスが見るので、ここでは見ない。
//
// `--scenes` を付けると、途中の区切りごとにブラウザの保存領域を
// tools/scenes/<名前>.json に書き出す（git には入れない）。
// `npm run scene -- <名前>` でその場面からブラウザを開ける。
//
// 所要時間は約2分。スクリーンショットは /tmp/baseball-single-*.png に残す。
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, driver, launchBrowser, root, startPreview } from './lib/singleplayer.mjs';

const writeScenes = process.argv.includes('--scenes');
const sceneDir = join(root, 'tools', 'scenes');
if (writeScenes) mkdirSync(sceneDir, { recursive: true });

const stopPreview = await startPreview();
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
// console.error も拾う。一人用は「TEAMS_DATA を名前で引けない」などを console.error だけ出して
// 黙って戻る所があり（CLAUDE.md の不変条件）、画面は動いたまま何も起きない
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text().slice(0, 300)}`); });
// 確認ダイアログ（上書き保存など）は「はい」で進める。alert はそのまま記録する
page.on('dialog', async (d) => {
  if (d.type() === 'alert') errors.push(`alert: ${d.message()}`);
  await d.accept();
});

const ui = driver(page);
const shot = (name) => page.screenshot({ path: `/tmp/baseball-single-${name}.png` });
const scene = async (name, note) => {
  if (!writeScenes) return;
  await ui.saveToSlot1();
  await context.storageState({ path: join(sceneDir, `${name}.json`), indexedDB: true });
  console.log(`  場面 ${name}: ${note}`);
};
const step = (label) => console.log(`- ${label}`);
// 地色（明るい紙）の上に直に載る文字が読めること。text-gray-400 や半透明の枠のままだと
// 紙の上で 1〜2:1 になって消える（選手成績の「範囲」・投手起用の補足文・マニュアルの本文で起きていた）
const groundContrast = async (where) => {
  const bad = await ui.groundTextContrast();
  assert.deepEqual(bad, [], `${where}: 地色の上で読めない文字がある（4.5:1 未満）\n${bad.join('\n')}`);
};
const started = Date.now();

try {
  step('タイトルからマニュアルを開く');
  await page.goto(`${BASE}/?dev=1`);
  await ui.click('マニュアル');
  await groundContrast('マニュアル');

  step('独立リーグを新しく始めて、初回のトライアウトで指名する');
  await ui.newIndependentTryout();
  const first = await ui.tryoutState();
  assert.equal(first.got, 0, 'トライアウトの初めから獲得選手がいる');
  // 行を押しただけでは決まらない（選ぶ→「指名する」の2段）
  await page.locator('tbody tr').first().click();
  await page.getByText('を指名しますか？').waitFor();
  assert.equal((await ui.tryoutState()).got, 0, '行を押しただけで指名が決まった');
  await ui.click(/^指名する$/);
  assert.equal((await ui.tryoutState()).got, 1, '「指名する」で指名が決まらない');
  // 直前の1人は取り消せる（選んだ状態に戻る）
  await ui.click(/直前の指名.*を取り消す/);
  assert.equal((await ui.tryoutState()).got, 0, '直前の指名を取り消せない');
  await ui.click(/^指名する$/);
  await ui.waitTryoutTurn();
  await page.locator('tbody tr').first().click();
  await ui.click(/^指名する$/);
  await ui.waitTryoutTurn();
  const beforeSave = await ui.tryoutState();
  assert.equal(beforeSave.got, 2);
  // 試合に出る最低限（投手・捕手・野手8人）がそろうまで「指名終了」は押せず、理由がボタンの横に出る
  // （以前は押すと alert で断り、言い方も「編成不足」の帯と違っていた）
  assert.ok(await page.getByRole('button', { name: /^指名終了$/ }).isDisabled(), '編成が足りないのに「指名終了」が押せる');
  assert.match(await page.getByTestId('tryout-end-blocked').innerText(), /があと\d+人必要/,
    '「指名終了」を押せない理由が出ていない');
  // 1280×720 で候補の表の1行目が、スクロールしなくても見える（以前は上の枠が縦に長く、
  // 1人指名すると表の見出しが画面の下端より下に出ていた）
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const firstRow = await page.locator('tbody tr').first().boundingBox();
  assert.ok(firstRow && firstRow.y + firstRow.height <= 720,
    `1280×720 のトライアウトで候補の表の1行目が画面の外にある（下端 ${firstRow && Math.round(firstRow.y + firstRow.height)}px）`);
  await page.setViewportSize({ width: 1400, height: 900 });

  step('トライアウトの途中で保存して、タイトルから読み直す');
  await page.getByTestId('tryout-save').getByRole('button', { name: /スロット1に保存/ }).click();
  await page.getByText('スロット1に保存しました').waitFor({ timeout: 120000 });
  await page.goto(`${BASE}/?dev=1`);
  await ui.click('つづきから');
  // ⚠ スロットの一覧が出たときだけ選ぶ（「スロット1 1年目 1/1 …」の行）。名前を緩くすると、
  //    読み直したトライアウトの「スロット1に保存」を押してしまう
  const slot1 = page.getByRole('button', { name: /^スロット\s*1\s+\d+年目/ });
  if (await slot1.count()) await slot1.first().click();
  await page.getByText('あなたの指名順です').waitFor({ timeout: 120000 });
  assert.equal(await page.getByText('に保存しました').count(), 0, '前提: 読み直したあとに保存し直していない');
  assert.deepEqual(await ui.tryoutState(), beforeSave, '読み直したらトライアウトの途中の状態が変わった（最初からになった）');
  await page.locator('tbody tr').first().click();
  await ui.click(/^指名する$/);
  assert.equal((await ui.tryoutState()).got, beforeSave.got + 1, '読み直したトライアウトの続きで指名できない');
  await shot('tryout-resumed');

  step('新しく始めて開幕まで');
  await ui.newUniversityGame();
  const opening = await ui.date();
  assert.ok(opening, '日付が画面に出ていない');
  await shot('opening');
  await groundContrast('日程進行');
  await scene('season-start', '大学1年目の開幕日');

  step('30日早送り');
  await ui.advance(30);
  const after30 = await ui.date();
  assert.ok(after30, '早送りのあと日付が読めない');
  assert.notDeepEqual(after30, opening, '早送りしても日付が動いていない');
  await shot('day30');
  await scene('mid-season', '開幕から30日ほど進めた日');

  step('保存して、タイトルから読み直す');
  await ui.saveToSlot1();
  await ui.continueSlot1();
  assert.deepEqual(await ui.date(), after30, '読み直したら日付が変わった');
  // 開いている項目を押し直しても何も起きない（以前は「日程進行」だけ黙って1日進んでいた）
  await page.locator('nav').getByRole('button', { name: /日程進行/ }).click();
  await page.waitForTimeout(800);
  assert.deepEqual(await ui.date(), after30, '開いている「日程進行」を押し直したら日付が進んだ');

  step('7日進めてもスクロールの位置はそのまま、画面を替えたら一番上から');
  // ⚠ 一人用は画面を切り替えても縦のスクロール位置が前の画面のままだった（采配試合の
  //    「結果確定・翌日へ」→ 日程画面が176px下、選手検索を下まで送ってロスター管理 → 450px下、
  //    契約更改も見出しが隠れて開いた）。同じ画面の中の再描画（日を進める）では戻さない
  const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
  const toBottom = async (where) => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);
    assert.ok(await scrollY() > 100, `前提: ${where}が縦に送れる長さ（${await scrollY()}px）`);
  };
  await toBottom('日程画面');
  const beforeAdvance = await scrollY();
  await ui.advance(7);
  assert.ok(await scrollY() > 0, `日を進めたらスクロールの位置が一番上に戻った（${beforeAdvance}px → 0）`);

  await ui.click('選手成績');
  assert.equal(await scrollY(), 0, '選手成績が前の画面（日程画面）のスクロール位置のまま開いた');
  await ui.click('選手検索');
  await toBottom('選手検索');
  await ui.click('ロスター管理');
  assert.equal(await scrollY(), 0, 'ロスター管理が前の画面（選手検索）のスクロール位置のまま開いた');

  step('選手成績・ロスター管理・資料室の画面');
  await ui.click('選手成績');
  await groundContrast('選手成績');
  await ui.click('ロスター管理');
  await ui.click('ベンチ登録'); // 大学は試合のオーダーと並ぶ外側のタブ。以前は枠が半透明で紙が透けていた
  await groundContrast('ロスター管理のベンチ登録');
  await ui.click('試合のオーダー');
  await ui.click('スタメン設定');
  // 1280×720 で打順のカードが窮屈でないこと（以前は 4/4/4 の3列で幅331px、体・疲のバーと打率が
  // 右端で139px切れ、名前の行が折り返していた）
  await page.setViewportSize({ width: 1280, height: 720 });
  // 幅が変わり、画面の縮尺の当て直し（App.jsx の自動フィットは rAF で走る）が済むまで待つ
  await page.waitForFunction(() => innerWidth === 1280);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const fit = await ui.lineupCardFit();
  assert.ok(fit && fit.rows >= 5 && fit.overflow <= 1 && fit.wrapped === 0,
    `1280×720 のスタメン設定で打順のカードが窮屈: ${JSON.stringify(fit)}`);
  await page.setViewportSize({ width: 1400, height: 900 });
  await ui.click('守備分析');
  // 行の地の上のランク色が読めること（以前は gray-700 の行に pink-500 の「100%」が 1.8:1）
  const weak = await ui.cardTextContrast('守備力サマリー');
  assert.deepEqual(weak, [], `守備分析のサマリーで読めない文字がある\n${weak.join('\n')}`);
  await ui.click('投手起用');
  await groundContrast('ロスター管理の投手起用');
  await page.locator('nav').getByRole('button', { name: /資料室/ }).click();
  await ui.click('注目選手');
  await groundContrast('資料室の注目選手');
  await ui.click('日程進行');

  step('次の区切り（夏季合宿）まで');
  await ui.advance('phase');
  assert.ok(await ui.visible('練習を実行'), '夏季合宿の画面が出ていない');
  await shot('summer-camp');

  step('合宿を済ませて秋季リーグへ');
  await ui.runCamp();
  await ui.click('秋季リーグへ');
  await scene('autumn-league', '秋季リーグの開幕');

  step('次の区切り（ドラフト前）まで');
  await ui.advance('phase');
  assert.ok(await ui.visible(/^進む$/), 'フェーズ移行の確認が出ていない');
  await shot('before-draft');
  if (writeScenes) {
    // 確認を閉じて保存する。読み直すと同じ確認がもう一度出る
    await ui.click('キャンセル');
    await scene('before-draft', 'ドラフト会議の前日（フェーズ移行の確認が出る）');
    await ui.click('1日進める');
  }
  await ui.click(/^進む$/);
  await page.getByText('プロ野球ドラフト会議').first().waitFor({ timeout: 60000 });
  await shot('draft');

  assert.deepEqual(errors, [], `画面でエラーが出た:\n${errors.join('\n')}`);
  console.log(`singleplayer-ui-check PASS（${((Date.now() - started) / 1000).toFixed(0)}秒・初回のトライアウトの途中で保存と読み直し→開幕→30日→保存と読み直し→画面の切り替えでスクロールが一番上→夏季合宿→秋季リーグ→ドラフト会議）`);
  await context.tracing.stop();
} catch (error) {
  await shot('failure').catch(() => {});
  await context.tracing.stop({ path: '/tmp/baseball-single-failure.zip' }).catch(() => {});
  console.error(`singleplayer-ui-check FAIL: ${error.message}`);
  if (errors.length) console.error(errors.join('\n'));
  console.error(`画面: /tmp/baseball-single-failure.png / 操作の記録: /tmp/baseball-single-failure.zip（npx playwright show-trace で開く）`);
  process.exitCode = 1;
} finally {
  await browser.close();
  stopPreview();
}
