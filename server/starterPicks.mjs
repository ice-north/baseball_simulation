// ============================================================
// 予告先発（改善案 B1）。人の球団が、この先の試合の先発をローテの中から指名する。
//
//   - 指名・変更できるのは、試合の `STARTER_LOCK_TURNS` ターン前まで。そこから先は確定し、
//     相手にも「予告先発」として見える（確定の時刻は両軍同じなので、後出しの得は無い）。
//   - 確定する前の指名は本人にしか見えない。
//   - 試合の日に疲れていたら（`STARTER_SKIP_FATIGUE`）指名は使わず、いつもの決め方で投げる
//     （「回避」として本人に知らせる。`dailyLineup.prepareDailyLineup`）。
//   - 指名した投手が投げると、ローテはその投手の次から回る。飛ばした投手は後ろへずれる
//     （ただ得をする手にはしない）。
//   - CPU球団・投手起用を指導者に任せた人・おるすばん中の人は指名を使わない（今までどおりローテの順）。
//
// ⚠ 保存は `member.starterPicks`（試合の番号 → 選手id）。編成（`lineupSettings`）に入れないのは、
//    古い編成の保存で指名が巻き戻らないようにするため。年度更新で消す（日程の番号が変わる）。
// ⚠ **確定したときに見えていた先発を控える**（`member.lockedStarters`: 試合の番号 →
//    `{ id, name, picked }`。`lockStarters`）。人の球団だけ。指名が無ければローテの次の投手。
//    試合の日はその投手が投げる（名簿に居ない・登録を外れた・疲れているときだけいつもの決め方）。
//    以前は確定の後でもローテを並べ替える・指名した投手をローテから外す・おるすばんから戻る、で
//    投げる人が変わり、相手に見えた「予告先発」と違う投手が投げていた。CPU球団は今までどおり。
// ============================================================
import { requireOnline } from '../src/online/shared.js';
import { STARTER_LOCK_TURNS, STARTER_PICK_GAMES } from '../src/online/social.js';
import { effectiveStaffModes } from './coachEngine.mjs';
import { assertCanPlay } from './social.mjs';
import { starterSequence } from './leagueBoard.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const dayIndex = (d) => Math.round(Date.UTC(d.year, d.month - 1, d.day) / DAY_MS);
const dateKey = (d) => (d.year || 0) * 10000 + (d.month || 0) * 100 + (d.day || 0);

/**
 * 自球団の試合（消化済みも含む。日付順、同じ日は id 順）。相手の決まっていない試合（`TBD`）と
 * 日付の無い試合は除く。
 * ⚠ 通し番号（その球団の何試合目か）はこの並びの位置で数える。ホームの今後・直近の試合
 *    （`projection.ownUpcomingGames`・`ownRecentGames`）と予告先発がこの1つを使うので、
 *    数え方が画面ごとにずれない。
 */
export function ownGamesByDate(schedule, teamName) {
  return (schedule || [])
    .filter(
      (g) =>
        g.date &&
        g.home !== 'TBD' &&
        g.away !== 'TBD' &&
        (g.home === teamName || g.away === teamName),
    )
    .sort((a, b) => dateKey(a.date) - dateKey(b.date) || a.id - b.id);
}

/** 自球団のまだ終わっていない試合（近い順） */
export function ownOpenGames(schedule, teamName) {
  return ownGamesByDate(schedule, teamName).filter((g) => !g.result);
}

/**
 * 試合までのターン数（0＝次の進行で行う）。
 * ⚠ 1ターン＝1日。シーズン後は空の日をまとめて進めるので、実際のターン数はこれ以下になる
 *    （確定が早まる側にずれるだけで、遅れることは無い）
 */
export function turnsUntil(league, game) {
  return dayIndex(game.date) - dayIndex(league.season.currentDate);
}

/** 先発が確定しているか（指名を変えられない・相手に見える） */
export function starterLocked(league, game) {
  return turnsUntil(league, game) < STARTER_LOCK_TURNS;
}

/** この人がいま予告先発を使えるか（投手起用を任せていない・おるすばんでない） */
export function canPickStarters(league, member) {
  return !!member && !member.away && effectiveStaffModes(league, member).pitching !== 'delegate';
}

/** 球団の、いま効いている指名（使えない人なら null） */
export function activePicks(league, teamName) {
  const member = (league.members || []).find((m) => m.teamName === teamName);
  if (!member?.starterPicks || !canPickStarters(league, member)) return null;
  return member.starterPicks;
}

/**
 * 予告先発を指名する・外す（`starterPick` 命令）。
 * `playerId` が null なら外す（ローテの順に戻す）。
 * ⚠ 球団は保存した世界（`league.game.teams`）から読む。エンジンを使わない命令なので、
 *    `TEAMS_DATA` は古いまま
 */
export function setStarterPick(league, userId, { gameId, playerId } = {}) {
  const member = (league.members || []).find((m) => m.userId === userId);
  requireOnline(member, '参加者ではありません', 403);
  assertCanPlay(league, '予告先発を選べません');
  requireOnline(
    canPickStarters(league, member),
    '投手起用を指導者に任せている間は、予告先発を選べません',
    409,
  );
  const open = ownOpenGames(league.season.schedule, member.teamName);
  const game = open.slice(0, STARTER_PICK_GAMES).find((g) => g.id === Number(gameId));
  requireOnline(game, `先発を選べるのは、この先の${STARTER_PICK_GAMES}試合です`, 409);
  requireOnline(
    !starterLocked(league, game),
    `試合の${STARTER_LOCK_TURNS}ターン前を過ぎたので、先発は確定しています`,
    409,
  );
  const picks = { ...(member.starterPicks || {}) };
  if (playerId === null || playerId === undefined || playerId === '') delete picks[game.id];
  else {
    const team = league.game.teams[member.teamName];
    const id = Number(playerId);
    requireOnline(
      (team?.pitchingRotation?.starters || []).includes(id),
      '先発ローテの投手から選んでください',
    );
    requireOnline(
      team.players.some((p) => p.id === id && p.isActive !== false),
      'その投手は登録を外れています',
      409,
    );
    picks[game.id] = id;
  }
  // 終わった試合の指名を掃除する
  const openIds = new Set(open.map((g) => String(g.id)));
  for (const key of Object.keys(picks)) if (!openIds.has(key)) delete picks[key];
  if (Object.keys(picks).length) member.starterPicks = picks;
  else delete member.starterPicks;
  return { gameId: game.id, playerId: picks[game.id] ?? null };
}

/** 試合の日に当てる指名（無ければ null） */
export function pickFor(league, teamName, gameId) {
  return activePicks(league, teamName)?.[gameId] ?? null;
}

/** 終わった試合の指名と、確定した先発の控えを消す（試合の日の後に呼ぶ） */
export function clearPlayedPicks(league) {
  for (const member of league.members || []) {
    if (!member.starterPicks && !member.lockedStarters) continue;
    const open = new Set(
      ownOpenGames(league.season.schedule, member.teamName).map((g) => String(g.id)),
    );
    for (const field of ['starterPicks', 'lockedStarters']) {
      if (!member[field]) continue;
      for (const key of Object.keys(member[field])) if (!open.has(key)) delete member[field][key];
      if (!Object.keys(member[field]).length) delete member[field];
    }
  }
}

/** 確定したときに控えた先発（`{ id, name, picked }`。無ければ null） */
export function lockedStarterFor(league, teamName, gameId) {
  const member = (league.members || []).find((m) => m.teamName === teamName);
  return member?.lockedStarters?.[gameId] ?? null;
}

/**
 * 先発予定の重ね方（`leagueBoard.withStarters`）。`ownTeam` の目から見る。
 * ⚠ 投影と確定の控え（`lockStarters`）の両方がこれを使う（見えている先発と、控える先発を同じにする）
 */
export function starterContext(league, ownTeam) {
  return {
    ownTeam,
    picksOf: (name) => activePicks(league, name),
    lockedOf: (game) => !!game.date && starterLocked(league, game),
    lockOf: (name, game) => lockedStarterFor(league, name, game.id),
  };
}

/**
 * 確定の時刻を過ぎた試合の先発を控える（人の球団だけ。進行の1日の前後に呼ぶ）。
 * 控えるのは**その時に見えている先発**（指名、無ければローテの次の投手）。一度控えたら変えない
 * （確定の後のローテの並べ替え・おるすばんの出入りで変わらない）。
 * ⚠ `teams` は呼ぶ側が渡す（エンジンの中の `TEAMS_DATA`）
 */
export function lockStarters(league, teams) {
  for (const member of league.members || []) {
    if (!teams[member.teamName]) continue;
    const locked = ownOpenGames(league.season.schedule, member.teamName).filter((g) =>
      starterLocked(league, g),
    );
    if (locked.every((g) => member.lockedStarters?.[g.id])) continue;
    const sequence = starterSequence(locked, teams, starterContext(league, member.teamName));
    locked.forEach((game, i) => {
      if (member.lockedStarters?.[game.id]) return;
      const own = game.home === member.teamName ? sequence[i].home : sequence[i].away;
      if (!own.player) return;
      (member.lockedStarters ||= {})[game.id] = {
        id: own.player.id,
        name: own.player.name,
        ...(own.mark ? { picked: true } : {}),
      };
    });
  }
}

/**
 * 名簿に居なくなった投手（トレード・退団）の指名を消す（`refreshTeamPlan` から。名簿が変わったとき）。
 * ⚠ 残すと、指名した画面に居ない投手の名前が出たまま、試合の日に黙って外れる
 */
export function pruneDepartedPicks(league, teamName, team) {
  const member = (league.members || []).find((m) => m.teamName === teamName);
  if (!member?.starterPicks || !team) return;
  const ids = new Set((team.players || []).map((p) => p.id));
  for (const [key, id] of Object.entries(member.starterPicks)) if (!ids.has(id)) delete member.starterPicks[key];
  if (!Object.keys(member.starterPicks).length) delete member.starterPicks;
}

const AVOIDED_REASONS = {
  tired: '疲れが残っていた',
  left: 'チームを離れた',
  inactive: '登録を外れていた',
  rotation: '先発ローテから外れていた',
};

/** 指名を使えなかったときのお知らせの文（`prepareDailyLineup` の `report.reason`） */
export function starterAvoidedText(reason, name, foe) {
  const known = AVOIDED_REASONS[reason] ? reason : 'tired';
  return known === 'tired'
    ? `予告先発の${name}は${AVOIDED_REASONS.tired}ため、${foe}戦の先発を回避しました`
    : `予告先発の${name}は${AVOIDED_REASONS[known]}ため、${foe}戦はローテの順で先発を立てました`;
}
