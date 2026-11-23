// ============================================================
// 画面検査のブラウザの起動と、配布HTML（dist/index.html）の読み込み。
//
// - ブラウザは Playwright のものを使う。別のものを使うときは
//   `PLAYWRIGHT_CHROME_CHANNEL`（chrome など、入っている Chrome の版）か
//   `PW_CHROMIUM`（実行ファイルの場所）を指定する。
// ⚠ 検査ごとに起動の書き方を写さない。以前は写しのうち2本が環境変数を見ておらず、
//    手元で版の合わないブラウザしか無いときにその2本だけ起動できなかった。
// ============================================================
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

/** ブラウザを開く（既定は画面なし）。`PLAYWRIGHT_CHROME_CHANNEL` と `PW_CHROMIUM` を見る */
export function launchBrowser({ headless = true } = {}) {
  const options = { headless };
  if (process.env.PLAYWRIGHT_CHROME_CHANNEL) options.channel = process.env.PLAYWRIGHT_CHROME_CHANNEL;
  if (process.env.PW_CHROMIUM) options.executablePath = process.env.PW_CHROMIUM;
  return chromium.launch(options);
}

/** 配布HTML（先に `npm run build`）の中身 */
export function distHtml() {
  return readFile(new URL('../../../dist/index.html', import.meta.url), 'utf8');
}
