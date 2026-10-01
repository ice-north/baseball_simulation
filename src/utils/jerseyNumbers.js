// ============================================================
// 背番号（jersey number）の割り当て - src/utils/jerseyNumbers.js
//
// ゲーム挙動には影響しない、プレイヤー識別用のラベル。
// チーム内で 1-99 の一意な番号を、ポジション別の慣例的な帯から割り当てる。
// 既に有効な番号（1-99・重複なし）を持つ選手はそのまま維持する（冪等）。
// ============================================================

// ポジション別の優先番号帯（日本プロ野球の慣例をゆるく反映）
const POOLS = {
  pitcher: [18, 11, 17, 14, 16, 19, 20, 21, 15, 13, 12, 26, 28, 29, 47, 41, 42, 46, 48, 49, 34, 40],
  catcher: [27, 22, 2, 10, 12, 30, 37, 39, 57],
  infield: [6, 5, 3, 4, 1, 23, 25, 31, 32, 33, 36, 38, 43, 44, 45],
  outfield: [8, 9, 7, 24, 51, 55, 61, 63, 50, 53, 54, 60, 0],
};

const posCategory = (position) =>
  position === 'pitcher' ? 'pitcher'
  : position === 'catcher' ? 'catcher'
  : ['first', 'second', 'third', 'short'].includes(position) ? 'infield'
  : 'outfield';

const isValidNumber = (n) => Number.isInteger(n) && n >= 0 && n <= 99;

/**
 * チーム内の全選手に一意な背番号(0-99)を割り当てる。
 * 既に有効・非重複な番号を持つ選手は維持し、未設定/重複のみ埋める（冪等）。
 */
export function ensureTeamJerseyNumbers(team) {
  const players = team?.players;
  if (!Array.isArray(players) || players.length === 0) return;

  const used = new Set();
  // 既存の有効・非重複番号を維持（従来 number=id の巨大値は無効として振り直す）
  for (const p of players) {
    if (isValidNumber(p.number) && !used.has(p.number)) used.add(p.number);
    else p.number = null;
  }

  const nextFree = (pool) => {
    for (const n of pool) if (!used.has(n)) return n;
    for (let n = 1; n <= 99; n++) if (!used.has(n)) return n;
    return 99;
  };

  for (const p of players) {
    if (p.number != null) continue;
    const n = nextFree(POOLS[posCategory(p.position)] || []);
    p.number = n;
    used.add(n);
  }
}
