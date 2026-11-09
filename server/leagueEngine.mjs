import './engine-bootstrap.mjs';
import { schedulePlayoffReplay, PLAYOFF_REPLAY } from './playoffReplay.mjs';
import {
  TEAMS_DATA,
  LEAGUE_SETTINGS,
  initializeTeamsForCount,
  initializeAllPitchingRotations,
  releasedPlayersPool,
} from '../src/teams-data.js';
import { WORLD_DATA } from '../src/corporate/worldData.js';
import { INDEPENDENT_LEAGUES } from '../src/corporate/independentLeagueData.js';
import {
  initializeParallelWorldForIndependent,
  ensureUserIndependentLeagueTagged,
  applyIndependentRank,
  getLeagueRankFromTeams,
  updateAllTeamReputations,
} from '../src/corporate/corporateInit.js';
import {
  createSeasonData,
  initializeStandings,
  SEASON_PHASES,
  getNPBDraftDay,
  getPlayoffChampion,
} from '../src/season/seasonManager.js';
import {
  generateFullSeasonSchedule,
  getScheduleByDate,
} from '../src/season/scheduleGenerator.js';
import {
  progressDate,
  handlePhaseTransition,
} from '../src/season/dateProgression.js';
import {
  generateTryoutCandidates,
  generateSnakeDraftOrder,
  selectPlayerForAI,
  updateReleasedPoolAfterTryout,
  removeDraftedFromClubTeams,
} from '../src/season/tryoutSystem.js';
import { removeDraftedFromGraduatePools } from '../src/season/universityPool.js';
import {
  generateAprilHighSchoolClass,
  processSeasonEnd,
  snapshotRankings,
  advanceToNextYear,
  finalizePlayerSeason,
  cleanupPlayerReferences,
} from '../src/season/yearProgressionSystem.js';
import { simulateKoshien } from '../src/season/koshien.js';
import {
  simulateParallelWorldDate,
  generateGrandChampionship,
  autoPlayGrandChampionship,
} from '../src/corporate/parallelWorldManager.js';
import {
  generateBackgroundTournaments,
  advanceBackgroundTournaments,
} from '../src/game/backgroundProgression.js';
import { generatePitchingRotation } from '../src/game/lineupGenerator.js';
import { setRecommendedLineup } from '../src/game/autoSimulation.js';
import { ensureCompleteLineup } from '../src/game/lineup.js';
import { prepareDailyLineup, benchTwoWayStarter } from './dailyLineup.mjs';
import { initializeAllPlayersCondition } from '../src/game/condition.js';
import { simulateScheduledGamesOnDate } from '../src/game/daySimulation.js';
import { hashSeed, withSeededRandom } from '../src/game/rng.js';
import {
  assignTeamControllers,
  humanTeamNames,
} from '../src/game/teamControl.js';
import { getAIReleaseCandidates } from '../src/game/contractRules.js';
import {
  executeTeamCampTraining,
  executeSubTraining,
  applyMotivationEffect,
  applyBatteryMentalEffect,
  menuFitsPlayer,
  subMenuFitsPlayer,
  SUB_TRAINING_MENUS,
} from '../src/season/campTraining.js';
import {
  moodMultiplier,
  resolveTraining,
  playerPolicy,
  CAMP_POLICY_MODES,
} from '../src/season/trainingPolicy.js';
import {
  getTeamStaffBonus,
  setStaffIdCounter,
  setStaffNameHistory,
} from '../src/corporate/staffData.js';
import { addToReleasedPool } from '../src/state/pools.js';
import {
  assertTradeAllowed,
  canRespond,
  canCounter,
  cpuTradeDecision,
  rosterShortfall,
  MAX_OPEN_TRADES,
} from '../src/online/trades.js';
import { draftAbilityScore } from '../src/season/yearProgressionSystem.js';
import { deviationValue } from '../src/game/playerValue.js';
import { setPlayerIdCounter } from '../src/state/playerIds.js';
import { captureWorld, restoreWorld } from './worldSnapshot.mjs';
import { createRecorder, freezeComparison } from './recordedStats.mjs';
import {
  ONLINE_SCHEMA,
  ONLINE_ENGINE_VERSION,
  assertLeagueVersion,
  nextProgressionAt,
  phaseDeadlineAt,
  seasonStartAt,
  requireOnline,
  CAMP_MENUS,
  CAMP_SUB_MENUS,
  CAMP_DIRECTIONS,
  CAMP_PHASES,
  CAMP_ROUNDS,
  ROSTER_LIMIT,
  ONLINE_ROSTER_TARGETS,
  CONVERT_POSITIONS,
} from '../src/online/shared.js';
import {
  generatePyramidTeams,
  pyramidSeasonSchedule,
  applyPyramidMovements,
  topTierTeamNames,
  PYRAMID_TEAM_COUNT,
  SEASON_TURNS,
  gamesPerTeam,
} from '../src/online/pyramidLeague.js';
import {
  assertMemberCount,
  assignmentOrder,
} from '../src/online/membership.js';
import { nextFromPlan } from '../src/online/tryoutPlan.js';
import { generateRosterPacks, packsForMember } from '../src/online/rosterPack.js';
import { abilitySnapshot, abilityGains, addCampGains } from '../src/online/campGains.js';

export const ENGINE_VERSION = ONLINE_ENGINE_VERSION;
export { CAMP_MENUS, CAMP_SUB_MENUS, CAMP_DIRECTIONS, CAMP_PHASES, CAMP_ROUNDS };
const clone = (value) => JSON.parse(JSON.stringify(value));
const quiet = (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
};
const seeded = (league, key, fn) =>
  quiet(() =>
    withSeededRandom(
      hashSeed(`${league.seed}:${league.season.year}:${key}`),
      fn,
    ),
  );

// ⚠ **`generateFullSeasonSchedule` は使えない**。`leagueFormat` が
//    `'single'` か `'two'` の2通りしか対応しておらず、7リーグを組めない
//    （実装を読んで確認した）。階層リーグの日程は `pyramidSeasonSchedule`
//    （1ターン＝1日＝全球団が1試合）で組む。
// ⚠ 順位表は**平たい配列のまま**でよい。更新は球団名で行われるので、
//    リーグ分けは表示と昇降格のときだけ見ればよい。
function createSchedule(season, teams) {
  // ⚠ **渡し忘れを黙って通さない**。以前は undefined が渡ると
  //    `pyramidSchedule` の中で「undefined の filter」で落ち、
  //    どこの呼び出しが悪いのか分からなかった。
  requireOnline(
    Array.isArray(teams) && teams.length > 0,
    '日程を組むには球団表が必要です',
  );
  season.schedule = pyramidSeasonSchedule(teams, {
    year: season.currentDate.year,
  });
  season.standings = initializeStandings(season.settings.teamNames);
  // ⚠ **ターン数と試合数は、日程を組んだときに書き留めること**。進行中の
  //    シーズンは組んだ日程のまま終わるので、`SEASON_TURNS` を変えた直後に
  //    画面が「第121ターン / 160」のような、日程に無い数を出してしまう。
  //    書き留めておけば、古いリーグは120のまま最後まで、次の年から160になる。
  season.settings.seasonTurns = SEASON_TURNS;
  season.settings.gamesPerSeason = gamesPerTeam();
}

/**
 * 途中参加した人に見せるセットのid。**検査用ではなく命令の検証に使う**。
 * ⚠ セットは保存していない（種から作り直す）ので、選択が正しいかは
 *    ここで作り直して確かめるしかない。
 */
export function packIdsFor(member) {
  return packsForMember(member).map((p) => p.id);
}

/**
 * 途中参加して、まだセットが名簿に入っていない人か。
 * その球団は次のキャンプまでCPUが動かし、名簿はキャンプでセットに入れ替わる。
 */
const hasPendingPack = (league, teamName) =>
  (league.members || []).some((m) => m.teamName === teamName && m.packSeed);

/**
 * 途中参加した人が選んだセットを、名簿に入れる。**キャンプのときだけ**呼ぶ。
 *
 * ⚠ シーズン途中で入れ替えないこと。順位表と選手成績が合わなくなる。
 *    キャンプは新シーズンの直前なので、ここで入れ替えれば勝敗は0から始まる。
 * ⚠ 選ばなかった人（締め切りまでに決めなかった人）には**標準で1つ目**を渡す。
 *    空のまま開幕させない。
 * ⚠ 入れ替えで消える24人は、引き継いだCPU球団の選手。プールへは戻さない
 *    （戻すと翌年のトライアウトに同じ顔ぶれが並ぶ）。
 */
function applyPendingPacks(league) {
  for (const member of league.members || []) {
    if (!member.packSeed) continue;
    // 名簿には複製を入れる（`clone`）ので、使い回しの値を読むだけでよい
    const packs = packsForMember(member);
    const pack =
      packs.find((p) => p.id === member.pendingPackId) || packs[0];
    const team = TEAMS_DATA[member.teamName];
    if (!team) continue;
    team.players = clone(pack.players);
    for (const player of team.players)
      player.careerHistory = [
        ...(player.careerHistory || []),
        { type: 'independent', year: league.season.year, label: member.teamName },
      ];
    refreshTeamPlan(league, member.teamName);
    delete member.packSeed;
    delete member.packStyle;
    delete member.pendingPackId;
  }
}

/**
 * 育成方針（やる気に効く）。⚠ 受け取れない値は標準へ倒す。
 *    画面の値をそのまま信じると、知らない方針で `moodMultiplier` が
 *    「全部不一致」になり、全員のやる気が下がる。
 */
export function normalizeCampPolicy(policy) {
  const direction = CAMP_DIRECTIONS.includes(policy?.direction)
    ? policy.direction
    : 'balanced';
  const phase = CAMP_PHASES.includes(policy?.phase) ? policy.phase : 'skill';
  // ⚠ 決め方（おすすめ・希望どおり・全員同じ）。**無ければ全員同じ**として
  //    扱う（前の版の画面・保存した指示・CPU球団はこれまでどおり）
  const mode = CAMP_POLICY_MODES.includes(policy?.mode) ? policy.mode : 'team';
  return { mode, direction, phase };
}

/**
 * 自分で回していない球団に締め切りで当てるキャンプの指示（提出した案、無ければ既定）。
 * ⚠ **何も実行・提出しなかった人は「おすすめ」**（画面の既定と同じ）。
 *    既定を全員同じ方針のままにすると、画面ではおすすめと出ているのに
 *    締め切りで「全体を伸ばす×技術」が回り、希望の違う選手の身が入らない。
 *    CPU球団（`member` なし）はこれまでどおり（決め方なし＝全員同じ方針）
 */
export function campFallbackPlan(member, plan) {
  return {
    policy: plan?.policy || (member ? { mode: 'recommended' } : undefined),
    players: plan?.players,
    main: plan?.assignments,
    sub: plan?.subAssignments,
  };
}

/**
 * 選手ごとの方針の上書き（{ [id]: { direction, phase } }）。
 * ⚠ 自分の名簿の選手だけ・受け取れる方針だけ。
 */
function campPlayerPolicies(roster, source) {
  const ids = new Set(roster.map((p) => p.id));
  const out = {};
  for (const [id, own] of Object.entries(source || {})) {
    const playerId = Number(id);
    if (!ids.has(playerId)) continue;
    requireOnline(
      CAMP_DIRECTIONS.includes(own?.direction) &&
        CAMP_PHASES.includes(own?.phase),
      '育成方針が不正です',
    );
    out[playerId] = { direction: own.direction, phase: own.phase };
  }
  return out;
}

/**
 * キャンプを**1クールだけ**走らせる。
 *
 * ⚠ 人の球団は画面で1クールずつ実行し、伸びた能力を見てから次を決める
 *    （一人用と同じ）。締め切りで残りを回すぶんもここを通す。
 * ⚠ **やる気は方針との噛み合いで決まる**（`moodMultiplier`）。方針が無ければ
 *    「全体を伸ばす×技術」として扱う。希望どおりが正解ではなく、噛み合いは
 *    効率にだけ効く。
 * ⚠ サブ練習が無い選手は `physique`（基礎体力）。一人用の既定と同じ。
 * ⚠ 世界（`TEAMS_DATA`）を直に書き換える。呼ぶ側が `captureWorld()` すること。
 */
export function runCampRound(
  league,
  teamName,
  { policy, players: overrides, main, sub } = {},
) {
  const team = TEAMS_DATA[teamName];
  if (!team?.players?.length) return { gains: {}, events: {} };
  // ⚠ 伸びは**練習の前後を比べて**作る（メイン・サブ・スタッフの効果をまとめて）。
  //    練習ごとの報告を足し合わせると、サブ練習やスタッフの効果が漏れる
  const before = new Map(
    team.players.map((player) => [player.id, abilitySnapshot(player)]),
  );
  const staff = team.corporateData?.staff
    ? getTeamStaffBonus(team.corporateData.staff)
    : null;
  // ⚠ 独立リーグの覚醒倍率。一人用の `gameMode === 'independent'` と揃える
  const awakening = 1.5;
  const assignments = {};
  const moods = {};
  // ⚠ 方針は**練習の前に1回だけ**決める。練習で能力が変わると本人の希望も
  //    変わりうるので、サブ練習の既定を後で引き直すとメインと食い違う
  const policies = new Map();
  for (const player of team.players) {
    // ⚠ **守備位置に合わないメニューは標準へ倒す**（投手に打撃練習など）。
    //    倒さないと、伸びるのはその選手が使わない能力だけになる。
    //    画面の選択肢（`CampPlanner` の `menusFor`）と同じ規則。
    // ⚠ **方針は選手ごと**（`playerPolicy`）。やる気もその選手の方針で見る
    const { direction, phase } = playerPolicy(player, policy, overrides);
    policies.set(player.id, { direction, phase });
    const wanted = main?.[player.id] || resolveTraining(player, direction, phase).main;
    assignments[player.id] = menuFitsPlayer(wanted, player)
      ? wanted
      : player.position === 'pitcher'
        ? 'control'
        : 'batting';
    moods[player.id] = moodMultiplier(player, direction, phase);
  }
  const { updatedTeam, allReports } = executeTeamCampTraining(
    team,
    assignments,
    {},
    staff,
    awakening,
    moods,
  );
  TEAMS_DATA[teamName] = updatedTeam;
  // 数字にならない出来事（フォーム改造・新球種・打席の変更）は文で残す
  // ⚠ 能力の覚醒（大きく伸びた）も `isAwakening` で来る。伸びた数は `gains` に
  //    あるので、ここは「覚醒した」ことだけ書く（「ミート 63」と今の値を並べない）
  const events = {};
  const note = (player, report) => {
    for (const r of report || [])
      if (r.isAwakening)
        (events[player.id] ||= []).push(
          typeof r.before === 'number' && r.stat !== 'newpitch'
            ? `${r.statName}が覚醒`
            : `${r.statName} ${r.after}`.trim(),
        );
  };
  for (const r of allReports || []) note(r.player, r.growthReport);
  for (const player of updatedTeam.players) {
    // ⚠ 守備位置に合うかは**入口で見ている**（`validateCampRound` と
    //    `validatePhasePlan`）。ここで倒すと、どちらの入口が漏れても気づけない
    const own =
      policies.get(player.id) || playerPolicy(player, policy, overrides);
    const key =
      sub?.[player.id] || resolveTraining(player, own.direction, own.phase).sub;
    if (SUB_TRAINING_MENUS[key])
      note(player, executeSubTraining(player, key, {}, staff)?.growthReport);
  }
  if (staff) {
    applyMotivationEffect(updatedTeam.players, staff);
    applyBatteryMentalEffect(updatedTeam.players, staff);
  }
  const gains = {};
  for (const player of updatedTeam.players) {
    const diff = abilityGains(
      before.get(player.id) || {},
      abilitySnapshot(player),
    );
    if (Object.keys(diff).length) gains[player.id] = diff;
  }
  // `moods`: 選手ごとのやる気の倍率（検査で、方針が選手ごとに効いたかを見る）
  return { gains, events, moods };
}

/** 手動実行と締切時の自動実行で、同じ記録を残す。 */
export function recordCampRound(state, result) {
  state.rounds = (state.rounds || 0) + 1;
  state.last = {
    round: state.rounds,
    gains: result?.gains || {},
    events: result?.events || {},
  };
  state.gains = addCampGains(state.gains, result?.gains);
  state.events ||= {};
  for (const [id, events] of Object.entries(result?.events || {}))
    state.events[id] = [...new Set([...(state.events[id] || []), ...events])];
}

// ============================================================
// トレード
// ============================================================

/** その人の球団。⚠ 参加者でなければ止める（CPU球団は交渉しない） */
function memberTeam(league, userId) {
  const member = (league.members || []).find((m) => m.userId === userId);
  requireOnline(member, '参加者ではありません', 403);
  const team = TEAMS_DATA[member.teamName];
  requireOnline(team, '球団が見つかりません', 409);
  return { member, team };
}

/**
 * ⚠ **初期メンバーの入れ替えを待っている球団とはトレードしない**。
 *    途中参加した人の名簿は、次のキャンプの後に選んだセットで丸ごと
 *    置き換わる（`applyPendingPacks`）。その前にトレードすると、受け取った
 *    選手は置き換えで消え、出した選手だけが相手に残る（選手が1人ずつ
 *    リーグから消えていく）。
 */
function assertNoPendingPack(league, teamNames) {
  for (const name of teamNames)
    requireOnline(
      !hasPendingPack(league, name),
      `${name}は開幕前に初期メンバーへ入れ替わるため、それまではトレードできません`,
      409,
    );
}

/**
 * 選手の値段。**ドラフトと同じ物差し**（`deviationValue`）をそのまま使う。
 *
 * ⚠ **ここで別の式を書かないこと**。かつてトレードとドラフトが別々の評価式を
 *    持っていて、等価交換にならなかった（`src/game/playerValue.js` の冒頭）。
 */
export function tradeValueOf(player) {
  if (!player) return 0;
  const { main, sub } = draftAbilityScore(player);
  return deviationValue(player, main, sub);
}

/**
 * トレードを提案する。相手は**CPU球団でもよい**。
 *
 * ⚠ **CPU球団はその場で答える**。返事を待つ相手が居ないので、提案した瞬間に
 *    受ける／逆提案／断るのどれかが決まる（`cpuTradeDecision`）。
 *    以前は参加者の球団だけを相手にしていたが、1人で遊んでいる間は
 *    トレードがまったく使えなかった。
 * ⚠ **断ったときは記録を残さないこと**。断られた提案が一覧に残ると、
 *    同じものを押し直せてしまう。理由をそのまま返して画面に出す。
 * ⚠ 抱えられる提案の数に上限を置く（`MAX_OPEN_TRADES`）。無制限だと
 *    相手の画面を埋められる。
 */
export function openTrade(league, userId, { to, offer, want }, now) {
  league.trades = league.trades || [];
  const mine = memberTeam(league, userId);
  requireOnline(
    (league.season.settings.teamNames || []).includes(to),
    '相手の球団が見つかりません',
    409,
  );
  requireOnline(to !== mine.member.teamName, '自分の球団とはトレードできません');
  // ⚠ 参加者が居なければCPU球団。`to`（相手のuserId）は null で持つ
  const partner = (league.members || []).find((m) => m.teamName === to);
  const theirs = TEAMS_DATA[to];
  requireOnline(theirs, '相手の球団が見つかりません', 409);
  // ⚠ 相手はCPU球団のこともある（`partner` は null）。球団名で確かめる
  assertNoPendingPack(league, [mine.member.teamName, to]);
  requireOnline(
    league.trades.filter((t) => t.from === userId).length < MAX_OPEN_TRADES,
    `出せる提案は同時に${MAX_OPEN_TRADES}件までです`,
    409,
  );
  const offerIds = (offer || []).map(Number);
  const wantIds = (want || []).map(Number);
  assertTradeAllowed(mine.team, theirs, offerIds, wantIds);
  const id = `trade-${(league.tradeSeq = (league.tradeSeq || 0) + 1)}`;
  const trade = {
    id,
    from: userId,
    fromTeam: mine.member.teamName,
    to: partner ? partner.userId : null,
    toTeam: to,
    offer: offerIds,
    want: wantIds,
    // ⚠ 手番を持っている側だけが返事をする。両方が同時に受けられると二重に成立する
    turn: 'to',
    countered: false,
    createdAt: now,
    updatedAt: now,
  };
  if (partner) {
    league.trades.push(trade);
    return { id, status: 'offered' };
  }
  // --- CPU球団はその場で答える
  const decision = cpuTradeDecision({
    valueOf: tradeValueOf,
    fromPlayers: mine.team.players,
    toPlayers: theirs.players,
    offerIds,
    wantIds,
  });
  if (decision.action === 'accept') {
    applyTrade(league, trade);
    return { id, status: 'accepted' };
  }
  if (decision.action === 'counter') {
    // ⚠ 逆提案も**提案した側から見た形**で持つ（`offer` は `fromTeam` が出す）
    trade.want = decision.want;
    assertTradeAllowed(mine.team, theirs, trade.offer, trade.want);
    trade.countered = true;
    trade.turn = 'from';
    trade.updatedAt = now;
    league.trades.push(trade);
    return { id, status: 'countered' };
  }
  // ⚠ 断られたら**何も残さない**。`requireOnline` で画面に理由を出す
  requireOnline(
    false,
    `${to} はこの内容では応じませんでした。出す選手を足すか、もらう選手を見直してください`,
    409,
    'trade',
  );
}

/**
 * トレードに返事をする。`action` は `accept` / `counter` / `reject`。
 *
 * ⚠ **成立のときに中身をもう一度確かめる**。提案から返事までの間に、選手が
 *    別のトレードで移っていることがある。提案のときに見ただけだと、居ない
 *    選手を動かして名簿が壊れる。
 * ⚠ 逆提案は**最初の返事のときだけ**（`canCounter`）。投げ返しが続くと終わらない。
 * ⚠ 断るのは**どちらの側からでも**できる（取り下げも兼ねる）。
 */
export function respondTrade(league, userId, { tradeId, action, offer, want }, now) {
  league.trades = league.trades || [];
  const trade = league.trades.find((t) => t.id === tradeId);
  requireOnline(trade, 'そのトレードはもうありません', 409);
  requireOnline(
    trade.from === userId || trade.to === userId,
    'このトレードの当事者ではありません',
    403,
  );
  const drop = () => {
    league.trades = league.trades.filter((t) => t.id !== tradeId);
  };
  if (action === 'reject') {
    drop();
    return { status: 'rejected' };
  }
  requireOnline(canRespond(trade, userId), 'いまは相手の返事待ちです', 409);
  const fromTeam = TEAMS_DATA[trade.fromTeam];
  const toTeam = TEAMS_DATA[trade.toTeam];
  requireOnline(fromTeam && toTeam, '球団が見つかりません', 409);

  if (action === 'counter') {
    requireOnline(
      canCounter(trade, userId),
      '逆提案は1回までです。受けるか断るかを選んでください',
      409,
    );
    // ⚠ 逆提案も**提案した側から見た形**で持つ（`offer` は `fromTeam` が出す）。
    //    向きを変えると、成立のときにどちらが誰を出すのか分からなくなる
    const offerIds = (offer || []).map(Number);
    const wantIds = (want || []).map(Number);
    assertTradeAllowed(fromTeam, toTeam, offerIds, wantIds);
    trade.offer = offerIds;
    trade.want = wantIds;
    trade.countered = true;
    trade.turn = 'from';
    trade.updatedAt = now;
    return { status: 'countered' };
  }

  requireOnline(action === 'accept', 'トレードの操作が不正です');
  applyTrade(league, trade);
  drop();
  return { status: 'accepted' };
}

/**
 * トレードを成立させる（選手を入れ替えて、経歴とお知らせに残す）。
 *
 * ⚠ **人が受けたときとCPUが受けたときで同じ処理を通すこと**。2か所に書くと、
 *    片方だけ経歴を残し忘れる・打順を組み直し忘れる、ということが起きる。
 * ⚠ 成立の直前に**もう一度**中身を確かめる（`assertTradeAllowed` と
 *    `assertNoPendingPack`）。提案から返事までの間に、選手が別のトレードで
 *    移っていたり、相手が途中参加の入れ替え待ちになっていたりする。
 */
function applyTrade(league, trade) {
  const fromTeam = TEAMS_DATA[trade.fromTeam];
  const toTeam = TEAMS_DATA[trade.toTeam];
  requireOnline(fromTeam && toTeam, '球団が見つかりません', 409);
  assertNoPendingPack(league, [trade.fromTeam, trade.toTeam]);
  const after = assertTradeAllowed(fromTeam, toTeam, trade.offer, trade.want);
  fromTeam.players = after.from;
  toTeam.players = after.to;
  // ⚠ 移った選手の経歴に残す。あとから「どの年にどこへ行ったか」を辿れるように
  for (const [players, label] of [
    [after.moving, trade.toTeam],
    [after.coming, trade.fromTeam],
  ])
    for (const player of players)
      player.careerHistory = [
        ...(player.careerHistory || []),
        { type: 'trade', year: league.season.year, label },
      ];
  // ⚠ **打順と投手起用を組み直す**。出した選手が打順に残ると試合が組めない
  refreshTeamPlan(league, trade.fromTeam);
  refreshTeamPlan(league, trade.toTeam);
  league.notices.unshift({
    type: 'trade',
    year: league.season.year,
    teams: [trade.fromTeam, trade.toTeam],
    picks: [
      ...after.moving.map((p) => ({
        round: '移籍',
        name: p.name,
        playerId: p.id,
        team: trade.toTeam,
      })),
      ...after.coming.map((p) => ({
        round: '移籍',
        name: p.name,
        playerId: p.id,
        team: trade.fromTeam,
      })),
    ],
  });
  return after;
}

/**
 * 選手の**登録守備位置**を変える（コンバート）。
 *
 * ⚠ **能力は足さない**。選手は元から `pitching` も `batting` も
 *    `positionFitness` も持っている（セットの生成がそう作る）ので、登録を
 *    変えるだけで成り立つ。新しい位置の適性は低いまま＝下手なのが正しい。
 * ⚠ **名簿が成り立たなくなる変更は受け付けない**（トレードと同じ
 *    `rosterShortfall`）。最後の捕手を外野手にすると試合が組めない。
 * ⚠ **打順と投手起用を組み直す**。残したままだと、野手になった選手が登板順に
 *    残り、投手になった選手が守備に就いたままになる。組み直すので、
 *    画面には「打順と投手起用は組み直されます」と断ってから押させる。
 */
export function convertPosition(league, userId, { playerId, position }) {
  const { member, team } = memberTeam(league, userId);
  requireOnline(
    CONVERT_POSITIONS.includes(position),
    '守備位置の指定が不正です',
  );
  const player = team.players.find((p) => p.id === Number(playerId));
  requireOnline(player, 'その選手は名簿にいません', 409);
  requireOnline(
    player.isActive !== false,
    '登録を外れている選手の守備位置は変えられません',
    409,
  );
  requireOnline(player.position !== position, 'すでにその守備位置です');
  const after = team.players.map((p) =>
    p.id === player.id ? { ...p, position } : p,
  );
  const problems = rosterShortfall(after);
  requireOnline(
    !problems.length,
    `この変更では名簿が成り立ちません: ${problems.join('・')}`,
  );
  player.position = position;
  // ⚠ **印を付けること**。投手かどうかの判定は「スタミナ100以上なら投手」という
  //    当て推量を含むので、投手から野手へ移しても投げ続ける（`registeredAsFielder`）
  player.primaryRole = position === 'pitcher' ? 'pitcher' : 'fielder';
  refreshTeamPlan(league, member.teamName, { force: true });
  return { position };
}

export function openPhase(league, kind, now) {
  // ⚠ **締め切りを持たせること**。待ち続ける設計だと、1人が決めないだけで
  //    全員の週が止まる。締め切りが曜日合わせも兼ねている
  //    （土曜＝ストーブリーグ／日曜＝キャンプ／月曜＝開幕）。
  const phase = {
    id: `${league.season.year}:${kind}`,
    kind,
    deadline: now ? phaseDeadlineAt(kind, now) : null,
    submissions: {},
  };
  if (kind === 'pack_select') {
    // ⚠ **セットはこのときだけ作る**。20セット×24人＝480人なので、
    //    手続きが終わったら `league.phase` ごと消えて保存から落ちる
    league.packs = generateRosterPacks(league.seed + 7).map((pack) => ({
      ...pack,
      takenBy: null,
    }));
    phase.packIds = league.packs.map((p) => p.id);
  }
  if (kind === 'tryout') {
    const names = league.season.settings.teamNames;
    const rank = getLeagueRankFromTeams(names) || 'B';
    const reputation =
      names.reduce(
        (n, name) => n + (TEAMS_DATA[name].developmentReputation || 0),
        0,
      ) / names.length;
    phase.candidates = generateTryoutCandidates(
      league.season.year,
      // ⚠ **球団数を渡すこと**。以前は 4 が直に書かれており、
      //    42球団にすると候補が足りず名簿を埋められない
      names.length,
      // ⚠ 第3引数は「初回か」。初回の名簿は**初期メンバーセット**で配るので
      //    オンラインに初回トライアウトは無い。常に実在プールから引く
      false,
      rank,
      reputation,
    );
  }
  league.phase = phase;
  league.status = 'waiting';
  league.nextAdvanceAt = null;
  league.season.pendingPhaseEvent = kind;
}

export function createLeague({
  seed = 20261028,
  members,
  now = new Date().toISOString(),
}) {
  // ⚠ 人数は1〜42。0人は拒む（誰も居ないと停止も再開もできない）
  assertMemberCount(members);
  // ⚠ 42球団は seed から生成する。同じ seed なら必ず同じ世界になる
  const defs = generatePyramidTeams(seed);
  const names = defs.map((t) => t.name);
  // ⚠ 参加者は**下の階層から**割り当てる
  const order = assignmentOrder(defs);
  const league = {
    schema: ONLINE_SCHEMA,
    engineVersion: ENGINE_VERSION,
    id: 'pennant',
    seed,
    revision: 1,
    status: 'waiting',
    createdAt: now,
    updatedAt: now,
    nextAdvanceAt: null,
    // ⚠ 検証モード。ONの間だけ管理者が手で進められる。**既定はOFF**
    //    （管理者が好きな時に進められるのは多人数の対戦として公平ではない）
    testMode: false,
    // 階層リーグの球団表。参加者の割り当てと昇降格でこれを見る
    teams: defs,
    members: members.map((m, i) => ({
      userId: m.userId,
      label: m.label || `プレイヤー${i + 1}`,
      teamName: order[i].name,
    })),
    history: [],
    notices: [],
    // ⚠ トレードの置き場。無いと `league.trades.push` で落ちる
    trades: [],
    tradeSeq: 0,
  };
  const season = createSeasonData(1);
  season.settings = {
    ...season.settings,
    teamNames: names,
    teamsCount: PYRAMID_TEAM_COUNT,
    preset: 'pyramid',
    // ⚠ 試合数とターン数は `createSchedule` が入れる（日程と同じ場所で決める）。
    //    休養日のぶん試合数はターン数より少ない（規定打席などの基準になる）
    leagueFormat: 'single',
    playoffFormat: 'short',
    useDH: false,
  };
  league.season = season;
  seeded(league, 'create', () => {
    setPlayerIdCounter(0);
    setStaffIdCounter(5000);
    setStaffNameHistory([]);
    initializeTeamsForCount(
      PYRAMID_TEAM_COUNT,
      names,
      defs.map((t) => t.abbreviation),
    );
    LEAGUE_SETTINGS.useDH = false;
    LEAGUE_SETTINGS.maxExtraInnings = 12;
    initializeParallelWorldForIndependent('shikoku', names);
    ensureUserIndependentLeagueTagged(names, 'shikoku');
    // ⚠ **生成した球団の格付けを当て直すこと**。上の関数はプリセット定義と
    //    名前で照合するので、その場で作った球団名は全部 'D'（最弱）になる。
    //    初期トライアウトの候補の質はこの格付けで決まるため、リーグ全体の
    //    選手が弱くなっていた（実測でミート43.9→36.8、制球44.5→36.6）。
    for (const def of defs)
      applyIndependentRank(def.name, def.rank, 'pyramid');
    assignTeamControllers(
      TEAMS_DATA,
      league.members.map((m) => m.teamName),
    );
    generateAprilHighSchoolClass(1);
    season._highSchoolGenerated = true;
    createSchedule(season, defs);
    // ⚠ 開幕前は「どのセットを選ぶか」だけ。希望リストはシーズン後の
    //    トライアウトで使う（初期編成は置き換えた）
    openPhase(league, 'pack_select', now);
  });
  league.game = captureWorld();
  return league;
}

// `take`: 写しを複製せずに渡す（`restoreWorld` の説明を参照）。最後に
// `league.game = captureWorld()` で差し替える呼び出しだけが使ってよい。
/**
 * 世界を保存の形へ書き戻す。⚠ `TEAMS_DATA` を触ったら必ず呼ぶこと
 *    （触っただけでは保存に載らない）。
 */
export function captureLeagueWorld() {
  return captureWorld();
}

/**
 * キャンプ1クールぶんの指示を検証する。
 * ⚠ 自分の名簿の選手だけ・受け取れるメニューだけ。画面の値をそのまま
 *    信じると、知らないメニューで練習が飛ぶ。
 */
export function validateCampRound(league, teamName, payload) {
  // ⚠ **保存された世界（`league.game`）を見ること。`TEAMS_DATA` を見ない**。
  //    呼ぶ側は `loadLeagueWorld` の前に検査するので、メモリ上の世界は
  //    空（起動したての関数）か、前に読んだ古い世界のまま。実際にアプリで
  //    キャンプの1クール目が「球団が見つかりません」で止まった。
  const team = league.game?.teams?.[teamName];
  requireOnline(team, '球団が見つかりません', 409);
  const byId = new Map(team.players.map((p) => [p.id, p]));
  // ⚠ **守備位置に合うかも見る**。合わないものは `runCampRound` が既定へ
  //    倒すが、画面には「選んだのに違う練習をした」と映る。入口で断る。
  const pick = (source, allowed, fits, message) => {
    const out = {};
    for (const [id, key] of Object.entries(source || {})) {
      const playerId = Number(id);
      const player = byId.get(playerId);
      if (!player) continue;
      requireOnline(allowed.includes(key) && fits(key, player), message);
      out[playerId] = key;
    }
    return out;
  };
  return {
    policy: normalizeCampPolicy(payload?.policy),
    players: campPlayerPolicies(team.players, payload?.players),
    main: pick(payload?.main, CAMP_MENUS, menuFitsPlayer, '練習メニューが不正です'),
    sub: pick(payload?.sub, CAMP_SUB_MENUS, subMenuFitsPlayer, 'サブ練習が不正です'),
  };
}

export function loadLeagueWorld(league, { take = false } = {}) {
  assertLeagueVersion(league);
  restoreWorld(league.game, { take });
  assignTeamControllers(
    TEAMS_DATA,
    league.members.map((m) => m.teamName),
  );
}

export function defaultPhasePlan(league, teamName) {
  const team = league.game.teams[teamName];
  const kind = league.phase.kind;
  if (kind === 'pack_select') {
    // ⚠ 決めなかった人にも渡す。空いているセットから、球団名で決まる位置を取る
    //    （乱数だと、やり直しで違うセットになって再現しない）
    // ⚠ **ほかの人が選んだセットは避けること**。標準案も解決のときは
    //    「選んだもの」と同じ扱い（球団名の順）になるので、決めなかった人の
    //    標準案が、ほかの人が自分で選んだセットを先に取っていた
    const member = league.members.find((m) => m.teamName === teamName);
    const wanted = new Set(
      Object.entries(league.phase.submissions || {})
        .filter(([userId]) => userId !== member?.userId)
        .map(([, s]) => s?.plan?.packId)
        .filter(Boolean),
    );
    const free = (league.packs || []).filter((p) => !p.takenBy && !wanted.has(p.id));
    const index =
      [...league.season.settings.teamNames].sort().indexOf(teamName) % Math.max(1, free.length);
    return { packId: free[index]?.id || league.packs?.[0]?.id || null };
  }
  if (kind === 'contract')
    return { releaseIds: getAIReleaseCandidates(team.players) };
  // ⚠ 既定は全体の方針だけ。選手ごとの割り当ては画面で決める
  if (kind === 'camp') return { menu: 'standard', assignments: {} };
  if (kind === 'offseason') return {};
  // ⚠ **途中参加でセットを待っている球団は、トライアウトで取らない**。
  //    名簿は次のキャンプでセットに丸ごと入れ替わるので、取った選手は
  //    どこにも残らず消える（プールからは抜けているので世界から居なくなる）
  if (kind === 'tryout' && hasPendingPack(league, teamName))
    return { rankedIds: [], count: 0 };
  return seeded(league, `default:${league.phase.id}:${teamName}`, () => {
    const pool = clone(league.phase.candidates);
    const roster = clone(team.players);
    const rankedIds = [];
    while (pool.length) {
      const player = selectPlayerForAI(pool, roster) || pool[0];
      rankedIds.push(player.id);
      roster.push(player);
      pool.splice(
        pool.findIndex((p) => p.id === player.id),
        1,
      );
    }
    return { rankedIds, count: Math.max(0, ROSTER_LIMIT - team.players.length) };
  });
}

function validatePhasePlan(league, teamName, plan) {
  requireOnline(
    plan && typeof plan === 'object' && !Array.isArray(plan),
    '提出内容が不正です',
  );
  const team = TEAMS_DATA[teamName];
  switch (league.phase.kind) {
    case 'contract': {
      requireOnline(
        Array.isArray(plan.releaseIds) &&
          new Set(plan.releaseIds).size === plan.releaseIds.length &&
          plan.releaseIds.every((id) => team.players.some((p) => p.id === id)),
        '退団選手の指定が不正です',
      );
      const remaining = team.players.filter(
        (p) => !plan.releaseIds.includes(p.id),
      );
      requireOnline(
        remaining.length >= Math.min(9, team.players.length),
        '契約後も最低9人は残してください。既に9人未満の場合は新たな退団はできません',
      );
      return { releaseIds: [...plan.releaseIds] };
    }
    case 'camp': {
      requireOnline(
        plan.menu === 'standard' || CAMP_MENUS.includes(plan.menu),
        '練習方針が不正です',
      );
      // ⚠ **選手ごとの割り当て**。一人用のキャンプ画面と同じく、1人ずつ
      //    メイン練習とサブ練習を決められる。
      // ⚠ 自分の名簿の選手だけ。他球団の選手を混ぜられると練習が飛ぶ
      const own = new Map(team.players.map((p) => [p.id, p]));
      const assignments = {};
      for (const [id, key] of Object.entries(plan.assignments || {})) {
        const playerId = Number(id);
        if (!own.has(playerId)) continue;
        requireOnline(CAMP_MENUS.includes(key), '練習メニューが不正です');
        // ⚠ 守備位置に合わないもの（野手に球速練習など）は落とす（全体の方針で埋まる）。
        //    弾くと、保存済みの下書きが締め切りで丸ごと標準案に戻ってしまう
        if (!menuFitsPlayer(key, own.get(playerId))) continue;
        assignments[playerId] = key;
      }
      // ⚠ **サブ練習も守備位置を見る**（`campRound` の入口と同じ規則）。
      //    変化球練習を野手に当てても何も起きず、そのクールが丸ごと無駄になる
      const subAssignments = {};
      for (const [id, key] of Object.entries(plan.subAssignments || {})) {
        const playerId = Number(id);
        const player = team.players.find((p) => p.id === playerId);
        if (!player) continue;
        requireOnline(
          CAMP_SUB_MENUS.includes(key) && subMenuFitsPlayer(key, player),
          'サブ練習が不正です',
        );
        subAssignments[playerId] = key;
      }
      return {
        menu: plan.menu,
        assignments,
        subAssignments,
        // ⚠ 方針は**やる気**に効く（噛み合うと伸びやすい）。無ければ標準
        policy: normalizeCampPolicy(plan.policy),
        players: campPlayerPolicies(team.players, plan.players),
      };
    }
    case 'pack_select': {
      // ⚠ 居ないセットを受け付けない。解決のときに「足りません」で
      //    手続き全体が止まる（1球団の都合で全員が止まる）
      const ids = new Set((league.packs || []).map((p) => p.id));
      requireOnline(
        typeof plan.packId === 'string' && ids.has(plan.packId),
        '初期メンバーの選択が不正です',
      );
      return { packId: plan.packId };
    }
    case 'tryout': {
      const candidates = new Set(league.phase.candidates.map((p) => p.id));
      requireOnline(
        Number.isInteger(plan.count) &&
          plan.count >= 0 &&
          plan.count <= Math.max(0, ROSTER_LIMIT - team.players.length),
        '獲得人数が不正です',
      );
      requireOnline(
        Array.isArray(plan.rankedIds) &&
          plan.rankedIds.length <= candidates.size &&
          new Set(plan.rankedIds).size === plan.rankedIds.length &&
          plan.rankedIds.every((id) => candidates.has(id)),
        '希望順位に無効・重複した選手がいます',
      );
      requireOnline(
        plan.rankedIds.length >= plan.count,
        '獲得希望人数以上の候補を指定してください',
      );
      return { count: plan.count, rankedIds: [...plan.rankedIds] };
    }
    case 'offseason':
      return {};
    default:
      throw new Error('未対応のイベントです');
  }
}

function releasePlayers(teamName, ids, year) {
  const team = TEAMS_DATA[teamName];
  for (const player of team.players.filter((p) => ids.includes(p.id))) {
    if ((player.age || 20) < 33) {
      const saved = clone(finalizePlayerSeason(player, year));
      addToReleasedPool({
        ...saved,
        isStarter: false,
        battingOrder: 0,
        releasedYear: year,
        previousTeam: teamName,
        attemptsInPool: 0,
        seasonFinalizedYear: year,
      });
    }
    cleanupPlayerReferences(team, player.id);
  }
  team.players = team.players.filter((p) => !ids.includes(p.id));
}

/**
 * 手続きの後の先発ローテと打順。CPUは作り直す。
 * ⚠ **人の球団は、保存した編成がまだ成り立つならそのまま残す**。以前は全球団を
 *    作り直していたため、キャンプの間に決めた打順・ローテが開幕の時点で
 *    おすすめに戻っていた（手続き中も編成画面は開けて保存できる）。
 *    ローテの投手が名簿から消えた・打順が埋まらないときだけ作り直す。
 */
function refreshTeamPlan(league, name, { force = false } = {}) {
  const team = TEAMS_DATA[name];
  const human = league.members.some((m) => m.teamName === name);
  // ⚠ `force` は**守備位置の登録を変えたとき**に使う。残した編成はそのままだと
  //    「野手になった選手が登板順に残る」「投手になった選手が守備に就く」まま
  //    保たれてしまう（`ensureCompleteLineup` は登録の変更までは見ない）
  if (human && !force) {
    const ids = new Set(team.players.map((p) => p.id));
    const starters = team.pitchingRotation?.starters || [];
    // ⚠ 次の先発が野手の打順にも入っている（二刀流）とき、そのまま
    //    `ensureCompleteLineup` に渡すと野手の枠から外したまま保存される。
    //    控えに一時的に任せて確かめ、すぐ戻す（試合の日と同じ扱い）
    const undoTwoWay =
      starters.length > 0 && starters.every((id) => ids.has(id))
        ? benchTwoWayStarter(team)
        : null;
    const complete = undoTwoWay ? ensureCompleteLineup(team, false) : false;
    undoTwoWay?.();
    if (complete) {
      syncRelievers(team);
      return;
    }
  }
  generatePitchingRotation(name);
  // ⚠ **守備位置の登録を書き換えさせない**。CPUの打順作り（`generateAILineup`）は
  //    スタメンに入れた選手の登録をその日の守備位置に書き換える（一人用の試合の
  //    写しでの作り）。保存する名簿に当てると、二刀流の投手が「右翼手」になって
  //    ローテに残る・一塁手が三塁手に変わる、が黙って起きていた。守備位置は
  //    打順の側（`lineupSettings`）にあるので、登録は元に戻してよい
  const registered = new Map(team.players.map((p) => [p.id, p.position]));
  setRecommendedLineup(team, name);
  for (const player of team.players)
    if (registered.has(player.id)) player.position = registered.get(player.id);
}

/**
 * 残した投手起用の**救援の欄**を名簿に合わせる。
 *
 * ⚠ 先発ローテが揃っていれば編成はそのまま残すが、救援（中継ぎ・セットアッパー・
 *    守護神）は見ていなかった。トレード・トライアウト・退団で
 *    - 出した救援投手が欄に残る（守護神が居ない球団になる）
 *    - 入ってきた投手がどの欄にも入らず、**試合で1度も投げない**
 *      （画面の投手起用には「おまかせ」の救援として出るので、気づけない）
 *    ことになっていた。居ない投手を外し、どこにも居ない投手を中継ぎに足す。
 *    役割（`pitcherRoles`）が無い投手は「おまかせ」として扱われる（`roleFor`）。
 */
function syncRelievers(team) {
  const rotation = team.pitchingRotation;
  if (!rotation) return;
  const active = team.players.filter((p) => p.isActive !== false);
  // ⚠ 投手起用に加えた野手（二刀流）は欄に残す。足すのは投手登録の選手だけ
  //    （野手を全員「おまかせ」の救援にしない）
  const staff = new Set([
    ...(rotation.starters || []),
    ...(rotation.setupMen || []),
    ...(rotation.middleRelievers || []),
    ...(rotation.closer != null ? [rotation.closer] : []),
    ...Object.keys(rotation.pitcherRoles || {}).map(Number),
  ]);
  const pitchers = active
    .filter((p) => p.position === 'pitcher' || (p.pitching && staff.has(p.id)))
    .map((p) => p.id);
  const present = new Set(pitchers);
  const starters = new Set(rotation.starters || []);
  rotation.setupMen = (rotation.setupMen || []).filter((id) => present.has(id));
  if (rotation.closer != null && !present.has(rotation.closer))
    rotation.closer = null;
  const assigned = new Set([
    ...rotation.setupMen,
    ...(rotation.closer != null ? [rotation.closer] : []),
  ]);
  const middle = (rotation.middleRelievers || []).filter(
    (id) => present.has(id) && !starters.has(id) && !assigned.has(id),
  );
  for (const id of pitchers)
    if (!starters.has(id) && !assigned.has(id) && !middle.includes(id))
      middle.push(id);
  rotation.middleRelievers = middle;
  rotation.relievers = pitchers.filter((id) => !starters.has(id));
  if (rotation.pitcherRoles)
    for (const id of Object.keys(rotation.pitcherRoles))
      if (!present.has(Number(id))) delete rotation.pitcherRoles[id];
}

/**
 * 初期メンバー選択を解決する。
 *
 * ⚠ **同じセットは1球団だけ**。選手のidと名前が重複すると、記録が
 *    どちらの選手のものか分からなくなる。
 * ⚠ 取り合いになったら**球団名の順で決める**。乱数で決めると、同じ
 *    やり直しで違う結果になって再現しなくなる。
 * ⚠ 選ばなかった球団（CPU・未提出の人）には、残りから順に配る。
 */
function resolvePackSelect(league, plans) {
  const names = league.season.settings.teamNames;
  const packs = league.packs || [];
  const byId = new Map(packs.map((p) => [p.id, p]));
  const assigned = {};
  // 1) 選んだ球団から。球団名の順に見て、空いていれば渡す
  for (const name of [...names].sort()) {
    const wanted = plans[name]?.packId;
    const pack = wanted ? byId.get(wanted) : null;
    if (pack && !pack.takenBy) {
      pack.takenBy = name;
      assigned[name] = pack;
    }
  }
  // 2) 残りを順に配る
  const free = packs.filter((p) => !p.takenBy);
  for (const name of names) {
    if (assigned[name]) continue;
    const pack = free.shift();
    requireOnline(pack, `${name}に渡す初期メンバーが足りません`, 409);
    pack.takenBy = name;
    assigned[name] = pack;
  }
  for (const name of names) {
    const team = TEAMS_DATA[name];
    // ⚠ 複製を入れること。`league.packs` は手続きが終わると消えるが、
    //    参照のまま渡すと保存の形が絡まる
    team.players = clone(assigned[name].players);
    for (const player of team.players) {
      player.careerHistory = [
        ...(player.careerHistory || []),
        { type: 'independent', year: league.season.year, label: name },
      ];
    }
  }
  // ⚠ **打順と投手起用を作ること**。渡した名簿だけでは試合が組めない。
  //    付け忘れると、打順が空のまま開幕して画面も壊れる（実測で
  //    `battingOrder` に2番が無く、打順の入れ替えが例外になった）。
  for (const name of names) refreshTeamPlan(league, name);
  // ⚠ 配り終えたら捨てる。480人ぶんを抱えたままにしない
  delete league.packs;
}

function resolveTryout(league, plans) {
  const phase = league.phase;
  // ⚠ 指名順は**前年の順位の逆**（弱い球団から）。初回だけ球団名の順という
  //    分岐があったが、初回の名簿はセット選択で配るのでもう通らない
  const names = [...league.season.standings]
    .sort((a, b) => a.winRate - b.winRate)
    .map((s) => s.team);
  const remaining = clone(phase.candidates);
  const acquired = Object.fromEntries(names.map((name) => [name, []]));
  const allPicked = [];
  // ⚠ **希望順位は静的だが、ドラフトは動的**。4球団なら自分の番までに
  //    ほとんど取られないが、42球団だと24巡目には約1000人が消えており、
  //    好みの順だけで取ると**捕手が一度も浮上しない**ことがある。
  //    そのまま進むと「投手・捕手・野手が不足」で**フェーズ全体が解決できず、
  //    1球団の都合で全員が止まる**（実際にそうなった）。
  //    残り指名枠が不足ぶんと同じになったら、必要な守備位置を優先する。
  const isPitcher = (p) => p.position === 'pitcher';
  const shortfall = (list) => {
    const fielders = list.filter((p) => !isPitcher(p)).length;
    const needPitcher = !list.some(isPitcher);
    const needCatcher = !list.some((p) => p.position === 'catcher');
    const needFielders = Math.max(8 - fielders, needCatcher ? 1 : 0);
    return { needPitcher, needCatcher, needFielders };
  };
  // ⚠ 巡目は**枠の数**から取る。直に書くと、枠を増やしたときに取り残される
  const order = generateSnakeDraftOrder(names, ROSTER_LIMIT);
  const picksLeftOf = Object.fromEntries(names.map((name) => [name, 0]));
  for (const pick of order) picksLeftOf[pick.team] += 1;
  for (const pick of order) {
    // この指名を含めて、この球団に残っている指名の回数
    const picksLeft = picksLeftOf[pick.team]--;
    const team = TEAMS_DATA[pick.team];
    const plan = plans[pick.team];
    const roster = [...team.players, ...acquired[pick.team]];
    const { needPitcher, needCatcher, needFielders } = shortfall(roster);
    const slotsLeft = ROSTER_LIMIT - roster.length;
    const mustFill = (needPitcher ? 1 : 0) + needFielders;
    // ⚠ **希望人数に達しても、最低限が欠けていれば取り続ける**。
    //    以前は希望人数（0人も選べる）で打ち切っていたため、投手・捕手・野手が
    //    足りない球団が1つあるだけで下の検査に落ち、**全員のトライアウトが
    //    解決できずに止まった**（締め切りの自動解決も同じ所で失敗する）。
    //    足りないぶんは必要な守備位置から自動で補う。
    const planFull = !!plan && acquired[pick.team].length >= plan.count;
    if (slotsLeft <= 0 || (planFull && mustFill === 0)) continue;
    // 足りないものから順に埋める（投手 → 捕手 → 野手）
    const pickForShortfall = () => {
      const want = needPitcher
        ? isPitcher
        : needCatcher
          ? (p) => p.position === 'catcher'
          : (p) => !isPitcher(p);
      const pool = remaining.filter(want);
      return pool.length
        ? selectPlayerForAI(pool, roster, null, ONLINE_ROSTER_TARGETS) || pool[0]
        : null;
    };
    let forced = null;
    // ⚠ 残りの**指名回数**でも判定する。枠（26人）だけで見ていると、希望順位の
    //    候補が全員他球団に取られて指名を見送り続けた球団は、枠が空いたまま
    //    巡目が尽き、最低限の構成に届かずにトライアウト全体が解決できなかった。
    if (slotsLeft <= mustFill || picksLeft <= mustFill || planFull)
      forced = pickForShortfall();
    let player = forced
      ? forced
      : planFull
        ? null
        : plan
        ? // ⚠ **希望順だけで取らないこと**。候補の38%が投手なので、順番どおりに
          //    取ると投手15人・野手9人（控えゼロ）になる。CPUは
          //    `selectPlayerForAI` が目標構成を見ているので投手10・野手14で揃い、
          //    人の球団だけ構造的に不利だった。同じ目標に従って飛ばす
          nextFromPlan(
            plan.rankedIds
              .map((id) => remaining.find((p) => p.id === id))
              .filter(Boolean),
            roster,
          )
        : // ⚠ CPUにも**オンラインの目標構成**を渡す。既定（一人用の24人）だと
          //    CPUだけ24人で止まり、人の球団だけ26人になる
          selectPlayerForAI(remaining, roster, null, ONLINE_ROSTER_TARGETS);
    // 希望順位の候補が尽きても、最低限が欠けていれば必要な守備位置から補う
    if (!player && mustFill > 0) player = pickForShortfall();
    if (!player) continue;
    remaining.splice(
      remaining.findIndex((p) => p.id === player.id),
      1,
    );
    acquired[pick.team].push(player);
    allPicked.push({ team: pick.team, player, round: pick.round });
  }
  for (const name of names) {
    const team = TEAMS_DATA[name];
    const combined = [...team.players, ...acquired[name]];
    requireOnline(
      combined.filter((p) => p.position !== 'pitcher').length >= 8 &&
        combined.some((p) => p.position === 'pitcher') &&
        combined.some((p) => p.position === 'catcher'),
      `${league.teams?.find((t) => t.name === name)?.displayName || name}の投手・捕手・野手が不足します。希望順位を見直してください`,
      409,
      'roster',
    );
    team.players = combined;
  }
  for (const { team, player, round } of allPicked) {
    player.draftInfo = { year: league.season.year, round };
    player.careerHistory = [
      ...(player.careerHistory || []),
      { type: 'independent', year: league.season.year, label: team },
    ];
  }
  // ⚠ **取った選手をプールから消すこと**。残すと翌年のトライアウトに
  //    同じ選手がもう一度出てくる
  {
    const ids = allPicked.map((p) => p.player.id);
    updateReleasedPoolAfterTryout(ids);
    removeDraftedFromGraduatePools(
      ids,
      allPicked.map((p) => p.player),
    );
    removeDraftedFromClubTeams(ids);
  }
  league.notices.unshift({
    type: 'tryout',
    year: league.season.year,
    picks: allPicked.map(({ team, player, round }) => ({
      team,
      playerId: player.id,
      name: player.name,
      round,
    })),
  });
  for (const name of names) refreshTeamPlan(league, name);
}

/**
 * 参加者の球団の、選手ごとの能力の写し（年度更新の前後を比べるため）。
 * ⚠ 途中参加でセットを待っている球団は取らない（名簿がキャンプで入れ替わる）
 */
function snapshotMemberTeams(league) {
  const out = {};
  for (const member of league.members || []) {
    if (member.packSeed) continue;
    const team = TEAMS_DATA[member.teamName];
    if (!team?.players) continue;
    out[member.userId] = team.players.map((p) => ({
      id: p.id,
      name: p.name,
      age: p.age,
      position: p.position,
      abilities: abilitySnapshot(p),
    }));
  }
  return out;
}

/**
 * 年度更新の結果（参加者ごと）。伸び・衰えは `campResults` と同じ形の `gains`、
 * 名簿から居なくなった選手（引退）は `departed` に名前で残す。
 * ⚠ 画面はこれだけを読む。差を画面で作ると、別の端末で見たときに前が無い
 */
function offseasonChanges(league, before, year) {
  const out = {};
  for (const [userId, players] of Object.entries(before)) {
    const member = league.members.find((m) => m.userId === userId);
    const team = member && TEAMS_DATA[member.teamName];
    if (!team?.players) continue;
    const now = new Map(team.players.map((p) => [p.id, p]));
    const gains = {};
    const departed = [];
    for (const old of players) {
      const player = now.get(old.id);
      if (!player) {
        departed.push({ id: old.id, name: old.name, age: old.age, position: old.position });
        continue;
      }
      const diff = abilityGains(old.abilities, abilitySnapshot(player));
      if (Object.keys(diff).length) gains[old.id] = diff;
    }
    out[userId] = { year, gains, departed };
  }
  return out;
}

function resolvePhase(league, now) {
  const kind = league.phase.kind;
  // ⚠ 途中参加でセットを待っている人は提出しないことがある（`submitPhase`）。
  //    その球団はCPUが動かしているので、標準案で決める
  const plans = Object.fromEntries(
    league.members.map((m) => [
      m.teamName,
      league.phase.submissions[m.userId]?.plan ||
        defaultPhasePlan(league, m.teamName),
    ]),
  );
  if (kind === 'pack_select') resolvePackSelect(league, plans);
  if (kind === 'tryout') resolveTryout(league, plans);
  if (kind === 'contract') {
    for (const name of league.season.settings.teamNames)
      releasePlayers(
        name,
        plans[name]?.releaseIds ||
          getAIReleaseCandidates(TEAMS_DATA[name].players),
        league.season.year,
      );
  }
  if (kind === 'camp') {
    // ⚠ **自分で回したクールは数えること**。人の球団は画面で1クールずつ
    //    実行する（`runCampRound`）。締め切りで残りだけを回す。
    //    数えないと、自分で4回やった球団がもう4回やって8クールぶん成長する。
    const done = (league.phase.camp ||= {});
    for (const [name, team] of Object.entries(TEAMS_DATA)) {
      if (!team.players?.length) continue;
      const member = league.members.find((m) => m.teamName === name);
      const state = member ? (done[member.userId] ||= { rounds: 0 }) : null;
      const already = state?.rounds || 0;
      // ⚠ 自分で回したときの指示があればそれを使う（残りのクールも同じ方針で）。
      //    無ければ提出した案、それも無ければ標準
      const saved = member ? done[member.userId]?.plan : null;
      const plan = plans[name];
      const rest = saved || campFallbackPlan(member, plan);
      for (let round = already; round < CAMP_ROUNDS; round += 1) {
        const result = runCampRound(league, name, rest);
        if (state) recordCampRound(state, result);
      }
    }
    // 最終クールの応答では phase が消えるため、完了結果を別に残す。
    // 初期名簿へ入れ替わる球団には、入れ替え前のCPU選手の成果を見せない。
    // ⚠ 記録の無い人を飛ばすこと。版を上げる前に自分で4クール済ませた人は
    //    `last` を持たず（`clone(undefined)` は例外）、名簿の無い球団は
    //    `done` に入らない。ここで投げると締め切りが進まず、リーグが止まる
    league.campResults = Object.fromEntries(
      league.members
        .filter((m) => !m.packSeed && done[m.userId])
        .map((m) => {
          const state = done[m.userId];
          return [
            m.userId,
            {
              year: league.season.year,
              rounds: state.rounds || 0,
              last: state.last ? clone(state.last) : null,
              gains: clone(state.gains || {}),
              events: clone(state.events || {}),
            },
          ];
        }),
    );
    // ⚠ **キャンプの練習より後に入れ替えること**。先に入れ替えると、
    //    選んだばかりの24人がキャンプで成長してしまい、セットの釣り合いが崩れる
    applyPendingPacks(league);
    initializeAllPlayersCondition();
    for (const name of league.season.settings.teamNames)
      refreshTeamPlan(league, name);
    league.season.currentDate = {
      year: 2023 + league.season.year,
      month: 4,
      day: 1,
    };
    league.season.phase = SEASON_PHASES.REGULAR_SEASON;
    generateAprilHighSchoolClass(league.season.year);
    league.season._highSchoolGenerated = true;
    generateBackgroundTournaments(league.season.currentDate);
  }
  if (kind === 'offseason') {
    // ⚠ **年度更新の伸び・衰えを残す**（いしだ指摘: 成長がいつ・どれだけ
    //    起きたか分からない）。能力が変わるのはキャンプとここだけで、
    //    ここは画面に何も出ていなかった。キャンプと同じく前後の差で作る
    const offseasonBefore = snapshotMemberTeams(league);
    freezeComparison(league);
    league.history.push({
      year: league.season.year,
      standings: clone(league.season.standings),
      awards: clone(league.season.frozenAwards || {}),
      playoffChampion: getPlayoffChampion(league.season.schedule, PLAYOFF_REPLAY),
    });
    const result = advanceToNextYear(league.season, TEAMS_DATA, {
      playedTeamNames: league.season.settings.teamNames,
    });
    for (const key of Object.keys(TEAMS_DATA)) delete TEAMS_DATA[key];
    Object.assign(TEAMS_DATA, result.updatedTeams);
    league.season = result.newSeasonData;
    WORLD_DATA.year = league.season.year;
    assignTeamControllers(
      TEAMS_DATA,
      league.members.map((m) => m.teamName),
    );
    // ⚠ **昇降格は日程を作り直す前に適用すること**。所属が変わってから
    //    日程を組まないと、昇格した球団が元のリーグの相手と戦い続ける。
    const movements = applyPyramidMovements(
      league.teams,
      league.history.at(-1)?.standings || [],
    );
    if (movements.length)
      league.notices.unshift({
        type: 'promotion',
        year: league.history.at(-1)?.year,
        moves: movements,
      });
    // ⚠ **球団表を渡すこと**。翌シーズンの日程もリーグ分けが要る。
    //    渡し忘れると `pyramidSchedule` が undefined を filter して落ちる
    //    （通年検査が年度更新で踏んだ）。
    createSchedule(league.season, league.teams);
    // 一人用と同じく年度末にCPUローテを再構築。人間の編成は有効な範囲で保持する。
    const humans = new Set(humanTeamNames(TEAMS_DATA));
    for (const name of Object.keys(TEAMS_DATA))
      if (!humans.has(name)) generatePitchingRotation(name);
    league.offseasonResults = offseasonChanges(
      league,
      offseasonBefore,
      league.history.at(-1)?.year,
    );
  }
  league.phase = null;
  delete league.season.pendingPhaseEvent;
  if (kind === 'pack_select' || kind === 'offseason')
    openPhase(league, 'camp', now);
  else {
    league.status = 'running';
    // キャンプの後は開幕。月曜0時に揃える（`seasonStartAt` の説明を参照）
    league.nextAdvanceAt =
      kind === 'camp' ? seasonStartAt(now) : nextProgressionAt(now);
  }
}

/**
 * 手続きがこの人の決定をまだ待っているか。
 *
 * ⚠ **途中参加でセットを待っている人は待たない**。その人の球団は次のキャンプで
 *    名簿がセットに丸ごと入れ替わり、それまではCPUが動かす（画面もそう書いている）。
 *    以前はこの人も「決定」を待っていたが、画面には初期メンバーの選択しか
 *    出さないので決定する手段が無く、ストーブリーグとキャンプが毎回
 *    締め切りまで止まっていた（ほかの全員が決めても進まない）。
 *    自分で出した案があればそれを使い、無ければ標準案で決める（`resolvePhase`）。
 */
export function waitsFor(league, member) {
  if (league.phase?.submissions?.[member.userId]?.ready) return false;
  return !(member.packSeed && league.phase?.kind !== 'pack_select');
}

export function submitPhase(league, userId, { phaseId, plan, ready }, now) {
  requireOnline(
    league.status === 'waiting' && league.phase?.id === phaseId,
    'このイベントは終了しています。最新状態を確認してください',
    409,
    'phase',
  );
  const member = league.members.find((m) => m.userId === userId);
  requireOnline(member, '参加者ではありません', 403);
  loadLeagueWorld(league);
  const normalized = validatePhasePlan(league, member.teamName, plan);
  league.phase.submissions[userId] = {
    plan: normalized,
    ready: ready === true,
  };
  if (league.members.every((m) => waitsFor(league, m) === false))
    seeded(league, `phase:${phaseId}`, () => resolvePhase(league, now));
  league.game = captureWorld();
}

export { saveLineup } from './lineupCommand.mjs';

/**
 * 保存する試合結果から、両球団の丸ごとの写し（`homeTeam` / `awayTeam`）を外す。
 *
 * ⚠ **1試合で約100KBあり、しかも2か所に入っていた**（`season.results` と
 *    `season.schedule[].result`）。1シーズンで保存が約190MB（圧縮後24MB）まで
 *    膨らみ、Supabase の無料枠を数年で食い潰す大きさだった。
 * ⚠ 外してよい理由：個人成績と試合の詳細は試合の直後に記録（`createRecorder`）が
 *    取り終えている。保存後にこの写しを読むのは、記録が無い古いリーグ向けの
 *    `storedGame` の予備経路だけで、そこは写しが無ければ要約を返す。
 *    点数・勝敗投手・継投（`pitcherChanges`）は残す。
 * ⚠ 保存の**項目を減らすのではなく、中身を軽くするだけ**。古いコードが読んでも
 *    同じ予備経路に入るだけなので、`ONLINE_SCHEMA` は上げない。
 */
export function slimStoredResults(season) {
  const slim = (result) => {
    if (!result || !('homeTeam' in result || 'awayTeam' in result))
      return result;
    const { homeTeam, awayTeam, ...rest } = result;
    return rest;
  };
  for (const game of season.results || []) game.result = slim(game.result);
  for (const game of season.schedule || []) game.result = slim(game.result);
}

/**
 * 1回の定期進行で、試合の無い日をまとめて進める上限。
 * ⚠ 1日ずつ進める処理を繰り返すだけで、日付を飛ばしはしない
 *    （間の日の大会・ドラフト・手続きの判定を落とさないため）。
 * ⚠ 上限は**日数で決める**（時間で打ち切らない）。時間で切ると、同じ保存から
 *    やり直したときに区切りが変わって結果が変わる。実測で1日あたり約0.1秒。
 */
export const IDLE_DAYS_PER_TICK = 60;

/** その日に消化する試合が無く、レギュラーシーズンも終わっているか */
function idleDay(league) {
  const season = league.season;
  if (league.status !== 'running' || league.phase) return false;
  if (
    season.schedule.some(
      (g) => g.phase === SEASON_PHASES.REGULAR_SEASON && !g.result,
    )
  )
    return false;
  return !getScheduleByDate(season.schedule, season.currentDate).some(
    (g) => !g.result,
  );
}

/**
 * 定期進行1回ぶん。
 *
 * ⚠ **シーズン後の試合の無い日はまとめて進める**。1ターン＝1日のままだと、
 *    レギュラーシーズン（120日・7月末まで）の後、プレーオフ（10月）と
 *    ドラフト・契約更改（11月）までの空の日を1時間に1日ずつ進めることになり、
 *    1年に約240時間かかっていた。週の割り当て（月〜金＝シーズン、
 *    土＝ストーブリーグ、日＝キャンプ）が成り立たない。
 * ⚠ **レギュラーシーズン中は1日ずつ**。休養日（試合の無い日）も1ターンとして
 *    数える設計なので、そこまでまとめると週の長さが変わる。
 */
export function advanceLeagueDay(league, operationId, now) {
  requireOnline(league.status === 'running', '現在は進行を停止しています', 409);
  // 最後に captureWorld() で差し替えるので、写しの複製は要らない
  loadLeagueWorld(league, { take: true });
  advanceOneDay(league, `day:${operationId}`, now);
  for (let n = 1; n <= IDLE_DAYS_PER_TICK && idleDay(league); n++)
    advanceOneDay(league, `day:${operationId}:${n}`, now);
  if (league.status === 'running')
    league.nextAdvanceAt = nextProgressionAt(now);
  league.notices = league.notices.slice(0, 20);
  league.game = captureWorld();
}

function advanceOneDay(league, key, now) {
  seeded(league, key, () => {
    const oldDate = league.season.currentDate;
    const playingTeams = new Set(
      getScheduleByDate(league.season.schedule, oldDate)
        .filter((game) => !game.result)
        .flatMap((game) => [game.home, game.away]),
    );
    const restoreRotations = league.season.settings.teamNames
      .filter((name) => playingTeams.has(name))
      .map((name) => prepareDailyLineup(TEAMS_DATA[name], name));
    let season;
    try {
      season = simulateScheduledGamesOnDate(
        league.season,
        // ⚠ 観戦記録は既定で残さない（容量）。`ONLINE_RECORD_REPLAY=1` で有効
        createRecorder(league, TEAMS_DATA, {
          replay: process.env.ONLINE_RECORD_REPLAY === '1',
        }),
        PLAYOFF_REPLAY,
      ).data;
    } finally {
      for (const restore of restoreRotations) restore();
    }
    slimStoredResults(season);
    season = progressDate(season, 1);
    simulateParallelWorldDate(oldDate);
    advanceBackgroundTournaments(oldDate);
    if (
      oldDate.month !== season.currentDate.month &&
      [6, 8, 10].includes(season.currentDate.month)
    )
      updateAllTeamReputations(season);
    if (league.season.phase !== season.phase) {
      // ⚠ **プレーオフは1部の球団だけで組む**。順位表は全12球団を通した並びなので、
      //    そのままだと2部の首位がプレーオフに出て優勝できてしまう（実測で起きた）。
      //    出場できる球団は**その場で渡すだけ**にして保存には残さない。
      //    保存の形を変えずに済み、昇降格のたびに書き直す必要もない。
      const settings = season.settings;
      season = handlePhaseTransition(
        {
          ...season,
          settings: { ...settings, playoffTeamNames: topTierTeamNames(league.teams) },
        },
        season.phase,
      );
      season.settings = settings;
    }
    schedulePlayoffReplay(season);
    league.season = season;
    const { month, day, year } = season.currentDate;
    generateBackgroundTournaments(season.currentDate);
    if (month === 8 && day >= 15 && !season._koshienDone) {
      simulateKoshien(season.year);
      season._koshienDone = true;
    }
    if (month === 10 && day >= 21 && !season.grandChampionship?.generated) {
      const champion = getPlayoffChampion(season.schedule, PLAYOFF_REPLAY);
      if (champion) {
        const gc = generateGrandChampionship(
          'shikoku',
          season.standings,
          season.settings,
          season.year,
          champion,
        );
        if (gc) {
          autoPlayGrandChampionship(gc);
          if (league.records?.seasons?.[season.year])
            league.records.seasons[season.year].grandChampionshipExcluded =
              true;
          season.grandChampionship = gc;
        }
      }
    }
    // その年の成績を確定する（比較値・タイトル・最終順位）。
    //
    // ⚠ **NPBドラフトは行わない**（オンラインだけ。一人用はそのまま）。
    //    ドラフトは12球団から良い選手をNPBへ引き抜く処理で、育てた選手が
    //    手元から消える。長く続ける対人リーグでは、抜かれた側に取り返す手段が
    //    無いので外した。
    // ⚠ **確定の処理は残すこと**。同じ日に動いていたので一緒に消しやすいが、
    //    これが無いとタイトルも最終順位も年度の記録に残らない。
    // ⚠ 日付はNPBのドラフト日のまま（一人用と同じ暦で動かすため）。
    //    印の名前（`_draftDone`）も**保存の形を変えないため旧名のまま**。
    //    いまの意味は「その年の成績を確定したか」。
    if (month === 10 && day === getNPBDraftDay(year) && !season._draftDone) {
      freezeComparison(league);
      season.frozenAwards = processSeasonEnd(season, TEAMS_DATA);
      season.finalRankings = snapshotRankings(
        TEAMS_DATA,
        season.settings.teamNames,
      );
      season._draftDone = true;
    }
    if (month === 11 && day === 9) openPhase(league, 'contract', now);
    else if (month === 11 && day === 10) openPhase(league, 'tryout', now);
    // ⚠ **年度更新は決めることが無いので、開いたその場で済ませる**
    //    （いしだ指摘: 押す意味の無い「決定」が「何をすればいいか分からない」を
    //    生んでいた）。以前は土曜21時〜24時の4時間を手続きとして待っていた。
    //    済ませると続けてキャンプが開く（`resolvePhase`）ので、キャンプが長くなる。
    // ⚠ 手続きとして開いてから解決する（`resolvePhase` の流れを1本に保つ）。
    //    古い保存で年度更新が開いたままのリーグは、従来どおり決定か締め切りで進む
    else if (month === 11 && day === 30) {
      openPhase(league, 'offseason', now);
      resolvePhase(league, now);
    }
  });
}

/**
 * 締め切りを過ぎたフェーズを、未提出の人に既定案を当てて解決する。
 *
 * ⚠ **非同期で遊ぶゲームなので、待ち続けてはいけない**。1人が決めないと
 *    全員の週が止まる。既定案（`defaultPhasePlan`）はAIの選び方そのものなので、
 *    放置しても不利になりすぎない。
 * ⚠ 解決すると次のフェーズが開くことがある（契約更改→トライアウト→オフシーズン）。
 *    そちらの締め切りも過ぎていれば、同じティックで続けて解決する。
 */
/**
 * 手続きを**いま**締め切る（検証用）。未提出の人には標準案を当てる。
 * ⚠ 締め切り時刻を `now` に書き換えてから通常の自動決定に渡す。
 *    解決の手順を2本に分けると、片方だけ直したときに食い違う。
 */
export function resolvePhaseNow(league, now) {
  requireOnline(league.phase, '決定待ちの手続きはありません', 409);
  league.phase.deadline = now;
  return autoResolvePhase(league, now);
}

export function autoResolvePhase(league, now) {
  loadLeagueWorld(league);
  const resolved = [];
  // ⚠ 上限を置く。開く→解決の繰り返しが想定外に続いても回り続けない
  for (let guard = 0; guard < 10; guard++) {
    const phase = league.phase;
    if (!phase?.deadline || phase.deadline > now) break;
    const id = phase.id;
    resolved.push(phase.kind);
    for (const member of league.members) {
      if (league.phase?.id !== id) break;
      const saved = phase.submissions[member.userId];
      if (saved?.ready) continue;
      // ⚠ **保存した下書きがあれば、それで決める**。以前は下書きを捨てて標準案で
      //    決めていたため、契約更改で「誰も解雇しない」と下書きを保存したまま
      //    締め切りを迎えた球団が、標準案どおりに選手を解雇されていた。
      //    下書きが今は通らない（検証で弾かれる）ときだけ標準案に戻す。
      // ⚠ 検証は記録を書き換える前に済むので、弾かれても状態は汚れない。
      if (saved?.plan) {
        try {
          submitPhase(
            league,
            member.userId,
            { phaseId: id, plan: saved.plan, ready: true },
            now,
          );
          continue;
        } catch (error) {
          if (league.phase?.id !== id || league.phase.submissions[member.userId]?.ready)
            throw error;
        }
      }
      submitPhase(
        league,
        member.userId,
        { phaseId: id, plan: defaultPhasePlan(league, member.teamName), ready: true },
        now,
      );
    }
    if (league.phase?.id === id) break; // 誰も居ない等で解決しなかった
  }
  return resolved;
}
