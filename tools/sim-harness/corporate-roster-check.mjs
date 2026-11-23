// 社会人（企業・クラブ）と独立リーグの最初の名簿に、投手が足りているか。
// ⚠ 以前は残りの枠を能力だけで選んでいて、D ランクのクラブ（13〜17人）の約3%が投手1人で
//    始まっていた。その1人が抜けると投手0人になり、大学モードの2年目に試合が
//    「投手が取得できません」で壊れた（generateCorporateRoster で最低人数を先に取る）。
// あわせて、大会成績の予算ボーナス（cd.tournamentBudgetBonus）が年度更新で入るか。
// ⚠ 以前は表（TOURNAMENT_BUDGET_BONUS）だけあって一度も計算されず、3つの予算の画面に
//    足している「大会成績ボーナス」は必ず0だった。
//   node tools/sim-harness/corporate-roster-check.mjs
import { quiet } from './lib/quiet.mjs';
import './lib/bootstrap.mjs';
import { SRC } from './lib/bootstrap.mjs';
import assert from 'node:assert/strict';

const { generateCorporateRoster } = await import(SRC + '/corporate/corporateInit.js');

const cases = [
  { def: { id: 39, name: '検証クラブD', type: 'club', rank: 'D' }, runs: 300 },
  { def: { id: 30, name: '検証クラブC', type: 'club', rank: 'C' }, runs: 60 },
  { def: { id: 3, name: '検証クラブB', type: 'club', rank: 'B' }, runs: 30 },
  { def: { id: 1, name: '検証企業D', type: 'corporate', rank: 'D' }, runs: 60 },
  { def: { id: 2, name: '検証企業S', type: 'corporate', rank: 'S' }, runs: 20 },
  { def: { id: 'il_test', name: '検証独立D', rank: 'D' }, runs: 60 },
];
const lines = [];
for (const { def, runs } of cases) {
  const counts = {};
  for (let i = 0; i < runs; i++) {
    const roster = quiet(() => generateCorporateRoster(def, 1));
    const pitchers = roster.filter((p) => p.position === 'pitcher').length;
    counts[pitchers] = (counts[pitchers] || 0) + 1;
    assert.ok(pitchers >= 4, `${def.name}（${roster.length}人）の投手が ${pitchers} 人で始まった（4人以上のはず）`);
    assert.ok(roster.some((p) => p.position === 'catcher'), `${def.name} に捕手がいない`);
  }
  lines.push(`${def.name} ${JSON.stringify(counts)}`);
}

// --- 大会成績の予算ボーナス（計算そのもの。年度更新から呼ばれることは progression-check が見る） ---
const { updateAllTournamentBudgetBonuses, budgetBreakdown } = await import(SRC + '/corporate/corporateInit.js');
const { createBracket, recordResult } = await import(SRC + '/corporate/toshitaikou.js');

// 決着まで上位シード（names の前の方）を勝たせる。[0] が優勝・[1] が準優勝
const playOut = (names) => {
  const b = createBracket(names);
  for (let r = 0; r < b.rounds.length; r++) {
    b.rounds[r].forEach((m, i) => {
      if (m.isBye || !m.team1 || !m.team2) return;
      recordResult(b, r, i, names.indexOf(m.team1) < names.indexOf(m.team2) ? m.team1 : m.team2, '1-0');
    });
  }
  return b;
};
const T = Array.from({ length: 10 }, (_, i) => `検証企業${i}`);
const teams = Object.fromEntries(T.map((n) => [n, { corporateData: { rank: 'C', type: 'corporate', tournamentBudgetBonus: 9999 } }]));
teams.検証独立 = { independentLeagueId: 'x', corporateData: { rank: 'D', tournamentBudgetBonus: 0 } };
// 都市対抗: 8チーム。日本選手権: 8チーム（都市対抗の優勝チーム T0 は第8シードで、第1シード T8 に初戦で負ける）
// 複数の大会に出たらいちばん良い成績の額だけ（チーム運営画面の注記どおり。足さない）
const td = playOut(T.slice(0, 8));
const ns = playOut([T[8], T[9], T[2], T[3], T[4], T[5], T[6], T[0]]);
const seasonData = {
  toshitaikou: { mainTournament: { bracket: td } },
  nihonSenshuken: { mainTournament: { bracket: ns } },
};
updateAllTournamentBudgetBonuses(seasonData, teams);
const bonus = (n) => teams[n].corporateData.tournamentBudgetBonus;
assert.equal(td.champion, T[0]);
assert.equal(ns.champion, T[8]);
// 都市対抗: 優勝T0・準優勝T1・ベスト4 T2,T3・初戦負けT4〜T7。日本選手権: 優勝T8・準優勝T9・ベスト4 T2,T3・初戦負けT0,T4,T5,T6
assert.deepEqual(Object.fromEntries(T.map((n) => [n, bonus(n)])), {
  [T[0]]: 2000, [T[1]]: 1000, [T[2]]: 500, [T[3]]: 500,
  [T[4]]: 300, [T[5]]: 300, [T[6]]: 300, [T[7]]: 300,
  [T[8]]: 2000, [T[9]]: 1000,
}, '大会成績ボーナスが成績どおりでない（複数の大会はいちばん良い成績の額だけ）');
assert.equal(teams.検証独立.corporateData.tournamentBudgetBonus, 0, '独立リーグは対象外');
// 前年の 9999 が残らず、同じ年にもう一度計算しても二重に入らない
const once = T.map(bonus);
updateAllTournamentBudgetBonuses(seasonData, teams);
assert.deepEqual(T.map(bonus), once, '同じ年に2回計算すると値が変わった（二重に入った）');
assert.ok(once.every((v) => v < 9999), '前年のボーナスが残った');
// 大会の結果が無い年は全員0
updateAllTournamentBudgetBonuses({}, teams);
assert.ok(T.every((n) => bonus(n) === 0), '大会に出なかった年に前年のボーナスが残った');
// 予算の内訳に入り、既定値はランクの表から（cd.budget が無い古いデータ）
const bd = budgetBreakdown({ budget: 16000, rank: 'C', tournamentBudgetBonus: 2000, yearlyBudgetBonus: 500, staff: [] });
assert.equal(bd.tournamentBonus, 2000);
assert.equal(bd.total, 16000 + 500 + 0 + 2000 + 0);
assert.equal(budgetBreakdown({ rank: 'S' }).baseBudget, 25000);
assert.equal(budgetBreakdown({}).baseBudget, 12000);

console.log(`corporate-roster-check PASS（最初の名簿の投手は4人以上: ${lines.join(' / ')}。大会成績の予算ボーナス: ${once.join('/')}万円・二重なし・翌年リセット）`);
