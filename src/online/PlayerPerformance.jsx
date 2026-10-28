import React, { useEffect, useRef, useState } from 'react';
import { POS } from './api.js';
import { PageNav } from './PageNav.jsx';

export function StatLabels({ player, category = 'batting', limit = 3 }) {
  const labels = player?.performance?.[category]?.labels || [];
  return labels.length ? (
    <span className="online-stat-labels" aria-label="成績の特徴">
      {labels.slice(0, Math.min(limit, 3)).map((label) => (
        <span
          key={label.id}
          className={`online-stat-label online-stat-${label.tone === 'bad' ? 'bad' : 'good'}`}
        >
          {label.text}
        </span>
      ))}
    </span>
  ) : null;
}
function Category({ value, setValue }) {
  return (
    <div className="online-segments" aria-label="成績区分">
      {['batting', 'pitching'].map((id) => (
        <button
          key={id}
          aria-pressed={value === id}
          onClick={() => setValue(id)}
        >
          {id === 'batting' ? '打撃' : '投球'}
        </button>
      ))}
    </div>
  );
}
const number = (n, digits = 0) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits) : '—';
const average = (n) => number(n, 3).replace(/^0\./, '.');
const innings = (n) =>
  typeof n === 'number' && Number.isFinite(n)
    ? `${Math.floor(n / 3)}.${n % 3}`
    : '—';

function Detail({ player, initialCategory, close }) {
  const dialog = useRef(null);
  const [category, setCategory] = useState(initialCategory);
  useEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement;
    node.showModal();
    return () => {
      if (node.open) node.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  const dismiss = () => {
    dialog.current.close();
    close();
  };
  const m = player.performance?.[category]?.metrics;
  const metrics =
    category === 'batting'
      ? [
          ['打率', average(m?.avg)],
          ['本塁打', number(m?.homeruns)],
          ['盗塁', number(m?.stolenBases)],
          ['出塁率（概算）', average(m?.obp)],
          ['ISO', average(m?.iso)],
          ['打席（概算）', number(m?.pa)],
        ]
      : [
          ['投球回', innings(m?.outs)],
          ['防御率', number(m?.era, 2)],
          ['奪三振/9回', number(m?.k9, 2)],
          ['四球/9回', number(m?.bb9, 2)],
          ['被本塁打/9回', number(m?.hr9, 2)],
        ];
  return (
    <dialog
      ref={dialog}
      className="online-player-dialog"
      aria-labelledby="online-player-title"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) dismiss();
      }}
    >
      <header>
        <div>
          <h2 id="online-player-title">{player.name}</h2>
          <small>{POS[player.position]} · 今季成績</small>
        </div>
        <button onClick={dismiss} aria-label="選手成績を閉じる">
          閉じる
        </button>
      </header>
      <Category value={category} setValue={setCategory} />
      <StatLabels player={player} category={category} />
      <dl className="online-stat-grid">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {!m && <p className="online-muted">成績はまだありません。</p>}
    </dialog>
  );
}
export function PlayerStatsButton({ player, category = 'batting' }) {
  const [open, setOpen] = useState(false);
  if (!player) return null;
  return (
    <>
      <button
        className="online-player-name"
        onClick={() => setOpen(true)}
        aria-label={`${player.name}の成績を見る`}
      >
        {player.name}
      </button>
      {open && (
        <Detail
          player={player}
          initialCategory={category}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}
export function CompactRoster({ view }) {
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState('batting');
  return (
    <section className="online-card online-compact-roster">
      <h2>選手成績</h2>
      <Category value={category} setValue={setCategory} />
      {view.roster.slice(page * 3, page * 3 + 3).map((player) => (
        <article key={player.id}>
          <PlayerStatsButton player={player} category={category} />
          <small>{POS[player.position]}</small>
          <StatLabels player={player} category={category} limit={1} />
        </article>
      ))}
      <PageNav
        page={page}
        count={view.roster.length}
        size={3}
        setPage={setPage}
      />
    </section>
  );
}
