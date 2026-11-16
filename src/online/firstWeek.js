// ============================================================
// はじめての1週間（途中参戦した人への案内）。
//
// ⚠ 先方回答（2026-11-16）「すぐやりたい」A3。オンラインには案内が無く、1シーズンが
//    実時間1週間なので、最初の数日で迷うとその年を丸ごと逃す。
// ⚠ 出すのは**参加してから7日の間**だけ（サーバーの `member.joinedAt`。参加の手続き
//    `applyJoin` が入れる）。リーグを作ったときの最初の参加者には入っていないので出ない
//    （いまのリーグの人はもう遊び慣れている）。
// ⚠ 済んだかどうかは**その端末に残す**（PC・スマホは localStorage、アプリは SessionStore）。
//    ページを開いたら済み。保存したかまでは見ない（決めなくても指導者の案で試合は進むので、
//    「どこで何が決められるか」を一度見てもらえれば足りる）。
// ⚠ 文はアプリ（`mobile/shared/.../FirstWeek.kt`）と同じにすること。
// ============================================================

/** 参加してから何日の間出すか */
export const FIRST_WEEK_DAYS = 7;

/**
 * やること。`page`: PC の左メニューのページ、`mobile`: スマホWeb のタブ。
 * ⚠ アプリは `FirstWeek.kt` の同じ id で編成の面（PlanTab）を開く
 */
export const FIRST_WEEK_STEPS = [
  {
    id: 'lineup',
    title: 'スタメンを確かめる',
    body: '打順と守備位置を見て、疲れた選手や調子の悪い選手を入れ替えます。',
    page: 'lineup',
    mobile: 'lineup',
  },
  {
    id: 'rotation',
    title: '投手の役割を決める',
    body: '先発ローテと抑え・中継ぎを並べます。先発ごとに球数の目安も選べます。',
    page: 'rotation',
    mobile: 'lineup',
  },
  {
    id: 'tactics',
    title: '方針・采配を選ぶ',
    body: '試合は自動で進むので、打撃・投球・走塁・守備の方針が采配の代わりになります。',
    page: 'tactics',
    mobile: 'lineup',
  },
  {
    id: 'staff',
    title: '任せ方を決める',
    body: '監督・コーチに、分野ごとに「自分で」「意見を聞く」「任せる」を選べます。来られない日は任せておけば進みます。',
    page: 'staff',
    mobile: 'staff',
  },
];

/** 案内の見出しの下に添える一言 */
export const FIRST_WEEK_NOTE =
  '決めなくても指導者の案で試合は進みます。まずはどこで何を決められるかを見ておきましょう。';

const DAY = 24 * 3600 * 1000;

/** 案内を出す期間か（参加してから7日の間） */
export function inFirstWeek(joinedAt, now = Date.now()) {
  const at = Date.parse(joinedAt || '');
  return Number.isFinite(at) && now - at >= 0 && now - at < FIRST_WEEK_DAYS * DAY;
}

/**
 * 案内に出すもの。出さないときは null。
 * @param state 端末に残した `{ done: string[], closed: boolean }`
 * @returns {{ done: number, total: number, next: object, steps: object[] } | null}
 */
export function firstWeekGuide(joinedAt, state, now = Date.now()) {
  if (!inFirstWeek(joinedAt, now) || state?.closed) return null;
  const done = new Set(state?.done || []);
  const steps = FIRST_WEEK_STEPS.map((s) => ({ ...s, done: done.has(s.id) }));
  const next = steps.find((s) => !s.done);
  if (!next) return null;
  return { done: steps.filter((s) => s.done).length, total: steps.length, next, steps };
}

/** 端末に残す鍵（同じ端末で別の人が入っても混ざらないよう、球団と参加の時刻で分ける） */
export const firstWeekKey = (teamName, joinedAt) => `online-first-week:${teamName}:${joinedAt}`;

export function readFirstWeek(key) {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(key) || 'null') || { done: [], closed: false };
  } catch {
    return { done: [], closed: false };
  }
}

export function writeFirstWeek(key, state) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(state));
  } catch {
    // 保存できない端末（プライベートモード等）では、その場かぎりで済ませる
  }
}

/** ページを開いたときに「済み」にする（そのページの手順があれば） */
export function markFirstWeek(state, id) {
  if (!FIRST_WEEK_STEPS.some((s) => s.id === id) || state.done.includes(id)) return state;
  return { ...state, done: [...state.done, id] };
}
