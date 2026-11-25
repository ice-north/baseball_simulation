import React, { useEffect } from 'react';
export function PageNav({ page, count, size, setPage }) {
  const pages = Math.max(1, Math.ceil(count / size));
  useEffect(() => {
    if (page >= pages) setPage(pages - 1);
  }, [page, pages, setPage]);
  return (
    <div className="online-pager">
      <button
        aria-label="前のページ"
        disabled={page <= 0}
        onClick={() => setPage(page - 1)}
      >
        ←
      </button>
      <span>
        {Math.min(page + 1, pages)} / {pages}
      </span>
      <button
        aria-label="次のページ"
        disabled={page >= pages - 1}
        onClick={() => setPage(page + 1)}
      >
        →
      </button>
    </div>
  );
}
/**
 * 長い一覧の「続きを表示」（X1・M1 2026-11-25）。⚠ **ページ送りを増やさない**:
 * 1ターン分・名簿全員は一度に出し、それより長い一覧だけ下に足していく
 * （送るたびに見出しの位置を探し直すほうが手間、という指摘）。
 * `shown` が今出している数。押すと `step` ずつ増える。全部出たら何も出さない
 */
export function ShowMore({ shown, count, step, setShown, label = '続きを表示' }) {
  if (count <= shown) return null;
  const rest = count - shown;
  return (
    <div className="online-show-more">
      <button onClick={() => setShown(shown + step)}>
        {label}（残り{rest}）
      </button>
    </div>
  );
}
