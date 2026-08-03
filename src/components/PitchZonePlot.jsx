// ============================================================
// 投球コース表示 - PitchZonePlot.jsx
//
// **投手から見たストライクゾーン**（3×3）に、この打席の到達点を何球目かの
// 数字つきで打つ。内部モデルは 5×5=25セル（src/game/pitchZone.js）なので、
// セル中心 + セル内の揺らぎ で連続的な位置に落とす。
//
// 【向き】内部の col は**打者基準**（col 4 = その打者の内角）。
// 画面は投手視点に統一するので、打者の左右で左右反転が要る。
//
//   ホームを原点、センター方向を +Y、一塁を +X とすると
//     右打者は -X 側に立つ → 内角は -X
//     左打者は +X 側に立つ → 内角は +X
//   投手はホームを向いている（-Y を向く）ので、投手から見て
//     画面の右 = -X = 三塁側 / 画面の左 = +X = 一塁側
//   したがって **右打者の内角は画面右、左打者の内角は画面左**。
//
// ⚠ 以前は打者基準の col をそのまま x に使い「捕手側から見た向き」と
//   書いていたが、実際には右打者では投手視点・左打者では捕手視点という
//   混在状態だった。ここで打者の左右を見て統一する。
//
// **揺らぎ(jx/jy)は投球時に一度だけ決めて保存してある**。
// 描画のたびに乱数を引くと、再レンダリングごとに点が動いてしまう。
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

// 【形＝球種】**三角が実際に曲がっていく向きを指す**。
//   〇 ストレート
//   △ カーブ
//   ▽ 落ちる球（フォーク・チェンジアップ・パーム・ナックル・スプリッター）
//   ◁▷ 横に曲がる球
//
// 横変化の向きは**投手の利き腕で逆になる**。画面は投手視点なので
// 画面左 = 一塁側 / 画面右 = 三塁側。
//   右投手 … グラブ側は一塁側 → スライダー系は ◁ / シュート系は ▷
//   左投手 … グラブ側は三塁側 → スライダー系は ▷ / シュート系は ◁
// 下の表は右投手を基準に持ち、左投手のときだけ左右を入れ替える。
const SHAPE_BY_PITCH = {
  straight: 'circle',
  curve: 'up',
  fork: 'down', splitter: 'down', changeup: 'down', palm: 'down', knuckle: 'down',
  slider: 'left', cutter: 'left', sinker: 'left',
  shoot: 'right', twoSeam: 'right',
};
export const PITCH_SHAPE_LEGEND = [
  ['circle', 'ストレート'], ['up', 'カーブ'], ['down', '落ちる球'],
  ['left', 'スライダー系'], ['right', 'シュート系'],
];
const mirrorShape = (s) => (s === 'left' ? 'right' : s === 'right' ? 'left' : s);

// 【色＝結果】ボール=緑 / ストライク=黄 / アウト=赤 / 安打=白。
// 塗りつぶしは「スイングした」ことを表すので、黄の中でも
// 見逃し（中空）と空振り・ファウル（塗り）が区別できる。
const C_BALL = '#22c55e', C_STRIKE = '#facc15', C_OUT = '#ef4444', C_HIT = '#f8fafc';
const RESULT_STYLE = {
  ball:            { color: C_BALL,   swung: false },
  // 死球はボールの一種。振っていないので中空のまま
  hit_by_pitch:    { color: C_BALL,   swung: false },
  called_strike:   { color: C_STRIKE, swung: false },
  swinging_strike: { color: C_STRIKE, swung: true },
  foul:            { color: C_STRIKE, swung: true },
  foul_2strike:    { color: C_STRIKE, swung: true },
  out:             { color: C_OUT,    swung: true },
  double_play:     { color: C_OUT,    swung: true },
  single:          { color: C_HIT,    swung: true },
  double:          { color: C_HIT,    swung: true },
  triple:          { color: C_HIT,    swung: true },
  homerun:         { color: C_HIT,    swung: true },
};
const UNKNOWN = { color: C_OUT, swung: true };

export const RESULT_COLOR_LEGEND = [
  [C_BALL, 'ボール'], [C_STRIKE, 'ストライク'], [C_OUT, 'アウト'], [C_HIT, '安打'],
];

const resultStyle = (t) => RESULT_STYLE[t] || UNKNOWN;
const pitchShape = (t, leftHanded) => {
  const s = SHAPE_BY_PITCH[t] || 'circle';
  return leftHanded ? mirrorShape(s) : s;
};

function Marker({ x, y, shape = 'circle', color = '#9ca3af', filled = false, scale = 1 }) {
  const r = 4.4 * scale;
  const w = 1.5 * scale;
  const fill = filled ? color : 'none';
  const common = { fill, stroke: color, strokeWidth: w, strokeLinejoin: 'round' };
  if (shape === 'up')    return <polygon points={`${x},${y - r} ${x + r},${y + r * 0.8} ${x - r},${y + r * 0.8}`} {...common} />;
  if (shape === 'down')  return <polygon points={`${x},${y + r} ${x + r},${y - r * 0.8} ${x - r},${y - r * 0.8}`} {...common} />;
  if (shape === 'left')  return <polygon points={`${x - r},${y} ${x + r * 0.8},${y - r} ${x + r * 0.8},${y + r}`} {...common} />;
  if (shape === 'right') return <polygon points={`${x + r},${y} ${x - r * 0.8},${y - r} ${x - r * 0.8},${y + r}`} {...common} />;
  return <circle cx={x} cy={y} r={r * 0.92} {...common} />;
}

/**
 * 打者のシルエット（枠の左側に立つ姿を描き、右打者は左右反転して使う）。
 * 「いま誰がどちらの打席か」を文字を読まずに分かるようにするための目印。
 * 薄く描いてマーカーの視認性を落とさない。
 */
function BatterSilhouette({ onRight }) {
  return (
    <g opacity="0.20" fill="#93c5fd"
      transform={onRight ? 'translate(100,0) scale(-1,1)' : undefined}>
      {/* バット */}
      <polygon points="20,24 29,3 32.5,5 23.5,26" />
      {/* 腕 */}
      <polygon points="13,28 21,21 23.5,24 15.5,31" />
      {/* 頭（ヘルメット） */}
      <circle cx="12" cy="17" r="6.2" />
      <path d="M5.5,17 h13 a1,1 0 0 1 0,2.6 h-13 z" />
      {/* 胴 */}
      <polygon points="6,24 18,24 16,50 8,50" />
      {/* 脚 */}
      <polygon points="7.5,50 12,50 11,91 6,91" />
      <polygon points="12,50 16.5,50 19.5,91 14.5,91" />
    </g>
  );
}

/**
 * @param {Array}  pitches       この打席の投球（古い順）。{ pitchLoc, resultType }
 * @param {number} size          1辺のピクセル
 * @param {string} bats          打者の左右（'right' | 'left' | 'switch'）
 * @param {string} pitcherThrows 投手の利き腕。スイッチヒッターの打席を決めるのに使う
 */
export default function PitchZonePlot({
  pitches = [], size = 96, bats = 'right', pitcherThrows = 'right',
}) {
  const V = 100;                                   // viewBox の1辺
  // viewBox は固定なので、大きく表示するときはマーカーを相対的に小さくして
  // 点が潰れないようにする（168px で約0.72倍）
  const mk = Math.max(0.6, Math.min(1, 120 / size));
  const z0 = ((1 + PAD) / SPAN) * V;               // ストライクゾーンの左上
  const z1 = ((4 + PAD) / SPAN) * V;               // 右下
  const step = (z1 - z0) / 3;
  const list = pitches.filter(p => p?.pitchLoc);

  // スイッチヒッターは投手と逆の打席に立つので、実際に立つ側へ解決してから使う
  const side = bats === 'switch'
    ? ((pitcherThrows || 'right') === 'left' ? 'right' : 'left')
    : (bats || 'right');
  // 左打者は内角が画面左に来るので左右を反転する（上のコメント参照）
  const flip = side === 'left';
  // 横変化の向きは投手の利き腕で逆になる（打者の左右とは無関係）
  const leftHandedPitcher = (pitcherThrows || 'right') === 'left';
  const toX = (col, jx) => {
    const t = place(col, jx);
    return (flip ? 1 - t : t) * V;
  };
  // 内角/外角のラベルも打者の左右で入れ替わる
  const rightLabel = flip ? '外角' : '内角';
  const leftLabel = flip ? '内角' : '外角';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${V} ${V}`} className="flex-shrink-0">
      <rect x="0" y="0" width={V} height={V} rx="3" fill="#0b0f19" stroke="#374151" strokeWidth="0.8" />
      {/* 打者のシルエット。投手から見て 右打者は画面右・左打者は画面左に立つ */}
      <BatterSilhouette onRight={!flip} />
      {/* ホームベース（下端中央）。向きの基準になる */}
      <polygon points="43,95 57,95 57,89 50,85.5 43,89"
        fill="#1f2937" stroke="#4b5563" strokeWidth="0.7" />
      {/* ストライクゾーン 3×3 */}
      {[1, 2].map(i => (
        <g key={i} stroke="#6b7280" strokeWidth="0.6">
          <line x1={z0 + step * i} y1={z0} x2={z0 + step * i} y2={z1} />
          <line x1={z0} y1={z0 + step * i} x2={z1} y2={z0 + step * i} />
        </g>
      ))}
      <rect x={z0} y={z0} width={z1 - z0} height={z1 - z0}
        fill="none" stroke="#d1d5db" strokeWidth="1.6" />
      {/* 投手から見た向きの目印 */}
      <text x="2" y="7" fill="#6b7280" fontSize="5" textAnchor="start">一塁側</text>
      <text x={V - 2} y="7" fill="#6b7280" fontSize="5" textAnchor="end">三塁側</text>
      <text x="2" y={V - 2.5} fill="#9ca3af" fontSize="5.5" textAnchor="start">{leftLabel}</text>
      <text x={V - 2} y={V - 2.5} fill="#9ca3af" fontSize="5.5" textAnchor="end">{rightLabel}</text>
      {list.map((p, i) => {
        const x = toX(p.pitchLoc.col, p.pitchLoc.jx ?? 0.5);
        const y = place(p.pitchLoc.row, p.pitchLoc.jy ?? 0.5) * V;
        const latest = i === list.length - 1;
        const rs = resultStyle(p.resultType);
        const r = 4.4 * mk;
        return (
          <g key={i}>
            {/* 最新の1球は白いリングで囲う。赤は「アウト」に使うので色では示せない */}
            {latest && (
              <circle cx={x} cy={y} r={r + 2.4 * mk} fill="none"
                stroke="#f1f5f9" strokeWidth={1.2 * mk} opacity="0.9" />
            )}
            <Marker x={x} y={y} shape={pitchShape(p.pitchLoc.type, leftHandedPitcher)}
              color={rs.color} filled={rs.swung} scale={mk} />
            {/* 何球目か。マーカーの右上に置き、縁取りで背景と分離する */}
            <text x={x + r + 1.6} y={y - r + 1.2} fontSize={6.2} fontWeight="bold"
              fill="#e5e7eb" stroke="#0b0f19" strokeWidth="1.6"
              paintOrder="stroke" textAnchor="start">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** 凡例。**形＝球種（曲がる方向）/ 色＝結果**の2列に分ける */
export function PitchZoneLegend() {
  const Sw = ({ shape, color, filled }) => (
    <svg width="13" height="13" viewBox="-7 -7 14 14" className="flex-shrink-0">
      <Marker x={0} y={0} shape={shape} color={color} filled={filled} />
    </svg>
  );
  return (
    <div className="flex gap-3">
      <div className="flex flex-col gap-1">
        <div className="text-xs text-gray-400">形＝球種</div>
        {PITCH_SHAPE_LEGEND.map(([shape, label]) => (
          <div key={shape} className="flex items-center gap-1.5">
            <Sw shape={shape} color="#cbd5e1" filled={false} />
            <span className="text-xs text-gray-300 leading-none">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-xs text-gray-400">色＝結果</div>
        {RESULT_COLOR_LEGEND.map(([color, label]) => (
          <div key={label} className="flex items-center gap-1.5">
            <Sw shape="circle" color={color} filled />
            <span className="text-xs text-gray-300 leading-none">{label}</span>
          </div>
        ))}
        <div className="text-xs text-gray-400 pt-1 leading-tight">
          塗り＝スイング<br />白丸＝最新<br />数字＝何球目
        </div>
      </div>
    </div>
  );
}
