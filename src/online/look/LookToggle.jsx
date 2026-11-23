import React from 'react';
import { useLook } from './LookContext.jsx';

/**
 * 新しい見た目（試作）の入／切。PC は見出し、スマホはメニュー（`MobileView.jsx`）に置く。
 * ⚠ 押した端末だけが変わる（ほかの端末・ほかの参加者には影響しない）
 */
export function LookToggle({ className = 'online-look-toggle', onDone }) {
  const { on, setOn } = useLook();
  return (
    <button
      type="button"
      className={className}
      aria-pressed={on}
      title="球団マーク・選手の顔などを出す試作の見た目です。この端末だけが切り替わります"
      onClick={() => {
        setOn(!on);
        onDone?.();
      }}
    >
      新しい見た目（試作）: {on ? '入' : '切'}
    </button>
  );
}
