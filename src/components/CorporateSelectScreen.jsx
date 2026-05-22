import React, { useState } from 'react';
import { REGIONS, CORPORATE_TEAMS, getTeamsByRegion, RANK_ABILITY_RANGE, setTeamDisplayName, resetTeamDisplayName } from '../corporate/corporateTeamsData.js';

const RANK_COLORS = {
  S: 'text-yellow-400',
  A: 'text-red-400',
  B: 'text-blue-400',
  C: 'text-green-400',
  D: 'text-gray-400',
};

const TYPE_LABELS = {
  corporate: { label: '企業', color: 'bg-blue-800 text-blue-200' },
  club: { label: 'クラブ', color: 'bg-green-800 text-green-200' },
  custom: { label: '作成', color: 'bg-purple-800 text-purple-200' },
};

const RANK_LABELS = {
  S: '超強豪', A: '強豪', B: '中堅', C: '育成型', D: '新興',
};

const ModeSelectScreen = ({ onSelectIndependent, onSelectCorporate, onBack }) => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
      <div className="text-center max-w-2xl mx-auto px-4">
        <h1 className="text-4xl font-bold text-white mb-2">GAME MODE</h1>
        <p className="text-gray-400 mb-10">プレイするモードを選択してください</p>

        <div className="flex flex-col items-center space-y-6">
          <button
            onClick={onSelectIndependent}
            className="group w-96 bg-gradient-to-r from-green-700 to-emerald-700 hover:from-green-600 hover:to-emerald-600 text-white px-8 py-6 rounded-xl font-bold transition-all shadow-lg active:scale-[0.98]"
          >
            <div className="text-2xl mb-1">独立リーグ</div>
            <div className="text-sm font-normal text-green-200">
              リーグを立ち上げ、トライアウトで選手を集める。経験が選手を育てる。
            </div>
          </button>

          <button
            onClick={onSelectCorporate}
            className="group w-96 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white px-8 py-6 rounded-xl font-bold transition-all shadow-lg active:scale-[0.98]"
          >
            <div className="text-2xl mb-1">社会人野球</div>
            <div className="text-sm font-normal text-blue-200">
              企業チームの監督に就任。スカウトで選手を獲得し、コーチの力で育てる。
            </div>
          </button>
        </div>

        <button
          onClick={onBack}
          className="mt-8 text-gray-500 hover:text-gray-300 text-sm"
        >
          戻る
        </button>
      </div>
    </div>
  );
};

const CorporateTeamSelectScreen = ({ onSelect, onBack }) => {
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [editingNameId, setEditingNameId] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', city: '', type: 'club', rank: 'C' });
  const [customTeams, setCustomTeams] = useState([]);

  const regionTeams = selectedRegion
    ? [...getTeamsByRegion(selectedRegion), ...customTeams.filter(t => t.region === selectedRegion)]
    : [];

  const startEditName = (e, team) => {
    e.stopPropagation();
    setEditingNameId(team.id);
    setEditNameValue(team.displayName);
  };

  const saveEditName = (teamId) => {
    if (editNameValue.trim()) {
      setTeamDisplayName(teamId, editNameValue.trim());
    }
    setEditingNameId(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleResetName = (e, teamId) => {
    e.stopPropagation();
    resetTeamDisplayName(teamId);
    setRefreshKey(prev => prev + 1);
  };

  const handleConfirm = () => {
    if (selectedTeam) {
      onSelect(selectedTeam);
    }
  };

  const handleCreateTeam = () => {
    if (!createForm.name.trim() || !createForm.city.trim()) {
      alert('チーム名と都市名を入力してください');
      return;
    }
    const maxId = Math.max(
      ...CORPORATE_TEAMS.map(t => t.id),
      ...customTeams.map(t => t.id),
      0
    );
    const budgetByRank = { S: 90, A: 70, B: 50, C: 35, D: 20 };
    const newTeam = {
      id: maxId + 1,
      name: createForm.name.trim(),
      displayName: createForm.name.trim(),
      city: createForm.city.trim(),
      region: selectedRegion,
      type: 'custom',
      rank: createForm.rank,
      budget: budgetByRank[createForm.rank] || 35,
    };
    setCustomTeams(prev => [...prev, newTeam]);
    setShowCreateForm(false);
    setCreateForm({ name: '', city: '', type: 'club', rank: 'C' });
    setSelectedTeam(newTeam);
  };

  // 地区選択
  if (!selectedRegion) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2 text-center">地区を選択</h1>
          <p className="text-gray-400 mb-8 text-center">監督として就任する地区を選んでください</p>

          <div className="grid grid-cols-3 gap-3">
            {REGIONS.map(region => {
              const teams = getTeamsByRegion(region.id);
              const custom = customTeams.filter(t => t.region === region.id).length;
              const corpCount = teams.filter(t => t.type === 'corporate').length;
              const clubCount = teams.filter(t => t.type === 'club').length + custom;
              return (
                <button
                  key={region.id}
                  onClick={() => setSelectedRegion(region.id)}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500 rounded-lg p-4 text-left transition"
                >
                  <div className="text-white font-bold text-lg">{region.name}</div>
                  <div className="text-gray-400 text-sm">{teams.length + custom}チーム</div>
                  <div className="text-xs mt-1 space-x-2">
                    <span className="text-blue-400">企業:{corpCount}</span>
                    <span className="text-green-400">クラブ:{clubCount}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="text-center mt-6">
            <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm">
              戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // チーム選択
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">
          {REGIONS.find(r => r.id === selectedRegion)?.name} のチーム
        </h1>
        <p className="text-gray-400 mb-6 text-center">監督として就任するチームを選んでください</p>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {regionTeams.map(team => {
            const typeInfo = TYPE_LABELS[team.type] || TYPE_LABELS.club;
            return (
              <div
                key={team.id}
                onClick={() => { if (editingNameId !== team.id) setSelectedTeam(team); }}
                className={`w-full flex items-center justify-between p-3 rounded-lg border transition cursor-pointer ${
                  selectedTeam?.id === team.id
                    ? 'bg-blue-900/50 border-blue-500'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-500'
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className={`font-bold text-lg w-6 shrink-0 ${RANK_COLORS[team.rank]}`}>{team.rank}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${typeInfo.color}`}>{typeInfo.label}</span>
                  <div className="text-left min-w-0">
                    {editingNameId === team.id ? (
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEditName(team.id); if (e.key === 'Escape') setEditingNameId(null); }}
                          className="bg-gray-700 border border-gray-500 text-white px-2 py-1 rounded w-44 focus:border-blue-400 focus:outline-none text-sm"
                          autoFocus
                        />
                        <button onClick={() => saveEditName(team.id)} className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs">保存</button>
                        <button onClick={() => setEditingNameId(null)} className="text-gray-400 hover:text-white text-xs">取消</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-bold">{team.displayName}</span>
                        <span className="text-gray-500 text-xs">({team.city})</span>
                        {team.displayName !== team.name && (
                          <span className="text-gray-600 text-xs">元:{team.name}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {editingNameId !== team.id && !team.type?.startsWith('custom') && (
                    <button onClick={(e) => startEditName(e, team)} className="text-gray-600 hover:text-blue-400 text-xs">名前変更</button>
                  )}
                  {team.displayName !== team.name && editingNameId !== team.id && (
                    <button onClick={(e) => handleResetName(e, team.id)} className="text-gray-600 hover:text-yellow-400 text-xs">リセット</button>
                  )}
                  <span className="text-gray-500 text-xs w-16 text-right">{RANK_LABELS[team.rank]}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* チーム作成 */}
        {showCreateForm ? (
          <div className="mt-4 bg-gray-800 border border-purple-600 rounded-lg p-4">
            <h3 className="text-white font-bold mb-3">チームを作成</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-gray-400 text-xs">チーム名</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded focus:border-purple-400 focus:outline-none"
                  placeholder="例: 札幌ベアーズ"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs">所在都市</label>
                <input
                  type="text"
                  value={createForm.city}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, city: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded focus:border-purple-400 focus:outline-none"
                  placeholder="例: 札幌"
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="text-gray-400 text-xs">初期ランク</label>
              <div className="flex gap-2 mt-1">
                {['S', 'A', 'B', 'C', 'D'].map(r => (
                  <button
                    key={r}
                    onClick={() => setCreateForm(prev => ({ ...prev, rank: r }))}
                    className={`px-3 py-1 rounded font-bold text-sm transition ${
                      createForm.rank === r
                        ? `${RANK_COLORS[r].replace('text-', 'bg-').replace('-400', '-600')} text-white`
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreateTeam} className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded transition">作成</button>
              <button onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-white px-4 py-2">取消</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreateForm(true)}
            className="mt-4 w-full border-2 border-dashed border-gray-600 hover:border-purple-500 text-gray-400 hover:text-purple-400 rounded-lg py-3 transition text-sm"
          >
            + この地区にチームを作成
          </button>
        )}

        <div className="flex justify-between items-center mt-4">
          <button
            onClick={() => { setSelectedRegion(null); setSelectedTeam(null); }}
            className="text-gray-400 hover:text-white text-sm px-4 py-2"
          >
            地区選択に戻る
          </button>

          {selectedTeam && (
            <button
              onClick={handleConfirm}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-3 rounded-lg transition"
            >
              {selectedTeam.displayName}（{selectedTeam.city}）で開始
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const CorporateNameEditScreen = ({ onBack }) => {
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [editingNameId, setEditingNameId] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const regionTeams = selectedRegion ? getTeamsByRegion(selectedRegion) : [];

  const startEdit = (team) => {
    setEditingNameId(team.id);
    setEditNameValue(team.displayName);
  };

  const saveEdit = (teamId) => {
    if (editNameValue.trim()) {
      setTeamDisplayName(teamId, editNameValue.trim());
    }
    setEditingNameId(null);
    setRefreshKey(prev => prev + 1);
  };

  const resetName = (teamId) => {
    resetTeamDisplayName(teamId);
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">社会人チーム名設定</h1>
        <p className="text-gray-400 mb-6 text-center">チーム名を自由に変更できます（全セーブ共通）</p>

        {!selectedRegion ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              {REGIONS.map(region => {
                const teams = getTeamsByRegion(region.id);
                const customCount = teams.filter(t => t.displayName !== t.name).length;
                return (
                  <button
                    key={region.id}
                    onClick={() => setSelectedRegion(region.id)}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-indigo-500 rounded-lg p-4 text-left transition"
                  >
                    <div className="text-white font-bold">{region.name}</div>
                    <div className="text-gray-400 text-sm">{region.teamCount}チーム</div>
                    {customCount > 0 && <div className="text-indigo-400 text-xs mt-1">{customCount}件変更済</div>}
                  </button>
                );
              })}
            </div>
            <div className="text-center mt-6">
              <button onClick={onBack} className="text-gray-400 hover:text-white px-4 py-2">タイトルに戻る</button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
              {regionTeams.map(team => {
                const typeInfo = TYPE_LABELS[team.type] || TYPE_LABELS.club;
                return (
                  <div key={team.id} className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg p-3">
                    <span className={`font-bold text-lg w-6 ${RANK_COLORS[team.rank]}`}>{team.rank}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${typeInfo.color}`}>{typeInfo.label}</span>
                    {editingNameId === team.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(team.id); if (e.key === 'Escape') setEditingNameId(null); }}
                          className="bg-gray-700 border border-gray-500 text-white px-3 py-1 rounded flex-1 focus:border-indigo-400 focus:outline-none"
                          autoFocus
                        />
                        <button onClick={() => saveEdit(team.id)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-sm">保存</button>
                        <button onClick={() => setEditingNameId(null)} className="text-gray-400 hover:text-white text-sm">取消</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-white font-bold">{team.displayName}</span>
                        <span className="text-gray-500 text-xs">({team.city})</span>
                        {team.displayName !== team.name && (
                          <span className="text-gray-600 text-xs">元:{team.name}</span>
                        )}
                        <div className="ml-auto flex gap-2">
                          <button onClick={() => startEdit(team)} className="text-indigo-400 hover:text-indigo-300 text-sm">変更</button>
                          {team.displayName !== team.name && (
                            <button onClick={() => resetName(team.id)} className="text-yellow-500 hover:text-yellow-400 text-sm">リセット</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-center mt-6">
              <button onClick={() => setSelectedRegion(null)} className="text-gray-400 hover:text-white px-4 py-2">地区選択に戻る</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export { ModeSelectScreen, CorporateTeamSelectScreen, CorporateNameEditScreen };
