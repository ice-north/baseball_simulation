// ============================================================
// 新しい見た目（試作）段3: ホームの頭の「今日の一戦」の札（PC）。
// 背景は本拠地の球場の夜景（`sceneArt.js` の `stadiumArt`。照明・旗・フェンスは本拠地の球団の色、
// 後ろの景色は土地で海か山、客の入りは順位と連勝で変わる。どれも見た目だけ）。
//
// ⚠ **切のときは何も出さない**（ホームは今までと同じ）。
// ⚠ 中身はビューの `nextGames`（先発予定つき。`server/leagueBoard.mjs` の `withStarters`）と順位表。
//    今日の試合が無い日（休養日・手続きの日）は次の試合を「次の一戦」として出す。
// ⚠ アプリの試合タブにも同じ札がある（`mobile/androidApp/.../LookScenes.kt` の `TodayGameCard`）。文を変えたら両方を直す。
// ⚠ 縦は詰めてある（先方要望 #8「縦幅を縮めて視認性を高めて」）。球団は横並び（マーク・名前・順位）、
//    ひとことは VS の下、「スタメンを見る」は見出しの右。
// ⚠ 札の下に、同じ日のほかの試合を1枚ずつ重ねて見せ、数秒ごとにめくる（`OtherGames`。先方要望 #8）。
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { useLook } from './LookContext.jsx';
import { PlayerFace, StadiumBackdrop, TeamMark } from './Art.jsx';
import { otherGameCards, todayGameCard } from './todayGame.js';
import { teamLabel } from '../gameText.js';

/** ほかの試合をめくる間隔（ミリ秒） */
export const OTHER_GAMES_MS = 4000;

function Side({ side, right }) {
  return (
    <div className={`online-today-side${right ? ' is-right' : ''}`}>
      <TeamMark team={side.team} size={56} className="online-today-mark" />
      <div>
        <strong>{teamLabel(side.team)}</strong>
        <small>{side.record}</small>
      </div>
    </div>
  );
}

/**
 * 同じ日のほかの試合。カードを重ねて1枚ずつ見せ、`OTHER_GAMES_MS` ごとに次へめくる。
 * ⚠ 乗せている間（マウス・フォーカス）は止める。点を押すとその試合へ。動きを減らす設定では、めくるだけで動かさない（CSS）
 */
function OtherGames({ games }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = games.length;
  const at = count ? index % count : 0;
  useEffect(() => {
    if (paused || count < 2) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), OTHER_GAMES_MS);
    return () => clearInterval(timer);
  }, [paused, count]);
  if (!count) return null;
  return (
    <div
      className="online-today-others"
      aria-label="ほかの試合"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <header>
        <strong>ほかの試合</strong>
        <span>
          {at + 1}/{count}
        </span>
      </header>
      <div className="online-today-stack">
        {games.map((g, i) => {
          const pos = (i - at + count) % count;
          const state = pos === 0 ? 'is-front' : pos === 1 ? 'is-next' : pos === 2 ? 'is-back' : pos === count - 1 ? 'is-gone' : 'is-hidden';
          return (
            <article key={g.id ?? `${g.away}-${g.home}`} className={`online-today-other ${state}`} aria-hidden={pos !== 0}>
              <div className="online-today-other-team">
                <TeamMark team={g.away} size={30} />
                <div>
                  <strong>{teamLabel(g.away)}</strong>
                  <small>{g.awayRecord}</small>
                </div>
              </div>
              <div className="online-today-other-mid">
                <b>VS</b>
                <small>{g.city ? `${g.city}` : 'ホーム'}</small>
              </div>
              <div className="online-today-other-team is-right">
                <TeamMark team={g.home} size={30} />
                <div>
                  <strong>{teamLabel(g.home)}</strong>
                  <small>{g.homeRecord}</small>
                </div>
              </div>
              <p>
                先発　{g.awayStarter || '未定'}　−　{g.homeStarter || '未定'}
              </p>
            </article>
          );
        })}
      </div>
      {count > 1 && (
        <div className="online-today-dots" role="tablist" aria-label="ほかの試合を選ぶ">
          {games.map((g, i) => (
            <button
              key={g.id ?? i}
              type="button"
              role="tab"
              aria-selected={i === at}
              aria-label={`${teamLabel(g.away)}対${teamLabel(g.home)}`}
              className={i === at ? 'is-on' : ''}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StarterCard({ side, right }) {
  const s = side.starter;
  return (
    <div className={`online-today-starter${right ? ' is-right' : ''}`} style={{ '--side-c': side.color }}>
      {s ? <PlayerFace player={s} team={side.team} size={40} /> : null}
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
  const others = useMemo(() => (on ? otherGameCards(view) : []), [on, view]);
  if (!card) return null;
  return (
    <>
      <section className="online-today-game" aria-label={card.title}>
        <StadiumBackdrop team={card.home} city={card.city} crowd={card.crowd} />
        <header>
          <strong>
            {card.title}　{card.when}
          </strong>
          <span>{card.place}</span>
          {onLineup && (
            <button type="button" className="online-today-cta" onClick={onLineup}>
              スタメンを見る ›
            </button>
          )}
        </header>
        <div className="online-today-vs">
          <Side side={card.own} />
          <div className="online-today-mid">
            <b aria-hidden="true">VS</b>
            {card.note && <p className="online-today-note">{card.note}</p>}
          </div>
          <Side side={card.foe} right />
        </div>
        <div className="online-today-starters">
          <StarterCard side={card.own} />
          <StarterCard side={card.foe} right />
        </div>
      </section>
      <OtherGames games={others} />
    </>
  );
}
