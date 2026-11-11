// 画面検査が落ちたとき、開いているページをすべて撮って /tmp に残す。
//
// ⚠ CI の「Upload UI evidence」は /tmp/baseball-online-*.png を拾う。名前の頭を変えると
//    成果物に入らない（以前の online-join-ui-check は /tmp/online-join-*.png に書いていて、
//    CI では一度も残っていなかった）。
// 使い方: try { … } catch (error) { await failureShots(browser, 'online-trade-ui'); throw error; } finally { … }
export async function failureShots(browser, name) {
  const paths = [];
  let n = 0;
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const path = `/tmp/baseball-${name}-failure-${++n}.png`;
      // 撮れないページ（閉じかけ・読み込み中）は飛ばす。元の失敗を隠さないこと
      await page.screenshot({ path, fullPage: true }).then(() => paths.push(path), () => {});
    }
  }
  if (paths.length) console.error(`落ちた時点の画面: ${paths.join(' ')}`);
}
