import React, { useState } from 'react';
import { UNIVERSITY_TEAMS, UNIVERSITY_REGIONS } from '../university/universityTeamsData.js';

const RANK_COLORS = {
  S: 'text-yellow-400',
  A: 'text-red-400',
  B: 'text-blue-400',
  C: 'text-green-400',
  D: 'text-gray-400',
};

const RANK_LABELS = {
  S: '超強豪', A: '強豪', B: '中堅', C: '育成型', D: '新興',
};

const UniversityTeamSelectScreen = ({ onSelect, onBack }) => {
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);

  const capitalRegions = UNIVERSITY_REGIONS.filter((_, i) => i < 7);
  const localRegions = UNIVERSITY_REGIONS.filter((_, i) => i >= 7);

  if (!selectedRegion) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2">リーグ選択</h1>
          <p className="text-gray-400 text-sm mb-8">所属するリーグを選んでください</p>

          <div className="mb-6">
            <h2 className="text-lg font-bold text-amber-400 mb-3">首都圏リーグ</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {capitalRegions.map(region => {
                const teams = UNIVERSITY_TEAMS.filter(t => t.region === region.id);
                const rankCounts = {};
                teams.forEach(t => { rankCounts[t.rank] = (rankCounts[t.rank] || 0) + 1; });
                return (
                  <button key={region.id}
                    onClick={() => setSelectedRegion(region)}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-amber-500 rounded-xl p-4 text-left transition group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-lg font-bold text-white group-hover:text-amber-400 transition">{region.name}</div>
                      <div className="text-xs text-gray-500">{teams.length}校</div>
                    </div>
                    <div className="flex gap-2 text-xs">
                      {['S','A','B','C','D'].map(r => rankCounts[r] ? (
                        <span key={r} className={RANK_COLORS[r]}>{r}:{rankCounts[r]}</span>
                      ) : null)}
                    </div>
                    {(region.divisions || 1) >= 2 && (
                      <div className="text-xs text-gray-500 mt-1">
                        {Array.from({ length: region.divisions }, (_, d) => `${d + 1}部${Math.floor(region.teamCount / region.divisions)}校`).join(' + ')}（入替制）
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-lg font-bold text-amber-400 mb-3">地方リーグ</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {localRegions.map(region => {
                const teams = UNIVERSITY_TEAMS.filter(t => t.region === region.id);
                const rankCounts = {};
                teams.forEach(t => { rankCounts[t.rank] = (rankCounts[t.rank] || 0) + 1; });
                return (
                  <button key={region.id}
                    onClick={() => setSelectedRegion(region)}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-amber-500 rounded-xl p-4 text-left transition group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-lg font-bold text-white group-hover:text-amber-400 transition">{region.name}</div>
                      <div className="text-xs text-gray-500">{teams.length}校</div>
                    </div>
                    <div className="flex gap-2 text-xs">
                      {['S','A','B','C','D'].map(r => rankCounts[r] ? (
                        <span key={r} className={RANK_COLORS[r]}>{r}:{rankCounts[r]}</span>
                      ) : null)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-center mt-6">
            <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition">← 戻る</button>
          </div>
        </div>
      </div>
    );
  }

  // チーム選択画面
  const teams = UNIVERSITY_TEAMS.filter(t => t.region === selectedRegion.id);
  const numDivisions = selectedRegion.divisions || 1;
  const perDiv = numDivisions >= 2 ? Math.floor(teams.length / numDivisions) : 0;
  const hasDivisions = numDivisions >= 2;

  const renderTeamButton = (team) => (
    <button key={team.id}
      onClick={() => setSelectedTeam(team)}
      className={`bg-gray-800 hover:bg-gray-700 border rounded-lg p-4 text-left transition group ${
        selectedTeam?.id === team.id ? 'border-amber-400 bg-gray-700' : 'border-gray-700 hover:border-amber-500'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-base font-bold text-white group-hover:text-amber-400 transition">{team.name}</div>
        <span className={`text-sm font-bold ${RANK_COLORS[team.rank]}`}>{team.rank}</span>
      </div>
      <div className="text-xs text-gray-500 mt-1">{RANK_LABELS[team.rank]}</div>
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-1">{selectedRegion.name}</h1>
        <p className="text-gray-400 text-sm mb-6">監督を務めるチームを選んでください</p>

        {hasDivisions ? (
          <>
            {Array.from({ length: numDivisions }, (_, d) => {
              const divTeams = teams.slice(d * perDiv, (d + 1) * perDiv);
              const divColor = d === 0 ? 'text-amber-400' : 'text-gray-400';
              return (
                <div key={d}>
                  <h3 className={`text-sm font-bold ${divColor} mb-2`}>{d + 1}部</h3>
                  <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${d < numDivisions - 1 ? 'mb-4' : 'mb-6'}`}>
                    {divTeams.map(renderTeamButton)}
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {teams.map(renderTeamButton)}
          </div>
        )}

        <div className="flex justify-between items-center">
          <button onClick={() => { setSelectedRegion(null); setSelectedTeam(null); }}
            className="text-gray-400 hover:text-white text-sm transition">← リーグ選択に戻る</button>
          {selectedTeam && (
            <button onClick={() => onSelect(selectedTeam)}
              className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-lg font-bold transition">
              {selectedTeam.name}で始める
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UniversityTeamSelectScreen;
