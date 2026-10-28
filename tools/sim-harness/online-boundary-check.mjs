import assert from 'node:assert/strict';
import {
  getPlayoffChampion,
  generatePlayoffSchedule,
  updatePlayoffProgress,
} from '../../src/season/seasonManager.js';
import { schedulePlayoffReplay } from '../../server/playoffReplay.mjs';
import { prepareDailyLineup } from '../../server/dailyLineup.mjs';
import { validateLineup } from '../../src/online/shared.js';
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
console.log(
  'online-boundary-check PASS（引き分け再試合・必要勝数固定・疲労代役・予約維持・不正編成）',
);
