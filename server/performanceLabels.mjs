// 対人版専用。既存の今季成績だけを読み、試合・育成・乱数・保存データを変更しない。
export const LABEL_RULES = Object.freeze({
  battingPA: 50,
  pitchingOuts: 45,
  stealAttempts: 10,
  maxLabels: 3,
});
const valid = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const has = (s, keys) => s && keys.every((key) => valid(s[key]));
const divide = (n, d) => (valid(n) && valid(d) && d > 0 ? n / d : null);
const atLeast = (a, b) => a + 1e-12 >= b;
const battingKeys = [
  'atBats',
  'hits',
  'doubles',
  'triples',
  'homeruns',
  'walks',
  'strikeouts',
  'sacrificeBunts',
];
const pitchingKeys = ['inningsPitched', 'strikeouts', 'walks', 'homeruns'];

export function battingMetrics(s) {
  if (!has(s, battingKeys)) return null;
  if (s.hits > s.atBats || s.doubles + s.triples + s.homeruns > s.hits)
    return null;
  // 既存集計には犠飛・敬遠の区別がない。正確な打席/出塁率と混同しない。
  const hbp = valid(s.hitByPitch) ? s.hitByPitch : 0;
  const pa = s.atBats + s.walks + hbp + s.sacrificeBunts;
  return {
    pa,
    avg: divide(s.hits, s.atBats),
    iso: divide(s.doubles + 2 * s.triples + 3 * s.homeruns, s.atBats),
    hrRate: divide(s.homeruns, pa),
    bbRate: divide(s.walks, pa),
    kRate: divide(s.strikeouts, pa),
    obp: divide(s.hits + s.walks + hbp, s.atBats + s.walks + hbp),
    homeruns: s.homeruns,
    stolenBases: valid(s.stolenBases) ? s.stolenBases : null,
    stealAttempts: has(s, ['stolenBases', 'caughtStealing'])
      ? s.stolenBases + s.caughtStealing
      : null,
    stealRate: has(s, ['stolenBases', 'caughtStealing'])
      ? divide(s.stolenBases, s.stolenBases + s.caughtStealing)
      : null,
  };
}
export function pitchingMetrics(s) {
  if (!has(s, pitchingKeys)) return null;
  return {
    outs: s.inningsPitched,
    k9: divide(s.strikeouts * 27, s.inningsPitched),
    bb9: divide(s.walks * 27, s.inningsPitched),
    hr9: divide(s.homeruns * 27, s.inningsPitched),
    era: valid(s.earnedRuns)
      ? divide(s.earnedRuns * 27, s.inningsPitched)
      : null,
  };
}
function combined(records, keys) {
  if (!records.length) return null;
  return Object.fromEntries(
    keys.map((key) => [
      key,
      records.reduce((n, s) => n + (valid(s[key]) ? s[key] : 0), 0),
    ]),
  );
}
export function leagueComparison(league) {
  const names = league.season.settings?.teamNames;
  if (!names?.length || names.some((name) => !league.game.teams[name]))
    return null;
  const players = [...new Set(names)].flatMap(
    (name) => league.game.teams[name].players,
  );
  const batting = players
    .map((p) => p.seasonStats?.batting)
    .filter((s) => battingMetrics(s));
  const pitching = players
    .map((p) => p.seasonStats?.pitching)
    .filter((s) => pitchingMetrics(s));
  return {
    batting: battingMetrics(combined(batting, [...battingKeys, 'hitByPitch'])),
    pitching: pitchingMetrics(combined(pitching, pitchingKeys)),
  };
}
function choose(candidates) {
  return candidates
    .sort((a, b) =>
      Math.abs(b.score - a.score) > 1e-12
        ? b.score - a.score
        : a.order - b.order,
    )
    .slice(0, LABEL_RULES.maxLabels)
    .map(({ id, text, tone }) => ({ id, text, tone }));
}
export function performanceFor(player, comparison) {
  const batting = battingMetrics(player.seasonStats?.batting);
  const pitching = pitchingMetrics(player.seasonStats?.pitching);
  const labels = { batting: [], pitching: [] };
  const add = (list, id, text, tone, score) =>
    list.push({ id, text, tone, score, order: list.length });
  const high = (value, mean, factor) =>
    value !== null && mean > 0 && atLeast(value, mean * factor);
  const b = comparison?.batting;
  if (
    batting &&
    batting.pa >= LABEL_RULES.battingPA &&
    b?.pa >= LABEL_RULES.battingPA
  ) {
    const m = batting,
      list = [];
    if (m.avg !== null && b.avg !== null && atLeast(m.avg, b.avg + 0.035))
      add(
        list,
        'average',
        'アベレージヒッター',
        'good',
        (m.avg - b.avg) / 0.035,
      );
    if (high(m.hrRate, b.hrRate, 1.5) && high(m.iso, b.iso, 1.3))
      add(
        list,
        'power',
        'パワーヒッター',
        'good',
        Math.min(m.hrRate / b.hrRate / 1.5, m.iso / b.iso / 1.3),
      );
    else if (high(m.iso, b.iso, 1.3))
      add(list, 'extra-base', '長打型', 'good', m.iso / b.iso / 1.3);
    if (high(m.bbRate, b.bbRate, 1.4))
      add(list, 'eye', '選球眼', 'good', m.bbRate / b.bbRate / 1.4);
    else if (m.obp !== null && b.obp !== null && atLeast(m.obp, b.obp + 0.04))
      add(list, 'on-base', '出塁型', 'good', (m.obp - b.obp) / 0.04);
    if (high(m.kRate, b.kRate, 1.7))
      add(list, 'whiff', '扇風機', 'bad', m.kRate / b.kRate / 1.7);
    else if (high(m.kRate, b.kRate, 1.35))
      add(list, 'strikeout', '三振', 'bad', m.kRate / b.kRate / 1.35);
    if (m.stealAttempts >= LABEL_RULES.stealAttempts && m.stealRate !== null) {
      if (m.stealRate >= 0.8)
        add(list, 'steal-good', '盗塁B', 'good', m.stealRate / 0.8);
      else if (m.stealRate < 0.6)
        add(list, 'steal-bad', '盗塁F', 'bad', 1 + (0.6 - m.stealRate) / 0.6);
    }
    labels.batting = choose(list);
  }
  const p = comparison?.pitching;
  if (
    pitching &&
    pitching.outs >= LABEL_RULES.pitchingOuts &&
    p?.outs >= LABEL_RULES.pitchingOuts
  ) {
    const m = pitching,
      list = [];
    if (high(m.k9, p.k9, 1.3))
      add(list, 'pitch-k', '奪三振', 'good', m.k9 / p.k9 / 1.3);
    if (high(m.bb9, p.bb9, 1.4))
      add(list, 'pitch-bb', '四球', 'bad', m.bb9 / p.bb9 / 1.4);
    else if (m.bb9 !== null && p.bb9 > 0 && atLeast(p.bb9 * 0.7, m.bb9))
      add(
        list,
        'control',
        '制球安定',
        'good',
        1 + (p.bb9 * 0.7 - m.bb9) / (p.bb9 * 0.7),
      );
    if (high(m.hr9, p.hr9, 1.5))
      add(list, 'pitch-hr', '一発', 'bad', m.hr9 / p.hr9 / 1.5);
    labels.pitching = choose(list);
  }
  return {
    batting: { metrics: batting, labels: labels.batting },
    pitching: { metrics: pitching, labels: labels.pitching },
  };
}
