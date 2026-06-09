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
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);

  const selectedRegion = UNIVERSITY_REGIONS.find(r => r.id === selectedRegionId);
  const rightTeams = selectedRegion ? UNIVERSITY_TEAMS.filter(t => t.region === selectedRegionId) : [];
  const numDivisions = selectedRegion?.divisions || 1;
  const perDiv = numDivisions >= 2 ? Math.floor(rightTeams.length / numDivisions) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">大学野球 - リーグ・チーム選択</h1>
        <p className="text-gray-400 text-sm mb-5">リーグを選び、監督を務めるチームを選んでください</p>

        <div className="flex gap-5">
          {/* 左: リーグ一覧 */}
          <div className="w-64 flex-shrink-0 space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
            {UNIVERSITY_REGIONS.map(region => {
              const isActive = selectedRegionId === region.id;
              const teams = UNIVERSITY_TEAMS.filter(t => t.region === region.id);
              return (
                <button key={region.id}
                  onClick={() => {
                    setSelectedRegionId(region.id);
                    setSelectedTeam(null);
                  }}
                  className={`w-full rounded-lg p-3 text-left transition ${
                    isActive
                      ? 'bg-amber-900/40 border border-amber-500'
                      : 'bg-gray-800 border border-gray-700 hover:border-amber-500/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold ${isActive ? 'text-amber-400' : 'text-white'}`}>
                      {region.name}
                    </span>
                    <span className="text-xs text-gray-500">{teams.length}校</span>
                  </div>
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {['S','A','B','C','D'].map(r => {
                      const cnt = teams.filter(t => t.rank === r).length;
                      return cnt > 0 ? (
                        <span key={r} className={`text-xs ${RANK_COLORS[r]}`}>{r}:{cnt}</span>
                      ) : null;
                    })}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 右: チーム一覧 */}
          <div className="flex-1 min-h-[50vh]">
            {!selectedRegion ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <div className="text-4xl mb-3">🎓</div>
                  <div className="text-sm">左のリーグを選択してください</div>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-lg font-bold text-amber-400 mb-3">{selectedRegion.name}</h2>
                {numDivisions >= 2 ? (
                  Array.from({ length: numDivisions }, (_, d) => {
                    const divTeams = rightTeams.slice(d * perDiv, (d + 1) * perDiv);
                    return (
                      <div key={d} className={d < numDivisions - 1 ? 'mb-4' : ''}>
                        <h4 className={`text-xs font-bold mb-2 ${d === 0 ? 'text-amber-400' : 'text-gray-400'}`}>
                          {d + 1}部
                        </h4>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                          {divTeams.map(team => (
                            <button key={team.id}
                              onClick={() => setSelectedTeam(team)}
                              className={`p-3 rounded-lg border text-left transition ${
                                selectedTeam?.id === team.id
                                  ? 'border-amber-400 bg-amber-900/30'
                                  : 'border-gray-600 bg-gray-700/50 hover:border-amber-500/50 hover:bg-gray-700'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-white">{team.name}</span>
                                <span className={`text-xs font-bold ${RANK_COLORS[team.rank]}`}>
                                  {team.rank} <span className="font-normal text-gray-500">{RANK_LABELS[team.rank]}</span>
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {rightTeams.map(team => (
                      <button key={team.id}
                        onClick={() => setSelectedTeam(team)}
                        className={`p-3 rounded-lg border text-left transition ${
                          selectedTeam?.id === team.id
                            ? 'border-amber-400 bg-amber-900/30'
                            : 'border-gray-600 bg-gray-700/50 hover:border-amber-500/50 hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-white">{team.name}</span>
                          <span className={`text-xs font-bold ${RANK_COLORS[team.rank]}`}>
                            {team.rank} <span className="font-normal text-gray-500">{RANK_LABELS[team.rank]}</span>
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center mt-5">
          <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition">← 戻る</button>
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
