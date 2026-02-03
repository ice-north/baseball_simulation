import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { TRAINING_MENUS, executeTeamCampTraining } from '../season/yearProgressionSystem.js';

const MAX_CAMP_ROUNDS = 4;

const CampScreen = ({ onComplete, allTeams, seasonData }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || 'チームA';
  const userTeam = TEAMS_DATA[userTeamName];

  const [currentRound, setCurrentRound] = useState(1);
  const [selectedTraining, setSelectedTraining] = useState('batting');
  const [roundResults, setRoundResults] = useState(null); // current round results
  const [allRoundResults, setAllRoundResults] = useState([]); // history of all rounds
  const [viewMode, setViewMode] = useState('select'); // 'select' | 'results'

  const handleExecuteTraining = () => {
    if (!userTeam || !userTeam.players) return;

    const assignments = {};
    userTeam.players.forEach(p => {
      if (p.position === 'pitcher') {
        assignments[p.id] = ['stamina', 'control', 'velocity'].includes(selectedTraining)
          ? selectedTraining : 'stamina';
      } else {
        assignments[p.id] = ['batting', 'baserunning', 'fielding', 'eye'].includes(selectedTraining)
          ? selectedTraining : 'batting';
      }
    });

    const { updatedTeam, allReports } = executeTeamCampTraining(userTeam, assignments);
    TEAMS_DATA[userTeamName] = updatedTeam;

    // AIチームも練習を実行
    teamNames.forEach(tn => {
      if (tn === userTeamName) return;
      const aiTeam = TEAMS_DATA[tn];
      if (!aiTeam?.players) return;
      const aiAssign = {};
      const menus = ['batting', 'baserunning', 'fielding', 'stamina', 'control', 'velocity'];
      aiTeam.players.forEach(p => {
        if (p.position === 'pitcher') {
          aiAssign[p.id] = menus[Math.floor(Math.random() * 3) + 3]; // stamina/control/velocity
        } else {
          aiAssign[p.id] = menus[Math.floor(Math.random() * 3)]; // batting/baserunning/fielding
        }
      });
      const aiResult = executeTeamCampTraining(aiTeam, aiAssign);
      TEAMS_DATA[tn] = aiResult.updatedTeam;
    });

    setRoundResults(allReports);
    setAllRoundResults(prev => [...prev, { round: currentRound, training: selectedTraining, reports: allReports }]);
    setViewMode('results');
  };

  const handleNextRound = () => {
    if (currentRound >= MAX_CAMP_ROUNDS) return;
    setCurrentRound(currentRound + 1);
    setRoundResults(null);
    setViewMode('select');
  };

  const getPlayerStats = (player) => {
    const b = player.batting || {};
    const p = player.pitching || {};
    const ph = player.physical || {};
    const f = player.fielding || {};
    if (player.position === 'pitcher') {
      return `球速${p.velocity || 0} 制球${p.control || 0} スタ${p.stamina || 0}`;
    }
    return `ミ${b.meet || 0} パ${b.power || 0} 走${ph.speed || 0} 肩${ph.arm || 0} 守${f.defense || 0}`;
  };

  return (
    <div className="p-6 bg-gray-900 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">春季キャンプ</h1>
          <div className="flex items-center gap-4">
            {[1, 2, 3, 4].map(r => (
              <div key={r} className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                r < currentRound ? 'bg-green-600 text-white'
                  : r === currentRound ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                  : 'bg-gray-700 text-gray-400'
              }`}>{r}</div>
            ))}
            <span className="text-gray-400 text-sm">クール {currentRound}/{MAX_CAMP_ROUNDS}</span>
          </div>
        </div>

        {viewMode === 'select' ? (
          <>
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4">練習メニューを選択（第{currentRound}クール）</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(TRAINING_MENUS).map(([key, menu]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedTraining(key)}
                    className={`p-4 rounded-lg transition text-left ${
                      selectedTraining === key
                        ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <div className="text-2xl mb-1">{menu.icon}</div>
                    <div className="font-bold text-sm">{menu.name}</div>
                    <div className="text-xs opacity-80">{menu.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-lg font-bold text-white mb-3">選手一覧</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                {userTeam?.players?.map(player => (
                  <div key={player.id} className="bg-gray-700 rounded p-2 text-sm">
                    <div className="text-white font-medium">{player.name}</div>
                    <div className="text-gray-400 text-xs">
                      {player.position === 'pitcher' ? '投手' : '野手'} | {player.age}歳
                    </div>
                    <div className="text-cyan-400 text-xs">{getPlayerStats(player)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={handleExecuteTraining}
                className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-4 rounded-lg font-bold text-xl transition"
              >
                練習を実行する
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4">第{currentRound}クール 練習結果</h2>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {roundResults?.map((result, idx) => (
                  <div key={idx} className="bg-gray-700 rounded p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-white font-medium">{result.player.name}</div>
                      <div className="text-gray-400 text-sm">{TRAINING_MENUS[result.trainingType]?.name}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {result.growthReport.map((growth, gIdx) => (
                        <span
                          key={gIdx}
                          className={`px-2 py-1 rounded text-xs ${
                            growth.isAwakening
                              ? 'bg-yellow-500 text-black font-bold'
                              : growth.after > growth.before
                                ? 'bg-green-700 text-white'
                                : 'bg-gray-600 text-gray-300'
                          }`}
                        >
                          {growth.statName}: {growth.before}→{growth.after}
                          {growth.isAwakening && ' 覚醒!'}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-center">
              {currentRound < MAX_CAMP_ROUNDS ? (
                <button
                  onClick={handleNextRound}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-4 rounded-lg font-bold text-xl transition"
                >
                  次のクールへ（第{currentRound + 1}クール）
                </button>
              ) : (
                <button
                  onClick={onComplete}
                  className="bg-green-600 hover:bg-green-700 text-white px-12 py-4 rounded-lg font-bold text-xl transition"
                >
                  キャンプ終了 → シーズン開始（3月）
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CampScreen;
