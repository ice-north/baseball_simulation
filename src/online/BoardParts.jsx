import React from 'react';
import { Page } from './Page.jsx';

// PC版の編成ページ（スタメン設定・投手起用）で共通の部品。
// ⚠ 2つのページの**見出し・保存の場所・数字の出し方をそろえる**ためにまとめてある。

/** ページの外枠。見出しの右に 元に戻す・やり直す・変更を取り消す・保存 */
export function BoardPage({
  title,
  board,
  busy,
  problems = [],
  hidden,
  children,
}) {
  return (
    <div hidden={hidden}>
      <Page
        title={title}
        sticky
        sub={
          board.saveError ? (
            <span role="alert" className="online-error-text">
              保存できませんでした：{board.saveError}（編集は残っています）
            </span>
          ) : problems.length ? (
            <span role="alert" className="online-error-text">
              {problems[0]}
            </span>
          ) : board.dirty ? (
            '保存していない変更があります。保存するまで試合には反映されません。'
          ) : (
            '変更は「保存」を押すまでサーバーには送られません。'
          )
        }
        actions={
          <>
            <button
              disabled={busy || !board.canUndo}
              onClick={board.undo}
              title="元に戻す（Ctrl+Z）"
            >
              元に戻す
            </button>
            <button
              disabled={busy || !board.canRedo}
              onClick={board.redo}
              title="やり直す（Ctrl+Shift+Z）"
            >
              やり直す
            </button>
            <button disabled={busy || !board.dirty} onClick={board.discard}>
              変更を取り消す
            </button>
            <button
              className="online-primary"
              disabled={busy || !board.dirty || problems.length > 0}
              onClick={board.save}
            >
              保存
            </button>
          </>
        }
      >
        {children}
      </Page>
    </div>
  );
}

/**
 * 疲労。試合で使われなくなる値を見分けられるように色を変える。
 * `rest` 以上は赤（その日は休む）、`warn` 以上は橙。
 */
export function Fatigue({ value, warn = 40, rest, restText }) {
  const v = value || 0;
  const tone = v >= rest ? 'is-rest' : v >= warn ? 'is-tired' : '';
  return (
    <span
      className={`online-lineup-fatigue ${tone}`}
      title={v >= rest ? `疲労${v}: ${restText}` : `疲労${v}`}
    >
      {v}
    </span>
  );
}
