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

  // セーブスロット1件ぶんの行。コンティニュー／エディットで共有する
  const SlotRow = ({ slot, index, onPick }) => (
    <button
      key={index}
      onClick={() => slot && onPick(index)}
      disabled={!slot}
      className={`w-full text-left px-4 py-2.5 rounded-lg border transition ${
        slot ? 'bg-surface-2 border-gray-700 hover:border-[var(--accent)] hover:bg-gray-700/60'
             : 'bg-transparent border-gray-800 cursor-not-allowed'}`}
    >
      <div className="flex items-baseline gap-2">
        <span className={`text-sm font-bold ${slot ? 'text-white' : 'text-gray-400'}`}>スロット {index + 1}</span>
        {slot
          ? <span className="text-xs text-gray-300 tabular-nums truncate">
              {slot.year}年目 {slot.date.month}/{slot.date.day}{slot.teamName ? ` · ${slot.teamName}` : ''}
            </span>
          : <span className="text-xs text-gray-400">空</span>}
        {slot?.timestamp && (
          <span className="ml-auto text-xs text-gray-400 tabular-nums shrink-0">
            {new Date(slot.timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </button>
  );

  // メニューを載せるカード。本編のカード（surface-2 + gray-700）と同じ見た目にする
  const MenuCard = ({ title, children }) => (
    <div className="w-full max-w-sm rounded-2xl border border-gray-700/60 bg-surface-2/70 backdrop-blur p-5 shadow-2xl">
      {title && <p className="text-xs text-gray-300 mb-3">{title}</p>}
      {children}
    </div>
  );

  return (
    // ⚠ 地色は本編と同じ `surface-0`。アクセントのにじみだけで奥行きを出す
    //    （以前は `from-gray-900 to-gray-800` の灰色グラデで、本編の紺と繋がっていなかった）。
    <div className="min-h-screen bg-surface-0 relative overflow-hidden flex items-center justify-center py-6">
      {/* 背景: アクセントのにじみ。画像を持たずにタイトルらしさを出す */}
      <div aria-hidden className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(46% 40% at 50% 34%, rgba(34,211,238,0.10) 0%, rgba(34,211,238,0) 72%)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)]/40 to-transparent" />

      <div className="relative w-full max-w-md px-6 flex flex-col items-center">
        {/* タイトル */}
        <h1 className="text-5xl font-bold text-white tracking-tight leading-none">NEXT STAGE</h1>
        <div className="mt-2.5 mb-5 flex items-center gap-3">
          <span className="h-px w-10 bg-[var(--accent)]" />
          <p className="text-xs text-gray-300 tracking-[0.25em] uppercase">Baseball Simulation</p>
          <span className="h-px w-10 bg-[var(--accent)]" />
        </div>

        {/* 緊急バックアップ復旧（前回クラッシュ時に自動保存されたデータ） */}
        {emergencyInfo && !showSlotSelect && !showEditSlotSelect && (
          <div className="w-full max-w-sm mb-4 p-3 rounded-xl border border-amber-600/60 bg-amber-900/20 text-left">
            <div className="text-amber-300 font-bold text-sm mb-1">緊急バックアップが見つかりました</div>
            <p className="text-xs text-gray-300 mb-2">
              前回アプリが予期せず終了した際の進行データ（{emergencyInfo.year ? `${emergencyInfo.year}年目・` : ''}{emergencyInfo.gameMode || ''}）です。復元先を選んでください。
            </p>
            <div className="flex gap-2 flex-wrap">
              {[0, 1, 2].map(i => (
                <button key={i} onClick={() => handleRestoreEmergency(i)} className="btn-warn px-3 py-1.5 rounded text-xs">
                  スロット{i + 1}へ復元
                </button>
              ))}
              <button onClick={() => { clearEmergencySave(); setEmergencyInfo(null); }}
                className="btn-secondary px-3 py-1.5 rounded text-xs">破棄</button>
            </div>
          </div>
        )}

        {/* メニュー */}
        {showSlotSelect ? (
          <MenuCard title="つづきから">
            <div className="space-y-2">
              {saveSlots.map((slot, index) => <SlotRow key={index} slot={slot} index={index} onPick={onContinue} />)}
            </div>
            {autosaveInfo && onContinueAutosave && (
              <>
                <div className="border-t border-gray-700/60 my-3" />
                <button onClick={onContinueAutosave}
                  className="btn-primary w-full px-4 py-2.5 rounded-lg text-sm transition active:scale-[0.99]">
                  オートセーブから続ける
                  <span className="ml-2 text-xs font-normal opacity-70 tabular-nums">
                    {autosaveInfo.year ? `${autosaveInfo.year}年目` : ''}{autosaveInfo.date ? ` ${autosaveInfo.date.month}月` : ''}{fmtDate(autosaveInfo.timestamp) ? `・${fmtDate(autosaveInfo.timestamp)}` : ''}
                  </span>
                </button>
              </>
            )}
            <button onClick={() => setShowSlotSelect(false)}
              className="mt-3 w-full text-xs text-gray-300 hover:text-white py-1.5 transition">← 戻る</button>
          </MenuCard>
        ) : showEditSlotSelect ? (
          <MenuCard title="編集するデータ">
            <div className="space-y-2">
              {saveSlots.map((slot, index) => <SlotRow key={index} slot={slot} index={index} onPick={onEdit} />)}
            </div>
            <div className="border-t border-gray-700/60 my-3" />
            <button onClick={onEditCorporateNames}
              className="btn-secondary w-full px-4 py-2.5 rounded-lg text-sm text-left transition">
              社会人チーム設定
              <span className="block text-xs font-normal opacity-70 mt-0.5">地域・強さ・種別・名前を編集（全セーブ共通）</span>
            </button>
            <button onClick={() => setShowEditSlotSelect(false)}
              className="mt-3 w-full text-xs text-gray-300 hover:text-white py-1.5 transition">← 戻る</button>
          </MenuCard>
        ) : (
          <MenuCard>
            {/* ⚠ `.btn-primary` は「次に押すもの」1つだけ。セーブがあれば
                つづきから、無ければ はじめから が次の一手になる */}
            <div className="space-y-2">
              <button
                onClick={handleContinue}
                disabled={!canContinue}
                className={`${canContinue ? 'btn-primary' : 'btn-secondary'} w-full px-6 py-3 rounded-xl text-base transition active:scale-[0.99]`}
              >
                つづきから
              </button>
              <button
                onClick={onNewGame}
                className={`${canContinue ? 'btn-secondary' : 'btn-primary'} w-full px-6 py-3 rounded-xl text-base transition active:scale-[0.99]`}
              >
                はじめから
              </button>
            </div>

            <div className="border-t border-gray-700/60 my-3" />

            <div className="grid grid-cols-2 gap-2">
              <button onClick={onSandbox} className="btn-secondary px-4 py-2 rounded-lg text-sm transition">箱庭モード</button>
              <button onClick={handleEdit} className="btn-secondary px-4 py-2 rounded-lg text-sm transition">エディット</button>
            </div>
            <button onClick={onManual}
              className="mt-2 w-full text-sm text-gray-300 hover:text-white py-1.5 rounded-lg hover:bg-gray-700/40 transition">
              マニュアル
            </button>

            <div className="border-t border-gray-700/60 my-3" />

            {/* 設定は主要アクションと同じ格にしない。1行に畳んで下に置く */}
            <div className="space-y-0.5">
              {[
                { label: 'チュートリアル', value: tutorialOn ? 'ON' : 'OFF', on: tutorialOn,
                  onClick: () => { const n = !tutorialOn; setTutorialEnabled(n); setTutorialOn(n); if (n) resetTutorialProgress(); },
                  title: 'ゲーム中に操作ヒントを表示するかどうか' },
                { label: 'オートセーブ', value: autosaveOn ? 'ON' : 'OFF', on: autosaveOn,
                  onClick: () => { const n = !autosaveOn; setAutosaveEnabled(n); setAutosaveOn(n); },
                  title: '月替わり・年替わりの節目で自動保存します' },
                { label: '画面スケール', value: UI_SCALE_LABEL[uiScale] || uiScale, on: true,
                  onClick: () => setUiScaleState(cycleUiScale()),
                  title: '画面が横にはみ出す場合は「自動」または縮小を選ぶと1画面に収まります' },
              ].map(o => (
                <button key={o.label} onClick={o.onClick} title={o.title}
                  className="w-full flex items-center justify-between text-xs text-gray-300 hover:text-white px-1 py-0.5 transition">
                  <span>{o.label}</span>
                  <span className={`font-bold px-2 py-0.5 rounded ${o.on ? 'seg-on' : 'seg'}`}>{o.value}</span>
                </button>
              ))}
            </div>
          </MenuCard>
        )}

        {/* 世界の規模。装飾ではなく中身を出す＝本編と同じ「密度のある数字」の語彙 */}
        {!showSlotSelect && !showEditSlotSelect && (
          <div className="mt-5 text-center">
            <div className="flex items-baseline justify-center gap-x-5 gap-y-1 flex-wrap">
              {[['996', '高校'], ['234', '大学'], ['300', '社会人'], ['26', '独立']].map(([n, l]) => (
                <div key={l} className="flex items-baseline gap-1.5">
                  <span className="text-base font-bold text-accent tabular-nums leading-none">{n}</span>
                  <span className="text-xs text-gray-300">{l}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StartScreen;
