// ⚠ **保存された世界の形を変えたら上げること**。上げないと、古い形のリーグが
//    `assertLeagueVersion` を素通りして読み込まれ、どこか遠くで落ちる。
//    上げれば「ゲームのバージョンが対応していません」で止まるので原因が分かる。
//    2 = 2部制12球団・招待制・毎正時24ターン（1 = 固定4球団・2人・1日7枠）。
// ⚠ 上げてもリーグは**作り直せない**（`create` は既存リーグがあると拒む）。
//    `docs/online/PRODUCTION_SETUP.md` の作り直し手順で制御行を空にすること。
export const ONLINE_SCHEMA = 2;
export const ONLINE_ENGINE_VERSION = 'online-1';
// 1ターン＝1時間。毎正時に1つ進む。24ターン×7日＝168ターンで1週間。
// ⚠ **夜間も止めない**。月〜金の120ターンが試合、土曜がストーブリーグ、日曜がキャンプ。
//    以前は1日7回・夜間休止だったが、多人数ペナントの設計で毎正時に変えた。
export const PROGRESSION_TIMES = [
  '00:00',
  '01:00',
  '02:00',
  '03:00',
  '04:00',
  '05:00',
  '06:00',
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
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
  // 今日のぶんを使い切ったら、翌日の最初の枠へ。
  // ⚠ **先頭の枠から求めること**。以前は 8時 を直に書いており、
  //    `PROGRESSION_TIMES` を変えても追従しなかった。
  const [fh, fm] = PROGRESSION_TIMES[0].split(':').map(Number);
  return new Date(midnight + 86400000 + (fh * 60 + fm) * 60000).toISOString();
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

// ============================================================
// フェーズの締め切り
//
// ⚠ **1人が決めないと全員が止まる**のを避けるための仕組み。
//    非同期で遊ぶゲームなので、待ち続ける設計だと誰かの都合で週が進まない。
//    締め切りを過ぎたら未提出の人に既定案を当てて先へ進める。
//
// 曜日の割り当ては締め切りの置き方で決まる。シーズンは月曜0時に始まり、
// 120ターン（24×5日）で**金曜23時に終わる**。そこから、
//
//   土曜  ストーブリーグ（契約更改・トライアウト・オフシーズン）→ 締め切り 日曜0時
//   日曜  キャンプ・編成                                       → 締め切り 月曜0時
//   月曜  新シーズン開幕
//
// ⚠ 締め切りが曜日合わせを兼ねている。全員が早く決めても、次の開幕は
//    月曜0時まで来ない（曜日がずれない）。
// ============================================================

/** フェーズを行う曜日（JST。0=日曜 … 6=土曜）。初期編成は締め切りを設けない */
export const PHASE_WEEKDAY = {
  contract: 6,
  tryout: 6,
  offseason: 6,
  camp: 0,
};

/** JSTでの曜日（0=日曜 … 6=土曜） */
export function jstWeekday(iso) {
  return new Date(new Date(iso).getTime() + 9 * 3600000).getUTCDay();
}

/**
 * 指定した曜日の0時（JST）のうち、`now` より後で一番近いものを返す。
 * ⚠ `now` がちょうどその曜日の0時でも、**次の週**を返す（先へ進むため）。
 */
export function nextWeekdayStart(now, weekday) {
  const ms = new Date(now).getTime();
  requireOnline(Number.isFinite(ms), '時刻が不正です');
  const jst = new Date(ms + 9 * 3600000);
  const midnight =
    Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) -
    9 * 3600000;
  const diff = (weekday - jst.getUTCDay() + 7) % 7 || 7;
  return new Date(midnight + diff * 86400000).toISOString();
}

/**
 * フェーズの締め切り。担当曜日の**翌日0時**（JST）。
 * 担当が決まっていないフェーズ（初期編成）は `null`＝待ち続ける。
 */
export function phaseDeadlineAt(kind, now) {
  const weekday = PHASE_WEEKDAY[kind];
  if (weekday === undefined) return null;
  return nextWeekdayStart(now, (weekday + 1) % 7);
}
