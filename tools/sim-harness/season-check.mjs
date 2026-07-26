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
import { aggregateStats, checkInvariants, leagueLeaders } from './lib/stats.mjs';

const TEAM_COUNT = Number(process.argv[2]) || 8;
const GAMES = Number(process.argv[3]) || 120;
const SEEDS = Number(process.argv[4]) || 3;

console.log(`\n▶ シーズン統計検証: ${TEAM_COUNT}チーム × ${GAMES}試合/チーム × ${SEEDS}シード`);

// 複数シードの平均を取ってブレを均す
const acc = {};
let totalGames = 0;
let invariantProblems = [];
// シード横断で最も極端なリーダーを追跡（どれか1シードで外れ値が出れば捕捉）
let ext = { bestAvg: -1, bestAvgName: '-', maxHR: -1, maxHRName: '-',
            bestERA: Infinity, bestERAName: '-' };

for (let s = 0; s < SEEDS; s++) {
  const names = buildLeague(TEAM_COUNT, 28, 1);
  totalGames += runSeason(names, GAMES);
  const st = aggregateStats(TEAMS_DATA, names);
  for (const k of Object.keys(st)) acc[k] = (acc[k] || 0) + st[k];
  const inv = checkInvariants(TEAMS_DATA, names);
  if (!inv.ok) invariantProblems.push(...inv.problems);
  const ld = leagueLeaders(TEAMS_DATA, names);
  if (ld.bestAvg > ext.bestAvg) { ext.bestAvg = ld.bestAvg; ext.bestAvgName = ld.bestAvgName; }
  if (ld.maxHR > ext.maxHR) { ext.maxHR = ld.maxHR; ext.maxHRName = ld.maxHRName; }
  if (ld.bestERA != null && ld.bestERA < ext.bestERA) { ext.bestERA = ld.bestERA; ext.bestERAName = ld.bestERAName; }
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
//
// 【再較正: 守備システム導入後】失策率の引き上げ(0.17→約1.4/試合)・送球エラー・
// 暴投/捕逸の追加により、走者と失点が意図的に増えた。実測は 防御 2.72-3.64 /
// BB/9 6.5-7.7 に上振れしたため、防御率の上限のみ 3.20→4.00 に広げてある
// （BB/9は既存バンド内）。野球として妥当な水準で、桁崩壊の検出という目的は維持。
//
// 【再較正2: 長打の物理修正後】「フェンスを越える飛距離の打球が2〜4割しか本塁打に
// ならない」不具合と、階段状で厳しすぎた二塁打/三塁打の閾値を修正した。
// 結果、NPB相当の戦力(ミート58/パワー55/制球60)で 安打8.2 二塁打1.3 三塁打0.15
// 本塁打0.71（実NPB 8.3/1.50/0.15/0.70）と実データに一致するようになった一方、
// この弱小リーグでも長打が増えたため以下を広げた。実測レンジ(6回×3シード平均):
//   打率 .242-.250 / 出塁 .362-.391 / 長打 .296-.313 / 防御 3.34-4.44
//   K/9 7.9-8.4 / BB/9 6.9-8.3 / 四球率 15.9-18.7% / 三振率 18.2-20.2%
//   本塁打/試合 0.33-0.42 / 首位打者 .393-.456 / 最多本塁打 24-44本
//
// 【再較正3: 配球モデル導入後】制球を「ストライク率」から「狙った所へ投げられる
// 再現性」に変え、捕手の配球（勝負/際どく/誘い）とファウル・ボール球コンタクトを
// 追加した（pitchCalling.js）。四球率が構造的に高すぎた問題（NPB相当で14〜15%、
// 実NPB 8.5%）が解消し、1球ごとの結果分布も実データに揃った:
//   ボール35.5% 見逃し14.6% 空振り9.0% ファウル23% インプレー17.5%（実MLB 36/17/10/17/20）
// 副作用として走者が減り、シーズン後半の疲労スパイラルも消えたためブレも小さくなった。
// 実測レンジ(5回×3シード平均):
//   打率 .247-.256 / 出塁 .317-.324 / 長打 .311-.326 / 防御 2.58-2.84
//   K/9 7.7-7.9 / BB/9 3.81-3.95 / 四球率 9.2-9.6% / 三振率 19.4-20.2%
//   本塁打/試合 0.42-0.51 / 首位打者 .392-.458 / 最多本塁打 28-37本
r.band('リーグ打率',     acc.avg,  0.220, 0.280, v => v.toFixed(3));
r.band('リーグ出塁率',   acc.obp,  0.295, 0.350, v => v.toFixed(3));
r.band('リーグ長打率',   acc.slg,  0.270, 0.360, v => v.toFixed(3));
r.band('リーグ防御率',   acc.era,  1.90,  3.60,  v => v.toFixed(2));
r.band('K/9',            acc.k9,   6.5,   9.5,   v => v.toFixed(2));
r.band('BB/9',           acc.bb9,  3.0,   5.2,   v => v.toFixed(2));
r.band('四球率(対打席)', acc.bbRate, 0.075, 0.120, v => (v * 100).toFixed(1) + '%');
r.band('三振率(対打席)', acc.kRate,  0.160, 0.240, v => (v * 100).toFixed(1) + '%');
r.band('本塁打/試合',    hrPerTeamGame, 0.20, 0.75, v => v.toFixed(2));
r.info('総打数',         acc.AB.toFixed(0));
r.info('総投球回',       acc.IP.toFixed(0));
r.info('実行試合数(1シード)', gamesPerTeamPerSeed.toFixed(0) + '試合/チーム');
r.print();

// 個人成績リーダーの外れ値検出。破壊された物理/集計は規定到達者の極値に現れる。
// 帯はシード間最大値の観測レンジ（首位打者.36-.45 / 本塁打王11-15 / 防御率王0.47-0.70）
// に変動マージンを足したもの。短い103試合シーズンでリーダーは振れるため上限は広め。
// 「首位打者.500超」「規定防御率0.00」「本塁打40本超」のような桁崩壊を捕捉する
// （系統的なオフェンス膨張はリーグ集計側の帯が別途捕える）。
const ld = new Report('■ 個人成績リーダー（外れ値検出）');
ld.band('首位打者(規定)',   ext.bestAvg, 0.290, 0.490, v => v.toFixed(3));
ld.band('最多本塁打',       ext.maxHR,   3, 50, v => v.toFixed(0) + '本');
ld.band('最優秀防御率(規定)', ext.bestERA === Infinity ? 0 : ext.bestERA, 0.30, 3.50, v => v.toFixed(2));
ld.info('首位打者',   `${ext.bestAvg.toFixed(3)} (${ext.bestAvgName})`);
ld.info('本塁打王',   `${ext.maxHR}本 (${ext.maxHRName})`);
ld.info('防御率王',   `${ext.bestERA === Infinity ? '-' : ext.bestERA.toFixed(2)} (${ext.bestERAName})`);
ld.print();

const inv = new Report('■ 構造的不変条件');
inv.assert('ID重複・ロスター・ローテ整合', invariantProblems.length === 0,
  invariantProblems.length ? invariantProblems.slice(0, 5).join(' / ') : '');
if (invariantProblems.length) {
  for (const p of invariantProblems.slice(0, 10)) console.log(`      - ${p}`);
}
inv.print();

const ok = r.passed && ld.passed && inv.passed;
process.exit(ok ? 0 : 1);
