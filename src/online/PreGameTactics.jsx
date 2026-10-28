import React from 'react';
import {
  STARTER_ROLES,
  RELIEF_ROLES,
  TACTIC_FIELDS,
  TACTIC_DEFAULTS,
  roleFor,
} from './tactics.js';
import { PlayerStatsButton } from './PlayerPerformance.jsx';
export function PitcherRoles({ view, plan, change }) {
  return (
    <section className="online-pregame-settings">
      <p>
        通常ゲームと同じ起用法です。役割に応じた球数・登板場面で自動継投します。
      </p>
      <div className="online-pitcher-role-grid">
        {view.roster
          .filter((p) => p.position === 'pitcher' && p.isActive !== false)
          .map((p) => {
            const starter = plan.starters.includes(p.id),
              roles = starter ? STARTER_ROLES : RELIEF_ROLES;
            return (
              <label key={p.id}>
                <span>
                  <PlayerStatsButton player={p} panel="abilities" />{' '}
                  <small>{starter ? '先発' : '救援'}</small>
                </span>
                <select
                  aria-label={`${p.name}の投手役割`}
                  value={roleFor(plan.pitcherRoles?.[p.id], starter)}
                  onChange={(e) =>
                    change({
                      ...plan,
                      pitcherRoles: {
                        ...(plan.pitcherRoles || {}),
                        [p.id]: e.target.value,
                      },
                    })
                  }
                >
                  {Object.entries(roles).map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
      </div>
    </section>
  );
}
export function AutoTactics({ plan, change }) {
  return (
    <section className="online-pregame-settings">
      <p>
        AIが状況を判断する範囲を指定します。球数上限は役割の上限より低い場合に適用し、疲労限界による交代は維持します。
      </p>
      <div className="online-tactics-grid">
        {Object.entries(TACTIC_FIELDS).map(([key, [label, options]]) => (
          <label key={key}>
            {label}
            <select
              aria-label={label}
              value={plan.tactics?.[key] ?? TACTIC_DEFAULTS[key]}
              onChange={(e) =>
                change({
                  ...plan,
                  tactics: {
                    ...(plan.tactics || {}),
                    [key]:
                      typeof TACTIC_DEFAULTS[key] === 'number'
                        ? Number(e.target.value)
                        : e.target.value,
                  },
                })
              }
            >
              {Object.entries(options).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}
