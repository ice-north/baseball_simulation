// 既存の契約更改とオンラインで共用するCPU戦力外判定。
const AI_MIN_ROSTER = 17;   // この人数を下回らない範囲で解雇
const AI_MIN_RELEASES = 3;  // 各AIチームの最低解雇人数（ロスター余裕がある限り適用）

/**
 * AI自動解雇ロジック
 * - 年齢が高い選手(26歳以降ペナルティ増加)
 * - 能力値が低い選手
 * を優先的に解雇。最低でも AI_MIN_RELEASES 人は解雇する（ロスター下限の範囲内で）。
 *
 * スコアベースの候補（score >= 20）が AI_MIN_RELEASES より多い場合はそちらを優先。
 * 少ない場合でも上位 AI_MIN_RELEASES 人は強制解雇する。
 * これによりAIチームが選手を保持し続けてユーザーがトライアウトを独占するのを防ぐ。
 */
export const getAIReleaseCandidates = (players) => {
  if (!players || players.length <= AI_MIN_ROSTER) return [];

  const scored = players.map(p => {
    let score = 0; // 高いほど解雇候補
    const age = p.age || 20;
    const isPitcher = p.position === 'pitcher';

    // 年齢（26歳以降ペナルティ、加齢で急増）
    if (age >= 38) score += 60;
    else if (age >= 36) score += 45;
    else if (age >= 34) score += 30;
    else if (age >= 32) score += 20;
    else if (age >= 30) score += 15;
    else if (age >= 28) score += 10;
    else if (age >= 26) score += 5;

    // 能力値が低い
    if (isPitcher) {
      const overall = ((p.pitching?.velocity || 130) - 115) * 2.5 + (p.pitching?.control || 50) + ((p.pitching?.stamina || 100) / 2);
      if (overall / 3 < 35) score += 25;
      else if (overall / 3 < 45) score += 15;
    } else {
      const overall = ((p.batting?.meet||0) + (p.batting?.power||0) + (p.physical?.speed||0) + (p.physical?.arm||0) + (p.fielding?.defense||0)) / 5;
      if (overall < 35) score += 25;
      else if (overall < 45) score += 15;
    }

    return { player: p, score };
  });

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

