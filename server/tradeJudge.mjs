import { TEAMS_DATA } from '../src/teams-data.js';
import { draftAbilityScore } from '../src/season/yearProgressionSystem.js';
import { deviationOf, valueGroup, DEV_SCALE } from '../src/game/playerValue.js';
import {
  bestSlot,
  needFactors,
  needOfDrop,
  NEED_LIMIT,
  DROP_SCALE,
  squadStrength,
} from '../src/online/tradeSearch.js';

// 穴の上乗せの式は画面の見込みメーターと共通（`tradeSearch.js`）
export { NEED_LIMIT, DROP_SCALE, squadStrength, needFactors };
import {
  battingMetrics,
  pitchingMetrics,
  comparisonFromPlayers,
  LABEL_RULES,
} from './performanceLabels.mjs';

// ============================================================
// CPU球団がトレードで選手に付ける値段（いしだ 2026-11-13「CPUのトレードがアホすぎる」）。
//
// 【なぜ必要か】以前はドラフトと同じ物差し（`tradeValueOf` ＝ 能力の偏差値）だけで
// 値段を決めていた。スカウトの見立てなので**いまの力とも成績とも噛み合っておらず**、
// 12球団288人で総当たりすると「持ち場での力が3以上下の選手の値段が、強い選手の
// 1.05倍以上（＝CPUが受ける額）」になる組が **13.7%** あった。つまり
// *弱い選手で強い選手が取れた*。
//
// 【何で判断するか】いしだ案「総合点と余剰・不足・成績などから判断する」。
//   ① 能力の物差し（ドラフトと同じ偏差値）… 素質。若い選手はここで高い
//   ② いまの持ち場での力（`slotStrength`。画面の「その持ち場での力」と同じ式）
//   ③ 今季の成績（規定に届いていれば ±FORM_LIMIT）
//   ④ その球団の事情（出すと穴が空く選手は高く、控えが厚い持ち場は安く）
// ①と②を半々で混ぜ、③④を倍率で掛ける。
//
// ⚠ **値段の式をもう1つ作らない**（`src/game/playerValue.js` の決まり）。①は
//    `deviationOf` をそのまま使い、ここでは**混ぜ方と倍率**だけを持つ。
// ⚠ **乱数を使わないこと**。同じ提案に同じ答えを返す（`trades.js` の決まり）。
// ⚠ **画面に出す値段と、CPUが判断に使う値段を同じにすること**。画面の見込み
//    メーター（`tradeOdds`）はサーバーが渡した値段で境目を引くので、ここだけ
//    変えると「受けるはず」と出たのに断られる。`projection.mjs` の `tradeValue`
//    はこの関数で作る。
// ⚠ ④は**その球団が出す選手にだけ**掛ける。もらう選手（提案した側の選手）にも
//    「足りない持ち場なら高く見る」を掛けると、足りない持ち場へ**弱い選手を
//    押し込むだけで上乗せを満たせてしまう**（CPUが受ける境目は1.05倍しかない）。
// ============================================================

/** いまの力をどれだけ混ぜるか（0＝素質だけ・1＝いまの力だけ） */
export const NOW_WEIGHT = 0.5;
/** 今季の成績で動く幅（±8%） */
export const FORM_LIMIT = 0.08;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 能力の物差し（ドラフトと同じ偏差値。平均50） */
function abilityDeviation(player) {
  const { main, sub } = draftAbilityScore(player);
  return deviationOf(player, main, sub);
}

/**
 * 今季の成績の倍率。規定に届いていなければ 1（成績では判断しない）。
 * 打者は OPS 相当（出塁＋打率＋長打率の素）、投手は防御率をリーグ平均と比べる。
 * ⚠ **リーグ平均と比べること**。絶対値で線を引くと、打高・投高の年に全員が
 *    同じ向きへ動く。
 */
export function formFactor(player, baseline) {
  if (!player) return 1;
  if (player.position === 'pitcher') {
    const m = pitchingMetrics(player.seasonStats?.pitching);
    const lg = baseline?.pitching;
    if (!m || !lg || m.era === null || lg.era === null || lg.era <= 0) return 1;
    if (m.outs < LABEL_RULES.pitchingOuts) return 1;
    // 防御率は低いほど良い。リーグ平均の6割ぶん良ければ満額
    return 1 + FORM_LIMIT * clamp((lg.era - m.era) / (lg.era * 0.6), -1, 1);
  }
  const m = battingMetrics(player.seasonStats?.batting);
  const lg = baseline?.batting;
  if (!m || !lg) return 1;
  if (m.pa < LABEL_RULES.battingPA || (lg.pa || 0) < LABEL_RULES.battingPA)
    return 1;
  const ops = (p) => (p.obp || 0) + (p.avg || 0) + (p.iso || 0);
  const lgOps = ops(lg);
  if (lgOps <= 0) return 1;
  // リーグ平均の25%ぶん良ければ満額
  return 1 + FORM_LIMIT * clamp((ops(m) / lgOps - 1) / 0.25, -1, 1);
}

/**
 * その球団がこの選手**1人だけ**を手放すときの倍率（1 〜 1+`NEED_LIMIT`）。
 * 抜けたときに持ち場の力の合計がどれだけ落ちるかで決める。
 * これが「外野が足りないので外野は出し渋る／投手が余っているので投手は出す」になる。
 * ⚠ 何人かまとめて出すときは `needFactors`（まとめて抜けた穴で測る）。
 */
export function needFactor(players, player) {
  if (!player) return 1;
  return needFactors(players, [player]).get(player.id) ?? 1;
}

/**
 * リーグ全体から「いまの力」の物差し（群ごとの平均と幅）を作る。
 * ⚠ **リーグから測ること**。定数で持つと、能力の生成や成長を変えたときに
 *    置き去りになる（`playerValue.js` の測り直しの注意と同じ）。
 */
function strengthDistribution(players) {
  const byGroup = {};
  for (const p of players) {
    const best = bestSlot(p);
    if (!best) continue;
    (byGroup[valueGroup(p)] ||= []).push(best.strength);
  }
  const dist = {};
  for (const [g, xs] of Object.entries(byGroup)) {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd =
      Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1;
    dist[g] = { mean, sd };
  }
  return dist;
}

/**
 * リーグの名簿から、CPUの値段を出す道具を作る。
 *
 * @param teams `{ [球団名]: 選手[] }`
 * @returns `{ valueOf(player, teamName), setValuesOf(players, teamName), needOf(teamName, player), baseline }`
 *   - `valueOf(player, 球団名)` … その球団が**手放すとき**の値段（事情こみ）
 *   - `valueOf(player)` … 球団名なしは事情を抜いた値段（CPUが**受け取る**選手は
 *     こちら。足りない持ち場へ弱い選手を押し込めないように）
 */
export function createTradeJudge(teams) {
  const all = Object.values(teams || {}).flat();
  const dist = strengthDistribution(all);
  const baseline = comparisonFromPlayers(all);
  // ⚠ 球団の事情は**聞かれた球団だけ**で作る（1人抜くたびに名簿を数え直すので、
  //    12球団ぶんを先に作ると画面の読み込みが重くなる）。同じ球団は使い回す
  const needCache = new Map();
  // ⚠ 1人ずつの倍率は**球団ごとに一度にまとめて**出す（満員の力は1回だけ測る。
  //    以前は1人ごとに満員と1人抜きの2回ずつ測っていた）
  const needOf = (teamName, player) => {
    if (!teamName || !teams[teamName]) return 1;
    let byPlayer = needCache.get(teamName);
    if (!byPlayer) {
      const roster = teams[teamName];
      const full = squadStrength(roster);
      byPlayer = new Map(
        roster.map((p) => [
          p.id,
          needOfDrop(full - squadStrength(roster.filter((q) => q.id !== p.id))),
        ]),
      );
      needCache.set(teamName, byPlayer);
    }
    return byPlayer.get(player.id) ?? 1;
  };
  const nowDeviation = (player) => {
    const best = bestSlot(player);
    const d = dist[valueGroup(player)];
    // 力を測れない（守れる持ち場が無い）選手は素質だけで見る
    if (!best || !d) return null;
    return 50 + (10 * (best.strength - d.mean)) / d.sd;
  };
  const valueOf = (player, teamName = null) => {
    if (!player) return 0;
    const ability = abilityDeviation(player);
    const now = nowDeviation(player);
    const dev =
      now === null ? ability : ability * (1 - NOW_WEIGHT) + now * NOW_WEIGHT;
    const base = dev * DEV_SCALE * formFactor(player, baseline);
    // ⚠ 1 を下回らせない（`cpuTradeDecision` の予算の計算が壊れる）
    return Math.max(1, base * needOf(teamName, player));
  };
  /**
   * その球団が `players` を**まとめて**出すときの値段（並びは `players` と同じ）。
   * 1人なら `valueOf(player, teamName)` と同じ。画面の見込みメーターは同じ式
   * （`tradeSearch.js` の `setTradeValues`）を `tradeBase` で引く。
   */
  const setValuesOf = (players, teamName) => {
    if (!teamName || !teams[teamName])
      return players.map((p) => valueOf(p));
    const factors = needFactors(teams[teamName], players);
    return players.map((p) => Math.max(1, valueOf(p) * (factors.get(p.id) ?? 1)));
  };
  return { valueOf, setValuesOf, needOf, baseline };
}

/**
 * いまの世界（`TEAMS_DATA`）から道具を作る。
 * ⚠ サーバーの命令の最中は `league.game` が古いことがあるので、**生きた名簿**から作る
 *    （`loadLeagueWorld` のあと `TEAMS_DATA` が正本）。
 */
export function tradeJudgeForLeague(league) {
  const names = league.season?.settings?.teamNames || [];
  return createTradeJudge(
    Object.fromEntries(
      names.filter((n) => TEAMS_DATA[n]).map((n) => [n, TEAMS_DATA[n].players]),
    ),
  );
}
