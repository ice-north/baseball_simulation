import {
  BATTING_KEYS,
  PITCHING_KEYS,
  zeroLine,
  addCounts,
  PA_KEYS,
} from '../src/online/recordStats.js';
import {
  battingMetrics,
  pitchingMetrics,
  performanceFor,
  leagueComparison,
} from './performanceLabels.mjs';
import {
  recordedStats,
  recordForPlayer,
  comparisonForSeason,
  observedSeason,
  completeCoverage,
} from './recordedStats.mjs';
import { situationalCandidates } from './situationalLabels.mjs';
const clone = (value) => structuredClone(value);
export const emptyStats = () => ({
  batting: { ...zeroLine(BATTING_KEYS), measured: true },
  pitching: { ...zeroLine(PITCHING_KEYS), measured: true },
});
const basicComparison = (comparison) =>
  comparison
    ? {
        batting: battingMetrics(comparison.stats.batting),
        pitching: pitchingMetrics(comparison.stats.pitching),
      }
    : null;
export function statisticsContext(league) {
  const rawSeason = observedSeason(league),
    season = rawSeason
      ? { ...rawSeason, complete: completeCoverage(league, rawSeason) }
      : null,
    comparison = comparisonForSeason(season);
  return {
    season,
    comparison,
    baseline: season?.complete
      ? basicComparison(comparison)
      : leagueComparison(league),
  };
}
/**
 * 今季の成績だけ。順位表のチーム成績やベスト5のように、ラベル（`performance`）が
 * 要らないところで使う。
 * ⚠ `currentPlayerStats` は場面別の候補まで計算するので、12球団×24人に
 *    使うと、投影のたびに要らない計算を288人ぶん回すことになっていた。
 */
export function currentSeasonStats(
  league,
  team,
  player,
  context = statisticsContext(league),
) {
  return context.season?.complete
    ? recordedStats(recordForPlayer(league, player, team)) || emptyStats()
    : player.seasonStats;
}
export function currentPlayerStats(
  league,
  team,
  player,
  context = statisticsContext(league),
) {
  const { season, comparison, baseline } = context,
    record = recordForPlayer(league, player, team);
  const stats = season?.complete
    ? recordedStats(record) || emptyStats()
    : player.seasonStats;
  const recent = recentForm(record);
  return {
    seasonStats: stats,
    performance: performanceFor(
      { ...player, seasonStats: stats },
      baseline,
      situationalCandidates(record, comparison),
    ),
    ...(recent ? { recent } : {}),
  };
}
/** 紙面の「最近好調」で見る試合数 */
export const RECENT_GAMES = 5;
/**
 * 打者の最近の調子（紙面の「最近好調」「連続試合安打」）。今季の記録の試合から数える。
 * - `games` / `atBats` / `hits` … 打数のあった直近 RECENT_GAMES 試合の合計
 * - `hitStreak` … 連続試合安打（打数0の試合＝四球だけ等は数えず、途切れもしない）
 * ⚠ 記録（`record.games`）は試合を終えた順に積まれている。打数が1つも無ければ null
 */
export function recentForm(record) {
  const games = (record?.games || []).filter((g) => g.atBats > 0);
  if (!games.length) return null;
  const last = games.slice(-RECENT_GAMES);
  let hitStreak = 0;
  for (let i = games.length - 1; i >= 0 && games[i].hits > 0; i--) hitStreak++;
  return {
    games: last.length,
    atBats: last.reduce((sum, g) => sum + g.atBats, 0),
    hits: last.reduce((sum, g) => sum + g.hits, 0),
    hitStreak,
  };
}
const combinedRecord = () => ({
  stats: emptyStats(),
  splits: { batting: {}, pitching: {} },
  games: [],
  starts: [],
});
function mergeRecord(target, record) {
  addCounts(target.stats.batting, record.stats.batting, BATTING_KEYS);
  addCounts(target.stats.pitching, record.stats.pitching, PITCHING_KEYS);
  for (const c of ['batting', 'pitching'])
    for (const [key, line] of Object.entries(record.splits[c]))
      addCounts((target.splits[c][key] ||= zeroLine()), line);
  target.games.push(...record.games);
  target.starts.push(...record.starts);
}
// 各年度・リーグの比較値を、その選手の対応する出場量で重み付けする。
function careerComparison(entries) {
  const result = { batting: {}, pitching: {} };
  for (const [category, fields] of Object.entries({
    batting: {
      avg: 'atBats',
      iso: 'atBats',
      hrRate: 'plateAppearances',
      bbRate: 'plateAppearances',
      kRate: 'plateAppearances',
      obp: 'plateAppearances',
    },
    pitching: {
      k9: 'inningsPitched',
      bb9: 'inningsPitched',
      hr9: 'inningsPitched',
    },
  })) {
    for (const [metric, weightKey] of Object.entries(fields)) {
      let sum = 0,
        total = 0,
        missing = false;
      for (const { record, comparison } of entries) {
        const weight = record.stats[category][weightKey];
        if (!weight) continue;
        const value = basicComparison(comparison)?.[category]?.[metric];
        if (value === null || value === undefined) {
          missing = true;
          break;
        }
        sum += value * weight;
        total += weight;
      }
      result[category][metric] = !missing && total > 0 ? sum / total : null;
    }
  }
  result.batting.pa = entries.reduce(
    (n, e) => n + e.record.stats.batting.plateAppearances,
    0,
  );
  result.pitching.outs = entries.reduce(
    (n, e) => n + e.record.stats.pitching.inningsPitched,
    0,
  );
  return result;
}
function weightedSituations(entries) {
  const combined = combinedRecord();
  for (const { record, comparison } of entries) {
    if (!comparison) return null;
    for (const category of ['batting', 'pitching'])
      for (const [key, own] of Object.entries(record.splits[category])) {
        if (!own.pa) continue;
        const baseline =
          category === 'batting' && ['left', 'right'].includes(key)
            ? comparison.byBats?.[record.bats]
            : comparison.splits[category];
        const mean = baseline?.[key];
        if (!mean?.pa) {
          if (category === 'batting' && ['left', 'right'].includes(key)) {
            combined.missingHand = true;
            continue;
          }
          return null;
        }
        const scale = own.pa / mean.pa;
        const weighted = Object.fromEntries(
          PA_KEYS.map((field) => [field, (mean[field] || 0) * scale]),
        );
        addCounts((combined.splits[category][key] ||= zeroLine()), weighted);
      }
  }
  if (!combined.missingHand)
    combined.byBats = { weighted: combined.splits.batting };
  return combined;
}
export function playerPeriods(
  league,
  team,
  player,
  context = statisticsContext(league),
) {
  // ⚠ 文脈（全試合をなめて作る）は**1回だけ**作る。以前は1人ごとに2回作っていて、
  //    保存のたびの記録の索引（参加者×24人）で何百回もなめていた
  const current = currentPlayerStats(league, team, player, context);
  const currentRecord = recordForPlayer(league, player, team);
  const currentSeason = context.season;
  const periods = [
    {
      id: 'current',
      label: '今季',
      year: league.season.year,
      source: currentSeason?.complete
        ? '対人リーグ（プレーオフ込み・グランドCS除外）'
        : '今季の成績（記録を取り始める前を含む・グランドCS込み）',
      ...current,
      splits: currentRecord?.splits || null,
      partial: !!currentSeason && !currentSeason.complete,
    },
  ];
  const entries = [];
  for (const season of Object.values(league.records?.seasons || {}).sort(
    (a, b) => b.year - a.year,
  )) {
    const record = recordForPlayer(league, player, team, season.year);
    if (!record) continue;
    const comparison = comparisonForSeason(season);
    entries.push({
      record,
      comparison,
      complete: completeCoverage(league, season),
    });
    if (season.year === league.season.year) continue;
    const stats = recordedStats(record);
    periods.push({
      id: `online:${season.year}`,
      label: `${season.year}年・対人`,
      year: season.year,
      source: '対人リーグ（プレーオフ込み・グランドCS除外）',
      partial: !season.complete,
      seasonStats: stats,
      splits: record.splits,
      performance: performanceFor(
        { seasonStats: stats },
        basicComparison(comparison),
        situationalCandidates(record, comparison),
      ),
    });
  }
  if (entries.length) {
    const career = combinedRecord();
    for (const e of entries) mergeRecord(career, e.record);
    const stats = recordedStats(career);
    periods.splice(1, 0, {
      id: 'career',
      label: '対人通算',
      source: '記録開始後の対人リーグ（グランドCS除外）',
      partial: entries.some((e) => !e.complete),
      // ⚠ **何シーズンぶんか**。通算成績の一覧がこれを出す。別に数え直すと、
      //    期間の作り方を変えたときに片方だけずれる
      years: entries.length,
      seasonStats: stats,
      splits: career.splits,
      performance: performanceFor(
        { seasonStats: stats },
        careerComparison(entries),
        situationalCandidates(
          { ...career, bats: 'weighted' },
          weightedSituations(entries),
        ),
      ),
    });
  }
  const history = player.statsHistory || [];
  for (const h of [...history].reverse()) {
    if (
      h.year === league.season.year ||
      (league.records?.seasons?.[h.year]?.complete &&
        recordForPlayer(league, player, team, h.year) &&
        !league.records.seasons[h.year].grandChampionshipExcluded)
    )
      continue;
    const stats = { batting: h.batting || {}, pitching: h.pitching || {} };
    periods.push({
      id: `legacy:${h.year}`,
      label: `${h.year}年（参考）`,
      year: h.year,
      source: '記録を取り始める前の成績（グランドCS込み・リーグ平均との比較なし）',
      seasonStats: stats,
      splits: null,
      performance: performanceFor({ seasonStats: stats }, null),
    });
  }
  if (player.careerStats) {
    const stats = {
      batting: { ...player.careerStats.batting },
      pitching: { ...player.careerStats.pitching },
    };
    for (const [category, keys] of [
      ['batting', BATTING_KEYS],
      ['pitching', PITCHING_KEYS],
    ])
      for (const key of keys) {
        // 旧通算に欠ける死球・盗塁死・犠打等は、全年度に実値がある場合のみ履歴から復元。
        if (
          !Number.isFinite(stats[category][key]) &&
          history.length &&
          history.every((h) => Number.isFinite(h[category]?.[key]))
        )
          stats[category][key] = history.reduce(
            (n, h) => n + h[category][key],
            0,
          );
        if (
          player.seasonFinalizedYear !== league.season.year &&
          Number.isFinite(stats[category][key]) &&
          Number.isFinite(player.seasonStats?.[category]?.[key])
        )
          stats[category][key] += player.seasonStats[category][key];
      }
    periods.push({
      id: 'legacy-career',
      label: '通算（参考）',
      source: '記録を取り始める前を含む通算（今季込み・部の区別なし・リーグ平均との比較なし）',
      seasonStats: stats,
      splits: null,
      performance: performanceFor({ seasonStats: stats }, null),
    });
  }
  return clone(periods);
}
/**
 * 勝ち・負け・セーブ・ホールドの投手を、id と名前だけにする。
 * ⚠ 試合の記録には投手の選手まるごと（能力・成績・経歴まで）が入っており、試合1つで約4KBあった。
 *    画面が使うのは名前だけなので、渡すとき（一覧・詳細・索引）に削る。記録そのものは変えない
 */
const pitcherRef = (p) =>
  p && typeof p === 'object' ? { id: p.id ?? null, name: p.name ?? null } : p;
export function decisionRefs(decisions) {
  if (!decisions || typeof decisions !== 'object') return decisions;
  return Object.fromEntries(
    Object.entries(decisions).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map(pitcherRef) : pitcherRef(value),
    ]),
  );
}
/** 画面へ渡す試合（勝敗投手を削る）。記録の本体は変えずに写しを返す */
export function slimGame(game) {
  return game?.decisions ? { ...game, decisions: decisionRefs(game.decisions) } : game;
}
export function gameSummary(game) {
  return {
    gameId: game.gameId,
    date: game.date,
    home: game.home,
    away: game.away,
    homeScore: game.homeScore ?? game.result?.homeScore,
    awayScore: game.awayScore ?? game.result?.awayScore,
    decisions: decisionRefs(game.decisions || game.result?.decisions),
  };
}
export function storedGame(league, id, year) {
  const recorded = league.records?.seasons?.[year]?.games?.[id];
  if (recorded) return recorded;
  if (Number(year) !== league.season.year) return null;
  const game = league.season.results.find(
    (g) => String(g.gameId) === String(id),
  );
  if (!game?.result?.homeTeam)
    return game ? { ...gameSummary(game), teams: null } : null;
  const teams = {};
  for (const team of [game.result.homeTeam, game.result.awayTeam])
    teams[team.name] = (team.players || [])
      .filter(
        (p) =>
          p.gameStats &&
          (p.gameStats.batting?.atBats ||
            p.gameStats.batting?.walks ||
            p.gameStats.batting?.hitByPitch ||
            p.gameStats.batting?.sacrificeBunts ||
            p.gameStats.pitching?.pitches ||
            p.battingOrder),
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        battingOrder: p.battingOrder,
        batting: { ...p.gameStats.batting },
        pitching: {
          ...p.gameStats.pitching,
          inningsPitched: p.gameStats.pitching?.outs,
        },
      }));
  return { ...gameSummary(game), teams, legacy: true };
}
