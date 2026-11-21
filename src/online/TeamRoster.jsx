import React, { useState } from 'react';
import { useRead } from './useRead.js';
import { teamLabel } from './gameText.js';
import { Page } from './Page.jsx';
/**
 * 球団を選んで名簿を出す枠（選手成績・通算成績で共通）。
 *
 * ⚠ `always` を立てると、**自球団でもサーバーから読み直す**。ビューに載せて
 *    いない項目（通算成績など）を使う画面はこれを使う。立てないと、自球団だけ
 *    その項目が欠けた `view` が渡り、自分の選手だけ空欄になる。
 * ⚠ 読み込み中・失敗の表示も `Page` で包む（監査 2026-11-20）。包まないと、まとめたページ
 *    （チーム分析の `PageTabs`）の見出しと切り替えの列が消え、開くたびに跳ねる・失敗したまま
 *    別の切り替えへ移れなかった。`title` は包まれていないページの見出し（球団史・記録など）
 */
export default function TeamRoster({ view, children, always = false, title, selected: controlled, onSelect }) {
  // `selected` / `onSelect` を渡すと、選んだ球団を呼ぶ側が持つ（チーム分析の切り替えで、
  // 選んだ球団を保ったまま中の画面を替えるため）
  const [picked, setPicked] = useState(view.teamName);
  const selected = controlled ?? picked;
  const setSelected = onSelect ?? setPicked;
  const own = selected === view.teamName && !always;
  const result = useRead(own ? null : 'team', {
    team: selected,
    revision: view.revision,
  });
  const names = [
    ...new Set(
      [
        view.teamName,
        ...(view.teamNames || []),
        ...(view.standings || []).map((t) => t.teamName || t.team),
        ...(view.members || []).map((m) => m.teamName),
      ].filter(Boolean),
    ),
  ];
  const shown = own
    ? view
    : result.data?.teamName === selected
      ? result.data
      : null;
  const selector = (
    <select
      aria-label="閲覧する球団"
      value={selected}
      onChange={(e) => setSelected(e.target.value)}
    >
      {names.map((name) => (
        <option key={name} value={name}>
          {/* ⚠ 値は内部名のまま（名簿の取得に使う）。見せる名前だけ差し替える */}
          {teamLabel(name)}
          {name === view.teamName ? '（自球団）' : ''}
        </option>
      ))}
    </select>
  );
  return (
    <section className="online-team-roster">
      {!own && (result.loading || result.error) ? (
        <Page title={title}>
          <div className="online-team-selector">{selector}</div>
          {result.loading ? (
            <p>球団情報を読み込んでいます…</p>
          ) : (
            <div role="alert">
              {result.error}
              <button onClick={result.retry}>再取得</button>
            </div>
          )}
        </Page>
      ) : (
        shown && children(shown, selector)
      )}
    </section>
  );
}
