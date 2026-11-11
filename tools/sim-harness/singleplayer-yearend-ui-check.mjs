// 一人用の年度更新の通し検査（ブラウザ）。`npm run check:ui:yearend`（ビルドしてから実行）。
//
// 独立リーグ・箱庭・社会人（企業・クラブ）の各モードを新しく始め、1年目のオフ
// （ドラフト・契約更改・トライアウト・年度更新・翌年のレギュレーション）を画面で通して、
// 2年目の開幕の画面に着き、日程が進められることを確かめる。
//
//   独立リーグ: 初回トライアウト → キャンプ → 背番号 → 開幕 → ドラフト会議 → 契約更改（1人解雇）
//               → トライアウト（1人指名）→ オフシーズン → 2年目へ → 翌年のレギュレーション
//               → キャンプ → 背番号 → 2年目の開幕
//   箱庭:       規定 → 4球団に16人ずつ足す → 背番号 → 開幕 → ドラフト会議の日にオフシーズン
//               → 2年目へ → 翌年のレギュレーション → チーム設定 → 2年目の開幕
//   社会人企業: キャンプ → 背番号 → 開幕（大会の試合はスキップ）→ ドラフト会議 → 退団処理
//               → スカウト入団 → 予算決算 → オフシーズン → 2年目へ → キャンプ → 背番号 → 2年目の開幕
//   クラブ:     背番号 → 開幕 → ドラフト会議 → 退団処理 → 入部希望者 → オフシーズン → 2年目へ
//               → 2年目の開幕（キャンプなし）
//   大学:       キャンプ → 開幕 → 夏季合宿 → 秋季リーグ → ドラフト会議 → スポーツ推薦 → オフシーズン
//               → 2年目へ → 卒業・入部レポート（ここでオートセーブ）→ 読み直してもレポートの続き
//               → キャンプ → 背番号 → 2年目の開幕
//
// 捕まえたいのは「ボタンを押しても次の画面へ移らない」型の止まり方（2f9ee22: 翌年の
// レギュレーションを確定しても画面が変わらず、独立リーグ・箱庭が2年目に進めなかった）。
// ロジックの複数年は progression-check、開幕からドラフト会議までは singleplayer-ui-check が見る。
// 画面の例外・console.error・alert が出たら落とす。
//
//   node tools/sim-harness/singleplayer-yearend-ui-check.mjs              # 全モード（同時に走らせる）
//   node tools/sim-harness/singleplayer-yearend-ui-check.mjs club sandbox # モードを選ぶ
//   node tools/sim-harness/singleplayer-yearend-ui-check.mjs --serial     # 1モードずつ
//
// スクリーンショットは /tmp/baseball-single-yearend-<モード>.png、落ちたら
// /tmp/baseball-single-yearend-<モード>-failure.zip に操作の記録を残す。
import assert from 'node:assert/strict';
import { BASE, driver, launchBrowser, startPreview } from './lib/singleplayer.mjs';

const MODES = {
  independent: { label: '独立リーグ', run: runIndependent },
  sandbox: { label: '箱庭', run: runSandbox },
  corporate: { label: '社会人（企業）', run: runCorporate },
  club: { label: '社会人（クラブ）', run: runClub },
  university: { label: '大学', run: runUniversity },
};
const args = process.argv.slice(2);
const serial = args.includes('--serial');
const picked = args.filter((a) => !a.startsWith('--'));
const unknown = picked.filter((m) => !MODES[m]);
if (unknown.length) {
  console.error(`知らないモード: ${unknown.join(', ')}（使えるもの: ${Object.keys(MODES).join(', ')}）`);
  process.exit(2);
}
const modes = picked.length ? picked : Object.keys(MODES);

// ------------------------------------------------------------
// モードに依らない操作
// ------------------------------------------------------------
function tools(page, context, log) {
  const ui = driver(page);
  const button = (name) => page.getByRole('button', { name });
  const shown = async (name) => (await button(name).count()) > 0;
  // 押したら次の画面（`next` のボタンか文字）が出るまで待つ。出なければ「どこで止まったか」を落とす
  const go = async (name, next, what, timeout = 30000) => {
    await ui.click(name);
    const target = typeof next === 'string' || next instanceof RegExp
      ? page.getByRole('button', { name: next }).or(page.getByText(next)).first()
      : next;
    await target.waitFor({ timeout }).catch(() => {
      throw new Error(`「${String(name).replace(/^\/\^?|\$?\/$/g, '')}」を押しても${what}に移らない`);
    });
  };
  // 取り消せない操作は、押すと下に確認の帯（`ConfirmBar`）が出て、帯のボタンで決める。
  // 帯が出ることを待ち、帯の中のボタン（`label`）を押して次の画面を待つ
  const confirm = async (name, label, next, what, timeout = 30000) => {
    const bar = page.getByTestId('confirm-bar');
    await go(name, bar, `${what}の確認の帯`);
    await bar.getByRole('button', { name: label }).click();
    await go2(next, what, timeout);
  };
  const go2 = async (next, what, timeout) => {
    const target = typeof next === 'string' || next instanceof RegExp
      ? page.getByRole('button', { name: next }).or(page.getByText(next)).first()
      : next;
    await target.waitFor({ timeout }).catch(() => {
      throw new Error(`確認の帯で決めても${what}に移らない`);
    });
  };
  // 区切りごとに操作の記録（trace）を捨てて取り直す。1年分を全部ためると数十MBになり、
  // 落ちたときに要るのは最後の区切りからの操作だけなので
  const step = async (label) => {
    log(`- ${label}`);
    await context.tracing.stopChunk();
    await context.tracing.startChunk();
  };

  // 次の区切りまで早送りする。大会の自分の試合は「試合スキップ」で消化し、
  // フェーズ移行の確認が出たらその見出しを返す（確認は開いたまま）
  const advanceToPhase = async () => {
    for (let i = 0; i < 60; i++) {
      const before = await ui.date();
      await ui.advance('phase');
      if (await shown(/^進む$/)) {
        const modal = page.locator('div.fixed', { has: button(/^進む$/) }).locator('h3').first();
        return { title: (await modal.innerText()).trim(), date: await ui.date() };
      }
      if (await shown('試合スキップ')) {
        await ui.click('試合スキップ');
        continue;
      }
      const after = await ui.date();
      throw new Error(`早送りが ${fmt(after)} で止まったのに、フェーズ移行の確認も大会の試合も出ていない（${fmt(before)} から）`);
    }
    throw new Error('早送りを60回くり返してもフェーズ移行の確認が出ない');
  };
  // 次のフェーズ移行の確認まで進め、見出しが期待どおりなら「進む」を押す
  const proceedTo = async (expect) => {
    const { title, date } = await advanceToPhase();
    assert.match(title, expect, `${fmt(date)} のフェーズ移行が「${title}」（${expect} のはず）`);
    await step(`${fmt(date)} ${title}`);
    await ui.click(/^進む$/);
  };
  // NPB ドラフト会議の発表を飛ばして日程画面へ戻る
  const finishDraft = async () => {
    await page.getByText('プロ野球ドラフト会議').first().waitFor({ timeout: 60000 });
    await go('スキップ', '結果詳細へ', '指名一覧');
    await go('結果詳細へ', '次へ進む', 'ドラフトの結果詳細');
    await go('次へ進む', page.getByTestId('dev-advance'), '日程画面');
  };
  // キャンプの練習を済ませてから背番号を決め、開幕の日程画面に着く
  const campToOpening = async () => {
    await ui.runCamp();
    await go('シーズン開始', /確定してシーズン開始/, '背番号の画面');
    await jerseyToOpening();
  };
  const jerseyToOpening = async () => {
    // 2年目は空いている番号だけ埋める（1年目は全員が空き）
    await ui.click('空きを自動で埋める');
    await go(/確定してシーズン開始/, page.getByTestId('dev-advance'), '開幕の日程画面');
  };
  // オフシーズンの画面から「2年目へ進む」を押す
  const offseasonToNextYear = async (next, what) => {
    await page.getByText(/年目 シーズン終了/).first().waitFor({ timeout: 30000 });
    await go(/^2年目へ進む/, next, what, 60000);
  };
  // 翌年のレギュレーションを確定する（2f9ee22 で直した止まり方）
  // （ボタンの名前は行き先で変わる: 「確定 → キャンプへ進む」／箱庭は「確定 → チーム設定へ進む」）
  const confirmNextRegulations = async (next, what, label = '確定 → キャンプへ進む') => {
    await go(label, next, what);
  };
  // 2年目の開幕: 暦が1年進み、日程が進められること
  const checkSecondYear = async ({ league }) => {
    const opening = await ui.date();
    assert.ok(opening, '2年目の開幕で日付が画面に出ていない');
    assert.equal(opening.year, 2, `2年目へ進んだのに ${opening.year}年目になっている`);
    assert.deepEqual([opening.y, opening.month, opening.day], [2025, 4, 1],
      `2年目の開幕が ${fmt(opening)}（2025/4/1 のはず）`);
    await step(`2年目の開幕 ${fmt(opening)}`);
    await ui.advance(7);
    if (await shown('試合スキップ')) await ui.click('試合スキップ');
    const after = await ui.date();
    assert.ok(after && (after.month > 4 || after.day > 1), `2年目の開幕から日程が進まない（${fmt(after)}）`);
    if (league) {
      // 自分の試合を消化している（日程が組まれている）
      const text = await page.locator('body').innerText();
      const m = text.match(/今月(\d+)勝(\d+)敗/);
      assert.ok(m && Number(m[1]) + Number(m[2]) > 0, `2年目の開幕から7日進めても自分の試合が無い（${fmt(after)}）`);
      await step(`7日進めて ${fmt(after)}（今月${m[1]}勝${m[2]}敗）`);
    } else {
      await step(`7日進めて ${fmt(after)}`);
    }
  };
  return { ui, go, confirm, step, button, shown, proceedTo, finishDraft, campToOpening, jerseyToOpening,
    offseasonToNextYear, confirmNextRegulations, checkSecondYear };
}

const fmt = (d) => (d ? `${d.year}年目 ${d.y}/${d.month}/${d.day}` : '(日付なし)');

// トライアウトで自分の番が来るのを待つ。終わっていれば false
async function waitUserTurn(page) {
  await page.getByText(/あなたの指名順です|ドラフト完了/).first().waitFor({ timeout: 180000 });
  return (await page.getByText('あなたの指名順です').count()) > 0;
}
// 画面の「現在のピック」の番号（トライアウトが終わって画面が替わったら null）
const currentPick = (page) => page.evaluate(() => {
  const m = document.body.innerText.match(/現在のピック\s*(\d+)/);
  return m ? Number(m[1]) : null;
});
// 1人指名する。`choose` で候補を選び、「指名する」で決め（おすすめ候補で直接決まる作りでも
// 動くように、出ていれば押す）、ピックの番号が進むまで待つ
async function pick(page, choose) {
  const before = await currentPick(page);
  await choose();
  const confirm = page.getByRole('button', { name: /^指名する$/ });
  if (await confirm.count()) await confirm.click();
  await page.waitForFunction((n) => {
    const m = document.body.innerText.match(/現在のピック\s*(\d+)/);
    return !m || Number(m[1]) !== n;
  }, before, { timeout: 30000 });
}
// 守備位置のタブ（全選手・投手・捕手・内野手・外野手）を開いて、いちばん上の候補を指名する
// （その守備位置の候補がいなければ全選手から）
const pickFromTab = (page, tab) => pick(page, async () => {
  await page.getByRole('button', { name: tab, exact: true }).click();
  const rows = page.locator('tbody tr');
  if (!(await rows.count())) await page.getByRole('button', { name: '全選手', exact: true }).click();
  await rows.first().click();
});

// ------------------------------------------------------------
// 独立リーグ
// ------------------------------------------------------------
async function runIndependent(page, t) {
  const { ui, go, step } = t;
  await step('四国アイランドリーグplus の徳島で新しく始める');
  await page.goto(`${BASE}/?dev=1`);
  for (const name of ['はじめから', '独立リーグ', '四国アイランドリーグplus']) await ui.click(name);
  await page.getByRole('button').filter({ hasText: '徳島インディゴソックス' }).first().click();

  await step('初回トライアウト（おすすめ候補を24巡指名）');
  let picks = 0;
  while (await waitUserTurn(page)) {
    const hint = page.getByRole('button', { name: 'ヒントを今後表示しない' });
    if (await hint.count()) await hint.first().click();
    const chip = page.getByText('おすすめ候補', { exact: true }).locator('..').locator('div.cursor-pointer');
    await pick(page, async () => {
      if (await chip.count()) await chip.first().click();
      else await page.locator('tbody tr').first().click();
    });
    picks++;
    assert.ok(picks <= 30, '初回トライアウトの指名が終わらない');
  }
  // 初回は指名が終わると自動でキャンプへ移る
  await page.getByRole('button', { name: /練習を実行/ }).first().waitFor({ timeout: 30000 })
    .catch(() => { throw new Error('初回トライアウトが終わってもキャンプへ移らない'); });
  await t.campToOpening();
  await step(`1年目の開幕 ${fmt(await ui.date())}`);

  await t.proceedTo(/ドラフト/);
  await t.finishDraft();

  await t.proceedTo(/契約更改/);
  await step('契約更改: 1人解雇して確定');
  await page.getByText('契約更改 - 1年目').first().waitFor({ timeout: 30000 });
  // 投手を1人（捕手や野手を外すと、トライアウトで足りない守備位置を埋めるまで指名を終えられない）
  const pitcherRow = page.locator('tbody tr').filter({ has: page.locator('td:nth-child(5)', { hasText: /^投$/ }) });
  await ((await pitcherRow.count()) ? pitcherRow.last() : page.locator('tbody tr').first()).click();
  await t.confirm(/^契約更改を確定する$/, /^(解雇して確定する|確定する)$/, 'トライアウトへ進む', '契約更改の完了');
  await go('トライアウトへ進む', /指名終了|ドラフト完了/, 'トライアウト', 60000);

  await step('トライアウト: 捕手と足りない守備位置を指名して指名を終える');
  // ⚠ 捕手は NPB に2人とも指名されて0人のことがある。試合に出られる構成（投手・捕手・
  //    野手8人）がそろうまで「指名終了」は押せない（押すと alert）。先に捕手を1人取り、
  //    「編成不足」の帯が出ていればその守備位置を取る
  let tab = '捕手';
  // 「現在の編成 (N/24人)（現有X＋指名Y）」。指名が終わって名簿に書いた後も同じ数のはず
  const rosterHeading = async () => (await page.getByText(/^現在の編成 \(/).first().innerText()).trim();
  let before = null;
  while (await waitUserTurn(page)) {
    if (!tab) {
      before = await rosterHeading();
      await page.getByRole('button', { name: /^指名終了$/ }).click();
      await page.getByTestId('confirm-bar').getByRole('button', { name: '指名を終える', exact: true }).click();
      break;
    }
    await pickFromTab(page, tab);
    const shortage = page.getByText('編成不足', { exact: false }).locator('..');
    const text = (await shortage.count()) ? await shortage.first().innerText() : '';
    tab = ['投手', '捕手', '内野手', '外野手'].find((pos) => text.includes(pos)) || null;
  }
  await page.getByText('ドラフト完了').first().waitFor({ timeout: 180000 });
  if (before) {
    assert.equal(await rosterHeading(), before,
      'トライアウトの指名を終えたら、現在の編成の人数が変わった（指名した選手を二重に数えている）');
  }
  await go('トライアウト終了', page.getByTestId('dev-advance'), '日程画面');

  await t.proceedTo(/オフシーズン/);
  await t.offseasonToNextYear('確定 → キャンプへ進む', '翌年のレギュレーション');
  await t.confirmNextRegulations(/練習を実行/, '春季キャンプ');
  await t.campToOpening();
  await t.checkSecondYear({ league: true });
}

// ------------------------------------------------------------
// 箱庭
// ------------------------------------------------------------
async function runSandbox(page, t) {
  const { ui, go, step } = t;
  await step('箱庭: 規定はそのまま、4球団に16人ずつ足す');
  await page.goto(`${BASE}/?dev=1`);
  await ui.click('箱庭モード');
  await go('設定完了', page.getByText('箱庭モード - チーム設定'), 'チーム設定');
  const teams = await page.getByRole('button', { name: /\(\d+人\)/ }).all();
  assert.ok(teams.length >= 2, `箱庭のチームが${teams.length}つしかない`);
  for (const team of teams) {
    await team.click();
    for (const pos of ['投', '投', '投', '投', '投', '投', '投', '捕', '捕', '一', '二', '三', '遊', '左', '中', '右']) {
      await page.getByRole('button', { name: `+ ${pos}`, exact: true }).click();
      await page.getByRole('button', { name: '保存', exact: true }).click();
    }
  }
  await go('シーズン開始', /確定してシーズン開始/, '背番号の画面');
  await t.jerseyToOpening();
  await step(`1年目の開幕 ${fmt(await ui.date())}`);

  // 箱庭はドラフト・契約更改・トライアウトが無く、ドラフト会議の日にオフシーズンへ移る
  await t.proceedTo(/ドラフト/);
  await t.offseasonToNextYear('確定 → チーム設定へ進む', '翌年のレギュレーション');
  await t.confirmNextRegulations(page.getByText('箱庭モード - チーム設定'), '箱庭のチーム設定', '確定 → チーム設定へ進む');
  await go('シーズン開始', page.getByTestId('dev-advance'), '開幕の日程画面');
  await t.checkSecondYear({ league: true });
}

// ------------------------------------------------------------
// 社会人（企業・クラブ）
// ------------------------------------------------------------
async function newCorporateGame(page, t, team) {
  const { ui, go } = t;
  await page.goto(`${BASE}/?dev=1`);
  for (const name of ['はじめから', '社会人野球', '四国']) await ui.click(name);
  await page.getByText(team, { exact: true }).first().click();
  await go(`${team}（`, /練習を実行|確定してシーズン開始/, 'キャンプか背番号の画面', 60000);
}

async function runCorporate(page, t) {
  const { ui, go, step } = t;
  await step('社会人: 四国の企業チーム（JR四国）で新しく始める');
  await newCorporateGame(page, t, 'JR四国');
  await t.campToOpening();
  await step(`1年目の開幕 ${fmt(await ui.date())}`);

  await t.proceedTo(/ドラフト/);
  await t.finishDraft();

  await t.proceedTo(/退団/);
  await step('退団処理: そのまま確定 → スカウト入団は獲得なし');
  // 年俸が予算を超えていると「赤字のまま確定」になる（その年の成績しだい）
  await t.confirm(/^(契約更改を確定|赤字のまま確定)$/, /^(解雇して確定する|確定する)$/, 'スカウト入団へ進む', '退団処理の完了');
  await go('スカウト入団へ進む', /獲得なしで進む|交渉開始/, 'スカウト交渉');
  await t.confirm('獲得なしで進む', /^終える$/, /^完了$/, 'スカウト入団の完了');
  await go(/^完了$/, page.getByTestId('dev-advance'), '日程画面');

  await t.proceedTo(/予算決算/);
  await go(/^(オフシーズンへ進む|赤字を確定してオフシーズンへ)$/, page.getByText(/年目 シーズン終了/), 'オフシーズン');
  await t.offseasonToNextYear(/練習を実行/, '春季キャンプ');
  await t.campToOpening();
  await t.checkSecondYear({ league: false });
}

async function runClub(page, t) {
  const { ui, go, step, button } = t;
  await step('社会人: 四国のクラブチーム（松山フェニックス）で新しく始める（キャンプなし）');
  await newCorporateGame(page, t, '松山フェニックス');
  await t.jerseyToOpening();
  await step(`1年目の開幕 ${fmt(await ui.date())}`);

  await t.proceedTo(/ドラフト/);
  await t.finishDraft();

  await t.proceedTo(/退団/);
  await step('退団処理: そのまま確定 → 入部希望者を1人受け入れる');
  await t.confirm(/^契約更改を確定$/, /^(解雇して確定する|確定する)$/, '入部希望者の受付へ進む', '退団処理の完了');
  await go('入部希望者の受付へ進む', /入部なしで確定|受け入れて確定/, '入部希望者');
  const applicant = page.getByText('見送り', { exact: true });
  if (await applicant.count()) await applicant.first().click();
  await t.confirm(/入部なしで確定|受け入れて確定/, /^確定する$/, 'オフシーズンへ進む', '入部受付の完了');
  await go('オフシーズンへ進む', page.getByTestId('dev-advance'), '日程画面');

  await t.proceedTo(/オフシーズン/);
  await t.offseasonToNextYear(page.getByTestId('dev-advance'), '2年目の日程画面');
  assert.equal(await button(/練習を実行/).count(), 0, 'クラブなのにキャンプの画面が出た');
  await t.checkSecondYear({ league: false });
}

// ------------------------------------------------------------
// 大学
// ------------------------------------------------------------
async function runUniversity(page, t) {
  const { ui, go, step } = t;
  await step('大学野球: 東京六大学の法政大学で新しく始める');
  await ui.newUniversityGame();
  await step(`1年目の開幕 ${fmt(await ui.date())}`);
  // 夏季合宿は日程画面を離れて合宿の画面へ移る（フェーズ移行の確認は出ない）
  await ui.advance('phase');
  await page.getByRole('button', { name: /練習を実行/ }).first().waitFor({ timeout: 30000 })
    .catch(() => { throw new Error('次の区切りまで進めても夏季合宿の画面が出ない'); });
  await ui.runCamp();
  await go('秋季リーグへ', page.getByTestId('dev-advance'), '秋季リーグの日程画面');
  await step(`秋季リーグ ${fmt(await ui.date())}`);

  await t.proceedTo(/ドラフト/);
  await t.finishDraft();

  await t.proceedTo(/推薦/);
  await step('スポーツ推薦: 推薦を締め切り、セレクションは合格者なしで確定');
  await t.confirm(/^推薦を締め切る/, /^締め切る$/, /確定してオフシーズンへ|^オフシーズンへ$/, 'セレクション');
  await t.confirm(/確定してオフシーズンへ|^オフシーズンへ$/, /^確定する$/, page.getByTestId('dev-advance'), '日程画面');

  await t.proceedTo(/オフシーズン/);
  // ⚠ 大学は年度更新のあと卒業・入部レポートを挟む。年が替わった瞬間にオートセーブが
  //    走るので、保存に入る画面はオフシーズン（レポートは画面の中の表示）。以前はこの保存を
  //    読み直すとオフシーズンの画面が翌年のデータで開き、「3年目へ進む」で1年遊ばないまま
  //    加齢・卒業・入部がもう一度走った
  const flash = page.getByText('オートセーブしました');
  await flash.waitFor({ state: 'hidden', timeout: 30000 });
  await t.offseasonToNextYear(page.getByText('卒業・入部レポート'), '卒業・入部レポート');
  await flash.waitFor({ timeout: 30000 }).catch(() => { throw new Error('年度更新のあとオートセーブが走らない'); });
  await step('卒業・入部レポートの画面でオートセーブされた → タイトルからオートセーブを読み直す');
  await page.goto(`${BASE}/?dev=1`);
  await ui.click('つづきから');
  await ui.click('オートセーブから続ける');
  await page.getByText(/卒業・入部レポート|年目 シーズン終了/).first().waitFor({ timeout: 120000 })
    .catch(() => { throw new Error('オートセーブを読み直してもオフシーズンにもレポートにも戻らない'); });
  assert.equal(await t.button(/^3年目へ進む/).count(), 0,
    'レポートの途中のオートセーブを読み直すと「3年目へ進む」が出る（1年遊ばないまま年度更新がもう一度走る）');
  assert.ok(await page.getByText('卒業・入部レポート').count() > 0, 'オートセーブを読み直すと卒業・入部レポートの続きに戻らない');
  await go('キャンプへ進む', /練習を実行/, '春季キャンプ');
  await t.campToOpening();
  await t.checkSecondYear({ league: true });
}

// ------------------------------------------------------------
// 実行
// ------------------------------------------------------------
async function runMode(browser, key) {
  const { label, run } = MODES[key];
  const lines = [];
  const log = (line) => (serial ? console.log(`[${label}] ${line}`) : lines.push(line));
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  // ブラウザの確認（confirm）が残っていれば「はい」で進める。alert は出ること自体を落とす
  page.on('dialog', async (d) => {
    if (d.type() === 'alert') errors.push(`alert: ${d.message()}`);
    await d.accept();
  });
  const started = Date.now();
  const t = tools(page, context, log);
  let failure = null;
  try {
    await run(page, t);
    assert.deepEqual(errors, [], `画面でエラーが出た:\n${errors.join('\n')}`);
    await page.screenshot({ path: `/tmp/baseball-single-yearend-${key}.png` });
    await context.tracing.stop();
  } catch (error) {
    failure = error;
    await page.screenshot({ path: `/tmp/baseball-single-yearend-${key}.png`, timeout: 10000 })
      .catch((e) => log(`（画面を撮れなかった: ${e.message.split('\n')[0]}）`));
    await context.tracing.stopChunk({ path: `/tmp/baseball-single-yearend-${key}-failure.zip` }).catch(() => {});
    await context.tracing.stop().catch(() => {});
  } finally {
    await context.close().catch(() => {});
  }
  const seconds = (Date.now() - started) / 1000;
  return { key, label, lines, errors, failure, seconds };
}

const stopPreview = await startPreview();
const browser = await launchBrowser();
const started = Date.now();
let results = [];
try {
  if (serial) {
    for (const key of modes) results.push(await runMode(browser, key));
  } else {
    results = await Promise.all(modes.map((key) => runMode(browser, key)));
  }
} finally {
  await browser.close();
  stopPreview();
}

for (const r of results) {
  const mark = r.failure ? 'FAIL' : 'PASS';
  console.log(`${mark} ${r.label}（${r.seconds.toFixed(0)}秒）`);
  if (!serial) for (const line of r.lines) console.log(`    ${line}`);
  if (r.failure) {
    console.error(`    ${r.failure.message.split('\n').join('\n    ')}`);
    if (r.errors.length && !r.failure.message.includes('画面でエラーが出た')) console.error(`    ${r.errors.join('\n    ')}`);
    console.error(`    画面: /tmp/baseball-single-yearend-${r.key}.png / 操作の記録: /tmp/baseball-single-yearend-${r.key}-failure.zip（npx playwright show-trace で開く）`);
  }
}
const failed = results.filter((r) => r.failure);
const total = ((Date.now() - started) / 1000).toFixed(0);
if (failed.length) {
  console.error(`singleplayer-yearend-ui-check FAIL（${total}秒・落ちたモード: ${failed.map((r) => r.label).join('、')}）`);
  process.exitCode = 1;
} else {
  console.log(`singleplayer-yearend-ui-check PASS（${total}秒・${results.map((r) => r.label).join('・')}で1年目のオフから2年目の開幕まで）`);
}
