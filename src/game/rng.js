// 同じシードから同じ乱数列を得る。セーブ移行と自動試合の再現で共用する。
export function hashSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export const scheduledGameSeed = game => game.rngSeed ?? hashSeed(
  `${game.date.year}-${game.date.month}-${game.date.day}:${game.id}:${game.home}:${game.away}`
);

export function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// 自動試合は同期処理なので、既存の物理・監督AIの乱数を1試合だけ差し替えられる。
// finally で必ず元に戻す。非同期処理を渡してはいけない。
export function withSeededRandom(seed, work) {
  const previous = Math.random;
  Math.random = createSeededRandom(seed);
  try {
    const result = work();
    if (result && typeof result.then === 'function') throw new Error('withSeededRandom は同期処理専用です');
    return result;
  } finally {
    Math.random = previous;
  }
}

/** FNV-1a + avalanche。同じ文字列からは常に同じ値（`hashBell` の中身） */
function hash32(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

const unit = (h) => h / 4294967296;

/**
 * 文字列から決まる釣鐘型の値。一様乱数3つの平均（Irwin-Hall）で、範囲 -1〜+1、σ≈0.33。
 * 選手の名前とIDから先天的な特性を導く（`batterZone.js` のコース適性・`deception.js` の出所の見づらさ）。
 * ⚠ 式を変えると全選手の特性が変わる（既存セーブも）。
 */
export function hashBell(key, seed) {
  const a = unit(hash32(key, seed));
  const b = unit(hash32(key, seed ^ 0x9e3779b9));
  const c = unit(hash32(key, seed ^ 0x85ebca6b));
  return (a + b + c - 1.5) / 1.5;
}
