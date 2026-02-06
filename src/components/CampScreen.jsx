import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { TRAINING_MENUS, executeTeamCampTraining, ALL_PITCH_TYPES, getPitchTypeName } from '../season/yearProgressionSystem.js';
import { POSITION_NAMES } from '../utils/constants.js';

const MAX_CAMP_ROUNDS = 4;

const CampScreen = ({ onComplete, allTeams, seasonData }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || 'チームA';
  const userTeam = TEAMS_DATA[userTeamName];

  const [currentRound, setCurrentRound] = useState(1);
  const [assignments, setAssignments] = useState(() => {
    const init = {};
    userTeam?.players?.forEach(p => {
      init[p.id] = p.position === 'pitcher' ? 'stamina' : 'batting';
    });
    return init;
  });
  const [newPitchSelections, setNewPitchSelections] = useState({});
  const [roundResults, setRoundResults] = useState(null);
  const [viewMode, setViewMode] = useState('select');

  const isPitcher = (player) => player.position === 'pitcher';

  const getMenusForPlayer = (player) => {
    const menus = {};
    Object.entries(TRAINING_MENUS).forEach(([key, menu]) => {
      if (isPitcher(player)) {
        if (['stamina', 'control', 'velocity', 'fielding', 'breaking', 'newpitch'].includes(key)) {
          menus[key] = menu;
        }
      } else {
        if (['batting', 'baserunning', 'fielding', 'eye'].includes(key)) {
          menus[key] = menu;
        }
      }
    });
    return menus;
  };

  const getAvailableNewPitches = (player) => {
    const existing = (player.pitching?.arsenal || []).map(p => p.type);
    return ALL_PITCH_TYPES.filter(t => !existing.includes(t));
  };

  const handleAssignmentChange = (playerId, training) => {
    setAssignments(prev => ({ ...prev, [playerId]: training }));
  };

  const handleNewPitchSelect = (playerId, pitchType) => {
    setNewPitchSelections(prev => ({ ...prev, [playerId]: pitchType }));
  };

  const setAllTraining = (training) => {
    const updated = {};
    userTeam?.players?.forEach(p => {
      const menus = getMenusForPlayer(p);
      if (menus[training]) {
        updated[p.id] = training;
      } else {
        updated[p.id] = assignments[p.id] || (isPitcher(p) ? 'stamina' : 'batting');
      }
    });
    setAssignments(updated);
  };

  const handleExecuteTraining = () => {
    if (!userTeam || !userTeam.players) return;

    const finalAssignments = {};
    userTeam.players.forEach(p => {
      finalAssignments[p.id] = assignments[p.id] || (isPitcher(p) ? 'stamina' : 'batting');
    });

    const { updatedTeam, allReports } = executeTeamCampTraining(
      userTeam, finalAssignments, newPitchSelections
    );
    TEAMS_DATA[userTeamName] = updatedTeam;

    // AIチームも練習
    teamNames.forEach(tn => {
      if (tn === userTeamName) return;
      const aiTeam = TEAMS_DATA[tn];
      if (!aiTeam?.players) return;
      const aiAssign = {};
      const pitcherMenus = ['stamina', 'control', 'velocity', 'breaking'];
      const batterMenus = ['batting', 'baserunning', 'fielding', 'eye'];
      aiTeam.players.forEach(p => {
        if (p.position === 'pitcher') {
          aiAssign[p.id] = pitcherMenus[Math.floor(Math.random() * pitcherMenus.length)];
        } else {
          aiAssign[p.id] = batterMenus[Math.floor(Math.random() * batterMenus.length)];
        }
      });
      const aiResult = executeTeamCampTraining(aiTeam, aiAssign);
      TEAMS_DATA[tn] = aiResult.updatedTeam;
    });

    setRoundResults(allReports);
    setViewMode('results');
  };

  const handleNextRound = () => {
    if (currentRound >= MAX_CAMP_ROUNDS) return;
    setCurrentRound(currentRound + 1);
    setRoundResults(null);
    setViewMode('select');
    // 練習割り当てを更新後の選手データで再初期化
    const team = TEAMS_DATA[userTeamName];
    const init = {};
    team?.players?.forEach(p => {
      init[p.id] = assignments[p.id] || (p.position === 'pitcher' ? 'stamina' : 'batting');
    });
    setAssignments(init);
  };

  const getStatDisplay = (player) => {
    const b = player.batting || {};
    const p = player.pitching || {};
    const ph = player.physical || {};
    const f = player.fielding || {};
    if (isPitcher(player)) {
      const arsenal = (p.arsenal || []).filter(a => a.type !== 'straight');
      const pitchStr = arsenal.map(a => `${getPitchTypeName(a.type)}${a.level}`).join(' ');
      return { main: `球${p.velocity||0} 制${p.control||0} ス${p.stamina||0}`, sub: pitchStr || '-' };
    }
    return { main: `ミ${b.meet||0} パ${b.power||0} 走${ph.speed||0} 肩${ph.arm||0} 守${f.defense||0}`, sub: `眼${b.eye||0} 盗${b.steal||0}` };
  };

  return (
    <div className="p-4 bg-gray-900 min-h-screen">
      <div className="max-w-full mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">春季キャンプ - {userTeamName}</h1>
          <div className="flex items-center gap-3">
            {[1, 2, 3, 4].map(r => (
              <div key={r} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
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
            {/* 一括設定ボタン */}
            <div className="bg-gray-800 rounded-lg p-3 mb-3">
              <span className="text-gray-400 text-sm mr-3">一括設定:</span>
              {Object.entries(TRAINING_MENUS).filter(([k]) => !['newpitch'].includes(k)).map(([key, menu]) => (
                <button
                  key={key}
                  onClick={() => setAllTraining(key)}
                  className="px-2 py-1 mr-1 mb-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition"
                >
                  {menu.icon} {menu.name}
                </button>
              ))}
            </div>

            {/* 選手リスト（1行グリッド） */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-700 text-gray-300 text-xs">
                    <th className="py-2 px-2 text-left w-20">選手</th>
                    <th className="py-2 px-1 text-center w-10">位</th>
                    <th className="py-2 px-1 text-center w-8">齢</th>
                    <th className="py-2 px-2 text-left">能力値</th>
                    <th className="py-2 px-2 text-left">変化球/サブ</th>
                    <th className="py-2 px-2 text-left w-48">練習メニュー</th>
                  </tr>
                </thead>
                <tbody>
                  {userTeam?.players?.map(player => {
                    const stats = getStatDisplay(player);
                    const menus = getMenusForPlayer(player);
                    const currentTraining = assignments[player.id] || 'batting';
                    const showNewPitchSelect = currentTraining === 'newpitch';
                    const availableNewPitches = getAvailableNewPitches(player);

                    return (
                      <tr key={player.id} className="border-b border-gray-700 hover:bg-gray-750">
                        <td className="py-1 px-2">
                          <span className={`font-bold text-white ${isPitcher(player) ? 'text-red-400' : 'text-blue-300'}`}>
                            {player.name}
                          </span>
                        </td>
                        <td className="py-1 px-1 text-center">
                          <span className="text-xs text-gray-400">{POSITION_NAMES[player.position] || player.position}</span>
                        </td>
                        <td className="py-1 px-1 text-center text-gray-400 text-xs">{player.age || 20}</td>
                        <td className="py-1 px-2 text-cyan-400 text-xs font-mono">{stats.main}</td>
                        <td className="py-1 px-2 text-yellow-400 text-xs font-mono">{stats.sub}</td>
                        <td className="py-1 px-2">
                          <div className="flex items-center gap-1">
                            <select
                              value={currentTraining}
                              onChange={(e) => handleAssignmentChange(player.id, e.target.value)}
                              className="bg-gray-700 text-white text-xs px-2 py-1 rounded w-28"
                            >
                              {Object.entries(menus).map(([key, menu]) => (
                                <option key={key} value={key}>{menu.icon} {menu.name}</option>
                              ))}
                            </select>
                            {showNewPitchSelect && availableNewPitches.length > 0 && (
                              <select
                                value={newPitchSelections[player.id] || availableNewPitches[0]}
                                onChange={(e) => handleNewPitchSelect(player.id, e.target.value)}
                                className="bg-gray-600 text-white text-xs px-2 py-1 rounded w-28"
                              >
                                {availableNewPitches.map(pt => (
                                  <option key={pt} value={pt}>{getPitchTypeName(pt)}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-center mt-4">
              <button
                onClick={handleExecuteTraining}
                className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-3 rounded-lg font-bold text-lg transition"
              >
                第{currentRound}クール練習を実行する
              </button>
            </div>
          </>
        ) : (
          <>
            {/* 練習結果 */}
            <div className="bg-gray-800 rounded-lg overflow-hidden mb-4">
              <div className="p-3 bg-gray-700">
                <h2 className="text-lg font-bold text-white">第{currentRound}クール 練習結果</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-700 text-gray-300 text-xs">
                    <th className="py-1 px-2 text-left">選手</th>
                    <th className="py-1 px-2 text-left">練習</th>
                    <th className="py-1 px-2 text-left">成長結果</th>
                  </tr>
                </thead>
                <tbody>
                  {roundResults?.map((result, idx) => (
                    <tr key={idx} className="border-b border-gray-700">
                      <td className="py-1 px-2">
                        <span className={`font-bold ${isPitcher(result.player) ? 'text-red-400' : 'text-blue-300'}`}>
                          {result.player.name}
                        </span>
                      </td>
                      <td className="py-1 px-2 text-gray-400 text-xs">
                        {TRAINING_MENUS[result.trainingType]?.icon} {TRAINING_MENUS[result.trainingType]?.name}
                      </td>
                      <td className="py-1 px-2">
                        <div className="flex flex-wrap gap-1">
                          {result.growthReport.map((growth, gIdx) => (
                            <span
                              key={gIdx}
                              className={`px-2 py-0.5 rounded text-xs ${
                                growth.isAwakening
                                  ? 'bg-yellow-500 text-black font-bold'
                                  : growth.growth > 0
                                    ? 'bg-green-700 text-white'
                                    : 'bg-gray-600 text-gray-300'
                              }`}
                            >
                              {growth.statName}: {growth.before}→{growth.after}
                              {growth.growth > 0 && ` (+${growth.growth})`}
                              {growth.isAwakening && ' 覚醒!'}
                            </span>
                          ))}
                          {result.growthReport.length === 0 && (
                            <span className="text-gray-500 text-xs">変化なし</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-center">
              {currentRound < MAX_CAMP_ROUNDS ? (
                <button
                  onClick={handleNextRound}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-3 rounded-lg font-bold text-lg transition"
                >
                  次のクールへ（第{currentRound + 1}クール）
                </button>
              ) : (
                <button
                  onClick={onComplete}
                  className="bg-green-600 hover:bg-green-700 text-white px-12 py-3 rounded-lg font-bold text-lg transition"
                >
                  キャンプ終了 → シーズン開始
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
