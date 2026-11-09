// 既存の契約更改とオンラインで共用するCPU戦力外判定。
const AI_MIN_ROSTER = 17;   // この人数を下回らない範囲で解雇
const AI_MIN_RELEASES = 3;  // 各AIチームの最低解雇人数（ロスター余裕がある限り適用）

/** 年齢の点（26歳以降、加齢で急増）。⚠ 式はここだけ */
const agePointsOf = (age) =>
  age >= 38 ? 60 : age >= 36 ? 45 : age >= 34 ? 30 : age >= 32 ? 20
    : age >= 30 ? 15 : age >= 28 ? 10 : age >= 26 ? 5 : 0;

/**
 * 退団の候補としての点数と、その理由（画面に出す）。
 * ⚠ 点数の式はここだけ。画面の「標準案の理由」と実際の選び方を食い違わせない
 */
export const releaseScore = (p) => {
  let score = 0; // 高いほど解雇候補
  const reasons = [];
  const age = p.age || 20;
  const isPitcher = p.position === 'pitcher';

  // 年齢（26歳以降ペナルティ、加齢で急増）
  const agePoints = agePointsOf(age);
  score += agePoints;
  if (agePoints >= 15) reasons.push(`${age}歳`);

  // 能力値が低い
  let low = 0;
  if (isPitcher) {
    const overall = ((p.pitching?.velocity || 130) - 115) * 2.5 + (p.pitching?.control || 50) + ((p.pitching?.stamina || 100) / 2);
    if (overall / 3 < 35) low = 25;
    else if (overall / 3 < 45) low = 15;
  } else {
    const overall = ((p.batting?.meet||0) + (p.batting?.power||0) + (p.physical?.speed||0) + (p.physical?.arm||0) + (p.fielding?.defense||0)) / 5;
    if (overall < 35) low = 25;
    else if (overall < 45) low = 15;
  }
  score += low;
  if (low >= 25) reasons.push('能力が低い');
  else if (low > 0) reasons.push('能力がやや低い');

  return { score, reasons };
};

/**
 * AI自動解雇ロジック
 * - 年齢が高い選手(26歳以降ペナルティ増加)
 * - 能力値が低い選手
 * を優先的に解雇。最低でも AI_MIN_RELEASES 人は解雇する（ロスター下限の範囲内で）。
 *
 * スコアベースの候補（score >= 20）が AI_MIN_RELEASES より多い場合はそちらを優先。
 * 少ない場合でも上位 AI_MIN_RELEASES 人は強制解雇する。
 * これによりAIチームが選手を保持し続けてユーザーがトライアウトを独占するのを防ぐ。
 *
 * @param {object|null} bias 球団の偏り（オンラインの指導者 `releaseBias`）。
 *   `youth`（-2〜2）: 監督が若手好きなほど年齢の点を重く（ベテランを早めに出す）、
 *   ベテラン好きなほど軽くする。無ければ従来どおり。
 */
export const getAIReleaseCandidates = (players, bias = null) => {
  if (!players || players.length <= AI_MIN_ROSTER) return [];

  const youth = Number(bias?.youth) || 0;
  const scored = players.map(p => ({
    player: p,
    score: releaseScore(p).score + (youth ? youth * 0.2 * agePointsOf(p.age || 20) : 0),
  }));

  // スコア降順でソート（解雇したい選手が先頭にくる）
  scored.sort((a, b) => b.score - a.score);

  // ロスター下限を守れる解雇可能数
  const maxRelease = Math.max(0, players.length - AI_MIN_ROSTER);
  // スコアベースの候補数と最低解雇数の大きい方を採用
  const scoreBasedCount = scored.filter(s => s.score >= 20).length;
  const desiredCount = Math.max(AI_MIN_RELEASES, scoreBasedCount);
  const releaseCount = Math.min(desiredCount, maxRelease);

  return scored.slice(0, releaseCount).map(s => s.player.id);
};
