import React from 'react';

/**
 * 取り消せない操作を決める帯（「選ぶ→確定」の後ろの段）。
 *
 * 一人用の取り消せない操作（トライアウトの指名・契約更改・トレード・推薦…）は、押した瞬間に
 * 決めず、まず選んだ状態にしてこの帯で決める形に揃える。言葉も揃える:
 *   問い「〜しますか？」・決めるボタン「〜する」・やめるボタン「やめる」。
 * 決めるボタンの色は意味で選ぶ（`index.css` のボタンの語彙）:
 *   btn-primary 取り消せる・前へ進む / btn-warn 取り消せないが壊さない / btn-danger 解雇など
 *
 * 画面の下に固定するので、表をどこまでスクロールしていても押せる。帯の高さぶんの余白を
 * 置き場所に足すので、ページの最後に置くこと（帯が表の最後の行に重ならない）。
 */
const ConfirmBar = ({
  title, detail, note, children,
  confirmLabel, onConfirm, confirmClass = 'btn-primary', disabled = false,
  cancelLabel = 'やめる', onCancel,
}) => (
  <>
    <div aria-hidden="true" className={children ? 'h-40' : 'h-24'} />
    <div role="dialog" aria-label={title} data-testid="confirm-bar"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(40rem,calc(100vw-2rem))] bg-surface-2 border border-cyan-500 rounded-xl shadow-2xl px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 text-sm">
          <div className="text-white font-bold truncate" title={title}>{title}</div>
          {detail && <div className="text-gray-300 text-xs truncate" title={typeof detail === 'string' ? detail : undefined}>{detail}</div>}
        </div>
        <button onClick={onConfirm} disabled={disabled}
          className={`${confirmClass} px-5 py-2 rounded-lg text-sm whitespace-nowrap`}>
          {confirmLabel}
        </button>
        <button onClick={onCancel}
          className="btn-secondary px-3 py-2 rounded-lg text-sm whitespace-nowrap">
          {cancelLabel}
        </button>
      </div>
      {children && <div className="mt-2 max-h-28 overflow-y-auto text-xs text-gray-300">{children}</div>}
      {note && <div className="mt-1.5 text-xs text-yellow-400">{note}</div>}
    </div>
  </>
);

export default ConfirmBar;
