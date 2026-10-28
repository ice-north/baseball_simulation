import { PHASE_LABELS } from '../src/online/shared.js';
import { leagueComparison, performanceFor } from './performanceLabels.mjs';

const playerView = (p) => ({
  id: p.id,
  name: p.name,
  age: p.age,
  condition:
    Number.isInteger(p.condition) && p.condition >= 0 && p.condition <= 4
      ? p.condition
      : null,
  position: p.position,
  number: p.number,
  fatigue: p.fatigue || 0,
  batting: p.batting,
  pitching: p.pitching,
  fielding: p.fielding,
  physical:
    p.physical &&
    Object.fromEntries(
      [
        'speed',
        'arm',
        'throws',
        'bodyStamina',
        'recovery',
        'muscle',
        'dexterity',
        'build',
      ]
        .filter((key) => p.physical[key] !== undefined)
        .map((key) => [key, p.physical[key]]),
    ),
  catching: p.catching && { lead: p.catching.lead },
  personality: p.personality && {
    discipline: p.personality.discipline,
    mental: p.personality.mental,
  },
  positionFitness: p.positionFitness,
  zoneProfile: p.zoneProfile,
  growthPotential: p.growthPotential,
  growthModifier: p.growthModifier,
  origin: {
    highSchool: p.highSchool?.name,
    university: p.universityTeamName || p.universityName,
    previousTeam: p.previousTeam,
  },
  seasonStats: p.seasonStats,
});
export function projectLineup(team) {
  return {
    battingOrder: (team.lineupSettings?.battingOrder || []).filter(
      (e) => e.position !== 'pitcher',
    ),
    starters: team.pitchingRotation?.starters || [],
    strategy: team.strategy || {},
  };
}
export function projectLeague(bundle, userId, sessionId, adminId) {
  const l = bundle.league;
  if (!l) return { setupRequired: true, isAdmin: userId === adminId };
  const member = l.members.find((m) => m.userId === userId);
  if (!member) return null;
  const team = l.game.teams[member.teamName];
  const comparison = leagueComparison(l);
  const phase = l.phase;
  return {
    revision: l.revision,
    status: l.status,
    error: l.error,
    teamName: member.teamName,
    year: l.season.year,
    currentDate: l.season.currentDate,
    nextAdvanceAt: l.nextAdvanceAt,
    isAdmin: userId === adminId,
    writable: !!sessionId && bundle.sessions[userId] === sessionId,
    hasBackup: !!bundle.backup,
    members: l.members.map((m) => ({
      label: m.label,
      teamName: m.teamName,
      ready: !!phase?.submissions[m.userId]?.ready,
    })),
    standings: l.season.standings,
    results: l.season.results.slice(-14).map((g) => ({
      gameId: g.gameId,
      date: g.date,
      home: g.home,
      away: g.away,
      homeScore: g.result.homeScore,
      awayScore: g.result.awayScore,
      decisions: g.result.decisions,
    })),
    upcoming: l.season.schedule
      .filter((g) => !g.result && g.home !== 'TBD' && g.away !== 'TBD')
      .slice(0, 6)
      .map((g) => ({ id: g.id, date: g.date, home: g.home, away: g.away })),
    roster: team.players.map((p) => ({
      ...playerView(p),
      performance: performanceFor(p, comparison),
    })),
    lineup: projectLineup(team),
    nextStarterId: team.pitchingRotation?.starters?.length
      ? team.pitchingRotation.starters[
          (team.pitchingRotation.currentStarterIndex || 0) %
            team.pitchingRotation.starters.length
        ]
      : null,
    phase: phase
      ? {
          id: phase.id,
          kind: phase.kind,
          label: PHASE_LABELS[phase.kind],
          candidates: phase.candidates?.map(playerView),
          submission: phase.submissions[userId] || null,
        }
      : null,
    history: l.history,
    notices: l.notices.slice(0, 4),
  };
}
