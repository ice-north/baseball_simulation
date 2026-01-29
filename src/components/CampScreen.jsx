import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { TRAINING_MENUS, executeTeamCampTraining } from '../season/yearProgressionSystem.js';

const CampScreen = ({ onComplete, allTeams }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || 'チームA';
  const userTeam = TEAMS_DATA[userTeamName];

  const [selectedTraining, setSelectedTraining] = useState('batting');
  const [trainingResults, setTrainingResults] = useState(null);
  const [isTrainingComplete, setIsTrainingComplete] = useState(false);

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
    setTrainingResults(allReports);
    setIsTrainingComplete(true);
  };

  const getPlayerExp = (player) => player.experience || 0;

  return (
    <div className="p-8 bg-gray-900 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">🏕️ 春季キャンプ</h1>

        {!isTrainingComplete ? (
          <>
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4">練習メニューを選択</h2>
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
              <h2 className="text-xl font-bold text-white mb-4">📊 選手経験値一覧</h2>
              <p className="text-gray-400 text-sm mb-4">
                経験値が多いほど覚醒（爆発成長）の可能性が上がります。経験10につき覚醒確率+1%
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                {userTeam?.players?.map(player => (
                  <div key={player.id} className="bg-gray-700 rounded p-2 text-sm">
                    <div className="text-white font-medium">{player.name}</div>
                    <div className="text-gray-400 text-xs">
                      {player.position === 'pitcher' ? '投手' : '野手'} | {player.age}歳
                    </div>
                    <div className="text-yellow-400 text-xs">
                      経験値: {getPlayerExp(player)} (覚醒{Math.floor(getPlayerExp(player) / 10)}%)
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={handleExecuteTraining}
                className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-4 rounded-lg font-bold text-xl transition"
              >
                🏋️ 練習を実行する
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4">📈 練習結果</h2>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {trainingResults?.map((result, idx) => (
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
                              : 'bg-green-700 text-white'
                          }`}
                        >
                          {growth.statName}: {growth.before}→{growth.after}
                          {growth.isAwakening && ' 🌟覚醒!'}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={onComplete}
                className="bg-green-600 hover:bg-green-700 text-white px-12 py-4 rounded-lg font-bold text-xl transition"
              >
                キャンプ終了 - シーズン開始
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CampScreen;
