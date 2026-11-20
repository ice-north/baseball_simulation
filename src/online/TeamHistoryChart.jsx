import React, { useState } from 'react';
import { PYRAMID_LEAGUES, TEAMS_PER_LEAGUE } from './pyramidLeague.js';
import { slotOf } from './teamHistory.js';

// ============================================================
// 球団の歩み（折れ線グラフ）。球団史・記録の年表の上に置く。
//
// ⚠ 先方要望（2026-11-20）「これまでの成績を折れ線グラフで。〇年目は2部で〇位、〇年目は1部で優勝など、
//    横軸で確認できるように」。
// ⚠ 縦軸は**リーグ全体の中の位置**（1部1位＝1 … 1部6位＝6、2部1位＝7 … 2部6位＝12）。
//    部ごとの順位だけを結ぶと、2部1位と1部1位が同じ高さに並んで昇格・降格が見えない。
//    上が良い（1部1位が一番上）。1部と2部の境に線を引き、帯に部の名前を書く。
// ⚠ 1系列なので凡例は置かない（見出しが名前になる）。点を押す・重ねると、その年の成績を出す。
//    数字の一覧は下の年表（表）にある。
// ⚠ 今季は終わっていないので、点線と白抜きの点で区別する（`current`）。
// ============================================================

const W = 720;
const H = 260;
const PAD = { left: 52, right: 20, top: 18, bottom: 34 };
const SLOTS = PYRAMID_LEAGUES.length * TEAMS_PER_LEAGUE;

/** 点の横に出す短い印（優勝・昇格・降格）。全部の点に数字は付けない */
function markOf(s) {
  if (s.current) return '今季';
  const parts = [s.rank === 1 && `${s.league}優勝`, s.champion && 'PO優勝', s.move].filter(Boolean);
  return parts.length ? parts.join('・') : null;
}

const recordText = (s) =>
  s.wins != null ? `${s.wins}勝${s.losses}敗${s.draws ? `${s.draws}分` : ''}` : '';

export default function TeamHistoryChart({ seasons, current = null }) {
  const [active, setActive] = useState(null);
  // 年表は新しい順。グラフは古い順（左から右へ）
  const points = [...(seasons || [])]
    .reverse()
    .concat(current ? [current] : [])
    .map((s) => ({ ...s, slot: slotOf(s) }))
    .filter((s) => s.slot != null);
  if (points.length < 1) return null;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (points.length === 1 ? plotW / 2 : (plotW * i) / (points.length - 1));
  const y = (slot) => PAD.top + (plotH * (slot - 1)) / (SLOTS - 1);
  const done = points.filter((p) => !p.current);
  const line = done.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.slot)}`).join(' ');
  const last = done.length - 1;
  const shownLabelEvery = points.length > 16 ? Math.ceil(points.length / 12) : 1;
  const tip = active != null ? points[active] : null;
  return (
    <figure className="online-history-chart">
      <figcaption>球団の歩み（上ほど上位。1部1位がいちばん上）</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`球団の歩み。${points
          .map((p) => `${p.year}年目${p.current ? '（今季途中）' : ''} ${p.league}${p.rank}位`)
          .join('、')}`}
        onMouseLeave={() => setActive(null)}
      >
        {/* 部の帯（1部・2部）。境に線を引く */}
        {PYRAMID_LEAGUES.map((l) => {
          const top = y(l.tier * TEAMS_PER_LEAGUE + 1) - plotH / (SLOTS - 1) / 2;
          const bottom = y((l.tier + 1) * TEAMS_PER_LEAGUE) + plotH / (SLOTS - 1) / 2;
          return (
            <g key={l.id} className={`online-history-band is-tier-${l.tier}`}>
              <rect x={PAD.left - 8} y={Math.max(PAD.top - 8, top)} width={plotW + 16} height={Math.min(bottom, H - PAD.bottom + 8) - Math.max(PAD.top - 8, top)} />
              <text x={8} y={(Math.max(PAD.top - 8, top) + Math.min(bottom, H - PAD.bottom + 8)) / 2} dominantBaseline="middle">
                {l.name}
              </text>
            </g>
          );
        })}
        {/* 順位の目盛り（各部の1位と、いちばん下の部の最下位だけ。部の境は1部最下位と2部1位が隣り合い、
            両方書くと字が重なる） */}
        {[
          ...PYRAMID_LEAGUES.map((l) => ({ key: `${l.id}:1`, slot: l.tier * TEAMS_PER_LEAGUE + 1, text: '1位' })),
          { key: 'last', slot: SLOTS, text: `${TEAMS_PER_LEAGUE}位` },
        ].map((t) => (
          <text key={t.key} className="online-history-tick" x={PAD.left - 12} y={y(t.slot)} textAnchor="end" dominantBaseline="middle">
            {t.text}
          </text>
        ))}
        {PYRAMID_LEAGUES.slice(1).map((l) => (
          <line
            key={`b:${l.id}`}
            className="online-history-divider"
            x1={PAD.left - 8}
            x2={W - PAD.right + 8}
            y1={(y(l.tier * TEAMS_PER_LEAGUE) + y(l.tier * TEAMS_PER_LEAGUE + 1)) / 2}
            y2={(y(l.tier * TEAMS_PER_LEAGUE) + y(l.tier * TEAMS_PER_LEAGUE + 1)) / 2}
          />
        ))}
        {done.length > 1 && <path className="online-history-line" d={line} />}
        {/* 今季（途中）は最後の終わった年から点線でつなぐ */}
        {current && last >= 0 && points.at(-1)?.current && (
          <path
            className="online-history-line is-current"
            d={`M${x(last)},${y(done[last].slot)} L${x(points.length - 1)},${y(points.at(-1).slot)}`}
          />
        )}
        {points.map((p, i) => {
          const mark = markOf(p);
          return (
            <g key={`${p.year}:${p.current ? 'c' : 'd'}`}>
              {/* 年の目盛り */}
              {(i % shownLabelEvery === 0 || i === points.length - 1) && (
                <text className="online-history-year" x={x(i)} y={H - 10} textAnchor="middle">
                  {p.year}年目
                </text>
              )}
              <circle
                className={`online-history-dot${p.current ? ' is-current' : ''}${p.champion || p.rank === 1 ? ' is-title' : ''}${active === i ? ' is-active' : ''}`}
                cx={x(i)}
                cy={y(p.slot)}
                r={p.champion || p.rank === 1 ? 6 : 4.5}
              />
              {mark && (
                <text className="online-history-mark" x={x(i)} y={y(p.slot) - 11} textAnchor="middle">
                  {mark}
                </text>
              )}
              {/* 当たりの範囲は点より大きく（押しやすく） */}
              <rect
                className="online-history-hit"
                x={x(i) - Math.max(10, plotW / Math.max(1, points.length - 1) / 2)}
                y={PAD.top - 10}
                width={Math.max(20, plotW / Math.max(1, points.length - 1))}
                height={plotH + 20}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
              />
            </g>
          );
        })}
        {tip && (
          <g className="online-history-tip" pointerEvents="none">
            <line x1={x(active)} x2={x(active)} y1={PAD.top - 6} y2={H - PAD.bottom + 6} />
          </g>
        )}
      </svg>
      <p className="online-history-readout" aria-live="polite">
        {tip
          ? `${tip.year}年目${tip.current ? '（今季・途中）' : ''}　${tip.league}${tip.rank}位　${recordText(tip)}${
              [tip.champion && 'プレーオフ優勝', tip.move].filter(Boolean).length
                ? `　${[tip.champion && 'プレーオフ優勝', tip.move].filter(Boolean).join('・')}`
                : ''
            }`
          : '点に重ねると（押すと）その年の成績が出ます。'}
      </p>
    </figure>
  );
}
