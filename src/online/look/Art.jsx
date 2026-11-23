// 新しい見た目（試作）の絵を描く部品。描く手順は `art.js`、色と字は `teamLook.js`。
// ⚠ マークと顔は**切のときは何も描かない**（null を返す）。呼ぶ側で入／切を分けない。
//    調子の顔（`ConditionFace`）だけは絵文字と差しかえるので、入／切は呼ぶ側（`ConditionMark`）が見る。
import React, { useId, useMemo } from 'react';
import { useLook } from './LookContext.jsx';
import { emblemArt, faceArt, conditionArt } from './art.js';
import { stadiumArt, stadiumScene, fieldArt } from './sceneArt.js';
import { teamLook, NEUTRAL_LOOK } from './teamLook.js';
import { conditionValue } from '../statsView.js';
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

/**
 * 描く手順の一覧（`art.js`）を SVG にする。ふつうは正方形（`size`）。
 * `fill` なら入れ物いっぱいに広げ、はみ出すぶんは切る（今日の一戦の札の背景・打席速報の球場の図）
 */
function ArtSvg({ art, size, className = '', label, fill = false }) {
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
      width={fill ? '100%' : size}
      height={fill ? '100%' : size}
      preserveAspectRatio={fill ? 'xMidYMid slice' : undefined}
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

/** 顔（選手・指導者で同じ作り）。`seed` が空なら描かない */
function Face({ seed, look, age, level, size, className, suit = false }) {
  const { on } = useLook();
  const art = useMemo(
    () => (on && seed ? faceArt({ seed, look, age, level, suit }) : null),
    [on, seed, look, age, level, suit],
  );
  if (!art) return null;
  return <ArtSvg art={art} size={size} className={`online-face ${className}`} />;
}

/** 選手の顔。帽子は所属球団、表情は調子、しわ・ひげ・白髪は年齢 */
export function PlayerFace({ player, team, size = 28, className = '' }) {
  const { ownTeam } = useLook();
  return (
    <Face
      seed={player ? `p${player.id ?? player.name}` : ''}
      look={teamLook(teamOfPlayer(player, team, ownTeam)) || NEUTRAL_LOOK}
      age={Number.isFinite(player?.age) ? player.age : 25}
      level={player ? conditionValue(player) : null}
      size={size}
      className={className}
    />
  );
}

/** 指導者の顔（表情はいつも穏やか） */
export function CoachFace({ coach, team = null, size = 40, className = '' }) {
  return (
    <Face
      seed={coach ? `c${coach.id ?? coach.name}` : ''}
      look={teamLook(team || coach?.team) || NEUTRAL_LOOK}
      age={Number.isFinite(coach?.age) ? coach.age : 50}
      level={3}
      size={size}
      className={className}
    />
  );
}

/** 調子の顔（絵文字の代わり）。入／切は呼ぶ側（`ConditionMark`）が見る */
export function ConditionFace({ level, size = 14 }) {
  const art = useMemo(() => conditionArt(level), [level]);
  return <ArtSvg art={art} size={size} className="online-condition-face" />;
}

/** 今日の一戦の札の背景（本拠地の球場の夜景）。`team` は本拠地の球団、`city` はその土地の名前 */
export function StadiumBackdrop({ team, city, crowd }) {
  const { on } = useLook();
  const look = teamLook(team) || NEUTRAL_LOOK;
  const art = useMemo(
    () => (on ? stadiumArt({ look, scene: stadiumScene(city), crowd, seed: team }) : null),
    [on, look, city, crowd, team],
  );
  if (!art) return null;
  return <ArtSvg art={art} fill className="online-stadium-art" />;
}

/**
 * 打席速報の球場の図（その行の後の走者・打球）。`scene` は `playByPlay.js` の場面、`home` は本拠地の球団。
 * ⚠ 名前は守備図の `src/online/FieldDiagram.jsx` と別にしてある
 */
export function PlayField({ scene, home }) {
  const { on } = useLook();
  const fence = teamLook(home) || NEUTRAL_LOOK;
  const offense = teamLook(scene.team) || NEUTRAL_LOOK;
  const bases = scene.basesAfter ?? 0;
  const art = useMemo(
    () => (on ? fieldArt({ fence, offense, bases, batted: scene.batted, code: scene.code, runs: scene.runs }) : null),
    [on, fence, offense, bases, scene],
  );
  if (!art) return null;
  return <ArtSvg art={art} fill className="online-field-art" label="球場の図（走者と打球）" />;
}

/**
 * 段4の番記者と場面の顔（種・年齢をそのまま渡す。`story.js` の `reporterOf`・`eventScene` が作る）。
 * `suit` なら背広（番記者。ネクタイは球団の色）
 */
export function StoryFace({ seed, team, age, level = null, suit = false, size = 56, className = '' }) {
  return (
    <Face
      seed={seed}
      look={teamLook(team) || NEUTRAL_LOOK}
      age={Number.isFinite(age) ? age : 30}
      level={level}
      suit={suit}
      size={size}
      className={className}
    />
  );
}
