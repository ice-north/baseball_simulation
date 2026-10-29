import { productionHandler } from '../server/production.mjs';
export default async function handler(req, res) {
  try {
    await productionHandler()(req, res);
  } catch {
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'オンライン環境の設定が必要です' }));
  }
}
