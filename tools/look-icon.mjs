// 新しい見た目（試作）の「ホーム画面に追加」の絵（public/look-icon-*.png）を書き出す。
//   node tools/look-icon.mjs
// 絵はコードで描く（夜の球場の色に白い球と赤い縫い目）。⚠ 周りに余白を取る（丸く切る端末がある）
import { chromium } from 'playwright';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="sky" cx="50%" cy="0%" r="100%">
      <stop offset="0" stop-color="#3d5674"/><stop offset="1" stop-color="#1b2738"/>
    </radialGradient>
    <radialGradient id="ball" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9dee5"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#sky)"/>
  <circle cx="256" cy="236" r="132" fill="url(#ball)"/>
  <path d="M168 138 C214 190 214 282 168 334" fill="none" stroke="#d6403a" stroke-width="9" stroke-dasharray="14 10"/>
  <path d="M344 138 C298 190 298 282 344 334" fill="none" stroke="#d6403a" stroke-width="9" stroke-dasharray="14 10"/>
  <text x="256" y="440" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="58" letter-spacing="4" fill="#f5c84c">NEXT STAGE</text>
</svg>`;
const browser = await chromium.launch();
for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
  await page.screenshot({ path: new URL(`../public/look-icon-${size}.png`, import.meta.url).pathname });
  await page.close();
}
await browser.close();
