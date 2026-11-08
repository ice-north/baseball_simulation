import { validateTactics } from './lineupTactics.mjs';
import {
  requireOnline,
  validateLineup,
  assertLeagueVersion,
} from '../src/online/shared.js';

export function saveLineup(league, userId, plan) {
  assertLeagueVersion(league);
  // ⚠ **手続きの間（waiting）も保存できること**。画面は手続き中も編成を開ける
  //    設計（「打順や投手起用はいつ決めてもよい」）なのに、以前はここで弾いており、
  //    キャンプ中に決めた打順を保存しようとすると毎回「この期間は編成変更できません」
  //    になっていた。手続きの解決は、成り立つ限り人の編成を残す（`refreshTeamPlan`）。
  requireOnline(
    ['running', 'paused', 'waiting'].includes(league.status),
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
      baseRunning: ['normal', 'aggressive', 'conservative', 'never'],
      defense: ['normal', 'infield_in', 'shift'],
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
  const tactical = validateTactics(team, plan, rotationChanged);
  const index = rotationChanged
    ? 0
    : (team.pitchingRotation.currentStarterIndex || 0) % plan.starters.length;
  // 9番（投手）は次の先発。⚠ 次の先発が野手の打順にも入っている（二刀流）ときは、
  //    同じ選手を2回並べない。9番は試合の日に組み直す（`prepareDailyLineup`）ので、
  //    ここは野手に入っていない先発で仮に埋めておく
  const fielding = new Set(plan.battingOrder.map((e) => e.playerId));
  const ninth =
    [...plan.starters.slice(index), ...plan.starters.slice(0, index)].find(
      (id) => !fielding.has(id),
    ) ??
    team.players.find(
      (p) =>
        p.isActive !== false &&
        !fielding.has(p.id) &&
        (p.position === 'pitcher' || p.pitching),
    )?.id;
  requireOnline(ninth !== undefined, '投手を含む9人の選手が必要です');
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
  team.lineupSettings.battingOrder.push({
    playerId: ninth,
    battingOrder: 9,
    position: 'pitcher',
  });
  team.pitchingRotation.starters = [...plan.starters];
  team.pitchingRotation.currentStarterIndex = index;
  if (strategy) team.strategy = strategy;
  if (tactical.tactics) team.onlineTactics = tactical.tactics;
  if (tactical.rotation)
    Object.assign(team.pitchingRotation, tactical.rotation);
}
