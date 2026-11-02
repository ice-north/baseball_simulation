import {
  ROSTER_TARGETS,
  rosterGroup,
  rosterCounts,
} from '../utils/constants.js';
// ============================================================
// 初期編成・トライアウトの希望リストを組み立てる計算。
//
// 【サーバー側の約束】提出するのは `{ count, rankedIds }` の2つだけ。
// サーバーは `rankedIds` を上から見て、まだ空いている選手を `count` 人まで取る。
// だから **`rankedIds` には候補を全員残しておく方が得**（競合したとき繰り上がる）。
//
// ⚠ **画面(JSX)と分けてある**。node から直接読めないと検査が書けない。
// ⚠ 候補は実測で **360人**（12球団・初期編成）。以前は360行を1本のリストにして
//    ↑↓ で並べ替えさせており、300番目を1番にするのに299回押す必要があった。
//    ここでは「上位（獲得予定）だけを並べ、残りは推奨順のまま控える」形にする。
// ============================================================


// --- 希望リストを実際の指名へ変える規則 --------------------------------
//
// ⚠ **CPUと同じ目標構成に従うこと**（`ROSTER_TARGETS`）。以前は希望リストを
//    順番どおりに取るだけで構成を見ておらず、候補の38%が投手なので
//    **投手15人・野手9人**（控えゼロ）になっていた。CPUは全球団が
//    投手10・野手14で揃っており、人の球団だけ構造的に不利だった。
// ⚠ サーバーの解決（`resolveTryout`）と画面の「獲得予定」が**同じ関数を使う**こと。
//    片方だけ直すと、画面に出ている顔ぶれと実際に取る顔ぶれが食い違う。

/** 希望順の中から、いま取るべき1人を選ぶ。目標を満たした区分は飛ばす */
export function nextFromPlan(ordered, roster) {
  const counts = rosterCounts(roster);
  const room = (player) => {
    const group = rosterGroup(player.position);
    return counts[group] < ROSTER_TARGETS[group];
  };
  // ⚠ どの区分も埋まっているときは**希望の先頭に戻す**。ここで null を返すと
  //    枠が余っているのに誰も取らない回ができてしまう
  return ordered.find(room) || ordered[0] || null;
}

/**
 * 他球団と競合しなかった場合に、実際に取る顔ぶれ。画面の「獲得予定」に使う。
 * ⚠ 希望リストの上から count 人、ではない。目標構成で飛ばされるぶんがある
 */
export function plannedPicks(rankedIds, candidates, count, roster = []) {
  const byId = new Map(candidates.map((p) => [p.id, p]));
  const pool = rankedIds.map((id) => byId.get(id)).filter(Boolean);
  const taken = [];
  const have = [...roster];
  for (let i = 0; i < count; i += 1) {
    const player = nextFromPlan(
      pool.filter((p) => !taken.includes(p)),
      have,
    );
    if (!player) break;
    taken.push(player);
    have.push(player);
  }
  return taken;
}

/** 守備位置のまとまり。画面の絞り込みと、偏りの警告に使う */
export const POSITION_GROUPS = [
  { key: 'all', label: '全部', positions: null },
  { key: 'pitcher', label: '投手', positions: ['pitcher'] },
  { key: 'catcher', label: '捕手', positions: ['catcher'] },
  { key: 'infield', label: '内野', positions: ['first', 'second', 'third', 'short'] },
  { key: 'outfield', label: '外野', positions: ['left', 'center', 'right'] },
];


// ⚠ **球速とスタミナは0〜100ではない**（球速は115〜155km/h、スタミナは0〜200）。
//    そのまま足すと投手が全員上位に来る。`getAbilityRank` と同じ式で揃える。
export const normalizedVelocity = (value) => (value ? (value - 115) * 2.5 : 0);
export const normalizedStamina = (value) => (value ? value / 2 : 0);

/**
 * 野手・投手をひとつの尺度で粗く並べるための点数。
 * ⚠ **順位付けの目安でしかない**。試合の強さはサーバーの演算で決まる。
 *    ここで重み付けを変えても結果は変わらない（並び順が変わるだけ）。
 */
export function overallScore(player) {
  if (!player) return 0;
  if (player.position === 'pitcher') {
    const p = player.pitching || {};
    return (
      normalizedVelocity(p.velocity) * 0.35 +
      (p.control || 0) * 0.35 +
      normalizedStamina(p.stamina) * 0.2 +
      (p.spinRate || 0) * 0.1
    );
  }
  const b = player.batting || {};
  return (
    (b.meet || 0) * 0.35 +
    (b.power || 0) * 0.3 +
    (player.physical?.speed || 0) * 0.15 +
    (player.fielding?.defense || 0) * 0.2
  );
}

export const SORT_KEYS = [
  { key: 'overall', label: '総合', of: overallScore },
  { key: 'age', label: '年齢', of: (p) => p.age || 0 },
  { key: 'meet', label: 'ミート', of: (p) => p.batting?.meet || 0 },
  { key: 'power', label: 'パワー', of: (p) => p.batting?.power || 0 },
  { key: 'velocity', label: '球速', of: (p) => p.pitching?.velocity || 0 },
  { key: 'control', label: '制球', of: (p) => p.pitching?.control || 0 },
  { key: 'defense', label: '守備', of: (p) => p.fielding?.defense || 0 },
];

/**
 * 候補の絞り込みと並べ替え。
 * ⚠ **並びを決定的にすること**。同点で順番が揺れると、押した行と動く行がずれる。
 */
export function filterCandidates(candidates, { group = 'all', query = '', sortKey = 'overall', desc = true } = {}) {
  const positions = POSITION_GROUPS.find((g) => g.key === group)?.positions;
  const needle = query.trim();
  const of = SORT_KEYS.find((s) => s.key === sortKey)?.of || overallScore;
  return candidates
    .filter((p) => !positions || positions.includes(p.position))
    .filter((p) => !needle || p.name.includes(needle))
    .sort((a, b) => {
      const diff = of(b) - of(a);
      if (diff) return desc ? diff : -diff;
      // 同点は id で固定する（実行のたびに入れ替わらないように）
      return a.id - b.id;
    });
}

/**
 * `rankedIds` の中で1人を指定の位置へ動かす。
 * ⚠ 取り除いてから入れること。先に入れると、元の位置より後ろへ動かしたときに
 *    1つずれる。
 */
export function moveRanked(rankedIds, id, toIndex) {
  // ⚠ 候補に居ない id を**足さない**こと。提出は「全員が候補であること」を
  //    求めるので、1人でも紛れると保存の瞬間だけ弾かれる
  if (!rankedIds.includes(id)) return rankedIds;
  const rest = rankedIds.filter((x) => x !== id);
  const index = Math.max(0, Math.min(rest.length, toIndex));
  return [...rest.slice(0, index), id, ...rest.slice(index)];
}

// --- 画面の操作（獲得予定を基準にした並べ替え） --------------------------
//
// ⚠ **画面の操作は `rankedIds` ではなく「獲得予定」を基準にすること**。
//    獲得予定は希望順の上から count 人ではなく、目標構成（投10・捕2・内6・外6）を
//    超える区分を飛ばした顔ぶれ。初期編成は24人＝目標の合計ちょうどなので、
//    **どの区分も必ず目標まで埋まっている**。以前は `rankedIds` の位置で操作しており、
//    - 「指名に加える」は候補の約9割で何も起きなかった（実測336人中301人。
//      最後の獲得予定と同じ区分の選手しか入らない）
//    - 飛ばされた選手が間に挟まると「↓」で選手が獲得予定から消え、
//      控えの選手が代わりに入った
//    - 「指名中 N位」が獲得予定の番号とずれた
//    という形で、入れ替えるほど画面が壊れて見えた。
// ⚠ どの操作のあとも `normalizeRanked` で並べ直す。並べ直したあとは
//    **`rankedIds` の先頭が獲得予定と同じ順で並ぶ**ので、画面の並びと
//    サーバーが取りにいく順が一致する（提出の中身は並べ替えだけで、人は増減しない）。

/** 獲得予定を先頭に、残りを元の順で後ろに並べ直す */
export function normalizeRanked(rankedIds, candidates, count, roster = []) {
  const picked = plannedPicks(rankedIds, candidates, count, roster).map((p) => p.id);
  const set = new Set(picked);
  return [...picked, ...rankedIds.filter((id) => !set.has(id))];
}

/**
 * 控えの選手を獲得予定へ入れる。代わりに1人が控えの先頭へ回る。
 * 押し出すのは、同じ区分が目標に達していれば**同じ区分の最後の人**、
 * そうでなければ獲得予定の最後の人。`first` なら獲得予定の先頭へ、
 * そうでなければ末尾へ入れる。
 */
export function addToPlan(rankedIds, candidates, count, roster, id, { first = false } = {}) {
  if (!rankedIds.includes(id) || count <= 0) return rankedIds;
  const byId = new Map(candidates.map((p) => [p.id, p]));
  const player = byId.get(id);
  if (!player) return rankedIds;
  const wanted = plannedPicks(rankedIds, candidates, count, roster).map((p) => p.id);
  if (wanted.includes(id)) {
    // すでに獲得予定。最優先へだけは先頭へ動かす
    if (!first) return normalizeRanked(rankedIds, candidates, count, roster);
    return normalizeRanked(
      [id, ...rankedIds.filter((x) => x !== id)],
      candidates,
      count,
      roster,
    );
  }
  const group = rosterGroup(player.position);
  const counts = rosterCounts([...roster, ...wanted.map((x) => byId.get(x))]);
  const sameGroup = wanted.filter((x) => rosterGroup(byId.get(x).position) === group);
  const victim =
    counts[group] >= ROSTER_TARGETS[group] && sameGroup.length
      ? sameGroup.at(-1)
      : wanted.length >= count
        ? wanted.at(-1)
        : null;
  const kept = wanted.filter((x) => x !== victim);
  const rest = rankedIds.filter((x) => x !== id && x !== victim && !kept.includes(x));
  const order = first
    ? [id, ...kept, ...(victim ? [victim] : []), ...rest]
    : [...kept, id, ...(victim ? [victim] : []), ...rest];
  return normalizeRanked(order, candidates, count, roster);
}

/**
 * 獲得予定から外して控えの**末尾**へ回す（消さない）。
 * ⚠ 控えの先頭に置くと、空いた枠にその本人がそのまま戻ってきて何も起きない。
 *    空いた枠には、控えのうち同じ条件で取れる一番上の選手が繰り上がる。
 */
export function benchFromPlan(rankedIds, candidates, count, roster, id) {
  if (!rankedIds.includes(id)) return rankedIds;
  return normalizeRanked(
    [...rankedIds.filter((x) => x !== id), id],
    candidates,
    count,
    roster,
  );
}

/**
 * 獲得予定の中で隣と入れ替える（↑↓用）。獲得予定の顔ぶれは変えない。
 * ⚠ `rankedIds` の隣ではなく**獲得予定の隣**と入れ替える。
 */
export function shiftInPlan(rankedIds, candidates, count, roster, index, delta) {
  const normalized = normalizeRanked(rankedIds, candidates, count, roster);
  const wantedCount = plannedPicks(normalized, candidates, count, roster).length;
  const next = index + delta;
  if (index < 0 || next < 0 || index >= wantedCount || next >= wantedCount)
    return normalized;
  return normalizeRanked(swapRanked(normalized, index, delta), candidates, count, roster);
}

/** 隣と入れ替える（↑↓用）。端なら何もしない */
export function swapRanked(rankedIds, index, delta) {
  const next = index + delta;
  if (index < 0 || next < 0 || index >= rankedIds.length || next >= rankedIds.length)
    return rankedIds;
  const copy = [...rankedIds];
  [copy[index], copy[next]] = [copy[next], copy[index]];
  return copy;
}

/**
 * 獲得予定（上位 count 人）の内訳と、成り立たない点・物足りない点。
 *
 * ⚠ `blocking` は**サーバーが実際に拒む条件**と同じにしてある
 *    （`leagueEngine` の「投手・捕手・野手が不足します」）。
 *    野手8人・投手1人・捕手1人を満たさないと、手続き全体が失敗して
 *    **全員が先へ進めない**。以前は提出した瞬間に初めて知らされた。
 * ⚠ ただし**提出を画面側で止めない**。正本はサーバーで、ここで止めると
 *    条件が食い違ったときに正しい提出まで塞いでしまう。
 * ⚠ `warnings` は助言。足りない位置はサーバーが自動で埋めるので、
 *    「希望どおりにならない」という意味。
 */
export function planSummary(rankedIds, candidates, count, roster = []) {
  // ⚠ **希望順の上から count 人、ではない**。目標構成で飛ばされるぶんがあるので、
  //    サーバーと同じ規則で「実際に取る顔ぶれ」を出してから数える。
  //    ここを `slice(0, count)` に戻すと、画面の顔ぶれと実際が食い違う
  const picked = plannedPicks(rankedIds, candidates, count, roster);
  const counts = rosterCounts(picked);
  const combined = [...roster, ...picked];
  const fielders = combined.filter((p) => p.position !== 'pitcher').length;
  const pitchers = combined.filter((p) => p.position === 'pitcher').length;
  const catchers = combined.filter((p) => p.position === 'catcher').length;
  const blocking = [];
  if (fielders < 8) blocking.push(`野手が${fielders}人（8人以上必要）`);
  if (pitchers < 1) blocking.push('投手が1人もいません');
  if (catchers < 1) blocking.push('捕手が1人もいません');

  const warnings = [];
  if (!blocking.length) {
    if (counts.pitcher < 5) warnings.push('投手が5人未満です');
    if (counts.infielder < 4) warnings.push('内野手が4人未満です');
    if (counts.outfielder < 3) warnings.push('外野手が3人未満です');
  }
  return { counts, picked, targets: ROSTER_TARGETS, blocking, warnings };
}
