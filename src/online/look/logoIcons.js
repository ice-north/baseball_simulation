// 球団ロゴの絵の形（`public/look/logo-icons.json`。約280KB）を、要るときに1回だけ読む。
// ⚠ 配布 HTML に埋め込まない（新しい見た目を入にした人だけが読む。字と同じ扱い）。
// ⚠ 読めなかったとき（オフライン・古い配布物）は、絵の部品を飛ばして描くだけで落ちない。
//    次に画面を開いたときにもう一度読みにいく。
const ICONS_URL = '/look/logo-icons.json';

let icons = null;
let loading = null;
const listeners = new Set();

/** いま手元にある絵の形（まだなら null） */
export const logoIconsNow = () => icons;

/** 絵の形を読む（何度呼んでも読むのは1回） */
export function loadLogoIcons() {
  if (icons) return Promise.resolve(icons);
  if (!loading) {
    loading = fetch(ICONS_URL)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`logo icons ${res.status}`))))
      .then((data) => {
        icons = data;
        for (const fn of listeners) fn();
        return icons;
      })
      .catch(() => {
        loading = null;
        return null;
      });
  }
  return loading;
}

/** 絵の形が届いたときに呼ぶ関数を登録する（戻り値で外す。`useSyncExternalStore` 用） */
export function onLogoIcons(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 検査用: 絵の形を直接入れる（ブラウザの外では fetch で読めない） */
export function setLogoIconsForTest(data) {
  icons = data;
  for (const fn of listeners) fn();
}
