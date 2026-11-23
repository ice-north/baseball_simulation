// 見た目（試作）の絵を決める乱数。⚠ アプリ（Kotlin）にも同じ式を写す。
//   hash: FNV-1a（字のコードポイントごと）、rng: mulberry32。
//   どちらも 32 ビットの整数で回す（`Math.imul` と `>>> 0`）。

/** 文字列 → 32 ビットの符号なし整数 */
export function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 種から 0 以上 1 未満の数を順に返す関数を作る */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 一覧から1つ（乱数を1回使う） */
export const pick = (r, list) => list[Math.floor(r() * list.length)];
