// 人どうしの関わり（改善案 A1〜A4・B1・B4・C1）の検査。
//
//   A1 トレードの提案のひとこと・返事の知らせ・成り立たなくなった提案の取り下げ
//   A2 取引の記録（トレード）と読む窓口
//   A3 最後に来た時刻・おるすばん（任せた扱い→来たら戻る）・管理者が球団をCPUに戻す
//   A4 得点経過（試合の記録の箱に残り、点の合計が試合の点と合う）
//   B1 予告先発（指名は確定まで本人だけ・確定後は変えられない・試合の日にその投手が投げる・
//      確定したときに見えた先発は、その後にローテを変えても変わらない）
//   B4 練習試合（受けるとその場で1試合・成績・疲労・記録・順位に入らない・1日1試合）
//   C1 オーナーのひとこと
//
// ⚠ 主目的は「**試合と成績を変えないこと**」と「**見せてはいけないものを見せないこと**」。
//    練習試合が疲労や成績に混ざると、申し込むだけで相手の主力を疲れさせられる。
//    確定前の予告先発が相手に見えると、後出しで先発を合わせられる。
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../../server/storage/fileStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { defaultPhasePlan } from '../../server/leagueEngine.mjs';
import { withStarters } from '../../server/leagueBoard.mjs';
import { projectLineup } from '../../server/projection.mjs';
import { prepareDailyLineup, STARTER_SKIP_FATIGUE } from '../../server/dailyLineup.mjs';
import {
  pruneTrades,
  touchPresence,
  forgetLastYearPlans,
  assertCanPlay,
  pushInbox,
} from '../../server/social.mjs';
import { scoringPlaysOf } from '../../server/recordedStats.mjs';
import { effectiveStaffModes } from '../../server/coachEngine.mjs';
import { applyJoin, applyProfile, nextMemberIndex, teamCityOf, teamNicknameOf, teamDisplayOf, teamRegionOf, teamHomeOf } from '../../src/online/membership.js';
import { findShortClash } from '../../src/online/shared.js';
import {
  CITY_PREFS,
  prefsOfCity,
  prefsOfTeam,
  localPlayersIn,
  KNOWN_CITIES,
} from '../../src/online/hometown.js';
import {
  pruneDepartedPicks,
  starterAvoidedText,
  lockStarters,
  starterContext,
} from '../../server/starterPicks.mjs';
import { openChallenge, respondChallenge } from '../../server/exhibition.mjs';
import {
  AWAY_DAYS,
  OWNER_COMMENT_MAX,
  TRADE_NOTE_MAX,
  STARTER_LOCK_TURNS,
  EXHIBITION_LIMIT,
  INBOX_LIMIT,
  cleanText,
  isAwayAt,
  lastSeenLabel,
  scoringLabel,
  tokyoDay,
} from '../../src/online/social.js';

// --- 決まりだけの部分 ------------------------------------------------------
{
  assert.deepEqual(cleanText('  捕手が\n足りなくて… ', 10), { text: '捕手が 足りなくて…', tooLong: false });
  assert.equal(cleanText('あ'.repeat(11), 10).tooLong, true, '長すぎる文を通している');
  const now = '2026-11-14T03:00:00.000Z';
  assert.equal(isAwayAt({ lastSeenAt: null }, now), false, '来た記録の無い人を留守にしている');
  assert.equal(isAwayAt({ lastSeenAt: '2026-11-11T04:00:00.000Z' }, now), false, '3日経っていないのに留守');
  assert.equal(isAwayAt({ lastSeenAt: '2026-11-11T02:00:00.000Z' }, now), true, '3日来ていないのに留守にならない');
  assert.equal(lastSeenLabel('2026-11-14T01:00:00.000Z', now), '今日');
  // ⚠ 日本時間で数える（UTC の 11/13 15:00 は日本時間の 11/14 0:00）
  assert.equal(lastSeenLabel('2026-11-13T15:00:00.000Z', now), '今日');
  assert.equal(lastSeenLabel('2026-11-13T14:00:00.000Z', now), '昨日');
  assert.equal(lastSeenLabel('2026-11-10T14:00:00.000Z', now), '4日前');
  assert.equal(tokyoDay('2026-11-13T15:30:00.000Z'), '2026-11-14');
  assert.equal(scoringLabel({ kind: 'homerun', runs: 2 }), '2ランホームラン');
  assert.equal(scoringLabel({ kind: 'homerun', runs: 4 }), '満塁ホームラン');
  assert.equal(scoringLabel({ kind: 'homerun', runs: 1 }), 'ソロホームラン');
  assert.equal(scoringLabel({ kind: 'double', runs: 1 }), 'タイムリー二塁打');

  // 得点経過: 打席の外で入った点も拾い、最後の点が試合の点と合う
  const result = { homeTeam: { name: 'H' }, awayTeam: { name: 'A' }, homeScore: 3, awayScore: 1 };
  const plays = scoringPlaysOf(
    [
      { offense: 'A', inning: 1, batterId: 1, batterName: 'a1', scoreBefore: { home: 0, away: 0 }, scoreAfter: { home: 0, away: 1 }, delta: { hits: 1, homeruns: 1, rbis: 1 } },
      { offense: 'H', inning: 1, batterId: 2, batterName: 'h1', scoreBefore: { home: 0, away: 1 }, scoreAfter: { home: 0, away: 1 }, delta: {} },
      // 暴投で1点（打席の外）。次の打席の前の点で気づく
      { offense: 'H', inning: 2, batterId: 3, batterName: 'h2', scoreBefore: { home: 1, away: 1 }, scoreAfter: { home: 1, away: 1 }, delta: {} },
      { runnerOnly: true, offense: 'H', inning: 2 },
      // 押し出し
      { offense: 'H', inning: 9, batterId: 4, batterName: 'h3', scoreBefore: { home: 1, away: 1 }, scoreAfter: { home: 2, away: 1 }, delta: { walks: 1, rbis: 1 } },
    ],
    result,
  );
  // 最後の打席の後の1点（サヨナラ暴投など）も入る
  assert.deepEqual(
    plays.map((p) => [p.inning, p.half, p.kind, p.runs, p.away, p.home]),
    [
      [1, 'top', 'homerun', 1, 1, 0],
      [2, 'bottom', 'other', 1, 1, 1],
      [9, 'bottom', 'walk', 1, 1, 2],
      [9, 'bottom', 'other', 1, 1, 3],
    ],
    '得点経過の拾い方がちがう',
  );

  // 予告先発の重ね方: 自球団の指名は確定前から見え、ほかの球団の指名は確定してから見える
  const team = (name, ids) => ({
    pitchingRotation: { starters: ids, currentStarterIndex: 0 },
    players: ids.map((id) => ({ id, name: `${name}${id}` })),
  });
  const teams = { A: team('A', [1, 2, 3, 4, 5]), B: team('B', [11, 12, 13, 14, 15]) };
  const games = [1, 2, 3, 4].map((id) => ({ id, home: 'A', away: 'B', date: { year: 2026, month: 4, day: id } }));
  const picks = { A: { 3: 5 }, B: { 2: 14, 4: 11 } };
  const locked = new Set([1, 2]);
  const ctx = (own) => ({ ownTeam: own, picksOf: (n) => picks[n], lockedOf: (g) => locked.has(g.id) });
  const forA = withStarters(games, teams, null, ctx('A'));
  assert.deepEqual(forA.map((g) => g.homeStarter), ['A1', 'A2', 'A5', 'A1'], '自球団の指名の後ろのローテがずれていない');
  assert.deepEqual(forA.map((g) => g.homeStarterMark || null), [null, null, 'pick', null]);
  // B の確定した指名（試合2）は見える。確定していない指名（試合4）は見えない
  assert.deepEqual(forA.map((g) => g.awayStarter), ['B11', 'B14', 'B15', 'B11'], '相手の確定した指名が出ていない');
  assert.deepEqual(forA.map((g) => g.awayStarterMark || null), [null, 'fixed', null, null]);
  const forB = withStarters(games, teams, null, ctx('B'));
  assert.equal(forB[2].homeStarter, 'A3', '確定していない相手の指名が見えている（後出しで合わせられる）');
  assert.equal(forB[3].awayStarterMark, 'pick');

  // 試合の日: 指名した投手が疲れていなければその投手から回す。疲れていれば使わずに知らせる
  const day = (fatigue) => {
    const players = [1, 2, 3, 4, 5].map((id) => ({ id, name: `p${id}`, position: 'pitcher', fatigue: id === 4 ? fatigue : 0 }));
    return { players, pitchingRotation: { starters: [1, 2, 3, 4, 5], currentStarterIndex: 0 }, lineupSettings: { battingOrder: [] } };
  };
  {
    const t = day(0);
    const report = {};
    try {
      prepareDailyLineup(t, 'T', { pick: 4, report });
    } catch {
      // 打順の補完で落ちるのは名簿が投手だけだから（先発の決め方は済んでいる）
    }
    assert.equal(report.pick, 'used');
    assert.equal(t.pitchingRotation.currentStarterIndex, 3, '指名した投手から回していない');
  }
  {
    const t = day(STARTER_SKIP_FATIGUE);
    const report = {};
    try {
      prepareDailyLineup(t, 'T', { pick: 4, report });
    } catch {
      // 同上
    }
    assert.equal(report.pick, 'avoided', '疲れた投手の指名を使っている');
    assert.equal(report.reason, 'tired');
    assert.equal(t.pitchingRotation.currentStarterIndex, 0, '使わなかった指名でローテを動かしている');
  }
  // 使えなかった理由を分ける（以前は移籍・抹消・ローテから外れても「疲れが残っていた」と出ていた）
  for (const [reason, edit] of [
    ['left', (t) => { t.players = t.players.filter((p) => p.id !== 4); t.pitchingRotation.starters = [1, 2, 3, 5]; }],
    ['inactive', (t) => { t.players[3].isActive = false; }],
    ['rotation', (t) => { t.pitchingRotation.starters = [1, 2, 3, 5]; }],
  ]) {
    const t = day(0);
    edit(t);
    const report = {};
    try {
      prepareDailyLineup(t, 'T', { pick: 4, report });
    } catch {
      // 同上
    }
    assert.deepEqual(report, { pick: 'avoided', reason }, `使えなかった指名の理由がちがう（${reason}）`);
    assert.doesNotMatch(starterAvoidedText(reason, 'p4', 'B'), /疲れ/, `疲れていないのに「疲れ」と知らせる（${reason}）`);
  }
  assert.match(starterAvoidedText('tired', 'p4', 'B'), /p4は疲れが残っていたため、B戦の先発を回避しました/);
  // 名簿に居なくなった投手の指名は消す（トレード・退団の後の `refreshTeamPlan`）
  {
    const l = { members: [{ userId: 'a', teamName: 'T', starterPicks: { 7: 4, 8: 2 } }] };
    pruneDepartedPicks(l, 'T', { players: [{ id: 2 }] });
    assert.deepEqual(l.members[0].starterPicks, { 8: 2 }, '居なくなった投手の指名が残っている');
    pruneDepartedPicks(l, 'T', { players: [] });
    assert.equal(l.members[0].starterPicks, undefined);
  }

  // Q1 確定したときに見えていた先発を控え、試合の日はその投手が投げる。確定の後にローテを
  // 並べ替えても・指名した投手をローテから外しても・指名が効かなくなっても（おるすばん）変わらない
  {
    const pitcherTeam = (name, ids) => ({
      players: ids.map((id) => ({ id, name: `${name}${id}`, position: 'pitcher', fatigue: 0 })),
      pitchingRotation: { starters: [...ids], currentStarterIndex: 0 },
      lineupSettings: { battingOrder: [] },
    });
    const teams = { A: pitcherTeam('A', [1, 2, 3, 4, 5]), B: pitcherTeam('B', [11, 12, 13, 14, 15]), C: pitcherTeam('C', [21, 22, 23, 24, 25]) };
    const schedule = [1, 2, 3, 4, 5].map((d) => ({ id: d, home: 'A', away: 'B', date: { year: 2026, month: 4, day: d } }));
    const l = {
      season: { currentDate: { year: 2026, month: 4, day: 1 }, schedule },
      members: [
        { userId: 'a', teamName: 'A', starterPicks: { 2: 4 } },
        { userId: 'b', teamName: 'B' },
      ],
    };
    // 試合1〜3（0〜2ターン前）が確定。A は試合2に4番手を指名。B は指名なし（ローテの順）
    lockStarters(l, teams);
    assert.deepEqual(
      l.members[0].lockedStarters,
      { 1: { id: 1, name: 'A1' }, 2: { id: 4, name: 'A4', picked: true }, 3: { id: 5, name: 'A5' } },
      '確定したときに見えていた先発を控えていない',
    );
    assert.deepEqual(Object.values(l.members[1].lockedStarters).map((x) => x.id), [11, 12, 13]);
    const shownToB = () => withStarters(schedule.slice(0, 3), teams, null, starterContext(l, 'B')).map((g) => [g.homeStarter, g.homeStarterMark]);
    const before = shownToB();
    assert.deepEqual(before, [['A1', 'fixed'], ['A4', 'fixed'], ['A5', 'fixed']], '相手に確定した先発が見えていない');
    // 確定の後に A がローテを並べ替え、指名した投手をローテから外し、指名も効かなくなる（おるすばん）
    teams.A.pitchingRotation.starters = [5, 3, 2, 1];
    teams.A.pitchingRotation.currentStarterIndex = 0;
    delete l.members[0].starterPicks;
    lockStarters(l, teams);
    assert.equal(l.members[0].lockedStarters[2].id, 4, '確定した先発の控えを書き換えた');
    assert.deepEqual(shownToB(), before, '確定の後のローテの並べ替えで、相手に見える先発が変わった');
    // 試合の日: ローテから外した投手でも、控えた先発が投げる。ローテの位置は進めない
    const t = teams.A;
    const report = {};
    try {
      prepareDailyLineup(structuredClone(t), 'A', { pick: 4, report, outside: true });
    } catch {
      // 打順の補完で落ちるのは名簿が投手だけだから（先発の決め方は済んでいる）
    }
    assert.equal(report.pick, 'used', '確定した先発がローテから外れたら投げない（相手に見えた先発と違う）');
    // 名簿に居なくなった（トレード）なら、見える先発もローテの順に戻る（試合の日と同じ）
    teams.A.players = teams.A.players.filter((p) => p.id !== 4);
    assert.equal(shownToB()[1][1], undefined, '居なくなった投手を確定した先発として出している');
    // 年度更新で控えも消す
    forgetLastYearPlans(l);
    assert.equal(l.members[0].lockedStarters, undefined, '年度が替わっても確定した先発の控えが残っている');
  }
  // ローテの外の投手を差し込んだ日は、試合の後にローテと位置を元に戻す（次の番の投手を飛ばさない）
  {
    const players = [1, 2, 3, 9].map((id) => ({ id, name: `p${id}`, position: 'pitcher', fatigue: 0 }));
    const t = { players, pitchingRotation: { starters: [1, 2, 3], currentStarterIndex: 1 }, lineupSettings: { battingOrder: [] } };
    const report = {};
    let threw = false;
    try {
      prepareDailyLineup(t, 'T', { pick: 9, report, outside: true });
    } catch {
      threw = true;
    }
    assert.equal(report.pick, 'used');
    assert.deepEqual(t.pitchingRotation.starters, [1, 9, 2, 3], 'ローテの今の位置に差し込んでいない');
    assert.equal(t.pitchingRotation.currentStarterIndex, 1);
    assert.ok(threw, '前提: 投手だけの名簿は打順が組めない');
    const plain = { players: structuredClone(players), pitchingRotation: { starters: [1, 2, 3], currentStarterIndex: 1 }, lineupSettings: { battingOrder: [] } };
    const r2 = {};
    try {
      prepareDailyLineup(plain, 'T', { pick: 9, report: r2 });
    } catch {
      // 同上
    }
    assert.deepEqual(r2, { pick: 'avoided', reason: 'rotation' }, '確定していない指名でローテの外の投手を投げさせた');
  }

  // 取り下げ: 選手が居なくなった提案・人が抜けた提案・年度更新
  const league = {
    teams: [{ name: 'A' }, { name: 'B' }],
    members: [
      { userId: 'a', teamName: 'A' },
      { userId: 'b', teamName: 'B' },
    ],
    trades: [
      { id: 't1', from: 'a', to: 'b', fromTeam: 'A', toTeam: 'B', offer: [1], want: [11] },
      { id: 't2', from: 'a', to: 'b', fromTeam: 'A', toTeam: 'B', offer: [2], want: [11] },
    ],
  };
  const world = { A: { players: [{ id: 2 }] }, B: { players: [{ id: 11 }] } };
  assert.equal(pruneTrades(league, world, 'x'), 1);
  assert.deepEqual(league.trades.map((t) => t.id), ['t2'], '居ない選手を含む提案が残っている');
  assert.match(league.members[0].inbox[0].text, /移籍・退団/);
  assert.match(league.members[1].inbox[0].text, /Aからの/);
  assert.equal(pruneTrades(league, world, 'x', { all: true, reason: '年度が替わったため' }), 1);
  assert.equal(league.trades.length, 0, '年度更新で提案が残っている');

  // 来た時刻は、数時間経っていなくても日本時間の日付が替わったら書き直す（0時過ぎに来た人が「昨日」と出ていた）
  {
    const l = { members: [{ userId: 'a', lastSeenAt: '2026-11-14T14:00:00.000Z' }] };
    assert.equal(touchPresence(l, 'a', '2026-11-14T14:30:00.000Z'), false, '書いたばかりなのにまた書いた');
    assert.equal(touchPresence(l, 'a', '2026-11-14T15:30:00.000Z'), 'seen', '日付が替わったのに来た時刻を書いていない');
    assert.equal(lastSeenLabel(l.members[0].lastSeenAt, '2026-11-14T15:30:00.000Z'), '今日');
  }

  // 年度更新: 予告先発と、留守の前の編成の控えを消す（年をまたいで戻すと、キャンプの後の編成が前の年に巻き戻る）
  {
    const l = { members: [{ userId: 'a', away: true, awayPlan: { lineupSettings: {} }, starterPicks: { 3: 1 } }] };
    forgetLastYearPlans(l);
    assert.equal(l.members[0].awayPlan, undefined, '年度が替わっても留守の前の編成の控えが残っている');
    assert.equal(l.members[0].starterPicks, undefined);
    assert.equal(l.members[0].away, true, '年度更新でおるすばんの印を消した');
  }

  // 練習試合の結果の上限（30件）で今日の試合を捨てない。捨てると同じ組がその日のうちにもう1試合できた
  {
    const today = '2026-11-15T03:00:00.000Z';
    const members = Array.from({ length: 12 }, (_, i) => ({ userId: `u${i}`, teamName: `T${i}` }));
    const l = { status: 'running', phase: null, teams: members.map((m) => ({ name: m.teamName })), members, exhibitions: [] };
    const pairs = [];
    for (let a = 0; a < 12; a += 1) for (let b = a + 1; b < 12; b += 1) pairs.push([a, b]);
    // 前の日の試合を1件、今日の試合を EXHIBITION_LIMIT + 1 件
    let at = Date.parse(today) - 86400000;
    for (const [i, [a, b]] of pairs.slice(0, EXHIBITION_LIMIT + 2).entries()) {
      l.exhibitions.push({ id: `x${a}-${b}`, from: `u${a}`, fromTeam: `T${a}`, to: `u${b}`, toTeam: `T${b}`, status: 'offered' });
      const when = new Date(i === 0 ? at : (at = Date.parse(today) - 7200000 + i * 1000)).toISOString();
      respondChallenge(l, `u${b}`, { id: `x${a}-${b}`, action: 'accept' }, when, () => ({ homeScore: 1, awayScore: 0 }));
    }
    assert.ok(!l.exhibitions.some((e) => e.id === 'x0-1'), '前の日の結果を上限で捨てていない');
    assert.ok(l.exhibitions.some((e) => e.id === 'x0-2'), '今日の試合の結果を上限で捨てた');
    assert.throws(
      () => openChallenge(l, 'u0', { toTeam: 'T2' }, today),
      /1日/,
      '上限で今日の結果を捨てたので、同じ組がその日のうちにもう1試合できる',
    );
  }

  // 止めている間・手続きの間は練習試合・予告先発を受け付けない
  assert.throws(() => assertCanPlay({ status: 'paused', phase: null }, '練習試合はできません'), /進行が止まっている間は、練習試合/);
  assert.throws(() => assertCanPlay({ status: 'waiting', phase: { kind: 'camp' } }, 'x'), /手続きの間は/);
  assertCanPlay({ status: 'running', phase: null }, 'x');

  // ひとこと: 球団名だけ変えたとき（画面はひとことも一緒に送る）、書いた日を変えない
  {
    const l = { season: { year: 1 }, teams: [{ name: 'A' }], members: [{ userId: 'a', teamName: 'A' }] };
    applyProfile(l, { userId: 'a', comment: '今年こそ', now: '2026-04-01T00:00:00.000Z' });
    l.season.year = 2;
    applyProfile(l, { userId: 'a', teamName: '新しい名前', comment: '今年こそ', now: '2026-11-15T00:00:00.000Z' });
    assert.deepEqual(l.members[0].comment, { text: '今年こそ', at: '2026-04-01T00:00:00.000Z', year: 1 }, '同じひとことの書いた日を変えた');
    applyProfile(l, { userId: 'a', comment: '来年こそ', now: '2026-11-15T00:00:00.000Z' });
    assert.deepEqual(l.members[0].comment, { text: '来年こそ', at: '2026-11-15T00:00:00.000Z', year: 2 });
  }

  // 球団名は**地域名とチーム名に分ける**（いしだ 2026-11-20「じゃないと略称名が
  // ダサくなってしまう」「チーム名を変えても、地元が変わりません」）
  {
    const l = {
      season: { year: 1 },
      teams: [{ name: '美瑛ブルーレイクス', city: '美瑛', abbreviation: '美瑛' }],
      members: [{ userId: 'a', teamName: '美瑛ブルーレイクス' }],
    };
    // 付ける前は既定の名前を都市で切って分ける
    assert.equal(teamCityOf(l.teams[0]), '美瑛', '既定の地域名が引けない');
    assert.equal(teamNicknameOf(l.teams[0]), 'ブルーレイクス', '既定のチーム名が引けない');
    const out = applyProfile(l, { userId: 'a', cityName: '旭川', nickname: 'スターズ' });
    assert.equal(l.teams[0].displayName, '旭川スターズ', '球団名が組み上がっていない');
    assert.equal(l.teams[0].displayCity, '旭川', '地域名を残していない');
    assert.equal(l.teams[0].displayNickname, 'スターズ', 'チーム名を残していない');
    assert.equal(out.city, '旭川');
    assert.equal(out.nickname, 'スターズ');
    // ⚠ **内部名は変えない**（記録の選手キーまで貫いている）
    assert.equal(l.teams[0].name, '美瑛ブルーレイクス', '内部名を変えてしまっている');
    // ⚠ 略称は地域名そのまま（頭3文字の「旭川ス」にしない）
    assert.equal(teamDisplayOf(l.teams[0]).short, '旭川', '略称が地域名になっていない');
    // 分けずに付け替えた古い球団は、今までどおり頭3文字
    assert.equal(
      teamDisplayOf({ name: '美瑛ブルーレイクス', displayName: '旭川スターズ' }).short,
      '旭川ス',
      '分けていない球団の略称の作り方を変えてしまっている',
    );
    // ⚠ 地元は付けた地域名で引く（`hometown.js` の県の表）
    assert.deepEqual(CITY_PREFS['旭川'], ['北海道'], '前提: 地域名から県が引けない');
    // 長すぎる名前は断る
    assert.throws(() => applyProfile(l, { userId: 'a', cityName: '１２３４５６７８９' }), /地域名/);
    assert.throws(() => applyProfile(l, { userId: 'a', nickname: 'あ'.repeat(17) }), /チーム名/);
    // ⚠ **地方を選べば、地域名が何であっても地元が付く**（いしだ 2026-11-20「北海道や東北、
    //    関東、信越など、最初に選んでから地域名を打つのはどうですか？」）
    {
      applyProfile(l, { userId: 'a', cityName: '美瑛', nickname: 'ブルーレイクス', region: 'hokkaido' });
      assert.equal(l.teams[0].displayRegion, 'hokkaido', '地方を残していない');
      assert.equal(teamRegionOf(l.teams[0]), 'hokkaido');
      // 表に無い地名でも、地方の県ぜんぶが地元になる
      assert.deepEqual(prefsOfCity('美瑛'), [], '前提: 美瑛は地名の表に無い');
      assert.deepEqual(prefsOfTeam({ region: 'hokkaido', city: '美瑛' }), ['北海道']);
      assert.equal(
        localPlayersIn(prefsOfTeam({ region: 'hokkaido', city: '美瑛' }), [
          { id: 1, name: '道産子', highSchool: { name: '旭川北', pref: '北海道' } },
          { id: 2, name: 'よそ者', highSchool: { name: '大阪北', pref: '大阪' } },
        ]).length,
        1,
        '地方を選んでも地元出身を拾えない',
      );
      // 地方を選んでいない球団は、今までどおり地名から引く
      assert.deepEqual(prefsOfTeam({ city: '旭川' }), ['北海道'], '地名から引けなくなっている');
      // 知らない地方は断る
      assert.throws(() => applyProfile(l, { userId: 'a', region: 'まだ無い地方' }), /地方/);
    }

    // 古い画面（`teamName` だけ送る）も今までどおり通る
    applyProfile(l, { userId: 'a', teamName: '昔ながらの名前' });
    assert.equal(l.teams[0].displayName, '昔ながらの名前', '古い送り方が効かなくなっている');
    // ⚠ 古い送り方で名前を変えたら、分けた名前（地域名・チーム名・地方）を残さない
    //    （2026-11-20 監査。正式名だけ変わり、略称・地域名・地元が「美瑛」のままだった）
    assert.equal(teamDisplayOf(l.teams[0]).short, '昔なが', '古い送り方の後も前の地域名が略称に残っている');
    assert.equal(teamDisplayOf(l.teams[0]).city, '', '古い送り方の後も前の地域名が残っている');
    assert.equal(teamRegionOf(l.teams[0]), null, '古い送り方の後も前の地方が残っている');
  }

  // 古い送り方（アプリ・初めのセット選び）は名前を変えなくても毎回 `teamName` を送る。
  // 名前が同じなら分けた名前を消さない。いまの地域名で始まる名前ならチーム名だけ差し替える
  {
    const l = {
      season: { year: 1 },
      teams: [{ name: '新潟ブリザーズ', city: '新潟', abbreviation: '新潟' }],
      members: [{ userId: 'a', teamName: '新潟ブリザーズ' }],
    };
    applyProfile(l, { userId: 'a', cityName: '美瑛', nickname: 'ブルーレイクス', region: 'hokkaido' });
    applyProfile(l, { userId: 'a', teamName: '美瑛ブルーレイクス', comment: 'がんばる' });
    assert.equal(teamRegionOf(l.teams[0]), 'hokkaido', '名前を変えない古い送り方で地方が消えた');
    assert.equal(teamDisplayOf(l.teams[0]).short, '美瑛', '名前を変えない古い送り方で略称が変わった');
    applyProfile(l, { userId: 'a', teamName: '美瑛ベアーズ' });
    assert.deepEqual(
      [teamDisplayOf(l.teams[0]).city, teamDisplayOf(l.teams[0]).nickname, teamRegionOf(l.teams[0])],
      ['美瑛', 'ベアーズ', 'hokkaido'],
      '地域名で始まる名前に変えたのに地域名・地方を残していない',
    );
    // 別の人が入るときも前の人の分けた名前を引き継がない（CPUに戻すのは下の A3 で見る）
    l.members = [];
    l.teams[0].displayName = l.teams[0].name;
    l.teams[0].league = 'B';
    applyJoin(l, { userId: 'b', teamName: '', now: 'x' });
    assert.equal(teamDisplayOf(l.teams[0]).short, '新潟', '次に入った人に前の人の略称が残っている');
    assert.equal(teamRegionOf(l.teams[0]), null, '次に入った人に前の人の地方が残っている');
  }

  // 判断1（いしだ 2026-11-20「おすすめで」）: 略称（＝地域名）が**同じリーグの**ほかの球団
  // （人の球団・CPU球団の既定の略称）とぶつかる名前は断る。別のリーグなら通す。
  // 既にぶつかっている保存データは触らず、名前を変えない送り方は通す
  {
    const fresh = () => ({
      season: { year: 1 },
      teams: [
        { name: '新潟ブリザーズ', city: '新潟', abbreviation: '新潟', league: 'B' },
        { name: '旭川スターズ', city: '旭川', abbreviation: '旭川', league: 'B' },
        { name: '美瑛ベアーズ', city: '美瑛', abbreviation: '美瑛', league: 'B', displayName: '富良野ベアーズ', displayCity: '富良野' },
        { name: '札幌ホークス', city: '札幌', abbreviation: '札幌', league: 'A' },
      ],
      members: [
        { userId: 'a', teamName: '新潟ブリザーズ' },
        { userId: 'c', teamName: '美瑛ベアーズ' },
      ],
    });
    // CPU球団の既定の略称（旭川）・人の球団の地域名（富良野）とぶつかる
    for (const cityName of ['旭川', '富良野']) {
      const l = fresh();
      assert.throws(
        () => applyProfile(l, { userId: 'a', cityName, nickname: 'ブリザーズ', region: 'hokkaido' }),
        (e) => e.status === 409 && /略称「.+」は同じリーグ/.test(e.message),
        `同じリーグの略称「${cityName}」とぶつかる地域名を通した`,
      );
      // ⚠ 断ったときは何も書き換えない（地方だけ先に書いていた）
      assert.equal(l.teams[0].displayName, undefined, '断ったのに球団名を書き換えた');
      assert.equal(l.teams[0].displayRegion, undefined, '断ったのに地方を書き換えた');
    }
    // 別のリーグの略称（札幌）とは同じでよい
    {
      const l = fresh();
      applyProfile(l, { userId: 'a', cityName: '札幌', nickname: 'ブリザーズ' });
      assert.equal(teamDisplayOf(l.teams[0]).short, '札幌', '別のリーグの略称と同じ地域名を断った');
    }
    // 古い送り方（`teamName` だけ。略称は頭3文字）でもぶつかれば断る
    {
      const l = fresh();
      assert.throws(
        () => applyProfile(l, { userId: 'a', teamName: '富良野フォックス' }),
        /略称「富良野」は同じリーグ/,
        '古い送り方で略称がぶつかる名前を通した',
      );
      assert.equal(l.teams[0].displayName, undefined, '古い送り方で断ったのに球団名を書き換えた');
      // 参加で付ける名前も同じ
      const j = fresh();
      j.members = j.members.filter((m) => m.userId !== 'a');
      j.teams = j.teams.filter((t) => t.name !== '旭川スターズ');
      assert.throws(
        () => applyJoin(j, { userId: 'x', teamName: '富良野フォックス', now: 'x' }),
        /略称「富良野」/,
        '参加で略称がぶつかる名前を通した',
      );
    }
    // 既にぶつかっている保存データ（移行しない）: 名前を変えない送り方・ひとことだけは通す
    {
      const l = fresh();
      Object.assign(l.teams[0], { displayName: '旭川ブリザーズ', displayCity: '旭川', displayNickname: 'ブリザーズ' });
      applyProfile(l, { userId: 'a', teamName: '旭川ブリザーズ', comment: 'がんばる' });
      applyProfile(l, { userId: 'a', cityName: '旭川', nickname: 'ブリザーズ', comment: 'がんばる' });
      // チーム名だけ変えるのも略称は変わらないので通す
      applyProfile(l, { userId: 'a', teamName: '旭川ベアーズ' });
      assert.equal(teamDisplayOf(l.teams[0]).short, '旭川');
      assert.equal(l.members[0].comment?.text, 'がんばる', 'ぶつかったままの保存データでひとことを直せない');
    }
    // Web の小窓が使う判定（ビューの `teamLabels`・`teamLeagues` から作る）
    {
      const entries = [
        { name: 'A', league: 'B', short: '新潟', label: '新潟ブリザーズ' },
        { name: 'B', league: 'B', short: '旭川', label: '旭川スターズ' },
        { name: 'C', league: 'A', short: '札幌', label: '札幌ホークス' },
      ];
      assert.equal(findShortClash(entries, 'A', '旭川')?.label, '旭川スターズ');
      assert.equal(findShortClash(entries, 'A', '札幌'), null, '別のリーグの略称を断っている');
      assert.equal(findShortClash(entries, 'A', '新潟'), null, 'いまの略称を断っている');
      assert.equal(findShortClash(entries, 'A', ''), null, '空の地域名を断っている');
    }
  }

  // ⚠ 地方を選んでいない球団の地元は**地名から**引く（地方全体に広げない。2026-11-20 監査。
  //    地名から地方を引いて渡していたので、新潟が北信越6県・筑豊が九州8県になっていた）
  {
    const widened = KNOWN_CITIES.filter((city) => {
      const team = { name: `${city}X`, abbreviation: city, city };
      return prefsOfTeam(teamHomeOf(team)).join() !== prefsOfCity(city).join();
    });
    assert.deepEqual(widened, [], `地方を選んでいない既定の球団の地元が変わっている: ${widened.slice(0, 5)}`);
    assert.equal(teamDisplayOf({ name: '新潟X', abbreviation: '新潟', city: '新潟' }).region, null, '小窓の初めの地方を地名から埋めている');
  }

  // ⚠ 分けずに付け替えた古い球団（表示名が既定の都市で始まらない）は、小窓の地域名を空で出す。
  //    既定の都市を入れると、地方だけ選んで保存したとき「新潟美瑛ブルーレイクス」になっていた
  {
    const l = {
      season: { year: 1 },
      teams: [{ name: '新潟ブリザーズ', city: '新潟', abbreviation: '新潟' }],
      members: [{ userId: 'a', teamName: '新潟ブリザーズ' }],
    };
    applyProfile(l, { userId: 'a', teamName: '美瑛ブルーレイクス' });
    const d = teamDisplayOf(l.teams[0]);
    assert.deepEqual([d.city, d.nickname], ['', '美瑛ブルーレイクス'], '古い球団の小窓の初めの値が既定の都市を含む');
    // 地元は分ける前と同じく球団の土地
    assert.deepEqual(prefsOfTeam(teamHomeOf(l.teams[0])), ['新潟'], '古い球団の地元が変わった');
    applyProfile(l, { userId: 'a', cityName: d.city, nickname: d.nickname, region: 'hokkaido' });
    assert.equal(l.teams[0].displayName, '美瑛ブルーレイクス', '地方だけ選んで保存したら球団名が変わった');
  }

  // 途中参加の種: 版13へ上げたリーグには `memberSeq` が無い。球団をCPUに戻した後に入った人が
  // 残っている人と同じ種にならないこと（同じidの選手ができる）。名簿に入ったセットの選手のidからも数える
  {
    const teams = ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ name, displayName: name, league: 'B', rank: 'C' }));
    const old = {
      seed: 100,
      teams,
      season: { standings: [] },
      phase: null,
      members: [
        { userId: 'u0', teamName: 'A' },
        { userId: 'u2', teamName: 'C', packSeed: 109 },
        { userId: 'u3', teamName: 'D', packSeed: 110 },
      ],
      game: { teams: { E: { players: [{ id: 112 * 1000 + 5 }, { id: 7 }] } } },
    };
    assert.equal(nextMemberIndex(old), 6, '名簿に入ったセットの選手のidから通し番号を数えていない');
    delete old.game;
    applyJoin(old, { userId: 'u4', now: '2026-11-01T00:00:00.000Z' });
    const joined = old.members.at(-1);
    assert.equal(joined.packSeed, 111, '版13のリーグで、残っている人と同じ種を渡した');
    assert.equal(old.memberSeq, 5);
    // 入った人には来た時刻を入れる（無いと来なくなってもおるすばんにならない）
    assert.equal(joined.lastSeenAt, '2026-11-01T00:00:00.000Z', '途中参加の人に来た時刻が無い');
    assert.ok(isAwayAt(joined, '2026-11-05T00:00:00.000Z'), '途中参加の人が来なくなってもおるすばんにならない');
  }
}

// --- 3人のリーグで通しで動かす ------------------------------------------------
const dir = await mkdtemp(join(tmpdir(), 'pennant-social-'));
try {
  const store = new FileStore(join(dir, 'state.gz'));
  let now = '2026-10-26T15:00:00.000Z';
  const later = (hours) => {
    now = new Date(Date.parse(now) + hours * 3600000).toISOString();
  };
  const service = new LeagueService(store, {
    members: [{ userId: 'a', label: 'A' }],
    adminId: 'a',
    allowStep: true,
    clock: () => now,
  });
  const sessions = {};
  for (const id of ['a', 'b', 'c']) sessions[id] = (await service.login(id)).sessionId;
  let seq = 0;
  const live = () => store.read().then((b) => b.league);
  const send = async (user, type, payload) => {
    const l = await live();
    seq += 1;
    return service.command(user, sessions[user], {
      requestId: `social-${type}-${seq}`,
      revision: l?.revision ?? 0,
      type,
      payload,
    });
  };
  const view = (user) => service.view(user, sessions[user]);
  await send('a', 'create');
  await send('b', 'join', { teamName: '湘南サンズ' });
  await send('c', 'join', { teamName: '美瑛ベアーズ' });
  // 手続きの間（開幕前のセット選び）は練習試合・予告先発を断る。⚠ 以前は受けると
  // 「先発投手が未登録です」で落ちた（ローテがまだ無い）
  {
    const l = await live();
    assert.equal(l.phase?.kind, 'pack_select', '前提: 開幕前の手続きの最中');
    const own = l.members.find((m) => m.userId === 'b').teamName;
    const foe = l.members.find((m) => m.userId === 'c').teamName;
    await assert.rejects(() => send('b', 'challenge', { toTeam: foe }), /手続きの間は、練習試合/, '手続きの間に練習試合を申し込めた');
    const game = l.season.schedule.find((g) => g.home === own || g.away === own);
    await assert.rejects(
      () => send('b', 'starterPick', { gameId: game.id, playerId: null }),
      /手続きの間は、予告先発/,
      '手続きの間に予告先発を選べた',
    );
  }
  for (let i = 0; i < 4; i += 1) {
    const l = await live();
    if (!l.phase) break;
    for (const m of l.members) {
      const cur = await live();
      if (!cur.phase) break;
      await send(m.userId, 'submit', {
        phaseId: cur.phase.id,
        plan: defaultPhasePlan(cur, m.teamName),
        ready: true,
        baseSubmission: null,
      });
    }
  }
  assert.equal((await live()).status, 'running', '前提: 開幕している');
  for (let i = 0; i < 4; i += 1) {
    await send('a', 'step');
    later(1);
  }
  const started = await live();
  const teamOf = (l, user) => l.members.find((m) => m.userId === user).teamName;
  const [A, B, C] = ['a', 'b', 'c'].map((u) => teamOf(started, u));
  const pitchersOf = (l, name) =>
    l.game.teams[name].players.filter((p) => p.position === 'pitcher' && p.isActive !== false);

  // --- C1 オーナーのひとこと ------------------------------------------------
  await send('b', 'profile', { comment: '今年は昇格しかない' });
  assert.equal(
    (await view('a')).members.find((m) => m.teamName === B).comment,
    '今年は昇格しかない',
    'ひとことがほかの人に見えていない',
  );
  await assert.rejects(
    () => send('b', 'profile', { comment: 'あ'.repeat(OWNER_COMMENT_MAX + 1) }),
    /ひとことは/,
    '長すぎるひとことが通った',
  );
  assert.equal(
    (await service.teamInfo('a', B)).owner?.comment,
    '今年は昇格しかない',
    '球団の画面にひとことが出ていない',
  );

  // --- A1 トレードのひとこと・返事の知らせ ------------------------------------
  const pA = pitchersOf(started, A);
  const pB = pitchersOf(started, B);
  const pC = pitchersOf(started, C);
  await assert.rejects(
    () => send('a', 'tradeOffer', { to: B, offer: [pA[0].id], want: [pB[0].id], note: 'あ'.repeat(TRADE_NOTE_MAX + 1) }),
    /ひとことは/,
    '長すぎるひとことが通った',
  );
  await send('a', 'tradeOffer', { to: B, offer: [pA[0].id], want: [pB[0].id], note: '捕手が足りなくて…' });
  // ⚠ CPU球団からの提案（`runCpuTrades`）も並ぶので、人どうしの提案を球団で探す
  const humanTrade = (v) => v.trades.find((t) => t.fromTeam === A && t.toTeam === B);
  // CPU球団からの提案（画面では `fromCpu`、保存では `from` が null）を除いた提案
  const humanTrades = (list) => list.filter((t) => !t.fromCpu && t.from !== null);
  const offeredB = humanTrade(await view('b'));
  assert.equal(offeredB.note, '捕手が足りなくて…', '相手にひとことが届いていない');
  await send('b', 'tradeRespond', { tradeId: offeredB.id, action: 'counter', offer: [pA[0].id, pA[1].id], want: [pB[0].id], note: 'もう1人なら' });
  const countered = await view('a');
  assert.equal(humanTrade(countered).replyNote, 'もう1人なら', '逆提案のひとことが無い');
  assert.equal(countered.inbox[0].type, 'tradeCountered', '逆提案の知らせが無い');
  await send('a', 'tradeRespond', { tradeId: offeredB.id, action: 'reject' });
  assert.equal((await view('b')).inbox[0].type, 'tradeWithdrawn', '取り下げの知らせが無い');
  assert.equal(humanTrades((await view('a')).trades).length, 0);

  // 成り立たなくなった提案は取り下げる: A の投手を B と C の両方に出し、B が受ける
  await send('a', 'tradeOffer', { to: B, offer: [pA[0].id], want: [pB[0].id] });
  await send('a', 'tradeOffer', { to: C, offer: [pA[0].id], want: [pC[0].id] });
  const toB = humanTrade(await view('b'));
  const revisionBefore = (await live()).revision;
  await send('b', 'tradeRespond', { tradeId: toB.id, action: 'accept' });
  const afterTrade = await live();
  assert.equal(humanTrades(afterTrade.trades).length, 0, '動いた選手を含む提案が残っている（枠を埋める）');
  assert.ok(afterTrade.revision > revisionBefore);
  assert.equal((await view('a')).inbox[0].type, 'tradeAccepted', '成立の知らせが無い');
  assert.ok(
    (await view('c')).inbox.some((n) => n.type === 'tradeWithdrawn'),
    '取り下げた提案の相手に知らせていない',
  );

  // --- A2 取引の記録 --------------------------------------------------------
  const log = afterTrade.transactions[0];
  assert.equal(log.kind, 'trade');
  assert.deepEqual(log.teams, [A, B]);
  assert.deepEqual(
    log.moves.map((m) => [m.playerId, m.from, m.to]),
    [
      [pA[0].id, A, B],
      [pB[0].id, B, A],
    ],
    '取引の記録の中身がちがう',
  );
  const read = await service.transactions('c', { team: B });
  assert.equal(read.items[0].id, log.id, '取引の記録を球団で絞れない');
  assert.equal((await service.transactions('c', { team: C })).items.length, 0);
  assert.equal((await view('a')).recentTransactions[0].id, log.id);
  await assert.rejects(() => service.transactions('zz', {}), (e) => e.status === 403);

  // --- B4 練習試合 ------------------------------------------------------------
  await assert.rejects(
    () => send('a', 'challenge', { toTeam: started.teams.find((t) => !started.members.some((m) => m.teamName === t.name)).name }),
    /人が持っている球団/,
    'CPU球団に申し込めた',
  );
  await send('a', 'challenge', { toTeam: C, note: '新しい打順を試したい' });
  await assert.rejects(() => send('c', 'challenge', { toTeam: A }), /もう申し込み/, '同じ組で2つ申し込めた');
  const offer = (await view('c')).exhibitions[0];
  assert.equal(offer.status, 'offered');
  assert.equal((await view('c')).inbox[0].type, 'challenge', '申し込みの知らせが無い');
  const beforeGame = await live();
  await send('c', 'challengeRespond', { id: offer.id, action: 'accept' });
  const afterGame = await live();
  const played = afterGame.exhibitions.find((e) => e.id === offer.id);
  assert.equal(played.status, 'played');
  assert.ok(Number.isInteger(played.result.homeScore) && Number.isInteger(played.result.awayScore));
  assert.equal(played.result.home, C, '受けた側がホームでない');
  assert.ok(played.result.teams[A]?.length > 8, '練習試合のボックスが無い');
  // 回ごとの攻撃は練習試合の画面が読まないので残さない（2026-11-20 監査。保存の無駄）
  assert.equal(played.result.plays, undefined, '練習試合の箱に読まない plays が残っている');
  // ⚠ 成績・疲労・調子・記録・順位・日程に入らない
  for (const name of [A, C])
    assert.deepEqual(
      afterGame.game.teams[name],
      beforeGame.game.teams[name],
      `${name} の選手が練習試合で変わった（疲労・成績が残る）`,
    );
  assert.deepEqual(afterGame.season.standings, beforeGame.season.standings, '順位表が変わった');
  assert.deepEqual(afterGame.records, beforeGame.records, '記録に練習試合が入った');
  assert.deepEqual(afterGame.season.schedule, beforeGame.season.schedule, '日程が変わった');
  assert.equal((await view('a')).inbox[0].type, 'challengePlayed', '結果の知らせが無い');
  // 同じ相手とは1日1試合
  await assert.rejects(() => send('a', 'challenge', { toTeam: C }), /1日/, '同じ日に2試合目を申し込めた');
  later(24);
  await send('a', 'challenge', { toTeam: C });
  const second = (await view('a')).exhibitions.find((e) => e.status === 'offered');
  await send('a', 'challengeRespond', { id: second.id, action: 'withdraw' });
  assert.equal((await view('c')).inbox[0].type, 'challengeWithdrawn');
  // 同じ申し込みからは同じ試合（乱数は申し込みの番号から）
  // ⚠ ここでは結果を作り直さず、乱数の種が番号から決まることだけ確かめる（`respondChallenge`）

  // --- B1 予告先発 ------------------------------------------------------------
  const plan = (await view('a')).starterPlan;
  const open = plan.games.find((g) => !g.starterLocked);
  assert.ok(open, '前提: 確定前の試合がある');
  assert.ok(plan.games.filter((g) => g.starterLocked).length >= 1, '前提: 確定した試合がある');
  const lockedGame = plan.games.find((g) => g.starterLocked);
  const rotation = (await view('a')).lineup.starters;
  await assert.rejects(
    () => send('a', 'starterPick', { gameId: lockedGame.id, playerId: rotation[0] }),
    /確定しています/,
    '確定した試合の先発を変えられた',
  );
  const notStarter = (await live()).game.teams[A].players.find(
    (p) => p.position === 'pitcher' && !rotation.includes(p.id),
  );
  if (notStarter)
    await assert.rejects(
      () => send('a', 'starterPick', { gameId: open.id, playerId: notStarter.id }),
      /先発ローテ/,
      'ローテに居ない投手を指名できた',
    );
  // ⚠ 休めている投手を選ぶ（その試合の次に回ってくる予定の投手。前の登板から間が空いている）
  const ownSide = open.home === A ? 'home' : 'away';
  const index = plan.games.indexOf(open);
  const nextName = plan.games[index + 1]?.[`${ownSide}Starter`];
  const pickId =
    (await live()).game.teams[A].players.find((p) => p.name === nextName && rotation.includes(p.id))?.id ??
    rotation.find((id) => id !== open[`${ownSide}StarterInfo`]?.id);
  await send('a', 'starterPick', { gameId: open.id, playerId: pickId });
  const picked = (await view('a')).starterPlan.games.find((g) => g.id === open.id);
  assert.equal(picked[`${ownSide}StarterMark`], 'pick', '自分の指名に印が無い');
  assert.equal(picked[`${ownSide}StarterInfo`]?.id, pickId, '指名した投手が先発予定に出ていない');
  // 確定するまで試合を進める → 確定の印、変えられない
  let removedFromRotation = false;
  for (let i = 0; i < 20; i += 1) {
    const l = await live();
    const game = l.season.schedule.find((g) => g.id === open.id);
    if (game.result) break;
    const lockedNow =
      (await view('a')).starterPlan.games.find((g) => g.id === open.id)?.starterLocked;
    if (lockedNow) {
      await assert.rejects(
        () => send('a', 'starterPick', { gameId: open.id, playerId: null }),
        /確定しています/,
        '確定した指名を外せた',
      );
      // Q1 確定の後に指名した投手をローテから外しても、確定した先発は変わらない（相手に見えたとおり投げる）
      const cur = await live();
      assert.equal(cur.members.find((m) => m.userId === 'a').lockedStarters?.[open.id]?.id, pickId, '確定した先発を控えていない');
      // ⚠ 1度だけ外す（外した後の進行でもここを通る）
      if (!removedFromRotation) {
        removedFromRotation = true;
        assert.ok(cur.game.teams[A].pitchingRotation.starters.includes(pickId), '前提: 指名した投手がローテに居る');
        const base = JSON.parse(JSON.stringify(projectLineup(cur.game.teams[A])));
        const edited = { ...structuredClone(base), starters: base.starters.filter((id) => id !== pickId) };
        // 外した投手は先発の役割のままでは保存できない（救援の「おまかせ」に戻す）
        if (edited.pitcherRoles) delete edited.pitcherRoles[pickId];
        await send('a', 'lineup', { ...edited, baseLineup: base });
        assert.ok(!(await live()).game.teams[A].pitchingRotation.starters.includes(pickId), '前提: ローテから外れた');
      }
      // 相手（B）の目から見た先発予定（ビューと同じ重ね方）
      const now2 = await live();
      const game = now2.season.schedule.find((g) => g.id === open.id);
      const [seen] = withStarters([game], now2.game.teams, null, starterContext(now2, B));
      assert.equal(seen[`${ownSide}StarterMark`], 'fixed', '確定した先発が相手に見えていない');
      assert.equal(
        seen[`${ownSide}Starter`],
        now2.game.teams[A].players.find((p) => p.id === pickId).name,
        '確定の後にローテを変えたら、相手に見える先発が変わった',
      );
    }
    await send('a', 'step');
    later(1);
  }
  const done = await live();
  const box = done.records.seasons[done.season.year].games[open.id];
  const starter = box.teams[A].find((p) => p.pitching?.gamesStarted === 1);
  // ⚠ 休めている投手を選んだので、回避ではなく投げているはず（世界の種は作った時刻で決まる）
  assert.equal(
    starter?.id,
    pickId,
    `指名した投手が投げていない（投げたのは ${starter?.name}）`,
  );
  assert.ok(removedFromRotation, '前提: 確定の後にローテから外した');
  assert.ok(
    !done.game.teams[A].pitchingRotation.starters.includes(pickId),
    'ローテの外から差し込んだ投手が、試合の後もローテに残っている',
  );
  assert.ok(!(done.members.find((m) => m.userId === 'a').starterPicks || {})[open.id], '終わった試合の指名が残っている');

  // --- A4 得点経過 ------------------------------------------------------------
  {
    const games = Object.values(done.records.seasons[done.season.year].games);
    assert.ok(games.length >= 6);
    for (const g of games) {
      assert.ok(Array.isArray(g.scoring), `試合 ${g.gameId} に得点経過が無い`);
      const away = g.scoring.filter((p) => p.half === 'top').reduce((s, p) => s + p.runs, 0);
      const home = g.scoring.filter((p) => p.half === 'bottom').reduce((s, p) => s + p.runs, 0);
      assert.deepEqual([away, home], [g.awayScore, g.homeScore], `試合 ${g.gameId} の得点経過の合計が点と合わない`);
      if (g.scoring.length) {
        const last = g.scoring.at(-1);
        assert.deepEqual([last.away, last.home], [g.awayScore, g.homeScore]);
      }
    }
    const recent = (await view('a')).recentGames.at(-1);
    assert.ok(Array.isArray(recent.scoring) && recent.lineScore, '直近の試合に得点経過と回ごとの得点が無い');
  }

  // --- A3 最後に来た時刻・おるすばん ---------------------------------------------
  {
    const l = await live();
    assert.ok(l.members.every((m) => m.lastSeenAt), 'ログイン・操作で来た時刻が入っていない');
    const before = l.revision;
    // 前に書いてから時間が経っていれば書く。⚠ 版は上げない（送信中の提出が弾かれる）
    assert.deepEqual(await service.presence('b', sessions.b), { ok: true });
    const seen = (await live()).members.find((m) => m.userId === 'b').lastSeenAt;
    assert.equal(seen, now, '画面を開いたのに来た時刻を書いていない');
    assert.equal((await live()).revision, before, '来た時刻の記録で版が上がった（送信中の提出が弾かれる）');
    // 書いたばかりなら書かない（画面を開くたびに保存しない）
    later(1);
    await service.presence('b', sessions.b);
    assert.equal((await live()).members.find((m) => m.userId === 'b').lastSeenAt, seen, '書いたばかりなのにまた書いた');
    // 留守の前に b が自分で打順を組む（1番と2番を入れ替える）。戻ってきたらこの形に戻ること
    const base = JSON.parse(JSON.stringify(projectLineup((await live()).game.teams[B])));
    const mine = structuredClone(base);
    for (const e of mine.battingOrder)
      if (e.battingOrder <= 2) e.battingOrder = 3 - e.battingOrder;
    await send('b', 'lineup', { ...mine, baseLineup: base });
    const ownOrder = JSON.stringify(projectLineup((await live()).game.teams[B]).battingOrder);
    const ownRotation = JSON.stringify(projectLineup((await live()).game.teams[B]).starters);
    // b だけ3日来ない（a は進行の操作で毎回来ている）
    later(AWAY_DAYS * 24 + 1);
    const modesBefore = structuredClone(l.members.find((m) => m.userId === 'b').staffModes || null);
    await send('a', 'step');
    const away = await live();
    const b = away.members.find((m) => m.userId === 'b');
    assert.equal(b.away, true, '3日来ていない人がおるすばんにならない');
    assert.equal(away.members.find((m) => m.userId === 'a').away, undefined, '来ている人を留守にした');
    if (away.coaches) {
      const modes = effectiveStaffModes(away, b);
      assert.ok(
        Object.values(modes).every((mode) => mode === 'delegate' || mode === 'self'),
        'おるすばんなのに「意見を聞く」が残っている',
      );
    }
    assert.deepEqual(b.staffModes || null, modesBefore, 'おるすばんで本人の任せ方を書き換えた');
    assert.ok((await view('a')).members.find((m) => m.teamName === B).away, '一覧に留守の印が出ない');
    assert.equal((await view('a')).members.find((m) => m.teamName === B).lastSeenDay, tokyoDay(seen));
    // 来たら解く。⚠ 解いたときは版を上げ、返事で知らせる（編成が戻るので、別の端末の古い編成から保存させない）
    const revisionAway = (await live()).revision;
    assert.deepEqual(await service.presence('b', sessions.b), { ok: true, returned: true }, 'おるすばんを解いたことを返事で知らせていない');
    assert.equal((await live()).revision, revisionAway + 1, 'おるすばんを解いたのに版を上げていない');
    const back = (await live()).members.find((m) => m.userId === 'b');
    assert.equal(back.away, undefined, '来たのにおるすばんが解けない');
    assert.equal(back.inbox[0].type, 'awayEnded');
    assert.ok(!isAwayAt(back, now));
    // 留守の前に組んだ編成に戻る（留守の間は指導者の案で作り直していた）
    assert.ok(b.awayPlan?.lineupSettings, '留守にするとき編成を控えていない');
    const backTeam = (await live()).game.teams[B];
    assert.equal(back.awayPlan, undefined, '戻した後も控えが残っている');
    if (effectiveStaffModes(await live(), back).lineup !== 'delegate')
      assert.equal(JSON.stringify(projectLineup(backTeam).battingOrder), ownOrder, '戻ってきたのに留守の前の打順に戻らない');
    if (effectiveStaffModes(await live(), back).pitching !== 'delegate')
      assert.equal(JSON.stringify(projectLineup(backTeam).starters), ownRotation, '戻ってきたのに留守の前のローテに戻らない');
    assert.match(back.inbox[0].text, /留守の前の形に戻しました/);
  }

  // あなたへのお知らせは残している件数（INBOX_LIMIT）を全部送る（以前は10件に切っていた）
  {
    await store.transaction((bundle) => {
      for (let i = 0; i < INBOX_LIMIT + 3; i += 1)
        pushInbox(bundle.league, 'a', { type: 'test', text: `お知らせ${i}` }, now);
      return { value: null };
    });
    assert.equal((await view('a')).inbox.length, INBOX_LIMIT, 'お知らせを残している件数ぶん送っていない');
  }

  // --- A3 管理者が球団をCPUに戻す -----------------------------------------------
  {
    await send('c', 'tradeOffer', { to: A, offer: [pitchersOf(await live(), C)[1].id], want: [pitchersOf(await live(), A)[2].id] });
    await send('a', 'challenge', { toTeam: C });
    await assert.rejects(() => send('b', 'releaseMember', { userId: 'c' }), (e) => e.status === 403, '管理者でない人が外せた');
    await assert.rejects(() => send('a', 'releaseMember', { userId: 'a' }), /自分/, '管理者が自分を外せた');
    // ⚠ 分けて付けた名前（地域名・チーム名・地方）もCPUに戻すときに消す（2026-11-20 監査）
    await send('c', 'profile', { cityName: '美瑛', nickname: 'ブルーレイクス', region: 'hokkaido' });
    await send('a', 'releaseMember', { userId: 'c' });
    const l = await live();
    {
      const released = l.teams.find((t) => t.name === C);
      assert.deepEqual(
        [released.displayCity, released.displayNickname, released.displayRegion],
        [undefined, undefined, undefined],
        'CPUに戻した球団に前の人の地域名・チーム名・地方が残っている',
      );
    }
    assert.ok(!l.members.some((m) => m.userId === 'c'), '外した人が残っている');
    assert.equal(l.teams.find((t) => t.name === C).displayName, C, '球団名が元に戻っていない');
    // ⚠ CPU球団からほかの人への提案（`runCpuTrades`）は残ってよい。外した人の分だけを見る
    assert.equal(
      l.trades.filter((t) => t.from === 'c' || t.to === 'c' || humanTrades([t]).length).length,
      0,
      '外した人の提案が残っている',
    );
    assert.ok(!l.exhibitions.some((e) => e.status === 'offered'), '外した人の練習試合の申し込みが残っている');
    assert.equal((await service.teamInfo('a', C)).owner, null, 'CPUに戻した球団にオーナーが出ている');
    assert.ok((await view('a')).inbox.some((n) => /オーナーが替わった/.test(n.text)), '相手に取り下げを知らせていない');
    // 次に入る人の種は、残っている人と重ならない
    const sd = (await service.login('d')).sessionId;
    sessions.d = sd;
    await send('d', 'join', {});
    const joined = await live();
    const seeds = joined.members.map((m) => m.packSeed).filter((s) => s != null);
    assert.equal(new Set(seeds).size, seeds.length, '途中参加の種が重なった（同じidの選手ができる）');
  }

  console.log(
    '■ 人どうしの関わり: OK（ひとこと / トレードのひとこと・返事の知らせ・成り立たない提案の取り下げ / 取引の記録 / 練習試合は成績・疲労・記録に入らず1日1試合 / 予告先発は確定まで本人だけ・確定後は変えられない・その投手が投げる / 得点経過の合計が点と合う / おるすばんと解除・版を上げない / 管理者が球団をCPUに戻す）',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
