// ============================================================
// 投球コース表示 - PitchZonePlot.jsx
//
// 捕手側から見たストライクゾーン（3×3）に、この打席の1球ごとの到達点を打つ。
// 内部モデルは 5×5=25セル（src/game/pitchZone.js）なので、
// セル中心 + セル内の揺らぎ で連続的な位置に落とす。
//
// **揺らぎ(jx/jy)は投球時に一度だけ決めて保存してある**。
// 描画のたびに乱数を引くと、再レンダリングごとに点が動いてしまう。
//
// col 0=外角ボール / 1-3=ゾーン / 4=内角ボール（打者から見た向き）
// row 0=高めボール / 1-3=ゾーン / 4=低めボール
// ============================================================

const SIZE = 5;                       // 5×5セル
const PAD = 0.55;                     // グリッド外（col=-1 や 5）を置く余白（セル単位）
const SPAN = SIZE + PAD * 2;          // 描画範囲（セル単位）

/** セル座標 → 0〜1 の描画座標。グリッド外は余白に収める */
const place = (v, jitter) => {
  const c = Math.max(-1, Math.min(SIZE, v));
  // セル中心 + セル内の揺らぎ（±0.36セル）
  const pos = c + 0.5 + (jitter - 0.5) * 0.72;
  return (pos + PAD) / SPAN;
};

// 結果ごとの見え方。○=ボール □=ストライク ▷=ファウル △=空振り ●=インプレー
const STYLE = {
  ball:            { shape: 'circle', color: '#ec4899', fill: 'none' },
  called_strike:   { shape: 'square', color: '#2563eb', fill: 'none' },
  swinging_strike: { shape: 'tri',    color: '#f97316', fill: 'none' },
  foul:            { shape: 'play',   color: '#10b981', fill: 'none' },
};
const IN_PLAY = { shape: 'circle', color: '#a855f7', fill: '#a855f7' };
const LATEST = '#ef4444';

const styleFor = (type) => STYLE[type] || IN_PLAY;

function Marker({ x, y, type, latest, scale = 1 }) {
  const s = styleFor(type);
  const color = latest ? LATEST : s.color;
  const fill = latest ? LATEST : s.fill;
  const r = (latest ? 5.0 : 4.2) * scale;
  const w = (latest ? 1.8 : 1.4) * scale;
  if (s.shape === 'square') {
    return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} fill={fill} stroke={color} strokeWidth={w} />;
  }
  if (s.shape === 'tri') {
    return <polygon points={`${x},${y - r} ${x + r},${y + r} ${x - r},${y + r}`} fill={fill} stroke={color} strokeWidth={w} strokeLinejoin="round" />;
  }
  if (s.shape === 'play') {
    return <polygon points={`${x - r},${y - r} ${x + r},${y} ${x - r},${y + r}`} fill={fill} stroke={color} strokeWidth={w} strokeLinejoin="round" />;
  }
  return <circle cx={x} cy={y} r={r} fill={fill} stroke={color} strokeWidth={w} />;
}

/**
 * @param {Array} pitches この打席の投球（古い順）。{ pitchLoc, resultType }
 * @param {number} size   1辺のピクセル
 */
export default function PitchZonePlot({ pitches = [], size = 96 }) {
  const V = 100;                                   // viewBox の1辺
  // viewBox は固定なので、大きく表示するときはマーカーを相対的に小さくして
  // 点が潰れないようにする（168px で約0.72倍）
  const mk = Math.max(0.6, Math.min(1, 120 / size));
  const z0 = ((1 + PAD) / SPAN) * V;               // ストライクゾーンの左上
  const z1 = ((4 + PAD) / SPAN) * V;               // 右下
  const step = (z1 - z0) / 3;
  const list = pitches.filter(p => p?.pitchLoc);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${V} ${V}`} className="flex-shrink-0">
      <rect x="0" y="0" width={V} height={V} rx="3" fill="#0b0f19" stroke="#374151" strokeWidth="0.8" />
      {/* ストライクゾーン 3×3 */}
      {[1, 2].map(i => (
        <g key={i} stroke="#6b7280" strokeWidth="0.6">
          <line x1={z0 + step * i} y1={z0} x2={z0 + step * i} y2={z1} />
          <line x1={z0} y1={z0 + step * i} x2={z1} y2={z0 + step * i} />
        </g>
      ))}
      <rect x={z0} y={z0} width={z1 - z0} height={z1 - z0}
        fill="none" stroke="#d1d5db" strokeWidth="1.6" />
      {/* 打者から見た向きの目印 */}
      <text x={z0 - 3} y={V - 2} fill="#6b7280" fontSize="5" textAnchor="start">外角</text>
      <text x={z1 + 3} y={V - 2} fill="#6b7280" fontSize="5" textAnchor="end">内角</text>
      {list.map((p, i) => (
        <Marker key={i}
          x={place(p.pitchLoc.col, p.pitchLoc.jx ?? 0.5) * V}
          y={place(p.pitchLoc.row, p.pitchLoc.jy ?? 0.5) * V}
          type={p.resultType} scale={mk}
          latest={i === list.length - 1} />
      ))}
    </svg>
  );
}

/** 凡例（縦並び。プロットの横に置く） */
export function PitchZoneLegend() {
  const items = [
    ['ball', 'ボール'], ['called_strike', '見逃し'],
    ['swinging_strike', '空振り'], ['foul', 'ファウル'], ['inplay', '打球'],
  ];
  return (
    <div className="flex flex-col justify-center gap-1">
      {items.map(([k, label]) => (
        <div key={k} className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="-7 -7 14 14">
            <Marker x={0} y={0} type={k} latest={false} />
          </svg>
          <span className="text-xs text-gray-300 leading-none">{label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5 pt-0.5">
        <svg width="12" height="12" viewBox="-7 -7 14 14">
          <Marker x={0} y={0} type="ball" latest />
        </svg>
        <span className="text-xs text-gray-300 leading-none">最新の1球</span>
      </div>
    </div>
  );
}
