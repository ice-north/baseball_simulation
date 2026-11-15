import React from 'react';
import { teamShort } from './gameText.js';
import { scoringLine } from './social.js';

/**
 * 得点経過（「7回裏 佐藤 2ランホームラン（3-2）」）。
 * `folded` は畳んで出す（スマホの試合成績の小窓。小窓を縦に収めたまま、開けば読める）
 */
export function ScoringPlays({ game, folded = false }) {
  const plays = game?.scoring;
  if (!Array.isArray(plays)) return null;
  if (folded)
    return (
      <details className="online-scoring is-folded" aria-label="得点経過">
        <summary>得点経過{plays.length ? `（${plays.length}）` : ''}</summary>
        <List plays={plays} game={game} />
      </details>
    );
  return (
    <section className="online-scoring" aria-label="得点経過">
      <h3>得点経過</h3>
      <List plays={plays} game={game} />
    </section>
  );
}

function List({ plays, game }) {
  return (
    <>
      {plays.length ? (
        <ol>
          {plays.map((p, i) => (
            <li key={i}>
              {scoringLine(p, {
                awayShort: teamShort(game.away),
                homeShort: teamShort(game.home),
              })}
            </li>
          ))}
        </ol>
      ) : (
        <p className="online-muted">両チーム無得点でした。</p>
      )}
    </>
  );
}

