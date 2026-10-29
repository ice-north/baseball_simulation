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
