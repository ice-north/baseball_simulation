import React, { useState, useEffect, useRef } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { generateTryoutCandidates, generateSnakeDraftOrder, selectPlayerForAI, applyReputationBonus, updateReleasedPoolAfterTryout, generateScoutComment } from '../season/tryoutSystem.js';
import { removeDraftedFromGraduatePools } from '../season/universityPool.js';
import { getPitchTypeName } from '../season/yearProgressionSystem.js';
import { POSITION_NAMES, POSITION_NAMES_FULL, getAbilityRank, getRankColor, getPositionSortIndex } from '../utils/constants.js';
import { INDEPENDENT_LEAGUES } from '../corporate/independentLeagueData.js';

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
  const draftFinalizedRef = useRef(false);
  const candidatesGeneratedRef = useRef(false);

  const getPositionName = (position) => POSITION_NAMES_FULL[position] || position;

  const getPositionCategory = (position) => {
    if (position === 'pitcher') return 'pitcher';
    if (position === 'catcher') return 'catcher';
    if (['first', 'second', 'third', 'short'].includes(position)) return 'infielder';
    if (['left', 'center', 'right'].includes(position)) return 'outfielder';
    return 'all';
  };

  useEffect(() => {
    if (candidatesGeneratedRef.current || tryoutCandidates.length > 0) return;
    candidatesGeneratedRef.current = true;

    const year = isInitialTryout ? 1 : (seasonData?.year || 1);
    const teamCount = seasonData?.settings?.teamsCount || Object.keys(allTeams).length || 4;
    const preset = seasonData?.settings?.preset;
    const leagueDef = preset ? INDEPENDENT_LEAGUES[preset] : null;
    const ilRank = leagueDef ? (leagueDef.teams?.[0]?.rank || 'B') : null;
    let candidates = generateTryoutCandidates(year, teamCount, isInitialTryout, ilRank);
    if (!isInitialTryout) {
      candidates = applyReputationBonus(candidates, allTeams);
    }
    setTryoutCandidates(candidates);

    const teamsArray = Array.isArray(allTeams) ? allTeams : Object.keys(allTeams);
    let teamNames = ['ユーザー', ...teamsArray.slice(1)];

    if (!isInitialTryout && seasonData?.standings?.length > 0) {
      const standingsSorted = [...seasonData.standings].sort((a, b) => a.winRate - b.winRate);
      teamNames = standingsSorted.map(s => {
        return s.team === teamsArray[0] ? 'ユーザー' : s.team;
      });
    }

    const rounds = isInitialTryout ? 24 : Math.min(24, Math.floor(candidates.length / teamNames.length));
    const order = generateSnakeDraftOrder(teamNames, rounds);
    setDraftOrder(order);
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
          setDraftHistory(prev => [...prev, {
            pick: currentPick + 1,
            round: draftOrder[currentPick].round,
            team: currentTeam,
            player: null,
            skipped: true,
            reason: 'ロスター満員'
          }]);
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
    if (draftFinalizedRef.current || draftComplete) return;
    const teamsArrayForSave = Array.isArray(allTeams) ? allTeams : Object.keys(allTeams);

    if (!skipCheck) {
      const userTeamName = teamsArrayForSave[0];
      const userDrafted = teamRosters['ユーザー'] || [];
      const existingPlayers = TEAMS_DATA[userTeamName]?.players || [];
      const totalPlayers = existingPlayers.length + userDrafted.length;
      if (totalPlayers < 9) {
        if (tryoutCandidates.length === 0) {
          if (!window.confirm(`チームの合計人数が${totalPlayers}人です（最低9人必要）。\n候補選手がいないため、このまま続行します。`)) return;
        } else {
          alert(`チームの合計人数が${totalPlayers}人です。試合に必要な最低9人になるまで指名を続けてください。`);
          return;
        }
      }
    }

    draftFinalizedRef.current = true;

    const allDraftedIds = [];
    const draftYear = isInitialTryout ? 1 : (seasonData?.year || 1);
    Object.keys(teamRosters).forEach(teamName => {
      const draftedPlayers = teamRosters[teamName] || [];
      const actualTeamName = teamName === 'ユーザー' ? teamsArrayForSave[0] : teamName;
      if (TEAMS_DATA[actualTeamName]) {
        const existingIds = new Set((TEAMS_DATA[actualTeamName].players || []).map(p => p.id));
        const newPlayers = draftedPlayers.filter(p => !existingIds.has(p.id));
        newPlayers.forEach(p => {
          const historyEntry = draftHistory.find(h => h.player?.id === p.id);
          p.draftInfo = {
            year: draftYear,
            round: historyEntry?.round || 0
          };
          if (!p.careerHistory) p.careerHistory = [];
          p.careerHistory.push({ type: 'independent', year: draftYear, label: actualTeamName });
        });
        TEAMS_DATA[actualTeamName].players = [
          ...(TEAMS_DATA[actualTeamName].players || []),
          ...newPlayers
        ];
      }
      draftedPlayers.forEach(p => allDraftedIds.push(p.id));
    });
    // 解雇プールを更新（再獲得された選手は削除、不指名は年齢+1・能力減衰）
    if (!isInitialTryout) {
      updateReleasedPoolAfterTryout(allDraftedIds);
      // 高校生プール・大学プールから指名者を除去（オフシーズン振り分けとの二重計上を防止）
      removeDraftedFromGraduatePools(allDraftedIds);
    }
    if (initializeAllPitchingRotations) initializeAllPitchingRotations();
    setDraftComplete(true);
    if (isInitialTryout && onComplete) {
      setTimeout(() => onComplete(), 1000);
    }
  };

  useEffect(() => {
    if ((currentPick >= draftOrder.length || tryoutCandidates.length === 0) && draftOrder.length > 0 && !draftComplete) {
      finalizeDraft(false);
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
      case 'position': return getPositionSortIndex(p.position);
      case 'meet': return p.batting?.meet || 0;
      case 'power': return p.batting?.power || 0;
      case 'speed': return p.physical?.speed || 0;
      case 'arm': return p.physical?.arm || 0;
      case 'defense': return p.fielding?.defense || 0;
      case 'velocity': return p.pitching?.velocity || 0;
      case 'control': return p.pitching?.control || 0;
      case 'stamina': return p.pitching?.stamina || 0;
      case 'spinRate': return p.pitching?.spinRate ?? 50;
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

  return (
    <div className="p-6 bg-gray-900 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-xl font-bold text-white mb-1">トライアウト</h1>
        <p className="text-gray-500 text-sm mb-5">ドラフト形式で選手を指名してロスターを編成してください</p>

        <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 p-5 mb-5">
          <div className="grid grid-cols-3 gap-4 text-white">
            <div>
              <div className="text-xs text-gray-400 mb-1">現在のピック</div>
              <div className="text-2xl font-bold">{currentPick + 1} / {draftOrder.length}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">指名チーム</div>
              <div className="text-2xl font-bold">{currentTeam || '終了'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">獲得選手数</div>
              <div className="text-2xl font-bold">{userRoster.length} 人</div>
            </div>
          </div>
          {isUserTurn && (
            <div className="mt-4 text-green-400 font-semibold text-sm">
              あなたの指名順です。選手を選択してください。
            </div>
          )}
          {!isUserTurn && currentTeam && (
            <div className="mt-4 text-yellow-400 text-sm">
              {currentTeam} が選択中...
            </div>
          )}
          {!draftComplete && isUserTurn && userRoster.length > 0 && (
            <button
              onClick={() => finalizeDraft()}
              className="mt-4 bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg font-semibold transition text-sm"
            >
              指名終了
            </button>
          )}
          {draftComplete && (
            <div className="mt-4">
              <div className="text-green-400 font-semibold mb-3">
                ドラフト完了 - 各チームの選手がロスターに追加されました
              </div>
              {!isInitialTryout && onComplete && (
                <button
                  onClick={() => onComplete()}
                  className="bg-green-600 hover:bg-green-500 text-white px-5 py-2 rounded-lg font-semibold transition text-sm"
                >
                  トライアウト終了 →
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-1.5 mb-4 bg-gray-800/60 rounded-xl p-1.5 border border-gray-700/50">
          {[
            { key: 'draft', label: 'ドラフト' },
            { key: 'roster', label: '現有戦力' },
            { key: 'history', label: '指名結果' },
            { key: 'details', label: '詳細' }
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setViewTab(key)}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                viewTab === key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {viewTab === 'draft' && userRoster.length > 0 && (
          <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 p-4 mb-4">
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
              const shortages = [];
              if (positionCounts.pitcher < 5) shortages.push(`投手があと${5 - positionCounts.pitcher}人必要`);
              if (positionCounts.catcher < 1) shortages.push('捕手が不足');
              if (positionCounts.infielder < 4) shortages.push(`内野手があと${4 - positionCounts.infielder}人必要`);
              if (positionCounts.outfielder < 3) shortages.push(`外野手があと${3 - positionCounts.outfielder}人必要`);
              return (
                <>
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
                  {shortages.length > 0 && (
                    <div className="mt-2 bg-red-900/40 border border-red-700/50 rounded-lg px-3 py-2 flex items-start gap-2">
                      <span className="text-red-400 text-sm font-bold shrink-0">!</span>
                      <div className="text-red-300 text-xs">
                        <span className="font-bold">編成不足: </span>
                        {shortages.join(' / ')}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {viewTab === 'roster' && (
          <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 p-5 mb-5">
            <h2 className="text-lg font-bold text-white mb-4">現有戦力一覧</h2>
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
                                    <th className="px-2 py-1">速</th>
                                    <th className="px-2 py-1">制</th>
                                    <th className="px-2 py-1">ス</th>
                                    <th className="px-2 py-1">回転</th>
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
                                      <td className={`px-2 py-1 ${getRankColor(getAbilityRank(player.pitching?.spinRate??50))}`}>{getAbilityRank(player.pitching?.spinRate??50)}</td>
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
          <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 p-5 mb-5">
            <h2 className="text-lg font-bold text-white mb-4">ドラフト指名結果</h2>
            {draftHistory.length > 0 ? (
              <div className="space-y-1 max-h-[520px] overflow-y-auto">
                {draftHistory.map((entry, index) => {
                  const teamsArray = Array.isArray(allTeams) ? allTeams : Object.keys(allTeams);
                  const isUserTeam = entry.team === teamsArray[0];
                  if (entry.skipped) {
                    return (
                      <div key={index} className="flex items-center gap-3 p-2 rounded bg-gray-800/50 opacity-60">
                        <span className="text-gray-500 font-bold w-24 shrink-0">ドラフト{entry.round}位</span>
                        <span className="text-gray-500 w-24 shrink-0">---</span>
                        <span className="text-gray-600 w-16 shrink-0">{entry.reason}</span>
                        <span className="text-gray-600">{entry.team}</span>
                      </div>
                    );
                  }
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
              <div className="bg-blue-900/30 rounded-xl border border-blue-700/50 p-5">
                <h2 className="text-lg font-bold text-white mb-4">あなたのチーム ({userRoster.length}/24人)</h2>
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

            <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 p-5">
              <h2 className="text-lg font-bold text-white mb-4">各チームのドラフト状況</h2>
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
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="flex gap-1 bg-gray-800/60 rounded-xl p-1 border border-gray-700/50">
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
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                      positionTab === tab.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="text-gray-400 text-sm ml-auto">候補者: {filteredCandidates.length} 人</div>
            </div>

            {/* おすすめ候補 */}
            {isUserTurn && (() => {
              const positionCounts = { pitcher: 0, catcher: 0, infielder: 0, outfielder: 0 };
              userRoster.forEach(player => {
                const cat = getPositionCategory(player.position);
                if (cat in positionCounts) positionCounts[cat]++;
              });
              const needs = [];
              const mins = { pitcher: { min: 5, ideal: 10 }, catcher: { min: 1, ideal: 2 }, infielder: { min: 4, ideal: 6 }, outfielder: { min: 3, ideal: 6 } };
              const catLabels = { pitcher: '投手', catcher: '捕手', infielder: '内野手', outfielder: '外野手' };
              Object.entries(mins).forEach(([cat, { min, ideal }]) => {
                if (positionCounts[cat] < ideal) {
                  const urgency = positionCounts[cat] < min ? 'critical' : 'want';
                  const best = tryoutCandidates
                    .filter(p => getPositionCategory(p.position) === cat)
                    .sort((a, b) => {
                      const aO = a.position === 'pitcher' ? getPitcherOverall(a) : getFielderOverall(a);
                      const bO = b.position === 'pitcher' ? getPitcherOverall(b) : getFielderOverall(b);
                      return bO - aO;
                    })[0];
                  if (best) needs.push({ cat, urgency, label: catLabels[cat], current: positionCounts[cat], ideal, player: best });
                }
              });
              if (needs.length === 0) return null;
              return (
                <div className="bg-gray-800/60 rounded-xl border border-gray-700/50 p-3 mb-3">
                  <div className="text-xs text-gray-400 font-bold mb-2">おすすめ候補</div>
                  <div className="flex gap-2 flex-wrap">
                    {needs.map(n => (
                      <div
                        key={n.cat}
                        onClick={() => isUserTurn && handleSelectPlayer(n.player)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition hover:scale-[1.02] ${
                          n.urgency === 'critical'
                            ? 'bg-red-900/30 border-red-700/50 hover:bg-red-900/50'
                            : 'bg-blue-900/20 border-blue-700/40 hover:bg-blue-900/40'
                        }`}
                      >
                        <div>
                          <div className={`text-xs font-bold ${n.urgency === 'critical' ? 'text-red-400' : 'text-blue-400'}`}>
                            {n.label} ({n.current}/{n.ideal})
                          </div>
                          <div className="text-white text-xs font-bold">{n.player.name}</div>
                          <div className="text-gray-500 text-xs">
                            {POSITION_NAMES[n.player.position]} {n.player.age}歳
                            {n.player.position === 'pitcher'
                              ? ` ${n.player.pitching?.velocity || 0}km 制${n.player.pitching?.control || 0}`
                              : ` ミ${n.player.batting?.meet || 0} パ${n.player.batting?.power || 0}`
                            }
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 mb-5">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-800 text-gray-400 text-xs sticky top-0 border-b border-gray-700/50">
                  <tr>
                    {[
                      { label: '名前', key: 'name', tip: null },
                      { label: '齢', key: 'age', tip: '年齢' },
                      { label: '守', key: 'position', tip: 'ポジション' },
                      { label: '投打', key: null, tip: '投球/打席の左右' },
                      { label: 'ミ', key: 'meet', tip: 'ミート（打撃精度）' },
                      { label: 'パ', key: 'power', tip: 'パワー（長打力）' },
                      { label: '走', key: 'speed', tip: '走力' },
                      { label: '肩', key: 'arm', tip: '肩力' },
                      { label: '守', key: 'defense', tip: '守備力' },
                      { label: '速', key: 'velocity', tip: '球速（km/h）' },
                      { label: '制', key: 'control', tip: '制球力' },
                      { label: 'ス', key: 'stamina', tip: 'スタミナ' },
                      { label: '回', key: 'spinRate', tip: '球の回転数' },
                      { label: '変化球', key: null, tip: '習得変化球' },
                      { label: '野', key: 'fielderOverall', tip: '野手総合力' },
                      { label: '投', key: 'pitcherOverall', tip: '投手総合力' },
                      { label: 'スカウト評価', key: null, tip: 'スカウトの選手評価' },
                    ].map((col, i) => (
                      // Tooltipでラップすると<tr>直下が<span>になり列がズレるため、
                      // <th>を直接の子にしてツールチップは native title で付ける
                      <th
                        key={i}
                        title={col.tip || undefined}
                        className={`px-1 py-1.5 whitespace-nowrap ${col.key ? 'cursor-pointer hover:text-white' : ''}`}
                        onClick={col.key ? () => handleSort(col.key) : undefined}
                      >
                        {col.label}{col.key ? getSortIndicator(col.key) : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.map((player, idx) => {
                    const throwLabel = player.physical?.throws === 'left' ? '左投' : '右投';
                    const batLabel = player.batting?.bats === 'left' ? '左打' : player.batting?.bats === 'switch' ? '両打' : '右打';
                    const fOverall = getFielderOverall(player);
                    const pOverall = getPitcherOverall(player);
                    const fRank = getAbilityRank(fOverall);
                    const pRank = getAbilityRank(pOverall);
                    return (
                      <tr
                        key={`${player.id}-${idx}`}
                        className={`border-b border-gray-700 ${isUserTurn ? 'cursor-pointer hover:bg-gray-700' : 'opacity-60'} transition ${player.isReleasedCandidate ? 'bg-amber-950/30' : ''}`}
                        onClick={() => isUserTurn && handleSelectPlayer(player)}
                      >
                        <td className="px-1 py-1 text-white font-bold whitespace-nowrap">
                          {player.name}
                          {player.isReleasedCandidate && (
                            <span
                              className="ml-0.5 inline-block px-0.5 text-xs bg-amber-700 text-amber-100 rounded align-middle"
                              title={`前所属: ${player.previousTeam || '不明'} / 解雇 ${player.releasedYear || '?'}年目`}
                            >
                              FA
                            </span>
                          )}
                          {player._tryoutSource === 'highschool' && (
                            <span className="ml-0.5 inline-block px-0.5 text-xs bg-sky-700 text-sky-100 rounded align-middle" title="高校卒業予定">高卒</span>
                          )}
                          {player._tryoutSource === 'university' && (
                            <span className="ml-0.5 inline-block px-0.5 text-xs bg-emerald-700 text-emerald-100 rounded align-middle" title="大学4年生（卒業予定）">大卒</span>
                          )}
                          {player.isNewcomer && !player.isReleasedCandidate && !player._tryoutSource && (
                            <span className="ml-0.5 inline-block px-0.5 text-xs bg-gray-600 text-gray-100 rounded align-middle" title="新規候補">新人</span>
                          )}
                        </td>
                        <td className="px-1 py-1 text-gray-300 text-center whitespace-nowrap">{player.age}</td>
                        <td className="px-1 py-1 text-gray-300 text-center whitespace-nowrap">{POSITION_NAMES[player.position] || player.position}</td>
                        <td className="px-1 py-1 text-gray-400 text-center whitespace-nowrap">{throwLabel}{batLabel}</td>
                        <td className={`px-1 py-1 font-bold text-center ${getRankColor(getAbilityRank(player.batting?.meet||0))}`}>{getAbilityRank(player.batting?.meet||0)}</td>
                        <td className={`px-1 py-1 font-bold text-center ${getRankColor(getAbilityRank(player.batting?.power||0))}`}>{getAbilityRank(player.batting?.power||0)}</td>
                        <td className={`px-1 py-1 font-bold text-center ${getRankColor(getAbilityRank(player.physical?.speed||0))}`}>{getAbilityRank(player.physical?.speed||0)}</td>
                        <td className={`px-1 py-1 font-bold text-center ${getRankColor(getAbilityRank(player.physical?.arm||0))}`}>{getAbilityRank(player.physical?.arm||0)}</td>
                        <td className={`px-1 py-1 font-bold text-center ${getRankColor(getAbilityRank(player.fielding?.defense||0))}`}>{getAbilityRank(player.fielding?.defense||0)}</td>
                        <td className={`px-1 py-1 font-bold text-center ${getRankColor(getAbilityRank(player.pitching?.velocity||0, true))}`}>{getAbilityRank(player.pitching?.velocity||0, true)}</td>
                        <td className={`px-1 py-1 font-bold text-center ${getRankColor(getAbilityRank(player.pitching?.control||0))}`}>{getAbilityRank(player.pitching?.control||0)}</td>
                        <td className={`px-1 py-1 font-bold text-center ${getRankColor(getAbilityRank(player.pitching?.stamina||0, false, true))}`}>{getAbilityRank(player.pitching?.stamina||0, false, true)}</td>
                        <td className={`px-1 py-1 font-bold text-center ${getRankColor(getAbilityRank(player.pitching?.spinRate??50))}`}>{getAbilityRank(player.pitching?.spinRate??50)}</td>
                        <td className="px-1 py-1 text-xs whitespace-nowrap">
                          {(() => {
                            const arsenal = (player.pitching?.arsenal || []).filter(a => a.type !== 'straight');
                            if (arsenal.length === 0) return <span className="text-gray-500">-</span>;
                            return arsenal.map((a, i) => {
                              const rank = getAbilityRank(a.level || 0);
                              return <span key={i} className={getRankColor(rank)}>{i > 0 ? '/' : ''}{getPitchTypeName(a.type)}{rank}</span>;
                            });
                          })()}
                        </td>
                        <td className={`px-1 py-1 font-bold text-center ${getRankColor(fRank)}`}>{fRank}</td>
                        <td className={`px-1 py-1 font-bold text-center ${getRankColor(pRank)}`}>{pRank}</td>
                        <td className="px-1 py-1 text-xs leading-tight">
                          {(() => {
                            const comment = player.scoutComment || generateScoutComment(player);
                            const sc = typeof comment === 'string' ? { text: comment, potentialHint: '', potentialLevel: 3 } : comment;
                            const hintColor = sc.potentialLevel >= 5 ? 'text-red-400 font-bold'
                              : sc.potentialLevel >= 4 ? 'text-orange-400 font-bold'
                              : sc.potentialLevel <= 1 ? 'text-blue-400'
                              : sc.potentialLevel <= 2 ? 'text-gray-500'
                              : '';
                            const talentColor = (sc.talentHint || '').includes('線が細') || (sc.talentHint || '').includes('不器用')
                              ? 'text-gray-500' : 'text-emerald-400';
                            return (
                              <span>
                                <span className="text-gray-300">{sc.text}</span>
                                {sc.talentHint && <span className={`ml-0.5 ${talentColor}`}>{sc.talentHint}</span>}
                                {sc.potentialHint && <span className={`ml-0.5 ${hintColor}`}>{sc.potentialHint}</span>}
                              </span>
                            );
                          })()}
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
          <div className="mt-6 bg-red-900/40 border border-red-700/60 rounded-xl p-5">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-red-300 font-bold mb-1">ロスター人数が24人を超えています</div>
                <div className="text-red-400 text-sm">ロスター管理画面で{userRoster.length - 24}人を解雇してください</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TryoutScreen;
