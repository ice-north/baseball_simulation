// ============================================================
// 内部診断ログ（console.log）を黙らせて関数を実行する。
// ⚠ 同期と async は分けたまま。async の関数を `quiet` に渡すと、await の前に
//    console.log が戻り、後半のログが漏れる。async は `quietAsync` を使う。
// ============================================================

/** 同期の関数を、console.log を黙らせて実行する */
export function quiet(fn) {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
}

/** async の関数を、終わるまで console.log を黙らせて実行する */
export async function quietAsync(fn) {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
}
