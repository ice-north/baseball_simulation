import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { POS } from './api.js';
import { formatGameDate } from './shared.js';
import { PageNav } from './PageNav.jsx';
import PlayerAbilities from './PlayerAbilities.jsx';
import { getAbilityRank, getRankColor } from '../utils/constants.js';
import {
  STAT_GROUPS,
  statGroup,
  formatStat,
  sortedRoster,
  CONDITION_TEXT,
  conditionValue,
  statRank,
} from './statsView.js';

export function AbilityGrade({ value, velocity = false, stamina = false }) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    return <span>—</span>;
  const rank = getAbilityRank(value, velocity, stamina);
  return (
    <span className={`online-ability-grade ${getRankColor(rank)}`}>{rank}</span>
  );
}

export function TeamBrief({ view }) {
  const next = view.upcoming.find(
    (game) => game.home === view.teamName || game.away === view.teamName,
  );
  const starter = view.roster.find(
    (player) => player.id === view.nextStarterId,
  );
  return (
    <section className="online-team-brief" aria-label="次の行動の確認">
      {view.phase ? (
        <p>
          {view.phase.label} ·{' '}
          {view.members
            .map(
              (member) =>
                `${member.label} ${member.ready ? '決定済み' : '検討中'}`,
            )
            .join('／')}
        </p>
      ) : (
        <>
          <p>
            次の試合：
            {next
              ? `${formatGameDate(next.date)} 対 ${next.home === view.teamName ? next.away : next.home}`
              : '予定なし'}
          </p>
          {starter && (
            <p>
              先発枠：
              <PlayerStatsButton player={starter} panel="abilities" />{' '}
              <ConditionMark player={starter} /> 疲労{starter.fatigue ?? '—'}
            </p>
          )}
        </>
      )}
    </section>
  );
}

const SHORT_LABELS = {
  average: 'アベヒ',
  power: 'パワヒ',
  'extra-base': '長打',
  eye: '選球眼',
  'on-base': '出塁',
  whiff: '扇風機',
  strikeout: '三振',
  'steal-good': '盗塁B',
  'steal-bad': '盗塁F',
  'pitch-k': '奪三振',
  'pitch-bb': '四球',
  control: '制球○',
  'pitch-hr': '一発',
};

export function StatLabels({
  player,
  category = 'batting',
  limit = 3,
  compact = false,
}) {
  const labels = player?.performance?.[category]?.labels || [];
  return labels.length ? (
    <span className="online-stat-labels" aria-label="成績の特徴">
      {labels.slice(0, Math.min(limit, 3)).map((label) => (
        <span
          key={label.id}
          className={`online-stat-label online-stat-${label.tone === 'bad' ? 'bad' : 'good'}`}
          aria-label={label.text}
          title={label.text}
        >
          {compact ? SHORT_LABELS[label.id] || label.text : label.text}
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
export function ConditionMark({ player }) {
  const level = conditionValue(player);
  return (
    <span
      className={`online-condition online-condition-${level ?? 'unknown'}`}
      title={`調子: ${CONDITION_TEXT[level] || '未記録'}`}
      aria-label={`調子: ${CONDITION_TEXT[level] || '未記録'}`}
    >
      {level === null ? '—' : ['↓', '↘', '→', '↗', '↑'][level]}
    </span>
  );
}
function GroupSelect({ category, value, onChange }) {
  return (
    <select
      className="online-stat-group"
      aria-label="成績の表示項目"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {STAT_GROUPS[category].map((group) => (
        <option key={group.id} value={group.id}>
          {group.label}
        </option>
      ))}
    </select>
  );
}
function Approximation({ columns }) {
  return columns.some((column) => column.approximate) ? (
    <small className="online-stat-note">※ 出塁率・OPS・打席関連は概算</small>
  ) : null;
}
function Detail({ player, initialCategory, initialGroup, initialPane, close }) {
  const dialog = useRef(null);
  const [category, setCategory] = useState(initialCategory);
  const [groupId, setGroupId] = useState(initialGroup);
  const [pane, setPane] = useState(initialPane);
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
  const group = statGroup(category, groupId);
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
          <small>
            今季 · {POS[player.position]} · <ConditionMark player={player} />
            {CONDITION_TEXT[conditionValue(player)] || '調子未記録'} · 疲労
            {player.fatigue ?? '—'}
          </small>
        </div>
        <button onClick={dismiss} aria-label="選手成績を閉じる">
          閉じる
        </button>
      </header>
      <nav className="online-player-tabs" aria-label="選手情報の種類">
        <button
          aria-pressed={pane === 'stats'}
          onClick={() => setPane('stats')}
        >
          成績
        </button>
        <button
          aria-pressed={pane === 'abilities'}
          onClick={() => setPane('abilities')}
        >
          能力・人物
        </button>
      </nav>
      {pane === 'stats' ? (
        <>
          <div className="online-stat-tools">
            <Category
              value={category}
              setValue={(next) => {
                setCategory(next);
                setGroupId('basic');
              }}
            />
            <GroupSelect
              category={category}
              value={group.id}
              onChange={setGroupId}
            />
          </div>
          <StatLabels player={player} category={category} />
          <dl className="online-stat-grid">
            {group.columns.map((column) => (
              <div key={column.id}>
                <dt>
                  {column.label}
                  {column.approximate ? '※' : ''}
                </dt>
                <dd>{formatStat(column, column.get(player), true)}</dd>
              </div>
            ))}
          </dl>
          <Approximation columns={group.columns} />
        </>
      ) : (
        <PlayerAbilities player={player} />
      )}
    </dialog>
  );
}
export function PlayerStatsButton({
  player,
  category = 'batting',
  group = 'basic',
  panel = 'stats',
  children,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  if (!player) return null;
  return (
    <>
      <button
        className={`online-player-name ${className}`}
        onClick={() => setOpen(true)}
        aria-label={`${player.name}の選手情報を見る`}
      >
        {children || player.name}
      </button>
      {open && (
        <Detail
          player={player}
          initialCategory={category}
          initialGroup={group}
          initialPane={panel}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}
export function CompactRoster({ view, desktop = false }) {
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState('batting');
  const [groupId, setGroupId] = useState('basic');
  const [sort, setSort] = useState(null);
  const group = statGroup(category, groupId);
  const order = sortedRoster(view.roster, sort?.column, sort?.direction);
  const chooseCategory = (next) => {
    setCategory(next);
    setGroupId('basic');
    setSort(null);
    setPage(0);
  };
  const chooseGroup = (next) => {
    setGroupId(next);
    setSort(null);
    setPage(0);
  };
  const sortBy = (column) => {
    setSort((old) => ({
      column,
      direction:
        old?.column === column
          ? old.direction === 'asc'
            ? 'desc'
            : 'asc'
          : column === 'name'
            ? 'asc'
            : column.direction,
    }));
    setPage(0);
  };
  const sortButton = (column, label) => (
    <button
      aria-label={`${label}で並べ替え`}
      aria-pressed={sort?.column === column}
      title={label}
      onClick={() => sortBy(column)}
    >
      <span>
        {label === '被本塁打'
          ? '被本'
          : label === '本塁打率'
            ? '本塁率'
            : label}
      </span>
      {sort?.column === column && (
        <span className="online-sort-direction" aria-hidden="true">
          {sort.direction === 'asc' ? '▲' : '▼'}
        </span>
      )}
    </button>
  );
  const [size, setSize] = useState(8);
  const rows = useRef(null);
  const previousSize = useRef(8);
  useLayoutEffect(() => {
    if (desktop) {
      setSize(10);
      return;
    }
    const measure = () => {
      if (!rows.current) return;
      const next = Math.max(1, Math.floor(rows.current.clientHeight / 44));
      const old = previousSize.current;
      if (next === old) return;
      previousSize.current = next;
      setPage((p) => Math.floor((p * old) / next));
      setSize(next);
    };
    measure();
    const observer = new window.ResizeObserver(measure);
    observer.observe(rows.current);
    return () => observer.disconnect();
  }, [desktop]);
  return (
    <section
      className={`${desktop ? '' : 'online-card '}online-compact-roster`}
    >
      <div className="online-roster-toolbar">
        <div>
          <h2>選手成績</h2>
          <small>今季 · {view.roster.length}人</small>
        </div>
        <GroupSelect
          category={category}
          value={group.id}
          onChange={chooseGroup}
        />
        <Category value={category} setValue={chooseCategory} />
      </div>
      <div className="online-roster-columns">
        {sortButton('name', '選手名')}
        <div className="online-roster-values">
          {group.columns.map((column) => (
            <React.Fragment key={column.id}>
              {sortButton(column, column.label)}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="online-roster-rows" ref={rows}>
        {order.slice(page * size, page * size + size).map((player) => (
          <article key={player.id}>
            <PlayerStatsButton
              player={player}
              category={category}
              group={group.id}
              className="online-roster-row"
            >
              <span className="online-roster-person">
                <span className="online-roster-name">
                  <span className="online-roster-player-name">
                    {player.name}
                  </span>
                  <ConditionMark player={player} />
                  <small>{POS[player.position]}</small>
                </span>
                <StatLabels
                  player={player}
                  category={category}
                  compact={!desktop}
                />
              </span>
              <span className="online-roster-values">
                {group.columns.map((column) => {
                  const value = column.get(player);
                  const text = formatStat(column, value);
                  const rank = statRank(column, value);
                  return (
                    <span
                      key={column.id}
                      className={`online-stat-${column.format} ${rank ? `online-ability-grade ${getRankColor(rank)}` : ''}`}
                      style={
                        !desktop && text.length > 5
                          ? { fontSize: `${60 / text.length}px` }
                          : undefined
                      }
                      title={`${column.label}: ${text}`}
                    >
                      {text}
                    </span>
                  );
                })}
              </span>
            </PlayerStatsButton>
          </article>
        ))}
      </div>
      <Approximation columns={group.columns} />
      <PageNav
        page={page}
        count={view.roster.length}
        size={size}
        setPage={setPage}
      />
    </section>
  );
}
