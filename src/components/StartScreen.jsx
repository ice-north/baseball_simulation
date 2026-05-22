import React, { useState } from 'react';

const PHASE_NAMES = {
  regular_season: 'レギュラーシーズン',
  playoff: 'プレーオフ',
  draft: 'ドラフト',
  offseason: 'オフシーズン',
  camp: 'キャンプ',
  tryout: 'トライアウト',
};

const StartScreen = ({ onNewGame, onSandbox, onContinue, onEdit, onEditCorporateNames, onManual, hasSaveData, saveSlots = [] }) => {
  const [showSlotSelect, setShowSlotSelect] = useState(false);
  const [showEditSlotSelect, setShowEditSlotSelect] = useState(false);

  const handleContinue = () => {
    // セーブが1つだけならそのまま読み込み
    const filledSlots = saveSlots.map((s, i) => s ? i : -1).filter(i => i >= 0);
    if (filledSlots.length === 1) {
      onContinue(filledSlots[0]);
      return;
    }
    setShowSlotSelect(true);
  };

  const handleEdit = () => {
    setShowEditSlotSelect(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-white mb-1">⚾ NEXT STAGE</h1>
        <p className="text-2xl text-gray-300 mb-10">～独立リーグシミュレーター～</p>

        {showSlotSelect ? (
          <div className="flex flex-col items-center space-y-3">
            <p className="text-lg text-gray-300 mb-4">セーブデータを選択</p>
            {saveSlots.map((slot, index) => (
              <button
                key={index}
                onClick={() => slot && onContinue(index)}
                disabled={!slot}
                className={`block w-80 px-6 py-3 rounded-lg font-bold text-lg transition shadow-lg ${
                  slot
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {slot ? (
                  <div>
                    <div>スロット {index + 1}</div>
                    <div className="text-sm font-normal text-blue-200">
                      Year {slot.year} - {slot.date.month}月{slot.date.day}日 ({PHASE_NAMES[slot.phase] || slot.phase})
                    </div>
                    <div className="text-xs font-normal text-gray-400">
                      {slot.timestamp ? new Date(slot.timestamp).toLocaleString('ja-JP') : ''}
                    </div>
                  </div>
                ) : (
                  <div>スロット {index + 1} - 空</div>
                )}
              </button>
            ))}
            <button
              onClick={() => setShowSlotSelect(false)}
              className="block w-80 px-6 py-2 rounded-lg text-gray-400 hover:text-white transition text-sm mt-2"
            >
              戻る
            </button>
          </div>
        ) : showEditSlotSelect ? (
          <div className="flex flex-col items-center space-y-3">
            <p className="text-lg text-gray-300 mb-4">編集するセーブデータを選択</p>
            {saveSlots.map((slot, index) => (
              <button
                key={index}
                onClick={() => slot && onEdit(index)}
                disabled={!slot}
                className={`block w-80 px-6 py-3 rounded-lg font-bold text-lg transition shadow-lg ${
                  slot
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {slot ? (
                  <div>
                    <div>スロット {index + 1}</div>
                    <div className="text-sm font-normal text-purple-200">
                      Year {slot.year} - {slot.date.month}月{slot.date.day}日 ({PHASE_NAMES[slot.phase] || slot.phase})
                    </div>
                    <div className="text-xs font-normal text-gray-400">
                      {slot.timestamp ? new Date(slot.timestamp).toLocaleString('ja-JP') : ''}
                    </div>
                  </div>
                ) : (
                  <div>スロット {index + 1} - 空</div>
                )}
              </button>
            ))}

            <div className="border-t border-gray-700 w-80 my-2"></div>

            <button
              onClick={onEditCorporateNames}
              className="block w-80 px-6 py-3 rounded-lg font-bold text-lg transition shadow-lg bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <div>社会人チーム名設定</div>
              <div className="text-sm font-normal text-indigo-200">セーブ不要・全データ共通</div>
            </button>

            <button
              onClick={() => setShowEditSlotSelect(false)}
              className="block w-80 px-6 py-2 rounded-lg text-gray-400 hover:text-white transition text-sm mt-2"
            >
              戻る
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-3">
            <button
              onClick={onNewGame}
              className="group w-80 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-8 py-4 rounded-xl font-bold text-2xl transition-all shadow-lg shadow-green-900/30 active:scale-[0.98] flex items-center justify-center gap-3"
            >
              <span className="text-3xl group-hover:scale-110 transition-transform">🎮</span>
              NEW GAME
            </button>

            <button
              onClick={onSandbox}
              className="group w-80 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white px-8 py-4 rounded-xl font-bold text-2xl transition-all shadow-lg shadow-orange-900/30 active:scale-[0.98] flex items-center justify-center gap-3"
            >
              <span className="text-3xl group-hover:scale-110 transition-transform">🏗</span>
              SANDBOX
            </button>

            <button
              onClick={handleContinue}
              disabled={!hasSaveData}
              className={`group w-80 px-8 py-4 rounded-xl font-bold text-2xl transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-3 ${
                hasSaveData
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-900/30'
                  : 'bg-gray-700/50 text-gray-500 cursor-not-allowed shadow-none'
              }`}
            >
              <span className="text-3xl group-hover:scale-110 transition-transform">📂</span>
              CONTINUE
            </button>

            <button
              onClick={handleEdit}
              className={`group w-80 px-8 py-4 rounded-xl font-bold text-2xl transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-3 ${
                'bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white shadow-purple-900/30'
              }`}
            >
              <span className="text-3xl group-hover:scale-110 transition-transform">✏️</span>
              EDIT
            </button>

            <button
              onClick={onManual}
              className="group w-80 bg-gray-700/80 hover:bg-gray-600 text-gray-300 hover:text-white px-8 py-3 rounded-xl font-bold text-lg transition-all border border-gray-600/50 hover:border-gray-500 active:scale-[0.98] flex items-center justify-center gap-3"
            >
              <span className="text-2xl">📖</span>
              MANUAL
            </button>
          </div>
        )}

        <div className="text-xs text-gray-500 mt-8 space-y-0.5">
          <p>{hasSaveData ? 'セーブデータあり' : ''}</p>
          <p className="text-gray-400">SANDBOX: 成長・ドラフト・引退なし。自由にチームを編集してシーズンを戦うモード</p>
        </div>
      </div>
    </div>
  );
};

export default StartScreen;
