export const ONLINE_SCHEMA = 1;
export const ONLINE_ENGINE_VERSION = 'online-1';
export const PROGRESSION_TIMES = [
  '08:00',
  '10:30',
  '13:00',
  '15:30',
  '18:00',
  '20:30',
  '23:00',
];

export class OnlineError extends Error {
  constructor(message, status = 400, code = 'invalid') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function requireOnline(
  condition,
  message,
  status = 400,
  code = 'invalid',
) {
  if (!condition) throw new OnlineError(message, status, code);
}

export function assertLeagueVersion(league) {
  requireOnline(
    league?.schema === ONLINE_SCHEMA &&
      league.engineVersion === ONLINE_ENGINE_VERSION,
    'ゲームのバージョンが対応していません。更新を確認してください',
    409,
    'version',
  );
}

// サーバー時刻を基準にする。日本時間に夏時間はない。
export function nextProgressionAt(now) {
  const ms = new Date(now).getTime();
  requireOnline(Number.isFinite(ms), '時刻が不正です');
  const jst = new Date(ms + 9 * 3600000);
  const midnight =
    Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) -
    9 * 3600000;
  for (const time of PROGRESSION_TIMES) {
    const [h, m] = time.split(':').map(Number);
    const candidate = midnight + (h * 60 + m) * 60000;
    if (candidate > ms) return new Date(candidate).toISOString();
  }
  return new Date(midnight + 86400000 + 8 * 3600000).toISOString();
}

export const formatGameDate = (date) =>
  `${date.year}/${date.month}/${date.day}`;
export const PHASE_LABELS = {
  initial_tryout: '初期編成',
  camp: 'キャンプ',
  contract: '契約更改',
  tryout: 'トライアウト',
  offseason: '年度更新',
};

export function validateLineup(team, plan) {
  requireOnline(plan && typeof plan === 'object', '編成が不正です');
  requireOnline(
    Array.isArray(plan.battingOrder) && plan.battingOrder.length === 8,
    '野手8人の打順を指定してください',
  );
  requireOnline(
    plan.battingOrder.every((e) => e && typeof e === 'object'),
    '打順の指定が不正です',
  );
  const positions = [
    'catcher',
    'first',
    'second',
    'third',
    'short',
    'left',
    'center',
    'right',
  ];
  requireOnline(
    new Set(plan.battingOrder.map((e) => e.playerId)).size === 8,
    '同じ選手を重複して指定できません',
  );
  requireOnline(
    new Set(plan.battingOrder.map((e) => e.battingOrder)).size === 8 &&
      plan.battingOrder.every(
        (e) =>
          Number.isInteger(e.battingOrder) &&
          e.battingOrder >= 1 &&
          e.battingOrder <= 8,
      ),
    '打順は1〜8番を一度ずつ指定してください',
  );
  requireOnline(
    positions.every((pos) => plan.battingOrder.some((e) => e.position === pos)),
    '野手の守備位置を一度ずつ指定してください',
  );
  requireOnline(
    plan.battingOrder.every((e) =>
      team.players.some(
        (p) =>
          p.id === e.playerId &&
          p.position !== 'pitcher' &&
          p.isActive !== false,
      ),
    ),
    '登録できない選手が含まれています',
  );
  requireOnline(
    Array.isArray(plan.starters) &&
      plan.starters.length > 0 &&
      plan.starters.length <= 8 &&
      new Set(plan.starters).size === plan.starters.length,
    '先発投手を1〜8人指定してください',
  );
  requireOnline(
    plan.starters.every((id) =>
      team.players.some(
        (p) =>
          p.id === id &&
          p.position === 'pitcher' &&
          p.pitching &&
          p.isActive !== false,
      ),
    ),
    '先発投手の指定が不正です',
  );
  requireOnline(
    !plan.starters.some((id) =>
      plan.battingOrder.some((e) => e.playerId === id),
    ),
    '初版では先発投手と野手の兼任はできません',
  );
}

// JSONで往復する編集内容を比較する。オブジェクトのキー順は変更と扱わない。
export function sameEditState(a, b) {
  const canonical = (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value;
  return JSON.stringify(a, canonical) === JSON.stringify(b, canonical);
}
