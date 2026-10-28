import React, { useState } from 'react';
import {
  Standings,
  Results,
  Notices,
  PhasePanel,
  LineupPanel,
} from './LeaguePanels.jsx';
export default function MobileView(props) {
  const { view } = props;
  const [tab, setTab] = useState('today');
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
          {view.phase && (
            <div className="online-next-action">
              <span>{view.phase.label}の決定待ち</span>
              <button
                className="online-primary"
                onClick={() => setTab('decisions')}
              >
                確認する
              </button>
            </div>
          )}
          <Standings view={view} />
          <button className="online-news-link" onClick={() => setTab('news')}>
            リーグ便り・過去のシーズン →
          </button>
        </>
      )}
      {tab === 'games' && <Results view={view} compact />}
      {tab === 'news' && (
        <>
          <button className="online-back" onClick={() => setTab('today')}>
            ← 今日に戻る
          </button>
          <Notices view={view} compact />
        </>
      )}
      {tab === 'lineup' &&
        (view.phase ? (
          <section className="online-card">
            <h2>打順</h2>
            <p>{view.phase.label}の決定待ちです。キャンプ後に設定できます。</p>
            <button onClick={() => setTab('decisions')}>手続きへ</button>
          </section>
        ) : (
          <LineupPanel
            key={`${view.year}:${view.teamName}`}
            {...props}
            mobile
          />
        ))}
      {tab === 'decisions' &&
        (view.phase ? (
          <PhasePanel key={view.phase.id} {...props} mobile />
        ) : (
          <section className="online-card">
            <h2>手続き</h2>
            <p>現在、決定待ちの手続きはありません。</p>
          </section>
        ))}
      <nav className="online-bottom-nav" aria-label="オンラインの画面">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            aria-label={label}
            aria-current={
              tab === id || (id === 'today' && tab === 'news')
                ? 'page'
                : undefined
            }
            onClick={() => setTab(id)}
          >
            {label}
            {id === 'decisions' && view.phase && (
              <span className="online-dot" aria-label="未完了の手続き" />
            )}
          </button>
        ))}
      </nav>
    </>
  );
}
