// ============================================================
// 節目の記録の決まり（通算100安打・シーズン30本塁打など）。オンライン（`server/chronicle.mjs`）と
// 1人用（`src/season/soloChronicle.js`）で同じ決まりを使う。
// ============================================================

/** 通算の節目（このリーグでの通算）。`every` ごと、`from` から */
export const CAREER_MILESTONES = [
  { side: 'batting', stat: 'hits', label: '安打', every: 100, from: 100 },
  { side: 'batting', stat: 'homeruns', label: '本塁打', every: 50, from: 50 },
  { side: 'batting', stat: 'rbis', label: '打点', every: 100, from: 100 },
  { side: 'batting', stat: 'stolenBases', label: '盗塁', every: 50, from: 50 },
  { side: 'pitching', stat: 'wins', label: '勝', every: 25, from: 25 },
  { side: 'pitching', stat: 'saves', label: 'セーブ', every: 50, from: 50 },
  { side: 'pitching', stat: 'holds', label: 'ホールド', every: 50, from: 50 },
  { side: 'pitching', stat: 'strikeouts', label: '奪三振', every: 250, from: 250 },
];

/** シーズンの節目（その年の数字）。決まった値だけ */
export const SEASON_MILESTONES = [
  { side: 'batting', stat: 'homeruns', label: '本塁打', at: [20, 30, 40, 50] },
  { side: 'batting', stat: 'hits', label: '安打', at: [150, 180, 200] },
  { side: 'batting', stat: 'rbis', label: '打点', at: [80, 100, 120] },
  { side: 'batting', stat: 'stolenBases', label: '盗塁', at: [30, 50] },
  { side: 'pitching', stat: 'wins', label: '勝', at: [15, 20] },
  { side: 'pitching', stat: 'saves', label: 'セーブ', at: [30, 40] },
  { side: 'pitching', stat: 'strikeouts', label: '奪三振', at: [150, 200] },
];

/** 何かを越えたか。越えた値（いちばん大きいもの）か null */
export function crossedCareer(rule, before, after) {
  if (after < rule.from || after <= before) return null;
  const step = Math.floor(after / rule.every) * rule.every;
  return step > before && step >= rule.from ? step : null;
}
export function crossedSeason(rule, before, after) {
  const hit = rule.at.filter((v) => before < v && after >= v);
  return hit.length ? hit.at(-1) : null;
}
