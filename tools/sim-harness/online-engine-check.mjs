import assert from 'node:assert/strict';
import {
  createLeague,
  defaultPhasePlan,
  submitPhase,
  advanceLeagueDay,
  loadLeagueWorld,
} from '../../server/leagueEngine.mjs';
import { captureWorld } from '../../server/worldSnapshot.mjs';
import { gzipSync } from 'node:zlib';
import { nextProgressionAt } from '../../src/online/shared.js';
import { projectPlayerInfo } from '../../server/projection.mjs';
import { SEASON_TURNS } from '../../src/online/pyramidLeague.js';

// 1ターン＝1時間（毎正時）。⚠ 境界は「その時刻ちょうど」を含めず、次の枠へ送る。
// 08:00 JST ちょうど → 09:00 JST
assert.equal(
  nextProgressionAt('2026-10-27T23:00:00Z'),
  '2026-10-28T00:00:00.000Z',
);
// ⚠ その日の最後の枠（23:00 JST）ちょうどなら、翌日の最初の枠（00:00 JST）へ送る
assert.equal(
  nextProgressionAt('2026-10-28T14:00:00Z'),
  '2026-10-28T15:00:00.000Z',
);
// 1秒前なら同じ日の枠に入る
assert.equal(
  nextProgressionAt('2026-10-28T13:59:59Z'),
  '2026-10-28T14:00:00.000Z',
);
let now = new Date('2026-10-28T00:00:00Z');
const league = createLeague({
  members: [{ userId: 'a' }, { userId: 'b' }],
  now: now.toISOString(),
});
const seen = [];
function resolve() {
  const phase = league.phase;
  seen.push(phase.kind);
  const defaults = league.members.map((m) =>
    defaultPhasePlan(league, m.teamName),
  );
  assert.deepEqual(
    defaults[0],
    defaultPhasePlan(league, league.members[0].teamName),
    '標準案は再読込しても同じ',
  );
  for (const [i, member] of league.members.entries()) {
    submitPhase(
      league,
      member.userId,
      { phaseId: phase.id, plan: defaults[i], ready: true },
      now.toISOString(),
    );
    if (i === 0)
      assert.equal(league.status, 'waiting', '一人の決定では進めない');
  }
}
resolve();
resolve();
assert.equal(league.status, 'running');
const game = structuredClone(league.game);
loadLeagueWorld(league);
assert.deepEqual(
  captureWorld(),
  game,
  '未完了の背景大会も含めて完全に復元する',
);
const startYear = league.season.year;
let days = 0;
while (league.season.year === startYear && days < 300) {
  if (league.status === 'waiting') resolve();
  else {
    now = new Date(now.getTime() + 4 * 3600000);
    advanceLeagueDay(league, `acceptance:${days}`, now.toISOString());
    days++;
    if (days % 40 === 0)
      console.log(
        `online-engine: ${days}日 / ${JSON.stringify(league.season.currentDate)}`,
      );
  }
}
assert.equal(league.season.year, 2, '実試合を消化して2年目に到達する');
assert.equal(league.history.length, 1);
assert.ok(league.history[0].playoffChampion, 'プレーオフの勝者が確定する');
assert.ok(
  league.notices.some((n) => n.type === 'draft' && n.picks.length > 0),
  'NPBドラフトを実行する',
);
assert.ok(
  league.notices
    .find((n) => n.type === 'draft')
    .picks.every((p) => p.name && p.playerId != null && p.npbTeam && p.round),
  'ドラフトのお知らせに選手名・ID・指名先を残す',
);
assert.deepEqual(seen, [
  'initial_tryout',
  'camp',
  'contract',
  'tryout',
  'offseason',
]);
// ⚠ **定数から導くこと**。75 が直に書かれており、1シーズン144ターンへ
//    変えたときに取り残された。試合数を変えるたびに直すのでは忘れる。
assert.ok(
  league.history[0].standings.every((s) => s.gamesPlayed === SEASON_TURNS),
  `全球団が${SEASON_TURNS}試合しているはず`,
);
const recordedYear = league.records.seasons[1];
assert.ok(recordedYear.comparison, '年度・リーグの比較値を確定して残す');
assert.ok(
  recordedYear.archiveToken,
  '確定年度の派生データを安全に再利用できる',
);
assert.ok(
  recordedYear.grandChampionshipExcluded,
  'グランドCSの対象外を記録する',
);
assert.ok(
  Object.keys(recordedYear.games).length >= 150,
  '公式150試合とプレーオフのボックス成績を保持',
);
for (const r of Object.values(recordedYear.players)) {
  assert.equal(
    r.splits.pitching.all?.outs || 0,
    r.stats.pitching.inningsPitched,
    '年間の走者アウトも投球回へ一致',
  );
  assert.equal(r.splits.batting.all?.pa || 0, r.stats.batting.plateAppearances);
}
resolve();
assert.equal(league.status, 'running');
assert.deepEqual(league.season.currentDate, { year: 2025, month: 4, day: 1 });
assert.ok(league.season.standings.every((s) => s.gamesPlayed === 0));
for (const name of league.season.settings.teamNames) {
  const team = league.game.teams[name];
  assert.ok(team.players.length >= 9);
  assert.ok(
    team.players.every(
      (p) =>
        !(p.seasonStats?.batting?.games > 0) &&
        !(p.seasonStats?.pitching?.gamesStarted > 0),
    ),
    '自リーグへ架空の次年度成績を注入しない',
  );
}
const member = league.members[0],
  retained = league.game.teams[member.teamName].players.find(
    (p) => recordedYear.players[p.onlinePlayerId],
  );
assert.ok(retained, '過年度の実記録を持つ選手が残る');
const periods = projectPlayerInfo(
  { league },
  member.userId,
  retained.id,
).periods;
const annual = periods.find((p) => p.id === 'online:1'),
  career = periods.find((p) => p.id === 'career');
assert.ok(annual && career, '次年度でも年度別と対人通算を取得');
assert.match(annual.source, /グランドCS除外/);
assert.ok(
  periods.some((p) => p.id === 'legacy:1'),
  'グランドCS込みの既存年度成績も選択できる',
);
assert.equal(
  career.seasonStats.batting.hitByPitch,
  annual.seasonStats.batting.hitByPitch,
  '死球の通算引継ぎ',
);
assert.equal(
  career.seasonStats.batting.caughtStealing,
  annual.seasonStats.batting.caughtStealing,
  '盗塁死の通算引継ぎ',
);
assert.equal(
  career.seasonStats.batting.sacrificeBunts,
  annual.seasonStats.batting.sacrificeBunts,
  '犠打の通算引継ぎ',
);
console.log(`online-engine-check PASS (${days}日・2年目開幕)`);

console.log(
  `snapshot gzip ${(gzipSync(JSON.stringify(league)).length / 1024 / 1024).toFixed(2)} MiB`,
);
