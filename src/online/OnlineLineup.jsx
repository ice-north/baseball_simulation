import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LineupSettingContent } from '../components/LineupSettingScreen.jsx';
import { LEAGUE_SETTINGS } from '../teams-data.js';
import { teamFromView, planFromTeam } from './lineupBridge.js';
import { teamLabel } from './gameText.js';
import { Page } from './Page.jsx';

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
// ⚠ **左メニューの上に被せないこと**。全画面にしたら、スタメン設定から
//    投手起用へ移れなくなった（メニューがポータルの下敷きになる）。
//    PCではサイドバーのぶんだけ左を空ける（`.online-lineup-portal`）。
// ============================================================

const clone = (value) => JSON.parse(JSON.stringify(value));

export default function OnlineLineup(props) {
  return props.embedded ? <EmbeddedLineup {...props} /> : <PortalLineup {...props} />;
}

/**
 * PC版。**ほかのページと同じ枠の中に出す**（見出し・左メニュー・保存の場所が同じ）。
 *
 * ⚠ 以前はPCもポータルで全画面に被せていて、この3ページだけアプリの見出しが
 *    消え、別の見出しバー（「○○・編成」「方針・采配へ（保存しない）」
 *    「この編成で保存」）と、左メニューと同じタブが出ていた。
 * ⚠ 中に入れられるのは、`online.css` の要素指定（`.online button` など）が
 *    `.online-sp` の中に**当たらない**ようにしてあるから（`online.css` 冒頭）。
 *    当たると一人用の小さなボタンが全部44pxに潰れる。
 * ⚠ **ページを移っても編集を残す**（隠すだけで外さない）。以前は投手起用から
 *    選手成績へ移っただけで、保存していない編集が黙って消えていた。
 *    未保存の間は左メニューに印が付く（`onDirty`）。保存済みの間は
 *    最新のビューで作り直す（他の端末や締め切りでの変更を拾う）。
 */
function EmbeddedLineup({ view, busy, tab, title, hidden, onSave, onDirty }) {
  const [history, setHistory] = useState(null);
  const [generation, setGeneration] = useState(0);
  const [saveError, setSaveError] = useState('');
  const dirty = !!history?.dirty;
  const teamRef = useRef(null);
  const baseRef = useRef(null);
  const builtFor = useRef(null);
  if (!teamRef.current || (!dirty && builtFor.current !== view.revision)) {
    // ⚠ 未保存の編集があるあいだは作り直さない（作り直すと編集が消える）
    teamRef.current = teamFromView(view);
    baseRef.current = clone(view.lineup || {});
    builtFor.current = view.revision;
  }
  const team = teamRef.current;
  // 作り直したら中の画面（履歴・選択中の状態）も作り直す
  const key = `${builtFor.current}:${generation}`;
  useEffect(() => onDirty?.(dirty), [dirty, onDirty]);

  // ⚠ 一人用の画面は `LEAGUE_SETTINGS.useDH` を見る。オンラインのリーグ設定に合わせる
  LEAGUE_SETTINGS.useDH = !!view.useDH;

  const save = async () => {
    setSaveError('');
    const result = await onSave(planFromTeam(team), baseRef.current);
    if (result && !result.ok) {
      setSaveError(result.error || '保存できませんでした');
      return;
    }
    // ⚠ 保存できたら、保存した内容を新しい起点にする（元に戻すの履歴も切る）
    teamRef.current = null;
    setHistory(null);
    setGeneration((g) => g + 1);
  };
  const discard = () => {
    teamRef.current = null;
    setHistory(null);
    setSaveError('');
    setGeneration((g) => g + 1);
  };
  return (
    <div hidden={hidden}>
      <Page
        title={title}
        sticky
        sub={
          saveError ? (
            <span role="alert" className="online-error-text">
              保存できませんでした：{saveError}（編集は残っています）
            </span>
          ) : dirty ? (
            '保存していない変更があります。保存するまで試合には反映されません。'
          ) : (
            '変更は「保存」を押すまでサーバーには送られません。'
          )
        }
        actions={
          <>
            <button
              disabled={busy || !history?.canUndo}
              onClick={() => history?.undo()}
              title="元に戻す（Ctrl+Z）"
            >
              元に戻す
            </button>
            <button
              disabled={busy || !history?.canRedo}
              onClick={() => history?.redo()}
              title="やり直す（Ctrl+Shift+Z）"
            >
              やり直す
            </button>
            <button disabled={busy || !dirty} onClick={discard}>
              変更を取り消す
            </button>
            <button
              className="online-primary"
              disabled={busy || !dirty}
              onClick={save}
            >
              保存
            </button>
          </>
        }
      >
        {/* ⚠ **保存の応答待ちの間は触れなくする**（`inert`）。一人用の画面は
            `busy` を知らないので、そのままだと送信中にも並べ替えられ、
            保存が終わって作り直したときにその編集が黙って消える */}
        <div className="online-sp" inert={busy ? '' : undefined}>
          {/* ⚠ teamName は内部名のまま渡す（画面の中で名前による照合に使われる）
              ⚠ `initialTab` は左メニューの項目から、画面の中のタブへ直に入るため
              ⚠ `embedded`: 見出しと画面内のタブを出さない（左メニューと二重になる） */}
          <LineupSettingContent
            key={key}
            teamName={view.teamName}
            displayName={teamLabel(view.teamName)}
            team={team}
            canConvertPosition={false}
            initialTab={tab}
            embedded
            keyboardActive={!hidden && !busy}
            onHistory={setHistory}
          />
        </div>
      </Page>
    </div>
  );
}

/** スマホ版。横に長い画面なので、押したときだけ全画面で被せる */
function PortalLineup({ view, busy, tab, onSave, onClose }) {
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

  const [saveError, setSaveError] = useState('');
  const save = async () => {
    setSaveError('');
    const result = await onSave(planFromTeam(team), baseRef.current);
    if (result && !result.ok) setSaveError(result.error || '保存できませんでした');
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
            onClick={onClose}
            className="rounded border border-gray-600 bg-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-600 disabled:opacity-50"
          >
            方針・采配へ（保存しない）
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
        initialTab={tab}
      />
    </div>,
    document.body,
  );
}
