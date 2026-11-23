// 捕手と先発ローテの穴の検査（10年の長期シミュで見つけた3件の直し）。
//   - 捕手に代打を出したら、次の守備で控えの捕手が入る（代打の野手がマスクをかぶり続けない）。
//     守備固め・大差の控え起用でも野手を捕手に回さない
//   - 年度更新の後に捕手0人の対人リーグの球団へ、放出された選手などから捕手を1人補う
//   - 自分で組んだ先発ローテに引退・退団で空いた枠があれば、キャンプの終わりに指導者の案で
//     人が保存した人数まで埋め、お知らせで伝える（守護神・セットアッパーは動かさない）
import { quiet } from './lib/quiet.mjs';
import assert from 'node:assert/strict';
import './lib/bootstrap.mjs';
import {
  createLeague,
  defaultPhasePlan,
  submitPhase,
  fillMissingCatchers,
  refillOwnRotations,
} from '../../server/leagueEngine.mjs';
import { autoSimulateGame } from '../../src/game/autoSimulation.js';
import { TEAMS_DATA } from '../../src/teams-data.js';
import { cleanupPlayerReferences } from '../../src/season/yearProgressionSystem.js';

const NOW = '2026-10-26T15:00:00.000Z';
const league = quiet(() => createLeague({ seed: 7, members: [{ userId: 'a' }], now: NOW }));
for (let i = 0; i < 4 && league.phase; i += 1)
  quiet(() =>
    submitPhase(league, 'a', { phaseId: league.phase.id, plan: defaultPhasePlan(league, league.members[0].teamName), ready: true }, NOW),
  );
const own = league.members[0].teamName;
const names = league.season.settings.teamNames;

// 1. 途中から捕手でない選手がマスクをかぶった打席を数える
{
  let masked = 0, total = 0, withBench = 0;
  for (let g = 0; g < 240; g += 1) {
    const home = names[g % names.length];
    const away = names[(g * 7 + 3) % names.length];
    if (home === away) continue;
    const pos = new Map();
    const benchCatchers = {};
    for (const n of [home, away]) {
      for (const p of TEAMS_DATA[n].players) pos.set(p.id, p.position);
      benchCatchers[n] = TEAMS_DATA[n].players.filter((p) => p.position === 'catcher' && p.isActive !== false).length >= 2;
    }
    const first = new Map();
    quiet(() =>
      autoSimulateGame(home, away, false, 1000 + g, {
        plateAppearance(o) {
          total += 1;
          if (!first.has(o.defense)) first.set(o.defense, o.catcherId);
          if (o.catcherId === first.get(o.defense) || pos.get(o.catcherId) === 'catcher') return;
          masked += 1;
          if (benchCatchers[o.defense === TEAMS_DATA[home].name ? home : away]) withBench += 1;
        },
      }),
    );
  }
  console.log(`途中から捕手でない選手がマスク: ${masked}打席 / ${total}（控えの捕手が居た球団 ${withBench}）`);
  assert.ok(total > 10000, '打席が数えられていない');
  // 直す前は約1.3%（240試合で259打席）。代打で使い切らない・次の守備で戻すので0になる
  assert.ok(masked <= total * 0.001, `途中から野手がマスクをかぶった打席が多い: ${masked}（控えの捕手が居た球団 ${withBench}）`);
}

// 2. 捕手0人の球団に1人補う
{
  const name = names.find((n) => n !== own);
  const team = TEAMS_DATA[name];
  for (const p of team.players.filter((x) => x.position === 'catcher')) cleanupPlayerReferences(team, p.id);
  team.players = team.players.filter((x) => x.position !== 'catcher');
  const before = team.players.length;
  const added = fillMissingCatchers(league, NOW);
  assert.equal(added.length, 1, '捕手を補っていない');
  assert.equal(added[0].team, name);
  assert.equal(team.players.length, before + 1);
  assert.equal(team.players.filter((x) => x.position === 'catcher').length, 1);
  assert.ok((league.transactions || []).some((t) => t.kind === 'signing' && t.teams.includes(name)), '入団の履歴に無い');
  // 捕手の居る球団には足さない
  assert.equal(fillMissingCatchers(league, NOW).length, 0);
}

// 3. 自分で組んだローテの空き枠を埋める（キャンプの終わりに呼ぶ）
{
  const team = TEAMS_DATA[own];
  const rotation = team.pitchingRotation;
  const size = rotation.starters.length;
  assert.ok(size >= 4, `ローテが短い ${size}`);
  const closer = rotation.closer;
  const setup = [...(rotation.setupMen || [])];
  const gone = rotation.starters.slice(1, 3);
  for (const id of gone) cleanupPlayerReferences(team, id);
  team.players = team.players.filter((p) => !gone.includes(p.id));
  assert.equal(rotation.starters.length, size - 2);
  const kept = [...rotation.starters];
  rotation.plannedStarters = size;
  const filled = refillOwnRotations(league, NOW);
  assert.equal(filled.length, 1);
  assert.equal(rotation.starters.length, size, '前の人数まで埋まっていない');
  assert.deepEqual(rotation.starters.slice(0, kept.length), kept, '残っていた先発の順が変わった');
  assert.equal(rotation.closer, closer, '守護神が動いた');
  assert.deepEqual(rotation.setupMen, setup, 'セットアッパーが動いた');
  const fresh = rotation.starters.slice(kept.length);
  assert.ok(fresh.every((id) => team.players.some((p) => p.id === id && p.position === 'pitcher')), '投手でない・名簿に居ない');
  assert.ok(fresh.every((id) => !(rotation.middleRelievers || []).includes(id)), '中継ぎの欄に残っている');
  const inbox = league.members[0].inbox || [];
  assert.equal(inbox[0]?.type, 'rotationFilled', 'お知らせが無い');
  // 4人で回すと決めた人に5人目は足さない
  rotation.starters.pop();
  rotation.plannedStarters = rotation.starters.length;
  assert.equal(refillOwnRotations(league, NOW).length, 0);
  // 投手起用を任せている人は触らない（指導者が組み直す）
  league.members[0].staffModes = { ...(league.members[0].staffModes || {}), pitching: 'delegate' };
  rotation.plannedStarters = 5;
  rotation.starters.pop();
  assert.equal(refillOwnRotations(league, NOW).length, 0);
}
console.log('online-catcher-rotation-check: OK');
