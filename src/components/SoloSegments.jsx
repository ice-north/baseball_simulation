import React from 'react';
import '../online/online.css';

// ============================================================
// 一人用の画面の切り替えボタン（X2。2026-11-25 いしだ「全て修正」）。
// **チーム情報（`TeamInfoScreen.jsx`）が使っているオンラインの丸い切り替え（`.online-segments`）**
// を一人用の標準にする。以前は選手成績が右上の小さなボタン、能力ランキングが角ばった大きなボタン、
// 資料室が右上のタブ、チームランキングが文字だけで、画面ごとに形が違った。
// ⚠ 地色（明るい紙）の上にも置くので、入れ物の地は不透明（`.solo-segments`。オンラインの
//    `.online-segments` は半透明で、紙の上では字が沈む。index.css の「文字色の決まり」）。
// ⚠ オンラインの部品のクラスなので `.online.online-desktop.online-embed` で包む（`SegmentBar`）。
//    中に一人用（Tailwind）のボタンを入れないこと（`.online button` が上書きする）。
// ============================================================

/** 切り替えを並べる入れ物。`Segments` はこの中に置く */
export function SegmentBar({ children, className = '' }) {
  return <div className={`online online-desktop online-embed solo-segment-bar ${className}`}>{children}</div>;
}

/**
 * 1つの切り替え（押されている1つに `aria-pressed`）。
 * @param items `[{ id, label, title?, disabled? }]`
 */
export function Segments({ label, items, value, onChange }) {
  return (
    <div className="online-segments solo-segments" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={value === item.id}
          disabled={!!item.disabled}
          title={item.title}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
