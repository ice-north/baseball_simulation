import React from 'react';
import { SEASON_STEPS, turnOfDate } from './shared.js';
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

// 自分で決める手続き（1年の流れのうち）
const DECIDE_STEPS = ['contract', 'tryout', 'camp'];
/**
 * 決定待ちの手続きが無いときに、**次に決める手続きとその時間を大きく**出す（P2 2026-11-25）。
 * ⚠ 以前は「現在、決定待ちの手続きはありません」の1行だけで、画面のほとんどがキャンプ結果の
 *    表だった。次に何をいつ決めるのかが、帯（`SeasonFlow`）の小さな字を読まないと分からなかった。
 * ⚠ 時刻は帯と同じ曜日の枠（`SEASON_STEPS` の `when`）で書く。日付を画面で推し量らない
 *    （段階はサーバーが決める。検証モードは時計が違う）
 */
export function NextProcedure({ view }) {
  const stage = view?.stage;
  const index = SEASON_STEPS.findIndex((s) => s.key === stage?.key);
  if (index < 0) return null;
  // いまの段階が開いている（シーズン中など）なら次の段階から、開く前ならその段階から探す
  const next = [...SEASON_STEPS.slice(stage.open ? index + 1 : index), ...SEASON_STEPS].find((s) =>
    DECIDE_STEPS.includes(s.key),
  );
  if (!next) return null;
  const turn =
    stage.key === 'season' ? turnOfDate(view.currentDate, view.seasonTurns) : null;
  const left = turn && view.seasonTurns ? view.seasonTurns - turn : null;
  const lines = stageLines(view);
  return (
    <section className="online-card online-next-procedure" aria-label="次の手続き">
      <small>次に決める手続き</small>
      <p>
        <strong>{next.label}</strong>
        <b>{next.when}</b>
      </p>
      <span>
        {stage.key === 'season'
          ? `${left != null ? `シーズンは残り${left}ターン。` : ''}シーズンとプレーオフが終わると開きます。`
          : lines?.head}
      </span>
    </section>
  );
}
