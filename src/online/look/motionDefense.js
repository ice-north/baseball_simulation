// ============================================================
// 新しい見た目（試作）「動きで見る」: 守備の持ち場。打球を捕る野手のほかの8人と審判が、
// どこへ・何のために動くか（塁に入る・中継に出る・送球の逸れに備える・打球の後ろへ回る）。
//
// ⚠ ここは「だれが・どこへ」だけを決める。いつ動くか・球の動きは `playMotion.js`。
// ⚠ 記録にあるのは打球を捕った野手と打球の向きだけなので、持ち場は野球の決まりごとから推す:
//    - 塁: 一塁＝一塁手、二塁＝打球の逆側の二遊間、三塁＝三塁手、本塁＝捕手。捕った本人の塁は隣が埋める
//      （一塁手が捕れば投手が一塁、三塁手が捕れば遊撃手が三塁、捕手が捕れば投手が本塁）
//    - バント: 一・三塁手と投手が前へ出て、二塁手が一塁、遊撃手が二塁
//    - 外野の打球: 打球の側の二遊間が中継に出て、逆側が二塁。本塁への返球は左翼からなら三塁手、
//      中堅・右翼からなら一塁手が間に立つ（その塁は遊撃手・二塁手が埋める）
//    - 送球の逸れ: 送球の線を塁の向こうへ延ばした所へ、空いている人が回る
//      （一塁＝捕手と右翼手、二塁＝逆側の外野手・正面は中堅手か投手、三塁＝左翼手と投手、本塁＝投手）
// ============================================================
import { BASES, FIELDER_HOME, UMPIRE_HOME, HOME_SPOT, baseSpot, at, dist2, toward, inGround, P, C, B1, B2, B3, SS, LF, CF, RF } from './motionField.js';

/** 塁を埋める人が重なったときの替え（先の人から） */
const SPARE = [null, [P, B2, B1], [SS, B2, B1], [SS, P, B3], [P, B1, C]];

/**
 * 塁に入る野手・中継に出る野手・本塁への返球の間に立つ野手。
 * @param fielder 打球を捕る野手、`dir` 打球の向き、`outfield` 外野まで飛んだか、`bunt` バントか、
 *   `before` 打つ前の塁、`homePlay` 外野から本塁へ返す場面か、`deep` 長打の深さか
 * @returns `{ cover: [, 一塁, 二塁, 三塁, 本塁], relay, cut }`（野手の番号。居なければ null。バントで空ける塁も null）
 */
export function coverPlan({ fielder, dir, outfield, bunt, before = 0, homePlay, deep }) {
  const left = dir < 0;
  const cover = [null, B1, left ? B2 : SS, B3, C];
  let relay = null;
  let cut = null;
  if (outfield) {
    if (homePlay && !deep) {
      if (dir < -15) {
        cut = B3;
        cover[3] = SS;
        cover[2] = B2;
      } else {
        cut = B1;
        cover[1] = B2;
        cover[2] = SS;
      }
    } else relay = left ? SS : B2;
    // 内野手が外野の浅い所で捕ったときは、中継は要らない
    if (relay === fielder) relay = null;
  } else if (bunt) {
    cover[1] = B2;
    cover[2] = SS;
    // 三塁手が捕ったら、空いた三塁へは二塁走者がいれば遊撃手（二塁は空ける）、一塁走者だけなら捕手が走る
    if (fielder === B3) {
      cover[3] = before & 2 ? SS : before === 1 ? C : null;
      if (before & 2) cover[2] = null;
    }
  } else {
    if (fielder === B1) cover[1] = P;
    if (fielder === B3) {
      cover[3] = SS;
      cover[2] = B2;
    }
    if (fielder === C) cover[4] = P;
  }
  // 捕った本人・もう役のある人と重なったら、空いている人に替える
  const used = new Set([fielder, relay, cut].filter(Boolean));
  for (const b of [1, 2, 3, 4]) {
    if (cover[b] && used.has(cover[b])) cover[b] = SPARE[b].find((n) => !used.has(n)) ?? null;
    if (cover[b]) used.add(cover[b]);
  }
  return { cover, relay, cut };
}

/** 送球の逸れに備える深さ（塁の向こうへ何m） */
const BACKUP_DEPTH = [9, 10, 14, 10, 9];

/** 送球が逸れたときに止める所（送球の線を塁の向こうへ延ばす。壁の手前まで）。`extra` で2人目を奥へ */
export function backupSpot(from, base, extra = 0) {
  const to = baseSpot(base);
  const d = Math.max(dist2(from, to), 0.1);
  const depth = BACKUP_DEPTH[base % 4] + extra;
  return inGround([to[0] + ((to[0] - from[0]) / d) * depth, to[1] + ((to[1] - from[1]) / d) * depth]);
}

/**
 * 送球の逸れに備える野手の候補（先の人ほど塁の近く）と、何人回るか。
 * @param base 送球の先（1〜3 塁・4 本塁）、`from` 投げる所、`before` 打つ前の塁
 */
export function backupsOf({ base, from, before }) {
  // 一塁: 走者がいなければ捕手が打者を追って回る。右翼手も線の方へ詰める
  if (base === 1) return { who: before === 0 ? [C, RF] : [RF], count: 2 };
  // 二塁: 左からの送球は右翼手、右からは左翼手が回る。正面は、捕手・投手からなら中堅手、中堅からなら投手
  if (base === 2) {
    if (Math.abs(from[0]) > 8) return { who: from[0] < 0 ? [RF, B1] : [LF, B3], count: 1 };
    return from[1] > BASES[2][1] + 6 ? { who: [P, B1], count: 1 } : { who: [CF], count: 1 };
  }
  // 三塁: 右・中央からの送球は左翼のファウルゾーンへ抜ける。左翼からは三塁側のベンチの前へ
  if (base === 3) return from[0] > -6 ? { who: [LF, P], count: 2 } : { who: [P], count: 1 };
  return { who: [P, B1], count: 1 };
}

/**
 * 役の無い野手の動き先（塁に入る・中継の位置・打球の後ろ・前へ詰める）。動かないなら null。
 * @param n 野手の番号
 * @param s `{ fielder, ballAt, dir, outfield, ground, bunt, before, homer, plan, leadBase }`
 * @returns `{ to: [x, y], role }`（role: cover・relay・cut・backup・charge）
 */
export function standbyOf(n, s) {
  const { fielder, ballAt, dir, outfield, ground, bunt, before, homer, plan, leadBase } = s;
  const home = FIELDER_HOME[n];
  // 本塁打: 外野手は打球を追いかけて見送る
  if (homer) return n >= LF ? { to: toward(home, ballAt, 12), role: 'watch' } : null;
  for (let b = 1; b <= 3; b++) if (plan.cover[b] === n) return { to: BASES[b], role: 'cover' };
  // 捕手が前へ出て捕ったとき、走者がいれば投手が本塁へ
  if (plan.cover[4] === n && n !== C) return before ? { to: HOME_SPOT, role: 'cover' } : null;
  if (plan.cut === n) {
    // 本塁への返球の間に立つ: 打球と本塁の間の、本塁から16m。走者の走る塁線は空ける（内側へ寄る）
    const angle = Math.max(-30, Math.min(30, (Math.atan2(ballAt[0], ballAt[1]) * 180) / Math.PI));
    return { to: at(angle, 16), role: 'cut' };
  }
  if (plan.relay === n) {
    // 中継: 返球の塁と打球の間に入る
    const base = baseSpot(leadBase || 2);
    return { to: toward(base, ballAt, Math.min(22, dist2(base, ballAt) * 0.42)), role: 'relay' };
  }
  if (n === C) return null;
  if (n === P) {
    if (bunt) return { to: at(dir * 0.3, 12.5), role: 'charge' };
    // 右へのゴロは一塁へ走る（一塁手が塁に入れないときの備え。打者の走る線の内側で止まる）
    if (!outfield) return ground && (dir > 8 || fielder === B1 || fielder === B2) ? { to: [BASES[1][0] - 5.5, BASES[1][1] - 1], role: 'backup' } : { to: toward(home, ballAt, 3.5), role: 'watch' };
    // 外野の打球: 得点圏に走者がいれば三塁と本塁の間のファウルゾーンへ（どちらの返球にも回れる）
    return before & 6 ? { to: [-9.5, 2.5], role: 'backup' } : { to: toward(home, ballAt, 3), role: 'watch' };
  }
  if (n === B1 || n === B3) {
    // バントは前へ出る。ほかは自分の塁の近くへ
    if (bunt) return { to: at(n === B1 ? 31 : -31, 13), role: 'charge' };
    const base = BASES[n === B1 ? 1 : 3];
    return { to: [base[0] * 0.9, base[1] + 2.2], role: 'backup' };
  }
  if (n === B2 || n === SS) return { to: toward(home, ballAt, outfield ? 14 : Math.min(7, dist2(home, ballAt) * 0.4)), role: 'backup' };
  // 外野手
  if (outfield) {
    // 隣の外野手は打球の後ろへ回る。遠い方は内野へ寄る
    const adjacent = fielder === CF ? (dir < 0 ? LF : RF) : CF;
    if (n === adjacent) {
      const r = Math.max(Math.hypot(ballAt[0], ballAt[1]), 1);
      const behind = [ballAt[0] + (ballAt[0] / r) * 7, ballAt[1] + (ballAt[1] / r) * 7];
      return { to: inGround(toward(behind, home, 6), 3), role: 'backup' };
    }
    return { to: toward(home, BASES[2], 20), role: 'backup' };
  }
  // 内野の打球: 打球の向きの外野手は前へ詰める。ほかは送球の逸れに備えて塁の後ろへ
  const side = dir < -15 ? LF : dir > 15 ? RF : CF;
  if (n === side) return { to: toward(home, ballAt, ground ? 24 : 10), role: 'backup' };
  if (n === CF) return { to: [dir < 0 ? 4 : -4, BASES[2][1] + 22], role: 'backup' };
  if (n === RF) return { to: toward(home, [BASES[1][0] + 8, BASES[1][1] + 10], 22), role: 'backup' };
  return { to: toward(home, [BASES[3][0] - 8, BASES[3][1] + 10], 22), role: 'backup' };
}

/**
 * 審判の動き先（球審・一塁・二塁・三塁の順。動かない人は null）。
 * @param s `{ batted, outfield, dir, ballAt, caughtFly, homePlay, before, plays }`（`plays` は送球やアウトのあった塁の集まり）
 */
export function umpireSpots({ batted, outfield, dir, ballAt, flyOut, homePlay, plays }) {
  const out = [null, null, null, null];
  if (!batted) {
    // 盗塁・けん制: 二塁の審判が塁へ寄る
    if (plays.has(2)) out[2] = [-2.5, BASES[2][1] + 3.5];
    return out;
  }
  // 球審: 本塁の争いは三塁線の延長へ回って見る。走者がいなければ打者を追って一塁線へ出る
  if (homePlay || plays.has(4)) out[0] = [-2.8, -2.4];
  else if (!outfield) out[0] = [2.6, 3.4];
  else out[0] = [0.6, -4.2];
  // 外野の飛球: 近い塁審が打球の方へ出て、捕ったかを見る
  if (outfield && flyOut) {
    const goes = dir < -18 ? 3 : dir > 18 ? 1 : 2;
    out[goes] = toward(UMPIRE_HOME[goes], ballAt, 9);
  }
  // 塁の争い: 送球を横から見る所へ寄る
  if (!out[1] && plays.has(1)) out[1] = [BASES[1][0] + 4.6, BASES[1][1] + 1.2];
  if (!out[2]) out[2] = outfield ? [-3.2, BASES[2][1] - 5.5] : plays.has(2) ? [-2.5, BASES[2][1] + 3.5] : null;
  if (!out[3] && plays.has(3)) out[3] = [BASES[3][0] - 4.6, BASES[3][1] + 1.2];
  return out;
}
