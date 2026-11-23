import { strategyMark } from '../src/online/strategyStats.js';
import { createHash } from 'node:crypto';
import {
  PA_KEYS,
  BATTING_KEYS,
  PITCHING_KEYS,
  CATCH_KEYS,
  zeroLine,
  addCounts,
  teamSplitsOf,
} from '../src/online/recordStats.js';

export const RECORD_VERSION = 1;
const clone = (value) => structuredClone(value);
export const keyFor = (team, player) =>
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
/**
 * 捕手の記録に1打席（または走者だけのアウト）を足す。
 * ⚠ 捕手の側にだけ持つ。投手から見た「捕手別」は `batteryFor` が引き直す。
 */
function catchAdd(record, pitcherKey, line) {
  const c = (record.catching ||= { all: zeroLine(CATCH_KEYS), pitchers: {} });
  addCounts(c.all, line, CATCH_KEYS);
  const { starts, ...rest } = line;
  void starts;
  addCounts((c.pitchers[pitcherKey] ||= zeroLine(CATCH_KEYS.filter((k) => k !== 'starts'))), rest, CATCH_KEYS);
}
import { createReplay } from './replayRecord.mjs';

/**
 * `replay`: 1球ごとの観戦記録を残すか。**既定は残さない**。
 *
 * ⚠ 実測で1試合218KBのうち182KB＝84%を占め、42球団3024試合では670MBとなり
 *    `JSON.stringify` の上限（約512MB）を超えて保存が成立しない。
 *    成績だけなら1試合30KB・1シーズン89MBで収まる。
 * ⚠ 観戦の画面そのものは残してある。球団数の少ないリーグで観戦したいときは
 *    `ONLINE_RECORD_REPLAY=1` で有効にする。容量は球団数と試合数に比例するので、
 *    有効にする前に上の数字で見積もること。
 */
export function createRecorder(league, teams, { replay: keepReplay = false } = {}) {
  const season = seasonFor(league);
  if (!completeCoverage(league, season)) season.complete = false;
  // IDは対人サーバーだけで付与。移籍・年度更新・退団プールへの複製でも引き継ぐ。
  for (const name of league.season.settings.teamNames)
    for (const player of teams[name].players)
      player.onlinePlayerId ||= keyFor(name, player);
  // ⚠ **記録の範囲は「公式日程の全試合」**。CPU同士も含む
  //    （`RECORDED_STATISTICS.md`「対人サーバーの公式日程で自動消化する試合」）。
  //    「対人」はオンライン版のサーバーという意味で、人間同士という意味ではない。
  //    相手球団・CPU球団の成績を閲覧する機能がこの記録に依存しているので、
  //    人間同士に絞ってはいけない（一度絞って通年検査に止められた）。
  return {
    begin(game) {
      const events = [];
      // ⚠ 観戦記録を残さないときは `start` / `replay` / `pitchDetail` を**渡さない**。
      //    `autoSimulation` 側は `observer?.replay` のように保護されているので、
      //    渡さなければ記録が飛ぶ。箱の `replay` は null になり、画面は
      //    「記録が無い試合」として扱う（元から旧試合のためにその経路がある）。
      const replay = keepReplay ? createReplay() : null;
      return {
        events,
        ...(replay
          ? {
              replayRecord: replay.value,
              start: replay.start,
              replay: replay.frame,
              pitchDetail: replay.pitchDetail,
            }
          : {}),
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
      // 先発マスク: その球団の最初の打席で受けた捕手
      const masked = new Set();
      const caught = (e, pitcherKey, line) => {
        if (e.catcherId === null || e.catcherId === undefined) return;
        const catcher = get(e.defense, e.catcherId);
        const first = !masked.has(e.defense);
        masked.add(e.defense);
        catchAdd(catcher.record, pitcherKey, first ? { ...line, starts: 1 } : line);
      };
      for (const e of observer.events) {
        if (e.runnerOnly) {
          const pitcher = get(e.defense, e.pitcherId),
            line = { outs: e.outs };
          caught(e, pitcher.record.key, line);
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
        const battery = {
          runs: e.runs,
          earnedRuns: e.earnedRuns,
          calls: e.calls,
          reads: e.reads,
        };
        if (!e.completed) {
          splitAdd(batter.record.splits.batting, 'all', extra);
          caught(e, pitcher.record.key, battery);
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
        caught(e, pitcher.record.key, { ...line, ...battery });
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
        replay: observer.replayRecord?.frames.length
          ? observer.replayRecord
          : null,
        pitcherChanges: clone(result.pitcherChanges || []),
        // 紙面の「逆転」「サヨナラ」「決勝打」に使う（数百バイト）。古い試合には無い
        lineScore: result.lineScore ? clone(result.lineScore) : null,
        walkOff: !!result.walkOff,
        winningHit: winningHitOf(observer.events, result),
        // 得点経過（点が動いた打席と、打席の外で入った点）。乱数は引かない（記録を読むだけ）
        scoring: scoringPlaysOf(observer.events, result),
        // その試合で敷いていた方針（球団ごとに標準と違うものだけ）。作戦別成績に使う（`strategyStats.js`）
        strategy: Object.fromEntries(
          [result.homeTeam, result.awayTeam].map((t) => [t.name, strategyMark(t.strategy)]),
        ),
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
          // ⚠ **「何号本塁打」はここでしか作れない**。この行を足した直後の通算が
          //    その試合までの本数で、あとから数えるには年の全試合を舐めることになる。
          //    打った選手にだけ置く（1試合に2本なら `通算-1号` と `通算号`）。
          //    古い記録には無いので、画面は番号なしで名前だけ出す
          // ⚠ 記録を途中から取り始めた年（`complete: false`）は置かない。記録の
          //    通算はその年の本当の本数より少なく、10号を「3号」と出してしまう
          const seasonHomeruns = season.complete && b.homeruns > 0
            ? record.stats.batting.homeruns
            : undefined;
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
            ...(seasonHomeruns === undefined ? {} : { seasonHomeruns }),
          });
        }
      }
      // 回ごとの攻撃（打席の順）。⚠ **`box.teams` を作った後**に作る（打者の番号が
      //    その並びの番号なので、空の一覧で作ると全部 null になる）
      box.plays = inningPlaysOf(observer.events, box, result);
      season.games[game.id] = box;
      delete season.archiveToken;
      // 球団ごとの成績（年度更新で作る）も作り直す
      delete season.teamSplits;
    },
  };
}
/**
 * 決勝打: 勝った側が**最後に勝ち越した打席**（そのあと一度も追いつかれていない）。
 * 打点が付いた打席だけ（暴投・失策での勝ち越しは入れない）。`hit` は安打だったか
 * （犠飛・押し出しは安打でない）。引き分けは null。
 * ⚠ 打席の前後の得点（`scoreBefore` / `scoreAfter`）が無い古い記録では null。
 */
export function winningHitOf(events, result) {
  if (!result?.winner) return null;
  const side = result.winner === result.homeTeam?.name ? 'home' : 'away';
  const other = side === 'home' ? 'away' : 'home';
  let hit = null,
    last = 0; // 前の打席が終わったときの点差（勝った側から見て）
  for (const e of events || []) {
    if (e.runnerOnly || !e.scoreBefore || !e.scoreAfter) continue;
    const before = e.scoreBefore[side] - e.scoreBefore[other];
    const after = e.scoreAfter[side] - e.scoreAfter[other];
    // 打席の外（暴投・盗塁など）でリードが動いたら、それまでの決勝打の候補は消える
    if ((last > 0) !== (before > 0)) hit = null;
    last = after;
    if (before > 0 && after <= 0) hit = null; // 追いつかれた・逆転された
    if (before <= 0 && after > 0)
      hit =
        e.offense === result.winner && (e.delta?.rbis || 0) > 0
          ? {
              team: e.offense,
              id: e.batterId,
              name: e.batterName,
              inning: e.inning,
              homerun: (e.delta?.homeruns || 0) > 0,
              hit: (e.delta?.hits || 0) > 0,
              rbis: e.delta.rbis,
            }
          : null;
  }
  return hit;
}
/** 得点経過を残す行の上限（大差の試合でも箱を膨らませない） */
export const SCORING_PLAYS_LIMIT = 30;

/**
 * 得点経過: 点が動いた打席（打った人・何点・その後の点）と、打席の外で入った点（暴投・盗塁など）。
 * 行は `{ inning, half: 'top'|'bottom', team, id, name, kind, runs, away, home }`。
 * `kind` は打席の結果（'homerun' / 'single' / 'double' / 'triple' / 'walk' / 'error' / 'out' など）、
 * 打席の外は 'other'（名前なし）。`away` / `home` はその行の後の点。
 * ⚠ 打席の前後の得点（`scoreBefore` / `scoreAfter`）が無い古い記録では空の配列。
 * ⚠ 練習試合（`exhibition.mjs`）も同じ関数で作る。
 */
export function scoringPlaysOf(events, result) {
  const homeName = result?.homeTeam?.name;
  const awayName = result?.awayTeam?.name;
  const plays = [];
  let last = { home: 0, away: 0 };
  let lastInning = 1;
  let lastHalf = 'top';
  const gap = (score, inning, half) => {
    // 打席の外で入った点。⚠ 次の打席が相手の攻撃なら、点はその前の半回に入っている
    for (const side of ['away', 'home']) {
      const runs = (score[side] || 0) - (last[side] || 0);
      if (runs <= 0) continue;
      const ownHalf = side === 'away' ? 'top' : 'bottom';
      const at = ownHalf === half ? inning : ownHalf === 'top' ? inning : Math.max(1, inning - 1);
      plays.push({
        inning: at,
        half: ownHalf,
        team: side === 'away' ? awayName : homeName,
        id: null,
        name: null,
        kind: 'other',
        runs,
        away: score.away,
        home: score.home,
      });
      last = { ...last, [side]: score[side] };
    }
  };
  for (const e of events || []) {
    if (e.runnerOnly || !e.scoreBefore || !e.scoreAfter) continue;
    const half = e.offense === homeName ? 'bottom' : 'top';
    gap(e.scoreBefore, e.inning, half);
    const side = half === 'top' ? 'away' : 'home';
    const runs = (e.scoreAfter[side] || 0) - (e.scoreBefore[side] || 0);
    if (runs > 0)
      plays.push({
        inning: e.inning,
        half,
        team: e.offense,
        id: e.batterId ?? null,
        name: e.batterName || null,
        kind: scoringKind(e),
        runs,
        away: e.scoreAfter.away,
        home: e.scoreAfter.home,
      });
    last = { home: e.scoreAfter.home, away: e.scoreAfter.away };
    lastInning = e.inning;
    lastHalf = half;
  }
  // 最後の打席の後に入った点（暴投でのサヨナラなど）
  if (events?.length && Number.isFinite(result?.homeScore) && Number.isFinite(result?.awayScore))
    gap({ home: result.homeScore, away: result.awayScore }, lastInning, lastHalf);
  return plays.slice(0, SCORING_PLAYS_LIMIT);
}

/** 回ごとの攻撃に残す打席の結果の記号。⚠ 画面（`src/online/gamePlays.js`）と同じ並び */
export const PLAY_CODES = ['本', '三', '二', '安', '四', '死', '振', '犠', '併', '失', '凡', '走', '刺'];

/** 打席1つの結果の記号。⚠ `scoringKind` と同じ読み方（打者の成績の増えた分から読む） */
function playCode(e) {
  const d = e.delta || {};
  if (d.homeruns > 0) return '本';
  if (d.triples > 0) return '三';
  if (d.doubles > 0) return '二';
  if (d.hits > 0) return '安';
  if (d.walks > 0) return '四';
  if (d.hitByPitch > 0) return '死';
  if (d.sacrificeBunts > 0) return '犠';
  if (d.strikeouts > 0) return '振';
  if (e.result?.type === 'double_play') return '併';
  if (e.result?.isError && !e.result?.hitWithError) return '失';
  return '凡';
}

/**
 * 回ごとの攻撃（打席の順）。スコアボードの回の数字を押すと、その半回をこの順で出す
 * （いしだ 2026-11-19「スコアをクリックすると、その回の攻撃を時系列で表示してほしい」）。
 *
 * 形は `{ '3t': [[打者の番号, 記号, 点, アウト, ...打席速報], ...], '3b': [...] }`。
 *   （打席速報の5つ目から9つ目は `liveFields`。打者の居ない行には無い）
 *   - 鍵は「回＋t（表）/b（裏）」
 *   - 打者の番号は `box.teams[攻撃側]` の**並び順の番号**（名前を2度持たないため。
 *     打席に立った選手は必ずこの一覧に居る）
 *   - 点はその打席で入った点（0なら0）。打席の外で入った点（暴投・盗塁など）は
 *     打者の番号が null で記号 '走'
 *   - アウトはその行で増えたアウトの数（試合の中の `e.outs` そのもの。振り逃げ・野選は0、
 *     併殺は2）。打者の居ない走者のアウト（盗塁死など）は打者の番号が null で記号 '刺'
 * ⚠ **半回の点の合計が、スコアボードのその回の数字と必ず一致すること**
 *    （`online-inning-plays-check` が全試合で確かめる）。打席の外の点を落とすとずれる。
 * ⚠ 2026-11-20 監査: アウトを打席の記号から数えていたので、盗塁死を数えず振り逃げ・野選を
 *    1つと数え、約7%の半回が「2死」で終わっていた。4つ目の要素を足した。
 *    **前からある試合の行は3要素**（画面は記号から数える古い読み方に戻る。`gamePlays.js`）。
 * ⚠ 2026-11-20 監査: 打席が終わらなかった打席（`completed === false`。典型はサヨナラの暴投、
 *    盗塁死で3アウト）の点を落としていた（`last` だけ進めて行を足さなかった）。
 * ⚠ 1試合あたり約1.9KB（打席70〜80。打席速報の5つ目からを含む）。箱は元から約28KBなので、増えるのは数%。
 */
export function inningPlaysOf(events, box, result) {
  const index = new Map(
    Object.entries(box?.teams || {}).map(([team, list]) => [
      team,
      new Map((list || []).map((p, i) => [p.id, i])),
    ]),
  );
  const out = {};
  const push = (inning, half, row) => {
    (out[`${inning}${half}`] ||= []).push(row);
  };
  let last = { home: 0, away: 0 };
  let lastInning = 1;
  let lastHalf = 't';
  for (const e of events || []) {
    const half = e.offense === box.home ? 'b' : 't';
    const side = half === 'b' ? 'home' : 'away';
    // 打席の前に入っていた点（暴投・盗塁・ボークなど。打者が居ない）
    if (e.scoreBefore) {
      const gap = (e.scoreBefore[side] || 0) - (last[side] || 0);
      if (gap > 0) push(e.inning, half, [null, '走', gap, 0]);
      last = { ...last, [side]: e.scoreBefore[side] || 0 };
    }
    const outs = Number(e.outs) || 0;
    const runs =
      e.scoreAfter && e.scoreBefore
        ? (e.scoreAfter[side] || 0) - (e.scoreBefore[side] || 0)
        : 0;
    if (e.runnerOnly) {
      // 盗塁死など、打席の途中の走者のアウト（点は後の打席の記録が持つ）
      if (outs > 0) push(e.inning, half, [null, '刺', 0, outs, ...basesField(e.endBases)]);
    } else if (e.completed !== false) {
      // ⚠ 打席の途中（最後の1球の前）に暴投・盗塁などで入った点は「走」の行に分ける。
      //    分けないと「三振 1点」のように打者の点として赤く出る（2026-11-20 監査）。
      //    `resultScore` が無い記録では分けない
      const mid = e.resultScore
        ? Math.max(0, Math.min(runs, (e.resultScore[side] || 0) - (e.scoreBefore?.[side] || 0)))
        : 0;
      // 塁はその点が入った後（最後の1球の前）
      if (mid > 0) push(e.inning, half, [null, '走', mid, 0, ...basesField(e.resultBases)]);
      const idx = index.get(e.offense)?.get(e.batterId);
      push(e.inning, half, [idx ?? null, playCode(e), runs - mid, outs, ...liveFields(e)]);
    } else if (runs > 0 || outs > 0) {
      // ⚠ 打席が終わらなかった打席（サヨナラの暴投・盗塁死の3アウトなど）。打者の行は
      //    足さないが、その間に入った点とアウトは落とさない
      push(e.inning, half, [null, runs > 0 ? '走' : '刺', runs, outs, ...basesField(e.endBases)]);
    }
    if (e.scoreAfter) last = { home: e.scoreAfter.home || 0, away: e.scoreAfter.away || 0 };
    lastInning = e.inning;
    lastHalf = half;
  }
  // 最後の打席の後に入った点（暴投でのサヨナラなど）
  const side = lastHalf === 'b' ? 'home' : 'away';
  const final = side === 'home' ? result?.homeScore : result?.awayScore;
  if (Number.isFinite(final) && final > (last[side] || 0))
    push(lastInning, lastHalf, [null, '走', final - last[side], 0]);
  return out;
}

/** 守備位置 → 番号（1 投手 … 9 ライト）。打席速報の行に置く */
const FIELDER_NUMBER = { pitcher: 1, catcher: 2, first: 3, second: 4, third: 5, short: 6, left: 7, center: 8, right: 9 };

/** 行の5つ目の塁（一塁＝1・二塁＝2・三塁＝4 の和）。記録が無ければ足さない */
const basesField = (bases) => (Number.isInteger(bases) ? [bases] : []);

/**
 * 打席速報（新しい見た目の試作。`src/online/look/playByPlay.js`）のための、行の5つ目から。
 *   [塁（打席の後）, 守備位置, 向き, 飛距離, 角度]
 * 打球の4つは前へ飛んだ打席だけ（四球・三振・バントは塁だけ）。向きは -45（三塁線）〜45（一塁線）の度、
 * 飛距離は m、角度は打ち出しの度（10 未満はゴロ）。どれも整数に丸める（1試合で約0.7KB）。
 * 打席の外の行（「走」「刺」）は塁だけ（その点・アウトの後）。
 * ⚠ 塁は**その行の後**。次の打席の行の塁から作ると、次の打席の途中の盗塁・暴投が前の打席の結果に
 *    混ざる（2026-11-23 レビュー）。
 * ⚠ 本塁打は処理した野手が居ないので、向きから外野の番号を当てる（`playByPlay.js` の `fieldOf` と同じ境目）。
 * ⚠ 塁の記録が無い打席（版20より前の記録の形の観測）は何も足さない。
 */
function liveFields(e) {
  if (!Number.isInteger(e.endBases)) return [];
  const b = e.result?.batted;
  if (!b || !Number.isFinite(b.direction)) return [e.endBases];
  const dir = Math.round(b.direction);
  const pos = FIELDER_NUMBER[b.fielder] || (dir < -11 ? 7 : dir > 11 ? 9 : 8);
  return [e.endBases, pos, dir, Math.round(b.distance || 0), Math.round(b.launchAngle || 0)];
}

/** 打席の結果の種類。⚠ 打者の成績の増えた分から読む（投球の結果の形は打席の種類で違う） */
function scoringKind(e) {
  const d = e.delta || {};
  if (d.homeruns > 0) return 'homerun';
  if (d.triples > 0) return 'triple';
  if (d.doubles > 0) return 'double';
  if (d.hits > 0) return 'single';
  if (d.walks > 0) return 'walk';
  if (d.hitByPitch > 0) return 'hit_by_pitch';
  if (e.result?.isError && !e.result?.hitWithError) return 'error';
  return 'out';
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
  // ⚠ 途中で球団を移った選手の球団ごとの成績。終わった年の試合の記録は別に保存して軽い読みで
  //    読まないので、球団史（`teamChronicle`）が試合の記録をなめなくて済むよう、ここで作っておく
  if (season && !season.teamSplits) season.teamSplits = teamSplitsOf(season);
  if (season && !season.archiveToken) {
    // ⚠ **全試合を1本の文字列にしないこと**。42球団3024試合では
    //    `JSON.stringify(season.games)` が文字列の上限を超えて落ちる
    //    （通年検査の200日目で RangeError: Invalid string length）。
    //    試合ごとに流し込めば同じ識別子が得られて上限にも当たらない。
    //    ⚠ 順序を固定すること（キー順）。順序が変わると内容が同じでも別物になる。
    const hash = createHash('sha256');
    for (const key of Object.keys(season.games).sort()) {
      hash.update(key);
      hash.update(JSON.stringify(season.games[key]));
    }
    season.archiveToken = hash.digest('hex');
  }
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
