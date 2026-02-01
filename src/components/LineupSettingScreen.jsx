import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES } from '../utils/constants.js';

const LineupSettingScreen = ({ teamName, onBack }) => {
  const [tab, setTab] = useState('lineup');
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [selectedBattingOrder, setSelectedBattingOrder] = useState(null);

  const team = TEAMS_DATA[teamName];
  if (!team) return <div className="p-8 text-white">チームが見つかりません</div>;

  const getAbilityRank = (value) => {
    if (value >= 90) return 'S';
    if (value >= 80) return 'A';
    if (value >= 70) return 'B';
    if (value >= 60) return 'C';
    if (value >= 50) return 'D';
    return 'E';
  };

  const getRankColor = (rank) => {
    const colors = { S: 'text-pink-400', A: 'text-red-400', B: 'text-orange-400', C: 'text-yellow-400', D: 'text-green-400', E: 'text-gray-400' };
    return colors[rank] || 'text-gray-400';
  };

  const getVelocityRank = (velocity) => {
    const adjusted = (velocity - 115) * 2.5;
    return getAbilityRank(adjusted);
  };

  const getThrowsLabel = (throws) => throws === 'left' ? '左投' : '右投';

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

  // 投手枠がどの打順にあるか
  const pitcherEntry = lineup.find(e => e.position === 'pitcher');
  const pitcherBattingOrder = pitcherEntry?.battingOrder || null;

  const handleAddToLineup = (playerId) => {
    if (!selectedBattingOrder) {
      alert('打順を選択してください（1-9番の枠をクリック）');
      return;
    }

    const player = team.players.find(p => p.id === playerId);
    const isPitcher = player.position === 'pitcher';

    // 投手を投手枠以外に配置しようとした場合
    if (isPitcher) {
      // 投手は投手枠にのみ配置可能
      const existingIndex = lineup.findIndex(entry => entry.battingOrder === selectedBattingOrder);
      if (existingIndex !== -1) lineup.splice(existingIndex, 1);
      const playerIndex = lineup.findIndex(entry => entry.playerId === playerId);
      if (playerIndex !== -1) lineup.splice(playerIndex, 1);

      lineup.push({ playerId, position: 'pitcher', battingOrder: selectedBattingOrder });
      lineup.sort((a, b) => a.battingOrder - b.battingOrder);
      setSelectedBattingOrder(null);
      setUpdateTrigger(prev => prev + 1);
      return;
    }

    // 野手の配置
    const existingIndex = lineup.findIndex(entry => entry.battingOrder === selectedBattingOrder);
    // 投手枠に野手を配置しようとした場合は拒否
    if (existingIndex !== -1 && lineup[existingIndex].position === 'pitcher') {
      alert('この打順は投手枠です。投手を配置してください。');
      return;
    }
    if (existingIndex !== -1) lineup.splice(existingIndex, 1);
    const playerIndex = lineup.findIndex(entry => entry.playerId === playerId);
    if (playerIndex !== -1) lineup.splice(playerIndex, 1);

    let assignedPosition = player.position;

    const existingPositionEntry = lineup.find(e => e.position === assignedPosition && e.battingOrder !== selectedBattingOrder);
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

    lineup.push({ playerId, position: assignedPosition, battingOrder: selectedBattingOrder });
    lineup.sort((a, b) => a.battingOrder - b.battingOrder);
    const nextOrder = selectedBattingOrder < 9 ? selectedBattingOrder + 1 : 1;
    setSelectedBattingOrder(nextOrder);
    setUpdateTrigger(prev => prev + 1);
  };

  const handleChangePosition = (battingOrder, newPosition) => {
    const entry = lineup.find(e => e.battingOrder === battingOrder);
    if (entry) {
      if (newPosition === 'pitcher') {
        // 投手ポジションへの変更は不可（投手枠は別管理）
        return;
      }
      if (entry.position === 'pitcher') {
        // 投手枠のポジション変更は不可
        return;
      }
      const existingEntry = lineup.find(e => e.position === newPosition && e.battingOrder !== battingOrder && e.position !== 'pitcher');
      if (existingEntry) {
        const oldPosition = entry.position;
        existingEntry.position = oldPosition;
        entry.position = newPosition;
        setUpdateTrigger(prev => prev + 1);
        return;
      }
      entry.position = newPosition;
      setUpdateTrigger(prev => prev + 1);
    }
  };

  // 打順入れ替え
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
    team.lineupSettings.battingOrder = team.lineupSettings.battingOrder.filter(entry => entry.playerId !== playerId);
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
          {['lineup', 'rotation', 'usage'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 px-4 py-2 rounded font-bold transition ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
              {t === 'lineup' ? 'スタメン設定' : t === 'rotation' ? '投手ローテーション' : '起用法'}
            </button>
          ))}
        </div>

        {tab === 'lineup' && (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">スタメン設定 ({lineup.length}/9人)</h2>
              <p className="text-sm text-gray-400 mb-2">打順をクリック → 右側から選手を追加</p>
              <p className="text-sm text-yellow-400 mb-4">※ 9枠のうち1枠は投手です（投手リストから追加）</p>
              <div className="space-y-2">
                {[1,2,3,4,5,6,7,8,9].map(order => {
                  const entry = lineup.find(e => e.battingOrder === order);
                  const player = entry ? team.players.find(p => p.id === entry.playerId) : null;
                  const isSelected = selectedBattingOrder === order;
                  const isPitcherSlot = entry?.position === 'pitcher';
                  return (
                    <div key={order} onClick={() => setSelectedBattingOrder(order)} className={`rounded p-3 cursor-pointer transition ${isSelected ? 'bg-blue-700 ring-2 ring-blue-400' : player ? (isPitcherSlot ? 'bg-indigo-800 hover:bg-indigo-700' : 'bg-gray-700 hover:bg-gray-600') : 'bg-gray-900 hover:bg-gray-800 border border-dashed border-gray-600'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`font-bold text-lg w-6 ${isSelected ? 'text-blue-300' : 'text-white'}`}>{order}</div>
                        {player ? (
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-white font-bold flex items-center gap-2">
                                  {player.name}
                                  {isPitcherSlot && <span className="text-xs bg-indigo-600 px-2 py-0.5 rounded">投手</span>}
                                </div>
                                <div className="text-xs text-gray-400 flex items-center gap-2">
                                  {isPitcherSlot ? (
                                    <span className="text-indigo-300">投手</span>
                                  ) : (
                                    <select value={entry.position} onChange={(e) => { e.stopPropagation(); handleChangePosition(order, e.target.value); }} className="bg-gray-600 text-white rounded px-2 py-0.5 text-xs" onClick={(e) => e.stopPropagation()}>
                                      <option value="catcher">捕手</option><option value="first">一塁</option><option value="second">二塁</option><option value="third">三塁</option><option value="short">遊撃</option><option value="left">左翼</option><option value="center">中堅</option><option value="right">右翼</option>
                                    </select>
                                  )}
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
                            <div className="text-xs mt-2 space-y-0.5">
                              {isPitcherSlot ? (
                                <div className="flex gap-2">
                                  {[{label:'球速',value:player.pitching?.velocity||0,isVel:true},{label:'制球',value:player.pitching?.control||0},{label:'スタ',value:Math.min(99,Math.floor((player.pitching?.stamina||0)/2))}].map(stat => {
                                    const rank = stat.isVel ? getVelocityRank(stat.value) : getAbilityRank(stat.value);
                                    return <span key={stat.label} className={getRankColor(rank)}>{stat.label} {rank}{stat.value}</span>;
                                  })}
                                </div>
                              ) : (
                                <div className="flex gap-2">
                                  {[{label:'ミ',value:player.batting?.meet||0},{label:'パ',value:player.batting?.power||0},{label:'走',value:player.physical?.speed||0},{label:'肩',value:player.physical?.arm||0},{label:'守',value:player.fielding?.defense||0}].map(stat => {
                                    const rank = getAbilityRank(stat.value);
                                    return <span key={stat.label} className={getRankColor(rank)}>{stat.label} {rank}{stat.value}</span>;
                                  })}
                                </div>
                              )}
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

            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">
                選手リスト
                {selectedBattingOrder && <span className="text-blue-400 text-sm ml-2">→ {selectedBattingOrder}番に追加</span>}
              </h2>

              {/* 野手セクション */}
              <h3 className="text-lg font-bold text-gray-300 mb-2">野手</h3>
              <div className="space-y-2 max-h-[400px] overflow-y-auto mb-4">
                {fielders.map(player => {
                  const isInLineup = lineup.some(entry => entry.playerId === player.id);
                  return (
                    <div key={player.id} className={`rounded p-3 cursor-pointer transition ${isInLineup ? 'bg-gray-900 opacity-50' : 'bg-gray-700 hover:bg-gray-600'}`} onClick={() => !isInLineup && handleAddToLineup(player.id)}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-white font-bold flex items-center gap-2">
                            {player.name}
                            {isInLineup && <span className="text-xs bg-blue-600 px-2 py-0.5 rounded">スタメン</span>}
                          </div>
                          <div className="text-xs text-gray-400">{POSITION_NAMES[player.position]} | {player.age}歳</div>
                        </div>
                      </div>
                      <div className="text-xs space-y-0.5">
                        <div className="flex gap-2">
                          {[{label:'ミ',value:player.batting?.meet||0},{label:'パ',value:player.batting?.power||0},{label:'走',value:player.physical?.speed||0},{label:'肩',value:player.physical?.arm||0},{label:'守',value:player.fielding?.defense||0}].map(stat => {
                            const rank = getAbilityRank(stat.value);
                            return <span key={stat.label} className={getRankColor(rank)}>{stat.label} {rank}{stat.value}</span>;
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 投手セクション */}
              <h3 className="text-lg font-bold text-indigo-300 mb-2">投手（スタメン投手枠）</h3>
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {pitchers.map(player => {
                  const isInLineup = lineup.some(entry => entry.playerId === player.id);
                  const velocityRank = getVelocityRank(player.pitching?.velocity || 0);
                  const controlRank = getAbilityRank(player.pitching?.control || 0);
                  return (
                    <div key={player.id} className={`rounded p-3 cursor-pointer transition ${isInLineup ? 'bg-gray-900 opacity-50' : 'bg-indigo-900 hover:bg-indigo-800'}`} onClick={() => !isInLineup && handleAddToLineup(player.id)}>
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <div className="text-white font-bold flex items-center gap-2">
                            {player.name}
                            {isInLineup && <span className="text-xs bg-indigo-600 px-2 py-0.5 rounded">スタメン</span>}
                          </div>
                          <div className="text-xs text-gray-400">{getThrowsLabel(player.physical?.throws)} | {getFormLabel(player.pitching?.form)}</div>
                        </div>
                      </div>
                      <div className="text-xs flex gap-2">
                        <span className={getRankColor(velocityRank)}>球速 {velocityRank}{player.pitching?.velocity}</span>
                        <span className={getRankColor(controlRank)}>制球 {controlRank}{player.pitching?.control}</span>
                      </div>
                    </div>
                  );
                })}
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

        {tab === 'usage' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">起用法設定</h2>
            <p className="text-gray-400">（今後実装予定: 代打・代走の優先順位、リリーフ起用パターンなど）</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LineupSettingScreen;
