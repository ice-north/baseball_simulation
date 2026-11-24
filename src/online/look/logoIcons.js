// 球団ロゴの絵の形（`public/look/logo-icons.json`。約280KB）を、要るときに1回だけ読む。
// ⚠ 配布 HTML に埋め込まない（新しい見た目を入にした人だけが読む。字と同じ扱い）。
// ⚠ 読めなかったとき（オフライン・古い配布物）は、絵の部品を飛ばして描くだけで落ちない。
//    次に画面を開いたときにもう一度読みにいく。作る小窓は「読めませんでした」と読み直すボタンを出す
//    （`logoIconsFailed`。出さないと「読み込んでいます…」のまま止まって見える）。
const ICONS_URL = '/look/logo-icons.json';

let icons = null;
let loading = null;
let failed = false;
const listeners = new Set();
const notify = () => {
  for (const fn of listeners) fn();
};

/** いま手元にある絵の形（まだなら null） */
export const logoIconsNow = () => icons;
/** 最後に読みにいって読めなかったか（読み直しを始めると false に戻る） */
export const logoIconsFailed = () => failed;

/** 絵の形を読む（何度呼んでも読むのは1回） */
export function loadLogoIcons() {
  if (icons) return Promise.resolve(icons);
  if (!loading) {
    if (failed) {
      failed = false;
      notify();
    }
    loading = fetch(ICONS_URL)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`logo icons ${res.status}`))))
      .then((data) => {
        icons = data;
        notify();
        return icons;
      })
      .catch(() => {
        loading = null;
        failed = true;
        notify();
        return null;
      });
  }
  return loading;
}

/** 絵の形が届いた・読めなかったときに呼ぶ関数を登録する（戻り値で外す。`useSyncExternalStore` 用） */
export function onLogoIcons(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 検査用: 絵の形を直接入れる（ブラウザの外では fetch で読めない） */
export function setLogoIconsForTest(data) {
  icons = data;
  failed = false;
  notify();
}
