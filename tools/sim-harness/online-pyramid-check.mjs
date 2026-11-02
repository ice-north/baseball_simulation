// 階層リーグ（7リーグ・42球団）の構造と入れ替えを検査する。
//
// ⚠ この検査の主目的は**球団数が増減しないこと**。昇降格は出入りの数が
//    1つでもずれると、翌シーズンにどこかのリーグが5球団や7球団になる。
//    リーグを足す・降格枠を変えるときは、必ずここで釣り合いを確かめること。
// ⚠ 生成は**シードから決まること**も見る。サーバーと再現で違う世界になると、
//    順位も成績も食い違う。
import assert from 'node:assert/strict';
import {
  PYRAMID_LEAGUES,
  TEAMS_PER_LEAGUE,
  PYRAMID_TEAM_COUNT,
  pyramidBalance,
  generatePyramidTeams,
  pyramidMovements,
  pyramidSchedule,
  standingsByLeague,
  applyPyramidMovements,
  SEASON_TURNS,
  REST_EVERY,
  gamesPerTeam,
  isRestTurn,
  pyramidSeasonSchedule,
  topTierTeamNames,
} from '../../src/online/pyramidLeague.js';
import { upcomingGames } from '../../server/projection.mjs';

// --- 構造 ---------------------------------------------------------
// いまは2部制12球団。⚠ 個々のリーグ名を決め打ちにしない——構造は変わりうる。
//    **変わっても壊れてはいけない性質**だけをここで押さえる。
assert.ok(PYRAMID_LEAGUES.length >= 2, 'リーグが2つ以上ある');
assert.equal(PYRAMID_TEAM_COUNT, PYRAMID_LEAGUES.length * TEAMS_PER_LEAGUE);
// 階層は 0 から連番で埋まっている（飛びがあると昇降格の相手が居なくなる）
const tiers = [...new Set(PYRAMID_LEAGUES.map((l) => l.tier))].sort((a, b) => a - b);
assert.deepEqual(tiers, tiers.map((_, i) => i), '階層が0から連番でない');
// 最上位は昇格先を持たない。最下層は降格先を持たない
const top = PYRAMID_LEAGUES.filter((l) => l.tier === 0);
const bottom = PYRAMID_LEAGUES.filter((l) => l.tier === Math.max(...tiers));
for (const l of top) assert.equal(l.up.length, 0, `${l.id} に昇格先がある`);
for (const l of bottom) assert.equal(l.down.length, 0, `${l.id} に降格先がある`);

// --- 出入りの釣り合い（この検査の主目的） --------------------------
const balance = pyramidBalance();
assert.ok(
  balance.balanced,
  `昇降格の出入りが釣り合っていない: ${JSON.stringify(balance.rows)}`,
);
// A は2つ出て2つ入る / B は6つ出て6つ入る（2リーグ合計）/ C は4つ出て4つ入る
// 入れ替えが1つも起きない構造は設計の誤り（昇降格が無いのと同じ）
assert.ok(
  balance.rows.some((r) => r.out > 0),
  '入れ替えが1つも起きない',
);

// --- 生成 ---------------------------------------------------------
const teams = generatePyramidTeams(20261029);
assert.equal(teams.length, PYRAMID_TEAM_COUNT);
// 各リーグちょうど6球団
for (const l of PYRAMID_LEAGUES) {
  assert.equal(
    teams.filter((t) => t.league === l.id).length,
    TEAMS_PER_LEAGUE,
    `${l.id} の球団数がちがう`,
  );
}
// 名前・ID・都市が重複しない（同名だとどちらの話か分からなくなる）
for (const key of ['id', 'name', 'city']) {
  assert.equal(new Set(teams.map((t) => t[key])).size, PYRAMID_TEAM_COUNT, `${key} が重複している`);
}
// 必要な属性が揃っている（既存の独立リーグと同じ形）
for (const t of teams) {
  for (const key of ['id', 'name', 'abbreviation', 'city', 'rank', 'league']) {
    assert.ok(t[key], `${t.id} の ${key} が空`);
  }
}

// ⚠ シードが同じなら同じ世界になること
assert.deepEqual(generatePyramidTeams(20261029), teams, 'シードが同じなのに結果が違う');
assert.notDeepEqual(generatePyramidTeams(777), teams, 'シードを変えても同じ結果になった');

// 上の階層ほど強い（昇降格に意味を持たせるため）
const strength = { S: 4, A: 3, B: 2, C: 1, D: 0 };
const tierAvg = tiers.map((tier) => {
  const ids = PYRAMID_LEAGUES.filter((l) => l.tier === tier).map((l) => l.id);
  const list = teams.filter((t) => ids.includes(t.league));
  return list.reduce((s, t) => s + strength[t.rank], 0) / list.length;
});
assert.ok(
  tierAvg.every((v, i) => i === 0 || tierAvg[i - 1] > v),
  `階層の強さが逆転している: ${tierAvg.map((v) => v.toFixed(2)).join(' / ')}`,
);

// --- 入れ替え -----------------------------------------------------
// 各リーグの順位を「そのリーグの6球団を1位から順に並べたもの」として作る
const standings = Object.fromEntries(
  PYRAMID_LEAGUES.map((l) => [l.id, teams.filter((t) => t.league === l.id).map((t) => t.id)]),
);
const moves = pyramidMovements(standings);

// 昇格と降格の数は釣り合っているので、移動数は「出る数の合計」と一致する
const expectedMoves = balance.rows.reduce((n, r) => n + r.out, 0);
assert.equal(moves.length, expectedMoves, `移動数がちがう: ${moves.length}`);

// 移動後も各リーグ6球団であること（この検査の本丸）
const after = Object.fromEntries(PYRAMID_LEAGUES.map((l) => [l.id, TEAMS_PER_LEAGUE]));
for (const m of moves) {
  after[m.from] -= 1;
  after[m.to] += 1;
}
for (const l of PYRAMID_LEAGUES) {
  assert.equal(after[l.id], TEAMS_PER_LEAGUE, `入れ替え後に ${l.id} が ${after[l.id]}球団になった`);
}

// 同じ球団が二重に動かない（1位かつ5位、は起こり得ない）
assert.equal(new Set(moves.map((m) => m.teamId)).size, moves.length, '同じ球団が二重に動いている');

// 1位は必ず1つ上の階層へ、5位6位は必ず1つ下の階層へ
const tierOf = Object.fromEntries(PYRAMID_LEAGUES.map((l) => [l.id, l.tier]));
for (const m of moves) {
  assert.equal(Math.abs(tierOf[m.to] - tierOf[m.from]), 1, `${m.from}→${m.to} が1階層ぶんでない`);
}

// 順位が足りないリーグ（参加者不足など）でも落ちない
assert.doesNotThrow(() => pyramidMovements({ A: [], B1: ['x'] }));

// --- 日程 ---------------------------------------------------------
// ⚠ 既存の generateFullSeasonSchedule は single / two しか対応しておらず
//    7リーグを組めない。独自に組んでいるぶん、ここで性質を押さえる。
const schedule = pyramidSchedule(teams);
// ⚠ **休養日のぶんを引くこと**。毎ターン試合があると、出ずっぱりの選手は
//    一度も疲労が回復しない（`_playedToday`）。実測で20試合の時点で
//    一人用が平均24・最大97なのに対し、オンラインは平均104・最大281まで積み上がり、
//    本塁打が一人用の1/5になっていた。
assert.equal(
  schedule.length,
  PYRAMID_LEAGUES.length * (TEAMS_PER_LEAGUE / 2) * gamesPerTeam(),
  'リーグ数×1ターンの試合数×試合のあるターン数',
);
assert.equal(gamesPerTeam(), SEASON_TURNS - SEASON_TURNS / REST_EVERY);
assert.ok(
  gamesPerTeam() % (TEAMS_PER_LEAGUE - 1) === 0,
  `試合数 ${gamesPerTeam()} が総当たり（${TEAMS_PER_LEAGUE - 1}相手）に割り切れない`,
);
assert.ok(gamesPerTeam() % 2 === 0, 'ホームとビジターが半々にならない');
// 休養ターンには試合が無く、試合のあるターンには全球団ぶんある
const turnsWithGames = new Set(schedule.map((g) => g.turn));
for (let turn = 0; turn < SEASON_TURNS; turn += 1)
  assert.equal(
    turnsWithGames.has(turn),
    !isRestTurn(turn),
    `ターン${turn}の休養日の扱いがちがう`,
  );
assert.equal(
  SEASON_TURNS - turnsWithGames.size,
  SEASON_TURNS / REST_EVERY,
  '休養ターンの数がちがう',
);

const played = {};
const homeCount = {};
for (const g of schedule) {
  played[g.home] = (played[g.home] || 0) + 1;
  played[g.away] = (played[g.away] || 0) + 1;
  homeCount[g.home] = (homeCount[g.home] || 0) + 1;
}
assert.equal(Object.keys(played).length, PYRAMID_TEAM_COUNT, '全球団に試合がある');
for (const [name, n] of Object.entries(played)) {
  assert.equal(n, gamesPerTeam(), `${name} の試合数がちがう: ${n}`);
}

// ⚠ **1ターンに2試合する球団がいないこと**。1ターン＝1時間＝1試合なので、
//    重複すると「全球団が毎時1試合」という前提が崩れる。
const byTurn = {};
for (const g of schedule) (byTurn[g.turn] ||= []).push(g.home, g.away);
for (const [turn, names] of Object.entries(byTurn)) {
  assert.equal(new Set(names).size, names.length, `ターン${turn}に2試合する球団がいる`);
  assert.equal(names.length, PYRAMID_TEAM_COUNT, `ターン${turn}で全球団が試合していない`);
}

// リーグをまたぐ対戦は無い
const leagueOfTeam = Object.fromEntries(teams.map((t) => [t.name, t.league]));
for (const g of schedule) {
  assert.equal(leagueOfTeam[g.home], g.league, 'ホームのリーグが違う');
  assert.equal(leagueOfTeam[g.away], g.league, 'ビジターのリーグが違う');
}

// ⚠ **ホームが偏らないこと**。1巡ごとに本拠地を入れ替えないと、同じ相手に
//    片方がずっとホームになり、144試合ぶん有利不利が積み上がる。
// ⚠ **試合数から導くこと**。68〜76 と直に書いており、144ターンから
//    120ターンへ変えたとき「60〜60（完全に均等）」が範囲外で落ちた。
//    許容は「半分±4」。狭すぎると正しい均等配分まで落とす
const homes = Object.values(homeCount);
const half = gamesPerTeam() / 2;
assert.ok(
  Math.min(...homes) >= half - 4 && Math.max(...homes) <= half + 4,
  `ホーム試合数が偏っている: ${Math.min(...homes)}〜${Math.max(...homes)}（半分=${half}）`,
);

// --- 順位表からの入れ替え -----------------------------------------
// ⚠ 順位表は**全球団を通した並び**（勝率順）。そのままでは「2部の1位」が
//    分からないので、リーグで絞り直してから順位を見る必要がある。
{
  const live = generatePyramidTeams(777).map((t) => ({ ...t }));
  // 全球団を混ぜた順位表を作る（1部と2部が入り混じる並び）
  const table = live.map((t, i) => ({
    team: t.name,
    wins: 100 - i * 3,
    winRate: (100 - i * 3) / gamesPerTeam(),
  }));
  const order = standingsByLeague(live, table);
  for (const l of PYRAMID_LEAGUES) {
    assert.equal(order[l.id].length, TEAMS_PER_LEAGUE, `${l.id} の人数がちがう`);
    // リーグ内で勝率の降順になっていること
    const rates = order[l.id].map((n) => table.find((x) => x.team === n).winRate);
    assert.deepEqual(rates, [...rates].sort((a, b) => b - a), `${l.id} の並びが順位順でない`);
  }
  // 並びが決まっていること（同成績でも実行のたびに変わらない）
  assert.deepEqual(standingsByLeague(live, table), order);

  const before = Object.fromEntries(live.map((t) => [t.name, t.league]));
  const moves = applyPyramidMovements(live, table);
  assert.ok(moves.length > 0, '入れ替えが起きない');
  // 所属が実際に書き換わっている
  for (const mv of moves) {
    assert.equal(before[mv.teamId], mv.from);
    assert.equal(live.find((t) => t.name === mv.teamId).league, mv.to);
  }
  // 入れ替え後も各リーグの球団数が保たれる（ここが本丸）
  for (const l of PYRAMID_LEAGUES) {
    assert.equal(
      live.filter((t) => t.league === l.id).length,
      TEAMS_PER_LEAGUE,
      `入れ替え後に ${l.id} の球団数がちがう`,
    );
  }
  // 最下位が降り、1位が上がっている
  const bottomTier = Math.max(...PYRAMID_LEAGUES.map((x) => x.tier));
  for (const mv of moves) {
    const fromLeague = PYRAMID_LEAGUES.find((x) => x.id === mv.from);
    const place = order[mv.from].indexOf(mv.teamId) + 1;
    if (fromLeague.tier === bottomTier) assert.equal(place, 1, '上がるのは1位');
    else if (fromLeague.up.length === 0) assert.equal(place, TEAMS_PER_LEAGUE, '降りるのは最下位');
  }
}

// --- これからの試合（画面の「日程」と「次の試合」） ---------------------
// ⚠ 日程の配列は**日付順ではない**（リーグごとに1年ぶんを並べている）。
//    以前は先頭から6件を取っていて、2部の球団には自球団の予定が
//    シーズン中ずっと出なかった（参加者は全員2部から始まる）
{
  const teams = generatePyramidTeams(7);
  const schedule = pyramidSeasonSchedule(teams, { year: 2024 });
  const bottom = teams.find(
    (t) => t.league === PYRAMID_LEAGUES.at(-1).id,
  ).name;
  const list = upcomingGames(schedule, bottom);
  assert.ok(
    list.some((g) => g.home === bottom || g.away === bottom),
    '2部の球団の次の試合が出ていない',
  );
  const key = (d) => d.month * 100 + d.day;
  assert.ok(
    list.every((g, i) => i === 0 || key(list[i - 1].date) <= key(g.date)),
    '日付順に並んでいない',
  );
  assert.equal(key(list[0].date), 401, '一番近い日の試合から出ていない');
  // 消化した試合は出さない
  for (const g of schedule.slice(0, 40)) g.result = { homeScore: 0, awayScore: 0 };
  assert.ok(
    upcomingGames(schedule, bottom).every((g) => !schedule.find((s) => s.id === g.id).result),
    '消化した試合が出ている',
  );
  // プレーオフに出られるのは1部だけ
  const top = topTierTeamNames(teams);
  assert.equal(top.length, TEAMS_PER_LEAGUE);
  assert.ok(top.every((name) => teams.find((t) => t.name === name).league === PYRAMID_LEAGUES[0].id));
}

console.log(
  `■ 階層リーグ: OK（${PYRAMID_LEAGUES.length}リーグ${PYRAMID_TEAM_COUNT}球団 / 出入りが釣り合う / 再現する / ${SEASON_TURNS}ターン中${gamesPerTeam()}試合・${SEASON_TURNS / REST_EVERY}休養日）`,
);
