import React, { useState, useEffect } from 'react';
import { getEmergencyInfo, promoteEmergencyToSlot, clearEmergencySave, getAutosaveInfo, isAutosaveEnabled, setAutosaveEnabled } from '../game/saveSystem.js';
import { isTutorialEnabled, setTutorialEnabled, resetTutorialProgress } from '../game/tutorial.js';
import { getUiScale, cycleUiScale, UI_SCALE_LABEL } from '../game/uiSettings.js';

const PHASE_NAMES = {
  regular_season: 'レギュラーシーズン',
  playoff: 'プレーオフ',
  draft: 'ドラフト',
  offseason: 'オフシーズン',
  camp: 'キャンプ',
  tryout: 'トライアウト',
};

const StartScreen = ({ onNewGame, onSandbox, onContinue, onEdit, onEditCorporateNames, onManual, onContinueAutosave, hasSaveData, saveSlots = [] }) => {
  const [showSlotSelect, setShowSlotSelect] = useState(false);
  const [showEditSlotSelect, setShowEditSlotSelect] = useState(false);
  const [emergencyInfo, setEmergencyInfo] = useState(null);
  const [autosaveInfo, setAutosaveInfo] = useState(null);
  const [tutorialOn, setTutorialOn] = useState(isTutorialEnabled());
  const [autosaveOn, setAutosaveOn] = useState(isAutosaveEnabled());
  const [uiScale, setUiScaleState] = useState(getUiScale());

  // 前回クラッシュ時の緊急バックアップ／オートセーブの有無をチェック
  useEffect(() => {
    setEmergencyInfo(getEmergencyInfo());
    getAutosaveInfo().then(setAutosaveInfo);
  }, []);

  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const handleRestoreEmergency = async (slotIndex) => {
    if (!window.confirm(`緊急バックアップをスロット${slotIndex + 1}へ復元してプレイします。よろしいですか？`)) return;
    const r = await promoteEmergencyToSlot(slotIndex);
    if (r.success) {
      clearEmergencySave();
      setEmergencyInfo(null);
      onContinue(slotIndex);
    }
  };

  const hasAutosave = !!(autosaveInfo && onContinueAutosave);
  const canContinue = hasSaveData || hasAutosave;

  const handleContinue = () => {
    const filledSlots = saveSlots.map((s, i) => s ? i : -1).filter(i => i >= 0);
    // オートセーブ選択肢が無く、スロットが1つだけなら直接その1件を続行
    if (filledSlots.length === 1 && !hasAutosave) {
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
          <p className="text-gray-400 text-sm mt-2 tracking-widest uppercase">Baseball Simulation</p>
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
                  className="btn-warn px-3 py-1.5 rounded text-sm">
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
                  'btn-primary'
                }`}
              >
                {slot ? (
                  <div>
                    <div>スロット {index + 1}</div>
                    <div className="text-sm font-normal opacity-80">
                      Year {slot.year} - {slot.date.month}月{slot.date.day}日{slot.teamName ? ` / ${slot.teamName}` : ''}
                    </div>
                    <div className="text-xs font-normal opacity-60">
                      {slot.timestamp ? new Date(slot.timestamp).toLocaleString('ja-JP') : ''}
                    </div>
                  </div>
                ) : (
                  <div>スロット {index + 1} - 空</div>
                )}
              </button>
            ))}

            {/* オートセーブから続ける（コンティニュー内に配置） */}
            {autosaveInfo && onContinueAutosave && (
              <>
                <div className="w-80 border-t border-gray-700/60 my-1"></div>
                <button
                  onClick={onContinueAutosave}
                  className="btn-primary w-80 px-6 py-3 rounded-lg font-semibold text-sm border transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  💾 オートセーブから続ける
                  <span className="text-xs font-normal opacity-70">
                    {autosaveInfo.year ? `${autosaveInfo.year}年目` : ''}{autosaveInfo.date ? ` ${autosaveInfo.date.month}月` : ''}{fmtDate(autosaveInfo.timestamp) ? `・${fmtDate(autosaveInfo.timestamp)}` : ''}
                  </span>
                </button>
              </>
            )}

            <button
              onClick={() => setShowSlotSelect(false)}
              className="mt-4 text-gray-300 hover:text-gray-200 text-sm transition flex items-center gap-1"
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
                  'btn-primary'
                }`}
              >
                {slot ? (
                  <div>
                    <div>スロット {index + 1}</div>
                    <div className="text-sm font-normal opacity-80">
                      Year {slot.year} - {slot.date.month}月{slot.date.day}日{slot.teamName ? ` / ${slot.teamName}` : ''}
                    </div>
                    <div className="text-xs font-normal opacity-60">
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
              className="btn-secondary block w-80 px-6 py-3 rounded-lg text-lg transition shadow-lg"
            >
              <div>社会人チーム設定</div>
              <div className="text-sm font-normal text-indigo-200">地域・強さ・種別・名前を編集（全セーブ共通）</div>
            </button>

            <button
              onClick={() => setShowEditSlotSelect(false)}
              className="mt-4 text-gray-300 hover:text-gray-200 text-sm transition flex items-center gap-1"
            >
              ← 戻る
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">

            {/* 主要アクション */}
            <button
              onClick={onNewGame}
              className="btn-primary w-80 active:scale-[0.98] px-8 py-4 rounded-xl text-xl transition-all shadow-lg"
            >
              NEW GAME
            </button>

            <button
              onClick={handleContinue}
              disabled={!canContinue}
              className={`w-80 px-8 py-4 rounded-xl font-bold text-xl transition-all shadow-lg active:scale-[0.98] ${
                'btn-primary shadow-none'
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
              className="w-80 text-gray-400 hover:text-gray-300 px-8 py-2 rounded-xl text-sm transition-all"
            >
              MANUAL
            </button>

            {/* チュートリアル(ヒント)表示のON/OFF */}
            <button
              onClick={() => { const next = !tutorialOn; setTutorialEnabled(next); setTutorialOn(next); if (next) resetTutorialProgress(); }}
              className="w-80 text-xs text-gray-400 hover:text-cyan-300 px-8 py-1.5 transition-all flex items-center justify-center gap-2"
              title="ゲーム中に操作ヒントを表示するかどうか"
            >
              <span>💡 チュートリアル（操作ヒント）</span>
              <span className={`font-bold px-2 py-0.5 rounded ${tutorialOn ? 'seg-on' : 'seg'}`}>
                {tutorialOn ? 'ON' : 'OFF'}
              </span>
            </button>

            {/* オートセーブのON/OFF */}
            <button
              onClick={() => { const next = !autosaveOn; setAutosaveEnabled(next); setAutosaveOn(next); }}
              className="w-80 text-xs text-gray-400 hover:text-cyan-300 px-8 py-1.5 transition-all flex items-center justify-center gap-2"
              title="月替わり・年替わりの節目で自動保存します"
            >
              <span>💾 オートセーブ</span>
              <span className={`font-bold px-2 py-0.5 rounded ${autosaveOn ? 'seg-on' : 'seg'}`}>
                {autosaveOn ? 'ON' : 'OFF'}
              </span>
            </button>

            {/* 画面スケール（小さい画面で1画面に収める） */}
            <button
              onClick={() => setUiScaleState(cycleUiScale())}
              className="w-80 text-xs text-gray-400 hover:text-cyan-300 px-8 py-1.5 transition-all flex items-center justify-center gap-2"
              title="画面が横にはみ出す場合は「自動」または縮小を選ぶと1画面に収まります"
            >
              <span>🖥 画面スケール</span>
              <span className="font-bold px-2 py-0.5 rounded bg-cyan-700/60 text-cyan-200">
                {UI_SCALE_LABEL[uiScale] || uiScale}
              </span>
            </button>
          </div>
        )}

        {!hasSaveData && !showSlotSelect && !showEditSlotSelect && (
          <p className="text-xs text-gray-400 mt-8">SANDBOX: 成長・ドラフト・引退なし。自由にチームを編集してシーズンを戦うモード</p>
        )}
      </div>
    </div>
  );
};

export default StartScreen;
