// 配布HTMLでの読み込み失敗・状態の切替・保存中入力。APIはfixture。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { withDeadline } from './lib/deadline.mjs';
import { TURN_MINUTES } from '../../src/online/shared.js';
// ⚠ PCの左メニューは「現在の手続き」「選手成績」「ホーム」（3a8592d で名前が変わった）。
//    スマホのホームのボタンは「手続き」「打順」のまま。
// ⚠ **PCのキャンプは「ホーム」に出す**（いしだ要望。「現在の手続き」の中に
//    畳むと、開いていることに気づかないまま締め切りで自動になっていた）。
//    スマホは「手続き」のまま（`MobileView` は変えていない）。
// ⚠ PCのキャンプは**選手ごとにメイン練習とサブ練習**を割り当て、1クールずつ
//    その場で実行する（`CampPlanner`）。以前は球団で1つ選ぶだけだった。
//    ここでは名簿の投手1人の「メイン練習」の欄で、未保存案の保持を見る。
//    割り当ての無い投手は「投げ込み」（`control`）になる
const PITCHER = '検証 投手';
const menuGroup = (page) =>
  page.getByRole('combobox', { name: `${PITCHER}のメイン練習`, exact: true });
const chooseMenu = (page, value) => menuGroup(page).selectOption(value);
const pressedMenu = (page) => menuGroup(page).inputValue();
const STANDARD_MENU = 'control';
const html = await readFile(
  new URL('../../dist/index.html', import.meta.url),
  'utf8',
);
const base = 'http://localhost:3000';
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROME_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHROME_CHANNEL }
    : {}),
  headless: true,
});
const errors = [];
const initial = () => ({
  revision: 1,
  status: 'waiting',
  year: 1,
  teamName: '検証球団',
  currentDate: { year: 2024, month: 4, day: 1 },
  nextAdvanceAt: null,
  writable: true,
  isAdmin: true,
  hasBackup: false,
  members: [],
  roster: [
    {
      id: 1,
      name: PITCHER,
      age: 24,
      position: 'pitcher',
      condition: 2,
      pitching: { velocity: 140, control: 50, stamina: 50 },
      batting: { meet: 20, power: 20, eye: 20 },
      physical: { speed: 40 },
      fielding: { defense: 40, arm: 50 },
    },
  ],
  standings: [],
  results: [],
  upcoming: [],
  history: [],
  notices: [],
  lineup: { battingOrder: [], starters: [], strategy: {} },
  phase: { id: '1:camp', kind: 'camp', label: 'キャンプ', submission: null },
});
// 契約更改（提出して決める手続き）。⚠ 標準案の読み込みはここで見る（キャンプは取りに行かない）
const contractPhase = () => ({
  id: '1:contract',
  kind: 'contract',
  label: '契約更改',
  submission: null,
});
async function scene({
  mobile = false,
  defaultsFail = false,
  staleDefaults = false,
  phase = null,
  defaultPlan = null,
} = {}) {
  const context = await browser.newContext({
    viewport: { width: mobile ? 390 : 1280, height: 844 },
    isMobile: mobile,
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
  const view = initial();
  if (phase) view.phase = phase;
  const state = {
    view,
    defaultsRequests: 0,
    defaultsFail,
    staleDefaults,
    payloads: [],
    types: [],
    rejected: [],
    checkRevision: false,
    hold: false,
    release: () => {},
  };
  let signal;
  state.commandStarted = new Promise((resolve) => {
    signal = resolve;
  });
  await context.route(`${base}/**`, async (route) => {
    if (route.request().resourceType() === 'document')
      return route.fulfill({ contentType: 'text/html', body: html });
    const action = new URL(route.request().url()).searchParams.get('action');
    let value;
    if (action === 'config') value = { local: true };
    else if (action === 'view') value = state.view;
    else if (action === 'defaults') {
      state.defaultsRequests++;
      if (state.defaultsFail === 'html')
        return route.fulfill({
          status: 503,
          contentType: 'text/html',
          body: '<html>temporarily unavailable</html>',
        });
      if (state.defaultsFail)
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: '標準案の一時的な読込み失敗' }),
        });
      value = {
        phaseId: state.staleDefaults ? '0:other' : state.view.phase.id,
        revision: state.view.revision,
        plan:
          defaultPlan ||
          (state.view.phase.kind === 'contract'
            ? { releaseIds: [] }
            : { menu: 'standard' }),
      };
    } else if (action === 'command') {
      const payload = route.request().postDataJSON().payload;
      // 本物のサーバーと同じく版を照合する（`checkRevision` のときだけ）
      if (
        state.checkRevision &&
        route.request().postDataJSON().revision !== state.view.revision
      ) {
        state.rejected.push({
          type: route.request().postDataJSON().type,
          round: payload?.round,
        });
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: '他の操作で更新されました。最新状態を読み直してください',
            code: 'revision',
          }),
        });
      }
      state.payloads.push(payload);
      state.types.push(route.request().postDataJSON().type);
      signal();
      if (state.hold)
        await new Promise((resolve) => {
          state.release = resolve;
        });
      // ⚠ キャンプの `campRound` は**提出ではない**（その場で実行する）。
      //    提出として記録すると、本物のサーバーには起きない
      //    「別の操作で提出が更新されました」が画面に出る
      if (state.view.phase && payload.plan !== undefined)
        state.view.phase.submission = {
          plan: payload.plan,
          ready: payload.ready,
        };
      state.view.revision++;
      value = { ok: true, revision: state.view.revision };
    } else throw new Error(`unexpected action ${action}`);
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(value),
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/online`);
  state.page = page;
  state.context = context;
  return state;
}
async function click(page, text) {
  // ⚠ スマホではこの3つがメニューの中にある。開いた直後（まだ描かれていない）に数えると
  //    どちらも0で、メニューを開かずに探して待ち切れなかった（混んでいるときに落ちた）。
  //    ボタンかメニューのどちらかが出るまで待ってから決める
  if (['更新', 'ログアウト', '進行時刻'].includes(text))
    await page
      .getByRole('button', { name: text, exact: true })
      .or(page.getByRole('button', { name: 'メニュー', exact: true }))
      .first()
      .waitFor();
  if (
    ['更新', 'ログアウト', '進行時刻'].includes(text) &&
    !(await page.getByRole('button', { name: text, exact: true }).count()) &&
    (await page.getByRole('button', { name: 'メニュー', exact: true }).count())
  )
    await page.getByRole('button', { name: 'メニュー', exact: true }).click();
  await page.getByRole('button', { name: text, exact: true }).click();
  await page
    .getByText('処理中です。画面を閉じずにお待ちください…', { exact: true })
    .waitFor({ state: 'hidden' });
}
try {
  const oversized = await scene();
  await click(oversized.page, 'ホーム');
  await menuGroup(oversized.page).waitFor();
  await oversized.page.evaluate(() =>
    sessionStorage.setItem(
      'baseball-online-draft:a:fixture:1:検証球団',
      'x'.repeat(64000),
    ),
  );
  await oversized.page.reload();
  await oversized.page
    .getByText(
      '未保存案が大きすぎるため復元できませんでした。サーバーに保存済みの内容を表示します。',
      { exact: true },
    )
    .waitFor();
  await oversized.context.close();

  const draft = await scene();
  draft.page.on('dialog', (dialog) => dialog.accept());
  await click(draft.page, 'ホーム');
  await chooseMenu(draft.page, 'velocity');
  // ⚠ ページを移って戻る（キャンプはホームなので、移る先は別のページ）
  await click(draft.page, '選手成績');
  // ⚠ ほかのページの帯の「キャンプを開く」は**ホームへ直に飛ぶ**（u1 低28）。以前は
  //    「現在の手続き」（「ホームへ」の案内だけ）へ飛び、2回押さないと着かなかった
  await click(draft.page, 'キャンプを開く');
  await menuGroup(draft.page)
    .or(draft.page.getByRole('button', { name: 'ホームへ', exact: true }))
    .first()
    .waitFor();
  assert.equal(
    await menuGroup(draft.page).count(),
    1,
    '帯の「キャンプを開く」でホームのキャンプへ行かない',
  );
  // 左メニューの数も、キャンプの間はホームに付ける（「現在の手続き」は案内だけ）
  assert.equal(
    await draft.page.locator('.online-nav-home .online-count').innerText(),
    '1',
    'キャンプの間、ホームに手続きの数が出ていない',
  );
  assert.equal(
    await draft.page
      .getByRole('button', { name: '現在の手続き', exact: true })
      .locator('.online-count')
      .count(),
    0,
    'キャンプの間も「現在の手続き」に数が出ている（押しても案内だけ）',
  );
  assert.equal(await pressedMenu(draft.page), 'velocity', '画面移動でも提出案を保持');
  // ⚠ スマホは**選手ごとの表を出さない**（23列は入らない）。育成方針と
  //    「第Nクール練習を実行」だけを出す（`CampPlanner` の `compact`）。
  //    出さないと、携帯だけの人は4クールとも自動になってしまう。
  await draft.page.setViewportSize({ width: 390, height: 844 });
  // ⚠ スマホのキャンプは「手続き」のまま（ホームへ移したのはPCだけ）
  await click(draft.page, '手続き');
  await draft.page
    .getByText('選手ごとの練習はPCで選べます', { exact: false })
    .waitFor();
  await draft.page
    .getByRole('button', { name: '第1クール練習を実行', exact: true })
    .waitFor();
  assert.equal(
    await draft.page.locator('.online-camp-scroll').count(),
    0,
    'スマホに選手ごとの表を出している',
  );
  await draft.page.reload();
  await click(draft.page, '手続き');
  await draft.page
    .getByRole('button', { name: '第1クール練習を実行', exact: true })
    .waitFor();
  await draft.page.setViewportSize({ width: 1280, height: 844 });
  await click(draft.page, 'ホーム');
  assert.equal(
    await pressedMenu(draft.page),
    'velocity',
    '再読込・表示切替後も未保存案を復元',
  );
  draft.view.phase.id = '2:camp';
  draft.view.revision++;
  await click(draft.page, '更新');
  await draft.page.waitForFunction(
    ([name, value]) =>
      document.querySelector(`select[aria-label="${name}"]`)?.value === value,
    [`${PITCHER}のメイン練習`, STANDARD_MENU],
  );
  assert.equal(draft.payloads.length, 0, '復元するだけで自動送信しない');
  await draft.context.close();

  const lineupDraft = await scene();
  lineupDraft.page.on('dialog', (dialog) => dialog.accept());
  lineupDraft.view.phase = null;
  lineupDraft.view.status = 'running';
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
  lineupDraft.view.roster = positions.map((position, i) => ({
    id: i + 1,
    name: `打者${i + 1}`,
    position,
    condition: 2,
  }));
  lineupDraft.view.lineup.battingOrder = positions.map((position, i) => ({
    playerId: i + 1,
    position,
    battingOrder: i + 1,
  }));
  await click(lineupDraft.page, '更新');
  // ⚠ 打順の未保存案を残すのは**スマホの「打順」カード**。PCのスタメン設定は
  //    一人用の画面で、未保存の編集はページを移っても残す（隠すだけ）が、
  //    再読み込みまでは持ち越さない（online-ui-check で見る）
  await lineupDraft.page.setViewportSize({ width: 390, height: 844 });
  const leadoff = async () =>
    (
      await lineupDraft.page
        .locator('.online-lineup')
        .first()
        .getByRole('button', { name: /の選手情報を見る$/ })
        .getAttribute('aria-label')
    ).replace('の選手情報を見る', '');
  await click(lineupDraft.page, '打順');
  await click(lineupDraft.page, '2番を上げる');
  await click(lineupDraft.page, 'ホーム');
  await click(lineupDraft.page, '打順');
  assert.equal(await leadoff(), '打者2', '画面移動でも打順の編集を保持');
  await lineupDraft.page.setViewportSize({ width: 1280, height: 844 });
  await lineupDraft.page
    .getByRole('button', { name: 'スタメン設定', exact: true })
    .waitFor();
  await lineupDraft.page.setViewportSize({ width: 390, height: 844 });
  await lineupDraft.page.reload();
  await click(lineupDraft.page, '打順');
  assert.equal(
    await leadoff(),
    '打者2',
    '編成もホーム移動・表示切替・再読込を通して保持',
  );
  await click(lineupDraft.page, '編集を戻す');
  assert.equal(await leadoff(), '打者1');
  await lineupDraft.context.close();

  const retry = await scene({ defaultsFail: true, phase: contractPhase() });
  // ⚠ **標準案を取りに行くのは、提出して決める手続き（契約更改など）だけ**。キャンプは
  //    PC・スマホとも取りに行かない（1クールずつその場で実行する。`CampPlanner` は
  //    `view.phase.camp` を見る）。失敗したときの知らせと取り直しは契約更改で見る
  await retry.page.setViewportSize({ width: 390, height: 844 });
  await click(retry.page, '手続き');
  await retry.page
    .getByRole('button', { name: '標準案を再取得', exact: true })
    .waitFor();
  retry.defaultsFail = 'html';
  await click(retry.page, '標準案を再取得');
  await retry.page
    .getByText(
      'サーバーの応答を確認できません。再読み込みして状態を確認してください',
      { exact: false },
    )
    .first()
    .waitFor();
  retry.defaultsFail = false;
  await click(retry.page, '標準案を再取得');
  await retry.page
    .getByRole('button', { name: 'この内容で決定', exact: true })
    .waitFor();
  assert.equal(await retry.page.getByRole('alert').count(), 0);
  // ここからはキャンプを、PCの割り当ての欄で見る
  retry.view.phase = initial().phase;
  retry.view.revision++;
  await click(retry.page, '更新');
  await retry.page.setViewportSize({ width: 1280, height: 844 });
  await retry.page.locator('.online-page-nav').waitFor();
  await click(retry.page, 'ホーム');
  await menuGroup(retry.page).waitFor();
  // ⚠ キャンプに「下書きを保存」「この内容で決定」は無い。1クールずつその場で
  //    実行する。送っている間は**割り当ても変えられない**こと——変えられると、
  //    送った内容と画面の内容が食い違う
  retry.hold = true;
  await retry.page
    .getByRole('button', { name: '第1クール練習を実行', exact: true })
    .click();
  await withDeadline(retry.commandStarted, '練習の実行の開始');
  assert.ok(
    await menuGroup(retry.page).isDisabled(),
    '練習を送っている間は割り当ても変更できない',
  );
  retry.release();
  // ⚠ 済んだときの文は操作ごと（以前はどの操作も「保存しました」）
  await retry.page.getByText('第1クールの練習を実行しました', { exact: true }).waitFor();
  assert.equal(await retry.page.locator('.online-edit-notice').count(), 0);
  // ⚠ **キャンプのクールも、版のずれだけなら最新の版で1回だけ送り直す**。
  //    版はリーグ全体で1つなので、毎正時の進行や他の参加者の操作だけで
  //    「他の操作で更新されました」になっていた。サーバーはクール番号を照合して
  //    同じクールを2回走らせないので、送り直しても二重には積まれない
  retry.hold = false;
  retry.checkRevision = true;
  retry.view.revision += 5; // 画面の知らない進行
  const sentBefore = retry.payloads.length;
  await retry.page
    .getByRole('button', { name: '第1クール練習を実行', exact: true })
    .click();
  await retry.page
    .getByText('処理中です。画面を閉じずにお待ちください…', { exact: true })
    .waitFor({ state: 'hidden' });
  assert.equal(
    await retry.page.getByRole('alert').count(),
    0,
    '版のずれだけでキャンプのクールが断られた',
  );
  assert.deepEqual(
    retry.rejected,
    [{ type: 'campRound', round: 1 }],
    '古い版で1回断られていない',
  );
  assert.deepEqual(
    retry.payloads.slice(sentBefore).map((x) => x.round),
    [1],
    '送り直しで同じクール番号を送っていない',
  );
  await retry.context.close();

  // ⚠ ここも契約更改で見る（キャンプは標準案を取りに行かない）
  const stale = await scene({ staleDefaults: true, phase: contractPhase() });
  await stale.page.setViewportSize({ width: 390, height: 844 });
  await click(stale.page, '手続き');
  await stale.page
    .getByText('手続きが更新されました。最新状態を確認してください', {
      exact: true,
    })
    .waitFor();
  const staleRun = () =>
    stale.page.getByRole('button', { name: 'この内容で決定', exact: true });
  // ⚠ **別の手続きの標準案は使わない**。黙って当てると、前の手続きの内容で
  //    決定してしまう。取り直せる口を出すこと
  await stale.page
    .getByRole('button', { name: '標準案を再取得', exact: true })
    .waitFor();
  stale.staleDefaults = false;
  stale.view.phase.id = '2:contract';
  stale.view.revision++;
  await click(stale.page, '更新');
  await stale.page
    .getByText('手続きが更新されました。最新状態を確認してください', {
      exact: true,
    })
    .waitFor({ state: 'hidden' });
  await staleRun().waitFor();
  await stale.context.close();

  // --- 締め切りの日時を1画面に何度も並べない（u1 低31） ---------------------
  // ⚠ 以前は手続きのページに「見出しの下」「1年の流れの帯」「決まりの文」と3回出ていた。
  //    決まりの文には日時を書かない
  {
    const due = await scene({
      phase: { ...contractPhase(), deadline: '2026-11-07T15:00:00.000Z' },
    });
    due.view.stage = { key: 'contract', open: true };
    due.view.revision++;
    await click(due.page, '更新');
    await click(due.page, '現在の手続き');
    await due.page.getByRole('button', { name: 'この内容で決定', exact: true }).waitFor();
    const times = async () =>
      (await due.page.locator('main').innerText()).split('11/8(日) 0:00').length - 1;
    assert.ok((await times()) <= 2, `PCの手続きのページに締め切りが${await times()}回出ている`);
    // 幅を変えても開いている画面（手続き）はそのまま
    await due.page.setViewportSize({ width: 390, height: 844 });
    await due.page.locator('.online-mobile-controls').waitFor();
    await due.page.getByRole('button', { name: 'この内容で決定', exact: true }).waitFor();
    assert.ok((await times()) <= 1, `スマホの手続きに締め切りが${await times()}回出ている`);
    await due.context.close();
  }

  // --- スマホの手続き: 決める中身を見せ、決定の前に確認を1段挟む（u1 高4） ---
  // ⚠ 以前は「退団予定 1人」の1行だけで、誰を出すのかを見ないまま1回押すと決定した
  {
    const decide = await scene({
      mobile: true,
      phase: contractPhase(),
      defaultPlan: { releaseIds: [1] },
    });
    await click(decide.page, '手続き');
    const contents = decide.page.locator('.online-phase-contents');
    await contents.waitFor();
    const listed = await contents.innerText();
    assert.match(listed, /退団させる選手 1人/, `退団させる人数が出ない: ${listed}`);
    assert.ok(listed.includes(PITCHER), `退団させる選手の名前が出ない: ${listed}`);
    const decideButton = decide.page.getByRole('button', { name: 'この内容で決定', exact: true });
    const confirm = decide.page.getByRole('group', { name: '決定の確認', exact: true });
    await decideButton.click();
    await confirm.waitFor();
    assert.match(await confirm.innerText(), /取り消せません/, '確認に取り消せないことが書かれていない');
    assert.equal(decide.payloads.length, 0, '確認の前に決定を送っている');
    // 「戻る」なら送らずに閉じる
    await confirm.getByRole('button', { name: '戻る', exact: true }).click();
    await confirm.waitFor({ state: 'detached' });
    assert.equal(decide.payloads.length, 0, '「戻る」で決定を送っている');
    // 確認の帯が出ても、中身の最後が帯に隠れない（下までスクロールして見える）
    await decideButton.click();
    await confirm.waitFor();
    await decide.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const lastRow = await contents.locator('li').last().boundingBox();
    const bar = await confirm.boundingBox();
    assert.ok(
      lastRow.y + lastRow.height <= bar.y,
      `確認の帯が中身の最後を隠す（${lastRow.y + lastRow.height} > ${bar.y}）`,
    );
    await confirm.getByRole('button', { name: '決定する', exact: true }).click();
    await decide.page.getByText('決定しました', { exact: true }).waitFor();
    assert.deepEqual(decide.payloads.at(-1).plan, { releaseIds: [1] });
    assert.equal(decide.payloads.at(-1).ready, true);
    await decide.context.close();

    // トライアウト: 実際に取る顔ぶれ（希望順の上から、目標を超える区分は飛ばす）
    const candidate = (id, name, position) => ({
      id,
      name,
      age: 22,
      position,
      pitching: {},
      batting: {},
      fielding: {},
    });
    const tryout = await scene({
      mobile: true,
      phase: {
        id: '1:tryout',
        kind: 'tryout',
        label: 'トライアウト',
        submission: null,
        candidates: [
          candidate(101, '候補一郎', 'catcher'),
          candidate(102, '候補二郎', 'short'),
          candidate(103, '候補三郎', 'left'),
        ],
      },
      defaultPlan: { count: 2, rankedIds: [101, 102, 103] },
    });
    await click(tryout.page, '手続き');
    await tryout.page.locator('.online-phase-contents li').nth(1).waitFor();
    const picks = await tryout.page.locator('.online-phase-contents').innerText();
    assert.match(picks, /獲得予定 2人/, `獲得予定の人数が出ない: ${picks}`);
    assert.ok(
      picks.includes('候補一郎') && picks.includes('候補二郎') && !picks.includes('候補三郎'),
      `獲得予定の顔ぶれが違う: ${picks}`,
    );
    await tryout.context.close();

    // 初期メンバー: どんなセットか（特徴と構成）
    const pack = await scene({
      mobile: true,
      phase: {
        id: '1:pack_select',
        kind: 'pack_select',
        label: '初期メンバー選択',
        submission: null,
        packs: [
          {
            id: 'p1',
            name: '検証セット',
            feature: '投手厚め',
            counts: { pitcher: 13, catcher: 2, infield: 5, outfield: 4 },
            ranks: { A: 2, B: 10, C: 12 },
            averageAge: 21.5,
            twoWay: 2,
            players: [],
          },
        ],
      },
      defaultPlan: { packId: 'p1' },
    });
    await click(pack.page, '手続き');
    await pack.page.locator('.online-phase-contents').waitFor();
    const chosen = await pack.page.locator('.online-phase-contents').innerText();
    assert.match(chosen, /初期メンバー「検証セット」/, `選んだセットが出ない: ${chosen}`);
    assert.match(chosen, /投手厚め · 投13 捕2 内5 外4/, `セットの中身が出ない: ${chosen}`);
    await pack.context.close();
  }

  // --- 進行時刻の説明は刻みから作る（u1 低19） -----------------------------
  // ⚠ 以前は「各時刻に1日進みます」で、実時間の1日かゲーム内の1日か分からなかった。
  //    検証モードの説明も「実時間1時間」のまま（いまは45分）だった
  {
    const clock = await scene();
    await click(clock.page, '進行時刻');
    const dialog = clock.page.getByRole('dialog', { name: '進行時刻', exact: true });
    await dialog.waitFor();
    assert.ok(
      (await dialog.innerText()).includes(`${TURN_MINUTES}分ごとに1ターン（ゲーム内の1日）進みます`),
      `進行時刻の説明が刻みと合っていない: ${await dialog.innerText()}`,
    );
    await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await clock.context.close();
  }

  // --- 止まったときに、その場から再開できること --------------------------
  // ⚠ **行き止まりにしない**。定期進行が止まると「1日程進める」も押せなくなり、
  //    なぜ進まないのかも、どこで直すのかも画面から分からなかった。
  //    （45分ターンにしたとき、毎時のcronのままだと必ずここへ落ちていた）
  {
    const stopped = await scene();
    stopped.view.testMode = true;
    stopped.view.status = 'error';
    stopped.view.phase = null;
    stopped.view.error = '定期進行が長く止まっていました。状態を確認して管理者が再開してください';
    stopped.view.revision++;
    await click(stopped.page, '更新');
    // 知らせの中にも、検証用の帯にも再開を出す
    await stopped.page
      .getByRole('alert')
      .filter({ hasText: '長く止まって' })
      .getByRole('button', { name: '次の時刻から再開', exact: true })
      .waitFor();
    await stopped.page
      .getByRole('button', { name: '止まっています（再開）', exact: true })
      .click();
    await withDeadline(stopped.commandStarted, '再開の送信');
    assert.deepEqual(stopped.types, ['resume'], '再開以外の命令を送っている');
    await stopped.context.close();
  }

  const mobile = await scene({ mobile: true });
  await click(mobile.page, '手続き');
  // ⚠ 携帯でも**4クールを自分で回せること**。表は出せない（23列は入らない）が、
  //    育成方針と実行だけ出す。出さないと携帯だけの人は全部自動になる
  await mobile.page
    .getByText('選手ごとの練習はPCで選べます', { exact: false })
    .waitFor();
  // ⚠ 既定の決め方は**おすすめ**（方針は選手ごと）。全員同じ方針にすると
  //    育成方針・段階が出る
  assert.equal(
    await mobile.page
      .getByRole('button', { name: '⚔️ 長所を伸ばす', exact: true })
      .count(),
    0,
    'おすすめなのに全員の育成方針が出ている',
  );
  await mobile.page
    .getByRole('button', { name: '全員同じ方針', exact: true })
    .click();
  await mobile.page
    .getByRole('button', { name: '⚔️ 長所を伸ばす', exact: true })
    .click();
  await mobile.page
    .getByRole('button', { name: '第1クール練習を実行', exact: true })
    .click();
  await mobile.page.getByText('第1クールの練習を実行しました', { exact: true }).waitFor();
  // ⚠ **キャンプでは標準案を取りに行かない**（提出する案が無い。世界を読むので重い）
  assert.equal(mobile.defaultsRequests, 0, 'スマホのキャンプで使わない標準案を取りに行っている');
  assert.equal(
    await mobile.page.getByText('標準案を準備しています…', { exact: true }).count(),
    0,
    'キャンプで「標準案を準備しています」が出ている',
  );
  assert.equal(mobile.payloads[0].round, 1, '何クール目かを送る');
  assert.equal(mobile.payloads[0].policy.direction, 'sharpen');
  assert.equal(mobile.payloads[0].policy.mode, 'team');
  // ⚠ 携帯でも**選手ごとの割り当てを送る**（方針から決まる既定）。送らないと
  //    サーバー側の既定と食い違う
  assert.deepEqual(Object.keys(mobile.payloads[0].main), ['1']);
  assert.deepEqual(Object.keys(mobile.payloads[0].sub), ['1']);
  await mobile.context.close();

  const pages = await scene();
  pages.view.status = 'running';
  pages.view.phase = null;
  pages.view.roster = Array.from({ length: 21 }, (_, i) => ({
    id: i,
    name: `選手${i}`,
    age: 20,
    position: 'left',
    fatigue: 0,
  }));
  await click(pages.page, '更新');
  // ⚠ PCの選手成績は**ページ送りをしない**（全員を1枚に）。人数が減っても
  //    取り残された行が出ないことを見る（ページ送りの縮小はリーグ便りで見る）
  await click(pages.page, '選手成績');
  const rosterRows = pages.page.locator('.online-roster-rows article');
  await pages.page.waitForFunction(
    () => document.querySelectorAll('.online-roster-rows article').length === 21,
  );
  assert.equal(await pages.page.locator('.online-pager').count(), 0, 'PCはページ送りなし');
  pages.view.roster = pages.view.roster.slice(0, 4);
  pages.view.revision++;
  await click(pages.page, '更新');
  await pages.page.waitForFunction(
    () => document.querySelectorAll('.online-roster-rows article').length === 4,
  );
  assert.equal(await rosterRows.count(), 4);
  await pages.context.close();

  const news = await scene({ mobile: true });
  news.view.phase = null;
  news.view.status = 'running';
  news.view.notices = Array.from({ length: 4 }, (_, n) => ({
    year: n + 1,
    type: 'tryout',
    picks: Array.from({ length: 24 }, (_, i) => ({
      name: `選手${i}`,
      round: i + 1,
      team: 'A',
    })),
  }));
  await click(news.page, '更新');
  // ⚠ 入口の名前は、行った先の見出しの名前（u1 低30）
  await click(news.page, 'リーグの話題・リーグ便り →');
  await news.page.getByRole('heading', { name: 'リーグ便り', exact: true }).waitFor();
  await news.page.getByLabel('見るお知らせ').selectOption('notice:3');
  await click(news.page, '次のページ');
  await click(news.page, '次のページ');
  news.view.notices = [news.view.notices[0]];
  news.view.notices[0].picks = news.view.notices[0].picks.slice(0, 1);
  news.view.revision++;
  await click(news.page, '更新');
  await news.page.waitForFunction(
    () => document.querySelectorAll('.online-news-list article').length === 1,
  );
  assert.equal(
    await news.page.getByLabel('見るお知らせ').inputValue(),
    'notice:0',
  );
  assert.equal(
    (await news.page.locator('.online-pager span').innerText()).trim(),
    '1 / 1',
  );
  assert.ok(
    await news.page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight * 1.3,
    ),
  );
  await news.context.close();
  assert.deepEqual(errors, []);
  console.log(
    'online-edit-ui-check PASS（配布HTML・標準案の再取得/世代検証・送信中入力・スマホ確認・一覧縮小・キャンプのクールの版ずれの送り直し / APIはfixture）',
  );
} finally {
  await browser.close();
}
