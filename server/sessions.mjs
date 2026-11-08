// ============================================================
// ログインの記録（どの端末から操作できるか）。
//
// 1アカウントで同時に操作できるのは **ブラウザ1台とアプリ1台** まで
// （いしだ決定 2026-11-08: PCとアプリの両方でログインすると、片方が閲覧のみに
// なって不便だった）。同じ種類で別の端末からログインすると、前の端末だけが外れる。
//
// ⚠ **種類ごとに最新の1台だけ残すこと**。台数を無制限にすると、人の端末や
//    共用の端末でログインしたまま忘れても、ログインし直すだけでは締め出せなくなる
//    （1アカウント1台にしていた理由。古い画面の内容で上書きするのは revision の
//    照合で別に防いでいる）。
// ⚠ PCのブラウザとスマホのブラウザは同じ「ブラウザ」に数える（同じ画面なので）。
// ⚠ 前の形（1アカウントに文字列1つ）も読めること。保存はそのまま残っているので、
//    次にログインするまではその1台が操作できる。
// ============================================================

export const SESSION_KINDS = ['web', 'app'];

/** ログインしてきた端末の種類。アプリは `client: 'app'` を送る。それ以外はブラウザ */
export const sessionKind = (client) => (client === 'app' ? 'app' : 'web');

/** そのアカウントで操作できるセッションの一覧 */
export function sessionIdsOf(entry) {
  if (typeof entry === 'string') return entry ? [entry] : [];
  if (!entry || typeof entry !== 'object') return [];
  return SESSION_KINDS.map((kind) => entry[kind]).filter(
    (id) => typeof id === 'string' && id,
  );
}

/** この端末（`sessionId`）から操作できるか */
export const isLiveSession = (sessions, userId, sessionId) =>
  !!sessionId && sessionIdsOf(sessions?.[userId]).includes(sessionId);

/**
 * ログインしたあとの記録。同じ種類の前の端末だけを外す。
 * ⚠ 前の形（文字列）は、どちらの種類の端末のものか分からないので残さない
 *    （前と同じく、ログインした端末だけが操作できる状態から始める）。
 */
export function withLogin(entry, client, sessionId) {
  const next = {};
  if (entry && typeof entry === 'object')
    for (const kind of SESSION_KINDS) if (entry[kind]) next[kind] = entry[kind];
  next[sessionKind(client)] = sessionId;
  return next;
}

/** ログアウトしたあとの記録。その端末だけを外す。何も残らなければ undefined */
export function withLogout(entry, sessionId) {
  if (typeof entry === 'string') return entry === sessionId ? undefined : entry;
  if (!entry || typeof entry !== 'object') return undefined;
  const next = {};
  for (const kind of SESSION_KINDS)
    if (entry[kind] && entry[kind] !== sessionId) next[kind] = entry[kind];
  return Object.keys(next).length ? next : undefined;
}
