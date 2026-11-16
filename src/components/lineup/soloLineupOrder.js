// ============================================================
// 一人用のスタメン設定の表（`SoloLineupBoard.jsx`）の編集の中身。
// 画面と分けてあるのは、ハーネス（node）から直に検査するため
// （`tools/sim-harness/solo-lineup-board-check.mjs`）。
//
// 【流用元】オンラインPC版のスタメン設定（`src/online/LineupBoard.jsx`・`lineupEdit.js`）。
//   操作は同じ3つ（打順の入れ替え・守備位置の入れ替え・控えとの交代）で、どれも
//   「野手の枠が守備位置を1つずつ持つ」形を崩さない。
// 【オンラインとの違い】
//   - **DH制がある**（`LEAGUE_SETTINGS.useDH`）。DH制は野手9枠（8つの守備位置＋DH）、
//     DH無しは野手8枠＋9番に投手。オンラインは DH 無し固定。
//   - 編集は**その場で `team` に書く**（一人用の画面は保存ボタンを持たない。元に戻すは
//     `LineupSettingContent` の履歴が受け持つ）。
// ⚠ 打順の配列（`team.lineupSettings.battingOrder`）は**同じ配列のまま中身を入れ替える**。
//    新しい配列にすると、参照を握っている側とずれる（`LineupSettingScreen.jsx` の
//    `restoreRoster`、`lineupGenerator` と同じ注意）。
// ============================================================

import { FIELD_POSITIONS, positionFitness } from '../../online/lineupEdit.js';

/** その制度の野手の枠の守備位置（DH制は DH を足した9つ） */
export const slotPositions = (useDH) =>
  useDH ? [...FIELD_POSITIONS, 'dh'] : FIELD_POSITIONS;

/**
 * 打順（`team.lineupSettings.battingOrder`）から編集の形を作る。
 * 野手の枠（DH制9・DH無し8）を、打順の位置に置いた配列。各要素は `{ playerId, position }`、
 * 空きは `playerId: null`。
 * ⚠ 打順が枠の数どおりに1から並んでいれば、その位置に置く（空きの位置を保つ）。
 *    DH無しで投手が9番以外に居る（以前の画面では投手と野手の打順を入れ替えられた）などで
 *    並びが崩れていれば、打順の順に詰めて置く（投手は9番へ回る）。
 */
export function orderFromTeam(team, useDH) {
  const size = useDH ? 9 : 8;
  const positions = slotPositions(useDH);
  const entries = [...(team?.lineupSettings?.battingOrder || [])]
    .filter((e) => e && e.position !== 'pitcher' && e.playerId != null)
    .sort((a, b) => (a.battingOrder || 0) - (b.battingOrder || 0))
    .slice(0, size);
  const numbers = entries.map((e) => e.battingOrder);
  const byNumber =
    entries.every((e) => Number.isInteger(e.battingOrder) && e.battingOrder >= 1 && e.battingOrder <= size) &&
    new Set(numbers).size === numbers.length;
  const slots = Array.from({ length: size }, () => null);
  entries.forEach((e, i) => {
    slots[byNumber ? e.battingOrder - 1 : i] = { playerId: e.playerId, position: e.position };
  });
  // 守備位置が重なる・その制度に無い位置（DH無しで dh など）は、守る人の居ない位置へ回す
  const used = new Set();
  const kept = slots.map((e) => {
    if (e && positions.includes(e.position) && !used.has(e.position)) {
      used.add(e.position);
      return e;
    }
    return e ? { ...e, position: null } : null;
  });
  const free = positions.filter((pos) => !used.has(pos));
  return kept.map((e) => (e && e.position ? e : { playerId: e?.playerId ?? null, position: free.shift() }));
}

// 同じ形か（打順と守備位置）。オンラインの表と同じ関数を使う
export { sameOrder } from '../../online/lineupEdit.js';

/**
 * 編集の形を `team` の打順へ書く（その場で）。空きの枠は書かない。
 * DH無しは9番に投手の枠を置く（今の投手の枠の選手のまま。無ければ `pitcherId`）。
 */
export function writeOrder(team, order, useDH, pitcherId) {
  if (!team.lineupSettings) team.lineupSettings = { battingOrder: [], benchPlayers: [], substitutionRules: { pinchHitter: [], pinchRunner: [] } };
  const lineup = Array.isArray(team.lineupSettings.battingOrder) ? team.lineupSettings.battingOrder : [];
  const fielders = order
    .map((e, i) => (e.playerId == null ? null : { playerId: e.playerId, position: e.position, battingOrder: i + 1 }))
    .filter(Boolean);
  const next = [...fielders];
  if (!useDH) {
    const kept = lineup.find((e) => e.position === 'pitcher');
    const id = kept?.playerId ?? pitcherId;
    if (id != null) next.push({ ...(kept || {}), playerId: id, position: 'pitcher', battingOrder: 9 });
  }
  lineup.splice(0, lineup.length, ...next);
  team.lineupSettings.battingOrder = lineup;
}

/** DH の候補の並び（打撃の能力の合計が高い順。同じなら疲労の少ない順） */
const hitting = (p) => (p.batting?.meet || 0) + (p.batting?.power || 0) + (p.batting?.eye || 0);
export function candidatesForSlot(bench, position) {
  return [...bench].sort((a, b) =>
    position === 'dh'
      ? hitting(b) - hitting(a) || (a.fatigue || 0) - (b.fatigue || 0)
      : positionFitness(b, position) - positionFitness(a, position) || (a.fatigue || 0) - (b.fatigue || 0),
  );
}

/** 試合を組めない形の理由（無ければ空）。⚠ 試合の前に `ensureCompleteLineup` が埋めるので、ここは知らせるだけ */
export function orderProblems(order, players) {
  const byId = new Map((players || []).map((p) => [p.id, p]));
  const problems = [];
  if (order.some((e) => e.playerId == null)) problems.push('空いている打順があります。控えと交代して埋めてください（空いたまま試合の日になると自動で埋めます）');
  if (order.some((e) => e.playerId != null && (!byId.get(e.playerId) || byId.get(e.playerId).isActive === false)))
    problems.push('ベンチ外・名簿に居ない選手が入っています。控えと交代してください');
  return problems;
}
