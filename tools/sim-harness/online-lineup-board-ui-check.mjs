// PC版のスタメン設定（`src/online/LineupBoard.jsx`）と投手起用（`src/online/PitchingBoard.jsx`）を
// 実画面で操作する。
// 配布HTML（dist/index.html）を開き、通信はこの検査の中のリーグへつなぐ
// （`lib/serviceRoute.mjs`。サーバーもシーズンの進行も要らない）。
//
// 見ること:
//  - 守備分析は左メニューに無い（スタメン設定の表に入れた）
//  - 控えに投手を出さない。スタメン8行＋投手の9番
//  - 行を選ぶ → 控えがその守備位置の候補になる → 押すと交代（打順と守備位置を引き継ぐ）
//  - 守備位置のバッジ同士で守備を入れ替える。ドラッグで打順を動かす・控えと交代する
//  - 守備位置を選ぶと成績の列の場所に守備図が開く。図の位置を押しても入れ替わる
//  - 元に戻す／やり直す（Ctrl+Z / Ctrl+Shift+Z）、未保存の印
//  - 投手起用: 先発と救援の入れ替え（登板順と型を引き継ぐ）・役割の一覧で守護神を替える・
//    先発どうしのドラッグ・ローテから外す。次の先発の印は、並びを変えたら先頭へ
//  - ⚠ **投手起用（別のページ）を先に保存しても、スタメン設定の未保存の編集は保存できる**
//    （PCでは打順と投手起用を別々に保存する。`lineupBridge.js` の受け持ち項目）
//  - ⚠ スマホの幅に変えて戻しても、保存していない編集が残る（横向き⇔縦向きの切り替え）
//  - 保存して読み直しても残る
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { seasonService, routeToService } from './lib/serviceRoute.mjs';

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
try {
  const fixture = await seasonService({ days: 6 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await routeToService(context, fixture);
  await context.route(`${base}/online`, (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${base}/online`);
  const nav = p.locator('.online-page-nav');
  const go = (label) =>
    nav.getByRole('button', { name: label, exact: true }).click();
  await nav
    .getByRole('button', { name: 'スタメン設定', exact: true })
    .waitFor();
  assert.equal(
    await nav.getByRole('button', { name: '守備分析', exact: true }).count(),
    0,
    '守備分析が左メニューに残っている',
  );
  await go('スタメン設定');
  const slots = () =>
    p
      .locator('tbody[aria-label="スタメン"] tr[data-slot]')
      .evaluateAll((rows) =>
        rows.map(
          (r) =>
            `${r.querySelector('.online-lineup-pos').textContent}:${r.querySelector('.online-player-name').textContent}`,
        ),
      );
  const benchNames = () =>
    p
      .locator(
        'tbody[aria-label="控え野手"] tr[data-bench] .online-player-name',
      )
      .allInnerTexts();
  const click = (name) => p.getByRole('button', { name, exact: true }).click();
  await p
    .locator('tbody[aria-label="スタメン"] tr[data-slot]')
    .first()
    .waitFor();
  const saved = await slots();
  assert.equal(saved.length, 8, 'スタメンの野手が8行でない');
  assert.equal(
    await p.locator('tr.is-pitcher').count(),
    1,
    '投手の9番の行が無い',
  );
  const pitcherIds = new Set(
    (await fixture.service.view(fixture.userId, fixture.sessionId)).roster
      .filter((pl) => pl.position === 'pitcher')
      .map((pl) => pl.id),
  );
  const benchIds = await p
    .locator('tbody[aria-label="控え野手"] tr[data-bench]')
    .evaluateAll((rows) => rows.map((r) => Number(r.dataset.bench)));
  assert.ok(benchIds.length > 0, '控え野手が出ていない');
  assert.ok(
    !benchIds.some((id) => pitcherIds.has(id)),
    '控え野手に投手が出ている',
  );
  // スタメンの行にも、控えの行と同じく「ほかに守れる位置」が出る
  const starterPlayable = await p
    .locator(
      'tbody[aria-label="スタメン"] tr[data-slot] .online-lineup-playable',
    )
    .count();
  assert.equal(starterPlayable, 8, 'スタメンの行にほかに守れる位置の欄が無い');
  const starterSubs = await p
    .locator(
      'tbody[aria-label="スタメン"] tr[data-slot] .online-lineup-playable',
    )
    .evaluateAll((cells) =>
      cells.map((c) => c.querySelectorAll(':scope > span').length),
    );
  assert.ok(
    starterSubs.every((n) => n <= 2),
    `スタメンのほかに守れる位置が3つ以上出ている: ${starterSubs}`,
  );
  assert.ok(
    starterSubs.some((n) => n > 0),
    'スタメンの誰にもほかに守れる位置が出ていない',
  );
  // 古い画面の操作が残っていない（自動設定・✕で外す・守備位置のコンボボックス・比較の印）
  const board = p.locator('.online-lineup-board');
  assert.equal(
    await board.locator('select, input[type="checkbox"]').count(),
    0,
    'コンボボックス・チェックボックスが残っている',
  );
  assert.equal(
    await board.getByRole('button', { name: /自動/ }).count(),
    0,
    '自動設定が残っている',
  );

  // 行を選ぶ → 控えが候補に → 交代
  await click('2番を選ぶ');
  assert.match(
    await p.locator('.online-lineup-group').first().innerText(),
    /交代候補/,
    '行を選んでも控えが候補の並びにならない',
  );
  const candidate = (await benchNames())[0];
  await click(`${candidate}と交代する`);
  const replaced = await slots();
  assert.equal(
    replaced[1],
    `${saved[1].split(':')[0]}:${candidate}`,
    '交代で打順と守備位置を引き継がない',
  );
  assert.ok(
    (await benchNames()).includes(saved[1].split(':')[1]),
    '交代した選手が控えに戻らない',
  );
  await nav
    .getByRole('button', { name: 'スタメン設定', exact: true })
    .getByLabel('保存していない変更')
    .waitFor();

  // 守備位置のバッジ同士で守備を入れ替える（打順はそのまま）
  const field = p.locator('aside[aria-label="守備図"]');
  assert.equal(await field.count(), 0, '守備図が最初から開いている');
  await p.getByRole('button', { name: /^1番の守備位置/ }).click();
  // 守備位置を選ぶと、成績の列の場所に守備図が開く
  await field.waitFor();
  assert.equal(
    await p.locator('.online-lineup-table th.is-stat:visible').count(),
    0,
    '守備図を開いても成績の列が残っている（横にはみ出す）',
  );
  await p.getByRole('button', { name: /^3番の守備位置/ }).click();
  const swapped = await slots();
  assert.equal(
    swapped[0].split(':')[0],
    replaced[2].split(':')[0],
    '守備位置が入れ替わらない',
  );
  assert.equal(
    swapped[0].split(':')[1],
    replaced[0].split(':')[1],
    '守備の入れ替えで打順が動いた',
  );
  // 守備図の位置を押しても入れ替わる（表のバッジと同じ）。重ねると入れ替え後の適性が出る
  const onField = (slot) =>
    field.getByRole('button', {
      name: new RegExp(`^.. ${swapped[slot].split(':')[1]}（`),
    });
  await onField(0).click();
  await onField(1).hover();
  assert.match(
    await p.locator('.online-lineup-field-preview').innerText(),
    /⇄/,
    '守備図で相手に重ねても入れ替え後の適性が出ない',
  );
  await onField(1).click();
  const fieldSwapped = await slots();
  assert.equal(
    fieldSwapped[0],
    `${swapped[1].split(':')[0]}:${swapped[0].split(':')[1]}`,
    '守備図で守備位置が入れ替わらない',
  );
  await onField(0).click();
  await onField(1).click();
  assert.deepEqual(await slots(), swapped, '守備図で入れ替えを戻せない');
  // 見出しの「守備図」で閉じる（成績の列が戻る）
  await click('守備図');
  assert.equal(await field.count(), 0, '守備図が閉じない');
  assert.ok(
    (await p.locator('.online-lineup-table th.is-stat:visible').count()) > 0,
    '守備図を閉じても成績の列が戻らない',
  );

  // ドラッグ: 8番を1番へ（間は1つずつ下がる）
  await p.locator('tr[data-slot="8"]').dragTo(p.locator('tr[data-slot="1"]'));
  const dragged = await slots();
  assert.deepEqual(
    dragged,
    [swapped[7], ...swapped.slice(0, 7)],
    'ドラッグで打順が動かない',
  );
  // ドラッグ: 控えを6番へ（交代）
  const benchFirst = (await benchNames())[0];
  await p
    .locator('tbody[aria-label="控え野手"] tr[data-bench]')
    .first()
    .dragTo(p.locator('tr[data-slot="6"]'));
  const dropped = await slots();
  assert.equal(
    dropped[5],
    `${dragged[5].split(':')[0]}:${benchFirst}`,
    '控えのドラッグで交代しない',
  );

  // 元に戻す／やり直す
  await p.keyboard.press('Control+z');
  assert.deepEqual(await slots(), dragged, 'Ctrl+Zで戻らない');
  await p.keyboard.press('Control+Shift+z');
  assert.deepEqual(await slots(), dropped, 'Ctrl+Shift+Zで進まない');
  await click('元に戻す');
  await click('やり直す');
  assert.deepEqual(await slots(), dropped);

  // ページを移っても編集が残る
  await go('選手成績');
  await go('スタメン設定');
  assert.deepEqual(await slots(), dropped, 'ページ移動で編集が消えた');

  // ---- 投手起用
  await go('投手起用');
  const rotation = () =>
    p
      .locator('tbody[aria-label="先発ローテーション"] tr[data-starter]')
      .evaluateAll((rows) =>
        rows.map(
          (r) =>
            `${r.querySelector('.online-role-chip').textContent}:${r.querySelector('.online-player-name').textContent}`,
        ),
      );
  const relief = () =>
    p
      .locator('tbody[aria-label="救援"] tr[data-reliever]')
      .evaluateAll((rows) =>
        rows.map(
          (r) =>
            `${r.querySelector('.online-role-chip').textContent}:${r.querySelector('.online-player-name').textContent}`,
        ),
      );
  const nextMark = () =>
    p
      .locator('.online-pitch-next')
      .evaluate(
        (e) => e.closest('tr').querySelector('.online-player-name').textContent,
      );
  await p.locator('tr[data-starter]').first().waitFor();
  const savedRotation0 = await rotation();
  const savedRelief0 = await relief();
  assert.ok(
    savedRotation0.length >= 2 && savedRelief0.length >= 2,
    '先発・救援が出ていない',
  );
  assert.equal(
    await board.locator('select, input[type="checkbox"]').count(),
    0,
  );
  // 先発の最後を選んで救援の先頭と入れ替え: 救援が登板順と型を、先発が役割を引き継ぐ
  const last = savedRotation0.length - 1;
  const [lastType, lastName] = savedRotation0[last].split(':');
  const [firstRole, firstName] = savedRelief0[0].split(':');
  await click(`先発${last + 1}番手を選ぶ`);
  await click(`${firstName}と入れ替える`);
  assert.equal(
    (await rotation())[last],
    `${lastType}:${firstName}`,
    '救援が先発の登板順と型を引き継がない',
  );
  assert.ok(
    (await relief()).includes(`${firstRole}:${lastName}`),
    '先発が救援の役割を引き継がない',
  );
  await nav
    .getByRole('button', { name: '投手起用', exact: true })
    .getByLabel('保存していない変更')
    .waitFor();
  // 役割の一覧から守護神を選ぶ: 前の守護神はこの投手の前の役割へ
  const reliefNow = await relief();
  const closer = reliefNow.find((r) => r.startsWith('守護神:'));
  const [otherRole, otherName] = reliefNow
    .find((r) => !r.startsWith('守護神:'))
    .split(':');
  await p
    .getByRole('button', {
      name: `${otherName}の役割（${otherRole}）を選び直す`,
    })
    .click();
  await p
    .getByRole('dialog', { name: `${otherName}の役割` })
    .getByRole('button', { name: /^守護神/ })
    .click();
  const afterCloser = await relief();
  assert.ok(
    afterCloser.includes(`守護神:${otherName}`),
    '役割の一覧で守護神にならない',
  );
  assert.equal(
    afterCloser.filter((r) => r.startsWith('守護神:')).length,
    1,
    '守護神が2人になった',
  );
  if (closer)
    assert.ok(
      afterCloser.includes(`${otherRole}:${closer.split(':')[1]}`),
      '前の守護神が役割を引き継がない',
    );
  // 先発どうしのドラッグ: 1番手を3番手の位置へ（間は1つずつ上がる）。次の先発の印は先頭へ
  const beforeDrag = await rotation();
  await p
    .locator('tr[data-starter]')
    .nth(0)
    .dragTo(p.locator('tr[data-starter]').nth(2));
  const dragged2 = await rotation();
  assert.deepEqual(
    dragged2,
    [beforeDrag[1], beforeDrag[2], beforeDrag[0], ...beforeDrag.slice(3)],
    'ドラッグで登板順が動かない',
  );
  assert.equal(
    await nextMark(),
    dragged2[0].split(':')[1],
    '並びを変えたのに次の先発の印が先頭に無い',
  );
  // 先発を「救援」の見出しへ落とす: ローテから外れて「おまかせ」に
  const removed = dragged2[dragged2.length - 1].split(':')[1];
  await p
    .locator('tr[data-starter]')
    .last()
    .dragTo(p.locator('tbody[aria-label="救援"] tr.online-lineup-bench-head'));
  assert.equal(
    (await rotation()).length,
    dragged2.length - 1,
    'ローテから外れない',
  );
  assert.ok(
    (await relief()).includes(`おまかせ:${removed}`),
    '外した先発が救援（おまかせ）にならない',
  );
  await p.keyboard.press('Control+z');
  assert.deepEqual(await rotation(), dragged2, 'Ctrl+Zで戻らない');
  const editedRotation = await rotation();
  const editedRelief = await relief();

  // ⚠ スマホの幅に変えて戻しても、保存していない編集が残る（両方のページ）
  await p.setViewportSize({ width: 600, height: 900 });
  await p.locator('.online-lineup-portal').waitFor();
  await p.setViewportSize({ width: 1440, height: 1000 });
  await go('投手起用');
  assert.deepEqual(
    await rotation(),
    editedRotation,
    '幅を変えて戻ったら投手起用の編集が消えた',
  );
  assert.deepEqual(await relief(), editedRelief);
  await go('スタメン設定');
  assert.deepEqual(
    await slots(),
    dropped,
    '幅を変えて戻ったらスタメン設定の編集が消えた',
  );

  // ⚠ 投手起用を先に保存しても、スタメン設定の未保存の編集が保存できる
  await go('投手起用');
  await p
    .locator('.online-page:visible')
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await p.getByText('保存しました', { exact: true }).first().waitFor();
  await nav
    .getByRole('button', { name: '投手起用', exact: true })
    .getByLabel('保存していない変更')
    .waitFor({ state: 'detached' });
  const savedRotation = await rotation();
  assert.deepEqual(savedRotation, editedRotation);
  await go('スタメン設定');
  assert.deepEqual(
    await slots(),
    dropped,
    '投手起用の保存でスタメン設定の編集が消えた',
  );
  await p
    .locator('.online-page:visible')
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await p.waitForFunction(
    () => !document.querySelector('.online-lineup-board[inert]'),
  );
  assert.equal(
    await p
      .getByText('編成がほかの画面で更新されています。', { exact: false })
      .count(),
    0,
    '投手起用を保存した後、スタメン設定が保存できない',
  );
  await nav
    .getByRole('button', { name: 'スタメン設定', exact: true })
    .getByLabel('保存していない変更')
    .waitFor({ state: 'detached' });
  await p.screenshot({
    path: '/tmp/baseball-online-lineup-board.png',
    fullPage: true,
  });
  // ⚠ 保存したら、スマホの幅にしても古い編集を開き直さない（開き直すと保存で食い違う）
  await p.setViewportSize({ width: 600, height: 900 });
  await p.getByRole('button', { name: /打順・守備・投手起用を開く/ }).waitFor();
  assert.equal(
    await p.locator('.online-lineup-portal').count(),
    0,
    '保存したのにスマホで古い編集が開き直された',
  );
  await p.setViewportSize({ width: 1440, height: 1000 });

  // 読み直しても両方残る
  await p.reload();
  await go('スタメン設定');
  await p
    .locator('tbody[aria-label="スタメン"] tr[data-slot]')
    .first()
    .waitFor();
  assert.deepEqual(await slots(), dropped, '保存したスタメンが残らない');
  await go('投手起用');
  await p.locator('tr[data-starter]').first().waitFor();
  assert.deepEqual(
    await rotation(),
    savedRotation,
    'スタメンの保存で投手起用が古い値に戻った',
  );

  // ⚠ 保存済みの先発が抹消された（名簿には居る）。役割を持たないので、行の札を
  //    描こうとして画面ごと落ちていた。崩れた行として出し、救援との入れ替えで直せる
  const inactiveId = await fixture.store.transaction((bundle) => {
    const league = bundle.league;
    const member = league.members.find((m) => m.userId === fixture.userId);
    const team = league.game.teams[member.teamName];
    const id = team.pitchingRotation.starters[1];
    team.players.find((pl) => pl.id === id).isActive = false;
    league.revision++;
    return { value: id };
  });
  await p.reload();
  await go('投手起用');
  const inactiveRow = p.locator(`tr[data-starter="${inactiveId}"]`);
  assert.match(
    await inactiveRow.innerText(),
    /今は起用できません/,
    '抹消された先発を崩れた行として出さない',
  );
  await inactiveRow.getByRole('button').first().click();
  await p
    .locator('tr[data-reliever]')
    .first()
    .getByRole('button')
    .first()
    .click();
  assert.equal(
    await p.locator(`tr[data-starter="${inactiveId}"]`).count(),
    0,
    '抹消された先発の行を救援で埋められない',
  );
  await click('変更を取り消す');

  // ---- 列と、疲労で名前に付く色 ----------------------------------------
  // ⚠ **投と打を別の列で出すこと**。以前は打の列のマウスオーバーにだけ
  //    投げる手が入っていて、右投左打かどうかが一覧で分からなかった。
  //    ⚠ 打の列を**置き換えない**こと（実際にやって表が1列ずれた）
  // ⚠ **疲労は名前にも色を付ける**。数字の列にも色はあるが、選ぶときに
  //    目で追っているのは名前なので、数字まで目が行かない。
  //    黄＝成長が鈍り始める（41〜）、赤＝鈍り方が最も大きい（81〜）
  {
    // 疲労を仕込む。⚠ 実際の試合で81以上を作るには何十ターンもかかる
    await fixture.store.transaction((bundle) => {
      const team = bundle.league.game.teams[bundle.league.members[0].teamName];
      const fielders = team.players.filter((x) => x.position !== 'pitcher');
      fielders[0].fatigue = 0;
      fielders[1].fatigue = 50;
      fielders[2].fatigue = 95;
      const pitchers = team.players.filter((x) => x.position === 'pitcher');
      pitchers[0].fatigue = 95;
      bundle.league.revision++;
      return { value: null };
    });
    await go('スタメン設定');
    await click('更新');
    const headers = async () =>
      (await p.locator('thead th:visible').allInnerTexts()).map((t) => t.trim());
    const lineupHeaders = await headers();
    assert.ok(
      lineupHeaders.includes('投') && lineupHeaders.includes('打'),
      `投と打の列が揃っていない: ${lineupHeaders.join('/')}`,
    );
    assert.ok(
      lineupHeaders.indexOf('投') < lineupHeaders.indexOf('打'),
      '投が打より後ろにある',
    );
    // ⚠ **見出しと本文の列数が揃っていること**。ずれると値が1列ずれて並ぶ
    assert.deepEqual(
      await p.evaluate(() => {
        const t = [...document.querySelectorAll('table')].find(
          (x) => x.offsetParent,
        );
        const body = [...t.querySelectorAll('tbody tr')].find(
          (r) => r.querySelectorAll('td').length > 3,
        );
        return [
          t.querySelectorAll('thead th').length,
          body.querySelectorAll('td').length,
        ];
      }),
      (() => {
        const n = lineupHeaders.length;
        return [n, n];
      })(),
      'スタメン設定の見出しと本文で列数が違う',
    );
    // ⚠ **見えている表から取ること**。2つのページは隠して残してあるので
    //    （`BoardPage` の `hidden`）、`:visible` を付けないと裏の表に当たる
    const toneOf = (name) =>
      p
        .locator('td.online-lineup-person:visible', { hasText: name })
        .first()
        .getAttribute('class');
    const live = (await fixture.store.read()).league;
    const own = live.game.teams[live.members[0].teamName].players;
    const fielders = own.filter((x) => x.position !== 'pitcher');
    assert.match(await toneOf(fielders[0].name), /online-fatigue-none/, '疲労0に色が付いている');
    assert.match(await toneOf(fielders[1].name), /online-fatigue-warn/, '疲労50が黄色でない');
    assert.match(await toneOf(fielders[2].name), /online-fatigue-heavy/, '疲労95が赤でない');
    // ⚠ **色だけに頼らない**。読み上げとマウスオーバーに意味を出す
    assert.match(
      await p
        .locator('td.online-lineup-person:visible', { hasText: fielders[2].name })
        .first()
        .getAttribute('title'),
      /疲れ/,
      '色の意味が文字で出ていない',
    );

    // ---- 投手起用: フォームの列と、同じ色
    await go('投手起用');
    const pitchHeaders = await headers();
    assert.ok(
      pitchHeaders.includes('フォーム'),
      `投手起用にフォームの列が無い: ${pitchHeaders.join('/')}`,
    );
    const forms = (
      await p.locator('td.online-pitch-form:visible').allInnerTexts()
    ).map((t) => t.trim());
    assert.ok(forms.length > 0, 'フォームの欄が1つも出ていない');
    // ⚠ 名前（オーバー/スリクォ/サイド/アンダー）で出すこと。内部のキーを出さない
    assert.ok(
      forms.every((f) => ['オーバー', 'スリクォ', 'サイド', 'アンダー', '—'].includes(f)),
      `フォームの書き方がちがう: ${[...new Set(forms)].join('/')}`,
    );
    assert.ok(
      forms.some((f) => f !== '—'),
      'フォームが全部「—」（投影に載っていない）',
    );
    const tiredPitcher = own.find((x) => x.position === 'pitcher' && x.fatigue === 95);
    assert.match(
      await toneOf(tiredPitcher.name),
      /online-fatigue-heavy/,
      '投手起用で疲労95が赤でない',
    );
  }
  // ---- 通算成績（情報 → 通算成績）--------------------------------------
  // ⚠ **1年で終わるゲームではない**。育てた選手がこのリーグで何をしたかが
  //    残らないと、育てた意味が見えない。
  // ⚠ 通算は**球団ごとの読み込み**に載る（ビューには載せない）。自球団でも
  //    読み直さないと空欄になる（`TeamRoster` の `always`）
  {
    await go('通算成績');
    const heading = p.getByRole('heading', { name: '通算成績', level: 1 });
    await heading.waitFor();
    // ⚠ 期間の名前は**表の脇にも出すこと**（今季の表と同じ見た目なので、
    //    どちらを見ているのか分からなくなる）
    assert.match(
      await p.locator('.online-roster-toolbar small:visible').first().innerText(),
      /通算/,
      '表の脇に期間（通算）が出ていない',
    );
    // ⚠ **起用の順では並べない**（1試合の投手が先頭に来る）。出場量の多い順
    await p.getByText('並び：打席（大きい順）', { exact: false }).waitFor();
    const live = (await fixture.store.read()).league;
    const own = live.members[0].teamName;
    const info = await fixture.service.teamInfo('admin', own);
    const top = info.roster
      .filter((x) => x.career?.seasonStats?.batting?.plateAppearances)
      .sort(
        (x, y) =>
          y.career.seasonStats.batting.plateAppearances -
          x.career.seasonStats.batting.plateAppearances,
      )[0];
    assert.ok(top, '前提: 通算の打席がある選手が居ない');
    const row = p
      .locator('.online-roster-rows article')
      .filter({ hasText: top.name })
      .first();
    await row.waitFor();
    // ⚠ **サーバーが出した合計をそのまま出すこと**（画面で足し直さない）
    const cells = (await row.locator('.online-roster-values > span').allInnerTexts()).map(
      (t) => t.trim(),
    );
    assert.ok(
      cells.includes(String(top.career.seasonStats.batting.plateAppearances)),
      `通算の打席が出ていない: ${cells.join('/')}`,
    );
    // ⚠ 今季の表と**同じ列・同じ操作**にすること（別の表を作らない）
    await p
      .getByRole('button', { name: '本塁打で並べ替え', exact: true })
      .click();
    await p.getByText('並び：本塁打（大きい順）', { exact: false }).waitFor();
    // ⚠ 他球団も見られること（球団を選ぶ）
    const other = live.season.settings.teamNames.find((n) => n !== own);
    await p.getByLabel('閲覧する球団').selectOption(other);
    await p.getByText('通算・閲覧 · ', { exact: false }).waitFor();
    assert.ok(
      (await p.locator('.online-roster-rows article').count()) > 0,
      '他球団の通算成績が出ない',
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    'online-lineup-board-ui-check PASS（守備分析なし / 控えに投手なし / 選んで交代・守備の入れ替え / 守備図 / ドラッグ / 元に戻す / ページ移動 / 投手起用の入れ替え・守護神・ローテから外す / スマホの幅をまたぐ編集 / 別々に保存 / 読み直し / 投と打の列・フォームの列・疲労で名前に色 / 通算成績）',
  );
} finally {
  await browser.close();
}
