import { useCallback, useEffect, useState } from 'react';
import {
  firstWeekGuide,
  firstWeekKey,
  markFirstWeek,
  readFirstWeek,
  writeFirstWeek,
  FIRST_WEEK_STEPS,
} from './firstWeek.js';

/**
 * はじめての1週間の案内（PC・スマホWeb 共通）。`opened`: いま開いているページ（PC はページ、
 * スマホWeb はタブ）。開いたページの手順を済みにする。
 * @param field 手順のどの欄で照らすか（PC は 'page'、スマホWeb は 'mobile'）
 */
export function useFirstWeek(view, opened, field = 'page') {
  const key = view?.joinedAt ? firstWeekKey(view.teamName, view.joinedAt) : null;
  const [state, setState] = useState(() => (key ? readFirstWeek(key) : { done: [], closed: false }));
  useEffect(() => {
    if (key) setState(readFirstWeek(key));
  }, [key]);
  const save = useCallback(
    (next) => {
      setState(next);
      if (key) writeFirstWeek(key, next);
    },
    [key],
  );
  useEffect(() => {
    if (!key) return;
    // ⚠ スマホWeb は打順のタブ1つで3つ（スタメン・投手・方針）を見られるので、タブで全部済みにする
    const ids = FIRST_WEEK_STEPS.filter((s) => s[field] === opened).map((s) => s.id);
    if (!ids.length) return;
    setState((prev) => {
      const next = ids.reduce(markFirstWeek, prev);
      if (next !== prev) writeFirstWeek(key, next);
      return next;
    });
  }, [key, opened, field]);
  const guide = key ? firstWeekGuide(view.joinedAt, state) : null;
  const close = useCallback(() => save({ ...state, closed: true }), [save, state]);
  return { guide, close };
}
