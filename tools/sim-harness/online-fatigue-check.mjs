// オンラインの野手の疲労が、先方の目安どおりに溜まるかを実測する。
//
// ⚠ 先方指摘（2026-11-15）「休養日を増やしたことで疲労が溜まらなくなった。目安は体力80で
//    全試合フル出場可能、体力50で10数試合で休息が必要、体力20で1試合ごとに休息が必要なくらい」。
//    式は `onlineFielderGameFatigue`（src/online/shared.js）。ここは本物の進行（サーバーの1日の処理・
//    疲れた野手の入れ替え `restTiredFielders`・休養日）で、レギュラーが何試合目に初めて休むかと
//    出場の割合を体力の帯ごとに数える。
// ⚠ 回復力や控えの顔ぶれで揺れるので、帯の中央値で見る。幅は実測から決めた（下の各行の注記）。
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './lib/bootstrap.mjs';
import { createTestStore } from './lib/testStore.mjs';
import { LeagueService } from '../../server/leagueService.mjs';
import { defaultPhasePlan } from '../../server/leagueEngine.mjs';
import { onlineFielderGameFatigue, onlineFielderFatigueFor } from '../../src/online/shared.js';

const TURNS = Number(process.env.FATIGUE_TURNS || 60);
const quiet = async (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
};

// 式そのもの（帯の端）
assert.equal(onlineFielderGameFatigue(80), 12);
assert.equal(onlineFielderGameFatigue(50), 15);
assert.equal(onlineFielderGameFatigue(20), 27);
assert.equal(onlineFielderGameFatigue(undefined), 15);
// 3打席（四死球・犠打を含む）から溜まる。代打の1打席では溜まらない
assert.equal(onlineFielderFatigueFor(50, { atBats: 2, walks: 1 }), 15);
assert.equal(onlineFielderFatigueFor(50, { atBats: 1 }), 0);

const dir = await mkdtemp(join(tmpdir(), 'pennant-fatigue-'));
const track = new Map(); // id → { body, recovery, teamGames, games, firstRest, maxFatigue }
try {
  const store = createTestStore(join(dir, 'state.gz'));
  let now = '2026-10-26T15:00:00.000Z';
  const service = new LeagueService(store, {
    members: [{ userId: 'admin', label: '管理者' }],
    adminId: 'admin',
    allowStep: true,
    clock: () => now,
  });
  const sessionId = (await service.login('admin')).sessionId;
  let seq = 0;
  const send = async (type, payload) => {
    const l = (await store.read()).league;
    seq += 1;
    return service.command('admin', sessionId, {
      requestId: `fatigue-${type}-${seq}`,
      revision: l?.revision ?? 0,
      type,
      payload,
    });
  };
  await quiet(() => send('create'));
  for (let i = 0; i < 4; i += 1) {
    const l = (await store.read()).league;
    if (!l.phase) break;
    await send('submit', {
      phaseId: l.phase.id,
      plan: defaultPhasePlan(l, l.members[0].teamName),
      ready: true,
      baseSubmission: null,
    });
  }
  const snapshot = (league) => {
    const out = new Map();
    for (const name of league.season.settings.teamNames) {
      const team = league.game.teams[name];
      const teamGames = Math.max(
        0,
        ...team.players.map((p) => p.seasonStats?.batting?.games || 0),
      );
      for (const p of team.players)
        if (p.position !== 'pitcher')
          out.set(p.id, {
            teamGames,
            games: p.seasonStats?.batting?.games || 0,
            // 打席（打数に四死球・犠打飛を足す）。スタメンかどうかを見る
            pa:
              (p.seasonStats?.batting?.atBats || 0) +
              (p.seasonStats?.batting?.walks || 0) +
              (p.seasonStats?.batting?.hitByPitch || 0) +
              (p.seasonStats?.batting?.sacrificeBunts || 0) +
              (p.seasonStats?.batting?.sacrificeFlies || 0),
            fatigue: p.fatigue || 0,
            body: p.physical?.bodyStamina ?? 50,
            recovery: p.physical?.recovery ?? 50,
          });
    }
    return out;
  };
  let before = snapshot((await store.read()).league);
  for (let i = 0; i < TURNS; i += 1) {
    await quiet(() => send('step'));
    now = new Date(Date.parse(now) + 3600000).toISOString();
    const after = snapshot((await store.read()).league);
    for (const [id, a] of after) {
      const b = before.get(id);
      if (!b) continue;
      const t = track.get(id) || {
        body: a.body,
        recovery: a.recovery,
        teamGames: 0,
        started: 0,
        firstRest: null,
        maxFatigue: 0,
      };
      if (a.teamGames > b.teamGames) {
        t.teamGames += 1;
        // 3打席以上をスタメンとして数え、届かなかった日を「休んだ日」とする。
        // ⚠ 休ませた日も終盤の代打・守備固めで1〜2打席立つことが多い（その日は回復もしない）。
        //    「1打席も立たない日」で数えると休みを見落とす
        const pa = a.pa - b.pa;
        if (b.fatigue >= 80) t.tired = (t.tired || 0) + 1;
        if (b.fatigue >= 80 && pa >= 3) t.tiredStarts = (t.tiredStarts || 0) + 1;
        if (pa > 0 && pa < 3) t.partial = (t.partial || 0) + 1;
        if (pa >= 3) t.started += 1;
        else if (t.started >= 3 && t.firstRest === null) t.firstRest = t.teamGames;
      }
      t.maxFatigue = Math.max(t.maxFatigue, a.fatigue);
      track.set(id, t);
    }
    before = after;
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

// レギュラー（最初の10試合のうち多くに出た選手）を体力の帯で分ける
const regulars = [...track.values()].filter((t) => t.teamGames >= 20 && t.started / t.teamGames >= 0.3);
const median = (list) => {
  const s = [...list].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const bands = [
  ['体力70以上', (b) => b >= 70],
  ['体力45〜60', (b) => b >= 45 && b <= 60],
  ['体力40未満', (b) => b < 40],
];
const rows = bands.map(([label, test]) => {
  const list = regulars.filter((t) => test(t.body));
  return {
    label,
    n: list.length,
    share: median(list.map((t) => t.started / t.teamGames)),
    firstRest: median(list.map((t) => t.firstRest ?? t.teamGames + 1)),
    maxFatigue: median(list.map((t) => t.maxFatigue)),
    tired: list.reduce((n, t) => n + (t.tired || 0), 0),
    tiredStarts: list.reduce((n, t) => n + (t.tiredStarts || 0), 0),
    partial: list.reduce((n, t) => n + (t.partial || 0), 0),
  };
});
for (const r of rows)
  console.log(
    `  ${r.label}: ${r.n}人 スタメン率${r.share?.toFixed(2)} 初めて休んだ試合${r.firstRest} 疲労の最大${r.maxFatigue} 疲れた日${r.tired}(うち先発${r.tiredStarts}) 途中出場${r.partial}`,
  );
const [strong, middle, weak] = rows;
// 体力80前後: ほぼ休まない（控えに回る日もあるので 0.9 以上）
assert.ok(strong.n > 0 && strong.share >= 0.9, `体力の高いレギュラーが休みすぎ: ${strong.share}`);
// 体力50前後: 10数試合で一度休む（早すぎず遅すぎず）
assert.ok(middle.n > 0 && middle.firstRest >= 8 && middle.firstRest <= 30, `体力50前後の初めての休み: ${middle.firstRest}試合目`);
// 体力20前後: 出ては休む（スタメンは6割まで）
if (weak.n > 0) assert.ok(weak.share <= 0.65, `体力の低いレギュラーが出すぎ: ${weak.share}`);
console.log(`■ オンラインの野手の疲労: OK（${TURNS}ターン）`);
