// ============================================================
// PC版スタメン設定（`LineupBoard.jsx`）の編集の中身。画面(JSX)と分けてあるのは、
// ハーネス（node）から直に検査するため（`tools/sim-harness/online-lineup-board-check.mjs`）。
//
// 【編集の単位】野手8人の並び `order`（配列の位置＝打順-1）。各要素は
// `{ playerId, position }`。投手は常に9番で、ここでは扱わない（サーバーの組み立て）。
//
// 【操作は3つだけ】どれも「8人が8つの守備位置を1つずつ守る」形を崩さない。
//   1. 打順を動かす（`moveOrder` / `swapOrder`）… 守備位置は選手に付いたまま
//   2. 守備位置を入れ替える（`swapPositions`）… 打順はそのまま
//   3. 控えと交代する（`replaceStarter`）… 控えがその打順・守備位置にそのまま入る
// ⚠ 以前の画面（一人用の移植）は「✕でスタメンから外す」「守備位置をコンボボックスで
//    選ぶ」作りで、途中に7人・同じ位置に2人という**保存できない形**を経由していた。
//    ここでは保存できない形を作る操作を持たない。
//
// ⚠ 保存の形はサーバーの `validateLineup`（`src/online/shared.js`）が正本。
//    8人ちょうど・打順1〜8・8つの守備位置を1つずつ。9番の投手の枠は入れない。
// ⚠ **投手も野手の枠に入れられる**（二刀流）。守備位置の登録（`player.position`）は
//    そのままで、打順の枠が守る位置を持つ。その投手が先発の日だけ、サーバーが9番・投手に
//    回して野手の枠を控えで埋め、試合の後に戻す（`server/dailyLineup.mjs` の
//    `benchTwoWayStarter`）。
// ============================================================

import {
  FIELDER_REST_FATIGUE,
  SUBSTITUTE_MIN_FITNESS,
  SUBSTITUTE_FRESH_FATIGUE,
} from './shared.js';
import { getPositionFitness } from '../utils/physics.js';

export const FIELD_POSITIONS = [
  'catcher',
  'first',
  'second',
  'third',
  'short',
  'left',
  'center',
  'right',
];

/** 控えの括り。捕手・内野・外野（投手は `benchPitchers` で別に出す） */
export const FIELDER_GROUPS = [
  { id: 'catcher', label: '捕手', positions: ['catcher'] },
  {
    id: 'infield',
    label: '内野手',
    positions: ['first', 'second', 'third', 'short'],
  },
  { id: 'outfield', label: '外野手', positions: ['left', 'center', 'right'] },
];

/**
 * その守備位置の適性（0〜100）。
 * ⚠ 本職は100とみなし、ほかは適性の値（無ければ0）。`server/dailyLineup.mjs` の
 *    休養の代役選びと同じ決まり（画面の候補の並びと、試合の日の代役がずれないように）。
 */
export function positionFitness(player, position) {
  if (!player || !position) return 0;
  return player.position === position
    ? 100
    : getPositionFitness(player, position, 0);
}

/** この選手が守れる位置（適性の高い順）。`min` 未満は守れないとみなす */
export function playablePositions(player, min = SUBSTITUTE_MIN_FITNESS) {
  return FIELD_POSITIONS.map((position) => ({
    position,
    fitness: positionFitness(player, position),
  }))
    .filter((e) => e.fitness >= min)
    .sort((a, b) => b.fitness - a.fitness);
}

/** 保存されている打順（view.lineup）から編集の形を作る */
export function orderFromLineup(lineup) {
  return normalizeOrder(
    [...(lineup?.battingOrder || [])]
      .filter((e) => e && e.position !== 'pitcher')
      .sort((a, b) => (a.battingOrder || 0) - (b.battingOrder || 0))
      .map((e) => ({ playerId: e.playerId, position: e.position })),
  );
}

/**
 * 打順を「8つの守備位置を1つずつ持つ8枠」に整える。
 * ⚠ スマホの全画面編成（✕で外す・守備位置を選ぶ作り）から受け取った編集は、
 *    7人だったり同じ位置に2人だったりする。この画面の操作はどれも8枠・8位置の形を
 *    保つので、崩れたまま受け取ると**どの操作でも直せない**（元に戻すしかない）。
 *    - 9人目以降は外す（控えに戻る）
 *    - 守備位置が重なる・守備位置でない選手は、守る人の居ない位置へ回す
 *    - 足りない枠は空き（`playerId: null`）で埋める。空きは控えとの交代で埋める
 */
export function normalizeOrder(order) {
  const kept = order.slice(0, 8);
  const free = FIELD_POSITIONS.filter(
    (pos) => !kept.some((e) => e.position === pos),
  );
  const used = new Set();
  const next = kept.map((e) => {
    if (FIELD_POSITIONS.includes(e.position) && !used.has(e.position)) {
      used.add(e.position);
      return e;
    }
    return { ...e, position: free.shift() };
  });
  while (next.length < 8) next.push({ playerId: null, position: free.shift() });
  return next;
}

/**
 * 編集の形から、サーバーへ送る `battingOrder` を作る（打順は1〜8に振り直す）。
 * 空きの枠は送らない（空きがあるあいだは保存できない。`orderProblems`）
 */
export function battingOrderFromOrder(order) {
  return order
    .filter((e) => e.playerId != null)
    .map((e, i) => ({
      playerId: e.playerId,
      position: e.position,
      battingOrder: i + 1,
    }));
}

export const sameOrder = (a, b) =>
  a.length === b.length &&
  a.every(
    (e, i) => e.playerId === b[i].playerId && e.position === b[i].position,
  );

/** 打順 `from` の選手を `to` へ動かす（間の選手は1つずつずれる）。ドラッグ用 */
export function moveOrder(order, from, to) {
  if (from === to || !order[from] || to < 0 || to >= order.length) return order;
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** 2人の打順を入れ替える。クリック（行を選んで別の行）用 */
export function swapOrder(order, a, b) {
  if (a === b || !order[a] || !order[b]) return order;
  const next = [...order];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/** 2人の守備位置を入れ替える（打順はそのまま） */
export function swapPositions(order, a, b) {
  if (a === b || !order[a] || !order[b]) return order;
  const next = order.map((e) => ({ ...e }));
  [next[a].position, next[b].position] = [next[b].position, next[a].position];
  return next;
}

/** 打順 `index` の選手を控えの `playerId` と交代する（打順・守備位置を引き継ぐ） */
export function replaceStarter(order, index, playerId) {
  if (!order[index] || order.some((e) => e.playerId === playerId)) return order;
  return order.map((e, i) => (i === index ? { ...e, playerId } : e));
}

/** 名簿のうち野手登録の選手（投手と抹消中を除く）。控えの括りに使う */
export const isFielder = (player) =>
  !!player && player.position !== 'pitcher' && player.isActive !== false;

/**
 * スタメン（野手の枠）に入れられる選手。⚠ 投手も入れられる（二刀流）。抹消中は除く。
 * サーバーの `validateLineup` と同じ決まり。
 */
export const canPlayField = (player) => !!player && player.isActive !== false;

/** 控えの野手。スタメンに入っている選手を除く */
export function benchFielders(roster, order) {
  const used = new Set(order.map((e) => e.playerId));
  return (roster || []).filter((p) => isFielder(p) && !used.has(p.id));
}

/**
 * 控えの投手（野手の枠にも入れられる。二刀流）。⚠ 投手は多いので、画面では
 * 守れる位置（適性が `LOW_FITNESS` 以上）のある投手だけを先に出し、残りは畳んでおく
 */
export function benchPitchers(roster, order) {
  const used = new Set(order.map((e) => e.playerId));
  return (roster || []).filter(
    (p) => canPlayField(p) && p.position === 'pitcher' && !used.has(p.id),
  );
}

/** 投手が野手の枠に入るとしたら一番合う守備位置（無ければ null） */
export const bestFieldPosition = (player) =>
  playablePositions(player, 0)[0]?.position ?? null;

/** 控えを括りごとに分ける（本職の守備位置で） */
export function groupBench(bench) {
  return FIELDER_GROUPS.map((group) => ({
    ...group,
    players: bench.filter((p) => group.positions.includes(p.position)),
  })).filter((group) => group.players.length);
}

/** その守備位置の候補（適性の高い順。同じなら疲労の少ない順） */
export function candidatesFor(bench, position) {
  return [...bench].sort(
    (a, b) =>
      positionFitness(b, position) - positionFitness(a, position) ||
      (a.fatigue || 0) - (b.fatigue || 0),
  );
}

/**
 * 保存できない形の理由（無ければ空）。サーバーの `validateLineup` の打順の部分と同じ。
 * ⚠ 編集の操作では崩れないが、**保存済みの打順が既に崩れている**ことがある
 *    （選手が移籍・解雇で名簿から居なくなった、など）。そのときは交代で埋めてもらう。
 */
export function orderProblems(order, roster) {
  const byId = new Map((roster || []).map((p) => [p.id, p]));
  const problems = [];
  const filled = order.filter((e) => e.playerId != null);
  if (order.length !== 8) problems.push('野手の枠が8人そろっていません');
  if (filled.length < order.length)
    problems.push('空いている打順があります。控えと交代して埋めてください');
  const missing = filled.filter((e) => !canPlayField(byId.get(e.playerId)));
  if (missing.length)
    problems.push(
      '名簿に居ない・起用できない選手が入っています。控えと交代してください',
    );
  if (new Set(filled.map((e) => e.playerId)).size !== filled.length)
    problems.push('同じ選手が2回入っています');
  const positions = new Set(order.map((e) => e.position));
  if (!FIELD_POSITIONS.every((pos) => positions.has(pos)))
    problems.push('守る人の居ない守備位置があります');
  return problems;
}

/** 試合に出すと休ませる疲労（サーバーと同じ値。`shared.js`） */
export const REST_FATIGUE = FIELDER_REST_FATIGUE;
/** 守備位置の適性がこれ未満なら注意を出す（休ませた野手の代役の下限と同じ） */
export const LOW_FITNESS = SUBSTITUTE_MIN_FITNESS;
/** 休ませた野手の代役になれる控えの疲労（これ未満） */
export const FRESH_FATIGUE = SUBSTITUTE_FRESH_FATIGUE;
/**
 * 疲労が休ませる値以上のときの説明。⚠ 必ず休むわけではない。サーバー
 * （`server/dailyLineup.mjs` の `restTiredFielders`）は、守れる控えが居るときだけ入れ替える
 */
export const REST_TEXT = `試合の日は、守れる控え（適性${LOW_FITNESS}%以上・疲労${FRESH_FATIGUE}未満）が居ればその日だけ入れ替わって休みます。居なければそのまま出ます`;
