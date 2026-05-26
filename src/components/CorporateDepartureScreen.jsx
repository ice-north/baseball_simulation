import React, { useState, useEffect, useMemo } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES, getAbilityColor } from '../utils/constants.js';
import { processCorporateRetirements, executeDepartures } from '../corporate/scoutingSystem.js';

const CorporateDepartureScreen = ({ seasonData, allTeams, onComplete }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || '';
  const [retirements, setRetirements] = useState([]);
  const [aiReleases, setAiReleases] = useState({});
  const [userReleases, setUserReleases] = useState([]);
  const [processed, setProcessed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (processed) return;
    const result = processCorporateRetirements(TEAMS_DATA, userTeamName);
    setRetirements(result.retirements);
    setAiReleases(result.aiReleases);
    setProcessed(true);
  }, []);

  const teamData = TEAMS_DATA[userTeamName];
  const players = teamData?.players || [];

  // ユーザーチームの引退選手
  const userRetiredIds = new Set(retirements.filter(r => r.team === userTeamName).map(r => r.id));
  const activePlayers = players.filter(p => !userRetiredIds.has(p.id));

  const getSortValue = (player, key) => {
    const isPitcher = player.position === 'pitcher';
    switch (key) {
      case 'name': return player.name;
      case 'age': return player.age || 0;
      case 'position': return POSITION_NAMES[player.position] || '';
      case 'meet': return player.batting?.meet || 0;
      case 'power': return player.batting?.power || 0;
      case 'speed': return player.physical?.speed || 0;
      case 'defense': return player.fielding?.defense || 0;
      case 'velocity': return player.pitching?.velocity || 0;
      case 'control': return player.pitching?.control || 0;
      case 'stamina': return player.pitching?.stamina || 0;
      case 'games': return isPitcher ? (player.seasonStats?.pitching?.games || 0) : (player.seasonStats?.batting?.games || 0);
      default: return 0;
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sortedPlayers = useMemo(() => {
    if (!sortKey) return activePlayers;
    return [...activePlayers].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
  }, [activePlayers, sortKey, sortAsc]);

  const toggleRelease = (playerId) => {
    if (userReleases.includes(playerId)) {
      setUserReleases(userReleases.filter(id => id !== playerId));
    } else {
      setUserReleases([...userReleases, playerId]);
    }
  };

  const handleConfirm = () => {
    const currentYear = seasonData?.year || 1;
    const allReleases = { ...aiReleases };
    if (userReleases.length > 0) {
      allReleases[userTeamName] = userReleases;
    }

    executeDepartures(TEAMS_DATA, retirements.map(r => r.id), allReleases, currentYear);
    setConfirmed(true);
  };

  const SortHeader = ({ label, sortKeyVal, className = '' }) => (
    <th
      className={`py-1 px-1 cursor-pointer hover:text-white hover:bg-gray-600 transition select-none text-[10px] ${sortKey === sortKeyVal ? 'bg-gray-600 text-white' : ''} ${className}`}
      onClick={() => handleSort(sortKeyVal)}
    >
      {label}{sortKey === sortKeyVal ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  const totalAiReleases = Object.values(aiReleases).reduce((sum, arr) => sum + arr.length, 0);
  const totalRetirements = retirements.length;

  if (confirmed) {
    return (
      <div className="p-4 bg-gray-900 min-h-screen">
        <h1 className="text-xl font-bold text-white mb-3">退団処理完了</h1>
        {totalRetirements > 0 && (
          <div className="mb-4">
            <h2 className="text-sm font-bold text-yellow-400 mb-2">引退選手 ({totalRetirements}名)</h2>
            <div className="grid grid-cols-2 gap-1">
              {retirements.map(r => (
                <div key={r.id} className="text-xs text-gray-300 bg-gray-800 p-1 rounded">
                  <span className="text-yellow-300">{POSITION_NAMES[r.position]}</span> {r.name}
                  <span className="text-gray-500 ml-1">({r.age}歳・{r.team})</span>
                  <span className="text-gray-500 ml-1">{r.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {(userReleases.length > 0 || totalAiReleases > 0) && (
          <div className="mb-4">
            <h2 className="text-sm font-bold text-red-400 mb-2">戦力外通告 ({userReleases.length + totalAiReleases}名)</h2>
            <p className="text-xs text-gray-400 mb-1">
              自チーム: {userReleases.length}名 / 他チーム: {totalAiReleases}名
            </p>
          </div>
        )}
        <button
          onClick={onComplete}
          className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold"
        >
          スカウト入団へ進む
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 bg-gray-900 min-h-screen">
      <h1 className="text-xl font-bold text-white mb-1">退団 - {seasonData?.year || 1}年目 11月末</h1>
      <p className="text-gray-400 text-xs mb-1">戦力外にする選手をクリックしてください。引退選手は自動で退団します。</p>

      {totalRetirements > 0 && (
        <div className="mb-2 p-2 bg-yellow-900/30 border border-yellow-700 rounded">
          <p className="text-yellow-400 text-xs font-bold">
            引退: {retirements.filter(r => r.team === userTeamName).map(r => r.name).join('、') || 'なし'}
            {retirements.filter(r => r.team !== userTeamName).length > 0 &&
              ` (他チーム${retirements.filter(r => r.team !== userTeamName).length}名)`}
          </p>
        </div>
      )}

      {totalAiReleases > 0 && (
        <p className="text-xs text-gray-500 mb-2">他チーム自動戦力外: {totalAiReleases}名</p>
      )}

      <div className="overflow-x-auto mb-3">
        <table className="w-full text-[10px] text-gray-300 border-collapse">
          <thead className="bg-gray-800 text-gray-400">
            <tr>
              <th className="py-1 px-1 w-4"></th>
              <SortHeader label="名前" sortKeyVal="name" />
              <SortHeader label="年齢" sortKeyVal="age" />
              <SortHeader label="守" sortKeyVal="position" />
              <SortHeader label="ミ" sortKeyVal="meet" />
              <SortHeader label="パ" sortKeyVal="power" />
              <SortHeader label="走" sortKeyVal="speed" />
              <SortHeader label="守備" sortKeyVal="defense" />
              <SortHeader label="球速" sortKeyVal="velocity" />
              <SortHeader label="制球" sortKeyVal="control" />
              <SortHeader label="ス" sortKeyVal="stamina" />
              <SortHeader label="試合" sortKeyVal="games" />
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map(player => {
              const isReleased = userReleases.includes(player.id);
              const isPitcher = player.position === 'pitcher';
              const games = isPitcher
                ? (player.seasonStats?.pitching?.games || 0)
                : (player.seasonStats?.batting?.games || 0);
              return (
                <tr
                  key={player.id}
                  onClick={() => toggleRelease(player.id)}
                  className={`cursor-pointer border-b border-gray-800 transition ${
                    isReleased ? 'bg-red-900/40 line-through opacity-60' : 'hover:bg-gray-800'
                  }`}
                >
                  <td className="py-0.5 px-1 text-center">
                    {isReleased && <span className="text-red-400">×</span>}
                  </td>
                  <td className="py-0.5 px-1 font-medium">{player.name}</td>
                  <td className="py-0.5 px-1 text-center">{player.age}</td>
                  <td className="py-0.5 px-1 text-center">{POSITION_NAMES[player.position]}</td>
                  <td className={`py-0.5 px-1 text-center ${isPitcher ? 'text-gray-600' : getAbilityColor(player.batting?.meet)}`}>
                    {player.batting?.meet || 0}
                  </td>
                  <td className={`py-0.5 px-1 text-center ${isPitcher ? 'text-gray-600' : getAbilityColor(player.batting?.power)}`}>
                    {player.batting?.power || 0}
                  </td>
                  <td className={`py-0.5 px-1 text-center ${getAbilityColor(player.physical?.speed)}`}>
                    {player.physical?.speed || 0}
                  </td>
                  <td className={`py-0.5 px-1 text-center ${getAbilityColor(player.fielding?.defense)}`}>
                    {player.fielding?.defense || 0}
                  </td>
                  <td className={`py-0.5 px-1 text-center ${!isPitcher ? 'text-gray-600' : getAbilityColor((player.pitching?.velocity - 120) * 1.5)}`}>
                    {player.pitching?.velocity || '-'}
                  </td>
                  <td className={`py-0.5 px-1 text-center ${!isPitcher ? 'text-gray-600' : getAbilityColor(player.pitching?.control)}`}>
                    {player.pitching?.control || '-'}
                  </td>
                  <td className={`py-0.5 px-1 text-center ${!isPitcher ? 'text-gray-600' : ''}`}>
                    {isPitcher ? (player.pitching?.stamina || 0) : '-'}
                  </td>
                  <td className="py-0.5 px-1 text-center">{games}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleConfirm}
          className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-sm"
        >
          退団を確定 ({userReleases.length}名戦力外)
        </button>
        <span className="text-xs text-gray-500">
          現ロスター: {activePlayers.length}名 → 退団後: {activePlayers.length - userReleases.length}名
        </span>
      </div>
    </div>
  );
};

export default CorporateDepartureScreen;
