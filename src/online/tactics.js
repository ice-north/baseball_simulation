// 対人版の事前方針。未指定なら既存の自動試合と同じ判断・乱数消費を保つ。
export const STRATEGY_FIELDS = {
  batting: [
    '打撃方針',
    { balanced: 'バランス', patient: '慎重', aggressive: '積極' },
  ],
  pitching: [
    '投球方針',
    { balanced: 'バランス', strikeout: '三振狙い', contact: '打たせて取る' },
  ],
  baseRunning: [
    '走塁方針',
    {
      normal: '標準',
      aggressive: '積極',
      conservative: '慎重',
      never: '盗塁しない',
    },
  ],
  defense: [
    '守備方針',
    { normal: '標準', infield_in: '前進守備', shift: '守備シフト' },
  ],
};
export const STARTER_ROLES = {
  auto_s: 'おまかせ',
  ace: 'ゲームメーカー',
  complete: '完投型',
  quality: '勝ち権利型',
  short: 'ショートスターター',
  opener: 'オープナー',
};
export const RELIEF_ROLES = {
  auto_r: 'おまかせ',
  long: 'ロングリリーフ',
  ace_relief: '中継ぎエース',
  setup: 'セットアッパー',
  closer: '守護神',
  onepoint: 'ワンポイント',
  behind: 'ビハインド',
  mopup: '敗戦処理',
};
export const TACTIC_FIELDS = {
  sacrificeBunt: [
    '送りバント',
    { auto: 'AI判断', avoid: '控えめ', aggressive: '積極的', never: 'しない' },
  ],
  squeeze: [
    'スクイズ',
    { auto: 'AI判断', avoid: '控えめ', aggressive: '積極的', never: 'しない' },
  ],
  safetyBunt: [
    'セーフティバント',
    { auto: 'AI判断', avoid: '控えめ', aggressive: '積極的', never: 'しない' },
  ],
  pinchHit: ['代打', { auto: 'AI判断', never: '使わない' }],
  pinchHitFrom: [
    '代打を使い始める回',
    {
      0: '既存AIの判断',
      5: '5回以降',
      6: '6回以降',
      7: '7回以降',
      8: '8回以降',
      9: '9回以降',
    },
  ],
  defensiveSub: ['守備固め', { auto: 'AI判断', never: '使わない' }],
  defenseFrom: [
    '守備固めを使い始める回',
    { 0: '既存AIの判断', 7: '7回以降', 8: '8回以降', 9: '9回以降' },
  ],
  hook: [
    '先発の不調時の交代',
    { auto: '標準', early: '早めに交代', patient: '長めに任せる' },
  ],
  starterLimit: [
    '先発の球数上限',
    {
      0: '役割・スタミナで判断',
      60: '最大60球',
      80: '最大80球',
      100: '最大100球',
      120: '最大120球',
    },
  ],
};
export const TACTIC_DEFAULTS = Object.fromEntries(
  Object.entries(TACTIC_FIELDS).map(([key, [, options]]) => [
    key,
    ['pinchHitFrom', 'defenseFrom', 'starterLimit'].includes(key)
      ? 0
      : Object.keys(options)[0],
  ]),
);
export function tacticalChance(chance, setting) {
  return setting === 'never'
    ? 0
    : setting === 'avoid'
      ? chance * 0.5
      : setting === 'aggressive'
        ? Math.min(1, chance * 1.5)
        : chance;
}
export function tacticalPitchLimit(limit, isReliever, tactics) {
  return !isReliever && tactics?.starterLimit > 0
    ? Math.min(limit, tactics.starterLimit)
    : limit;
}
export function tacticalDamageLimit(limit, tactics) {
  return tactics?.hook === 'early'
    ? limit * 0.75
    : tactics?.hook === 'patient'
      ? limit * 1.25
      : limit;
}
export function roleFor(role, starter) {
  return typeof role === 'string' &&
    Object.hasOwn(starter ? STARTER_ROLES : RELIEF_ROLES, role)
    ? role
    : starter
      ? 'auto_s'
      : 'auto_r';
}
