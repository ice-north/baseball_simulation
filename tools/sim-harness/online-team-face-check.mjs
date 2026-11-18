// 球団の顔（C2）の検査: 背番号・主将・永久欠番・在籍。
//   node tools/sim-harness/online-team-face-check.mjs
// ⚠ 効き目は無い（試合・能力に触らない）。背番号はリーグの12球団にだけ付ける。
import assert from 'node:assert/strict';
import { createLeague, submitPhase, loadLeagueWorld, setTeamFace } from '../../server/leagueEngine.mjs';
import { captureWorld } from '../../server/worldSnapshot.mjs';
import { TEAMS_DATA } from '../../src/teams-data.js';
import { teamChronicle, recordRetirements } from '../../server/chronicle.mjs';
import { numberLeagueTeams, captainsOfYear, tenureOf, RETIRED_NUMBERS_MAX } from '../../server/teamFace.mjs';
import { ensureTeamJerseyNumbers } from '../../src/utils/jerseyNumbers.js';

const quiet = (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
};
const NOW = '2026-10-26T15:00:00.000Z';
const league = quiet(() => createLeague({ members: [{ userId: 'a' }], now: NOW, seed: 3 }));
quiet(() => submitPhase(league, 'a', { phaseId: league.phase.id, plan: { packId: league.packs[0].id }, ready: true }, NOW));
const names = league.season.settings.teamNames;
const me = league.members[0].teamName;

// ① 背番号: リーグの12球団の全員に、球団の中で重ならない番号（0〜99）
for (const name of names) {
  const nums = league.game.teams[name].players.map((p) => p.number);
  assert.ok(nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 99), `${name} に背番号の無い人がいる`);
  assert.equal(new Set(nums).size, nums.length, `${name} で背番号が重なっている`);
}
// リーグの外の球団には付けない（保存を太らせない）
const outside = Object.keys(league.game.teams).find((n) => !names.includes(n) && league.game.teams[n].players?.length);
assert.ok(outside && league.game.teams[outside].players.every((p) => p.number == null), 'リーグの外の球団にも背番号を付けている');

// ② 主将
loadLeagueWorld(league);
const team = TEAMS_DATA[me];
const star = team.players[0];
assert.equal(setTeamFace(league, 'a', { captain: star.id }).captain, star.name);
assert.equal(team.captainId, star.onlinePlayerId);
assert.throws(() => setTeamFace(league, 'a', { captain: 999999 }), /名簿にいません/);
assert.deepEqual(captainsOfYear(names, TEAMS_DATA), { [me]: { name: star.name, number: star.number } });
league.game = captureWorld();

// ③ 永久欠番: 引退の記録に背番号を残し、その番号を欠番にすると、もう誰にも付かない
const veteran = team.players[1];
const number = veteran.number;
league.chronicle ??= { milestones: [], retired: [], world: [] };
recordRetirements(league, [{ team: me, name: veteran.name, age: 38, position: veteran.position }], {
  year: 1, teamNames: names, keys: new Map(), numbers: new Map([[`${me}:${veteran.name}`, number]]),
});
assert.equal(league.chronicle.retired[0].number, number);
// 名簿にまだいる（引退の前）なら欠番にできない
assert.throws(() => setTeamFace(league, 'a', { retire: { name: veteran.name, year: 1 } }), /付けています/);
team.players = team.players.filter((p) => p.id !== veteran.id);
setTeamFace(league, 'a', { retire: { name: veteran.name, year: 1 } });
assert.deepEqual(team.retiredNumbers.map((r) => r.number), [number]);
assert.throws(() => setTeamFace(league, 'a', { retire: { name: veteran.name, year: 1 } }), /もう永久欠番/);
// 欠番の番号を付けた新しい人は振り直す
team.players.push({ ...team.players[2], id: 123456789, name: '新人', number, onlinePlayerId: 'new' });
numberLeagueTeams([me], TEAMS_DATA);
assert.notEqual(team.players.at(-1).number, number, '欠番を付けた人が残っている');
assert.ok(!team.players.some((p) => p.number === number));
league.game = captureWorld();
const face = teamChronicle(league, me).face;
assert.equal(face.captain.name, star.name);
assert.deepEqual(face.retiredNumbers.map((r) => r.name), [veteran.name]);
assert.equal(face.candidates.length, 0, '欠番にした人がまだ候補にいる');
// 欠番を戻す
setTeamFace(league, 'a', { unretire: number });
assert.equal(team.retiredNumbers.length, 0);
// 引退した人の番号がもう次の人に付いていても欠番にでき、付けている人の番号は振り直す
{
  const heir = team.players.at(-1);
  heir.number = number;
  const result = setTeamFace(league, 'a', { retire: { name: veteran.name, year: 1 } });
  assert.equal(result.retired, number);
  assert.notEqual(heir.number, number, '欠番にした番号を付けている人の番号を振り直していない');
  assert.equal(result.renumbered?.number, heir.number);
  assert.ok(!team.players.some((p) => p.number === number));
  setTeamFace(league, 'a', { unretire: number });
}
assert.ok(RETIRED_NUMBERS_MAX >= 5);

// ④ 一人用の割り当ては今までと同じ（欠番を渡さない）
const solo = { players: [{ position: 'pitcher' }, { position: 'catcher' }, { position: 'pitcher', number: 18 }] };
ensureTeamJerseyNumbers(solo);
assert.deepEqual(solo.players.map((p) => p.number), [11, 27, 18]);

// ⑤ 在籍: 記録の年数、ほかの球団の記録が無ければ生え抜き
const t = tenureOf(
  { records: { seasons: { 1: { players: { k1: { teams: [me] }, k2: { teams: ['他', me] } } }, 2: { players: { k1: { teams: [me] }, k2: { teams: [me] } } } } } },
  me,
  [{ id: 1, name: 'A', onlinePlayerId: 'k1' }, { id: 2, name: 'B', onlinePlayerId: 'k2' }],
);
assert.deepEqual(t.map((x) => [x.name, x.years, x.homegrown]), [['A', 2, true], ['B', 2, false]]);
console.log(`球団の顔: 主将 ${face.captain.name}（${face.captain.number}） 欠番 ${number}`);
console.log('online-team-face-check PASS');
