import {
  ensureCompleteLineup,
  fieldFitness,
  nextRotationStarterId,
  placeholderPitcherId,
} from '../src/game/lineup.js';
import {
  requireOnline,
  FIELDER_REST_FATIGUE,
  STARTER_SKIP_FATIGUE,
  SUBSTITUTE_FRESH_FATIGUE,
} from '../src/online/shared.js';
import { FIELD, planField, planRest } from '../src/online/restPlan.js';

/**
 * この疲労を超えた野手はその日だけ控えと入れ替える。
 *
 * ⚠ **全球団に当てること**。かつては「CPUは毎試合 `generateAILineup` が
 *    疲労を見て組み直すから不要」として人の球団だけに当てていたが、
 *    **オンラインではその前提が成り立たない**。サーバーは CPU 球団にも
 *    打順を保存する（`refreshTeamPlan` → `setRecommendedLineup`）ので、
 *    `isUserTeam`（`lineupSettings.battingOrder` があるか）が12球団すべてで
 *    真になり、AIの組み直しは一度も走らない。実測で、CPU球団の中堅手が
 *    60試合すべてに出続けて疲労497まで積み上がっていた。
 *    一人用は CPU 球団に打順を保存しないので、こちらだけの話。
 * ⚠ 80 は CPU が一番重く避ける段（疲労²/1200 が5以上＝疲労約78以上）に合わせた。
 * ⚠ **保存した打順は書き換えない**。その日だけ差し替えて、試合の後に戻す。
 */
// ⚠ 値は `src/online/shared.js` に置く（PC版の編成ページも同じ値で色を変える）
export { FIELDER_REST_FATIGUE, STARTER_SKIP_FATIGUE };
const FRESH_FATIGUE = SUBSTITUTE_FRESH_FATIGUE;

/**
 * 保存する打順の9番（投手の仮置き）を、野手の枠と重ならない投手に直す。
 * 今の9番が野手の枠に居ない投手（登録かローテ）ならそのまま。
 * ⚠ 決め方は `placeholderPitcherId`（保存・スマホの編成と同じ）
 */
function restorePitcherSlot(team) {
  const order = team.lineupSettings?.battingOrder || [];
  const ninth = order.find((e) => e.position === 'pitcher');
  if (!ninth) return;
  const fielding = new Set(
    order.filter((e) => e.position !== 'pitcher').map((e) => e.playerId),
  );
  const starters = team.pitchingRotation?.starters || [];
  const current = team.players.find((p) => p.id === ninth.playerId);
  if (
    current &&
    current.isActive !== false &&
    !fielding.has(current.id) &&
    (current.position === 'pitcher' || starters.includes(current.id))
  )
    return;
  const index =
    (team.pitchingRotation?.currentStarterIndex || 0) % (starters.length || 1);
  const next = placeholderPitcherId(team.players, starters, index, fielding);
  if (next !== undefined) ninth.playerId = next;
}

/**
 * 疲れた野手をその日だけ休ませる。戻す関数を返す。
 * 誰を休ませ、守備をどう組み直すかは `planRest`（`src/online/restPlan.js`。画面の見込みと同じ計算）。
 * ⚠ 先発がほかの守備へ移ることがある（遊撃手を休ませ、二塁手が遊撃に回って控えの二塁手が入る）。
 * ⚠ **保存した打順は書き換えない**。その日だけ差し替えて、試合の後に戻す。
 */
export function restTiredFielders(team) {
  const order = team.lineupSettings?.battingOrder || [];
  const byId = new Map(team.players.map((p) => [p.id, p]));
  const slots = order.filter(
    (e) => e.position !== 'pitcher' && e.position !== 'dh' && byId.has(e.playerId),
  );
  const inLineup = new Set(order.map((e) => e.playerId));
  // ⚠ 守備位置が欠けた・重なった打順は直さない（`planRest` が null。`ensureCompleteLineup` に任せる）
  const plan = planRest(
    slots.map((e) => ({ player: byId.get(e.playerId), position: e.position })),
    team.players.filter((p) => !inLineup.has(p.id)),
  );
  if (!plan) return () => {};
  const saved = new Map(slots.map((e) => [e.playerId, e.position]));
  // 打順の枠はそのまま、入る人と守備位置だけをその日だけ替える
  const changes = [];
  const assigned = plan.assign;
  const leaving = slots.filter((e) => !assigned.has(e.playerId));
  const incoming = [...assigned.keys()].filter((id) => !saved.has(id));
  leaving.forEach((entry, i) => {
    changes.push({ entry, playerId: entry.playerId, position: entry.position });
    entry.playerId = incoming[i];
  });
  for (const entry of slots) {
    const position = assigned.get(entry.playerId);
    if (position === entry.position) continue;
    if (!changes.some((c) => c.entry === entry))
      changes.push({ entry, playerId: entry.playerId, position: entry.position });
    entry.position = position;
  }
  const swaps = changes.map((c) => ({
    original: c.playerId,
    originalPosition: c.position,
    today: c.entry.playerId,
  }));
  // ⚠ 戻すときは**選手IDで探す**。`ensureCompleteLineup` が打順の配列を
  //    作り直すことがあり、差し替えたときの要素を握っていても届かない
  return () => {
    const current = team.lineupSettings?.battingOrder || [];
    const found = swaps.map(({ today }) =>
      current.find((e) => e.playerId === today && e.position !== 'pitcher'),
    );
    swaps.forEach(({ original, originalPosition }, i) => {
      if (!found[i]) return;
      found[i].playerId = original;
      found[i].position = originalPosition;
    });
  };
}
/**
 * **二刀流の先発の日**。次の先発が野手の打順にも入っているとき、その日だけ
 * 野手の枠を控えに任せる（守備位置の合う控えから）。戻す関数を返す。
 *
 * ⚠ `ensureCompleteLineup` に任せると、先発を野手の枠から**外したまま保存する**
 *    （打順を作り直すため）。先発の日が来るたびに二刀流の選手がスタメンから
 *    消えていく。ここで先にその日だけ入れ替え、試合の後に戻す。
 * ⚠ 戻すときは選手IDで探す（`ensureCompleteLineup` が配列を作り直す）。
 * ⚠ 控えは「守れて疲れていない野手」→「野手」→「ローテの外の投手」→
 *    「ほかの控え投手」の順に選ぶ。守備はまとめて組み直す（ほかの先発が守備を
 *    移ることもある。`restTiredFielders` と同じ `planField`）。
 *    誰も選べないと `ensureCompleteLineup` が先発を野手の枠から外し、空いた枠を
 *    控えの野手で埋めようとする。野手の控えが居なければ打順が組めず、その日を
 *    進められない（409）。投手は野手の枠に入れられるので最後の手段にする。
 * ⚠ 戻した後、9番（投手）が同じ選手なら次の先発に替える。`ensureCompleteLineup`
 *    は今日の先発を9番に入れるので、戻すと同じ選手が2回並ぶ（`lineupCommand`
 *    と同じく、野手に入っていない先発で仮に埋める）。
 */
export function benchTwoWayStarter(team) {
  const order = team.lineupSettings?.battingOrder || [];
  const starters = team.pitchingRotation?.starters || [];
  if (!starters.length) return () => {};
  // ⚠ 先発は `ensureCompleteLineup` と同じ決め方（`nextRotationStarterId`）。
  //    `starters[index]` だと、その選手が抹消中のとき別の選手を見てしまい、
  //    実際に9番へ回る二刀流の選手が野手の枠から外れたまま保存される
  const starterId = nextRotationStarterId(team);
  if (starterId === undefined) return () => {};
  const slot = order.find(
    (e) =>
      e.playerId === starterId &&
      e.position !== 'pitcher' &&
      e.position !== 'dh' &&
      e.battingOrder >= 1 &&
      e.battingOrder <= 8,
  );
  if (!slot) return () => {};
  const originalPosition = slot.position;
  // 9番は保存用の仮置きで、今日投げる選手とは限らない。
  const inLineup = new Set(
    order.filter((e) => e.position !== 'pitcher').map((e) => e.playerId),
  );
  const byId = new Map(team.players.map((p) => [p.id, p]));
  const fieldSlots = order.filter(
    (e) => e.position !== 'pitcher' && e.position !== 'dh' && byId.has(e.playerId),
  );
  const bench = team.players.filter(
    (p) => p.isActive !== false && p.id !== starterId && !inLineup.has(p.id),
  );
  const fielders = bench.filter((p) => p.position !== 'pitcher');
  // ⚠ 控えは「疲れていない野手」→「野手」→「ローテの外の投手」→「ほかの控え投手」の順。
  //    それぞれで守備をまとめて組み直し（ほかの先発が守備を移ることもある）、
  //    下限に足りない守備が出ない最初の段を使う。どの段でも出るなら、足りない分の
  //    いちばん少ない段（同じなら前の段）
  const tiers = [
    fielders.filter((p) => (p.fatigue || 0) < FRESH_FATIGUE),
    fielders,
    bench.filter((p) => !starters.includes(p.id)),
    bench,
  ];
  const positions = new Set(fieldSlots.map((e) => e.position));
  const complete =
    fieldSlots.length === FIELD.length && FIELD.every((pos) => positions.has(pos));
  const saved = new Map(fieldSlots.map((e) => [e.playerId, e.position]));
  const staying = fieldSlots.map((e) => byId.get(e.playerId)).filter((p) => p.id !== starterId);
  let plan = null;
  if (complete)
    for (const pool of tiers) {
      const next = pool.length ? planField(staying, pool, saved) : null;
      if (next && (!plan || next.shortfall < plan.shortfall)) plan = next;
      if (plan && plan.shortfall === 0) break;
    }
  const shifts = [];
  let substitute;
  if (plan) {
    substitute = byId.get([...plan.assign.keys()].find((id) => !saved.has(id)));
    for (const entry of fieldSlots) {
      if (entry === slot) continue;
      const position = plan.assign.get(entry.playerId);
      if (position === entry.position) continue;
      shifts.push({ playerId: entry.playerId, position: entry.position });
      entry.position = position;
    }
    slot.position = plan.assign.get(substitute.id);
  } else {
    // 守備位置が欠けた打順（`ensureCompleteLineup` が後で直す）。その位置に合う控えを入れるだけ
    const fit = (p) => fieldFitness(p, slot.position);
    const byFit = (a, b) => fit(b) - fit(a) || (a.fatigue || 0) - (b.fatigue || 0);
    substitute = tiers.map((pool) => [...pool].sort(byFit)[0]).find(Boolean);
  }
  if (!substitute) return () => {};
  slot.playerId = substitute.id;
  return () => {
    const current = team.lineupSettings?.battingOrder || [];
    const entry = current.find(
      (e) => e.playerId === substitute.id && e.position !== 'pitcher',
    );
    if (!entry) return;
    const shifted = shifts.map(({ playerId }) =>
      current.find((e) => e.playerId === playerId && e.position !== 'pitcher'),
    );
    entry.playerId = starterId;
    entry.position = originalPosition;
    shifts.forEach(({ position }, i) => {
      if (shifted[i]) shifted[i].position = position;
    });
    restorePitcherSlot(team);
  };
}

// 短い予約ローテでも疲労投手を固定登板させない。当日の代役だけ差し込み、予約は残す。
//
// `pick`: 人が指名した先発（予告先発。`starterPicks.mjs`）。ローテに居て、疲れていなければ
//   その投手から回す（ローテはその投手の次へ進む）。使えないときは指名を使わずにいつもの
//   決め方に戻し、`report.pick` に 'avoided'、`report.reason` に理由を入れる（呼ぶ側が知らせる）:
//   'left'（名簿に居ない＝トレード・退団）・'inactive'（登録を外れた）・
//   'rotation'（先発ローテから外れた）・'tired'（疲れている）。
// `outside`: 確定したときに控えた先発（`starterPicks.lockStarters`）。ローテから外れていても、
//   投手登録なら投げる（その日だけローテの今の位置に差し込み、試合の後はローテを進めない）。
//   確定の後にローテから外して、相手に見えた先発を取り消せないようにするため。
// ⚠ 指名が無ければ今までとまったく同じ（CPU球団と任せた人の球団は指名を持たない）。
export function prepareDailyLineup(team, name, { pick = null, report = null, outside = false } = {}) {
  const rotation = team.pitchingRotation;
  const starters = rotation?.starters || [];
  requireOnline(
    starters.length > 0,
    `${name}の先発投手が未登録です`,
    409,
    'roster',
  );
  const restoreFielders = restTiredFielders(team);
  const index = (rotation.currentStarterIndex || 0) % starters.length;
  rotation.currentStarterIndex = index;
  // ⚠ ローテには野手も入れられる（二刀流）。先発に選べるのは、ローテに居る選手
  //    （登録を問わない）。ローテが全員疲れていたときの代役だけは投手登録から選ぶ
  //    投手登録の選手はいつも先発できる（投球の能力を持たない古い形でも）
  const canStart = (p) =>
    p.isActive !== false && (p.position === 'pitcher' || !!p.pitching);
  const pitchers = team.players.filter(
    (p) => canStart(p) && (p.position === 'pitcher' || starters.includes(p.id)),
  );
  let restore = () => {};
  if (pick != null) {
    const at = starters.indexOf(pick);
    const player = team.players.find((p) => p.id === pick);
    const reason = !player
      ? 'left'
      : player.isActive === false
        ? 'inactive'
        : !pitchers.includes(player) || (at < 0 && !outside)
          ? 'rotation'
          : (player.fatigue || 0) >= STARTER_SKIP_FATIGUE
            ? 'tired'
            : null;
    if (!reason && at >= 0) {
      rotation.currentStarterIndex = at;
      if (report) report.pick = 'used';
    } else if (!reason) {
      // ローテの外の投手（確定の後に外された）。今の位置に差し込み、試合の後に元へ戻す。
      // ⚠ 位置も戻す（試合が差し込んだ投手の次へ進めるので、そのままだと次の番の投手が飛ぶ）
      const original = [...starters];
      rotation.starters = [...starters.slice(0, index), pick, ...starters.slice(index)];
      rotation.currentStarterIndex = index;
      restore = () => {
        rotation.starters = original;
        rotation.currentStarterIndex = index;
      };
      if (report) report.pick = 'used';
    } else if (report) {
      report.pick = 'avoided';
      report.reason = reason;
    }
  }
  const current = pitchers.find(
    (p) => p.id === rotation.starters[rotation.currentStarterIndex],
  );
  if (!current || (current.fatigue || 0) >= STARTER_SKIP_FATIGUE) {
    // ⚠ **今の順番から先へ**探すこと（一人用の `selectStarterFromRotation` と同じ）。
    //    以前は先頭から探していたので、4番手が疲れていると1番手に戻り、
    //    5番手は飛ばされ、上位の先発ばかり短い間隔で投げていた
    let rested = -1;
    for (let i = 1; i < starters.length && rested < 0; i += 1) {
      const candidate = (index + i) % starters.length;
      if (
        pitchers.some(
          (p) =>
            p.id === starters[candidate] &&
            (p.fatigue || 0) < STARTER_SKIP_FATIGUE,
        )
      )
        rested = candidate;
    }
    if (rested >= 0) rotation.currentStarterIndex = rested;
    else {
      const substitute = pitchers
        .filter((p) => p.position === 'pitcher')
        .sort((a, b) => (a.fatigue || 0) - (b.fatigue || 0))[0];
      requireOnline(substitute, `${name}の投手が不足しています`, 409, 'roster');
      const original = [...starters];
      rotation.starters[index] = substitute.id;
      restore = () => {
        rotation.starters = original;
      };
    }
  }
  const restoreTwoWay = benchTwoWayStarter(team);
  requireOnline(
    ensureCompleteLineup(team, false),
    `${name}の編成を補完できません`,
    409,
    'roster',
  );
  return () => {
    restoreTwoWay();
    restore();
    restoreFielders();
    // 休養と先発の代役が重なった場合も、最終的な野手8人と重複させない。
    restorePitcherSlot(team);
  };
}
