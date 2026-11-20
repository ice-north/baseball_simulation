// 疲れた野手をその日だけ休ませるときの、守備の組み直し（サーバーと画面の両方が使う）。
//
// サーバー（`server/dailyLineup.mjs` の `restTiredFielders`・`benchTwoWayStarter`）が試合の日に
// 当て、画面（スマホの編成の「気になる所」`tapLineup.js`）は同じ計算で「休めるか」を出す。
// アプリの写しは `mobile/shared/.../RestPlan.kt`（答え合わせは `RestPlanTest`、期待値は
// `node mobile/tools/expect-rest-plan.mjs` で書き出す）。どちらかを変えたら両方を直す。
import { bestFieldAssignment, fieldFitness } from '../game/lineup.js';
import {
  FIELDER_REST_FATIGUE,
  FIELDER_FORCE_REST_FATIGUE,
  SUBSTITUTE_FRESH_FATIGUE,
  SUBSTITUTE_MIN_FITNESS,
} from './shared.js';

export const FIELD = ['catcher', 'first', 'second', 'short', 'third', 'left', 'center', 'right'];
/** 先発がそのまま同じ守備に就くときの上乗せ（少しの得のために守備を動かさない） */
const STAY_BONUS = 20;
/** 適性が下限に1足りないごとの減点。ほかのどの点よりも重い（下限割れは最後の手段） */
const SHORT_PENALTY = 1000;
/** 疲れの抜けていない控え（`SUBSTITUTE_FRESH_FATIGUE` 以上）を使うときの減点 */
const SPARE_PENALTY = 40;

/** 前の項目から順に比べて大きいほうが良い */
const isBetter = (a, b) => {
  const i = a.findIndex((v, j) => v !== b[j]);
  return i >= 0 && a[i] > b[i];
};

const battingOf = (p) => ((p.batting?.meet ?? 50) + (p.batting?.power ?? 50)) / 2;

/**
 * その日の守備の割り当てを決める。`staying` は守備に就いたままの先発、
 * `pool` は代わりに入れられる控え、`saved` は先発の今の守備位置（選手id → 守備位置）。
 * 返すのは `{ shortfall, value, assign }`（埋められなければ null）。
 * - shortfall: 新しく就いた守備で、適性が下限に足りない分の合計（先発がそのままの守備に
 *   就くときは数えない。人が自分で置いた守備はその人の判断）
 * - value: 適性＋打力の少し、先発がそのままなら上乗せ、控えは疲れの分だけ引く
 */
export function planField(staying, pool, saved) {
  const score = (p, pos) => {
    const fit = fieldFitness(p, pos);
    const stays = saved.get(p.id) === pos;
    const short = stays ? 0 : Math.max(0, SUBSTITUTE_MIN_FITNESS - fit);
    const fatigue = p.fatigue || 0;
    const tired = saved.has(p.id)
      ? 0
      : fatigue * 0.2 + (fatigue >= SUBSTITUTE_FRESH_FATIGUE ? SPARE_PENALTY : 0);
    return fit + battingOf(p) * 0.2 + (stays ? STAY_BONUS : 0) - tired - short * SHORT_PENALTY;
  };
  const result = bestFieldAssignment(staying, pool, FIELD, score);
  if (!result) return null;
  const byId = new Map([...staying, ...pool].map((p) => [p.id, p]));
  let shortfall = 0;
  for (const [id, pos] of result.assign) {
    if (saved.get(id) === pos) continue;
    shortfall += Math.max(0, SUBSTITUTE_MIN_FITNESS - fieldFitness(byId.get(id), pos));
  }
  return { shortfall, value: result.total, assign: result.assign };
}

/**
 * 試合の日に誰を休ませ、守備をどう組むか。
 * `starters`: 守備に就く先発（8人。`{ player, position }`）、`bench`: 控えの野手（起用できる人）。
 * 返すのは `{ resting: 選手id[], assign: Map(選手id → 守備位置) }`。休ませる人が居なければ null。
 *
 * ⚠ **守備はまとめて組み直す**。以前は休ませる人の守備位置にそのまま入れる控えだけを
 *    探していたので、
 *    - 遊撃手が疲れても、控えに遊撃を守れる人が居なければ休めない（二塁手を遊撃へ回し、
 *      控えの二塁手を入れれば休めるのに）
 *    - 疲れ切った（`FIELDER_FORCE_REST_FATIGUE`）選手の代わりに、捕手が二塁や中堅に入る
 *    ことがあった（実測: 疲労100で休ませたい場面の8%が休めず、疲労130では
 *    入れ替えた枠の8%が適性30前後）。ここでは「誰を休ませるか」の組み合わせごとに、
 *    残る先発と控えで8つの守備をいちばん良く埋める形を選ぶ（先発が守備を移ることもある）。
 * ⚠ 選ぶ順は ①疲れ切った選手を休ませる人数 ②下限に足りない分の少なさ
 *    ③休ませた選手の疲れの合計 ④守備と打力。下限を割るのは疲れ切った選手を
 *    休ませるときだけ（ふつうの疲れでは、守れる組み合わせが無ければそのまま出る）。
 * ⚠ 疲れ切った選手は、下限を割ってでも休ませる（**壊れるくらいなら穴を開ける**）。
 *    下限に届く組み合わせが無い守備位置のレギュラーは、一度も休めずにシーズンを終える
 *    （実測で二塁手が疲労193）。疲労193の打者は1年打てないので、1日の守備の穴より悪い。
 * ⚠ 疲れの抜けていない控え（`SUBSTITUTE_FRESH_FATIGUE` 以上）は、疲れ切った選手を
 *    休ませるときだけ使う。
 */
export function planRest(starters, bench) {
  const positions = new Set(starters.map((s) => s.position));
  if (starters.length !== FIELD.length || !FIELD.every((pos) => positions.has(pos))) return null;
  const fielders = bench.filter((p) => p && p.isActive !== false && p.position !== 'pitcher');
  const fresh = fielders.filter((p) => (p.fatigue || 0) < SUBSTITUTE_FRESH_FATIGUE);
  const tired = starters
    .map((s) => s.player)
    .filter((p) => (p.fatigue || 0) >= FIELDER_REST_FATIGUE)
    .sort((a, b) => (b.fatigue || 0) - (a.fatigue || 0));
  if (!tired.length) return null;
  const saved = new Map(starters.map((s) => [s.player.id, s.position]));
  const forced = (p) => (p.fatigue || 0) >= FIELDER_FORCE_REST_FATIGUE;
  let best = null;
  // 誰を休ませるかの組み合わせ（疲れた先発は多くて数人。8人全員でも255通り）
  for (let bits = 1; bits < 1 << tired.length; bits += 1) {
    const resting = tired.filter((_, i) => bits & (1 << i));
    const restingIds = new Set(resting.map((p) => p.id));
    const pool = resting.some(forced) ? fielders : fresh;
    if (pool.length < resting.length) continue;
    const staying = starters.map((s) => s.player).filter((p) => !restingIds.has(p.id));
    const plan = planField(staying, pool, saved);
    if (!plan) continue;
    const key = [
      resting.filter(forced).length,
      -plan.shortfall,
      resting.reduce((sum, p) => sum + (p.fatigue || 0), 0),
      plan.value,
    ];
    if (!best || isBetter(key, best.key)) best = { key, resting, assign: plan.assign };
  }
  // ふつうの疲れでは下限を割ってまで休ませない
  if (!best || (best.key[0] === 0 && best.key[1] < 0)) return null;
  return { resting: best.resting.map((p) => p.id), assign: best.assign };
}
