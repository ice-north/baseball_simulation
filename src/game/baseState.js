// ============================================================
// 塁の状態 — 両エンジン共通の約束（`bases[0..2]` = 一塁・二塁・三塁）
//
// 各要素は **走者オブジェクト** か **false**（空き）。
// 自動シミュ（`autoSimulation.js`）は最初から選手オブジェクトを置いており、
// `_reachedOnError`（自責点の判定）もそれに追随させている。
//
// 采配モード（`App.jsx`）は `makeRunner` の要約を置く（選手の実体は React の state で
// 作り直されるため）。このファイルの関数は **`true`（識別できない旧形式）と走者の
// どちらが入っていても同じに動く**（値をそのまま動かすだけで、作り直さない）。
// 詳細は CLAUDE.md「采配モードの走者の識別」
// ============================================================

/**
 * 采配モードで塁に置く走者（選手の要約）。
 * ⚠ **選手オブジェクトそのものを置かないこと**。采配モードの選手は React の state で、
 *    成績を足すたびに `{...p}` で作り直されるので、塁に置いた実体はすぐ古くなる。
 *    塁が要るのは「誰か（id）」「どちらのチームか」「足」だけ
 * @param side 'home' | 'away'（成績を足すチーム。`updateBatterStats` の teamType）
 */
export function makeRunner(player, side) {
  if (!player) return true;   // 選手が引けなければ従来どおり「誰か居る」
  return {
    id: player.id,
    name: player.name,
    side,
    speed: player.physical?.speed ?? 55,
    steal: player.batting?.steal ?? 50,
  };
}

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
