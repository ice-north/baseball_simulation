import React, { useState, useEffect, useMemo } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES } from '../utils/constants.js';

/**
 * AI自動解雇ロジック
 * - 試合に出られない選手(出場0)
 * - 年齢が高い選手(35歳以上)
 * - 成績が悪い選手(打率.150以下/ERA6.00以上)
 * を優先的に解雇。最低18人は残す。
 */
const getAIReleaseCandidates = (players) => {
  if (!players || players.length <= 18) return [];

  const scored = players.map(p => {
    let score = 0; // 高いほど解雇候補
    const batting = p.seasonStats?.batting || {};
    const pitching = p.seasonStats?.pitching || {};
    const isPitcher = p.position === 'pitcher';
    const games = isPitcher ? (pitching.games || 0) : (batting.games || 0);

    // 出場なし → 高スコア
    if (games === 0) score += 50;
    else if (games < 5) score += 30;
    else if (games < 15) score += 15;

    // 年齢（より細かく、よりシビアに）
    const age = p.age || 20;
    if (age >= 38) score += 50;
    else if (age >= 36) score += 35;
    else if (age >= 34) score += 25;
    else if (age >= 32) score += 15;
    else if (age >= 30) score += 5;

    // 成績（より厳しく評価）
    if (isPitcher) {
      const ip = (pitching.inningsPitched || 0) / 3;
      const era = ip > 0 ? ((pitching.earnedRuns || 0) / ip * 9) : 99;
      if (era > 6.0) score += 25;
      else if (era > 5.0) score += 15;
      else if (era > 4.5) score += 5;
      if ((pitching.wins || 0) === 0 && games > 5) score += 15;
    } else {
      const avg = batting.atBats > 0 ? batting.hits / batting.atBats : 0;
      if (avg < 0.150 && batting.atBats > 20) score += 25;
      else if (avg < 0.200 && batting.atBats > 20) score += 15;
      else if (avg < 0.230 && batting.atBats > 20) score += 5;
    }

    // 能力値が低い（閾値を引き上げ）
    if (isPitcher) {
      const overall = ((p.pitching?.velocity || 130) - 115) * 2.5 + (p.pitching?.control || 50) + ((p.pitching?.stamina || 100) / 2);
      if (overall / 3 < 35) score += 25;
      else if (overall / 3 < 45) score += 15;
    } else {
      const overall = ((p.batting?.meet||0) + (p.batting?.power||0) + (p.physical?.speed||0) + (p.physical?.arm||0) + (p.fielding?.defense||0)) / 5;
      if (overall < 35) score += 25;
      else if (overall < 45) score += 15;
    }

    return { player: p, score };
  });

  // スコア降順でソート、上位をリリース（最低18人残す）
  scored.sort((a, b) => b.score - a.score);
  const maxRelease = Math.max(0, players.length - 18); // 18人まで減らせる
  const candidates = scored.filter(s => s.score >= 20).slice(0, maxRelease);
  return candidates.map(c => c.player.id);
};

const ContractScreen = ({ seasonData, allTeams, onComplete }) => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || 'チームA';
  const [releasedPlayers, setReleasedPlayers] = useState({});
  const [aiProcessed, setAiProcessed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(false);

  // AI チームの自動解雇処理
  useEffect(() => {
    if (aiProcessed) return;
    const aiReleases = {};
    teamNames.forEach(teamName => {
      if (teamName === userTeamName) return; // ユーザーチームはスキップ
      const team = TEAMS_DATA[teamName];
      if (!team?.players) return;
      const candidates = getAIReleaseCandidates(team.players);
      if (candidates.length > 0) {
        aiReleases[teamName] = candidates;
      }
    });
    setReleasedPlayers(prev => ({ ...prev, ...aiReleases }));
    setAiProcessed(true);
  }, []);

  const teamData = TEAMS_DATA[userTeamName];
  const players = teamData?.players || [];
  const userReleased = releasedPlayers[userTeamName] || [];

  // ソート用の値を取得
  const getSortValue = (player, key) => {
    const isPitcher = player.position === 'pitcher';
    switch (key) {
      case 'name': return player.name;
      case 'age': return player.age || 0;
      case 'position': return POSITION_NAMES[player.position] || '';
      case 'meet': return player.batting?.meet || 0;
      case 'power': return player.batting?.power || 0;
      case 'speed': return player.physical?.speed || 0;
      case 'arm': return player.physical?.arm || 0;
      case 'defense': return player.fielding?.defense || 0;
      case 'velocity': return player.pitching?.velocity || 0;
      case 'control': return player.pitching?.control || 0;
      case 'stamina': return player.pitching?.stamina || 0;
      case 'games': return isPitcher ? (player.seasonStats?.pitching?.games || 0) : (player.seasonStats?.batting?.games || 0);
      case 'overall':
        if (isPitcher) {
          return ((player.pitching?.velocity || 130) - 115) * 2.5 + (player.pitching?.control || 50) + ((player.pitching?.stamina || 100) / 2);
        }
        return ((player.batting?.meet||0) + (player.batting?.power||0) + (player.physical?.speed||0) + (player.physical?.arm||0) + (player.fielding?.defense||0)) / 5;
      default: return 0;
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortedPlayers = useMemo(() => {
    if (!sortKey) return players;
    return [...players].sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });
  }, [players, sortKey, sortAsc]);

  const SortHeader = ({ label, sortKeyVal, className = '' }) => (
    <th
      className={`py-1 px-2 cursor-pointer hover:text-white hover:bg-gray-600 transition select-none ${sortKey === sortKeyVal ? 'bg-gray-600 text-white' : ''} ${className}`}
      onClick={(e) => { e.stopPropagation(); handleSort(sortKeyVal); }}
    >
      {label}{sortKey === sortKeyVal ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  const toggleRelease = (playerId) => {
    const current = releasedPlayers[userTeamName] || [];
    if (current.includes(playerId)) {
      setReleasedPlayers({ ...releasedPlayers, [userTeamName]: current.filter(id => id !== playerId) });
    } else {
      setReleasedPlayers({ ...releasedPlayers, [userTeamName]: [...current, playerId] });
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
  const aiReleasedCount = Object.entries(releasedPlayers)
    .filter(([name]) => name !== userTeamName)
    .reduce((sum, [, arr]) => sum + arr.length, 0);

  return (
    <div className="p-6 bg-gray-900 min-h-screen">
      <h1 className="text-2xl font-bold text-white mb-2">契約更改 - {seasonData?.year || 1}年目</h1>
      <p className="text-gray-400 mb-2">自チームの選手を解雇できます。クリックで解雇/契約を切り替え。</p>
      {aiReleasedCount > 0 && (
        <p className="text-yellow-400 text-sm mb-4">AIチームは{aiReleasedCount}人の選手を自動解雇します。</p>
      )}

      {!confirmed ? (
        <>
          <div className="flex items-center gap-4 mb-4">
            <span className="text-white font-bold text-lg">{userTeamName}</span>
            <span className="text-gray-300">
              現在 {players.length}人 / 解雇予定 {userReleased.length}人 → 残り {players.length - userReleased.length}人
            </span>
          </div>

          <div className="overflow-y-auto max-h-[500px] mb-4">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-gray-800 z-10">
                <tr className="border-b border-gray-600 text-xs text-gray-400">
                  <th className="py-1 px-2">契約</th>
                  <SortHeader label="名前" sortKeyVal="name" />
                  <SortHeader label="齢" sortKeyVal="age" />
                  <SortHeader label="守備" sortKeyVal="position" />
                  <SortHeader label="ミ" sortKeyVal="meet" className="text-center" />
                  <SortHeader label="パ" sortKeyVal="power" className="text-center" />
                  <SortHeader label="走" sortKeyVal="speed" className="text-center" />
                  <SortHeader label="肩" sortKeyVal="arm" className="text-center" />
                  <SortHeader label="守" sortKeyVal="defense" className="text-center" />
                  <SortHeader label="球速" sortKeyVal="velocity" className="text-center" />
                  <SortHeader label="制球" sortKeyVal="control" className="text-center" />
                  <SortHeader label="スタ" sortKeyVal="stamina" className="text-center" />
                  <SortHeader label="試合" sortKeyVal="games" className="text-center" />
                  <SortHeader label="総合" sortKeyVal="overall" className="text-center" />
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map(player => {
                  const isPitcher = player.position === 'pitcher';
                  const isReleased = userReleased.includes(player.id);
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
                      <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.batting?.meet || 0)}`}>{player.batting?.meet || 0}</td>
                      <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.batting?.power || 0)}`}>{player.batting?.power || 0}</td>
                      <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.physical?.speed || 0)}`}>{player.physical?.speed || 0}</td>
                      <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.physical?.arm || 0)}`}>{player.physical?.arm || 0}</td>
                      <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.fielding?.defense || 0)}`}>{player.fielding?.defense || 0}</td>
                      <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.pitching?.velocity || 0)}`}>{player.pitching?.velocity || 0}</td>
                      <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.pitching?.control || 0)}`}>{player.pitching?.control || 0}</td>
                      <td className={`py-1 px-2 text-xs text-center ${getAbilityColor(player.pitching?.stamina || 0)}`}>{player.pitching?.stamina || 0}</td>
                      <td className="py-1 px-2 text-xs text-center text-gray-300">{games}</td>
                      <td className="py-1 px-2 text-xs text-gray-300 whitespace-nowrap">{statsStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleConfirm}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded font-bold mr-4"
          >
            契約更改を確定する
          </button>
          <button
            onClick={() => { handleConfirm(); }}
            className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded"
          >
            解雇せずに確定
          </button>
        </>
      ) : (
        <div className="text-center py-10">
          <p className="text-xl text-green-400 font-bold mb-4">契約更改が完了しました</p>
          {totalReleased > 0 && (
            <p className="text-gray-300 mb-4">{totalReleased}人の選手を解雇しました。(AI: {aiReleasedCount}人, 自チーム: {userReleased.length}人)</p>
          )}
          <p className="text-gray-400 mb-6">次はトライアウトで新選手を獲得できます。</p>
          <button
            onClick={() => { if (onComplete) onComplete(); }}
            className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-lg font-bold text-lg"
          >
            トライアウトへ進む
          </button>
        </div>
      )}
    </div>
  );
};

export default ContractScreen;
