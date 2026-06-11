import React, { useState } from 'react';

// セーブ＆ロード画面（3スロット対応）
const SaveLoadScreen = ({ onSave, onLoad, onDelete, saveSlots, seasonData, onReturnToTitle }) => {
  const [saveStatus, setSaveStatus] = useState(null);

  const handleSave = async (slotIndex) => {
    setSaveStatus({ type: 'saving' });
    const result = await onSave(slotIndex);
    if (result?.success) {
      setSaveStatus({ type: 'saved' });
    } else {
      setSaveStatus({ type: 'error', message: result?.error || 'セーブに失敗しました' });
    }
    setTimeout(() => setSaveStatus(null), 4000);
  };

  const handleLoad = async (slotIndex) => {
    if (window.confirm('現在の進行データは失われます。ロードしますか？')) {
      setSaveStatus({ type: 'loading' });
      const result = await onLoad(slotIndex);
      if (result?.success) {
        setSaveStatus({ type: 'loaded' });
      } else {
        setSaveStatus({ type: 'error', message: result?.error || 'ロードに失敗しました' });
      }
      setTimeout(() => setSaveStatus(null), 4000);
    }
  };

  const handleDelete = async (slotIndex) => {
    if (window.confirm('セーブデータを削除しますか？この操作は取り消せません。')) {
      const success = await onDelete(slotIndex);
      setSaveStatus(success ? { type: 'deleted' } : { type: 'error', message: '削除に失敗しました' });
      setTimeout(() => setSaveStatus(null), 4000);
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '---';
    const date = new Date(ts);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const getPhaseLabel = (phase) => {
    const labels = {
      spring_camp: '春季キャンプ',
      regular_season: 'レギュラーシーズン',
      playoffs: 'プレーオフ',
      draft: 'ドラフト',
      tryout: 'トライアウト',
      offseason: 'オフシーズン'
    };
    return labels[phase] || phase;
  };

  const slotNames = ['セーブスロット 1', 'セーブスロット 2', 'セーブスロット 3'];

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8 text-white">💾 セーブ＆ロード</h1>

      {/* ステータスメッセージ */}
      {saveStatus && (
        <div className={`mb-6 p-4 rounded-lg font-bold text-center ${
          saveStatus.type === 'saving' || saveStatus.type === 'loading' ? 'bg-gray-600 text-white animate-pulse' :
          saveStatus.type === 'saved' ? 'bg-green-600 text-white' :
          saveStatus.type === 'loaded' ? 'bg-blue-600 text-white' :
          saveStatus.type === 'deleted' ? 'bg-yellow-600 text-white' :
          'bg-red-600 text-white'
        }`}>
          {saveStatus.type === 'saving' && '💾 セーブ中...'}
          {saveStatus.type === 'loading' && '📂 ロード中...'}
          {saveStatus.type === 'saved' && '✅ セーブしました'}
          {saveStatus.type === 'loaded' && '✅ ロードしました'}
          {saveStatus.type === 'deleted' && '🗑️ 削除しました'}
          {saveStatus.type === 'error' && (
            <div>
              <div>❌ エラーが発生しました</div>
              {saveStatus.message && <div className="text-sm font-normal mt-1">{saveStatus.message}</div>}
            </div>
          )}
        </div>
      )}

      {/* 現在の進行状況 */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-white mb-4">📍 現在の進行状況</h2>
        {seasonData ? (
          <div className="text-gray-300">
            <p className="mb-2">シーズン: <span className="text-yellow-400 font-bold">{seasonData.year}年目</span></p>
            <p className="mb-2">日付: <span className="text-white">{seasonData.currentDate?.month}月{seasonData.currentDate?.day}日</span></p>
            <p>フェーズ: <span className="text-blue-400">{getPhaseLabel(seasonData.phase)}</span></p>
          </div>
        ) : (
          <p className="text-gray-500">ゲームが開始されていません</p>
        )}
      </div>

      {/* 3つのセーブスロット */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-white mb-4">💾 セーブスロット</h2>
        <div className="space-y-4">
          {slotNames.map((name, idx) => {
            const info = saveSlots[idx];
            return (
              <div key={idx} className="border border-gray-600 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-white font-bold text-lg">{name}</div>
                    {info ? (
                      <div className="text-sm text-gray-400 mt-1">
                        <p>{info.year}年目 | {info.date?.month}月{info.date?.day}日 | {getPhaseLabel(info.phase)}</p>
                        <p>保存日時: {formatTimestamp(info.timestamp)}</p>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm mt-1">セーブデータなし</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleSave(idx)}
                    disabled={!seasonData}
                    className={`flex-1 px-4 py-2 rounded font-bold transition ${
                      seasonData ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {info ? '上書き保存' : '新規保存'}
                  </button>
                  <button
                    onClick={() => handleLoad(idx)}
                    disabled={!info}
                    className={`flex-1 px-4 py-2 rounded font-bold transition ${
                      info ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    ロード
                  </button>
                  <button
                    onClick={() => handleDelete(idx)}
                    disabled={!info}
                    className={`px-4 py-2 rounded font-bold transition ${
                      info ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-500 mt-4">
          ※ セーブデータはブラウザのローカルストレージに保存されます。<br />
          ※ ブラウザのデータを消去すると、セーブデータも削除されます。
        </p>
      </div>

      {/* タイトルへ戻るボタン */}
      <div className="text-center">
        <button
          onClick={() => {
            if (window.confirm('タイトル画面に戻りますか？セーブしていない進行データは失われます。')) {
              onReturnToTitle();
            }
          }}
          className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold transition"
        >
          🏠 タイトルへ戻る
        </button>
      </div>
    </div>
  );
};

export default SaveLoadScreen;
