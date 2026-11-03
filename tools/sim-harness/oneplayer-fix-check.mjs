#!/usr/bin/env node
// ============================================================
// 一人用の進行で見つかった不具合の再発防止（2026-11 全体レビュー）
//
// どれも「画面は普通に動くのに、裏で別のチーム・別の日付・別の人が処理される」
// 種類の不具合で、遊んでいても気づきにくい。1つずつ、壊れていたときの症状を
// 確かめる形で書いてある。
//
// 使い方: node tools/sim-harness/oneplayer-fix-check.mjs
// ============================================================

import './lib/bootstrap.mjs';
import assert from 'node:assert/strict';
import { bootstrapWorld, TEAMS_DATA } from './lib/world.mjs';
import { getTransferCandidates, transferManagerTo } from '../../src/game/managerTransfer.js';
import { generateExpansionRoster, generateTryoutCandidates, updateReleasedPoolAfterTryout } from '../../src/season/tryoutSystem.js';
import { releasedPlayersPool } from '../../src/teams-data.js';
import { executeTeamCampTraining } from '../../src/season/campTraining.js';
import { generateFullSeasonSchedule } from '../../src/season/scheduleGenerator.js';

const quiet = (fn) => {
  const log = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = log; }
};

// --- 監督移籍のあとは、移籍先が自チーム（TEAMS_DATA の先頭）になる ---
// ⚠ 日程画面・ロスター・契約更改・キャンプ・スカウト・年度替わりの名簿処理が
//    `Object.keys(TEAMS_DATA)[0]` を自チームとして読む。以前は並べ替えておらず、
//    移籍後も元のチームのキャンプ・戦力外・打順補完をしていた。
{
  const { seasonData } = quiet(() => bootstrapWorld());
  const from = seasonData.settings.teamNames[0];
  assert.equal(Object.keys(TEAMS_DATA)[0], from, '前提: 自チームが先頭');
  const groups = getTransferCandidates(from) || {};
  for (const category of ['university', 'corporate', 'independent']) {
    const list = groups[category] || [];
    const pick = list.map(c => c?.name || c?.teamName || c).find(name => name && TEAMS_DATA[name]);
    if (!pick) continue;
    let sd = seasonData;
    const before = Object.keys(TEAMS_DATA).length;
    const result = quiet(() => transferManagerTo(pick, {
      seasonData: sd,
      setSeasonData: (f) => { sd = typeof f === 'function' ? f(sd) : f; },
      setLeagueConfig: () => {}, setGameMode: () => {}, setSelectedMonth: () => {},
    }));
    assert.equal(result.success, true, result.error);
    assert.equal(Object.keys(TEAMS_DATA)[0], pick, `${category}へ移籍しても自チームが先頭にならない`);
    assert.equal(sd.settings.teamNames[0], pick);
    assert.equal(Object.keys(TEAMS_DATA).length, before, '並べ替えでチームが増減した');
    break;
  }
}

// --- 派遣中の選手はキャンプの練習をしない ---
// ⚠ 画面は割り当てから外していたが、練習の本体が「割り当て無し＝自動の練習」に
//    拾っていたため、派遣の成長に加えてキャンプの成長も積んでいた。
{
  const players = generateExpansionRoster(1, 10).map(p => ({ ...p, age: 19 }));
  const dispatched = players.find(p => p.position !== 'pitcher');
  dispatched.dispatchedThisCamp = 'proCamp';
  const snapshot = JSON.stringify(dispatched);
  const { updatedTeam, allReports } = executeTeamCampTraining({ name: 'X', players }, {}, {}, null, 1.0, {});
  const after = updatedTeam.players.find(p => p.id === dispatched.id);
  assert.equal(JSON.stringify(after), snapshot, '派遣中の選手がキャンプで練習した');
  assert.ok(!allReports.some(r => r.player.id === dispatched.id), '派遣中の選手に練習の報告がある');
  assert.ok(allReports.length === players.length - 1, '派遣していない選手は練習する');
}

// --- 日程は4月1日〜10月9日（レギュラーシーズンの期間）に収め、試合を捨てない ---
// ⚠ 以前は140試合以上で3月20日から組んでいたが、シーズンは4月1日に始まるので
//    3月の試合は一度も消化されなかった。日が足りない設定（5球団で148試合など）では
//    はみ出した試合を黙って捨て、チームごとの試合数が揃わなかった。
for (const [count, games] of [[4, 144], [4, 150], [6, 145], [5, 148], [7, 150]]) {
  const teams = Array.from({ length: count }, (_, i) => `T${i}`);
  const schedule = generateFullSeasonSchedule({
    teams, gamesPerSeason: games,
    startDate: { year: 2024, month: 4, day: 1 }, endDate: { year: 2024, month: 9, day: 30 },
    leagueFormat: 'single',
  });
  const outside = schedule.filter(g => g.date.month < 4 || g.date.month > 10 || (g.date.month === 10 && g.date.day > 9));
  assert.equal(outside.length, 0, `${count}球団${games}試合: シーズン期間の外に試合がある（${outside[0]?.date?.month}/${outside[0]?.date?.day}）`);
  for (const t of teams) {
    const played = schedule.filter(g => g.home === t || g.away === t).length;
    assert.equal(played, games, `${count}球団${games}試合: ${t} の試合数が ${played}`);
  }
}

// --- 戦力外の選手は、翌日のトライアウトで年を取らない ---
// ⚠ プールの選手は年度替わりに加齢する。以前はトライアウトの候補にする時にも
//    「滞在年数＋1」歳を足して能力も落としていたため、11/9 に解雇された25歳が
//    翌日 26歳で出て、入団すると翌季は27歳になっていた（二重の加齢）。
{
  const [released] = generateExpansionRoster(1, 1);
  released.id = 987654321;
  released.age = 25;
  released.attemptsInPool = 0;
  delete released.origin;
  releasedPlayersPool.length = 0;
  releasedPlayersPool.push(JSON.parse(JSON.stringify(released)));
  const candidates = quiet(() => generateTryoutCandidates(2, 4, false, 'B', 0));
  const shown = candidates.find(c => c.id === released.id);
  assert.ok(shown, '前提: 戦力外の選手が候補に出る');
  assert.equal(shown.age, 25, `解雇の翌日のトライアウトで年を取っている（${shown.age}歳）`);
  assert.equal(JSON.stringify(shown.batting), JSON.stringify(released.batting), '解雇の翌日なのに能力が落ちている');
  // 不指名で残る。次のトライアウト（年度替わりで26歳）に向けて33歳未満なら残す
  updateReleasedPoolAfterTryout([]);
  assert.equal(releasedPlayersPool.length, 1, '25歳の不指名選手が引退扱いで消えた');
  releasedPlayersPool.length = 0;
}

console.log('■ 一人用の進行の再発防止: OK（監督移籍で自チームが先頭 / 派遣中はキャンプ練習なし / 日程は4月〜10月9日で全試合を置く / 戦力外の選手を二重に加齢しない）');
