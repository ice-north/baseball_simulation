import React, { useState } from 'react';
import { REGULATION_PRESETS, getPlayoffFormatDescription } from '../season/regulationSettings.js';

const NewGameRegulationsScreen = ({ onComplete }) => {
  const [tempSettings, setTempSettings] = useState({
    useDH: false,
    gamesPerSeason: 76,
    teamsCount: 4,
    playoffFormat: 'split',
    maxExtraInnings: 12,
    teamNames: ['チームA', 'チームB', 'チームC', 'チームD']
  });
  const [selectedPreset, setSelectedPreset] = useState('shikoku');

  const handleTeamsCountChange = (newCount) => {
    const currentNames = tempSettings.teamNames || [];
    const newNames = [];
    for (let i = 0; i < newCount; i++) {
      newNames.push(currentNames[i] || `チーム${String.fromCharCode(65 + i)}`);
    }
    setTempSettings({
      ...tempSettings,
      teamsCount: newCount,
      teamNames: newNames
    });
  };

  const handleTeamNameChange = (index, newName) => {
    const newNames = [...tempSettings.teamNames];
    newNames[index] = newName;
    setTempSettings({ ...tempSettings, teamNames: newNames });
  };

  const handleApplyPreset = (presetName) => {
    const preset = REGULATION_PRESETS[presetName];
    if (preset) {
      const newTeamsCount = preset.regulations.teamsCount || 4;
      const newNames = [];
      for (let i = 0; i < newTeamsCount; i++) {
        newNames.push(`チーム${String.fromCharCode(65 + i)}`);
      }
      setTempSettings({
        ...preset.regulations,
        teamNames: newNames
      });
      setSelectedPreset(presetName);
    }
  };

  const handleStart = () => {
    onComplete(tempSettings);
  };

  const presetList = [
    { key: 'shikoku', name: '四国IL', icon: '🏝️' },
    { key: 'bc', name: 'BCリーグ', icon: '⚾' },
    { key: 'kyushu', name: '九州AL', icon: '🌸' },
    { key: 'hokkaido', name: '北海道FL', icon: '🐻' },
    { key: 'kansai', name: '関西BL', icon: '🏯' },
    { key: 'independent', name: '汎用', icon: '⚡' },
    { key: 'professional', name: 'NPB', icon: '🏆' }
  ];

  return (
    <div className="p-8 bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">⚙️ レギュレーション設定</h1>

        {/* プリセット選択 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 text-white">実在リーグから選択</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {presetList.map(preset => {
              const presetData = REGULATION_PRESETS[preset.key];
              return (
                <button
                  key={preset.key}
                  onClick={() => handleApplyPreset(preset.key)}
                  className={`p-4 rounded-lg transition ${
                    selectedPreset === preset.key
                      ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <div className="text-3xl mb-2">{preset.icon}</div>
                  <div className="font-bold">{presetData.name}</div>
                  {presetData.description && (
                    <div className="text-xs mt-1 opacity-80">{presetData.description}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 選択中のプリセット情報 */}
        {selectedPreset && (
          <div className="bg-blue-900 border border-blue-700 rounded-lg p-4 mb-6">
            <div className="text-white">
              <div className="font-bold text-lg mb-2">
                📋 {REGULATION_PRESETS[selectedPreset].name}
              </div>
              <div className="text-sm text-blue-200">
                {getPlayoffFormatDescription(tempSettings.playoffFormat)}
              </div>
            </div>
          </div>
        )}

        {/* 詳細設定 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 text-white">詳細設定（カスタマイズ可能）</h2>
          <div className="space-y-4 text-white">
            <div className="flex items-center justify-between">
              <label className="font-medium">DH制</label>
              <select value={tempSettings.useDH ? 'true' : 'false'} onChange={(e) => setTempSettings({...tempSettings, useDH: e.target.value === 'true'})} className="bg-gray-700 rounded px-3 py-2">
                <option value="true">有効</option>
                <option value="false">無効</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className="font-medium">チーム数</label>
              <input type="number" min="2" max="12" value={tempSettings.teamsCount} onChange={(e) => handleTeamsCountChange(parseInt(e.target.value) || 4)} className="bg-gray-700 rounded px-3 py-2 w-24" />
            </div>
            <div className="flex items-center justify-between">
              <label className="font-medium">年間試合数</label>
              <input type="number" min="10" max="200" value={tempSettings.gamesPerSeason} onChange={(e) => setTempSettings({...tempSettings, gamesPerSeason: parseInt(e.target.value)})} className="bg-gray-700 rounded px-3 py-2 w-24" />
            </div>
            <div className="flex items-center justify-between">
              <label className="font-medium">プレーオフ形式</label>
              <select value={tempSettings.playoffFormat} onChange={(e) => setTempSettings({...tempSettings, playoffFormat: e.target.value})} className="bg-gray-700 rounded px-3 py-2">
                <option value="split">前後期制（3戦2勝）</option>
                <option value="single">1位vs2位（3戦2勝）</option>
                <option value="top2">上位2チーム（5戦3勝）</option>
                <option value="tournament">トーナメント</option>
                <option value="double">4チーム</option>
                <option value="none">なし</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className="font-medium">延長最大回数</label>
              <input type="number" min="9" max="20" value={tempSettings.maxExtraInnings} onChange={(e) => setTempSettings({...tempSettings, maxExtraInnings: parseInt(e.target.value)})} className="bg-gray-700 rounded px-3 py-2 w-24" />
            </div>
          </div>
        </div>

        {/* チーム名設定 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 text-white">📝 チーム名設定</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {tempSettings.teamNames.map((name, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-gray-400 text-sm w-8">#{index + 1}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => handleTeamNameChange(index, e.target.value)}
                  maxLength={15}
                  className="bg-gray-700 text-white rounded px-3 py-2 flex-1 w-full"
                  placeholder={`チーム${String.fromCharCode(65 + index)}`}
                />
              </div>
            ))}
          </div>
          <p className="text-gray-500 text-xs mt-3">※チーム名はカレンダー・成績表に反映されます（最大15文字）</p>
        </div>

        <div className="text-center">
          <button onClick={handleStart} className="bg-green-600 hover:bg-green-700 text-white px-12 py-4 rounded-lg font-bold text-xl transition">
            設定完了 - トライアウトへ
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewGameRegulationsScreen;
