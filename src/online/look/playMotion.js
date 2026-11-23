// ============================================================
// 新しい見た目（試作）: 「動きで見る」。打席速報の1場面（`playByPlay.js` の `liveScenes`）を、
// 投げる→打つ→打球→野手が追う→送球→走者が進む、の数秒の動きにする。
//
// ⚠ **記録に無いものは推す**。行にあるのは結果・点・アウト・その行の後の塁・打球（守備位置・向き・
//    飛距離・角度）だけ。球数・カウント、誰がどこで刺されたか、走者が何塁で止まったかの途中は無い。
//    走者の行き先は「前の行の後の塁」→「この行の後の塁」を、点とアウトの数に合うように割り当てる
//    （`assignRunners`。合う割り当てが無ければ走者は動かさず最後に塁へ置く）。
// ⚠ 表示専用。保存は何も足さない（版20の `plays` を読むだけ）。
// ⚠ 長さの単位はメートル、時間は秒（×1の速さ）。座標は本塁が原点、x は一塁側が正、y はセンター方向。
// ⚠ ここは「どこへ・いつ」だけを決める（画面の座標を知らない）。カメラは `motionCamera.js`、
//    選手の姿勢は `motionPose.js`、描くのは `motionFigure.js`・`motionStadium.js`・`PlayMotion.jsx`。
// ============================================================

const BASE = 27.43;
const HALF = BASE / Math.SQRT2;
/** 本塁・一塁・二塁・三塁 */
export const BASES = [
  [0, 0],
  [HALF, HALF],
  [0, HALF * 2],
  [-HALF, HALF],
];
/** 向き（-45 三塁線 … 45 一塁線）と距離 → 座標 */
export const at = (dir, dist) => {
  const r = (dir * Math.PI) / 180;
  return [dist * Math.sin(r), dist * Math.cos(r)];
};
/** フェンスまでの距離（両翼100m・中堅122m）。⚠ `sceneArt.js` の図と同じ形 */
export const fenceOf = (dir) => 100 + 22 * Math.cos((Math.abs(dir) * Math.PI) / 90);

/** 守備の定位置（1 投手 … 9 ライト）。0 は使わない */
export const FIELDER_HOME = [
  null,
  [0, 18.4],
  [0, -1.6],
  at(37, 29),
  at(13, 40),
  at(-37, 29),
  at(-13, 40),
  at(-28, 80),
  at(0, 90),
  at(28, 80),
];

const RUN_SPEED = 8.5; // 走者（m/秒）
const STRETCH_SPEED = 9.5; // 先の塁を狙って刺される走者
const TROT_SPEED = 7; // 四球で一塁へ
const HOMER_SPEED = 13; // 本塁打の一周（見やすく速め）
const FIELD_SPEED = 7.5; // 野手
const FIELD_SPRINT = 9.4; // 打球を追う野手の上限
const THROW_SPEED = 32;
const ROLL_SPEED = 30; // ゴロ
/** 投手が球を離す時（その前は振りかぶり） */
export const PITCH_RELEASE = 0.9;
/** 球が本塁に来る時 */
export const CONTACT = 1.3;
/** 守備の位置の番号 */
const P = 1;
const C = 2;
const B1 = 3;
const B2 = 4;
const B3 = 5;
const SS = 6;

const baseAt = (b) => BASES[b % 4];
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a, b, u) => a + (b - a) * u;

/** 打者が出るはずの塁（記号から）。null は打者アウト */
const BATTER_TARGET = { 安: 1, 二: 2, 三: 3, 本: 4, 四: 1, 死: 1, 失: 1, 振: null, 犠: null, 凡: null, 併: null };

/**
 * 走者の行き先を決める。`runners` は `[{ start }]`（0 は打者、1〜3 は塁）。
 * 返すのは各走者の行き先（1〜3 塁・4 本塁・'out'）の配列。合う割り当てが無ければ null。
 */
export function assignRunners({ code, before, after, runs, outs, threeOuts, batter, batted }) {
  const runners = [];
  for (let b = 3; b >= 1; b--) if (before & (1 << (b - 1))) runners.push({ start: b });
  if (batter) runners.push({ start: 0 });
  if (!runners.length) return runs === 0 && outs === 0 ? [] : null;
  const fly = batted && batted.la >= 10;
  const hitBases = { 安: 1, 二: 2, 三: 3, 本: 4 }[code] || 0;
  // 押し出されるか（後ろの塁が全部埋まっている）
  const forced = (start) => {
    if (!batter) return false;
    for (let b = 1; b < start; b++) if (!(before & (1 << (b - 1)))) return false;
    return true;
  };
  const options = runners.map(({ start }) => {
    const list = ['out'];
    for (let b = Math.max(start, batter && start === 0 ? 1 : start); b <= 4; b++) list.push(b);
    return list;
  });
  const costOf = (targets) => {
    let cost = 0;
    targets.forEach((t, i) => {
      const { start } = runners[i];
      if (start === 0) {
        const want = BATTER_TARGET[code];
        if (want === undefined) return;
        if ((want === null) !== (t === 'out')) cost += 10;
        else if (t !== 'out' && t !== want) cost += 4 * Math.abs(t - want);
        return;
      }
      if (t === 'out') {
        // 併殺は押し出された走者、ゴロは押し出された走者が刺されやすい。盗塁死は先の走者
        if (code === '併' && forced(start)) cost += 0.2;
        else if (code === '刺') cost += 0.1 * (3 - start);
        else if (!fly && forced(start) && (code === '凡' || code === '犠')) cost += 1;
        else cost += 3;
        return;
      }
      const adv = t - start;
      let want = 0;
      if (hitBases) want = hitBases;
      else if (code === '四' || code === '死') want = forced(start) ? 1 : 0;
      else if (code === '走') want = 1;
      else if (code === '失' || code === '犠') want = 1;
      else if (code === '凡' || code === '併') want = fly ? (start === 3 ? 1 : 0) : forced(start) ? 1 : 0;
      cost += Math.abs(adv - want) * (adv < want && (code === '四' || code === '死') && forced(start) ? 10 : 1);
    });
    return cost;
  };
  let best = null;
  let bestCost = Infinity;
  const pick = (i, targets) => {
    if (i === runners.length) {
      const home = targets.filter((t) => t === 4).length;
      const out = targets.filter((t) => t === 'out').length;
      if (home !== runs || out !== outs) return;
      // 塁は重ならず、後ろの走者は前の走者を追い越さない（本塁に入った人どうしは別）
      let lead = 5;
      let mask = 0;
      for (const t of targets) {
        if (t === 'out') continue;
        if (t === 4) {
          if (lead !== 5 && lead !== 4) return;
          lead = 4;
          continue;
        }
        if (t >= lead) return;
        lead = t;
        mask |= 1 << (t - 1);
      }
      if (!threeOuts && after != null && mask !== after) return;
      const cost = costOf(targets);
      if (cost < bestCost) {
        bestCost = cost;
        best = [...targets];
      }
      return;
    }
    for (const t of options[i]) {
      targets.push(t);
      pick(i + 1, targets);
      targets.pop();
    }
  };
  pick(0, []);
  return best ? best.map((target, i) => ({ start: runners[i].start, target })) : null;
}

/** 走者が塁を回る道（start → target。target が 'out' なら刺された塁 `outBase` まで） */
function basePath(start, end) {
  const pts = [];
  for (let b = start; b <= end; b++) pts.push(BASES[b % 4]);
  return pts;
}

/** 道に沿って、出発 `t0` から速さ `speed` で進む軌跡。`stopAt` の手前で止まる（刺される） */
function runTrack(points, t0, speed, stopShort = 0) {
  const track = [[0, ...points[0], 0], [t0, ...points[0], 0]];
  let t = t0;
  for (let i = 1; i < points.length; i++) {
    let p = points[i];
    const last = i === points.length - 1;
    const prev = points[i - 1];
    let len = dist2(prev, p);
    if (last && stopShort > 0) {
      const u = Math.max(0, (len - stopShort) / len);
      p = [lerp(prev[0], p[0], u), lerp(prev[1], p[1], u)];
      len *= u;
    }
    t += len / speed;
    track.push([t, ...p, 0]);
  }
  return track;
}

/** 軌跡を時間 `t` で読む（[t, x, y, z] の並び。前後は端の値） */
export function sample(track, t) {
  if (!track || !track.length) return null;
  if (t <= track[0][0]) return track[0].slice(1);
  for (let i = 1; i < track.length; i++) {
    const [t1, ...b] = track[i];
    if (t <= t1) {
      const [t0, ...a] = track[i - 1];
      const u = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
      return a.map((v, k) => lerp(v, b[k], u));
    }
  }
  return track[track.length - 1].slice(1);
}

/** 空を飛ぶ球の軌跡（放物線を細かく区切る） */
function flightTrack(from, to, t0, dur, peak, z0 = 1, z1 = 0, n = 14) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    out.push([t0 + dur * u, lerp(from[0], to[0], u), lerp(from[1], to[1], u), lerp(z0, z1, u) + 4 * peak * u * (1 - u)]);
  }
  return out;
}

/** 地面を弾みながら転がる球（弾みはだんだん低く） */
function hopTrack(from, to, t0, dur, z0 = 0.8, first = 0.5) {
  const steps = [
    [0, z0],
    [0.16, 0.06],
    [0.34, first],
    [0.52, 0.06],
    [0.68, first * 0.45],
    [0.84, 0.06],
    [1, 0.12],
  ];
  return steps.map(([u, z]) => [t0 + dur * u, lerp(from[0], to[0], u), lerp(from[1], to[1], u), z]);
}

/** 送球（低い弧） */
function throwTrack(from, to, t0) {
  const d = dist2(from, to);
  const dur = Math.max(0.25, d / THROW_SPEED);
  return { track: flightTrack(from, to, t0, dur, Math.min(4.5, d / 18), 1.7, 1.3, 8), end: t0 + dur };
}

/** 塁に入る野手（一塁＝一塁手、二塁＝打球の逆側の二遊間、三塁＝三塁手、本塁＝捕手）。捕った人が自分なら投手 */
function coverOf(base, fielder, dir) {
  const want = base === 1 ? B1 : base === 2 ? (dir < 0 ? B2 : SS) : base === 3 ? B3 : C;
  if (want !== fielder) return want;
  return base === 2 ? (want === B2 ? SS : B2) : P;
}

/** 塁を離れて構える所（次の塁へ数歩） */
function leadPoint(b) {
  const from = BASES[b];
  const to = BASES[(b + 1) % 4];
  const len = b === 3 ? 2.2 : 3.2;
  const d = dist2(from, to);
  return [from[0] + ((to[0] - from[0]) / d) * len, from[1] + ((to[1] - from[1]) / d) * len];
}

/** 軌跡を `tMax` で切る（その時の位置で止まる） */
function cutTrack(track, tMax) {
  if (track[track.length - 1][0] <= tMax) return track;
  const kept = track.filter((p) => p[0] < tMax);
  kept.push([tMax, ...sample(track, tMax)]);
  return kept;
}

const HOMER_SUB = ['', 'ソロ', 'ツーラン', 'スリーラン', '満塁'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 1場面の動き。
 * @param scene `liveScenes` の1つ
 * @param before その場面の前の塁（前の場面の `basesAfter`。半回の頭は0）
 * @returns
 *   - `duration` 全体の長さ、`settle` 動きが落ち着く時
 *   - `ball` 球の軌跡、`fielders` 守備9人の軌跡（1〜9）
 *   - `runners` `[{ start, target, track, outAt, homeAt, slide: [t0, t1] | null, appear }]`（start 0 は打者）
 *   - `batter` `{ swingAt, bunt, walk, hbp }` | null
 *   - `acts` 野手のしぐさ `[{ t, who, kind, to, until }]`（kind: receive・scoop・catch・catch-high・throw・tag・stretch・dive）
 *   - `events` 絵の効果 `[{ t, kind, x, y, z, base }]`（kind: contact・bounce・catch・slide・out・score・homer・punch・hbp）
 *   - `marks` 大きな文字 `[{ t, text, tone, sub }]`（tone: out・hit・run・homer・walk・error）
 *   - `scoreTimes` 点が入る時、`main` 打球を捕る野手と時、`guessed` 走者の割り当てが合わず動かさずに置いたとき true
 */
export function motionOf(scene, before = 0) {
  const { code, batted } = scene;
  const rowOuts = Math.max(0, (scene.outs || 0) - (scene.outsBefore || 0));
  const hasBatter = code !== '走' && code !== '刺';
  const assigned = assignRunners({
    code,
    before,
    after: scene.basesAfter,
    runs: scene.runs || 0,
    outs: rowOuts,
    threeOuts: (scene.outs || 0) >= 3,
    batter: hasBatter,
    batted,
  });
  const fielders = FIELDER_HOME.map((p) => (p ? [[0, p[0], p[1], 0]] : null));
  const lastOf = (n) => fielders[n][fielders[n].length - 1];
  // 野手を動かす（`t1` に着く。前の動きが終わってから。時間は戻さない）
  const move = (n, to, t0, t1) => {
    const tr = fielders[n];
    const last = tr[tr.length - 1];
    const start = Math.max(t0, last[0]);
    if (start > last[0]) tr.push([start, last[1], last[2], 0]);
    tr.push([Math.max(t1, start + 0.05), to[0], to[1], 0]);
  };
  // 野手を速さ `speed` で `to` へ。着く時を返す
  const runTo = (n, to, t0, speed = FIELD_SPEED) => {
    const last = lastOf(n);
    const start = Math.max(t0, last[0]);
    const d = dist2([last[1], last[2]], to);
    if (d < 0.4) return start;
    move(n, to, start, start + d / speed);
    return start + d / speed;
  };
  const acts = [];
  const events = [];
  const marks = [];
  const plate = [0, 0.6];
  const mound = FIELDER_HOME[P];
  const release = [0.35, mound[1] - 1.5];
  // 四球は外へ外れる球、死球は打者へ
  const pitchTo = code === '四' ? [0.85, 0.2] : code === '死' ? [-0.95, 0.5] : plate;
  // 球: 投手の手の中 → 投球
  const ball = [[0, mound[0] + 0.3, mound[1], 1.3], [PITCH_RELEASE - 0.02, release[0], release[1], 1.9]];
  ball.push(...flightTrack(release, pitchTo, PITCH_RELEASE, CONTACT - PITCH_RELEASE, 0.25, 1.9, code === '死' ? 1.25 : 0.9, 6));
  let tAfter = CONTACT;
  /** 刺す走者と時間（送球が着いたとき） */
  const outsAt = new Map();
  let swingAt = null;
  let main = null; // 打球を捕る野手と時
  let holder = null; // 最後に球を持っている野手 { at, t, by }
  let catchT = null; // フライを捕った時
  let hitT = null;
  const runnerStart = hasBatter ? CONTACT + 0.12 : CONTACT;

  const ground = !!batted && (batted.la < 10 || code === '犠');
  const hit = code === '安' || code === '二' || code === '三';
  const caughtFly = !!batted && !ground && !hit && code !== '失' && code !== '本';
  const mainPos = batted ? (batted.pos >= 1 && batted.pos <= 9 ? batted.pos : 8) : null;
  const outRunners = (assigned || []).filter((r) => r.target === 'out');
  // 捕られたライナー・内野フライで飛び出した走者は元の塁で刺される。ほかは次の塁（盗塁死は盗んだ塁）。
  // 安打で刺された走者は、先の塁を狙って刺される（`stretchBase`。打球を拾った所と時が決まってから入れる）
  const doubledOff = (r) => caughtFly && r.start > 0 && (batted.la < 25 || mainPos <= 6);
  const stretchBase = new Map();
  const outBaseOf = (r) => stretchBase.get(r) ?? (doubledOff(r) ? r.start : Math.min(4, r.start + 1));
  /** 走者が塁 `base` に着く時（先の塁を狙って全力で走る） */
  const arriveAt = (r, base) => {
    const path = basePath(r.start, base);
    if (r.start > 0) path[0] = leadPoint(r.start);
    let len = 0;
    for (let i = 1; i < path.length; i++) len += dist2(path[i - 1], path[i]);
    return runnerStart + len / STRETCH_SPEED;
  };

  if (!hasBatter) {
    const stealer = outRunners[0];
    if (code === '刺' && stealer) {
      // 盗塁死: 捕手が捕って刺す塁へ投げる
      const base = outBaseOf(stealer);
      const cover = coverOf(base, C, 0);
      acts.push({ t: CONTACT, who: C, kind: 'receive' });
      runTo(cover, baseAt(base), PITCH_RELEASE - 0.2, FIELD_SPRINT);
      const t0 = CONTACT + 0.25;
      const th = throwTrack([0, -1], baseAt(base), t0);
      ball.push([t0 - 0.02, 0, -1, 1.5], ...th.track);
      acts.push({ t: t0, who: C, kind: 'throw', to: baseAt(base), until: th.end });
      acts.push({ t: th.end, who: cover, kind: 'tag', from: plate });
      outsAt.set(stealer, th.end);
      events.push({ t: th.end, kind: 'out', base });
      marks.push({ t: th.end + 0.05, text: 'アウト', tone: 'out' });
      tAfter = th.end;
    } else {
      // 暴投・捕逸など: 球が後ろへそれる
      const loose = [3.6, -9.5];
      ball.push(...hopTrack(pitchTo, loose, CONTACT, 0.7, 0.5, 0.35));
      events.push({ t: CONTACT + 0.1, kind: 'bounce', x: 0.5, y: -1.2 });
      const got = runTo(C, loose, CONTACT + 0.2, FIELD_SPEED);
      ball.push([Math.max(got, CONTACT + 0.72), loose[0], loose[1], 0.12]);
      acts.push({ t: got, who: C, kind: 'scoop' });
      holder = { at: loose, t: got + 0.2, by: C };
      tAfter = got;
    }
  } else if (!batted) {
    // 打球の無い打席（三振・四球・死球）
    if (code === '死') {
      ball.push([CONTACT + 0.4, -0.5, 1.4, 0.05]);
      events.push({ t: CONTACT, kind: 'hbp', x: -0.95, y: 0.5 });
      marks.push({ t: CONTACT + 0.12, text: '死球', tone: 'walk' });
    } else {
      acts.push({ t: CONTACT, who: C, kind: 'receive' });
      ball.push([CONTACT + 0.06, pitchTo[0] * 0.6, -1.1, 0.9]);
      if (code === '振') {
        swingAt = CONTACT - 0.07;
        events.push({ t: CONTACT + 0.15, kind: 'punch' });
        marks.push({ t: CONTACT + 0.15, text: '三振', tone: 'out' });
      } else {
        marks.push({ t: CONTACT + 0.15, text: '四球', tone: 'walk' });
      }
      // 捕手から投手へ返す
      const t0 = CONTACT + 0.75;
      const lob = flightTrack([0, -1], mound, t0, 0.85, 2.2, 1.6, 1.4, 8);
      ball.push([t0 - 0.02, 0, -1, 1.4], ...lob);
      acts.push({ t: t0, who: C, kind: 'throw', to: mound, until: t0 + 0.85 });
      acts.push({ t: t0 + 0.85, who: P, kind: 'catch' });
    }
    tAfter = CONTACT + 0.7;
  } else {
    swingAt = code === '犠' ? null : CONTACT - 0.07;
    const fielder = mainPos;
    const homer = code === '本';
    const dir = clamp(batted.dir, -45, 45);
    const rad = (dir * Math.PI) / 180;
    const wall = fenceOf(dir);
    const fHome = FIELDER_HOME[fielder];
    events.push({ t: CONTACT, kind: 'contact', x: plate[0], y: plate[1], big: homer || code === '二' || code === '三' });
    let fieldPoint = null;
    let fieldTime = CONTACT;
    let errorKind = null;
    if (homer) {
      // 本塁打: スタンドへ。外野手はフェンスまで追って見送る
      const land = at(dir, wall + 15);
      const dur = clamp(2.3 + batted.dist / 85, 3, 4.6);
      const peak = clamp((batted.dist * Math.tan((clamp(batted.la, 18, 40) * Math.PI) / 180)) / 4, 16, 34);
      ball.push(...flightTrack(plate, land, CONTACT, dur, peak, 1, 9, 24));
      const chaser = fielder >= 7 ? fielder : dir < -15 ? 7 : dir > 15 ? 9 : 8;
      runTo(chaser, at(dir, wall - 2.5), CONTACT + 0.25, FIELD_SPRINT);
      main = { fielder: chaser, t: CONTACT + dur, at: land };
      events.push({ t: CONTACT + dur, kind: 'homer', x: land[0], y: land[1], z: 9 });
      marks.push({ t: CONTACT + dur - 0.1, text: 'ホームラン！', tone: 'homer', sub: HOMER_SUB[Math.min(4, scene.runs || 1)] });
      tAfter = CONTACT + dur;
    } else if (ground) {
      // ゴロ: 野手の定位置を打球の線に落とした所で捕る（外野手が捕るのは内野を抜けた打球）
      const along = Math.max(6, fHome[0] * Math.sin(rad) + fHome[1] * Math.cos(rad));
      const through = fielder >= 7;
      const d = through
        ? clamp(Math.max(batted.dist + 20, 52), 52, along - 4)
        : fielder === P
          ? clamp(batted.dist, 5, Math.min(along, 16))
          : fielder === C
            ? clamp(batted.dist * 0.3, 2.5, 7)
            : Math.max(along * 0.6, Math.min(along, batted.dist));
      fieldPoint = at(dir, d);
      const roll = code === '犠' ? 11 : through ? 24 : 30;
      const need = dist2(fHome, fieldPoint) / FIELD_SPRINT;
      const tRoll = Math.max(dist2(plate, fieldPoint) / roll, need);
      ball.push(...hopTrack(plate, fieldPoint, CONTACT, tRoll, 0.8, code === '犠' ? 0.2 : 0.5));
      const hop = at(dir, d * 0.16);
      events.push({ t: CONTACT + tRoll * 0.16, kind: 'bounce', x: hop[0], y: hop[1] });
      fieldTime = CONTACT + tRoll + 0.05;
      move(fielder, fieldPoint, CONTACT + 0.12, fieldTime - 0.05);
      acts.push({ t: fieldTime - 0.05, who: fielder, kind: 'scoop' });
      if (through) {
        // いちばん近い内野手が飛びつくが届かない
        const near = [B1, B2, B3, SS]
          .map((n) => ({ n, a: (Math.atan2(FIELDER_HOME[n][0], FIELDER_HOME[n][1]) * 180) / Math.PI, r: Math.hypot(...FIELDER_HOME[n]) }))
          .sort((a, b) => Math.abs(a.a - dir) - Math.abs(b.a - dir))[0];
        const reach = at(dir, near.r);
        const from = FIELDER_HOME[near.n];
        const gap = dist2(from, reach);
        const u = Math.min(0.85, 4.5 / Math.max(gap, 0.1));
        const tPass = CONTACT + (tRoll * near.r) / d;
        move(near.n, [lerp(from[0], reach[0], u), lerp(from[1], reach[1], u)], CONTACT + 0.12, tPass);
        acts.push({ t: tPass, who: near.n, kind: 'dive' });
        hitT = tPass + 0.1;
      }
      if (code === '失' && fielder <= 6) errorKind = 'throw';
    } else {
      // フライ・ライナー: 落ちる所へ。アウトなら野手が着いて捕る
      const dist = Math.max(6, Math.min(batted.dist, wall - 2));
      const landing = at(dir, dist);
      const peak = clamp((dist * Math.tan((batted.la * Math.PI) / 180)) / 4, 1.2, 38);
      let dur = clamp(0.35 + Math.sqrt(peak / 4.9) * 2, 0.45, 5.4);
      const gap = dist2(fHome, landing);
      if (caughtFly || code === '失') {
        // 追いつける長さにする
        dur = Math.max(dur, gap / FIELD_SPRINT + 0.25);
        const high = batted.la >= 25;
        ball.push(...flightTrack(plate, landing, CONTACT, dur, peak, 1, high ? 2.3 : 1.3, 18));
        fieldTime = CONTACT + dur;
        // 余裕があれば先に着いて待つ
        move(fielder, landing, CONTACT + 0.15, Math.min(fieldTime - 0.1, CONTACT + 0.2 + gap / FIELD_SPEED));
        acts.push({ t: fieldTime, who: fielder, kind: high ? 'catch-high' : 'catch' });
        fieldPoint = landing;
        if (caughtFly) {
          catchT = fieldTime;
          events.push({ t: fieldTime, kind: 'catch', x: landing[0], y: landing[1], z: high ? 2.3 : 1.3 });
        } else {
          // 落球: グラブに当てて落とす。拾い直す
          errorKind = 'drop';
          const drop = [landing[0] + 2.2, landing[1] - 1.6];
          ball.push([fieldTime + 0.45, drop[0], drop[1], 0.1]);
          events.push({ t: fieldTime + 0.45, kind: 'bounce', x: drop[0], y: drop[1] });
          const got = runTo(fielder, drop, fieldTime + 0.3, FIELD_SPEED);
          const pickT = Math.max(got, fieldTime + 0.8);
          ball.push([pickT, drop[0], drop[1], 0.1]);
          acts.push({ t: pickT, who: fielder, kind: 'scoop' });
          hitT = fieldTime + 0.1;
          fieldPoint = drop;
          fieldTime = pickT + 0.1;
        }
      } else {
        // 安打: 落ちて弾む。長打は奥まで転がる（三塁打はフェンスに当たって戻る）
        ball.push(...flightTrack(plate, landing, CONTACT, dur, peak, 1, 0.05, 18));
        const landT = CONTACT + dur;
        events.push({ t: landT, kind: 'bounce', x: landing[0], y: landing[1] });
        hitT = landT;
        const extra = code === '三' ? 60 : code === '二' ? 16 : 6;
        const far = Math.min(wall - 1.2, dist + extra);
        const stop = at(dir, far);
        const rollT = Math.max(0.4, (far - dist) / 15);
        if (far > dist + 0.5) ball.push(...hopTrack(landing, stop, landT, rollT, 0.05, Math.min(1.6, peak * 0.25)).slice(1));
        let rest = stop;
        let restT = landT + rollT;
        if (far >= wall - 1.3 && code !== '安') {
          // フェンスに当たって少し戻る
          rest = at(dir, far - 3);
          restT += 0.45;
          ball.push([restT - 0.2, ...at(dir, far - 1.8), 0.5], [restT, rest[0], rest[1], 0.1]);
          events.push({ t: landT + rollT, kind: 'bounce', x: stop[0], y: stop[1] });
        }
        const pickT = Math.max(restT, CONTACT + 0.15 + dist2(fHome, rest) / FIELD_SPRINT);
        move(fielder, rest, CONTACT + 0.15, pickT);
        if (pickT > restT) ball.push([pickT, rest[0], rest[1], 0.1]);
        acts.push({ t: pickT, who: fielder, kind: 'scoop' });
        fieldPoint = rest;
        fieldTime = pickT + 0.1;
      }
    }
    if (!homer) {
      main = { fielder, t: fieldTime, at: fieldPoint };
      holder = { at: fieldPoint, t: fieldTime, by: fielder };
      if (hit) {
        // 安打で刺された走者は、余分に1つ先を狙って刺されている（シミュの `tryExtraAdvance`:
        // 単打の一塁走者は三塁、単打の二塁走者と二塁打の一塁走者は本塁）。前の走者が止まった塁は越えない
        const hitBases = code === '安' ? 1 : code === '二' ? 2 : 3;
        for (const r of outRunners) {
          const ahead = assigned.filter((o) => o.start > r.start && o.target !== 'out' && o.target < 4).map((o) => o.target - 1);
          stretchBase.set(r, Math.max(r.start + 1, Math.min(4, r.start + hitBases + 1, ...ahead)));
        }
      }
      // アウトの送球（併殺は先の塁から）。フライのアウトは捕った時点
      const throwOuts = outRunners
        .filter((r) => !(caughtFly && r.start === 0))
        .sort((a, b) => outBaseOf(b) - outBaseOf(a));
      if (caughtFly) {
        const batterOut = outRunners.find((r) => r.start === 0);
        if (batterOut) outsAt.set(batterOut, fieldTime);
        marks.push({ t: fieldTime + 0.05, text: 'アウト', tone: 'out' });
      }
      for (const r of throwOuts) {
        const base = outBaseOf(r);
        const spot = baseAt(base);
        if (dist2(holder.at, spot) < 4.5) {
          // 自分で塁を踏む
          const tStep = runTo(holder.by, spot, holder.t, FIELD_SPEED);
          ball.push([tStep, spot[0], spot[1], 1]);
          outsAt.set(r, tStep);
          holder = { at: spot, t: tStep + 0.15, by: holder.by };
        } else {
          const cover = coverOf(base, holder.by, dir);
          const ready = runTo(cover, spot, CONTACT + 0.2, FIELD_SPRINT);
          const fly = Math.max(0.25, dist2(holder.at, spot) / THROW_SPEED);
          // 受ける野手が塁に入るまで待って投げる。先の塁を狙った走者は、着く寸前に球が届くように投げる
          const t0 = Math.max(holder.t + 0.2, ready - fly, stretchBase.has(r) ? arriveAt(r, base) - 0.15 - fly : 0);
          const th = throwTrack(holder.at, spot, t0);
          ball.push([t0 - 0.02, holder.at[0], holder.at[1], 1.4], ...th.track);
          acts.push({ t: t0, who: holder.by, kind: 'throw', to: spot, until: th.end });
          acts.push({ t: th.end, who: cover, kind: base === 1 ? 'stretch' : 'tag', from: holder.at });
          outsAt.set(r, th.end);
          holder = { at: spot, t: th.end + 0.2, by: cover };
        }
        events.push({ t: outsAt.get(r), kind: 'out', base });
        marks.push({ t: outsAt.get(r) + 0.05, text: 'アウト', tone: 'out' });
      }
      if (hit && throwOuts.length) marks.unshift({ t: hitT ?? fieldTime, text: code === '二' ? 'ツーベース' : code === '三' ? 'スリーベース' : 'ヒット', tone: 'hit' });
      if (errorKind === 'throw') {
        // 失策: 一塁への送球がそれる。一塁に入った野手が追う
        const cover = coverOf(1, fielder, dir);
        runTo(cover, BASES[1], CONTACT + 0.2, FIELD_SPRINT);
        const wild = [BASES[1][0] + 7.5, BASES[1][1] - 9];
        const t0 = fieldTime + 0.22;
        const th = throwTrack(fieldPoint, wild, t0);
        ball.push([t0 - 0.02, fieldPoint[0], fieldPoint[1], 1.4], ...th.track);
        acts.push({ t: t0, who: fielder, kind: 'throw', to: wild, until: th.end });
        events.push({ t: th.end, kind: 'bounce', x: wild[0], y: wild[1] });
        const got = runTo(cover, wild, th.end - 0.25, FIELD_SPEED);
        ball.push([Math.max(got, th.end + 0.02), wild[0], wild[1], 0.1]);
        acts.push({ t: got, who: cover, kind: 'scoop' });
        marks.push({ t: th.end - 0.15, text: 'エラー', tone: 'error' });
        holder = { at: wild, t: got + 0.2, by: cover };
        tAfter = got;
      } else if (!throwOuts.length && !caughtFly) {
        // 安打・落球: 内野へ返す（外野からは二塁、内野からは一塁）
        const back = dist2(plate, fieldPoint) > 48 ? 2 : 1;
        const spot = baseAt(back);
        if (errorKind === 'drop') marks.push({ t: hitT, text: 'エラー', tone: 'error' });
        else marks.push({ t: hitT ?? fieldTime, text: code === '二' ? 'ツーベース' : code === '三' ? 'スリーベース' : 'ヒット', tone: 'hit' });
        if (dist2(fieldPoint, spot) < 4.5) {
          tAfter = fieldTime;
        } else {
          const cover = coverOf(back, fielder, dir);
          const ready = runTo(cover, spot, CONTACT + 0.25, FIELD_SPEED);
          const fly = Math.max(0.25, dist2(fieldPoint, spot) / THROW_SPEED);
          const t0 = Math.max(fieldTime + 0.2, ready - fly);
          const th = throwTrack(fieldPoint, spot, t0);
          ball.push([t0 - 0.02, fieldPoint[0], fieldPoint[1], 1.4], ...th.track);
          acts.push({ t: t0, who: fielder, kind: 'throw', to: spot, until: th.end });
          acts.push({ t: th.end, who: cover, kind: 'catch', from: fieldPoint });
          holder = { at: spot, t: th.end + 0.2, by: cover };
          tAfter = th.end;
        }
      } else {
        tAfter = Math.max(holder.t, fieldTime);
      }
    }
    // ほかの野手: 塁に入る・中継に出る・打球の方へ寄る
    const target = main.at;
    const deep = dist2(plate, target) > 52;
    const second = coverOf(2, fielder, dir);
    const toward = (from, k, cap) => {
      const d = dist2(from, target);
      const u = Math.min(k, cap / Math.max(d, 0.1));
      return [lerp(from[0], target[0], u), lerp(from[1], target[1], u)];
    };
    for (let n = 1; n <= 9; n++) {
      if (n === C || fielders[n].length > 1) continue;
      const from = FIELDER_HOME[n];
      let to;
      if (homer) to = n >= 7 ? toward(from, 0.25, 14) : null;
      else if (n === P) to = fielder === B1 || (ground && dir > 12) ? [BASES[1][0] - 2.5, BASES[1][1] - 2] : deep ? [dir > 0 ? -4 : 4, 8] : toward(from, 0.2, 4);
      else if (n === B1) to = BASES[1];
      else if (n === B3) to = BASES[3];
      else if (n === second) to = BASES[2];
      else if (n === B2 || n === SS) to = deep ? toward(BASES[2], 0.4, 24) : toward(from, 0.3, 8);
      else to = toward(from, 0.35, 20);
      if (to) runTo(n, to, CONTACT + 0.2 + n * 0.03, FIELD_SPEED);
    }
  }

  // 走者
  const runners = [];
  let end = tAfter;
  if (assigned) {
    for (const r of assigned) {
      const walk = code === '四' || code === '死';
      const speed = code === '本' ? HOMER_SPEED : walk ? TROT_SPEED : RUN_SPEED;
      const base0 = BASES[r.start];
      // 塁の走者は少し離れて構える
      const lead = r.start > 0 ? leadPoint(r.start) : base0;
      if (r.target === 'out') {
        const outT = outsAt.get(r) ?? (code === '振' ? CONTACT + 0.15 : tAfter);
        if (r.start === 0 && (code === '振' || !batted)) {
          // 三振: 打者は打席で終わり
          runners.push({ start: 0, target: 'out', track: [[0, base0[0], base0[1], 0]], outAt: outT, homeAt: null, slide: null });
          continue;
        }
        if (r.start === 0 && caughtFly) {
          // 捕られたフライ: 一塁へ走りかけて止まる
          const track = cutTrack(runTrack([base0, BASES[1]], runnerStart, RUN_SPEED * 0.8), outT + 0.25);
          runners.push({ start: 0, target: 'out', track, outAt: outT, homeAt: null, slide: null });
          end = Math.max(end, outT + 0.3);
          continue;
        }
        if (doubledOff(r)) {
          // 飛び出して戻れない
          const far = leadPoint(r.start);
          const out = [lerp(base0[0], far[0], 2.2), lerp(base0[1], far[1], 2.2)];
          const turn = catchT ?? CONTACT + 0.5;
          const back = Math.max(outT + 0.12, turn + 0.3);
          const track = [[0, lead[0], lead[1], 0], [CONTACT + 0.1, lead[0], lead[1], 0], [turn, out[0], out[1], 0], [back, base0[0], base0[1], 0]];
          runners.push({ start: r.start, target: 'out', track, outAt: outT, homeAt: null, slide: [back - 0.35, back] });
          events.push({ t: back - 0.1, kind: 'slide', x: base0[0], y: base0[1] });
          end = Math.max(end, back);
          continue;
        }
        const base = outBaseOf(r);
        const through = base === 1 && r.start === 0; // 一塁は駆け抜ける
        const tagging = caughtFly && r.start > 0;
        const t0 = code === '刺' ? PITCH_RELEASE - 0.45 : tagging ? catchT + 0.08 : runnerStart;
        const path = basePath(r.start, base);
        path[0] = tagging ? base0 : lead;
        let len = 0;
        for (let i = 1; i < path.length; i++) len += dist2(path[i - 1], path[i]);
        const sp = clamp(len / Math.max(0.3, outT + (through ? 0.12 : 0.05) - t0), 4.5, 10.8);
        if (through) {
          const b1 = BASES[1];
          path.push([b1[0] + 3.4, b1[1] + 3.4]);
        }
        let track = runTrack(path, t0, sp);
        if (tagging) track = [[0, lead[0], lead[1], 0], [CONTACT + 0.3, lead[0], lead[1], 0], [Math.min(t0, CONTACT + 0.8), base0[0], base0[1], 0], ...track.slice(1)];
        const arrive = t0 + len / sp;
        // 間に合わない走者は、アウトの少し後で止まる
        track = cutTrack(track, outT + (through ? 0.8 : 0.2));
        const slide = !through && arrive <= outT + 0.2 ? [arrive - 0.4, arrive] : null;
        if (slide) events.push({ t: arrive - 0.15, kind: 'slide', x: baseAt(base)[0], y: baseAt(base)[1] });
        runners.push({ start: r.start, target: 'out', track, outAt: outT, homeAt: null, slide });
        end = Math.max(end, outT + 0.3);
        continue;
      }
      if (r.target === r.start) {
        // 塁に残る: 構えた所から塁へ戻る
        const back = (catchT ?? CONTACT + 0.2) + 0.15;
        const track = [[0, lead[0], lead[1], 0], [back, lead[0], lead[1], 0], [back + 0.5, base0[0], base0[1], 0]];
        runners.push({ start: r.start, target: r.target, track, outAt: null, homeAt: null, slide: null });
        continue;
      }
      // フライの後の進塁（犠飛など）は、塁へ戻って捕ってから
      const tagging = caughtFly && r.start > 0;
      const t0 = tagging ? catchT + 0.08 : walk ? CONTACT + 0.5 : code === '本' ? runnerStart + 0.3 : runnerStart;
      const path = basePath(r.start, r.target);
      path[0] = tagging ? base0 : lead;
      let track = runTrack(path, t0, speed);
      if (tagging) track = [[0, lead[0], lead[1], 0], [CONTACT + 0.3, lead[0], lead[1], 0], [Math.min(t0, CONTACT + 0.8), base0[0], base0[1], 0], ...track.slice(1)];
      const arrive = track[track.length - 1][0];
      const home = r.target === 4;
      // 滑りこむ: 本塁への返球がある・長打の打者・打席の外の進塁（盗塁など）
      const sliding = !walk && code !== '本' && ((home && !!holder) || (r.start === 0 && (code === '二' || code === '三')) || (!hasBatter && !home));
      if (sliding) events.push({ t: arrive - 0.15, kind: 'slide', x: baseAt(r.target)[0], y: baseAt(r.target)[1] });
      if (home) events.push({ t: arrive, kind: 'score' });
      runners.push({ start: r.start, target: r.target, track, outAt: null, homeAt: home ? arrive : null, slide: sliding ? [arrive - 0.4, arrive] : null });
      end = Math.max(end, arrive);
    }
    // 走者が本塁へ還るときは、球を持った野手が本塁へ返す（きわどい時だけ。間に合わない）
    const lastHome = Math.max(0, ...runners.filter((r) => r.homeAt && r.start > 0).map((r) => r.homeAt));
    if (holder && lastHome && code !== '本' && dist2(holder.at, BASES[0]) > 6) {
      const fly = Math.max(0.25, dist2(holder.at, BASES[0]) / THROW_SPEED);
      if (holder.t + fly <= lastHome + 1.2) {
        const t0 = Math.max(holder.t, lastHome + 0.12 - fly);
        const th = throwTrack(holder.at, [0, 0.3], t0);
        ball.push([t0 - 0.02, holder.at[0], holder.at[1], 1.4], ...th.track);
        acts.push({ t: t0, who: holder.by, kind: 'throw', to: BASES[0], until: th.end });
        runTo(C, [0, 0.3], CONTACT + 0.4, FIELD_SPEED);
        acts.push({ t: th.end, who: C, kind: 'tag', from: holder.at });
        end = Math.max(end, th.end);
      }
    }
  } else {
    // 割り当てが合わない記録: 最後に塁へ置くだけ
    const after = scene.basesAfter || 0;
    for (let b = 1; b <= 3; b++)
      if (after & (1 << (b - 1))) runners.push({ start: b, target: b, track: [[0, ...BASES[b], 0]], outAt: null, homeAt: null, slide: null, appear: tAfter });
  }
  // 点が入る時（スコアボードと文字）
  let scoreTimes = runners.filter((r) => r.homeAt != null).map((r) => r.homeAt).sort((a, b) => a - b);
  if (scoreTimes.length !== (scene.runs || 0)) scoreTimes = Array.from({ length: scene.runs || 0 }, () => end);
  if (scene.runs > 0 && code !== '本') {
    const tRun = scoreTimes[scoreTimes.length - 1];
    marks.push({ t: tRun + 0.05, text: hit ? (scene.runs > 1 ? `${scene.runs}点タイムリー` : 'タイムリー') : `${scene.runs}点`, tone: 'run' });
    end = Math.max(end, tRun + 0.5);
  }
  // ⚠ 球は時間順に（同じ時は足した順のまま）
  ball.sort((a, b) => a[0] - b[0]);
  acts.sort((a, b) => a.t - b.t);
  events.sort((a, b) => a.t - b.t);
  marks.sort((a, b) => a.t - b.t);
  return {
    duration: end + 1.2,
    settle: end,
    ball,
    fielders,
    runners,
    batter: hasBatter ? { swingAt, bunt: code === '犠', walk: code === '四', hbp: code === '死' } : null,
    acts,
    events,
    marks,
    scoreTimes,
    main,
    code,
    guessed: !assigned,
  };
}

/** 場面の並びから、i番目の場面の前の塁（同じ半回の前の行の後の塁。頭は0） */
export function basesBeforeOf(scenes, i) {
  const s = scenes[i];
  const prev = scenes[i - 1];
  if (!s || !prev || prev.inning !== s.inning || prev.half !== s.half) return 0;
  return prev.basesAfter ?? 0;
}
