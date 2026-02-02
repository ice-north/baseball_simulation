import React, { useState, useMemo } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES } from '../utils/constants.js';

/**
 * 契約更改画面 - 11月9日に表示
 * 各チームの選手に対して次年度の契約を判断する
 */
const ContractScreen = ({ seasonData, allTeams, onComplete }) => {
  const userTeamName = allTeams?.[0]?.name || Object.keys(TEAMS_DATA)[0];
  const [selectedTeam, setSelectedTeam] = useState(userTeamName);
  const [releasedPlayers, setReleasedPlayers] = useState({});
  const [confirmed, setConfirmed] = useState(false);

  const teamData = TEAMS_DATA[selectedTeam];
  const players = teamData?.players || [];

  // 解雇予定リスト
  const teamReleased = releasedPlayers[selectedTeam] || [];

  const toggleRelease = (playerId) => {
    const current = releasedPlayers[selectedTeam] || [];
    if (current.includes(playerId)) {
      setReleasedPlayers({ ...releasedPlayers, [selectedTeam]: current.filter(id => id !== playerId) });
    } else {
      setReleasedPlayers({ ...releasedPlayers, [selectedTeam]: [...current, playerId] });
    }
  };

  const handleConfirm = () => {
    // 全チームの解雇を実行
    Object.entries(releasedPlayers).forEach(([teamName, playerIds]) => {
      const td = TEAMS_DATA[teamName];
      if (td && playerIds.length > 0) {
        td.players = td.players.filter(p => !playerIds.includes(p.id));
      }
    });
    setConfirmed(true);
  };

  const handleProceed = () => {
    if (onComplete) onComplete();
  };

  const getAbilityColor = (val) => {
    if (val >= 90) return 'text-pink-400';
    if (val >= 80) return 'text-red-400';
    if (val >= 70) return 'text-orange-400';
    if (val >= 60) return 'text-yellow-400';
    if (val >= 50) return 'text-green-400';
    if (val >= 40) return 'text-blue-400';
    return 'text-gray-400';
  };

  const totalReleased = Object.values(releasedPlayers).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="p-6 bg-gray-900 min-h-screen">
      <h1 className="text-2xl font-bold text-white mb-2">📋 契約更改 - {seasonData?.year || 1}年目</h1>
      <p className="text-gray-400 mb-4">次年度の選手契約を判断してください。不要な選手を解雇できます。</p>
      <p className="text-gray-500 text-sm mb-4">※トライアウト（11/10）で新選手を獲得する前に、ロスターを整理できます。</p>

      {!confirmed ? (
        <>
          {/* チーム選択 */}
          <div className="flex items-center gap-4 mb-4">
            <select
              value={selectedTeam}
              onChange={e => setSelectedTeam(e.target.value)}
              className="bg-gray-700 text-white px-3 py-2 rounded"
            >
              {Object.keys(TEAMS_DATA).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <span className="text-gray-300">
              現在 {players.length}人 / 解雇予定 {teamReleased.length}人
              → 残り {players.length - teamReleased.length}人
            </span>
          </div>

          {/* 選手一覧テーブル */}
          <div className="overflow-y-auto max-h-[500px] mb-4">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-600 text-xs text-gray-400">
                  <th className="py-1 px-2">契約</th>
                  <th className="py-1 px-2">名前</th>
                  <th className="py-1 px-2">齢</th>
                  <th className="py-1 px-2">守備</th>
                  <th className="py-1 px-2 text-center">ミ</th>
                  <th className="py-1 px-2 text-center">パ</th>
                  <th className="py-1 px-2 text-center">走</th>
                  <th className="py-1 px-2 text-center">肩</th>
                  <th className="py-1 px-2 text-center">守</th>
                  <th className="py-1 px-2 text-center">球速</th>
                  <th className="py-1 px-2 text-center">制球</th>
                  <th className="py-1 px-2 text-center">スタ</th>
                  <th className="py-1 px-2 text-center">試合</th>
                  <th className="py-1 px-2 text-center">成績</th>
                </tr>
              </thead>
              <tbody>
                {players.map(player => {
                  const isPitcher = player.position === 'pitcher';
                  const isReleased = teamReleased.includes(player.id);
                  const batting = player.seasonStats?.batting || {};
                  const pitching = player.seasonStats?.pitching || {};
                  const games = isPitcher ? (pitching.games || 0) : (batting.games || 0);
                  const avg = batting.atBats > 0 ? (batting.hits / batting.atBats).toFixed(3) : '-';
                  const era = pitching.inningsPitched > 0
                    ? ((pitching.earnedRuns || 0) / (pitching.inningsPitched / 3) * 9).toFixed(2)
                    : '-';
                  const statsStr = isPitcher
                    ? `${pitching.wins || 0}勝${pitching.losses || 0}敗 ERA${era}`
                    : `${avg} ${batting.homeruns || 0}HR ${batting.rbis || 0}打点`;

                  return (
                    <tr
                      key={player.id}
                      className={`border-b border-gray-700 cursor-pointer transition ${isReleased ? 'bg-red-900/30 opacity-60' : 'hover:bg-gray-700'}`}
                      onClick={() => toggleRelease(player.id)}
                    >
                      <td className="py-1 px-2">
                        {isReleased
                          ? <span className="text-red-400 font-bold">解雇</span>
                          : <span className="text-green-400">契約</span>
                        }
                      </td>
                      <td className="py-1 px-2 text-sm text-white font-bold">{player.name}</td>
                      <td className="py-1 px-2 text-xs text-gray-400">{player.age || '?'}</td>
                      <td className="py-1 px-2 text-xs text-gray-300">{POSITION_NAMES[player.position] || player.position}</td>
                      {isPitcher ? (
                        <>
                          <td className="py-1 px-2 text-xs text-center text-gray-600">-</td>
                          <td className="py-1 px-2 text-xs text-center text-gray-600">-</td>
                          <td className="py-1 px-2 text-xs text-center text-gray-600">-</td>
                          <td className="py-1 px-2 text-xs text-center text-gray-600">-</td>
                          <td className="py-1 px-2 text-xs text-center text-gray-600">-</td>
                          <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.pitching?.velocity || 0)}`}>{player.pitching?.velocity || 0}</td>
                          <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.pitching?.control || 0)}`}>{player.pitching?.control || 0}</td>
                          <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.pitching?.stamina || 0)}`}>{player.pitching?.stamina || 0}</td>
                        </>
                      ) : (
                        <>
                          <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.batting?.meet || 0)}`}>{player.batting?.meet || 0}</td>
                          <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.batting?.power || 0)}`}>{player.batting?.power || 0}</td>
                          <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.physical?.speed || 0)}`}>{player.physical?.speed || 0}</td>
                          <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.physical?.arm || 0)}`}>{player.physical?.arm || 0}</td>
                          <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.fielding?.defense || 0)}`}>{player.fielding?.defense || 0}</td>
                          <td className="py-1 px-2 text-xs text-center text-gray-600">-</td>
                          <td className="py-1 px-2 text-xs text-center text-gray-600">-</td>
                          <td className="py-1 px-2 text-xs text-center text-gray-600">-</td>
                        </>
                      )}
                      <td className="py-1 px-2 text-xs text-center text-gray-300">{games}</td>
                      <td className="py-1 px-2 text-xs text-gray-300 whitespace-nowrap">{statsStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalReleased > 0 && (
            <p className="text-yellow-400 text-sm mb-3">
              全チーム合計 {totalReleased}人を解雇予定です。
            </p>
          )}

          <button
            onClick={handleConfirm}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded font-bold mr-4"
          >
            契約更改を確定する
          </button>
          <button
            onClick={() => { setReleasedPlayers({}); if (onComplete) onComplete(); }}
            className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded"
          >
            解雇せずに進む
          </button>
        </>
      ) : (
        <div className="text-center py-10">
          <p className="text-xl text-green-400 font-bold mb-4">契約更改が完了しました</p>
          {totalReleased > 0 && (
            <p className="text-gray-300 mb-4">{totalReleased}人の選手を解雇しました。</p>
          )}
          <p className="text-gray-400 mb-6">次はトライアウトで新選手を獲得できます。</p>
          <button
            onClick={handleProceed}
            className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-lg font-bold text-lg"
          >
            トライアウトへ進む →
          </button>
        </div>
      )}
    </div>
  );
};

export default ContractScreen;
