import React from 'react';
import { POS } from './api.js';
import { positionFitness } from './lineupEdit.js';

// ============================================================
// スタメン設定（PC）の守備図。守備位置を入れ替えるときに、**いまの守備の並びと
// 各位置の適性**を絵で見せる（表の数字だけだと配置が頭に浮かばない）。
//
// ⚠ 常には出さない。以前の守備分析は守備図が大きく場所を取っていた（2026-11-04 の指摘）。
//    守備位置のバッジを選んだときに開き、表の成績の列の場所に出す（行の位置は動かない）。
// ⚠ 守備範囲の計算・ランク・色は一人用の守備分析（`LineupSettingScreen.jsx` の
//    defense タブ）と同じ。適性だけは表と同じ決まり（本職は100。`positionFitness`）。
// ============================================================

// ⚠ 名前（上）と適性（下）が隣の位置と重ならない間隔にしてある（表示幅340pxで12px台の字）
const COORDS = {
  pitcher: { x: 250, y: 278 },
  catcher: { x: 250, y: 396 },
  first: { x: 395, y: 268 },
  second: { x: 325, y: 178 },
  short: { x: 175, y: 178 },
  third: { x: 105, y: 268 },
  left: { x: 80, y: 112 },
  center: { x: 250, y: 62 },
  right: { x: 420, y: 112 },
};
const POS_FULL = {
  pitcher: '投手',
  catcher: '捕手',
  first: '一塁',
  second: '二塁',
  third: '三塁',
  short: '遊撃',
  left: '左翼',
  center: '中堅',
  right: '右翼',
};

/** 守備範囲（0〜1）。守備力・走力・肩を位置ごとの重みで足し、適性で割り引く */
function defenseRange(player, pos) {
  if (!player) return 0;
  const def = player.fielding?.defense || 50;
  const spd = player.physical?.speed || 50;
  const arm = player.physical?.arm || 50;
  const mult = 0.5 + (positionFitness(player, pos) / 100) * 0.5;
  let raw;
  if (['left', 'center', 'right'].includes(pos))
    raw = (def * 0.3 + spd * 0.5 + arm * 0.2) / 100;
  else if (['second', 'short'].includes(pos))
    raw = (def * 0.4 + spd * 0.3 + arm * 0.3) / 100;
  else if (pos === 'catcher') raw = (def * 0.5 + arm * 0.5) / 100;
  else raw = (def * 0.5 + spd * 0.25 + arm * 0.25) / 100;
  return raw * mult;
}
const GRADES = [
  [0.9, 'S', '#ec4899'],
  [0.82, 'A', '#f87171'],
  [0.7, 'B', '#fb923c'],
  [0.55, 'C', '#facc15'],
  [0.42, 'D', '#4ade80'],
  [0.3, 'E', '#60a5fa'],
  [-Infinity, 'F', '#94a3b8'],
];
const gradeOf = (range) => {
  const [, label, color] = GRADES.find(([min]) => range >= min);
  return { label, color };
};
const FITNESS_COLORS = [
  [100, '#ff1493'],
  [90, '#ec4899'],
  [80, '#f87171'],
  [70, '#f97316'],
  [60, '#fbbf24'],
  [50, '#eab308'],
  [40, '#84cc16'],
  [30, '#22c55e'],
  [20, '#06b6d4'],
  [10, '#3b82f6'],
  [-Infinity, '#6366f1'],
];
const fitnessColor = (v) => FITNESS_COLORS.find(([min]) => v >= min)[1];

/**
 * @param order      野手8人の並び（`lineupEdit.js` の形）。編集中の値をそのまま渡す
 * @param pitcher    次の先発（9番。動かせない）
 * @param selected   選んでいる守備位置の打順の位置（index）。無ければ null
 * @param target     入れ替えの相手の候補（マウスを乗せている・ドラッグで重ねている）
 * @param focus      選んでいる打順の行の位置（控えとの交代を考えている）
 * @param onPick     守備位置を押した（表のバッジを押したのと同じ）
 * @param onHover    守備位置にマウスを乗せた／外した
 */
export default function FieldDiagram({
  order,
  byId,
  pitcher,
  selected,
  target,
  focus,
  onPick,
  onHover,
}) {
  const at = {};
  order.forEach((entry, index) => {
    at[entry.position] = { player: byId.get(entry.playerId), index };
  });
  at.pitcher = { player: pitcher, index: null };
  const fielders = order
    .map((e) => [byId.get(e.playerId), e.position])
    .filter(([p]) => p);
  const team = fielders.length
    ? fielders.reduce((s, [p, pos]) => s + defenseRange(p, pos), 0) /
      fielders.length
    : 0;
  const teamGrade = gradeOf(team);

  // 入れ替えたときの適性（選んだ選手と相手の、今の位置 → 入れ替え先）
  const preview =
    selected !== null && target !== null && target !== selected
      ? [selected, target].map((i, k) => {
          const entry = order[i];
          const other = order[k === 0 ? target : selected];
          const player = byId.get(entry?.playerId);
          return {
            player,
            from: entry?.position,
            to: other?.position,
            before: positionFitness(player, entry?.position),
            after: positionFitness(player, other?.position),
          };
        })
      : null;

  return (
    <aside className="online-lineup-field" aria-label="守備図">
      <p className="online-lineup-field-head">
        <strong>守備図</strong>
        <span title={`平均の守備範囲 ${Math.round(team * 100)}`}>
          チーム守備 <b style={{ color: teamGrade.color }}>{teamGrade.label}</b>
        </span>
      </p>
      <svg viewBox="0 8 500 444" className="online-lineup-field-svg">
        <rect x="0" y="8" width="500" height="444" rx="14" fill="#142e1e" />
        <ellipse cx="250" cy="232" rx="236" ry="218" fill="#1f5c33" />
        {[140, 170, 200].map((r) => (
          <ellipse
            key={r}
            cx="250"
            cy="396"
            rx={r}
            ry={r}
            fill="none"
            stroke="#1a4a2c"
            strokeWidth="16"
            opacity="0.25"
          />
        ))}
        <polygon
          points="250,204 350,278 250,352 150,278"
          fill="#8B6914"
          opacity="0.3"
        />
        <polygon
          points="250,150 395,268 250,396 105,268"
          fill="none"
          stroke="#c4a35a"
          strokeWidth="1.5"
          strokeDasharray="6,3"
          opacity="0.45"
        />
        <line
          x1="250"
          y1="396"
          x2="42"
          y2="204"
          stroke="#fff"
          strokeWidth="1.2"
          opacity="0.3"
        />
        <line
          x1="250"
          y1="396"
          x2="458"
          y2="204"
          stroke="#fff"
          strokeWidth="1.2"
          opacity="0.3"
        />
        {Object.entries(COORDS).map(([pos, { x, y }]) => {
          const { player, index } = at[pos] || {};
          const fixed = pos === 'pitcher';
          const fitness = player ? positionFitness(player, pos) : 0;
          const color = fitnessColor(fitness);
          const grade = gradeOf(defenseRange(player, pos));
          const isSelected = !fixed && index === selected;
          const isTarget = !fixed && selected !== null && index === target;
          const isFocus = !fixed && index === focus;
          const label = player
            ? `${POS_FULL[pos]} ${player.name}（適性${fitness}%・守備${grade.label}）`
            : `${POS_FULL[pos]}（空き）`;
          const pick = () => !fixed && index !== null && onPick(index);
          return (
            <g
              key={pos}
              className={`online-lineup-field-pos ${fixed ? 'is-fixed' : ''}`}
              role={fixed ? undefined : 'button'}
              tabIndex={fixed ? undefined : 0}
              aria-pressed={fixed ? undefined : isSelected}
              aria-label={fixed ? undefined : `${label}を入れ替える`}
              onClick={pick}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  pick();
                }
              }}
              onMouseEnter={() => !fixed && onHover(index)}
              onMouseLeave={() => !fixed && onHover(null)}
            >
              <title>{label}</title>
              {(isSelected || isTarget) && (
                <circle
                  cx={x}
                  cy={y}
                  r="27"
                  fill="none"
                  stroke="#facc15"
                  strokeWidth="3"
                  strokeDasharray={isTarget ? '5,4' : undefined}
                />
              )}
              {isFocus && !isSelected && (
                <circle
                  cx={x}
                  cy={y}
                  r="27"
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="3"
                />
              )}
              <circle
                cx={x}
                cy={y}
                r="20"
                fill={isSelected ? '#854d0e' : '#1e3a5f'}
                stroke={player ? color : '#4a5568'}
                strokeWidth="3"
              />
              <text
                x={x}
                y={y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#fff"
                fontSize="18"
                fontWeight="700"
              >
                {POS[pos] || '投'}
              </text>
              {player && (
                <>
                  <text
                    x={x}
                    y={y - 29}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize="19"
                    fontWeight="700"
                    paintOrder="stroke"
                    stroke="#0b1a10"
                    strokeWidth="4"
                  >
                    {player.name}
                  </text>
                  <circle
                    cx={x + 21}
                    cy={y - 14}
                    r="10"
                    fill="#111827"
                    stroke={grade.color}
                    strokeWidth="1.5"
                  />
                  <text
                    x={x + 21}
                    y={y - 13}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={grade.color}
                    fontSize="13"
                    fontWeight="700"
                  >
                    {grade.label}
                  </text>
                  {!fixed && (
                    <>
                      <text
                        x={x}
                        y={y + 40}
                        textAnchor="middle"
                        fill={color}
                        fontSize="17"
                        fontWeight="700"
                        paintOrder="stroke"
                        stroke="#0b1a10"
                        strokeWidth="4"
                      >
                        {fitness}%
                      </text>
                    </>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
      <p className="online-lineup-field-preview" aria-live="polite">
        {preview
          ? preview.map((side, k) => (
              <React.Fragment key={side.from}>
                {k > 0 && <span className="online-lineup-field-swap">⇄</span>}
                <span>
                  {side.player?.name || '名簿に居ない選手'}{' '}
                  <small>
                    {POS[side.from]}
                    {side.before}%→{POS[side.to]}
                  </small>
                  <b
                    className={
                      side.after < 60
                        ? 'is-low'
                        : side.after >= 90
                          ? 'is-good'
                          : ''
                    }
                  >
                    {side.after}%
                  </b>
                </span>
              </React.Fragment>
            ))
          : selected !== null
            ? '入れ替える守備位置を押してください（図でも表でも）'
            : '守備位置を押すと選べます。数字は今の位置の守備適性、丸の色も適性です。'}
      </p>
    </aside>
  );
}
