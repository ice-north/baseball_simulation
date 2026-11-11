// 対人の実試合集計と閲覧で共用する。数値キーだけを合算し、入れ子や欠損は足さない。
export const PA_KEYS = [
  'outs',
  'pa',
  'atBats',
  'hits',
  'doubles',
  'triples',
  'homeruns',
  'walks',
  'intentionalWalks',
  'hitByPitch',
  'strikeouts',
  'sacrificeBunts',
  'sacrificeFlies',
  'fouls',
  'twoStrikeFouls',
  'buntAttempts',
  'buntSuccess',
  'safetyAttempts',
  'squeezeAttempts',
  'dpChances',
  'doublePlays',
];
export const BATTING_KEYS = [
  'games',
  'atBats',
  'hits',
  'doubles',
  'triples',
  'homeruns',
  'rbis',
  'walks',
  'hitByPitch',
  'strikeouts',
  'sacrificeBunts',
  'sacrificeFlies',
  'plateAppearances',
  'stolenBases',
  'caughtStealing',
  'errors',
  'fieldingChances',
  'assists',
];
export const PITCHING_KEYS = [
  'games',
  'wins',
  'losses',
  'saves',
  'holds',
  'inningsPitched',
  'hits',
  'homeruns',
  'runsAllowed',
  'earnedRuns',
  'walks',
  'hitBatters',
  'strikeouts',
  'pitches',
  'wildPitches',
  'gamesStarted',
  'qualityStarts',
  'highQualityStarts',
  'battersFaced',
];
export const zeroLine = (keys = PA_KEYS) =>
  Object.fromEntries(keys.map((key) => [key, 0]));
export function addCounts(target, source, keys = PA_KEYS) {
  for (const key of keys)
    if (Number.isFinite(source?.[key]) && source[key] >= 0)
      target[key] = (target[key] || 0) + source[key];
  return target;
}
export function rates(line) {
  if (!line || !(line.pa > 0)) return null;
  const ab = line.atBats;
  const totalBases =
    line.hits + line.doubles + 2 * line.triples + 3 * line.homeruns;
  const denominator = ab + line.walks + line.hitByPitch + line.sacrificeFlies;
  const avg = ab > 0 ? line.hits / ab : null;
  const slg = ab > 0 ? totalBases / ab : null;
  const obp =
    denominator > 0
      ? (line.hits + line.walks + line.hitByPitch) / denominator
      : null;
  return {
    pa: line.pa,
    avg,
    slg,
    obp,
    ops: obp !== null && slg !== null ? obp + slg : null,
    kRate: line.strikeouts / line.pa,
  };
}
export const SPLIT_NAMES = {
  batting: {
    all: '全打席',
    risp: '得点圏',
    emptyRisp: '非得点圏',
    left: '対左投手',
    right: '対右投手',
    pinch: '代打',
    normal: '通常打席',
    firstPitch: '初球打ち',
    twoStrikes: '2ストライク後',
  },
  pitching: {
    all: '全対戦',
    risp: '得点圏',
    emptyRisp: '非得点圏',
    early: '先発1〜2回',
    middle: '先発3〜5回',
    late: '先発6回以降',
  },
};

// ============================================================
// 捕手の成績（マスクをかぶった時の投手成績）。
//
// いしだ「リード力やバッテリー相性を、捕手ごとの防御率などで見せたい」。
// ⚠ このゲームに投手×捕手の「相性」の仕組みは無い（いしだ: 仕組みは足さない、
//    結果として見られる形がほしい）。組み合わせ別の差は回数が少ないうちは
//    ほぼ運なので、画面は回数を必ず並べ、少ない組を薄く出す（`BATTERY_MIN_OUTS`）。
// - 捕手の記録 `record.catching = { all, pitchers: { [投手のキー]: 行 } }`
//   （行は CATCH_KEYS）。投手側の「捕手別」は同じ記録を投手のキーで引く
//   （同じ数字を2か所に持たない）。
// - `calls` / `reads` … 捕手が配球した球数 / 打者に狙い球を当てられた球数。
//   リードの本体（`guessSuccessRate`）がそのまま数字に出るので、防御率より
//   ずっとぶれにくい。バントの球は数えない。
// - `starts` … 先発マスク（試合の最初の打席で受けた捕手）。`all` の行だけ。
// ⚠ 記録を取り始める前の試合は入っていない（保存の版は上げていない。
//    無ければ出さない項目）。
// ============================================================
// ⚠ 場面別の行（PA_KEYS）より絞ってある。投手1人に捕手の数だけ行が増えるので、
//    バント・ファウル等の使わない数を持たない。
export const CATCH_KEYS = [
  'outs',
  'pa',
  'atBats',
  'hits',
  'homeruns',
  'walks',
  'hitByPitch',
  'strikeouts',
  'runs',
  'earnedRuns',
  'calls',
  'reads',
  'starts',
];
/** 組み合わせを「まだ少ない」と薄く出す境目（アウト数。30回=90） */
export const BATTERY_MIN_OUTS = 90;
/** 組み合わせの表の注記。⚠ アプリ（Battery.kt の BATTERY_NOTE）と同文 */
export const BATTERY_NOTE = `${BATTERY_MIN_OUTS / 3}回未満の組は薄く出しています。回数が少ないうちは運の差が大きく出ます。読まれ率は、打者に狙い球を当てられた球の割合で、低いほどリードが効いています。`;
/** 捕手の行（CATCH_KEYS）から、画面に出す率を作る。守った回が無ければ null */
export function catchRates(line) {
  if (!line || !(line.outs > 0)) return null;
  const nine = (n) => ((n || 0) * 27) / line.outs;
  return {
    outs: line.outs,
    era: nine(line.earnedRuns),
    k9: nine(line.strikeouts),
    bb9: nine(line.walks),
    avg: line.atBats > 0 ? line.hits / line.atBats : null,
    readRate: line.calls > 0 ? (line.reads || 0) / line.calls : null,
    starts: line.starts || 0,
  };
}
