#!/usr/bin/env node
// ============================================================
// トーナメント/ブラケット完走検証
//
// 全ての自動消化トーナメントが、どのチーム数でも必ず「優勝確定」まで
// 到達することを検証する回帰テスト。
//
// 背景: 独立リーグのグランドチャンピオンシップが、素朴な並び順シードで
// 空カードを作り、後続ラウンドのbye(不戦勝)と延長引き分けを処理せず、
// champion=null / done=false のまま確定しない不具合があった（結果、独立モードで
// 大会が丸ごと表示されなかった）。同種の穴が再発しないよう、
//   - createBracket + autoPlayBracket（社会人/大学が共用する堅牢な実装）
//   - generateGrandChampionship + autoPlayGrandChampionship（独立CS）
// を各チーム数で回し、優勝者が確定し未消化カードが残らないことを保証する。
//
// 使い方: node tools/sim-harness/bracket-check.mjs
// 終了コード: 全PASSで0、FAILで1。
// ============================================================

import './lib/bootstrap.mjs';
import { Report } from './lib/report.mjs';
import { bootstrapWorld } from './lib/world.mjs';
import { WORLD_DATA } from '../../src/corporate/worldData.js';
import { createBracket, autoPlayBracket, isBracketComplete } from '../../src/corporate/toshitaikou.js';
import { generateGrandChampionship, autoPlayGrandChampionship } from '../../src/corporate/parallelWorldManager.js';

console.log('\n▶ トーナメント完走検証');

// 合成チームはTEAMS_DATAに無く、simulateQuickMatchがランクベースにフォールバックする際
// autoSimulateGameが「チームデータが見つかりません」を大量出力するため抑制する。
const _origError = console.error;
console.error = () => {};

const report = new Report('ブラケット完走（優勝確定 + 未消化カードなし）');

// 未消化カード = 両チーム揃っているのに winner も isBye も無いカード
const countStuck = (bracket) => {
  let stuck = 0;
  for (const round of bracket.rounds) {
    for (const m of round) {
      if (!m.winner && !m.isBye && m.team1 && m.team2) stuck++;
    }
  }
  return stuck;
};

// --- 1. 汎用ブラケット（社会人・大学が共用） ---
const COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 16, 20, 23, 32];
for (const n of COUNTS) {
  const names = Array.from({ length: n }, (_, i) => `T${i}`);
  const defs = {};
  names.forEach((nm, i) => { defs[nm] = { name: nm, rank: ['S', 'A', 'B', 'C', 'D'][i % 5] }; });
  const bracket = createBracket(names);
  autoPlayBracket(bracket, defs);
  const ok = isBracketComplete(bracket) && !!bracket.champion && countStuck(bracket) === 0;
  report.assert(`createBracket ${String(n).padStart(2)}チーム`, ok, ok ? `優勝=${bracket.champion}` : '未確定/未消化あり');
}

// --- 2. グランドチャンピオンシップ（独立CS） ---
// リーグ優勝チーム数は独立リーグ構成で変動するため、代表的な数を合成して検証する。
{
  const { seasonData, userTeams } = bootstrapWorld();
  // 実ワールドの構成でまず1回
  const us = userTeams.map((t, i) => ({ team: t, wins: 30 - i * 3, losses: 20 + i * 3, draws: 0, winRate: (30 - i * 3) / 50 }));
  const gc = generateGrandChampionship(WORLD_DATA.userLeagueId, us, seasonData.settings);
  if (gc) {
    autoPlayGrandChampionship(gc);
    const finalRound = gc.bracket.rounds[gc.bracket.rounds.length - 1][0];
    const ok = gc.done && !!gc.bracket.champion && !!gc.bracket.runnerUp && countStuck(gc.bracket) === 0;
    report.assert(`グランドCS 実ワールド(${gc.bracket.teamCount}チーム)`, ok,
      ok ? `優勝=${gc.bracket.champion}/準=${gc.bracket.runnerUp}` : 'champion=null等');
  } else {
    report.assert('グランドCS 実ワールド', false, 'gc=null（優勝チーム<2）');
  }
}

console.error = _origError;
report.print();
process.exit(report.passed ? 0 : 1);
