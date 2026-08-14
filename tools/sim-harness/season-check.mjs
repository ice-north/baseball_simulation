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
  const ld = leagueLeaders(TEAMS_DATA, names, GAMES);
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
// 【再較正4: 走者進塁の修正後】内野ゴロでの走者進塁（ゴロGO・進塁打）が無く、
// 2アウトで積極進塁が禁止され、二塁打で1塁走者が必ず3塁で止まっていた。
// このため走者が散発の試合ほど得点が作れず、BaseRuns予測に対する実失点が
//   走者多(制球10)97% → 走者少(制球85)81%
// と投手が良いほど乖離が広がっていた（修正後は99-105%でほぼ平坦）。
// NPB相当の戦力での失点は 3.29 → 3.74（実NPB 3.70）。
//
// 【再較正3: 配球モデル導入】制球を「ストライク率」から「狙った所へ投げられる
// 再現性」に変え、捕手の配球（勝負/際どく/誘い）とファウル・ボール球コンタクトを
// 追加した（pitchCalling.js）。四球率が構造的に高すぎた問題（NPB相当で14〜15%、
// 実NPB 8.5%）が解消し、1球ごとの結果分布も実データに揃った:
//   ボール35.5% 見逃し14.6% 空振り9.0% ファウル23% インプレー17.5%（実MLB 36/17/10/17/20）
//
// 実測レンジ(5回×3シード平均):
//   打率 .249-.258 / 出塁 .318-.332 / 長打 .314-.331 / 防御 3.07-3.46
//   K/9 7.31-7.96 / BB/9 3.81-4.20 / 四球率 9.1-10.0% / 三振率 18.4-20.3%
//   本塁打/試合 0.41-0.50 / 首位打者 .395-.435 / 最多本塁打 27-38本 / 最優秀防御率 0.57-1.10
//
// 【再較正5: トライアウト候補の守備位置を需要比にした後】このワールドは
// generateExpansionRoster が作る＝トライアウト候補30人から24人を取るので、
// 候補の構成比がそのままロスターの質になる。従来は8ポジションから一様に引いており
// 捕手が候補の5.0%しか出ず、必須ポジションは「そこを守れる唯一の候補」を
// 置くしかなかった。需要比（投手41.7/捕手8.3/内野25/外野25）で配るようにしたので、
// 各ポジションに2〜3人の候補が居て**その中の最良**が先発に入る。
// 打線が強くなるぶんリーグ全体が打者寄りに動く（物理定数は一切触っていない）。
//   打率 .240→.247 / 長打 .322→.348 と、むしろ実NPB(.247/.366)へ寄る向き。
// 実測レンジ(6回×3シード平均):
//   打率 .239-.250 / 出塁 .329-.341 / 長打 .330-.360 / 防御 3.41-3.89
//   K/9 7.33-7.67 / BB/9 4.05-4.35 / 本塁打/試合 0.64-0.83
//   首位打者 .419-.492 / 最多本塁打 41-58本 / 最優秀防御率 0.92-1.85
// 長打率の上限 .365 は旧ロスターの実測に張り付いていたので .385 へ広げる。
r.band('リーグ打率',     acc.avg,  0.220, 0.285, v => v.toFixed(3));
r.band('リーグ出塁率',   acc.obp,  0.295, 0.360, v => v.toFixed(3));
r.band('リーグ長打率',   acc.slg,  0.270, 0.385, v => v.toFixed(3));
r.band('リーグ防御率',   acc.era,  2.40,  4.20,  v => v.toFixed(2));
r.band('K/9',            acc.k9,   6.30,  9.30,  v => v.toFixed(2));
r.band('BB/9',           acc.bb9,  3.00,  5.20,  v => v.toFixed(2));
r.band('四球率(対打席)', acc.bbRate, 0.075, 0.125, v => (v * 100).toFixed(1) + '%');
r.band('三振率(対打席)', acc.kRate,  0.155, 0.235, v => (v * 100).toFixed(1) + '%');
// 段階②（打球初速・打出し角・NPB_CARRY の較正）で本塁打の水準が
// 0.48 → 0.65 前後（実NPB 0.70）に上がったので帯を実測レンジに合わせ直す。
// 3シード平均のぶれは 0.55〜0.74 だった。
r.band('本塁打/試合',    hrPerTeamGame, 0.35, 0.95, v => v.toFixed(2));
// 死球: 実NPB 約0.36/チーム/試合（打席の約0.9%）。あまりにも内角へ外れた球が当たる
r.band('死球率(対打席)', acc.hbpRate, 0.004, 0.016, v => (v * 100).toFixed(2) + '%');
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
// 上限 .490→.520: 首位打者が .42〜.49 に振れるのは規定打席を満たす選手が
// 103試合で約350打数しか取れないため（休養・併用）で、打撃モデルではなく
// 出場数の較正の課題。既知のまま据え置きなので、帯だけ実測に合わせる。
ld.band('首位打者(規定)',   ext.bestAvg, 0.290, 0.520, v => v.toFixed(3));
// 最多本塁打はシード間の最大値なので裾が長い。11回の観測で27-38本が10回、59本が1回。
// 系統的なオフェンス膨張は「本塁打/試合」(0.41-0.50で安定)が捕えるので、ここは桁崩壊の検出に留める。
ld.band('最多本塁打',       ext.maxHR,   3, 70, v => v.toFixed(0) + '本');
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
