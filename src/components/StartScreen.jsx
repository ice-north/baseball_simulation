import React, { useState, useEffect } from 'react';
import { getEmergencyInfo, promoteEmergencyToSlot, clearEmergencySave, getAutosaveInfo, isAutosaveEnabled, setAutosaveEnabled } from '../game/saveSystem.js';
import { isTutorialEnabled, setTutorialEnabled, resetTutorialProgress } from '../game/tutorial.js';
import { getUiScale, cycleUiScale, UI_SCALE_LABEL } from '../game/uiSettings.js';

/**
 * タイトル画面の球場パレット。
 * ⚠ ここは**タイトル画面専用**。本編のUIは surface-*／accent の語彙で、
 *   試合画面は電光掲示板（オレンジのLED）の語彙。混ぜないこと。
 */
const FIELD = {
  night:  '#141b24',   // ナイターの空・スタンドの影
  turfHi: '#2c4a33',   // 芝（手前）
  turfLo: '#1d3324',   // 芝（奥）
  dirtHi: '#7a5540',   // 内野の土（手前）
  dirtLo: '#5b3f2f',   // 内野の土（奥）
  chalk:  '#f2f0e8',   // 白線・チョーク
  ball:   '#22c55e',   // 本編と同じ意味色: 緑=ボール
  strike: '#facc15',   // 黄=ストライク
  out:    '#ef4444',   // 赤=アウト
};

/**
 * 捕手の後ろから内野を見た画。画像を持たずSVGだけで描く。
 * ⚠ **下端を基準に置くこと**（`xMidYMax slice`）。`xMidYMid` だと縦の短い画面で
 *   ホームベースと打席が下に切れ、土だけが残って「茶色いドーム」に見える。
 * ⚠ **土の扇は大きくしすぎない**。半径を上げると画面の主役が土になり、
 *   メニューが読みにくくなる。あくまで下3分の1に収める。
 */
const FieldBackdrop = () => (
  // ⚠ **viewBox の下端(700)は絵の下端(800)より上**。ベースを描かなくなったので、
  //    ファウルラインの**合流点が画面に写ると「線が1点で終わっている」不自然さ**が出る。
  //    座標はそのままに viewBox で下を切り落とし、合流点を画面外へ逃がしてある。
  //    ⚠ 高さを 800 に戻すと合流点が戻ってくる。
  <svg aria-hidden viewBox="0 0 1600 700" preserveAspectRatio="xMidYMax slice"
       className="pointer-events-none absolute inset-0 w-full h-full">
    <defs>
      <linearGradient id="ns-turf" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={FIELD.turfLo} /><stop offset="100%" stopColor={FIELD.turfHi} />
      </linearGradient>
      <linearGradient id="ns-dirt" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={FIELD.dirtLo} /><stop offset="100%" stopColor={FIELD.dirtHi} />
      </linearGradient>
      {/* 空から芝への継ぎ目を溶かす（硬い水平線だと「帯」に見える） */}
      <linearGradient id="ns-haze" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={FIELD.night} stopOpacity="1" />
        <stop offset="100%" stopColor={FIELD.night} stopOpacity="0" />
      </linearGradient>
      {/* メニューの背後を落として文字を読ませる。球場の絵より可読性が優先 */}
      <radialGradient id="ns-scrim" cx="50%" cy="40%" r="56%">
        <stop offset="0%" stopColor={FIELD.night} stopOpacity="0.90" />
        <stop offset="65%" stopColor={FIELD.night} stopOpacity="0.55" />
        <stop offset="100%" stopColor={FIELD.night} stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* 芝 */}
    <path d="M0,360 H1600 V800 H0 Z" fill="url(#ns-turf)" />
    {/* 内野の土。⚠ **半円にしないこと**——真ん中が盛り上がって「茶色いドーム」に見える。
        実際の内野はホームから外へ広がる楔なので、**ファウルラインで挟んだ形**にする。 */}
    {/* ホーム周りの土（実際の球場にある円）。これが無いと楔の先端が尖って矢印に見える */}
    <ellipse cx="800" cy="770" rx="240" ry="118" fill={FIELD.dirtHi} fillOpacity="0.92" />
    <path d="M800,800 L332,474 Q800,398 1268,474 Z" fill="url(#ns-dirt)" />
    <path d="M332,474 Q800,398 1268,474"
          fill="none" stroke={FIELD.chalk} strokeOpacity="0.16" strokeWidth="3" />
    {/* 投手板。楔の中心に置くと一気に「球場」に見える */}
    <ellipse cx="800" cy="596" rx="62" ry="20" fill={FIELD.dirtHi} fillOpacity="0.75" />
    <rect x="782" y="590" width="36" height="6" rx="2" fill={FIELD.chalk} fillOpacity="0.55" />
    {/* ファウルライン。⚠ **ホームベースと打席は描かない**——手前に来るものほど
        遠近の圧縮が強く、線・ベース・打席の3つを1枚の絵で辻褄を合わせられなかった
        （打席をラインの外へ出すと今度はベースから離れて浮く）。
        球場に見せているのは**土の楔と白線と投手板**で、そこは成立している。
        手前の小物は無い方が絵が締まるので、描かないことにした。 */}
    <g stroke={FIELD.chalk} strokeOpacity="0.45" strokeWidth="4" fill="none" strokeLinecap="round">
      <path d="M800,806 L140,372" />
      <path d="M800,806 L1460,372" />
    </g>

    <rect y="300" width="1600" height="120" fill="url(#ns-haze)" />
    <rect width="1600" height="800" fill="url(#ns-scrim)" />
  </svg>
);

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
      {/* ⚠ **1行に収めること**。各要素に `whitespace-nowrap shrink-0` を付けないと、
          長いチーム名（「埼玉武蔵ヒートベアーズ」等）に押されて「スロット」と「1」の
          間で折り返し、行が2段になる。**伸縮していいのはチーム名だけ**。 */}
      <div className="flex items-baseline gap-2">
        <span className={`text-base font-bold whitespace-nowrap shrink-0 ${slot ? 'text-white' : 'text-gray-400'}`}>
          スロット{index + 1}
        </span>
        {slot ? (
          <>
            <span className="text-xs text-gray-300 tabular-nums whitespace-nowrap shrink-0">
              {slot.year}年目 {slot.date.month}/{slot.date.day}
            </span>
            {slot.teamName && (
              <span className="text-xs text-gray-100 truncate min-w-0 flex-1">{slot.teamName}</span>
            )}
            {slot.timestamp && (
              <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap shrink-0 ml-auto">
                {new Date(slot.timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-gray-400">空</span>
        )}
      </div>
    </button>
  );

  // メニューを載せるカード。本編のカード（surface-2 + gray-700）と同じ見た目にする
  const MenuCard = ({ title, children }) => (
    <div className="w-full max-w-xl rounded-2xl border border-gray-700/60 bg-surface-2/70 backdrop-blur p-7 shadow-2xl">
      {title && <p className="text-sm text-gray-300 mb-3">{title}</p>}
      {children}
    </div>
  );

  return (
    // ⚠ **タイトル画面の地は「球場」**。捕手の後ろから内野を見た画を土色と白線で描く。
    //    以前は `radial-gradient` のアクセントのにじみ＋大文字字間空けのサブタイトルという、
    //    **題材と無関係な定番の意匠**だった（洗練はされているが野球に見えない）。
    //    ⚠ **電光掲示板の語彙（オレンジのLED・グロー）は持ち込まないこと**。
    //    あれは「現地で試合を見ている」ための演出で、試合画面だけのもの。
    // ⚠ **中央に据える**。以前は「メニューがホームベースの真上に重なる」ので
    //    上寄せにしていたが、**そのベースと打席はもう描いていない**（遠近が
    //    合わなかったため撤去）。隠れて困るものが無くなったので前提が消えている。
    // data-fit-height: 1画面に収める設計の画面という印。縦が足りない端末
    // （1366×640 / 1280×600）では App.jsx の自動フィットが縮めて収める。
    // ⚠ これが無いと 640 で44px・600 で84px はみ出す。
    <div data-fit-height className="min-h-screen relative overflow-hidden flex items-center justify-center py-8"
         style={{ backgroundColor: FIELD.night }}>
      <FieldBackdrop />

      <div className="relative w-full max-w-xl px-6 flex flex-col items-center">
        {/* タイトル。白線と同じチョーク色で、球場に引かれたラインの延長に見せる */}
        <h1 className="text-7xl font-black tracking-tight leading-none"
            style={{ color: FIELD.chalk, textShadow: '0 2px 18px rgba(0,0,0,0.55)' }}>
          NEXT STAGE
        </h1>
        {/* ⚠ 罫線で挟んだ大文字サブタイトルは定番手なのでやめた。
            代わりに**カウントのランプ**（緑=ボール / 黄=ストライク / 赤=アウト）を置く。
            本編の意味色そのままなので、この作品の語彙で「野球」と言える。 */}
        <div className="mt-5 mb-8 flex items-center gap-3">
          {[FIELD.ball, FIELD.ball, FIELD.strike, FIELD.strike, FIELD.out].map((c, i) => (
            <span key={i} className="w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: c, boxShadow: `0 0 8px ${c}` }} />
          ))}
          <span className="ml-2 text-base font-bold" style={{ color: FIELD.chalk }}>野球シミュレーター</span>
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
              className="mt-3 w-full text-sm text-gray-300 hover:text-white py-2 transition">← 戻る</button>
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
              className="mt-3 w-full text-sm text-gray-300 hover:text-white py-2 transition">← 戻る</button>
          </MenuCard>
        ) : (
          <MenuCard>
            {/* ⚠ `.btn-primary` は「次に押すもの」1つだけ。セーブがあれば
                つづきから、無ければ はじめから が次の一手になる */}
            <div className="space-y-2">
              <button
                onClick={handleContinue}
                disabled={!canContinue}
                className={`${canContinue ? 'btn-primary' : 'btn-secondary'} w-full px-6 py-4 rounded-xl text-xl transition active:scale-[0.99]`}
              >
                つづきから
              </button>
              <button
                onClick={onNewGame}
                className={`${canContinue ? 'btn-secondary' : 'btn-primary'} w-full px-6 py-4 rounded-xl text-xl transition active:scale-[0.99]`}
              >
                はじめから
              </button>
            </div>

            <div className="border-t border-gray-700/60 my-3" />

            <div className="grid grid-cols-2 gap-2">
              <button onClick={onSandbox} className="btn-secondary px-4 py-3 rounded-lg text-lg transition">箱庭モード</button>
              <button onClick={handleEdit} className="btn-secondary px-4 py-3 rounded-lg text-lg transition">エディット</button>
            </div>
            <button onClick={onManual}
              className="mt-2 w-full text-lg text-gray-300 hover:text-white py-2.5 rounded-lg hover:bg-gray-700/40 transition">
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
                  className="w-full flex items-center justify-between text-base text-gray-300 hover:text-white px-1 py-1.5 transition">
                  <span>{o.label}</span>
                  <span className={`text-sm font-bold px-2.5 py-1 rounded ${o.on ? 'seg-on' : 'seg'}`}>{o.value}</span>
                </button>
              ))}
            </div>
          </MenuCard>
        )}

      </div>
    </div>
  );
};

export default StartScreen;
