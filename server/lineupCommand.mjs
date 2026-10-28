import { requireOnline, validateLineup } from '../src/online/shared.js';
const clone = (value) => structuredClone(value);

export function saveLineup(league, userId, plan) {
  requireOnline(
    league.status === 'running' || league.status === 'paused',
    'この期間は編成変更できません',
    409,
  );
  const member = league.members.find((m) => m.userId === userId);
  requireOnline(member, '参加者ではありません', 403);
  const team = league.game.teams[member.teamName];
  validateLineup(team, plan);
  team.lineupSettings = {
    battingOrder: clone(plan.battingOrder),
    benchPlayers: [],
    substitutionRules: { pinchHitter: [], pinchRunner: [] },
  };
  const starter = plan.starters[0];
  team.lineupSettings.battingOrder.push({
    playerId: starter,
    battingOrder: 9,
    position: 'pitcher',
  });
  team.pitchingRotation.starters = [...plan.starters];
  team.pitchingRotation.currentStarterIndex = 0;
  if (plan.strategy) {
    const allowed = {
      batting: ['balanced', 'aggressive', 'patient'],
      pitching: ['balanced', 'strikeout', 'contact'],
      baseRunning: ['normal', 'aggressive', 'conservative'],
    };
    const strategy = {};
    for (const [key, values] of Object.entries(allowed)) {
      const value = plan.strategy[key] ?? team.strategy?.[key] ?? values[0];
      requireOnline(values.includes(value), '采配方針が不正です');
      strategy[key] = value;
    }
    team.strategy = strategy;
  }
}
