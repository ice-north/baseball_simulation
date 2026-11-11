import React, { useLayoutEffect, useRef, useState } from 'react';

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
 * ⚠ 余白は帯の**実際の高さ**に合わせる（中身の量と画面の幅で変わる）。以前は h-40 / h-24 の
 *    固定で、能力の表つきの帯（企業の雇用）では 1280幅でも最後の行が約24px帯の下に隠れていた。
 * ⚠ 狭い幅（sm 未満）では、問いを折り返してボタンを下の段に回す。以前は1行に詰めて問いを
 *    truncate していたので、390幅では「9人を解…」で切れて解雇の人数が帯から読めなかった。
 *    問いはどの幅でも切らない（補足の detail だけ、sm 以上で1行に収める）。
 */
const ConfirmBar = ({
  title, detail, note, children,
  confirmLabel, onConfirm, confirmClass = 'btn-primary', disabled = false,
  cancelLabel = 'やめる', onCancel,
}) => {
  const barRef = useRef(null);
  const [barHeight, setBarHeight] = useState(null);
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;
    const measure = () => setBarHeight(el.offsetHeight);
    measure();
    if (typeof window === 'undefined' || !window.ResizeObserver) return undefined;
    const observer = new window.ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // 帯は画面の下端から 16px（bottom-4）浮かせるので、余白は「帯の高さ＋下の16px＋上の16px」
  const spacer = barHeight != null ? barHeight + 32 : (children ? 160 : 96);
  return (
    <>
      <div aria-hidden="true" data-testid="confirm-bar-spacer" style={{ height: spacer }} />
      <div ref={barRef} role="dialog" aria-label={title} data-testid="confirm-bar"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(40rem,calc(100vw-2rem))] bg-surface-2 border border-cyan-500 rounded-xl shadow-2xl px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <div className="text-white font-bold" data-testid="confirm-bar-title">{title}</div>
            {detail && <div className="text-gray-300 text-xs sm:truncate" title={typeof detail === 'string' ? detail : undefined}>{detail}</div>}
          </div>
          <div className="flex gap-2 sm:gap-3">
            <button onClick={onConfirm} disabled={disabled}
              className={`${confirmClass} flex-1 sm:flex-none px-5 py-2 rounded-lg text-sm whitespace-nowrap`}>
              {confirmLabel}
            </button>
            <button onClick={onCancel}
              className="btn-secondary flex-1 sm:flex-none px-3 py-2 rounded-lg text-sm whitespace-nowrap">
              {cancelLabel}
            </button>
          </div>
        </div>
        {children && <div className="mt-2 max-h-28 overflow-y-auto text-xs text-gray-300">{children}</div>}
        {note && <div className="mt-1.5 text-xs text-yellow-400">{note}</div>}
      </div>
    </>
  );
};

/**
 * 行を選んで帯を出したとき、選んだ行が帯の下に隠れていれば、帯の上に来るまでページを送る。
 * 行の onClick から `keepAboveConfirmBar(e.currentTarget)` と呼ぶ（帯が描かれて余白が
 * 伸びたあとで測るので、2フレーム待つ）。
 * ⚠ 以前は画面の下の方の行を選ぶと、出てきた帯がその行の上に重なった（トライアウト 1280×720）
 */
export const keepAboveConfirmBar = (el) => {
  if (!el || typeof window === 'undefined') return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const bar = document.querySelector('[data-testid="confirm-bar"]');
    if (!bar || !el.isConnected) return;
    const over = el.getBoundingClientRect().bottom - (bar.getBoundingClientRect().top - 8);
    if (over > 0) window.scrollBy(0, over);
  }));
};

export default ConfirmBar;
