import React from 'react';
import { teamLabel, formatRate } from './gameText.js';
import { teamColor } from './teamColors.js';
import { TeamMark } from './TeamMark.jsx';
import { PYRAMID_LEAGUES, compareLeagueStanding } from './pyramidLeague.js';

// ============================================================
// ホームの先頭に出す自球団の札（球団色の帯・マーク・順位と勝敗の大きな数字）。
//
// ⚠ いしだ 2026-11-19「主に画面が地味な点」。原因のうち2つをここで直している:
//    ① 12球団が同じ顔 … 球団色（`teamColors.js`）の帯とマークを出す
//    ② 読む数字が全部12〜13pxの表の中 … 順位・勝敗・勝率を `--online-display-1` で出す
// ⚠ **数字は足さない**。順位は順位表と同じ並べ方（`compareLeagueStanding`）で数え、
//    勝敗・勝率はビューの順位表の行をそのまま出す（別の式を作らない）。
// ⚠ 開幕前（1試合もしていない）は順位を出さない（全球団0勝0敗で「1位」と出てしまう）。
// ============================================================

export default function TeamHero({ view }) {
  const name = view?.teamName;
  const row = view?.standings?.find((s) => s.team === name);
  if (!name || !row) return null;
  const color = teamColor(name);
  const leagueId = view.teamLeagues?.[name] || null;
  const league = PYRAMID_LEAGUES.find((l) => l.id === leagueId) || null;
  const group = (view.standings || [])
    .filter((s) => !leagueId || view.teamLeagues?.[s.team] === leagueId)
    .sort(compareLeagueStanding);
  const played = group.reduce((a, s) => a + (s.wins || 0) + (s.losses || 0) + (s.draws || 0), 0);
  const rank = played ? group.findIndex((s) => s.team === name) + 1 : null;
  return (
    <section
      className="online-card online-hero"
      style={{ '--team-color': color.bright, '--team-deep': color.deep }}
      aria-label="自球団"
    >
      <div className="online-hero-head">
        <TeamMark team={name} size="lg" />
        <div className="online-hero-name">
          <h2>{teamLabel(name)}</h2>
          <p className="online-muted">
            {league ? `${league.name}・${group.length}球団` : 'リーグ'}
          </p>
        </div>
      </div>
      <dl className="online-hero-stats">
        <div>
          <dt>順位</dt>
          <dd className="online-display">
            {rank ?? '—'}
            {rank ? <small>位</small> : null}
          </dd>
        </div>
        <div>
          <dt>勝敗</dt>
          <dd className="online-display">
            {row.wins || 0}
            <small>勝</small>
            {row.losses || 0}
            <small>敗</small>
            {row.draws ? (
              <>
                {row.draws}
                <small>分</small>
              </>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>勝率</dt>
          <dd className="online-display">{formatRate(row.winRate)}</dd>
        </div>
      </dl>
    </section>
  );
}
