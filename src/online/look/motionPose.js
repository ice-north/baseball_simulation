// ============================================================
// 新しい見た目（試作）「動きで見る」: 時間 t に、だれが・どこで・どんな姿勢か。
//
// `playMotion.js` の軌跡としぐさ（`acts`）から、守備9人・打者と走者・審判・ベースコーチ・
// 次の打者の姿勢を決める。描くのは `motionFigure.js`（ここは canvas を触らない）。
//
// 姿勢は `{ kind, u, face: [横, 手前], dir, phase }`。
//   - `face` は体の向き（画面の右が +横、カメラの方が +手前）
//   - `dir` は投げる・捕る・滑る向き（画面の右が +1）
// ============================================================
import { BASES, CONTACT, PITCH_RELEASE, FIELDER_HOME, sample } from './playMotion.js';
import { UMPIRE_HOME as UMPIRE_SPOTS } from './motionField.js';
import { project } from './motionCamera.js';

/** 打席（右打者。本塁の三塁側） */
export const BATTER_BOX = [-1.25, 0.2];
/** 球審と塁審の定位置（動く先は `playMotion.js` の `umpires`） */
const UMPIRE_HOME = UMPIRE_SPOTS[0];
const UMPIRES = [null, UMPIRE_SPOTS[1], UMPIRE_SPOTS[2], UMPIRE_SPOTS[3]];
const COACHES = [
  [BASES[1][0] + 5.5, BASES[1][1] - 3],
  [BASES[3][0] - 5.5, BASES[3][1] - 3],
];

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** 球場の2点を結ぶ向きを、画面の向き [横, 手前] にする */
function screenDir(from, to) {
  const a = project(from[0], from[1], 0);
  const b = project(to[0], to[1], 0);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  return len < 1e-6 ? [0, 1] : [dx / len, dy / len];
}

/** 軌跡の速さ（m/秒）と向き */
function velocity(track, t) {
  const a = sample(track, t - 0.06);
  const b = sample(track, t + 0.06);
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { speed: d / 0.12, from: a, to: b };
}

/** しぐさが見える間（その前・後の秒） */
const ACT_WINDOW = {
  throw: [0.24, 0.42],
  scoop: [0.32, 0.22],
  'catch-high': [0.6, 0.45],
  catch: [0.3, 0.3],
  tag: [0.4, 0.4],
  stretch: [0.45, 0.35],
  dive: [0.22, 1.2],
  receive: [0.2, 0.35],
};

/** 野手のいまのしぐさ（重なったら後から始まった方） */
function actOf(motion, who, t) {
  let found = null;
  for (const a of motion.acts) {
    if (a.who !== who) continue;
    const w = ACT_WINDOW[a.kind];
    if (!w) continue;
    if (t >= a.t - w[0] && t <= a.t + w[1]) found = a;
  }
  return found;
}

function fielderPose(motion, n, t, ball) {
  const track = motion.fielders[n];
  const pos = sample(track, t);
  const v = velocity(track, t);
  const act = actOf(motion, n, t);
  const toBall = screenDir(pos, ball);
  const toHome = screenDir(pos, [0, 0]);
  if (act) {
    const [before, after] = ACT_WINDOW[act.kind];
    const u = clamp01((t - (act.t - before)) / (before + after));
    const aim = act.to ? screenDir(pos, act.to) : act.from ? screenDir(pos, act.from) : toBall;
    const dir = aim[0] >= 0 ? 1 : -1;
    // 捕るしぐさは球の方を、投げるしぐさは投げる先を向く
    const face = act.kind === 'throw' ? aim : n === 2 && act.kind === 'receive' ? [0, -1] : act.from ? aim : toBall;
    return { pos, pose: { kind: act.kind, u, face, dir, t0: act.t, squat: n === 2 && act.kind === 'receive' } };
  }
  if (v.speed > 0.9) return { pos, pose: { kind: 'run', phase: t * 13 + n, face: screenDir(v.from, v.to) } };
  if (n === 1 && t < PITCH_RELEASE + 0.5) return { pos, pose: { kind: 'pitch', t, face: [0, 1] } };
  // 本塁打を打たれた投手はうなだれる
  if (n === 1 && motion.code === '本') {
    const gone = motion.events.find((e) => e.kind === 'homer');
    if (gone && t > gone.t + 0.3) return { pos, pose: { kind: 'slump', face: [0.3, 1] } };
  }
  if (n === 2) {
    // 捕手: 投球まではしゃがむ。打球が出たら立つ
    const up = clamp01((t - (CONTACT + 0.15)) / 0.3);
    if (up < 1 && !motion.acts.some((a) => a.who === 2 && a.kind !== 'receive' && a.t < t)) return { pos, pose: { kind: 'squat', u: up, face: [0, -1] } };
    return { pos, pose: { kind: 'stand', face: toBall } };
  }
  if (t < CONTACT + 0.12) {
    // 投球に合わせて腰を落とす
    const set = clamp01((t - (PITCH_RELEASE - 0.35)) / 0.35);
    return { pos, pose: { kind: n >= 7 ? 'ready-of' : 'ready', u: set, face: toHome, phase: t * 2 + n } };
  }
  // 塁に入った・中継に出た・逸れに備えた野手は、球が生きている間は腰を落として待つ
  const role = motion.roles?.[n];
  if ((role === 'cover' || role === 'relay' || role === 'cut' || role === 'backup') && t < motion.settle + 0.2)
    return { pos, pose: { kind: n >= 7 ? 'ready-of' : 'ready', u: 1, face: toBall, phase: t * 2 + n } };
  return { pos, pose: { kind: 'stand', face: toBall, phase: t * 2 + n } };
}

function runnerPose(motion, r, t, ball) {
  let pos = sample(r.track, t);
  const v = velocity(r.track, t);
  const batter = r.start === 0 && motion.batter;
  const leave = r.track.length > 1 ? r.track[1][0] : Infinity;
  let alpha = 1;
  if (r.appear != null && t < r.appear) alpha = 0;
  if (r.outAt != null) alpha = Math.min(alpha, 1 - clamp01((t - r.outAt - 0.8) / 0.5));
  if (r.homeAt != null) alpha = Math.min(alpha, 1 - clamp01((t - r.homeAt - 0.7) / 0.5));
  if (batter && t < leave + 0.3) {
    // 打席の中 → 走りだすまでに本塁の線へ寄る
    const out = clamp01((t - leave) / 0.3);
    if (out <= 0) pos = [BATTER_BOX[0], BATTER_BOX[1], 0];
    else pos = [BATTER_BOX[0] + (pos[0] - BATTER_BOX[0]) * out, BATTER_BOX[1] + (pos[1] - BATTER_BOX[1]) * out, 0];
    if (out <= 0) {
      const b = motion.batter;
      if (b.bunt) return { pos, alpha, pose: { kind: 'bunt', u: clamp01((t - (PITCH_RELEASE - 0.3)) / 0.3), face: [0.2, -1] } };
      if (b.hbp && t >= CONTACT) return { pos, alpha, pose: { kind: 'flinch', u: clamp01((t - CONTACT) / 0.3), face: [-0.6, 0.6] } };
      if (r.outAt != null && r.track.length < 2 && t > r.outAt + 0.45) return { pos, alpha, pose: { kind: 'slump', face: [0.5, 0.6], bat: true } };
      return { pos, alpha, pose: { kind: 'bat', t, swingAt: b.swingAt, face: [0.85, -0.4] } };
    }
  }
  const face = v.speed > 0.6 ? screenDir(v.from, v.to) : null;
  if (r.slide && t >= r.slide[0] && t <= r.slide[1] + 0.45) {
    const base = sample(r.track, r.slide[1]);
    const d = screenDir(sample(r.track, r.slide[0] - 0.2), base);
    return { pos, alpha, pose: { kind: 'slide', u: clamp01((t - r.slide[0]) / (r.slide[1] - r.slide[0])), face: d, dir: d[0] >= 0 ? 1 : -1, up: clamp01((t - r.slide[1] - 0.15) / 0.3) } };
  }
  if (r.homeAt != null && t >= r.homeAt) return { pos, alpha, pose: { kind: 'cheer', phase: (t - r.homeAt) * 10, face: [0, 1] } };
  if (r.outAt != null && t >= r.outAt + 0.3 && v.speed < 2) return { pos, alpha, pose: { kind: 'slump', face: face || [0, 1] } };
  const jog = motion.code === '本' || motion.code === '四' || motion.code === '死';
  if (v.speed > 0.9) return { pos, alpha, pose: { kind: jog ? 'trot' : 'run', phase: t * (jog ? 11 : 14) + r.start, face } };
  // 塁の上: 投球までは離れて構え、あとは球を見る
  if (r.start > 0 && t < CONTACT + 0.2) return { pos, alpha, pose: { kind: 'lead', face: screenDir(pos, [0, 9]), phase: t * 3 + r.start } };
  return { pos, alpha, pose: { kind: 'stand', face: screenDir(pos, ball), phase: t * 2 + r.start } };
}

/**
 * 時間 t の人たち。
 * @param info `{ offenseHome }` 攻撃が本拠地の球団か（次の打者の立つ側）
 * @returns `[{ key, pos: [x, y], kit: 'def'|'off'|'ump'|'coach', role, pose, alpha }]`
 */
export function actorsAt(motion, t, info = {}) {
  const out = [];
  const ball = sample(motion.ball, t);
  for (let n = 1; n <= 9; n++) {
    const f = fielderPose(motion, n, t, ball);
    out.push({ key: `f${n}`, pos: f.pos, kit: 'def', role: n === 2 ? 'catcher' : n === 1 ? 'pitcher' : 'fielder', pose: f.pose, alpha: 1, hasBall: false });
  }
  motion.runners.forEach((r, i) => {
    const p = runnerPose(motion, r, t, ball);
    if (p.alpha > 0) out.push({ key: `r${i}`, pos: p.pos, kit: 'off', role: 'runner', pose: p.pose, alpha: p.alpha });
  });
  // 審判の居る所（`motion.umpires`。古い形の動きには無いので定位置）と、動いているときの走る姿勢
  const umpire = (i) => {
    const track = motion.umpires?.[i];
    if (!track) return { pos: i ? UMPIRES[i] : UMPIRE_HOME, run: null };
    const v = velocity(track, t);
    return { pos: sample(track, t).slice(0, 2), run: v.speed > 0.9 ? { kind: 'trot', phase: t * 10 + i, face: screenDir(v.from, v.to) } : null };
  };
  // 球審: 投球まで構える。三振と本塁のアウトで拳を上げ、滑りこんでセーフなら両手を広げる
  const punch = motion.events.find((e) => (e.kind === 'punch' || (e.kind === 'out' && e.base === 4)) && t >= e.t && t <= e.t + 0.9);
  const safeHome = motion.runners.find((r) => r.slide && r.homeAt != null && t >= r.slide[1] && t <= r.slide[1] + 0.9);
  const u0 = umpire(0);
  out.push({
    key: 'u0',
    pos: u0.pos,
    kit: 'ump',
    role: 'umpire',
    pose: punch
      ? { kind: 'call-out', u: clamp01((t - punch.t) / 0.25), face: punch.kind === 'punch' ? [0.3, -1] : screenDir(u0.pos, BASES[0]) }
      : safeHome
        ? { kind: 'call-safe', u: clamp01((t - safeHome.slide[1]) / 0.2), face: screenDir(u0.pos, BASES[0]) }
        : t < CONTACT + 0.25
          ? { kind: 'ready', u: 1, face: [0, -1] }
          : u0.run || { kind: 'stand', face: screenDir(u0.pos, ball) },
    alpha: 1,
  });
  // 塁審: 自分の塁のアウトで拳、滑りこんでセーフなら両手を広げる
  for (let b = 1; b <= 3; b++) {
    const { pos, run } = umpire(b);
    const call = motion.events.find((e) => e.kind === 'out' && e.base === b && t >= e.t + 0.05 && t <= e.t + 1);
    const base = BASES[b];
    const safe = motion.runners.find((r) => r.slide && r.outAt == null && r.target === b && t >= r.slide[1] && t <= r.slide[1] + 0.9);
    out.push({
      key: `u${b}`,
      pos,
      kit: 'ump',
      role: 'umpire',
      pose: call
        ? { kind: 'call-out', u: clamp01((t - call.t - 0.05) / 0.25), face: screenDir(pos, base) }
        : safe
          ? { kind: 'call-safe', u: clamp01((t - safe.slide[1]) / 0.2), face: screenDir(pos, base) }
          : t < CONTACT
            ? { kind: 'ready-of', u: 1, face: screenDir(pos, [0, 0]) }
            : run || { kind: 'stand', face: screenDir(pos, ball) },
      alpha: 1,
    });
  }
  // ベースコーチ: 本塁へ向かう走者がいれば三塁コーチが腕を回す
  const sending = motion.runners.some((r) => r.target === 4 && r.homeAt != null && t < r.homeAt - 0.4 && t > (r.track[1]?.[0] ?? 0) && motion.code !== '本');
  COACHES.forEach((pos, i) => {
    out.push({
      key: `c${i}`,
      pos,
      kit: 'coach',
      role: 'coach',
      pose: i === 1 && sending ? { kind: 'wave', phase: t * 10, face: [0.6, 0.6], dir: 1 } : { kind: 'stand', face: screenDir(pos, t < CONTACT ? [0, 9] : ball), phase: t * 2 + i },
      alpha: 1,
    });
  });
  // 次の打者（自軍のベンチの前で素振り）
  if (motion.batter) {
    const side = info.offenseHome ? 1 : -1;
    out.push({ key: 'deck', pos: [side * 11, -6.5], kit: 'off', role: 'runner', pose: { kind: 'deck', phase: t * 1.4, face: [-side * 0.5, -0.8] }, alpha: 1 });
  }
  return out;
}

/** 球を持っている野手の番号（球が手の中にある間は球を描かない）。持っていなければ 0 */
export function holderAt(motion, t) {
  if (t < PITCH_RELEASE - 0.02) return 1;
  const ball = sample(motion.ball, t);
  const a = sample(motion.ball, t - 0.08);
  const b = sample(motion.ball, t + 0.08);
  // 球が動いていない・野手と一緒に動いている
  for (let n = 1; n <= 9; n++) {
    const p = sample(motion.fielders[n], t);
    if (Math.hypot(p[0] - ball[0], p[1] - ball[1]) < 1.1 && ball[2] < 2.6 && Math.hypot(b[0] - a[0], b[1] - a[1]) < 1.6) return n;
  }
  return 0;
}

export const MOTION_SPOTS = { UMPIRE_HOME, UMPIRES, COACHES, FIELDER_HOME };
