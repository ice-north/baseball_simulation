// 先方5項目（2026-11-21）の検査。1年を通して進め、翌年のキャンプまで行く。
//   ① ドラフトの気配（`proWatchList`。紙面の記事と名簿の黄色い札）
//   ② プロ指名された選手の成績を残す（個人成績ランキングの「プロへ」・歴代タイトル）
//   ③ トライアウト候補に「どの球団がリストに入れているか」（`listedBy`）
//   ④ 疲れた野手を休ませる目安（自動采配の `restLine`）
//   ⑤ 契約更改のコーチ打診（`hirePlayerAsCoach`。年度更新で席に就く）
//   node tools/sim-harness/online-owner-draft-five-check.mjs
import assert from 'node:assert/strict';
import {
  createLeague,
  defaultPhasePlan,
  submitPhase,
  advanceLeagueDay,
} from '../../server/leagueEngine.mjs';
import { touchPresence } from '../../server/social.mjs';
import { projectLeague, proWatchFor } from '../../server/projection.mjs';
import { npbShort, PRO_DRAFT_THRESHOLD, PRO_WATCH_MARGIN } from '../../server/proDraft.mjs';
import { restTiredFielders } from '../../server/dailyLineup.mjs';
import { validateTactics } from '../../server/lineupTactics.mjs';
import { TACTIC_DEFAULTS } from '../../src/online/tactics.js';
import { REST_LINES, restFatigueOf, FIELDER_REST_FATIGUE } from '../../src/online/shared.js';
import { tryoutInterest, tryoutPickOrder } from '../../src/online/tryoutPlan.js';

let now = new Date('2026-10-28T00:00:00Z');
const iso = () => now.toISOString();
const league = createLeague({ members: [{ userId: 'a' }, { userId: 'b' }], now: iso() });
const [A, B] = league.members;
const view = (userId) => projectLeague({ league, sessions: {} }, userId, null, null);
const team = (name) => league.game.teams[name];

/** 手続きを出す。`extra` で人ごとの案を足す（コーチ打診など） */
function resolve(extra = {}) {
  const phase = league.phase;
  for (const member of league.members)
    submitPhase(
      league,
      member.userId,
      { phaseId: phase.id, plan: { ...defaultPhasePlan(league, member.teamName), ...(extra[member.userId] || {}) }, ready: true },
      iso(),
    );
}

// ------------------------------------------------------------------ ④ 休ませる目安（単体）
{
  assert.equal(restFatigueOf(undefined), FIELDER_REST_FATIGUE);
  assert.equal(restFatigueOf({ restLine: 'early' }), REST_LINES.early);
  assert.equal(restFatigueOf({ restLine: 'late' }), REST_LINES.late);
  assert.equal(TACTIC_DEFAULTS.restLine, 'standard', '休ませる目安の既定が標準でない');
  assert.ok(REST_LINES.early < FIELDER_REST_FATIGUE && FIELDER_REST_FATIGUE < REST_LINES.late);
}

let watched = null; // 札が付いた日の記録
let boosted = null; // 指名させる選手（B の野手を能力の天井まで上げる）
let leadersChecked = false;
let tryoutChecked = false;
let offered = null; // { id, name, before }
let restChecked = false;
let days = 0;
const startYear = league.season.year;
while (days < 600) {
  if (league.status === 'waiting') {
    const kind = league.phase.kind;
    if (kind === 'tryout' && !tryoutChecked) {
      // ③ B だけ先に下書きを保存する（決定はまだ）。A の画面には B の球団の札が出る
      const plan = defaultPhasePlan(league, B.teamName);
      submitPhase(league, B.userId, { phaseId: league.phase.id, plan, ready: false }, iso());
      assert.ok(Object.keys(league.phase.cpuLists || {}).length > 0, 'CPU球団の狙い（cpuLists）が無い');
      const v = view(A.userId);
      const listed = v.phase.candidates.filter((c) => c.listedBy?.length);
      assert.ok(listed.length > 0, 'リストに入れている球団の札が1つも無い');
      for (const id of plan.rankedIds) {
        const c = v.phase.candidates.find((x) => x.id === id);
        assert.ok(c.listedBy?.some((r) => r.team === B.teamName && !r.cpu), 'B のリストの選手に B の札が無い');
      }
      assert.ok(!listed.some((c) => c.listedBy.some((r) => r.team === A.teamName)), '自分の球団の札が出ている');
      // 先に指名する球団（前年の順位が上）だけ first
      const order = tryoutPickOrder(league.season.standings);
      for (const c of listed)
        for (const r of c.listedBy) assert.equal(r.first, order.indexOf(r.team) < order.indexOf(A.teamName), '先に指名する球団の印が違う');
      // B の画面には B 自身の札は出ない
      assert.ok(!view(B.userId).phase.candidates.some((c) => c.listedBy?.some((r) => r.team === B.teamName)));
      // ⑤ 打診した選手はトライアウトの受験者にいない
      assert.ok(!league.phase.candidates.some((c) => c.name === offered.name && c.age === offered.age), 'コーチ打診した選手がトライアウトに出ている');
      tryoutChecked = true;
    }
    if (kind === 'contract' && !offered) {
      // ⑤ A が投手を投手コーチに打診する（標準案で退団にならない人）
      const plan = defaultPhasePlan(league, A.teamName);
      const pitcher = team(A.teamName).players.find((p) => p.position === 'pitcher' && !plan.releaseIds.includes(p.id));
      const seats = league.coaches.teams[A.teamName];
      offered = { id: pitcher.id, name: pitcher.name, age: pitcher.age, before: seats.pitching };
      // 解雇と重ねた案は弾く
      assert.throws(
        () => submitPhase(league, A.userId, { phaseId: league.phase.id, plan: { ...plan, releaseIds: [...plan.releaseIds, pitcher.id], coachOffers: { pitching: pitcher.id } } }, iso()),
        /コーチ打診/,
      );
      resolve({ [A.userId]: { coachOffers: { pitching: pitcher.id } } });
      assert.ok(!team(A.teamName).players.some((p) => p.id === pitcher.id), 'コーチ打診した選手が名簿に残っている');
      const reserved = Object.values(league.coaches.people).find((c) => c.status === 'reserved');
      assert.ok(reserved && reserved.name === pitcher.name, '打診した選手が就任予定の指導者になっていない');
      assert.deepEqual({ team: reserved.joins.team, role: reserved.joins.role }, { team: A.teamName, role: 'pitching' });
      assert.equal(league.coaches.teams[A.teamName].pitching, offered.before, '年度更新の前に席が替わった');
      offered.coachId = reserved.id;
      continue;
    }
    // 年度更新を越えて翌年のキャンプが開いたら、⑤ の席を見て終わる
    if (kind === 'camp' && league.season.year > startYear) {
      if (offered?.coachId) {
        const seats = league.coaches.teams[A.teamName];
        assert.equal(seats.pitching, offered.coachId, '年度更新で打診した選手が投手コーチに就いていない');
        if (offered.before) {
          const prev = league.coaches.people[offered.before];
          assert.ok(!prev || prev.status !== 'active' || prev.job?.team !== A.teamName || prev.job?.role !== 'pitching', '前の投手コーチが席に残っている');
        }
        // 前の人の終わった年の通算は残る（席を替える前に成績を足す）
        if (offered.before) {
          const prev = league.coaches.people[offered.before];
          if (prev) assert.ok(prev.career?.some((r) => r.year === startYear && r.team === A.teamName && r.role === 'pitching'), '前の投手コーチの年の記録が消えた');
        }
        assert.ok(!league.coaches.people[offered.coachId].career?.some((r) => r.year === startYear), '打診した選手に務めていない年の記録が付いた');
        offered.done = true;
      }
      break;
    }
    resolve();
    continue;
  }
  const d = league.season.currentDate;
  // ① 開幕したら B の若い野手を天井まで上げる（指名の線を越えさせる）
  if (!boosted && league.season.phase === 'regular_season') {
    const p = team(B.teamName).players.find((x) => x.position !== 'pitcher' && (x.age || 30) <= 24) ||
      team(B.teamName).players.find((x) => x.position !== 'pitcher');
    p.age = 20;
    p.growthPotential = 1.4;
    Object.assign(p.batting, { meet: 99, power: 99, eye: 99 });
    Object.assign(p.physical, { speed: 95, arm: 90 });
    boosted = { id: p.id, name: p.name };
  }
  // ④ 休ませる目安（試合の日の入れ替え）
  if (!restChecked && boosted && days > 5) {
    const t = structuredClone(team(A.teamName));
    const slot = t.lineupSettings.battingOrder.find((e) => e.position !== 'pitcher' && e.position !== 'dh');
    const p = t.players.find((x) => x.id === slot.playerId);
    for (const x of t.players) x.fatigue = 0;
    p.fatigue = 65;
    t.onlineTactics = { restLine: 'standard' };
    const a = restTiredFielders(t);
    assert.ok(!a.resting.includes(p.id), '標準なのに疲労65で休んだ');
    a();
    t.onlineTactics = { restLine: 'early' };
    const b = restTiredFielders(t);
    assert.ok(b.resting.includes(p.id), '早めなのに疲労65で休まない');
    b();
    p.fatigue = 90;
    t.onlineTactics = { restLine: 'late' };
    const c = restTiredFielders(t);
    assert.ok(!c.resting.includes(p.id), '遅めなのに疲労90で休んだ');
    c();
    // 保存の検査は目安を通す・知らない値を弾く
    assert.equal(validateTactics(t, { tactics: { restLine: 'early' } }, false).tactics.restLine, 'early');
    assert.throws(() => validateTactics(t, { tactics: { restLine: 'never' } }, false));
    restChecked = true;
  }
  // ① 札（噂の出た日から指名の日まで）
  // ビューを毎日作ると重いので、気配の一覧だけを毎日見て、名簿の札は最初に出た日だけ見る
  if (boosted && !league.season._draftDone) {
    const v = { proWatch: proWatchFor(league) };
    assert.ok(Array.isArray(v.proWatch), 'ビューに proWatch が無い');
    if (d.month < 5) assert.equal(v.proWatch.length, 0, '5月より前に噂が出た');
    const w = v.proWatch.find((x) => x.id === boosted.id);
    if (w && !watched) {
      watched = { ...w, month: d.month, day: d.day };
      assert.equal(w.team, B.teamName);
      assert.ok(view(A.userId).proWatch.some((x) => x.id === boosted.id), 'ビューの気配に出ていない');
      // B の名簿の札
      const vb = view(B.userId);
      assert.deepEqual(vb.roster.find((p) => p.id === boosted.id).proWatch, { npb: w.npb, level: w.level }, '名簿の札がビューの気配と違う');
    }
    for (const x of v.proWatch) assert.ok(['watch', 'hot'].includes(x.level));
  }
  if (league.season._draftDone && boosted && !leadersChecked && league.season.year === startYear) {
    const drafted = (league.chronicle.proDrafted || []).find((r) => r.year === startYear && r.name === boosted.name);
    assert.ok(drafted, '天井まで上げた選手が指名されていない');
    assert.ok(watched, '指名された選手に噂（札）が一度も出なかった');
    assert.equal(npbShort(drafted.npbTeam), watched.npb, '噂の球団と指名した球団が違う');
    const v = view(A.userId);
    assert.equal(v.proWatch.length, 0, '指名の後も噂が残っている');
    // ② 個人成績ランキングに「プロへ」で残る
    const rows = v.leaders.flatMap((c) => c.rows).filter((r) => r.name === boosted.name);
    assert.ok(rows.length > 0, '指名された選手がランキングから消えた');
    assert.ok(rows.every((r) => r.pro === true), 'ランキングの行に「プロへ」の印が無い');
    // ② 歴代タイトル（今年の分も成績を確定した日から入る）
    const year = v.chronicle.titles.find((y) => y.year === startYear);
    assert.ok(year?.titles.length, '今年のタイトルが歴代タイトルに無い');
    const mine = year.titles.filter((t) => t.name === boosted.name);
    for (const t of mine) assert.equal(t.pro, watched.npb, 'タイトルにプロへの印が無い');
    leadersChecked = true;
  }
  now = new Date(now.getTime() + 4 * 3600000);
  for (const m of league.members) touchPresence(league, m.userId, iso());
  advanceLeagueDay(league, `five:${days}`, iso());
  days++;
}
assert.ok(boosted && watched && leadersChecked, '①② を見ていない');
assert.ok(tryoutChecked, '③ を見ていない');
assert.ok(restChecked, '④ を見ていない');
assert.ok(offered?.done, '⑤ 年度更新の後を見ていない');
// 年度更新の後も歴代タイトルに残る
{
  const v = view(A.userId);
  const year = v.chronicle.titles.find((y) => y.year === startYear);
  assert.ok(year?.titles.length, '年度更新の後に今年のタイトルが消えた');
}
// ③ 単体: 並び
{
  const out = tryoutInterest({
    ownTeam: 'b',
    order: ['a', 'b', 'c'],
    humanLists: { a: [1, 2], b: [1] },
    cpuLists: { c: [2] },
  });
  assert.deepEqual(out.get(1), [{ team: 'a', wish: 1, cpu: false, first: true }]);
  assert.deepEqual(out.get(2), [
    { team: 'a', wish: 2, cpu: false, first: true },
    { team: 'c', wish: 1, cpu: true, first: false },
  ]);
}
void PRO_DRAFT_THRESHOLD;
void PRO_WATCH_MARGIN;
console.log(`先方5項目の検査 OK（${days}日。噂 ${watched.month}/${watched.day} ${watched.npb}${watched.level === 'hot' ? '接触' : '注目'}）`);
