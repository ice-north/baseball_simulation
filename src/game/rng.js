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
