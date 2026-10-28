import { createHash } from 'node:crypto';
import {
  PA_KEYS,
  BATTING_KEYS,
  PITCHING_KEYS,
  zeroLine,
  addCounts,
} from '../src/online/recordStats.js';

export const RECORD_VERSION = 1;
const clone = (value) => structuredClone(value);
const keyFor = (team, player) =>
  player.onlinePlayerId || `${team}:${player.id}:${player.name}`;
export function observedSeason(league) {
  return league.records?.seasons?.[league.season.year] || null;
}
export function completeCoverage(league, season) {
  return (
    !!season?.complete &&
    (season.year !== league.season.year ||
      league.season.results.every((game) =>
        Object.hasOwn(season.games, String(game.gameId)),
      ))
  );
}
function seasonFor(league) {
  league.records ||= { version: RECORD_VERSION, seasons: {} };
  return (league.records.seasons[league.season.year] ||= {
    year: league.season.year,
    league: 'shikoku',
    version: RECORD_VERSION,
    complete: league.season.results.length === 0,
    players: {},
    games: {},
    comparison: null,
  });
}
function playerRecord(season, team, player) {
  const key = keyFor(team, player);
  return (season.players[key] ||= {
    key,
    id: player.id,
    name: player.name,
    bats: player.batting?.bats || null,
    teams: [],
    stats: {
      batting: zeroLine(BATTING_KEYS),
      pitching: zeroLine(PITCHING_KEYS),
    },
    splits: { batting: {}, pitching: {} },
    games: [],
    starts: [],
  });
}
export function recordForPlayer(
  league,
  player,
  team,
  year = league.season.year,
) {
  return (
    league.records?.seasons?.[year]?.players?.[keyFor(team, player)] || null
  );
}
const splitAdd = (splits, key, line) =>
  addCounts((splits[key] ||= zeroLine()), line);
export function createRecorder(league, teams) {
  const season = seasonFor(league);
  if (!completeCoverage(league, season)) season.complete = false;
  // IDは対人サーバーだけで付与。移籍・年度更新・退団プールへの複製でも引き継ぐ。
  for (const name of league.season.settings.teamNames)
    for (const player of teams[name].players)
      player.onlinePlayerId ||= keyFor(name, player);
  return {
    begin(game) {
      const events = [];
      return {
        events,
        plateAppearance(event) {
          events.push(event);
        },
        runnerOut(event) {
          events.push({ ...event, runnerOnly: true });
        },
      };
    },
    finish(game, result, observer) {
      if (season.games[game.id])
        throw new Error('対人の試合記録を重複適用できません');
      const local = new Map();
      const starterStages = new Map();
      const get = (teamName, id) => {
        const player = teams[teamName].players.find((p) => p.id === id);
        if (!player) throw new Error('記録対象の選手が見つかりません');
        const record = playerRecord(season, teamName, player);
        if (!record.teams.includes(teamName)) record.teams.push(teamName);
        if (!local.has(record.key))
          local.set(record.key, {
            record,
            batting: zeroLine(),
            pitching: zeroLine(),
          });
        return local.get(record.key);
      };
      for (const e of observer.events) {
        if (e.runnerOnly) {
          const pitcher = get(e.defense, e.pitcherId),
            line = { outs: e.outs };
          splitAdd(pitcher.record.splits.pitching, 'all', line);
          splitAdd(
            pitcher.record.splits.pitching,
            e.risp ? 'risp' : 'emptyRisp',
            line,
          );
          if (e.starter) {
            const stage =
              e.inning <= 2 ? 'early' : e.inning <= 5 ? 'middle' : 'late';
            const stages = starterStages.get(pitcher.record.key) || {
              early: zeroLine(),
              middle: zeroLine(),
              late: zeroLine(),
            };
            starterStages.set(pitcher.record.key, stages);
            addCounts(stages[stage], line);
            splitAdd(pitcher.record.splits.pitching, stage, line);
          }
          continue;
        }
        const batter = get(e.offense, e.batterId),
          pitcher = get(e.defense, e.pitcherId);
        const extra = {
          buntAttempts: 0,
          buntSuccess: 0,
          safetyAttempts: 0,
          squeezeAttempts: 0,
        };
        if (
          e.bunt === 'sacrifice' &&
          ['bunt_fair', 'bunt_popup'].includes(e.buntOutcome)
        ) {
          extra.buntAttempts = 1;
          extra.buntSuccess =
            e.buntOutcome === 'bunt_fair' &&
            e.completed &&
            (e.delta.sacrificeBunts > 0 || e.delta.hits > 0)
              ? 1
              : 0;
        }
        if (e.bunt === 'safety') extra.safetyAttempts = 1;
        if (e.bunt === 'squeeze') extra.squeezeAttempts = 1;
        if (e.starter)
          starterStages.set(
            pitcher.record.key,
            starterStages.get(pitcher.record.key) || {
              early: zeroLine(),
              middle: zeroLine(),
              late: zeroLine(),
            },
          );
        if (!e.completed) {
          splitAdd(batter.record.splits.batting, 'all', extra);
          continue;
        }
        const line = addCounts(zeroLine(), e.delta);
        Object.assign(line, extra);
        // 元の自動試合では犠飛を打数に含めるため、観測集計の打数だけを補正する。
        if (e.result?.isOutfieldFly && e.delta.rbis > 0) {
          line.sacrificeFlies = 1;
          line.atBats--;
        }
        line.pa = 1;
        line.outs = e.outs || 0;
        line.fouls = e.fouls;
        line.twoStrikeFouls = e.twoStrikeFouls || 0;
        line.dpChances = e.dpPossible ? 1 : 0;
        line.doublePlays = e.result?.type === 'double_play' ? 1 : 0;
        addCounts(batter.batting, line);
        addCounts(pitcher.pitching, line);
        for (const [record, category] of [
          [batter.record, 'batting'],
          [pitcher.record, 'pitching'],
        ]) {
          splitAdd(record.splits[category], 'all', line);
          splitAdd(
            record.splits[category],
            e.risp ? 'risp' : 'emptyRisp',
            line,
          );
        }
        splitAdd(
          batter.record.splits.batting,
          e.throws === 'left' ? 'left' : 'right',
          line,
        );
        splitAdd(
          batter.record.splits.batting,
          e.pinchHit ? 'pinch' : 'normal',
          line,
        );
        if (e.twoStrikes)
          splitAdd(batter.record.splits.batting, 'twoStrikes', line);
        if (
          !e.bunt &&
          e.pitches === 1 &&
          [
            'single',
            'double',
            'triple',
            'homerun',
            'out',
            'double_play',
          ].includes(e.result?.type)
        )
          splitAdd(batter.record.splits.batting, 'firstPitch', line);
        if (e.starter) {
          const stage =
            e.inning <= 2 ? 'early' : e.inning <= 5 ? 'middle' : 'late';
          splitAdd(pitcher.record.splits.pitching, stage, line);
          addCounts(starterStages.get(pitcher.record.key)[stage], line);
        }
      }
      const box = {
        gameId: game.id,
        year: season.year,
        date: clone(game.date),
        home: game.home,
        away: game.away,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        decisions: clone(result.decisions),
        teams: {},
      };
      for (const team of [result.homeTeam, result.awayTeam]) {
        box.teams[team.name] = [];
        for (const p of team.players) {
          const gb = p.gameStats?.batting || {},
            gp = p.gameStats?.pitching || {},
            gf = p.gameStats?.fielding || {};
          const appeared =
            (gb.atBats ||
              gb.walks ||
              gb.hitByPitch ||
              gb.sacrificeBunts ||
              gp.pitches ||
              gp.outs ||
              p.battingOrder ||
              gb.stolenBases ||
              gb.caughtStealing) > 0;
          if (!appeared && !gf.chances) continue;
          const data = get(team.name, p.id),
            record = data.record;
          const b = addCounts(zeroLine(BATTING_KEYS), gb, BATTING_KEYS);
          b.games = data.batting.pa > 0 ? 1 : 0;
          b.atBats = data.batting.atBats;
          b.sacrificeFlies = data.batting.sacrificeFlies;
          b.plateAppearances = data.batting.pa;
          b.errors = gf.errors || 0;
          b.fieldingChances = gf.chances || 0;
          b.assists = gf.assists || 0;
          const q = addCounts(zeroLine(PITCHING_KEYS), gp, PITCHING_KEYS);
          q.inningsPitched = gp.outs || 0;
          q.games = (gp.pitches || gp.outs) > 0 ? 1 : 0;
          q.battersFaced = data.pitching.pa;
          q.gamesStarted = q.games && starterStages.has(record.key) ? 1 : 0;
          q.qualityStarts =
            q.gamesStarted && q.inningsPitched >= 18 && q.earnedRuns <= 3
              ? 1
              : 0;
          q.highQualityStarts =
            q.gamesStarted && q.inningsPitched >= 21 && q.earnedRuns <= 2
              ? 1
              : 0;
          const d = result.decisions;
          q.wins =
            result.winner === team.name && d?.winningPitcher?.id === p.id
              ? 1
              : 0;
          q.losses =
            result.winner &&
            result.winner !== team.name &&
            d?.losingPitcher?.id === p.id
              ? 1
              : 0;
          q.saves =
            result.winner === team.name && d?.savePitcher?.id === p.id ? 1 : 0;
          q.holds =
            result.winner === team.name &&
            d?.holdPitchers?.some((h) => h.id === p.id)
              ? 1
              : 0;
          addCounts(record.stats.batting, b, BATTING_KEYS);
          addCounts(record.stats.pitching, q, PITCHING_KEYS);
          record.games.push({
            gameId: game.id,
            atBats: b.atBats,
            hits: b.hits,
          });
          if (q.gamesStarted)
            record.starts.push({
              gameId: game.id,
              ...starterStages.get(record.key),
            });
          box.teams[team.name].push({
            id: p.id,
            key: record.key,
            name: p.name,
            position: p.position,
            battingOrder: p.battingOrder,
            batting: b,
            pitching: q,
          });
        }
      }
      season.games[game.id] = box;
      delete season.archiveToken;
    },
  };
}
export function recordedStats(record) {
  if (!record) return null;
  return {
    batting: { ...record.stats.batting, measured: true },
    pitching: { ...record.stats.pitching, measured: true },
  };
}
export function freezeComparison(league) {
  const season = observedSeason(league);
  if (season && !season.comparison)
    season.comparison = clone(comparisonForSeason(season));
  if (season && !season.archiveToken)
    season.archiveToken = createHash('sha256')
      .update(JSON.stringify(season.games))
      .digest('hex');
}
export function comparisonForSeason(season) {
  if (!season) return null;
  if (season.comparison) return season.comparison;
  const totals = {
    stats: {
      batting: zeroLine(BATTING_KEYS),
      pitching: zeroLine(PITCHING_KEYS),
    },
    splits: { batting: {}, pitching: {} },
    byBats: {},
  };
  for (const r of Object.values(season.players)) {
    if (r.bats) {
      const splits = (totals.byBats[r.bats] ||= {});
      for (const [key, line] of Object.entries(r.splits.batting))
        splitAdd(splits, key, line);
    }
    addCounts(totals.stats.batting, r.stats.batting, BATTING_KEYS);
    addCounts(totals.stats.pitching, r.stats.pitching, PITCHING_KEYS);
    for (const category of ['batting', 'pitching'])
      for (const [key, line] of Object.entries(r.splits[category]))
        splitAdd(totals.splits[category], key, line);
  }
  return totals;
}
