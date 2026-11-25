import { useEffect, useRef } from 'react';
import { hasOpenModal } from './useEscapeToClose.js';

// 画面のキー操作（UI点検 S4）。日程画面の Space/Enter＝「1日進める」、采配の試合の Space/Enter＝「1球」、
// 数字キー＝配球の狙い、など。`onKey(e)` が true を返したら、そのキーの既定の動き（Space の縦送りなど）を止める。
//
// 効かないとき:
// - `active` が false（呼ぶ側の窓が開いている・処理中など）
// - Esc で閉じる窓（`useEscapeToClose` を使う窓。選手詳細・確認の帯など）が開いている
// - 入力欄・選択欄で字を打っている
// - Ctrl・Alt・⌘ との組み合わせ、押しっぱなしの繰り返し（1日ずつ勝手に進まないように）
// - Space/Enter を、画面の中のボタンに当てたまま押した（ボタン自身を押す、いつもの動きに任せる）。
//   ただし左メニュー（nav）のボタンは除く。左メニューで画面を開いたあと、そのまま Space で進められるように
const isTyping = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const isControl = (el) => !!el?.closest?.('button, a[href], [role="button"], summary');

export const useKeyAction = (onKey, active = true) => {
  const ref = useRef(onKey);
  ref.current = onKey;
  useEffect(() => {
    if (!active) return undefined;
    const handler = (e) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (hasOpenModal()) return;
      const t = e.target;
      if (isTyping(t)) return;
      if ((e.key === ' ' || e.key === 'Enter') && isControl(t) && !t.closest('nav')) return;
      if (ref.current(e)) e.preventDefault();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active]);
};

// キーの案内に使う小さな札（ボタンの中に置く。読み上げの名前には入れない）
export const KEY_HINT_CLASS = 'ml-1.5 px-1 rounded border border-current text-[10px] font-normal leading-tight opacity-60';

export default useKeyAction;
