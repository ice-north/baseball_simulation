import React from 'react';
import { POSITION_NAMES } from '../utils/constants.js';

const ROUND_STYLES = {
  'ドラフト1位': {
    badge: 'bg-red-600 text-white shadow-[0_0_8px_rgba(239,68,68,0.6)]',
    border: 'border-l-4 border-red-500',
    glow: 'shadow-[0_2px_16px_rgba(239,68,68,0.18)]',
  },
  'ドラフト2位': {
    badge: 'bg-orange-500 text-white',
    border: 'border-l-4 border-orange-500',
    glow: '',
  },
  '育成指名': {
    badge: 'bg-gray-600 text-gray-200',
    border: 'border-l-4 border-gray-500',
    glow: '',
  },
};
const DEFAULT_ROUND_STYLE = {
  badge: 'bg-yellow-700 text-yellow-200',
  border: 'border-l-4 border-yellow-600',
  glow: '',
};

const DraftResultScreen = ({ draftedPlayers, nearMissPlayers, proBonus, onContinue }) => {
  const hasDrafted = draftedPlayers && draftedPlayers.length > 0;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <style>{`
        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .draft-card { animation: slideInUp 0.45s cubic-bezier(.22,.68,0,1.2) both; }
        .gold-shimmer {
          background: linear-gradient(90deg, #f59e0b 0%, #fde68a 40%, #f59e0b 60%, #b45309 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 3s linear infinite;
        }
      `}</style>

      {/* ヘッダー */}
      <div className="text-center mb-6">
        <p className="text-gray-400 text-sm font-semibold tracking-[0.2em] uppercase mb-1">NPB Draft</p>
        <h1 className="text-4xl font-black text-white tracking-tight">ドラフト結果</h1>
        <div className="flex items-center justify-center gap-3 mt-2">
          <div className="h-px w-20 bg-gradient-to-r from-transparent to-yellow-500/80" />
          <span className="gold-shimmer text-base font-black">指名選手発表</span>
          <div className="h-px w-20 bg-gradient-to-l from-transparent to-yellow-500/80" />
        </div>
      </div>

      {hasDrafted ? (
        <div className="bg-gray-800/80 rounded-2xl border border-gray-700/50 p-4 mb-4">
          <h2 className="text-base font-black text-yellow-400 mb-3 flex items-center gap-2">
            <span className="text-xl">🎖️</span> ドラフト指名選手
            <span className="ml-auto text-sm font-bold text-gray-400">{draftedPlayers.length}名</span>
          </h2>
          <div className="space-y-2.5">
            {draftedPlayers.map((entry, idx) => {
              const style = ROUND_STYLES[entry.draftRound] || DEFAULT_ROUND_STYLE;
              const careerTitles = entry.player?.professionalCareer?.achievements || [];
              const currentSeasonTitles = (entry.seasonAwards || [])
                .filter(a => a.endsWith('1位'))
                .map(a => a.replace('1位', ''));
              const titleCounts = {};
              careerTitles.forEach(a => { titleCounts[a.title] = (titleCounts[a.title] || 0) + 1; });
              currentSeasonTitles.forEach(t => { titleCounts[t] = (titleCounts[t] || 0) + 1; });
              const allTitles = Object.entries(titleCounts);
              const filteredReasons = entry.reasons.filter(
                r => !/ミート|パワー|選球眼|走力|守備|肩力|盗塁|球速|制球|スタミナ|俊足/.test(r)
              );
              return (
                <div
                  key={idx}
                  className={`draft-card bg-gray-700/60 rounded-xl p-3.5 ${style.border} ${style.glow}`}
                  style={{ animationDelay: `${idx * 0.07}s` }}
                >
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className={`font-black text-sm px-2.5 py-1 rounded-lg shrink-0 ${style.badge}`}>
                      {entry.draftRound || '指名'}
                    </span>
                    <span className="text-yellow-300 font-bold text-base shrink-0">{entry.npbTeam}</span>
                    <span className="text-white font-black text-lg shrink-0">{entry.name}</span>
                    <span className="text-gray-400 text-sm shrink-0">{entry.age}歳</span>
                    <span className="text-blue-400 font-semibold text-sm shrink-0">
                      {POSITION_NAMES[entry.position] || entry.position}
                    </span>
                    {entry.player?.physical && entry.player?.batting && (
                      <span className="text-sm shrink-0">
                        <span className={entry.player.physical.throws === 'left' ? 'text-green-400 font-bold' : 'text-gray-400'}>
                          {entry.player.physical.throws === 'left' ? '左' : '右'}投
                        </span>
                        <span className={
                          entry.player.batting.bats === 'left' ? 'text-green-400 font-bold' :
                          entry.player.batting.bats === 'switch' ? 'text-purple-400 font-bold' :
                          'text-gray-400'
                        }>
                          {entry.player.batting.bats === 'left' ? '左' :
                           entry.player.batting.bats === 'switch' ? '両' : '右'}打
                        </span>
                      </span>
                    )}
                    <span className="text-xs text-gray-500 shrink-0">元 {entry.teamName}</span>
                    {allTitles.map(([title, count], i) => (
                      <span
                        key={i}
                        className="text-xs bg-yellow-600/30 text-yellow-300 px-2 py-0.5 rounded-full font-bold border border-yellow-600/40 shrink-0"
                      >
                        {title}{count > 1 ? `×${count}` : ''}
                      </span>
                    ))}
                  </div>
                  {filteredReasons.length > 0 && (
                    <div className="text-sm text-yellow-300/70 mt-2 pl-1 border-t border-gray-600/40 pt-1.5">
                      {filteredReasons.join('  /  ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-gray-500 text-sm mt-3">指名された選手はチームから離脱し、NPBへ移籍しました。</p>
        </div>
      ) : (
        <div className="bg-gray-800/80 rounded-2xl border border-gray-700/50 p-10 mb-4 text-center">
          <p className="text-2xl mb-1">😔</p>
          <p className="text-gray-200 font-bold text-lg mb-1">今シーズン、NPBからの指名はありませんでした</p>
          <p className="text-gray-500 text-sm">ドラフト指名条件に達した選手がいませんでした。</p>
        </div>
      )}

      {proBonus && proBonus.length > 0 && hasDrafted && (
        <div className="bg-gradient-to-r from-green-900/40 to-emerald-900/40 rounded-2xl p-4 mb-4 border border-green-600/30">
          <h2 className="text-base font-black text-green-400 mb-3 flex items-center gap-2">
            <span>📈</span> プロ輩出ボーナス
          </h2>
          <div className="space-y-2">
            {proBonus.map((bonus, idx) => (
              <div key={idx} className="bg-gray-700/40 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-bold text-base">{bonus.teamName}</span>
                  <span className="text-green-400 font-black text-base">+{bonus.reputationGain} 育成評判</span>
                </div>
                <div className="text-gray-400 text-sm flex gap-4 flex-wrap">
                  <span>プロ輩出 {bonus.draftCount}人</span>
                  <span>育成評判 {bonus.currentReputation}pt</span>
                  {bonus.boostedYoungPlayers > 0 && (
                    <span className="text-green-300 font-semibold">若手{bonus.boostedYoungPlayers}人が刺激を受けて成長！</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-gray-500 text-sm mt-2">育成評判が高いリーグには、次のトライアウトでより優秀な候補者が集まります。</p>
        </div>
      )}

      {nearMissPlayers && nearMissPlayers.length > 0 && (
        <div className="bg-gray-800/80 rounded-2xl border border-gray-700/50 p-4 mb-4">
          <h2 className="text-base font-black text-gray-300 mb-3 flex items-center gap-2">
            <span>📊</span> NPB候補に迫る選手
          </h2>
          <div className="space-y-1.5">
            {nearMissPlayers.slice(0, 10).map((entry, idx) => (
              <div key={idx} className="bg-gray-700/40 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-white font-bold text-base">{entry.name}</span>
                  <span className="text-gray-400 text-sm">{entry.age}歳</span>
                  <span className="text-blue-400 font-semibold text-sm">{POSITION_NAMES[entry.position] || entry.position}</span>
                  <span className="text-gray-400 text-sm">({entry.teamName})</span>
                </div>
                <div className="text-sm text-orange-300/80">{entry.reasons.join(' / ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center pt-2">
        <button
          onClick={onContinue}
          className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white px-12 py-3.5 rounded-xl font-black text-lg transition-all duration-200 shadow-lg hover:shadow-blue-500/30 hover:scale-105 active:scale-95"
        >
          次へ進む →
        </button>
      </div>
    </div>
  );
};

export default DraftResultScreen;
