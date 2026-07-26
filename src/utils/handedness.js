// ============================================================
// 投げ手・打席の生成 - handedness.js
//
// 生成される選手の左右比率をここに一元化する。以前は universityPool /
// tryoutSystem / rosterProgression がそれぞれ別の比率を持っており、
// 生成元によって左打者が35%〜51%までバラついていた。
//
// 【目標分布】打席: 右56% / 左41% / 両3%
//             投げ手: 右75% / 左25%
// 打球方向の計算（simulation-logic.js の velShift / pullTendency）は打席で
// 左右反転するため、この比率がリーグ全体の打球分布そのものを左右する。
// ============================================================

// 投げ手と打席の同時分布。左投げはほぼ左打ち（左投右打は稀）という
// 現実の相関を保つため、独立に振らず組み合わせで持つ。
const HANDEDNESS_TABLE = [
  { p: 0.55, throws: 'right', bats: 'right'  },
  { p: 0.17, throws: 'right', bats: 'left'   },
  { p: 0.03, throws: 'right', bats: 'switch' },
  { p: 0.24, throws: 'left',  bats: 'left'   },
  { p: 0.01, throws: 'left',  bats: 'right'  },
];

/**
 * 投げ手と打席をまとめて決定する。
 * @returns {{throws: 'right'|'left', bats: 'right'|'left'|'switch'}}
 */
export function generateHandedness() {
  let roll = Math.random();
  for (const row of HANDEDNESS_TABLE) {
    roll -= row.p;
    if (roll <= 0) return { throws: row.throws, bats: row.bats };
  }
  return { throws: 'right', bats: 'right' };
}

/**
 * 投げ手が先に決まっている場合（投手/野手でポジション別に左投げ率を変えたい等）の打席。
 * 同時分布を投げ手で条件付けした比率を使う。
 *   右投げ → 右73.3% / 左22.7% / 両4.0%
 *   左投げ → 左96%   / 右4%
 * @param {'right'|'left'} throws
 * @returns {'right'|'left'|'switch'}
 */
export function generateBats(throws) {
  const rows = HANDEDNESS_TABLE.filter(r => r.throws === throws);
  const total = rows.reduce((s, r) => s + r.p, 0);
  let roll = Math.random() * total;
  for (const row of rows) {
    roll -= row.p;
    if (roll <= 0) return row.bats;
  }
  return 'right';
}
