import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { TRAINING_MENUS, SUB_TRAINING_MENUS, executeTeamCampTraining, executeSubTraining, ALL_PITCH_TYPES, getPitchTypeName } from '../season/yearProgressionSystem.js';
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
  const [subAssignments, setSubAssignments] = useState(() => {
    const init = {};
    userTeam?.players?.forEach(p => {
      init[p.id] = 'running';
    });
    return init;
  });
  const [newPitchSelections, setNewPitchSelections] = useState({});
  const [roundResults, setRoundResults] = useState(null);
  const [viewMode, setViewMode] = useState('select');

  // ポジション順ソート: 投→捕→一→二→三→遊→左→中→右、同一ポジションは年齢降順
  const POSITION_ORDER = ['pitcher', 'catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  const sortedPlayers = [...(userTeam?.players || [])].sort((a, b) => {
    const posA = POSITION_ORDER.indexOf(a.position);
    const posB = POSITION_ORDER.indexOf(b.position);
    if (posA !== posB) return posA - posB;
    return (b.age || 20) - (a.age || 20);
  });

  const isPitcher = (player) => player.position === 'pitcher';

  // S~Fランク判定（能力値用）
  const getAbilityRank = (value, isVelocity = false, isStamina = false) => {
    let v = value;
    if (isVelocity) v = (value - 115) * 2.5;
    else if (isStamina) v = value / 2;
    if (v >= 90) return { rank: 'S', color: 'text-pink-400' };
    if (v >= 80) return { rank: 'A', color: 'text-red-400' };
    if (v >= 70) return { rank: 'B', color: 'text-orange-400' };
    if (v >= 60) return { rank: 'C', color: 'text-yellow-400' };
    if (v >= 50) return { rank: 'D', color: 'text-green-400' };
    if (v >= 40) return { rank: 'E', color: 'text-blue-400' };
    return { rank: 'F', color: 'text-gray-400' };
  };

  // 能力値をランク付きで表示するヘルパー
  const StatValue = ({ value, label, isVelocity = false, isStamina = false }) => {
    const { rank, color } = getAbilityRank(value, isVelocity, isStamina);
    return <span className={`${color} font-bold`} title={`${label}: ${value} (${rank})`}>{value}</span>;
  };

  const getMenusForPlayer = (player) => {
    // 全選手が全練習メニューを選択可能（投手も野手練習、野手も投手練習可能）
    const menus = {};
    Object.entries(TRAINING_MENUS).forEach(([key, menu]) => {
      menus[key] = menu;
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

  const handleSubAssignmentChange = (playerId, training) => {
    setSubAssignments(prev => ({ ...prev, [playerId]: training }));
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

    // サブ練習を実行
    updatedTeam.players.forEach(p => {
      const subType = subAssignments[p.id] || 'running';
      const { growthReport: subGrowth } = executeSubTraining(p, subType);
      const mainReport = allReports.find(r => r.player.id === p.id);
      if (mainReport && subGrowth.length > 0) {
        mainReport.subGrowthReport = subGrowth;
        mainReport.subTrainingType = subType;
      }
    });

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

  const getArsenalDisplay = (player) => {
    const arsenal = (player.pitching?.arsenal || []).filter(a => a.type !== 'straight');
    if (arsenal.length === 0) return '-';
    return arsenal.map(a => `${getPitchTypeName(a.type)}${a.level}`).join(' ');
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

            {/* 選手リスト（1行グリッド、ポジション順ソート、S~Fランク色分け） */}
            <div className="bg-gray-800 rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-700 text-gray-300 text-xs">
                    <th className="py-2 px-2 text-left w-20">選手</th>
                    <th className="py-2 px-1 text-center w-8">位</th>
                    <th className="py-2 px-1 text-center w-8">齢</th>
                    <th className="py-2 px-1 text-center w-8">ミ</th>
                    <th className="py-2 px-1 text-center w-8">パ</th>
                    <th className="py-2 px-1 text-center w-8">走</th>
                    <th className="py-2 px-1 text-center w-8">肩</th>
                    <th className="py-2 px-1 text-center w-8">守</th>
                    <th className="py-2 px-1 text-center w-8">眼</th>
                    <th className="py-2 px-1 text-center w-10">球速</th>
                    <th className="py-2 px-1 text-center w-8">制</th>
                    <th className="py-2 px-1 text-center w-10">スタ</th>
                    <th className="py-2 px-2 text-left">変化球</th>
                    <th className="py-2 px-2 text-left w-36">メイン練習</th>
                    <th className="py-2 px-2 text-left w-36">サブ練習</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map(player => {
                    const b = player.batting || {};
                    const p = player.pitching || {};
                    const ph = player.physical || {};
                    const f = player.fielding || {};
                    const menus = getMenusForPlayer(player);
                    const currentTraining = assignments[player.id] || (isPitcher(player) ? 'stamina' : 'batting');
                    const showNewPitchSelect = currentTraining === 'newpitch';
                    const availableNewPitches = getAvailableNewPitches(player);

                    return (
                      <tr key={player.id} className="border-b border-gray-700 hover:bg-gray-750">
                        <td className="py-1 px-2">
                          <span className={`font-bold ${isPitcher(player) ? 'text-red-400' : 'text-blue-300'}`}>
                            {player.name}
                          </span>
                        </td>
                        <td className="py-1 px-1 text-center">
                          <span className="text-xs text-gray-400">{POSITION_NAMES[player.position] || player.position}</span>
                        </td>
                        <td className="py-1 px-1 text-center text-gray-400 text-xs">{player.age || 20}</td>
                        <td className="py-1 px-1 text-center text-xs font-mono"><StatValue value={b.meet||0} label="ミート" /></td>
                        <td className="py-1 px-1 text-center text-xs font-mono"><StatValue value={b.power||0} label="パワー" /></td>
                        <td className="py-1 px-1 text-center text-xs font-mono"><StatValue value={ph.speed||0} label="走力" /></td>
                        <td className="py-1 px-1 text-center text-xs font-mono"><StatValue value={ph.arm||0} label="肩力" /></td>
                        <td className="py-1 px-1 text-center text-xs font-mono"><StatValue value={f.defense||0} label="守備" /></td>
                        <td className="py-1 px-1 text-center text-xs font-mono"><StatValue value={b.eye||0} label="選球眼" /></td>
                        <td className="py-1 px-1 text-center text-xs font-mono"><StatValue value={p.velocity||0} label="球速" isVelocity={true} /></td>
                        <td className="py-1 px-1 text-center text-xs font-mono"><StatValue value={p.control||0} label="制球" /></td>
                        <td className="py-1 px-1 text-center text-xs font-mono"><StatValue value={p.stamina||0} label="スタミナ" isStamina={true} /></td>
                        <td className="py-1 px-2 text-yellow-400 text-xs font-mono truncate max-w-[140px]">{getArsenalDisplay(player)}</td>
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
                        <td className="py-1 px-2">
                          <select
                            value={subAssignments[player.id] || 'running'}
                            onChange={(e) => handleSubAssignmentChange(player.id, e.target.value)}
                            className="bg-gray-700 text-white text-xs px-2 py-1 rounded w-28"
                          >
                            {Object.entries(SUB_TRAINING_MENUS).map(([key, menu]) => (
                              <option key={key} value={key}>{menu.icon} {menu.name}</option>
                            ))}
                          </select>
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
                    <th className="py-1 px-2 text-left">メイン</th>
                    <th className="py-1 px-2 text-left">メイン結果</th>
                    <th className="py-1 px-2 text-left">サブ結果</th>
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
                      <td className="py-1 px-2">
                        <div className="flex flex-wrap gap-1">
                          {(result.subGrowthReport || []).map((growth, gIdx) => (
                            <span
                              key={gIdx}
                              className={`px-2 py-0.5 rounded text-xs ${
                                growth.isAwakening
                                  ? 'bg-yellow-500 text-black font-bold'
                                  : growth.growth > 0
                                    ? 'bg-teal-700 text-white'
                                    : growth.growth < 0
                                      ? 'bg-red-700 text-white'
                                      : 'bg-gray-600 text-gray-300'
                              }`}
                            >
                              {growth.statName}: {growth.before}→{growth.after}
                              {growth.growth > 0 && ` (+${growth.growth})`}
                              {growth.growth < 0 && ` (${growth.growth})`}
                              {growth.isAwakening && ' 覚醒!'}
                            </span>
                          ))}
                          {(!result.subGrowthReport || result.subGrowthReport.length === 0) && (
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
