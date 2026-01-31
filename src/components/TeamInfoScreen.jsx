import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES } from '../utils/constants.js';
import { formatInnings } from '../utils/physics.js';

const TeamInfoScreen = () => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const [selectedTeam, setSelectedTeam] = useState(teamNames[0] || 'チームA');
  const [pitcherSortKey, setPitcherSortKey] = useState(null);
  const [pitcherSortDir, setPitcherSortDir] = useState('desc');
  const [fielderSortKey, setFielderSortKey] = useState(null);
  const [fielderSortDir, setFielderSortDir] = useState('desc');

  const allTeamsData = TEAMS_DATA || {};
  const team = allTeamsData[selectedTeam];
  if (!team) return <div className="p-8 text-white">チームが見つかりません。NEW GAMEからゲームを開始してください。</div>;

  const getAbilityColor = (value) => {
    if (value >= 90) return 'text-pink-400';
    if (value >= 80) return 'text-red-400';
    if (value >= 70) return 'text-orange-400';
    if (value >= 60) return 'text-yellow-400';
    if (value >= 50) return 'text-green-400';
    if (value >= 40) return 'text-blue-400';
    return 'text-gray-400';
  };

  // ソートハンドラ
  const handlePitcherSort = (key) => {
    if (pitcherSortKey === key) {
      setPitcherSortDir(pitcherSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setPitcherSortKey(key);
      setPitcherSortDir(['era', 'losses'].includes(key) ? 'asc' : 'desc');
    }
  };

  const handleFielderSort = (key) => {
    if (fielderSortKey === key) {
      setFielderSortDir(fielderSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setFielderSortKey(key);
      setFielderSortDir(['strikeouts'].includes(key) ? 'asc' : 'desc');
    }
  };

  // ソート可能ヘッダー
  const SortableHeader = ({ label, sortKey, currentKey, currentDir, onClick, align = 'center' }) => (
    <th
      className={`px-2 py-2 text-${align} cursor-pointer hover:bg-gray-500 transition ${currentKey === sortKey ? 'text-yellow-400' : ''}`}
      onClick={() => onClick(sortKey)}
    >
      {label} {currentKey === sortKey && (currentDir === 'asc' ? '▲' : '▼')}
    </th>
  );

  // 投手データの取得とソート
  const getPitcherValue = (player, key) => {
    const stats = player.seasonStats?.pitching;
    if (!stats) return 0;
    if (key === 'era') {
      return stats.inningsPitched > 0 ? (stats.earnedRuns * 27) / stats.inningsPitched : 999;
    }
    if (key === 'velocity') return player.pitching?.velocity || 0;
    if (key === 'control') return player.pitching?.control || 0;
    if (key === 'stamina') return player.pitching?.stamina || 0;
    if (key === 'age') return player.age || 0;
    if (key === 'name') return player.name || '';
    return stats[key] || 0;
  };

  const pitchers = team.players.filter(p => p.position === 'pitcher').map(p => {
    const stats = p.seasonStats?.pitching;
    const era = stats?.inningsPitched > 0 ? (stats.earnedRuns * 27) / stats.inningsPitched : null;
    const ip = stats?.inningsPitched > 0 ? formatInnings(stats.inningsPitched) : '0';
    return { ...p, _era: era, _ip: ip };
  });

  if (pitcherSortKey) {
    pitchers.sort((a, b) => {
      let valA = getPitcherValue(a, pitcherSortKey);
      let valB = getPitcherValue(b, pitcherSortKey);
      if (typeof valA === 'string') return pitcherSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return pitcherSortDir === 'asc' ? valA - valB : valB - valA;
    });
  }

  // 野手データの取得とソート
  const getFielderValue = (player, key) => {
    const stats = player.seasonStats?.batting;
    if (!stats) return 0;
    if (key === 'avg') {
      return stats.atBats > 0 ? stats.hits / stats.atBats : 0;
    }
    if (key === 'meet') return player.batting?.meet || 0;
    if (key === 'power') return player.batting?.power || 0;
    if (key === 'speed') return player.physical?.speed || 0;
    if (key === 'defense') return player.fielding?.defense || 0;
    if (key === 'arm') return player.physical?.arm || 0;
    if (key === 'age') return player.age || 0;
    if (key === 'name') return player.name || '';
    return stats[key] || 0;
  };

  const fielders = team.players.filter(p => p.position !== 'pitcher').map(p => {
    const stats = p.seasonStats?.batting;
    const avg = stats?.atBats > 0 ? (stats.hits / stats.atBats) : 0;
    return { ...p, _avg: avg };
  });

  if (fielderSortKey) {
    fielders.sort((a, b) => {
      let valA = getFielderValue(a, fielderSortKey);
      let valB = getFielderValue(b, fielderSortKey);
      if (typeof valA === 'string') return fielderSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return fielderSortDir === 'asc' ? valA - valB : valB - valA;
    });
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">📊 チーム情報</h1>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">チーム選択</label>
          <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)} className="w-full bg-gray-700 text-white rounded px-4 py-2">
            {Object.keys(allTeamsData).map(teamName => (
              <option key={teamName} value={teamName}>{teamName}</option>
            ))}
          </select>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="grid grid-cols-3 gap-4 text-white">
            <div><div className="text-sm text-gray-400">総人数</div><div className="text-2xl font-bold">{team.players.length}人</div></div>
            <div><div className="text-sm text-gray-400">投手</div><div className="text-2xl font-bold">{pitchers.length}人</div></div>
            <div><div className="text-sm text-gray-400">野手</div><div className="text-2xl font-bold">{fielders.length}人</div></div>
          </div>
        </div>

        {/* 投手テーブル */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">投手 ({pitchers.length}人)</h2>
          {pitchers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-600 text-gray-200">
                    <SortableHeader label="名前" sortKey="name" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} align="left" />
                    <SortableHeader label="年齢" sortKey="age" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <th className="px-2 py-2 text-center">投</th>
                    <SortableHeader label="球速" sortKey="velocity" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="制球" sortKey="control" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="スタミナ" sortKey="stamina" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="試合" sortKey="games" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="勝" sortKey="wins" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="敗" sortKey="losses" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="H" sortKey="holds" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="S" sortKey="saves" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="回" sortKey="inningsPitched" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="失点" sortKey="runsAllowed" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="奪三振" sortKey="strikeouts" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="与四球" sortKey="walks" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="防御率" sortKey="era" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                  </tr>
                </thead>
                <tbody>
                  {pitchers.map((player, index) => {
                    const stats = player.seasonStats?.pitching;
                    return (
                      <tr key={player.id} className={index % 2 === 0 ? 'bg-gray-700' : 'bg-gray-750'}>
                        <td className="px-2 py-1 text-white font-medium">{player.name}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{player.age}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{player.physical?.throws === 'left' ? '左' : '右'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.pitching?.velocity)}`}>{player.pitching?.velocity || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.pitching?.control)}`}>{player.pitching?.control || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(Math.min(99, Math.floor((player.pitching?.stamina || 0) / 2)))}`}>{player.pitching?.stamina || '-'}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.games || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.wins || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.losses || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.holds || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.saves || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{player._ip}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.runsAllowed || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.strikeouts || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.walks || 0}</td>
                        <td className="px-2 py-1 text-yellow-400 text-center font-bold">
                          {player._era !== null ? player._era.toFixed(2) : '-.--'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">投手がいません</p>
          )}
        </div>

        {/* 野手テーブル */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">野手 ({fielders.length}人)</h2>
          {fielders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-600 text-gray-200">
                    <SortableHeader label="名前" sortKey="name" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} align="left" />
                    <th className="px-2 py-2 text-center">守備</th>
                    <SortableHeader label="年齢" sortKey="age" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <th className="px-2 py-2 text-center">投打</th>
                    <SortableHeader label="ミート" sortKey="meet" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="パワー" sortKey="power" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="走力" sortKey="speed" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="守備" sortKey="defense" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="肩" sortKey="arm" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="試合" sortKey="games" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="打席" sortKey="atBats" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="安打" sortKey="hits" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="HR" sortKey="homeruns" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="打点" sortKey="rbis" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="盗塁" sortKey="stolenBases" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="四球" sortKey="walks" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="三振" sortKey="strikeouts" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="打率" sortKey="avg" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                  </tr>
                </thead>
                <tbody>
                  {fielders.map((player, index) => {
                    const stats = player.seasonStats?.batting;
                    return (
                      <tr key={player.id} className={index % 2 === 0 ? 'bg-gray-700' : 'bg-gray-750'}>
                        <td className="px-2 py-1 text-white font-medium">{player.name}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{POSITION_NAMES[player.position]}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{player.age}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{player.physical?.throws === 'left' ? '左' : '右'}{player.batting?.bats === 'left' ? '左' : player.batting?.bats === 'switch' ? '両' : '右'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.batting?.meet)}`}>{player.batting?.meet || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.batting?.power)}`}>{player.batting?.power || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.physical?.speed)}`}>{player.physical?.speed || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.fielding?.defense)}`}>{player.fielding?.defense || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.physical?.arm)}`}>{player.physical?.arm || '-'}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.games || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.atBats || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.hits || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.homeruns || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.rbis || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.stolenBases || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.walks || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.strikeouts || 0}</td>
                        <td className="px-2 py-1 text-yellow-400 text-center font-bold">{player._avg.toFixed(3)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">野手がいません</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamInfoScreen;
