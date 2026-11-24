// ============================================================
// 新しい見た目（試作）: 「動きで見る」。打席速報の1場面（`playByPlay.js` の `liveScenes`）を、
// 投げる→打つ→打球→野手が追う→送球→走者が進む、の数秒の動きにする。
//
// ⚠ **記録に無いものは推す**。行にあるのは結果・点・アウト・その行の後の塁・打球（守備位置・向き・
//    飛距離・角度）だけ。球数・カウント、誰がどこで刺されたか、走者が何塁で止まったかの途中は無い。
//    走者の行き先は「前の行の後の塁」→「この行の後の塁」を、点とアウトの数に合うように割り当てる
//    （`assignRunners`。合う割り当てが無ければ走者は動かさず最後に塁へ置く）。
// ⚠ **バントは打球の記録が無い**（サーバーの `liveFields`）。打球の無い犠打・安打・凡退・失策はバントなので、
//    打球を作って見せる（`buntBall`。犠打とバント安打は転がし、凡退は打ち上げた小フライ）。
// ⚠ 表示専用。保存は何も足さない（版20の `plays` を読むだけ）。
// ⚠ 長さの単位はメートル、時間は秒（×1の速さ）。座標は本塁が原点、x は一塁側が正、y はセンター方向。
// ⚠ ここは「どこへ・いつ」だけを決める（画面の座標を知らない）。カメラは `motionCamera.js`、
//    選手の姿勢は `motionPose.js`、描くのは `motionFigure.js`・`motionStadium.js`・`PlayMotion.jsx`。
// ============================================================

import { BASES, FIELDER_HOME, UMPIRE_HOME, baseSpot, at, fenceOf, dist2, lerp, clamp, toward, P, C, B1, B2, B3, SS, LF } from './motionField.js';
import { coverPlan, backupSpot, backupsOf, standbyOf, umpireSpots } from './motionDefense.js';
import { hash } from './rng.js';
import { HOMERS } from './playByPlay.js';

// ⚠ 球場の数は `motionField.js` にある。前からの読み手のために、ここからも出す
export { BASES, FIELDER_HOME, at, fenceOf };

const RUN_SPEED = 8.5; // 走者（m/秒）
const STRETCH_SPEED = 9.5; // 2つ先の塁を狙う走者・タッチアップ
const WALK_SPEED = 8; // 四球で一塁へ
const HOMER_SPEED = 13; // 本塁打の一周（見やすく速め）
const FIELD_SPEED = 7.5; // 野手
const FIELD_SPRINT = 9.4; // 打球を追う野手・塁に入る野手の上限
const UMPIRE_SPEED = 4.6; // 審判
const THROW_SPEED = 32;
/** これより遠い外野からの送球は、中継を挟む */
const RELAY_OVER = 60;
/** 投手が球を離す時（その前は振りかぶり） */
export const PITCH_RELEASE = 0.9;
/** 球が本塁に来る時 */
export const CONTACT = 1.3;

const baseAt = (b) => BASES[b % 4];

/** 打者が出るはずの塁（記号から）。null は打者アウト */
const BATTER_TARGET = { 安: 1, 二: 2, 三: 3, 本: 4, 四: 1, 死: 1, 失: 1, 振: null, 犠: null, 凡: null, 併: null };
/** 安打で打者が進む塁の数 */
const HIT_BASES = { 安: 1, 二: 2, 三: 3, 本: 4 };
/** 安打の大きな文字 */
const hitCaption = (code) => (code === '二' ? 'ツーベース' : code === '三' ? 'スリーベース' : 'ヒット');
/** 折れ線の長さ */
const pathLength = (path) => {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += dist2(path[i - 1], path[i]);
  return len;
};

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
  const hitBases = HIT_BASES[code] || 0;
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
    // ゴロで押し出された走者が刺されたら、打者は一塁に生きる（野手選択。「一塁で二ゴロ、後も一塁」はこの形）
    const grounder = !fly && code === '凡';
    const forceOut = grounder && targets.some((t, i) => t === 'out' && runners[i].start > 0 && forced(runners[i].start));
    targets.forEach((t, i) => {
      const { start } = runners[i];
      if (start === 0) {
        const want = BATTER_TARGET[code];
        if (want === undefined) return;
        if (forceOut && t === 1) cost += 0.3;
        else if ((want === null) !== (t === 'out')) cost += 10;
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
      // 押し出される走者は塁に残れない（四球・死球は必ず進む。ゴロも走るしかない）
      const must = adv < want && forced(start) ? (code === '四' || code === '死' ? 10 : grounder ? 6 : 1) : 1;
      cost += Math.abs(adv - want) * must;
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

/**
 * `from` から `to` へまっすぐ走ると `avoid`（打球を捕る所）のすぐそばを通るとき、後ろ（本塁から遠い側）を回る点。
 * 通らなければ null
 */
function aroundOf(from, to, avoid, near = 3) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < 1) return null;
  const u = ((avoid[0] - from[0]) * dx + (avoid[1] - from[1]) * dy) / len2;
  if (u <= 0.08 || u >= 0.92) return null;
  const close = [from[0] + dx * u, from[1] + dy * u];
  if (dist2(close, avoid) >= near) return null;
  const r = Math.max(Math.hypot(avoid[0], avoid[1]), 0.1);
  return [avoid[0] + (avoid[0] / r) * (near + 1.2), avoid[1] + (avoid[1] / r) * (near + 1.2)];
}

/** バントの転がる先（捕る野手・向き・距離） */
const BUNT_SPOTS = [
  { pos: P, dir: -8, dist: 9 },
  { pos: B3, dir: -30, dist: 11 },
  { pos: B1, dir: 29, dist: 11 },
  { pos: C, dir: 6, dist: 4 },
  { pos: P, dir: 14, dist: 10 },
];
/** バントを打ち上げた小フライの落ちる先 */
const BUNT_POPS = [
  { pos: C, dir: 5, dist: 6 },
  { pos: P, dir: -6, dist: 8 },
  { pos: C, dir: -12, dist: 6 },
];
/** 記録に打球の残らないバントの打球を作る。同じ場面はいつも同じ打球（場面の中身から決める） */
function buntBall(scene, before) {
  const seed = hash(`${scene.inning}${scene.half}${scene.outsBefore}${before}${scene.batter?.name || ''}${scene.score?.home ?? 0}-${scene.score?.away ?? 0}`);
  if (scene.code === '凡') return { ...BUNT_POPS[seed % BUNT_POPS.length], la: 58 };
  return { ...BUNT_SPOTS[seed % BUNT_SPOTS.length], la: -20 };
}

/** 打球の記録が無くても前へ転がった打席（バント。サーバーはバントに打球を書かない。記録は四球・三振と同じく塁だけ） */
const BUNT_CODES = new Set(['犠', '安', '凡', '失']);

/**
 * 1場面の動き。
 * @param scene `liveScenes` の1つ
 * @param before その場面の前の塁（前の場面の `basesAfter`。半回の頭は0）
 * @returns
 *   - `duration` 全体の長さ、`settle` 動きが落ち着く時
 *   - `ball` 球の軌跡、`fielders` 守備9人の軌跡（1〜9）、`umpires` 審判4人の軌跡（球審・一塁・二塁・三塁）
 *   - `runners` `[{ start, target, track, outAt, homeAt, slide: [t0, t1] | null, appear }]`（start 0 は打者）
 *   - `batter` `{ swingAt, bunt, walk, hbp }` | null
 *   - `acts` 野手のしぐさ `[{ t, who, kind, to, until }]`（kind: receive・scoop・catch・catch-high・throw・tag・stretch・dive）
 *   - `events` 絵の効果 `[{ t, kind, x, y, z, base }]`（kind: contact・bounce・catch・slide・out・score・homer・punch・hbp）
 *   - `marks` 大きな文字 `[{ t, text, tone, sub }]`（tone: out・hit・run・homer・walk・error）
 *   - `throws` 送球 `[{ from, to, base, by, who, t0, end }]`（`base` は塁への送球だけ。`who` は受ける野手）
 *   - `roles` 野手の役（1〜9。field 打球を捕る・cover 塁に入る・relay 中継・cut 本塁への返球の間・backup 逸れに備える）
 *   - `backups` 送球の逸れに備えた野手 `[{ n, base, from, to }]`
 *   - `scoreTimes` 点が入る時、`main` 打球を捕る野手と時、`guessed` 走者の割り当てが合わず動かさずに置いたとき true
 */
export function motionOf(scene, before = 0) {
  const { code } = scene;
  const hasBatter = code !== '走' && code !== '刺';
  // 打球の記録が無い犠打・安打・凡退・失策はバント。打球の無いまま描くと四球の絵になるので、打球を作って描く
  const bunted = !scene.batted && BUNT_CODES.has(code);
  const batted = scene.batted ?? (bunted ? buntBall(scene, before) : null);
  const rowOuts = Math.max(0, (scene.outs || 0) - (scene.outsBefore || 0));
  const threeOuts = (scene.outs || 0) >= 3;
  const assigned = assignRunners({
    code,
    before,
    after: scene.basesAfter,
    runs: scene.runs || 0,
    outs: rowOuts,
    threeOuts,
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
  const throws = [];
  const backups = [];
  const roles = Array(10).fill(null);
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
  let plan = null; // 塁に入る人・中継・本塁への返球の間に立つ人（`coverPlan`）
  let support = null; // ほかの野手の持ち場を決める材料（`standbyOf`）
  let diver = null; // 抜ける打球に飛びついた内野手 { n, t }
  let outfield = false; // 打球が外野まで飛んだか
  let homePlay = false; // 外野から本塁へ返す場面か
  let leadBase = null; // 返球の先の塁
  let leadEnd = null; // 返球が着く時
  let react = CONTACT + 0.2; // 野手が動きだす時
  const runnerStart = hasBatter ? CONTACT + 0.12 : CONTACT;
  const walk = code === '四' || code === '死';

  const ground = !!batted && (batted.la < 10 || code === '犠');
  const bunt = !!batted && (code === '犠' || bunted);
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
    return runnerStart + pathLength(path) / STRETCH_SPEED;
  };
  /**
   * 進む走者の走り方（出る時・道・速さ・着く時）。フライの後の進塁（犠飛など）は、塁へ戻って捕ってから。
   * 2つ以上進む走者（長打の打者も）・タッチアップ・打席の外の進塁・内野の打球で一塁へ走る打者は全力で走る
   */
  const advanceOf = (r) => {
    const tagging = caughtFly && r.start > 0;
    // スクイズの三塁走者は、投球と一緒に走りだす
    const squeeze = bunt && r.start === 3 && r.target === 4;
    const t0 = tagging ? catchT + 0.08 : walk ? CONTACT + 0.4 : code === '本' ? runnerStart + 0.3 : squeeze ? PITCH_RELEASE + 0.05 : runnerStart;
    const path = basePath(r.start, r.target);
    path[0] = tagging || r.start === 0 ? BASES[r.start] : leadPoint(r.start);
    // 内野の打球で一塁に生きる打者（内野安打・野手選択・失策）も全力
    const dash = r.start === 0 && ground && !outfield;
    const speed = code === '本' ? HOMER_SPEED : walk ? WALK_SPEED : tagging || squeeze || dash || !hasBatter || r.target - r.start >= 2 ? STRETCH_SPEED : RUN_SPEED;
    let len = 0;
    for (let i = 1; i < path.length; i++) len += dist2(path[i - 1], path[i]);
    return { tagging, t0, path, speed, arrive: t0 + len / speed };
  };
  /** 塁 `base` に生きて着く走者のうち、いちばん遅い人の着く時（居なければ 0）。`pick` で走者を絞る */
  const safeArrival = (base, pick = () => true) =>
    Math.max(0, ...(assigned || []).filter((r) => r.target === base && r.target !== r.start && pick(r)).map((r) => advanceOf(r).arrive));

  /** 送球を球の軌跡としぐさに足す。着く時を返す */
  const throwBall = (to, who, t0, base, act) => {
    const th = throwTrack(holder.at, to, t0);
    ball.push([t0 - 0.02, holder.at[0], holder.at[1], 1.4], ...th.track);
    acts.push({ t: t0, who: holder.by, kind: 'throw', to, until: th.end });
    acts.push({ t: th.end, who, kind: act, from: holder.at });
    throws.push({ from: holder.at, to, base, by: holder.by, who, t0, end: th.end });
    holder = { at: to, t: th.end + 0.2, by: who };
    tAfter = Math.max(tAfter, th.end);
    return th.end;
  };
  /** いまの持ち手から塁 `base` へ投げたら着く時の見込み（中継の持ちかえも入れる） */
  const etaOf = (base) => {
    const far = dist2(holder.at, baseSpot(base));
    const viaRelay = plan.relay && plan.relay !== plan.cover[base] && holder.by >= LF && far > RELAY_OVER;
    return holder.t + 0.2 + far / THROW_SPEED + (viaRelay ? 0.5 : 0);
  };
  /**
   * 球を持っている野手から塁 `base`（1〜3 塁・4 本塁）へ投げる。受けるのは塁に入った野手。
   * 遠い外野からは中継を挟む。受ける野手が塁に入るまで待ち、`notBefore` より前には着かない。着く時を返す
   */
  const sendTo = (base, { notBefore = 0, act = 'catch' } = {}) => {
    const spot = baseSpot(base);
    // ⚠ 塁を空ける持ち場（バント）へ投げるときは、空いている内野手が入る
    const cover = plan.cover[base] ?? [B2, SS, B1, B3, P].find((n) => n !== holder.by && n !== plan.relay && !plan.cover.includes(n));
    plan.cover[base] = cover;
    const ready = runTo(cover, spot, diver?.n === cover ? diver.t + 0.9 : react, FIELD_SPRINT);
    roles[cover] = 'cover';
    const far = dist2(holder.at, spot);
    const relay = plan.relay;
    if (relay && relay !== cover && holder.by >= LF && far > RELAY_OVER) {
      // 中継: 外野手の送球を受けて、向き直って投げる（外野手の方が長く投げる）
      const u = clamp(1 - 30 / far, 0.42, 0.6);
      const mid = [lerp(holder.at[0], spot[0], u), lerp(holder.at[1], spot[1], u)];
      const there = runTo(relay, mid, diver?.n === relay ? diver.t + 0.9 : react + 0.1, FIELD_SPRINT);
      roles[relay] = 'relay';
      const fly = dist2(holder.at, mid) / THROW_SPEED;
      throwBall(mid, relay, Math.max(holder.t + 0.25, there - fly), null, 'catch');
      holder.t += 0.1;
    }
    const fly = Math.max(0.25, dist2(holder.at, spot) / THROW_SPEED);
    return throwBall(spot, cover, Math.max(holder.t + 0.2, ready - fly, notBefore - fly), base, act);
  };

  if (!hasBatter) {
    const stealer = outRunners[0];
    react = PITCH_RELEASE - 0.2;
    if (code === '刺' && stealer) {
      // 盗塁死: 捕手が捕って刺す塁へ投げる。二塁は二塁手が入り、遊撃手は後ろへ、中堅手は前へ詰める
      const base = outBaseOf(stealer);
      plan = coverPlan({ fielder: 0, dir: -1, outfield: false, before });
      acts.push({ t: CONTACT, who: C, kind: 'receive' });
      holder = { at: [0, -1], t: CONTACT + 0.05, by: C };
      ball.push([CONTACT + 0.23, 0, -1, 1.5]);
      const got = sendTo(base, { act: 'tag' });
      outsAt.set(stealer, got);
      events.push({ t: got, kind: 'out', base });
      marks.push({ t: got + 0.05, text: 'アウト', tone: 'out' });
      support = { steal: true, fielder: 0, ballAt: baseSpot(base), dir: -1, outfield: false, ground: false, bunt: false, before, homer: false, plan, leadBase: base };
    } else {
      // 暴投・捕逸など: 球が後ろへそれる。捕手が追い、投手が本塁へ入る
      const loose = [3.8, -11.5];
      plan = coverPlan({ fielder: C, dir: 0, outfield: false, before });
      ball.push(...hopTrack(pitchTo, loose, CONTACT, 0.85, 0.5, 0.35));
      events.push({ t: CONTACT + 0.1, kind: 'bounce', x: 0.5, y: -1.2 });
      react = CONTACT + 0.2;
      const got = runTo(C, loose, CONTACT + 0.2, FIELD_SPEED);
      ball.push([Math.max(got, CONTACT + 0.87), loose[0], loose[1], 0.12]);
      acts.push({ t: got, who: C, kind: 'scoop' });
      holder = { at: loose, t: got + 0.25, by: C };
      tAfter = got;
      // 本塁へ還る走者がいれば、本塁へ入った投手へ返す（間に合わない）
      const home = safeArrival(4);
      if (home) {
        leadBase = 4;
        leadEnd = sendTo(4, { notBefore: home + 0.1, act: 'tag' });
      }
      support = { steal: true, fielder: C, ballAt: loose, dir: 0, outfield: false, ground: false, bunt: false, before, homer: false, plan, leadBase: 4 };
    }
  } else if (!batted) {
    // 打球の無い打席（三振・四球・死球。バントは上で打球を作るのでここに来ない）
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
      if (!threeOuts) {
        // 捕手から投手へ返す（チェンジのときは捕手が持ったまま引き上げる）
        const t0 = CONTACT + 0.75;
        const lob = flightTrack([0, -1], mound, t0, 0.85, 2.2, 1.6, 1.4, 8);
        ball.push([t0 - 0.02, 0, -1, 1.4], ...lob);
        acts.push({ t: t0, who: C, kind: 'throw', to: mound, until: t0 + 0.85 });
        acts.push({ t: t0 + 0.85, who: P, kind: 'catch' });
      }
    }
    tAfter = CONTACT + 0.7;
  } else {
    swingAt = bunt ? null : CONTACT - 0.07;
    const fielder = mainPos;
    const homer = code === '本';
    const dir = clamp(batted.dir, -45, 45);
    const rad = (dir * Math.PI) / 180;
    const wall = fenceOf(dir);
    const fHome = FIELDER_HOME[fielder];
    // バントの守備は、打者が構えた時から動きだす
    if (bunt) react = PITCH_RELEASE + 0.05;
    events.push({ t: CONTACT, kind: 'contact', x: plate[0], y: plate[1], big: homer || code === '二' || code === '三' });
    let fieldPoint = null;
    let fieldTime = CONTACT;
    let readyT = null; // 捕ってから投げられるまで（飛びついたら起き上がる時）
    let errorKind = null;
    if (homer) {
      // 本塁打: スタンドへ。外野手はフェンスまで追って見送る
      const land = at(dir, wall + 15);
      const dur = clamp(2.3 + batted.dist / 85, 3, 4.6);
      const peak = clamp((batted.dist * Math.tan((clamp(batted.la, 18, 40) * Math.PI) / 180)) / 4, 16, 34);
      ball.push(...flightTrack(plate, land, CONTACT, dur, peak, 1, 9, 24));
      const chaser = fielder >= LF ? fielder : dir < -15 ? 7 : dir > 15 ? 9 : 8;
      runTo(chaser, at(dir, wall - 2.5), CONTACT + 0.25, FIELD_SPRINT);
      roles[chaser] = 'field';
      main = { fielder: chaser, t: CONTACT + dur, at: land };
      events.push({ t: CONTACT + dur, kind: 'homer', x: land[0], y: land[1], z: 9 });
      marks.push({ t: CONTACT + dur - 0.1, text: 'ホームラン！', tone: 'homer', sub: HOMERS[Math.min(4, scene.runs || 1)] });
      tAfter = CONTACT + dur;
      support = { homer: true, fielder: chaser, ballAt: land, dir, outfield: true, ground: false, bunt: false, before, plan: null, leadBase: null };
    } else if (ground) {
      // ゴロ: 野手の定位置を打球の線に落とした所で捕る（外野手が捕るのは内野を抜けた打球）
      const along = Math.max(6, fHome[0] * Math.sin(rad) + fHome[1] * Math.cos(rad));
      const through = fielder >= LF;
      // 内野安打: 一・二・三塁手と遊撃手は飛びついて止める（起き上がる間に打者が生きる）。
      // 投手・捕手の前は当たりそこねのゆるいゴロ（打者の足が勝つ）
      const stab = hit && !bunt && fielder >= B1 && fielder <= SS;
      const slow = hit && (bunt || fielder <= C);
      // 外野へ抜けた長打は、外野手の横を抜けて奥まで転がる
      const d = through
        ? code === '三'
          ? wall - 2.5
          : code === '二'
            ? clamp(batted.dist + 30, along + 8, wall - 5)
            : clamp(Math.max(batted.dist + 20, 52), 52, along - 4)
        : bunt
          ? clamp(batted.dist, 3, 14)
          : fielder === P
          ? clamp(batted.dist, 5, Math.min(along, 16))
          : fielder === C
            ? clamp(batted.dist * 0.3, 2.5, 7)
            : Math.max(along * 0.6, Math.min(along, batted.dist));
      fieldPoint = at(dir, d);
      const roll = bunt || slow ? 11 : through ? 24 : 30;
      // バントは前へ出るのが早い分、早く着く
      const startAt = bunt ? react : CONTACT + 0.12;
      const need = startAt - CONTACT + dist2(fHome, fieldPoint) / FIELD_SPRINT + 0.05;
      // 内野安打は、一塁への送球が打者より少し遅れるころに追いつく（飛びついたら起き上がる間も入れる）
      const late = slow || stab ? runnerStart + dist2(BASES[0], BASES[1]) / STRETCH_SPEED - dist2(fieldPoint, BASES[1]) / THROW_SPEED - (stab ? 1.35 : 0.4) - CONTACT : 0;
      const tRoll = Math.max(dist2(plate, fieldPoint) / roll, need, late);
      ball.push(...hopTrack(plate, fieldPoint, CONTACT, tRoll, 0.8, bunt || slow ? 0.2 : 0.5));
      const hop = at(dir, d * 0.16);
      events.push({ t: CONTACT + tRoll * 0.16, kind: 'bounce', x: hop[0], y: hop[1] });
      fieldTime = CONTACT + tRoll + 0.05;
      // 前へ出て捕る（ゆるいゴロは球が来るのを待たずに詰める）
      move(fielder, fieldPoint, startAt, slow ? Math.max(CONTACT + need - 0.05, fieldTime - 0.6) : fieldTime - 0.05);
      acts.push({ t: fieldTime - 0.05, who: fielder, kind: stab ? 'dive' : 'scoop' });
      if (stab) readyT = fieldTime + 0.95;
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
        diver = { n: near.n, t: tPass };
        hitT = tPass + 0.1;
      }
      if (code === '失' && fielder <= SS) errorKind = 'throw';
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
      holder = { at: fieldPoint, t: readyT ?? fieldTime, by: fielder };
      roles[fielder] = 'field';
      tAfter = fieldTime;
      outfield = dist2(plate, fieldPoint) > 48;
      if (hit) {
        // 安打で刺された走者は、余分に1つ先を狙って刺されている（シミュの `tryExtraAdvance`:
        // 単打の一塁走者は三塁、単打の二塁走者と二塁打の一塁走者は本塁）。前の走者が止まった塁は越えない
        const hitBases = HIT_BASES[code];
        for (const r of outRunners) {
          const ahead = assigned.filter((o) => o.start > r.start && o.target !== 'out' && o.target < 4).map((o) => o.target - 1);
          stretchBase.set(r, Math.max(r.start + 1, Math.min(4, r.start + hitBases + 1, ...ahead)));
        }
      }
      // 外野から本塁へ返す場面（安打で2つ以上進んで還る走者・タッチアップ・本塁で刺された走者。打者が還る当たりも）
      const scoring = (r) => r.start < 3 || caughtFly;
      homePlay = outfield && (assigned || []).some((r) => scoring(r) && (r.target === 4 || (r.target === 'out' && outBaseOf(r) === 4)));
      plan = coverPlan({ fielder, dir, outfield, bunt, before, homePlay, deep: dist2(plate, fieldPoint) > 80 });
      // アウトの送球（併殺は先の塁から）。フライのアウトは捕った時点
      const throwOuts = outRunners
        .filter((r) => !(caughtFly && r.start === 0))
        .sort((a, b) => outBaseOf(b) - outBaseOf(a));
      if (caughtFly) {
        const batterOut = outRunners.find((r) => r.start === 0);
        if (batterOut) outsAt.set(batterOut, fieldTime);
        marks.push({ t: fieldTime + 0.05, text: 'アウト', tone: 'out' });
      }
      const batterIn = safeArrival(1, (r) => r.start === 0);
      for (const r of throwOuts) {
        const base = outBaseOf(r);
        const spot = baseAt(base);
        if (dist2(holder.at, spot) < 4.5) {
          // 自分で塁を踏む
          const tStep = runTo(holder.by, spot, holder.t, FIELD_SPEED);
          ball.push([tStep, spot[0], spot[1], 1]);
          outsAt.set(r, tStep);
          holder = { at: spot, t: tStep + 0.15, by: holder.by };
          tAfter = Math.max(tAfter, tStep);
        } else {
          // 先の塁を狙った走者は、着く寸前に球が届くように投げる
          const notBefore = stretchBase.has(r) ? arriveAt(r, base) - 0.15 : 0;
          // 内野安打で先を狙った走者: まず一塁へ投げ（打者は生きる）、そこから刺す
          if (!outfield && batterIn && base !== 1 && notBefore - etaOf(base) > 0.9 && dist2(holder.at, BASES[1]) > 4.5) sendTo(1, { notBefore: batterIn + 0.08, act: 'stretch' });
          outsAt.set(r, sendTo(base, { notBefore, act: base === 1 ? 'stretch' : 'tag' }));
        }
        leadBase = base;
        leadEnd = outsAt.get(r);
        events.push({ t: outsAt.get(r), kind: 'out', base });
        marks.push({ t: outsAt.get(r) + 0.05, text: 'アウト', tone: 'out' });
      }
      // 併殺くずれ: 先の塁で刺した後、一塁へ転送するが打者が先に駆け抜ける
      if (ground && !hit && !threeOuts && errorKind !== 'throw' && throwOuts.length && batterIn && leadBase !== 1 && dist2(holder.at, BASES[1]) > 4.5) {
        leadBase = 1;
        leadEnd = sendTo(1, { notBefore: batterIn + 0.1, act: 'stretch' });
      }
      if (hit && throwOuts.length) marks.unshift({ t: hitT ?? fieldTime, text: bunted ? 'バントヒット' : hitCaption(code), tone: 'hit' });
      // 本塁へ還る走者（安打で2つ以上・タッチアップ・内野ゴロの間）への返球が、きわどくなるか
      const homeIn = safeArrival(4, (r) => (outfield ? scoring(r) : r.start > 0));
      const homeClose = () => homeIn && !threeOuts && dist2(holder.at, BASES[0]) > 6 && etaOf(4) >= homeIn - 0.5 && etaOf(4) <= homeIn + 1.2;
      const sendHome = () => {
        leadBase = 4;
        leadEnd = sendTo(4, { notBefore: homeIn + 0.1, act: 'tag' });
      };
      if (errorKind === 'throw') {
        // 失策: 一塁への送球がそれる（先の塁で刺した後なら、その転送がそれる）。
        // 走者がいなければ打者を追ってきた捕手が、いれば一塁に入った野手が追う
        const cover = plan.cover[1] ?? P;
        runTo(cover, BASES[1], react, FIELD_SPRINT);
        roles[cover] = 'cover';
        const wild = [BASES[1][0] + 7.5, BASES[1][1] - 9];
        const from = holder.at;
        const t0 = holder.t + 0.22;
        const th = throwTrack(from, wild, t0);
        ball.push([t0 - 0.02, from[0], from[1], 1.4], ...th.track);
        acts.push({ t: t0, who: holder.by, kind: 'throw', to: wild, until: th.end });
        throws.push({ from, to: BASES[1], base: 1, by: holder.by, who: cover, t0, end: th.end, wild: true });
        events.push({ t: th.end, kind: 'bounce', x: wild[0], y: wild[1] });
        const chaser = before === 0 && fielder !== C ? C : cover;
        const got = Math.max(chaser === C ? runTo(C, wild, react, FIELD_SPRINT) : runTo(cover, wild, th.end - 0.25, FIELD_SPEED), th.end + 0.02);
        if (chaser === C) roles[C] = 'backup';
        ball.push([got, wild[0], wild[1], 0.1]);
        acts.push({ t: got, who: chaser, kind: 'scoop' });
        marks.push({ t: th.end - 0.15, text: 'エラー', tone: 'error' });
        holder = { at: wild, t: got + 0.2, by: chaser };
        tAfter = Math.max(tAfter, got);
      } else if (throwOuts.length) {
        // アウトを取った後、還る走者がきわどければ本塁へ
        if (homeClose()) sendHome();
      } else if (caughtFly) {
        // 飛球を捕った後: タッチアップがきわどければその塁へ。なければ中継へ返す（チェンジなら持ったまま）
        const thirdIn = safeArrival(3);
        if (homeClose()) sendHome();
        else if (outfield && !threeOuts && thirdIn && etaOf(3) >= thirdIn - 0.5) {
          leadBase = 3;
          leadEnd = sendTo(3, { notBefore: thirdIn + 0.1, act: 'tag' });
        } else if (outfield && !threeOuts && fielder >= LF) {
          const n = plan.relay ?? plan.cut;
          const job = n && standbyOf(n, { fielder, ballAt: fieldPoint, dir, outfield, ground, bunt, before, homer: false, plan, leadBase: 2 });
          if (job) {
            const there = runTo(n, job.to, react + 0.1, FIELD_SPEED);
            roles[n] = job.role;
            const fly = dist2(holder.at, job.to) / THROW_SPEED;
            const got = throwBall(job.to, n, Math.max(holder.t + 0.35, there - fly), null, 'catch');
            // 返球の途中で場面を終える（捕ったところが見せ場）
            tAfter = Math.max(fieldTime, got - 0.75);
          }
        }
      } else {
        // 安打・落球: 内野へ返す。外野からは、きわどい走者のいる塁（本塁 → 三塁）へ。なければ二塁。内野からは一塁
        if (errorKind === 'drop') marks.push({ t: hitT, text: 'エラー', tone: 'error' });
        else marks.push({ t: hitT ?? fieldTime, text: bunted ? 'バントヒット' : hitCaption(code), tone: 'hit' });
        const thirdIn = safeArrival(3);
        if (outfield && homeClose()) sendHome();
        else if (outfield && thirdIn && etaOf(3) >= thirdIn - 0.5) {
          leadBase = 3;
          leadEnd = sendTo(3, { notBefore: thirdIn + 0.1, act: 'tag' });
        } else {
          const back = outfield ? 2 : 1;
          const inAt = safeArrival(back);
          if (!outfield && fielder === B1 && !bunt) {
            // 一塁手が止めた内野安打: 自分で塁へ走るが、打者が先に駆け抜ける
            const tStep = runTo(B1, BASES[1], Math.max(holder.t, inAt - dist2(fieldPoint, BASES[1]) / FIELD_SPEED + 0.15), FIELD_SPEED);
            ball.push([holder.t, fieldPoint[0], fieldPoint[1], 1], [tStep, BASES[1][0], BASES[1][1], 1]);
            holder = { at: BASES[1], t: tStep, by: B1 };
            tAfter = Math.max(tAfter, tStep);
          } else if (dist2(fieldPoint, baseAt(back)) >= 4.5) {
            leadBase = back;
            leadEnd = sendTo(back, { notBefore: inAt ? inAt + 0.08 : 0, act: back === 1 ? 'stretch' : 'catch' });
          }
        }
      }
      support = { fielder, ballAt: fieldPoint, dir, outfield, ground, bunt, before, homer: false, plan, leadBase };
    }
  }

  // 走者
  const runners = [];
  let end = tAfter;
  if (assigned) {
    for (const r of assigned) {
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
        const len = pathLength(path);
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
        // 塁に残る
        let track;
        if (caughtFly && mainPos >= LF && catchT > CONTACT + 1.1) {
          if (r.start === 3) {
            // 外野の飛球: 三塁走者は塁に付いてタッチアップに備える
            track = [[0, lead[0], lead[1], 0], [CONTACT + 0.3, lead[0], lead[1], 0], [CONTACT + 0.75, base0[0], base0[1], 0]];
          } else {
            // 一・二塁の走者は塁間の途中まで出て、捕られたら戻る
            const half = toward(base0, BASES[(r.start + 1) % 4], batted.dist > 85 ? 6 : 8.5);
            const go = Math.min(CONTACT + 0.15 + dist2(lead, half) / 5.5, catchT - 0.1);
            const back = catchT + 0.2;
            track = [[0, lead[0], lead[1], 0], [CONTACT + 0.15, lead[0], lead[1], 0], [go, half[0], half[1], 0], [back, half[0], half[1], 0], [back + dist2(half, base0) / RUN_SPEED, base0[0], base0[1], 0]];
          }
        } else {
          // 構えた所から塁へ戻る
          const back = (catchT ?? CONTACT + 0.2) + 0.15;
          track = [[0, lead[0], lead[1], 0], [back, lead[0], lead[1], 0], [back + 0.5, base0[0], base0[1], 0]];
        }
        runners.push({ start: r.start, target: r.target, track, outAt: null, homeAt: null, slide: null });
        continue;
      }
      const adv = advanceOf(r);
      let track = runTrack(adv.path, adv.t0, adv.speed);
      if (adv.tagging) track = [[0, lead[0], lead[1], 0], [CONTACT + 0.3, lead[0], lead[1], 0], [Math.min(adv.t0, CONTACT + 0.8), base0[0], base0[1], 0], ...track.slice(1)];
      const arrive = adv.arrive;
      const home = r.target === 4;
      // 滑りこむ: 送球が来る塁（返球が着く前後に着く走者）・長打の打者・打席の外の進塁（盗塁など）
      const contested = leadBase === r.target && leadEnd != null && arrive > leadEnd - 1.6;
      const sliding = !walk && code !== '本' && (contested || (r.start === 0 && (code === '二' || code === '三')) || (!hasBatter && !home));
      if (sliding) events.push({ t: arrive - 0.15, kind: 'slide', x: baseAt(r.target)[0], y: baseAt(r.target)[1] });
      if (home) events.push({ t: arrive, kind: 'score' });
      if (r.start === 0 && r.target === 1 && batted && !sliding) {
        const b1 = BASES[1];
        if (outfield) {
          // 外野への安打: 一塁を回って二塁をうかがい、戻る
          const turn = [b1[0] - 3, b1[1] + 4.8];
          track.push([arrive + 0.62, turn[0], turn[1], 0], [arrive + 0.95, turn[0], turn[1], 0], [arrive + 1.85, b1[0], b1[1], 0]);
        } else {
          // 内野安打・失策: 駆け抜けて戻る
          const past = [b1[0] + 3.6, b1[1] + 3.6];
          track.push([arrive + 0.5, past[0], past[1], 0], [arrive + 0.8, past[0], past[1], 0], [arrive + 1.8, b1[0], b1[1], 0]);
        }
        end = Math.max(end, arrive + 0.7);
      }
      runners.push({ start: r.start, target: r.target, track, outAt: null, homeAt: home ? arrive : null, slide: sliding ? [arrive - 0.4, arrive] : null });
      end = Math.max(end, arrive);
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
  // 四球・死球は、歩きだしたら次へ。しぐさの途中では切らない
  const duration = Math.max(end + (walk ? 0.7 : 1.2), ...acts.map((a) => (a.until ?? a.t) + 0.2));

  // ほかの野手: 送球の逸れに備える → 塁に入る・中継に出る・打球の後ろへ回る・前へ詰める
  if (support) {
    const free = (n) => fielders[n].length === 1 || (diver?.n === n && !roles[n]);
    const go = (n, spot, role, speed) => {
      // 行き先にもう人がいる（捕った野手が自分で塁を踏んだ・塁の上で捕った）ときは、手前で止まる
      const taken = [1, 2, 3, 4, 5, 6, 7, 8, 9].some((m) => m !== n && fielders[m].length > 1 && dist2(lastOf(m).slice(1), spot) < 2.4);
      const to = taken ? toward(spot, FIELDER_HOME[n], 3.4) : spot;
      const t0 = diver?.n === n ? diver.t + 0.9 : react + 0.05 + n * 0.03;
      // 打球を捕る野手の前を横切らない（後ろを回る）
      const from = lastOf(n).slice(1);
      const via = support.homer ? null : aroundOf(from, to, support.ballAt) ?? (to[1] < -1 && from[1] > 6 ? [6.5, 1.5] : null);
      runTo(n, to, via ? runTo(n, via, t0, speed) : t0, speed);
      roles[n] = role;
    };
    for (const th of throws) {
      if (!th.base) continue;
      const { who, count } = backupsOf({ base: th.base, from: th.from, before });
      let k = 0;
      for (const n of who) {
        // 打席の外の進塁（盗塁・暴投）は、外野手だけが備える
        if (k >= count || !free(n) || (support.steal && n < LF)) continue;
        const to = backupSpot(th.from, th.base, k * 7);
        // 同じ所にもう備えた人がいれば足さない（同じ塁へ2度投げたとき）
        if (backups.some((b) => dist2(b.to, to) < 2.5)) continue;
        go(n, to, 'backup', FIELD_SPRINT);
        backups.push({ n, base: th.base, from: th.from, to });
        k++;
      }
    }
    for (let n = 1; n <= 9; n++) {
      if (!free(n)) continue;
      const job = standbyOf(n, support);
      if (job) go(n, job.to, job.role, FIELD_SPEED);
    }
    // 打球を捕る所のすぐそばに立ったままの野手は、場所を空ける
    if (main && !support.homer) {
      for (let n = 1; n <= 9; n++) {
        if (n === main.fielder || fielders[n].length > 1 || dist2(FIELDER_HOME[n], main.at) >= 3) continue;
        const r = Math.max(dist2(FIELDER_HOME[n], main.at), 0.1);
        runTo(n, [main.at[0] + ((FIELDER_HOME[n][0] - main.at[0]) / r) * 4.5 + (r < 0.2 ? 4.5 : 0), main.at[1] + ((FIELDER_HOME[n][1] - main.at[1]) / r) * 4.5], react, FIELD_SPEED);
      }
    }
    // 場面が終わるころには足を止める
    for (let n = 1; n <= 9; n++) fielders[n] = cutTrack(fielders[n], end + 0.5);
  }
  // 審判: 球審は本塁の争い・打者の走る方へ、塁審は打球や送球の見える所へ動く
  const plays = new Set([...throws.map((th) => th.base), ...events.filter((e) => e.kind === 'out').map((e) => e.base)].filter(Boolean));
  const umpSpots = umpireSpots({ batted: !!batted && code !== '本', outfield, dir: batted ? batted.dir : 0, ballAt: main?.at ?? plate, flyOut: caughtFly, homePlay, plays });
  const umpires = UMPIRE_HOME.map((spot, i) => {
    const track = [[0, spot[0], spot[1], 0]];
    const to = umpSpots[i];
    if (to) {
      const t0 = (hasBatter ? CONTACT : PITCH_RELEASE) + 0.3 + i * 0.06;
      track.push([t0, spot[0], spot[1], 0], [t0 + dist2(spot, to) / UMPIRE_SPEED, to[0], to[1], 0]);
    }
    return cutTrack(track, end + 0.5);
  });
  if (threeOuts && rowOuts > 0) {
    // チェンジ: 守備は自分のベンチ（本拠地は一塁側）へ引き上げはじめる。球は持っている野手が持って帰る
    const side = scene.offense === 'home' ? -1 : 1;
    const last = ball[ball.length - 1];
    const tGo = Math.max(end, last[0]) + 0.3;
    const carrier = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((n) => dist2(sample(fielders[n], last[0]), [last[1], last[2]]) < 1.1);
    for (let n = 1; n <= 9; n++) {
      const here = lastOf(n);
      runTo(n, toward([here[1], here[2]], [side * 21, -1], 12), tGo + (n % 3) * 0.07, 4.8);
    }
    if (carrier) {
      ball.push([tGo, last[1], last[2], last[3]]);
      for (let t = tGo + 0.3; t <= duration + 0.3; t += 0.3) ball.push([t, ...sample(fielders[carrier], t).slice(0, 2), 1.1]);
    }
  }
  // ⚠ 球は時間順に（同じ時は足した順のまま）
  ball.sort((a, b) => a[0] - b[0]);
  acts.sort((a, b) => a.t - b.t);
  events.sort((a, b) => a.t - b.t);
  marks.sort((a, b) => a.t - b.t);
  return {
    duration,
    settle: end,
    ball,
    fielders,
    umpires,
    runners,
    batter: hasBatter ? { swingAt, bunt, walk: code === '四', hbp: code === '死' } : null,
    acts,
    events,
    marks,
    throws,
    roles,
    backups,
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
  // 塁の記録が無い行（古い形の「走」の行など）は、同じ半回をさかのぼって最後に分かる塁を使う
  //（以前は空の塁から始めて、走者が無い所から現れていた）
  if (prev.basesAfter == null) return basesBeforeOf(scenes, i - 1);
  return prev.basesAfter;
}
