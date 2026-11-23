// 新しい見た目（試作）の絵を描く部品。描く手順は `art.js`、色と字は `teamLook.js`。
// ⚠ どの部品も**切のときは何も描かない**（null を返す）。呼ぶ側で入／切を分けない。
import React, { useId, useMemo } from 'react';
import { useLook } from './LookContext.jsx';
import { emblemArt, faceArt, conditionArt } from './art.js';
import { teamLook, NEUTRAL_LOOK } from './teamLook.js';
import './look.css';

const FONTS = {
  graduate: 'LookGraduate, "Arial Black", sans-serif',
  alfa: 'LookAlfaSlab, "Arial Black", serif',
  yellowtail: 'LookYellowtail, cursive',
  jp: '"Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic", sans-serif',
};

function Shape({ s }) {
  const paint = {
    fill: s.fill || 'none',
    stroke: s.stroke,
    strokeWidth: s.sw,
    opacity: s.op,
    strokeLinecap: s.cap,
    strokeLinejoin: s.join,
  };
  switch (s.t) {
    case 'path':
      return <path d={s.d} {...paint} />;
    case 'circle':
      return <circle cx={s.cx} cy={s.cy} r={s.r} {...paint} />;
    case 'ellipse':
      return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...paint} />;
    case 'rect':
      return <rect x={s.x} y={s.y} width={s.w} height={s.h} {...paint} />;
    case 'text':
      return (
        <text
          x={s.x}
          y={s.y}
          textAnchor="middle"
          fontFamily={FONTS[s.font] || FONTS.graduate}
          fontWeight={s.font === 'jp' ? 900 : undefined}
          fontSize={s.size}
          letterSpacing={s.ls || undefined}
          paintOrder="stroke"
          {...paint}
        >
          {s.text}
        </text>
      );
    default:
      return null;
  }
}

/** 描く手順の一覧（`art.js`）を SVG にする */
export function ArtSvg({ art, size, className = '', label }) {
  const id = `lk${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [x, y, w, h] = art.box;
  // `c` の付いた図形を続けて1つの切り抜きにまとめる
  const parts = [];
  let group = null;
  art.items.forEach((s, i) => {
    if (s.c && art.clip) {
      if (!group) {
        group = [];
        parts.push(group);
      }
      group.push(<Shape key={i} s={s} />);
    } else {
      group = null;
      parts.push(<Shape key={i} s={s} />);
    }
  });
  return (
    <svg
      className={`online-look-art ${className}`}
      viewBox={`${x} ${y} ${w} ${h}`}
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {art.clip && (
        <defs>
          <clipPath id={id}>
            <circle cx={art.clip.cx} cy={art.clip.cy} r={art.clip.r} />
          </clipPath>
        </defs>
      )}
      {parts.map((p, i) =>
        Array.isArray(p) ? (
          <g key={`g${i}`} clipPath={`url(#${id})`}>
            {p}
          </g>
        ) : (
          p
        ),
      )}
    </svg>
  );
}

/** 球団マーク。リーグの球団でなければ（実在の球団・経歴の行き先）描かない */
export function TeamMark({ team, size = 18, className = '' }) {
  const { on } = useLook();
  const look = on ? teamLook(team) : null;
  const art = useMemo(() => (look ? emblemArt(look) : null), [look]);
  if (!art) return null;
  return <ArtSvg art={art} size={size} className={`online-team-mark ${className}`} />;
}

/** 選手の所属（帽子の色）。`team` を渡さなければ、選手に付いた所属か自球団 */
const teamOfPlayer = (player, team, ownTeam) =>
  team !== undefined ? team : player?.tradeTeam || (player?.detailAvailable ? ownTeam : null);

/** 選手の顔。帽子は所属球団、表情は調子、しわ・ひげ・白髪は年齢 */
export function PlayerFace({ player, team, size = 28, className = '' }) {
  const { on, ownTeam } = useLook();
  const look = teamLook(teamOfPlayer(player, team, ownTeam)) || NEUTRAL_LOOK;
  const seed = player ? `p${player.id ?? player.name}` : '';
  const age = Number.isFinite(player?.age) ? player.age : 25;
  const level = Number.isInteger(player?.condition) ? player.condition : null;
  const art = useMemo(
    () => (on && seed ? faceArt({ seed, look, age, level }) : null),
    [on, seed, look, age, level],
  );
  if (!art) return null;
  return <ArtSvg art={art} size={size} className={`online-face ${className}`} />;
}

/** 指導者の顔（選手と同じ作り。表情はいつも穏やか） */
export function CoachFace({ coach, team = null, size = 40, className = '' }) {
  const { on } = useLook();
  const look = teamLook(team || coach?.team) || NEUTRAL_LOOK;
  const seed = coach ? `c${coach.id ?? coach.name}` : '';
  const age = Number.isFinite(coach?.age) ? coach.age : 50;
  const art = useMemo(
    () => (on && seed ? faceArt({ seed, look, age, level: 3 }) : null),
    [on, seed, look, age],
  );
  if (!art) return null;
  return <ArtSvg art={art} size={size} className={`online-face ${className}`} />;
}

/** 調子の顔（絵文字の代わり）。入／切は呼ぶ側（`ConditionMark`）が見る */
export function ConditionFace({ level, size = 14 }) {
  const art = useMemo(() => conditionArt(level), [level]);
  return <ArtSvg art={art} size={size} className="online-condition-face" />;
}
