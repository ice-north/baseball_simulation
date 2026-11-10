import assert from 'node:assert/strict';
import {
  getPlayoffChampion,
  generatePlayoffSchedule,
  updatePlayoffProgress,
} from '../../src/season/seasonManager.js';
import { schedulePlayoffReplay, PLAYOFF_REPLAY } from '../../server/playoffReplay.mjs';
import { prepareDailyLineup } from '../../server/dailyLineup.mjs';
import {
  validateLineup,
  ONLINE_SCHEMA,
  ONLINE_ENGINE_VERSION,
  FIELDER_REST_FATIGUE,
  FIELDER_FORCE_REST_FATIGUE,
} from '../../src/online/shared.js';
const schedule = generatePlayoffSchedule(['A', 'B'], 'short', 2024);
schedule[0].result = { homeScore: 1, awayScore: 0 };
schedule[1].result = { homeScore: 1, awayScore: 0 }; // ホームが入れ替わるので1勝1敗
schedule[2].result = { homeScore: 0, awayScore: 0 };
const season = { schedule, currentDate: { year: 2024, month: 10, day: 13 } };
// ⚠ 対人版は未決着なら再試合を足すので、勝者を読むときは PLAYOFF_REPLAY を渡す。
//    一人用（既定）は再試合を持たないため、全試合を終えたら勝ち数→上位シードで決める
assert.equal(getPlayoffChampion(schedule, PLAYOFF_REPLAY), null);
assert.equal(getPlayoffChampion(schedule), 'A', '一人用は1勝1敗1分なら上位シード（第1戦のホーム）');
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
// --- 代役の居ない守備位置のレギュラーを、壊れるまで出し続けないこと ---------
// ⚠ 「守れる控えが居なければ休ませない」だけだと、その守備位置に代役の居ない
//    レギュラーが**一度も休めない**。実測（オンライン12球団・140日）で二塁手が
//    疲労193まで積み上がった。控えの二塁適性は最高53で、下限（60）に届かない。
//    疲労193の打者は1年打てないので、**1日の守備の穴より明らかに悪い**。
{
  const make = (fatigue) => {
    const t = {
      players: positions.map((position, i) => ({
        id: i + 1,
        position,
        fatigue: position === 'second' ? fatigue : 0,
        positionFitness: {},
      })),
      pitchingRotation: { starters: [99], currentStarterIndex: 0 },
      lineupSettings: {
        battingOrder: positions.map((position, i) => ({
          playerId: i + 1,
          position,
          battingOrder: i + 1,
        })),
      },
    };
    t.players.push({ id: 99, position: 'pitcher', fatigue: 0 });
    // 控えは1人だけ。二塁は守れない（適性30 < 下限60）
    t.players.push({
      id: 50,
      position: 'catcher',
      fatigue: 0,
      positionFitness: { second: 30 },
    });
    return t;
  };
  const playing = (t) =>
    t.lineupSettings.battingOrder.find((e) => e.position === 'second').playerId;
  const second = positions.indexOf('second') + 1;

  // 休養の目安（80）では、守れる控えが居ないので下げない（守備の穴を開けない）
  const normal = make(FIELDER_REST_FATIGUE + 5);
  prepareDailyLineup(normal, 'test');
  assert.equal(
    playing(normal),
    second,
    '守れる控えが居ないのに、ふつうの疲労で守備の穴を開けている',
  );

  // 壊れる水準（120）を超えたら、適性を問わず下げる
  const broken = make(FIELDER_FORCE_REST_FATIGUE + 5);
  prepareDailyLineup(broken, 'test');
  assert.notEqual(
    playing(broken),
    second,
    `疲労${FIELDER_FORCE_REST_FATIGUE + 5}でも下げていない（一度も休めないレギュラーができる）`,
  );

  // ⚠ 戻すこと（その日だけの入れ替え）
  const restore = make(FIELDER_FORCE_REST_FATIGUE + 5);
  prepareDailyLineup(restore, 'test')();
  assert.equal(playing(restore), second, '無理に下げたあと打順を戻していない');
}

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

// 9人ちょうどでも、野手を先発に指定した日を進められる。
// 9番の仮置き投手を交代候補から落としたり、先発兼任者を二重登録しない。
for (const starters of [[1], [1, 9]]) {
  const sparse = {
    players: positions.map((position, i) => ({
      id: i + 1, position, pitching: { stamina: 80 }, fatigue: 0,
    })),
    pitchingRotation: { starters: [9], currentStarterIndex: 0 },
    lineupSettings: { battingOrder: [] },
  };
  sparse.players.push({ id: 9, position: 'pitcher', pitching: { stamina: 100 } });
  const tiny = {
    schema: ONLINE_SCHEMA, engineVersion: ONLINE_ENGINE_VERSION,
    status: 'running', members: [{ userId: 'a', teamName: 'test' }],
    game: { teams: { test: sparse } },
  };
  const plan = {
    battingOrder: positions.map((position, i) => ({
      playerId: i + 1, position, battingOrder: i + 1,
    })),
    starters,
  };
  saveLineup(tiny, 'a', plan);
  const before = structuredClone(sparse.lineupSettings.battingOrder);
  assert.equal(new Set(before.map((e) => e.playerId)).size, 9, '保存時に先発兼任者が重複');
  const undo = prepareDailyLineup(sparse, 'test');
  const day = sparse.lineupSettings.battingOrder;
  assert.equal(day.find((e) => e.position === 'pitcher').playerId, 1);
  assert.equal(day.find((e) => e.position === 'catcher').playerId, 9);
  assert.equal(new Set(day.map((e) => e.playerId)).size, 9);
  undo();
  assert.deepEqual(sparse.lineupSettings.battingOrder, before, '試合後に予約した打順へ戻らない');
  sparse.players = sparse.players.filter((p) => p.id !== 9);
  const invalidBefore = structuredClone(sparse);
  assert.throws(() => saveLineup(tiny, 'a', { ...plan, starters: [1] }), /9人/);
  assert.deepEqual(sparse, invalidBefore, '人数不足の保存で編成を破壊した');
}

// 休養代役も先発を兼ねるとき、すべての差し替えを戻した後に9番を決める。
{
  const team = {
    players: positions.map((position, i) => ({
      id: i + 1, position, pitching: { stamina: 80 }, fatigue: i === 7 ? 80 : 0,
    })),
    lineupSettings: { battingOrder: [
      ...positions.map((position, i) => ({ playerId: i + 1, position, battingOrder: i + 1 })),
      { playerId: 10, position: 'pitcher', battingOrder: 9 },
    ] },
    pitchingRotation: { starters: [8, 10, 9], currentStarterIndex: 0 },
  };
  team.players.push(
    { id: 9, position: 'right', positionFitness: { right: 100 }, pitching: { stamina: 80 }, fatigue: 0 },
    { id: 10, position: 'pitcher', pitching: { stamina: 100 }, fatigue: 50 },
  );
  const saved = structuredClone(team.lineupSettings.battingOrder);
  prepareDailyLineup(team, 'test')();
  const restored = team.lineupSettings.battingOrder;
  assert.deepEqual(restored.filter((e) => e.position !== 'pitcher'), saved.filter((e) => e.position !== 'pitcher'));
  assert.equal(new Set(restored.map((e) => e.playerId)).size, 9, '休養と先発の代役を戻した後に同じ選手が重複');
}
