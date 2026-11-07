// ⚠ `pyramidLeague` は `shared` を読まないので、ここから読んでも循環しない
import { SEASON_TURNS } from './pyramidLeague.js';
// ⚠ **保存された世界の形を変えたら上げること**。上げないと、古い形のリーグが
//    `assertLeagueVersion` を素通りして読み込まれ、どこか遠くで落ちる。
//    上げれば「ゲームのバージョンが対応していません」で止まるので原因が分かる。
//    7 = 45分1ターン・1週224ターン（120試合・3連戦）、
//    6 = 球団間のトレード、5 = 初期メンバー選択（4 = 検証モード、
//    3 = 招待コード廃止、2 = 2部制12球団・招待制・毎正時24ターン、
//    1 = 固定4球団・2人・1日7枠）。
// ⚠ 上げてもリーグは**作り直せない**（`create` は既存リーグがあると拒む）。
//    `docs/online/PRODUCTION_SETUP.md` の作り直し手順で制御行を空にすること。
export const ONLINE_SCHEMA = 7;
export const ONLINE_ENGINE_VERSION = 'online-1';

// ---- ターンの長さ
/**
 * 1ターンの実時間（分）。
 *
 * ⚠ **1日を割り切る数にすること**。`nextProgressionAt` は「その日の枠を順に見て、
 *    今より後の最初の枠へ」で次の時刻を決めるので、割り切れないと日付が変わる
 *    ところで枠の間隔が狂う。45分なら 1440/45 = 32枠でちょうど収まる。
 * ⚠ **1週間の枠数が、シーズンの作りと噛み合っていること**（下の表）。
 *      45分 × 32枠 = 24時間 → 1日32ターン・1週224ターン
 *      月〜金 160ターン = 120試合 + 休養40（`SEASON_TURNS` / `REST_EVERY`）
 *      土 32ターン = 契約更改とトライアウト、日 32ターン = キャンプ
 *    合計 224。**シーズン1つ＝実時間1週間**は毎正時の頃から変えていない。
 * ⚠ 以前は1時間（1日24枠・1週168ターン）で、月〜金の120ターンに
 *    100試合（5試合に1休）を詰めていた。休養が足りず、実測でレギュラーの
 *    疲労が終盤190（最大829）まで積み上がり、打率 .237→.189、
 *    本塁打率 0.58→0.28 とシーズン後半が別のゲームになっていた。
 */
export const TURN_MINUTES = 45;
export const TURNS_PER_DAY = (24 * 60) / TURN_MINUTES;

// 進行する時刻。⚠ **手で並べないこと**（45分刻みは :00 :45 :30 :15 と巡るので
//    書き写すと必ず間違える）。`TURN_MINUTES` から作る。
// ⚠ **夜間も止めない**。以前は1日7回・夜間休止だったが、多人数ペナントの
//    設計で全時間帯に変えた。
export const PROGRESSION_TIMES = Array.from({ length: TURNS_PER_DAY }, (_, i) => {
  const minutes = i * TURN_MINUTES;
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
});

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

/**
 * ゲーム内の日付を**ターン**に直す。開幕（4/1）が第1ターン。
 *
 * ⚠ オンラインは**ターンで進む**（1ターン＝実時間1時間＝ゲーム内1日）。
 *    ゲーム内の日付は進行の副産物でしかなく、画面に出すと
 *    「4/18って何試合目？」と数え直すことになる。画面はターンで出す。
 * ⚠ 休養日もターンに数える（120ターン中100試合）。「何試合目か」は
 *    球団ごとに違うので、試合の予定では別に数える（`ownUpcomingGames`）。
 * ⚠ 開幕前・シーズン後は範囲の外。`null` を返して、呼ぶ側で文面を変える。
 */
export const SEASON_START_MONTH = 4;
export function turnOfDate(date, turns = SEASON_TURNS) {
  if (!date?.year) return null;
  const start = Date.UTC(date.year, SEASON_START_MONTH - 1, 1);
  const at = Date.UTC(date.year, (date.month || 1) - 1, date.day || 1);
  const turn = Math.floor((at - start) / 86400000) + 1;
  return turn >= 1 && turn <= turns ? turn : null;
}

/**
 * 一覧に出すターンの表記（「第23ターン」）。範囲の外なら「開幕前」「シーズン終了」。
 * ⚠ 一覧では総数（/120）を繰り返さない。6試合ぶん並ぶと同じ数字が6回出る。
 */
export function turnLabel(date, turns = SEASON_TURNS) {
  const turn = turnOfDate(date, turns);
  if (turn) return `第${turn}ターン`;
  if (!date?.year) return '';
  return date.month < SEASON_START_MONTH ? '開幕前' : 'シーズン終了';
}

/** 見出しに出すターンの表記（「第23ターン / 120」）。総数はここだけ出す */
export function formatTurn(date, turns = SEASON_TURNS) {
  const turn = turnOfDate(date, turns);
  return turn ? `${turnLabel(date, turns)} / ${turns}` : turnLabel(date, turns);
}

/**
 * 登録できる守備位置（コンバートの選択肢）。
 * ⚠ DHは守備位置ではない（打順の枠）ので入れない。
 * ⚠ サーバーと画面の**両方がここを読む**。別々に並べると、画面に出ているのに
 *    サーバーが弾く位置ができる。
 */
export const CONVERT_POSITIONS = [
  'pitcher',
  'catcher',
  'first',
  'second',
  'third',
  'short',
  'left',
  'center',
  'right',
];

export const PHASE_LABELS = {
  pack_select: '初期メンバー選択',
  // ⚠ 初期編成はセット選択に置き換えた。移行の途中でしか現れないが、
  //    古い保存を読んだ瞬間に空欄にしないため名前だけ残す
  initial_tryout: '初期編成',
  camp: 'キャンプ',
  contract: '契約更改',
  tryout: 'トライアウト',
  offseason: '年度更新',
};

// ---- 日々の編成の決まり（サーバーの `server/dailyLineup.mjs` と、PC版の編成ページの両方が使う）
// ⚠ 画面はこの値で色を変え・説明を書く。サーバーと別に持つとずれるので、ここだけに置く。
/** 野手はこの疲労以上だと、その日だけ控えと入れ替えて休ませる */
export const FIELDER_REST_FATIGUE = 80;
/** 休ませる野手の代役に選べる守備適性の下限 */
export const SUBSTITUTE_MIN_FITNESS = 60;
/** 休ませる野手の代役に選べる控えの疲労（これ未満の控えだけが代役になる） */
export const SUBSTITUTE_FRESH_FATIGUE = 40;
/** 先発はこの疲労以上だと、その日の登板を飛ばして次の先発が投げる */
export const STARTER_SKIP_FATIGUE = 40;

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

/**
 * キャンプで選べる練習。**サーバーと画面で同じ表を見る**。
 *
 * ⚠ 画面にだけメニューを増やさないこと。`TRAINING_MENUS` には
 *    「新球種習得（newpitch）」のようにオンラインのエンジンが動かさないものが
 *    あり、出すと選べるのに提出で弾かれる（実測で画面に出ていた）。
 */
export const CAMP_MENUS = [
  'batting',
  'baserunning',
  'fielding',
  'control',
  'velocity',
  'intensive_power',
  'intensive_meet',
  'intensive_speed',
  'intensive_control',
  'intensive_velocity',
  'intensive_defense',
  'intensive_eye',
];

/**
 * フェーズを行う曜日（JST。0=日曜 … 6=土曜）。締め切りはその翌日0時。
 *
 * ⚠ **初期編成にも締め切りを置くこと**。以前は「最初の1回くらいは全員を待とう」と
 *    締め切りを設けなかったが、1人が決めないだけでリーグが永久に止まった
 *    （実際、開幕前の日付のまま何日も動かなくなった）。
 *    **時間による進行が絶対**で、決めていない人は標準案で押し通す。
 * ⚠ 初期編成を土曜（＝締め切り日曜0時）に置くのは、その次のキャンプが
 *    月曜0時に締め切られて**月曜開幕**になるため。初期編成を日曜に置くと、
 *    キャンプの締め切りが1週間先になって開幕が遅れる。
 */

/**
 * キャンプのサブ練習。**サーバーと画面で同じ表を見る**。
 *
 * ⚠ **対象を選ぶものは入れない**。サブポジ練習（守備位置）・フォーム改造
 *    （フォーム）・打席変更（右左）は、選手ごとに「何に」を指定する必要があり、
 *    提出の形に置き場が無い。入れるなら表に1列足すことになる。
 * ⚠ 変化球練習と新球種習得（サブ版）は**対象を選ばない**。前者は持っている
 *    変化球へ自動で振り分け、後者はランダムに球種が決まる。だから入れてよい
 *    （はじめ対象の要るものと一緒くたに外していた）。
 */
export const CAMP_SUB_MENUS = [
  'physique',
  'weight',
  'stretch',
  'defense_sub',
  'long_throw',
  'eye',
  'clead_study',
  'breaking',
  'newpitch',
  'spin_analysis',
];

/**
 * 1球団が抱えられる選手の上限。
 * ⚠ **1か所に置くこと**。トライアウトの獲得人数・画面の上限・トレードの検査が
 *    別々に 24 と書いていると、変えたときに片方だけ残る。
 */
export const ROSTER_LIMIT = 26;

/**
 * オンラインの目標構成（合計26人）。
 *
 * ⚠ **一人用の `ROSTER_TARGETS`（24人）とは別**。一人用の名簿と試合の釣り合いは
 *    24人で測ってあり、そこを動かすとドラフト・トライアウト・戦力外の
 *    釣り合いが全部ずれる。オンラインだけ枠を2つ増やすので、表を分けた。
 * ⚠ 合計は `ROSTER_LIMIT` と揃えること。ずれると、トライアウトが枠を
 *    埋めきれない（目標に達して止まる）か、上限で弾かれる。
 */
export const ONLINE_ROSTER_TARGETS = {
  pitcher: 11,
  catcher: 2,
  infielder: 6,
  outfielder: 7,
};

/** キャンプのクール数。一人用と同じ4回 */
export const CAMP_ROUNDS = 4;

/** 育成方針（やる気に効く）。`trainingPolicy` の `DIRECTIONS` / `PHASES` と揃える */
export const CAMP_DIRECTIONS = ['sharpen', 'balanced', 'patch'];
export const CAMP_PHASES = ['physique', 'skill'];

export const PHASE_WEEKDAY = {
  // ⚠ 初期メンバー選択も土曜扱い（締め切り日曜0時）。続くキャンプが
  //    月曜0時に締め切られて月曜開幕になる
  pack_select: 6,
  // ⚠ 3→4 の移行が、締め切りの無い初期編成に締め切りを入れるときに使う。
  //    4→5 でセット選択へ差し替わるので、新しいリーグには出てこない
  initial_tryout: 6,
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
 * 締め切りまでに最低限残す時間（時間）。足りなければ翌週の同じ締め切りにする。
 *
 * ⚠ **リーグの最初の手続きに付けること**。いまの最初の手続きは初期メンバー選択
 *    （`pack_select`）。`initial_tryout` は 3→4 の移行でしか出てこない古い形で、
 *    以前はそちらにしか付いておらず、土曜の夜にリーグを作ると数分で締め切られて
 *    全員が標準のセットになっていた。
 */
export const MIN_PHASE_HOURS = {
  pack_select: 12,
  initial_tryout: 12,
};

/**
 * 担当の曜日を過ぎてから開いた手続きに与える猶予（時間）。
 *
 * ⚠ **ストーブリーグの3つは同じ土曜に並んでいる**。契約更改が日曜0時の
 *    締め切りまでかかると、続くトライアウトは日曜に開く。そのまま
 *    「次の日曜0時」を締め切りにすると**丸1週間待つ**ことになり、
 *    シーズンの曜日も1週ずれる（以前は実際にそうなっていた）。
 *    担当の曜日を過ぎていたら翌週を待たせず、この時間で締める。
 *    トライアウト12時間＋オフシーズン4時間で日曜のうちに収まり、
 *    キャンプは従来どおり月曜0時に締まる。
 */
export const LATE_PHASE_GRACE_HOURS = {
  contract: 12,
  tryout: 12,
  offseason: 4,
};

/**
 * 手続きが閉じる時刻＝**担当曜日の0時から何時間後か**（JST）。
 *
 * ⚠ **土曜の3つで土曜（32ターン）を分け合うこと**。以前はどれも「翌日0時」を
 *    締め切りにしていたので、契約更改が締め切りまでかかると続くトライアウトは
 *    日曜に開き、キャンプの32ターンを食っていた。実測で
 *    **ストーブリーグ52ターン・キャンプ8ターン**になっていた（本来 32 / 32）。
 * ⚠ 担当日の合計が24時間（32ターン）を超えないこと。超えると次の曜日の枠が
 *    削られる。
 * ⚠ ここを動かすと**考える時間の長さ**が変わる。非同期で遊ぶゲームなので、
 *    短くしすぎると寝ている間に標準案で決まる。
 */
export const PHASE_WINDOW_HOURS = {
  // 土曜（ストーブリーグ）= 32ターン
  contract: 12, //  0:00〜12:00（16ターン）
  tryout: 21, // 12:00〜21:00（12ターン）
  offseason: 24, // 21:00〜24:00（4ターン）
  // 日曜（キャンプ）= 32ターン
  camp: 24,
  // 開幕前の初期メンバー選択は1日まるごと使う
  pack_select: 24,
  initial_tryout: 24,
};

/**
 * フェーズの締め切り。担当曜日の0時 ＋ `PHASE_WINDOW_HOURS`（JST）。
 * 担当が決まっていないフェーズ（初期編成）は `null`＝待ち続ける。
 * 担当の曜日を過ぎてから開いたときは `LATE_PHASE_GRACE_HOURS` だけ待つ。
 */
export function phaseDeadlineAt(kind, now) {
  const weekday = PHASE_WEEKDAY[kind];
  if (weekday === undefined) return null;
  const windowHours = PHASE_WINDOW_HOURS[kind] ?? 24;
  const ms = new Date(now).getTime();
  // ⚠ **担当曜日の0時から数えること**。「翌日0時」だと、土曜の3つが全部
  //    同じ時刻を締め切りにしてしまい、順番に開く2つ目以降が日曜へはみ出す
  let close =
    new Date(nextWeekdayStart(now, weekday)).getTime() -
    7 * 86400000 +
    windowHours * 3600000;
  while (close <= ms) close += 7 * 86400000;
  let regular = new Date(close).toISOString();
  const grace = LATE_PHASE_GRACE_HOURS[kind];
  // ⚠ 初期編成は最初の手続きで、ドラフトの希望を考える時間が要る。土曜の夜に
  //    リーグを作ると締め切り（日曜0時）まで数分しかなく、全員が標準案で
  //    決まっていた。短すぎるときは翌週の日曜0時にする（全員が決めれば待たずに進む）
  const minimum = MIN_PHASE_HOURS[kind];
  if (minimum && new Date(regular).getTime() - ms < minimum * 3600000)
    regular = new Date(new Date(regular).getTime() + 7 * 86400000).toISOString();
  // 締め切りが5日以上先＝担当の曜日を過ぎた直後に開いた（遅れて開いた）
  if (grace === undefined || new Date(regular).getTime() - ms < 5 * 86400000)
    return regular;
  return new Date(ms + grace * 3600000).toISOString();
}

/**
 * キャンプが終わったあと、新シーズンの最初の試合を進める時刻。
 *
 * ⚠ **開幕は月曜0時に揃える**。以前はキャンプが決まった次の正時に始めていたため、
 *    全員が早く決めると火曜に開幕して、120ターン後の終わりも
 *    土曜にずれ込んでいた（ストーブリーグの土曜とぶつかる）。
 * ⚠ 月曜に入ってから決まった（締め切りの月曜0時の自動決定を含む）ときは、
 *    次の週まで待たせず次の正時から始める。
 */
export function seasonStartAt(now) {
  return jstWeekday(now) === 1
    ? nextProgressionAt(now)
    : nextWeekdayStart(now, 1);
}
