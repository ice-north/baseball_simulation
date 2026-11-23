// 新しい見た目（試作）: 表の行が並べ替わったとき、元の場所から滑って入れ替わる（いしだ依頼 2026-11-23 案2）。
//
// 作り: 画面の中の表（`tbody` と選手成績の行の入れ物）を見張り、React が行を並べ替えた
// （子が付け外しされた）ら、行ごとに「前の位置 − 今の位置」だけずらした所から 0 へ戻す（FLIP）。
// ⚠ 表ごとに手を入れない（43 枚ある表のどれでも効く）。位置は入れ物の中の `offsetTop` で覚えるので、
//    ページを動かしただけでは動かない。
// ⚠ 入のときだけ、端末の「動きを減らす」設定のときは何もしない。
import { useEffect } from 'react';

const ROWS = 'tbody, .online-roster-rows';
const DURATION = 260;

/** @param root 見張る画面の外枠（`.online`）。出るまでは null */
export function useRowMotion(on, root) {
  useEffect(() => {
    const Observer = globalThis.MutationObserver;
    if (!on || !root || !Observer) return undefined;
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    // 行 → 前の位置（入れ物の中の上端）
    const last = new WeakMap();
    const remember = (box) => {
      for (const row of box.children) last.set(row, row.offsetTop);
    };
    const boxes = () => root.querySelectorAll(ROWS);
    for (const box of boxes()) remember(box);
    const observer = new Observer((records) => {
      const moved = new Set();
      for (const record of records) {
        const box = record.target;
        if (record.type === 'childList' && box.matches?.(ROWS)) moved.add(box);
        // 新しく出た表は、次に並べ替わるときのために位置だけ覚える
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches(ROWS)) remember(node);
          for (const inner of node.querySelectorAll?.(ROWS) || []) remember(inner);
        }
      }
      for (const box of moved) {
        const rows = [...box.children];
        // 1行も残っていない（全部入れ替わった＝別の表になった）ときは動かさない
        if (!rows.some((row) => last.has(row))) {
          remember(box);
          continue;
        }
        for (const row of rows) {
          const before = last.get(row);
          const now = row.offsetTop;
          if (before === undefined || before === now || typeof row.animate !== 'function') continue;
          const dy = before - now;
          // 遠すぎる移動（画面の外から来る）は短く切る。行が長い距離を飛ぶと目で追えない
          const clamped = Math.max(-240, Math.min(240, dy));
          row.animate(
            [{ transform: `translateY(${clamped}px)` }, { transform: 'translateY(0)' }],
            { duration: DURATION, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
          );
        }
        remember(box);
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [on, root]);
}
