import React, { useState } from 'react';
import { REGULATION_PRESETS, getPlayoffFormatDescription } from '../season/regulationSettings.js';

const NewGameRegulationsScreen = ({ onComplete }) => {
  const [tempSettings, setTempSettings] = useState({
    useDH: false,
    gamesPerSeason: 75,
    teamsCount: 4,
    leagueFormat: 'single',
    leagueNames: null,
    playoffFormat: 'split',
    maxExtraInnings: 12,
    teamNames: ['チームA', 'チームB', 'チームC', 'チームD'],
    teamAbbreviations: ['Ａ', 'Ｂ', 'Ｃ', 'Ｄ']
  });
  const [selectedPreset, setSelectedPreset] = useState('shikoku');

  // 半角→全角変換（略称用）
  const toFullWidth = (str) => str.replace(/[A-Za-z0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
  // デフォルト略称を生成（全角アルファベット1文字）
  const defaultAbbr = (i) => String.fromCharCode(0xFF21 + i); // Ａ, Ｂ, Ｃ...

  const handleTeamsCountChange = (newCount) => {
    const currentNames = tempSettings.teamNames || [];
    const currentAbbrs = tempSettings.teamAbbreviations || [];
    const newNames = [];
    const newAbbrs = [];
    for (let i = 0; i < newCount; i++) {
      newNames.push(currentNames[i] || `チーム${String.fromCharCode(65 + i)}`);
      newAbbrs.push(currentAbbrs[i] || defaultAbbr(i));
    }
    // 試合数を新しいチーム数-1の倍数に自動調整
    const newDivisor = newCount - 1;
    const oldGames = tempSettings.gamesPerSeason || 60;
    const roundsPerTeam = Math.max(1, Math.round(oldGames / ((tempSettings.teamsCount || 4) - 1)));
    const adjustedGames = newDivisor * roundsPerTeam;
    setTempSettings({
      ...tempSettings,
      teamsCount: newCount,
      teamNames: newNames,
      teamAbbreviations: newAbbrs,
      gamesPerSeason: adjustedGames
    });
  };

  const handleTeamNameChange = (index, newName) => {
    const newNames = [...tempSettings.teamNames];
    newNames[index] = newName;
    setTempSettings({ ...tempSettings, teamNames: newNames });
  };

  const handleTeamAbbrChange = (index, newAbbr) => {
    // 全角3文字まで（半角入力は全角に変換）
    const converted = toFullWidth(newAbbr);
    // 全角文字数で3文字までに制限
    const trimmed = [...converted].slice(0, 3).join('');
    const newAbbrs = [...(tempSettings.teamAbbreviations || [])];
    newAbbrs[index] = trimmed;
    setTempSettings({ ...tempSettings, teamAbbreviations: newAbbrs });
  };

  const handleApplyPreset = (presetName) => {
    const preset = REGULATION_PRESETS[presetName];
    if (preset) {
      const newTeamsCount = preset.regulations.teamsCount || 4;
      const newNames = [];
      const newAbbrs = [];
      for (let i = 0; i < newTeamsCount; i++) {
        newNames.push(`チーム${String.fromCharCode(65 + i)}`);
        newAbbrs.push(defaultAbbr(i));
      }
      setTempSettings({
        ...preset.regulations,
        teamNames: newNames,
        teamAbbreviations: newAbbrs
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
    { key: 'hokkaido', name: '北海道FL', icon: '🐻' }
  ];

  return (
    <div className="p-8 bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">⚙️ レギュレーション設定</h1>

        {/* プリセット選択 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-2 text-white">プリセット選択</h2>
          <p className="text-gray-400 text-sm mb-4">※レギュレーションは毎年オフシーズンに変更することができます</p>
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
                {getPlayoffFormatDescription(tempSettings.playoffFormat, tempSettings.leagueFormat)}
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
              <label className="font-medium">リーグ形式</label>
              <select value={tempSettings.leagueFormat || 'single'} onChange={(e) => setTempSettings({...tempSettings, leagueFormat: e.target.value})} className="bg-gray-700 rounded px-3 py-2">
                <option value="single">1リーグ制</option>
                <option value="two" disabled={tempSettings.teamsCount < 4}>2リーグ制（{Math.floor(tempSettings.teamsCount / 2)}チーム×2）</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className="font-medium">年間試合数</label>
              <div className="flex items-center gap-2">
                <select
                  value={tempSettings.gamesPerSeason}
                  onChange={(e) => setTempSettings({...tempSettings, gamesPerSeason: parseInt(e.target.value)})}
                  className="bg-gray-700 rounded px-3 py-2"
                >
                  {(() => {
                    const d = (tempSettings.teamsCount || 4) - 1;
                    const options = [];
                    for (let i = 1; i <= 50; i++) {
                      options.push(d * i);
                    }
                    return options.map(v => <option key={v} value={v}>{v}試合（各{v / d}戦）</option>);
                  })()}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="font-medium">プレーオフ形式</label>
              <select value={tempSettings.playoffFormat} onChange={(e) => setTempSettings({...tempSettings, playoffFormat: e.target.value})} className="bg-gray-700 rounded px-3 py-2">
                <option value="split">前後期制（3戦2勝）</option>
                <option value="single">1位vs2位（3戦2勝）</option>
                <option value="top2">上位2チーム（5戦3勝）</option>
                <option value="tournament">トーナメント</option>
                <option value="double">4チーム</option>
                <option value="championship">リーグ優勝決定戦（3戦2勝）</option>
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
          {tempSettings.leagueFormat === 'two' ? (
            <>
              {/* 2リーグ制の場合はリーグごとに表示 */}
              <div className="mb-4">
                <h3 className="text-lg font-bold text-blue-400 mb-2">
                  {tempSettings.leagueNames?.[0] || 'リーグ1'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tempSettings.teamNames.slice(0, Math.floor(tempSettings.teamsCount / 2)).map((name, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-blue-400 text-sm w-8">#{index + 1}</span>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => handleTeamNameChange(index, e.target.value)}
                        maxLength={15}
                        className="bg-gray-700 text-white rounded px-3 py-2 flex-1 border border-blue-600"
                        placeholder={`チーム${String.fromCharCode(65 + index)}`}
                      />
                      <input
                        type="text"
                        value={(tempSettings.teamAbbreviations || [])[index] || ''}
                        onChange={(e) => handleTeamAbbrChange(index, e.target.value)}
                        className="bg-gray-700 text-white rounded px-2 py-2 w-16 text-center border border-blue-600/50 text-sm"
                        placeholder="略称"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-orange-400 mb-2">
                  {tempSettings.leagueNames?.[1] || 'リーグ2'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tempSettings.teamNames.slice(Math.floor(tempSettings.teamsCount / 2)).map((name, index) => {
                    const actualIndex = Math.floor(tempSettings.teamsCount / 2) + index;
                    return (
                      <div key={actualIndex} className="flex items-center gap-2">
                        <span className="text-orange-400 text-sm w-8">#{actualIndex + 1}</span>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => handleTeamNameChange(actualIndex, e.target.value)}
                          maxLength={15}
                          className="bg-gray-700 text-white rounded px-3 py-2 flex-1 border border-orange-600"
                          placeholder={`チーム${String.fromCharCode(65 + actualIndex)}`}
                        />
                        <input
                          type="text"
                          value={(tempSettings.teamAbbreviations || [])[actualIndex] || ''}
                          onChange={(e) => handleTeamAbbrChange(actualIndex, e.target.value)}
                          className="bg-gray-700 text-white rounded px-2 py-2 w-16 text-center border border-orange-600/50 text-sm"
                          placeholder="略称"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tempSettings.teamNames.map((name, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm w-8">#{index + 1}</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => handleTeamNameChange(index, e.target.value)}
                    maxLength={15}
                    className="bg-gray-700 text-white rounded px-3 py-2 flex-1"
                    placeholder={`チーム${String.fromCharCode(65 + index)}`}
                  />
                  <input
                    type="text"
                    value={(tempSettings.teamAbbreviations || [])[index] || ''}
                    onChange={(e) => handleTeamAbbrChange(index, e.target.value)}
                    className="bg-gray-700 text-white rounded px-2 py-2 w-16 text-center border border-gray-600 text-sm"
                    placeholder="略称"
                  />
                </div>
              ))}
            </div>
          )}
          <p className="text-gray-500 text-xs mt-3">※正式名（最大15文字）はドラフト・記録画面で使用。略称（全角3文字まで）はカレンダー・順位表・ランキングで使用されます</p>
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
