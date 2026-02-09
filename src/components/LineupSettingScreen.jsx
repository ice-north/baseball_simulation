import React, { useState, useEffect, useMemo } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES } from '../utils/constants.js';
import { getPitchTypeName } from '../season/yearProgressionSystem.js';

const LineupSettingScreen = ({ teamName, onBack }) => {
  const [tab, setTab] = useState('lineup');
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [selectedBattingOrder, setSelectedBattingOrder] = useState(null);
  const [benchSortKey, setBenchSortKey] = useState(null);
  const [benchSortAsc, setBenchSortAsc] = useState(false);
  const [selectedDefensePos, setSelectedDefensePos] = useState(null);

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

  // 投手起用法を設定（先発/リリーフの詳細ロール）
  const handleSetPitcherRole = (playerId, newRole) => {
    const rotation = team.pitchingRotation;
    if (!rotation.pitcherRoles) rotation.pitcherRoles = {};

    // 全既存配列から除外
    rotation.starters = (rotation.starters || []).filter(id => id !== playerId);
    rotation.middleRelievers = (rotation.middleRelievers || []).filter(id => id !== playerId);
    rotation.setupMen = (rotation.setupMen || []).filter(id => id !== playerId);
    if (rotation.closer === playerId) rotation.closer = null;

    if (newRole === 'none') {
      delete rotation.pitcherRoles[playerId];
    } else {
      rotation.pitcherRoles[playerId] = newRole;
      // レガシー配列にも反映
      if (['complete', 'short', 'quality'].includes(newRole)) {
        rotation.starters.push(playerId);
      } else if (['long', 'onepoint'].includes(newRole)) {
        if (!rotation.middleRelievers) rotation.middleRelievers = [];
        rotation.middleRelievers.push(playerId);
      } else if (newRole === 'setup') {
        if (!rotation.setupMen) rotation.setupMen = [];
        rotation.setupMen.push(playerId);
      } else if (newRole === 'closer') {
        rotation.closer = playerId;
      }
    }
    setUpdateTrigger(prev => prev + 1);
  };

  // 投手の現在のロールを取得
  const getPitcherRole = (playerId) => {
    const rotation = team.pitchingRotation;
    if (rotation.pitcherRoles?.[playerId]) return rotation.pitcherRoles[playerId];
    // レガシーデータからの逆引き
    if (rotation.starters?.includes(playerId)) return 'quality';
    if (rotation.middleRelievers?.includes(playerId)) return 'long';
    if (rotation.setupMen?.includes(playerId)) return 'setup';
    if (rotation.closer === playerId) return 'closer';
    return 'none';
  };

  // ロールのラベルと色
  const PITCHER_ROLES = {
    none:     { label: '未設定', color: 'bg-gray-600', textColor: 'text-gray-400', group: 'none' },
    complete: { label: '完投型', color: 'bg-blue-700', textColor: 'text-blue-300', group: 'starter' },
    short:    { label: 'ショート', color: 'bg-blue-600', textColor: 'text-blue-300', group: 'starter' },
    quality:  { label: '勝ち権利', color: 'bg-blue-500', textColor: 'text-blue-200', group: 'starter' },
    long:     { label: 'ロング', color: 'bg-green-700', textColor: 'text-green-300', group: 'relief' },
    onepoint: { label: 'ワンポイント', color: 'bg-green-600', textColor: 'text-green-300', group: 'relief' },
    setup:    { label: 'セットアップ', color: 'bg-orange-600', textColor: 'text-orange-300', group: 'relief' },
    closer:   { label: '守護神', color: 'bg-purple-600', textColor: 'text-purple-300', group: 'relief' },
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
          {['lineup', 'rotation', 'defense', 'strategy'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 px-4 py-2 rounded font-bold transition ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              {t === 'lineup' ? 'スタメン設定' : t === 'rotation' ? '投手起用' : t === 'defense' ? '守備分析' : '作戦指示'}
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

        {tab === 'rotation' && (() => {
          // 全選手をロール別にグループ分け（投手以外の野手も表示可能に）
          const allPlayers = team.players || [];
          const starterPitchers = allPlayers.filter(p => ['complete', 'short', 'quality'].includes(getPitcherRole(p.id)));
          const reliefPitchers = allPlayers.filter(p => ['long', 'onepoint', 'setup', 'closer'].includes(getPitcherRole(p.id)));
          const unassignedPitchers = allPlayers.filter(p => p.position === 'pitcher' && getPitcherRole(p.id) === 'none');
          const fieldersForConvert = allPlayers.filter(p => p.position !== 'pitcher' && getPitcherRole(p.id) === 'none');

          // ポジション変更ハンドラー
          const handleConvertPosition = (playerId, newPosition) => {
            const player = allPlayers.find(p => p.id === playerId);
            if (!player) return;
            const oldPos = player.position;
            player.position = newPosition;
            // 投手→野手に変更した場合、投手ロールをクリア
            if (oldPos === 'pitcher' && newPosition !== 'pitcher') {
              handleSetPitcherRole(playerId, 'none');
            }
            setUpdateTrigger(prev => prev + 1);
          };

          const StatVal = ({ label, value, isVelocity }) => {
            const rank = isVelocity ? getVelocityRank(value) : getAbilityRank(value);
            return <span className={`${getRankColor(rank)}`}>{label}{value}</span>;
          };

          const getArsenalDisplay = (player) => {
            const arsenal = (player.pitching?.arsenal || []).filter(a => a.type !== 'straight');
            if (arsenal.length === 0) return null;
            return arsenal.map((a, i) => {
              const rank = getAbilityRank(a.level || 0);
              return <span key={i} className={`${getRankColor(rank)}`}>{i > 0 ? '/' : ''}{getPitchTypeName(a.type)}{rank}</span>;
            });
          };

          // 投手行コンポーネント（2行表示、変化球+コンバート対応）
          const PitcherRow = ({ player, index, showConvert }) => {
            const role = getPitcherRole(player.id);
            const roleInfo = PITCHER_ROLES[role];
            const p = player.pitching || {};
            const b = player.batting || {};
            const ph = player.physical || {};
            const f = player.fielding || {};
            const arsenalDisplay = getArsenalDisplay(player);

            return (
              <div className="bg-gray-700 rounded p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {starterPitchers.includes(player) && (
                      <span className="text-blue-400 font-bold text-sm w-5 shrink-0">#{index + 1}</span>
                    )}
                    <span className={`font-bold text-sm truncate ${player.position === 'pitcher' ? 'text-white' : 'text-cyan-300'}`}>{player.name}</span>
                    <span className="text-gray-400 text-xs shrink-0">{player.age}歳</span>
                    <span className="text-gray-400 text-xs shrink-0">{getThrowsLabel(ph.throws)}{getBatsLabel(b.bats || ph.bats)}</span>
                    {p.form && <span className="text-gray-500 text-xs shrink-0">{getFormLabel(p.form)}</span>}
                    {showConvert && (
                      <select
                        value={player.position}
                        onChange={(e) => handleConvertPosition(player.id, e.target.value)}
                        className="bg-gray-600 text-white rounded px-1 py-0.5 text-xs"
                      >
                        <option value="pitcher">投手</option><option value="catcher">捕手</option><option value="first">一塁</option><option value="second">二塁</option><option value="third">三塁</option><option value="short">遊撃</option><option value="left">左翼</option><option value="center">中堅</option><option value="right">右翼</option>
                      </select>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <span className={`${roleInfo.color} text-white px-2 py-0.5 rounded text-xs font-bold`}>{roleInfo.label}</span>
                    <select
                      value={role}
                      onChange={(e) => handleSetPitcherRole(player.id, e.target.value)}
                      className="bg-gray-600 text-white rounded px-1 py-0.5 text-xs cursor-pointer"
                    >
                      <optgroup label="先発">
                        <option value="complete">完投型</option>
                        <option value="short">ショートスターター</option>
                        <option value="quality">勝ち権利</option>
                      </optgroup>
                      <optgroup label="リリーフ">
                        <option value="long">ロングリリーフ</option>
                        <option value="onepoint">ワンポイント</option>
                        <option value="setup">セットアッパー</option>
                        <option value="closer">守護神</option>
                      </optgroup>
                      <option value="none">未設定</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs flex-wrap">
                  <span className="text-gray-500 mr-1">投:</span>
                  <StatVal label="球速" value={p.velocity || 0} isVelocity />
                  <StatVal label=" 制球" value={p.control || 0} />
                  <StatVal label=" スタ" value={p.stamina || 0} />
                  {arsenalDisplay && <>
                    <span className="text-gray-600 mx-1">│</span>
                    <span className="text-gray-500 mr-1">変:</span>
                    {arsenalDisplay}
                  </>}
                  <span className="text-gray-600 mx-1">│</span>
                  <span className="text-gray-500 mr-1">打:</span>
                  <StatVal label="ミ" value={b.meet || 0} />
                  <StatVal label=" パ" value={b.power || 0} />
                  <StatVal label=" 走" value={ph.speed || 0} />
                  <StatVal label=" 肩" value={ph.arm || 0} />
                  <StatVal label=" 守" value={f.defense || 0} />
                </div>
              </div>
            );
          };

          return (
            <div className="space-y-4">
              {/* 先発投手 */}
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-xl font-bold text-blue-400">先発投手</h2>
                  <span className="text-gray-400 text-sm">({starterPitchers.length}人)</span>
                </div>
                {starterPitchers.length === 0 ? (
                  <p className="text-gray-500 text-sm py-2">先発投手が設定されていません。</p>
                ) : (
                  <div className="space-y-2">
                    {starterPitchers.map((player, idx) => (
                      <PitcherRow key={player.id} player={player} index={idx} showConvert />
                    ))}
                  </div>
                )}
              </div>

              {/* リリーフ投手 */}
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-xl font-bold text-green-400">リリーフ投手</h2>
                  <span className="text-gray-400 text-sm">({reliefPitchers.length}人)</span>
                </div>
                {reliefPitchers.length === 0 ? (
                  <p className="text-gray-500 text-sm py-2">リリーフ投手が設定されていません。</p>
                ) : (
                  <div className="space-y-2">
                    {reliefPitchers.map((player, idx) => (
                      <PitcherRow key={player.id} player={player} index={idx} showConvert />
                    ))}
                  </div>
                )}
              </div>

              {/* 未設定投手 */}
              {unassignedPitchers.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-xl font-bold text-gray-400">未設定投手</h2>
                    <span className="text-gray-500 text-sm">({unassignedPitchers.length}人)</span>
                  </div>
                  <div className="space-y-2">
                    {unassignedPitchers.map((player, idx) => (
                      <PitcherRow key={player.id} player={player} index={idx} showConvert />
                    ))}
                  </div>
                </div>
              )}

              {/* 野手（コンバート候補） */}
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-xl font-bold text-cyan-400">野手</h2>
                  <span className="text-gray-400 text-sm">({fieldersForConvert.length}人)</span>
                  <span className="text-gray-500 text-xs">ポジションを「投手」に変更するか、起用法を設定するとコンバートできます</span>
                </div>
                <div className="space-y-2">
                  {fieldersForConvert.map((player, idx) => (
                    <PitcherRow key={player.id} player={player} index={idx} showConvert />
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {tab === 'defense' && (() => {
          // スタメン選手のポジション別配置を取得
          const positionPlayers = {};
          const positionEntries = {};
          lineup.forEach(entry => {
            const player = team.players.find(p => p.id === entry.playerId);
            if (player) {
              positionPlayers[entry.position] = player;
              positionEntries[entry.position] = entry;
            }
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

          // 守備位置適正の取得（0-100）
          const getFitness = (player, pos) => {
            if (!player) return 0;
            return player.positionFitness?.[pos] ?? 50;
          };

          // 適正による能力補正倍率（適正100→100%、適正0→50%）
          const getFitnessMult = (player, pos) => {
            const fitness = getFitness(player, pos);
            return 0.5 + (fitness / 100) * 0.5;
          };

          // 守備範囲の計算（守備力+走力ベース × 適正補正）
          const getDefenseRange = (player, pos) => {
            if (!player) return 0;
            const def = player.fielding?.defense || 50;
            const spd = player.physical?.speed || 50;
            const arm = player.physical?.arm || 50;
            const mult = getFitnessMult(player, pos);
            let raw;
            if (['left', 'center', 'right'].includes(pos)) {
              raw = (def * 0.3 + spd * 0.5 + arm * 0.2) / 100;
            } else if (['second', 'short'].includes(pos)) {
              raw = (def * 0.4 + spd * 0.3 + arm * 0.3) / 100;
            } else if (pos === 'catcher') {
              raw = (def * 0.5 + arm * 0.5) / 100;
            } else {
              raw = (def * 0.5 + spd * 0.25 + arm * 0.25) / 100;
            }
            return raw * mult;
          };

          const posLabels = {
            pitcher: '投', catcher: '捕', first: '一', second: '二',
            short: '遊', third: '三', left: '左', center: '中', right: '右'
          };
          const posFullLabels = {
            pitcher: '投手', catcher: '捕手', first: '一塁', second: '二塁',
            short: '遊撃', third: '三塁', left: '左翼', center: '中堅', right: '右翼'
          };

          const getRangeColor = (range) => {
            if (range >= 0.75) return { fill: 'rgba(236,72,153,0.18)', stroke: '#ec4899' };
            if (range >= 0.65) return { fill: 'rgba(248,113,113,0.16)', stroke: '#f87171' };
            if (range >= 0.55) return { fill: 'rgba(251,191,36,0.14)', stroke: '#fbbf24' };
            if (range >= 0.45) return { fill: 'rgba(74,222,128,0.12)', stroke: '#4ade80' };
            return { fill: 'rgba(96,165,250,0.10)', stroke: '#60a5fa' };
          };

          const getFitnessColor = (fitness) => {
            if (fitness >= 90) return '#ec4899';
            if (fitness >= 70) return '#f87171';
            if (fitness >= 50) return '#fbbf24';
            if (fitness >= 30) return '#4ade80';
            return '#60a5fa';
          };

          const getRangeGrade = (range) => {
            if (range >= 0.75) return { label: 'S', color: 'text-pink-400' };
            if (range >= 0.65) return { label: 'A', color: 'text-red-400' };
            if (range >= 0.55) return { label: 'B', color: 'text-orange-400' };
            if (range >= 0.45) return { label: 'C', color: 'text-yellow-400' };
            if (range >= 0.35) return { label: 'D', color: 'text-green-400' };
            return { label: 'E', color: 'text-blue-400' };
          };

          // 守備位置クリック → 選択 or スワップ
          const handleDefenseClick = (pos) => {
            if (pos === 'pitcher') return; // 投手は変更不可
            if (!selectedDefensePos) {
              setSelectedDefensePos(pos);
            } else if (selectedDefensePos === pos) {
              setSelectedDefensePos(null);
            } else {
              // 2つの位置をスワップ
              const entry1 = lineup.find(e => e.position === selectedDefensePos && e.battingOrder >= 1 && e.battingOrder <= 8);
              const entry2 = lineup.find(e => e.position === pos && e.battingOrder >= 1 && e.battingOrder <= 8);
              if (entry1 && entry2) {
                entry1.position = pos;
                entry2.position = selectedDefensePos;
              } else if (entry1 && !entry2) {
                entry1.position = pos;
              } else if (!entry1 && entry2) {
                entry2.position = selectedDefensePos;
              }
              setSelectedDefensePos(null);
              setUpdateTrigger(prev => prev + 1);
            }
          };

          // 野手ポジションのみ（投手除く）
          const fieldPositions = ['catcher', 'first', 'second', 'short', 'third', 'left', 'center', 'right'];

          // 選択中ポジションの候補者一覧
          const selectedPosSwapCandidates = selectedDefensePos ? lineup
            .filter(e => e.battingOrder >= 1 && e.battingOrder <= 8 && e.position !== selectedDefensePos)
            .map(e => {
              const player = team.players.find(p => p.id === e.playerId);
              return player ? { player, entry: e } : null;
            })
            .filter(Boolean) : [];

          return (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-800 rounded-lg p-4 col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-white">守備分析 - ポジション配置</h2>
                  {selectedDefensePos && (
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-400 text-sm font-bold">{posFullLabels[selectedDefensePos]}を選択中</span>
                      <span className="text-gray-400 text-xs">→ 交換先をクリック</span>
                      <button onClick={() => setSelectedDefensePos(null)} className="bg-gray-600 hover:bg-gray-500 text-white px-2 py-0.5 rounded text-xs">解除</button>
                    </div>
                  )}
                </div>
                <svg viewBox="0 0 500 440" className="w-full max-w-2xl mx-auto">
                  {/* グラウンド背景 */}
                  <rect x="0" y="0" width="500" height="440" fill="#1a472a" rx="12" />
                  <ellipse cx="250" cy="210" rx="230" ry="190" fill="#1f5c33" />
                  <polygon points="250,145 370,260 250,375 130,260" fill="none" stroke="#c4a35a" strokeWidth="2" strokeDasharray="8,4" opacity="0.5" />
                  <polygon points="250,190 340,260 250,330 160,260" fill="#8B6914" opacity="0.35" />
                  <line x1="250" y1="370" x2="130" y2="255" stroke="#fff" strokeWidth="1.5" opacity="0.4" />
                  <line x1="250" y1="370" x2="370" y2="255" stroke="#fff" strokeWidth="1.5" opacity="0.4" />
                  <rect x="244" y="364" width="12" height="12" fill="#fff" transform="rotate(45,250,370)" />
                  <rect x="364" y="254" width="10" height="10" fill="#fff" transform="rotate(45,369,259)" />
                  <rect x="245" y="179" width="10" height="10" fill="#fff" transform="rotate(45,250,184)" />
                  <rect x="125" y="254" width="10" height="10" fill="#fff" transform="rotate(45,130,259)" />
                  <circle cx="250" cy="275" r="10" fill="#8B6914" opacity="0.5" />

                  {/* 守備範囲の円 */}
                  {Object.entries(posCoords).map(([pos, coord]) => {
                    const player = positionPlayers[pos];
                    const range = getDefenseRange(player, pos);
                    const isOutfield = ['left', 'center', 'right'].includes(pos);
                    const baseRadius = isOutfield ? 55 : 35;
                    const radius = baseRadius * (0.5 + range * 0.8);
                    const colors = getRangeColor(range);
                    return (
                      <circle key={`range-${pos}`} cx={coord.x} cy={coord.y}
                        r={player ? radius : 0} fill={colors.fill} stroke={colors.stroke}
                        strokeWidth="1.5" strokeDasharray="4,3" />
                    );
                  })}

                  {/* 選手マーカー（クリック可能） */}
                  {Object.entries(posCoords).map(([pos, coord]) => {
                    const player = positionPlayers[pos];
                    const isSelected = selectedDefensePos === pos;
                    const fitness = player ? getFitness(player, pos) : 0;
                    const fitnessColor = getFitnessColor(fitness);
                    const isPitcherPos = pos === 'pitcher';

                    return (
                      <g key={pos} onClick={() => !isPitcherPos && handleDefenseClick(pos)}
                         style={{ cursor: isPitcherPos ? 'default' : 'pointer' }}>
                        {/* 選択リング */}
                        {isSelected && (
                          <circle cx={coord.x} cy={coord.y} r="22" fill="none" stroke="#facc15" strokeWidth="3" strokeDasharray="6,3">
                            <animate attributeName="stroke-dashoffset" from="0" to="18" dur="1s" repeatCount="indefinite" />
                          </circle>
                        )}
                        {/* マーカー */}
                        <circle cx={coord.x} cy={coord.y} r="16"
                          fill={isSelected ? '#854d0e' : player ? '#1e40af' : '#374151'}
                          stroke={isSelected ? '#facc15' : player ? '#60a5fa' : '#6b7280'} strokeWidth="2" />
                        <text x={coord.x} y={coord.y + 1} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize="11" fontWeight="bold">{posLabels[pos]}</text>
                        {player && (
                          <>
                            <text x={coord.x} y={coord.y - 24} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">{player.name}</text>
                            {/* 適正バー */}
                            <rect x={coord.x - 18} y={coord.y + 24} width="36" height="4" rx="2" fill="#374151" />
                            <rect x={coord.x - 18} y={coord.y + 24} width={36 * fitness / 100} height="4" rx="2" fill={fitnessColor} />
                            <text x={coord.x} y={coord.y + 38} textAnchor="middle" fill={fitnessColor} fontSize="8" fontWeight="bold">適正{fitness}%</text>
                          </>
                        )}
                        {!player && (
                          <text x={coord.x} y={coord.y - 22} textAnchor="middle" fill="#6b7280" fontSize="10">未配置</text>
                        )}
                      </g>
                    );
                  })}
                </svg>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  ポジションをクリックして選択 → 交換先をクリックで守備位置を入れ替え（投手は変更不可）
                </p>
              </div>

              {/* 右側: 守備力サマリー + 適正 */}
              <div className="bg-gray-800 rounded-lg p-4 col-span-1">
                <h2 className="text-lg font-bold text-white mb-3">守備力サマリー</h2>
                <div className="space-y-1.5">
                  {Object.entries(posCoords).map(([pos]) => {
                    const player = positionPlayers[pos];
                    const range = getDefenseRange(player, pos);
                    const grade = getRangeGrade(range);
                    const fitness = player ? getFitness(player, pos) : 0;
                    const fitColor = fitness >= 80 ? 'text-pink-400' : fitness >= 60 ? 'text-red-400' : fitness >= 40 ? 'text-yellow-400' : fitness >= 20 ? 'text-green-400' : 'text-blue-400';
                    const isSelected = selectedDefensePos === pos;
                    const isPitcherPos = pos === 'pitcher';

                    return (
                      <div key={pos}
                        onClick={() => !isPitcherPos && handleDefenseClick(pos)}
                        className={`rounded p-2 transition cursor-pointer ${isSelected ? 'bg-yellow-900 ring-1 ring-yellow-400' : 'bg-gray-700 hover:bg-gray-600'} ${isPitcherPos ? 'cursor-default opacity-60' : ''}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-400 font-bold w-6 text-center text-sm">{posLabels[pos]}</span>
                            <span className="text-white text-sm font-bold">{player?.name || '-'}</span>
                          </div>
                          {player && <span className={`font-bold text-lg ${grade.color}`}>{grade.label}</span>}
                        </div>
                        {player && (
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-gray-400">守<span className={getRankColor(getAbilityRank(player.fielding?.defense || 0))}>{player.fielding?.defense || 0}</span></span>
                              <span className="text-gray-400">走<span className={getRankColor(getAbilityRank(player.physical?.speed || 0))}>{player.physical?.speed || 0}</span></span>
                              <span className="text-gray-400">肩<span className={getRankColor(getAbilityRank(player.physical?.arm || 0))}>{player.physical?.arm || 0}</span></span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-12 h-2 bg-gray-600 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${fitness}%`, backgroundColor: getFitnessColor(fitness) }} />
                              </div>
                              <span className={`text-xs font-bold ${fitColor}`}>{fitness}%</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 選択中ポジションの交換候補 */}
                {selectedDefensePos && selectedPosSwapCandidates.length > 0 && (
                  <div className="mt-3 bg-gray-900 rounded p-3">
                    <div className="text-yellow-400 text-xs font-bold mb-2">{posFullLabels[selectedDefensePos]}と交換:</div>
                    <div className="space-y-1">
                      {selectedPosSwapCandidates.map(({ player, entry }) => {
                        const targetFitness = getFitness(player, selectedDefensePos);
                        const currentFitness = getFitness(player, entry.position);
                        const diff = targetFitness - currentFitness;
                        return (
                          <div key={player.id} onClick={() => handleDefenseClick(entry.position)}
                            className="bg-gray-700 hover:bg-gray-600 rounded px-2 py-1 cursor-pointer flex items-center justify-between text-xs">
                            <span className="text-white">{posLabels[entry.position]} {player.name}</span>
                            <span className={diff >= 0 ? 'text-green-400' : 'text-red-400'}>
                              適正{targetFitness}% ({diff >= 0 ? '+' : ''}{diff})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* チーム守備総合評価 */}
                {(() => {
                  const allRanges = Object.keys(posCoords).map(pos => getDefenseRange(positionPlayers[pos], pos)).filter(r => r > 0);
                  const avgRange = allRanges.length > 0 ? allRanges.reduce((a, b) => a + b, 0) / allRanges.length : 0;
                  const teamGrade = getRangeGrade(avgRange);
                  return (
                    <div className="mt-3 bg-gray-900 rounded p-3 text-center">
                      <div className="text-gray-400 text-sm mb-1">チーム守備総合</div>
                      <div className={`text-3xl font-bold ${teamGrade.color}`}>{teamGrade.label}</div>
                      <div className="text-gray-500 text-xs mt-1">平均実効守備力: {Math.round(avgRange * 100)}</div>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}
        {tab === 'strategy' && (() => {
          // チームの作戦設定
          if (!team.strategy) {
            team.strategy = {
              batting: 'balanced',     // 打撃方針: aggressive/balanced/patient
              pitching: 'balanced',    // 投球方針: strikeout/balanced/contact
              baseRunning: 'normal',   // 走塁方針: aggressive/normal/conservative
              defense: 'normal'        // 守備方針: shift/normal/infield_in
            };
          }
          const strat = team.strategy;

          const STRATEGY_OPTIONS = {
            batting: [
              { value: 'aggressive', label: '強振重視', desc: 'パワー+15%, ミート-10%, 三振率↑', color: 'text-red-400' },
              { value: 'balanced', label: 'バランス', desc: '全体的にバランス良く打つ', color: 'text-green-400' },
              { value: 'patient', label: '待ち球', desc: '四球率+20%, パワー-10%, 出塁率↑', color: 'text-blue-400' }
            ],
            pitching: [
              { value: 'strikeout', label: '奪三振重視', desc: '奪三振+20%, スタミナ消費↑, 球数↑', color: 'text-red-400' },
              { value: 'balanced', label: 'バランス', desc: '状況に応じた投球', color: 'text-green-400' },
              { value: 'contact', label: '打たせて取る', desc: '球数-20%, 被安打率やや↑, スタミナ温存', color: 'text-blue-400' }
            ],
            baseRunning: [
              { value: 'aggressive', label: '積極走塁', desc: '盗塁+30%, 走塁アウト↑', color: 'text-red-400' },
              { value: 'normal', label: '通常', desc: '状況に応じた走塁', color: 'text-green-400' },
              { value: 'conservative', label: '慎重走塁', desc: '盗塁-50%, 走塁アウト↓', color: 'text-blue-400' }
            ],
            defense: [
              { value: 'shift', label: 'シフト守備', desc: 'プルヒッター対策○, 流し打ち×', color: 'text-red-400' },
              { value: 'normal', label: '定位置', desc: '標準的な守備陣形', color: 'text-green-400' },
              { value: 'infield_in', label: '前進守備', desc: 'バント/ゴロ処理○, 長打×', color: 'text-blue-400' }
            ]
          };

          const STRATEGY_LABELS = {
            batting: '打撃方針',
            pitching: '投球方針',
            baseRunning: '走塁方針',
            defense: '守備方針'
          };

          const handleStrategyChange = (category, value) => {
            team.strategy[category] = value;
            setUpdateTrigger(prev => prev + 1);
          };

          return (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-white mb-4">作戦指示</h2>
              {Object.entries(STRATEGY_OPTIONS).map(([category, options]) => (
                <div key={category} className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-bold text-white mb-3">{STRATEGY_LABELS[category]}</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {options.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => handleStrategyChange(category, opt.value)}
                        className={`p-4 rounded-lg text-left transition border-2 ${
                          strat[category] === opt.value
                            ? 'border-blue-500 bg-blue-900/50'
                            : 'border-gray-600 bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        <div className={`font-bold text-lg ${opt.color}`}>{opt.label}</div>
                        <div className="text-sm text-gray-400 mt-1">{opt.desc}</div>
                        {strat[category] === opt.value && (
                          <div className="text-xs text-blue-400 mt-2 font-bold">現在の設定</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-bold text-white mb-2">現在の作戦</h3>
                <div className="grid grid-cols-4 gap-4">
                  {Object.entries(STRATEGY_OPTIONS).map(([category, options]) => {
                    const current = options.find(o => o.value === strat[category]);
                    return (
                      <div key={category} className="text-center">
                        <div className="text-sm text-gray-400">{STRATEGY_LABELS[category]}</div>
                        <div className={`font-bold ${current?.color || 'text-white'}`}>{current?.label || '-'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default LineupSettingScreen;
