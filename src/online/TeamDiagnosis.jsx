import React from 'react';

// ============================================================
// チーム診断「なぜ勝てない？」（自球団。PC の選手成績、スマホWeb の選手）。
// ⚠ 数字と文はサーバーが作る（`teamDiagnosis.js`）。アプリ（`PlayersScreen.kt` の DiagnosisCard）と同じ並び。
// ⚠ 直す画面へ飛ぶボタンを付ける（`page`: lineup・rotation・transfer）。`open` が無ければボタンを出さない
// ============================================================

const PAGE_LABEL = { lineup: 'スタメン設定', rotation: '投手起用', transfer: 'トレード' };

export default function TeamDiagnosis({ diagnosis, open, pages = Object.keys(PAGE_LABEL) }) {
  if (!diagnosis) return null;
  return (
    <section className="online-card online-diagnosis" aria-label="チーム診断">
      <h2>チーム診断（{diagnosis.games}試合）</h2>
      <p className="online-muted">{diagnosis.summary}</p>
      <div className="online-news-list">
        {diagnosis.items.map((item) => (
          <article key={item.kind}>
            <span>{item.text}</span>
            {open && pages.includes(item.page) && (
              <button onClick={() => open(item.page)}>{PAGE_LABEL[item.page]}へ</button>
            )}
          </article>
        ))}
        {diagnosis.note && (
          <article>
            <span>{diagnosis.note}</span>
          </article>
        )}
      </div>
    </section>
  );
}
