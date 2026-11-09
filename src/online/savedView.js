/**
 * 最後に受け取ったビュー（と接続の設定）を端末に残し、次に開いたときにすぐ出す。
 *
 * 【なぜ】PC版は開くたびに「接続を確認しています…」「リーグを読み込んでいます…」を待っていた。
 *   アプリは前回のビューをすぐ出して裏で読み直している（`SessionStore.viewJson`）。同じ形にする。
 *
 * ⚠ 出すのは**同じ人・同じ端末のログイン**のときだけ（`userId` と `sessionId` が一致）。
 * ⚠ 残したビューの世代（`viewGeneration`）を読み直しの `since` に使う。何も変わっていなければ
 *    サーバーはビューを送らず、残したものがそのまま最新になる。変わっていれば差し替わる。
 * ⚠ 参加前・作成前・形の取り込み待ちの画面は残さない（そこは毎回サーバーの答えで出す）。
 * ⚠ 容量が足りないなどで残せなくても、黙って残さないだけにする（画面は普段どおり読む）。
 */
export const VIEW_KEY = 'baseball-online-view-v1';
export const CONFIG_KEY = 'baseball-online-config-v1';

const local = () => (typeof localStorage === 'undefined' ? null : localStorage);

export function readSavedView(auth, storage = local()) {
  if (!auth || !storage) return null;
  try {
    const saved = JSON.parse(storage.getItem(VIEW_KEY) || 'null');
    if (
      !saved?.view ||
      typeof saved.view !== 'object' ||
      saved.userId !== auth.userId ||
      saved.sessionId !== auth.sessionId
    )
      return null;
    return saved.view;
  } catch {
    return null;
  }
}

export function saveView(auth, view, storage = local()) {
  if (!auth || !storage || !view) return;
  if (view.setupRequired || view.joinRequired || view.versionMismatch) {
    forgetView(storage);
    return;
  }
  try {
    storage.setItem(
      VIEW_KEY,
      JSON.stringify({ userId: auth.userId, sessionId: auth.sessionId, view }),
    );
  } catch {
    forgetView(storage);
  }
}

export function forgetView(storage = local()) {
  try {
    storage?.removeItem(VIEW_KEY);
  } catch {
    /* 消せなくても、次に開いたときに別の人のものとしては出さない（照合している） */
  }
}

/** 接続の設定（`config`）。中身は小さく、変わることはまず無い。開いた直後に使い、裏で取り直す */
export function readSavedConfig(storage = local()) {
  try {
    const saved = JSON.parse(storage?.getItem(CONFIG_KEY) || 'null');
    return saved && typeof saved === 'object' && typeof saved.local === 'boolean'
      ? saved
      : null;
  } catch {
    return null;
  }
}

export function saveConfig(config, storage = local()) {
  try {
    storage?.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    /* 残せなくても次は取りに行くだけ */
  }
}
