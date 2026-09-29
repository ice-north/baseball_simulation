// ============================================================
// 塁の状態 — 両エンジン共通の約束（`bases[0..2]` = 一塁・二塁・三塁）
//
// 各要素は **走者オブジェクト** か **false**（空き）。
// 自動シミュ（`autoSimulation.js`）は最初から選手オブジェクトを置いており、
// `_reachedOnError`（自責点の判定）もそれに追随させている。
//
// ⚠ **采配モード（`App.jsx`）はまだ `true` を置いている**（誰が居るか分からない）。
//    そのため「盗塁した走者本人に盗塁を付ける」「積極進塁を走者の足で判定する」が
//    できず、打者の値で近似している（CLAUDE.md「2エンジンの突き合わせ」）。
//    このファイルの関数は **`true` と走者オブジェクトのどちらが入っていても同じに動く**
//    （値をそのまま動かすだけで、作り直さない）。采配モードの `newBases[k] = true` を
//    このファイルの関数へ1箇所ずつ置き換え、打者を置く所で `true` の代わりに
//    打者オブジェクトを渡せば、**途中の状態でも壊れずに**走者の識別へ移行できる。
//    移行の手順は CLAUDE.md「采配モードの走者の識別（準備）」を参照
// ============================================================

/** 空き塁 */
export const emptyBases = () => [false, false, false];

/** 誰か居るか（`true` でも走者オブジェクトでも） */
export const isOn = (v) => !!v;

/** 走者オブジェクトを返す。`true`（識別できない旧形式）や空きは null */
export const runnerOf = (v) => (v && typeof v === 'object' ? v : null);

/** 表示用（`RenderBases` 等）に boolean の配列へ落とす */
export const asFlags = (bases) => (bases || []).map(isOn);

export const countRunners = (bases) => (bases || []).filter(isOn).length;

/** 塁に居る走者（識別できるものだけ）と塁番号の組 */
export function listRunners(bases) {
  const out = [];
  (bases || []).forEach((v, i) => { const r = runnerOf(v); if (r) out.push({ base: i, runner: r }); });
  return out;
}

/**
 * 押し出し進塁（四球・死球・打撃妨害）。詰まっている走者だけが1つ進む。
 * @param batter 打者（走者オブジェクト。まだ識別しないなら true）
 * @returns {{ bases, scored: Array }} scored は生還した走者（`true` のこともある）
 */
export function forceAdvance(bases, batter = true) {
  const b = [...bases];
  const scored = [];
  if (b[0]) {
    if (b[1]) {
      if (b[2]) scored.push(b[2]);
      b[2] = b[1];
    }
    b[1] = b[0];
  }
  b[0] = batter;
  return { bases: b, scored };
}

/**
 * 全走者を n 塁ずつ進め、打者を n 塁に置く（安打の基本進塁。積極進塁は別に判定する）。
 * n=4 は本塁打（全員生還・塁は空く）。
 */
export function advanceAll(bases, n, batter = true) {
  const b = emptyBases();
  const scored = [];
  for (let i = 2; i >= 0; i--) {
    if (!bases[i]) continue;
    const to = i + n;
    if (to >= 3) scored.push(bases[i]);
    else b[to] = bases[i];
  }
  if (n >= 4) scored.push(batter);
  else if (n >= 1) b[n - 1] = batter;
  return { bases: b, scored };
}

/**
 * 1人の走者を動かす（盗塁・暴投・積極進塁・タッチアップ）。
 * to が 3 以上なら生還。行き先が埋まっているときは動かさない（上書きで走者を消さない）。
 */
export function moveRunner(bases, from, to) {
  const b = [...bases];
  const v = b[from];
  if (!v) return { bases: b, scored: [], moved: false };
  if (to >= 3) {
    b[from] = false;
    return { bases: b, scored: [v], moved: true };
  }
  if (b[to]) return { bases: b, scored: [], moved: false };
  b[from] = false;
  b[to] = v;
  return { bases: b, scored: [], moved: true };
}

/** 走者を塁から外す（盗塁死・牽制死・併殺・走塁死）。外した走者を返す */
export function removeRunner(bases, at) {
  const b = [...bases];
  const out = b[at];
  b[at] = false;
  return { bases: b, out };
}
