// ============================================================
// 新しい見た目（試作）「動きで見る」: 選手（人形）を描く。
//
// 頭の大きい3頭身。本拠地の球団は白いユニフォーム、相手は球団の色。攻撃側はヘルメット、守備側は帽子。
// 姿勢（`motionPose.js` の `{ kind, u, face, dir, phase }`）から、腰・肩・頭・手・足の位置を決め
// （`skeleton`）、太い線と丸で描く（`drawFigure`）。まわりに濃い縁を付けて、芝の上でも形が読めるようにする。
//
// ⚠ 座標は足もとが原点、上が +y、長さの単位は身長（1 = 頭のてっぺん）。A は画面の左側の手足、B は右側。
// ⚠ ほかのゲームの絵・形は写さない（このゲームの顔（丸顔のデフォルメ）に合わせた自前の形）。
// ============================================================
import { shade } from './art.js';
import { PITCH_RELEASE } from './playMotion.js';

const OUTLINE = '#0b1220';
const SKIN = '#f2c8a0';
const HAIR = '#2b211b';
const GLOVE = '#a8672c';
const WOOD = '#e2bd83';

const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => {
  const u = clamp01(v);
  return u * u * (3 - 2 * u);
};
const bezier = (p0, p1, p2, u) => [
  (1 - u) * (1 - u) * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0],
  (1 - u) * (1 - u) * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1],
];

/** 色が緑っぽいか（芝に沈む） */
function greenish(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return g > r * 1.15 && g >= b * 0.95;
}

/**
 * ユニフォームの色。
 * @param look 球団の見た目（`teamLook`）
 * @param home 本拠地の球団か（白いユニフォーム）
 * @param role 'fielder' | 'pitcher' | 'catcher' | 'runner' | 'coach' | 'umpire'
 */
export function kitOf(look, home, role) {
  if (role === 'umpire')
    return { jersey: '#1c2740', pants: '#59616f', sleeve: '#1c2740', cap: '#0f172a', brim: '#0f172a', sock: '#1f2937', belt: '#0b1220', trim: '#94a3b8', helmet: false, gear: false, glove: false };
  const c1 = look.c1;
  const c2 = look.c2;
  // 相手は球団の色の上着。緑の球団は芝に沈むので濃くする
  const road = greenish(c1) ? shade(c1, -0.42) : c1;
  const kit = home
    ? { jersey: '#f6f7f9', pants: '#eceef2', sleeve: c1, cap: c1, brim: shade(c1, -0.3), sock: c1, belt: shade(c1, -0.35), trim: c1 }
    : { jersey: road, pants: '#c3c9d3', sleeve: shade(road, -0.35), cap: road, brim: c2, sock: shade(road, -0.15), belt: '#1b2230', trim: c2 };
  return { ...kit, helmet: role === 'runner', gear: role === 'catcher', glove: role === 'fielder' || role === 'pitcher' || role === 'catcher' };
}

/**
 * 姿勢 → 体の点。
 * @returns `{ hip, sh, head, handA, handB, footA, footB, fx, fz, tilt, reach, bat, glove, ball, splay }`
 */
export function skeleton(pose) {
  let [fx, fz] = pose.face || [0, 1];
  const kind = pose.kind;
  const u = pose.u ?? 0;
  const d = pose.dir || 1;
  // c: 腰を落とす量、lean: 肩の横ずれ
  // splay: 前から見たとき、膝をどれだけ外へ開くか（0 まっすぐ … 1 いっぱい）。腰を落とす構えだけ開く
  const S = { c: 0.03, lean: 0, hipX: 0, hipY: null, footA: [-0.075, 0], footB: [0.075, 0], tilt: 0, lift: 0, reach: 1, headDrop: 0, bat: null, glove: 'A', ball: null, splay: 0.08 };
  // 手は腰・肩が決まってから置く
  let hands = null;
  switch (kind) {
    case 'ready':
      S.c = 0.34 + 0.08 * u;
      S.splay = 0.3;
      S.footA = [-0.14, 0];
      S.footB = [0.14, 0];
      hands = (b) => [
        [-lerp(0.125, 0.09, u), b.hip[1] - lerp(0.09, 0.02, u)],
        [lerp(0.125, 0.09, u), b.hip[1] - lerp(0.09, 0.02, u)],
      ];
      break;
    case 'ready-of':
      S.c = 0.16 + 0.06 * u;
      S.splay = 0.2;
      S.footA = [-0.11, 0];
      S.footB = [0.11, 0];
      hands = (b) => [
        [-0.12, b.hip[1] - 0.11],
        [0.12, b.hip[1] - 0.11],
      ];
      break;
    case 'lead':
      S.c = 0.3;
      S.lean = 0.015 * Math.sin(pose.phase || 0);
      S.footA = [-0.15, 0];
      S.footB = [0.15, 0];
      hands = (b) => [
        [-0.1, b.hip[1] - 0.04],
        [0.1, b.hip[1] - 0.04],
      ];
      break;
    case 'run':
    case 'trot': {
      const amp = kind === 'trot' ? 0.62 : 1;
      const p = pose.phase || 0;
      const side = 1 - Math.abs(fx);
      S.c = 0.1;
      S.lean = fx * 0.06 * amp;
      S.lift = 0.014 * Math.abs(Math.sin(p));
      S.footA = [-0.05 * side + fx * 0.17 * amp * Math.sin(p), 0.11 * amp * Math.max(0, Math.cos(p))];
      S.footB = [0.05 * side - fx * 0.17 * amp * Math.sin(p), 0.11 * amp * Math.max(0, -Math.cos(p))];
      hands = (b) => [
        [b.sh[0] - 0.15 * (0.3 + 0.7 * side) - fx * 0.14 * amp * Math.sin(p), b.sh[1] - 0.16 - 0.05 * amp * Math.sin(p)],
        [b.sh[0] + 0.15 * (0.3 + 0.7 * side) + fx * 0.14 * amp * Math.sin(p), b.sh[1] - 0.16 + 0.05 * amp * Math.sin(p)],
      ];
      break;
    }
    case 'pitch': {
      // 構え → 足を上げる → 踏み出して投げる → 投げ終わり
      const t = pose.t || 0;
      const R = PITCH_RELEASE;
      const liftU = ease((t - 0.18) / 0.36);
      const stride = ease((t - (R - 0.34)) / 0.34);
      const follow = ease((t - R) / 0.4);
      S.c = 0.02 + 0.3 * stride + 0.12 * follow;
      S.lean = -0.04 * follow;
      S.footA = [-0.04 - 0.14 * stride, 0.27 * liftU * (1 - stride) * (1 - stride)];
      S.footB = [0.05 + 0.07 * follow, 0.16 * Math.sin(Math.PI * follow)];
      fx = 0.35 * liftU * (1 - stride);
      S.ball = t < R ? 'B' : null;
      S.reach = 1.12;
      hands = (b) => {
        const set = [0.02, b.sh[1] - 0.1 + 0.2 * liftU];
        const back = [0.27, b.sh[1] + 0.1];
        const top = [0.15, b.sh[1] + 0.36];
        const out = [-0.03, b.sh[1] + 0.2];
        const down = [-0.15, b.hip[1] - 0.1];
        let throwing;
        if (stride <= 0) throwing = set;
        else if (follow <= 0) throwing = stride < 0.45 ? bezier(set, [0.2, b.sh[1] - 0.1], back, stride / 0.45) : bezier(back, top, out, (stride - 0.45) / 0.55);
        else throwing = bezier(out, [-0.16, b.sh[1]], down, follow);
        const glove = stride <= 0 ? [-0.02, set[1]] : [lerp(-0.02, -0.17, Math.min(1, stride * 2)), lerp(set[1], b.sh[1] - 0.13, stride)];
        return [glove, throwing];
      };
      break;
    }
    case 'squat':
    case 'receive': {
      // 捕手: しゃがんで構える（u で立ち上がる）
      const up = kind === 'squat' ? u : 0;
      const pop = kind === 'receive' ? Math.sin(Math.PI * clamp01(u)) : 0;
      if (kind === 'receive' && !pose.squat) {
        S.c = 0.2;
        hands = (b) => [
          [-0.1, b.sh[1] - 0.06],
          [0.14, b.hip[1] + 0.03],
        ];
        break;
      }
      S.hipY = lerp(0.17, 0.36, up);
      S.footA = [-0.14, 0];
      S.footB = [0.14, 0];
      S.splay = lerp(0.85, 0.1, up);
      hands = (b) => [
        [-0.16 - 0.02 * pop, b.hip[1] + 0.2 + 0.04 * pop],
        [0.12, b.hip[1] + 0.05],
      ];
      break;
    }
    case 'bat': {
      // 構え → 足を上げてためる → 振る
      const t = pose.t || 0;
      const sw = pose.swingAt;
      const load = sw == null ? 0 : ease((t - (sw - 0.3)) / 0.3) * (t < sw ? 1 : 0);
      const s = sw == null ? 0 : clamp01((t - sw) / 0.2);
      S.c = 0.2 - 0.05 * s;
      S.footA = [-0.11, 0];
      S.footB = [0.1 + 0.03 * s, 0.045 * load];
      S.glove = null;
      S.lean = -0.02 * load + 0.05 * s;
      fx = lerp(fx, 0.35, s);
      fz = lerp(fz, -0.94, s);
      const waggle = sw != null && t >= sw ? 0 : 5 * Math.sin(t * 6);
      const angle = s <= 0 ? 104 + waggle + 8 * load : s < 0.5 ? lerp(112, -8, ease(s / 0.5)) : s < 0.8 ? lerp(-8, 62, (s - 0.5) / 0.3) : lerp(62, 150, (s - 0.8) / 0.2);
      hands = (b) => {
        const g0 = [-0.07 - 0.03 * load, b.sh[1] + 0.02];
        const g1 = [0.11, b.sh[1] - 0.11];
        const g2 = [0.03, b.sh[1] + 0.06];
        const grip = s <= 0 ? g0 : s < 0.5 ? [lerp(g0[0], g1[0], ease(s / 0.5)), lerp(g0[1], g1[1], ease(s / 0.5))] : [lerp(g1[0], g2[0], (s - 0.5) / 0.5), lerp(g1[1], g2[1], (s - 0.5) / 0.5)];
        S.bat = { grip, angle, len: s > 0.8 ? 0.42 : 0.5 };
        return [
          [grip[0] - 0.015, grip[1] - 0.012],
          [grip[0] + 0.015, grip[1] + 0.012],
        ];
      };
      break;
    }
    case 'bunt':
      // 体を投手へ向け、バットを寝かせる
      S.c = 0.3 * u;
      S.footA = [-0.12, 0];
      S.footB = [0.12, 0];
      S.glove = null;
      hands = (b) => {
        const y = b.sh[1] - 0.13;
        S.bat = { grip: [-0.13, y - 0.005], angle: lerp(100, 6, u), len: 0.5 };
        return [
          [-0.12, y],
          [0.1 * u - 0.1 * (1 - u), y + 0.012 * u],
        ];
      };
      break;
    case 'deck': {
      S.glove = null;
      S.footA = [-0.09, 0];
      S.footB = [0.09, 0];
      const a = 78 + 26 * Math.sin(pose.phase || 0);
      hands = (b) => {
        const grip = [0.03, b.sh[1] - 0.05];
        S.bat = { grip, angle: a, len: 0.5 };
        return [
          [grip[0] - 0.015, grip[1] - 0.01],
          [grip[0] + 0.015, grip[1] + 0.01],
        ];
      };
      break;
    }
    case 'flinch':
      S.c = 0.12 * u;
      S.lean = -0.07 * u;
      S.glove = null;
      hands = (b) => [
        [-0.12, b.sh[1] + 0.02 * u],
        [0.1, b.sh[1] + 0.04 * u],
      ];
      break;
    case 'slump':
      S.headDrop = 0.035;
      S.glove = null;
      if (pose.bat)
        hands = (b) => {
          const grip = [0.19, b.hip[1] + 0.02];
          S.bat = { grip, angle: -68, len: 0.48 };
          return [[-0.185, b.hip[1] + 0.02], grip];
        };
      break;
    case 'cheer':
      S.lift = 0.035 * Math.abs(Math.sin(pose.phase || 0));
      S.reach = 1.2;
      S.glove = null;
      hands = (b) => [
        [-0.2, b.sh[1] + 0.3],
        [0.2, b.sh[1] + 0.3],
      ];
      break;
    case 'slide': {
      // 足から滑る → 立ち上がる
      const down = ease(u * 1.5) * (1 - (pose.up || 0));
      S.tilt = -d * 1.12 * down;
      S.c = 0.15 * down;
      S.glove = null;
      S.footA = [-0.05, 0];
      S.footB = [0.07, 0.05 * down];
      hands = (b) => [
        [-0.17, lerp(b.hip[1], b.sh[1] + 0.14, down)],
        [0.17, lerp(b.hip[1], b.sh[1] + 0.14, down)],
      ];
      break;
    }
    case 'dive': {
      // 頭から飛びつく（そのまま倒れている）
      const down = ease(u / 0.155);
      S.tilt = d * 1.38 * down;
      S.reach = 1.3;
      S.glove = d > 0 ? 'B' : 'A';
      hands = (b) => [
        [-0.06, lerp(b.hip[1], b.sh[1] + 0.34, down)],
        [0.06, lerp(b.hip[1], b.sh[1] + 0.34, down)],
      ];
      break;
    }
    case 'scoop': {
      // ゴロを拾う（腰を落として、グラブを下へ）
      const down = u < 0.59 ? ease(u / 0.59) : 1 - 0.7 * ease((u - 0.59) / 0.41);
      S.c = 0.2 + 0.42 * down;
      S.footA = [-0.15, 0];
      S.footB = [0.15, 0];
      S.glove = d > 0 ? 'B' : 'A';
      hands = (b) => {
        const g = [d * 0.05, lerp(b.hip[1], 0.06, down)];
        const o = [-d * 0.07, lerp(b.hip[1], 0.13, down)];
        return d > 0 ? [o, g] : [g, o];
      };
      break;
    }
    case 'catch-high': {
      // フライを捕る（グラブを頭の上へ）
      const up = u < 0.57 ? ease(u / 0.4) : 1 - 0.8 * ease((u - 0.57) / 0.43);
      S.c = 0.08;
      S.reach = 1.3;
      S.headDrop = -0.012 * up;
      S.glove = d > 0 ? 'B' : 'A';
      hands = (b) => {
        const g = [d * 0.08, lerp(b.hip[1] + 0.06, b.sh[1] + 0.36, up)];
        const o = [-d * 0.17, b.hip[1] + 0.06 + 0.1 * up];
        return d > 0 ? [o, g] : [g, o];
      };
      break;
    }
    case 'catch': {
      const out = Math.sin(Math.PI * clamp01(u));
      S.c = 0.14;
      S.glove = d > 0 ? 'B' : 'A';
      hands = (b) => {
        const g = [d * (0.12 + 0.08 * out), b.sh[1] - 0.05];
        const o = [-d * 0.17, b.hip[1] + 0.04];
        return d > 0 ? [o, g] : [g, o];
      };
      break;
    }
    case 'stretch': {
      // 塁を踏んで、送球へ体を伸ばす
      const st = ease(u / 0.5) * (u < 0.72 ? 1 : 1 - 0.6 * ease((u - 0.72) / 0.28));
      S.c = 0.12 * st;
      S.lean = d * 0.09 * st;
      S.reach = 1.18;
      S.glove = d > 0 ? 'B' : 'A';
      const lead = [d * (0.08 + 0.15 * st), 0];
      const back = [-d * 0.1, 0];
      S.footA = d > 0 ? back : lead;
      S.footB = d > 0 ? lead : back;
      hands = (b) => {
        const g = [b.sh[0] + d * (0.16 + 0.13 * st), b.sh[1] - 0.02 + 0.03 * st];
        const o = [-d * 0.15, b.hip[1] + 0.05];
        return d > 0 ? [o, g] : [g, o];
      };
      break;
    }
    case 'tag': {
      // 送球を受けて、塁へグラブを下ろす
      const down = u < 0.5 ? ease(u / 0.5) : 1 - 0.6 * ease((u - 0.5) / 0.5);
      S.c = 0.38 * down;
      S.footA = [-0.13, 0];
      S.footB = [0.13, 0];
      S.glove = d > 0 ? 'B' : 'A';
      hands = (b) => {
        const g = [d * 0.17, lerp(b.sh[1] - 0.05, 0.1, down)];
        const o = [-d * 0.15, b.hip[1] + 0.04];
        return d > 0 ? [o, g] : [g, o];
      };
      break;
    }
    case 'throw': {
      // 振りかぶる → 投げる → 投げ終わり（投げる手は投げる向きの反対側）
      const cock = ease(u / 0.3);
      const rel = clamp01((u - 0.3) / 0.2);
      const follow = ease((u - 0.5) / 0.5);
      S.c = 0.12 + 0.1 * follow;
      S.lean = lerp(-d * 0.03 * cock, d * 0.08, rel);
      S.reach = 1.12;
      S.glove = d > 0 ? 'B' : 'A';
      S.ball = u < 0.364 ? (d > 0 ? 'A' : 'B') : null;
      const front = [d * 0.16 * cock, 0];
      const back = [-d * 0.09 + d * 0.1 * follow, 0.07 * Math.sin(Math.PI * follow)];
      S.footA = d > 0 ? back : front;
      S.footB = d > 0 ? front : back;
      hands = (b) => {
        const rest = [-d * 0.18, b.hip[1] + 0.02];
        const high = [-d * 0.25, b.sh[1] + 0.19];
        const out = [d * 0.25, b.sh[1] + 0.05];
        const low = [d * 0.15, b.hip[1] - 0.03];
        let hand;
        if (rel <= 0) hand = [lerp(rest[0], high[0], cock), lerp(rest[1], high[1], cock)];
        else if (follow <= 0) hand = bezier(high, [0, b.sh[1] + 0.36], out, rel);
        else hand = [lerp(out[0], low[0], follow), lerp(out[1], low[1], follow)];
        const g = [d * lerp(0.22, 0.12, follow), b.sh[1] - 0.03 - 0.1 * follow];
        return d > 0 ? [hand, g] : [g, hand];
      };
      break;
    }
    case 'call-out':
      S.reach = 1.1;
      S.glove = null;
      hands = (b) => [
        [-0.185, b.hip[1] + 0.02],
        [0.19, lerp(b.hip[1], b.sh[1] + 0.2, ease(u))],
      ];
      break;
    case 'call-safe':
      S.c = 0.12;
      S.reach = 1.15;
      S.glove = null;
      hands = (b) => [
        [-0.12 - 0.17 * ease(u), b.sh[1] - 0.04],
        [0.12 + 0.17 * ease(u), b.sh[1] - 0.04],
      ];
      break;
    case 'wave': {
      const p = pose.phase || 0;
      S.glove = null;
      hands = (b) => {
        const w = [b.sh[0] + d * (0.15 + 0.1 * Math.cos(p)), b.sh[1] + 0.05 + 0.13 * Math.sin(p)];
        const o = [-d * 0.185, b.hip[1] + 0.02];
        return d > 0 ? [o, w] : [w, o];
      };
      break;
    }
    default:
      // 立つ（少しゆれる）
      S.lean = 0.006 * Math.sin(pose.phase || 0);
  }
  const hip = [S.hipX, (S.hipY ?? 0.37 - 0.19 * S.c) + S.lift];
  const sh = [hip[0] + S.lean, hip[1] + 0.27 - 0.07 * S.c];
  const head = [sh[0] + S.lean * 0.35, sh[1] + 0.175 - S.headDrop];
  const body = { hip, sh, head };
  const [handA, handB] = hands
    ? hands(body)
    : [
        [sh[0] - 0.185, hip[1] + 0.02],
        [sh[0] + 0.185, hip[1] + 0.02],
      ];
  return { ...body, handA, handB, footA: [S.footA[0], S.footA[1] + S.lift * 0.3], footB: [S.footB[0], S.footB[1] + S.lift * 0.3], fx, fz, tilt: S.tilt, reach: S.reach, bat: S.bat, glove: S.glove, ball: S.ball, splay: S.splay };
}

/** 2本の骨の関節（肘・膝）。`pref` の向きへ曲げる。届かない先は手前で止める */
function joint(root, tip, l1, l2, pref) {
  let dx = tip[0] - root[0];
  let dy = tip[1] - root[1];
  let dist = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.002;
  let end = tip;
  if (dist > max) {
    end = [root[0] + (dx / dist) * max, root[1] + (dy / dist) * max];
    dx = end[0] - root[0];
    dy = end[1] - root[1];
    dist = max;
  }
  if (dist < 1e-4) return { mid: [root[0] + pref[0] * l1, root[1] + pref[1] * l1], end };
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist))));
  const base = Math.atan2(dy, dx);
  const c1 = [root[0] + l1 * Math.cos(base + a), root[1] + l1 * Math.sin(base + a)];
  const c2 = [root[0] + l1 * Math.cos(base - a), root[1] + l1 * Math.sin(base - a)];
  const mx = (root[0] + end[0]) / 2;
  const my = (root[1] + end[1]) / 2;
  const s1 = (c1[0] - mx) * pref[0] + (c1[1] - my) * pref[1];
  const s2 = (c2[0] - mx) * pref[0] + (c2[1] - my) * pref[1];
  return { mid: s1 >= s2 ? c1 : c2, end };
}

/**
 * 脚（腰 → 膝 → 足）。`bend` は膝を絵の横へどれだけ出すか（-1 左いっぱい … 0 まっすぐ … 1 右いっぱい）。
 * ⚠ 前向き・後ろ向きの人の膝はカメラの方へ出るので、絵の上では脚がまっすぐ短く見える（`bend` が 0 に近い）。
 *    いつも横へいっぱいに曲げると、立っているだけでもガニ股になる
 */
function legOf(hip, foot, len, bend) {
  let dx = foot[0] - hip[0];
  let dy = foot[1] - hip[1];
  let dist = Math.hypot(dx, dy);
  const max = len * 2 - 0.002;
  let end = foot;
  if (dist > max) {
    end = [hip[0] + (dx / dist) * max, hip[1] + (dy / dist) * max];
    dx = end[0] - hip[0];
    dy = end[1] - hip[1];
    dist = max;
  }
  if (dist < 1e-4) return { mid: [hip[0] + bend * len, hip[1]], end };
  // 下へ伸びる脚の、絵の右向きの法線
  const out = Math.sqrt(Math.max(0, len * len - (dist / 2) * (dist / 2))) * Math.max(-1, Math.min(1, bend));
  return { mid: [(hip[0] + end[0]) / 2 - (dy / dist) * out, (hip[1] + end[1]) / 2 + (dx / dist) * out], end };
}

/** 帽子・ヘルメットの山（上は半円、下の縁は浅い弧） */
function domePath(ctx, cx, cy, r, depth) {
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const a = (Math.PI * i) / 12;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  for (let i = 1; i < 12; i++) {
    const a = Math.PI + (Math.PI * i) / 12;
    ctx.lineTo(cx + r * Math.cos(a), cy + r * depth * Math.sin(a));
  }
  ctx.closePath();
}

function stroke(ctx, pts, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}
function dot(ctx, p, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 人形を描く。
 * @param x, y 足もと（絵の座標）
 * @param h 身長（絵の長さ）
 * @param kit `kitOf` の色
 * @param pose 姿勢
 * @param opt `{ alpha, px }`（`px` は画面での身長の画素。小さいときは細かい所を省く）
 */
export function drawFigure(ctx, x, y, h, kit, pose, opt = {}) {
  const alpha = opt.alpha ?? 1;
  if (alpha <= 0) return;
  const px = opt.px ?? h;
  const fine = px >= 26;
  const b = skeleton(pose);
  const { fx, fz } = b;
  const side = Math.abs(fx);
  const front = fz >= 0;
  // 影（倒れているときは体の下に長く）
  const lying = Math.min(1, Math.abs(b.tilt) / 1.1);
  ctx.save();
  ctx.globalAlpha = alpha * 0.32;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(x + Math.sin(b.tilt) * h * 0.4, y + h * 0.015, h * (0.19 + 0.25 * lying), h * (0.055 + 0.01 * lying), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y - Math.abs(Math.sin(b.tilt)) * h * 0.06);
  ctx.rotate(b.tilt);
  ctx.scale(h, -h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 体の幅（横向きは細い）
  const sw = 0.135 * (0.55 + 0.45 * (1 - side));
  const hw = 0.092 * (0.6 + 0.4 * (1 - side));
  const shA = [b.sh[0] - sw, b.sh[1] - 0.015];
  const shB = [b.sh[0] + sw, b.sh[1] - 0.015];
  const hipA = [b.hip[0] - hw * 0.75, b.hip[1]];
  const hipB = [b.hip[0] + hw * 0.75, b.hip[1]];
  // 膝: 横向きは進む方へ曲げる。前向き・後ろ向きはまっすぐ（構えのときだけ `splay` のぶん外へ）。肘は外へ下へ
  const turn = fx * 1.8;
  const open = b.splay * Math.max(0, 1 - side * 1.8);
  const legA = legOf(hipA, b.footA, 0.195, turn - open);
  const legB = legOf(hipB, b.footB, 0.195, turn + open);
  const armL = 0.138 * b.reach;
  const armA = joint(shA, b.handA, armL, armL * 0.96, b.handA[1] > shA[1] ? [-1, 0.2] : [-0.8, -0.6]);
  const armB = joint(shB, b.handB, armL, armL * 0.96, b.handB[1] > shB[1] ? [1, 0.2] : [0.8, -0.6]);
  const legW = 0.088;
  const armW = 0.07;
  const headR = 0.155;
  const shin = kit.gear ? '#1f2937' : kit.sock;

  const torso = () => {
    ctx.beginPath();
    ctx.moveTo(b.hip[0] - hw, b.hip[1] - 0.03);
    ctx.lineTo(b.hip[0] + hw, b.hip[1] - 0.03);
    ctx.lineTo(b.sh[0] + sw, b.sh[1] - 0.02);
    ctx.quadraticCurveTo(b.sh[0] + sw, b.sh[1] + 0.035, b.sh[0] + sw * 0.5, b.sh[1] + 0.04);
    ctx.lineTo(b.sh[0] - sw * 0.5, b.sh[1] + 0.04);
    ctx.quadraticCurveTo(b.sh[0] - sw, b.sh[1] + 0.035, b.sh[0] - sw, b.sh[1] - 0.02);
    ctx.closePath();
  };
  const bat = () => {
    if (!b.bat) return null;
    const a = (b.bat.angle * Math.PI) / 180;
    const g = b.bat.grip;
    const tip = [g[0] + Math.cos(a) * b.bat.len, g[1] + Math.sin(a) * b.bat.len];
    const mid = [lerp(g[0], tip[0], 0.45), lerp(g[1], tip[1], 0.45)];
    const knob = [g[0] - Math.cos(a) * 0.05, g[1] - Math.sin(a) * 0.05];
    return { knob, mid, tip };
  };
  const bt = bat();

  // ---- 縁（濃い色で一回り太く） ----
  const E = 0.024;
  stroke(ctx, [hipA, legA.mid, legA.end], legW + E * 2, OUTLINE);
  stroke(ctx, [hipB, legB.mid, legB.end], legW + E * 2, OUTLINE);
  stroke(ctx, [shA, armA.mid, armA.end], armW + E * 2, OUTLINE);
  stroke(ctx, [shB, armB.mid, armB.end], armW + E * 2, OUTLINE);
  torso();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = E * 2;
  ctx.fillStyle = OUTLINE;
  ctx.fill();
  ctx.stroke();
  dot(ctx, b.head, headR + E + 0.012, OUTLINE);
  if (bt) {
    stroke(ctx, [bt.knob, bt.mid], 0.026 + E * 1.6, OUTLINE);
    stroke(ctx, [bt.mid, bt.tip], 0.046 + E * 1.6, OUTLINE);
  }

  // ---- 足（ズボン → ストッキング → 靴） ----
  for (const leg of [
    { hip: hipA, ...legA },
    { hip: hipB, ...legB },
  ]) {
    stroke(ctx, [leg.hip, leg.mid, [lerp(leg.mid[0], leg.end[0], 0.45), lerp(leg.mid[1], leg.end[1], 0.45)]], legW, kit.pants);
    stroke(ctx, [[lerp(leg.mid[0], leg.end[0], 0.5), lerp(leg.mid[1], leg.end[1], 0.5)], leg.end], legW * 0.92, shin);
    ctx.fillStyle = '#12161f';
    ctx.beginPath();
    ctx.ellipse(leg.end[0] + fx * 0.025, leg.end[1] + 0.012, 0.058, 0.034, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // ---- 体 ----
  torso();
  ctx.fillStyle = kit.jersey;
  ctx.fill();
  // 肩の影になる下半分を少し暗く、ベルト
  ctx.save();
  torso();
  ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(b.hip[0] - 0.3, b.hip[1] - 0.05, 0.6, (b.sh[1] - b.hip[1]) * 0.42);
  ctx.fillStyle = kit.belt;
  ctx.fillRect(b.hip[0] - 0.3, b.hip[1] - 0.035, 0.6, 0.04);
  if (fine) {
    if (front && side < 0.7) {
      // 前: 合わせの線と胸の印
      ctx.fillStyle = kit.trim;
      ctx.fillRect(b.sh[0] + fx * 0.04 - 0.006, b.hip[1], 0.012, b.sh[1] - b.hip[1] + 0.05);
      ctx.beginPath();
      ctx.arc(b.sh[0] + fx * 0.04 + 0.055, b.sh[1] - 0.075, 0.024, 0, Math.PI * 2);
      ctx.fill();
    } else if (!front && side < 0.7) {
      // 後ろ: 背番号の帯
      ctx.fillStyle = kit.trim;
      ctx.fillRect(b.sh[0] - 0.05, b.sh[1] - 0.15, 0.1, 0.085);
    }
    if (kit.gear) {
      // 捕手のプロテクターの帯
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(b.sh[0] - sw, b.sh[1] + 0.03);
      ctx.lineTo(b.sh[0] + sw * 0.6, b.hip[1]);
      ctx.moveTo(b.sh[0] + sw, b.sh[1] + 0.03);
      ctx.lineTo(b.sh[0] - sw * 0.6, b.hip[1]);
      ctx.stroke();
    }
  }
  ctx.restore();
  // ---- 頭（肌 → 髪 → 帽子・ヘルメット → つば） ----
  dot(ctx, b.head, headR, SKIN);
  if (fz < 0.35) {
    // 後ろ・横: 襟足の髪
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.head[0], b.head[1], headR, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.ellipse(b.head[0] - fx * 0.09, b.head[1] + 0.02, headR * (1.05 - 0.35 * side), headR * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (fine && fz > -0.25) {
    // 目（前は2つ、横は1つ）
    ctx.fillStyle = '#1b1410';
    const ex = b.head[0] + fx * 0.085;
    const ey = b.head[1] - 0.058;
    const gap = 0.055 * (1 - side * 0.75);
    for (const s of side > 0.6 ? [Math.sign(fx) * 0.3] : [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(ex + s * gap, ey, 0.018, 0.025, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 帽子は頭の上の方だけ（前は顔が見える。後ろは深くかぶって見える）
  const capR = headR + (kit.helmet ? 0.024 : 0.014);
  const capY = b.head[1] + (front ? 0.04 : 0.02);
  domePath(ctx, b.head[0], capY, capR, front ? (kit.helmet ? 0.3 : 0.22) : kit.helmet ? 0.75 : 0.62);
  ctx.fillStyle = kit.cap;
  ctx.fill();
  if (fz > -0.5) {
    // つば（前は額の前、横は顔の向きへ）
    const f = Math.max(0, fz);
    ctx.fillStyle = kit.brim;
    ctx.beginPath();
    ctx.ellipse(b.head[0] + fx * 0.15, capY - 0.012 - 0.012 * f, (kit.helmet ? 0.06 : 0.075) + 0.065 * f * (1 - side * 0.5), 0.024 + 0.012 * f, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 照明の当たる所
  ctx.fillStyle = kit.helmet ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(b.head[0] - 0.05, capY + capR * 0.6, capR * 0.3, capR * 0.13, 0.5, 0, Math.PI * 2);
  ctx.fill();
  if (kit.helmet && fine) {
    // 耳当て
    ctx.fillStyle = kit.cap;
    ctx.beginPath();
    ctx.arc(b.head[0] - (side > 0.3 ? Math.sign(fx) : 1) * headR * 0.8, b.head[1] - 0.02, 0.055, 0, Math.PI * 2);
    ctx.fill();
  }
  // ---- 腕（袖 → 前腕 → 手・グラブ） ----
  for (const arm of [
    { sh: shA, ...armA, id: 'A' },
    { sh: shB, ...armB, id: 'B' },
  ]) {
    stroke(ctx, [arm.sh, arm.mid], armW, kit.jersey);
    stroke(ctx, [arm.mid, arm.end], armW * 0.9, kit.sleeve);
    if (kit.glove && b.glove === arm.id) {
      dot(ctx, arm.end, 0.066, OUTLINE);
      dot(ctx, arm.end, 0.052, kit.gear ? '#6b4423' : GLOVE);
    } else {
      dot(ctx, arm.end, 0.04, SKIN);
      if (b.ball === arm.id) {
        dot(ctx, [arm.end[0], arm.end[1] + 0.02], 0.036, OUTLINE);
        dot(ctx, [arm.end[0], arm.end[1] + 0.02], 0.027, '#ffffff');
      }
    }
  }
  // ---- バット ----
  if (bt) {
    stroke(ctx, [bt.knob, bt.mid], 0.026, WOOD);
    stroke(ctx, [bt.mid, bt.tip], 0.046, WOOD);
    stroke(ctx, [bt.mid, bt.tip], 0.014, 'rgba(255,255,255,0.35)');
  }
  ctx.restore();
}
