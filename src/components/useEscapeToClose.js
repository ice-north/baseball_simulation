import { useEffect, useRef } from 'react';

// 重ねて出す窓（モーダル）を Esc で閉じる。`active` が false の間は何もしない。
// ⚠ 以前は試合前・選手交代・選手詳細のどれも Esc で閉じず、閉じるには右上の ✕ を探すしかなかった。
// ⚠ 窓は重なる（試合前の窓の上に選手詳細など）。Esc 1回で閉じるのは**いちばん上（最後に開いた）**
//    の1枚だけにするため、開いている窓を積んでおき、最後の1つだけを呼ぶ。
// 閉じる関数は描画ごとに作り直されることが多いので、最新のものを ref で持つ（積み直さない）
const stack = [];
const onKey = (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented || stack.length === 0) return;
  stack[stack.length - 1].current?.();
};

export const useEscapeToClose = (onClose, active = true) => {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return undefined;
    stack.push(ref);
    if (stack.length === 1) window.addEventListener('keydown', onKey);
    return () => {
      const i = stack.lastIndexOf(ref);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) window.removeEventListener('keydown', onKey);
    };
  }, [active]);
};

export default useEscapeToClose;
