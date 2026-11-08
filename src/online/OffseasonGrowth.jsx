import React, { useState } from 'react';
import { POS } from './api.js';
import { PlayerStatsButton } from './PlayerPerformance.jsx';
import {
  campGainRows,
  campGainTotals,
  formatGain,
  relevantGains,
} from './campGains.js';

// ============================================================
// オフの成長（年度更新で起きた伸び・衰え・引退）。
//
// ⚠ いしだ指摘: 成長がいつ・どれだけ起きたのか分からない。能力が変わるのは
//    キャンプと年度更新だけで、年度更新のほうは画面に何も出ていなかった。
//    サーバーが前後の差を残す（`offseasonChanges` → `view.lastOffseason`）。
//    見せ方はキャンプの「練習の成果」と同じにする。
// ============================================================

const ROWS = 8;

export default function OffseasonGrowth({ view }) {
  const result = view?.lastOffseason;
  const [all, setAll] = useState(false);
  if (!result) return null;
  const roster = view.roster || [];
  const byId = new Map(roster.map((p) => [String(p.id), p]));
  const gains = Object.fromEntries(
    Object.entries(result.gains || {}).map(([id, changes]) => [
      id,
      relevantGains(byId.get(String(id)), changes),
    ]),
  );
  const rows = campGainRows(gains, roster).filter((r) => r.items.length);
  const up = campGainTotals(gains).filter((t) => t.diff > 0);
  const down = campGainTotals(gains).filter((t) => t.diff < 0);
  const shown = all ? rows : rows.slice(0, ROWS);
  const departed = result.departed || [];
  return (
    <section className="online-card online-camp-gains" aria-label="オフの成長">
      <div className="online-camp-gains-head">
        <h4>{result.year}年目オフの成長（年度更新）</h4>
      </div>
      <p className="online-muted">
        能力が変わるのはキャンプと年度更新だけです（シーズン中は変わりません）。
        年度更新では、年齢と今季の出場に応じて伸びたり衰えたりします。
      </p>
      {rows.length === 0 ? (
        <p className="online-muted">変わった能力はありません。</p>
      ) : (
        <>
          <p className="online-camp-gain-totals">
            <strong>{rows.filter((r) => r.sum > 0).length}人</strong>が伸び、
            <strong>{rows.filter((r) => r.sum < 0).length}人</strong>が衰えました。
            {up.length > 0 &&
              ` 伸び: ${up
                .slice(0, 5)
                .map((t) => `${t.label}${formatGain(t.diff)}`)
                .join(' · ')}`}
            {down.length > 0 &&
              ` / 衰え: ${down
                .slice(-3)
                .map((t) => `${t.label}${formatGain(t.diff)}`)
                .join(' · ')}`}
          </p>
          <ul className="online-camp-gain-list">
            {shown.map(({ player, items }) => (
              <li key={player.id}>
                <span className="online-camp-gain-name">
                  <PlayerStatsButton player={player} panel="abilities" />
                  <small>{POS[player.position]}</small>
                </span>
                <span className="online-camp-gain-items">
                  {items.map((i) => (
                    <span
                      key={i.key}
                      className={`online-gain ${i.diff > 0 ? 'is-up' : 'is-down'}`}
                    >
                      {i.label}
                      {formatGain(i.diff)}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {rows.length > ROWS && (
            <button
              className="online-camp-gain-more"
              onClick={() => setAll(!all)}
            >
              {all ? `上位${ROWS}人だけ` : `全員（${rows.length}人）を見る`}
            </button>
          )}
        </>
      )}
      {departed.length > 0 && (
        <p className="online-muted">
          引退: {departed.map((p) => `${p.name}（${p.age}歳・${POS[p.position]}）`).join('、')}
        </p>
      )}
    </section>
  );
}
