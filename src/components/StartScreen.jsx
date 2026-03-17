import React, { useState } from 'react';

const PHASE_NAMES = {
  regular_season: 'レギュラーシーズン',
  playoff: 'プレーオフ',
  draft: 'ドラフト',
  offseason: 'オフシーズン',
  camp: 'キャンプ',
  tryout: 'トライアウト',
};

const StartScreen = ({ onNewGame, onContinue, onEdit, hasSaveData, saveSlots = [] }) => {
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
    const filledSlots = saveSlots.map((s, i) => s ? i : -1).filter(i => i >= 0);
    if (filledSlots.length === 0) {
      alert('セーブデータがありません。先にゲームを開始してセーブしてください。');
      return;
    }
    if (filledSlots.length === 1) {
      onEdit(filledSlots[0]);
      return;
    }
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
            <button
              onClick={() => setShowEditSlotSelect(false)}
              className="block w-80 px-6 py-2 rounded-lg text-gray-400 hover:text-white transition text-sm mt-2"
            >
              戻る
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-4">
            <button
              onClick={onNewGame}
              className="w-80 bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-lg font-bold text-2xl transition shadow-lg"
            >
              NEW GAME
            </button>

            <button
              onClick={handleContinue}
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
              onClick={handleEdit}
              disabled={!hasSaveData}
              className={`w-80 px-8 py-4 rounded-lg font-bold text-2xl transition shadow-lg ${
                hasSaveData
                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              EDIT
            </button>
          </div>
        )}

        <p className="text-sm text-gray-500 mt-8">{hasSaveData ? 'セーブデータあり' : ''}</p>
      </div>
    </div>
  );
};

export default StartScreen;
