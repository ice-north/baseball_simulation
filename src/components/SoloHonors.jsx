import React from 'react';
import { SOLO_HONOR_KEY } from '../season/soloChronicle.js';

/**
 * 1人用の年間表彰（MVP・新人王・ベストナイン）と節目の記録（E1）。
 * オフの画面（その年）と殿堂の年鑑（年ごと）で使う。カードの上に置く前提の文字色。
 * `awards` は `frozenAwards`、または年度の記録（`teamHistory[].awards`）の写し。
 */
export default function SoloHonors({ awards, userTeamName = null, compact = false }) {
  const h = awards?.honors?.[SOLO_HONOR_KEY];
  const milestones = awards?.milestones || [];
  if (!h && !milestones.length) return null;
  const mine = (team) => (userTeamName && team === userTeamName ? 'text-amber-300' : 'text-white');
  const who = (x) => (
    <>
      <span className={`font-bold ${mine(x.team)}`}>{x.name}</span>
      <span className="text-gray-400 text-xs ml-1">{x.team}</span>
      {!compact && x.line && <span className="text-gray-300 text-xs ml-1.5 tabular-nums">{x.line}</span>}
    </>
  );
  return (
    <div className="bg-surface-2 rounded-xl border border-gray-700/50 p-3 space-y-2 text-sm">
      {h && (
        <>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <div><span className="text-yellow-400 text-xs font-bold mr-2">MVP</span>{h.mvp ? who(h.mvp) : <span className="text-gray-400">該当なし</span>}</div>
            <div><span className="text-emerald-400 text-xs font-bold mr-2">新人王</span>{h.rookie ? who(h.rookie) : <span className="text-gray-400">該当なし</span>}</div>
          </div>
          {h.bestNine?.length > 0 && (
            <div>
              <div className="text-sky-400 text-xs font-bold mb-1">ベストナイン</div>
              <div className={`grid ${compact ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-3'} gap-x-4 gap-y-0.5`}>
                {h.bestNine.map((x, i) => (
                  <div key={`${x.label}-${x.name}-${i}`} className="whitespace-nowrap truncate">
                    <span className="text-gray-300 text-xs inline-block w-12">{x.label}</span>
                    {who(x)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {milestones.length > 0 && (
        <div>
          <div className="text-pink-400 text-xs font-bold mb-1">節目の記録</div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {milestones.map((m, i) => (
              <span key={`${m.label}-${m.name}-${i}`} className="whitespace-nowrap">
                <span className={`font-bold ${mine(m.team)}`}>{m.name}</span>
                <span className="text-gray-400 text-xs ml-1">{m.team}</span>
                <span className="text-gray-200 ml-1.5">{m.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
