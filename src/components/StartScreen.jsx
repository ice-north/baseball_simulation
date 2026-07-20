import React, { useState, useEffect } from 'react';
import { getEmergencyInfo, promoteEmergencyToSlot, clearEmergencySave } from '../game/saveSystem.js';
import { isTutorialEnabled, setTutorialEnabled, resetTutorialProgress } from '../game/tutorial.js';

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
  const [emergencyInfo, setEmergencyInfo] = useState(null);
  const [tutorialOn, setTutorialOn] = useState(isTutorialEnabled());

  // 前回クラッシュ時の緊急バックアップの有無をチェック
  useEffect(() => { setEmergencyInfo(getEmergencyInfo()); }, []);

  const handleRestoreEmergency = async (slotIndex) => {
    if (!window.confirm(`緊急バックアップをスロット${slotIndex + 1}へ復元してプレイします。よろしいですか？`)) return;
    const r = await promoteEmergencyToSlot(slotIndex);
    if (r.success) {
      clearEmergencySave();
      setEmergencyInfo(null);
      onContinue(slotIndex);
    }
  };

  const handleContinue = () => {
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
        <div className="mb-10">
          <h1 className="text-6xl font-bold text-white tracking-tight">NEXT STAGE</h1>
          <p className="text-gray-500 text-sm mt-2 tracking-widest uppercase">Baseball Simulation</p>
        </div>

        {/* 緊急バックアップ復旧（前回クラッシュ時に自動保存されたデータ） */}
        {emergencyInfo && !showSlotSelect && !showEditSlotSelect && (
          <div className="mb-8 mx-auto max-w-md p-4 rounded-lg border-2 border-amber-500/60 bg-amber-900/20 text-left">
            <div className="text-amber-300 font-bold mb-1">🛟 緊急バックアップが見つかりました</div>
            <p className="text-sm text-gray-300 mb-3">
              前回アプリが予期せず終了した際の進行データ（{emergencyInfo.year ? `${emergencyInfo.year}年目・` : ''}{emergencyInfo.gameMode || ''}）です。復元先スロットを選んでください。
            </p>
            <div className="flex gap-2 flex-wrap">
              {[0, 1, 2].map(i => (
                <button key={i} onClick={() => handleRestoreEmergency(i)}
                  className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold">
                  スロット{i + 1}へ復元
                </button>
              ))}
              <button onClick={() => { clearEmergencySave(); setEmergencyInfo(null); }}
                className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm">破棄</button>
            </div>
          </div>
        )}

        {showSlotSelect ? (
          <div className="flex flex-col items-center space-y-3">
            <p className="text-base text-gray-300 mb-4">セーブデータを選択</p>
            {saveSlots.map((slot, index) => (
              <button
                key={index}
                onClick={() => slot && onContinue(index)}
                disabled={!slot}
                className={`block w-80 px-6 py-3 rounded-lg font-bold text-lg transition shadow-lg ${
                  slot
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {slot ? (
                  <div>
                    <div>スロット {index + 1}</div>
                    <div className="text-sm font-normal text-blue-200">
                      Year {slot.year} - {slot.date.month}月{slot.date.day}日 ({PHASE_NAMES[slot.phase] || slot.phase})
                    </div>
                    <div className="text-xs font-normal text-gray-300">
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
              className="mt-4 text-gray-400 hover:text-gray-200 text-sm transition flex items-center gap-1"
            >
              ← 戻る
            </button>
          </div>
        ) : showEditSlotSelect ? (
          <div className="flex flex-col items-center space-y-3">
            <p className="text-base text-gray-300 mb-4">編集するセーブデータを選択</p>
            {saveSlots.map((slot, index) => (
              <button
                key={index}
                onClick={() => slot && onEdit(index)}
                disabled={!slot}
                className={`block w-80 px-6 py-3 rounded-lg font-bold text-lg transition shadow-lg ${
                  slot
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {slot ? (
                  <div>
                    <div>スロット {index + 1}</div>
                    <div className="text-sm font-normal text-purple-200">
                      Year {slot.year} - {slot.date.month}月{slot.date.day}日 ({PHASE_NAMES[slot.phase] || slot.phase})
                    </div>
                    <div className="text-xs font-normal text-gray-300">
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
              className="block w-80 px-6 py-3 rounded-lg font-bold text-lg transition shadow-lg bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              <div>社会人チーム設定</div>
              <div className="text-sm font-normal text-indigo-200">地域・強さ・種別・名前を編集（全セーブ共通）</div>
            </button>

            <button
              onClick={() => setShowEditSlotSelect(false)}
              className="mt-4 text-gray-400 hover:text-gray-200 text-sm transition flex items-center gap-1"
            >
              ← 戻る
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">

            {/* 主要アクション */}
            <button
              onClick={onNewGame}
              className="w-80 bg-green-600 hover:bg-green-500 active:scale-[0.98] text-white px-8 py-4 rounded-xl font-bold text-xl transition-all shadow-lg shadow-green-900/40"
            >
              NEW GAME
            </button>

            <button
              onClick={handleContinue}
              disabled={!hasSaveData}
              className={`w-80 px-8 py-4 rounded-xl font-bold text-xl transition-all shadow-lg active:scale-[0.98] ${
                hasSaveData
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/30'
                  : 'bg-gray-700/40 text-gray-500 cursor-not-allowed shadow-none'
              }`}
            >
              CONTINUE
            </button>

            {/* 区切り */}
            <div className="w-80 border-t border-gray-700/60 my-1"></div>

            {/* サブアクション */}
            <button
              onClick={onSandbox}
              className="w-80 bg-gray-700/80 hover:bg-gray-600/80 border border-gray-600/50 hover:border-amber-600/50 text-gray-200 hover:text-amber-300 px-8 py-3 rounded-xl font-semibold text-base transition-all active:scale-[0.98]"
            >
              SANDBOX
            </button>

            <button
              onClick={handleEdit}
              className="w-80 bg-gray-700/80 hover:bg-gray-600/80 border border-gray-600/50 hover:border-purple-600/50 text-gray-200 hover:text-purple-300 px-8 py-3 rounded-xl font-semibold text-base transition-all active:scale-[0.98]"
            >
              EDIT
            </button>

            <button
              onClick={onManual}
              className="w-80 text-gray-500 hover:text-gray-300 px-8 py-2 rounded-xl text-sm transition-all"
            >
              MANUAL
            </button>

            {/* チュートリアル(ヒント)表示のON/OFF */}
            <button
              onClick={() => { const next = !tutorialOn; setTutorialEnabled(next); setTutorialOn(next); if (next) resetTutorialProgress(); }}
              className="w-80 text-xs text-gray-500 hover:text-cyan-300 px-8 py-1.5 transition-all flex items-center justify-center gap-2"
              title="ゲーム中に操作ヒントを表示するかどうか"
            >
              <span>💡 チュートリアル（操作ヒント）</span>
              <span className={`font-bold px-2 py-0.5 rounded ${tutorialOn ? 'bg-cyan-700/60 text-cyan-200' : 'bg-gray-700 text-gray-400'}`}>
                {tutorialOn ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>
        )}

        {!hasSaveData && !showSlotSelect && !showEditSlotSelect && (
          <p className="text-xs text-gray-600 mt-8">SANDBOX: 成長・ドラフト・引退なし。自由にチームを編集してシーズンを戦うモード</p>
        )}
      </div>
    </div>
  );
};

export default StartScreen;
