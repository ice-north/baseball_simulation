import { rosterGroup } from '../utils/constants.js';
import {
  TRADE_SLOTS,
  rosterTops,
  squadStrength,
  needOfDrop,
  playerDrops,
  NEED_LIMIT,
} from './tradeSearch.js';
import { PLAYER_GROUPS } from './playerColumns.js';

// ============================================================
// 相手球団の考えていること（「外野が弱い」「投手が余っている」）。
//
// ⚠ いしだ 2026-11-13「外野が欲しいのに内野を提案されたり。相手の考えていることを
//    表示するのはどうでしょう？例えば、外野が足りない、投手が余ってるなど、そして
//    総合点と余剰、不足、成績などから判断する」。CPUの判断を直したのが先
//    （`server/tradeJudge.mjs`）で、ここはそれを**見せる**ところ。
//
// 【CPUの判断と同じ測り方にすること】出す「弱い・余っている」は言葉の飾りではなく、
// CPUが実際に使っている2つの仕掛けそのもの。
//   ① 戦力の開き … CPUは「提案した側の伸び − 自分の伸び」が決まり（`gapLimit`）を
//      超える交換を断る（`tradeStrengthGap`）。弱い持ち場を埋める選手をもらうと
//      自分の伸びが大きくなるので、同じ値段でも通りやすくなる。
//      → 弱い持ち場は**持ち場ごとの一番手の力**（`rosterTops`）をリーグで順位づけて出す。
//   ② 出し渋り … 1人抜けたときに球団の持ち場の力の合計（`squadStrength`）が
//      どれだけ落ちるか。落差が大きいほど値段に上乗せが乗る（最大 +`NEED_LIMIT`。
//      サーバーの `needOf` と同じ式 `needOfDrop`）。落差が無い選手＝余り。
//
// ⚠ **「欲しい」を値段の話にしないこと**。CPUは**もらう**選手には事情の上乗せを
//    掛けない（`tradeJudge.mjs` の注。掛けると足りない持ち場へ弱い選手を押し込める）。
//    弱い持ち場が効くのは①の方だけなので、画面の文もそう書く。
// ⚠ **人数を目標（`ONLINE_ROSTER_TARGETS`）と比べて「足りない」と言わないこと**。
//    初期セットの名簿は外野が4〜6人で目標7人なので、12球団すべてが
//    「外野が足りない」になり、球団ごとの事情が消える（実測 48/48）。
//    リーグの中の順位で見れば球団ごとに違う（＝CPUの判断と同じ見方）。
// ⚠ 落差（`playerDrops`。サーバーの `needOf` と同じ関数）は名簿の人数ぶん `squadStrength` を呼ぶ（25人なら26回）。
//    **相手1球団だけ**に使うこと（12球団ぶんを毎回数えると画面が重い）。
// ============================================================

/**
 * 抜けても穴が空かない（＝出しやすい）選手。
 * ⚠ **CPUの上乗せが等倍になる条件そのものにすること**（`needOf` が1）。
 *    「落差が `DROP_SCALE` の1割まで」のような独自の線を引くと、画面が
 *    「出しやすい3人」と言っているのにCPUは上乗せを乗せている、という食い違いが出る
 *    （実測で1人ずれた。`online-trade-check` の③''が落ちる）
 */
export const isSpareDrop = (drop) => needOfDrop(drop) === 1;
/** 弱い持ち場とみなす順位（読めた球団の下から3分の1） */
export const WEAK_RANK = 2 / 3;
/** 出す「弱い持ち場」の数 */
export const WEAK_SHOWN = 3;

/**
 * 相手球団の事情。
 * @param roster 相手の名簿
 * @param others ほかの球団の名簿 `{球団名: roster}`（読めた球団だけでよい。自球団も入れる）
 * @returns `{ slots, weak, spares, strength, strengthRank, teams }`
 *   - `slots` … 持ち場ごとに `{ slot, holder, score, rank, teams, weak }`（弱い順）
 *   - `weak` … 弱い持ち場（上から `WEAK_SHOWN` 個まで）
 *   - `spares` … 括りごとの余り `{ id, label, spare, count, hurt, factor }`（余りの多い順）
 *   - `strength` / `strengthRank` / `teams` … 球団の力の合計（`squadStrength`）とその順位
 */
export function teamThoughts(roster, others = {}) {
  const all = roster || [];
  if (!all.length) return null;
  const tops = rosterTops(all);
  const rivals = Object.values(others).map((r) => ({
    tops: rosterTops(r || []),
    strength: squadStrength(r || []),
  }));
  const teams = rivals.length + 1;
  const slots = TRADE_SLOTS.map((slot) => {
    const score = tops[slot.key]?.score ?? 0;
    const rank =
      1 + rivals.filter((t) => (t.tops[slot.key]?.score ?? 0) > score).length;
    return {
      slot,
      holder: tops[slot.key]?.holder || null,
      score,
      rank,
      teams,
      weak: rank > teams * WEAK_RANK,
    };
  }).sort((a, b) => b.rank - a.rank || a.score - b.score);
  // 余り: 抜けても持ち場の力の合計がほとんど落ちない選手
  const { full, drops: dropOf } = playerDrops(all);
  const spares = PLAYER_GROUPS.map(({ id, label }) => {
    const players = all.filter((p) => rosterGroup(p.position) === id);
    const drops = players.map((p) => dropOf.get(p.id) || 0).sort((a, b) => b - a);
    return {
      id,
      label,
      count: players.length,
      spare: drops.filter(isSpareDrop).length,
      hurt: drops[0] || 0,
      factor: needOfDrop(drops[0] || 0),
    };
  }).sort((a, b) => b.spare - a.spare);
  return {
    slots,
    weak: slots.filter((s) => s.weak).slice(0, WEAK_SHOWN),
    spares,
    strength: full,
    strengthRank: 1 + rivals.filter((t) => t.strength > full).length,
    teams,
  };
}

/**
 * 相手の考えていること（1〜2文）。⚠ 「弱い持ち場の選手を高く買う」と書かないこと
 * （CPUはもらう選手に事情の上乗せを掛けない。効くのは戦力の開きの方）。
 */
export function thoughtsText(thoughts, name) {
  if (!thoughts) return '';
  const { weak, spares, strengthRank, teams } = thoughts;
  const head = `${name}の戦力は${teams}球団中${strengthRank}位。`;
  const want = weak.length
    ? `${weak.map((w) => w.slot.label).join('・')}が弱く（${weak[0].slot.label}は${weak[0].rank}位）、ここを埋める選手をもらうと戦力が上がるので、同じ値段でも交換が通りやすい。`
    : 'リーグの下位3分の1に入る持ち場は無い（もらう選手が今の一番手より強ければ、どの持ち場でも戦力は上がる）。';
  const rich = spares[0]?.spare
    ? `${spares[0].label}は${spares[0].spare}人が「1人だけなら抜けても穴が空かない」ので出しやすい（何人かまとめて求めると、まとめて空く穴の分の上乗せが乗ることがある）。`
    : '抜けても穴が空かない選手は居ないので、どの選手も出し渋る。';
  return `${head}${want}${rich}`;
}

/** 上乗せを％で（「+12%」）。`NEED_LIMIT` が上限 */
export const factorText = (factor) =>
  `+${Math.round(((factor ?? 1) - 1) * 100)}%`;
export const FACTOR_MAX_TEXT = `+${Math.round(NEED_LIMIT * 100)}%`;
