// ============================================================
// 場面ごとの投球目的 - pitchSituation.js
//
// 段階1〜5で「どこに何を投げるか」「それがどう打たれるか」は繋がったが、
// **捕手はいつでも同じ目的で配球していた**。実際は場面で欲しい結果が変わる。
//
//   一塁に走者・2アウト未満 → 併殺が取れる     → ゴロを打たせたい（低め＋ゴロ系）
//   三塁に走者・2アウト未満 → 犠飛でも失点する → 三振が欲しい（高め＋空振り系）
//   満塁・0アウト           → 三振が欲しいが**押し出しは論外** → 誘い球を増やせない
//
// 【重要】三塁に走者がいても、一塁が埋まっていて1アウトなら
// 併殺でチェンジになるのでゴロ狙いに戻る。満塁1アウトも同じ。
// 「三塁走者＝常に三振狙い」にすると、この当たり前の判断が抜ける。
//
// 【リードで割り引かない】「一塁に走者だから低めへ」は配球の巧拙ではなく
// 野球の基本なので、リード0の捕手でも行う。リードが効くのは
// 「同じ低めの中でどのセルか（弱点・対角）」の部分（pitchZone.js）。
// ============================================================

export const OBJECTIVE_LABEL = {
  normal: '通常',
  groundball: '併殺狙い',
  strikeout: '三振狙い',
};

/** 目的の説明（采配モードの表示用） */
export const OBJECTIVE_NOTE = {
  normal: '状況を選ばない配球',
  groundball: '低めにゴロを打たせて併殺を取りにいく',
  strikeout: '外野フライも内野ゴロも失点になるため三振が欲しい',
};

const NORMAL = Object.freeze({ goal: 'normal', avoidWalk: false });

/**
 * 走者とアウトカウントから、この打席で捕手が求める結果を決める。
 * @param {Array} bases  [一塁, 二塁, 三塁]（走者オブジェクト or false）
 * @param {number} outs
 * @returns {{goal:'normal'|'groundball'|'strikeout', avoidWalk:boolean}}
 */
export function decidePitchObjective(bases = [], outs = 0) {
  // 2アウトなら併殺も犠飛も関係ない。普通に打ち取ればいい
  if (outs >= 2) return NORMAL;

  const first = !!bases[0], second = !!bases[1], third = !!bases[2];
  const loaded = first && second && third;

  if (third) {
    // 一塁が埋まっていて1アウトなら、併殺1つでチェンジ → ゴロ狙いに戻る
    if (first && outs === 1) return { goal: 'groundball', avoidWalk: loaded };
    // それ以外は犠飛・ゴロGOで失点する。三振が欲しい
    // 満塁なら押し出しがあるので誘い球は増やせない
    return { goal: 'strikeout', avoidWalk: loaded };
  }
  if (first) return { goal: 'groundball', avoidWalk: false };
  return NORMAL;
}

/**
 * 狙い（zone/edge/chase）の配分に対する場面補正。
 *
 * 三振狙いは誘い球を増やす＝四球のコストを払う。これは**払う価値がある場面
 * だけ**で行うから成立する（走者三塁で1点を防ぐ価値 > 四球1つ）。
 * 押し出しになる満塁では逆にゾーンへ寄せる。
 */
export function objectiveAimShift({ goal, avoidWalk }) {
  if (goal === 'strikeout') {
    if (avoidWalk) return { zone: 0.10, edge: -0.04, chase: -0.06 };
    return { zone: -0.06, edge: -0.02, chase: 0.08 };
  }
  if (goal === 'groundball') {
    // 打たせて取りたいので勝負する。誘い球は減らす
    return { zone: 0.08, edge: -0.03, chase: -0.05 };
  }
  return null;
}

// セル選択で高低をどれだけ意識するか。
// 大きくすると「併殺狙いは必ず低め」になり配球が読まれる側に倒れる。
const OBJECTIVE_ROW_W = 0.85;

/**
 * 目的による「高さ」の要求。
 *
 * ゴロが欲しければ低め（段階5で 低め→ゴロ が繋がっている）。
 * 三振が欲しい場合は**球種で逆になる**——速球なら高め、変化球なら低め。
 * 空振りを取れる組み合わせがそうだから（`getHeightPitchEffect`）。
 * ここを球種と噛み合わせないと、三振狙いで高めに構えても変化球が来て
 * ただの「抜け球」になり、実測で空振り率がむしろ下がった（9.3%→8.4%）。
 *
 * @param {number} rowAxisValue -1=高め / +1=低め
 * @param {boolean} isBreaking 変化球か
 */
export function objectiveRowScore(goal, rowAxisValue, isBreaking = false) {
  if (goal === 'groundball') return rowAxisValue * OBJECTIVE_ROW_W;
  if (goal === 'strikeout') {
    return (isBreaking ? rowAxisValue : -rowAxisValue) * OBJECTIVE_ROW_W;
  }
  return 0;
}

/** 球種スコアの重み付け。ゴロ狙いはゴロ系、三振狙いは空振り系を選ぶ */
export const objectiveBallWeight = (goal) =>
  goal === 'groundball' ? { groundball: 0.9, whiff: 0 }
    : goal === 'strikeout' ? { groundball: 0, whiff: 0.9 }
      : { groundball: 0, whiff: 0 };
