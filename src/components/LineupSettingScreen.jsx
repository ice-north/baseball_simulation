import React, { useState, useEffect, useMemo } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES } from '../utils/constants.js';

const LineupSettingScreen = ({ teamName, onBack }) => {
  const [tab, setTab] = useState('lineup');
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [selectedBattingOrder, setSelectedBattingOrder] = useState(null);
  const [benchSortKey, setBenchSortKey] = useState(null);
  const [benchSortAsc, setBenchSortAsc] = useState(false);

  const team = TEAMS_DATA[teamName];
  if (!team) return <div className="p-8 text-white">チームが見つかりません</div>;

  const getAbilityRank = (value) => {
    if (value >= 90) return 'S';
    if (value >= 80) return 'A';
    if (value >= 70) return 'B';
    if (value >= 60) return 'C';
    if (value >= 50) return 'D';
    if (value >= 40) return 'E';
    return 'F';
  };

  const getRankColor = (rank) => {
    const colors = { S: 'text-pink-400', A: 'text-red-400', B: 'text-orange-400', C: 'text-yellow-400', D: 'text-green-400', E: 'text-blue-400', F: 'text-gray-400' };
    return colors[rank] || 'text-gray-400';
  };

  const getVelocityRank = (velocity) => {
    const adjusted = (velocity - 115) * 2.5;
    return getAbilityRank(adjusted);
  };

  const getThrowsLabel = (throws) => throws === 'left' ? '左投' : '右投';
  const getBatsLabel = (bats) => bats === 'left' ? '左打' : bats === 'switch' ? '両打' : '右打';

  const getFormLabel = (form) => {
    const forms = { overhand: 'オーバー', threeQuarter: 'スリークォーター', sidearm: 'サイド', submarine: 'アンダー' };
    return forms[form] || form;
  };

  if (!team.lineupSettings) {
    team.lineupSettings = {
      battingOrder: [],
      benchPlayers: [],
      substitutionRules: { pinchHitter: [], pinchRunner: [] }
    };
  }

  if (!team.pitchingRotation) {
    team.pitchingRotation = {
      starters: [],
      middleRelievers: [],
      closers: [],
      currentStarterIndex: 0
    };
  }

  const fielders = team.players.filter(p => p.position !== 'pitcher');
  const pitchers = team.players.filter(p => p.position === 'pitcher');
  const lineup = team.lineupSettings.battingOrder;

  // スタメン入りしている選手IDのセット
  const lineupPlayerIds = new Set(lineup.map(e => e.playerId));

  // 控え選手（1-8番スタメン野手を除く全選手。投手枠は別管理なので除外しない）
  const fieldLineupIds = new Set(lineup.filter(e => e.battingOrder >= 1 && e.battingOrder <= 8).map(e => e.playerId));
  // 重複安全対策: player.id で重複除去
  const benchPlayers = (() => {
    const seen = new Set();
    return team.players.filter(p => {
      if (fieldLineupIds.has(p.id)) return false;
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  })();

  // 初期化：投手枠がなければ9番に投手を自動設定
  useEffect(() => {
    const hasPitcherSlot = lineup.some(e => e.position === 'pitcher');
    if (!hasPitcherSlot && pitchers.length > 0) {
      const starterId = team.pitchingRotation?.starters?.[0] || pitchers[0].id;
      lineup.push({ playerId: starterId, position: 'pitcher', battingOrder: 9 });
      setUpdateTrigger(prev => prev + 1);
    }
  }, []);

  const handleAddToLineup = (playerId) => {
    if (!selectedBattingOrder) {
      alert('打順を選択してください（1-8番の枠をクリック）');
      return;
    }

    const player = team.players.find(p => p.id === playerId);
    const isPitcher = player.position === 'pitcher';

    const existingEntry = lineup.find(e => e.battingOrder === selectedBattingOrder);
    if (existingEntry?.position === 'pitcher') {
      // 投手枠に別の選手を入れる場合、投手として入れる
      if (existingEntry) {
        const idx = lineup.indexOf(existingEntry);
        lineup.splice(idx, 1);
      }
      lineup.push({ playerId, position: 'pitcher', battingOrder: selectedBattingOrder });
      lineup.sort((a, b) => a.battingOrder - b.battingOrder);
      setUpdateTrigger(prev => prev + 1);
      return;
    }

    if (existingEntry) {
      const idx = lineup.indexOf(existingEntry);
      lineup.splice(idx, 1);
    }
    const playerIndex = lineup.findIndex(entry => entry.playerId === playerId);
    if (playerIndex !== -1) lineup.splice(playerIndex, 1);

    // 投手が野手枠に入る場合、適正の高いポジションを選ぶ
    let assignedPosition = isPitcher ? 'first' : player.position;
    if (isPitcher && player.positionFitness) {
      const allPositions = ['catcher', 'first', 'second', 'short', 'third', 'left', 'center', 'right'];
      const usedPositions = lineup.filter(e => e.position !== 'pitcher').map(e => e.position);
      const availablePositions = allPositions.filter(pos => !usedPositions.includes(pos));
      if (availablePositions.length > 0) {
        availablePositions.sort((a, b) => (player.positionFitness[b] || 0) - (player.positionFitness[a] || 0));
        assignedPosition = availablePositions[0];
      }
    } else {
      const existingPositionEntry = lineup.find(e => e.position === assignedPosition && e.position !== 'pitcher' && e.battingOrder !== selectedBattingOrder);
      if (existingPositionEntry) {
        const allPositions = ['catcher', 'first', 'second', 'short', 'third', 'left', 'center', 'right'];
        const usedPositions = lineup.filter(e => e.position !== 'pitcher').map(e => e.position);
        const availablePositions = allPositions.filter(pos => !usedPositions.includes(pos));
        if (availablePositions.length > 0) {
          if (player.positionFitness) {
            availablePositions.sort((a, b) => (player.positionFitness[b] || 0) - (player.positionFitness[a] || 0));
          }
          assignedPosition = availablePositions[0];
        }
      }
    }

    lineup.push({ playerId, position: assignedPosition, battingOrder: selectedBattingOrder });
    lineup.sort((a, b) => a.battingOrder - b.battingOrder);
    const nextOrder = selectedBattingOrder < 8 ? selectedBattingOrder + 1 : 1;
    setSelectedBattingOrder(nextOrder);
    setUpdateTrigger(prev => prev + 1);
  };

  const handleChangePosition = (battingOrder, newPosition) => {
    const entry = lineup.find(e => e.battingOrder === battingOrder);
    if (!entry) return;
    // 投手枠（9番投手）の場合は投手から変更不可
    const isPitcherSlot = entry.position === 'pitcher' && lineup.filter(e => e.position === 'pitcher').length === 1;
    if (isPitcherSlot && newPosition !== 'pitcher') {
      alert('投手枠は投手のまま維持する必要があります');
      return;
    }
    const existingEntry = lineup.find(e => e.position === newPosition && e.battingOrder !== battingOrder);
    if (existingEntry) {
      const oldPosition = entry.position;
      existingEntry.position = oldPosition;
      entry.position = newPosition;
    } else {
      entry.position = newPosition;
    }
    setUpdateTrigger(prev => prev + 1);
  };

  const handleSwapBattingOrder = (order1, order2) => {
    const entry1 = lineup.find(e => e.battingOrder === order1);
    const entry2 = lineup.find(e => e.battingOrder === order2);
    if (entry1 && entry2) {
      entry1.battingOrder = order2;
      entry2.battingOrder = order1;
      lineup.sort((a, b) => a.battingOrder - b.battingOrder);
      setUpdateTrigger(prev => prev + 1);
    }
  };

  const handleRemoveFromLineup = (playerId) => {
    const entry = lineup.find(e => e.playerId === playerId);
    if (entry?.position === 'pitcher') {
      alert('投手枠は外せません。投手を交換するには投手リストから別の投手を選択してください。');
      return;
    }
    // splice で配列を直接変更（filter で新配列を作ると lineup 参照がずれてバグの原因になる）
    const idx = lineup.findIndex(e => e.playerId === playerId);
    if (idx !== -1) {
      lineup.splice(idx, 1);
    }
    setUpdateTrigger(prev => prev + 1);
  };

  const handleAddToRotation = (playerId, role) => {
    const rotation = team.pitchingRotation;
    if (role === 'starter') {
      if (!rotation.starters.includes(playerId)) rotation.starters.push(playerId);
    } else if (role === 'middle') {
      if (!rotation.middleRelievers) rotation.middleRelievers = [];
      if (!rotation.middleRelievers.includes(playerId)) rotation.middleRelievers.push(playerId);
    } else if (role === 'setup') {
      if (!rotation.setupMen) rotation.setupMen = [];
      if (!rotation.setupMen.includes(playerId)) rotation.setupMen.push(playerId);
    } else if (role === 'closer') {
      rotation.closer = playerId;
    }
    setUpdateTrigger(prev => prev + 1);
  };

  const handleRemoveFromRotation = (playerId, role) => {
    const rotation = team.pitchingRotation;
    if (role === 'starter') {
      rotation.starters = rotation.starters.filter(id => id !== playerId);
    } else if (role === 'middle') {
      rotation.middleRelievers = (rotation.middleRelievers || []).filter(id => id !== playerId);
    } else if (role === 'setup') {
      rotation.setupMen = (rotation.setupMen || []).filter(id => id !== playerId);
    } else if (role === 'closer') {
      if (rotation.closer === playerId) rotation.closer = null;
    }
    setUpdateTrigger(prev => prev + 1);
  };

  const handleChangePitcher = (newPitcherId) => {
    const pitcherEntry = lineup.find(e => e.position === 'pitcher');
    if (pitcherEntry) {
      pitcherEntry.playerId = newPitcherId;
    }
    setUpdateTrigger(prev => prev + 1);
  };

  // 控え選手のソート用値を取得
  const getBenchSortValue = (player, key) => {
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
      default: return 0;
    }
  };

  const handleBenchSort = (key) => {
    if (benchSortKey === key) {
      setBenchSortAsc(!benchSortAsc);
    } else {
      setBenchSortKey(key);
      setBenchSortAsc(false);
    }
  };

  const sortedBenchPlayers = useMemo(() => {
    if (!benchSortKey) return benchPlayers;
    return [...benchPlayers].sort((a, b) => {
      const va = getBenchSortValue(a, benchSortKey);
      const vb = getBenchSortValue(b, benchSortKey);
      if (typeof va === 'string') return benchSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return benchSortAsc ? va - vb : vb - va;
    });
  }, [benchPlayers, benchSortKey, benchSortAsc, updateTrigger]);

  // 1行表示用の控え選手行コンポーネント
  const BenchPlayerRow = ({ player }) => {
    const isPitcher = player.position === 'pitcher';
    const isInLineup = lineupPlayerIds.has(player.id);
    const rotation = team.pitchingRotation || {};
    const isStarter = rotation.starters?.includes(player.id);
    const isMiddle = rotation.middleRelievers?.includes(player.id);
    const isSetup = rotation.setupMen?.includes(player.id);
    const isCloser = rotation.closer === player.id;
    const roleLabel = isStarter ? '先発' : isMiddle ? '中継' : isSetup ? 'SU' : isCloser ? '抑え' : '';

    const StatCell = ({ value, isVelocity }) => {
      const rank = isVelocity ? getVelocityRank(value) : getAbilityRank(value);
      return <td className={`py-1 px-1 text-xs text-center ${getRankColor(rank)}`}>{value}</td>;
    };
    const EmptyCell = () => <td className="py-1 px-1 text-xs text-center text-gray-600">-</td>;

    return (
      <tr
        className={`border-b border-gray-700 cursor-pointer transition ${isInLineup ? 'opacity-40' : 'hover:bg-gray-600'}`}
        onClick={() => {
          if (isInLineup) return;
          // 1-8番が選択されている場合は、投手でも野手としてスタメンに追加
          if (selectedBattingOrder && selectedBattingOrder >= 1 && selectedBattingOrder <= 8) {
            handleAddToLineup(player.id);
          } else if (isPitcher) {
            // 打順未選択または9番の場合は投手枠を交換
            handleChangePitcher(player.id);
          } else {
            handleAddToLineup(player.id);
          }
        }}
      >
        <td className="py-1 px-1 text-sm text-white font-bold whitespace-nowrap">{player.name}</td>
        <td className="py-1 px-1 text-xs text-gray-400 text-center">{player.age}</td>
        <td className="py-1 px-1 text-xs whitespace-nowrap">
          <span className={isPitcher ? 'text-indigo-300' : 'text-gray-300'}>
            {POSITION_NAMES[player.position] || player.position}
          </span>
          {roleLabel && <span className="ml-1 text-yellow-400">({roleLabel})</span>}
        </td>
        <td className="py-1 px-1 text-xs text-gray-400 whitespace-nowrap">
          {getThrowsLabel(player.physical?.throws)}{getBatsLabel(player.batting?.bats || player.physical?.bats)}
        </td>
        {/* 野手能力: ミート、パワー、走力、肩、守備（全選手表示） */}
        <StatCell value={player.batting?.meet || 0} />
        <StatCell value={player.batting?.power || 0} />
        <StatCell value={player.physical?.speed || 0} />
        <StatCell value={player.physical?.arm || 0} />
        <StatCell value={player.fielding?.defense || 0} />
        {/* 投手能力: 球速、制球、スタミナ（全選手表示） */}
        <StatCell value={player.pitching?.velocity || 0} isVelocity />
        <StatCell value={player.pitching?.control || 0} />
        <StatCell value={player.pitching?.stamina || 0} />
      </tr>
    );
  };

  const SortHeader = ({ label, sortKey, className = '' }) => (
    <th
      className={`py-1 px-1 cursor-pointer hover:text-white transition select-none ${className}`}
      onClick={() => handleBenchSort(sortKey)}
    >
      {label}{benchSortKey === sortKey ? (benchSortAsc ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">⚙️ {teamName} - スタメン・投手設定</h1>
          {onBack && (
            <button onClick={onBack} className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded font-bold transition">
              ← 戻る
            </button>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-2 mb-6 flex gap-2">
          {['lineup', 'rotation', 'defense'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 px-4 py-2 rounded font-bold transition ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              {t === 'lineup' ? 'スタメン設定' : t === 'rotation' ? '投手ローテーション' : '守備分析'}
            </button>
          ))}
        </div>

        {tab === 'lineup' && (
          <div className="grid grid-cols-3 gap-4">
            {/* 左側: スタメン (1/3) */}
            <div className="bg-gray-800 rounded-lg p-4 col-span-1">
              <h2 className="text-xl font-bold text-white mb-4">スタメン設定 ({lineup.length}/9人)</h2>
              <p className="text-sm text-gray-400 mb-2">1-8番: 野手を配置 / 9番: 投手（試合時に先発投手が入る）</p>
              <div className="space-y-2">
                {[1,2,3,4,5,6,7,8,9].map(order => {
                  const entry = lineup.find(e => e.battingOrder === order);
                  const player = entry ? team.players.find(p => p.id === entry.playerId) : null;
                  const isSelected = selectedBattingOrder === order;
                  const isPitcherSlot = entry?.position === 'pitcher';
                  return (
                    <div key={order} onClick={() => !isPitcherSlot && setSelectedBattingOrder(order)} className={`rounded p-3 cursor-pointer transition ${isSelected ? 'bg-blue-700 ring-2 ring-blue-400' : player ? (isPitcherSlot ? 'bg-indigo-800 hover:bg-indigo-700' : 'bg-gray-700 hover:bg-gray-600') : 'bg-gray-900 hover:bg-gray-800 border border-dashed border-gray-600'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`font-bold text-lg w-6 ${isSelected ? 'text-blue-300' : 'text-white'}`}>{order}</div>
                        {isPitcherSlot ? (
                          <div className="flex-1 flex items-center justify-between">
                            <div>
                              <span className="text-indigo-300 font-bold">投手</span>
                              <span className="text-xs text-gray-500 ml-2">（試合時に先発投手が打席に立つ）</span>
                            </div>
                            <div className="flex gap-2">
                              {order > 1 && (
                                <button onClick={(e) => { e.stopPropagation(); handleSwapBattingOrder(order, order - 1); }} className="bg-gray-500 hover:bg-gray-400 text-white px-2 py-1 rounded text-xs">↑</button>
                              )}
                              {order < 9 && (
                                <button onClick={(e) => { e.stopPropagation(); handleSwapBattingOrder(order, order + 1); }} className="bg-gray-500 hover:bg-gray-400 text-white px-2 py-1 rounded text-xs">↓</button>
                              )}
                            </div>
                          </div>
                        ) : player ? (
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-white font-bold">{player.name}</div>
                                <div className="text-xs text-gray-400 flex items-center gap-2">
                                  <select value={entry.position} onChange={(e) => { e.stopPropagation(); handleChangePosition(order, e.target.value); }} className="bg-gray-600 text-white rounded px-2 py-0.5 text-xs" onClick={(e) => e.stopPropagation()}>
                                    <option value="pitcher">投手</option><option value="catcher">捕手</option><option value="first">一塁</option><option value="second">二塁</option><option value="third">三塁</option><option value="short">遊撃</option><option value="left">左翼</option><option value="center">中堅</option><option value="right">右翼</option>
                                  </select>
                                  <span>| {player.age}歳</span>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {order > 1 && (
                                  <button onClick={(e) => { e.stopPropagation(); handleSwapBattingOrder(order, order - 1); }} className="bg-gray-500 hover:bg-gray-400 text-white px-2 py-1 rounded text-xs">↑</button>
                                )}
                                {order < 9 && (
                                  <button onClick={(e) => { e.stopPropagation(); handleSwapBattingOrder(order, order + 1); }} className="bg-gray-500 hover:bg-gray-400 text-white px-2 py-1 rounded text-xs">↓</button>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); handleRemoveFromLineup(player.id); }} className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs">外す</button>
                              </div>
                            </div>
                            <div className="text-xs mt-1 flex gap-2">
                              {[{label:'ミ',value:player.batting?.meet||0},{label:'パ',value:player.batting?.power||0},{label:'走',value:player.physical?.speed||0},{label:'肩',value:player.physical?.arm||0},{label:'守',value:player.fielding?.defense||0}].map(stat => {
                                const rank = getAbilityRank(stat.value);
                                return <span key={stat.label} className={getRankColor(rank)}>{stat.label}{stat.value}</span>;
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-500 italic">未設定（クリックして選手を追加）</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 右側: 控え選手一覧（2/3） */}
            <div className="bg-gray-800 rounded-lg p-4 col-span-2">
              <h2 className="text-lg font-bold text-white mb-2">
                控え選手 ({benchPlayers.length}人)
                {selectedBattingOrder && <span className="text-blue-400 text-sm ml-2">→ {selectedBattingOrder}番に追加</span>}
              </h2>
              <p className="text-xs text-gray-400 mb-2">クリックでスタメンに追加（投手は投手枠を交換）/ ヘッダークリックでソート</p>
              <div className="overflow-y-auto max-h-[700px]">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-600 text-xs text-gray-400">
                      <SortHeader label="名前" sortKey="name" />
                      <SortHeader label="齢" sortKey="age" />
                      <SortHeader label="守備" sortKey="position" />
                      <th className="py-1 px-1">投打</th>
                      <SortHeader label="ミ" sortKey="meet" className="text-center" />
                      <SortHeader label="パ" sortKey="power" className="text-center" />
                      <SortHeader label="走" sortKey="speed" className="text-center" />
                      <SortHeader label="肩" sortKey="arm" className="text-center" />
                      <SortHeader label="守" sortKey="defense" className="text-center" />
                      <SortHeader label="球速" sortKey="velocity" className="text-center" />
                      <SortHeader label="制球" sortKey="control" className="text-center" />
                      <SortHeader label="スタ" sortKey="stamina" className="text-center" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBenchPlayers.map(player => (
                      <BenchPlayerRow key={player.id} player={player} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'rotation' && (
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-4">先発ローテーション ({team.pitchingRotation.starters.length}人)</h2>
                {team.pitchingRotation.starters.length === 0 ? (
                  <p className="text-gray-400 text-sm">右側の投手一覧から選択してください</p>
                ) : (
                  <div className="space-y-2">
                    {team.pitchingRotation.starters.map((playerId, idx) => {
                      const player = team.players.find(p => p.id === playerId);
                      if (!player) return null;
                      const velocityRank = getVelocityRank(player.pitching.velocity);
                      const controlRank = getAbilityRank(player.pitching.control);
                      const staminaRank = getAbilityRank(player.pitching.stamina / 2);
                      return (
                        <div key={player.id} className="bg-gray-700 rounded p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <div className="text-white font-bold flex items-center gap-2">
                                第{idx + 1}先発: {player.name}
                                <span className="text-xs text-gray-400">{getThrowsLabel(player.physical.throws)} | {getFormLabel(player.pitching.form)}</span>
                              </div>
                            </div>
                            <button onClick={() => handleRemoveFromRotation(player.id, 'starter')} className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs">外す</button>
                          </div>
                          <div className="text-xs flex gap-2">
                            <span className={getRankColor(velocityRank)}>球速 {velocityRank}{player.pitching.velocity}</span>
                            <span className={getRankColor(controlRank)}>制球 {controlRank}{player.pitching.control}</span>
                            <span className={getRankColor(staminaRank)}>スタミナ {staminaRank}{player.pitching.stamina}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[{key:'middle',label:'中継ぎ',list:team.pitchingRotation.middleRelievers||[]},{key:'setup',label:'セットアップ',list:team.pitchingRotation.setupMen||[]}].map(({key,label,list}) => (
                  <div key={key} className="bg-gray-800 rounded-lg p-4">
                    <h2 className="text-lg font-bold text-white mb-3">{label} ({list.length}人)</h2>
                    <div className="space-y-2">
                      {list.map(playerId => {
                        const player = team.players.find(p => p.id === playerId);
                        if (!player) return null;
                        return (
                          <div key={player.id} className="bg-gray-700 rounded p-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="text-white text-sm font-bold">{player.name}</div>
                                <div className="text-xs text-gray-400">{getThrowsLabel(player.physical.throws)}</div>
                              </div>
                              <button onClick={() => handleRemoveFromRotation(player.id, key)} className="bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded text-xs">外す</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="bg-gray-800 rounded-lg p-4">
                  <h2 className="text-lg font-bold text-white mb-3">守護神 ({team.pitchingRotation.closer ? 1 : 0}人)</h2>
                  <div className="space-y-2">
                    {team.pitchingRotation.closer && (() => {
                      const player = team.players.find(p => p.id === team.pitchingRotation.closer);
                      if (!player) return null;
                      return (
                        <div key={player.id} className="bg-gray-700 rounded p-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-white text-sm font-bold">{player.name}</div>
                              <div className="text-xs text-gray-400">{getThrowsLabel(player.physical.throws)}</div>
                            </div>
                            <button onClick={() => handleRemoveFromRotation(player.id, 'closer')} className="bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded text-xs">外す</button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">投手一覧（クリックでローテーションに追加）</h2>
              <div className="space-y-2 max-h-[700px] overflow-y-auto">
                {pitchers.map(player => {
                  const rotation = team.pitchingRotation || {};
                  const isStarter = rotation.starters?.includes(player.id) || false;
                  const isMiddle = rotation.middleRelievers?.includes(player.id) || false;
                  const isSetup = rotation.setupMen?.includes(player.id) || false;
                  const isCloser = rotation.closer === player.id;
                  const velocityRank = getVelocityRank(player.pitching.velocity);
                  const controlRank = getAbilityRank(player.pitching.control);
                  const staminaRank = getAbilityRank(player.pitching.stamina / 2);
                  return (
                    <div key={player.id} className="bg-gray-700 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-white font-bold">
                            {player.name}
                            <span className="text-xs text-gray-400 ml-2">{getThrowsLabel(player.physical.throws)} | {getFormLabel(player.pitching.form)}</span>
                          </div>
                          <div className="text-xs space-y-1 mt-1">
                            <div className="flex gap-3">
                              <span className={getRankColor(velocityRank)}>球速 {velocityRank}{player.pitching.velocity}</span>
                              <span className={getRankColor(controlRank)}>制球 {controlRank}{player.pitching.control}</span>
                              <span className={getRankColor(staminaRank)}>スタミナ {staminaRank}{player.pitching.stamina}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {isStarter && <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs">先発</span>}
                          {isMiddle && <span className="bg-green-600 text-white px-2 py-1 rounded text-xs">中継ぎ</span>}
                          {isSetup && <span className="bg-orange-600 text-white px-2 py-1 rounded text-xs">セットアップ</span>}
                          {isCloser && <span className="bg-purple-600 text-white px-2 py-1 rounded text-xs">守護神</span>}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {[{role:'starter',label:'先発',disabled:isStarter,color:'blue'},{role:'middle',label:'中継ぎ',disabled:isMiddle,color:'green'},{role:'setup',label:'セットアップ',disabled:isSetup,color:'orange'},{role:'closer',label:'守護神',disabled:isCloser,color:'purple'}].map(({role,label,disabled,color}) => (
                          <button key={role} onClick={() => handleAddToRotation(player.id, role)} disabled={disabled} className={`px-3 py-1 rounded text-sm transition ${disabled ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : `bg-${color}-600 hover:bg-${color}-700 text-white`}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'defense' && (() => {
          // スタメン選手のポジション別配置を取得
          const positionPlayers = {};
          lineup.forEach(entry => {
            const player = team.players.find(p => p.id === entry.playerId);
            if (player) positionPlayers[entry.position] = player;
          });

          // ダイヤモンド上の各ポジション座標（SVG 500x420）
          const posCoords = {
            pitcher:  { x: 250, y: 255 },
            catcher:  { x: 250, y: 370 },
            first:    { x: 370, y: 230 },
            second:   { x: 310, y: 175 },
            short:    { x: 190, y: 175 },
            third:    { x: 130, y: 230 },
            left:     { x: 80,  y: 90 },
            center:   { x: 250, y: 45 },
            right:    { x: 420, y: 90 },
          };

          // 守備範囲の計算（守備力+走力ベース）
          const getDefenseRange = (player, pos) => {
            if (!player) return 0;
            const def = player.fielding?.defense || 50;
            const spd = player.physical?.speed || 50;
            const arm = player.physical?.arm || 50;
            if (['left', 'center', 'right'].includes(pos)) {
              return (def * 0.3 + spd * 0.5 + arm * 0.2) / 100;
            } else if (['second', 'short'].includes(pos)) {
              return (def * 0.4 + spd * 0.3 + arm * 0.3) / 100;
            } else if (pos === 'catcher') {
              return (def * 0.5 + arm * 0.5) / 100;
            } else {
              return (def * 0.5 + spd * 0.25 + arm * 0.25) / 100;
            }
          };

          const posLabels = {
            pitcher: '投', catcher: '捕', first: '一', second: '二',
            short: '遊', third: '三', left: '左', center: '中', right: '右'
          };

          const getRangeColor = (range) => {
            if (range >= 0.75) return { fill: 'rgba(236,72,153,0.18)', stroke: '#ec4899' }; // S
            if (range >= 0.65) return { fill: 'rgba(248,113,113,0.16)', stroke: '#f87171' }; // A
            if (range >= 0.55) return { fill: 'rgba(251,191,36,0.14)', stroke: '#fbbf24' };  // B
            if (range >= 0.45) return { fill: 'rgba(74,222,128,0.12)', stroke: '#4ade80' };  // C
            return { fill: 'rgba(96,165,250,0.10)', stroke: '#60a5fa' };                      // D
          };

          return (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-800 rounded-lg p-4 col-span-2">
                <h2 className="text-xl font-bold text-white mb-4">守備分析 - ポジション配置</h2>
                <svg viewBox="0 0 500 420" className="w-full max-w-2xl mx-auto">
                  {/* グラウンド背景 */}
                  <rect x="0" y="0" width="500" height="420" fill="#1a472a" rx="12" />

                  {/* 外野芝 */}
                  <ellipse cx="250" cy="200" rx="230" ry="190" fill="#1f5c33" />

                  {/* 内野ダイヤモンド */}
                  <polygon points="250,135 370,250 250,365 130,250" fill="none" stroke="#c4a35a" strokeWidth="2" strokeDasharray="8,4" opacity="0.5" />

                  {/* 内野土 */}
                  <polygon points="250,180 340,250 250,320 160,250" fill="#8B6914" opacity="0.35" />

                  {/* ベースライン */}
                  <line x1="250" y1="360" x2="130" y2="245" stroke="#fff" strokeWidth="1.5" opacity="0.4" />
                  <line x1="250" y1="360" x2="370" y2="245" stroke="#fff" strokeWidth="1.5" opacity="0.4" />

                  {/* ベース */}
                  <rect x="244" y="354" width="12" height="12" fill="#fff" transform="rotate(45,250,360)" />
                  <rect x="364" y="244" width="10" height="10" fill="#fff" transform="rotate(45,369,249)" />
                  <rect x="245" y="169" width="10" height="10" fill="#fff" transform="rotate(45,250,174)" />
                  <rect x="125" y="244" width="10" height="10" fill="#fff" transform="rotate(45,130,249)" />

                  {/* マウンド */}
                  <circle cx="250" cy="265" r="10" fill="#8B6914" opacity="0.5" />

                  {/* 守備範囲の円（全ポジション） */}
                  {Object.entries(posCoords).map(([pos, coord]) => {
                    const player = positionPlayers[pos];
                    const range = getDefenseRange(player, pos);
                    const isOutfield = ['left', 'center', 'right'].includes(pos);
                    const baseRadius = isOutfield ? 55 : 35;
                    const radius = baseRadius * (0.5 + range * 0.8);
                    const colors = getRangeColor(range);
                    return (
                      <circle
                        key={`range-${pos}`}
                        cx={coord.x} cy={coord.y}
                        r={player ? radius : 0}
                        fill={colors.fill}
                        stroke={colors.stroke}
                        strokeWidth="1.5"
                        strokeDasharray="4,3"
                      />
                    );
                  })}

                  {/* 選手マーカーとラベル */}
                  {Object.entries(posCoords).map(([pos, coord]) => {
                    const player = positionPlayers[pos];
                    return (
                      <g key={pos}>
                        <circle cx={coord.x} cy={coord.y} r="16" fill={player ? '#1e40af' : '#374151'} stroke={player ? '#60a5fa' : '#6b7280'} strokeWidth="2" />
                        <text x={coord.x} y={coord.y + 1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="11" fontWeight="bold">{posLabels[pos]}</text>
                        {player && (
                          <>
                            <text x={coord.x} y={coord.y - 24} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">{player.name}</text>
                            <text x={coord.x} y={coord.y + 30} textAnchor="middle" fill="#9ca3af" fontSize="9">
                              守{player.fielding?.defense || 0} 走{player.physical?.speed || 0} 肩{player.physical?.arm || 0}
                            </text>
                          </>
                        )}
                        {!player && (
                          <text x={coord.x} y={coord.y - 22} textAnchor="middle" fill="#6b7280" fontSize="10">未配置</text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* 右側: 守備力サマリー */}
              <div className="bg-gray-800 rounded-lg p-4 col-span-1">
                <h2 className="text-lg font-bold text-white mb-4">守備力サマリー</h2>
                <div className="space-y-2">
                  {Object.entries(posCoords).map(([pos]) => {
                    const player = positionPlayers[pos];
                    const range = getDefenseRange(player, pos);
                    const rangeLabel = range >= 0.75 ? 'S' : range >= 0.65 ? 'A' : range >= 0.55 ? 'B' : range >= 0.45 ? 'C' : range >= 0.35 ? 'D' : 'E';
                    const rangeLabelColor = range >= 0.75 ? 'text-pink-400' : range >= 0.65 ? 'text-red-400' : range >= 0.55 ? 'text-orange-400' : range >= 0.45 ? 'text-yellow-400' : range >= 0.35 ? 'text-green-400' : 'text-blue-400';
                    return (
                      <div key={pos} className="bg-gray-700 rounded p-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-400 font-bold w-6 text-center">{posLabels[pos]}</span>
                          <span className="text-white text-sm">{player?.name || '-'}</span>
                        </div>
                        {player ? (
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-gray-400">守<span className={getRankColor(getAbilityRank(player.fielding?.defense || 0))}>{player.fielding?.defense || 0}</span></span>
                            <span className="text-gray-400">走<span className={getRankColor(getAbilityRank(player.physical?.speed || 0))}>{player.physical?.speed || 0}</span></span>
                            <span className="text-gray-400">肩<span className={getRankColor(getAbilityRank(player.physical?.arm || 0))}>{player.physical?.arm || 0}</span></span>
                            <span className={`font-bold ${rangeLabelColor}`}>{rangeLabel}</span>
                          </div>
                        ) : (
                          <span className="text-gray-500 text-xs">-</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* チーム守備総合評価 */}
                {(() => {
                  const allRanges = Object.keys(posCoords).map(pos => getDefenseRange(positionPlayers[pos], pos)).filter(r => r > 0);
                  const avgRange = allRanges.length > 0 ? allRanges.reduce((a, b) => a + b, 0) / allRanges.length : 0;
                  const teamGrade = avgRange >= 0.75 ? 'S' : avgRange >= 0.65 ? 'A' : avgRange >= 0.55 ? 'B' : avgRange >= 0.45 ? 'C' : avgRange >= 0.35 ? 'D' : 'E';
                  const teamColor = avgRange >= 0.75 ? 'text-pink-400' : avgRange >= 0.65 ? 'text-red-400' : avgRange >= 0.55 ? 'text-orange-400' : avgRange >= 0.45 ? 'text-yellow-400' : avgRange >= 0.35 ? 'text-green-400' : 'text-blue-400';
                  return (
                    <div className="mt-4 bg-gray-900 rounded p-3 text-center">
                      <div className="text-gray-400 text-sm mb-1">チーム守備総合</div>
                      <div className={`text-3xl font-bold ${teamColor}`}>{teamGrade}</div>
                      <div className="text-gray-500 text-xs mt-1">平均守備力: {Math.round(avgRange * 100)}</div>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default LineupSettingScreen;
