// 契約更改の「指導者の異動」（先方要望 2026-11-23）の検査。1年を通して進め、翌年のキャンプまで行く。
//   A: 監督が退任 → 投手コーチを監督に昇格 → 投手の選手を投手コーチに打診（引退してコーチに）・野手コーチは退任
//   B: 監督だけ退任（監督の席はキャンプまで空く）
//   ・決めた案は年度更新で動く（契約更改の間は席が替わらない。終わった年の通算は前の席に残る）
//   ・退任は解任に数えない。出来事の文は「退任」・昇格は promote
//   ・おかしな案（空席の昇格・昇格させるコーチの退任・知らない値）は弾く
//   node tools/sim-harness/online-staff-moves-check.mjs
import assert from 'node:assert/strict';
import {
  createLeague,
  defaultPhasePlan,
  submitPhase,
  advanceLeagueDay,
} from '../../server/leagueEngine.mjs';
import { touchPresence } from '../../server/social.mjs';
import { projectLeague } from '../../server/projection.mjs';
import { validateStaffMoves } from '../../server/coachEngine.mjs';
import { staffMoveLines } from '../../src/online/contractTable.js';

let now = new Date('2026-10-28T00:00:00Z');
const iso = () => now.toISOString();
const league = createLeague({ members: [{ userId: 'a' }, { userId: 'b' }], now: iso() });
const [A, B] = league.members;
const view = (userId) => projectLeague({ league, sessions: {} }, userId, null, null);
const team = (name) => league.game.teams[name];

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

let before = null; // 契約更改のときの席 { A: {...}, B: {...} }
let offered = null;
let done = false;
let days = 0;
const startYear = league.season.year;
while (days < 700) {
  if (league.status === 'waiting') {
    const kind = league.phase.kind;
    if (kind === 'contract' && !before) {
      const seatsA = { ...league.coaches.teams[A.teamName] };
      const seatsB = { ...league.coaches.teams[B.teamName] };
      assert.ok(seatsA.manager && seatsA.pitching && seatsA.batting, 'A の席が埋まっていない（検査の前提）');
      assert.ok(seatsB.manager, 'B の監督がいない（検査の前提）');
      before = { A: seatsA, B: seatsB };
      // ビューに席がある（契約更改の画面が使う）
      const v = view(A.userId);
      assert.equal(v.staff.seats.length, 3, '契約更改のビューに指導者の席が無い');
      // おかしな案は弾く
      const base = defaultPhasePlan(league, A.teamName);
      const bad = (staffMoves, re) =>
        assert.throws(() => submitPhase(league, A.userId, { phaseId: league.phase.id, plan: { ...base, staffMoves } }, iso()), re);
      bad({ manager: 'fire' }, /異動/);
      bad({ pitching: 'batting' }, /異動/);
      bad({ manager: 'pitching', pitching: 'leave' }, /退任/);
      bad([], /異動/);
      // 空席の昇格は弾く（席を一時的に空けて確かめる）
      league.coaches.teams[A.teamName].batting = null;
      assert.throws(() => validateStaffMoves(league, A.teamName, { manager: 'batting' }), /昇格させるコーチがいません/);
      league.coaches.teams[A.teamName].batting = seatsA.batting;
      // 続投（null）だけの案は送らないのと同じ
      assert.equal(validateStaffMoves(league, A.teamName, { manager: null }), null);

      const pitcher = team(A.teamName).players.find((p) => p.position === 'pitcher' && !base.releaseIds.includes(p.id));
      offered = { id: pitcher.id, name: pitcher.name };
      const planA = { coachOffers: { pitching: pitcher.id }, staffMoves: { manager: 'pitching', batting: 'leave' } };
      // 画面の文（決定の帯・手続きの欄）
      const lines = staffMoveLines({ ...base, ...planA }, v.staff.seats, v.roster);
      const name = (id) => league.coaches.people[id].name;
      assert.deepEqual(lines, [
        `${name(seatsA.manager)}監督が退任し、${name(seatsA.pitching)}投手コーチが監督に昇格`,
        `${pitcher.name}（現役を引退）が投手コーチに就任`,
        `${name(seatsA.batting)}野手コーチが退任`,
      ], '異動の文が違う');
      resolve({ [A.userId]: planA, [B.userId]: { staffMoves: { manager: 'leave' } } });
      // 契約更改の間は席が替わらない（年度更新で動く）
      assert.deepEqual({ ...league.coaches.teams[A.teamName] }, seatsA, '契約更改のうちに席が替わった');
      assert.ok(league.coaches.moves?.[A.teamName] && league.coaches.moves?.[B.teamName], '異動が控えられていない');
      // 指導者の画面の「年度更新で動く人事」
      const sched = view(A.userId).staff.scheduled;
      assert.ok(sched.some((l) => l.includes('監督に昇格')), `年度更新で動く人事に昇格が無い: ${sched}`);
      assert.ok(sched.some((l) => l.includes(pitcher.name)), '年度更新で動く人事に打診した選手が無い');
      continue;
    }
    if (kind === 'camp' && league.season.year > startYear) {
      const c = league.coaches;
      const seatsA = c.teams[A.teamName];
      const reserved = Object.values(c.people).find((p) => p.name === offered.name && p.job?.team === A.teamName);
      // 昇格（投手コーチ → 監督）・打診した選手が投手コーチ・野手コーチは空席
      assert.equal(seatsA.manager, before.A.pitching, '投手コーチが監督に上がっていない');
      assert.ok(reserved && seatsA.pitching === reserved.id, '打診した選手が投手コーチに就いていない');
      assert.equal(seatsA.batting, null, '退任した野手コーチの席が空いていない');
      const oldHead = c.people[before.A.manager];
      if (oldHead) {
        assert.ok(oldHead.job?.team !== A.teamName, '退任した監督が席に残っている');
        assert.ok(!oldHead.fired, '退任が解任に数えられた');
        assert.ok(oldHead.career?.some((r) => r.year === startYear && r.team === A.teamName && r.role === 'manager'), '退任した監督の年の記録が消えた');
      }
      // 上がった人の終わった年は投手コーチとして残る
      const up = c.people[before.A.pitching];
      assert.ok(up.career?.some((r) => r.year === startYear && r.role === 'pitching'), '昇格した人の投手コーチの年が消えた');
      assert.ok(!up.career?.some((r) => r.year === startYear && r.role === 'manager'), '昇格した人に務めていない監督の年が付いた');
      // B は監督の席が空く（人の球団は自動で埋めない）・ほかの席はそのまま
      const seatsB = c.teams[B.teamName];
      assert.equal(seatsB.manager, null, 'B の監督の席が空いていない');
      // 出来事の文
      const ev = view(A.userId).staff.events;
      assert.ok(ev.some((e) => e.kind === 'promote' && e.coachId === before.A.pitching), '昇格の出来事が無い');
      const stepDown = ev.find((e) => e.kind === 'resign' && e.stepDown && e.role === 'manager');
      assert.ok(stepDown && stepDown.text.endsWith('監督が退任'), `退任の文が違う: ${stepDown?.text}`);
      assert.ok(!c.moves, '異動の控えが残っている');
      assert.equal(view(A.userId).staff.scheduled.length, 0, '年度更新の後も「動く人事」が残っている');
      done = true;
      break;
    }
    resolve();
    continue;
  }
  now = new Date(now.getTime() + 4 * 3600000);
  for (const m of league.members) touchPresence(league, m.userId, iso());
  advanceLeagueDay(league, `moves:${days}`, iso());
  days++;
}
assert.ok(done, '翌年のキャンプまで進まなかった');
console.log('online-staff-moves-check: ok');
