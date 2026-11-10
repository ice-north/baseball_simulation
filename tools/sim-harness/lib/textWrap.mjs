/**
 * 折り返した文の**最後の行が1文字ほどしかない**ところを探す（画面の検査用）。
 * ⚠ 日本語は字の間でどこでも折れるので、幅がわずかに足りないと
 *    「手続きの決定待／ち」「鹿児島ファルコン／ズ」と1文字だけ次の行に落ちる。
 *    読めはするが崩れて見えるので、直した場所は検査で見張る。
 * 返すのは見つかった文の一覧（無ければ空）。`selector` に当たる要素の中の文字だけを見る。
 */
export function shortLastLines(page, selector) {
  return page.evaluate((selector) => {
    const out = [];
    for (const root of document.querySelectorAll(selector)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const text = t.textContent.trim();
        const el = t.parentElement;
        if (text.length < 2 || !el || !el.checkVisibility?.()) continue;
        const range = document.createRange();
        range.selectNodeContents(t);
        const lines = [...range.getClientRects()].filter((r) => r.width > 0);
        if (lines.length < 2) continue;
        // ⚠ 1文字＋句読点ほど（文字の大きさの 1.6 倍未満）を「1文字だけ」とみなす
        if (lines.at(-1).width < parseFloat(getComputedStyle(el).fontSize) * 1.6) out.push(text.slice(0, 30));
      }
    }
    return [...new Set(out)];
  }, selector);
}
