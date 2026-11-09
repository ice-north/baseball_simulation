import { generateRosterPacks, LEGACY_PACK_STYLE } from './rosterPack.js';
import {
  ONLINE_SCHEMA,
  ONLINE_ENGINE_VERSION,
  requireOnline,
  phaseDeadlineAt,
} from './shared.js';

// ============================================================
// 保存されたリーグを、いまのコードが読める形へ直す。
//
// 【なぜ要るか】オンラインは**保存が1つしかない**。一人用のように
// 「古いセーブを開かなければいい」が通じず、形を変えた瞬間にリーグが読めなくなり、
// 作り直す＝全員の成績が消える、しか選べなかった。実際それを一度やっている。
//
// 【書き方】`ONLINE_SCHEMA` を上げたら、**同じコミットでここに1段足す**。
// 検査が「段が1つずつ繋がっていて、最後が `ONLINE_SCHEMA` と一致すること」を
// 見ているので、足し忘れるとハーネスが落ちる。
//
//   { from: 2, to: 3, note: '采配の条件設定を足した',
//     apply(league) { for (const t of Object.values(league.game.teams)) t.x ??= {}; } }
//
// ⚠ **足すだけの変更にすること**。既存の項目の意味を変えると、ここで
//    書き直せない（古い値から新しい値を作れない）。
// ⚠ `apply` は **league を直接書き換える**。呼ぶ側が複製を渡す。
// ⚠ `apply` は**同じリーグに2回当たらない**前提で書かない。途中で失敗したときに
//    やり直せるよう、`??=` のように**何度当てても同じ結果**になる書き方にする。
// ============================================================

/**
 * これより前の版は作り直すしかない。
 * ⚠ 1（固定4球団・2人）から 2（2部制12球団・招待制）へは**移行できない**。
 *    4球団から12球団を作れないし、CPUの8球団の選手も存在しない。
 */
export const OLDEST_MIGRATABLE = 2;

/** 版を1つずつ上げる手順。⚠ 順番に並べ、飛ばさないこと */
export const MIGRATIONS = [
  {
    from: 2,
    to: 3,
    note: '招待コードを廃止した',
    apply(league) {
      // ⚠ 消すだけ。参加の可否は `assertCanJoin` が見るようになったので、
      //    残っていても害は無いが、読む人が「まだ要るのか」と迷う
      delete league.invites;
    },
  },
  {
    from: 3,
    to: 4,
    note: '検証モードと、初期編成の締め切りを足した',
    apply(league, { now }) {
      // ⚠ 既定はOFF。ONのままだと管理者が好きな時に試合を進められてしまう
      league.testMode ??= false;
      // ⚠ **締め切りの無い手続きを残さないこと**。初期編成には締め切りが
      //    無かったので、1人が決めないだけでリーグが永久に止まっていた。
      //    止まったままのリーグを、移行のときに時間で進む形へ直す
      if (league.phase && !league.phase.deadline)
        league.phase.deadline = phaseDeadlineAt(league.phase.kind, now);
    },
  },
  {
    from: 4,
    to: 5,
    note: '初期編成を初期メンバー選択に置き換えた',
    apply(league, { now }) {
      // ⚠ 置き換えたのは**開幕前の手続き**だけ。すでに開幕しているリーグは
      //    名簿が揃っているので何もしない。
      // ⚠ 印を付けるだけでは駄目。初期編成の画面も、それを解決する処理も
      //    もう無いので、**手続きそのものを選択へ差し替える**。
      //    残したままだと、締め切りが来ても解決できずリーグが止まる。
      if (league.phase?.kind !== 'initial_tryout') return;
      // ⚠ この段は版1の作り方のまま固定する（段の意味を後から変えない）
      league.packs = generateRosterPacks((league.seed ?? 0) + 7, {
        style: LEGACY_PACK_STYLE,
      }).map((pack) => ({
        ...pack,
        takenBy: null,
      }));
      league.phase = {
        id: `${league.season.year}:pack_select`,
        kind: 'pack_select',
        // 元の締め切りを引き継ぐ（移行で待ち時間を延ばさない）
        deadline: league.phase.deadline || phaseDeadlineAt('pack_select', now),
        submissions: {},
        packIds: league.packs.map((p) => p.id),
      };
    },
  },
  {
    from: 5,
    to: 6,
    note: '球団間のトレードを足した',
    apply(league) {
      // ⚠ 置き場を作るだけ。古いリーグには進行中のトレードが無いので空でよい。
      //    `??=` にしてあるのは、途中で失敗してやり直しても同じ結果になるため
      league.trades ??= [];
      league.tradeSeq ??= 0;
    },
  },
  {
    from: 6,
    to: 7,
    note: '1ターンを45分にし、120試合・3連戦の日程にした',
    apply(league) {
      // ⚠ **進行中のシーズンは、組んだ日程のまま終わらせる**。保存されている
      //    日程は 120ターン・100試合（5試合に1休）なので、新しい
      //    `SEASON_TURNS`（160）で数えると画面のターン表記が日程と食い違う。
      //    ここで古い値を書き留め、次の年度更新で `createSchedule` が
      //    新しい値に入れ替える。
      // ⚠ `gamesPerSeason` は触らない（規定打席の基準で、既に入っている）
      const settings = league.season?.settings;
      if (settings) settings.seasonTurns ??= 120;
      // ⚠ 次の進行時刻は45分刻みの枠に乗っていない。入れ直さないと、
      //    次の1回だけ最大59分ずれる（`nextProgressionAt` は「今より後の
      //    最初の枠」なので、以降は自然に揃う）
      league.nextAdvanceAt = null;
    },
  },
  {
    from: 7,
    to: 8,
    note: '初期メンバーのセットを型ごとに変え、キャンプの伸びを残すようにした',
    apply(league) {
      // ⚠ **途中参加でセットを待っている人は、配られたときの作り方のまま**。
      //    セットは種から作り直すので、版を書き留めないと新しい作り方で
      //    作り直され、選んだセットの中身が入れ替わる
      for (const member of league.members || [])
        if (member.packSeed) member.packStyle ??= LEGACY_PACK_STYLE;
      // キャンプの伸び（`phase.camp[人].last` / `gains`）は足すだけ。
      // 無ければ画面に出さないので、ここで作らない
    },
  },
  {
    from: 8,
    to: 9,
    note: '年代記（節目の記録・引退・裏の大会）と、年度の記録の部分け・昇降格を足した',
    apply(league) {
      // ⚠ 置き場を作るだけ。節目と引退はこの版から先のぶんだけ残る（過去の試合から
      //    作り直さない）。球団史・歴代記録は `league.records` から数えるので過去の年も出る。
      // ⚠ 過去の年度の記録（`history[]`）には部分け（`leagues`）と昇降格（`moves`）が無い。
      //    作れない（昇降格の通知は20件で切れる）ので、無いまま。球団史はその年の部と順位を空欄にする
      league.chronicle ??= { milestones: [], retired: [], world: [] };
    },
  },
];

// ⚠ **手順表と目標の版を差し替えられるようにしてある**。段がまだ0本なので、
//    そうしないと仕組みが一度も動かないまま「できているつもり」になる。
//    本番の呼び出しは引数なしで、既定の表と `ONLINE_SCHEMA` を使う。
const withDefaults = ({
  steps = MIGRATIONS,
  oldest = OLDEST_MIGRATABLE,
  target = ONLINE_SCHEMA,
  now = new Date().toISOString(),
} = {}) => ({ steps, oldest, target, now });

/** 手順表そのものの整合。⚠ 検査がここを呼ぶ（表を二重に書かないため） */
export function migrationChain(options) {
  const { steps, oldest, target } = withDefaults(options);
  const problems = [];
  let expected = oldest;
  for (const step of steps) {
    if (step.from !== expected)
      problems.push(`${expected}→ の段が無い（次は ${step.from}→${step.to}）`);
    if (step.to !== step.from + 1)
      problems.push(`${step.from}→${step.to} が1つ分でない`);
    if (typeof step.apply !== 'function')
      problems.push(`${step.from}→${step.to} に apply が無い`);
    if (!step.note) problems.push(`${step.from}→${step.to} に note が無い`);
    expected = step.to;
  }
  if (expected !== target)
    problems.push(
      `手順の終わりが ${expected} で、ONLINE_SCHEMA（${target}）と違う。版を上げたら段を足すこと`,
    );
  return { problems, reaches: expected };
}

/** いまのコードで読めるか */
export const isCurrent = (league, target = ONLINE_SCHEMA) =>
  league?.schema === target &&
  league?.engineVersion === ONLINE_ENGINE_VERSION;

/**
 * 直せるかどうかと、その理由。画面に出す文面もここで決める。
 * ⚠ **新しすぎる保存を古いコードで触らない**。巻き戻すと、新しい版で
 *    書かれた内容を落としたまま保存し直すことになる。
 */
export function migrationState(league, options) {
  const { steps, oldest, target } = withDefaults(options);
  if (!league) return { state: 'none' };
  if (isCurrent(league, target)) return { state: 'current' };
  if (league.engineVersion !== ONLINE_ENGINE_VERSION)
    return {
      state: 'blocked',
      reason: '試合の計算方法が変わっています。リーグを作り直してください',
    };
  if (!Number.isInteger(league.schema))
    return { state: 'blocked', reason: '保存の版が読み取れません' };
  if (league.schema > target)
    return {
      state: 'blocked',
      reason:
        'サーバーより新しい形式で保存されています。先にサーバーを更新してください',
    };
  if (league.schema < oldest)
    return {
      state: 'blocked',
      reason: `版${league.schema}からは移行できません。リーグを作り直してください`,
    };
  return {
    state: 'migratable',
    steps: steps.filter((s) => s.from >= league.schema),
  };
}

/**
 * `league` を直接書き換えて最新の形にする。当てた段の説明を返す。
 * ⚠ 呼ぶ側は**複製に当てて、成功したら差し替える**こと。途中で例外が出た
 *    リーグを保存すると、半分だけ新しい形になって次の移行も通らなくなる。
 */
export function migrateLeague(league, options) {
  const { target, now } = withDefaults(options);
  const info = migrationState(league, options);
  if (info.state === 'current') return { applied: [], changed: false };
  requireOnline(info.state === 'migratable', info.reason || '移行できません', 409, 'version');
  const applied = [];
  for (const step of info.steps) {
    // ⚠ 段に `now` を渡す。締め切りの入れ直しのように、時刻が要る直しがある
    step.apply(league, { now });
    league.schema = step.to;
    applied.push(`${step.from}→${step.to} ${step.note}`);
  }
  requireOnline(
    isCurrent(league, target),
    '移行しても版が合いません',
    500,
    'version',
  );
  return { applied, changed: applied.length > 0 };
}
