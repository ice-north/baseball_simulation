// 采配の試合（一人用で自分で采配する試合）の CPU の采配。
//
// 決まりそのものは自動の試合と同じ cpuTactics.js を使う（2026-11-24 に1本化。
// 以前は aiManager.js という別の決まりがあり、継投の時機・守備固め・代打が違っていた）。
// 采配の試合の状態は React の state（選手は isStarter / hasSubbedOut / stats.pitching を持つ）
// なので、ここで自動の試合の形の写しを作り、cpuTactics の判断を写しの上で走らせ、
// 変わった選手だけを画面の state へ戻す形（updates）にして返す。
//
// 自動の試合は試合の中で持ち続ける帳簿（救援の記録・先発のダメージ・登板順など）を
// gameState に持つ。采配の試合では同じものを `createManagedTacticsMemory()` の箱に持ち、
// useManagedGame.jsx が ref で1試合のあいだ持ち続ける。
//
// 呼ぶ所（useManagedGame.jsx の throwPitch・handleBunt）:
//   - 1球ごと: staminaOf で投げる前のスタミナを読み、投げたら setStamina
//   - 打席が終わったら noteAtBatEnd、半イニングが終わったら noteHalfInningEnd
//   - 投げる前に runManagedTactics。交代があればその球は投げずに交代だけを反映する
//     （自動の試合も、交代は打席の頭・半イニングの後に行う）
import { createCpuTactics } from './cpuTactics.js';
import { TEAMS_DATA, LEAGUE_SETTINGS } from '../teams-data.js';

const SIDES = ['home', 'away'];
const blankTrack = () => ({
  starterLeftInning: null, currentRelieverId: null, relieverOutsPitched: 0, relieverBattersFaced: 0,
});

/** 1試合ぶんの帳簿（試合の頭で作り直す） */
export const createManagedTacticsMemory = () => ({
  // 打席の通し番号。打席の頭の判断（代打・打席の間の継投）は1打席に1回だけ
  atBatSeq: 0,
  decidedSeq: -1,
  // 半イニングが終わって、次の球の前に半イニングの後の処理（継投・守備固め）が要る
  halfInningPending: false,
  reliefTracking: { home: blankTrack(), away: blankTrack() },
  inningStartRuns: { home: 0, away: 0 },
  starterDamagePoints: { home: 0, away: 0 },
  pitcherAppearances: { home: [], away: [] },
  pendingPitcherChange: { home: null, away: null },
  pitcherPinchHit: { home: null, away: null },
  pitcherChanges: [],
  removedIds: new Set(),
  // いまマウンドにいる投手（人の交代に気づくため）
  pitcherIds: { home: null, away: null },
  // 投手ごとの残りスタミナ（自動の試合の currentStamina）。⚠ 以前の采配の試合は
  //   両球団の投手で1つのスタミナを使い回していた
  stamina: {},
  registeredCatchers: null,
  startingCatchers: null,
});

/** 試合に入るときのスタミナ（疲労で上限が下がる。最低50%。自動の試合と同じ） */
export const startStaminaOf = (p) => {
  const maxStamina = p?.pitching?.stamina || 100;
  return Math.max(Math.floor(maxStamina * 0.5), maxStamina - (p?.fatigue || 0));
};

export const staminaOf = (memory, p) =>
  (p && memory.stamina[p.id] != null ? memory.stamina[p.id] : startStaminaOf(p));

export const setStamina = (memory, p, value) => {
  if (p) memory.stamina[p.id] = value;
};

/**
 * 打席が終わった。先発のダメージ（単打・四死球4、長打6、失点1につき10。自動の試合と同じ）と
 * 救援の対戦打者数を積む。
 */
export const noteAtBatEnd = (memory, { defenseSide, pitcherId, kind, runs = 0 }) => {
  memory.atBatSeq++;
  const track = memory.reliefTracking[defenseSide];
  const damage = (kind === 'walk' || kind === 'single' ? 4
    : kind === 'double' || kind === 'triple' || kind === 'homerun' ? 6 : 0) + runs * 10;
  if (!track.currentRelieverId && damage > 0) memory.starterDamagePoints[defenseSide] += damage;
  if (track.currentRelieverId === pitcherId) track.relieverBattersFaced++;
};

export const noteHalfInningEnd = (memory) => {
  memory.atBatSeq++;
  memory.halfInningPending = true;
};

const currentPitcherOf = (team) =>
  team?.players?.find(p => p.isStarter && p.position === 'pitcher') || null;

// 画面の選手 → 自動の試合の形
const snapshotPlayer = (memory, p) => {
  const s = {
    ...p,
    battingOrder: p.isStarter ? (p.battingOrder || 0) : 0,
    currentStamina: staminaOf(memory, p),
    gameStats: {
      batting: { ...(p.stats?.batting || {}) },
      pitching: { outs: 0, pitches: 0, runsAllowed: 0, ...(p.stats?.pitching || {}) },
    },
  };
  if (!p._isDH) delete s._isDH;
  return s;
};

const snapshotTeam = (memory, team) => ({
  name: team.name,
  currentBatterOrder: team.currentBatterOrder || 1,
  strategy: team.strategy,
  pitchingRotation: TEAMS_DATA[team.name]?.pitchingRotation,
  players: team.players.map(p => snapshotPlayer(memory, p)),
});

/**
 * CPU の采配を1回走らせる。
 * @param {object} a
 * @param {object} a.memory createManagedTacticsMemory の箱
 * @param {object} a.homeTeam / a.awayTeam 画面の state
 * @param {{home:boolean, away:boolean}} a.controls どちらの球団を CPU が采配するか
 * @returns {{changed:boolean, updates:{home:Map, away:Map}, messages:string[]}}
 *   updates は選手の id → 画面の state に上書きする項目
 */
export const runManagedTactics = ({ memory, homeTeam, awayTeam, inning, isTopInning, outs, score, bases, controls }) => {
  const teams = { home: homeTeam, away: awayTeam };
  const snap = { home: snapshotTeam(memory, homeTeam), away: snapshotTeam(memory, awayTeam) };

  // 人が投手を代えていたら、救援の登板として帳簿に入れる
  const currentPitcherId = {};
  for (const side of SIDES) {
    const id = currentPitcherOf(teams[side])?.id ?? null;
    currentPitcherId[side] = id;
    const prev = memory.pitcherIds[side];
    if (prev != null && id != null && prev !== id) {
      memory.pitcherAppearances[side].push({ id, entryInning: inning, entryIsTop: isTopInning, entryScore: { ...score }, isStarter: false });
      const track = memory.reliefTracking[side];
      if (!track.starterLeftInning) track.starterLeftInning = inning;
      track.currentRelieverId = id;
      track.relieverOutsPitched = 0;
      track.relieverBattersFaced = 0;
      memory.removedIds.add(prev);
      // この回の失点の基準を救援自身の失点に置き直す（cpuTactics の bringInReliever と同じ）
      const entering = teams[side].players.find(p => p.id === id);
      memory.inningStartRuns[side] = entering?.stats?.pitching?.runsAllowed || 0;
      // 登板疲労（+50・上限150。CPU の継投の bringInReliever と同じ決まり）。
      // ⚠ 以前は人の継投だけ足しておらず、人が使った救援は翌日も疲れていない扱いだった
      const rotation = TEAMS_DATA[teams[side].name]?.pitchingRotation;
      if (rotation?.reliefFatigue) {
        rotation.reliefFatigue[id] = Math.min(150, (rotation.reliefFatigue[id] || 0) + 50);
      }
    }
    memory.pitcherIds[side] = id;
    for (const p of teams[side].players) if (p.hasSubbedOut) memory.removedIds.add(p.id);
  }

  if (!memory.registeredCatchers) {
    // 登録が捕手の選手（名簿の守備位置）。自動の試合は打順を当てる前の名簿の守備位置で見る
    const all = [...snap.home.players, ...snap.away.players];
    const registered = new Set(SIDES.flatMap(side =>
      (TEAMS_DATA[teams[side].name]?.players || []).filter(x => x.position === 'catcher').map(x => x.id)));
    memory.registeredCatchers = new Set(all.filter(p => registered.has(p.id)
      || (p.originalPosition ?? p.position) === 'catcher').map(p => p.id));
    memory.startingCatchers = new Set(all.filter(p => p.position === 'catcher' && p.battingOrder > 0 && !p._isDH).map(p => p.id));
  }

  const gameState = {
    homeTeam: snap.home, awayTeam: snap.away,
    inning, isTopInning, outs,
    score: { ...score },
    bases: (bases || []).map(b => (b ? { ...(typeof b === 'object' ? b : {}) } : false)),
    currentPitcherId,
    reliefTracking: memory.reliefTracking,
    inningStartRuns: memory.inningStartRuns,
    starterDamagePoints: memory.starterDamagePoints,
    pitcherAppearances: memory.pitcherAppearances,
    pendingPitcherChange: memory.pendingPitcherChange,
    pitcherPinchHit: memory.pitcherPinchHit,
    pitcherChanges: memory.pitcherChanges,
    removedIds: memory.removedIds,
  };
  const keyOf = (team) => (team === gameState.homeTeam ? 'home' : 'away');
  const tactics = createCpuTactics({
    gameState,
    homeTeamName: homeTeam.name, awayTeamName: awayTeam.name,
    useDH: LEAGUE_SETTINGS.useDH,
    registeredCatchers: memory.registeredCatchers,
    startingCatchers: memory.startingCatchers,
    getCurrentPitcher: (team) => team.players.find(p => p.id === gameState.currentPitcherId[keyOf(team)])
      || team.players.find(p => p.position === 'pitcher' && p.battingOrder > 0) || null,
  });
  const changesBefore = memory.pitcherChanges.length;

  // 半イニングの後（自動の試合の simulateInning の終わりと同じ順）
  if (memory.halfInningPending) {
    memory.halfInningPending = false;
    tactics.recoverStarterDamage();
    for (const side of SIDES) tactics.afterHalfInning(snap[side], { allowChanges: !!controls[side] });
    // 半イニングの頭の失点（打席の間の継投の「この回に失点したか」に使う）
    const defSide = isTopInning ? 'home' : 'away';
    const defPitcher = snap[defSide].players.find(p => p.id === gameState.currentPitcherId[defSide]);
    memory.inningStartRuns[defSide] = defPitcher?.gameStats?.pitching?.runsAllowed || 0;
  }

  // 打席の頭（自動の試合の simulateAtBat の頭と同じ順: 代打 → 打席の間の継投）
  if (memory.decidedSeq !== memory.atBatSeq) {
    memory.decidedSeq = memory.atBatSeq;
    const offSide = isTopInning ? 'away' : 'home';
    const defSide = isTopInning ? 'home' : 'away';
    const off = snap[offSide];
    const batter = off.players.find(p => p.battingOrder === off.currentBatterOrder);
    if (controls[offSide] && batter) tactics.considerPinchHitter(off, batter);
    const pitcher = snap[defSide].players.find(p => p.id === gameState.currentPitcherId[defSide]);
    if (controls[defSide] && pitcher) tactics.considerMidInningPitcherChange(snap[defSide], pitcher, gameState);
  }

  // 写しの変化を画面の state の形に戻す
  const updates = { home: new Map(), away: new Map() };
  const messages = [];
  const half = `${inning}回${isTopInning ? '表' : '裏'}`;
  for (const side of SIDES) {
    const before = new Map(teams[side].players.map(p => [p.id, p]));
    const pitcherId = gameState.currentPitcherId[side];
    const entered = [];
    const left = new Map();
    for (const s of snap[side].players) {
      const p = before.get(s.id);
      if (!p) continue;
      const wasOrder = p.isStarter ? (p.battingOrder || 0) : 0;
      const isStarter = s.battingOrder > 0 || s.id === pitcherId;
      const hasSubbedOut = memory.removedIds.has(s.id) && s.id !== pitcherId;
      const upd = {};
      if (isStarter !== !!p.isStarter) upd.isStarter = isStarter;
      if (s.battingOrder !== wasOrder) upd.battingOrder = s.battingOrder;
      if (s.position !== p.position) upd.position = s.position;
      if (!!s._isDH !== !!p._isDH) upd._isDH = !!s._isDH;
      // 守る前に退いた捕手の代打（restoreRealCatcher の印）。戻さないと捕手の守備経験に数えてしまう
      if (s._neverFielded && !p._neverFielded) upd._neverFielded = true;
      if (hasSubbedOut !== !!p.hasSubbedOut) upd.hasSubbedOut = hasSubbedOut;
      if (Object.keys(upd).length) updates[side].set(s.id, upd);
      if (isStarter && !p.isStarter) entered.push(s);
      if (!isStarter && p.isStarter && wasOrder > 0) left.set(wasOrder, p);
    }
    // スタミナ（半イニングの後の回復・救援の登板は満タンで入る。自動の試合と同じ）
    const mound = snap[side].players.find(p => p.id === pitcherId);
    if (mound) memory.stamina[mound.id] = mound.currentStamina;
    memory.pitcherIds[side] = pitcherId;
    // 野手の交代の知らせ（投手の交代は下の pitcherChanges から）
    for (const s of entered) {
      if (s.id === pitcherId) continue;
      const out = left.get(s.battingOrder);
      messages.push(`🔁 [${half}] ${teams[side].name}: ${s.name}${out ? `（${out.name}に代わって）` : ''}`);
    }
  }
  for (const c of memory.pitcherChanges.slice(changesBefore)) {
    messages.push(`⚾ [${half}] ${c.team}: 投手交代 ${c.out} → ${c.in}（${c.role}）【${c.reason}】`);
  }
  const changed = updates.home.size > 0 || updates.away.size > 0;
  return { changed, updates, messages };
};
