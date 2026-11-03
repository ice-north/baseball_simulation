import React from 'react';

/**
 * ページの外枠。見出し（名前・補足）と、その右に置く操作。
 * ⚠ **操作（保存など）はいつもここ**。以前は右上・左下・カードの中と
 *    ページごとに保存ボタンの場所が違った。
 * `sticky` は編集するページ用。下へスクロールしても保存が見える。
 */
export function Page({ title, sub, actions, sticky = false, children }) {
  return (
    <div className="online-page">
      <header className={`online-page-head${sticky ? ' is-sticky' : ''}`}>
        <div>
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {actions && <div className="online-page-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

