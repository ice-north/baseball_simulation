import React from 'react';
import { AbilityGrade } from './PlayerPerformance.jsx';
import { formatStat } from './statsView.js';
import { teamShort, teamLabel } from './gameText.js';
import { playerYearTable } from './playerYears.js';

// ============================================================
// 選手の詳細の「年ごとの推移」（年・年齢・所属・成績・能力を1年1行）。中身は `playerYears.js`。
// ⚠ 能力の差（前の年から）は上がりを緑・下がりを赤で小さく添える（数字そのものは格の色）。
// ============================================================

export default function PlayerYears({ player, years, periods, currentYear }) {
  const table = playerYearTable(player, years, periods, currentYear);
  if (!table.rows.length) return <p className="online-muted">年ごとの記録はまだありません。</p>;
  return (
    <div className="online-years-scroll">
      <table className="online-years-table">
        <thead>
          <tr>
            <th scope="col">年</th>
            <th scope="col">齢</th>
            <th scope="col">所属</th>
            {table.stats.map((s) => (
              <th key={s.key} scope="col" className="online-years-stat">
                {s.label}
              </th>
            ))}
            {table.abilities.map(([key, label]) => (
              <th key={key} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.year}>
              <th scope="row">{row.year}年目</th>
              <td>{row.age ?? '—'}</td>
              <td title={(row.teams || []).map(teamLabel).join('→')}>
                {row.teams?.length ? row.teams.map(teamShort).join('→') : '—'}
              </td>
              {table.stats.map((s) => (
                <td key={s.key} className="online-years-stat">
                  {formatStat(s.column, row.stats[s.key])}
                </td>
              ))}
              {table.abilities.map(([key]) => {
                const cell = row.abilities[key];
                return (
                  <td key={key}>
                    {cell.value === null ? (
                      '—'
                    ) : (
                      <>
                        <AbilityGrade value={cell.value} velocity={key === 'velocity'} stamina={key === 'stamina'} />
                        {cell.diff ? (
                          <small className={cell.diff > 0 ? 'is-up' : 'is-down'}>
                            {cell.diff > 0 ? `+${cell.diff}` : cell.diff}
                          </small>
                        ) : null}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
