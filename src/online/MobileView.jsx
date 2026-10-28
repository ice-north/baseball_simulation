import React, { useEffect, useRef, useState } from 'react';
import {
  Standings,
  Results,
  Notices,
  PhasePanel,
  LineupPanel,
} from './LeaguePanels.jsx';
import { CompactRoster, TeamBrief } from './PlayerPerformance.jsx';
import { formatGameDate } from './shared.js';
import { dateTime, STATUS } from './api.js';
export default function MobileView(props) {
  const { view, local, loading, reloadView, logout, showTimes, tab, setTab } =
    props;
  const [playersFrom, setPlayersFrom] = useState('today');
  const [menuOpen, setMenuOpen] = useState(false);
  const tabs = [
    ['today', '今日'],
    ['games', '試合'],
    ['lineup', '打順'],
    ['decisions', '手続き'],
  ];
  return (
    <>
      {tab === 'today' && (
        <>
          <section className="online-mobile-overview">
            <strong>{view.teamName}</strong>
            <span>
              {formatGameDate(view.currentDate)} · {STATUS[view.status]}
            </span>
            <small>次の進行 {dateTime(view.nextAdvanceAt)}</small>
          </section>
          <TeamBrief view={view} />
          <nav className="online-home-actions" aria-label="オンラインの画面">
            {tabs
              .filter(([id]) => id !== 'today')
              .map(([id, label]) => (
                <button key={id} aria-label={label} onClick={() => setTab(id)}>
                  {label}
                  {id === 'decisions' && view.phase && (
                    <span className="online-dot" aria-label="未完了の手続き" />
                  )}
                </button>
              ))}
            <button
              onClick={() => {
                setPlayersFrom('today');
                setTab('players');
              }}
            >
              選手成績
            </button>
          </nav>
          <Standings view={view} />
          <button className="online-news-link" onClick={() => setTab('news')}>
            リーグ便り・過去のシーズン →
          </button>
        </>
      )}
      {tab === 'games' && <Results view={view} compact />}
      {tab === 'players' && <CompactRoster view={view} />}
      {tab === 'news' && (
        <>
          <Notices view={view} compact />
        </>
      )}
      {(tab === 'lineup' || tab === 'players') && (
        <div hidden={tab === 'players'}>
          {view.phase ? (
            <section className="online-card">
              <h2>打順</h2>
              <p>
                {view.phase.label}の決定待ちです。キャンプ後に設定できます。
              </p>
              <button onClick={() => setTab('decisions')}>手続きへ</button>
              <button
                onClick={() => {
                  setPlayersFrom('lineup');
                  setTab('players');
                }}
              >
                選手成績
              </button>
            </section>
          ) : (
            <LineupPanel
              key={`${view.year}:${view.teamName}`}
              {...props}
              mobile
              onShowRoster={() => {
                setPlayersFrom('lineup');
                setTab('players');
              }}
              hidden={tab === 'players'}
            />
          )}
        </div>
      )}
      {tab === 'decisions' &&
        (view.phase ? (
          <PhasePanel key={view.phase.id} {...props} mobile />
        ) : (
          <section className="online-card">
            <h2>手続き</h2>
            <p>現在、決定待ちの手続きはありません。</p>
          </section>
        ))}
      <nav className="online-mobile-controls" aria-label="画面操作">
        <button
          aria-label="戻る"
          disabled={tab === 'today'}
          onClick={() => setTab(tab === 'players' ? playersFrom : 'today')}
        >
          ←
        </button>
        <button aria-label="ホーム" onClick={() => setTab('today')}>
          ⌂
        </button>
        <button aria-label="メニュー" onClick={() => setMenuOpen(true)}>
          ☰
        </button>
      </nav>
      {menuOpen && (
        <MobileMenu
          loading={loading}
          local={local}
          close={() => setMenuOpen(false)}
          reloadView={reloadView}
          showTimes={showTimes}
          logout={logout}
        />
      )}
    </>
  );
}

function MobileMenu({ close, loading, local, reloadView, showTimes, logout }) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement;
    node.showModal();
    return () => {
      if (node.open) node.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  const act = (action) => {
    dialog.current.close();
    close();
    action?.();
  };
  return (
    <dialog
      ref={dialog}
      className="online-mobile-menu-panel"
      aria-labelledby="online-menu-title"
      onCancel={(e) => {
        e.preventDefault();
        act();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) act();
      }}
    >
      <header>
        <h2 id="online-menu-title">メニュー</h2>
        <button onClick={() => act()} aria-label="メニューを閉じる">
          閉じる
        </button>
      </header>
      <div>
        <button disabled={loading} onClick={() => act(reloadView)}>
          更新
        </button>
        <button onClick={() => act(showTimes)}>進行時刻</button>
        <a href="/">一人用</a>
        <button disabled={loading} onClick={() => act(logout)}>
          ログアウト
        </button>
      </div>
      {local && <small>ローカル検証モード（公開環境では無効）</small>}
    </dialog>
  );
}
