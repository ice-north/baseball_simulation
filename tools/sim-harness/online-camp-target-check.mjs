// キャンプのサブ練習の対象と、人の球団の守備位置の検査（総合監査 2026-11-10 で直したもの）。
//   node tools/sim-harness/online-camp-target-check.mjs
//
// 1. 「変化球練習」で磨く球種は、その投手の持ち球ならどれでも選べる
//    （スプリット・ツーシーム・パームを選ぶと 400 でクールが実行できなかった）
// 2. 人の球団で守備位置を変えた選手に「サブポジ練習」を当てても、守備位置が戻らない
//    （適性への合わせで一塁手に戻り、捕手が0人になることもあった）
import assert from 'node:assert/strict';
import {
  createLeague,
  submitPhase,
  loadLeagueWorld,
  convertPosition,
  validateCampRound,
  runCampRound,
  captureLeagueWorld,
} from '../../server/leagueEngine.mjs';
import { TEAMS_DATA } from '../../src/teams-data.js';
import { CAMP_PITCH_TYPES } from '../../src/online/shared.js';

const NOW = '2026-10-26T15:00:00.000Z';
const quiet = (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
};
const league = quiet(() => createLeague({ members: [{ userId: 'a' }], now: NOW }));
quiet(() =>
  submitPhase(league, 'a', { phaseId: league.phase.id, plan: { packId: league.packs[0].id }, ready: true }, NOW),
);
assert.equal(league.phase?.kind, 'camp', 'セットを選んでもキャンプに入らない');
const name = league.members[0].teamName;
const roster = () => league.game.teams[name].players;

// ------------------------------------------------------------------ 1. 磨く球種
{
  const special = roster().flatMap((p) =>
    p.position === 'pitcher'
      ? (p.pitching?.arsenal || [])
          .filter((a) => a.type !== 'straight' && !CAMP_PITCH_TYPES.includes(a.type))
          .map((a) => [p, a.type])
      : [],
  );
  assert.ok(special.length > 0, '新球種の表に無い球種を持つ投手がいない（検査の前提）');
  for (const [pitcher, type] of special) {
    const plan = validateCampRound(league, name, {
      round: 1,
      policy: { mode: 'recommended' },
      sub: { [pitcher.id]: 'breaking' },
      subTarget: { [pitcher.id]: type },
    });
    assert.equal(plan.subTarget[pitcher.id], type, `${type} を磨く球種に選べない`);
  }
  // 持っていない球種は断る（選手の名前を添える）
  const pitcher = special[0][0];
  const missing = CAMP_PITCH_TYPES.find((t) => !pitcher.pitching.arsenal.some((a) => a.type === t));
  assert.throws(
    () =>
      validateCampRound(league, name, {
        round: 1,
        sub: { [pitcher.id]: 'breaking' },
        subTarget: { [pitcher.id]: missing },
      }),
    new RegExp(`練習の対象が不正です（${pitcher.name}）`),
  );
}

// ------------------------------------------------------------------ 2. 変えた守備位置はサブポジ練習で戻らない
{
  loadLeagueWorld(league);
  const first = TEAMS_DATA[name].players.find((p) => p.position === 'first' && p.isActive !== false);
  assert.ok(first, '一塁手がいない（検査の前提）');
  quiet(() => convertPosition(league, 'a', { playerId: first.id, position: 'catcher' }));
  league.game = captureLeagueWorld();
  for (let round = 1; round <= 2; round += 1) {
    const plan = validateCampRound(league, name, {
      round,
      policy: { mode: 'recommended' },
      sub: { [first.id]: 'subposition' },
      subTarget: { [first.id]: 'left' },
    });
    loadLeagueWorld(league);
    quiet(() => runCampRound(league, name, plan));
    league.game = captureLeagueWorld();
    const after = roster().find((p) => p.id === first.id);
    assert.equal(after.position, 'catcher', `${round}クール目のサブポジ練習で守備位置が戻った`);
  }
}
console.log('online-camp-target-check PASS');
