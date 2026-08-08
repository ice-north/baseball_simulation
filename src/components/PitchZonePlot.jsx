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

import { PITCH_AXIS_SIDE } from '../game/pitchShape.js';

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
//   ◁▷ 横に逃げる球
//   ◣◢ 横に逃げながら落ちる球（シンカー）
//
// 横変化の向きは**投手の利き腕で逆になる**。画面は投手視点なので
// 画面左 = 一塁側 / 画面右 = 三塁側。
//   右投手 … グラブ側は一塁側 → スライダー系は ◁ / シュート系は ▷
//   左投手 … グラブ側は三塁側 → スライダー系は ▷ / シュート系は ◁
//
// ⚠ **どちら側に逃げるかを手書きの表で持たないこと**。ここに独自の表を
// 置いていたため `PITCH_AXIS_SIDE` と食い違い、**腕側(+0.8)のシンカーが
// グラブ側のスライダーと同じ ◁ になっていた**（右投手のシンカーは
// 三塁側へ逃げながら落ちるので ◢ が正しい）。向きは pitchShape.js を正とし、
// ここでは「縦に落ちるかどうか」の分類だけを持つ。
const SHAPE_FAMILY = {
  straight: 'circle',
  curve: 'up',
  fork: 'down', splitter: 'down', changeup: 'down', palm: 'down', knuckle: 'down',
  // 'side' = 横に逃げる / 'sideDown' = 逃げながら落ちる（PITCH_AXIS_VERTICAL が高い）
  slider: 'side', cutter: 'side', shoot: 'side', twoSeam: 'side',
  sinker: 'sideDown',
};
export const PITCH_SHAPE_LEGEND = [
  ['circle', 'ストレート'], ['up', 'カーブ'], ['down', '落ちる球'],
  ['left', 'スライダー系'], ['right', 'シュート系'], ['downRight', 'シンカー'],
];

// 三角の向き（画面座標。x+ = 三塁側 / y+ = 下）。circle はここに無い
const D = Math.SQRT1_2;
const TRI_DIR = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
  downLeft: [-D, D], downRight: [D, D],
};

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
  const fam = SHAPE_FAMILY[t] || 'circle';
  if (fam !== 'side' && fam !== 'sideDown') return fam;
  // 腕側(+)かグラブ側(-)かは pitchShape.js の PITCH_AXIS_SIDE を正とする。
  // 右投手の腕側は三塁側＝画面右、左投手はその逆。
  const arm = PITCH_AXIS_SIDE[t] ?? 0;
  const toRight = leftHanded ? arm < 0 : arm > 0;
  if (fam === 'sideDown') return toRight ? 'downRight' : 'downLeft';
  return toRight ? 'right' : 'left';
};

// **何球目かはマーカーの中に書く**（スポーツナビの投球図と同じ）。
// 以前は右上に添えていたが、点が増えると数字どうしが重なって読めなかった。
// 中に入れるぶんマーカーを大きくする必要があるので、形（球種）は
// 数字が収まるサイズで描く。
function Marker({ x, y, shape = 'circle', color = '#9ca3af', filled = false, scale = 1, label = '' }) {
  // 基準半径。**マーカーの実寸を決めるのはここだけ**（`mk` が枠の大きさを
  // 打ち消すので、枠を広げてもマーカーは大きくならない）。
  // 打席が長引くと点が密集して図が狭く見えるので、三角と同じ幅で1段階詰めた
  // （7.0 → 6.5。168px 表示で直径 16.8px → 15.6px）。
  const r = 6.5 * scale;
  const w = 1.6 * scale;
  const fill = filled ? color : '#0b0f19';
  const common = { fill, stroke: color, strokeWidth: w, strokeLinejoin: 'round' };
  // 三角は同じ外接円でも面積が小さいので、数字が収まるよう少し大きく取る。
  // ⚠ 大きくしすぎると〇のストレートより目立って球種の重みが揃わない。
  // 1.18 では2桁（10球目以降）が輪郭に触れていたので、枠は 1.10 に詰めて
  // **2桁のときだけ数字を小さくする**（1桁は従来どおりの大きさ）。
  const t = r * 1.10;
  const dir = TRI_DIR[shape];
  let body;
  if (dir) {
    // 頂点は向き d の先。底辺は逆側へ 0.72、そこから法線方向へ ±1
    const [dx, dy] = dir, nx = -dy, ny = dx;
    body = <polygon {...common} points={
      `${x + dx * t},${y + dy * t} ` +
      `${x - dx * t * 0.72 + nx * t},${y - dy * t * 0.72 + ny * t} ` +
      `${x - dx * t * 0.72 - nx * t},${y - dy * t * 0.72 - ny * t}`} />;
  } else {
    body = <circle cx={x} cy={y} r={r} {...common} />;
  }
  // 三角は重心が中心からずれるので数字を頂点と逆へ寄せる
  const back = shape === 'up' ? 0.34 : shape === 'down' ? 0.22 : 0.20;
  const tx = dir ? x - dir[0] * r * back : x;
  const ty = dir ? y - dir[1] * r * back : y;
  return (
    <g>
      {body}
      {label !== '' && (
        <text x={tx} y={ty} fontSize={r * (String(label).length >= 2 ? 0.95 : 1.15)} fontWeight="bold"
          fill={filled ? '#0b0f19' : color} textAnchor="middle" dominantBaseline="central">
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * 捕手のシルエット（枠の中央下、構えている姿）。
 * スポーツナビの投球図と同じく「捕手の後ろから見ている」画にするための背景。
 * マーカーより必ず薄く描く。
 */
function CatcherSilhouette() {
  return (
    // 等倍だとしゃがんだ膝が5×5の外枠からはみ出し、ゾーンより捕手が主役に見える。
    // 図の主役はあくまで投球位置なので、重心(50,63)まわりで少しだけ縮める
    <g opacity="0.13" fill="#cbd5e1" transform="translate(50,63) scale(0.85) translate(-50,-63)">
      {/* ヘルメット */}
      <circle cx="50" cy="40" r="8.5" />
      {/* 肩・胴（プロテクター） */}
      <path d="M36,52 q14,-7 28,0 l4,26 q-18,7 -36,0 z" />
      {/* 太もも（しゃがんだ膝） */}
      <ellipse cx="33" cy="82" rx="10" ry="13" />
      <ellipse cx="67" cy="82" rx="10" ry="13" />
      {/* ミット */}
      <circle cx="70" cy="60" r="7" />
    </g>
  );
}

/**
 * 打者のシルエット（枠の左側に立つ姿を描き、右打者は左右反転して使う）。
 * 「いま誰がどちらの打席か」を文字を読まずに分かるようにするための目印。
 * 薄く描いてマーカーの視認性を落とさない。
 */
// 枠の外に立たせる（スポーツナビの図と同じ）。以前は枠に重なっていて
// マーカーが読みにくかった
//
// **バットと腕は描かない**。この絵の役目は「どちらの打席に立っているか」を
// 文字を読まずに伝えることだけで、構えを描き込む必要はない。バットは
// ゾーン側へ張り出してマーカーと重なるし、バットを消したまま腕だけ残すと
// 何かを指しているように見える。そのぶん**身体を一回り大きく**して、
// 左右どちらかが遠目でも分かるようにしてある。
// translate は x=50 での鏡映（x' = 100 - s·x）。scale を変えたらここも変わる
function BatterSilhouette({ onRight }) {
  return (
    <g opacity="0.16" fill="#93c5fd"
      transform={onRight ? 'translate(100,0) scale(-0.95,0.95)' : 'scale(0.95,0.95)'}>
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

// 打者のコース適性を背景に敷く色。**赤=得意 / 青=苦手**で選手詳細のヒートマップと揃える。
// 投手にとっては「赤いところへ投げてはいけない」という読み方になる。
// マーカー（結果の意味色）より必ず薄くすること。塗りが濃いと点が読めなくなる。
const HEAT_MAX_ALPHA = 0.30;
const HEAT_DEADZONE = 0.06;
export const HEAT_HOT = '#ef4444';
export const HEAT_COLD = '#3b82f6';

/**
 * @param {Array}  pitches       この打席の投球（古い順）。{ pitchLoc, resultType }
 * @param {number} size          1辺のピクセル
 * @param {string} bats          打者の左右（'right' | 'left' | 'switch'）
 * @param {string} pitcherThrows 投手の利き腕。スイッチヒッターの打席を決めるのに使う
 * @param {Array}  heat          打者のコース適性 5×5（zoneHeatmap の戻り値。+1=得意 / -1=苦手）。
 *                               **打者基準で渡すこと**。ここで投手視点へ反転する
 */
export default function PitchZonePlot({
  pitches = [], size = 96, bats = 'right', pitcherThrows = 'right', heat = null,
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
      {/* 打者のコース適性。**投球位置と同じ図に重ねる**のが一番読みやすいので、
          対戦カードに別の小さいヒートマップを置くのはやめてここへ寄せた。
          heat は打者基準なので、投球位置と同じ規則で左打者だけ反転する */}
      {heat && heat.map((line, r) => line.map((v, c) => {
        if (Math.abs(v) < HEAT_DEADZONE) return null;
        const cc = flip ? SIZE - 1 - c : c;
        const w = V / SPAN;
        return (
          <rect key={`h${r}-${c}`} x={((cc + PAD) / SPAN) * V} y={((r + PAD) / SPAN) * V}
            width={w} height={w} fill={v > 0 ? HEAT_HOT : HEAT_COLD}
            opacity={Math.min(HEAT_MAX_ALPHA, Math.abs(v) * HEAT_MAX_ALPHA * 1.15)} />
        );
      }))}
      {/* 捕手（中央）→ 打者（枠の外）の順に薄く敷く。
          スポーツナビの投球図と同じ「捕手の後ろから見た画」にする */}
      <CatcherSilhouette />
      {/* 投手から見て 右打者は画面右・左打者は画面左に立つ */}
      <BatterSilhouette onRight={!flip} />
      {/* ストライクゾーン 3×3 */}
      {[1, 2].map(i => (
        <g key={i} stroke="#6b7280" strokeWidth="0.6">
          <line x1={z0 + step * i} y1={z0} x2={z0 + step * i} y2={z1} />
          <line x1={z0} y1={z0 + step * i} x2={z1} y2={z0 + step * i} />
        </g>
      ))}
      {/* 外枠（5×5の範囲）は薄く、内枠（ストライクゾーン）を強調する */}
      <rect x={z0 - step} y={z0 - step} width={(z1 - z0) + step * 2} height={(z1 - z0) + step * 2}
        fill="none" stroke="#4b5563" strokeWidth="0.8" />
      <rect x={z0} y={z0} width={z1 - z0} height={z1 - z0}
        fill="none" stroke="#e5e7eb" strokeWidth="1.8" />
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
        const r = 7.0 * mk;
        return (
          <g key={i}>
            {/* 最新の1球は白いリングで囲う。赤は「アウト」に使うので色では示せない */}
            {latest && (
              <circle cx={x} cy={y} r={r + 3.2 * mk} fill="none"
                stroke="#f1f5f9" strokeWidth={1.3 * mk} opacity="0.9" />
            )}
            <Marker x={x} y={y} shape={pitchShape(p.pitchLoc.type, leftHandedPitcher)}
              color={rs.color} filled={rs.swung} scale={mk} label={i + 1} />
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
