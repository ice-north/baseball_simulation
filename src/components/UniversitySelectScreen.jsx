import React, { useState } from 'react';
import { UNIVERSITY_TEAMS, UNIVERSITY_REGIONS } from '../university/universityTeamsData.js';

const RANK_COLORS = {
  S: 'text-yellow-400',
  A: 'text-red-400',
  B: 'text-blue-400',
  C: 'text-green-400',
  D: 'text-gray-300',
};

const RANK_LABELS = {
  S: '超強豪', A: '強豪', B: '中堅', C: '育成型', D: '新興',
};

const RANK_BG = {
  S: 'bg-yellow-500/20 border-yellow-500/40',
  A: 'bg-red-500/20 border-red-500/40',
  B: 'bg-blue-500/20 border-blue-500/40',
  C: 'bg-green-500/20 border-green-500/40',
  D: 'bg-gray-500/20 border-gray-500/40',
};

const RANK_ORDER = { S: 0, A: 1, B: 2, C: 3, D: 4 };
const getBestRank = (teams) => teams.reduce((best, t) => RANK_ORDER[t.rank] < RANK_ORDER[best] ? t.rank : best, 'D');

const UniversityTeamSelectScreen = ({ onSelect, onBack }) => {
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);

  if (!selectedRegion) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2">リーグ選択</h1>
          <p className="text-gray-300 text-sm mb-6">所属するリーグを選んでください</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {UNIVERSITY_REGIONS.map(region => {
              const teams = UNIVERSITY_TEAMS.filter(t => t.region === region.id);
              const numDivisions = region.divisions || 1;
              const perDiv = numDivisions >= 2 ? Math.floor(teams.length / numDivisions) : 0;
              const leagueRank = getBestRank(teams);
              return (
                <button key={region.id}
                  onClick={() => setSelectedRegion(region)}
                  className="bg-surface-2 hover:bg-gray-700 border border-gray-700 hover:border-amber-500 rounded-xl p-4 text-left transition group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-base font-bold text-white group-hover:text-amber-400 transition truncate mr-2">{region.name}</div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm font-bold px-1.5 py-0.5 rounded border ${RANK_BG[leagueRank]} ${RANK_COLORS[leagueRank]}`}>{leagueRank}</span>
                      <span className="text-xs text-gray-400">{teams.length}校</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 text-xs">
                    {teams.map(t => (
                      <span key={t.id} className="bg-gray-700/50 px-1.5 py-0.5 rounded text-gray-300">
                        {t.name}<span className={`ml-1 ${RANK_COLORS[t.rank]}`}>{t.rank}</span>
                      </span>
                    ))}
                  </div>
                  {numDivisions >= 2 && (
                    <div className="text-xs text-gray-400 mt-1">
                      {Array.from({ length: numDivisions }, (_, d) => `${d + 1}部${perDiv}校`).join(' + ')}（入替制）
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="text-center mt-6">
            <button onClick={onBack} className="text-gray-300 hover:text-white text-sm transition">← 戻る</button>
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
      className={`bg-surface-2 hover:bg-gray-700 border rounded-lg p-4 text-left transition group ${
        selectedTeam?.id === team.id ? 'border-amber-400 bg-gray-700' : 'border-gray-700 hover:border-amber-500'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-base font-bold text-white group-hover:text-amber-400 transition">{team.name}</div>
        <span className={`text-sm font-bold ${RANK_COLORS[team.rank]}`}>{team.rank}</span>
      </div>
      <div className="text-xs text-gray-400 mt-1">{RANK_LABELS[team.rank]}</div>
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-1">{selectedRegion.name}</h1>
        <p className="text-gray-300 text-sm mb-6">監督を務めるチームを選んでください</p>

        {hasDivisions ? (
          <>
            {Array.from({ length: numDivisions }, (_, d) => {
              const divTeams = teams.slice(d * perDiv, (d + 1) * perDiv);
              const divColor = d === 0 ? 'text-amber-400' : 'text-gray-300';
              return (
                <div key={d}>
                  <h3 className={`text-sm font-bold ${divColor} mb-2`}>{d + 1}部</h3>
                  <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${d < numDivisions - 1 ? 'mb-4' : 'mb-6'}`}>
                    {divTeams.map(renderTeamButton)}
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            {teams.map(renderTeamButton)}
          </div>
        )}

        <div className="flex justify-between items-center">
          <button onClick={() => { setSelectedRegion(null); setSelectedTeam(null); }}
            className="text-gray-300 hover:text-white text-sm transition">← リーグ選択に戻る</button>
          {selectedTeam && (
            <button onClick={() => onSelect(selectedTeam)}
              className="btn-warn px-6 py-2 rounded-lg transition">
              {selectedTeam.name}で始める
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UniversityTeamSelectScreen;
