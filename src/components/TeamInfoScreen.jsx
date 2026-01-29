import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES } from '../utils/constants.js';

const TeamInfoScreen = () => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const [selectedTeam, setSelectedTeam] = useState(teamNames[0] || 'チームA');

  const allTeamsData = TEAMS_DATA || {};
  const team = allTeamsData[selectedTeam];
  if (!team) return <div className="p-8 text-white">チームが見つかりません。NEW GAMEからゲームを開始してください。</div>;

  const pitchers = team.players.filter(p => p.position === 'pitcher');
  const fielders = team.players.filter(p => p.position !== 'pitcher');

  const getAbilityColor = (value) => {
    if (value >= 90) return 'text-pink-400';
    if (value >= 80) return 'text-red-400';
    if (value >= 70) return 'text-orange-400';
    if (value >= 60) return 'text-yellow-400';
    if (value >= 50) return 'text-green-400';
    if (value >= 40) return 'text-blue-400';
    return 'text-gray-400';
  };

  const renderPitcherRow = (player, index) => {
    const era = player.seasonStats?.pitching?.inningsPitched > 0
      ? ((player.seasonStats.pitching.earnedRuns * 27) / player.seasonStats.pitching.inningsPitched).toFixed(2)
      : '-.--';
    return (
      <tr key={player.id} className={index % 2 === 0 ? 'bg-gray-700' : 'bg-gray-750'}>
        <td className="px-2 py-1 text-white font-medium">{player.name}</td>
        <td className="px-2 py-1 text-gray-300 text-center">{player.age}</td>
        <td className="px-2 py-1 text-gray-300 text-center">{player.physical?.throws === 'left' ? '左' : '右'}</td>
        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.pitching?.velocity)}`}>{player.pitching?.velocity || '-'}</td>
        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.pitching?.control)}`}>{player.pitching?.control || '-'}</td>
        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(Math.min(99, Math.floor((player.pitching?.stamina || 0) / 2)))}`}>{player.pitching?.stamina || '-'}</td>
        <td className="px-2 py-1 text-gray-300 text-center">{era}</td>
        <td className="px-2 py-1 text-gray-300 text-center">{player.seasonStats?.pitching?.wins || 0}-{player.seasonStats?.pitching?.losses || 0}</td>
      </tr>
    );
  };

  const renderFielderRow = (player, index) => {
    const battingAvg = player.seasonStats?.batting?.atBats > 0
      ? (player.seasonStats.batting.hits / player.seasonStats.batting.atBats).toFixed(3)
      : '.000';
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
        <td className="px-2 py-1 text-gray-300 text-center">{battingAvg}</td>
        <td className="px-2 py-1 text-gray-300 text-center">{player.seasonStats?.batting?.homeruns || 0}</td>
      </tr>
    );
  };

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

        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">投手 ({pitchers.length}人)</h2>
          {pitchers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-600 text-gray-200">
                    <th className="px-2 py-2 text-left">名前</th>
                    <th className="px-2 py-2 text-center">年齢</th>
                    <th className="px-2 py-2 text-center">投</th>
                    <th className="px-2 py-2 text-center">球速</th>
                    <th className="px-2 py-2 text-center">制球</th>
                    <th className="px-2 py-2 text-center">スタミナ</th>
                    <th className="px-2 py-2 text-center">防御率</th>
                    <th className="px-2 py-2 text-center">勝敗</th>
                  </tr>
                </thead>
                <tbody>{pitchers.map((player, index) => renderPitcherRow(player, index))}</tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">投手がいません</p>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">野手 ({fielders.length}人)</h2>
          {fielders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-600 text-gray-200">
                    <th className="px-2 py-2 text-left">名前</th>
                    <th className="px-2 py-2 text-center">守備</th>
                    <th className="px-2 py-2 text-center">年齢</th>
                    <th className="px-2 py-2 text-center">投打</th>
                    <th className="px-2 py-2 text-center">ミート</th>
                    <th className="px-2 py-2 text-center">パワー</th>
                    <th className="px-2 py-2 text-center">走力</th>
                    <th className="px-2 py-2 text-center">守備</th>
                    <th className="px-2 py-2 text-center">肩</th>
                    <th className="px-2 py-2 text-center">打率</th>
                    <th className="px-2 py-2 text-center">HR</th>
                  </tr>
                </thead>
                <tbody>{fielders.map((player, index) => renderFielderRow(player, index))}</tbody>
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
