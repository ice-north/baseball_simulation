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
import { generateFullSeasonSchedule, getValidTwoLeagueGameCounts, getValidSingleLeagueGameCounts, fitsInRegularSeason, fitGamesPerSeason, twoLeagueSizes } from '../../src/season/scheduleGenerator.js';
import { applyNextSeasonRegulations } from '../../src/season/nextSeasonRegulations.js';
import { twoLeagueGameCountLabel, twoLeagueSplitLabel } from '../../src/season/regulationSettings.js';
import { executeSetupManagedGame } from '../../src/game/gameSetup.js';
import { leagueMagic } from '../../src/season/magicNumber.js';
import { departedEntry, withDeparted, rosterIndex, departedSince, withDepartedPlayers } from '../../src/season/departedStats.js';

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
// ⚠ **選べる値なら、どの球団もちょうどその数**（2リーグの奇数球団を含む）。以前は2リーグで
//    球団数が奇数だと、選んだ数と球団ごとの試合数がずれた（5球団・141試合で142〜160、
//    9球団・150試合で148〜160、7球団・116試合で118〜129、5球団・3試合で4。総合監査 2026-11-10 の判断9）。
//    リーグ内・交流戦の数も選択肢の表示（`intra`・`intraB`・`inter`）どおり
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
          const label = `${format === 'two' ? '2リーグ' : '1リーグ'}${count}球団${games}試合`;
          if (format === 'two' || fitsInRegularSeason(count, games, 'single')) {
            const played = Object.fromEntries(teams.map(t => [t, { all: 0, inter: 0 }]));
            const [sizeA] = twoLeagueSizes(count);
            const leagueOf = (t) => (teams.indexOf(t) < sizeA ? 'A' : 'B');
            for (const g of schedule) {
              const inter = format === 'two' && leagueOf(g.home) !== leagueOf(g.away);
              for (const t of [g.home, g.away]) {
                played[t].all++;
                if (inter) played[t].inter++;
              }
            }
            for (const t of teams)
              assert.equal(played[t].all, games, `${label}: ${t} の試合数が ${played[t].all}`);
            if (format === 'two') {
              const opt = getValidTwoLeagueGameCounts(count, 150).find(o => o.value === games);
              const [a, b] = twoLeagueSizes(count);
              for (const t of teams) {
                const ownLeague = leagueOf(t) === 'A' ? a : b;
                const intra = leagueOf(t) === 'A' ? opt.intra : opt.intraB;
                assert.equal(played[t].inter, opt.inter * (count - ownLeague), `${label}: ${t} の交流戦が選択肢の表示と違う`);
                assert.equal(played[t].all - played[t].inter, intra * (ownLeague - 1), `${label}: ${t} のリーグ内の試合が選択肢の表示と違う`);
              }
            }
          }
          for (const g of schedule) {
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
  // 奇数球団の2リーグは、式から決まる値だけ選べる（5球団は偶数・7球団は6の倍数・9球団は4の倍数・11球団は10の倍数）
  for (const [count, step] of [[5, 2], [7, 6], [9, 4], [11, 10]]) {
    const values = getValidTwoLeagueGameCounts(count, 150).map(o => o.value);
    assert.ok(values.length > 5, `2リーグ${count}球団の選択肢が少なすぎる（${values.length}）`);
    assert.ok(values.every(v => v % step === 0), `2リーグ${count}球団で、全球団を同じ数にできない値が選べる`);
  }
  // 選択肢の文は、奇数球団なら両リーグのリーグ内の数を書く（片方だけだと、もう片方のリーグには違う数になる）
  const option40 = getValidTwoLeagueGameCounts(5, 150).find(o => o.value === 40);
  assert.equal(twoLeagueGameCountLabel(option40, 5), '40試合（2チームのリーグ内各28戦・3チームのリーグ内各16戦・交流各4戦）');
  assert.equal(twoLeagueSplitLabel(5), '2チーム・3チーム');
  const option60 = getValidTwoLeagueGameCounts(8, 150).find(o => o.value === 60);
  assert.equal(twoLeagueGameCountLabel(option60, 8), `60試合（リーグ内各${option60.intra}戦・交流各${option60.inter}戦）`);
  assert.equal(twoLeagueSplitLabel(8), '4チーム×2');
}

// --- 規定画面と翌年の日程の試合数は1か所（`fitGamesPerSeason`）で、選べる値に合わせる ---
// ⚠ 以前は規定画面ごとに決め方を書いており、オフの規定画面は2リーグでも1リーグの決め方
//    （対戦相手数の倍数）で直していた。古い保存が選べない値を持つと、選択欄は別の値を見せ、
//    日程は球団ごとにばらついた
{
  for (let count = 4; count <= 12; count++) {
    const values = getValidTwoLeagueGameCounts(count, 150).map(o => o.value);
    for (const games of [3, 54, 60, 75, 116, 141, 150]) {
      const fitted = fitGamesPerSeason({ teamsCount: count, leagueFormat: 'two', games });
      assert.ok(values.includes(fitted), `2リーグ${count}球団${games}試合を選べない値 ${fitted} に直した`);
      if (values.includes(games)) assert.equal(fitted, games, '選べる値を変えた');
      // 球団数を変えたときも2リーグの値に合わせる（以前のオフの規定画面は1リーグの決め方）
      const changed = fitGamesPerSeason({ teamsCount: count, leagueFormat: 'two', games, previousTeamsCount: count === 12 ? 6 : count + 1 });
      assert.ok(values.includes(changed), `2リーグで${count}球団に変えたときに選べない値 ${changed} になった`);
    }
  }
  for (let count = 2; count <= 12; count++) {
    const values = getValidSingleLeagueGameCounts(count, 150);
    for (const games of [3, 60, 75, 141, 150]) {
      const fitted = fitGamesPerSeason({ teamsCount: count, leagueFormat: 'single', games });
      assert.ok(values.includes(fitted), `1リーグ${count}球団${games}試合を選べない値 ${fitted} に直した`);
      if (values.includes(games)) assert.equal(fitted, games, '選べる値を変えた');
    }
  }
  // 1リーグで球団数を変えたら、対戦相手ごとの対戦数を保つ（4球団60試合=各20戦 → 6球団100試合）
  assert.equal(fitGamesPerSeason({ teamsCount: 6, leagueFormat: 'single', games: 60, previousTeamsCount: 4 }), 100);
  // 古い保存の選べない値: 日程は近い選べる値で組み、どの球団も同じ数（以前は142〜160にばらついた）
  const warn = console.warn;
  const warned = [];
  console.warn = (message) => warned.push(message);
  try {
    const teams = Array.from({ length: 5 }, (_, i) => `T${i}`);
    const fitted = fitGamesPerSeason({ teamsCount: 5, leagueFormat: 'two', games: 141 });
    const schedule = generateFullSeasonSchedule({ teams, gamesPerSeason: 141, startDate: { year: 2025, month: 4, day: 1 }, leagueFormat: 'two' });
    for (const t of teams)
      assert.equal(schedule.filter(g => g.home === t || g.away === t).length, fitted, `古い保存の5球団141試合で ${t} の試合数が揃わない`);
    assert.ok(warned.some(m => String(m).includes(`${fitted}試合で組みます`)), '選べない値を組み直したことを警告していない');
  } finally {
    console.warn = warn;
  }
  // 翌年の日程: 設定の値も直す（規定打席などの基準と表示が日程と合う）
  const { seasonData } = quiet(() => bootstrapWorld({ userTeamNames: ['高知', '徳島', '愛媛', '香川', '松山'] }));
  const names = seasonData.settings.teamNames;
  assert.equal(names.length, 5, '前提: 5球団');
  let next = { ...seasonData, year: 2, settings: { ...seasonData.settings, teamNames: names, teamsCount: 5, leagueFormat: 'two', gamesPerSeason: 141 } };
  const warnBefore = console.warn;
  console.warn = () => {};
  try {
    quiet(() => applyNextSeasonRegulations({
      confirmedSettings: next.settings,
      seasonData: next,
      setSeasonData: (update) => { next = typeof update === 'function' ? update(next) : update; },
      generatePitchingRotation: () => {},
      setManagementView: () => {},
      nextView: 'camp',
      notify: () => {},
    }));
  } finally {
    console.warn = warnBefore;
  }
  const expected = fitGamesPerSeason({ teamsCount: 5, leagueFormat: 'two', games: 141 });
  assert.equal(next.settings.gamesPerSeason, expected, '翌年の設定の試合数が日程と違う');
  for (const t of names)
    assert.equal(next.schedule.filter(g => g.home === t || g.away === t).length, expected, `翌年の日程で ${t} の試合数が設定と違う`);
}

// --- DH制の推奨スタメンは DH の枠を「dh」で保存し、日付進行の補完で守備がずれない ---
// ⚠ 推奨スタメン（`setRecommendedLineup`）が DH の選手を本来の守備位置で保存していて、
//    同じ守備位置が2人になっていた。日付進行の補完（`ensureCompleteLineup`）は重なった人を
//    空いた位置へ**前から順に**回していたので、左翼手が捕手・本来の捕手が一塁…と連鎖して
//    全員の守備がずれていた（独立リーグの開幕で見つかった）。
{
  const { seasonData } = quiet(() => bootstrapWorld());
  const savedDH = LEAGUE_SETTINGS.useDH;
  LEAGUE_SETTINGS.useDH = true;
  try {
    const [user] = seasonData.settings.teamNames;
    const team = TEAMS_DATA[user];
    quiet(() => setRecommendedLineup(team, user));
    const saved = team.lineupSettings.battingOrder.map(e => ({ ...e }));
    assert.equal(saved.filter(e => e.position === 'dh').length, 1,
      `推奨スタメンに DH の枠が無い: ${saved.map(e => e.position).join(',')}`);
    assert.equal(new Set(saved.map(e => e.position)).size, 9, '推奨スタメンで守備位置が重なる');
    // 保存した打順は補完を通っても守備が変わらない
    assert.equal(quiet(() => ensureCompleteLineup(team, true)), true);
    const after = new Map(team.lineupSettings.battingOrder.map(e => [e.playerId, e.position]));
    for (const e of saved) assert.equal(after.get(e.playerId), e.position, '補完で守備位置が変わった');

    // 以前の形（DH の選手が本来の守備位置のまま）で保存された打順も、捕手などは動かさず
    // 重なった1人だけを DH に回す
    const dh = saved.find(e => e.position === 'dh');
    const dhPlayer = team.players.find(p => p.id === dh.playerId);
    // 見つかったときと同じく、DH の選手の本来の位置を左翼にする
    const native = 'left';
    dhPlayer.position = native;
    // DH の選手を打順の先頭に置き、本来その位置を守る人より前で重ならせる
    team.lineupSettings.battingOrder = [
      { ...dh, position: native },
      ...saved.filter(e => e.playerId !== dh.playerId),
    ];
    assert.equal(quiet(() => ensureCompleteLineup(team, true)), true);
    const fixed = team.lineupSettings.battingOrder;
    assert.equal(new Set(fixed.map(e => e.position)).size, 9, '補完の後も守備位置が重なる');
    const moved = fixed.filter(e => {
      const before = saved.find(x => x.playerId === e.playerId).position;
      return before !== e.position;
    });
    // 動いてよいのは重なった2人（DH の選手と、その位置の本来の選手）のどちらか1人が DH へ入れ替わるだけ
    assert.ok(moved.length <= 2 && moved.every(e => e.playerId === dh.playerId || saved.find(x => x.playerId === e.playerId).position === native),
      `重なっていない選手の守備まで動いた: ${moved.map(e => `${e.playerId}:${saved.find(x => x.playerId === e.playerId).position}→${e.position}`).join(', ')}`);
    assert.equal(fixed.find(e => e.position === 'catcher')?.playerId, saved.find(e => e.position === 'catcher').playerId, '捕手が入れ替わった');
  } finally {
    LEAGUE_SETTINGS.useDH = savedDH;
  }
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

// --- DH制の采配試合で、相手（AI）の先発は試合前に予告した先発 ---
// ⚠ 采配試合の準備（gameSetup）は、AIチームの先発を generateAILineup がローテから選んだ後、
//    DH制のときだけ「名簿で最初の投手」を選び直していた。予告の先発と違う人（抑えなど）が
//    マウンドに立ち、ローテだけ1つ進んでいた
{
  const { seasonData } = quiet(() => bootstrapWorld());
  const savedDH = LEAGUE_SETTINGS.useDH;
  LEAGUE_SETTINGS.useDH = true;
  try {
    const [user, opp] = seasonData.settings.teamNames;
    const team = TEAMS_DATA[opp];
    delete team.lineupSettings;
    const firstPitcher = team.players.find(p => p.position === 'pitcher');
    const rotation = team.pitchingRotation;
    const index = rotation.starters.findIndex(id => id !== firstPitcher.id);
    assert.ok(index >= 0, '前提: 名簿で最初の投手と別の先発がローテにいる');
    rotation.currentStarterIndex = index;
    const expected = rotation.starters[index];
    for (const p of team.players) p.fatigue = 0;
    let away = null;
    const ctx = new Proxy({ managedGameInfoRef: { current: null } }, {
      get: (target, key) => key in target ? target[key] : key === 'setAwayTeam' ? (t) => { away = t; } : () => {},
    });
    quiet(() => executeSetupManagedGame(ctx, { gameId: 1, home: user, away: opp, otherGames: [] }));
    const starter = away?.players.find(p => p._isStartingPitcher);
    assert.equal(starter?.id, expected, `DH制の相手の先発が予告と違う（名簿で最初の投手 ${firstPitcher.name} を選び直している）`);
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

// --- 順位表の「M」は点灯してから出す ---
// ⚠ 以前は2位の最大の勝ち数から数えたまま出していたので、開幕前（0試合）から「M31」が出ていた。
{
  const row = (team, wins, losses) => ({ team, wins, losses, draws: 0 });
  assert.equal(leagueMagic([row('A', 0, 0), row('B', 0, 0)], 30, { 'A|B': 10 }).magic, null, '0試合でマジックが出た');
  assert.equal(leagueMagic([row('A', 12, 3), row('B', 8, 7)], 30, { 'A|B': 5 }).magic, null, '追う球団が自力で抜ける間にマジックが出た');
  // A 18-7（残り5）、B 15-10（残り5・最大20）、直接対決は残り2: A がほかを全部勝てば21 > 20 で点灯、M3
  assert.equal(leagueMagic([row('A', 18, 7), row('B', 15, 10)], 30, { 'A|B': 2 }).magic, 3, '点灯した時のマジックの数が違う');
  assert.equal(leagueMagic([row('A', 18, 7), row('B', 15, 10)], 30, { 'A|B': 3 }).magic, null, '直接対決で抜かれうるのにマジックが出た');
  assert.equal(leagueMagic([row('A', 25, 2), row('B', 15, 12)], 30, {}).decided, true, '優勝が決まっていない扱いになった');
}

// --- 戦力外・指名・退団で名簿を離れた選手も、その年の選手成績に残る ---
// ⚠ 選手成績の画面は名簿から集計するので、11/9 の戦力外で抜けた選手がその年の成績ごと
//    ランキングから消えていた。外れる前に写した成績を足して並べる
{
  const stats = (atBats, hits) => ({ batting: { games: 10, atBats, hits, doubles: 0, triples: 0, homeruns: 0, walks: 0 }, pitching: { inningsPitched: 0 } });
  const star = { id: 'p1', name: '主砲', position: 'first', seasonStats: stats(400, 140) };
  const bench = { id: 'p2', name: '控え', position: 'left', seasonStats: stats(0, 0) };
  const stay = { id: 'p3', name: '残る人', position: 'second', seasonStats: stats(300, 80) };
  const teams = { A: { name: 'A球団', players: [star, bench, stay] } };
  const before = rosterIndex(teams);
  teams.A.players = [stay]; // 戦力外で2人を外す
  const departed = departedSince(before, teams);
  assert.deepEqual(departed.map((p) => p.id), ['p1'], '成績の無い選手まで写した／外れた選手を写していない');
  assert.equal(departedEntry(bench, 'A', 'A球団'), null);
  let season = withDeparted({ year: 3 }, departed);
  // 同じ選手を2回写しても1人（先に外れた球団で残す）
  season = withDeparted(season, [departedEntry({ ...star, seasonStats: stats(1, 1) }, 'B', 'B球団')]);
  assert.equal(season.departedSeasonStats.players.length, 1);
  assert.equal(season.departedSeasonStats.players[0].teamKey, 'A');
  // トライアウトで拾われて成績0で名簿にいる本人は、写したほうで出す
  const live = [
    { ...stay, teamKey: 'A', teamName: 'A球団' },
    { ...star, seasonStats: stats(0, 0), teamKey: 'B', teamName: 'B球団' },
  ];
  const rows = withDepartedPlayers(live, season);
  assert.equal(rows.length, 2, '拾われた選手が二重に並んだ');
  const shown = rows.find((p) => p.id === 'p1');
  assert.equal(shown.seasonStats.batting.hits, 140, '外れた選手のその年の成績が出ない');
  assert.equal(shown.teamKey, 'A');
  assert.equal(shown.departed, true);
  // 年が替わったら古い年の写しは使わない
  assert.equal(withDepartedPlayers(live, { ...season, year: 4 }), live);
  assert.equal(withDeparted({ ...season, year: 4 }, [departedEntry(stay, 'A', 'A球団')]).departedSeasonStats.players.length, 1);
}

console.log('■ 一人用の進行の再発防止: OK（DH制の采配試合で相手の先発が予告どおり / 1球団の設定で日程づくりが終わらない / 翌年のレギュレーションの確定で次の画面へ / 監督移籍で自チームが先頭 / 派遣中はキャンプ練習なし / 日程は4月〜10月9日で全試合を置く / 同じ日に同じ球団は1試合・入りきる試合数だけ選べる / DH制の先発と打順が食い違わない / 戦力外の選手を二重に加齢しない / マジックは点灯してから出す / 名簿を離れた選手もその年の成績に残る）');
