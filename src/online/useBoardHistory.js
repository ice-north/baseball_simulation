import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================
// PC版の編成ページ（スタメン設定 `LineupBoard.jsx`・投手起用 `PitchingBoard.jsx`）の
// 編集の入れ物。**2つのページで同じ振る舞いにする**ためにまとめてある。
//
//  - 元に戻す／やり直す（ボタンと Ctrl+Z / Ctrl+Shift+Z・Ctrl+Y）
//  - 未保存の印（`onDirty`）と、閉じる・再読み込みの前の確認
//  - 保存していない間は、最新の view（他の端末・締め切りでの変更）で作り直す。
//    ⚠ 未保存の編集があるあいだは作り直さない（作り直すと編集が消える）
//  - 保存できたら、保存した内容を新しい起点にする（履歴も切る）
//  - スマホの全画面編成から受け取った編集（`restore`）で始め、保存していない編集を
//    知らせる（`onDraft`。スマホを縦に戻したときに引き継ぐため。`DesktopView.jsx`）
//
// `fromView(view)` は view から編集の値を作る。`same(a, b)` は値の比較。
// `toPlan(value)` は保存で送る項目（`rebaseLineupSave` の受け持ち項目だけ）。
// ============================================================

const HISTORY_LIMIT = 100;

export function useBoardHistory({
  view,
  fromView,
  same,
  toPlan,
  onSave,
  onDirty,
  onDraft,
  restore,
  keyActive,
  onEscape,
}) {
  const build = (v) => {
    const value = fromView(v);
    return {
      stack: [value],
      index: 0,
      base: value,
      baseLineup: v.lineup || {},
    };
  };
  // 受け取った編集は「起点 → 編集後」の2段で始める（元に戻すで起点へ戻れる）
  const resume = (v, r) => {
    const base = fromView({ ...v, lineup: r.base });
    const edited = fromView({ ...v, lineup: r.lineup });
    if (same(base, edited)) return build(v);
    return { stack: [base, edited], index: 1, base, baseLineup: r.base };
  };
  const [history, setHistory] = useState(() =>
    restore ? resume(view, restore) : build(view),
  );
  // ⚠ 受け取った編集で始めたときは「まだ最新で作っていない」扱いにする。受け取った
  //    起点は古いことがあり、元に戻して未保存でなくなったら最新の view で作り直す
  //    （古い起点のまま「保存済み」に見せない）
  const [builtFor, setBuiltFor] = useState(() =>
    restore ? null : view.revision,
  );
  const [saveError, setSaveError] = useState('');
  // 選択（行の位置で持つ画面がある）は、値が入れ替わる操作のたびに外す
  const escape = useRef(onEscape);
  escape.current = onEscape;
  const value = history.stack[history.index];
  const dirty = !same(value, history.base);
  if (!dirty && builtFor !== view.revision) {
    // 描画中の作り直し（React の「前回の値から状態を直す」書き方）
    setBuiltFor(view.revision);
    const next = build(view);
    // ⚠ 更新番号はリーグ全体で1つ（他の球団の保存・毎時の進行でも上がる）。
    //    このページの値が変わっていなければ、選択（役割の一覧も）と履歴を残し、
    //    保存の起点だけ最新にする。外すと、選んでから押すまでの間に他の人が
    //    保存しただけで選択が消え、次のクリックが「入れ替え」でなく「選ぶ」になる
    if (same(next.base, value))
      setHistory((h) => ({ ...h, baseLineup: next.baseLineup }));
    else {
      setHistory(next);
      onEscape?.();
    }
  }

  useEffect(() => onDirty?.(dirty), [dirty, onDirty]);
  useEffect(() => {
    onDraft?.({
      dirty,
      plan: dirty ? toPlan(value) : null,
      baseLineup: history.baseLineup,
    });
    // `toPlan` は値が同じなら同じ結果なので、値の変わり目だけ知らせる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, value, history.baseLineup, onDraft]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const commit = useCallback(
    (next) => {
      setHistory((h) => {
        const current = h.stack[h.index];
        if (next === current || same(next, current)) return h;
        const stack = [...h.stack.slice(0, h.index + 1), next].slice(
          -HISTORY_LIMIT,
        );
        return { ...h, stack, index: stack.length - 1 };
      });
      setSaveError('');
    },
    [same],
  );
  // ⚠ ボタンでもキーでも選択を外す。外さないと、行の位置で持つ選択が
  //    戻した後の別の選手を指したまま残り、次の操作で選んでいない選手が動く
  const undo = useCallback(() => {
    setHistory((h) => (h.index > 0 ? { ...h, index: h.index - 1 } : h));
    escape.current?.();
  }, []);
  const redo = useCallback(() => {
    setHistory((h) =>
      h.index < h.stack.length - 1 ? { ...h, index: h.index + 1 } : h,
    );
    escape.current?.();
  }, []);
  const discard = () => {
    setHistory(build(view));
    setBuiltFor(view.revision);
    setSaveError('');
    onEscape?.();
  };
  const save = async () => {
    setSaveError('');
    const plan = toPlan(value);
    const result = await onSave(plan, history.baseLineup);
    if (result && !result.ok) {
      setSaveError(result.error || '保存できませんでした');
      return;
    }
    setHistory({
      stack: [value],
      index: 0,
      base: value,
      baseLineup: { ...history.baseLineup, ...plan },
    });
  };

  // キーボード: 元に戻す・やり直す・選択の取り消し（入力欄の中では奪わない）
  useEffect(() => {
    if (!keyActive) return undefined;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Escape') {
        onEscape?.();
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyActive, undo, redo, onEscape]);

  return {
    value,
    dirty,
    commit,
    undo,
    redo,
    canUndo: history.index > 0,
    canRedo: history.index < history.stack.length - 1,
    discard,
    save,
    saveError,
  };
}
