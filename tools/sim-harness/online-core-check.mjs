import './lib/bootstrap.mjs';
import assert from 'node:assert/strict';
import { bootstrapWorld, TEAMS_DATA } from './lib/world.mjs';
import { humanTeamNames, assignTeamControllers } from '../../src/game/teamControl.js';
import { simulateScheduledGamesOnDate } from '../../src/game/daySimulation.js';
import { createSeededRandom } from '../../src/game/rng.js';
import { initializeStandings } from '../../src/season/seasonManager.js';
import { ensureAllTeamsReady } from '../../src/game/lineupGenerator.js';
import { generateBackgroundTournaments } from '../../src/game/backgroundProgression.js';
import { WORLD_DATA } from '../../src/corporate/worldData.js';

assert.deepEqual(humanTeamNames({ A: {}, B: {} }), ['A']);
const controllers = { CPU: {}, A: {}, B: {} };
assignTeamControllers(controllers, ['A', 'B']);
assert.deepEqual(humanTeamNames(controllers), ['A', 'B']);
assert.throws(() => assignTeamControllers(controllers, ['A', 'A']));
assert.throws(() => assignTeamControllers(controllers, ['missing']));

Math.random = createSeededRandom(20261028);
const originalLog = console.log;
console.log = () => {};
const { seasonData, userTeams } = bootstrapWorld();
assignTeamControllers(TEAMS_DATA, userTeams.slice(0, 2));
const userCalls = [], cpuCalls = [];
ensureAllTeamsReady({
  userTeamName: userTeams[0], generatePitchingRotation: () => {},
  setRecommendedLineup: (_, name) => userCalls.push(name),
  generateAILineup: (_, name) => cpuCalls.push(name),
});
assert.deepEqual(userCalls, userTeams.slice(0, 2));
assert.ok(!cpuCalls.some(name => userCalls.includes(name)));

seasonData.currentDate = { year: 2024, month: 4, day: 2 };
seasonData.phase = 'regular_season';
seasonData.standings = initializeStandings(userTeams);
seasonData.schedule = [{ id: 1, date: seasonData.currentDate, home: userTeams[0], away: userTeams[1], result: null }];
const first = simulateScheduledGamesOnDate(seasonData);
assert.equal(first.results.length, 1);
assert.equal(first.data.results.length, 1);
assert.equal(first.data.standings.find(s => s.team === userTeams[0]).gamesPlayed, 1);
const before = JSON.stringify(TEAMS_DATA);
const second = simulateScheduledGamesOnDate(first.data);
assert.equal(second.results.length, 0);
assert.equal(second.data.results.length, 1);
assert.equal(JSON.stringify(TEAMS_DATA), before, '消化済みの試合で選手成績を再加算しない');

const playoff = { ...first.data, phase: 'playoffs', schedule: [{ id: 90001, date: seasonData.currentDate, home: userTeams[0], away: userTeams[1], phase: 'playoffs', playoffRound: 'final', seriesId: 'final', seriesGame: 1, result: null }] };
const afterPlayoff = simulateScheduledGamesOnDate(playoff);
assert.equal(afterPlayoff.data.standings.find(s => s.team === userTeams[0]).gamesPlayed, 1, 'プレーオフでリーグ順位を加算しない');
generateBackgroundTournaments(seasonData.currentDate);
const tournament = WORLD_DATA.corporateRegionalTournament;
generateBackgroundTournaments(seasonData.currentDate);
assert.equal(WORLD_DATA.corporateRegionalTournament, tournament, '大会を二重生成しない');
console.log = originalLog;
console.log('online-core-check PASS');
