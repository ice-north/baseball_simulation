#!/usr/bin/env node
// ============================================================
// 采配の試合（一人用で自分で采配する試合）が自動の試合と同じ計算で動くか
//
// 2026-11-24 に采配の試合の写し（App.jsx の1球の計算・aiManager.js の CPU の采配・
// gameSetup.js の成績の書き戻し）を消して、自動の試合の正本へつないだ。ここでは
// その「つなぎ目」が働くことを見る（画面を開かずに、関数を直接呼ぶ）:
//   ① 1球の計算（pitchEngine.js）が人の指示を受ける: 球種の指定・エンドラン（必ず振る）・待て
//   ② CPU の采配（managedTactics.js → cpuTactics.js）: 球数の上限を越えた先発を代える／
//      人が采配する球団（おまかせを切った自分の球団）は代えない／交代は1打席に1回だけ
//   ③ スタミナは投手ごとに持つ（以前は両球団で1つを使い回していた）
//   ④ 捕手の代打を本職の捕手に戻したとき、代打に「守っていない」印（_neverFielded）が画面の state へ戻る
//   ⑤ 回の途中に入った救援は、この回の失点を自分の失点で数える（CPU の継投・人の継投とも）
//   ⑥ 人の継投でも救援に登板疲労（+50・上限150）が付く（CPU の継投と同じ）
//
// 使い方: node tools/sim-harness/managed-game-check.mjs
// ============================================================
import './lib/bootstrap.mjs';
import assert from 'node:assert/strict';
import { buildLeague, TEAMS_DATA } from './lib/league.mjs';
import { generateAILineup } from '../../src/game/autoSimulation.js';
import { simulatePitch, pitchArsenalOf, fieldDefenseOf } from '../../src/game/pitchEngine.js';
import { createSequence } from '../../src/game/pitchSequence.js';
import { withSeededRandom } from '../../src/game/rng.js';
import {
  createManagedTacticsMemory, runManagedTactics, noteAtBatEnd, noteHalfInningEnd, staminaOf, setStamina, startStaminaOf,
} from '../../src/game/managedTactics.js';
import { isPitcherPlayer } from '../../src/utils/constants.js';

const names = buildLeague(4, 28, 1);
const [homeName, awayName] = names;

// 采配の試合の state の形（gameSetup.js と同じ: isStarter / hasSubbedOut / stats.pitching）
const managedTeam = (name) => {
  const data = TEAMS_DATA[name];
  const starter = generateAILineup(data, name);
  const players = data.players.map(p => ({
    ...p,
    isStarter: (p.battingOrder > 0 && p.battingOrder <= 9) || p.id === starter?.id,
    hasSubbedOut: false,
    originalPosition: p.position,
    gameStats: { atBats: 0, hits: 0 },
  }));
  const pitcher = players.find(p => p.id === starter?.id);
  if (pitcher) { pitcher.position = 'pitcher'; pitcher.isStarter = true; }
  return { name, players, currentBatterOrder: 1 };
};

// ---- ① 1球の計算が人の指示を受ける ----
{
  const home = managedTeam(homeName);
  const away = managedTeam(awayName);
  const pitcher = home.players.find(p => p.isStarter && p.position === 'pitcher');
  const catcher = home.players.find(p => p.isStarter && p.position === 'catcher') || home.players[0];
  const batter = away.players.find(p => p.battingOrder === 1);
  const pitchArsenal = pitchArsenalOf(pitcher);
  const defense = fieldDefenseOf(home, pitcher);
  const throwN = (n, control, seed) => withSeededRandom(seed, () => {
    let swung = 0; const types = new Set();
    for (let i = 0; i < n; i++) {
      const { info } = simulatePitch({
        batterPlayer: batter, pitcherPlayer: pitcher, catcherPlayer: catcher, defense,
        count: { balls: 1, strikes: 1 }, pitcherStamina: pitcher.pitching.stamina,
        bases: [false, false, false], outs: 0, sequence: createSequence(), pitchArsenal, control,
      });
      if (info.swung) swung++;
      types.add(info.pitch?.type);
    }
    return { swung: swung / n, types };
  });
  const base = throwN(600, null, 11);
  const runHit = throwN(600, { swingFloor: 0.92 }, 11);
  const take = throwN(600, { swingMult: 0.55 }, 11);
  assert.ok(runHit.swung > 0.85, `エンドランでも打者が振らない（${runHit.swung.toFixed(2)}）`);
  assert.ok(take.swung < base.swung - 0.05, `「待て」で振る割合が下がらない（${base.swung.toFixed(2)}→${take.swung.toFixed(2)}）`);
  const idx = pitchArsenal.arsenal.length - 1;
  const chosen = throwN(50, { pitchIndex: idx }, 12);
  assert.deepEqual([...chosen.types], [pitchArsenal.arsenal[idx].type], '人が指定した球種を投げていない');
  console.log(`  ① 振る割合 おまかせ ${base.swung.toFixed(2)} / エンドラン ${runHit.swung.toFixed(2)} / 待て ${take.swung.toFixed(2)}、球種の指定 OK`);
}

// ---- ② CPU の采配 ----
const situation = (home, away) => ({
  homeTeam: home, awayTeam: away, inning: 5, isTopInning: true, outs: 0,
  score: { home: 0, away: 0 }, bases: [false, false, false],
});
const tirePitcher = (team) => {
  const p = team.players.find(x => x.isStarter && x.position === 'pitcher');
  p.stats = { pitching: { outs: 12, pitches: 140, runsAllowed: 0 } };
  return p;
};
{
  // 守る側（表なのでホーム）が CPU: 140球の先発を代える
  const home = managedTeam(homeName), away = managedTeam(awayName);
  const tired = tirePitcher(home);
  const memory = createManagedTacticsMemory();
  const r = runManagedTactics({ memory, ...situation(home, away), controls: { home: true, away: true } });
  assert.ok(r.changed, '球数の上限を越えた CPU の先発を代えない');
  const up = r.updates.home;
  assert.equal(up.get(tired.id)?.isStarter, false, '代えた先発がマウンドに残っている');
  const relieverId = [...up.entries()].find(([, u]) => u.isStarter === true && u.position === 'pitcher')?.[0]
    ?? [...up.entries()].find(([, u]) => u.isStarter === true)?.[0];
  assert.ok(relieverId != null, '救援がマウンドに上がっていない');
  assert.ok(r.messages.some(m => m.includes('投手交代') && m.includes('球数制限')), `交代の知らせが無い: ${r.messages.join(' / ')}`);
  // 救援は満タンのスタミナで入る（自動の試合と同じ）
  const reliever = home.players.find(p => p.id === relieverId);
  assert.equal(staminaOf(memory, reliever), reliever.pitching?.stamina || 80, '救援のスタミナが満タンでない');
  // 同じ打席でもう一度呼んでも、もう判断しない（1打席に1回）。画面と同じく交代を反映してから呼ぶ
  const patched = { ...home, players: home.players.map(p => (up.has(p.id) ? { ...p, ...up.get(p.id) } : p)) };
  const again = runManagedTactics({ memory, ...situation(patched, away), controls: { home: true, away: true } });
  assert.equal(again.changed, false, '同じ打席で2回判断した');
  console.log(`  ② CPU の継投: ${r.messages.find(m => m.includes('投手交代'))}`);
}
{
  // 人が采配する球団（おまかせを切った自分の球団）は代えない
  const home = managedTeam(homeName), away = managedTeam(awayName);
  tirePitcher(home);
  const memory = createManagedTacticsMemory();
  const r = runManagedTactics({ memory, ...situation(home, away), controls: { home: false, away: true } });
  assert.equal(r.updates.home.size, 0, '人が采配する球団の投手を CPU が代えた');
  // 打席が進めば、また判断する
  noteAtBatEnd(memory, { defenseSide: 'home', pitcherId: null, kind: 'single', runs: 1 });
  assert.equal(memory.starterDamagePoints.home, 14, `先発のダメージが自動の試合と違う（${memory.starterDamagePoints.home}）`);
  const r2 = runManagedTactics({ memory, ...situation(home, away), controls: { home: true, away: true } });
  assert.ok(r2.changed, '次の打席で判断しない');
}

// ---- ③ スタミナは投手ごと ----
{
  const home = managedTeam(homeName), away = managedTeam(awayName);
  const hp = home.players.find(p => p.isStarter && p.position === 'pitcher');
  const ap = away.players.find(p => p.isStarter && p.position === 'pitcher');
  const memory = createManagedTacticsMemory();
  assert.equal(staminaOf(memory, hp), startStaminaOf(hp));
  setStamina(memory, hp, 10);
  assert.equal(staminaOf(memory, ap), startStaminaOf(ap), 'ホームの投手が投げたら相手の投手のスタミナまで減った');
}

// 画面と同じく、updates を state に重ねる
const applyUpdates = (team, map) => ({
  ...team, players: team.players.map(p => (map.has(p.id) ? { ...p, ...map.get(p.id) } : p)),
});

// ---- ④ 捕手の代打を本職の捕手に戻す ----
{
  let home = managedTeam(homeName);
  const away = managedTeam(awayName);
  const memory = createManagedTacticsMemory();
  // 名簿は毎回くじで作るので、控えに捕手が居なければ控えの野手を1人捕手の登録にする
  const isCatcher = (p) => p.position === 'catcher' || p.originalPosition === 'catcher';
  const benchFielders = () => home.players.filter(p => !p.isStarter && !isPitcherPlayer(p));
  if (!benchFielders().some(isCatcher)) {
    const c = benchFielders()[0];
    if (c) { c.position = 'catcher'; c.originalPosition = 'catcher'; }
  }
  // 最初の呼び出しで登録の捕手・先発の捕手を覚える（ここでは誰も代えない）
  runManagedTactics({ memory, ...situation(home, away), controls: { home: false, away: false } });
  const catcher = home.players.find(p => p.isStarter && p.position === 'catcher');
  const benchCatcher = home.players.find(p => !p.isStarter && memory.registeredCatchers.has(p.id) && !isPitcherPlayer(p));
  const ph = home.players.find(p => !p.isStarter && !memory.registeredCatchers.has(p.id) && !isPitcherPlayer(p));
  assert.ok(catcher && benchCatcher && ph, '捕手の代打の場面を作れない（控えの捕手か控えの野手が居ない）');
  // 捕手に代打（代打がそのまま捕手の守備位置に入った形）
  home = {
    ...home,
    players: home.players.map(p => (p.id === catcher.id ? { ...p, isStarter: false, hasSubbedOut: true }
      : p.id === ph.id ? { ...p, isStarter: true, battingOrder: catcher.battingOrder, position: 'catcher' } : p)),
  };
  noteHalfInningEnd(memory);
  const r = runManagedTactics({ memory, ...situation(home, away), isTopInning: false, controls: { home: true, away: true } });
  const up = r.updates.home;
  assert.equal(up.get(benchCatcher.id)?.battingOrder, catcher.battingOrder, '控えの捕手が捕手の打順に入っていない');
  assert.equal(up.get(ph.id)?._neverFielded, true, '退いた捕手の代打に「守っていない」印が戻らない（捕手の守備経験に数えてしまう）');
  console.log('  ④ 捕手の代打を本職の捕手に戻し、代打は守備経験に数えない');
}

// ---- ⑤⑥ 回の途中に入った救援の失点の基準・人の継投の登板疲労 ----
{
  // CPU の継投: 回の頭の失点が前の投手の3点のままだと、救援が失点しても差が0以下になる
  const home = managedTeam(homeName), away = managedTeam(awayName);
  tirePitcher(home).stats.pitching.runsAllowed = 3;
  const memory = createManagedTacticsMemory();
  memory.inningStartRuns.home = 3;
  const r = runManagedTactics({ memory, ...situation(home, away), controls: { home: true, away: true } });
  assert.ok(r.changed, '球数の上限を越えた CPU の先発を代えない');
  assert.equal(memory.inningStartRuns.home, 0, `CPU の救援のこの回の失点の基準が前の投手のまま（${memory.inningStartRuns.home}）`);
}
{
  // 人の継投
  let home = managedTeam(homeName);
  const away = managedTeam(awayName);
  const memory = createManagedTacticsMemory();
  const controls = { home: false, away: false };
  const starter = home.players.find(p => p.isStarter && p.position === 'pitcher');
  starter.stats = { pitching: { outs: 10, pitches: 60, runsAllowed: 2 } };
  runManagedTactics({ memory, ...situation(home, away), controls });
  memory.inningStartRuns.home = 2;
  const rotation = TEAMS_DATA[homeName].pitchingRotation;
  const reliever = home.players.find(p => !p.isStarter && isPitcherPlayer(p));
  const savedFatigue = rotation.reliefFatigue[reliever.id];
  rotation.reliefFatigue[reliever.id] = 120;
  home = {
    ...home,
    players: home.players.map(p => (p.id === starter.id ? { ...p, isStarter: false, hasSubbedOut: true }
      : p.id === reliever.id ? { ...p, isStarter: true, position: 'pitcher', battingOrder: starter.battingOrder } : p)),
  };
  runManagedTactics({ memory, ...situation(home, away), controls });
  assert.equal(memory.inningStartRuns.home, 0, '人の継投の救援のこの回の失点の基準が前の投手のまま');
  assert.equal(rotation.reliefFatigue[reliever.id], 150, `人の継投で登板疲労が付かない／上限150を越えた（${rotation.reliefFatigue[reliever.id]}）`);
  // 同じ投手のまま呼び直しても、もう足さない
  runManagedTactics({ memory, ...situation(home, away), controls });
  assert.equal(rotation.reliefFatigue[reliever.id], 150);
  rotation.reliefFatigue[reliever.id] = savedFatigue;
  console.log('  ⑤⑥ 回の途中の救援はこの回の失点を自分の失点で数え、人の継投でも登板疲労が付く');
}

console.log('■ 采配の試合: OK（1球の計算は人の指示を受ける / CPU の継投は自動の試合と同じ決まりで、人の球団は代えない / スタミナは投手ごと / 捕手の代打の印 / 救援の失点の基準と登板疲労）');
