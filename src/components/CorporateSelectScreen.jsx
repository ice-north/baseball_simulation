import React, { useState } from 'react';
import { REGIONS, CORPORATE_TEAMS, getTeamsByRegion, RANK_ABILITY_RANGE } from '../corporate/corporateTeamsData.js';

const RANK_COLORS = {
  S: 'text-yellow-400',
  A: 'text-red-400',
  B: 'text-blue-400',
  C: 'text-green-400',
  D: 'text-gray-400',
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

  const regionTeams = selectedRegion ? getTeamsByRegion(selectedRegion) : [];

  const handleConfirm = () => {
    if (selectedTeam) {
      onSelect(selectedTeam);
    }
  };

  if (!selectedRegion) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2 text-center">地区を選択</h1>
          <p className="text-gray-400 mb-8 text-center">監督として就任する地区を選んでください</p>

          <div className="grid grid-cols-3 gap-3">
            {REGIONS.map(region => {
              const teams = getTeamsByRegion(region.id);
              const sCount = teams.filter(t => t.rank === 'S').length;
              const aCount = teams.filter(t => t.rank === 'A').length;
              return (
                <button
                  key={region.id}
                  onClick={() => setSelectedRegion(region.id)}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500 rounded-lg p-4 text-left transition"
                >
                  <div className="text-white font-bold text-lg">{region.name}</div>
                  <div className="text-gray-400 text-sm">{region.teamCount}チーム</div>
                  <div className="text-xs mt-1">
                    {sCount > 0 && <span className="text-yellow-400 mr-2">S:{sCount}</span>}
                    {aCount > 0 && <span className="text-red-400 mr-2">A:{aCount}</span>}
                    <span className="text-gray-500">他:{teams.length - sCount - aCount}</span>
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2 text-center">
          {REGIONS.find(r => r.id === selectedRegion)?.name} のチーム
        </h1>
        <p className="text-gray-400 mb-8 text-center">監督として就任するチームを選んでください</p>

        <div className="space-y-2">
          {regionTeams.map(team => (
            <button
              key={team.id}
              onClick={() => setSelectedTeam(team)}
              className={`w-full flex items-center justify-between p-4 rounded-lg border transition ${
                selectedTeam?.id === team.id
                  ? 'bg-blue-900/50 border-blue-500'
                  : 'bg-gray-800 border-gray-700 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center gap-4">
                <span className={`font-bold text-xl w-8 ${RANK_COLORS[team.rank]}`}>{team.rank}</span>
                <div className="text-left">
                  <div className="text-white font-bold text-lg">{team.name}</div>
                  <div className="text-gray-400 text-sm">予算: {team.budget * 100}万円</div>
                </div>
              </div>
              <div className="text-gray-500 text-sm">
                {team.rank === 'S' && '超強豪'}
                {team.rank === 'A' && '強豪'}
                {team.rank === 'B' && '中堅'}
                {team.rank === 'C' && '育成型'}
                {team.rank === 'D' && '新興'}
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-between items-center mt-6">
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
              {selectedTeam.name} で開始
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export { ModeSelectScreen, CorporateTeamSelectScreen };
