import React, { useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LineupSettingContent } from '../components/LineupSettingScreen.jsx';
import { LEAGUE_SETTINGS } from '../teams-data.js';
import { teamFromView, planFromTeam } from './lineupBridge.js';

// ============================================================
// オンライン版の編成画面。**一人用の編成画面をそのまま使う**。
//
// 【なぜそのまま使えるか】`LineupSettingContent` は `team` をプロップで受け取り、
// その場で書き換える作りで、`TEAMS_DATA` への結合は外側の1行だけだった。
// だから view から `team` 形の複製を組み立てて渡せば、2,600行が動く。
// 組み立てと読み直しは `./lineupBridge.js`（ハーネスから検査するため別ファイル）。
//
// ⚠ **`.online` の外へ出すこと（ポータル）**。`online.css` は
//    `.online button { min-height:44px; border:1px solid …; background:var(--surface-1) }`
//    のように**要素名で**当てている。詳細度が 0,1,1 で Tailwind の
//    `.bg-gray-700`（0,1,0）より強いため、中に入れると一人用の画面の
//    ボタンが全部44pxの同じ高さ・同じ色に潰れて、小さな操作が読めなくなる。
//    ポータルで body 直下へ出せば、一人用の画面と同じ見え方になる。
// ============================================================

const clone = (value) => JSON.parse(JSON.stringify(value));

export default function OnlineLineup({ view, busy, onSave, onClose }) {
  // ⚠ 画面は `team` を書き換えるので、開いている間は同じオブジェクトを保つ。
  //    毎回作り直すと編集が消える
  const teamRef = useRef(null);
  const baseRef = useRef(null);
  const team = useMemo(() => {
    if (!teamRef.current) {
      teamRef.current = teamFromView(view);
      baseRef.current = clone(view.lineup || {});
    }
    return teamRef.current;
  }, [view]);

  // ⚠ 一人用の画面は `LEAGUE_SETTINGS.useDH` を見る。オンラインのリーグ設定に合わせる
  LEAGUE_SETTINGS.useDH = !!view.useDH;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-surface-0">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-700 bg-surface-1 px-4 py-2">
        <strong className="text-white">{view.teamName} · 編成</strong>
        <span className="text-xs text-gray-300">
          保存するまでサーバーには送られません
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-600 disabled:opacity-50"
          >
            閉じる（保存しない）
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSave(planFromTeam(team), baseRef.current)}
            className="rounded bg-cyan-500 px-3 py-1.5 text-sm font-bold text-cyan-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            この編成で保存
          </button>
        </div>
      </div>
      <LineupSettingContent teamName={view.teamName} team={team} />
    </div>,
    document.body,
  );
}
