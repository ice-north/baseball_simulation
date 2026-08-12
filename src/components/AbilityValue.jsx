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

import { getAbilityRank, getRankColor, getUtilityScore } from '../utils/constants.js';

// 能力値1つを色付きで表示する。
//   value       : 能力値（数値）。null / '?' / NaN は placeholder 表示。
//   isVel        : 球速なら true（(v-115)×2.5 で正規化）
//   isSta        : 投手スタミナなら true（v/2 で正規化）
//   showRank     : true なら数値の前に S〜F のランク文字を添える（色覚に依存しない可読性）
//   placeholder  : 値が無い/未判明時の表示（スカウトのぼかし '?' など）
export function AbilityValue({ value, isVel = false, isSta = false, showRank = false, placeholder = '?', className = '' }) {
  const n = typeof value === 'number' ? value : (value == null ? NaN : parseInt(value));
  if (isNaN(n)) return <span className="text-gray-400">{placeholder}</span>;
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
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded font-mono font-extrabold text-xs bg-surface-2 border border-gray-700 ${color} ${className}`}>
      {rank}
    </span>
  );
}

// 選手の総合力（0〜99目安）を役割別の加重平均で算出する。
// 球速・投手スタミナは正規化してから合成するため、ランク配色と整合する。
// 能力が欠損（スカウトのぼかし '?' 等）なら null を返す。
export function overallRating(player) {
  if (!player) return null;
  const num = (v) => (typeof v === 'number' && !isNaN(v) ? v : null);
  if (player.position === 'pitcher') {
    const vel = num(player.pitching?.velocity);
    const ctrl = num(player.pitching?.control);
    const sta = num(player.pitching?.stamina);
    if (vel == null || ctrl == null || sta == null) return null;
    const velN = Math.max(0, Math.min(99, (vel - 115) * 2.5));
    const staN = Math.max(0, Math.min(99, sta / 2));
    const arsenal = player.pitching?.arsenal || [];
    const bestBreak = arsenal.filter(a => a.type !== 'straight').reduce((m, a) => Math.max(m, a.level || 0), 0);
    return Math.round(velN * 0.34 + ctrl * 0.34 + staN * 0.16 + bestBreak * 0.16);
  }
  const meet = num(player.batting?.meet);
  const power = num(player.batting?.power);
  if (meet == null || power == null) return null;
  const eye = num(player.batting?.eye) ?? 0;
  const def = num(player.fielding?.defense) ?? 0;
  const spd = num(player.physical?.speed) ?? 0;
  const arm = num(player.physical?.arm) ?? 0;
  // ユーティリティ（守備の幅）を小さく加点（上限+4）
  const utilBonus = getUtilityScore(player) * 0.04;
  return Math.round(meet * 0.30 + power * 0.22 + eye * 0.14 + def * 0.14 + spd * 0.10 + arm * 0.10 + utilBonus);
}

// 選手の総合ランクバッジ。overallRating を S〜F に丸めて表示。算出不能なら「?」。
export function OverallBadge({ player, className = '' }) {
  const rating = overallRating(player);
  if (rating == null) {
    return (
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded font-mono font-extrabold text-xs bg-surface-2 border border-gray-700 text-gray-400 ${className}`}>?</span>
    );
  }
  return <RankBadge value={rating} className={className} />;
}
