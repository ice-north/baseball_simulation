import { ensureCompleteLineup } from '../src/game/lineup.js';
import {
  requireOnline,
  FIELDER_REST_FATIGUE,
  STARTER_SKIP_FATIGUE,
  SUBSTITUTE_MIN_FITNESS,
  SUBSTITUTE_FRESH_FATIGUE,
} from '../src/online/shared.js';
import { getPositionFitness } from '../src/utils/physics.js';

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
const MIN_FITNESS = SUBSTITUTE_MIN_FITNESS;

function restorePitcherSlot(team) {
  const order = team.lineupSettings?.battingOrder || [];
  const ninth = order.find((e) => e.position === 'pitcher');
  if (!ninth) return;
  const fielding = new Set(order.filter((e) => e.position !== 'pitcher').map((e) => e.playerId));
  const starters = team.pitchingRotation?.starters || [];
  const index = (team.pitchingRotation?.currentStarterIndex || 0) % (starters.length || 1);
  const available = (p) => p && p.isActive !== false && !fielding.has(p.id) &&
    (p.position === 'pitcher' || p.pitching);
  if (available(team.players.find((p) => p.id === ninth.playerId))) return;
  const next = [...starters.slice(index), ...starters.slice(0, index)]
    .map((id) => team.players.find((p) => p.id === id)).find(available) ||
    team.players.find(available);
  if (next) ninth.playerId = next.id;
}

function restTiredFielders(team) {
  const order = team.lineupSettings?.battingOrder || [];
  const inLineup = new Set(order.map((e) => e.playerId));
  const bench = team.players.filter(
    (p) =>
      p.isActive !== false &&
      p.position !== 'pitcher' &&
      !inLineup.has(p.id) &&
      (p.fatigue || 0) < FRESH_FATIGUE,
  );
  const swaps = [];
  for (const entry of order) {
    if (entry.position === 'pitcher' || entry.position === 'dh') continue;
    const player = team.players.find((p) => p.id === entry.playerId);
    if (!player || (player.fatigue || 0) < FIELDER_REST_FATIGUE) continue;
    const fit = (p) =>
      p.position === entry.position
        ? 100
        : getPositionFitness(p, entry.position, 0);
    const substitute = bench
      .filter((p) => fit(p) >= MIN_FITNESS)
      .sort(
        (a, b) => fit(b) - fit(a) || (a.fatigue || 0) - (b.fatigue || 0),
      )[0];
    // 守れる控えが居なければ休ませない（守備位置に穴を開けない）
    if (!substitute) continue;
    bench.splice(bench.indexOf(substitute), 1);
    swaps.push({ original: entry.playerId, substitute: substitute.id });
    entry.playerId = substitute.id;
  }
  // ⚠ 戻すときは**選手IDで探す**。`ensureCompleteLineup` が打順の配列を
  //    作り直すことがあり、差し替えたときの要素を握っていても届かない
  return () => {
    for (const { original, substitute } of swaps) {
      const entry = (team.lineupSettings?.battingOrder || []).find(
        (e) => e.playerId === substitute,
      );
      if (entry) entry.playerId = original;
    }
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
 *    「ほかの控え投手」の順に選ぶ。
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
  const index =
    (team.pitchingRotation.currentStarterIndex || 0) % starters.length;
  const starterId = starters[index];
  const slot = order.find(
    (e) =>
      e.playerId === starterId &&
      e.position !== 'pitcher' &&
      e.position !== 'dh' &&
      e.battingOrder >= 1 &&
      e.battingOrder <= 8,
  );
  if (!slot) return () => {};
  // 9番は保存用の仮置きで、今日投げる選手とは限らない。
  const inLineup = new Set(
    order.filter((e) => e.position !== 'pitcher').map((e) => e.playerId),
  );
  const fit = (p) =>
    p.position === slot.position
      ? 100
      : getPositionFitness(p, slot.position, 0);
  const byFit = (a, b) =>
    fit(b) - fit(a) || (a.fatigue || 0) - (b.fatigue || 0);
  const bench = team.players.filter(
    (p) => p.isActive !== false && p.id !== starterId && !inLineup.has(p.id),
  );
  const fielders = bench.filter((p) => p.position !== 'pitcher');
  const substitute =
    fielders
      .filter((p) => fit(p) >= MIN_FITNESS && (p.fatigue || 0) < FRESH_FATIGUE)
      .sort(byFit)[0] ||
    fielders.sort(byFit)[0] ||
    bench.filter((p) => !starters.includes(p.id)).sort(byFit)[0] ||
    bench.sort(byFit)[0];
  if (!substitute) return () => {};
  slot.playerId = substitute.id;
  return () => {
    const current = team.lineupSettings?.battingOrder || [];
    const entry = current.find(
      (e) => e.playerId === substitute.id && e.position !== 'pitcher',
    );
    if (!entry) return;
    entry.playerId = starterId;
    restorePitcherSlot(team);
  };
}

// 短い予約ローテでも疲労投手を固定登板させない。当日の代役だけ差し込み、予約は残す。
export function prepareDailyLineup(team, name) {
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
  const current = pitchers.find((p) => p.id === starters[index]);
  let restore = () => {};
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
