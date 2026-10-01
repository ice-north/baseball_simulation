// ============================================================
// スイングの強さ（フルスイング / 当てにいく） - swingType.js
//
// 【従来なにが有ったか】
// 「当てるだけ / フルスイング」に相当する判定は**チーム方針のレベルにしか
// 無かった**。自動シミュは offenseStrategy.batting（patient/balanced/aggressive）で
// ミート+3/-5・パワー-5/+8 を打席の頭から終わりまで一律に掛けるだけ、
// 采配モードの「打撃方針」に至ってはスイング確率を 0.55/1.0/1.3 倍するだけで、
// **振り方そのものは1球も変わっていなかった**。
//
// 実際の打者は1球ごとに決める:
//   - 得意なコースに来た      → フルスイングで振り抜く
//   - 苦手なコースに来た      → 当てにいく（凡打でも打球を飛ばす）
//   - 追い込まれた（2ストライク）→ 当てにいく（三振を避ける）
//   - 打者有利のカウント        → 甘い球を待って振り抜く
//
// 【トレードオフであること】
// フルスイングは無料の強化ではない。パワーが上がるかわりにミートが落ちる
// （＝空振り・ファウル・打ち損じが増える）。当てにいくのはその逆。
// **どちらが得かは場面で変わる**——これが無いと単なる能力ボーナスになる。
//
// 【リーグ平均は動かさない】
// 段階1〜8の較正と同じ方針。生の合計スコアには「2ストライクが多い」ぶんの
// 偏りがあるので、実測した平均(`MEAN`)を引いて母集団の平均を0に寄せる。
// そうしないと全打者が一律に当てにいく＝長打が減るだけの変更になる。
// ただし**打者は自分に有利な時だけ振り抜く**ので、適応的なぶん打撃側に
// わずかな利得が残る（これは意図した効果）。
// ============================================================

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 得意コースならフルスイング。weakness は -1(得意) 〜 +1(苦手)
const ZONE_W = 0.85;

// カウント。追い込まれたら当てにいき、打者有利なら振り抜く
const COUNT_TWO_STRIKES = -0.60;
const COUNT_AHEAD_BIG = 0.40;   // 3-0 / 2-0 のように大きく打者有利
const COUNT_AHEAD = 0.20;       // 1-0 / 3-1
const COUNT_BEHIND = -0.15;     // 0-1 のように投手有利（2ストライクは上で処理）

// 打者のタイプ。長距離砲は振り抜き、技巧派は当てにいく。
// **中心をずらす**のは batterZone.js の TENDENCY_MID と同じ理由で、
// 生成される野手は power - meet の平均が約 -11 だから。
// 素の差を使うとリーグ全員が「当てにいく」側に寄ってしまう。
const TYPE_MID = -11;
const TYPE_W = 1.2;

// **前の球で崩されたら当てにいく**。
// どんなにパワーのある打者でも、タイミングを外された次の球でフルスイングはしない。
// 物理エンジンの `powerTransferRate`（崩されたスイングにはパワーが乗らない）は
// あくまで**結果**の話で、打者が次の球で構え直すという**判断**が無かった。
// 2ストライク(-0.60)に次ぐ重みを持たせてある。
const FOOLED_W = 0.50;

// 打撃方針（自動=offenseStrategy.batting / 采配=battingApproach）
const APPROACH = {
  aggressive: 0.35,
  patient: -0.30,
  take: -0.30,
  balanced: 0,
  normal: 0,
};

// 母集団の平均。**スイングした球だけ**で実測すると生スコアの平均は -0.217
// （2ストライクと「崩された」が多いので当てにいく側へ寄る）。
// ここを引いてリーグ平均を0に置く。
//
// ⚠ この値は**不動点として求めること**。MEAN を下げると振り抜く球が増え、
// 空振りが増え、2ストライクのカウントが増えて生スコアの平均がまた下がる。
// -0.075 → -0.095 → -0.108 → -0.125（FOOLED_W 追加後 -0.19 → -0.215）と
// 反復して収束させた。カウント分布や捕手の弱点狙いを変えたら測り直す。
const MEAN = -0.215;

/**
 * この1球をどう振るかを決める。
 * @returns {number} -1（完全に当てにいく）〜 +1（フルスイング）
 */
export function decideSwingPower({
  weakness = 0, balls = 0, strikes = 0, fooled = 0,
  meet = 50, power = 50, approach = 'balanced',
} = {}) {
  let s = -weakness * ZONE_W;

  if (strikes >= 2) s += COUNT_TWO_STRIKES;
  else if (balls - strikes >= 2) s += COUNT_AHEAD_BIG;
  else if (balls > strikes) s += COUNT_AHEAD;
  else if (strikes > balls) s += COUNT_BEHIND;

  s -= fooled * FOOLED_W;
  s += ((power - meet) - TYPE_MID) / 100 * TYPE_W;
  s += APPROACH[approach] || 0;

  return clamp(s - MEAN, -1, 1);
}

// フルスイングでどれだけパワーが乗り、ミートが落ちるか。
// 既存の打撃方針（aggressive: ミート-5 / パワー+8）と同じ桁に合わせてある。
// 実際に出る |swingPower| は平均0.4前後なので、効き幅は概ね ±3〜4。
const SWING_MEET = 8;
const SWING_POWER = 10;

/**
 * スイングの強さ → 実効ミート・パワーの補正。
 * combineBatterEffects でコース適性・位置の質と合算して使う。
 */
export function getSwingPowerEffect(swingPower) {
  if (!swingPower) return { meet: 0, power: 0 };
  return {
    meet: -swingPower * SWING_MEET,
    power: swingPower * SWING_POWER,
  };
}

/** 表示用のラベル。中間帯は「通常」なので null を返す */
export function swingPowerLabel(swingPower) {
  if (swingPower >= 0.35) return 'フルスイング';
  if (swingPower <= -0.35) return '当てにいく';
  return null;
}
