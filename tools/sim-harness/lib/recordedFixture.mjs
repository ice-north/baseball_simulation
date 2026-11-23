// 実際に消化した1試合の記録（観戦記録つき）を持つリーグ。画面検査（観戦・スマホの試合画面）の fixture。
//
// ⚠ 以前は `online-records-check` を丸ごと import して、その最後の `league` を使っていた。
//    画面検査のたびに記録の検査（約50秒）が全部走っていたので、作る部分だけをここに切り出した。
//    作り方は `online-records-check` の前半と同じ（同じ種・同じ球団・同じ試合）。
//    ⚠ 前は記録の検査を**最後まで**走らせた後のリーグだった（途中で選手の記録を1件消す検査などが
//    残った形）。ここは試合を1つ記録しただけのきれいな形。画面検査はどちらでも通る（2026-11-23 確認）
// ⚠ 観戦記録は本番では残さない（容量）。ここでは明示的に有効にして作る（`{ replay: true }`）。
//    `process.env` で立てても ESM の import が先に走るので間に合わない。
import {
  createLeague,
  defaultPhasePlan,
  submitPhase,
  loadLeagueWorld,
} from '../../../server/leagueEngine.mjs';
import { captureWorld } from '../../../server/worldSnapshot.mjs';
import { TEAMS_DATA } from '../../../src/teams-data.js';
import { autoSimulateGame } from '../../../src/game/autoSimulation.js';
import { createRecorder, freezeComparison } from '../../../server/recordedStats.mjs';

/** 開幕前まで手続きを済ませ、参加者の2球団で1試合（id 1・4月1日）を記録したリーグを作る */
export function buildRecordedFixture() {
  const log = console.log;
  console.log = () => {};
  try {
    const now = '2026-10-28T00:00:00.000Z';
    const league = createLeague({ members: [{ userId: 'a' }, { userId: 'b' }], now });
    while (league.phase) {
      const phaseId = league.phase.id;
      const plans = league.members.map((m) => defaultPhasePlan(league, m.teamName));
      league.members.forEach((m, i) =>
        submitPhase(league, m.userId, { phaseId, plan: plans[i], ready: true }, now),
      );
    }
    loadLeagueWorld(league);
    // ⚠ **参加者の球団を使うこと**（`teamNames` の先頭は別の階層の CPU 球団）
    const [home, away] = league.members.map((m) => m.teamName);
    const recorder = createRecorder(league, TEAMS_DATA, { replay: true });
    const game = { id: 1, date: { year: 2024, month: 4, day: 1 }, home, away };
    const observer = recorder.begin(game);
    const result = autoSimulateGame(home, away, false, 70281, observer);
    recorder.finish(game, result, observer);
    league.game = captureWorld();
    freezeComparison(league);
    return league;
  } finally {
    console.log = log;
  }
}
