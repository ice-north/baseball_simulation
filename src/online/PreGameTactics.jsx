import React from 'react';
import { TACTIC_FIELDS, TACTIC_DEFAULTS } from './tactics.js';
export function AutoTactics({ plan, change }) {
  return (
    <section className="online-pregame-settings">
      <p>
        AIが状況を判断する範囲を指定します。球数上限は役割の上限より低い場合に打席の区切りで判断し、疲労限界による交代は維持します。
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
