import React from 'react';
import { REGULATION_PRESETS, validateRegulations, getPlayoffFormatDescription, canModifyRegulations, applyPreset } from '../season/regulationSettings.js';
import { PHASE_INFO } from '../season/seasonManager.js';

const RegulationsScreen = ({ seasonData, setSeasonData, onConfirm }) => {
  if (!seasonData) return <div className="p-8 text-white">読み込み中...</div>;

  const currentPhase = seasonData.phase || 'off_season';
  const canModify = onConfirm ? true : canModifyRegulations(currentPhase);
  const phaseInfo = currentPhase && PHASE_INFO[currentPhase]
    ? PHASE_INFO[currentPhase]
    : { name: '', color: 'bg-gray-100', description: '' };
  const [tempSettings, setTempSettings] = React.useState(seasonData.settings);

  const handleApplyPreset = (presetName) => {
    const presetRegulations = applyPreset(presetName);
    setTempSettings(presetRegulations);
  };

  const handleSaveSettings = () => {
    const validation = validateRegulations(tempSettings);
    if (!validation.valid) {
      alert('設定エラー:\n' + validation.errors.join('\n'));
      return;
    }
    setSeasonData({ ...seasonData, settings: tempSettings });
    alert('レギュレーション設定を保存しました');
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-white">レギュレーション設定</h1>

      {!canModify && (
        <div className="bg-yellow-900 border-2 border-yellow-600 rounded-lg p-4 mb-6">
          <p className="text-yellow-200 font-bold">⚠️ レギュレーション変更はオフシーズン（12月）のみ可能です</p>
          <p className="text-yellow-300 text-sm mt-2">現在のフェーズ: {phaseInfo.name}</p>
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-white">プリセット</h2>
        <div className="grid grid-cols-2 gap-4">
          {Object.keys(REGULATION_PRESETS).map(presetKey => {
            const preset = REGULATION_PRESETS[presetKey];
            return (
              <button
                key={presetKey}
                onClick={() => handleApplyPreset(presetKey)}
                disabled={!canModify}
                className={`p-4 rounded-lg text-left transition ${canModify ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-900 text-gray-600 cursor-not-allowed'}`}
              >
                <div className="font-bold text-lg mb-2">{preset.name}</div>
                <div className="text-sm text-gray-400">{preset.regulations.teamsCount}チーム / {preset.regulations.gamesPerSeason}試合{preset.regulations.useDH ? ' / DH制' : ''}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4 text-white">詳細設定</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-white font-bold">DH制（指名打者制度）</label>
            <input type="checkbox" checked={tempSettings.useDH} onChange={(e) => setTempSettings({ ...tempSettings, useDH: e.target.checked })} disabled={!canModify} className="w-6 h-6" />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-white font-bold">チーム数</label>
            <input type="number" value={tempSettings.teamsCount} onChange={(e) => setTempSettings({ ...tempSettings, teamsCount: parseInt(e.target.value) })} disabled={!canModify} min="2" max="12" className="bg-gray-700 text-white px-4 py-2 rounded w-24" />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-white font-bold">年間試合数（チームあたり）</label>
            <input type="number" value={tempSettings.gamesPerSeason} onChange={(e) => setTempSettings({ ...tempSettings, gamesPerSeason: parseInt(e.target.value) })} disabled={!canModify} min="6" max="200" className="bg-gray-700 text-white px-4 py-2 rounded w-24" />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-white font-bold">プレーオフ形式</label>
            <select value={tempSettings.playoffFormat} onChange={(e) => setTempSettings({ ...tempSettings, playoffFormat: e.target.value })} disabled={!canModify} className="bg-gray-700 text-white px-4 py-2 rounded">
              <option value="single">1位 vs 2位</option>
              <option value="double">4チームトーナメント</option>
              <option value="none">プレーオフなし</option>
            </select>
          </div>
          <div className="text-sm text-gray-400 pl-4">{getPlayoffFormatDescription(tempSettings.playoffFormat)}</div>
          <div className="flex items-center justify-between">
            <label className="text-white font-bold">延長最大回数</label>
            <input type="number" value={tempSettings.maxExtraInnings} onChange={(e) => setTempSettings({ ...tempSettings, maxExtraInnings: parseInt(e.target.value) })} disabled={!canModify} min="0" max="30" className="bg-gray-700 text-white px-4 py-2 rounded w-24" />
          </div>
        </div>
        <div className="mt-6">
          <button onClick={handleSaveSettings} disabled={!canModify} className={`w-full py-3 rounded-lg font-bold transition ${canModify ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-900 text-gray-600 cursor-not-allowed'}`}>
            設定を保存
          </button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 mt-6">
        <h2 className="text-xl font-bold mb-4 text-white">現在の設定</h2>
        <div className="space-y-2 text-white">
          <div>DH制: {seasonData.settings.useDH ? '有効' : '無効'}</div>
          <div>チーム数: {seasonData.settings.teamsCount}チーム</div>
          <div>年間試合数: {seasonData.settings.gamesPerSeason}試合</div>
          <div>プレーオフ: {getPlayoffFormatDescription(seasonData.settings.playoffFormat)}</div>
          <div>延長最大: {seasonData.settings.maxExtraInnings}回</div>
        </div>
      </div>

      {onConfirm && (
        <div className="mt-6 text-center">
          <button
            onClick={() => {
              handleSaveSettings();
              onConfirm();
            }}
            className="bg-green-600 hover:bg-green-700 text-white px-10 py-4 rounded-lg font-bold text-xl transition"
          >
            確定 → キャンプへ進む
          </button>
        </div>
      )}
    </div>
  );
};

export default RegulationsScreen;
