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
} from '../../src/online/pyramidLeague.js';

// --- 構造 ---------------------------------------------------------
assert.equal(PYRAMID_LEAGUES.length, 7);
assert.equal(PYRAMID_TEAM_COUNT, 42);
assert.deepEqual(
  PYRAMID_LEAGUES.map((l) => l.id),
  ['A', 'B1', 'B2', 'C1', 'C2', 'C3', 'C4'],
);
// 階層は A=0 / B=1 / C=2 の3段
assert.deepEqual([...new Set(PYRAMID_LEAGUES.map((l) => l.tier))], [0, 1, 2]);
// 最上位は昇格先を持たない。最下層は降格先を持たない
assert.equal(PYRAMID_LEAGUES.find((l) => l.id === 'A').up, null);
for (const id of ['C1', 'C2', 'C3', 'C4']) {
  assert.equal(PYRAMID_LEAGUES.find((l) => l.id === id).down.length, 0);
}

// --- 出入りの釣り合い（この検査の主目的） --------------------------
const balance = pyramidBalance();
assert.ok(
  balance.balanced,
  `昇降格の出入りが釣り合っていない: ${JSON.stringify(balance.rows)}`,
);
// A は2つ出て2つ入る / B は6つ出て6つ入る（2リーグ合計）/ C は4つ出て4つ入る
const byId = Object.fromEntries(balance.rows.map((r) => [r.id, r]));
assert.equal(byId.A.out, 2);
assert.equal(byId.A.in, 2);
assert.equal(byId.B1.out + byId.B2.out, 6);
assert.equal(byId.B1.in + byId.B2.in, 6);
assert.equal(byId.C1.out + byId.C2.out + byId.C3.out + byId.C4.out, 4);

// --- 生成 ---------------------------------------------------------
const teams = generatePyramidTeams(20261029);
assert.equal(teams.length, 42);
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
  assert.equal(new Set(teams.map((t) => t[key])).size, 42, `${key} が重複している`);
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
const tierAvg = [0, 1, 2].map((tier) => {
  const ids = PYRAMID_LEAGUES.filter((l) => l.tier === tier).map((l) => l.id);
  const list = teams.filter((t) => ids.includes(t.league));
  return list.reduce((s, t) => s + strength[t.rank], 0) / list.length;
});
assert.ok(
  tierAvg[0] > tierAvg[1] && tierAvg[1] > tierAvg[2],
  `階層の強さが逆転している: ${tierAvg.map((v) => v.toFixed(2)).join(' / ')}`,
);

// --- 入れ替え -----------------------------------------------------
// 各リーグの順位を「そのリーグの6球団を1位から順に並べたもの」として作る
const standings = Object.fromEntries(
  PYRAMID_LEAGUES.map((l) => [l.id, teams.filter((t) => t.league === l.id).map((t) => t.id)]),
);
const moves = pyramidMovements(standings);

// 動くのは 昇格6（A以外の6リーグ）＋ 降格6（A2・B1が2・B2が2）
assert.equal(moves.length, 12, `移動数がちがう: ${moves.length}`);

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

console.log('■ 階層リーグ: OK（7リーグ42球団 / 出入りが釣り合う / シードで再現する）');
