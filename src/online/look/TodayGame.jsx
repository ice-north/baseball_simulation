// ============================================================
// 新しい見た目（試作）段3: ホームの頭の「今日の一戦」の札（PC）。
// 背景は本拠地の球場の夜景（`sceneArt.js` の `stadiumArt`。照明・旗・フェンスは本拠地の球団の色、
// 後ろの景色は土地で海か山、客の入りは順位と連勝で変わる。どれも見た目だけ）。
//
// ⚠ **切のときは何も出さない**（ホームは今までと同じ）。
// ⚠ 中身はビューの `nextGames`（先発予定つき。`server/leagueBoard.mjs` の `withStarters`）と順位表。
//    今日の試合が無い日（休養日・手続きの日）は次の試合を「次の一戦」として出す。
// ⚠ アプリの試合タブにも同じ札がある（`mobile/androidApp/.../LookScenes.kt` の `TodayGameCard`）。文を変えたら両方を直す。
// ============================================================
import React, { useMemo } from 'react';
import { useLook } from './LookContext.jsx';
import { PlayerFace, StadiumBackdrop, TeamMark } from './Art.jsx';
import { todayGameCard } from './todayGame.js';
import { teamLabel } from '../gameText.js';

function Side({ side }) {
  return (
    <div className="online-today-side">
      <TeamMark team={side.team} size={88} className="online-today-mark" />
      <strong>{teamLabel(side.team)}</strong>
      <small>{side.record}</small>
    </div>
  );
}

function StarterCard({ side, right }) {
  const s = side.starter;
  return (
    <div className={`online-today-starter${right ? ' is-right' : ''}`} style={{ '--side-c': side.color }}>
      {s ? <PlayerFace player={s} team={side.team} size={52} /> : null}
      <div>
        <small>{s?.mark || '先発'}</small>
        <strong>{s?.name || '未定'}</strong>
        {s?.line && <span>{s.line}</span>}
      </div>
    </div>
  );
}

export default function TodayGame({ view, onLineup }) {
  const { on } = useLook();
  const card = useMemo(() => (on ? todayGameCard(view) : null), [on, view]);
  if (!card) return null;
  return (
    <section className="online-today-game" aria-label={card.title}>
      <StadiumBackdrop team={card.home} city={card.city} crowd={card.crowd} />
      <header>
        <strong>
          {card.title}　{card.when}
        </strong>
        <span>{card.place}</span>
      </header>
      <div className="online-today-vs">
        <Side side={card.own} />
        <b aria-hidden="true">VS</b>
        <Side side={card.foe} />
      </div>
      {card.note && <p className="online-today-note">{card.note}</p>}
      {onLineup && (
        <button type="button" className="online-today-cta" onClick={onLineup}>
          スタメンを見る ›
        </button>
      )}
      <div className="online-today-starters">
        <StarterCard side={card.own} />
        <StarterCard side={card.foe} right />
      </div>
    </section>
  );
}
