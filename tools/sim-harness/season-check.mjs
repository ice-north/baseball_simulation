#!/usr/bin/env node
// ============================================================
// シーズン統計バランス検証
//
// N チームでフルシーズンを消化し、リーグ全体の打撃・投球指標が
// 現実的な帯に収まっているか、および構造的不変条件が保たれているかを検証する。
//
// 使い方:
//   node tools/sim-harness/season-check.mjs [チーム数] [1チームあたり試合数] [シード数]
//   例) node tools/sim-harness/season-check.mjs 6 130 1
//
// 終了コード: 全PASSで0、FAILで1（CI/回帰チェックに利用可）。
// ============================================================

import './lib/bootstrap.mjs';
import { Report } from './lib/report.mjs';
import { buildLeague, runSeason, TEAMS_DATA } from './lib/league.mjs';
import { aggregateStats, checkInvariants } from './lib/stats.mjs';

const TEAM_COUNT = Number(process.argv[2]) || 8;
const GAMES = Number(process.argv[3]) || 120;
const SEEDS = Number(process.argv[4]) || 3;

console.log(`\n▶ シーズン統計検証: ${TEAM_COUNT}チーム × ${GAMES}試合/チーム × ${SEEDS}シード`);

// 複数シードの平均を取ってブレを均す
const acc = {};
let totalGames = 0;
let invariantProblems = [];

for (let s = 0; s < SEEDS; s++) {
  const names = buildLeague(TEAM_COUNT, 28, 1);
  totalGames += runSeason(names, GAMES);
  const st = aggregateStats(TEAMS_DATA, names);
  for (const k of Object.keys(st)) acc[k] = (acc[k] || 0) + st[k];
  const inv = checkInvariants(TEAMS_DATA, names);
  if (!inv.ok) invariantProblems.push(...inv.problems);
}
for (const k of Object.keys(acc)) acc[k] /= SEEDS;

// 1試合につき2チームが対戦するため、チームあたり試合数は総試合×2÷チーム数
const gamesPerTeamPerSeed = (totalGames / SEEDS) * 2 / TEAM_COUNT;
const hrPerTeamGame = acc.HR / (totalGames / SEEDS) / 2; // 1試合2チーム分

const r = new Report(`■ リーグ集計（${SEEDS}シード平均）`);
// このリーグは generateExpansionRoster が作るトライアウト級（独立リーグ最下層相当）の
// 弱い選手で構成される。パワー10〜35・制球55前後のため、長打率・本塁打は低く四球は
// やや多いのが「正常」。帯はその戦力レベルの実測ベースラインに較正してある。
// 目的はNPBとの一致ではなく回帰検出——疲労スパイラル(打率.077/防御率34)のような
// 桁レベルの崩壊を確実に踏み抜くこと。
// 帯は 8チーム×120試合を10回独立実行した実測レンジ(下記)に余裕を持たせたもの:
//   打率 .228-.253 / 出塁 .350-.365 / 長打 .245-.276 / 防御 2.14-2.64
//   K/9 7.3-8.8 / BB/9 6.1-6.7 / 四球率 14.6-15.9% / 三振率 18.5-22.5%
r.band('リーグ打率',     acc.avg,  0.210, 0.270, v => v.toFixed(3));
r.band('リーグ出塁率',   acc.obp,  0.330, 0.385, v => v.toFixed(3));
r.band('リーグ長打率',   acc.slg,  0.230, 0.300, v => v.toFixed(3));
r.band('リーグ防御率',   acc.era,  1.90,  3.20,  v => v.toFixed(2));
r.band('K/9',            acc.k9,   6.5,   10.0,  v => v.toFixed(2));
r.band('BB/9',           acc.bb9,  5.0,   7.8,   v => v.toFixed(2));
r.band('四球率(対打席)', acc.bbRate, 0.125, 0.180, v => (v * 100).toFixed(1) + '%');
r.band('三振率(対打席)', acc.kRate,  0.160, 0.250, v => (v * 100).toFixed(1) + '%');
r.band('本塁打/試合',    hrPerTeamGame, 0.05, 0.60, v => v.toFixed(2));
r.info('総打数',         acc.AB.toFixed(0));
r.info('総投球回',       acc.IP.toFixed(0));
r.info('実行試合数(1シード)', gamesPerTeamPerSeed.toFixed(0) + '試合/チーム');
r.print();

const inv = new Report('■ 構造的不変条件');
inv.assert('ID重複・ロスター・ローテ整合', invariantProblems.length === 0,
  invariantProblems.length ? invariantProblems.slice(0, 5).join(' / ') : '');
if (invariantProblems.length) {
  for (const p of invariantProblems.slice(0, 10)) console.log(`      - ${p}`);
}
inv.print();

const ok = r.passed && inv.passed;
process.exit(ok ? 0 : 1);
