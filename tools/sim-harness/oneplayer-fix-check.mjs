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
import { LEAGUE_SETTINGS } from '../../src/teams-data.js';
import { ensureCompleteLineup } from '../../src/game/lineup.js';
import { autoSimulateGame, setRecommendedLineup } from '../../src/game/autoSimulation.js';
import { generateFullSeasonSchedule, getValidTwoLeagueGameCounts, getValidSingleLeagueGameCounts, fitsInRegularSeason } from '../../src/season/scheduleGenerator.js';
import { applyNextSeasonRegulations } from '../../src/season/nextSeasonRegulations.js';

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

// --- 同じ日に同じ球団が2回出ない（規定画面で選べる全ての組み合わせ） ---
// ⚠ 以前は日が足りない設定（1リーグ3球団130試合以上、2リーグ5球団114試合以上、
//    2リーグ9球団143試合以上など）で1日に複数ラウンドをまとめて置き、同じ球団が
//    同じ日に2試合組まれていた。日程画面は自チームの試合を1つしか拾わないので、
//    2試合目は采配できないまま自動で消化されていた。
{
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (let count = 2; count <= 12; count++) {
      const d = Math.max(1, count - 1);
      const single = [];
      for (let i = 1; d * i <= 150; i++) single.push(d * i);
      const lists = [['single', single]];
      if (count >= 4) lists.push(['two', getValidTwoLeagueGameCounts(count, 150).map(o => o.value)]);
      const teams = Array.from({ length: count }, (_, i) => `T${i}`);
      for (const [format, counts] of lists) {
        for (const games of counts) {
          const schedule = generateFullSeasonSchedule({
            teams, gamesPerSeason: games,
            startDate: { year: 2025, month: 4, day: 1 }, endDate: { year: 2025, month: 10, day: 9 },
            leagueFormat: format,
          });
          const seen = new Set();
          for (const g of schedule) {
            const label = `${format === 'two' ? '2リーグ' : '1リーグ'}${count}球団${games}試合`;
            assert.ok(!(g.date.month < 4 || g.date.month > 10 || (g.date.month === 10 && g.date.day > 9)),
              `${label}: シーズン期間の外に試合がある（${g.date.month}/${g.date.day}）`);
            for (const t of [g.home, g.away]) {
              const key = `${t}|${g.date.month}/${g.date.day}`;
              assert.ok(!seen.has(key), `${label}: ${t} が ${g.date.month}/${g.date.day} に2試合組まれている`);
              seen.add(key);
            }
          }
        }
      }
    }
  } finally {
    console.warn = warn;
  }
  // 規定画面の選択肢には、期間に入りきる試合数だけを出す（入らない分は組まれないため）
  for (let count = 2; count <= 12; count++) {
    for (const games of getValidSingleLeagueGameCounts(count, 150)) {
      assert.ok(fitsInRegularSeason(count, games, 'single'), `1リーグ${count}球団${games}試合が選べるのに期間に入りきらない`);
    }
    if (count >= 4) {
      for (const { value } of getValidTwoLeagueGameCounts(count, 150)) {
        assert.ok(fitsInRegularSeason(count, value, 'two'), `2リーグ${count}球団${value}試合が選べるのに期間に入りきらない`);
      }
    }
  }
  assert.ok(!getValidSingleLeagueGameCounts(3, 150).includes(130), '1リーグ3球団130試合（1日1試合で192日に入らない）が選べる');
  assert.ok(getValidSingleLeagueGameCounts(3, 150).includes(128), '1リーグ3球団128試合は入りきるのに選べない');
}

// --- DH制で、打順から外した先発と試合で投げる先発が同じ ---
// ⚠ 以前の試合側は、ローテの今の番の選手が抹消中だと疲労を見て別の選手を選んでいた。
//    打順を揃える側（`ensureCompleteLineup`）は「抹消中を飛ばした次の番」を外すので、
//    次の番が疲れていると、外した選手は投げずに打順に残した二刀流の選手が投げ、
//    その選手が打順から抜けて8人で戦っていた。
{
  const { seasonData } = quiet(() => bootstrapWorld());
  const savedDH = LEAGUE_SETTINGS.useDH;
  LEAGUE_SETTINGS.useDH = true;
  try {
    const [user, opp] = seasonData.settings.teamNames;
    const team = TEAMS_DATA[user];
    quiet(() => setRecommendedLineup(team, user));
    team.pitchingRotation.currentStarterIndex = 0;
    const [s0, s1, s2] = team.pitchingRotation.starters.map(id => team.players.find(p => p.id === id));
    s0.isActive = false; // 今の番は抹消中
    s1.fatigue = 60;     // 次の番は疲れている
    // s1・s2 を二刀流として打順に入れる
    team.lineupSettings.battingOrder = [
      ...team.lineupSettings.battingOrder.filter(e => e.battingOrder <= 7 && e.position !== 'pitcher'),
      { playerId: s1.id, battingOrder: 8, position: 'dh' },
      { playerId: s2.id, battingOrder: 9, position: 'right' },
    ];
    assert.equal(quiet(() => ensureCompleteLineup(team, true)), true);
    assert.ok(!team.lineupSettings.battingOrder.some(e => e.playerId === s1.id), '前提: 次の先発（s1）を打順から外す');
    const result = quiet(() => autoSimulateGame(user, opp, false, 1));
    const side = result.homeTeam.name === user ? result.homeTeam : result.awayTeam;
    const batters = side.players.filter(p => p.gameStats?.batting && (p.battingOrder > 0));
    assert.equal(batters.length, 9, `DH制で打順が${batters.length}人になった（先発の決め方が打順と食い違う）`);
    const starter = side.players.find(p => p.position === 'pitcher' && p.battingOrder === 0 && p.id === s1.id);
    assert.ok(starter, '打順から外した選手（s1）が先発していない');
  } finally {
    LEAGUE_SETTINGS.useDH = savedDH;
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

// --- 翌年のレギュレーションを確定したら、次の画面（キャンプ・箱庭の準備）へ移る ---
// ⚠ 画面の2か所のコピペを関数にまとめたとき（d2a147b）、最後の `setManagementView(nextView)` が
//    抜けていた。「確定 → キャンプへ進む」を押しても画面が変わらず、再読み込みしても同じ画面から
//    始まるので、独立リーグ・箱庭は2年目に進めなかった
{
  const { seasonData } = quiet(() => bootstrapWorld());
  for (const nextView of ['camp', 'sandbox_setup']) {
    let view = null;
    let next = { ...seasonData, year: 2 };
    const notes = [];
    applyNextSeasonRegulations({
      confirmedSettings: seasonData.settings,
      seasonData: next,
      setSeasonData: (update) => { next = typeof update === 'function' ? update(next) : update; },
      generatePitchingRotation: () => {},
      setManagementView: (v) => { view = v; },
      nextView,
      notify: (message) => notes.push(message),
    });
    assert.equal(view, nextView, `翌年のレギュレーションを確定しても ${nextView} へ移らない`);
    assert.deepEqual(next.currentDate, { year: 2025, month: 1, day: 1 }, '翌年の日付になっていない');
    assert.ok(next.schedule?.length > 0, '翌年の日程ができていない');
    assert.deepEqual(notes, [], '球団が変わらないのに知らせが出た');
  }
}

// --- 1球団以下の設定で日程づくりが終わらない（タブが固まる） ---
// ⚠ 規定画面の球団数に「1」を打った瞬間、試合数の選択肢を作る計算が対戦相手0で
//    Infinity 回の巡回に入り、タブが固まっていた。入りきるかの判定は false、選択肢は空、日程は空
{
  assert.equal(fitsInRegularSeason(1, 60, 'single'), false);
  assert.deepEqual(getValidSingleLeagueGameCounts(1), []);
  assert.deepEqual(getValidSingleLeagueGameCounts(0), []);
  assert.deepEqual(
    quiet(() => generateFullSeasonSchedule({ teams: ['T0'], gamesPerSeason: 60, startDate: { year: 2025, month: 4, day: 1 } })),
    [],
  );
}

console.log('■ 一人用の進行の再発防止: OK（1球団の設定で日程づくりが終わらない / 翌年のレギュレーションの確定で次の画面へ / 監督移籍で自チームが先頭 / 派遣中はキャンプ練習なし / 日程は4月〜10月9日で全試合を置く / 同じ日に同じ球団は1試合・入りきる試合数だけ選べる / DH制の先発と打順が食い違わない / 戦力外の選手を二重に加齢しない）');
