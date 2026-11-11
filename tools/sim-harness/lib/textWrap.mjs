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

/**
 * 短い名前・札が**語の途中で折れている**ところを探す（画面の検査用）。
 * ⚠ 日本語は字の間でどこでも折れるので、「姫路シー／ホース」「オフ · トライア／ウト」と
 *    均して折っても語の途中で割れる。区切り（空白・「·」「・」「／」）の後ろ以外で行が
 *    変わっていたら返す。文の段落には使わない（文は字の間で折れてよい）。
 *    1つの名前を塊に分けて置いたとき（球団名の都市と愛称）は、塊の間は要素の境目なので
 *    ここでは見ない（文字の並び1つずつを見る）。
 */
export function midWordBreaks(page, selector) {
  return page.evaluate((selector) => {
    const out = [];
    const separator = /[\s·・／/]/;
    for (const root of document.querySelectorAll(selector)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const text = t.textContent;
        if (text.trim().length < 2 || !t.parentElement?.checkVisibility?.()) continue;
        const range = document.createRange();
        let lastTop = null;
        for (let i = 0; i < text.length; i++) {
          range.setStart(t, i);
          range.setEnd(t, i + 1);
          const rect = [...range.getClientRects()].find((r) => r.width > 0);
          if (!rect) continue;
          if (
            lastTop !== null &&
            rect.top > lastTop + 2 &&
            !separator.test(text[i]) &&
            !separator.test(text[i - 1])
          ) {
            out.push(`${text.slice(0, i)}／${text.slice(i)}`.trim());
            break;
          }
          lastTop = rect.top;
        }
      }
    }
    return [...new Set(out)];
  }, selector);
}
