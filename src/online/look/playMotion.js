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
const TROT_SPEED = 7; // 四球で一塁へ
const HOMER_SPEED = 13; // 本塁打の一周（見やすく速め）
const FIELD_SPEED = 7.5; // 野手
const THROW_SPEED = 32;
const ROLL_SPEED = 30; // ゴロ
const PITCH_RELEASE = 0.45;
const CONTACT = 0.95; // 球が本塁に来る

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
function flightTrack(from, to, t0, dur, peak, z0 = 1, z1 = 0) {
  const out = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    out.push([t0 + dur * u, lerp(from[0], to[0], u), lerp(from[1], to[1], u), lerp(z0, z1, u) + 4 * peak * u * (1 - u)]);
  }
  return out;
}

/** 送球（低い弧） */
function throwTrack(from, to, t0) {
  const d = dist2(from, to);
  const dur = Math.max(0.25, d / THROW_SPEED);
  return { track: flightTrack(from, to, t0, dur, Math.min(4, d / 18), 1.6, 1.4), end: t0 + dur };
}

/** 塁に入る野手（一塁＝一塁手、二塁＝打球の逆側の二遊間、三塁＝三塁手、本塁＝捕手）。捕った人が自分なら投手 */
function coverOf(base, fielder, dir) {
  const want = base === 1 ? 3 : base === 2 ? (dir < 0 ? 4 : 6) : base === 3 ? 5 : 2;
  if (want !== fielder) return want;
  return base === 2 ? (want === 4 ? 6 : 4) : 1;
}

/**
 * 1場面の動き。
 * @param scene `liveScenes` の1つ
 * @param before その場面の前の塁（前の場面の `basesAfter`。半回の頭は0）
 * @returns `{ duration, ball, fielders: [9人の軌跡（1〜9）], runners: [{ start, target, track, outAt, homeAt }],
 *            batter: { swingAt } | null, marks: [{ t, text, tone }], guessed }`
 *          `guessed` は走者の割り当てが合わず、動かさずに置いたとき true
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
  const fielders = FIELDER_HOME.map((p) => (p ? [[0, ...p, 0]] : null));
  // 野手を動かす（前の動きが終わってから。時間は戻さない）
  const move = (n, to, t0, t1) => {
    const tr = fielders[n];
    const last = tr[tr.length - 1];
    const start = Math.max(t0, last[0]);
    if (start > last[0]) tr.push([start, last[1], last[2], 0]);
    tr.push([Math.max(t1, start + 0.05), to[0], to[1], 0]);
  };
  const marks = [];
  const ball = [];
  const plate = [0, 0.6];
  const mound = FIELDER_HOME[1];
  // 投球（打席の外の行は捕手への1球だけ）
  ball.push(...flightTrack(mound, plate, PITCH_RELEASE, CONTACT - PITCH_RELEASE, 0.3, 2, 0.9));
  let tAfter = CONTACT;
  /** 刺す塁と時間（送球が着いたとき） */
  const outsAt = new Map();
  let swingAt = null;
  let fielder = null;
  let lastThrow = null; // 球を持っている野手と時間
  const runnerStart = hasBatter ? CONTACT + 0.1 : CONTACT;

  const outRunners = (assigned || []).filter((r) => r.target === 'out');
  // 刺される塁: 打者は一塁、走者は次の塁（盗塁死は盗んだ塁）
  const outBaseOf = (r) => Math.min(4, r.start + 1);

  if (!hasBatter) {
    if (code === '刺' && outRunners.length) {
      // 盗塁死: 捕手が捕って刺す塁へ投げる
      const r = outRunners[0];
      const base = outBaseOf(r);
      const cover = coverOf(base, 2, 0);
      move(cover, baseAt(base), CONTACT - 0.3, CONTACT + 0.4);
      const th = throwTrack(plate, baseAt(base), CONTACT + 0.15);
      ball.push(...th.track);
      outsAt.set(r, th.end);
      marks.push({ t: th.end, text: 'アウト', tone: 'out' });
      tAfter = th.end;
    } else {
      // 暴投・捕逸など: 球が後ろへそれる
      ball.push(...flightTrack(plate, [4, -14], CONTACT, 0.7, 0.2, 0.9, 0));
      move(2, [3, -12], CONTACT, CONTACT + 0.9);
      if (scene.runs > 0) marks.push({ t: CONTACT + 1.5, text: `${scene.runs}点`, tone: 'run' });
      tAfter = CONTACT + 0.7;
    }
  } else if (!batted) {
    // 打球の無い打席（三振・四球・死球）
    if (code === '振') {
      swingAt = CONTACT - 0.08;
      marks.push({ t: CONTACT + 0.1, text: '三振', tone: 'out' });
    } else if (code === '死') {
      marks.push({ t: CONTACT + 0.1, text: '死球', tone: 'on' });
    } else {
      marks.push({ t: CONTACT + 0.1, text: code === '四' ? '四球' : '', tone: 'on' });
    }
    tAfter = CONTACT + 0.6;
  } else {
    swingAt = CONTACT - 0.08;
    fielder = batted.pos;
    const ground = batted.la < 10;
    const home = code === '本';
    const hit = code === '安' || code === '二' || code === '三';
    const wall = fenceOf(batted.dir);
    const fHome = FIELDER_HOME[fielder] || FIELDER_HOME[8];
    let fieldPoint;
    let fieldTime;
    if (home) {
      // 本塁打: スタンドへ。外野手はフェンスまで追って見送る
      const land = at(batted.dir, wall + 14);
      const dur = Math.min(5, 1.6 + batted.dist / 45);
      ball.push(...flightTrack(plate, land, CONTACT, dur, Math.max(14, batted.dist * Math.tan((Math.max(15, batted.la) * Math.PI) / 180) / 4), 1, 9));
      if (fielder >= 7) move(fielder, at(batted.dir, wall - 3), CONTACT + 0.2, CONTACT + dur * 0.9);
      marks.push({ t: CONTACT + dur, text: 'ホームラン！', tone: 'run' });
      tAfter = CONTACT + dur;
    } else if (ground) {
      // ゴロ: 野手の定位置を打球の線に落とした所で捕る（抜けた安打は外野まで転がる）
      const along = Math.max(6, fHome[0] * Math.sin((batted.dir * Math.PI) / 180) + fHome[1] * Math.cos((batted.dir * Math.PI) / 180));
      const through = hit && fielder >= 7;
      const d = through ? Math.max(along, Math.min(wall - 8, Math.max(batted.dist, 55))) : Math.min(along, fielder <= 2 ? 12 : along);
      fieldPoint = at(batted.dir, fielder <= 2 && !through ? Math.min(d, Math.max(4, batted.dist)) : d);
      const rollDur = dist2(plate, fieldPoint) / (through ? ROLL_SPEED * 0.8 : ROLL_SPEED);
      ball.push([CONTACT, plate[0], plate[1], 0.8], [CONTACT + rollDur, fieldPoint[0], fieldPoint[1], 0.15]);
      const run = dist2(fHome, fieldPoint) / FIELD_SPEED;
      fieldTime = CONTACT + Math.max(rollDur, run * 0.7) + (through ? 0.15 : 0.05);
      move(fielder, fieldPoint, CONTACT + 0.1, fieldTime);
      if (fieldTime > CONTACT + rollDur) ball.push([fieldTime, fieldPoint[0], fieldPoint[1], 0.15]);
    } else {
      // フライ・ライナー: 落ちる所へ。アウトなら野手が着いて捕る
      const dist = Math.min(batted.dist, wall - 2);
      fieldPoint = at(batted.dir, Math.max(5, dist));
      const peak = Math.min(40, Math.max(1.5, (dist * Math.tan((batted.la * Math.PI) / 180)) / 4));
      const dur = Math.min(5.2, Math.max(0.5, 0.35 + Math.sqrt(peak / 4.9) * 2));
      const catchIt = !hit && code !== '失';
      ball.push(...flightTrack(plate, fieldPoint, CONTACT, dur, peak, 1, catchIt ? 1.4 : 0));
      fieldTime = CONTACT + dur;
      if (catchIt) {
        move(fielder, fieldPoint, CONTACT + 0.15, fieldTime - 0.05);
      } else {
        // 落ちた球を拾う（弾んで少し先へ）
        const roll = at(batted.dir, Math.min(wall - 3, dist + 6));
        ball.push([fieldTime + 0.5, roll[0], roll[1], 0.2]);
        const runT = dist2(fHome, roll) / FIELD_SPEED;
        const pickT = Math.max(fieldTime + 0.5, CONTACT + 0.15 + runT);
        move(fielder, roll, CONTACT + 0.15, pickT);
        if (pickT > fieldTime + 0.5) ball.push([pickT, roll[0], roll[1], 0.2]);
        fieldPoint = roll;
        fieldTime = pickT + 0.1;
      }
    }
    if (!home) {
      lastThrow = { from: fieldPoint, t: fieldTime, by: fielder };
      // アウトの送球（併殺は先の塁から）。フライのアウトは捕った時点
      const caught = !ground && !hit && code !== '失';
      const throwOuts = outRunners
        .filter((r) => !(caught && r.start === 0))
        .sort((a, b) => outBaseOf(b) - outBaseOf(a));
      if (caught) {
        const batterOut = outRunners.find((r) => r.start === 0);
        if (batterOut) outsAt.set(batterOut, fieldTime);
        marks.push({ t: fieldTime, text: 'アウト', tone: 'out' });
      }
      let from = fieldPoint;
      let t = fieldTime + 0.15;
      let by = fielder;
      for (const r of throwOuts) {
        const base = outBaseOf(r);
        const cover = coverOf(base, by, batted.dir);
        move(cover, baseAt(base), CONTACT + 0.2, CONTACT + 0.2 + dist2(FIELDER_HOME[cover], baseAt(base)) / FIELD_SPEED);
        if (dist2(from, baseAt(base)) < 4) {
          // 自分で塁を踏む
          outsAt.set(r, t);
        } else {
          const th = throwTrack(from, baseAt(base), t);
          ball.push(...th.track);
          outsAt.set(r, th.end);
          t = th.end;
        }
        marks.push({ t: outsAt.get(r), text: 'アウト', tone: 'out' });
        from = baseAt(base);
        by = cover;
        t += 0.2;
        lastThrow = { from, t, by };
      }
      if (code === '失') {
        // 失策: 一塁への送球がそれる
        const th = throwTrack(fieldPoint, [BASES[1][0] + 9, BASES[1][1] - 8], fieldTime + 0.15);
        ball.push(...th.track);
        move(3, BASES[1], CONTACT + 0.2, CONTACT + 0.9);
        marks.push({ t: th.end - 0.2, text: 'エラー', tone: 'on' });
        lastThrow = null;
        tAfter = th.end;
      } else if (!throwOuts.length && !caught) {
        // 安打: 内野へ返す
        const back = fielder >= 7 ? BASES[2] : BASES[1];
        const cover = coverOf(fielder >= 7 ? 2 : 1, fielder, batted.dir);
        move(cover, back, CONTACT + 0.3, CONTACT + 1.3);
        const th = throwTrack(fieldPoint, back, fieldTime + 0.2);
        ball.push(...th.track);
        marks.push({ t: fieldTime, text: code === '安' ? 'ヒット' : code === '二' ? 'ツーベース' : code === '三' ? 'スリーベース' : '', tone: 'on' });
        tAfter = th.end;
      } else {
        tAfter = Math.max(t, fieldTime);
      }
    }
  }

  // 走者
  const runners = [];
  let end = tAfter;
  if (assigned) {
    // 捕られたフライ（走者は捕ってから進む）。失策・安打は打った時から走る
    const fly = batted && batted.la >= 10 && (code === '凡' || code === '併' || code === '犠');
    for (const r of assigned) {
      const walk = code === '四' || code === '死' || code === '本';
      const speed = code === '本' ? HOMER_SPEED : walk ? TROT_SPEED : RUN_SPEED;
      if (r.target === 'out') {
        const base = outBaseOf(r);
        const outT = outsAt.get(r);
        if (r.start === 0 && (code === '振' || (fly && outT != null && outT <= runnerStart + 0.6))) {
          // 三振・すぐ捕られたフライ: 打者は本塁のそばで終わり
          const track = runTrack([BASES[0], BASES[0]], 0, 1);
          runners.push({ start: r.start, target: 'out', track, outAt: outT ?? CONTACT + 0.1, homeAt: null });
          continue;
        }
        if (fly && r.start > 0) {
          // フライの帰塁で刺された（扱いは簡単に、塁の手前で）
          const track = runTrack([BASES[r.start], BASES[r.start]], 0, 1);
          runners.push({ start: r.start, target: 'out', track, outAt: outT ?? tAfter, homeAt: null });
          continue;
        }
        const t0 = code === '刺' ? 0.3 : runnerStart;
        const tOut = outT ?? tAfter;
        // 刺される時に塁の1.5m手前に来る速さ（遅すぎ・速すぎは丸める）
        const len = BASE - 1.5;
        const sp = Math.max(4, Math.min(11, len / Math.max(0.3, tOut - t0)));
        const track = runTrack(basePath(r.start, base), t0, sp, 1.5);
        runners.push({ start: r.start, target: 'out', track, outAt: tOut, homeAt: null });
        end = Math.max(end, tOut);
        continue;
      }
      // フライの後の進塁（犠飛など）は捕ってから
      const t0 = fly && r.start > 0 && r.target > r.start ? (outsAt.size ? Math.max(...outsAt.values()) : tAfter) + 0.05 : walk ? CONTACT + 0.35 : runnerStart;
      const track = runTrack(basePath(r.start, r.target), t0, speed);
      const arrive = track[track.length - 1][0];
      runners.push({ start: r.start, target: r.target, track, outAt: null, homeAt: r.target === 4 ? arrive : null });
      if (r.target === 4) marks.push({ t: arrive, text: 'ホームイン', tone: 'run', small: true });
      end = Math.max(end, arrive);
    }
    // 走者がホームに向かうときは、球を持った野手が本塁へ返す（間に合わない）
    const lastHome = runners.filter((r) => r.homeAt && r.start > 0).map((r) => r.homeAt);
    if (lastThrow && lastHome.length && code !== '本') {
      const th = throwTrack(lastThrow.from, BASES[0], Math.max(lastThrow.t, Math.max(...lastHome) - 0.6));
      ball.push(...th.track);
      end = Math.max(end, th.end);
    }
  } else {
    // 割り当てが合わない記録: 最後に塁へ置くだけ
    const after = scene.basesAfter || 0;
    for (let b = 1; b <= 3; b++)
      if (after & (1 << (b - 1))) runners.push({ start: b, target: b, track: [[0, ...BASES[b], 0]], outAt: null, homeAt: null, appear: tAfter });
  }
  if (scene.runs > 0 && code !== '本' && hasBatter && batted && !marks.some((m) => m.tone === 'run' && !m.small))
    marks.push({ t: end, text: `${scene.runs}点`, tone: 'run' });
  // 球は持っている野手の手の中で止まる（時間順に並べ直す）
  ball.sort((a, b) => a[0] - b[0]);
  marks.sort((a, b) => a.t - b.t);
  return {
    duration: Math.max(end, tAfter) + 0.9,
    ball,
    fielders,
    runners,
    batter: hasBatter ? { swingAt } : null,
    marks,
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
