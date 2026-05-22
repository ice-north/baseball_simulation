import React, { useState } from 'react';
import { REGIONS, CORPORATE_TEAMS, getTeamsByRegion, RANK_ABILITY_RANGE, setTeamDisplayName, resetTeamDisplayName, setTeamOverride, resetTeamOverrides, getAllTeamsEffective, addCustomTeam, deleteTeam, restoreTeam, getDeletedTeams } from '../corporate/corporateTeamsData.js';

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
  const [createForm, setCreateForm] = useState({ name: '', city: '' });
  const [replaceTeamId, setReplaceTeamId] = useState(null);

  const regionTeams = selectedRegion
    ? getTeamsByRegion(selectedRegion)
    : [];
  // 企業チームのみ選択可能（クラブチームは対戦相手として表示のみ）
  const selectableTeams = regionTeams.filter(t => t.type === 'corporate' || t.isCustom);

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
    if (!replaceTeamId) {
      alert('入れ替えるチームを選んでください');
      return;
    }
    deleteTeam(replaceTeamId);
    const newTeam = addCustomTeam({
      name: createForm.name.trim(),
      city: createForm.city.trim(),
      region: selectedRegion,
      type: 'corporate',
      rank: 'D',
    });
    newTeam.displayName = newTeam.name;
    setShowCreateForm(false);
    setCreateForm({ name: '', city: '' });
    setReplaceTeamId(null);
    setRefreshKey(prev => prev + 1);
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
              const corpCount = teams.filter(t => t.type === 'corporate').length;
              const clubCount = teams.filter(t => t.type === 'club').length;
              return (
                <button
                  key={region.id}
                  onClick={() => setSelectedRegion(region.id)}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500 rounded-lg p-4 text-left transition"
                >
                  <div className="text-white font-bold text-lg">{region.name}</div>
                  <div className="text-gray-400 text-sm">{teams.length}チーム</div>
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
            const isClub = team.type === 'club';
            const isSelected = selectedTeam?.id === team.id;
            return (
              <div
                key={team.id}
                onClick={() => { if (!isClub && editingNameId !== team.id) setSelectedTeam(team); }}
                className={`w-full flex items-center justify-between p-3 rounded-lg border transition ${
                  isClub
                    ? 'bg-gray-800/50 border-gray-800 opacity-50 cursor-default'
                    : isSelected
                      ? 'bg-blue-900/50 border-blue-500 cursor-pointer'
                      : 'bg-gray-800 border-gray-700 hover:border-gray-500 cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className={`font-bold text-lg w-6 shrink-0 ${RANK_COLORS[team.rank]}`}>{team.rank}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${typeInfo.color}`}>{typeInfo.label}</span>
                  <div className="text-left min-w-0">
                    {editingNameId === team.id && !isClub ? (
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
                        <span className={isClub ? 'text-gray-500' : 'text-white font-bold'}>{team.displayName}</span>
                        <span className="text-gray-500 text-xs">({team.city})</span>
                        {team.displayName !== team.name && (
                          <span className="text-gray-600 text-xs">元:{team.name}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {!isClub && editingNameId !== team.id && !team.isCustom && (
                    <button onClick={(e) => startEditName(e, team)} className="text-gray-600 hover:text-blue-400 text-xs">名前変更</button>
                  )}
                  {team.displayName !== team.name && editingNameId !== team.id && (
                    <button onClick={(e) => handleResetName(e, team.id)} className="text-gray-600 hover:text-yellow-400 text-xs">リセット</button>
                  )}
                  <span className="text-gray-500 text-xs w-16 text-right">
                    {isClub ? '対戦相手' : RANK_LABELS[team.rank]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* チーム作成（企業チーム・Dランク固定・1チーム入れ替え） */}
        {showCreateForm ? (
          <div className="mt-4 bg-gray-800 border border-purple-600 rounded-lg p-4">
            <h3 className="text-white font-bold mb-1">企業チームを立ち上げる</h3>
            <p className="text-gray-400 text-xs mb-3">Dランクからのスタート。既存チーム1つと入れ替えてリーグに参加します。</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-gray-400 text-xs">チーム名</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-2 rounded focus:border-purple-400 focus:outline-none"
                  placeholder="例: 札幌ベアーズ"
                  autoFocus
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
              <label className="text-gray-400 text-xs">入れ替えるチームを選択（弱い順）</label>
              <div className="mt-1 max-h-40 overflow-y-auto space-y-1 border border-gray-700 rounded p-2 bg-gray-900/50">
                {[...regionTeams]
                  .filter(t => t.type !== 'club' || true)
                  .sort((a, b) => {
                    const ro = { S: 0, A: 1, B: 2, C: 3, D: 4 };
                    return (ro[b.rank] ?? 3) - (ro[a.rank] ?? 3);
                  })
                  .map(t => {
                    const typeInfo = TYPE_LABELS[t.type] || TYPE_LABELS.club;
                    return (
                      <div
                        key={t.id}
                        onClick={() => setReplaceTeamId(t.id)}
                        className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-sm transition ${
                          replaceTeamId === t.id
                            ? 'bg-red-900/50 border border-red-500'
                            : 'hover:bg-gray-700/50 border border-transparent'
                        }`}
                      >
                        <span className={`font-bold w-4 ${RANK_COLORS[t.rank]}`}>{t.rank}</span>
                        <span className={`text-xs px-1 rounded ${typeInfo.color}`}>{typeInfo.label}</span>
                        <span className={replaceTeamId === t.id ? 'text-red-300' : 'text-gray-300'}>{t.displayName || t.name}</span>
                        <span className="text-gray-600 text-xs">({t.city})</span>
                        {replaceTeamId === t.id && <span className="text-red-400 text-xs ml-auto">← 入れ替え</span>}
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCreateTeam}
                disabled={!replaceTeamId}
                className={`font-bold px-4 py-2 rounded transition ${
                  replaceTeamId
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >作成してゲーム開始</button>
              <button onClick={() => { setShowCreateForm(false); setReplaceTeamId(null); }} className="text-gray-400 hover:text-white px-4 py-2">取消</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreateForm(true)}
            className="mt-4 w-full border-2 border-dashed border-gray-600 hover:border-purple-500 text-gray-400 hover:text-purple-400 rounded-lg py-3 transition text-sm"
          >
            + 企業チームを立ち上げる（Dランクスタート）
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
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', city: '', type: 'club', rank: 'C' });
  const [showDeleted, setShowDeleted] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const allTeams = getAllTeamsEffective();
  const regionTeams = selectedRegion ? allTeams.filter(t => t.region === selectedRegion) : [];
  const deletedTeams = getDeletedTeams();

  const filteredTeams = searchQuery.trim()
    ? allTeams.filter(t =>
        t.name.includes(searchQuery) ||
        t.city.includes(searchQuery) ||
        t.originalName?.includes(searchQuery)
      )
    : null;

  const startEdit = (team) => {
    setEditingTeamId(team.id);
    setConfirmDeleteId(null);
    setEditForm({
      name: team.name,
      city: team.city,
      region: team.region,
      type: team.type,
      rank: team.rank,
    });
  };

  const saveEdit = (teamId) => {
    const orig = CORPORATE_TEAMS.find(t => t.id === teamId);
    if (orig) {
      for (const field of ['name', 'city', 'region', 'type', 'rank']) {
        if (editForm[field] !== undefined && editForm[field] !== orig[field]) {
          setTeamOverride(teamId, field, editForm[field]);
        } else {
          setTeamOverride(teamId, field, orig[field]);
        }
      }
    }
    setEditingTeamId(null);
    setRefreshKey(prev => prev + 1);
  };

  const resetAll = (teamId) => {
    resetTeamOverrides(teamId);
    setEditingTeamId(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleDelete = (teamId) => {
    deleteTeam(teamId);
    setEditingTeamId(null);
    setConfirmDeleteId(null);
    setRefreshKey(prev => prev + 1);
  };

  const handleRestore = (teamId) => {
    restoreTeam(teamId);
    setRefreshKey(prev => prev + 1);
  };

  const handleAdd = () => {
    if (!addForm.name.trim() || !addForm.city.trim()) {
      alert('チーム名と都市名を入力してください');
      return;
    }
    addCustomTeam({
      name: addForm.name.trim(),
      city: addForm.city.trim(),
      region: selectedRegion || 'tokyo',
      type: addForm.type,
      rank: addForm.rank,
    });
    setShowAddForm(false);
    setAddForm({ name: '', city: '', type: 'club', rank: 'C' });
    setRefreshKey(prev => prev + 1);
  };

  const renderTeamRow = (team) => {
    const typeInfo = TYPE_LABELS[team.type] || TYPE_LABELS.club;
    const isEditing = editingTeamId === team.id;

    if (isEditing) {
      return (
        <div key={`${team.id}-${refreshKey}`} className="bg-gray-800 border-2 border-indigo-500 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-gray-400 text-xs block mb-1">チーム名</label>
              <input
                type="text"
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-gray-700 border border-gray-500 text-white px-3 py-1.5 rounded focus:border-indigo-400 focus:outline-none text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">都市</label>
              <input
                type="text"
                value={editForm.city}
                onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))}
                className="w-full bg-gray-700 border border-gray-500 text-white px-3 py-1.5 rounded focus:border-indigo-400 focus:outline-none text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-gray-400 text-xs block mb-1">地域</label>
              <select
                value={editForm.region}
                onChange={e => setEditForm(f => ({ ...f, region: e.target.value }))}
                className="w-full bg-gray-700 border border-gray-500 text-white px-2 py-1.5 rounded focus:border-indigo-400 focus:outline-none text-sm"
              >
                {REGIONS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">種別</label>
              <div className="flex gap-1">
                {[['corporate', '企業'], ['club', 'クラブ']].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setEditForm(f => ({ ...f, type: val }))}
                    className={`flex-1 px-2 py-1.5 rounded text-sm font-bold transition ${
                      editForm.type === val
                        ? val === 'corporate' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >{label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1">強さ</label>
              <div className="flex gap-1">
                {['S', 'A', 'B', 'C', 'D'].map(r => (
                  <button
                    key={r}
                    onClick={() => setEditForm(f => ({ ...f, rank: r }))}
                    className={`flex-1 px-1 py-1.5 rounded text-sm font-bold transition ${
                      editForm.rank === r
                        ? `${RANK_COLORS[r].replace('text-', 'bg-').replace('-400', '-600')} text-white`
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >{r}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2 items-center">
            <button onClick={() => saveEdit(team.id)} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-1.5 rounded text-sm transition">保存</button>
            <button onClick={() => setEditingTeamId(null)} className="text-gray-400 hover:text-white text-sm px-3 py-1.5">取消</button>
            {team.hasOverrides && !team.isCustom && (
              <button onClick={() => resetAll(team.id)} className="text-yellow-500 hover:text-yellow-400 text-sm px-3 py-1.5">初期値に戻す</button>
            )}
            <div className="ml-auto">
              {confirmDeleteId === team.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-red-400 text-xs">削除しますか？</span>
                  <button onClick={() => handleDelete(team.id)} className="bg-red-600 hover:bg-red-500 text-white font-bold px-3 py-1 rounded text-xs transition">削除</button>
                  <button onClick={() => setConfirmDeleteId(null)} className="text-gray-400 hover:text-white text-xs">取消</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDeleteId(team.id)} className="text-red-500/60 hover:text-red-400 text-sm px-3 py-1.5">削除</button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={`${team.id}-${refreshKey}`}
        onClick={() => startEdit(team)}
        className="flex items-center gap-3 bg-gray-800 border border-gray-700 hover:border-indigo-500 rounded-lg p-3 cursor-pointer transition group"
      >
        <span className={`font-bold text-lg w-6 shrink-0 ${RANK_COLORS[team.rank]}`}>{team.rank}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${typeInfo.color}`}>{typeInfo.label}</span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-white font-bold truncate">{team.name}</span>
          <span className="text-gray-500 text-xs shrink-0">({team.city})</span>
          {team.isCustom && <span className="text-purple-400 text-xs shrink-0">追加</span>}
          {!team.isCustom && team.hasOverrides && <span className="text-indigo-400 text-xs shrink-0">変更済</span>}
        </div>
        <span className="text-gray-600 text-xs opacity-0 group-hover:opacity-100 transition shrink-0">クリックで編集</span>
      </div>
    );
  };

  const renderAddForm = () => (
    <div className="mt-3 bg-gray-800 border-2 border-purple-500 rounded-lg p-4">
      <h3 className="text-white font-bold mb-3">チームを追加</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-gray-400 text-xs block mb-1">チーム名</label>
          <input
            type="text"
            value={addForm.name}
            onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
            className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-1.5 rounded focus:border-purple-400 focus:outline-none text-sm"
            placeholder="例: 札幌ベアーズ"
            autoFocus
          />
        </div>
        <div>
          <label className="text-gray-400 text-xs block mb-1">都市</label>
          <input
            type="text"
            value={addForm.city}
            onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))}
            className="w-full bg-gray-700 border border-gray-600 text-white px-3 py-1.5 rounded focus:border-purple-400 focus:outline-none text-sm"
            placeholder="例: 札幌"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-gray-400 text-xs block mb-1">種別</label>
          <div className="flex gap-1">
            {[['corporate', '企業'], ['club', 'クラブ']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setAddForm(f => ({ ...f, type: val }))}
                className={`flex-1 px-2 py-1.5 rounded text-sm font-bold transition ${
                  addForm.type === val
                    ? val === 'corporate' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >{label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-gray-400 text-xs block mb-1">強さ</label>
          <div className="flex gap-1">
            {['S', 'A', 'B', 'C', 'D'].map(r => (
              <button
                key={r}
                onClick={() => setAddForm(f => ({ ...f, rank: r }))}
                className={`flex-1 px-1 py-1.5 rounded text-sm font-bold transition ${
                  addForm.rank === r
                    ? `${RANK_COLORS[r].replace('text-', 'bg-').replace('-400', '-600')} text-white`
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                }`}
              >{r}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={handleAdd} className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-1.5 rounded text-sm transition">追加</button>
        <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-white text-sm px-3 py-1.5">取消</button>
      </div>
    </div>
  );

  const renderDeletedSection = () => {
    if (deletedTeams.length === 0) return null;
    return (
      <div className="mt-4">
        <button
          onClick={() => setShowDeleted(prev => !prev)}
          className="text-gray-500 hover:text-gray-300 text-sm flex items-center gap-1"
        >
          <span>{showDeleted ? '▼' : '▶'}</span>
          <span>削除済みチーム ({deletedTeams.length})</span>
        </button>
        {showDeleted && (
          <div className="mt-2 space-y-1">
            {deletedTeams.map(team => (
              <div key={team.id} className="flex items-center gap-3 bg-gray-900/50 border border-gray-800 rounded-lg p-2.5 opacity-60">
                <span className={`font-bold w-6 shrink-0 ${RANK_COLORS[team.rank]}`}>{team.rank}</span>
                <span className="text-gray-400 text-sm flex-1">{team.name} ({team.city})</span>
                <button
                  onClick={() => handleRestore(team.id)}
                  className="text-green-500 hover:text-green-400 text-xs px-2 py-1"
                >復元</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // 検索結果表示
  if (filteredTeams) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2 text-center">社会人チーム設定</h1>
          <p className="text-gray-400 mb-4 text-center">チームの編集・追加・削除（全セーブ共通）</p>

          <div className="mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="チーム名・都市名で検索..."
              className="w-full bg-gray-700 border border-gray-600 text-white px-4 py-2 rounded-lg focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <p className="text-gray-400 text-sm mb-3">{filteredTeams.length}件の結果</p>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {filteredTeams.map(team => renderTeamRow(team))}
          </div>

          <div className="text-center mt-4">
            <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-white px-4 py-2 text-sm">検索をクリア</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">社会人チーム設定</h1>
        <p className="text-gray-400 mb-4 text-center">チームの編集・追加・削除（全セーブ共通）</p>

        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="チーム名・都市名で検索..."
            className="w-full bg-gray-700 border border-gray-600 text-white px-4 py-2 rounded-lg focus:border-indigo-400 focus:outline-none"
          />
        </div>

        {!selectedRegion ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              {REGIONS.map(region => {
                const teams = allTeams.filter(t => t.region === region.id);
                const customCount = teams.filter(t => t.hasOverrides || t.isCustom).length;
                const corpCount = teams.filter(t => t.type === 'corporate').length;
                const clubCount = teams.filter(t => t.type === 'club').length;
                return (
                  <button
                    key={region.id}
                    onClick={() => setSelectedRegion(region.id)}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-indigo-500 rounded-lg p-4 text-left transition"
                  >
                    <div className="text-white font-bold">{region.name}</div>
                    <div className="text-gray-400 text-sm">{teams.length}チーム</div>
                    <div className="text-xs mt-1 space-x-2">
                      <span className="text-blue-400">企業:{corpCount}</span>
                      <span className="text-green-400">クラブ:{clubCount}</span>
                    </div>
                    {customCount > 0 && <div className="text-indigo-400 text-xs mt-1">{customCount}件変更済</div>}
                  </button>
                );
              })}
            </div>

            {renderDeletedSection()}

            <div className="text-center mt-6">
              <button onClick={onBack} className="text-gray-400 hover:text-white px-4 py-2">タイトルに戻る</button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-white">
                {REGIONS.find(r => r.id === selectedRegion)?.name}
                <span className="text-gray-400 text-sm font-normal ml-2">{regionTeams.length}チーム</span>
              </h2>
            </div>
            <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
              {regionTeams.map(team => renderTeamRow(team))}
            </div>

            {showAddForm ? renderAddForm() : (
              <button
                onClick={() => setShowAddForm(true)}
                className="mt-3 w-full border-2 border-dashed border-gray-600 hover:border-purple-500 text-gray-400 hover:text-purple-400 rounded-lg py-2.5 transition text-sm"
              >
                + この地区にチームを追加
              </button>
            )}

            {renderDeletedSection()}

            <div className="text-center mt-4">
              <button onClick={() => { setSelectedRegion(null); setEditingTeamId(null); setShowAddForm(false); }} className="text-gray-400 hover:text-white px-4 py-2">地区選択に戻る</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export { ModeSelectScreen, CorporateTeamSelectScreen, CorporateNameEditScreen };
