import { draftAbilityScore } from '../src/season/yearProgressionSystem.js';
import { deviationValue } from '../src/game/playerValue.js';

/**
 * 選手の**素質だけの**値段。**ドラフトと同じ物差し**（`deviationValue`）をそのまま使う。
 *
 * ⚠ **いまのCPU球団の判断と画面の値段は `server/tradeJudge.mjs` の `valueOf`**（いまの力・成績・
 *    球団の事情を足したもの）。ここは検査（`online-trade-check`）が素質の物差しを比べるのに使うだけ。
 *
 * ⚠ **ここで別の式を書かないこと**。かつてトレードとドラフトが別々の評価式を
 *    持っていて、等価交換にならなかった（`src/game/playerValue.js` の冒頭）。
 * ⚠ 以前はCPU球団の判断と画面の値段の両方がこれを使っていた（いまは `tradeJudge.mjs`）。
 */
export function tradeValueOf(player) {
  if (!player) return 0;
  const { main, sub } = draftAbilityScore(player);
  return deviationValue(player, main, sub);
}
