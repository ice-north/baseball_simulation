// ============================================================
// クラッシュ復旧用スナップショット提供 - src/game/crashRecovery.js
//
// App が現在のゲーム状態を返す関数を登録しておき、Error Boundary が
// クラッシュ時にそれを呼んで緊急保存できるようにする軽量な橋渡し。
// （Error Boundary は App の React state に直接アクセスできないため）
// ============================================================

let _provider = null;

// App が現在の gameState を返す関数を登録する。
export function setGameSnapshotProvider(fn) {
  _provider = fn;
}

// クラッシュ時に現在の gameState を取得（失敗しても例外を投げない）。
export function getGameSnapshot() {
  try {
    return _provider ? _provider() : null;
  } catch {
    return null;
  }
}
