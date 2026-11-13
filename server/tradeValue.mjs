import { draftAbilityScore } from '../src/season/yearProgressionSystem.js';
import { deviationValue } from '../src/game/playerValue.js';

/**
 * 選手の値段。**ドラフトと同じ物差し**（`deviationValue`）をそのまま使う。
 *
 * ⚠ **ここで別の式を書かないこと**。かつてトレードとドラフトが別々の評価式を
 *    持っていて、等価交換にならなかった（`src/game/playerValue.js` の冒頭）。
 * ⚠ CPU球団の判断（`leagueEngine.mjs`）と、画面に出す値段の目安（`projection.mjs` の
 *    球団の名簿）が同じ関数を使うため、ここに分けた（projection から leagueEngine を
 *    読むと循環する）。
 */
export function tradeValueOf(player) {
  if (!player) return 0;
  const { main, sub } = draftAbilityScore(player);
  return deviationValue(player, main, sub);
}
