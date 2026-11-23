import React, { useState } from 'react';
import { POS } from './api.js';
import { AGE_GRID_GROUPS, ageGridRows } from './ageOutlook.js';
import { PosChip, ToneChip } from './look/Parts.jsx';

// ============================================================
// 年齢構成と3年後の見込み（自球団）。出す場所: PC の選手成績（自球団を見ているとき。`DesktopView.jsx`）と、
// 手続きのトライアウト・契約更改（PC・スマホWeb とも `LeaguePanels.jsx` の PhasePanel。compact）。
// アプリは選手の「年齢」と、手続きのトライアウト・契約更改（compact）。
// ⚠ 数字と文はサーバーが作る（`ageOutlook.js`）。アプリ（`PlayersScreen.kt` の AgeOutlookCard）と同じ並び。
// ============================================================

const KIND_LABEL = { rising: 'まだ伸びる', peak: 'ピークの近く', decline: '下り坂の見込み' };
// 新しい見た目（試作）の札の色（伸びる=緑、ピーク=黄、下り坂=赤）
const KIND_TONE = { rising: 'good', peak: 'warn', decline: 'bad' };

/**
 * 年齢 × 守備位置の図（縦が年齢で上ほど高い、横が投手・捕手・内野・外野）。
 * ⚠ いしだ 2026-11-18「どのポジションが将来足りなくなるか分かりやすいように」。
 *    「3年後」に切り替えると全員を3つ上の段へずらす（若い段が空き、上に固まる位置が足りなくなる位置）。
 * ⚠ 主力は太字、3年後に下り坂・引退が近い主力は赤（下の主力の表と同じ印）
 */
function AgeGrid({ grid, years }) {
  const [later, setLater] = useState(false);
  const rows = ageGridRows(grid, later);
  const counts = AGE_GRID_GROUPS.map((_, g) => grid.filter((p) => p.group === g).length);
  return (
    <div className="online-age-grid-wrap">
      <div className="online-segments" role="group" aria-label="いつの年齢で並べるか">
        <button aria-pressed={!later} onClick={() => setLater(false)}>
          いま
        </button>
        <button aria-pressed={later} onClick={() => setLater(true)}>
          {years}年後
        </button>
      </div>
      <table className="online-age-grid">
        <thead>
          <tr>
            <th>年齢</th>
            {AGE_GRID_GROUPS.map((g, i) => (
              <th key={g}>
                {g}
                <small>{counts[i]}人</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th>{row.label}</th>
              {row.cells.map((people, g) => (
                <td key={g}>
                  {people.map((p) => (
                    <span
                      key={p.id}
                      className={`online-age-person${p.core ? ' is-core' : ''}${p.warn ? ' is-warn' : ''}`}
                      title={`${p.name}（${POS[p.position] || '—'}） いま${p.age}歳 → ${years}年後${p.later}歳${p.core ? '・主力' : ''}`}
                    >
                      {p.name}
                      {g >= 2 && <small>{POS[p.position] || ''}</small>}
                      {row.label.endsWith('以上') && <small>{later ? p.later : p.age}</small>}
                    </span>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="online-muted">太字は主力、赤は{years}年後に下り坂か引退が近い年齢になる主力です。</p>
    </div>
  );
}

export default function AgeOutlook({ outlook, compact = false }) {
  if (!outlook) return null;
  const most = Math.max(1, ...outlook.bands.map((b) => b.pitchers + b.fielders));
  return (
    <section className="online-card online-age-outlook" aria-label="年齢構成と3年後の見込み">
      <h2>年齢構成と{outlook.years}年後の見込み</h2>
      {/* 年齢 × 守備位置の図。古いサーバー（`grid` が無い）なら前の帯グラフ */}
      {outlook.grid ? (
        <AgeGrid grid={outlook.grid} years={outlook.years} />
      ) : (
        <div className="online-age-bands">
          {outlook.bands.map((b) => (
            <div key={b.label} className="online-age-band">
              <span>{b.label}</span>
              <div className="online-age-bar" aria-hidden="true">
                <i className="is-fielder" style={{ width: `${(b.fielders / most) * 100}%` }} />
                <i className="is-pitcher" style={{ width: `${(b.pitchers / most) * 100}%` }} />
              </div>
              <small>
                野手{b.fielders}・投手{b.pitchers}
              </small>
            </div>
          ))}
        </div>
      )}
      <div className="online-news-list">
        {outlook.lines.map((t, i) => (
          <article key={i}>
            <span>{t}</span>
          </article>
        ))}
        <article>
          <b>{outlook.advice}</b>
        </article>
      </div>
      {!compact && (
        <table className="online-standings online-age-core">
          <thead>
            <tr>
              <th>主力</th>
              <th>位置</th>
              <th>いま</th>
              <th>{outlook.years}年後</th>
              <th>見込み</th>
            </tr>
          </thead>
          <tbody>
            {outlook.core.map((r) => (
              <tr key={r.id} className={r.kind === 'decline' || r.veteran ? 'is-warn' : ''}>
                <th>{r.name}</th>
                <td>
                  <PosChip position={r.position} label={POS[r.position] || '—'} />
                </td>
                <td>{r.age}歳</td>
                <td>{r.later}歳</td>
                <td>
                  <ToneChip tone={KIND_TONE[r.kind]}>{KIND_LABEL[r.kind]}</ToneChip>
                  {r.veteran ? '・引退が近い年齢' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="online-muted">
        見込みは成長力とプロ意識から決まるピーク年齢で見ています（乱数なし）。練習や出場で前後します。
      </p>
    </section>
  );
}
