import { createCandidatePlayer } from '../season/tryoutSystem.js';
import { createSeededRandom } from '../game/rng.js';

// ============================================================
// 初期選手セット。リーグを作ると20セットできて、各球団が1つ選ぶ。
//
// ⚠ **初期編成（360人から希望リストを出す）の置き換え**。開幕前は
//    「どのセットを選ぶか」だけを決める。希望リストの画面はシーズン後の
//    トライアウトで使う。
// ⚠ **同じセットを2球団が使えない**。選手のidと名前が重複して、
//    記録がどちらの選手のものか分からなくなる。
// ⚠ 生成は**シードから決まる**こと。サーバーと再現で違う世界になると、
//    順位も成績も食い違う。
// ============================================================

/** 1セットの構成。⚠ 合計24人（名簿の上限）。足し引きするならここだけ直す */
export const PACK_COMPOSITION = [
  { group: 'pitcher', positions: ['pitcher'], count: 11 },
  { group: 'catcher', positions: ['catcher'], count: 2 },
  { group: 'infield', positions: ['first', 'second', 'third', 'short'], count: 5 },
  { group: 'outfield', positions: ['left', 'center', 'right'], count: 4 },
  // 二刀流は本職ごとに1人ずつ
  { group: 'pitcher', positions: ['pitcher'], count: 1, twoWay: true },
  {
    group: 'fielder',
    positions: ['first', 'second', 'third', 'short', 'left', 'center', 'right'],
    count: 1,
    twoWay: true,
  },
];

/** 格付けの内訳。⚠ 合計は1セットの人数と一致させること */
export const PACK_RANKS = { A: 2, B: 10, C: 12 };

/**
 * 格付けごとの能力の段差（平行移動）。
 *
 * ⚠ **リーグの格の表（`RANK_LEVEL_SHIFT`）を流用しないこと**。あれは
 *    「どのリーグか」の段差で、A=0・B=-8・C=-16。選手の格に当てると
 *    平均が11下がって**ほぼ全員がFランク**になった（実測）。
 *    ここは中心をB（±0）に置き、Aを上、Cを下にする。
 * ⚠ 上限や倍率ではなく**平行移動**。差＝選手の形が保たれるので、
 *    「走力だけ図抜けた選手」がCでも figure として残る。
 */
export const PACK_RANK_SHIFT = { A: 10, B: 0, C: -8 };

export const PACK_SIZE = PACK_COMPOSITION.reduce((n, g) => n + g.count, 0);
export const PACK_COUNT = 20;
/** ⚠ 19〜24歳。独立リーグを目指す若い選手という設定 */
export const PACK_MAX_AGE = 24;

/**
 * 選手の「総合」。セット同士の釣り合いを測るためだけに使う。
 *
 * ⚠ **試合の強さではない**。重み付けを変えても試合結果は変わらない
 *    （釣り合いの測り方が変わるだけ）。
 * ⚠ 球速（115〜155）とスタミナ（0〜200）は0〜100ではない。揃えてから足す。
 */
export function packPlayerScore(player) {
  const b = player.batting || {};
  const q = player.pitching || {};
  const bat =
    (b.meet || 0) + (b.power || 0) + (b.eye || 0) + (player.physical?.speed || 0) + (player.fielding?.defense || 0);
  const pit =
    Math.max(0, ((q.velocity || 0) - 115) * 2.5) + (q.control || 0) + (q.stamina || 0) / 2 + (q.spinRate || 0);
  // 投手は投球、野手は打撃守備。二刀流は両方を数える（その価値ぶん重くなる）
  const pitcherSide = player.position === 'pitcher' || player.isTwoWay;
  const fielderSide = player.position !== 'pitcher' || player.isTwoWay;
  return (pitcherSide ? pit : 0) + (fielderSide ? bat : 0);
}

/** 1セットぶんの合計。釣り合いの検査もこれを使う */
export const packScore = (players) =>
  players.reduce((sum, p) => sum + packPlayerScore(p), 0);

/**
 * 格付けを24の枠へ**散らす**。
 *
 * ⚠ 枠の順に配ってはいけない。構成は投手から並んでいるので、Aの2人が
 *    どちらも投手になり、**野手にAが1人も居ない**セットになる（実測）。
 *    少ない格から、空いている枠へ等間隔に置く。
 * ⚠ 全セットで同じ並びになること。セットごとに変えると「当たり」ができる。
 */
export function spreadRanks(size, counts) {
  const slots = new Array(size).fill(null);
  let free = [...Array(size).keys()];
  for (const [rank, n] of Object.entries(counts).sort((a, b) => a[1] - b[1])) {
    const step = free.length / n;
    for (let i = 0; i < n; i += 1) slots[free[Math.floor(i * step + step / 2)]] = rank;
    free = free.filter((s) => slots[s] === null);
  }
  return slots;
}

/**
 * 20セットを作る。
 *
 * ⚠ **作ってから配る**。セットごとに独立に生成すると、合計が偶然ばらついて
 *    「当たりのセット」ができる。枠ごとに20人まとめて作り、
 *    **強い順に、そのとき合計が一番低いセットへ**配ると構成を保ったまま揃う。
 * ⚠ 蛇行（1→20→1→20…）では足りない。実測で開きが7.2%残った
 *    （枠ごとの強弱の幅が大きく、向きを変えるだけでは埋まらない）。
 *    走っている合計を見て配ると 1% 未満になる。
 */
export function generateRosterPacks(seed, { count = PACK_COUNT } = {}) {
  const previous = Math.random;
  Math.random = createSeededRandom(seed);
  try {
    const packs = Array.from({ length: count }, () => []);
    let nextId = seed * 1000;
    const ranks = spreadRanks(PACK_SIZE, PACK_RANKS);
    let rankCursor = 0;
    for (const slot of PACK_COMPOSITION) {
      for (let i = 0; i < slot.count; i += 1) {
        const rank = ranks[rankCursor];
        rankCursor += 1;
        // この枠ぶんを全セット分まとめて作る
        const batch = Array.from({ length: count }, () => {
          const position =
            slot.positions[Math.floor(Math.random() * slot.positions.length)];
          return createCandidatePlayer({
            id: (nextId += 1),
            position,
            rank,
            levelShift: PACK_RANK_SHIFT[rank],
            maxAge: PACK_MAX_AGE,
            isTwoWay: slot.twoWay === true ? true : false,
          });
        });
        // ⚠ 強い順に、合計の低いセットから配る。同点はセット番号で決める
        //    （実行のたびに配り先が変わらないように）
        batch.sort((a, b) => packPlayerScore(b) - packPlayerScore(a) || a.id - b.id);
        const order = packs
          .map((players, index) => ({ index, total: packScore(players) }))
          .sort((a, b) => a.total - b.total || a.index - b.index);
        batch.forEach((player, i) => packs[order[i].index].push(player));
      }
    }
    return packs.map((players, index) => ({
      id: `pack-${index + 1}`,
      name: `セット${index + 1}`,
      players,
    }));
  } finally {
    Math.random = previous;
  }
}

/** 画面に出す要約。⚠ 選ぶのに必要な情報だけ。全選手は別に渡す */
export function packSummary(pack) {
  const counts = { pitcher: 0, catcher: 0, infield: 0, outfield: 0 };
  const ranks = {};
  let twoWay = 0;
  for (const p of pack.players) {
    const group =
      p.position === 'pitcher'
        ? 'pitcher'
        : p.position === 'catcher'
          ? 'catcher'
          : ['first', 'second', 'third', 'short'].includes(p.position)
            ? 'infield'
            : 'outfield';
    counts[group] += 1;
    ranks[p.rank || 'C'] = (ranks[p.rank || 'C'] || 0) + 1;
    if (p.isTwoWay) twoWay += 1;
  }
  const ages = pack.players.map((p) => p.age);
  return {
    id: pack.id,
    name: pack.name,
    counts,
    ranks,
    twoWay,
    averageAge:
      Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10,
    score: Math.round(packScore(pack.players)),
  };
}
