// ============================================================
// 投球コースの25分割グリッド - pitchZone.js
//
// ストライクゾーンを3×3に分け、その外側に1マスのボールゾーンを回して 5×5=25。
//
//        col 0    1    2    3    4
//   row 0  ▫    ▫    ▫    ▫    ▫     ← 高めのボール
//   row 1  ▫   ┌─┬─┬─┐  ▫
//   row 2  ▫   │ │ ● │ │  ▫        ● = ど真ん中 (2,2)
//   row 3  ▫   └─┴─┴─┘  ▫
//   row 4  ▫    ▫    ▫    ▫    ▫     ← 低めのボール
//          ↑外角                 ↑内角（右打者から見て）
//
// 【なぜ必要か】
// 従来の投球位置は「ゾーン内/外」と4段階の質(meatball/good/edge/waste)しか
// 持たない1次元のモデルだった。そのため捕手のリードを位置に効かせようとすると
// 「際どく要求する＝ボールになるリスクを上げる」としか表現できず、
// 何度測っても四球のコストが利得を上回った（7通り試して全滅）。
//
// 内外角と高低という2次元が入って初めて「同じ際どさでも、この打者には
// 外角低めが有効」という区別ができる。捕手の仕事が「リスクを取る」から
// 「弱点を突く」に変わる。
//
// 【段階1（このファイルの現状）】
// グリッドと投手の制球によるばらつきだけを導入し、**リーグ成績は一切変えない**。
// 従来の (inZone, quality) を各セルから導出し、周辺分布が一致するよう較正してある。
// 打者の得手不得手（段階2）と捕手の弱点狙い（段階3）はまだ入っていない。
// ============================================================

export const GRID_SIZE = 5;
export const ZONE_MIN = 1;   // ストライクゾーンは col/row とも 1〜3
export const ZONE_MAX = 3;

/** セルがストライクゾーン内か */
export const isStrikeCell = (col, row) =>
  col >= ZONE_MIN && col <= ZONE_MAX && row >= ZONE_MIN && row <= ZONE_MAX;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * セル座標を打者から見た軸に変換する。
 *   colAxis -1 = 外角 / +1 = 内角
 *   rowAxis -1 = 高め / +1 = 低め
 *
 * **ストライクゾーンの3列が -1 / 0 / +1 に対応する**（外側のボールゾーンは
 * 隣のゾーン列と同じ値に丸める）。`(col-2)/2` にすると枠内が -0.5〜+0.5 しか取れず、
 * フル強度のセルがすべてボール球になってしまう。打者の内外角の得手不得手は
 * 「ストライクゾーンの内寄り／外寄り」の話なので、枠内で振り切る必要がある。
 */
export const colAxis = (col) => clamp(col - 2, -1, 1);
export const rowAxis = (row) => clamp(row - 2, -1, 1);

/**
 * セルから従来の quality ラベルを導出する。
 * ゾーン内は中央ほど打ちやすく、四隅ほど打ちにくい。
 * ゾーン外はゾーンと辺を接するセルが「際どい球」、5×5の四隅が「大きく外れ」。
 */
export function cellQuality(col, row) {
  if (isStrikeCell(col, row)) {
    if (col === 2 && row === 2) return 'meatball';          // ど真ん中
    const isCorner = (col === 1 || col === 3) && (row === 1 || row === 3);
    // **ゾーンの隅とゾーン外の際どい球は別物**。隅を 'edge' と同じ扱いにすると
    // 打者ペナルティ(-10/-8)が全投球の56%に掛かり、打率が .234→.224、
    // 防御率が 3.62→3.02 まで振れる。隅は 'corner' として軽い扱いにする。
    return isCorner ? 'corner' : 'good';                     // 四隅 / 上下左右
  }
  // グリッドの外まで外れたら明らかなボール
  if (col < 0 || col > 4 || row < 0 || row > 4) return 'waste';
  // 5×5に収まっていれば「枠のすぐ外」。フレーミングと釣り球の対象になる。
  // 四隅も waste にすると大外れが29%まで膨らみ、実データ(0〜14%)から外れる。
  return 'edge';
}

// 狙いごとの目標セル。捕手が「どこへ要求するか」
const ZONE_CORNERS = [[1, 1], [1, 3], [3, 1], [3, 3]];
// ゾーンで勝負。**ど真ん中(2,2)は狙わない**。
// 中央を目標に含めると、制球の良い投手ほど狙い通り真ん中へ集まって
// 失投が増えるという逆転が起きる（実測: 制球20で失投5.6% / 100で8.5%）。
// 中央の上下左右を狙い、制球が悪いと真ん中へ流れる＝失投、とする。
const ZONE_CELLS = [[1, 2], [3, 2], [2, 1], [2, 3]];
// 誘い球はゾーンのすぐ外。低めと外角が主、高めは吊り球
const CHASE_CELLS = [
  [0, 2], [0, 3], [1, 4], [2, 4], [3, 4],   // 外角・低め（最も多い）
  [4, 2], [4, 3],                            // 内角低め
  [1, 0], [2, 0], [3, 0],                    // 高めの吊り球
];

// 弱点狙いの強さ。リード100でこの係数が丸ごと効く。
// 大きくすると「毎球まったく同じ所へ要求する」になって読まれる想定が崩れるため、
// 弱点側が2〜3倍選ばれやすくなる程度に留めてある。
const TARGET_BETA = 2.2;

/**
 * 捕手が要求する目標セルを決める。
 *
 * 【段階3】同じ狙い(aim)の中で**どのセルを要求するか**だけを打者の弱点で変える。
 * ここが重要で、`zone`/`edge`/`chase` の配分自体には一切手を付けない。
 * 配分を動かす（＝際どく要求する）案は過去に7通り試して全て四球のコストが
 * 利得を上回った。同じ狙いの中での選び直しなら**ボールになる確率が変わらない**ので
 * 四球のコストが発生せず、弱点を突いた利得だけが残る。
 *
 * リード0では完全に一様（従来と同じ）。リードが高いほど弱点側のセルに偏る。
 * 制球が低い投手は目標セルからのばらつきが大きく、狙いが洗い流されるので
 * 「投げ切れる投手にだけ効く」という関係が明示的なゲートなしに自然に出る。
 *
 * @param {'zone'|'edge'|'chase'} aim
 * @param {{profile?:{inside:number,low:number}, lead?:number}} opts
 */
export function pickTargetCell(aim, opts = {}) {
  const cells = aim === 'zone' ? ZONE_CELLS : aim === 'chase' ? CHASE_CELLS : ZONE_CORNERS;
  const { profile, lead = 0 } = opts;
  const t = clamp(lead, 0, 100) / 100;
  // **誘い球(chase)には弱点狙いを掛けない**。
  // 誘い球のセルは「どれも枠のすぐ外」だがストライクになる確率が揃っていない。
  //   [0,2] は列を1つ戻せばストライク（行は中央なので外れにくい）
  //   [0,3] は列を戻してもさらに行が4へ流れてボールになりやすい
  // 弱点狙いは後者のような角寄りのセルを選びがちなので、狙いの配分を変えていない
  // つもりでも四球が増える。実測で BB/9 が +0.34 悪化し、防御率の利得を食い潰した。
  // 誘い球はそもそも振らせる球で、当てさせない球ではないため除外して問題ない。
  if (!profile || t <= 0 || aim === 'chase' || (!profile.inside && !profile.low)) {
    return cells[Math.floor(Math.random() * cells.length)];
  }
  // 弱点側ほど選ばれやすくする（softmax）。合計は常に1なので狙いの配分は不変
  let total = 0;
  const w = new Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const weakness = clamp(
      profile.inside * colAxis(cells[i][0]) + profile.low * rowAxis(cells[i][1]), -1, 1);
    w[i] = Math.exp(TARGET_BETA * t * weakness);
    total += w[i];
  }
  let r = Math.random() * total;
  for (let i = 0; i < cells.length; i++) { r -= w[i]; if (r <= 0) return cells[i]; }
  return cells[cells.length - 1];
}

/** 標準正規乱数（Box-Muller） */
function gaussian() {
  const u1 = Math.random() || 1e-9;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * Math.random());
}

/**
 * 目標セルと制球から、実際に投球が到達したセルを決める。
 *
 * 制球は「狙った所へ投げられる再現性」＝ばらつきの小ささ。
 * σ はセル単位で、制球20→1.30 / 60→0.86 / 100→0.42。
 * グリッドの外（-1 や 5）も返る。それは「大きく外れた球」を意味する。
 *
 * @returns {{col:number,row:number,inZone:boolean,quality:string}}
 */
export function resolvePitchCell(target, control) {
  const c = Math.max(0, Math.min(100, control));
  // σ は**リーグ成績が現行モデルと一致するよう**較正してある
  //（ラベルの周辺分布ではなくリーグ成績が本来の基準）。
  //   制球20→1.18 / 60→0.78 / 100→0.38
  const sigma = 1.38 - (c / 100) * 1.00;
  const col = target[0] + Math.round(gaussian() * sigma);
  const row = target[1] + Math.round(gaussian() * sigma);
  const inZone = isStrikeCell(col, row);
  return { col, row, inZone, quality: cellQuality(col, row) };
}

/** 表示用のラベル（右打者視点） */
export const COL_LABEL = ['外角ボール', '外角', '真ん中', '内角', '内角ボール'];
export const ROW_LABEL = ['高めボール', '高め', '真ん中', '低め', '低めボール'];
