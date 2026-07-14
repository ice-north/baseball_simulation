// ============================================================
// 能力レーダーチャート - src/components/AbilityRadar.jsx
//
// 選手・チームの能力バランスを多角形で可視化する（野手=六角/投手=五角）。
// 単一系列のためアクセント1色。グリッド・軸は控えめ（デザイントークン参照）。
// 数値は各頂点に併記し「リアルなデータ」を残したまま形で直感的に掴めるようにする。
// ============================================================

import { getUtilityScore } from '../utils/constants.js';

const clamp = (v) => Math.max(0, Math.min(100, v));

// 選手 → レーダー軸（値は0-100正規化 / raw は実数表示用）
export function playerRadarAxes(player) {
  if (!player) return [];
  if (player.position === 'pitcher') {
    const p = player.pitching || {};
    const best = (p.arsenal || []).filter(a => a.type !== 'straight').reduce((m, a) => Math.max(m, a.level || 0), 0);
    return [
      { label: '球速', value: clamp(((p.velocity || 0) - 115) * 2.5), raw: p.velocity || 0 },
      { label: '制球', value: clamp(p.control || 0), raw: p.control || 0 },
      { label: 'スタミナ', value: clamp((p.stamina || 0) / 2), raw: p.stamina || 0 },
      { label: '変化球', value: clamp(best), raw: best },
      { label: '守備', value: clamp(player.fielding?.defense || 0), raw: player.fielding?.defense || 0 },
    ];
  }
  const b = player.batting || {}, ph = player.physical || {}, f = player.fielding || {};
  const util = getUtilityScore(player);
  return [
    { label: 'ミート', value: clamp(b.meet || 0), raw: b.meet || 0 },
    { label: 'パワー', value: clamp(b.power || 0), raw: b.power || 0 },
    { label: '走力', value: clamp(ph.speed || 0), raw: ph.speed || 0 },
    { label: '肩', value: clamp(ph.arm || 0), raw: ph.arm || 0 },
    { label: '守備', value: clamp(f.defense || 0), raw: f.defense || 0 },
    { label: '守備幅', value: clamp(util), raw: util },
    { label: '選球眼', value: clamp(b.eye || 0), raw: b.eye || 0 },
  ];
}

// チーム → 戦力レーダー軸（所属選手の平均）
export function teamRadarAxes(team) {
  const players = team?.players || [];
  const fielders = players.filter(p => p.position !== 'pitcher');
  const pitchers = players.filter(p => p.position === 'pitcher');
  const avg = (arr, fn) => (arr.length ? clamp(arr.reduce((s, p) => s + fn(p), 0) / arr.length) : 0);
  const pPow = (p) => {
    const pi = p.pitching || {};
    return (clamp(((pi.velocity || 0) - 115) * 2.5) + clamp(pi.control || 0) + clamp((pi.stamina || 0) / 2)) / 3;
  };
  return [
    { label: '打力', value: avg(fielders, p => p.batting?.meet || 0) },
    { label: '長打', value: avg(fielders, p => p.batting?.power || 0) },
    { label: '機動力', value: avg(fielders, p => p.physical?.speed || 0) },
    { label: '守備', value: avg(fielders, p => p.fielding?.defense || 0) },
    { label: '投手力', value: pitchers.length ? clamp(pitchers.reduce((s, p) => s + pPow(p), 0) / pitchers.length) : 0 },
  ].map(a => ({ ...a, raw: Math.round(a.value) }));
}

// axes: [{ label, value(0-100), raw? }]
export function AbilityRadar({ axes = [], size = 190, showValues = true, accent = 'var(--accent)' }) {
  const n = axes.length;
  if (n < 3) return null;
  const pad = 38;                 // ラベル用の外周余白（多軸・長ラベルも収める）
  const cx = size / 2, cy = size / 2;
  const maxR = size / 2 - pad;
  const angle = (i) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const pt = (i, r) => [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];
  const polyPoints = (r, valFn) => axes.map((a, i) => pt(i, valFn ? valFn(a, i) : r).join(',')).join(' ');

  const rings = [0.25, 0.5, 0.75, 1].map(f => polyPoints(maxR * f));
  const dataPoly = polyPoints(null, (a) => (clamp(a.value) / 100) * maxR);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="能力レーダーチャート">
      {/* グリッド（同心多角形） */}
      {rings.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke="var(--chart-grid)" strokeWidth="1" />
      ))}
      {/* 軸スポーク */}
      {axes.map((_, i) => {
        const [x, y] = pt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--chart-axis)" strokeWidth="1" />;
      })}
      {/* データ多角形 */}
      <polygon points={dataPoly} fill={accent} fillOpacity="0.18" stroke={accent} strokeWidth="2" strokeLinejoin="round" />
      {/* 頂点ドット */}
      {axes.map((a, i) => {
        const [x, y] = pt(i, (clamp(a.value) / 100) * maxR);
        return <circle key={i} cx={x} cy={y} r="2.6" fill={accent} />;
      })}
      {/* ラベル＋数値 */}
      {axes.map((a, i) => {
        const [lx, ly] = pt(i, maxR + 12);
        const cos = Math.cos(angle(i));
        const anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
        return (
          <text key={i} x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle"
            fontSize="10" fill="#d1d5db">
            {a.label}
            {showValues && a.raw != null && (
              <tspan x={lx} dy="11" fontSize="10" fontWeight="700" fill="#f3f4f6">{a.raw}</tspan>
            )}
          </text>
        );
      })}
    </svg>
  );
}
