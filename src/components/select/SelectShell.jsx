import React from 'react';

// ============================================================
// 導入画面（モード選択 / リーグ選択 / チーム選択）の外枠
//
// 【なぜ必要か】3つの選択画面がそれぞれ `bg-gradient-to-b from-gray-900 to-gray-800`
// を直に書いていて、**タイトル画面（夜の球場）から入った瞬間に世界が消えて**
// ただの暗い板になっていた。タイトルと同じ夜を薄く引き継ぐ。
//
// ⚠ **タイトル画面ほど描き込まないこと**。ここは選ぶための画面で、
//   主役はカード。球場は「地平線の光」だけに留める
//   （照明塔まで描いたら、カードより背景が強くなった）。
// ⚠ 中身は**縦中央に置く**。以前は上寄せで、6校のリーグだと
//   上1/3で終わって下2/3が空のグラデーションだった。
// ============================================================

/**
 * `fitHeight`: 1画面に収める画面は true（既定）。
 * ⚠ **縦に読み進める画面では false にすること**。`data-fit-height` が付くと
 *   `App.jsx` の自動フィットが画面ごと縮めにかかる。27リーグ並ぶリーグ選択で
 *   それをやると文字が小さくなるだけで得が無い（設計規則どおり）。
 * ⚠ 代わりに内部スクロール（`overflow-y-auto`）を足すのも避けること。
 *   実測でカードの下段が途中で切れ、不具合に見えた。
 */
const SelectShell = ({ kicker, title, sub, children, footer, fitHeight = true }) => (
  <div {...(fitHeight ? { 'data-fit-height': true } : {})}
       className={`min-h-screen relative overflow-hidden flex justify-center py-10 px-6 ${fitHeight ? 'items-center' : 'items-start'}`}
       style={{ backgroundColor: '#0a111a' }}>
    {/* 地平線の光。タイトルの照明がこちらまで届いている、という一枚 */}
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%]"
         style={{ background: 'linear-gradient(0deg, rgba(44,74,51,0.30) 0%, rgba(27,38,52,0.18) 45%, transparent 100%)' }} />
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[40%]"
         style={{ background: 'radial-gradient(120% 100% at 50% 0%, rgba(219,234,254,0.07) 0%, transparent 70%)' }} />

    <div className="relative w-full max-w-5xl">
      <header className="text-center mb-7">
        {kicker && (
          <p className="text-xs font-bold tracking-[0.3em] text-[var(--accent)] mb-2">{kicker}</p>
        )}
        <h1 className="text-3xl font-black text-white leading-tight">{title}</h1>
        {/* 見出しの下に1本。タイトル画面のロゴ下と同じ手で、画面同士を繋ぐ */}
        <div className="mx-auto mt-3 h-px w-56"
             style={{ background: 'linear-gradient(90deg,transparent,var(--accent),transparent)', opacity: 0.7 }} />
        {sub && <p className="text-sm text-gray-300 mt-3">{sub}</p>}
      </header>

      {children}

      {footer && <div className="mt-7">{footer}</div>}
    </div>
  </div>
);

export default SelectShell;
