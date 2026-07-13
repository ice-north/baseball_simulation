// ============================================================
// 能力値の共通表示コンポーネント - src/components/AbilityValue.jsx
//
// 選手を並べる全画面（ロスター管理・キャンプ・選手検索・スカウト・セレクション）で
// 能力値の配色を統一するための単一の入口。内部で getAbilityRank + getRankColor を
// 使い、球速は (v-115)×2.5、投手スタミナは v/2 に正規化してから S〜F ランク色を返す。
//
// これにより「同じ能力が画面ごとに違う色」という分裂を解消する。各画面が独自に
// getAbilityColor（正規化なし）や low/high 閾値で色付けするのをこれに置き換える。
// ============================================================

import { getAbilityRank, getRankColor } from '../utils/constants.js';

// 能力値1つを色付きで表示する。
//   value       : 能力値（数値）。null / '?' / NaN は placeholder 表示。
//   isVel        : 球速なら true（(v-115)×2.5 で正規化）
//   isSta        : 投手スタミナなら true（v/2 で正規化）
//   showRank     : true なら数値の前に S〜F のランク文字を添える（色覚に依存しない可読性）
//   placeholder  : 値が無い/未判明時の表示（スカウトのぼかし '?' など）
export function AbilityValue({ value, isVel = false, isSta = false, showRank = false, placeholder = '?', className = '' }) {
  const n = typeof value === 'number' ? value : (value == null ? NaN : parseInt(value));
  if (isNaN(n)) return <span className="text-gray-500">{placeholder}</span>;
  const rank = getAbilityRank(n, isVel, isSta);
  const color = getRankColor(rank);
  return (
    <span className={`font-bold ${color} ${className}`}>
      {showRank && <span className="font-mono text-xs mr-0.5 opacity-90">{rank}</span>}
      {value}
    </span>
  );
}

// 総合ランク（S〜F の1文字）だけを丸バッジで表示する。行頭の一覧スキャン用。
export function RankBadge({ value, isVel = false, isSta = false, className = '' }) {
  const n = typeof value === 'number' ? value : NaN;
  if (isNaN(n)) return null;
  const rank = getAbilityRank(n, isVel, isSta);
  const color = getRankColor(rank);
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded font-mono font-extrabold text-xs bg-gray-800 border border-gray-700 ${color} ${className}`}>
      {rank}
    </span>
  );
}
