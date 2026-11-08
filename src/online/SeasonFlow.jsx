import React from 'react';
import { SEASON_STEPS } from './shared.js';
import { formatDeadline } from './LeaguePanels.jsx';

// ============================================================
// 1年の流れの帯（シーズン → プレーオフ → 契約更改 → トライアウト →
// 年度更新 → キャンプ → 開幕）。いまの段階を光らせ、その下に
// 「いま何をするか」と時刻を1〜2行で出す。
//
// ⚠ いしだ指摘: シーズン後の流れ・いまの段階・何をすればいいかが分からない。
//    段階はサーバーが決める（`view.stage`、`seasonStage`）。画面で日付から
//    推し量らないこと（スマホ・アプリと食い違う）。
// ⚠ 初期メンバー選択（`pack_select`）の間は出さない。リーグの最初の1回だけで、
//    その画面に流れの説明がある。
// ============================================================

/** いまの段階の説明文（1行目: 段階と時刻、2行目: やること） */
export function stageLines(view) {
  const stage = view?.stage;
  const step = SEASON_STEPS.find((s) => s.key === stage?.key);
  if (!step) return null;
  const next =
    view.nextAdvanceAt && formatDeadline(view.nextAdvanceAt);
  let head;
  if (stage.open) {
    head = view.phase?.deadline
      ? `いまは${step.label}（締め切り ${formatDeadline(view.phase.deadline)}）`
      : `いまは${step.label}`;
  } else if (step.key === 'opening') {
    head = next ? `${next} に開幕します` : 'まもなく開幕します';
  } else {
    // ⚠ 手続きの合間。次の進行で開く（最大45分）。何も無いように見せない
    head = next
      ? `次の進行（${next}）で${step.label}${step.key === 'year_end' ? 'が行われ、キャンプが開きます' : 'が開きます'}`
      : `まもなく${step.label}が始まります`;
  }
  return { step, head, todo: step.todo };
}

export default function SeasonFlow({ view, compact = false }) {
  const stage = view?.stage;
  if (!stage || stage.key === 'pack_select') return null;
  const index = SEASON_STEPS.findIndex((s) => s.key === stage.key);
  if (index < 0) return null;
  const lines = stageLines(view);
  return (
    <section
      className={`online-card online-season-flow${compact ? ' is-compact' : ''}`}
      aria-label="1年の流れ"
    >
      <ol className="online-season-steps">
        {SEASON_STEPS.map((s, i) => {
          // ⚠ スマホ幅（compact）では前後だけ出す。7つ並べると、いまの段階が
          //    右端の外に隠れていた（キャンプ・開幕が見えない）
          if (compact && (i < index - 1 || i > index + 2)) return null;
          const state =
            i < index
              ? 'done'
              : i === index
                ? stage.open
                  ? 'now'
                  : 'next'
                : 'later';
          return (
            <li
              key={s.key}
              data-state={state}
              aria-current={i === index ? 'step' : undefined}
            >
              <b>{s.label}</b>
              <small>{s.when}</small>
            </li>
          );
        })}
      </ol>
      {lines && (
        <p className="online-season-now">
          <strong>{lines.head}</strong>
          <span>{lines.todo}</span>
        </p>
      )}
    </section>
  );
}
