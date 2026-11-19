import React from 'react';
import { POS } from './api.js';
import { teamLabel } from './gameText.js';
import { draftRankText } from './chronicleText.js';

// ============================================================
// NPBドラフトの発表（その年の指名選手）。
//
// ⚠ いしだ 2026-11-19「指名の演出もほしいです。契約更改前、160ターンが終わった段階で、
//    誰が指名されたかを表示しましょう」。指名は10月下旬で、そこから契約更改（11/9）までの
//    日はまとめて進むので、**シーズンの160ターンが終わって次に画面を見たときが契約更改**。
//    そこで出るよう、ホーム・手続き・契約更改の手続きに置いてある。
// ⚠ **保存も投影も足していない**。中身はもう `view.chronicle.proDrafted`（リーグ記録の
//    「リーグからプロへ」）に入っているので、その年の行だけ拾う。ビューの大きさは変わらない。
// ⚠ 出すのは**その年の指名だけ**。年度更新で `view.year` が1つ進むと消える
//    （去年の指名は球団史・記録の「リーグからプロへ」で見られる）。
// ⚠ `whenEmpty` を付けたところだけ「指名なし」も出す。0人の年は3割あり、
//    契約更改の画面では「今年は誰も抜かれなかった」と分かる方が良い。ホームでは出さない
//    （何週も「指名なし」の札が場所を取るだけ）。
// ============================================================

export default function ProDraftResult({ view, whenEmpty = false }) {
  const year = view?.year;
  const rows = (view?.chronicle?.proDrafted || []).filter((r) => r.year === year);
  if (!rows.length && !whenEmpty) return null;
  const mine = rows.filter((r) => r.team === view?.teamName);
  return (
    <section className="online-card online-pro-draft" aria-label="NPBドラフトの結果">
      <h2>
        {year}年目のNPBドラフト<small>10月下旬</small>
      </h2>
      <p className="online-muted">
        {rows.length === 0
          ? 'このリーグから指名された選手はいませんでした。プロに届く力を付けた選手が出れば、来季の10月に指名される。'
          : `このリーグから${rows.length}人がNPBへ。${
              mine.length ? `${teamLabel(view.teamName)}からは${mine.length}人。` : ''
            }`}
      </p>
      {rows.length > 0 && (
        <ol className="online-pro-draft-list">
          {rows.map((r, i) => (
            <li key={i} data-mine={r.team === view?.teamName || undefined}>
              <span className="online-pro-draft-rank">{draftRankText(r)}</span>
              <span className="online-pro-draft-who">
                <b>{r.name}</b>
                <small>
                  {POS[r.position] || r.position || ''}
                  {r.age != null ? `・${r.age}歳` : ''}
                </small>
              </span>
              <span className="online-pro-draft-move">
                {teamLabel(r.team)} → <b>{r.npbTeam}</b>
              </span>
              {r.reason && <span className="online-pro-draft-reason">{r.reason}</span>}
            </li>
          ))}
        </ol>
      )}
      {mine.length > 0 && (
        <p className="online-muted">
          プロ入りに触れて、{teamLabel(view.teamName)}の残った選手はプロ意識+5・経験+30試合分。
        </p>
      )}
    </section>
  );
}
