import React from 'react';
import { POSITION_NAMES } from '../utils/constants.js';

const DraftResultScreen = ({ draftedPlayers, nearMissPlayers, proBonus, onContinue }) => {
  const hasDrafted = draftedPlayers && draftedPlayers.length > 0;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-white mb-3 text-center">NPBドラフト結果</h1>

      {hasDrafted ? (
        <div className="bg-gray-800 rounded-lg p-4 mb-3">
          <h2 className="text-sm font-bold text-yellow-400 mb-2">ドラフト指名選手</h2>
          <div className="space-y-1.5">
            {draftedPlayers.map((entry, idx) => (
              <div key={idx} className="bg-gray-700/60 rounded-lg p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-yellow-400 font-bold text-sm">{entry.npbTeam}</span>
                  <div>
                    <span className="text-white font-bold text-sm">{entry.name}</span>
                    <span className="text-gray-500 text-xs ml-1.5">{entry.age}歳</span>
                    <span className="text-blue-400 text-xs ml-1.5">{POSITION_NAMES[entry.position] || entry.position}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">元 {entry.teamName}</div>
                  <div className="text-[10px] text-yellow-300/70">{entry.reasons.join(' / ')}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-gray-500 text-[10px] mt-2">
            指名された選手はチームから離脱し、NPBへ移籍しました。
          </p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg p-6 mb-3 text-center">
          <p className="text-gray-300 font-bold mb-1">今シーズン、プロ野球からの指名はありませんでした</p>
          <p className="text-gray-500 text-xs">NPBドラフト指名条件に達した選手がいませんでした。</p>
        </div>
      )}

      {proBonus && proBonus.length > 0 && hasDrafted && (
        <div className="bg-gradient-to-r from-green-900/40 to-emerald-900/40 rounded-lg p-4 mb-3 border border-green-700/30">
          <h2 className="text-sm font-bold text-green-400 mb-2">プロ輩出ボーナス</h2>
          <div className="space-y-1.5">
            {proBonus.map((bonus, idx) => (
              <div key={idx} className="bg-gray-700/40 rounded p-2.5 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-bold">{bonus.teamName}</span>
                  <span className="text-green-400 font-bold">+{bonus.reputationGain} 育成評判</span>
                </div>
                <div className="text-gray-400 space-x-3">
                  <span>プロ輩出: {bonus.draftCount}人</span>
                  <span>育成評判: {bonus.currentReputation}pt</span>
                  {bonus.boostedYoungPlayers > 0 && (
                    <span className="text-green-300">若手{bonus.boostedYoungPlayers}人が刺激を受けて成長!</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-gray-500 text-[10px] mt-2">
            育成評判が高いリーグには、次のトライアウトでより優秀な候補者が集まります。
          </p>
        </div>
      )}

      {nearMissPlayers && nearMissPlayers.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4 mb-3">
          <h2 className="text-sm font-bold text-gray-300 mb-2">NPB候補に迫る選手</h2>
          <div className="space-y-1">
            {nearMissPlayers.slice(0, 10).map((entry, idx) => (
              <div key={idx} className="bg-gray-700/40 rounded p-2 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold">{entry.name}</span>
                  <span className="text-gray-500">{entry.age}歳</span>
                  <span className="text-blue-400">{POSITION_NAMES[entry.position] || entry.position}</span>
                  <span className="text-gray-600">({entry.teamName})</span>
                </div>
                <div className="text-[10px] text-orange-300/70">{entry.reasons.join(' / ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center">
        <button
          onClick={onContinue}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-lg font-bold text-sm transition shadow"
        >
          次へ進む →
        </button>
      </div>
    </div>
  );
};

export default DraftResultScreen;
