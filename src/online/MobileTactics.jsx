import React, { useState } from 'react';
import MobilePanel from './MobilePanel.jsx';
import { PageNav } from './PageNav.jsx';
import { PlayerStatsButton, ConditionMark } from './PlayerPerformance.jsx';
import {
  STARTER_ROLES,
  RELIEF_ROLES,
  TACTIC_FIELDS,
  TACTIC_DEFAULTS,
  roleFor,
} from './tactics.js';
const STRATEGY = {
  batting: [
    '打撃方針',
    { balanced: 'バランス', patient: '慎重', aggressive: '積極' },
  ],
  pitching: [
    '投球方針',
    { balanced: 'バランス', strikeout: '三振狙い', contact: '打たせて取る' },
  ],
  baseRunning: [
    '走塁方針',
    {
      normal: '標準',
      aggressive: '積極',
      conservative: '慎重',
      never: '盗塁しない',
    },
  ],
  defense: [
    '守備方針',
    { normal: '標準', infield_in: '前進守備', shift: '守備シフト' },
  ],
};
const GROUPS = {
  basic: '基本方針',
  bunt: 'バント',
  subs: '代打・守備固め',
  pitcher: '先発の交代',
  roles: '投手の役割（確認）',
};
const FIELDS = {
  bunt: ['sacrificeBunt', 'squeeze', 'safetyBunt'],
  subs: ['pinchHit', 'pinchHitFrom', 'defensiveSub', 'defenseFrom'],
  pitcher: ['hook', 'starterLimit'],
};
export default function MobileTactics({
  view,
  plan,
  change,
  busy,
  dirty,
  save,
  error,
  close,
}) {
  const [group, setGroup] = useState('basic'),
    [page, setPage] = useState(0);
  const pitchers = view.roster
    .filter((p) => p.position === 'pitcher' && p.isActive !== false)
    .sort((a, b) => {
      const x = plan.starters.indexOf(a.id),
        y = plan.starters.indexOf(b.id);
      return (x < 0 ? 99 : x) - (y < 0 ? 99 : y);
    });
  return (
    <MobilePanel
      title="事前采配"
      close={close}
      footer={
        <>
          <small role="status">
            {!view.writable
              ? '閲覧のみ。操作するにはこの端末でログインし直してください'
              : dirty
                ? '打順・采配に未保存の変更があります'
                : '保存済みの設定'}
          </small>
          <div>
            <button onClick={close}>打順に戻る</button>
            <button
              className="online-primary"
              disabled={busy || !dirty}
              onClick={save}
            >
              編成を保存
            </button>
          </div>
        </>
      }
    >
      <select
        aria-label="見る設定"
        value={group}
        onChange={(e) => {
          setGroup(e.target.value);
          setPage(0);
        }}
      >
        {Object.entries(GROUPS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="online-alert">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="online-mobile-tactic-fields">
        {group === 'basic' &&
          Object.entries(STRATEGY).map(([key, [label, options]]) => (
            <label key={key}>
              {label}
              <select
                aria-label={label}
                value={plan.strategy?.[key] ?? Object.keys(options)[0]}
                onChange={(e) =>
                  change({
                    ...plan,
                    strategy: {
                      ...(plan.strategy || {}),
                      [key]: e.target.value,
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
        {(FIELDS[group] || []).map((key) => {
          const [label, options] = TACTIC_FIELDS[key];
          return (
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
          );
        })}
      </fieldset>
      {group === 'roles' ? (
        <>
          <p className="online-mobile-tactic-note">
            役割やローテーションの変更はPCから
          </p>
          <div className="online-mobile-role-list">
            {pitchers.slice(page * 4, page * 4 + 4).map((p) => {
              const order = plan.starters.indexOf(p.id),
                role = roleFor(plan.pitcherRoles?.[p.id], order >= 0);
              return (
                <article key={p.id}>
                  <div>
                    <PlayerStatsButton player={p} panel="abilities" />
                    <ConditionMark player={p} />
                  </div>
                  <small>
                    {order >= 0 ? `先発${order + 1}番手` : '救援'} ·{' '}
                    {STARTER_ROLES[role] || RELIEF_ROLES[role]} · 疲労
                    {p.fatigue ?? '—'}
                  </small>
                </article>
              );
            })}
          </div>
          <PageNav
            page={page}
            size={4}
            count={pitchers.length}
            setPage={setPage}
          />
        </>
      ) : (
        <p className="online-mobile-tactic-note">
          次の試合から反映。状況判断はAIが行います。
        </p>
      )}
    </MobilePanel>
  );
}
