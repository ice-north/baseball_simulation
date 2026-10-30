import { roleFor } from '../src/online/tactics.js';
import { PHASE_LABELS } from '../src/online/shared.js';
import {
  currentPlayerStats,
  playerPeriods,
  storedGame,
  gameSummary,
  statisticsContext,
} from './recordedViews.mjs';
import { recordForPlayer } from './recordedStats.mjs';
import { requireOnline } from '../src/online/shared.js';

const playerView = (p) => ({
  id: p.id,
  isActive: p.isActive !== false,
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
    ...(team.pitchingRotation?.pitcherRoles ||
    team.pitchingRotation?.closer ||
    team.pitchingRotation?.setupMen?.length ||
    team.pitchingRotation?.middleRelievers?.length
      ? {
          pitcherRoles: Object.fromEntries(
            team.players
              .filter((p) => p.position === 'pitcher' && p.isActive !== false)
              .map((p) => [
                p.id,
                roleFor(
                  team.pitchingRotation.pitcherRoles?.[p.id] ??
                    (team.pitchingRotation.closer === p.id
                      ? 'closer'
                      : team.pitchingRotation.setupMen?.includes(p.id)
                        ? 'setup'
                        : team.pitchingRotation.middleRelievers?.includes(p.id)
                          ? 'long'
                          : undefined),
                  team.pitchingRotation.starters?.includes(p.id),
                ),
              ]),
          ),
        }
      : {}),
    ...(team.onlineTactics ? { tactics: team.onlineTactics } : {}),
  };
}
export function projectLeague(bundle, userId, sessionId, adminId) {
  const l = bundle.league;
  if (!l) return { setupRequired: true, isAdmin: userId === adminId };
  const member = l.members.find((m) => m.userId === userId);
  // ⚠ **参加者でなくても「招待コードを入れる画面」までは返すこと**。
  //    ここで null（＝403）にすると、招待された人はログインした途端に
  //    締め出され、コードを入れる場所に辿り着けない（鶏と卵になる）。
  if (!member)
    return {
      joinRequired: true,
      isAdmin: userId === adminId,
      revision: l.revision,
      writable: !!sessionId && bundle.sessions[userId] === sessionId,
    };
  const team = l.game.teams[member.teamName];
  const statistics = statisticsContext(l);
  const phase = l.phase;
  return {
    revision: l.revision,
    status: l.status,
    error: l.error,
    teamName: member.teamName,
    year: l.season.year,
    teamNames: l.season.settings.teamNames,
    // ⚠ 一人用の編成画面が `LEAGUE_SETTINGS.useDH` を見るので、
    //    リーグの設定をビューにも載せる（打順が8枠か9枠かが変わる）
    useDH: !!l.season.settings.useDH,
    currentDate: l.season.currentDate,
    nextAdvanceAt: l.nextAdvanceAt,
    isAdmin: userId === adminId,
    writable: !!sessionId && bundle.sessions[userId] === sessionId,
    hasBackup: !!bundle.backup,
    // ⚠ 締め切りはビューに載せる。定期進行の判定（`isDue`）がこれを見て、
    //    フェーズ中（status が running でない）でも起動する必要がある
    phaseDeadline: l.phase?.deadline || null,
    // ⚠ **招待コードは管理者にだけ返す**。参加者全員に見せると、
    //    管理者を通さずに人を呼べてしまう（招待制の意味が無くなる）。
    invites:
      userId === adminId
        ? (l.invites || []).filter((i) => !i.usedBy).map((i) => i.code)
        : undefined,
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
      ...currentPlayerStats(l, member.teamName, p, statistics),
      detailAvailable: true,
    })),
    seasonYears: [
      ...new Set([
        l.season.year,
        ...Object.keys(l.records?.seasons || {}).map(Number),
        ...l.history.map((h) => h.year),
      ]),
    ].sort((a, b) => b - a),
    gameDetailsAvailable: true,
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

// 参加者向けに、確定済み名簿・今季成績・能力だけを公開する。
// 編成、次回先発、戦術、契約、未提出案や成長の内部値を含めない。
export function projectTeamInfo(bundle, userId, teamName) {
  const l = bundle.league;
  requireOnline(
    l?.members.some((m) => m.userId === userId),
    '参加者ではありません',
    403,
  );
  requireOnline(
    l.season.settings.teamNames.includes(teamName),
    '球団が見つかりません',
    404,
  );
  const statistics = statisticsContext(l);
  return {
    teamName,
    readOnly: true,
    year: l.season.year,
    roster: l.game.teams[teamName].players.map((p) => {
      const visible = playerView(p);
      delete visible.growthPotential;
      delete visible.growthModifier;
      return {
        ...visible,
        ...currentPlayerStats(l, teamName, p, statistics),
        publicOnly: true,
        publicSplits: recordForPlayer(l, p, teamName)?.splits || null,
        publicPartial: !!statistics.season && !statistics.season.complete,
        publicSource: statistics.season?.complete
          ? '対人リーグ（プレーオフ込み・グランドCS除外）'
          : '既存の今季記録（場面別は記録開始後）',
      };
    }),
  };
}

function ownedPlayer(bundle, userId, id) {
  const l = bundle.league,
    member = l?.members.find((m) => m.userId === userId);
  requireOnline(member, '参加者ではありません', 403);
  const player = l.game.teams[member.teamName].players.find(
    (p) => String(p.id) === String(id),
  );
  requireOnline(player, '選手が見つかりません', 404);
  return { l, member, player };
}
export function projectPlayerInfo(bundle, userId, id) {
  const { l, member, player } = ownedPlayer(bundle, userId, id);
  return {
    id: player.id,
    name: player.name,
    revision: l.revision,
    periods: playerPeriods(l, member.teamName, player),
  };
}
export function projectGames(
  bundle,
  userId,
  { year, page = 0, scope = 'own' } = {},
) {
  const l = bundle.league,
    member = l?.members.find((m) => m.userId === userId);
  requireOnline(member, '参加者ではありません', 403);
  year = Number(year || l.season.year);
  page = Number(page);
  requireOnline(
    Number.isSafeInteger(year) &&
      year > 0 &&
      Number.isSafeInteger(page) &&
      page >= 0 &&
      ['own', 'league'].includes(scope),
    '試合一覧の指定が不正です',
  );
  const games = new Map();
  if (year === l.season.year)
    for (const game of l.season.results)
      games.set(String(game.gameId), gameSummary(game));
  for (const game of Object.values(l.records?.seasons?.[year]?.games || {}))
    games.set(String(game.gameId), gameSummary(game));
  const all = [...games.values()]
    .filter(
      (g) =>
        scope === 'league' ||
        g.home === member.teamName ||
        g.away === member.teamName,
    )
    .sort(
      (a, b) =>
        b.date.month - a.date.month ||
        b.date.day - a.date.day ||
        b.gameId - a.gameId,
    );
  return {
    year,
    page,
    count: all.length,
    size: 6,
    games: all.slice(page * 6, page * 6 + 6),
  };
}
export function projectGameInfo(bundle, userId, id, year) {
  const l = bundle.league;
  requireOnline(
    l?.members.some((m) => m.userId === userId),
    '参加者ではありません',
    403,
  );
  requireOnline(
    Number.isSafeInteger(Number(id)) && Number(id) > 0,
    '試合の指定が不正です',
  );
  year = Number(year || l.season.year);
  requireOnline(Number.isSafeInteger(year) && year > 0, '年度の指定が不正です');
  const game = storedGame(l, id, year);
  requireOnline(game, '試合記録が見つかりません', 404);
  const result = structuredClone(game);
  if (result.replay?.appliedPlans) {
    const ownTeam = l.members.find((m) => m.userId === userId).teamName;
    result.replay.appliedPlan = result.replay.appliedPlans[ownTeam] || null;
    result.replay.appliedTeam = ownTeam;
    delete result.replay.appliedPlans;
  }
  return result;
}
