import { ensureCompleteLineup } from '../src/game/lineup.js';
import { requireOnline } from '../src/online/shared.js';
import { getPositionFitness } from '../src/utils/physics.js';

/**
 * 人の球団で、この疲労を超えた野手はその日だけ控えと入れ替える。
 *
 * ⚠ **CPUの球団は毎試合、疲労を見て打順を組み直す**（`generateAILineup`）が、
 *    人の球団は保存した打順のまま毎試合出続ける。試合に出た選手はその日に
 *    疲労が回復しないので、休養日（6ターンに1回）しか下がらず、実測で
 *    遊撃手の疲労が8月に396まで積み上がり、打撃がほぼ0になっていた。
 * ⚠ 80 は CPU が一番重く避ける段（疲労²/1200 が5以上＝疲労約78以上）に合わせた。
 * ⚠ **保存した打順は書き換えない**。その日だけ差し替えて、試合の後に戻す。
 */
export const FIELDER_REST_FATIGUE = 80;
const FRESH_FATIGUE = 40;
const MIN_FITNESS = 60;

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
      p.position === entry.position ? 100 : getPositionFitness(p, entry.position, 0);
    const substitute = bench
      .filter((p) => fit(p) >= MIN_FITNESS)
      .sort((a, b) => fit(b) - fit(a) || (a.fatigue || 0) - (b.fatigue || 0))[0];
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
  const restoreFielders =
    team.controlType === 'human' ? restTiredFielders(team) : () => {};
  const index = (rotation.currentStarterIndex || 0) % starters.length;
  rotation.currentStarterIndex = index;
  const pitchers = team.players.filter(
    (p) => p.position === 'pitcher' && p.isActive !== false,
  );
  const current = pitchers.find((p) => p.id === starters[index]);
  let restore = () => {};
  if (!current || (current.fatigue || 0) >= 40) {
    // ⚠ **今の順番から先へ**探すこと（一人用の `selectStarterFromRotation` と同じ）。
    //    以前は先頭から探していたので、4番手が疲れていると1番手に戻り、
    //    5番手は飛ばされ、上位の先発ばかり短い間隔で投げていた
    let rested = -1;
    for (let i = 1; i < starters.length && rested < 0; i += 1) {
      const candidate = (index + i) % starters.length;
      if (pitchers.some((p) => p.id === starters[candidate] && (p.fatigue || 0) < 40))
        rested = candidate;
    }
    if (rested >= 0) rotation.currentStarterIndex = rested;
    else {
      const substitute = [...pitchers].sort(
        (a, b) => (a.fatigue || 0) - (b.fatigue || 0),
      )[0];
      requireOnline(substitute, `${name}の投手が不足しています`, 409, 'roster');
      const original = [...starters];
      rotation.starters[index] = substitute.id;
      restore = () => {
        rotation.starters = original;
      };
    }
  }
  requireOnline(
    ensureCompleteLineup(team, false),
    `${name}の編成を補完できません`,
    409,
    'roster',
  );
  return () => {
    restore();
    restoreFielders();
  };
}
