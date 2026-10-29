import { productionHandler } from '../server/production.mjs';
export default async function handler(req, res) {
  try {
    await productionHandler()(req, res);
  } catch (error) {
    // ⚠ **設定の不備は「どの変数が足りないか」まで返すこと**。
    //    以前はここで全部を同じ503へ潰しており、URL欠落・キー欠落・UUID重複・
    //    Cron秘密値の長さ不足が**すべて同じ文面**になって、構築作業で原因を
    //    切り分けられなかった（プログラマーでない人が設定する前提の画面）。
    //    ⚠ 返すのは**変数名だけ**。値は絶対に含めない。
    // ⚠ 想定外の例外は中身を出さない（文面を固定し、ログにだけ残す）。
    if (!error?.status) console.error('online handler failed:', error?.stack);
    res.statusCode = error?.status || 503;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: error?.status
          ? error.message
          : 'オンライン環境の設定が必要です',
        code: error?.code || 'server',
        ...(error?.missing ? { missing: error.missing } : {}),
      }),
    );
  }
}
