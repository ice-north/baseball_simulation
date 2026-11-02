import assert from 'node:assert/strict';
import {
  getPlayoffChampion,
  generatePlayoffSchedule,
  updatePlayoffProgress,
} from '../../src/season/seasonManager.js';
import { schedulePlayoffReplay } from '../../server/playoffReplay.mjs';
import { prepareDailyLineup } from '../../server/dailyLineup.mjs';
import { validateLineup, ONLINE_SCHEMA, ONLINE_ENGINE_VERSION } from '../../src/online/shared.js';
const schedule = generatePlayoffSchedule(['A', 'B'], 'short', 2024);
schedule[0].result = { homeScore: 1, awayScore: 0 };
schedule[1].result = { homeScore: 1, awayScore: 0 }; // ホームが入れ替わるので1勝1敗
schedule[2].result = { homeScore: 0, awayScore: 0 };
const season = { schedule, currentDate: { year: 2024, month: 10, day: 13 } };
assert.equal(getPlayoffChampion(schedule), null);
schedulePlayoffReplay(season);
assert.equal(schedule.length, 4);
assert.equal(schedule[3].date.day, 13);
schedule[3].result = { homeScore: 0, awayScore: 0 };
season.currentDate.day = 14;
schedulePlayoffReplay(season);
assert.equal(schedule.length, 5);
schedule[4].result = { homeScore: 1, awayScore: 0 };
assert.equal(
  getPlayoffChampion(schedule),
  'A',
  '再試合が5試合になっても2勝先取の条件を増やさない',
);
assert.equal(getPlayoffChampion(updatePlayoffProgress(season).schedule), 'A');
schedulePlayoffReplay(season);
assert.equal(schedule.length, 5, '決着後には再試合を追加しない');
const positions = [
  'catcher',
  'first',
  'second',
  'third',
  'short',
  'left',
  'center',
  'right',
];
const team = {
  players: positions.map((position, i) => ({ id: i + 1, position })),
  pitchingRotation: { starters: [9], currentStarterIndex: 0 },
  lineupSettings: {
    battingOrder: positions.map((position, i) => ({
      playerId: i + 1,
      position,
      battingOrder: i + 1,
    })),
  },
};
team.players.push(
  { id: 9, position: 'pitcher', fatigue: 95 },
  { id: 10, position: 'pitcher', fatigue: 0 },
  { id: 11, position: 'pitcher', fatigue: 60 },
);
const restore = prepareDailyLineup(team, 'test');
assert.deepEqual(
  team.pitchingRotation.starters,
  [10],
  '短いローテでも休める控え投手を選ぶ',
);
assert.equal(
  team.lineupSettings.battingOrder.find((e) => e.position === 'pitcher')
    .playerId,
  10,
);
restore();
assert.deepEqual(
  team.pitchingRotation.starters,
  [9],
  '予約した先発ローテは消さない',
);
team.players.find((p) => p.id === 10).fatigue = 80;
prepareDailyLineup(team, 'test')();
assert.equal(
  team.lineupSettings.battingOrder.find((e) => e.position === 'pitcher')
    .playerId,
  11,
  '全員疲労時は最も疲労が低い投手',
);
assert.throws(
  () => validateLineup(team, null),
  (error) => error.status === 400,
);
assert.throws(
  () => validateLineup(team, { battingOrder: Array(8).fill(null) }),
  (error) => error.status === 400,
);
// --- 人の球団の野手は、疲れ切ったらその日だけ控えと替える -------------
// ⚠ 以前は保存した打順のまま毎試合出続け、遊撃手の疲労が396まで積み上がった
{
  const shortEntry = () =>
    team.lineupSettings.battingOrder.find((e) => e.position === 'short');
  const regular = shortEntry().playerId;
  team.players.find((p) => p.id === regular).fatigue = 120;
  team.players.push(
    { id: 20, position: 'short', fatigue: 0 },
    { id: 21, position: 'left', fatigue: 0, positionFitness: { short: 30 } },
  );
  // CPUの球団（controlType が human でない）には手を出さない
  prepareDailyLineup(team, 'test')();
  assert.equal(shortEntry().playerId, regular, 'CPUの打順まで差し替えた');
  team.controlType = 'human';
  const restoreDay = prepareDailyLineup(team, 'test');
  assert.equal(shortEntry().playerId, 20, '疲れた遊撃手が休んでいない');
  restoreDay();
  assert.equal(shortEntry().playerId, regular, '保存した打順に戻っていない');
  // 守れる控えが居なければ休ませない（守備に穴を開けない）
  team.players.find((p) => p.id === 20).isActive = false;
  prepareDailyLineup(team, 'test')();
  assert.equal(shortEntry().playerId, regular, '守れない控えを遊撃に入れた');
  team.players = team.players.filter((p) => p.id < 20);
  team.players.find((p) => p.id === regular).fatigue = 0;
  delete team.controlType;
}
console.log(
  'online-boundary-check PASS（引き分け再試合・必要勝数固定・疲労代役・予約維持・不正編成・疲れた野手の休養）',
);

// 打順だけの変更で、翌日の先発が先頭へ巻き戻らないこと。
const { saveLineup } = await import('../../server/lineupCommand.mjs');
for (const p of team.players.filter((p) => p.position === 'pitcher'))
  p.pitching = {};
team.pitchingRotation.starters = [9, 10];
team.pitchingRotation.currentStarterIndex = 1;
const league = {
  schema: ONLINE_SCHEMA,
  engineVersion: ONLINE_ENGINE_VERSION,
  status: 'running',
  members: [{ userId: 'a', teamName: 'test' }],
  game: { teams: { test: team } },
};
const plan = {
  battingOrder: team.lineupSettings.battingOrder.filter(
    (e) => e.position !== 'pitcher',
  ),
  starters: [9, 10],
  strategy: {
    batting: 'balanced',
    pitching: 'balanced',
    baseRunning: 'normal',
  },
};
saveLineup(league, 'a', plan);
assert.equal(
  team.pitchingRotation.currentStarterIndex,
  1,
  '打順・采配だけの保存では次の先発を変えない',
);
const beforeInvalid = structuredClone(team);
assert.throws(() =>
  saveLineup(league, 'a', { ...plan, strategy: { batting: 'invalid' } }),
);
assert.deepEqual(
  team,
  beforeInvalid,
  '不正な采配を受け付ける前に編成を書き換えない',
);
league.engineVersion = 'unsupported';
assert.throws(
  () => saveLineup(league, 'a', plan),
  (error) => error.code === 'version',
);
console.log(
  'online-review-boundaries PASS（先発維持・入力エラーの原子性・版の検証）',
);
