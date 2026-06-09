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
  const [expandedLeague, setExpandedLeague] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-2">大学野球 - リーグ・チーム選択</h1>
        <p className="text-gray-400 text-sm mb-6">リーグを選び、監督を務めるチームを選んでください</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {UNIVERSITY_REGIONS.map(region => {
            const teams = UNIVERSITY_TEAMS.filter(t => t.region === region.id);
            const isExpanded = expandedLeague === region.id;
            const numDivisions = region.divisions || 1;
            const perDiv = numDivisions >= 2 ? Math.floor(teams.length / numDivisions) : 0;

            return (
              <div key={region.id} className={`rounded-xl border transition ${
                isExpanded
                  ? 'border-amber-500 bg-gray-800 md:col-span-2'
                  : 'border-gray-700 bg-gray-800 hover:border-amber-500/50'
              }`}>
                <button
                  onClick={() => {
                    setExpandedLeague(isExpanded ? null : region.id);
                    if (isExpanded) setSelectedTeam(null);
                  }}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className={`text-base font-bold transition ${isExpanded ? 'text-amber-400' : 'text-white'}`}>
                      {region.name}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{teams.length}校</span>
                      <span className="text-gray-500 text-xs">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {!isExpanded && (
                    <div className="flex flex-wrap gap-1 text-xs">
                      {teams.map(t => (
                        <span key={t.id} className="bg-gray-700/50 px-1.5 py-0.5 rounded text-gray-400">
                          {t.name}<span className={`ml-1 ${RANK_COLORS[t.rank]}`}>{t.rank}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {numDivisions >= 2 && !isExpanded && (
                    <div className="text-xs text-gray-500 mt-1">
                      {Array.from({ length: numDivisions }, (_, d) => `${d + 1}部${perDiv}校`).join(' + ')}（入替制）
                    </div>
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4">
                    {numDivisions >= 2 ? (
                      Array.from({ length: numDivisions }, (_, d) => {
                        const divTeams = teams.slice(d * perDiv, (d + 1) * perDiv);
                        const divColor = d === 0 ? 'text-amber-400' : 'text-gray-400';
                        return (
                          <div key={d} className={d < numDivisions - 1 ? 'mb-3' : ''}>
                            <h4 className={`text-xs font-bold ${divColor} mb-1.5`}>{d + 1}部</h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {divTeams.map(team => (
                                <button key={team.id}
                                  onClick={(e) => { e.stopPropagation(); setSelectedTeam(team); }}
                                  className={`p-3 rounded-lg border text-left transition ${
                                    selectedTeam?.id === team.id
                                      ? 'border-amber-400 bg-amber-900/30'
                                      : 'border-gray-600 bg-gray-700/50 hover:border-amber-500/50 hover:bg-gray-700'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-bold text-white">{team.name}</span>
                                    <span className={`text-xs font-bold ${RANK_COLORS[team.rank]}`}>
                                      {team.rank}
                                    </span>
                                  </div>
                                  <div className="text-xs text-gray-500 mt-0.5">{RANK_LABELS[team.rank]}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {teams.map(team => (
                          <button key={team.id}
                            onClick={(e) => { e.stopPropagation(); setSelectedTeam(team); }}
                            className={`p-3 rounded-lg border text-left transition ${
                              selectedTeam?.id === team.id
                                ? 'border-amber-400 bg-amber-900/30'
                                : 'border-gray-600 bg-gray-700/50 hover:border-amber-500/50 hover:bg-gray-700'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-white">{team.name}</span>
                              <span className={`text-xs font-bold ${RANK_COLORS[team.rank]}`}>
                                {team.rank}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">{RANK_LABELS[team.rank]}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-between items-center mt-6">
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
