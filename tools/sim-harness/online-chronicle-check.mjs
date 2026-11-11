// 年代記（節目の記録・引退・裏の大会・マジック・球団史）の検査。
// 1年を通して進め、翌年の開幕まで行く。
//   node tools/sim-harness/online-chronicle-check.mjs
import assert from 'node:assert/strict';
import {
  createLeague,
  defaultPhasePlan,
  submitPhase,
  advanceLeagueDay,
} from '../../server/leagueEngine.mjs';
import { projectLeague, projectTeamInfo } from '../../server/projection.mjs';
import { leagueRaces, CAREER_MILESTONES, SEASON_MILESTONES } from '../../server/chronicle.mjs';
import { standingsByLeague } from '../../src/online/pyramidLeague.js';

let now = new Date('2026-10-28T00:00:00Z');
const league = createLeague({
  members: [{ userId: 'a' }, { userId: 'b' }],
  now: now.toISOString(),
});
function resolve() {
  const phase = league.phase;
  for (const member of league.members)
    submitPhase(
      league,
      member.userId,
      { phaseId: phase.id, plan: defaultPhasePlan(league, member.teamName), ready: true },
      now.toISOString(),
    );
}
const bundle = () => ({ league, sessions: {} });
const startYear = league.season.year;
let days = 0;
let pacedSeen = false;
let magicSeen = null;
let viewChecked = false;
// ⚠ 節目は「その日の1試合ぶん」で前の値を作る。全員の通算を毎日数え直して確かめる
const totals = () => {
  const out = new Map();
  for (const season of Object.values(league.records?.seasons || {}))
    for (const [key, rec] of Object.entries(season.players || {})) {
      const t = out.get(key) || {};
      for (const side of ['batting', 'pitching'])
        for (const [k, v] of Object.entries(rec.stats?.[side] || {}))
          if (typeof v === 'number') t[`${side}.${k}`] = (t[`${side}.${k}`] || 0) + v;
      out.set(key, t);
    }
  return out;
};
let before = totals();
let expectedCareer = 0;
while (days < 500) {
  if (league.status === 'waiting') {
    resolve();
    continue;
  }
  if (league.season.year > startYear && league.season.results.length >= 20) break;
  now = new Date(now.getTime() + 4 * 3600000);
  const head = league.chronicle?.milestones?.[0];
  advanceLeagueDay(league, `chronicle:${days}`, now.toISOString());
  days++;
  const after = totals();
  const expected = new Set();
  for (const [key, t] of after)
    for (const rule of CAREER_MILESTONES) {
      const a = t[`${rule.side}.${rule.stat}`] || 0;
      const b = before.get(key)?.[`${rule.side}.${rule.stat}`] || 0;
      if (Math.floor(a / rule.every) > Math.floor(b / rule.every) && a >= rule.from) expected.add(`${key}:${rule.stat}`);
    }
  before = after;
  const list = league.chronicle?.milestones || [];
  const fresh = head ? list.slice(0, Math.max(0, list.indexOf(head))) : list;
  const got = new Set(fresh.filter((m) => m.kind === 'career').map((m) => `${m.key}:${m.stat}`));
  // ⚠ 球団ごとに最新20件で切るので、1日に20件を越えた球団があれば数だけ見ない
  if (fresh.length < 20) assert.deepEqual([...got].sort(), [...expected].sort(), `${days}日目の通算の節目が数え直しと違う`);
  expectedCareer += expected.size;

  if (league.season.year === startYear && league.season.standings.some((s) => s.gamesPlayed >= 30) && !viewChecked) {
    const view = projectLeague(bundle(), 'a', null, null);
    const paced = view.leaders.find((c) => c.id === 'homeruns')?.rows?.[0];
    if (paced?.pace) {
      pacedSeen = true;
      assert.ok(paced.pace >= paced.value, 'ペースが今の数より小さい');
    }
    assert.ok(Array.isArray(view.races), 'races が無い');
    assert.ok(view.chronicle && Array.isArray(view.chronicle.milestones), 'chronicle が無い');
    viewChecked = true;
  }
  // マジックの整合: 決まった球団は、最後まで順位が変わらないこと（年の終わりに確かめる）
  if (league.season.year === startYear) {
    const races = leagueRaces(league);
    for (const r of races) {
      if (r.clinched && !magicSeen?.[`${r.kind}:${r.league}`]) {
        magicSeen ||= {};
        magicSeen[`${r.kind}:${r.league}`] = r.team;
      }
      if (!r.clinched) assert.ok(r.magic > 0 && r.magic <= r.left, `マジックが残り試合を超える ${JSON.stringify(r)}`);
      // ⚠ 点灯する前（追う球団が自力で抜ける間）は出さない。開幕直後に「マジック118」と書かない
      if (!r.clinched)
        assert.ok(
          league.season.standings.some((s) => (s.gamesPlayed || 0) >= 15),
          `開幕直後にマジックが出た ${JSON.stringify(r)}`,
        );
    }
  }
}
assert.ok(league.season.year > startYear, '翌年まで進まなかった');
const c = league.chronicle;
assert.ok(c, 'chronicle が作られていない');
// 節目: 通算の越え方の数と一致（同じ日に2つ越えることはほぼ無いので、ひとつに数える）
const career = c.milestones.filter((m) => m.kind === 'career');
console.log(`節目 ${c.milestones.length}件（通算 ${career.length} / 期待 ${expectedCareer}、残すのは球団ごとに最新20件）`);
{
  // 球団ごとに最新20件（リーグ全体の40件で切ると、球団史に数件しか残らなかった）
  const perTeam = {};
  for (const m of c.milestones) perTeam[m.team] = (perTeam[m.team] || 0) + 1;
  assert.ok(Object.values(perTeam).every((n) => n <= 20), `球団ごとの節目が20件を超える ${JSON.stringify(perTeam)}`);
  assert.ok(c.milestones.length > 40, `節目が全体で40件までしか残っていない（${c.milestones.length}）`);
}
assert.ok(c.milestones.length > 0, '節目が1件も無い');
for (const m of c.milestones) {
  assert.ok(m.name && m.team && m.label && m.year && m.month, `節目の項目が欠けている ${JSON.stringify(m)}`);
  if (m.kind === 'season') assert.ok(SEASON_MILESTONES.some((r) => r.stat === m.stat && r.at.includes(m.value)));
}
// 裏の大会
const koshien = c.world.find((w) => w.kind === 'koshien' && w.year === startYear);
assert.ok(koshien?.champion, '甲子園の結果が残っていない');
const grand = c.world.find((w) => w.kind === 'grand' && w.year === startYear);
assert.ok(grand?.champion, '独立リーグ日本一決定戦の結果が残っていない');
assert.ok(grand.ours, 'このリーグの代表が無い');
console.log(`甲子園 ${koshien.champion}（${koshien.championPref}） / 日本一 ${grand.champion}（代表 ${grand.ours} ${grand.oursResult}）`);
// 引退
console.log(`引退 ${c.retired.length}人: ${c.retired.slice(0, 3).map((r) => `${r.name}（${r.line}）`).join(' / ')}`);
for (const r of c.retired) {
  assert.ok(league.history.at(-1).standings.some((s) => s.team === r.team), 'リーグ外の球団の引退が入っている');
  assert.equal(r.year, startYear);
}
// 年度の記録
const h = league.history.at(-1);
assert.ok(h.leagues && Object.keys(h.leagues).length === 12, '年度の部分けが無い');
assert.ok(Array.isArray(h.moves), '昇降格が残っていない');
// 決まったマジックが最終順位どおりか
const finalGroups = standingsByLeague(
  Object.entries(h.leagues).map(([name, l]) => ({ name, league: l })),
  h.standings,
);
for (const [k, team] of Object.entries(magicSeen || {})) {
  const [kind, id] = k.split(':');
  const order = finalGroups[id];
  if (kind === 'first' || kind === 'promotion') assert.equal(order[0], team, `${k} の決定が最終順位と違う`);
  if (kind === 'relegated') assert.equal(order.at(-1), team, `${k} の決定が最終順位と違う`);
  if (kind === 'survive') assert.ok(order.indexOf(team) < order.length - 1, `${k} の残留が最終順位と違う`);
}
console.log(`決定: ${JSON.stringify(magicSeen)}`);
assert.ok(pacedSeen, 'ペースが一度も付かなかった');
// 球団史
const own = league.members[0].teamName;
const info = projectTeamInfo(bundle(), 'a', own);
assert.ok(info.chronicle.seasons.length >= 1, '年表が無い');
const first = info.chronicle.seasons.at(-1);
assert.ok(first.league && first.rank >= 1, `年表に部と順位が無い ${JSON.stringify(first)}`);
const hr = info.chronicle.records.find((r) => r.stat === 'homeruns');
assert.ok(hr?.season?.length, '歴代記録（本塁打）が無い');
console.log(`球団史 ${own}: ${JSON.stringify(first)} / 本塁打 ${JSON.stringify(hr.season[0])}`);
// 引退の記録の作り方（1年目はリーグに29歳以上がほとんど居ないので、作った引退で確かめる）
{
  const { recordRetirements } = await import('../../server/chronicle.mjs');
  const vet = Object.values(league.records.seasons[startYear].players).sort((a, b) => b.stats.batting.hits - a.stats.batting.hits)[0];
  const copy = structuredClone(league);
  const team = vet.teams[0];
  const list = recordRetirements(copy, [{ name: vet.name, team, age: 36, position: 'first', reason: '引退' }, { name: 'だれか', team: '外の球団', age: 40 }], {
    year: startYear, teamNames: league.season.settings.teamNames, keys: new Map([[`${team}:${vet.name}`, vet.key]]),
  });
  assert.equal(list.length, 1, 'リーグ外の球団の引退が入った');
  const hitsAll = Object.values(league.records.seasons).reduce((n, se) => n + (se.players[vet.key]?.stats.batting.hits || 0), 0);
  assert.ok(list[0].line.includes(`${hitsAll}安打`), `通算の一行が記録と違う ${list[0].line}`);
  console.log(`引退の例: ${list[0].name} ${list[0].line}`);
}
console.log(`日数 ${days}`);
console.log('online-chronicle-check PASS');
