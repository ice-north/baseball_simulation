import './engine-bootstrap.mjs';
import {
  TEAMS_DATA,
  LEAGUE_SETTINGS,
  releasedPlayersPool,
} from '../src/teams-data.js';
import { WORLD_DATA, initializeWorld } from '../src/corporate/worldData.js';
import { UNIVERSITY_TEAMS } from '../src/university/universityTeamsData.js';
import {
  serializeUniversityPool,
  deserializeUniversityPool,
} from '../src/season/universityPool.js';
import {
  getPlayerIdCounter,
  setPlayerIdCounter,
} from '../src/state/playerIds.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const rankKeys = [
  'rank',
  'reputation',
  'reputationHistory',
  'rankPosition',
  'rankingScore',
];

// 一人用セーブは未完了の背景大会を省略するため、そのままサーバー保存に流用しない。
export function captureWorld() {
  return clone({
    teams: TEAMS_DATA,
    settings: LEAGUE_SETTINGS,
    world: {
      ...WORLD_DATA,
      corporateLeague: {
        ...WORLD_DATA.corporateLeague,
        teams: Object.keys(WORLD_DATA.corporateLeague?.teams || {}),
      },
    },
    universityRanks: UNIVERSITY_TEAMS.map((team) => ({
      id: team.id,
      ...Object.fromEntries(
        rankKeys.filter((k) => team[k] !== undefined).map((k) => [k, team[k]]),
      ),
    })),
    pools: serializeUniversityPool(),
    released: releasedPlayersPool,
    playerIdCounter: getPlayerIdCounter(),
  });
}

export function restoreWorld(snapshot) {
  const data = clone(snapshot);
  for (const key of Object.keys(TEAMS_DATA)) delete TEAMS_DATA[key];
  Object.assign(TEAMS_DATA, data.teams);
  for (const key of Object.keys(WORLD_DATA)) delete WORLD_DATA[key];
  initializeWorld('independent', data.world.userLeagueId);
  Object.assign(WORLD_DATA, data.world);
  WORLD_DATA.corporateLeague.teams = Object.fromEntries(
    (data.world.corporateLeague?.teams || [])
      .map((name) => [name, TEAMS_DATA[name]])
      .filter(([, team]) => team),
  );
  for (const key of Object.keys(LEAGUE_SETTINGS)) delete LEAGUE_SETTINGS[key];
  Object.assign(LEAGUE_SETTINGS, data.settings);
  deserializeUniversityPool(data.pools);
  releasedPlayersPool.splice(0, releasedPlayersPool.length, ...data.released);
  setPlayerIdCounter(data.playerIdCounter);
  const ranks = new Map(data.universityRanks.map((team) => [team.id, team]));
  for (const team of UNIVERSITY_TEAMS) {
    const rank = ranks.get(team.id);
    for (const key of rankKeys) {
      if (rank && Object.hasOwn(rank, key)) team[key] = rank[key];
      else if (key !== 'rank') delete team[key];
    }
  }
}
