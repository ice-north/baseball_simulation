import { createPortal } from 'react-dom';

/**
 * 小窓（`<dialog>`）を `.online` の直下へ出す。
 *
 * ⚠ **開いたボタンの近くに描かない**。表のセルやカードの中に置いたまま開くと、
 *    その場所の指定を小窓の中身まで受け継ぐ。試合結果のカード
 *    （`.online-score div` の3列の grid・`strong` の 24px）の中で観戦リプレイと
 *    試合経過が崩れ、キャンプの表（`white-space: nowrap`）の中で選手の詳細の
 *    説明が折り返さずにはみ出していた。
 * ⚠ `.online` の**外**へは出さない。`.online-desktop` / `.online-mobile` で
 *    分けている小窓の大きさや文字の指定はそのまま当てる。
 *    開く場所で見た目が変わらないよう、カードの中で当てていた指定
 *    （`.online-card .online-muted` など）は小窓にも当ててある（online.css）。
 */
export function inOnlineRoot(node) {
  const root =
    typeof document === 'undefined' ? null : document.querySelector('.online');
  return root ? createPortal(node, root) : node;
}
