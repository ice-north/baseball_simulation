// 新しい見た目（試作）の入／切。⚠ **端末ごと**（この端末のブラウザに覚える）。既定は切。
//   保存・サーバーは触らない。切のときは今までと1画素も変わらないこと
//   （絵を描く部品は何も出さず、CSS は `.online-look` の下にだけ当てる。`look.css` の字の宣言と
//   絵の枠 `.online-look-art` は下に置かないが、切のときは使われないので字も読まない）。
// ⚠ 一人用の画面はこの文脈の外にある（`OnlineApp` だけが渡す）ので、いつも切。
import { createContext, useContext } from 'react';

export const LOOK_KEY = 'baseball-online-look-v1';

export function readLookSetting() {
  try {
    return globalThis.localStorage?.getItem(LOOK_KEY) === 'new';
  } catch {
    return false;
  }
}
export function saveLookSetting(on) {
  try {
    if (on) globalThis.localStorage?.setItem(LOOK_KEY, 'new');
    else globalThis.localStorage?.removeItem(LOOK_KEY);
  } catch {
    // 保存できない（プライベートブラウズなど）ときは、この画面を開いている間だけ
  }
}

/** `on` 入／切、`ownTeam` 自球団の内部名（顔の帽子に使う）、`setOn` 切り替え */
export const LookContext = createContext({ on: false, ownTeam: null, setOn: null });
export const useLook = () => useContext(LookContext);
