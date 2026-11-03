import React, { useMemo, useState } from 'react';
import { AbilityGrade, PlayerStatsButton } from './PlayerPerformance.jsx';
import { POS } from './api.js';
import { teamLabel } from './gameText.js';

// ============================================================
// 能力ランキング（自球団の中で、項目ごとに上位を並べる）。
//
// ⚠ **自球団だけ**。他球団の能力は投影に載っていない（相手の手の内が全部
//    見えると対戦にならない）。成績は「選手成績」から他球団も見られる。
// ⚠ 球速とスタミナは0〜100ではない。段位は `AbilityGrade` が揃えて出す。
// ============================================================

const FIELDS = [
  { id: 'meet', label: 'ミート', of: (p) => p.batting?.meet, side: 'batting' },
  { id: 'power', label: 'パワー', of: (p) => p.batting?.power, side: 'batting' },
  { id: 'speed', label: '走力', of: (p) => p.physical?.speed, side: 'batting' },
  { id: 'defense', label: '守備', of: (p) => p.fielding?.defense, side: 'batting' },
  { id: 'arm', label: '肩', of: (p) => p.physical?.arm, side: 'batting' },
  {
    id: 'velocity', label: '球速', of: (p) => p.pitching?.velocity,
    side: 'pitching', velocity: true,
  },
  { id: 'control', label: '制球', of: (p) => p.pitching?.control, side: 'pitching' },
  {
    id: 'stamina', label: 'スタミナ', of: (p) => p.pitching?.stamina,
    side: 'pitching', stamina: true,
  },
];

export default function AbilityRanking({ view }) {
  const [side, setSide] = useState('batting');
  const roster = view.roster || [];
  const shown = useMemo(
    () => FIELDS.filter((f) => f.side === side),
    [side],
  );
  const pool = useMemo(
    () =>
      roster.filter((p) =>
        side === 'pitching' ? p.position === 'pitcher' : p.position !== 'pitcher',
      ),
    [roster, side],
  );
  return (
    <section className="online-card">
      <h2>能力ランキング · {teamLabel(view.teamName)}</h2>
      <p className="online-muted">
        自球団の中での並びです。他球団の能力は見られません（成績は「選手成績」から見られます）。
      </p>
      <div className="online-segments" aria-label="区分">
        {[
          ['batting', '野手'],
          ['pitching', '投手'],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={side === id} onClick={() => setSide(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="online-leaders">
        {shown.map((field) => {
          const rows = pool
            .map((p) => ({ player: p, value: field.of(p) }))
            .filter((r) => typeof r.value === 'number')
            // ⚠ 同値は名前で分ける。見るたび順番が変わらないように
            .sort(
              (a, b) =>
                b.value - a.value || a.player.name.localeCompare(b.player.name, 'ja'),
            )
            .slice(0, 5);
          return (
            <div key={field.id}>
              <h3>{field.label}</h3>
              <ol>
                {rows.map((row, i) => (
                  <li key={row.player.id}>
                    <span className="online-leader-rank">{i + 1}</span>
                    <span className="online-leader-name">
                      <PlayerStatsButton player={row.player} panel="abilities" />
                      <small>{POS[row.player.position]}</small>
                    </span>
                    <span className="online-leader-value">
                      <AbilityGrade
                        value={row.value}
                        velocity={field.velocity}
                        stamina={field.stamina}
                      />
                    </span>
                  </li>
                ))}
                {!rows.length && <li className="online-muted">該当なし</li>}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}
