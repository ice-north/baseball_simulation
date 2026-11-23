// 新しい見た目（試作）: ブラウザの枠を画面に合わせる（いしだ依頼 2026-11-23「まだブラウザゲームだなー」）。
//   - アドレスバーなどの色（`theme-color`）を画面の地の色に
//   - 「ホーム画面に追加」したときに全画面のアプリとして開く（`manifest`。iOS は apple- の印）
// ⚠ 入のときだけ足し、切にしたら外す（切のときは今までと同じ頁に保つ）。
// ⚠ 一人用の頁（`/`）には足さない（この部品は `OnlineApp` だけが使う）。
import { useEffect } from 'react';

/** 見出しの帯の色（`--surface-1`）。⚠ `src/index.css` を変えたらここも、`public/online.webmanifest` も */
export const LOOK_THEME_COLOR = '#293b4f';

const HEAD_TAGS = [
  ['meta', { name: 'theme-color', content: LOOK_THEME_COLOR }],
  ['link', { rel: 'manifest', href: '/online.webmanifest' }],
  ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
  ['meta', { name: 'mobile-web-app-capable', content: 'yes' }],
  ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black' }],
  ['meta', { name: 'apple-mobile-web-app-title', content: 'NEXT STAGE' }],
  ['link', { rel: 'apple-touch-icon', href: '/look-icon-180.png' }],
];

export function useLookChrome(on) {
  useEffect(() => {
    if (!on || typeof document === 'undefined') return undefined;
    const added = HEAD_TAGS.map(([tag, attrs]) => {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      el.dataset.look = '';
      document.head.appendChild(el);
      return el;
    });
    // 地の色を html にも（引っぱって戻すときに見える余白・スクロールバーの溝）
    document.documentElement.classList.add('online-look-root');
    return () => {
      for (const el of added) el.remove();
      document.documentElement.classList.remove('online-look-root');
    };
  }, [on]);
}
