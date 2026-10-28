import {
  requireOnline,
  validateLineup,
  assertLeagueVersion,
} from '../src/online/shared.js';

export function saveLineup(league, userId, plan) {
  assertLeagueVersion(league);
  requireOnline(
    league.status === 'running' || league.status === 'paused',
    'この期間は編成変更できません',
    409,
  );
  const member = league.members.find((m) => m.userId === userId);
  requireOnline(member, '参加者ではありません', 403);
  const team = league.game.teams[member.teamName];
  validateLineup(team, plan);
  let strategy = team.strategy;
  if (plan.strategy) {
    const allowed = {
      batting: ['balanced', 'aggressive', 'patient'],
      pitching: ['balanced', 'strikeout', 'contact'],
      baseRunning: ['normal', 'aggressive', 'conservative'],
    };
    strategy = {};
    for (const [key, values] of Object.entries(allowed)) {
      const value = plan.strategy[key] ?? team.strategy?.[key] ?? values[0];
      requireOnline(values.includes(value), '采配方針が不正です');
      strategy[key] = value;
    }
  }
  const rotationChanged =
    team.pitchingRotation.starters.length !== plan.starters.length ||
    team.pitchingRotation.starters.some(
      (id, index) => id !== plan.starters[index],
    );
  team.lineupSettings = {
    battingOrder: plan.battingOrder.map(
      ({ playerId, battingOrder, position }) => ({
        playerId,
        battingOrder,
        position,
      }),
    ),
    benchPlayers: [],
    substitutionRules: { pinchHitter: [], pinchRunner: [] },
  };
  const index = rotationChanged
    ? 0
    : (team.pitchingRotation.currentStarterIndex || 0) % plan.starters.length;
  team.lineupSettings.battingOrder.push({
    playerId: plan.starters[index],
    battingOrder: 9,
    position: 'pitcher',
  });
  team.pitchingRotation.starters = [...plan.starters];
  team.pitchingRotation.currentStarterIndex = index;
  if (strategy) team.strategy = strategy;
}
