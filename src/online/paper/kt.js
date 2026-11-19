// ============================================================
// スポーツ新聞（PC）の小さな道具。アプリの共通部（Kotlin）と**同じ答え**を出すための書き方をそろえる。
//
// ⚠ 紙面の文はアプリ（`mobile/shared/.../FrontPage*.kt`）を写したもの（いしだ 2026-11-18「PC版でも新聞を」）。
//    Kotlin と JavaScript で答えが割れやすい所をここに集める:
//    - 丸め: Kotlin の `kotlin.math.round` は**偶数への丸め**（0.5 は偶数側）。Math.round は上へ丸める
//    - 整数の割り算・余り: Kotlin の Int は 0 へ切り捨て
//    - 32ビットの掛け算と桁あふれ（言い回しを選ぶ `Pen`）
//    - maxByOrNull / sortedBy: 同じ値なら**先に出たもの**を残す（Array.sort も安定）
// ============================================================

/** Kotlin の `kotlin.math.round`（0.5 は偶数側へ） */
export function roundKt(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Kotlin の Int の割り算（0 へ切り捨て） */
export const idiv = (a, b) => Math.trunc(a / b);

/** 打率などの表記（.312）。値が無ければ「-」（Text.kt rate3） */
export function rate3(value) {
  if (value == null) return '-';
  const s = String(roundKt(value * 1000)).padStart(3, '0');
  return value >= 1.0 ? '1.000' : `.${s}`;
}

/** 言い回しを選ぶ。同じ seed と salt なら必ず同じものを返す（FrontPageCopy.kt の Pen） */
export class Pen {
  constructor(seed) {
    this.seed = seed | 0;
  }
  pick(pool, salt) {
    let h = (Math.imul(this.seed, 1000003) + Math.imul(salt, 7919)) | 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    const n = pool.length;
    return pool[((h % n) + n) % n];
  }
}

/** Kotlin の String.hashCode（1字なら字の番号） */
export function javaHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/** 最大のもの（同じ値なら先に出たもの）。空なら null */
export function maxBy(list, f) {
  let best = null;
  let bestV = -Infinity;
  for (const x of list) {
    const v = f(x);
    if (best === null || v > bestV) {
      best = x;
      bestV = v;
    }
  }
  return best;
}

/** 安定な並べ替え（新しい配列） */
export const sortBy = (list, f) => [...list].sort((a, b) => cmp(f(a), f(b)));
export const sortByDesc = (list, f) => [...list].sort((a, b) => cmp(f(b), f(a)));
function cmp(a, b) {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}
/** 文字の比べ方（Kotlin の String.compareTo と同じく UTF-16 の並び） */
export const cmpStr = (a, b) => (a === b ? 0 : a < b ? -1 : 1);

export const chunked = (list, n) => {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
};

/** 「a・b」のように、空でないものだけつなぐ（listOfNotNull(...).joinToString） */
export const joinNN = (parts, sep = '') => parts.filter((x) => x != null).join(sep);

/** 空文字なら null（ifEmpty { null }） */
export const orNull = (s) => (s === '' || s == null ? null : s);

/** 数（JSON の数だけ。文字は数えない）。Json.kt の num() */
export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** 整数（Json.kt の int()。小数は 0 へ切り捨て） */
export const int = (v) => (num(v) == null ? null : Math.trunc(v));
export const str = (v) => (v == null ? null : typeof v === 'string' ? v : String(v));
/** 生の JSON から値を引く（Json.kt の at） */
export function at(o, ...keys) {
  let cur = o;
  for (const k of keys) cur = cur && typeof cur === 'object' && !Array.isArray(cur) ? cur[k] : undefined;
  return cur;
}
export const list = (v) => (Array.isArray(v) ? v : []);
export const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
