import React from 'react';
import { validateRegulations, getPlayoffFormatDescription, canModifyRegulations } from '../season/regulationSettings.js';
import { PHASE_INFO } from '../season/seasonManager.js';

const RegulationsScreen = ({ seasonData, setSeasonData, onConfirm }) => {
  if (!seasonData) return <div className="p-8 text-white">読み込み中...</div>;

  const currentPhase = seasonData.phase || 'off_season';
  const canModify = onConfirm ? true : canModifyRegulations(currentPhase);
  const phaseInfo = currentPhase && PHASE_INFO[currentPhase]
    ? PHASE_INFO[currentPhase]
    : { name: '', color: 'bg-gray-100', description: '' };
  const [tempSettings, setTempSettings] = React.useState(seasonData.settings);

  const handleSaveSettings = () => {
    const validation = validateRegulations(tempSettings);
    if (!validation.valid) {
      alert('設定エラー:\n' + validation.errors.join('\n'));
      return;
    }
    setSeasonData({ ...seasonData, settings: tempSettings });
    alert('レギュレーション設定を保存しました');
  };

  const SettingRow = ({ label, children }) => (
    <div className="flex items-center justify-between py-2 border-b border-gray-700/50">
      <label className="text-gray-300 text-sm font-medium">{label}</label>
      {children}
    </div>
  );

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold mb-4 text-white">レギュレーション設定</h1>

      {!canModify && (
        <div className="bg-yellow-900/50 border border-yellow-700/50 rounded-lg p-3 mb-3">
          <p className="text-yellow-200 font-bold text-sm">レギュレーション変更はオフシーズンのみ可能です</p>
          <p className="text-yellow-300/70 text-xs mt-0.5">現在: {phaseInfo.name}</p>
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-4 mb-3">
        <h2 className="text-sm font-bold mb-2 text-white">詳細設定</h2>
        <div className="space-y-0">
          <SettingRow label="DH制（指名打者）">
            <input type="checkbox" checked={tempSettings.useDH} onChange={(e) => setTempSettings({ ...tempSettings, useDH: e.target.checked })} disabled={!canModify} className="w-5 h-5 rounded" />
          </SettingRow>
          <SettingRow label="チーム数">
            <input type="number" value={tempSettings.teamsCount} onChange={(e) => setTempSettings({ ...tempSettings, teamsCount: parseInt(e.target.value) })} disabled={!canModify} min="2" max="12" className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm w-20" />
          </SettingRow>
          <SettingRow label="リーグ形式">
            <select
              value={tempSettings.leagueFormat || 'single'}
              onChange={(e) => setTempSettings({ ...tempSettings, leagueFormat: e.target.value })}
              disabled={!canModify}
              className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm"
            >
              <option value="single">1リーグ制</option>
              <option value="two" disabled={tempSettings.teamsCount < 4}>2リーグ制</option>
            </select>
          </SettingRow>
          {tempSettings.leagueFormat === 'two' && (
            <SettingRow label="リーグ名">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={tempSettings.leagueNames?.[0] || 'リーグ1'}
                  onChange={(e) => setTempSettings({ ...tempSettings, leagueNames: [e.target.value, tempSettings.leagueNames?.[1] || 'リーグ2'] })}
                  disabled={!canModify} maxLength={15}
                  className="bg-gray-700 text-white px-2 py-1.5 rounded text-sm w-28"
                />
                <input
                  type="text"
                  value={tempSettings.leagueNames?.[1] || 'リーグ2'}
                  onChange={(e) => setTempSettings({ ...tempSettings, leagueNames: [tempSettings.leagueNames?.[0] || 'リーグ1', e.target.value] })}
                  disabled={!canModify} maxLength={15}
                  className="bg-gray-700 text-white px-2 py-1.5 rounded text-sm w-28"
                />
              </div>
            </SettingRow>
          )}
          <SettingRow label="年間試合数">
            <input type="number" value={tempSettings.gamesPerSeason} onChange={(e) => setTempSettings({ ...tempSettings, gamesPerSeason: parseInt(e.target.value) })} disabled={!canModify} min="6" max="200" className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm w-20" />
          </SettingRow>
          <SettingRow label="プレーオフ形式">
            <select value={tempSettings.playoffFormat} onChange={(e) => setTempSettings({ ...tempSettings, playoffFormat: e.target.value })} disabled={!canModify} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">
              <option value="split">前後期制（3戦2勝）</option>
              <option value="single">1位 vs 2位（3戦2勝）</option>
              <option value="top2">上位2チーム（5戦3勝）</option>
              <option value="tournament">トーナメント</option>
              <option value="double">4チームトーナメント</option>
              <option value="championship">リーグ優勝決定戦</option>
              <option value="none">プレーオフなし</option>
            </select>
          </SettingRow>
          <div className="text-[10px] text-gray-500 py-1 pl-2">{getPlayoffFormatDescription(tempSettings.playoffFormat, tempSettings.leagueFormat)}</div>
          <SettingRow label="延長最大回数">
            <input type="number" value={tempSettings.maxExtraInnings} onChange={(e) => setTempSettings({ ...tempSettings, maxExtraInnings: parseInt(e.target.value) })} disabled={!canModify} min="0" max="30" className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm w-20" />
          </SettingRow>
        </div>
        <div className="mt-3">
          <button onClick={handleSaveSettings} disabled={!canModify} className={`w-full py-2 rounded-lg font-bold text-sm transition ${canModify ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-900 text-gray-600 cursor-not-allowed'}`}>
            設定を保存
          </button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-sm font-bold mb-2 text-white">現在の設定</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-300">
          <div>DH制: <span className="text-white">{seasonData.settings.useDH ? '有効' : '無効'}</span></div>
          <div>チーム数: <span className="text-white">{seasonData.settings.teamsCount}チーム</span></div>
          <div>形式: <span className="text-white">{seasonData.settings.leagueFormat === 'two' ? '2リーグ' : '1リーグ'}</span></div>
          <div>試合数: <span className="text-white">{seasonData.settings.gamesPerSeason}試合</span></div>
          <div className="col-span-2">PO: <span className="text-white">{getPlayoffFormatDescription(seasonData.settings.playoffFormat, seasonData.settings.leagueFormat)}</span></div>
          <div>延長: <span className="text-white">{seasonData.settings.maxExtraInnings}回</span></div>
        </div>
      </div>

      {onConfirm && (
        <div className="mt-4 text-center">
          <button
            onClick={() => { handleSaveSettings(); onConfirm(); }}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-bold text-base transition shadow"
          >
            確定 → キャンプへ進む
          </button>
        </div>
      )}
    </div>
  );
};

export default RegulationsScreen;
