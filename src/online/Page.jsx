import React, { createContext, useContext, useState } from 'react';

/**
 * ページの中の切り替え（リーグ史・チーム分析のように、いくつかの画面を1つのページにまとめたとき）。
 * まとめる側が `PageTabs` で包むと、中の画面の `Page` が見出しをまとめた名前（「リーグ史」）にし、
 * その下に切り替えのボタンを並べる。中の画面の名前（「能力ランキング」）はボタンの名前になる。
 * ⚠ 中の画面は**そのまま使う**（ページごとに見出しを作り直さない）。まとめる前の画面と同じ部品なので、
 *    ほかの入口（トレード画面の「トレード履歴」など）から開いても同じ見た目のまま。
 * ⚠ 包むのは**いちばん外の `Page` だけ**。中でさらに `Page` を使っても切り替えは出さない
 */
const PageTabsContext = createContext(null);

/**
 * まとめたページの、いま開いている切り替え。⚠ 端末（タブ）に覚える: PC とスマホの幅を往復すると
 * ページが作り直されるので、覚えないと選手成績を見ていたのに最初の切り替えへ戻る。
 * `initial`（古い入口から来たとき）があればそれを先に使う
 */
export function usePageTab(name, ids, initial) {
  const key = `online.pageTab.${name}`;
  const [tab, setTab] = useState(() => {
    if (initial && ids.includes(initial)) return initial;
    try {
      const saved = sessionStorage.getItem(key);
      if (saved && ids.includes(saved)) return saved;
    } catch {
      // 覚えられない端末では最初の切り替え
    }
    return ids[0];
  });
  const change = (next) => {
    setTab(next);
    try {
      sessionStorage.setItem(key, next);
    } catch {
      // 覚えられない端末では覚えないだけ
    }
  };
  return [tab, change];
}

export function PageTabs({ title, tabs, current, onChange, children }) {
  return (
    <PageTabsContext.Provider value={{ title, tabs, current, onChange }}>{children}</PageTabsContext.Provider>
  );
}

function TabRow({ tabs, current, onChange, label }) {
  return (
    // ⚠ 押しボタン（`aria-pressed`）にする。ほかの切り替え（`.online-segments`）と同じ扱いで、
    //    検査からも名前の付いたボタンとして押せる
    <div className="online-page-tabs" role="group" aria-label={label}>
      {tabs.map(([id, name]) => (
        <button
          key={id}
          type="button"
          aria-pressed={current === id}
          onClick={() => onChange(id)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

/**
 * ページの外枠。見出し（名前・補足）と、その右に置く操作。
 * ⚠ **操作（保存など）はいつもここ**。以前は右上・左下・カードの中と
 *    ページごとに保存ボタンの場所が違った。
 * `sticky` は編集するページ用。下へスクロールしても保存が見える。
 */
export function Page({ title, sub, actions, sticky = false, children }) {
  const tabs = useContext(PageTabsContext);
  // ⚠ **見出しが要らないページもある**（ホーム）。左メニューで「ホーム」を
  //    押して開いた先にもう一度「ホーム」と出ていて、場所を取るだけだった。
  //    見出しも操作も無いときは帯ごと出さない（上に詰める）。
  const shownTitle = tabs ? tabs.title : title;
  const head = shownTitle || sub || actions || tabs;
  return (
    <div className="online-page">
      {head && (
        <header className={`online-page-head${sticky ? ' is-sticky' : ''}${tabs ? ' has-tabs' : ''}`}>
          <div>
            {shownTitle && <h1>{shownTitle}</h1>}
            {tabs && <TabRow tabs={tabs.tabs} current={tabs.current} onChange={tabs.onChange} label={tabs.title} />}
            {sub && <p>{sub}</p>}
          </div>
          {actions && <div className="online-page-actions">{actions}</div>}
        </header>
      )}
      <PageTabsContext.Provider value={null}>{children}</PageTabsContext.Provider>
    </div>
  );
}
