// ============================================================
// sim-harness リーグ構築 & シーズン実行
// TEAMS_DATA に N チーム分のロスターを配り、実ゲームと同じ日次回復
// カデンスでシーズンを消化する。
//
// 【重要】実ゲームは progressDate 内で毎日 recoverAllPitcherFatigue() を
// 呼んで全選手の疲労を回復し、試合出場者だけ相殺する設計になっている。
// これを再現しないと疲労が青天井に蓄積し、数十試合で制球・ミートが崩壊して
// 打率.077 / 防御率34 のような異常値になる（harnessで実証済み）。
// ============================================================

import { SRC } from './bootstrap.mjs';

const { TEAMS_DATA, initializeTeamsForCount, initializeAllPitchingRotations } =
  await import(SRC + '/teams-data.js');
const { generateExpansionRoster } = await import(SRC + '/season/tryoutSystem.js');
const { autoSimulateGame, recoverAllPitcherFatigue } = await import(SRC + '/game/autoSimulation.js');

export { TEAMS_DATA };

// N チームを生成し、各チームに rosterSize 人のロスターを配る。
export function buildLeague(teamCount = 6, rosterSize = 28, year = 1) {
  initializeTeamsForCount(teamCount);
  const names = Object.keys(TEAMS_DATA);
  for (const name of names) {
    TEAMS_DATA[name].players = generateExpansionRoster(year, rosterSize).map(p => ({ ...p, number: p.id }));
  }
  initializeAllPitchingRotations();
  return names;
}

// 総当たりの対戦カードを日程に展開する。
// 各「日」は1チームあたり最大1試合になるよう組み、実ゲームの週6日制を近似して
// 7日ごとに休養日(全員回復のみ)を挟む。
function buildSchedule(names, gamesPerTeam) {
  // ラウンドロビン（サークル法）で1ラウンド=各チーム1試合の対戦日を作る
  const n = names.length;
  const arr = [...names];
  if (n % 2 === 1) arr.push(null); // bye
  const rounds = [];
  const m = arr.length;
  for (let r = 0; r < m - 1; r++) {
    const day = [];
    for (let i = 0; i < m / 2; i++) {
      const a = arr[i], b = arr[m - 1 - i];
      if (a && b) day.push(r % 2 === 0 ? [a, b] : [b, a]); // ホーム/アウェイを交互に
    }
    rounds.push(day);
    // 回転（先頭固定）
    arr.splice(1, 0, arr.pop());
  }
  // gamesPerTeam に達するまでラウンドを繰り返す
  const days = [];
  let i = 0;
  while (days.length * 1 < Infinity) {
    days.push(rounds[i % rounds.length]);
    const played = days.length; // 1日=各チーム1試合
    if (played >= gamesPerTeam) break;
    i++;
  }
  return days;
}

// シーズンを1本消化する。戻り値は実行試合数。
// SIM_HARNESS_NO_RECOVERY=1 で日次回復を無効化できる（ハーネスの回帰検出力を
// 自己検証するための故意の破壊モード。疲労が青天井になり必ずFAILするはず）。
export function runSeason(names, gamesPerTeam = 130) {
  const skipRecovery = process.env.SIM_HARNESS_NO_RECOVERY === '1';
  const days = buildSchedule(names, gamesPerTeam);
  let games = 0;
  let dayIndex = 0;
  for (const day of days) {
    dayIndex++;
    // 週6日制: 7日ごとに休養日（試合なし・回復のみ）
    if (dayIndex % 7 === 0) {
      if (!skipRecovery) recoverAllPitcherFatigue();
      continue;
    }
    for (const [home, away] of day) {
      autoSimulateGame(home, away);
      games++;
    }
    // 実ゲームの日次回復（progressDate 相当）
    if (!skipRecovery) recoverAllPitcherFatigue();
  }
  return games;
}
