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
//    野手8人ちょうど・打順1〜8・8つの守備位置を1つずつ・投手は入れない。
// ============================================================

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

/** 控えの括り。捕手・内野・外野（投手はスタメン設定に出さない） */
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
 * ⚠ 本職は適性の値が無くても100とみなす（`server/dailyLineup.mjs` の休養の代役選びと同じ）。
 */
export function positionFitness(player, position) {
  if (!player || !position) return 0;
  const value = player.positionFitness?.[position];
  if (typeof value === 'number') return value;
  return player.position === position ? 100 : 0;
}

/** この選手が守れる位置（適性の高い順）。`min` 未満は守れないとみなす */
export function playablePositions(player, min = 60) {
  return FIELD_POSITIONS.map((position) => ({
    position,
    fitness: positionFitness(player, position),
  }))
    .filter((e) => e.fitness >= min)
    .sort((a, b) => b.fitness - a.fitness);
}

/** 保存されている打順（view.lineup）から編集の形を作る */
export function orderFromLineup(lineup) {
  return [...(lineup?.battingOrder || [])]
    .filter((e) => e && e.position !== 'pitcher')
    .sort((a, b) => (a.battingOrder || 0) - (b.battingOrder || 0))
    .map((e) => ({ playerId: e.playerId, position: e.position }));
}

/** 編集の形から、サーバーへ送る `battingOrder` を作る（打順は1〜8に振り直す） */
export function battingOrderFromOrder(order) {
  return order.map((e, i) => ({
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

/** 名簿のうちスタメンに入れられる野手（投手と抹消中を除く） */
export const isFielder = (player) =>
  !!player && player.position !== 'pitcher' && player.isActive !== false;

/** 控えの野手。スタメンに入っている選手を除く */
export function benchFielders(roster, order) {
  const used = new Set(order.map((e) => e.playerId));
  return (roster || []).filter((p) => isFielder(p) && !used.has(p.id));
}

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
 * 保存できない形の理由（無ければ空）。サーバーの `validateLineup` の野手の部分と同じ。
 * ⚠ 編集の操作では崩れないが、**保存済みの打順が既に崩れている**ことがある
 *    （選手が移籍・解雇で名簿から居なくなった、など）。そのときは交代で埋めてもらう。
 */
export function orderProblems(order, roster) {
  const byId = new Map((roster || []).map((p) => [p.id, p]));
  const problems = [];
  if (order.length !== 8) problems.push('野手が8人そろっていません');
  const missing = order.filter((e) => !isFielder(byId.get(e.playerId)));
  if (missing.length)
    problems.push('名簿に居ない選手が入っています。控えと交代してください');
  if (new Set(order.map((e) => e.playerId)).size !== order.length)
    problems.push('同じ選手が2回入っています');
  const positions = new Set(order.map((e) => e.position));
  if (!FIELD_POSITIONS.every((pos) => positions.has(pos)))
    problems.push('守る人の居ない守備位置があります');
  return problems;
}

/** 試合に出すと休ませる疲労（`server/dailyLineup.mjs` の `FIELDER_REST_FATIGUE` と同じ値） */
export const REST_FATIGUE = 80;
/** 守備位置の適性がこれ未満なら注意を出す（同ファイルの代役の下限と同じ） */
export const LOW_FITNESS = 60;
