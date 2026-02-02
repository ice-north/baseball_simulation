import React from 'react';

const StartScreen = ({ onNewGame, onContinue, onEdit, hasSaveData }) => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-white mb-1">⚾ NEXT STAGE</h1>
        <p className="text-2xl text-gray-300 mb-10">～独立リーグシミュレーター～</p>

        <div className="space-y-4">
          <button
            onClick={onNewGame}
            className="w-80 bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-lg font-bold text-2xl transition shadow-lg"
          >
            NEW GAME
          </button>

          <button
            onClick={onContinue}
            disabled={!hasSaveData}
            className={`w-80 px-8 py-4 rounded-lg font-bold text-2xl transition shadow-lg ${
              hasSaveData
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            CONTINUE
          </button>

          <button
            onClick={onEdit}
            disabled
            className="w-80 bg-gray-600 text-gray-400 px-8 py-4 rounded-lg font-bold text-2xl cursor-not-allowed shadow-lg"
          >
            EDIT
          </button>
        </div>

        <p className="text-sm text-gray-500 mt-8">{hasSaveData ? 'セーブデータあり' : ''} | EDITは開発中です</p>
      </div>
    </div>
  );
};

export default StartScreen;
