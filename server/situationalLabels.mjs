import { rates, addCounts, zeroLine } from '../src/online/recordStats.js';
export const SITUATION_RULES = Object.freeze({
  pa: 15,
  starts: 3,
  bunts: 10,
  multiGames: 20,
});
const enough = (line) => line?.pa >= SITUATION_RULES.pa;
const usable = (line) => enough(line) && rates(line)?.ops !== null;
export function situationalCandidates(record, comparison) {
  const out = { batting: [], pitching: [] };
  if (!record) return out;
  const b = record.splits.batting,
    p = record.splits.pitching,
    lb = comparison?.splits?.batting || {};
  const add = (category, id, text, tone, score) =>
    out[category].push({ id, text, tone, score });
  const difference = (
    category,
    good,
    bad,
    positive,
    negative,
    a,
    z,
    threshold,
    lower = false,
  ) => {
    if (!usable(a) || !usable(z)) return;
    const delta = (rates(a).ops - rates(z).ops) * (lower ? -1 : 1);
    if (delta >= threshold)
      add(category, good, positive, 'good', delta / threshold);
    else if (delta <= -threshold)
      add(category, bad, negative, 'bad', -delta / threshold);
  };
  difference(
    'batting',
    'chance-good',
    'chance-bad',
    'チャンスB',
    'チャンスF',
    b.risp,
    b.emptyRisp,
    0.1,
  );
  difference(
    'pitching',
    'pinch-good',
    'pinch-bad',
    '対ピンチB',
    '対ピンチF',
    p.risp,
    p.emptyRisp,
    0.1,
    true,
  );
  if ([b.left, b.right, lb.left, lb.right].every(usable)) {
    const d =
      rates(b.left).ops -
      rates(b.right).ops -
      (rates(lb.left).ops - rates(lb.right).ops);
    if (d >= 0.12) add('batting', 'left-good', '対左投手B', 'good', d / 0.12);
    else if (d <= -0.12)
      add('batting', 'left-bad', '対左投手F', 'bad', -d / 0.12);
  }
  if ([b.pinch, b.normal, lb.pinch].every(usable)) {
    const margin = Math.min(
      rates(b.pinch).ops - rates(b.normal).ops,
      rates(b.pinch).ops - rates(lb.pinch).ops,
    );
    if (margin > 0)
      add('batting', 'pinch-hit', '代打○', 'good', 1 + margin / 0.1);
  }
  if ([b.firstPitch, lb.firstPitch].every(usable)) {
    const delta = rates(b.firstPitch).ops - rates(lb.firstPitch).ops;
    if (delta >= 0.15)
      add('batting', 'first-pitch', '初球○', 'good', delta / 0.15);
  }
  if ([b.twoStrikes, lb.twoStrikes].every(enough)) {
    const a = rates(b.twoStrikes),
      mean = rates(lb.twoStrikes);
    if (
      a.obp !== null &&
      mean.obp !== null &&
      a.obp - mean.obp >= 0.05 &&
      a.kRate <= mean.kRate
    )
      add(
        'batting',
        'persistent',
        '粘り打ち',
        'good',
        (a.obp - mean.obp) / 0.05,
      );
  }
  if (b.all?.buntAttempts >= SITUATION_RULES.bunts) {
    const rate = b.all.buntSuccess / b.all.buntAttempts;
    if (rate >= 0.85)
      add('batting', 'bunt-good', 'バント○', 'good', rate / 0.85);
    else if (rate < 0.6)
      add('batting', 'bunt-bad', 'バント×', 'bad', 1 + (0.6 - rate) / 0.6);
  }
  if (
    b.all?.dpChances >= 15 &&
    lb.all?.dpChances >= 15 &&
    lb.all.doublePlays > 0
  ) {
    const ratio =
      b.all.doublePlays /
      b.all.dpChances /
      (lb.all.doublePlays / lb.all.dpChances);
    if (ratio >= 1.5) add('batting', 'double-play', '併殺', 'bad', ratio / 1.5);
  }
  const games = (record.games || []).filter((g) => g.atBats > 0);
  const ab = games.reduce((sum, g) => sum + g.atBats, 0),
    hits = games.reduce((sum, g) => sum + g.hits, 0);
  if (
    games.length >= SITUATION_RULES.multiGames &&
    ab >= 50 &&
    hits > 0 &&
    hits < ab
  ) {
    const avg = hits / ab;
    const expected = games.reduce(
      (sum, g) =>
        sum +
        1 -
        (1 - avg) ** g.atBats -
        g.atBats * avg * (1 - avg) ** (g.atBats - 1),
      0,
    );
    const actual = games.filter((g) => g.hits >= 2).length;
    if (expected > 0 && actual >= expected * 1.25 && actual >= expected + 3)
      add('batting', 'multi-hit', '固め打ち', 'good', actual / expected / 1.25);
  }
  // 短い先発を除外して好投した長い登板だけを選ばない。全先発に比較区分の対戦がある場合に限る。
  const starts = record.starts || [];
  if (
    starts.length >= SITUATION_RULES.starts &&
    starts.every((g) => g.early.pa >= 3 && g.middle.pa >= 3)
  ) {
    const early = zeroLine(),
      middle = zeroLine();
    for (const g of starts) {
      addCounts(early, g.early);
      addCounts(middle, g.middle);
    }
    difference(
      'pitching',
      'start-good',
      'start-bad',
      '立ち上がり○',
      'スロースターター',
      early,
      middle,
      0.12,
      true,
    );
    if (starts.every((g) => g.late.pa >= 3)) {
      const later = zeroLine();
      for (const g of starts) {
        addCounts(later, g.middle);
        addCounts(later, g.late);
      }
      if (
        usable(early) &&
        usable(later) &&
        rates(early).ops - rates(later).ops >= 0.12 &&
        rates(later).kRate - rates(early).kRate >= 0.03
      ) {
        out.pitching = out.pitching.filter(
          (c) => !['start-good', 'start-bad'].includes(c.id),
        );
        add(
          'pitching',
          'strong-finish',
          '尻上がり',
          'good',
          Math.min(
            (rates(early).ops - rates(later).ops) / 0.12,
            (rates(later).kRate - rates(early).kRate) / 0.03,
          ),
        );
      }
    }
  }
  return out;
}
