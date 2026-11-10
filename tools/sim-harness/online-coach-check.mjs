// 指導者（監督・投手コーチ・野手コーチ）の検査。
//   node tools/sim-harness/online-coach-check.mjs
//   WRITE_APP_FIXTURE=1 node tools/sim-harness/online-coach-check.mjs   # アプリの検査用のビューも書き出す
//
// 1. 同じ種なら同じ顔ぶれ（作り直し・保存の移行でも同じ）
// 2. 人の球団で全部「自分で」なら、指導者は何も触らない（指導者を入れる前と同じ判断）
// 3. 任せ方の切り替え・任せた分野を自分で変えたら「意見を聞く」に戻る・空いた席は「自分で」
// 4. 人事（キャンプの間だけ・解任・市場から呼ぶ・役職の入れ替え）
// 5. 年度更新を何十年も回して、CPU球団に監督がいない／同じ人が2つの席にいる、が起きない
// 6. 実際に1年回して翌年のキャンプまで（通算が残る・画面の形）
// 7. ビジョン（攻めの型 × 守りの型 × 時間軸）から考え方・好み・キャンプの方針が筋どおりに決まる。
//    トレードの見る目は ±10% に収まる（監督は人の采配の肩代わりで、強さを足さない）
// 8. 説明だけの飾り: 語り口・軸の選手・再登板で丸くなる・称号
// 9. 総合監査（2026-11-10）で直したもの: キャンプの指導者の案を画面に出す・空いた席はおすすめ・
//    トライアウトは終わったばかりの年の勝率・同じキャンプで外した監督の呼び戻しは解任に数えない・
//    版11からの移行で型が考え方と逆を向かない
// 10. 任せた手続き（トライアウト・退団・キャンプ）は、その人の決定を待たない（総合監査 2026-11-10 の判断7）
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import {
  createLeague,
  defaultPhasePlan,
  submitPhase,
  advanceLeagueDay,
  updateStaffModes,
  updateStaff,
  saveLineup,
  waitsFor,
  openPhase,
  loadLeagueWorld,
  captureLeagueWorld,
  autoResolvePhase,
} from '../../server/leagueEngine.mjs';
import {
  staffOf,
  tryoutContextFor,
  releaseBiasFor,
  campPlanFor,
  applyStaffTactics,
  teamTacticsFor,
  coachOffseason,
  fillVacancies,
  effectiveStaffModes,
  conflictOf,
  RIFT_CONFLICT,
  setStaffModes,
} from '../../server/coachEngine.mjs';
import { cpuTeams } from '../../src/online/membership.js';
import {
  createCoaches,
  STAFF_AREA_KEYS,
  COACH_ROLES,
  ATTACK_TYPES,
  DEFENSE_TYPES,
  HORIZONS,
  PERSONALITY_KEYS,
  growthPolicy,
  tradeFactor,
  TRADE_FACTOR_LIMIT,
  visionOf,
  VOICES,
  keyPlayers,
  mellowOnReturn,
  assignCoach,
  pitchText,
  preferenceText,
  tryoutContext,
  upgradeCoach,
} from '../../src/online/coaches.js';
import { coachCard, coachTitles } from '../../server/coachView.mjs';
import { migrateLeague } from '../../src/online/leagueMigration.js';
import { projectLeague, projectLineup, projectTeamInfo } from '../../server/projection.mjs';
import { hashSeed, withSeededRandom } from '../../src/game/rng.js';
import { buildArchiveIndex } from '../../server/archiveIndex.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
let now = new Date('2026-10-28T00:00:00Z');
const iso = () => now.toISOString();
const members = [{ userId: 'a' }, { userId: 'b' }];

// ------------------------------------------------------------------ 1. 種
const league = createLeague({ members, now: iso() });
const again = createLeague({ members, now: iso() });
assert.deepEqual(league.coaches, again.coaches, '同じ種で顔ぶれが変わった');
assert.deepEqual(createCoaches(clone(league)), league.coaches, '作り直すと顔ぶれが変わる');
{
  // 保存の移行（版9 → 10）で配る人も同じ
  const old = clone(league);
  delete old.coaches;
  old.schema = 9;
  migrateLeague(old);
  assert.deepEqual(old.coaches, league.coaches, '移行で配った顔ぶれが新しいリーグと違う');
  // 2回当てても同じ（`??=` の書き方）
  const twice = clone(old);
  twice.schema = 9;
  migrateLeague(twice);
  assert.deepEqual(twice.coaches, league.coaches, '移行を2回当てると変わる');
}
{
  // 版11 → 12: PR #22 の形（ビジョンが無い）の指導者に項目を足す。考え方は変えない
  const old = clone(league);
  old.schema = 11;
  for (const p of Object.values(old.coaches.people)) {
    delete p.vision;
    delete p.growth;
    delete p.voice;
    p.personality = { temper: p.personality.temper, youth: 1, trust: p.personality.trust, boldness: -1 };
    p.prefs = { hitter: 'speed', pitcher: 'control', camp: 'fit', campPhase: 'skill' };
  }
  const views = Object.fromEntries(Object.values(old.coaches.people).map((p) => [p.id, { ...p.views }]));
  migrateLeague(old);
  const again = clone(old);
  for (const p of Object.values(old.coaches.people)) {
    assert.deepEqual(p.views, views[p.id], '移行で考え方が変わった（采配が変わる）');
    // ⚠ 走塁が「慎重」の人は、好みが「俊足」でも足の型にしない（カードの文と采配が逆を向く。
    //    総合監査 2026-11-10）。それ以外は好みどおり
    if (p.views.running <= -1) assert.notEqual(p.vision.attack, 'speed', '走塁が慎重なのに足の型');
    else assert.equal(p.vision.attack, 'speed', '好みの「俊足」が攻めの型にならない');
    assert.ok(DEFENSE_TYPES[p.vision.defense] && HORIZONS[p.vision.horizon] && VOICES[p.voice]);
    assert.deepEqual(p.growth, { who: 'sharp', line: 70 }, '「選手に合わせる」が育成観にならない');
    assert.equal(p.personality.stubborn, 0);
    if (p.specialty === 'pitching') assert.equal(p.vision.flagship, 'defense');
  }
  again.schema = 11;
  migrateLeague(again);
  assert.deepEqual(again.coaches, old.coaches, '移行を2回当てると変わる');
}
const other = createLeague({ seed: 7, members, now: iso() });
assert.notDeepEqual(other.coaches.people, league.coaches.people, '種を変えても同じ顔ぶれ');

const names = league.season.settings.teamNames;
const human = league.members[0];
const humanTeam = human.teamName;
const cpuTeam = names.find((n) => !league.members.some((m) => m.teamName === n));

/** 席の整合（同じ人が2席にいない・席の人の職が席と合う・CPUに監督がいる） */
function assertSeats(l, where) {
  const c = l.coaches;
  const seen = new Map();
  for (const [team, seats] of Object.entries(c.teams))
    for (const role of COACH_ROLES) {
      const id = seats[role];
      if (!id) continue;
      assert.ok(!seen.has(id), `${where}: ${id} が ${seen.get(id)} と ${team}:${role} の2席にいる`);
      seen.set(id, `${team}:${role}`);
      const coach = c.people[id];
      assert.ok(coach, `${where}: ${team}:${role} の ${id} が名簿にいない`);
      assert.equal(coach.status, 'active', `${where}: 席にいる ${coach.name} が ${coach.status}`);
      assert.deepEqual([coach.job?.team, coach.job?.role], [team, role], `${where}: ${coach.name} の職が席と違う`);
    }
  for (const coach of Object.values(c.people)) {
    if (coach.status === 'active')
      assert.ok(seen.has(coach.id), `${where}: ${coach.name} は active なのに席が無い`);
    else assert.equal(coach.job, null, `${where}: ${coach.name} は ${coach.status} なのに職がある`);
  }
}
for (const name of names) {
  const s = staffOf(league, name);
  assert.ok(s.manager && s.pitching && s.batting, `${name} の席が埋まっていない`);
}
assertSeats(league, '作成直後');
assert.equal(Object.values(league.coaches.people).filter((p) => p.status === 'free').length, 8, '市場が8人でない');
for (const coach of Object.values(league.coaches.people)) {
  // 代打・守備固めは遅らせる向きしか無い（-2〜0）
  assert.ok(coach.views.bench <= 0, `${coach.name} の代打・守備固めが ${coach.views.bench}`);
  for (const v of Object.values(coach.views)) assert.ok(Number.isInteger(v) && v >= -2 && v <= 2);
  // ビジョンは攻め・守り・看板・時間軸の4つ。性格は気質・こだわり・任せ方の3つ
  const v = coach.vision;
  assert.ok(Object.hasOwn(ATTACK_TYPES, v?.attack) && Object.hasOwn(DEFENSE_TYPES, v?.defense), `${coach.name} の型が不正`);
  assert.ok(['attack', 'defense'].includes(v.flagship) && Object.hasOwn(HORIZONS, v.horizon), `${coach.name} の看板・時間軸が不正`);
  assert.deepEqual(Object.keys(coach.personality), PERSONALITY_KEYS, `${coach.name} の性格の軸が違う`);
  assert.ok(['all', 'sharp', 'none'].includes(coach.growth?.who), `${coach.name} の育成観が不正`);
  // 時間軸と「編成」の向きが食い違わない（育成なのに勝負重視、を作らない）
  if (v.horizon === 'develop') assert.ok(coach.views.build < 0, `${coach.name} は育成なのに編成 ${coach.views.build}`);
  if (v.horizon === 'win') assert.ok(coach.views.build > 0, `${coach.name} は勝負なのに編成 ${coach.views.build}`);
}
{
  // 型が考え方に出る（看板の側。揺らぎがあるので平均で見る）
  const people = Object.values(league.coaches.people);
  const mean = (list, key) => list.reduce((n, p) => n + p.views[key], 0) / Math.max(1, list.length);
  const flag = (side, type) => people.filter((p) => p.vision.flagship === side && p.vision[side] === type);
  assert.ok(mean(flag('attack', 'speed'), 'running') >= 1, '機動力が看板なのに走塁が積極でない');
  assert.ok(mean(flag('attack', 'power'), 'smallBall') <= -1, '長打が看板なのに小技が多い');
  assert.ok(mean(flag('attack', 'contact'), 'hitting') <= -1, 'つなぐが看板なのに打撃が慎重でない');
  assert.ok(mean(flag('defense', 'rotation'), 'bullpen') <= -1, '先発で押すが看板なのに継投が早い');
  assert.ok(mean(flag('defense', 'bullpen'), 'bullpen') >= 1, '継投でつなぐが看板なのに継投が遅い');
  assert.ok(mean(flag('defense', 'fielding'), 'pitching') <= -1, '打たせて守るが看板なのに三振狙い');
}
console.log(
  `指導者 ${Object.keys(league.coaches.people).length}人 / 例: ${names
    .slice(0, 3)
    .map((n) => `${n}=${staffOf(league, n).manager.name}`)
    .join('、')}`,
);

// ------------------------------------------------------------------ 2. 全部「自分で」
{
  const l = clone(league);
  const me = l.members[0];
  me.staffModes = Object.fromEntries(STAFF_AREA_KEYS.map((k) => [k, 'self']));
  assert.equal(tryoutContextFor(l, humanTeam), null, '自分でなのにトライアウトの考えが入る');
  assert.equal(releaseBiasFor(l, humanTeam), null, '自分でなのに退団の偏りが入る');
  assert.equal(campPlanFor(l, humanTeam, l.game.teams[humanTeam].players), null, '自分でなのにキャンプの案が入る');
  const team = clone(l.game.teams[humanTeam]);
  team.onlineTactics = { sacrificeBunt: 'auto', hook: 'auto' };
  const before = clone(team);
  const restore = applyStaffTactics(l, humanTeam, team);
  assert.deepEqual(team, before, '自分でなのに試合の采配が変わる');
  restore();
  assert.deepEqual(team, before);
  // 指導者そのものが無いリーグ（入れる前）とも、手続きの標準案が同じ
  const bare = clone(l);
  delete bare.coaches;
  assert.equal(tryoutContextFor(bare, humanTeam), null);
  // CPUはいつも指導者が決める
  assert.ok(tryoutContextFor(l, cpuTeam), 'CPUにトライアウトの考えが無い');
  assert.ok(releaseBiasFor(l, cpuTeam), 'CPUに退団の偏りが無い');
}

// ------------------------------------------------------------------ 3. 任せ方
function resolve(l) {
  const phase = l.phase;
  for (const member of l.members)
    submitPhase(
      l,
      member.userId,
      { phaseId: phase.id, plan: defaultPhasePlan(l, member.teamName), ready: true },
      iso(),
    );
}
// 名簿が配られたあと（初期メンバーを選んでキャンプに入ったところ）
const inCamp = clone(league);
while (inCamp.phase && inCamp.phase.kind !== 'camp') resolve(inCamp);
assert.equal(inCamp.phase?.kind, 'camp', 'キャンプに入らない');
{
  const l = clone(league);
  const team = l.game.teams[humanTeam];
  // 意見を聞く（既定）: AI判断の項目だけ指導者、決めた項目と方針は保存のまま
  team.onlineTactics = { sacrificeBunt: 'never', squeeze: 'auto' };
  team.strategy = { batting: 'aggressive' };
  const advice = teamTacticsFor(l, humanTeam, team);
  assert.equal(advice.tactics.sacrificeBunt, 'never', '意見を聞くなのに決めた項目が変わった');
  assert.equal(advice.strategy.batting, 'aggressive', '意見を聞くなのに方針が変わった');
  assert.ok(advice.lines.find((x) => x.key === 'squeeze').by, 'AI判断の項目に決めた人が無い');
  assert.equal(advice.lines.find((x) => x.key === 'sacrificeBunt').by, null);
  // 試合の日だけ当てて、保存は書き換えない
  const saved = clone(team);
  const restore = applyStaffTactics(l, humanTeam, team);
  restore();
  assert.deepEqual(team, saved, '試合の後に保存した采配が戻らない');
}
{
  // 任せる: 方針まで指導者
  const l = clone(inCamp);
  // ⚠ 任せ方の命令は記録の索引を作り直さない（`leagueService` の archiveUnchanged）。
  //    編成を指導者のものに作り直しても、索引（選手・球団の記録）が変わらないこと
  const index = () => JSON.stringify(buildArchiveIndex({ league: l, sessions: {} }));
  const indexBefore = index();
  updateStaffModes(l, human.userId, { tactics: 'delegate', lineup: 'delegate', pitching: 'delegate' });
  assert.equal(index(), indexBefore, '任せ方を変えると記録の索引が変わる');
  const modes = effectiveStaffModes(l, l.members[0]);
  assert.deepEqual([modes.tactics, modes.lineup, modes.pitching], ['delegate', 'delegate', 'delegate']);
  const team = l.game.teams[humanTeam];
  const delegated = teamTacticsFor(l, humanTeam, team);
  assert.ok(delegated.lines.filter((x) => x.field === 'strategy' && x.by).length >= 3, '任せたのに方針を指導者が決めていない');
  // 任せた分野を自分で変えたら「意見を聞く」に戻る（変えていない分野は任せたまま）
  const lineup = projectLineup(team);
  const plan = clone(lineup);
  const [x, y] = plan.battingOrder;
  [x.battingOrder, y.battingOrder] = [y.battingOrder, x.battingOrder];
  saveLineup(l, human.userId, { ...plan, baseLineup: lineup });
  const after = effectiveStaffModes(l, l.members[0]);
  assert.equal(after.lineup, 'advice', '任せた打順を変えても任せたまま');
  assert.equal(after.pitching, 'delegate', '投手起用は変えていないのに戻った');
  assert.equal(after.tactics, 'delegate', '采配は変えていないのに戻った');
  // 空いた席の分野は「自分で」
  l.coaches.teams[humanTeam].batting = null;
  const coach = staffOf(league, humanTeam).batting;
  l.coaches.people[coach.id].status = 'free';
  l.coaches.people[coach.id].job = null;
  assert.equal(effectiveStaffModes(l, l.members[0]).lineup, 'self', '野手コーチがいないのに打順を任せられる');
  const view = projectLeague({ league: l, sessions: {} }, human.userId, null, null);
  assert.ok(view.staff.modes.find((m) => m.key === 'lineup').locked, '空いた席の分野が選べるまま');
}

// ------------------------------------------------------------------ 4. 人事（キャンプの間だけ）
{
  assert.throws(
    () => updateStaff(clone(league), human.userId, { action: 'release', role: 'manager' }),
    /キャンプの間だけ/,
    'キャンプ以外で指導者を替えられる',
  );
  const l = clone(inCamp);
  const before = staffOf(l, humanTeam);
  updateStaff(l, human.userId, { action: 'release', role: 'manager' });
  assert.equal(staffOf(l, humanTeam).manager, null, '解任しても席が空かない');
  assert.equal(l.coaches.people[before.manager.id].status, 'free', '解任した人が市場にいない');
  // 投手コーチを監督に上げる
  updateStaff(l, human.userId, { action: 'swap', role: 'manager', other: 'pitching' });
  assert.equal(staffOf(l, humanTeam).manager.id, before.pitching.id, '入れ替えで監督にならない');
  assert.equal(staffOf(l, humanTeam).pitching, null);
  // 市場から投手コーチを呼ぶ
  const pick = Object.values(l.coaches.people).find((p) => p.status === 'free' && p.id !== before.manager.id);
  updateStaff(l, human.userId, { action: 'hire', role: 'pitching', coachId: pick.id });
  assert.equal(staffOf(l, humanTeam).pitching.id, pick.id, '市場から呼べない');
  assert.throws(() => updateStaff(l, human.userId, { action: 'hire', role: 'pitching', coachId: before.manager.id }), /先にその席の人を解任/);
  // 人の球団は監督なしでもよい
  updateStaff(l, human.userId, { action: 'release', role: 'manager' });
  assertSeats(l, '人事のあと');
  // 画面: 市場とカード
  const view = projectLeague({ league: l, sessions: {} }, human.userId, null, null);
  assert.ok(view.staff.canEditSeats && view.staff.market.length > 0, 'キャンプなのに市場が出ない');
  assert.equal(view.staff.seats[0].coach, null);
  // キャンプの終わりにCPUは空席を埋める（人の球団は埋めない）
  const cpuSeats = l.coaches.teams[cpuTeam];
  const gone = l.coaches.people[cpuSeats.manager];
  gone.status = 'free';
  gone.job = null;
  cpuSeats.manager = null;
  resolve(l);
  assert.ok(staffOf(l, cpuTeam).manager, 'CPU球団の監督の席が埋まらない');
  assert.equal(staffOf(l, humanTeam).manager, null, '人の球団の空席を勝手に埋めた');
  assertSeats(l, 'キャンプの終わり');
}

// ------------------------------------------------------------------ 5. 年度更新を何十年も
{
  const l = clone(league);
  const counts = {};
  withSeededRandom(hashSeed('coach-check:years'), () => {
    for (let i = 0; i < 40; i++) {
      const year = l.season.year;
      const order = [...names].sort(() => Math.random() - 0.5);
      l.history.push({
        year,
        standings: order.map((team, k) => ({ team, wins: 70 - k * 3, losses: 50 + k * 3, draws: 0 })),
        leagues: Object.fromEntries(l.teams.map((t) => [t.name, t.league])),
        playoffChampion: order[0],
        moves: [],
      });
      const retirees = Array.from({ length: 4 }, (_, k) => ({
        team: order[k],
        name: `引退 選手${year}-${k}`,
        age: 34 + k,
        position: ['pitcher', 'catcher', 'short', 'center'][k],
        seasons: 8,
        secondCareer: k % 2 ? { role: 'coach', title: 'コーチ' } : { role: k ? 'scout' : 'manager', title: '監督' },
        player: null,
      }));
      l.season.year = year + 1;
      const events = coachOffseason(l, { rows: {}, retirees });
      for (const e of events) counts[e.kind] = (counts[e.kind] || 0) + 1;
      assertSeats(l, `${year}年の年度更新`);
      const free = Object.values(l.coaches.people).filter((p) => p.status === 'free').length;
      assert.ok(free >= 8 && free <= 18, `${year}年: 市場が${free}人`);
      for (const e of fillVacancies(l)) counts[e.kind] = (counts[e.kind] || 0) + 1;
      assertSeats(l, `${year + 1}年のキャンプ`);
      for (const name of names)
        if (!l.members.some((m) => m.teamName === name))
          assert.ok(staffOf(l, name).manager, `${year + 1}年: CPU球団 ${name} に監督がいない`);
    }
  });
  const people = Object.values(l.coaches.people);
  console.log(
    `40年: 人数 ${people.length}（引退で記録のある人 ${people.filter((p) => p.status === 'retired').length}） / 出来事 ${JSON.stringify(counts)}`,
  );
  assert.ok(people.length < 400, `名簿が膨らみすぎ（${people.length}人）`);
  for (const kind of ['retire', 'fire', 'hire', 'turn']) assert.ok(counts[kind] > 0, `40年で ${kind} が1度も無い`);
  assert.ok(people.some((p) => p.origin?.kind === 'player' && p.status === 'active'), '引退選手が1人も指導者にならない');
  const career = people.flatMap((p) => p.career || []);
  assert.ok(career.length > 40 * names.length, '通算の行が足りない');
  assert.ok(l.coaches.events.length <= 40, '出来事が40件を超えて残る');
  // CPU球団は監督と考えの合うコーチを好む（考えが割れて毎年辞める入れ替わりを減らす）
  const riftShare = (lg) => {
    const pairs = cpuTeams(lg).flatMap((t) => {
      const st = staffOf(lg, t.name);
      return ['pitching', 'batting'].filter((r) => st.manager && st[r]).map((r) => conflictOf(st.manager, st[r], r));
    });
    return pairs.filter((x) => x >= RIFT_CONFLICT).length / Math.max(1, pairs.length);
  };
  const [first, last] = [riftShare(league), riftShare(l)];
  console.log(`考えが割れている組（CPU球団）: 最初 ${Math.round(first * 100)}% → 40年後 ${Math.round(last * 100)}%`);
  assert.ok(last <= 0.3, `40年後に考えが割れている組が多すぎる（${Math.round(last * 100)}%）`);
}

// ------------------------------------------------------------------ 6. 実際に1年
{
  const l = clone(league);
  const startYear = l.season.year;
  let days = 0;
  while (days < 600) {
    if (l.status === 'waiting') {
      // ⚠ 年度更新は日付の進行の中で済み、続けてキャンプが開く（`advanceOneDay`）。
      //    締め切る前に止める（締め切るとキャンプが終わって開幕する）
      if (l.season.year > startYear && l.phase?.kind === 'camp') break;
      resolve(l);
      continue;
    }
    now = new Date(now.getTime() + 4 * 3600000);
    advanceLeagueDay(l, `coach:${days}`, iso());
    days++;
  }
  assert.equal(l.phase?.kind, 'camp', '翌年のキャンプまで進まない');
  assert.ok(l.season.year > startYear);
  assertSeats(l, '1年後');
  const rows = Object.values(l.coaches.people).flatMap((p) => p.career || []);
  const managerRows = rows.filter((r) => r.role === 'manager' && r.year === startYear);
  assert.equal(managerRows.length, names.length, '監督の通算の行が球団の数と違う');
  assert.ok(managerRows.every((r) => r.wins + r.losses > 50), '監督の行の勝敗が入っていない');
  // 部で1位だった成績の印（称号に使う）。部ごとに得点1位の球団の監督がいる
  const leagueIds = new Set(managerRows.map((r) => r.league));
  for (const id of leagueIds)
    assert.ok(managerRows.some((r) => r.league === id && r.leads?.includes('runs')), `${id}部の得点1位の印が無い`);
  const pitchRow = rows.find((r) => r.role === 'pitching' && r.year === startYear);
  assert.ok(pitchRow?.era > 0 && pitchRow.strikeouts > 0, '投手コーチの行に防御率・奪三振が無い');
  const view = projectLeague({ league: l, sessions: {} }, human.userId, null, null);
  assert.ok(view.staff?.seats?.length === 3 && view.leagueStaff?.teams?.length === names.length);
  assert.ok(view.staff.seats.some((s) => s.coach?.history?.length), '履歴が画面に出ない');
  assert.ok(view.staff.tactics.every((t) => t.text), '采配の内訳の文が無い');
  const info = projectTeamInfo({ league: l, sessions: {} }, human.userId, cpuTeam);
  assert.ok(info.staff?.tactics?.length, 'CPU球団の采配が見られない');
  const otherHuman = projectTeamInfo({ league: l, sessions: {} }, human.userId, l.members[1].teamName);
  assert.equal(otherHuman.staff.tactics, null, '人の球団の采配が他の人に見える');
  console.log(
    `1年後（${days}日）: 出来事 ${l.coaches.events.length}件 / ${view.leagueStaff.events
      .slice(0, 3)
      .map((e) => e.text)
      .join(' / ')}`,
  );
  console.log(`例: ${view.staff.seats[0].coach?.career} / ${view.staff.tactics.find((t) => t.by)?.text}`);
  if (process.env.WRITE_APP_FIXTURE) {
    const path = new URL('../../mobile/shared/src/jvmTest/resources/staff-view.json', import.meta.url);
    writeFileSync(path, `${JSON.stringify(view)}\n`);
    console.log(`アプリの検査用のビューを書き出した: ${path.pathname}`);
  }
}
// ------------------------------------------------------------------ 7. ビジョンから決まる方針・見る目
{
  const hitter = (meet, power, extra = {}) => ({
    id: 'h',
    position: 'second',
    age: 26,
    batting: { meet, power, eye: 50, steal: 50, ...extra },
    physical: { speed: 50, arm: 50, bodyStamina: 50 },
    fielding: { defense: 50 },
  });
  const spiky = hitter(78, 40); // 技術の長所78・短所40（尖った選手）
  const flat = hitter(55, 55, { eye: 55, steal: 55 }); // 開きの無い選手
  const coach = (who, line, { horizon = 'win', stubborn = 0 } = {}) => ({
    vision: { attack: 'speed', defense: 'bullpen', flagship: 'attack', horizon },
    growth: { who, line },
    personality: { temper: 0, stubborn, trust: 0 },
  });
  const dir = (c, p) => growthPolicy(c, p).direction;
  // 徹底して尖らせる: 誰でもずっと長所
  assert.deepEqual([dir(coach('all', null), spiky), dir(coach('all', null), flat)], ['sharpen', 'sharpen']);
  // 一定まで尖らせて整える: 長所が線に届いたら短所へ
  assert.deepEqual([dir(coach('all', 70), spiky), dir(coach('all', 80), spiky), dir(coach('all', 70), flat)], ['patch', 'sharpen', 'sharpen']);
  // 選手の形に合わせる: 尖った選手だけ線まで長所、ほかは全体
  assert.deepEqual([dir(coach('sharp', 80), spiky), dir(coach('sharp', 70), spiky), dir(coach('sharp', 80), flat)], ['sharpen', 'balanced', 'balanced']);
  // 穴のない選手に: 開きが大きければ短所、無ければ全体
  assert.deepEqual([dir(coach('none', null), spiky), dir(coach('none', null), flat)], ['patch', 'balanced']);
  // 段階は時間軸から（育成の若手は基礎体力、勝負は技術）。柔軟な人は本人の希望に合わせる
  const young = { ...spiky, age: 18 };
  assert.equal(growthPolicy(coach('all', null, { horizon: 'develop' }), young).phase, 'physique');
  assert.equal(growthPolicy(coach('all', null, { horizon: 'win' }), young).phase, 'skill');
  assert.equal(growthPolicy(coach('all', null, { horizon: 'win', stubborn: -2 }), young).phase, 'physique', '柔軟な人が希望に合わせない');

  // 好む選手は1つの並びから読む: 打たせて守るの「守備の良い野手」は、文・トライアウト・
  // トレードの見る目・軸の選手で同じに効く（ほかの守りの型には効かない）
  {
    const fielding = { vision: { attack: 'contact', defense: 'fielding', flagship: 'defense', horizon: 'middle' } };
    const rotation = { vision: { ...fielding.vision, defense: 'rotation' } };
    const catcher = (id, defense) => ({ id, name: id, position: 'catcher', age: 25, batting: { meet: 50, power: 50 }, physical: { speed: 50 }, fielding: { defense } });
    const [good, poor] = [catcher('good', 80), catcher('poor', 50)];
    assert.ok(preferenceText(fielding).includes('守備の良い野手') && !preferenceText(rotation).includes('守備の良い野手'));
    assert.ok(tradeFactor({ manager: fielding }, good) > tradeFactor({ manager: fielding }, poor), 'トレードで守備の良い野手を好まない');
    assert.equal(tradeFactor({ manager: rotation }, good), tradeFactor({ manager: rotation }, poor));
    assert.ok(tryoutContext({ manager: fielding }).bonus(good) > tryoutContext({ manager: fielding }).bonus(poor), 'トライアウトで守備の良い野手を好まない');
    assert.equal(tryoutContext({ manager: rotation }).bonus(good), tryoutContext({ manager: rotation }).bonus(poor));
    assert.equal(keyPlayers(fielding, [poor, good]).find((p) => p.position !== 'pitcher')?.id, 'good', '軸の選手で守備の良い野手を選ばない');
    // 野手コーチは受け持ち（攻め）の好みだけ。打たせて守るの野手コーチでも守備は見ない
    const bat = { manager: rotation, batting: fielding };
    assert.equal(tryoutContext(bat).bonus(good), tryoutContext(bat).bonus(poor), '野手コーチが守りの好みで野手を選ぶ');
  }

  // 実際の名簿で: キャンプの案は全員ぶん、トレードの見る目は ±10% に収まる
  const l = clone(inCamp);
  const all = names.flatMap((n) => l.game.teams[n]?.players || []);
  assert.ok(all.length > 200, '名簿が配られていない');
  let lo = 1;
  let hi = 1;
  for (const n of names) {
    const st = staffOf(l, n);
    for (const p of all) {
      const f = tradeFactor(st, p);
      lo = Math.min(lo, f);
      hi = Math.max(hi, f);
    }
  }
  assert.ok(lo >= 1 - TRADE_FACTOR_LIMIT - 1e-9 && hi <= 1 + TRADE_FACTOR_LIMIT + 1e-9, `トレードの見る目が ${lo}〜${hi}`);
  const plan = campPlanFor(l, cpuTeam, l.game.teams[cpuTeam].players);
  assert.equal(Object.keys(plan.players).length, l.game.teams[cpuTeam].players.length, 'キャンプの案が全員ぶん無い');
  const dirs = {};
  for (const { name: n } of cpuTeams(l))
    for (const v of Object.values(campPlanFor(l, n, l.game.teams[n].players).players))
      dirs[`${v.direction}/${v.phase}`] = (dirs[`${v.direction}/${v.phase}`] || 0) + 1;
  assert.ok(Object.keys(dirs).length >= 4, `キャンプの方針が偏りすぎ ${JSON.stringify(dirs)}`);
  // カードの表: ビジョン・育成観・性格。見出しと売り込みの文。コーチは受け持ちの側に印
  const view = projectLeague({ league: l, sessions: {} }, human.userId, null, null);
  for (const seat of view.staff.seats) {
    const card = seat.coach;
    assert.ok(card.headline && card.vision && card.growth && card.pitch && card.prefs, `${seat.role} のカードの文が欠けている`);
    if (seat.role !== 'manager') assert.ok(card.vision.includes('受け持ち'), `${seat.role} に受け持ちの印が無い`);
  }
  assert.ok(view.leagueStaff.teams.every((t) => !t.manager || t.manager.color.endsWith('の野球')));
  const sample = coachCard(l, staffOf(l, cpuTeam).manager, (x) => x);
  console.log(
    `ビジョン例: ${sample.headline}（${sample.vision}） / ${sample.growth} / 「${sample.pitch}」 / 見る目 ${lo.toFixed(3)}〜${hi.toFixed(3)} / キャンプ ${JSON.stringify(dirs)}`,
  );
}
// ------------------------------------------------------------------ 8. 説明だけの飾り
{
  const l = clone(inCamp);
  const people = Object.values(l.coaches.people);
  assert.ok(people.every((p) => VOICES[p.voice]), '語り口の無い人がいる');
  assert.ok(new Set(people.map((p) => p.voice)).size === Object.keys(VOICES).length, '語り口が偏りすぎ');
  // 軸の選手: 監督の席だけ3人（看板の側から2人）。人の球団のは他の人に見せない
  const view = projectLeague({ league: l, sessions: {} }, human.userId, null, null);
  const [mgrSeat, ...coachSeats] = view.staff.seats;
  assert.equal(mgrSeat.coach.keyPlayers?.split('・').length, 3, `軸の選手が3人でない: ${mgrSeat.coach.keyPlayers}`);
  assert.ok(coachSeats.every((s) => s.coach.keyPlayers == null), 'コーチのカードに軸の選手が出る');
  const roster = l.game.teams[humanTeam].players;
  const manager = staffOf(l, humanTeam).manager;
  const keys = keyPlayers(manager, roster);
  const pitchers = keys.filter((p) => p.position === 'pitcher').length;
  assert.equal(pitchers, visionOf(manager).flagship === 'defense' ? 2 : 1, '看板の側から2人選んでいない');
  assert.ok(projectTeamInfo({ league: l, sessions: {} }, human.userId, cpuTeam).staff.seats[0].coach.keyPlayers, 'CPU球団の軸の選手が出ない');
  assert.equal(
    projectTeamInfo({ league: l, sessions: {} }, human.userId, l.members[1].teamName).staff.seats[0].coach.keyPlayers ?? null,
    null,
    '人の球団の軸の選手が他の人に見える',
  );
  // 再登板で丸くなる: 解任1回につき1度だけ、こだわりが1段やわらぐ
  const fired = { personality: { temper: 0, stubborn: 1, trust: 0 }, fired: 1 };
  assert.equal(mellowOnReturn(fired, 5), true);
  assert.deepEqual([fired.personality.stubborn, fired.mellowedAt], [0, 5]);
  assert.equal(mellowOnReturn(fired, 6), false, '1度の解任で2度丸くなった');
  // 人の解任: 前の年から居た監督なら解任に数える。その年に就けた人を外すのは取り消し（数えない）
  const year = l.season.year;
  const served = l.coaches.people[manager.id];
  served.job.since = year - 1;
  updateStaff(l, human.userId, { action: 'release', role: 'manager' });
  assert.equal(served.fired, 1, '解任の印が付かない');
  const trial = Object.values(l.coaches.people).find((p) => p.status === 'free' && p.id !== served.id);
  updateStaff(l, human.userId, { action: 'hire', role: 'manager', coachId: trial.id });
  updateStaff(l, human.userId, { action: 'release', role: 'manager' });
  assert.equal(trial.fired ?? 0, 0, 'その年に就けた監督を外して解任に数えた');
  // 市場にいる間は反省を語る。CPU球団が監督に呼ぶと丸くなり、反省を語るのはその年だけ
  assert.ok(pitchText(served).startsWith('前は'), '解任された人が市場で反省を語らない');
  const stubborn = served.personality.stubborn;
  const seats = l.coaches.teams[cpuTeam];
  const old = l.coaches.people[seats.manager];
  old.status = 'free';
  old.job = null;
  assignCoach(l.coaches, cpuTeam, 'manager', served, year);
  assert.equal(served.personality.stubborn, Math.max(-2, stubborn - 1), '監督に戻っても丸くならない');
  assert.ok(pitchText(served, { year }).startsWith('前は'), '戻った年の売り込みに反省が無い');
  assert.ok(!pitchText(served, { year: year + 1 }).startsWith('前は'), '反省を何年も語り続ける');
  // 称号: 年度更新で付けた部の1位の印（`leads`）を数える。解任2度で苦労人
  const row = (y, extra) => ({ year: y, team: 'T', role: 'manager', league: 'A', wins: 70, losses: 50, ...extra });
  const a = { career: [row(1, { rank: 1, leads: ['stolenBases'] }), row(2, { rank: 1, champion: true })], fired: 2 };
  assert.deepEqual(coachTitles(a), ['優勝請負人', '苦労人']);
  a.career[1].leads = ['stolenBases'];
  assert.ok(coachTitles({ ...a, fired: 0 }).includes('走る野球の人'), '盗塁1位2度で称号が付かない');
  const b = { career: [row(1, { team: 'U', rank: 5 }), row(2, { team: 'U', rank: 2 })] };
  assert.deepEqual(coachTitles(b), ['再建屋'], '4位以下から2位にした人が再建屋にならない');
  const relegated = { career: [row(1, { rank: 6, move: 'down' }), row(2, { league: 'B', rank: 2 })] };
  assert.deepEqual(coachTitles(relegated), [], '降格した先の2位で再建屋になった');
  const once = { career: [row(1, { rank: 1, champion: true })] };
  assert.deepEqual(coachTitles(once), [], '1部優勝とプレーオフ優勝の同じ年を2度に数えた');
  assert.deepEqual(coachTitles({ career: [] }), []);
  console.log(`飾り: 軸の選手 ${mgrSeat.coach.keyPlayers} / 語り口 ${JSON.stringify(people.reduce((m, p) => ((m[p.voice] = (m[p.voice] || 0) + 1), m), {}))}`);
}
// ------------------------------------------------------------------ 9. 総合監査（2026-11-10）
{
  // キャンプの指導者の案: まだ回していなければビューに載せる（画面の下書きはここから始める）。
  // 締め切りで回さなかったクールに当たる標準案と同じもの
  const l = clone(inCamp);
  const view = projectLeague({ league: l, sessions: {} }, human.userId, null, null);
  const suggested = view.phase.camp.suggested;
  assert.ok(suggested?.players && Object.keys(suggested.players).length > 0, 'キャンプの指導者の案がビューに無い');
  const plan = defaultPhasePlan(l, humanTeam);
  assert.deepEqual(suggested.policy, plan.policy, 'ビューの案と標準案の方針が違う');
  assert.deepEqual(suggested.players, plan.players, 'ビューの案と標準案の選手ごとの方針が違う');
  assert.match(view.phase.planBy.text, /練習を実行/, 'キャンプの案の文が「決定」のまま');
  // 人の球団で野手コーチが空くと、野手は上書きせずおすすめ（全員同じ「全体×技術」にしない）
  const batting = staffOf(l, humanTeam).batting;
  l.coaches.teams[humanTeam].batting = null;
  Object.assign(l.coaches.people[batting.id], { status: 'free', job: null });
  const half = campPlanFor(l, humanTeam, l.game.teams[humanTeam].players);
  assert.equal(half.policy.mode, 'recommended', '人の球団の空いた側がおすすめにならない');
  const fielders = l.game.teams[humanTeam].players.filter((p) => p.position !== 'pitcher');
  assert.ok(fielders.every((p) => !half.players[p.id]), '野手コーチがいないのに野手を上書きした');
  // コーチが2人とも居なければ案は無い（監督の名前を出さない）
  const pitching = staffOf(l, humanTeam).pitching;
  l.coaches.teams[humanTeam].pitching = null;
  Object.assign(l.coaches.people[pitching.id], { status: 'free', job: null });
  assert.equal(campPlanFor(l, humanTeam, l.game.teams[humanTeam].players), null, 'コーチがいないのに案がある');
  const empty = projectLeague({ league: l, sessions: {} }, human.userId, null, null);
  assert.equal(empty.phase.planBy, null, 'コーチがいないキャンプに監督の案と出す');
  assert.equal(empty.phase.camp.suggested, null);
  // 案が無いときの標準案はおすすめ。提出の正規化を通っても「全員同じ」に変わらない
  // （締め切りの自動実行は標準案を submitPhase に通す）
  const fallback = defaultPhasePlan(l, humanTeam);
  submitPhase(l, human.userId, { phaseId: l.phase.id, plan: fallback, ready: false }, iso());
  assert.equal(l.phase.submissions[human.userId].plan.policy.mode, 'recommended', '何もしなかった人のキャンプがおすすめにならない');
}
{
  // トライアウトの「前年の勝率」は終わったばかりの年（年度更新はトライアウトの後）
  const l = clone(inCamp);
  const row = (wins, losses) => ({ team: humanTeam, wins, losses });
  l.history = [{ year: l.season.year - 1, standings: [row(90, 30)] }];
  l.season.standings = l.season.standings.map((s) => (s.team === humanTeam ? { ...s, wins: 30, losses: 90 } : s));
  const got = tryoutContextFor(l, humanTeam);
  const want = tryoutContext(staffOf(l, humanTeam), { lastWinRate: 0.25 });
  assert.equal(got.winRate, want.winRate, 'トライアウトが1年前の勝率で選ぶ');
  // 今季の試合が無ければ前年の記録
  l.season.standings = l.season.standings.map((s) => ({ ...s, wins: 0, losses: 0 }));
  assert.equal(tryoutContextFor(l, humanTeam).winRate, tryoutContext(staffOf(l, humanTeam), { lastWinRate: 0.75 }).winRate);
}
{
  // 同じキャンプで外した監督を同じ席に呼び戻すのは取り消し（解任に数えない・反省で丸くならない）
  const l = clone(inCamp);
  const year = l.season.year;
  const manager = l.coaches.people[staffOf(l, humanTeam).manager.id];
  manager.job.since = year - 1;
  manager.career = [...(manager.career || []), { year: year - 1, team: humanTeam, role: 'manager' }];
  const stubborn = manager.personality.stubborn;
  updateStaff(l, human.userId, { action: 'release', role: 'manager' });
  assert.equal(manager.fired, 1);
  updateStaff(l, human.userId, { action: 'hire', role: 'manager', coachId: manager.id });
  assert.equal(manager.fired, 0, '呼び戻した監督が解任1回のまま');
  assert.equal(manager.personality.stubborn, stubborn, '呼び戻しただけで丸くなった');
  assert.notEqual(manager.mellowedAt, year);
  assert.equal(manager.job.since, year - 1, '呼び戻した監督の在任が1年目に戻った');
  // 呼び戻した後にもう一度外せば、前の年から居た人として数える
  updateStaff(l, human.userId, { action: 'release', role: 'manager' });
  assert.equal(manager.fired, 1, '呼び戻した後に外しても解任に数えない');
}
{
  // 版11 → 12: ビジョンは考え方を先に見る（好みが考え方と逆を向いても、文と采配を揃える）
  const coach = (views, prefs) => ({ id: 'x', views, prefs, personality: {}, specialty: 'batting' });
  const aggressive = coach({ hitting: 1 }, { hitter: 'contact' });
  upgradeCoach(aggressive, 1);
  assert.equal(aggressive.vision.attack, 'power', '打撃「積極」の人が「つなぐ」になった');
  const strikeout = coach({ pitching: 1 }, { pitcher: 'control' });
  upgradeCoach(strikeout, 1);
  assert.notEqual(strikeout.vision.defense, 'fielding', '投球「三振狙い」の人が「打たせて守る」になった');
  const calm = coach({}, { hitter: 'speed', pitcher: 'control' });
  upgradeCoach(calm, 1);
  assert.deepEqual([calm.vision.attack, calm.vision.defense], ['speed', 'fielding'], '考え方が標準なら好みどおり');
}
// ------------------------------------------------------------------ 10. 任せた手続きは待たない（判断7）
// ⚠ 任せた手続きは提出があっても指導者の案で決まる（`resolvePhase`）。以前は `waitsFor` が
//    その人も待っていたので、ほかの全員が決めても締め切りまで進まなかった
//    （キャンプには「決定」が無いので、任せた人がいると必ず締め切り待ち）。
//    クールを回して終える経路は `online-deadline-check`（命令を通す）で見る
{
  const running = clone(inCamp);
  resolve(running);
  assert.equal(running.phase, null, '前提: キャンプが終わって開幕している');
  const [a, b] = running.members;
  const open = (kind, modes = {}) => {
    const l = clone(running);
    for (const m of l.members) m.staffModes = { ...(m.staffModes || {}), ...(modes[m.userId] || {}) };
    loadLeagueWorld(l);
    openPhase(l, kind, iso());
    l.game = captureLeagueWorld();
    return l;
  };
  const decide = (l, userId) => {
    const m = l.members.find((x) => x.userId === userId);
    submitPhase(l, userId, { phaseId: l.phase.id, plan: defaultPhasePlan(l, m.teamName), ready: true }, iso());
  };
  const rosterIds = (l, team) => l.game.teams[team].players.map((p) => p.id).sort((x, y) => x - y);
  {
    // 契約更改: 退団を任せた人は待たない。ほかの人が決めた時点で進み、任せた球団は指導者の案で退団
    const l = open('contract', { [a.userId]: { release: 'delegate' } });
    assert.equal(waitsFor(l, l.members[0]), false, '退団を任せた人を契約更改で待つ');
    assert.equal(waitsFor(l, l.members[1]), true, '自分で決める人を待たない');
    const viewA = projectLeague({ league: l, sessions: {} }, a.userId, null, null);
    assert.equal(viewA.phase.delegated, true, '任せた手続きの印がビューに無い');
    const shownA = viewA.members.find((m) => m.teamName === a.teamName);
    assert.ok(shownA.delegated && shownA.ready, '任せた球団が一覧で「検討中」のまま');
    const viewB = projectLeague({ league: l, sessions: {} }, b.userId, null, null);
    assert.equal(viewB.phase.delegated, false);
    assert.ok(!viewB.members.find((m) => m.teamName === b.teamName).ready);
    const atDeadline = clone(l);
    decide(l, b.userId);
    assert.equal(l.phase, null, '退団を任せた人を待って、契約更改が締め切りまで進まない');
    assert.equal(l.status, 'running');
    // 締め切りで決まったときと同じ結果（任せた人の分は指導者の案）
    autoResolvePhase(atDeadline, atDeadline.phase.deadline);
    assert.equal(atDeadline.phase, null);
    assert.deepEqual(rosterIds(l, a.teamName), rosterIds(atDeadline, a.teamName), '早く進んだ契約更改が締め切りのときと違う');
    assert.deepEqual(rosterIds(l, b.teamName), rosterIds(atDeadline, b.teamName));
  }
  {
    // トライアウト: 決めていない人がトライアウトを「任せる」にした時点で進む（`updateStaffModes`）
    const l = open('tryout');
    decide(l, b.userId);
    assert.equal(l.phase?.kind, 'tryout', '前提: 決めていない人を待つ');
    const atDeadline = clone(l);
    updateStaffModes(l, a.userId, { tryout: 'delegate' }, iso());
    assert.equal(l.phase, null, 'トライアウトを任せても、締め切りまで進まない');
    setStaffModes(atDeadline, a.userId, { tryout: 'delegate' });
    autoResolvePhase(atDeadline, atDeadline.phase.deadline);
    assert.deepEqual(rosterIds(l, a.teamName), rosterIds(atDeadline, a.teamName), '早く進んだトライアウトが締め切りのときと違う');
    assert.deepEqual(rosterIds(l, b.teamName), rosterIds(atDeadline, b.teamName));
    // 手続きの無いときに任せ方を変えても何も起きない
    updateStaffModes(l, a.userId, { tryout: 'advice' }, iso());
    assert.equal(l.status, 'running');
  }
  {
    // キャンプ: 任せた人は待たない。席が3人とも空くと「自分で」になり、待つ
    const l = clone(inCamp);
    updateStaffModes(l, a.userId, { camp: 'delegate' }, iso());
    assert.equal(l.phase?.kind, 'camp', '前提: b はまだ終えていない');
    assert.equal(waitsFor(l, l.members[0]), false, 'キャンプを任せた人を待つ');
    for (const role of COACH_ROLES) updateStaff(l, a.userId, { action: 'release', role });
    assert.equal(waitsFor(l, l.members[0]), true, '指導者がいないのにキャンプを任せたまま');
    decide(l, b.userId);
    assert.equal(l.phase?.kind, 'camp', '自分で決める人がいるのにキャンプが終わった');
  }
}
console.log('online-coach-check PASS');
