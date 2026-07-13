// ============================================================
// プール状態ミューテータ - src/state/pools.js
//
// releasedPlayersPool（グローバルミュータブル配列）への変更を集約する。
// 直接 .push / .splice / .length=0 を書く代わりにこれらを使うことで、
// (1) 重複ID混入の防止（"選手増殖"バグ対策）、(2) 変更経路の一元化、
// (3) 開発時の不変条件検査、を得る。
//
// releasedPlayersPool 自体の実体は teams-data.js が保持する（循環参照回避のため
// ここでは import して操作するだけ）。
// ============================================================

import { releasedPlayersPool } from '../teams-data.js';

// 開発時のみ不変条件を検査（Viteのprodビルドでは無効化）。Node(ハーネス)では
// import.meta.env が未定義のため DEV=true 扱い。
const DEV = !(typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD);

// 配列内にID重複がないか検査し、あれば警告する（開発時のみ）。
export function assertUniqueIds(arr, label = 'pool') {
  if (!DEV || !Array.isArray(arr)) return;
  const seen = new Set();
  for (const p of arr) {
    if (p && p.id != null) {
      if (seen.has(p.id)) {
        console.error(`[state] 重複ID検出 (${label}): id=${p.id} name=${p.name ?? '?'}`);
      }
      seen.add(p.id);
    }
  }
}

// プールに選手を追加する。既に同一IDが存在する場合はスキップ（重複防止）。
export function addToReleasedPool(player) {
  if (!player || player.id == null) return false;
  if (releasedPlayersPool.some(p => p.id === player.id)) return false;
  releasedPlayersPool.push(player);
  return true;
}

// 複数選手をまとめてプールに追加する（各要素は重複防止付き）。
export function addManyToReleasedPool(players) {
  if (!Array.isArray(players)) return;
  for (const p of players) addToReleasedPool(p);
}

// 指定IDの選手をプールから除去する。除去できたら true。
export function removeFromReleasedPoolById(id) {
  const idx = releasedPlayersPool.findIndex(p => p.id === id);
  if (idx >= 0) {
    releasedPlayersPool.splice(idx, 1);
    return true;
  }
  return false;
}

// IDの集合（Set/配列）に一致する選手をすべてプールから除去する。
export function removeFromReleasedPoolByIds(ids) {
  const idSet = ids instanceof Set ? ids : new Set(ids);
  for (let i = releasedPlayersPool.length - 1; i >= 0; i--) {
    if (idSet.has(releasedPlayersPool[i].id)) releasedPlayersPool.splice(i, 1);
  }
}

// プールの中身を新しい配列で置換する（length=0 + 再追加のパターンを一元化）。
// 重複IDは自動的に除外される。
export function replaceReleasedPool(players) {
  releasedPlayersPool.length = 0;
  addManyToReleasedPool(Array.isArray(players) ? players : []);
}
