import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { LineupSettingContent } from '../components/LineupSettingScreen.jsx';
import { LEAGUE_SETTINGS } from '../teams-data.js';
import {
  teamFromView,
  planFromTeam,
  hasUnsavedFullLineup,
} from './lineupBridge.js';
import { teamLabel } from './gameText.js';
import { useDraftMemory } from './Drafts.jsx';

export { hasUnsavedFullLineup };

// ============================================================
// スマホ版の詳しい編成画面。**一人用の編成画面をそのまま使う**。
//
// 【なぜそのまま使えるか】`LineupSettingContent` は `team` をプロップで受け取り、
// その場で書き換える作りで、`TEAMS_DATA` への結合は外側の1行だけだった。
// だから view から `team` 形の複製を組み立てて渡せば、2,600行が動く。
// 組み立てと読み直しは `./lineupBridge.js`（ハーネスから検査するため別ファイル）。
//
// ⚠ PC版はこの画面を使わない。スタメン設定（`LineupBoard.jsx`）と投手起用
//    （`PitchingBoard.jsx`）を、比べて決めるための1枚の表として作り直した。
//    スマホの回転（PCの画面との入れ替わり）をまたぐ編集の受け渡しは
//    `lineupBridge.js` の `restoreFromFullLineup` / `fullLineupFromBoards`。
// ⚠ `.online` の中に置くなら `.online-sp` で包むこと。`online.css` は要素名で
//    当てていて（`.online button` など）、Tailwind の単一クラスより強い。
//    ここでは横に長い画面なので、ポータルで body 直下へ全画面で出す。
// ============================================================

const clone = (value) => JSON.parse(JSON.stringify(value));

/** スマホ版。横に長い画面なので、押したときだけ全画面で被せる */
export default function OnlineLineup({ view, busy, tab, onSave, onClose }) {
  // ⚠ 画面は `team` を書き換えるので、開いている間は同じオブジェクトを保つ。
  //    毎回作り直すと編集が消える。
  // ⚠ 部品の中（useRef）ではなく下書きの入れ物に持つ。スマホの回転でスマホ用と
  //    PC用の画面が入れ替わると、この部品ごと作り直されて編集が消えていた
  //    編集していない写しは使い回さない（開き直したら最新の編成から始める）
  const [editing, discard] = useDraftMemory(
    'lineup.full',
    () => {
      const fresh = teamFromView(view);
      return {
        team: fresh,
        base: clone(view.lineup || {}),
        basePlan: JSON.stringify(planFromTeam(fresh)),
      };
    },
    hasUnsavedFullLineup,
  );
  const team = editing.team;

  const [saveError, setSaveError] = useState('');
  const save = async () => {
    setSaveError('');
    const result = await onSave(planFromTeam(team), editing.base);
    if (result && !result.ok) setSaveError(result.error || '保存できませんでした');
    else if (result?.ok) discard();
  };
  const close = () => {
    discard();
    onClose();
  };

  // ⚠ 一人用の画面は `LEAGUE_SETTINGS.useDH` を見る。オンラインのリーグ設定に合わせる
  LEAGUE_SETTINGS.useDH = !!view.useDH;

  return createPortal(
    <div className="online-lineup-portal fixed inset-0 z-50 overflow-y-auto bg-surface-0">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-700 bg-surface-1 px-4 py-2">
        <strong className="text-white">{teamLabel(view.teamName)} · 編成</strong>
        {saveError ? (
          // ⚠ 失敗の文言はここに出す。画面上部の帯はこの全画面の裏に隠れる
          <span role="alert" className="text-xs text-red-300">
            保存できませんでした：{saveError}（編集は残っています）
          </span>
        ) : (
          <span className="text-xs text-gray-300">
            保存するまでサーバーには送られません
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={close}
            className="rounded border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-600 disabled:opacity-50"
          >
            方針・采配の設定へ（保存しない）
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded bg-cyan-500 px-3 py-1.5 text-sm font-bold text-cyan-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            この編成で保存
          </button>
        </div>
      </div>
      {/* ⚠ teamName は内部名のまま渡す（画面の中で名前による照合に使われる）
          ⚠ `initialTab` は左メニューの項目から、画面の中のタブへ直に入るため */}
      <LineupSettingContent
        teamName={view.teamName}
        displayName={teamLabel(view.teamName)}
        team={team}
        canConvertPosition={false}
        canSealPitch={false}
        initialTab={tab}
      />
    </div>,
    document.body,
  );
}
