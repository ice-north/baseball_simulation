// 新しい見た目（試作）「動きで見る」（`src/online/look/playMotion.js`・`motionDefense.js`・`motionCamera.js`・`motionPose.js`）の検査。
//   node tools/sim-harness/online-motion-check.mjs
//
// 見ること:
//   - 作った場面で、走者の行き先の割り当て（押し出し・併殺・犠飛・本塁打）が野球として正しい
//   - 本物の試合の全打席で、軌跡に NaN が無く時間が戻らない、走者が前の走者を追い越さない、
//     1打席が長すぎない。記録と合う割り当てが見つかる打席が 99% 以上
//   - しぐさ・できごと・文字の時間が場面の中にある。点が入る回数が記録と合う
//   - 守備の持ち場: 送球の先には受ける野手が居る、アウトを取った塁に野手が居る、逸れに備える野手は
//     塁の向こう側に立つ、野手は瞬間移動せずグラウンドの外へ出ない、動きが落ち着いた時に重ならない
//   - 作った場面の総当たり（めったに出ない組み合わせ）でも、落ちずに動きが作れる
//   - カメラが世界の絵からはみ出さず、生きている球がいつも窓の中にある
//   - どの時間でも、全員の姿勢（体の点）が数になる
import assert from 'node:assert/strict';
import { assignRunners, motionOf, basesBeforeOf, sample } from '../../src/online/look/playMotion.js';
import { liveScenes } from '../../src/online/look/playByPlay.js';
import { cameraTrack, cameraAt, poisAt, ballInView, WORLD_W, WORLD_H, VIEW_W, VIEW_H } from '../../src/online/look/motionCamera.js';
import { actorsAt } from '../../src/online/look/motionPose.js';
import { skeleton } from '../../src/online/look/motionFigure.js';
import { BASES, FIELDER_HOME, inGround } from '../../src/online/look/motionField.js';
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
// 打球の記録の無い犠打（サーバーはバントに打球を書かない）: 四球の絵にせず、転がして打者が一塁へ走る
{
  const m = motionOf({ code: '犠', runs: 0, outsBefore: 0, outs: 1, basesAfter: 2, batter: { id: 1, name: 'x' }, batted: null, offense: 'home' }, 1);
  assert.ok(!m.marks.some((k) => k.text === '四球'), 'バントが四球の絵になる');
  const batter = m.runners.find((r) => r.start === 0);
  assert.ok(batter.track.length > 1, 'バントの打者が打席から動かない');
  assert.ok(m.events.some((e) => e.kind === 'out'), 'バントの打者のアウトが出ない');
}
// 一塁でショートゴロ、後も一塁: 一塁走者が二塁で刺され、打者は一塁に生きる（野手選択）。走者が塁に残る読みはしない
assert.equal(targets({ code: '凡', before: 1, after: 1, runs: 0, outs: 1, batter: true, batted: { la: -5 } }), '1>out 0>1');
// 一・二塁でゴロ、後は一・三塁: 一塁走者が二塁で刺される
assert.equal(targets({ code: '凡', before: 3, after: 5, runs: 0, outs: 1, batter: true, batted: { la: -5 } }), '2>3 1>out 0>1');

// ①' 守備の持ち場（作った場面）
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const made = (scene, before = 0) => motionOf({ runs: 0, outsBefore: 0, outs: 0, basesAfter: 0, batter: { id: 1, name: 'x' }, offense: 'home', inning: 1, half: 'b', ...scene }, before);
{
  // 走者なしのショートゴロ: 一塁手が塁で受け、捕手が打者を追って一塁の後ろへ、右翼手も詰める
  const m = made({ code: '凡', outs: 1, batted: { pos: 6, dir: -10, dist: 34, la: -8 } });
  assert.deepEqual(m.throws.map((t) => [t.by, t.who, t.base]), [[6, 3, 1]], 'ショートゴロの送球');
  assert.ok(m.backups.some((b) => b.n === 2 && b.base === 1), '走者なしのゴロで捕手が一塁の後ろへ回らない');
  assert.ok(dist(sample(m.fielders[2], m.settle), FIELDER_HOME[2]) > 8, '捕手が本塁から動いていない');
  assert.ok(m.fielders[9].length > 1 && m.roles[4] === 'cover' && dist(sample(m.fielders[4], m.settle), BASES[2]) < 1, '二塁手が二塁に入っていない');
  // 走者が居れば捕手は本塁を空けない
  const on = made({ code: '凡', outs: 1, basesAfter: 4, batted: { pos: 6, dir: -10, dist: 34, la: -8 } }, 4);
  assert.ok(dist(sample(on.fielders[2], on.settle), FIELDER_HOME[2]) < 3, '三塁に走者が居るのに捕手が本塁を空けた');
}
{
  // 一塁手が塁から離れて捕ったゴロ: 投手が一塁へ入って受ける
  const m = made({ code: '凡', outs: 1, batted: { pos: 3, dir: 28, dist: 40, la: -5 } });
  assert.deepEqual(m.throws.map((t) => [t.by, t.who, t.base]), [[3, 1, 1]], '一塁手のゴロは投手が一塁へ');
}
{
  // 送りバント（打球の記録が無い）: 転がる球を拾い、一塁へ入った二塁手へ。四球の文字を出さない
  const m = made({ code: '犠', outs: 1, basesAfter: 2, batted: null }, 1);
  assert.ok(m.main && m.batter.bunt, 'バントの打球が無い');
  assert.deepEqual(m.throws.map((t) => [t.who, t.base]), [[4, 1]], 'バントは二塁手が一塁へ入る');
  assert.deepEqual(m.marks.map((k) => k.text), ['アウト']);
  assert.ok(dist(sample(m.fielders[6], m.settle), BASES[2]) < 1, 'バントで遊撃手が二塁に入っていない');
  // バント安打とバントの小フライ
  assert.deepEqual(made({ code: '安', basesAfter: 3, batted: null }, 1).marks.map((k) => k.text), ['バントヒット']);
  const pop = made({ code: '凡', outs: 1, basesAfter: 1, batted: null }, 1);
  assert.ok(pop.events.some((e) => e.kind === 'catch') && pop.marks[0].text === 'アウト', 'バントの小フライ');
  // バントの失策（打球の記録の無い失策）: 四球の絵にせず、転がして打者が一塁に生きる
  const err = made({ code: '失', basesAfter: 3, batted: null }, 1);
  assert.ok(err.main && err.batter.bunt && !err.guessed, 'バントの失策の打球が無い');
  assert.ok(err.marks.some((k) => k.text === 'エラー') && !err.marks.some((k) => k.text === '四球'), 'バントの失策の文字');
  assert.equal(err.runners.find((r) => r.start === 0).target, 1, 'バントの失策で打者が一塁に生きない');
}
{
  // 二塁走者が還るセンター前: 一塁手が返球の間に立ち、二塁手が一塁、遊撃手が二塁。投手は本塁の後ろ
  const m = made({ code: '安', runs: 1, basesAfter: 1, batted: { pos: 8, dir: -6, dist: 59, la: 16 } }, 2);
  assert.equal(m.roles[3], 'cut', '本塁への返球の間に一塁手が立っていない');
  assert.ok(dist(sample(m.fielders[4], m.settle), BASES[1]) < 1 && dist(sample(m.fielders[6], m.settle), BASES[2]) < 1, '一塁・二塁が空いた');
  const home = m.throws.find((t) => t.base === 4);
  assert.ok(home && home.who === 2, '本塁への返球が無い');
  assert.ok(m.backups.some((b) => b.n === 1 && b.base === 4), '投手が本塁の後ろへ回っていない');
  assert.ok(home.end > m.runners.find((r) => r.start === 2).homeAt, '生還した走者より先に返球が着いた');
}
{
  // 長打は中継を挟む（外野手 → 中継 → 塁）
  const m = made({ code: '二', basesAfter: 2, batted: { pos: 8, dir: 2, dist: 99, la: 24 } });
  assert.deepEqual(m.throws.map((t) => [t.by, t.who, t.base]), [[8, 4, null], [4, 6, 2]], '長打の中継');
  assert.ok(m.throws[1].end > m.runners[0].track[m.runners[0].track.length - 1][0], '二塁打の打者より先に返球が着いた');
}
{
  // 外野フライ: 捕ったら中継へ返す。チェンジなら返さず、守備が引き上げはじめる
  const fly = { code: '凡', batted: { pos: 8, dir: 0, dist: 77, la: 44 } };
  const m = made({ ...fly, outs: 1 });
  assert.deepEqual(m.throws.map((t) => [t.by, t.base]), [[8, null]], '外野フライの後の返球');
  const last = made({ ...fly, outsBefore: 2, outs: 3 });
  assert.equal(last.throws.length, 0, 'チェンジなのに返球した');
  assert.ok(dist(sample(last.fielders[4], last.duration), sample(last.fielders[4], last.settle)) > 2, 'チェンジで守備が引き上げない');
}
{
  // 併殺くずれ: 二塁で刺した後、一塁へ転送するが打者が先
  const m = made({ code: '凡', outs: 1, basesAfter: 1, batted: { pos: 6, dir: -17, dist: 28, la: -30 } }, 1);
  assert.deepEqual(m.throws.map((t) => [t.by, t.who, t.base]), [[6, 4, 2], [4, 3, 1]], '併殺くずれの送球');
  assert.ok(m.throws[1].end > m.runners.find((r) => r.start === 0).track.find((p) => dist(p.slice(1), BASES[1]) < 0.01)[0], '生きた打者より先に送球が着いた');
}
{
  // 盗塁死: 二塁手が入り、中堅手が前へ詰める。暴投: 投手が本塁へ入る
  const cs = made({ code: '刺', outs: 1, batter: null, batted: null }, 1);
  assert.deepEqual(cs.throws.map((t) => [t.by, t.who, t.base]), [[2, 4, 2]], '盗塁死の送球');
  assert.ok(cs.backups.some((b) => b.n === 8), '盗塁で中堅手が二塁の後ろへ詰めない');
  const wp = made({ code: '走', runs: 1, basesAfter: 0, batter: null, batted: null }, 4);
  assert.deepEqual(wp.throws.map((t) => [t.by, t.who, t.base]), [[2, 1, 4]], '暴投で投手が本塁へ入らない');
}

// 合わない記録は null（動かさずに置く）
assert.equal(assignRunners({ code: '安', before: 0, after: 7, runs: 0, outs: 0, batter: true }), null);

// ② 本物の試合
const games = sampleOnlineGames(24, 'motion');
let scenes = 0;
let matched = 0;
let ballChecks = 0;
let ballLost = 0;
let throwCount = 0;
let backupCount = 0;
let batted = 0;
let movers = 0;
for (const game of games) {
  const list = liveScenes(game);
  list.forEach((scene, i) => {
    scenes++;
    const m = motionOf(scene, basesBeforeOf(list, i));
    if (!m.guessed) matched++;
    const where = `${game.date} ${game.away}-${game.home} ${scene.inning}${scene.half} ${scene.code}`;
    assert.ok(m.duration > 0.5 && m.duration < 25, `1打席が長すぎる・短すぎる（${m.duration.toFixed(1)}秒）: ${where}`);
    for (const tr of [m.ball, ...m.fielders.filter(Boolean), ...m.umpires, ...m.runners.map((r) => r.track)]) {
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
    // 「四球」の文字は四球の打席だけ（打球の無いバントが四球の絵になっていた）
    if (scene.code !== '四') assert.ok(!m.marks.some((k) => k.text === '四球'), `四球でない打席に「四球」: ${where}`);
    // 守備の持ち場
    for (const th of m.throws) {
      throwCount++;
      assert.ok(th.t0 >= 0 && th.end > th.t0 && th.end <= m.duration, `送球の時間: ${where}`);
      assert.ok(dist(sample(m.fielders[th.by], th.t0), th.from) < 1.5, `投げる野手がそこに居ない: ${where} ${th.by}`);
      // 逸れた送球（失策）は受けられない
      if (!th.wild) assert.ok(dist(sample(m.fielders[th.who], th.end), th.to) < 1.5, `送球の先に受ける野手が居ない: ${where} ${th.who} 塁${th.base}`);
    }
    for (const e of m.events) {
      if (e.kind !== 'out' || !e.base) continue;
      const near = Math.min(...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => dist(sample(m.fielders[n], e.t), BASES[e.base % 4])));
      assert.ok(near < 1.6, `アウトを取った塁に野手が居ない: ${where} 塁${e.base}`);
    }
    for (const b of m.backups) {
      backupCount++;
      const base = BASES[b.base % 4];
      // 送球の線の先（塁の向こう側）に立つ
      assert.ok((b.to[0] - base[0]) * (base[0] - b.from[0]) + (b.to[1] - base[1]) * (base[1] - b.from[1]) > 0, `逸れに備える野手が塁の手前に居る: ${where} ${b.n}`);
    }
    for (let n = 1; n <= 9; n++) {
      const tr = m.fielders[n];
      for (let k = 1; k < tr.length; k++) {
        const d = dist(tr[k].slice(1), tr[k - 1].slice(1));
        assert.ok(d < 0.3 || d / Math.max(tr[k][0] - tr[k - 1][0], 1e-6) < 11, `野手が速すぎる（瞬間移動）: ${where} ${n}`);
      }
      for (let t = 0; t <= m.duration; t += 0.5) {
        const p = sample(tr, t);
        assert.ok(dist(p, inGround(p, 0.5)) < 0.05, `野手がグラウンドの外: ${where} ${n}`);
      }
    }
    for (let a = 1; a <= 9; a++)
      for (let b = a + 1; b <= 9; b++)
        assert.ok(dist(sample(m.fielders[a], m.settle), sample(m.fielders[b], m.settle)) > 1, `野手が重なる: ${where} ${a}・${b}`);
    if (scene.batted && scene.code !== '本') {
      batted++;
      movers += m.fielders.filter((tr) => tr && dist(sample(tr, m.settle), tr[0].slice(1)) > 0.5).length;
    }
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
// ③ 作った場面の総当たり: 本物の試合にめったに出ない組み合わせ（満塁のバント・三塁手の前の併殺など）でも、
//    落ちずに動きが作れ、送球の先に受ける野手が居る
const SWEEP_OUTS = { 安: [0, 1], 二: [0, 1], 三: [0, 1], 犠: [1], 四: [0], 死: [0], 振: [1], 凡: [1], 併: [2], 失: [0, 1], 本: [0], 走: [0], 刺: [1] };
const SWEEP_DIR = [0, 0, 0, 30, 14, -30, -14, -28, 0, 28];
let swept = 0;
for (const [code, outsList] of Object.entries(SWEEP_OUTS))
  for (let before = 0; before < 8; before++)
    for (let after = 0; after < 8; after++)
      for (const runs of [0, 1])
        for (const rowOuts of outsList)
          for (const outsBefore of [0, 2]) {
            if (outsBefore + rowOuts > 3 || (code === '走' && !runs)) continue;
            const noBall = ['四', '死', '振', '走', '刺'].includes(code);
            const balls = noBall
              ? [null]
              : [null, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((pos) => (pos <= 6 ? [[30, -8], [22, 50]] : [[58, 4], [84, 30]]).map(([far, la]) => ({ pos, dir: SWEEP_DIR[pos], dist: far, la })))];
            for (const ball of balls) {
              const outs = outsBefore + rowOuts;
              const scene = { code, runs, outsBefore, outs, basesAfter: outs >= 3 ? 0 : after, batted: ball, batter: code === '走' || code === '刺' ? null : { id: 1, name: 'x' }, offense: swept % 2 ? 'home' : 'away', inning: 1 + (swept % 9), half: swept % 2 ? 'b' : 't' };
              const where = `総当たり ${code} 前${before} 後${after} 点${runs} 死${outsBefore}→${outs} ${JSON.stringify(ball)}`;
              const m = motionOf(scene, before);
              if (m.guessed) continue;
              swept++;
              assert.ok(m.duration > 0.5 && m.duration < 30, `長さ: ${where}`);
              for (const tr of [m.ball, ...m.fielders.filter(Boolean), ...m.umpires, ...m.runners.map((r) => r.track)]) {
                for (let k = 1; k < tr.length; k++) assert.ok(tr[k][0] >= tr[k - 1][0], `軌跡の時間が戻る: ${where}`);
                for (const row of tr) assert.ok(row.every(Number.isFinite), `軌跡に数でない値: ${where}`);
              }
              for (const a of m.acts) assert.ok(a.t >= 0 && a.t <= m.duration, `しぐさの時間が場面の外: ${where} ${a.kind}`);
              for (const th of m.throws) {
                assert.ok(dist(sample(m.fielders[th.by], th.t0), th.from) < 1.5, `投げる野手がそこに居ない: ${where} ${th.by}`);
                if (!th.wild) assert.ok(dist(sample(m.fielders[th.who], th.end), th.to) < 1.5, `送球の先に受ける野手が居ない: ${where} ${th.who} 塁${th.base}`);
              }
              for (let n = 1; n <= 9; n++)
                for (let t = 0; t <= m.duration; t += 0.5) {
                  const p = sample(m.fielders[n], t);
                  assert.ok(dist(p, inGround(p, 0.5)) < 0.05, `野手がグラウンドの外: ${where} ${n}`);
                }
            }
          }

// 球は世界の絵の上へ出ることがある（高い飛球）。窓から出るのは全体の 0.5% まで
assert.ok(ballLost / ballChecks <= 0.005, `球が窓から出る（${ballLost} / ${ballChecks}）`);
// 打球が飛んだら、ほとんどの野手がどこかへ動く（持ち場の決まりが抜けたら気づく）
assert.ok(movers / batted >= 7, `打球に動く野手が少ない（1打球あたり ${(movers / batted).toFixed(1)}人）`);
const rate = matched / scenes;
assert.ok(rate >= 0.99, `記録と合う走者の割り当てが少ない（${(rate * 100).toFixed(1)}%）`);
console.log(
  `online-motion-check PASS（${games.length}試合・${scenes}場面・走者の割り当て ${(rate * 100).toFixed(2)}%・球が窓の外 ${ballLost} / ${ballChecks}・送球 ${throwCount}・逸れへの備え ${backupCount}・1打球に動く野手 ${(movers / batted).toFixed(1)}人・総当たり ${swept}場面）`,
);
