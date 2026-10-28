import './engine-bootstrap.mjs';
import { schedulePlayoffReplay } from './playoffReplay.mjs';
import {
  TEAMS_DATA,
  LEAGUE_SETTINGS,
  initializeTeamsForCount,
  initializeAllPitchingRotations,
  releasedPlayersPool,
} from '../src/teams-data.js';
import { WORLD_DATA } from '../src/corporate/worldData.js';
import { INDEPENDENT_LEAGUES } from '../src/corporate/independentLeagueData.js';
import {
  initializeParallelWorldForIndependent,
  ensureUserIndependentLeagueTagged,
  getLeagueRankFromTeams,
  updateAllTeamReputations,
} from '../src/corporate/corporateInit.js';
import {
  createSeasonData,
  initializeStandings,
  SEASON_PHASES,
  getNPBDraftDay,
  getPlayoffChampion,
} from '../src/season/seasonManager.js';
import {
  generateFullSeasonSchedule,
  getScheduleByDate,
} from '../src/season/scheduleGenerator.js';
import {
  progressDate,
  handlePhaseTransition,
} from '../src/season/dateProgression.js';
import {
  generateTryoutCandidates,
  generateSnakeDraftOrder,
  selectPlayerForAI,
  updateReleasedPoolAfterTryout,
  removeDraftedFromClubTeams,
} from '../src/season/tryoutSystem.js';
import { removeDraftedFromGraduatePools } from '../src/season/universityPool.js';
import {
  generateAprilHighSchoolClass,
  processSeasonEnd,
  snapshotRankings,
  advanceToNextYear,
  finalizePlayerSeason,
  cleanupPlayerReferences,
} from '../src/season/yearProgressionSystem.js';
import { processNPBDraft } from '../src/season/npbDraft.js';
import { simulateKoshien } from '../src/season/koshien.js';
import {
  simulateParallelWorldDate,
  generateGrandChampionship,
  autoPlayGrandChampionship,
} from '../src/corporate/parallelWorldManager.js';
import {
  generateBackgroundTournaments,
  advanceBackgroundTournaments,
} from '../src/game/backgroundProgression.js';
import { generatePitchingRotation } from '../src/game/lineupGenerator.js';
import { setRecommendedLineup } from '../src/game/autoSimulation.js';
import { prepareDailyLineup } from './dailyLineup.mjs';
import { initializeAllPlayersCondition } from '../src/game/condition.js';
import { simulateScheduledGamesOnDate } from '../src/game/daySimulation.js';
import { hashSeed, withSeededRandom } from '../src/game/rng.js';
import {
  assignTeamControllers,
  humanTeamNames,
} from '../src/game/teamControl.js';
import { getAIReleaseCandidates } from '../src/game/contractRules.js';
import {
  executeTeamCampTraining,
  applyMotivationEffect,
  applyBatteryMentalEffect,
} from '../src/season/campTraining.js';
import {
  getTeamStaffBonus,
  setStaffIdCounter,
  setStaffNameHistory,
} from '../src/corporate/staffData.js';
import { addToReleasedPool } from '../src/state/pools.js';
import { setPlayerIdCounter } from '../src/state/playerIds.js';
import { captureWorld, restoreWorld } from './worldSnapshot.mjs';
import {
  ONLINE_SCHEMA,
  ONLINE_ENGINE_VERSION,
  assertLeagueVersion,
  nextProgressionAt,
  requireOnline,
} from '../src/online/shared.js';

export const ENGINE_VERSION = ONLINE_ENGINE_VERSION;
export const CAMP_MENUS = [
  'batting',
  'baserunning',
  'fielding',
  'control',
  'velocity',
  'intensive_power',
  'intensive_meet',
  'intensive_speed',
  'intensive_control',
  'intensive_velocity',
  'intensive_defense',
  'intensive_eye',
];
const clone = (value) => JSON.parse(JSON.stringify(value));
const quiet = (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
};
const seeded = (league, key, fn) =>
  quiet(() =>
    withSeededRandom(
      hashSeed(`${league.seed}:${league.season.year}:${key}`),
      fn,
    ),
  );

function createSchedule(season) {
  season.schedule = generateFullSeasonSchedule({
    teams: season.settings.teamNames,
    gamesPerSeason: 75,
    startDate: { year: season.currentDate.year, month: 4, day: 1 },
    endDate: { year: season.currentDate.year, month: 9, day: 30 },
    leagueFormat: 'single',
  });
  season.standings = initializeStandings(season.settings.teamNames);
}

function openPhase(league, kind) {
  const phase = { id: `${league.season.year}:${kind}`, kind, submissions: {} };
  if (kind === 'initial_tryout' || kind === 'tryout') {
    const names = league.season.settings.teamNames;
    const rank = getLeagueRankFromTeams(names) || 'B';
    const reputation =
      names.reduce(
        (n, name) => n + (TEAMS_DATA[name].developmentReputation || 0),
        0,
      ) / names.length;
    phase.candidates = generateTryoutCandidates(
      league.season.year,
      4,
      kind === 'initial_tryout',
      rank,
      reputation,
    );
  }
  league.phase = phase;
  league.status = 'waiting';
  league.nextAdvanceAt = null;
  league.season.pendingPhaseEvent = kind;
}

export function createLeague({
  seed = 20261028,
  members,
  now = new Date().toISOString(),
}) {
  requireOnline(
    Array.isArray(members) &&
      members.length === 2 &&
      new Set(members.map((m) => m.userId)).size === 2 &&
      members.every((m) => typeof m.userId === 'string' && m.userId.length > 0),
    '参加者2人を指定してください',
  );
  const defs = INDEPENDENT_LEAGUES.shikoku.teams;
  const names = defs.map((t) => t.name);
  const league = {
    schema: ONLINE_SCHEMA,
    engineVersion: ENGINE_VERSION,
    id: 'pennant',
    seed,
    revision: 1,
    status: 'waiting',
    createdAt: now,
    updatedAt: now,
    nextAdvanceAt: null,
    members: members.map((m, i) => ({
      userId: m.userId,
      label: m.label || `プレイヤー${i + 1}`,
      teamName: names[i],
    })),
    history: [],
    notices: [],
  };
  const season = createSeasonData(1);
  season.settings = {
    ...season.settings,
    teamNames: names,
    teamsCount: 4,
    preset: 'shikoku',
    gamesPerSeason: 75,
    leagueFormat: 'single',
    playoffFormat: 'short',
    useDH: false,
  };
  league.season = season;
  seeded(league, 'create', () => {
    setPlayerIdCounter(0);
    setStaffIdCounter(5000);
    setStaffNameHistory([]);
    initializeTeamsForCount(
      4,
      names,
      defs.map((t) => t.abbreviation),
    );
    LEAGUE_SETTINGS.useDH = false;
    initializeParallelWorldForIndependent('shikoku', names);
    ensureUserIndependentLeagueTagged(names, 'shikoku');
    assignTeamControllers(
      TEAMS_DATA,
      league.members.map((m) => m.teamName),
    );
    generateAprilHighSchoolClass(1);
    season._highSchoolGenerated = true;
    createSchedule(season);
    openPhase(league, 'initial_tryout');
  });
  league.game = captureWorld();
  return league;
}

export function loadLeagueWorld(league) {
  assertLeagueVersion(league);
  restoreWorld(league.game);
  assignTeamControllers(
    TEAMS_DATA,
    league.members.map((m) => m.teamName),
  );
}

export function defaultPhasePlan(league, teamName) {
  const team = league.game.teams[teamName];
  const kind = league.phase.kind;
  if (kind === 'contract')
    return { releaseIds: getAIReleaseCandidates(team.players) };
  if (kind === 'camp') return { menu: 'standard' };
  if (kind === 'offseason') return {};
  return seeded(league, `default:${league.phase.id}:${teamName}`, () => {
    const pool = clone(league.phase.candidates);
    const roster = clone(team.players);
    const rankedIds = [];
    while (pool.length) {
      const player = selectPlayerForAI(pool, roster) || pool[0];
      rankedIds.push(player.id);
      roster.push(player);
      pool.splice(
        pool.findIndex((p) => p.id === player.id),
        1,
      );
    }
    return { rankedIds, count: Math.max(0, 24 - team.players.length) };
  });
}

function validatePhasePlan(league, teamName, plan) {
  requireOnline(
    plan && typeof plan === 'object' && !Array.isArray(plan),
    '提出内容が不正です',
  );
  const team = TEAMS_DATA[teamName];
  switch (league.phase.kind) {
    case 'contract': {
      requireOnline(
        Array.isArray(plan.releaseIds) &&
          new Set(plan.releaseIds).size === plan.releaseIds.length &&
          plan.releaseIds.every((id) => team.players.some((p) => p.id === id)),
        '退団選手の指定が不正です',
      );
      const remaining = team.players.filter(
        (p) => !plan.releaseIds.includes(p.id),
      );
      requireOnline(
        remaining.length >= Math.min(9, team.players.length),
        '契約後も最低9人は残してください。既に9人未満の場合は新たな退団はできません',
      );
      return { releaseIds: [...plan.releaseIds] };
    }
    case 'camp':
      requireOnline(
        plan.menu === 'standard' || CAMP_MENUS.includes(plan.menu),
        '練習方針が不正です',
      );
      return { menu: plan.menu };
    case 'initial_tryout':
    case 'tryout': {
      const candidates = new Set(league.phase.candidates.map((p) => p.id));
      requireOnline(
        Number.isInteger(plan.count) &&
          plan.count >= 0 &&
          plan.count <= Math.max(0, 24 - team.players.length),
        '獲得人数が不正です',
      );
      requireOnline(
        Array.isArray(plan.rankedIds) &&
          plan.rankedIds.length <= candidates.size &&
          new Set(plan.rankedIds).size === plan.rankedIds.length &&
          plan.rankedIds.every((id) => candidates.has(id)),
        '希望順位に無効・重複した選手がいます',
      );
      requireOnline(
        plan.rankedIds.length >= plan.count,
        '獲得希望人数以上の候補を指定してください',
      );
      return { count: plan.count, rankedIds: [...plan.rankedIds] };
    }
    case 'offseason':
      return {};
    default:
      throw new Error('未対応のイベントです');
  }
}

function releasePlayers(teamName, ids, year) {
  const team = TEAMS_DATA[teamName];
  for (const player of team.players.filter((p) => ids.includes(p.id))) {
    if ((player.age || 20) < 33) {
      const saved = clone(finalizePlayerSeason(player, year));
      addToReleasedPool({
        ...saved,
        isStarter: false,
        battingOrder: 0,
        releasedYear: year,
        previousTeam: teamName,
        attemptsInPool: 0,
        seasonFinalizedYear: year,
      });
    }
    cleanupPlayerReferences(team, player.id);
  }
  team.players = team.players.filter((p) => !ids.includes(p.id));
}

function resolveTryout(league, plans) {
  const phase = league.phase;
  const names =
    phase.kind === 'initial_tryout'
      ? league.season.settings.teamNames
      : [...league.season.standings]
          .sort((a, b) => a.winRate - b.winRate)
          .map((s) => s.team);
  const remaining = clone(phase.candidates);
  const acquired = Object.fromEntries(names.map((name) => [name, []]));
  const allPicked = [];
  for (const pick of generateSnakeDraftOrder(names, 24)) {
    const team = TEAMS_DATA[pick.team];
    const plan = plans[pick.team];
    if (
      team.players.length + acquired[pick.team].length >= 24 ||
      (plan && acquired[pick.team].length >= plan.count)
    )
      continue;
    const player = plan
      ? plan.rankedIds
          .map((id) => remaining.find((p) => p.id === id))
          .find(Boolean)
      : selectPlayerForAI(remaining, [...team.players, ...acquired[pick.team]]);
    if (!player) continue;
    remaining.splice(
      remaining.findIndex((p) => p.id === player.id),
      1,
    );
    acquired[pick.team].push(player);
    allPicked.push({ team: pick.team, player, round: pick.round });
  }
  for (const name of names) {
    const team = TEAMS_DATA[name];
    const combined = [...team.players, ...acquired[name]];
    requireOnline(
      combined.filter((p) => p.position !== 'pitcher').length >= 8 &&
        combined.some((p) => p.position === 'pitcher') &&
        combined.some((p) => p.position === 'catcher'),
      `${name}の投手・捕手・野手が不足します。希望順位を見直してください`,
      409,
      'roster',
    );
    team.players = combined;
  }
  for (const { team, player, round } of allPicked) {
    player.draftInfo = { year: league.season.year, round };
    player.careerHistory = [
      ...(player.careerHistory || []),
      { type: 'independent', year: league.season.year, label: team },
    ];
  }
  if (phase.kind !== 'initial_tryout') {
    const ids = allPicked.map((p) => p.player.id);
    updateReleasedPoolAfterTryout(ids);
    removeDraftedFromGraduatePools(
      ids,
      allPicked.map((p) => p.player),
    );
    removeDraftedFromClubTeams(ids);
  }
  league.notices.unshift({
    type: 'tryout',
    year: league.season.year,
    picks: allPicked.map(({ team, player, round }) => ({
      team,
      playerId: player.id,
      name: player.name,
      round,
    })),
  });
  for (const name of names) {
    generatePitchingRotation(name);
    setRecommendedLineup(TEAMS_DATA[name], name);
  }
}

function resolvePhase(league, now) {
  const kind = league.phase.kind;
  const plans = Object.fromEntries(
    league.members.map((m) => [
      m.teamName,
      league.phase.submissions[m.userId].plan,
    ]),
  );
  if (kind === 'initial_tryout' || kind === 'tryout')
    resolveTryout(league, plans);
  if (kind === 'contract') {
    for (const name of league.season.settings.teamNames)
      releasePlayers(
        name,
        plans[name]?.releaseIds ||
          getAIReleaseCandidates(TEAMS_DATA[name].players),
        league.season.year,
      );
  }
  if (kind === 'camp') {
    for (let round = 0; round < 4; round++) {
      for (const [name, team] of Object.entries(TEAMS_DATA)) {
        if (!team.players?.length) continue;
        const menu = plans[name]?.menu || 'standard';
        const assignments = Object.fromEntries(
          team.players.map((p) => [
            p.id,
            menu === 'standard'
              ? p.position === 'pitcher'
                ? 'control'
                : 'batting'
              : menu,
          ]),
        );
        const staff = team.corporateData?.staff
          ? getTeamStaffBonus(team.corporateData.staff)
          : null;
        TEAMS_DATA[name] = executeTeamCampTraining(
          team,
          assignments,
          {},
          staff,
        ).updatedTeam;
        if (staff) {
          applyMotivationEffect(TEAMS_DATA[name].players, staff);
          applyBatteryMentalEffect(TEAMS_DATA[name].players, staff);
        }
      }
    }
    initializeAllPlayersCondition();
    for (const name of league.season.settings.teamNames) {
      generatePitchingRotation(name);
      setRecommendedLineup(TEAMS_DATA[name], name);
    }
    league.season.currentDate = {
      year: 2023 + league.season.year,
      month: 4,
      day: 1,
    };
    league.season.phase = SEASON_PHASES.REGULAR_SEASON;
    generateAprilHighSchoolClass(league.season.year);
    league.season._highSchoolGenerated = true;
    generateBackgroundTournaments(league.season.currentDate);
  }
  if (kind === 'offseason') {
    league.history.push({
      year: league.season.year,
      standings: clone(league.season.standings),
      awards: clone(league.season.frozenAwards || {}),
      playoffChampion: getPlayoffChampion(league.season.schedule),
    });
    const result = advanceToNextYear(league.season, TEAMS_DATA, {
      playedTeamNames: league.season.settings.teamNames,
    });
    for (const key of Object.keys(TEAMS_DATA)) delete TEAMS_DATA[key];
    Object.assign(TEAMS_DATA, result.updatedTeams);
    league.season = result.newSeasonData;
    WORLD_DATA.year = league.season.year;
    assignTeamControllers(
      TEAMS_DATA,
      league.members.map((m) => m.teamName),
    );
    createSchedule(league.season);
    // 一人用と同じく年度末にCPUローテを再構築。人間の編成は有効な範囲で保持する。
    const humans = new Set(humanTeamNames(TEAMS_DATA));
    for (const name of Object.keys(TEAMS_DATA))
      if (!humans.has(name)) generatePitchingRotation(name);
  }
  league.phase = null;
  delete league.season.pendingPhaseEvent;
  if (kind === 'initial_tryout' || kind === 'offseason')
    openPhase(league, 'camp');
  else {
    league.status = 'running';
    league.nextAdvanceAt = nextProgressionAt(now);
  }
}

export function submitPhase(league, userId, { phaseId, plan, ready }, now) {
  requireOnline(
    league.status === 'waiting' && league.phase?.id === phaseId,
    'このイベントは終了しています。最新状態を確認してください',
    409,
    'phase',
  );
  const member = league.members.find((m) => m.userId === userId);
  requireOnline(member, '参加者ではありません', 403);
  loadLeagueWorld(league);
  const normalized = validatePhasePlan(league, member.teamName, plan);
  league.phase.submissions[userId] = {
    plan: normalized,
    ready: ready === true,
  };
  if (league.members.every((m) => league.phase.submissions[m.userId]?.ready))
    seeded(league, `phase:${phaseId}`, () => resolvePhase(league, now));
  league.game = captureWorld();
}

export { saveLineup } from './lineupCommand.mjs';

export function advanceLeagueDay(league, operationId, now) {
  requireOnline(league.status === 'running', '現在は進行を停止しています', 409);
  loadLeagueWorld(league);
  seeded(league, `day:${operationId}`, () => {
    const oldDate = league.season.currentDate;
    const playingTeams = new Set(
      getScheduleByDate(league.season.schedule, oldDate)
        .filter((game) => !game.result)
        .flatMap((game) => [game.home, game.away]),
    );
    const restoreRotations = league.season.settings.teamNames
      .filter((name) => playingTeams.has(name))
      .map((name) => prepareDailyLineup(TEAMS_DATA[name], name));
    let season;
    try {
      season = simulateScheduledGamesOnDate(league.season).data;
    } finally {
      for (const restore of restoreRotations) restore();
    }
    season = progressDate(season, 1);
    simulateParallelWorldDate(oldDate);
    advanceBackgroundTournaments(oldDate);
    if (
      oldDate.month !== season.currentDate.month &&
      [6, 8, 10].includes(season.currentDate.month)
    )
      updateAllTeamReputations(season);
    if (league.season.phase !== season.phase)
      season = handlePhaseTransition(season, season.phase);
    schedulePlayoffReplay(season);
    league.season = season;
    const { month, day, year } = season.currentDate;
    generateBackgroundTournaments(season.currentDate);
    if (month === 8 && day >= 15 && !season._koshienDone) {
      simulateKoshien(season.year);
      season._koshienDone = true;
    }
    if (month === 10 && day >= 21 && !season.grandChampionship?.generated) {
      const champion = getPlayoffChampion(season.schedule);
      if (champion) {
        const gc = generateGrandChampionship(
          'shikoku',
          season.standings,
          season.settings,
          season.year,
          champion,
        );
        if (gc) {
          autoPlayGrandChampionship(gc);
          season.grandChampionship = gc;
        }
      }
    }
    if (month === 10 && day === getNPBDraftDay(year) && !season._draftDone) {
      season.frozenAwards = processSeasonEnd(season, TEAMS_DATA);
      season.finalRankings = snapshotRankings(
        TEAMS_DATA,
        season.settings.teamNames,
      );
      const result = processNPBDraft(TEAMS_DATA, season.year);
      league.notices.unshift({
        type: 'draft',
        year: season.year,
        picks: result.draftedPlayers.map((p) => ({
          name: p.player.name,
          playerId: p.player.id,
          team: p.teamName,
          npbTeam: p.npbTeam,
          round: p.draftRound,
        })),
      });
      season._draftDone = true;
    }
    if (month === 11 && day === 9) openPhase(league, 'contract');
    else if (month === 11 && day === 10) openPhase(league, 'tryout');
    else if (month === 11 && day === 30) openPhase(league, 'offseason');
  });
  if (league.status === 'running')
    league.nextAdvanceAt = nextProgressionAt(now);
  league.notices = league.notices.slice(0, 20);
  league.game = captureWorld();
}
