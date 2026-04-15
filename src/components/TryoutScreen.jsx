import React, { useState, useEffect } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { generateTryoutCandidates, generateSnakeDraftOrder, selectPlayerForAI, applyReputationBonus, updateReleasedPoolAfterTryout, generateScoutComment } from '../season/tryoutSystem.js';
import { getPitchTypeName } from '../season/yearProgressionSystem.js';

const TryoutScreen = ({ seasonData, allTeams, isInitialTryout = false, onComplete, initializeAllPitchingRotations }) => {
  const [tryoutCandidates, setTryoutCandidates] = useState([]);
  const [draftOrder, setDraftOrder] = useState([]);
  const [currentPick, setCurrentPick] = useState(0);
  const [userRoster, setUserRoster] = useState([]);
  const [teamRosters, setTeamRosters] = useState({});
  const [positionTab, setPositionTab] = useState('all');
  const [draftComplete, setDraftComplete] = useState(false);
  const [viewTab, setViewTab] = useState('draft');
  const [sortKey, setSortKey] = useState('overall');
  const [sortDir, setSortDir] = useState('desc');
  const [draftHistory, setDraftHistory] = useState([]);

  const getPositionName = (position) => {
    const positionNames = {
      pitcher: 'ピッチャー',
      catcher: 'キャッチャー',
      first: 'ファースト',
      second: 'セカンド',
      third: 'サード',
      short: 'ショート',
      left: 'レフト',
      center: 'センター',
      right: 'ライト'
    };
    return positionNames[position] || position;
  };

  const getAbilityRank = (value, isPitcherVelocity = false, isStamina = false) => {
    let adjustedValue = value;
    if (isPitcherVelocity) {
      adjustedValue = (value - 115) * 2.5;
    } else if (isStamina) {
      adjustedValue = value / 2;
    }
    if (adjustedValue >= 90) return 'S';
    if (adjustedValue >= 80) return 'A';
    if (adjustedValue >= 70) return 'B';
    if (adjustedValue >= 60) return 'C';
    if (adjustedValue >= 50) return 'D';
    if (adjustedValue >= 40) return 'E';
    return 'F';
  };

  const getPositionCategory = (position) => {
    if (position === 'pitcher') return 'pitcher';
    if (position === 'catcher') return 'catcher';
    if (['first', 'second', 'third', 'short'].includes(position)) return 'infielder';
    if (['left', 'center', 'right'].includes(position)) return 'outfielder';
    return 'all';
  };

  useEffect(() => {
    if (tryoutCandidates.length === 0) {
      const year = isInitialTryout ? 1 : (seasonData?.year || 1);
      const teamCount = seasonData?.settings?.teamsCount || Object.keys(allTeams).length || 4;
      let candidates = generateTryoutCandidates(year, teamCount, isInitialTryout);
      // 育成評判ボーナス: プロ輩出実績があるリーグには良い選手が集まる
      if (!isInitialTryout) {
        candidates = applyReputationBonus(candidates, allTeams);
      }
      setTryoutCandidates(candidates);

      const teamsArray = Array.isArray(allTeams) ? allTeams : Object.keys(allTeams);
      let teamNames = ['ユーザー', ...teamsArray.slice(1)];

      // 非初回トライアウト: 順位の低いチームから指名（最下位が1巡目1位）
      if (!isInitialTryout && seasonData?.standings?.length > 0) {
        const standingsSorted = [...seasonData.standings].sort((a, b) => a.winRate - b.winRate);
        teamNames = standingsSorted.map(s => {
          return s.team === teamsArray[0] ? 'ユーザー' : s.team;
        });
      }

      const rounds = isInitialTryout ? 24 : Math.min(24, Math.floor(candidates.length / teamNames.length));
      const order = generateSnakeDraftOrder(teamNames, rounds);
      setDraftOrder(order);
    }
  }, [seasonData, allTeams, tryoutCandidates.length, isInitialTryout]);

  const handleSelectPlayer = (player) => {
    if (currentPick >= draftOrder.length) {
      alert('ドラフトは終了しました');
      return;
    }
    const currentTeam = draftOrder[currentPick].team;
    if (currentTeam === 'ユーザー') {
      const teamsArray = Array.isArray(allTeams) ? allTeams : Object.keys(allTeams);
      const actualTeamName = teamsArray[0];
      setDraftHistory(prev => [...prev, {
        pick: currentPick + 1,
        round: draftOrder[currentPick].round,
        team: actualTeamName,
        player: player
      }]);
      setUserRoster([...userRoster, player]);
      setTeamRosters({
        ...teamRosters,
        [currentTeam]: [...(teamRosters[currentTeam] || []), player]
      });
      setTryoutCandidates(tryoutCandidates.filter(c => c.id !== player.id));
      setCurrentPick(currentPick + 1);
    }
  };

  useEffect(() => {
    if (currentPick >= draftOrder.length || tryoutCandidates.length === 0) return;
    const currentTeam = draftOrder[currentPick].team;
    if (currentTeam !== 'ユーザー') {
      setTimeout(() => {
        const existingCount = TEAMS_DATA[currentTeam]?.players?.length || 0;
        const draftedCount = (teamRosters[currentTeam] || []).length;
        if (existingCount + draftedCount >= 24) {
          setCurrentPick(currentPick + 1);
          return;
        }
        const currentTeamRoster = teamRosters[currentTeam] || [];
        const selected = selectPlayerForAI(tryoutCandidates, currentTeamRoster);
        if (selected) {
          setDraftHistory(prev => [...prev, {
            pick: currentPick + 1,
            round: draftOrder[currentPick].round,
            team: currentTeam,
            player: selected
          }]);
          setTeamRosters(prev => ({
            ...prev,
            [currentTeam]: [...(prev[currentTeam] || []), selected]
          }));
          setTryoutCandidates(tryoutCandidates.filter(c => c.id !== selected.id));
          setCurrentPick(currentPick + 1);
        } else {
          setCurrentPick(currentPick + 1);
        }
      }, 500);
    }
  }, [currentPick, draftOrder, tryoutCandidates, teamRosters]);

  const finalizeDraft = (skipCheck = false) => {
    if (draftComplete) return;
    const teamsArrayForSave = Array.isArray(allTeams) ? allTeams : Object.keys(allTeams);

    // 全チームの最終人数チェック（9人未満のチームがあれば警告）
    if (!skipCheck) {
      const userTeamName = teamsArrayForSave[0];
      const userDrafted = teamRosters['ユーザー'] || [];
      const existingPlayers = TEAMS_DATA[userTeamName]?.players || [];
      const totalPlayers = existingPlayers.length + userDrafted.length;
      if (totalPlayers < 9) {
        alert(`チームの合計人数が${totalPlayers}人です。試合に必要な最低9人になるまで指名を続けてください。`);
        return;
      }
    }

    // 全指名選手のIDを収集（解雇プール更新に使用）
    const allDraftedIds = [];
    Object.keys(teamRosters).forEach(teamName => {
      const draftedPlayers = teamRosters[teamName] || [];
      const actualTeamName = teamName === 'ユーザー' ? teamsArrayForSave[0] : teamName;
      if (TEAMS_DATA[actualTeamName]) {
        TEAMS_DATA[actualTeamName].players = [
          ...(TEAMS_DATA[actualTeamName].players || []),
          ...draftedPlayers
        ];
      }
      draftedPlayers.forEach(p => allDraftedIds.push(p.id));
    });
    // 解雇プールを更新（再獲得された選手は削除、不指名は年齢+1・能力減衰）
    if (!isInitialTryout) {
      updateReleasedPoolAfterTryout(allDraftedIds);
    }
    if (initializeAllPitchingRotations) initializeAllPitchingRotations();
    setDraftComplete(true);
    if (isInitialTryout && onComplete) {
      setTimeout(() => onComplete(), 1000);
    }
  };

  useEffect(() => {
    if ((currentPick >= draftOrder.length || tryoutCandidates.length === 0) && draftOrder.length > 0 && !draftComplete) {
      finalizeDraft(true); // 自動完了時はチェックスキップ
    }
  }, [currentPick, draftOrder.length, draftComplete, tryoutCandidates.length, teamRosters]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const getSortIndicator = (key) => sortKey === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '';

  const getFielderOverall = (p) => {
    return Math.round(((p.batting?.meet||0) + (p.batting?.power||0) + (p.physical?.speed||0) + (p.physical?.arm||0) + (p.fielding?.defense||0)) / 5);
  };
  const getPitcherOverall = (p) => {
    const vel = ((p.pitching?.velocity||130) - 115) * 2.5;
    const ctrl = p.pitching?.control || 50;
    const sta = (p.pitching?.stamina || 100) / 2;
    return Math.round((vel + ctrl + sta) / 3);
  };

  const getSortValue = (p, key) => {
    switch(key) {
      case 'name': return p.name;
      case 'age': return p.age || 20;
      case 'position': return p.position;
      case 'meet': return p.batting?.meet || 0;
      case 'power': return p.batting?.power || 0;
      case 'speed': return p.physical?.speed || 0;
      case 'arm': return p.physical?.arm || 0;
      case 'defense': return p.fielding?.defense || 0;
      case 'velocity': return p.pitching?.velocity || 0;
      case 'control': return p.pitching?.control || 0;
      case 'stamina': return p.pitching?.stamina || 0;
      case 'fielderOverall': return getFielderOverall(p);
      case 'pitcherOverall': return getPitcherOverall(p);
      case 'overall': default: {
        const isPitcher = p.position === 'pitcher';
        return isPitcher ? getPitcherOverall(p) : getFielderOverall(p);
      }
    }
  };

  const filteredCandidates = tryoutCandidates
    .filter(player => {
      if (positionTab !== 'all') {
        const category = getPositionCategory(player.position);
        if (category !== positionTab) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);
      const dir = sortDir === 'desc' ? -1 : 1;
      if (typeof aVal === 'string') return dir * aVal.localeCompare(bVal);
      return dir * (aVal - bVal);
    });

  const currentTeam = currentPick < draftOrder.length ? draftOrder[currentPick].team : null;
  const isUserTurn = currentTeam === 'ユーザー';

  const getRankColor = (rank) => ({
    S: 'text-pink-400',
    A: 'text-red-400',
    B: 'text-orange-400',
    C: 'text-yellow-400',
    D: 'text-green-400',
    E: 'text-blue-400',
    F: 'text-gray-400'
  }[rank]);

  return (
    <div className="p-8 bg-green-900 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">🎯 トライアウト</h1>

        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="grid grid-cols-3 gap-4 text-white">
            <div>
              <div className="text-sm text-gray-400">現在のピック</div>
              <div className="text-2xl font-bold">{currentPick + 1} / {draftOrder.length}</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">指名チーム</div>
              <div className="text-2xl font-bold">{currentTeam || '終了'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">獲得選手数</div>
              <div className="text-2xl font-bold">{userRoster.length} 人</div>
            </div>
          </div>
          {isUserTurn && (
            <div className="mt-4 text-green-400 font-bold">
              ✅ あなたの指名順です。選手を選択してください。
            </div>
          )}
          {!isUserTurn && currentTeam && (
            <div className="mt-4 text-yellow-400 font-bold">
              ⏳ {currentTeam} が選択中...
            </div>
          )}
          {!draftComplete && isUserTurn && userRoster.length > 0 && (
            <button
              onClick={() => finalizeDraft()}
              className="mt-4 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded font-bold transition"
            >
              指名終了
            </button>
          )}
          {draftComplete && (
            <div className="mt-4">
              <div className="text-green-400 font-bold text-lg mb-3">
                ドラフト完了 - 各チームの選手がロスターに追加されました
              </div>
              {!isInitialTryout && onComplete && (
                <button
                  onClick={() => onComplete()}
                  className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded font-bold transition"
                >
                  トライアウト終了 →
                </button>
              )}
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-2 mb-4 flex gap-2">
          <button
            onClick={() => setViewTab('draft')}
            className={`flex-1 px-4 py-2 rounded font-bold transition ${
              viewTab === 'draft' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            ドラフト
          </button>
          <button
            onClick={() => setViewTab('roster')}
            className={`flex-1 px-4 py-2 rounded font-bold transition ${
              viewTab === 'roster' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            現有戦力
          </button>
          <button
            onClick={() => setViewTab('history')}
            className={`flex-1 px-4 py-2 rounded font-bold transition ${
              viewTab === 'history' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            指名結果
          </button>
          <button
            onClick={() => setViewTab('details')}
            className={`flex-1 px-4 py-2 rounded font-bold transition ${
              viewTab === 'details' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            詳細
          </button>
        </div>

        {viewTab === 'draft' && userRoster.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold">現在の編成 ({userRoster.length}/24人)</h3>
            </div>
            {(() => {
              const positionCounts = { pitcher: 0, catcher: 0, infielder: 0, outfielder: 0 };
              userRoster.forEach(player => {
                const category = getPositionCategory(player.position);
                if (category in positionCounts) positionCounts[category]++;
              });
              const getStatusIcon = (current, min, ideal) => {
                if (current >= ideal) return '✅';
                if (current >= min) return '🟡';
                return '🔴';
              };
              return (
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-gray-700 rounded p-2 text-center">
                    <div className="text-sm text-gray-400">投手</div>
                    <div className="text-white font-bold text-lg">{getStatusIcon(positionCounts.pitcher, 5, 10)} {positionCounts.pitcher}/10</div>
                  </div>
                  <div className="bg-gray-700 rounded p-2 text-center">
                    <div className="text-sm text-gray-400">捕手</div>
                    <div className="text-white font-bold text-lg">{getStatusIcon(positionCounts.catcher, 1, 2)} {positionCounts.catcher}/2</div>
                  </div>
                  <div className="bg-gray-700 rounded p-2 text-center">
                    <div className="text-sm text-gray-400">内野手</div>
                    <div className="text-white font-bold text-lg">{getStatusIcon(positionCounts.infielder, 4, 6)} {positionCounts.infielder}/6</div>
                  </div>
                  <div className="bg-gray-700 rounded p-2 text-center">
                    <div className="text-sm text-gray-400">外野手</div>
                    <div className="text-white font-bold text-lg">{getStatusIcon(positionCounts.outfielder, 3, 6)} {positionCounts.outfielder}/6</div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {viewTab === 'roster' && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-white mb-4">📋 現有戦力一覧</h2>
            {(() => {
              const teamsArray = Array.isArray(allTeams) ? allTeams : Object.keys(allTeams);
              const userTeamName = teamsArray[0];
              const existingPlayers = TEAMS_DATA[userTeamName]?.players || [];
              const total = existingPlayers.length + userRoster.length;
              const positionCounts = { pitcher: 0, catcher: 0, infielder: 0, outfielder: 0 };
              existingPlayers.forEach(p => {
                const category = getPositionCategory(p.position);
                if (category in positionCounts) positionCounts[category]++;
              });
              userRoster.forEach(p => {
                const category = getPositionCategory(p.position);
                if (category in positionCounts) positionCounts[category]++;
              });
              return (
                <>
                  <div className="bg-gray-700 rounded-lg p-4 mb-4">
                    <div className="text-white font-bold text-lg mb-2">
                      {userTeamName} - 現在 {existingPlayers.length}人 + ドラフト {userRoster.length}人 = 合計 {total}人
                    </div>
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      <div className="bg-gray-600 rounded p-2 text-center">
                        <div className="text-sm text-gray-300">投手</div>
                        <div className="text-white font-bold">{positionCounts.pitcher}人</div>
                      </div>
                      <div className="bg-gray-600 rounded p-2 text-center">
                        <div className="text-sm text-gray-300">捕手</div>
                        <div className="text-white font-bold">{positionCounts.catcher}人</div>
                      </div>
                      <div className="bg-gray-600 rounded p-2 text-center">
                        <div className="text-sm text-gray-300">内野手</div>
                        <div className="text-white font-bold">{positionCounts.infielder}人</div>
                      </div>
                      <div className="bg-gray-600 rounded p-2 text-center">
                        <div className="text-sm text-gray-300">外野手</div>
                        <div className="text-white font-bold">{positionCounts.outfielder}人</div>
                      </div>
                    </div>
                    {total > 24 && (
                      <div className="text-red-400 text-sm mt-2">⚠️ ロスター上限(24人)を超えています。トライアウト後に解雇が必要です。</div>
                    )}
                  </div>
                  {existingPlayers.length > 0 ? (
                    <div className="space-y-4">
                      {['pitcher', 'catcher', 'infielder', 'outfielder'].map(category => {
                        const categoryPlayers = existingPlayers.filter(p => getPositionCategory(p.position) === category);
                        if (categoryPlayers.length === 0) return null;
                        const categoryLabels = { pitcher: '投手', catcher: '捕手', infielder: '内野手', outfielder: '外野手' };
                        return (
                          <div key={category}>
                            <h3 className="text-white font-bold mb-2 text-sm border-b border-gray-600 pb-1">{categoryLabels[category]} ({categoryPlayers.length}人)</h3>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-gray-600 text-gray-300">
                                  <tr>
                                    <th className="px-2 py-1">名前</th>
                                    <th className="px-2 py-1">年齢</th>
                                    <th className="px-2 py-1">守備</th>
                                    <th className="px-2 py-1">ミ</th>
                                    <th className="px-2 py-1">パ</th>
                                    <th className="px-2 py-1">走</th>
                                    <th className="px-2 py-1">肩</th>
                                    <th className="px-2 py-1">守</th>
                                    <th className="px-2 py-1">球速</th>
                                    <th className="px-2 py-1">制球</th>
                                    <th className="px-2 py-1">スタ</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {categoryPlayers.map(player => (
                                    <tr key={player.id} className="border-b border-gray-700">
                                      <td className="px-2 py-1 text-white font-bold">{player.name}</td>
                                      <td className="px-2 py-1 text-gray-300">{player.age || '?'}</td>
                                      <td className="px-2 py-1 text-gray-300">{getPositionName(player.position)}</td>
                                      <td className={`px-2 py-1 ${getRankColor(getAbilityRank(player.batting?.meet||0))}`}>{getAbilityRank(player.batting?.meet||0)}</td>
                                      <td className={`px-2 py-1 ${getRankColor(getAbilityRank(player.batting?.power||0))}`}>{getAbilityRank(player.batting?.power||0)}</td>
                                      <td className={`px-2 py-1 ${getRankColor(getAbilityRank(player.physical?.speed||0))}`}>{getAbilityRank(player.physical?.speed||0)}</td>
                                      <td className={`px-2 py-1 ${getRankColor(getAbilityRank(player.physical?.arm||0))}`}>{getAbilityRank(player.physical?.arm||0)}</td>
                                      <td className={`px-2 py-1 ${getRankColor(getAbilityRank(player.fielding?.defense||0))}`}>{getAbilityRank(player.fielding?.defense||0)}</td>
                                      <td className={`px-2 py-1 ${getRankColor(getAbilityRank(player.pitching?.velocity||0, true))}`}>{getAbilityRank(player.pitching?.velocity||0, true)}</td>
                                      <td className={`px-2 py-1 ${getRankColor(getAbilityRank(player.pitching?.control||0))}`}>{getAbilityRank(player.pitching?.control||0)}</td>
                                      <td className={`px-2 py-1 ${getRankColor(getAbilityRank(player.pitching?.stamina||0, false, true))}`}>{getAbilityRank(player.pitching?.stamina||0, false, true)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-gray-400 text-center py-8">現有選手はいません（初回トライアウト）</div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {viewTab === 'history' && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-white mb-4">📋 ドラフト指名結果</h2>
            {draftHistory.length > 0 ? (
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {draftHistory.map((entry, index) => {
                  const teamsArray = Array.isArray(allTeams) ? allTeams : Object.keys(allTeams);
                  const isUserTeam = entry.team === teamsArray[0];
                  const positionLabel = entry.player.position === 'pitcher' ? '投手' :
                    entry.player.position === 'catcher' ? '捕手' :
                    ['first', 'second', 'third', 'short'].includes(entry.player.position) ? '内野手' : '外野手';
                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-3 p-2 rounded ${isUserTeam ? 'bg-blue-900/50' : 'bg-gray-700/50'}`}
                    >
                      <span className="text-yellow-400 font-bold w-24 shrink-0">ドラフト{entry.round}位</span>
                      <span className="text-white font-bold w-24 shrink-0">{entry.player.name}</span>
                      <span className="text-gray-300 w-16 shrink-0">{positionLabel}</span>
                      <span className="text-gray-400 w-12 shrink-0">{entry.player.age}歳</span>
                      <span className={`font-bold ${isUserTeam ? 'text-blue-400' : 'text-gray-400'}`}>{entry.team}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-gray-400 text-center py-8">まだ指名がありません</div>
            )}
          </div>
        )}

        {viewTab === 'details' && (
          <div className="space-y-4 mb-6">
            {userRoster.length > 0 && (
              <div className="bg-gradient-to-r from-blue-900 to-blue-800 rounded-lg p-6 border-2 border-blue-500">
                <h2 className="text-2xl font-bold text-white mb-4">👥 あなたのチーム ({userRoster.length}/24人)</h2>
                <div className="space-y-4">
                  {['pitcher', 'catcher', 'infielder', 'outfielder'].map(category => {
                    const categoryPlayers = userRoster.filter(p => getPositionCategory(p.position) === category);
                    if (categoryPlayers.length === 0) return null;
                    const categoryLabels = { pitcher: '投手', catcher: '捕手', infielder: '内野手', outfielder: '外野手' };
                    return (
                      <div key={category}>
                        <h3 className="text-white font-bold mb-2 text-sm border-b border-blue-700 pb-1">{categoryLabels[category]} ({categoryPlayers.length}人)</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {categoryPlayers.map(player => (
                            <div key={player.id} className="bg-gray-700 rounded p-2 text-white text-sm">
                              <div className="font-bold">{player.name}</div>
                              <div className="text-xs text-gray-400">{getPositionName(player.position)} | {player.age}歳</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-2xl font-bold text-white mb-4">🏆 各チームのドラフト状況</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.keys(teamRosters).map(teamName => {
                  const roster = teamRosters[teamName] || [];
                  if (roster.length === 0) return null;
                  return (
                    <div key={teamName} className="bg-gray-700 rounded-lg p-4">
                      <h3 className="text-white font-bold mb-2 flex items-center justify-between">
                        <span>{teamName === 'ユーザー' ? 'あなたのチーム' : teamName}</span>
                        <span className="text-sm text-gray-400">{roster.length}人</span>
                      </h3>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {roster.map(player => (
                          <div key={player.id} className="text-sm text-gray-300 flex justify-between">
                            <span>{player.name}</span>
                            <span className="text-gray-500">{getPositionName(player.position)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {viewTab === 'draft' && (
          <>
            <div className="bg-gray-800 rounded-lg p-4 mb-4">
              <div className="flex gap-2">
                {[
                  { key: 'all', label: '全選手' },
                  { key: 'pitcher', label: '投手' },
                  { key: 'catcher', label: '捕手' },
                  { key: 'infielder', label: '内野手' },
                  { key: 'outfielder', label: '外野手' }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setPositionTab(tab.key)}
                    className={`px-4 py-2 rounded font-bold transition ${
                      positionTab === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 mb-6 flex gap-4">
              <div className="text-white ml-auto self-center">候補者: {filteredCandidates.length} 人</div>
            </div>

            <div className="bg-gray-800 rounded-lg overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-700 text-gray-300 text-xs sticky top-0">
                  <tr>
                    <th className="px-2 py-2 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort('name')}>名前{getSortIndicator('name')}</th>
                    <th className="px-2 py-2 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort('age')}>年齢{getSortIndicator('age')}</th>
                    <th className="px-2 py-2 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort('position')}>守備{getSortIndicator('position')}</th>
                    <th className="px-2 py-2 whitespace-nowrap">投打</th>
                    <th className="px-2 py-2 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort('meet')}>ミート{getSortIndicator('meet')}</th>
                    <th className="px-2 py-2 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort('power')}>パワー{getSortIndicator('power')}</th>
                    <th className="px-2 py-2 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort('speed')}>走力{getSortIndicator('speed')}</th>
                    <th className="px-2 py-2 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort('arm')}>肩{getSortIndicator('arm')}</th>
                    <th className="px-2 py-2 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort('defense')}>守備{getSortIndicator('defense')}</th>
                    <th className="px-2 py-2 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort('velocity')}>球速{getSortIndicator('velocity')}</th>
                    <th className="px-2 py-2 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort('control')}>制球{getSortIndicator('control')}</th>
                    <th className="px-2 py-2 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort('stamina')}>スタミナ{getSortIndicator('stamina')}</th>
                    <th className="px-2 py-2 whitespace-nowrap">変化球</th>
                    <th className="px-2 py-2 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort('fielderOverall')}>野手総合{getSortIndicator('fielderOverall')}</th>
                    <th className="px-2 py-2 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort('pitcherOverall')}>投手総合{getSortIndicator('pitcherOverall')}</th>
                    <th className="px-2 py-2 whitespace-nowrap">スカウト評価</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.map(player => {
                    const throwLabel = player.physical?.throws === 'left' ? '左投' : '右投';
                    const batLabel = player.batting?.bats === 'left' ? '左打' : player.batting?.bats === 'switch' ? '両打' : '右打';
                    const fOverall = getFielderOverall(player);
                    const pOverall = getPitcherOverall(player);
                    const fRank = getAbilityRank(fOverall);
                    const pRank = getAbilityRank(pOverall);
                    return (
                      <tr
                        key={player.id}
                        className={`border-b border-gray-700 ${isUserTurn ? 'cursor-pointer hover:bg-gray-700' : 'opacity-60'} transition ${player.isReleasedCandidate ? 'bg-amber-950/30' : ''}`}
                        onClick={() => isUserTurn && handleSelectPlayer(player)}
                      >
                        <td className="px-2 py-1.5 text-white font-bold whitespace-nowrap">
                          {player.name}
                          {player.isReleasedCandidate && (
                            <span
                              className="ml-1 inline-block px-1 py-0.5 text-[10px] bg-amber-700 text-amber-100 rounded align-middle"
                              title={`前所属: ${player.previousTeam || '不明'} / 解雇 ${player.releasedYear || '?'}年目`}
                            >
                              FA
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-gray-300 whitespace-nowrap">
                          {player.age}
                        </td>
                        <td className="px-2 py-1.5 text-gray-300 whitespace-nowrap">{getPositionName(player.position)}</td>
                        <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap">{throwLabel}{batLabel}</td>
                        <td className={`px-2 py-1.5 font-bold ${getRankColor(getAbilityRank(player.batting?.meet||0))}`}>{getAbilityRank(player.batting?.meet||0)}</td>
                        <td className={`px-2 py-1.5 font-bold ${getRankColor(getAbilityRank(player.batting?.power||0))}`}>{getAbilityRank(player.batting?.power||0)}</td>
                        <td className={`px-2 py-1.5 font-bold ${getRankColor(getAbilityRank(player.physical?.speed||0))}`}>{getAbilityRank(player.physical?.speed||0)}</td>
                        <td className={`px-2 py-1.5 font-bold ${getRankColor(getAbilityRank(player.physical?.arm||0))}`}>{getAbilityRank(player.physical?.arm||0)}</td>
                        <td className={`px-2 py-1.5 font-bold ${getRankColor(getAbilityRank(player.fielding?.defense||0))}`}>{getAbilityRank(player.fielding?.defense||0)}</td>
                        <td className={`px-2 py-1.5 font-bold ${getRankColor(getAbilityRank(player.pitching?.velocity||0, true))}`}>{getAbilityRank(player.pitching?.velocity||0, true)}</td>
                        <td className={`px-2 py-1.5 font-bold ${getRankColor(getAbilityRank(player.pitching?.control||0))}`}>{getAbilityRank(player.pitching?.control||0)}</td>
                        <td className={`px-2 py-1.5 font-bold ${getRankColor(getAbilityRank(player.pitching?.stamina||0, false, true))}`}>{getAbilityRank(player.pitching?.stamina||0, false, true)}</td>
                        <td className="px-2 py-1.5 text-xs whitespace-nowrap max-w-[160px] truncate">
                          {(() => {
                            const arsenal = (player.pitching?.arsenal || []).filter(a => a.type !== 'straight');
                            if (arsenal.length === 0) return <span className="text-gray-500">-</span>;
                            return arsenal.map((a, i) => {
                              const rank = getAbilityRank(a.level || 0);
                              return <span key={i} className={getRankColor(rank)}>{i > 0 ? '/' : ''}{getPitchTypeName(a.type)}{rank}</span>;
                            });
                          })()}
                        </td>
                        <td className={`px-2 py-1.5 font-bold ${getRankColor(fRank)}`}>{fRank}</td>
                        <td className={`px-2 py-1.5 font-bold ${getRankColor(pRank)}`}>{pRank}</td>
                        <td className="px-2 py-1.5 text-xs text-gray-400 max-w-[220px]" title={player.scoutComment || generateScoutComment(player)}>
                          <span className="line-clamp-2">{player.scoutComment || generateScoutComment(player)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {userRoster.length > 24 && draftComplete && (
          <div className="mt-8 bg-red-900 border-2 border-red-700 rounded-lg p-6">
            <div className="flex items-center gap-3">
              <span className="text-4xl">⚠️</span>
              <div>
                <div className="text-red-200 font-bold text-xl mb-1">ロスター人数が24人を超えています！</div>
                <div className="text-red-300">ロスター管理画面で{userRoster.length - 24}人を解雇してください</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TryoutScreen;
