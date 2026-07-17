// ============================================================
// 能力推移チャート - src/components/AbilityHistoryChart.jsx
//
// 選手の statsHistory（年度別能力）＋現在値から、能力の年次推移を折れ線で描く。
// 「大事に育てた選手が伸び続ける／酷使で早く衰える」といったキャリアの弧を可視化する。
// ============================================================
import React from 'react';

// 球速を0-100指数へ正規化（getAbilityRankと同じ (v-115)*2.5）。
const velIndex = (v) => Math.max(0, Math.min(100, Math.round(((v || 0) - 115) * 2.5)));

const BATTER_LINES = [
  { key: 'meet', label: 'ミート', color: '#38bdf8' },
  { key: 'power', label: 'パワー', color: '#fb7185' },
  { key: 'speed', label: '走力', color: '#4ade80' },
  { key: 'defense', label: '守備', color: '#a78bfa' },
  { key: 'eye', label: '選球眼', color: '#22d3ee' },
];
const PITCHER_LINES = [
  { key: 'velocity', label: '球速', color: '#f43f5e', vel: true },
  { key: 'control', label: '制球', color: '#38bdf8' },
  { key: 'stamina', label: 'スタミナ', color: '#4ade80' },
];

export default function AbilityHistoryChart({ player, isPitcher }) {
  // statsHistory（自チーム選手）→ growthHistory（全チーム）の順で系列を構築
  const series = React.useMemo(() => {
    const pts = [];
    const sh = (player.statsHistory || []).filter(h => h.abilities);
    if (sh.length) {
      sh.forEach(h => pts.push({ age: h.abilities.age || null, ...h.abilities }));
    } else {
      (player.growthHistory || []).forEach(h => pts.push({ age: null, ...h }));
    }
    // 現在値を最終点として追加
    pts.push({
      age: player.age || null,
      meet: player.batting?.meet || 0, power: player.batting?.power || 0,
      eye: player.batting?.eye || 0, speed: player.physical?.speed || 0,
      arm: player.physical?.arm || 0, defense: player.fielding?.defense || 0,
      velocity: player.pitching?.velocity || 0, control: player.pitching?.control || 0,
      stamina: player.pitching?.stamina || 0,
    });
    return pts;
  }, [player]);

  if (series.length < 2) {
    return <div className="text-gray-400 text-sm text-center py-6">推移グラフはYear2以降・2シーズン分の記録から表示されます</div>;
  }

  const lines = isPitcher ? PITCHER_LINES : BATTER_LINES;
  const n = series.length;
  // x軸ラベル: 年齢があれば年齢、なければ「N年目」
  const hasAge = series.every(p => p.age != null);
  const xLabel = (i) => hasAge ? `${series[i].age}` : `${i + 1}`;

  const W = 640, H = 210, padL = 30, padR = 10, padT = 12, padB = 22;
  const xs = (i) => padL + (n === 1 ? 0 : i / (n - 1) * (W - padL - padR));
  const ys = (v) => (H - padB) - Math.max(0, Math.min(100, v)) / 100 * (H - padT - padB);
  const valAt = (p, ln) => ln.vel ? velIndex(p.velocity) : (p[ln.key] || 0);

  return (
    <div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full" style={{ maxHeight: 230 }}>
          {/* grid */}
          {[20, 40, 60, 80].map(v => (
            <g key={v}>
              <line x1={padL} y1={ys(v)} x2={W - padR} y2={ys(v)} stroke="rgba(255,255,255,.06)" strokeWidth="1" />
              <text x={padL - 5} y={ys(v) + 3} textAnchor="end" fill="#64748b" fontSize="9" className="tnum">{v}</text>
            </g>
          ))}
          <line x1={padL} y1={ys(0)} x2={W - padR} y2={ys(0)} stroke="rgba(255,255,255,.18)" strokeWidth="1" />
          {/* x labels */}
          {series.map((p, i) => (
            (n <= 12 || i % 2 === 0 || i === n - 1) && (
              <text key={i} x={xs(i)} y={H - padB + 14} textAnchor="middle" fill="#64748b" fontSize="9" className="tnum">{xLabel(i)}</text>
            )
          ))}
          <text x={padL - 5} y={padT} textAnchor="end" fill="#64748b" fontSize="9">{hasAge ? '歳' : '年'}</text>
          {/* lines */}
          {lines.map(ln => {
            const d = series.map((p, i) => (i ? 'L' : 'M') + xs(i).toFixed(1) + ' ' + ys(valAt(p, ln)).toFixed(1)).join(' ');
            return (
              <g key={ln.key}>
                <path d={d} fill="none" stroke={ln.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {series.map((p, i) => <circle key={i} cx={xs(i)} cy={ys(valAt(p, ln))} r="2.1" fill={ln.color} />)}
              </g>
            );
          })}
        </svg>
      </div>
      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 px-1">
        {lines.map(ln => {
          const latest = valAt(series[n - 1], ln);
          return (
            <div key={ln.key} className="flex items-center gap-1.5 text-xs">
              <span className="inline-block w-3 h-0.5 rounded" style={{ background: ln.color }} />
              <span className="text-gray-300">{ln.label}</span>
              <span className="text-gray-500 tabular-nums">
                {ln.vel ? `${player.pitching?.velocity || 0}km` : latest}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
