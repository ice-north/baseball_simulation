import React from 'react';
import { POSITION_NAMES } from '../utils/constants.js';

const DraftResultScreen = ({ draftedPlayers, nearMissPlayers, onContinue }) => {
  const hasDrafted = draftedPlayers && draftedPlayers.length > 0;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-white mb-6 text-center">NPBドラフト結果</h1>

      {hasDrafted ? (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-yellow-400 mb-4">🎉 NPBドラフト指名選手</h2>
          <div className="space-y-3">
            {draftedPlayers.map((entry, idx) => (
              <div key={idx} className="bg-gray-700 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-yellow-400 font-bold text-lg">{entry.npbTeam}</span>
                  <div>
                    <span className="text-white font-bold text-lg">{entry.name}</span>
                    <span className="text-gray-400 ml-2">{entry.age}歳</span>
                    <span className="text-blue-400 ml-2">{POSITION_NAMES[entry.position] || entry.position}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">元 {entry.teamName}</div>
                  <div className="text-xs text-yellow-300">{entry.reasons.join(' / ')}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-gray-400 text-sm mt-4">
            ※ 指名された選手はチームから離脱し、NPBへ移籍しました。
          </p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg p-8 mb-6 text-center">
          <div className="text-6xl mb-4">📋</div>
          <p className="text-xl text-gray-300 font-bold mb-2">
            今シーズン、プロ野球からの指名はありませんでした
          </p>
          <p className="text-gray-500 text-sm">
            NPBドラフト指名条件に達した選手がいませんでした。
          </p>
        </div>
      )}

      {/* 惜しかった選手 */}
      {nearMissPlayers && nearMissPlayers.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-300 mb-3">📊 NPBドラフト候補に迫る選手</h2>
          <div className="space-y-2">
            {nearMissPlayers.slice(0, 10).map((entry, idx) => (
              <div key={idx} className="bg-gray-700 rounded p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-white font-bold">{entry.name}</span>
                  <span className="text-gray-400 text-sm">{entry.age}歳</span>
                  <span className="text-blue-400 text-sm">{POSITION_NAMES[entry.position] || entry.position}</span>
                  <span className="text-gray-500 text-sm">({entry.teamName})</span>
                </div>
                <div className="text-xs text-orange-300">
                  {entry.reasons.join(' / ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center">
        <button
          onClick={onContinue}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-bold text-lg transition"
        >
          次へ進む →
        </button>
      </div>
    </div>
  );
};

export default DraftResultScreen;
