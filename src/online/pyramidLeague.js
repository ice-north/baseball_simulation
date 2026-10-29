// ============================================================
// 多人数ペナントの階層リーグ（7リーグ・42球団）
//
// 設計は docs/online/PYRAMID_LEAGUE.md。
//
//            A        （6球団）
//        B1     B2    （各6球団）
//     C1 C2 C3 C4     （各6球団）
//
// ⚠ **昇降格の出入りが各階層で釣り合うこと**が、この構造の肝。
//    A は降格2・昇格2。B は昇格2＋降格4＝6が出て、A から2・C から4＝6が入る。
//    C は昇格4が出て、B から4が入る。C の5位6位は最下層なので行き先が無い。
//    リーグを足すときは `pyramidBalance()` で釣り合いを確かめること。
//
// ⚠ **生成はシードから決まること**。サーバーと再現で同じ世界にならないと、
//    順位も成績も食い違う（試合の `scheduledGameSeed` と同じ理由）。
//    `Math.random()` をここで呼ばない。
// ============================================================
import { createSeededRandom } from '../game/rng.js';

export const TEAMS_PER_LEAGUE = 6;

/**
 * 階層の定義。`up` は昇格先、`down` は降格先。
 * ⚠ **降格先を2つ書くリーグは、1位ぶんずつ受け取る**（B1 は C1 と C2 から1つずつ）。
 *    ここを片側に寄せると球団数が崩れる。
 */
export const PYRAMID_LEAGUES = [
  { id: 'A',  name: 'Aリーグ',  tier: 0, up: null, down: ['B1', 'B2'] },
  { id: 'B1', name: 'B1リーグ', tier: 1, up: 'A',  down: ['C1', 'C2'] },
  { id: 'B2', name: 'B2リーグ', tier: 1, up: 'A',  down: ['C3', 'C4'] },
  { id: 'C1', name: 'C1リーグ', tier: 2, up: 'B1', down: [] },
  { id: 'C2', name: 'C2リーグ', tier: 2, up: 'B1', down: [] },
  { id: 'C3', name: 'C3リーグ', tier: 2, up: 'B2', down: [] },
  { id: 'C4', name: 'C4リーグ', tier: 2, up: 'B2', down: [] },
];

export const PYRAMID_TEAM_COUNT = PYRAMID_LEAGUES.length * TEAMS_PER_LEAGUE; // 42

/** 降格する順位（1始まり）。最下層は降格しない */
export const RELEGATION_PLACES = [5, 6];
/** 昇格する順位（1始まり）。最上位は昇格しない */
export const PROMOTION_PLACE = 1;

/**
 * 各リーグの出入りが釣り合っているかを数える。
 * 返り値の `balanced` が false なら、どこかのリーグで球団数が増減する。
 */
export function pyramidBalance() {
  const out = {};
  const incoming = {};
  for (const l of PYRAMID_LEAGUES) {
    out[l.id] = 0;
    incoming[l.id] = 0;
  }
  for (const l of PYRAMID_LEAGUES) {
    if (l.up) {
      out[l.id] += 1;              // 1位が上がる
      incoming[l.up] += 1;
    }
    for (const lower of l.down) {
      out[l.id] += 1;              // 降格枠ぶん下がる（降格先ごとに1）
      incoming[lower] += 1;
    }
  }
  const rows = PYRAMID_LEAGUES.map((l) => ({
    id: l.id, out: out[l.id], in: incoming[l.id], net: incoming[l.id] - out[l.id],
  }));
  return { rows, balanced: rows.every((r) => r.net === 0) };
}

// ⚠ **都市と愛称は実在の球団名と重ならないものを使う**。
//    既存の `INDEPENDENT_LEAGUES` は実在球団（徳島インディゴソックス等）なので、
//    生成した球団がそれと同名になると、どちらの話をしているか分からなくなる。
const CITIES = [
  '札幌', '旭川', '函館', '青森', '盛岡', '仙台', '秋田', '山形', '福島', '水戸',
  '宇都宮', '前橋', '川越', '船橋', '八王子', '横浜', '川崎', '相模原', '新潟', '富山',
  '金沢', '福井', '甲府', '長野', '岐阜', '静岡', '浜松', '豊田', '四日市', '大津',
  '堺', '姫路', '奈良', '和歌山', '鳥取', '松江', '岡山', '倉敷', '福山', '下関',
  '北九州', '久留米', '佐世保', '熊本', '大分', '宮崎', '鹿児島', '那覇',
];

const NICKNAMES = [
  'ブレイブス', 'ファルコンズ', 'ドルフィンズ', 'サンダーズ', 'ウィングス', 'レンジャーズ',
  'クルセイダーズ', 'フェニックス', 'バイパーズ', 'サンライズ', 'ストライカーズ', 'ナイツ',
  'ハリケーンズ', 'シャークス', 'ウルブズ', 'コメッツ', 'ブリーズ', 'ジェッツ',
  'キングス', 'パンサーズ', 'ラビッツ', 'シーホース', 'ガーディアンズ', 'アローズ',
  'ブルズ', 'スターズ', 'オーシャンズ', 'ボルケーノズ', 'クレインズ', 'ホエールズ',
  'ロケッツ', 'タイフーンズ', 'サムライズ', 'ミラージュ', 'リバティーズ', 'アトラス',
  'ヴァンガード', 'セイバーズ', 'ダイヤモンズ', 'ノヴァ', 'オライオンズ', 'ゼニス',
];

// 階層ごとの強さ。⚠ 上の階層ほど強いこと（昇降格に意味を持たせるため）
const TIER_RANKS = [
  ['S', 'S', 'A'],       // A
  ['A', 'A', 'B'],       // B1 / B2
  ['B', 'C', 'C', 'D'],  // C1〜C4
];

/** 配列をシード乱数で並べ替える（元の配列は変えない） */
const shuffled = (list, rand) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * 42球団を生成する。`{ id, name, abbreviation, city, rank, league }`。
 * ⚠ 同じ `seed` なら必ず同じ42球団になる。
 */
export function generatePyramidTeams(seed = 20261029) {
  const rand = createSeededRandom(seed);
  const cities = shuffled(CITIES, rand);
  const nicknames = shuffled(NICKNAMES, rand);
  const teams = [];
  let index = 0;
  for (const league of PYRAMID_LEAGUES) {
    const ranks = TIER_RANKS[league.tier];
    for (let n = 0; n < TEAMS_PER_LEAGUE; n++) {
      const city = cities[index % cities.length];
      const nickname = nicknames[index % nicknames.length];
      teams.push({
        id: `py_${league.id}_${n + 1}`,
        name: `${city}${nickname}`,
        abbreviation: city,
        city,
        rank: ranks[Math.floor(rand() * ranks.length)],
        league: league.id,
      });
      index++;
    }
  }
  return teams;
}

/**
 * シーズン終了時の入れ替えを決める。
 * `standings` は `{ [リーグID]: [1位のチームID, 2位, …] }`。
 * 返り値は `{ teamId, from, to }` の配列で、**移動するものだけ**を含む。
 *
 * ⚠ **降格は降格先リーグへ1つずつ割り当てる**。5位を1つ目の降格先へ、6位を2つ目へ。
 *    まとめて同じリーグへ落とすと、そのリーグだけ球団が増える。
 */
export function pyramidMovements(standings) {
  const moves = [];
  for (const league of PYRAMID_LEAGUES) {
    const order = standings[league.id] || [];
    if (league.up && order[PROMOTION_PLACE - 1]) {
      moves.push({ teamId: order[PROMOTION_PLACE - 1], from: league.id, to: league.up });
    }
    league.down.forEach((target, i) => {
      const teamId = order[RELEGATION_PLACES[i] - 1];
      if (teamId) moves.push({ teamId, from: league.id, to: target });
    });
  }
  return moves;
}

// ============================================================
// 日程
//
// ⚠ **既存の `generateFullSeasonSchedule` は使えない**。あちらは
//    `leagueFormat` が `'single'` か `'two'` の2通りしか対応しておらず、
//    7リーグは作れない（実装を読んで確認した）。
//    階層リーグの日程は単純（各リーグ6球団の総当たりの繰り返し）なので、
//    ここで独自に組む。
// ============================================================

/**
 * 6球団の総当たり表を作る（サークル法）。
 * 1巡は5節で、**どの節も全球団が1試合する**。
 * これが「1ターンで全球団が1試合」という設計にそのまま対応する。
 */
function roundRobin(ids) {
  const n = ids.length;
  requireEven(n);
  const arr = [...ids];
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) pairs.push([arr[i], arr[n - 1 - i]]);
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop()); // 先頭を固定して残りを回す
  }
  return rounds;
}

function requireEven(n) {
  if (n % 2 !== 0 || n < 2) {
    throw new Error(`総当たりは偶数の球団数が必要です: ${n}`);
  }
}

/** 1シーズンのターン数。月〜土の24ターン×6日 */
export const SEASON_TURNS = 144;

/**
 * 階層リーグ全体の日程を組む。
 * 返り値は `{ turn, league, home, away }` の配列（`turn` は0始まり）。
 *
 * ⚠ **1巡ごとに本拠地を入れ替えること**。入れ替えないと、同じ相手に対して
 *    片方がずっとホームになり、144試合ぶん積み上がって有利不利が出る。
 */
export function pyramidSchedule(teams, { turns = SEASON_TURNS } = {}) {
  const games = [];
  for (const league of PYRAMID_LEAGUES) {
    const ids = teams.filter((t) => t.league === league.id).map((t) => t.name);
    if (ids.length < 2) continue;
    const rounds = roundRobin(ids);
    for (let turn = 0; turn < turns; turn++) {
      const round = rounds[turn % rounds.length];
      const flip = Math.floor(turn / rounds.length) % 2 === 1;
      for (const [a, b] of round) {
        games.push({
          turn,
          league: league.id,
          home: flip ? b : a,
          away: flip ? a : b,
        });
      }
    }
  }
  return games;
}
