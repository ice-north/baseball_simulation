/**
 * バントの解決モデル — **采配モードと自動シミュレーションで共有する**
 *
 * ⚠ 以前は **フェア/ファウル率・バントの質・送球アウト率・スクイズの本塁送球**の
 *    4つの式が `App.jsx` と `autoSimulation.js` に**1文字違わず二重に**書かれていた。
 *    CLAUDE.md には「盗塁阻止: 采配モードは独自式（`baseThrowout - …`）で、
 *    自動シミュとは別物」と記録されていたが、**二重に誤り**だった——
 *    盗塁ではなく**バント**で、しかも独自式ではなく**同一のコピー**。
 *    `TeamMemberPanel`(328行) / `applyNextSeasonRegulations`(79行) と同じ型の重複で、
 *    片方だけ直る事故が待っている状態だったので1箇所へ畳んである。
 *
 * **呼び出し側で違うのは入力の引き方だけ**:
 * - 守備4人の守備力 … 采配モードは `defenseTeam.players.find(...)` /
 *   自動シミュは `buildDefense` の `defense.pitcher?.defense`
 * - ミート … ⚠ **采配モードだけ調子の補正**(`bCondMod.meet`)を乗せている。
 *   自動シミュは素の値。既存の挙動なので保ったまま引数で受ける
 * - `buntType` … 采配モードは塁の状況から自動判定 / 自動シミュは監督AIが決める
 *
 * ⚠ **確率を返す関数は乱数を持たない**（`rollBuntQuality` だけが引く）。
 *    ハーネスから式そのものを検査できるようにするため
 */

/** フェア/ファウル/バントフライの率。バント技術が主で、ミートが少し効く */
export function buntContactRates(buntSkill = 30, meet = 50) {
  return {
    fairRate: Math.min(85, 40 + buntSkill * 0.40 + meet * 0.10),
    popupRate: Math.max(2, 15 - buntSkill * 0.12),
  };
}

/** `roll`（0〜100）がどの結果に当たるか。閾値の並べ方を2箇所に書かないため */
export function classifyBuntContact(roll, buntSkill = 30, meet = 50) {
  const { fairRate, popupRate } = buntContactRates(buntSkill, meet);
  if (roll < popupRate) return 'popup';
  if (roll >= popupRate + fairRate) return 'foul';
  return 'fair';
}

/** 転がりの質。`dead`=絶妙（守備が間に合わない） / `hard`=強すぎる */
export const buntQualityOf = (score) => (score >= 70 ? 'dead' : score >= 40 ? 'normal' : 'hard');

export function rollBuntQuality(buntSkill = 30, meet = 50) {
  return buntQualityOf(buntSkill * 0.5 + meet * 0.2 + (Math.random() * 20 - 10));
}

/** 処理に絡む4人（投手・一塁・三塁・捕手）の守備力の平均 */
export function buntFieldDefense(pitcherDef, firstDef, thirdDef, catcherDef) {
  return ((pitcherDef || 50) + (firstDef || 50) + (thirdDef || 50) + (catcherDef || 50)) / 4;
}

/**
 * 打者を一塁で刺せる確率（%）。
 * セーフティバントは**打者が走りながら打つ**ので足が2.3倍効き、質の影響も大きい
 */
export function buntThrowOutChance(buntType, speed = 50, quality = 'normal', avgFieldDef = 50) {
  const base = buntType === 'sacrifice' ? 75 : buntType === 'squeeze' ? 85 : 60;
  const safety = buntType === 'safety';
  const speedReduction = speed * (safety ? 0.35 : 0.15);
  const qualityMod = quality === 'dead' ? (safety ? -20 : -15)
    : quality === 'hard' ? (safety ? 15 : 10) : 0;
  const fieldingMod = (avgFieldDef - 50) * 0.3;
  return Math.max(5, Math.min(95, base - speedReduction + qualityMod + fieldingMod));
}

/** スクイズで三塁走者を本塁で刺せる確率（%）。絶妙な転がしなら刺せない */
export function squeezeHomeThrowChance(quality = 'normal', avgFieldDef = 50) {
  return Math.max(5, 15 + (avgFieldDef - 50) * 0.4
    - (quality === 'dead' ? 15 : quality === 'hard' ? -5 : 0));
}
