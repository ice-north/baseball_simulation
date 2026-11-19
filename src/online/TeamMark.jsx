import React from 'react';
import { teamColor } from './teamColors.js';
import { teamShort } from './gameText.js';

// ============================================================
// 球団のマーク（球団色＋頭文字の角丸）。⚠ 画像素材は持たない（頭文字と色だけで作る）。
//
// ⚠ 置く地で色の段を変える（`teamColors.js` の注）:
//    `on="card"`（既定。暗いカードの上） … 明るい色の地＋暗い文字
//    `on="paper"`（明るい紙の上）        … 濃い色の地＋白文字＋暗い縁
// ⚠ **飾りなので読み上げからは外す**（`aria-hidden`）。球団名はいつも隣にある。
//    名前のそばに置くこと（マークだけで球団を示さない）。
// ============================================================

export function TeamMark({ team, size = 'sm', on = 'card', className = '' }) {
  if (!team) return null;
  const color = teamColor(team);
  // ⚠ **大きいマークは2文字**（「三陸」）。1文字だと「三」がハンバーガーの印に見えた。
  //    小さいマークは1文字（表の欄に2文字は入らない）
  const chars = [...String(teamShort(team) || team)];
  const head = (size === 'lg' ? chars.slice(0, 2) : chars.slice(0, 1)).join('') || '球';
  return (
    <span
      className={['online-team-mark', `is-${size}`, `is-${on}`, className]
        .filter(Boolean)
        .join(' ')}
      style={{ '--team-color': on === 'paper' ? color.deep : color.bright }}
      aria-hidden="true"
    >
      {head}
    </span>
  );
}

export default TeamMark;
