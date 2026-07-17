// ============================================================
// 将来性バッジ - src/components/PotentialBadge.jsx
//
// projectPeak() の推定を「将来性グレード＋予測ピーク総合力＋伸びしろ」で表示する
// 共有バッジ。選手詳細・トライアウト・スカウト・プロスペクトボードで再利用する。
// ============================================================
import React from 'react';
import { projectPeak, GRADE_COLOR, GRADE_BG } from '../season/potential.js';

// 星表示（S=★5, A=4, B=3, C=2, D=1）
const GRADE_STARS = { S: 5, A: 4, B: 3, C: 2, D: 1 };

export default function PotentialBadge({ player, compact = false }) {
  const p = React.useMemo(() => projectPeak(player), [player]);
  const stars = GRADE_STARS[p.grade] || 1;

  if (compact) {
    // 一覧向け: グレード＋★のみ
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-bold ${GRADE_BG[p.grade]} ${GRADE_COLOR[p.grade]}`} title={`予測ピーク 総合${p.peak}（${p.peakAge}歳頃）`}>
        {p.grade}
        <span className="text-[0.65rem] tracking-tighter">{'★'.repeat(stars)}<span className="opacity-30">{'★'.repeat(5 - stars)}</span></span>
      </span>
    );
  }

  return (
    <div className={`rounded-lg border px-3 py-2 ${GRADE_BG[p.grade]}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-300 font-bold">将来性</span>
        <span className={`text-lg font-bold ${GRADE_COLOR[p.grade]}`}>{p.grade}</span>
        <span className={`text-sm ${GRADE_COLOR[p.grade]}`}>
          {'★'.repeat(stars)}<span className="opacity-25">{'★'.repeat(5 - stars)}</span>
        </span>
        {p.matured ? (
          <span className="ml-auto text-xs text-gray-400">完成期（伸びしろ僅少）</span>
        ) : (
          <span className="ml-auto text-xs text-gray-300 tabular-nums">
            予測ピーク <span className="font-bold text-white">総合{p.peak}</span>
            <span className="text-gray-400"> ／ {p.peakAge}歳頃</span>
          </span>
        )}
      </div>
      {!p.matured && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-700/70 rounded-full overflow-hidden">
            {/* 現在→予測ピークのゲージ（0-99スケール） */}
            <div className="h-full bg-gray-500 rounded-full relative" style={{ width: `${p.current}%` }} />
          </div>
          <span className="text-xs text-gray-400 tabular-nums">現{p.current}</span>
          <span className="text-xs text-green-400 font-bold tabular-nums">伸び+{p.upside}</span>
        </div>
      )}
    </div>
  );
}
