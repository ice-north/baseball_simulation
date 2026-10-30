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
import { advanceDate, SEASON_PHASES } from '../season/seasonManager.js';

export const TEAMS_PER_LEAGUE = 6;

/**
 * 階層の定義。
 *
 * - `up`   … 上位から順に、1位・2位…の行き先
 * - `down` … 下位から順に、5位・6位…の行き先
 *
 * ⚠ **どちらも配列で書くこと**。片方を単数にすると「1部は2つ落ちるのに
 *    2部からは1つしか上がらない」という不均衡に気づけない。
 *    7リーグ構成では B1 が C1 と C2 から1つずつ受け取る形になる。
 * ⚠ 構造を変えたら `pyramidBalance()` で出入りの釣り合いを確かめること。
 *    検査（`online-pyramid-check`）が自動で見ている。
 *
 * いまは**2部制12球団**。1部6・2部6で、1部の5位6位が落ち、2部の1位2位が上がる。
 * 7リーグ42球団の構成は保存の容量が無料枠に収まらず見送った
 * （`docs/online/PYRAMID_LEAGUE.md` に実測を残してある）。
 */
export const PYRAMID_LEAGUES = [
  { id: 'A', name: '1部', tier: 0, up: [],    down: ['B'] },
  { id: 'B', name: '2部', tier: 1, up: ['A'], down: [] },
];

export const PYRAMID_TEAM_COUNT = PYRAMID_LEAGUES.length * TEAMS_PER_LEAGUE; // 42

/**
 * 昇格する順位（1始まり・上から数える）。`up` の並びと対応する。
 * 最上位リーグは `up` が空なので昇格しない。
 */
export const PROMOTION_PLACES = [1];
/**
 * 降格する順位（**下から数える**。1 なら最下位）。`down` の並びと対応する。
 * ⚠ **「6位」と上から書かないこと**。1リーグの球団数を変えたときに、
 *    最下位ではない球団が落ちる（6球団から8球団にしたら6位は真ん中になる）。
 */
export const RELEGATION_FROM_BOTTOM = [1];

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
    for (const upper of l.up) {
      out[l.id] += 1;
      incoming[upper] += 1;
    }
    for (const lower of l.down) {
      out[l.id] += 1;
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
//    ⚠ 階層を増やすときはここも足すこと。足りないと `undefined` を引く
const TIER_RANKS = [
  ['S', 'S', 'A', 'A'],  // 1部
  ['B', 'B', 'C', 'D'],  // 2部
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
    league.up.forEach((target, i) => {
      const teamId = order[PROMOTION_PLACES[i] - 1];
      if (teamId) moves.push({ teamId, from: league.id, to: target });
    });
    league.down.forEach((target, i) => {
      // 下から数える。order.length が球団数なので、1 なら最後尾
      const teamId = order[order.length - RELEGATION_FROM_BOTTOM[i]];
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

/**
 * 1シーズンのターン数。**月〜金の24ターン×5日＝120**。
 * 土曜はストーブリーグ、日曜はキャンプ・編成に充てる。
 *
 * ⚠ **120は6球団の総当たりに割り切れる数**（1巡5節 × 24巡）。
 *    144だと28.8巡で最後の1巡が途中で切れ、実測で
 *    「相手によって28試合と29試合」「ホームが71〜74」とばらついた。
 *    120なら全球団が60ホーム・60ビジター、どの相手とも24試合ちょうど。
 *    1リーグの球団数を変えるときは、ここも割り切れる数に直すこと。
 */
export const SEASON_TURNS = 120;

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

/**
 * エンジンが食べられる形の年間日程に変換する。
 * 1ターン＝1日。144ターンぶんの日付を 4/1 から連続で割り当てる。
 *
 * ⚠ **1ターンに1つの日付**。エンジンは `getScheduleByDate` で日付ごとに試合を拾い、
 *    `simulateScheduledGamesOnDate` がその日ぶんを消化する。ターンと日付が
 *    1対1でないと「1ターンで全球団が1試合」が崩れる。
 * ⚠ 4/1 から144日は 8月下旬まで。既存の 4/1〜9/30 の枠に収まる。
 */
export function pyramidSeasonSchedule(teams, { year, turns = SEASON_TURNS } = {}) {
  const dates = [];
  let date = { year, month: 4, day: 1 };
  for (let t = 0; t < turns; t++) {
    dates.push({ ...date });
    date = advanceDate(date, 1);
  }
  return pyramidSchedule(teams, { turns }).map((g, i) => ({
    id: i + 1,
    date: dates[g.turn],
    home: g.home,
    away: g.away,
    starterHome: null,
    starterAway: null,
    result: null,
    phase: SEASON_PHASES.REGULAR_SEASON,
    league: g.league,
  }));
}

/**
 * 順位表をリーグごとの並び（1位から最下位）に分ける。
 *
 * ⚠ **順位表は全球団を通した並び**（勝率順）なので、そのままでは
 *    「2部の1位」が分からない。リーグで絞り直してから順位を見ること。
 * ⚠ 最後に球団名まで見て並びを決める。勝率も勝利数も並んだとき、
 *    順序が実行のたびに変わると昇降格の相手が変わってしまう。
 */
export function standingsByLeague(teams, standings = []) {
  const leagueOf = Object.fromEntries(teams.map((t) => [t.name, t.league]));
  const byName = Object.fromEntries(standings.map((s) => [s.team, s]));
  const result = {};
  for (const league of PYRAMID_LEAGUES) {
    result[league.id] = teams
      .filter((t) => leagueOf[t.name] === league.id)
      .map((t) => t.name)
      .sort((a, b) => {
        const sa = byName[a] || {};
        const sb = byName[b] || {};
        return (
          (sb.winRate || 0) - (sa.winRate || 0) ||
          (sb.wins || 0) - (sa.wins || 0) ||
          (a < b ? -1 : a > b ? 1 : 0)
        );
      });
  }
  return result;
}

/**
 * 昇降格を `teams` へ反映する。移動した一覧を返す。
 * ⚠ **日程を作り直す前に呼ぶこと**。所属が変わってから日程を組まないと、
 *    昇格した球団が元のリーグの相手と戦い続ける。
 */
export function applyPyramidMovements(teams, standings) {
  const moves = pyramidMovements(standingsByLeague(teams, standings));
  for (const move of moves) {
    const team = teams.find((t) => t.name === move.teamId);
    if (team) team.league = move.to;
  }
  return moves;
}
