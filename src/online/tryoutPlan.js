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

/** 守備位置のまとまり。画面の絞り込みと、偏りの警告に使う */
export const POSITION_GROUPS = [
  { key: 'all', label: '全部', positions: null },
  { key: 'pitcher', label: '投手', positions: ['pitcher'] },
  { key: 'catcher', label: '捕手', positions: ['catcher'] },
  { key: 'infield', label: '内野', positions: ['first', 'second', 'third', 'short'] },
  { key: 'outfield', label: '外野', positions: ['left', 'center', 'right'] },
];

const groupOf = (position) =>
  POSITION_GROUPS.find((g) => g.positions?.includes(position))?.key || 'all';

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
  const byId = new Map(candidates.map((p) => [p.id, p]));
  const counts = { pitcher: 0, catcher: 0, infield: 0, outfield: 0 };
  const picked = [];
  for (const id of rankedIds.slice(0, count)) {
    const player = byId.get(id);
    if (!player) continue;
    counts[groupOf(player.position)] += 1;
    picked.push(player);
  }
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
    if (counts.infield < 4) warnings.push('内野手が4人未満です');
    if (counts.outfield < 3) warnings.push('外野手が3人未満です');
  }
  return { counts, blocking, warnings };
}
