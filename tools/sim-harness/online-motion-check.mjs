// 新しい見た目（試作）「動きで見る」（`src/online/look/playMotion.js`・`motionCamera.js`・`motionPose.js`）の検査。
//   node tools/sim-harness/online-motion-check.mjs
//
// 見ること:
//   - 作った場面で、走者の行き先の割り当て（押し出し・併殺・犠飛・本塁打）が野球として正しい
//   - 本物の試合の全打席で、軌跡に NaN が無く時間が戻らない、走者が前の走者を追い越さない、
//     1打席が長すぎない。記録と合う割り当てが見つかる打席が 99% 以上
//   - しぐさ・できごと・文字の時間が場面の中にある。点が入る回数が記録と合う
//   - カメラが世界の絵からはみ出さず、生きている球がいつも窓の中にある
//   - どの時間でも、全員の姿勢（体の点）が数になる
import assert from 'node:assert/strict';
import { assignRunners, motionOf, basesBeforeOf, sample } from '../../src/online/look/playMotion.js';
import { liveScenes } from '../../src/online/look/playByPlay.js';
import { cameraTrack, cameraAt, poisAt, ballInView, WORLD_W, WORLD_H, VIEW_W, VIEW_H } from '../../src/online/look/motionCamera.js';
import { actorsAt } from '../../src/online/look/motionPose.js';
import { skeleton } from '../../src/online/look/motionFigure.js';
import { sampleOnlineGames } from './lib/sampleOnlineGames.mjs';

const targets = (args) => assignRunners(args)?.map((r) => `${r.start}>${r.target}`).join(' ');

// ① 作った場面
// 満塁で四球: 全員1つ進み、三塁走者が還る
assert.equal(targets({ code: '四', before: 7, after: 7, runs: 1, outs: 0, batter: true }), '3>4 2>3 1>2 0>1');
// 一塁で二ゴロ併殺: 一塁走者と打者がアウト
assert.equal(targets({ code: '併', before: 1, after: 0, runs: 0, outs: 2, batter: true, batted: { la: 2 } }), '1>out 0>out');
// 三塁で犠飛: 打者アウト、三塁走者が還る
assert.equal(targets({ code: '凡', before: 4, after: 0, runs: 1, outs: 1, batter: true, batted: { la: 35 } }), '3>4 0>out');
// 一・二塁で本塁打: 3人還る
assert.equal(targets({ code: '本', before: 3, after: 0, runs: 3, outs: 0, batter: true, batted: { la: 30 } }), '2>4 1>4 0>4');
// 一塁で二塁打、走者は三塁で止まる
assert.equal(targets({ code: '二', before: 1, after: 6, runs: 0, outs: 0, batter: true, batted: { la: 15 } }), '1>3 0>2');
// 盗塁死（打者なし）
assert.equal(targets({ code: '刺', before: 1, after: 0, runs: 0, outs: 1, batter: false }), '1>out');
// 一塁で二塁打、一塁走者が刺される: 本塁を狙って刺される（シミュの積極進塁と同じ塁）。走者はその塁まで来ている
{
  const m = motionOf(
    { code: '二', runs: 0, outsBefore: 0, outs: 1, basesAfter: 2, batter: { id: 1, name: 'x' }, batted: { pos: 7, dir: -42, dist: 78, la: 7 }, offense: 'home' },
    1,
  );
  const out = m.events.find((e) => e.kind === 'out');
  assert.equal(out?.base, 4, '二塁打で刺された一塁走者の塁');
  const runner = m.runners.find((r) => r.start === 1);
  const [x, y] = sample(runner.track, out.t + 0.3);
  assert.ok(Math.hypot(x, y) < 1.5, '刺された走者が、刺された塁まで来ていない');
  assert.deepEqual(m.marks.map((k) => k.text), ['ツーベース', 'アウト']);
}
// 合わない記録は null（動かさずに置く）
assert.equal(assignRunners({ code: '安', before: 0, after: 7, runs: 0, outs: 0, batter: true }), null);

// ② 本物の試合
const games = sampleOnlineGames(24, 'motion');
let scenes = 0;
let matched = 0;
let ballChecks = 0;
let ballLost = 0;
for (const game of games) {
  const list = liveScenes(game);
  list.forEach((scene, i) => {
    scenes++;
    const m = motionOf(scene, basesBeforeOf(list, i));
    if (!m.guessed) matched++;
    const where = `${game.date} ${game.away}-${game.home} ${scene.inning}${scene.half} ${scene.code}`;
    assert.ok(m.duration > 0.5 && m.duration < 25, `1打席が長すぎる・短すぎる（${m.duration.toFixed(1)}秒）: ${where}`);
    for (const tr of [m.ball, ...m.fielders.filter(Boolean), ...m.runners.map((r) => r.track)]) {
      for (let k = 1; k < tr.length; k++) assert.ok(tr[k][0] >= tr[k - 1][0], `軌跡の時間が戻る: ${where}`);
      for (const row of tr) assert.ok(row.every(Number.isFinite), `軌跡に数でない値: ${where}`);
    }
    // しぐさ・できごと・文字
    for (const a of m.acts) {
      assert.ok(Number.isFinite(a.t) && a.t >= 0 && a.t <= m.duration, `しぐさの時間が場面の外: ${where} ${a.kind}`);
      assert.ok(a.until == null || a.until >= a.t, `しぐさの終わりが始まりより前: ${where} ${a.kind}`);
      assert.ok(a.who >= 1 && a.who <= 9, `しぐさの野手の番号: ${where} ${a.kind}`);
    }
    for (const e of [...m.events, ...m.marks]) assert.ok(Number.isFinite(e.t) && e.t >= 0 && e.t <= m.duration, `できごとの時間が場面の外: ${where} ${e.kind || e.text}`);
    if (!m.guessed) assert.equal(m.scoreTimes.length, scene.runs, `点が入る回数が記録と違う: ${where}`);
    // カメラ
    const track = cameraTrack(m);
    for (const row of track) {
      assert.ok(row.every(Number.isFinite), `カメラに数でない値: ${where}`);
      const [, x, y, zoom] = row;
      assert.ok(zoom >= 1 - 1e-9 && zoom <= 2.8 + 1e-9, `カメラの倍率: ${where} ${zoom}`);
      const hw = VIEW_W / 2 / zoom;
      const hh = VIEW_H / 2 / zoom;
      assert.ok(x >= hw - 1e-6 && x <= WORLD_W - hw + 1e-6 && y >= hh - 1e-6 && y <= WORLD_H - hh + 1e-6, `カメラが絵の外: ${where}`);
    }
    for (let t = 0; t <= m.duration; t += 0.1) {
      const { ball } = poisAt(m, t);
      if (ball) {
        ballChecks++;
        if (!ballInView(cameraAt(track, t), ball)) ballLost++;
      }
    }
    // 姿勢
    for (let t = 0; t <= m.duration; t += 0.3) {
      for (const a of actorsAt(m, t, { offenseHome: scene.offense === 'home' })) {
        assert.ok(a.pos.slice(0, 2).every(Number.isFinite), `人の位置が数でない: ${where} ${a.key}`);
        const body = skeleton(a.pose);
        for (const key of ['hip', 'sh', 'head', 'handA', 'handB', 'footA', 'footB'])
          assert.ok(body[key].every(Number.isFinite), `姿勢が数でない: ${where} ${a.key} ${a.pose.kind} ${key}`);
      }
    }
    // 走者どうしが同じ所に重ならない（行き先が違うのに）
    const safe = m.runners.filter((r) => r.target !== 'out' && r.track.length > 2);
    for (let t = 0; t < m.duration; t += 0.25) {
      for (const a of safe)
        for (const b of safe) {
          if (a.start <= b.start) continue;
          if (a.homeAt != null && t >= a.homeAt) continue;
          const [ax, ay] = sample(a.track, t);
          const [bx, by] = sample(b.track, t);
          assert.ok(!(Math.hypot(ax - bx, ay - by) < 0.01 && t > 0.5 && a.target !== b.target), `走者が重なる: ${where}`);
        }
    }
  });
}
// 球は世界の絵の上へ出ることがある（高い飛球）。窓から出るのは全体の 0.5% まで
assert.ok(ballLost / ballChecks <= 0.005, `球が窓から出る（${ballLost} / ${ballChecks}）`);
const rate = matched / scenes;
assert.ok(rate >= 0.99, `記録と合う走者の割り当てが少ない（${(rate * 100).toFixed(1)}%）`);
console.log(`online-motion-check PASS（${games.length}試合・${scenes}場面・走者の割り当て ${(rate * 100).toFixed(2)}%・球が窓の外 ${ballLost} / ${ballChecks}）`);
