import React, { useState } from 'react';
import {
  Standings,
  Results,
  Notices,
  PhasePanel,
  LineupPanel,
  PageNav,
} from './LeaguePanels.jsx';
import { POS } from './api.js';
import { PlayerStatsButton, StatLabels } from './PlayerPerformance.jsx';
export default function DesktopView(props) {
  const { view } = props;
  const [tab, setTab] = useState('today');
  const tabs = [
    ['today', '今日'],
    ['games', '試合'],
    ['players', '選手'],
    ['lineup', '編成'],
    ['decisions', '手続き'],
    ...(view.isAdmin ? [['admin', '管理']] : []),
  ];
  return (
    <>
      <nav className="online-page-nav" aria-label="オンラインの画面">
        <div className="online-nav-context">
          <strong>{view.teamName}</strong>
          <small>独立リーグ · {view.year}年目</small>
        </div>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            aria-label={label}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            {label}
            {id === 'decisions' && view.phase && (
              <span className="online-dot" aria-label="未完了の手続き" />
            )}
          </button>
        ))}
      </nav>
      {tab === 'today' && (
        <div className="online-dashboard">
          <Standings view={view} />
          <section className="online-card">
            <h2>今日の球団</h2>
            <p>
              {view.teamName} · 所属{view.roster.length}人
            </p>
            {view.phase ? (
              <>
                <p>{view.phase.label}の決定を待っています。</p>
                <button
                  className="online-primary"
                  onClick={() => setTab('decisions')}
                >
                  手続きの内容を確認
                </button>
              </>
            ) : (
              <>
                <p>次の進行までに編成を見直せます。</p>
                <button onClick={() => setTab('lineup')}>編成を確認</button>
              </>
            )}
            <p className="online-muted online-spaced">
              試合結果・選手一覧・管理操作は、それぞれの画面から確認できます。
            </p>
          </section>
        </div>
      )}
      {tab === 'games' && (
        <div className="online-dashboard">
          <Results view={view} />
          <Notices view={view} />
        </div>
      )}
      {tab === 'players' && <Roster view={view} />}
      {tab === 'lineup' &&
        (view.phase ? (
          <section className="online-card">
            <h2>編成</h2>
            <p>{view.phase.label}の決定待ちです。キャンプ後に設定できます。</p>
            <button onClick={() => setTab('decisions')}>手続きへ</button>
          </section>
        ) : (
          <div className="online-form-width">
            <LineupPanel key={`${view.year}:${view.teamName}`} {...props} />
          </div>
        ))}
      {tab === 'decisions' &&
        (view.phase ? (
          <div className="online-form-width">
            <PhasePanel key={view.phase.id} {...props} />
          </div>
        ) : (
          <section className="online-card">
            <h2>手続き</h2>
            <p>現在、決定待ちの手続きはありません。</p>
          </section>
        ))}
      {tab === 'admin' && (
        <div className="online-form-width">
          <Admin {...props} />
        </div>
      )}
    </>
  );
}
function Roster({ view }) {
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState('batting');
  return (
    <section className="online-card">
      <h2>所属選手 · {view.roster.length}人</h2>
      <div className="online-segments" aria-label="成績区分">
        {['batting', 'pitching'].map((id) => (
          <button
            key={id}
            aria-pressed={category === id}
            onClick={() => setCategory(id)}
          >
            {id === 'batting' ? '打撃' : '投球'}
          </button>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th>選手</th>
            <th>年齢</th>
            <th>位置</th>
            <th>ミート</th>
            <th>パワー</th>
            <th>球速</th>
            <th>制球</th>
            <th>疲労</th>
          </tr>
        </thead>
        <tbody>
          {view.roster.slice(page * 10, page * 10 + 10).map((p) => (
            <tr key={p.id}>
              <th>
                <PlayerStatsButton player={p} category={category} />
                <StatLabels player={p} category={category} />
              </th>
              <td>{p.age}</td>
              <td>{POS[p.position]}</td>
              <td>{p.batting?.meet ?? '–'}</td>
              <td>{p.batting?.power ?? '–'}</td>
              <td>{p.pitching?.velocity ?? '–'}</td>
              <td>{p.pitching?.control ?? '–'}</td>
              <td>{p.fatigue}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <PageNav
        page={page}
        count={view.roster.length}
        size={10}
        setPage={setPage}
      />
    </section>
  );
}
function Admin({ view, busy, run, command, local }) {
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  return (
    <section className="online-card">
      <h2>リーグ管理</h2>
      <div className="online-actions">
        {view.status === 'running' && (
          <button disabled={busy} onClick={() => run(() => command('pause'))}>
            進行を停止
          </button>
        )}
        {['paused', 'error'].includes(view.status) && (
          <button disabled={busy} onClick={() => run(() => command('resume'))}>
            次の時刻から再開
          </button>
        )}
        {view.status !== 'running' && (
          <button disabled={busy} onClick={() => run(() => command('backup'))}>
            現在の状態をバックアップ
          </button>
        )}
        {view.hasBackup && ['paused', 'error'].includes(view.status) && (
          <button disabled={busy} onClick={() => setRestoreConfirm(true)}>
            バックアップから復元
          </button>
        )}
        {local && view.status === 'running' && (
          <button disabled={busy} onClick={() => run(() => command('step'))}>
            検証用：1日進める
          </button>
        )}
      </div>
      {restoreConfirm && (
        <div role="alert">
          <p>
            現在の進行を保存済みのバックアップへ戻します。復元後は停止したままです。
          </p>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await command('restore');
                setRestoreConfirm(false);
              })
            }
          >
            復元を実行
          </button>
          <button disabled={busy} onClick={() => setRestoreConfirm(false)}>
            キャンセル
          </button>
        </div>
      )}
    </section>
  );
}
