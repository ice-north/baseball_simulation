import React, { useState, useEffect, useMemo } from 'react';
import { TEAMS_DATA, LEAGUE_SETTINGS } from '../teams-data.js';
import { POSITION_NAMES } from '../utils/constants.js';
import { getPitchTypeName } from '../season/yearProgressionSystem.js';
import { CONDITION_LEVELS, CONDITION_COLORS, CONDITION_ICONS } from '../game/condition.js';

const LineupSettingScreen = ({ teamName, onBack }) => {
  const [tab, setTab] = useState('lineup');
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [selectedBattingOrder, setSelectedBattingOrder] = useState(null);
  const [benchSortKey, setBenchSortKey] = useState(null);
  const [benchSortAsc, setBenchSortAsc] = useState(false);
  const [selectedDefensePos, setSelectedDefensePos] = useState(null);
  const [swapSource, setSwapSource] = useState(null); // クリックで打順入れ替え用
  const [selectedBenchPlayer, setSelectedBenchPlayer] = useState(null); // 控え選手→スタメン入れ替え用
  const [roleSelectPlayer, setRoleSelectPlayer] = useState(null); // ロール選択モーダル対象
  const [posConvertPlayer, setPosConvertPlayer] = useState(null); // ポジション変更モーダル対象
  const [detailPlayer, setDetailPlayer] = useState(null); // 投手詳細モーダル対象

  const team = TEAMS_DATA[teamName];
  if (!team) return <div className="p-8 text-white">チームが見つかりません</div>;

  // 体力バーの色を値に応じて変える
  const getStaminaBarColor = (value) => {
    if (value >= 60) return 'bg-green-500';
    if (value >= 50) return 'bg-lime-500';
    if (value >= 40) return 'bg-yellow-400';
    if (value >= 30) return 'bg-orange-400';
    return 'bg-red-500';
  };

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

  // メイン守備位置の右に適性80以上のサブポジションを色分け表示
  // 100=白, 90-99=黄, 80-89=オレンジ
  const getSubPositions = (player, mainPosition) => {
    if (!player?.positionFitness || mainPosition === 'pitcher') return [];
    const allPositions = ['catcher', 'first', 'second', 'short', 'third', 'left', 'center', 'right'];
    return allPositions
      .filter(pos => pos !== mainPosition && (player.positionFitness[pos] ?? 0) >= 80)
      .map(pos => {
        const fitness = player.positionFitness[pos] ?? 0;
        const color = fitness >= 100 ? 'text-white' : fitness >= 90 ? 'text-yellow-400' : 'text-orange-400';
        return { label: POSITION_NAMES[pos], color };
      });
  };

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

  const lineup = team.lineupSettings.battingOrder;

  const useDH = LEAGUE_SETTINGS.useDH;
  const maxFielderSlots = useDH ? 9 : 8;

  const { fielders, pitchers, lineupPlayerIds, benchPlayers } = useMemo(() => {
    const f = team.players.filter(p => p.position !== 'pitcher');
    const p = team.players.filter(p => p.position === 'pitcher');
    const lpIds = new Set(lineup.map(e => e.playerId));
    const maxSlot = useDH ? 9 : 8;
    const fieldIds = new Set(lineup.filter(e => e.battingOrder >= 1 && e.battingOrder <= maxSlot).map(e => e.playerId));
    const seen = new Set();
    const bench = team.players.filter(pl => {
      if (fieldIds.has(pl.id)) return false;
      if (seen.has(pl.id)) return false;
      seen.add(pl.id);
      return true;
    });
    return { fielders: f, pitchers: p, lineupPlayerIds: lpIds, benchPlayers: bench };
  }, [team.players, lineup, updateTrigger]);

  // 初期化：非DH制では投手枠がなければ9番に投手を自動設定
  useEffect(() => {
    if (!useDH) {
      const hasPitcherSlot = lineup.some(e => e.position === 'pitcher');
      if (!hasPitcherSlot && pitchers.length > 0) {
        const starterId = team.pitchingRotation?.starters?.[0] || pitchers[0].id;
        lineup.push({ playerId: starterId, position: 'pitcher', battingOrder: 9 });
        setUpdateTrigger(prev => prev + 1);
      }
    }
  }, []);

  const handleAddToLineup = (playerId) => {
    if (!selectedBattingOrder) {
      alert(`打順を選択してください（1-${maxFielderSlots}番の枠をクリック）`);
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
    const fieldPositions = ['catcher', 'first', 'second', 'short', 'third', 'left', 'center', 'right'];
    let assignedPosition = isPitcher ? 'first' : player.position;
    if (isPitcher && player.positionFitness) {
      const usedPositions = lineup.filter(e => e.position !== 'pitcher').map(e => e.position);
      const availablePositions = fieldPositions.filter(pos => !usedPositions.includes(pos));
      if (availablePositions.length > 0) {
        availablePositions.sort((a, b) => (player.positionFitness[b] || 0) - (player.positionFitness[a] || 0));
        assignedPosition = availablePositions[0];
      } else if (useDH) {
        assignedPosition = 'dh';
      }
    } else {
      const existingPositionEntry = lineup.find(e => e.position === assignedPosition && e.position !== 'pitcher' && e.battingOrder !== selectedBattingOrder);
      if (existingPositionEntry) {
        const usedPositions = lineup.filter(e => e.position !== 'pitcher').map(e => e.position);
        const availablePositions = fieldPositions.filter(pos => !usedPositions.includes(pos));
        if (availablePositions.length > 0) {
          if (player.positionFitness) {
            availablePositions.sort((a, b) => (player.positionFitness[b] || 0) - (player.positionFitness[a] || 0));
          }
          assignedPosition = availablePositions[0];
        } else if (useDH && !usedPositions.includes('dh')) {
          assignedPosition = 'dh';
        }
      }
    }

    lineup.push({ playerId, position: assignedPosition, battingOrder: selectedBattingOrder });
    lineup.sort((a, b) => a.battingOrder - b.battingOrder);
    const nextOrder = selectedBattingOrder < maxFielderSlots ? selectedBattingOrder + 1 : 1;
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
      // 投手枠は削除せず、次のローテーション投手と自動交換
      const lineupPlayerIds = new Set(lineup.map(e => e.playerId));
      const rotation = team.pitchingRotation;
      const rotationPitchers = [...(rotation?.starters || []), ...(rotation?.relievers || [])];
      const replacement = rotationPitchers.find(pid => pid !== playerId && !lineupPlayerIds.has(pid))
        || team.players.find(p => p.position === 'pitcher' && p.id !== playerId && !lineupPlayerIds.has(p.id))?.id;
      if (replacement) {
        entry.playerId = replacement;
        setUpdateTrigger(prev => prev + 1);
      } else {
        alert('交換できる投手がベンチにいません');
      }
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

    const wasStarter = (rotation.starters || []).includes(playerId);
    const isNewStarter = ['complete', 'short', 'quality', 'ace', 'auto_s'].includes(newRole);

    // 先発→先発の変更時はstarters配列を触らない（順番維持）
    if (!(wasStarter && isNewStarter)) {
      rotation.starters = (rotation.starters || []).filter(id => id !== playerId);
    }
    rotation.middleRelievers = (rotation.middleRelievers || []).filter(id => id !== playerId);
    rotation.setupMen = (rotation.setupMen || []).filter(id => id !== playerId);
    if (rotation.closer === playerId) rotation.closer = null;

    if (newRole === 'none') {
      delete rotation.pitcherRoles[playerId];
    } else {
      rotation.pitcherRoles[playerId] = newRole;
      // レガシー配列にも反映（先発→先発は既に配列内なのでスキップ）
      if (isNewStarter) {
        if (!wasStarter) rotation.starters.push(playerId);
      } else if (['long', 'onepoint', 'ace_relief', 'mopup', 'behind', 'auto_r'].includes(newRole)) {
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

  const handleConvertPosition = (playerId, newPosition) => {
    const player = team.players.find(p => p.id === playerId);
    if (!player) return;
    const oldPos = player.position;
    player.position = newPosition;
    if (oldPos === 'pitcher' && newPosition !== 'pitcher') {
      handleSetPitcherRole(playerId, 'none');
      // ラインナップの投手スロットを後任投手に差し替え
      const pitcherEntry = lineup.find(e => e.playerId === playerId && e.position === 'pitcher');
      if (pitcherEntry) {
        const lineupIds = new Set(lineup.map(e => e.playerId));
        const rotation = team.pitchingRotation;
        const candidates = [
          ...(rotation?.starters || []),
          ...(rotation?.middleRelievers || []),
          ...(rotation?.setupMen || []),
          rotation?.closer,
        ].filter(Boolean);
        const replacement = candidates.find(pid => pid !== playerId && !lineupIds.has(pid))
          || team.players.find(p => p.position === 'pitcher' && p.id !== playerId && !lineupIds.has(p.id))?.id;
        if (replacement) {
          pitcherEntry.playerId = replacement;
        } else {
          const idx = lineup.findIndex(e => e.playerId === playerId && e.position === 'pitcher');
          if (idx !== -1) lineup.splice(idx, 1);
        }
      }
      // 投手にpositionFitnessがなければ初期値を設定
      if (!player.positionFitness) {
        player.positionFitness = { catcher: 50, first: 50, second: 50, short: 50, third: 50, left: 60, center: 60, right: 60 };
      }
    }
    setUpdateTrigger(prev => prev + 1);
  };

  const POS_OPTIONS = [
    { key: 'pitcher', label: '投手', icon: '⚾' },
    { key: 'catcher', label: '捕手', icon: '🧤' },
    { key: 'first', label: '一塁手', icon: '1B' },
    { key: 'second', label: '二塁手', icon: '2B' },
    { key: 'short', label: '遊撃手', icon: 'SS' },
    { key: 'third', label: '三塁手', icon: '3B' },
    { key: 'left', label: '左翼手', icon: 'LF' },
    { key: 'center', label: '中堅手', icon: 'CF' },
    { key: 'right', label: '右翼手', icon: 'RF' },
  ];

  const PosConvertModal = ({ player, onClose }) => {
    if (!player) return null;
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 max-w-sm w-full" onClick={e => e.stopPropagation()}>
          <div className="border-b border-gray-700 px-4 py-3 rounded-t-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold">{player.name}</h3>
                <p className="text-gray-400 text-xs">
                  現在: <span className="text-white font-medium">{POSITION_NAMES[player.position] || player.position}</span>
                </p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-white text-xl px-2">✕</button>
            </div>
          </div>
          <div className="p-4">
            <p className="text-gray-400 text-xs mb-3">変更先のポジションを選択してください</p>
            <div className="grid grid-cols-3 gap-2">
              {POS_OPTIONS.map(pos => {
                const isCurrent = player.position === pos.key;
                const hasFitness = player.positionFitness != null;
                const fitness = player.positionFitness?.[pos.key] ?? 0;
                const fitnessColor = fitness >= 80 ? 'text-green-400' : fitness >= 50 ? 'text-yellow-400' : 'text-red-400';
                return (
                  <button
                    key={pos.key}
                    onClick={() => {
                      if (!isCurrent) {
                        handleConvertPosition(player.id, pos.key);
                        onClose();
                      }
                    }}
                    disabled={isCurrent}
                    className={`flex flex-col items-center gap-0.5 px-2 py-2.5 rounded-lg border transition-all ${
                      isCurrent
                        ? 'bg-blue-600/30 border-blue-500/50 ring-1 ring-blue-400/30'
                        : 'bg-gray-700/50 border-gray-600/50 hover:bg-gray-600/70 hover:border-gray-500'
                    }`}
                  >
                    <span className="text-base">{pos.icon}</span>
                    <span className={`text-xs font-bold ${isCurrent ? 'text-blue-300' : 'text-white'}`}>{pos.label}</span>
                    {pos.key !== 'pitcher' && (
                      hasFitness
                        ? <span className={`text-[10px] ${fitnessColor}`}>適性{fitness}</span>
                        : <span className="text-[10px] text-gray-500">適性-</span>
                    )}
                    {isCurrent && <span className="text-[9px] text-blue-400">現在</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
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
    none:       { label: '未設定', color: 'bg-gray-600', textColor: 'text-gray-400', group: 'none' },
    auto_s:     { label: 'おまかせ', color: 'bg-gray-500', textColor: 'text-gray-200', group: 'starter' },
    ace:        { label: 'ゲームメーカー', color: 'bg-red-600', textColor: 'text-red-200', group: 'starter' },
    complete:   { label: '完投型', color: 'bg-blue-700', textColor: 'text-blue-300', group: 'starter' },
    short:      { label: 'ショート', color: 'bg-blue-600', textColor: 'text-blue-300', group: 'starter' },
    quality:    { label: '勝ち権利', color: 'bg-blue-500', textColor: 'text-blue-200', group: 'starter' },
    auto_r:     { label: 'おまかせ', color: 'bg-gray-500', textColor: 'text-gray-200', group: 'relief' },
    long:       { label: 'ロング', color: 'bg-green-700', textColor: 'text-green-300', group: 'relief' },
    ace_relief: { label: '中継ぎエース', color: 'bg-green-500', textColor: 'text-green-200', group: 'relief' },
    mopup:      { label: '敗戦処理', color: 'bg-gray-700', textColor: 'text-gray-300', group: 'relief' },
    behind:     { label: 'ビハインド', color: 'bg-yellow-700', textColor: 'text-yellow-300', group: 'relief' },
    onepoint:   { label: 'ワンポイント', color: 'bg-green-600', textColor: 'text-green-300', group: 'relief' },
    setup:      { label: 'セットアップ', color: 'bg-orange-600', textColor: 'text-orange-300', group: 'relief' },
    closer:     { label: '守護神', color: 'bg-purple-600', textColor: 'text-purple-300', group: 'relief' },
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
      case 'bodyStamina': return player.physical?.bodyStamina || 50;
      case 'recovery': return player.physical?.recovery || 50;
      case 'fatigue': return player.fatigue || 0;
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

    const StatCell = ({ value, isVelocity, className = '' }) => {
      const rank = isVelocity ? getVelocityRank(value) : getAbilityRank(value);
      return <td className={`py-1.5 px-1 text-[11px] text-center font-semibold ${getRankColor(rank)} ${className}`}>{value}</td>;
    };
    const EmptyCell = ({ className = '' }) => <td className={`py-1.5 px-1 text-[11px] text-center text-gray-700 ${className}`}>—</td>;

    return (
      <tr
        className={`border-b border-gray-700/30 cursor-pointer transition-colors ${
          isInLineup ? 'opacity-30' :
          selectedBenchPlayer === player.id ? 'bg-blue-900/40 ring-1 ring-blue-400/30' :
          swapSource !== null || selectedBenchPlayer !== null ? 'hover:bg-blue-900/30' :
          'hover:bg-gray-700/40'
        }`}
        onClick={() => {
          if (isInLineup) return;
          // swapSource が設定されている場合 → スタメンと控えを入れ替え
          if (swapSource !== null) {
            const entry = lineup.find(e => e.battingOrder === swapSource);
            if (entry && entry.position !== 'pitcher') {
              entry.playerId = player.id;
              setSwapSource(null);
              setSelectedBenchPlayer(null);
              setUpdateTrigger(prev => prev + 1);
            }
            return;
          }
          // 空き打順が選択されている場合 → そこに追加
          if (selectedBattingOrder && selectedBattingOrder >= 1 && selectedBattingOrder <= maxFielderSlots) {
            const slotEntry = lineup.find(e => e.battingOrder === selectedBattingOrder);
            if (!slotEntry) {
              handleAddToLineup(player.id);
              return;
            }
          }
          // 控え選手を選択（トグル）→ スタメン枠タップで入れ替え
          setSelectedBenchPlayer(prev => prev === player.id ? null : player.id);
          setSwapSource(null);
          setSelectedBattingOrder(null);
        }}
      >
        <td className="py-1.5 pl-2 pr-1 text-sm text-white font-semibold whitespace-nowrap">
          {player.name}
          <span className={`ml-1 text-[10px] ${CONDITION_COLORS[player.condition ?? CONDITION_LEVELS.NORMAL]}`}>
            {CONDITION_ICONS[player.condition ?? CONDITION_LEVELS.NORMAL]}
          </span>
        </td>
        <td className="py-1.5 px-1 text-[11px] text-gray-500 text-center">{player.age}</td>
        <td className="py-1.5 px-1 text-[11px] whitespace-nowrap">
          <button
            onClick={(e) => { e.stopPropagation(); setPosConvertPlayer(player); }}
            className={`${isPitcher ? 'text-indigo-300 font-medium' : 'text-gray-300'} hover:underline hover:brightness-125`}
            title="ポジション登録変更"
          >
            {POSITION_NAMES[player.position] || player.position}
          </button>
          {!isPitcher && (() => {
            const subs = getSubPositions(player, player.position);
            if (subs.length === 0) return null;
            return subs.map((s, i) => <span key={i} className={`${s.color} ml-0.5 text-[10px]`}>{s.label}</span>);
          })()}
          {roleLabel && <span className="ml-1 text-[9px] text-yellow-400 bg-yellow-900/30 px-1 py-0.5 rounded">{roleLabel}</span>}
        </td>
        <td className="py-1.5 px-1 text-[10px] text-gray-500 whitespace-nowrap">
          {getThrowsLabel(player.physical?.throws)}{getBatsLabel(player.batting?.bats || player.physical?.bats)}
        </td>
        {/* 野手能力 */}
        <StatCell value={player.batting?.meet || 0} className="border-l border-gray-700/40" />
        <StatCell value={player.batting?.power || 0} />
        <StatCell value={player.physical?.speed || 0} />
        <StatCell value={player.physical?.arm || 0} />
        <StatCell value={player.fielding?.defense || 0} />
        <StatCell value={player.physical?.bodyStamina || 50} />
        <StatCell value={player.physical?.recovery || 50} />
        {/* 状態 */}
        <td className="py-1.5 px-1 text-[11px] text-center border-l border-gray-700/40">
          {(() => {
            const f = player.fatigue || 0;
            const color = f >= 80 ? 'text-red-400' : f >= 50 ? 'text-orange-400' : f >= 20 ? 'text-yellow-400' : 'text-green-400';
            return <span className={`font-semibold ${color}`}>{f}</span>;
          })()}
        </td>
        {/* 投手能力 */}
        <StatCell value={player.pitching?.velocity || 0} isVelocity className="border-l border-gray-700/40" />
        <StatCell value={player.pitching?.control || 0} />
        <StatCell value={player.pitching?.stamina || 0} />
        {/* 成績 */}
        <td className="py-1.5 px-2 text-[10px] text-center whitespace-nowrap border-l border-gray-700/40">
          {isPitcher ? (() => {
            const ps = player.seasonStats?.pitching;
            if (!ps || !ps.games) return <span className="text-gray-700">—</span>;
            const era = ps.inningsPitched > 0 ? ((ps.earnedRuns || 0) / (ps.inningsPitched / 3) * 9).toFixed(2) : '-';
            return <span className="text-gray-400">{ps.wins||0}勝{ps.losses||0}敗 <span className="text-orange-300">防{era}</span></span>;
          })() : (() => {
            const bs = player.seasonStats?.batting;
            if (!bs || !bs.atBats) return <span className="text-gray-700">—</span>;
            const avg = (bs.hits / bs.atBats).toFixed(3);
            return <><span className="text-blue-300 font-semibold">{avg}</span><span className="text-gray-500 ml-1">{bs.homeruns||0}本</span></>;
          })()}
        </td>
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
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-5">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              {teamName}
              <span className="ml-2 text-gray-500 font-normal text-sm">ロスター管理</span>
            </h1>
          </div>
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition">
              ← 戻る
            </button>
          )}
        </div>

        {/* タブナビゲーション */}
        <div className="flex gap-1 mb-4 bg-gray-800/60 p-1 rounded-xl border border-gray-700/50">
          {[
            { key: 'lineup',   label: 'スタメン設定', icon: '👥' },
            { key: 'rotation', label: '投手起用',     icon: '⚾' },
            { key: 'defense',  label: '守備分析',     icon: '🛡' },
            { key: 'strategy', label: '作戦指示',     icon: '📋' },
          ].map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/60'
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {tab === 'lineup' && (
          <div className="grid grid-cols-3 gap-4">
            {/* 左側: スタメン (1/3) */}
            <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 col-span-1 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700/50 flex items-center gap-2">
                <h2 className="font-semibold text-white text-sm">スタメン設定</h2>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  lineup.filter(e => e.position !== 'pitcher').length === maxFielderSlots
                    ? 'bg-green-900/60 text-green-400 border border-green-700/40'
                    : 'bg-gray-700 text-gray-400'
                }`}>
                  {lineup.filter(e => e.position !== 'pitcher').length}/{maxFielderSlots}
                </span>
                {useDH && <span className="text-[10px] text-purple-400 font-medium">DH制</span>}
                {(swapSource !== null || selectedBenchPlayer !== null) && (
                  <span className="text-blue-400 text-[10px] ml-auto">→ 入替先を選択</span>
                )}
              </div>
              <div className="p-2 space-y-1">
                {(useDH ? [1,2,3,4,5,6,7,8,9] : [1,2,3,4,5,6,7,8,9]).map(order => {
                  const entry = lineup.find(e => e.battingOrder === order);
                  const player = entry ? team.players.find(p => p.id === entry.playerId) : null;
                  const isSelected = selectedBattingOrder === order;
                  const isPitcherSlot = !useDH && entry?.position === 'pitcher';
                  const isDHSlot = useDH && entry?.position === 'dh';
                  const isSwapSource = swapSource === order;
                  const isSwapTarget = swapSource !== null && swapSource !== order;

                  const isBenchTarget = selectedBenchPlayer !== null;

                  const handleSlotClick = () => {
                    if (selectedBenchPlayer !== null) {
                      // 控え選手が選択済み → このスタメン枠に入れる
                      if (entry && entry.position !== 'pitcher') {
                        entry.playerId = selectedBenchPlayer;
                        setSelectedBenchPlayer(null);
                        setUpdateTrigger(prev => prev + 1);
                      } else if (!entry && order <= maxFielderSlots) {
                        const bp = team.players.find(p => p.id === selectedBenchPlayer);
                        const pos = bp?.position === 'pitcher' ? 'first' : (bp?.position || 'first');
                        lineup.push({ playerId: selectedBenchPlayer, position: pos, battingOrder: order });
                        lineup.sort((a, b) => a.battingOrder - b.battingOrder);
                        setSelectedBenchPlayer(null);
                        setUpdateTrigger(prev => prev + 1);
                      }
                      return;
                    }
                    if (swapSource !== null) {
                      // 入れ替え実行
                      if (swapSource !== order) {
                        handleSwapBattingOrder(swapSource, order);
                      }
                      setSwapSource(null);
                    } else if (entry) {
                      // 選手がいる枠をタップ → 入れ替えソースにする
                      setSwapSource(order);
                      setSelectedBenchPlayer(null);
                      setSelectedBattingOrder(null);
                    } else {
                      // 空枠をタップ → 追加モード
                      setSelectedBattingOrder(order);
                      setSelectedBenchPlayer(null);
                    }
                  };

                  return (
                    <div key={order} onClick={handleSlotClick} className={`rounded-lg cursor-pointer transition-all border ${
                      isSwapSource ? 'bg-blue-900/50 border-blue-500/70 ring-1 ring-blue-400/30' :
                      isSwapTarget ? 'bg-gray-800 border-blue-400/30 hover:border-blue-400/60 hover:bg-blue-900/20' :
                      isBenchTarget ? 'bg-gray-800 border-blue-400/30 hover:border-blue-400/60 hover:bg-blue-900/20' :
                      isSelected   ? 'bg-blue-900/40 border-blue-500/60 ring-1 ring-blue-400/30' :
                      player ? (isPitcherSlot
                        ? 'bg-indigo-950/60 border-indigo-700/40 hover:border-indigo-600/60'
                        : isDHSlot
                        ? 'bg-purple-950/60 border-purple-700/40 hover:border-purple-600/60'
                        : 'bg-gray-800/90 border-gray-700/50 hover:border-gray-600/70')
                      : 'bg-gray-900/30 border-gray-700/40 border-dashed hover:border-gray-500/60'
                    }`}>
                      <div className="flex items-center gap-2 px-2.5 py-1">
                        {/* 打順番号 */}
                        <div className={`text-lg font-bold w-5 text-center shrink-0 ${
                          isSwapSource || isSelected ? 'text-blue-400' : 'text-gray-500'
                        }`}>{order}</div>

                        {isPitcherSlot ? (
                          <div className="flex-1 flex items-center">
                            <span className="text-indigo-400 font-semibold text-base">投手</span>
                            <span className="text-xs text-gray-500 ml-2">先発投手が自動起用</span>
                          </div>
                        ) : player ? (
                          <div className="flex-1 min-w-0">
                            {/* 行1: 名前・コンディション・ポジション・投打・年齢 + 外すボタン */}
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                              <span className="font-bold text-white text-base leading-tight">{player.name}</span>
                              <span className={`text-xs leading-none ${CONDITION_COLORS[player.condition ?? CONDITION_LEVELS.NORMAL]}`}>
                                {CONDITION_ICONS[player.condition ?? CONDITION_LEVELS.NORMAL]}
                              </span>
                              <select
                                value={entry.position}
                                onChange={(e) => { e.stopPropagation(); handleChangePosition(order, e.target.value); }}
                                className="bg-gray-700/70 border border-gray-600/50 text-white rounded px-1 py-0 text-xs"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="pitcher">投手</option>
                                <option value="catcher">捕手</option>
                                <option value="first">一塁</option>
                                <option value="second">二塁</option>
                                <option value="third">三塁</option>
                                <option value="short">遊撃</option>
                                <option value="left">左翼</option>
                                <option value="center">中堅</option>
                                <option value="right">右翼</option>
                                {useDH && <option value="dh">DH</option>}
                              </select>
                              {(() => {
                                const subs = getSubPositions(player, entry.position);
                                if (subs.length === 0) return null;
                                return subs.map((s, i) => (
                                  <span key={i} className={`text-[11px] font-medium ${s.color}`}>{s.label}</span>
                                ));
                              })()}
                              <span className="text-[11px] text-gray-500">
                                {getThrowsLabel(player.physical?.throws)}{player.batting?.bats === 'left' ? '左打' : player.batting?.bats === 'switch' ? '両打' : '右打'}
                              </span>
                              <span className="text-[11px] text-gray-500">{player.age}歳</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRemoveFromLineup(player.id); }}
                                className="ml-auto shrink-0 text-gray-600 hover:text-red-400 text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-red-900/30 transition"
                              >✕</button>
                            </div>

                            {/* 行2: 能力値チップ + 体力/疲労バー + 成績 */}
                            <div className="flex items-center gap-1.5">
                              <div className="flex gap-1.5">
                                {[
                                  { label: 'ミ', value: player.batting?.meet || 0 },
                                  { label: 'パ', value: player.batting?.power || 0 },
                                  { label: '走', value: player.physical?.speed || 0 },
                                  { label: '肩', value: player.physical?.arm || 0 },
                                  { label: '守', value: player.fielding?.defense || 0 },
                                ].map(stat => {
                                  const rank = getAbilityRank(stat.value);
                                  return (
                                    <span key={stat.label} className={`text-xs font-semibold ${getRankColor(rank)}`}>
                                      {stat.label}<span className="opacity-80">{stat.value}</span>
                                    </span>
                                  );
                                })}
                              </div>
                              <div className="flex items-center gap-1 ml-auto">
                                <div className="flex items-center gap-0.5">
                                  <span className="text-[10px] text-gray-600">体</span>
                                  <div className="w-10 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                    <div className={`h-full ${getStaminaBarColor(player.physical?.bodyStamina || 50)} rounded-full`} style={{width:`${player.physical?.bodyStamina || 50}%`}} />
                                  </div>
                                </div>
                                <div className="flex items-center gap-0.5">
                                  <span className="text-[10px] text-gray-600">疲</span>
                                  <div className="w-10 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-red-500/80 rounded-full" style={{width:`${Math.min(player.fatigue || 0, 100)}%`}} />
                                  </div>
                                </div>
                              </div>
                              {(() => {
                                const bs = player.seasonStats?.batting;
                                if (!bs || !bs.atBats) return null;
                                const avg = bs.atBats > 0 ? (bs.hits / bs.atBats).toFixed(3) : '.000';
                                return (
                                  <div className="text-[11px] text-gray-500 ml-1 shrink-0">
                                    <span className="text-blue-300 font-semibold">{avg}</span>
                                    <span className="ml-1">{bs.homeruns || 0}本</span>
                                    <span className="ml-1">{bs.rbis || 0}点</span>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-600 text-base italic">未設定</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 右側: 控え選手一覧（2/3） */}
            <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 col-span-2 overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700/50 shrink-0">
                <h2 className="font-semibold text-white text-sm">
                  控え選手
                  <span className="ml-1.5 text-gray-500 font-normal text-xs">{benchPlayers.length}人</span>
                </h2>
                {selectedBenchPlayer !== null ? (
                  <span className="bg-blue-900/50 text-blue-300 border border-blue-700/40 text-[10px] px-2 py-0.5 rounded-full">
                    → スタメン枠を選択
                  </span>
                ) : swapSource !== null ? (
                  <span className="bg-blue-900/50 text-blue-300 border border-blue-700/40 text-[10px] px-2 py-0.5 rounded-full">
                    {swapSource}番と入れ替え
                  </span>
                ) : selectedBattingOrder ? (
                  <span className="bg-green-900/50 text-green-300 border border-green-700/40 text-[10px] px-2 py-0.5 rounded-full">
                    {selectedBattingOrder}番に追加
                  </span>
                ) : null}
                <span className="text-[10px] text-gray-600 ml-auto">ヘッダークリックでソート</span>
              </div>
              <div className="overflow-y-auto max-h-[700px]">
                <table className="w-full text-left">
                  <thead className="sticky top-0 z-10">
                    {/* 列グループヘッダー */}
                    <tr className="bg-gray-800 border-b border-gray-700/30 text-[9px] font-medium">
                      <th colSpan={4} className="py-1 pl-2 pr-1 text-left text-gray-500">選手情報</th>
                      <th colSpan={7} className="py-1 px-1 text-center text-blue-400/60 border-l border-gray-700/40">野手能力</th>
                      <th colSpan={1} className="py-1 px-1 text-center text-yellow-400/60 border-l border-gray-700/40">状態</th>
                      <th colSpan={3} className="py-1 px-1 text-center text-red-400/60 border-l border-gray-700/40">投手能力</th>
                      <th colSpan={1} className="py-1 px-1 text-center text-gray-500 border-l border-gray-700/40">成績</th>
                    </tr>
                    <tr className="bg-gray-800 border-b border-gray-700/50 text-[10px] text-gray-400">
                      <SortHeader label="名前" sortKey="name" className="pl-2" />
                      <SortHeader label="齢" sortKey="age" className="text-center" />
                      <SortHeader label="守備" sortKey="position" />
                      <th className="py-1 px-1 text-gray-500">投打</th>
                      <SortHeader label="ミ" sortKey="meet" className="text-center border-l border-gray-700/40" />
                      <SortHeader label="パ" sortKey="power" className="text-center" />
                      <SortHeader label="走" sortKey="speed" className="text-center" />
                      <SortHeader label="肩" sortKey="arm" className="text-center" />
                      <SortHeader label="守" sortKey="defense" className="text-center" />
                      <SortHeader label="体" sortKey="bodyStamina" className="text-center" />
                      <SortHeader label="回" sortKey="recovery" className="text-center" />
                      <SortHeader label="疲" sortKey="fatigue" className="text-center border-l border-gray-700/40" />
                      <SortHeader label="球速" sortKey="velocity" className="text-center border-l border-gray-700/40" />
                      <SortHeader label="制球" sortKey="control" className="text-center" />
                      <SortHeader label="スタ" sortKey="stamina" className="text-center" />
                      <th className="py-1 px-1 text-center border-l border-gray-700/40">成績</th>
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
          // 全選手をロール別にグループ分け
          const allPlayers = team.players || [];
          const starterPitchers = allPlayers.filter(p => ['ace', 'complete', 'short', 'quality', 'auto_s'].includes(getPitcherRole(p.id)));
          const starterOrder = team.pitchingRotation.starters || [];
          starterPitchers.sort((a, b) => {
            const ia = starterOrder.indexOf(a.id);
            const ib = starterOrder.indexOf(b.id);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
          });

          const handleSwapStarter = (displayIdx, direction) => {
            const starters = team.pitchingRotation.starters;
            if (!starters) return;
            const playerId = starterPitchers[displayIdx]?.id;
            const targetPlayerId = starterPitchers[displayIdx + direction]?.id;
            if (!playerId || !targetPlayerId) return;
            const idx = starters.indexOf(playerId);
            const targetIdx = starters.indexOf(targetPlayerId);
            if (idx === -1 || targetIdx === -1) return;
            starters[idx] = targetPlayerId;
            starters[targetIdx] = playerId;
            setUpdateTrigger(prev => prev + 1);
          };

          // リリーフをサブグループに分類
          const reliefByRole = {
            long: allPlayers.filter(p => ['long', 'auto_r'].includes(getPitcherRole(p.id))),
            middle: allPlayers.filter(p => ['mopup', 'behind', 'onepoint', 'ace_relief'].includes(getPitcherRole(p.id))),
            setup: allPlayers.filter(p => getPitcherRole(p.id) === 'setup'),
            closer: allPlayers.filter(p => getPitcherRole(p.id) === 'closer'),
          };
          const allReliefPitchers = [...reliefByRole.long, ...reliefByRole.middle, ...reliefByRole.setup, ...reliefByRole.closer];
          const unassignedPitchers = allPlayers.filter(p => p.position === 'pitcher' && getPitcherRole(p.id) === 'none');
          const fieldersForConvert = allPlayers.filter(p => p.position !== 'pitcher' && getPitcherRole(p.id) === 'none');

          const StatVal = ({ label, value, isVelocity }) => {
            const rank = isVelocity ? getVelocityRank(value) : getAbilityRank(value);
            return <span className={`${getRankColor(rank)}`}>{label}{value}</span>;
          };

          // ロールアイコン
          const ROLE_ICON = {
            ace: '👑', complete: '🏔', short: '⚡', quality: '✓', auto_s: '🤖',
            long: '🔄', mopup: '🧹', behind: '🛡', onepoint: '🎯',
            ace_relief: '🔥', setup: '⬆', closer: '🔒', auto_r: '🤖', none: '—',
          };

          // ロール選択モーダル
          const RoleSelectModal = ({ player, onClose }) => {
            if (!player) return null;
            const currentRole = getPitcherRole(player.id);
            const starterRoles = [
              { key: 'complete', label: '完投型', desc: 'スタミナ限界まで投げ抜く', color: 'from-blue-800 to-blue-900' },
              { key: 'ace', label: 'ゲームメーカー', desc: '7-8回を責任投球、勝ちパターンへ繋ぐ', color: 'from-red-700 to-red-800' },
              { key: 'quality', label: '勝ち権利', desc: '5-6回を投げて降板', color: 'from-blue-600 to-blue-700' },
              { key: 'short', label: 'ショート', desc: '3-4回で中継ぎに繋ぐ', color: 'from-blue-700 to-blue-800' },
              { key: 'auto_s', label: 'おまかせ', desc: '能力に応じて自動調整', color: 'from-gray-600 to-gray-700' },
            ];
            const reliefRoles = [
              { key: 'mopup', label: '敗戦処理', desc: '大差で登板しスタミナ温存', color: 'from-gray-700 to-gray-800' },
              { key: 'behind', label: 'ビハインド', desc: 'ビハインド時にイニングを繋ぐ', color: 'from-yellow-800 to-yellow-900' },
              { key: 'auto_r', label: 'おまかせ', desc: '自動で登板場面を判断', color: 'from-gray-600 to-gray-700' },
              { key: 'long', label: 'ロングリリーフ', desc: '先発降板後をカバー', color: 'from-green-800 to-green-900' },
              { key: 'onepoint', label: 'ワンポイント', desc: '特定打者に対して登板', color: 'from-green-700 to-green-800' },
              { key: 'ace_relief', label: '中継ぎエース', desc: '僅差の重要場面で登板', color: 'from-green-600 to-green-700' },
              { key: 'setup', label: 'セットアッパー', desc: '7-8回の僅差で守護神に繋ぐ', color: 'from-orange-700 to-orange-800' },
              { key: 'closer', label: '守護神', desc: '9回・リード時に試合を締める', color: 'from-purple-700 to-purple-800' },
            ];

            const RoleButton = ({ role }) => {
              const isActive = currentRole === role.key;
              return (
                <button
                  onClick={() => { handleSetPitcherRole(player.id, role.key); onClose(); }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all border ${
                    isActive
                      ? 'bg-gradient-to-r ' + role.color + ' border-white/30 ring-1 ring-white/20 shadow-lg'
                      : 'bg-gray-700/50 border-gray-600/50 hover:bg-gray-600/70 hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base w-6 text-center">{ROLE_ICON[role.key]}</span>
                    <span className={`font-bold text-sm ${isActive ? 'text-white' : 'text-gray-200'}`}>{role.label}</span>
                    {isActive && <span className="ml-auto text-xs bg-white/20 px-1.5 py-0.5 rounded text-white">現在</span>}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 ml-8">{role.desc}</p>
                </button>
              );
            };

            return (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
                <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-4 py-3 rounded-t-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-white font-bold">{player.name}</h3>
                        <p className="text-gray-400 text-xs">{player.age}歳 {getThrowsLabel(player.physical?.throws)}</p>
                      </div>
                      <button onClick={onClose} className="text-gray-400 hover:text-white text-xl px-2">✕</button>
                    </div>
                  </div>
                  <div className="p-4 space-y-4">
                    <div>
                      <h4 className="text-blue-400 font-bold text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-8 h-px bg-blue-400/30"></span>先発<span className="flex-1 h-px bg-blue-400/30"></span>
                      </h4>
                      <div className="space-y-1.5">
                        {starterRoles.map(r => <RoleButton key={r.key} role={r} />)}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-green-400 font-bold text-xs uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-8 h-px bg-green-400/30"></span>リリーフ<span className="flex-1 h-px bg-green-400/30"></span>
                      </h4>
                      <div className="space-y-1.5">
                        {reliefRoles.map(r => <RoleButton key={r.key} role={r} />)}
                      </div>
                    </div>
                    <button
                      onClick={() => { handleSetPitcherRole(player.id, 'none'); onClose(); }}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${
                        currentRole === 'none'
                          ? 'bg-gray-600 border-gray-500 text-white'
                          : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                      }`}
                    >
                      起用解除
                    </button>
                  </div>
                </div>
              </div>
            );
          };

          const FORM_SHORT = { overhand: 'オーバー', threeQuarter: 'スリー', sidearm: 'サイド', submarine: 'アンダー' };

          // コンパクト投手行コンポーネント（1行表示・クリックで詳細）
          const PitcherRow = ({ player, index, isStarter, totalCount }) => {
            const role = getPitcherRole(player.id);
            const roleInfo = PITCHER_ROLES[role];
            const p = player.pitching || {};
            const ph = player.physical || {};
            const borderColors = {
              ace: 'border-l-red-500', complete: 'border-l-blue-500', short: 'border-l-blue-400', quality: 'border-l-blue-300',
              auto_s: 'border-l-gray-400', long: 'border-l-green-600', ace_relief: 'border-l-green-400', mopup: 'border-l-gray-500',
              behind: 'border-l-yellow-600', onepoint: 'border-l-green-500', setup: 'border-l-orange-500', closer: 'border-l-purple-500',
              auto_r: 'border-l-gray-400', none: 'border-l-gray-600',
            };

            const ps = player.seasonStats?.pitching;
            const era = ps?.inningsPitched > 0 ? ((ps.earnedRuns || 0) / (ps.inningsPitched / 3) * 9).toFixed(2) : null;
            const throwsChar = ph.throws === 'left' ? '左' : '右';
            const formChar = FORM_SHORT[p.form] || '';

            return (
              <div
                className={`flex items-center gap-1 px-2 py-1 border-l-2 ${borderColors[role] || 'border-l-gray-600'} hover:bg-gray-700/50 rounded-r transition-colors cursor-pointer`}
                onClick={() => setDetailPlayer(player)}
              >
                {isStarter && (
                  <div className="flex items-center gap-0 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSwapStarter(index, -1); }}
                      disabled={index === 0}
                      className={`w-4 h-4 flex items-center justify-center text-[10px] ${index === 0 ? 'text-gray-700' : 'text-gray-500 hover:text-white'}`}
                    >▲</button>
                    <span className="text-blue-400 font-bold text-xs w-3 text-center">{index + 1}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSwapStarter(index, 1); }}
                      disabled={index === totalCount - 1}
                      className={`w-4 h-4 flex items-center justify-center text-[10px] ${index === totalCount - 1 ? 'text-gray-700' : 'text-gray-500 hover:text-white'}`}
                    >▼</button>
                  </div>
                )}
                <span className={`font-bold text-sm truncate ${player.position === 'pitcher' ? 'text-white' : 'text-cyan-300'}`} style={{ width: '5.5rem', minWidth: '5.5rem', maxWidth: '5.5rem' }}>
                  {player.name}
                </span>
                <span className="text-[10px] text-gray-500 shrink-0 w-4">{player.age || ''}</span>
                <span className={`text-[11px] shrink-0 ${CONDITION_COLORS[player.condition ?? CONDITION_LEVELS.NORMAL]}`}>
                  {CONDITION_ICONS[player.condition ?? CONDITION_LEVELS.NORMAL]}
                </span>
                <span className="text-[11px] text-gray-500 shrink-0" style={{ width: '4.5rem', minWidth: '4.5rem' }}>{throwsChar}{formChar && `/${formChar}`}</span>
                <div className="flex items-center gap-0.5 text-xs shrink-0" style={{ width: '10rem', minWidth: '10rem' }}>
                  <span className="text-gray-500 text-[10px]">速</span><StatVal label="" value={p.velocity || 0} isVelocity />
                  <span className="text-gray-600">/</span>
                  <span className="text-gray-500 text-[10px]">制</span><StatVal label="" value={p.control || 0} />
                  <span className="text-gray-600">/</span>
                  <span className="text-gray-500 text-[10px]">ス</span><StatVal label="" value={p.stamina || 0} />
                </div>
                {ps?.games > 0 && (
                  <span className="text-[11px] text-gray-500 shrink-0">
                    {ps.wins||0}勝{ps.losses||0}敗{era && <span className="text-orange-300/70 ml-0.5">{era}</span>}
                  </span>
                )}
                <div className="flex items-center gap-0.5 ml-auto shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setPosConvertPlayer(player); }}
                    className={`text-[11px] px-1 py-0 rounded border ${
                      player.position === 'pitcher'
                        ? 'border-indigo-700/40 text-indigo-400/70 hover:bg-indigo-900/30'
                        : 'border-cyan-700/40 text-cyan-400/70 hover:bg-cyan-900/30'
                    }`}
                    title="ポジション変更"
                  >
                    {POSITION_NAMES[player.position]?.charAt(0) || '投'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setRoleSelectPlayer(player); }}
                    className={`${roleInfo.color} text-white px-1.5 py-0 rounded-full text-xs font-bold flex items-center gap-0.5 hover:brightness-125 shrink-0`}
                  >
                    <span className="text-[10px]">{ROLE_ICON[role]}</span>
                    {roleInfo.label}
                  </button>
                </div>
              </div>
            );
          };

          // 投手詳細モーダル
          const PitcherDetailModal = ({ player, onClose }) => {
            if (!player) return null;
            const p = player.pitching || {};
            const b = player.batting || {};
            const ph = player.physical || {};
            const f = player.fielding || {};
            const ps = player.seasonStats?.pitching;
            const bs = player.seasonStats?.batting;
            const cs = player.careerStats?.pitching;
            const arsenal = (p.arsenal || []).filter(a => a.type !== 'straight');

            const era = ps?.inningsPitched > 0 ? ((ps.earnedRuns || 0) / (ps.inningsPitched / 3) * 9).toFixed(2) : '-';
            const whip = ps?.inningsPitched > 0 ? (((ps.walks || 0) + (ps.hits || 0)) / (ps.inningsPitched / 3)).toFixed(2) : '-';
            const ip = ps?.inningsPitched ? (ps.inningsPitched / 3).toFixed(1) : '0.0';
            const cEra = cs?.inningsPitched > 0 ? ((cs.earnedRuns || 0) / (cs.inningsPitched / 3) * 9).toFixed(2) : '-';

            const StatBox = ({ label, value, isVelocity }) => {
              const rank = isVelocity ? getVelocityRank(value) : getAbilityRank(value);
              return (
                <div className="text-center">
                  <div className="text-[10px] text-gray-500">{label}</div>
                  <div className={`text-sm font-bold ${getRankColor(rank)}`}>{value}</div>
                </div>
              );
            };

            return (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
                <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  {/* ヘッダー */}
                  <div className="border-b border-gray-700 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-black text-base">{player.name}</span>
                        <span className={`text-xs ${CONDITION_COLORS[player.condition ?? CONDITION_LEVELS.NORMAL]}`}>
                          {CONDITION_ICONS[player.condition ?? CONDITION_LEVELS.NORMAL]}
                        </span>
                      </div>
                      <button onClick={onClose} className="text-gray-400 hover:text-white text-xl px-2">✕</button>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>{player.age}歳</span>
                      <span>{getThrowsLabel(ph.throws)}{getBatsLabel(b.bats || ph.bats)}</span>
                      {p.form && <span>{getFormLabel(p.form)}</span>}
                      <span>{POSITION_NAMES[player.position]}</span>
                      <button
                        onClick={() => { onClose(); setPosConvertPlayer(player); }}
                        className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-gray-700 hover:bg-gray-600 border border-gray-600 hover:border-blue-500 text-gray-300 hover:text-blue-300 transition"
                      >登録変更</button>
                      <div className="flex items-center gap-1 ml-auto">
                        <span className="text-[10px]">体力</span>
                        <div className="w-16 h-1.5 bg-gray-600 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${getStaminaBarColor(ph.bodyStamina ?? 50)}`}
                            style={{ width: `${Math.min(100, (ph.bodyStamina ?? 50))}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px]">{ph.bodyStamina ?? 50}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    {/* 投手能力 */}
                    <div>
                      <h4 className="text-blue-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">投手能力</h4>
                      <div className="grid grid-cols-6 gap-2 bg-gray-700/40 rounded-lg p-2">
                        <StatBox label="球速" value={p.velocity || 0} isVelocity />
                        <StatBox label="制球" value={p.control || 0} />
                        <StatBox label="スタミナ" value={p.stamina || 0} />
                        <StatBox label="肩力" value={ph.arm || 0} />
                        <StatBox label="守備" value={f.defense || 0} />
                        <StatBox label="走力" value={ph.speed || 0} />
                      </div>
                    </div>

                    {/* 変化球 */}
                    {arsenal.length > 0 && (
                      <div>
                        <h4 className="text-green-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">変化球</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {arsenal.map((a, i) => {
                            const rank = getAbilityRank(a.level || 0);
                            return (
                              <span key={i} className={`px-2 py-0.5 rounded bg-gray-700/60 text-xs font-semibold ${getRankColor(rank)}`}>
                                {getPitchTypeName(a.type)} <span className="text-[10px] opacity-70">Lv{a.level}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 打撃能力 */}
                    <div>
                      <h4 className="text-orange-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">打撃能力</h4>
                      <div className="grid grid-cols-5 gap-2 bg-gray-700/40 rounded-lg p-2">
                        <StatBox label="ミート" value={b.meet || 0} />
                        <StatBox label="パワー" value={b.power || 0} />
                        <StatBox label="選球眼" value={b.eye || 0} />
                        <StatBox label="走力" value={ph.speed || 0} />
                        <StatBox label="盗塁" value={b.steal || 0} />
                      </div>
                    </div>

                    {/* シーズン成績 */}
                    {ps?.games > 0 && (
                      <div>
                        <h4 className="text-yellow-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">シーズン成績</h4>
                        <div className="bg-gray-700/40 rounded-lg p-2">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            <span className="text-white font-bold">{ps.wins||0}勝{ps.losses||0}敗</span>
                            {(ps.saves > 0) && <span className="text-white">{ps.saves}S</span>}
                            {(ps.holds > 0) && <span className="text-white">{ps.holds}H</span>}
                            <span className="text-orange-300">防御率 {era}</span>
                            <span className="text-gray-300">{ip}回</span>
                            <span className="text-gray-300">WHIP {whip}</span>
                            <span className="text-gray-300">{ps.strikeouts||0}K</span>
                            <span className="text-gray-400">{ps.games}試合</span>
                          </div>
                          {bs?.atBats > 0 && (
                            <div className="flex gap-x-3 text-xs mt-1 pt-1 border-t border-gray-600/40">
                              <span className="text-blue-300">打率 {(bs.hits / bs.atBats).toFixed(3)}</span>
                              <span className="text-gray-300">{bs.atBats}打数 {bs.hits}安打</span>
                              {bs.homeruns > 0 && <span className="text-gray-300">{bs.homeruns}本塁打</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 通算成績 */}
                    {cs?.games > 0 && (
                      <div>
                        <h4 className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">通算成績</h4>
                        <div className="flex flex-wrap gap-x-4 text-[11px] text-gray-400 bg-gray-700/30 rounded-lg px-2 py-1.5">
                          <span>{cs.wins||0}勝{cs.losses||0}敗</span>
                          {(cs.saves > 0) && <span>{cs.saves}S</span>}
                          <span>防{cEra}</span>
                          <span>{cs.games}試合</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          };

          // コンパクトブルペンフロー
          const BullpenFlowCompact = () => {
            const items = [
              { label: '先発', count: starterPitchers.length, target: 6, color: 'text-blue-400' },
              { label: '中継', count: reliefByRole.long.length + reliefByRole.middle.length, target: 3, color: 'text-green-400' },
              { label: 'SU', count: reliefByRole.setup.length, target: 1, color: 'text-orange-400' },
              { label: '抑', count: reliefByRole.closer.length, target: 1, color: 'text-purple-400' },
              { label: '未', count: unassignedPitchers.length, target: 0, color: 'text-gray-400' },
            ];
            return (
              <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-800/50 rounded-lg border border-gray-700/50 mb-2">
                {items.map((s, i) => (
                  <React.Fragment key={s.label}>
                    <div className="flex items-center gap-1">
                      <span className={`text-xs font-medium ${s.color}`}>{s.label}</span>
                      <span className={`text-sm font-bold ${s.target > 0 && s.count >= s.target ? 'text-white' : s.count > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
                        {s.count}{s.target > 0 && <span className="text-gray-600 text-[11px]">/{s.target}</span>}
                      </span>
                    </div>
                    {i < items.length - 1 && <span className="text-gray-700 text-xs">▸</span>}
                  </React.Fragment>
                ))}
                <span className="text-gray-600 text-[11px] ml-auto">バッジ: 役割変更 / ポジ: 登録変更</span>
              </div>
            );
          };

          return (
            <div>
              <BullpenFlowCompact />

              {/* ロール選択モーダル */}
              {roleSelectPlayer && (
                <RoleSelectModal player={roleSelectPlayer} onClose={() => setRoleSelectPlayer(null)} />
              )}
              {/* 投手詳細モーダル */}
              {detailPlayer && (
                <PitcherDetailModal player={detailPlayer} onClose={() => setDetailPlayer(null)} />
              )}

              {/* 2カラム: 先発（左） / リリーフ（右） */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                {/* 先発ローテーション */}
                <div className="bg-gray-800/60 rounded-lg border border-gray-700/50 overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-gray-700/50 flex items-center gap-1.5">
                    <span className="text-blue-400 text-sm">⚾</span>
                    <h2 className="text-sm font-bold text-blue-400">先発ローテーション</h2>
                    <span className="text-gray-500 text-xs">{starterPitchers.length}人</span>
                  </div>
                  <div className="p-1 space-y-0.5">
                    {starterPitchers.length === 0 ? (
                      <p className="text-gray-500 text-xs py-3 text-center">未設定</p>
                    ) : starterPitchers.map((player, idx) => (
                      <PitcherRow key={player.id} player={player} index={idx} isStarter totalCount={starterPitchers.length} />
                    ))}
                  </div>
                </div>

                {/* リリーフ陣 */}
                <div className="bg-gray-800/60 rounded-lg border border-gray-700/50 overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-gray-700/50 flex items-center gap-1.5">
                    <span className="text-green-400 text-sm">🔄</span>
                    <h2 className="text-sm font-bold text-green-400">リリーフ</h2>
                    <span className="text-gray-500 text-xs">{allReliefPitchers.length}人</span>
                  </div>
                  <div className="p-1 space-y-0.5">
                    {allReliefPitchers.length === 0 ? (
                      <p className="text-gray-500 text-xs py-3 text-center">未設定</p>
                    ) : allReliefPitchers.map((player, idx) => (
                      <PitcherRow key={player.id} player={player} index={idx} />
                    ))}
                  </div>
                </div>
              </div>

              {/* 未設定＋コンバート（横並び折りたたみ） */}
              <div className="grid grid-cols-2 gap-2">
                {unassignedPitchers.length > 0 && (
                  <div className="bg-gray-800/60 rounded-lg border border-gray-700/50 overflow-hidden">
                    <div className="px-3 py-1.5 border-b border-gray-700/50 flex items-center gap-1.5">
                      <span className="text-gray-400 text-sm">📋</span>
                      <h2 className="text-sm font-bold text-gray-400">未設定</h2>
                      <span className="text-gray-500 text-xs">{unassignedPitchers.length}人</span>
                    </div>
                    <div className="p-1 space-y-0.5">
                      {unassignedPitchers.map((player, idx) => (
                        <PitcherRow key={player.id} player={player} index={idx} />
                      ))}
                    </div>
                  </div>
                )}
                <details className="bg-gray-800/60 rounded-lg border border-gray-700/50 overflow-hidden">
                  <summary className="px-3 py-1.5 border-b border-gray-700/50 flex items-center gap-1.5 cursor-pointer hover:bg-gray-700/30 list-none">
                    <span className="text-cyan-400 text-sm">🔀</span>
                    <h2 className="text-sm font-bold text-cyan-400">野手コンバート</h2>
                    <span className="text-gray-500 text-xs">{fieldersForConvert.length}人</span>
                    <span className="text-gray-600 text-[11px] ml-auto">▶</span>
                  </summary>
                  <div className="p-1 space-y-0.5">
                    {fieldersForConvert.map((player, idx) => (
                      <PitcherRow key={player.id} player={player} index={idx} />
                    ))}
                  </div>
                </details>
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

          // ダイヤモンド上の各ポジション座標（SVG 500x470）
          const posCoords = {
            pitcher:  { x: 250, y: 270 },
            catcher:  { x: 250, y: 395 },
            first:    { x: 385, y: 240 },
            second:   { x: 320, y: 170 },
            short:    { x: 180, y: 170 },
            third:    { x: 115, y: 240 },
            left:     { x: 70,  y: 110 },
            center:   { x: 250, y: 65 },
            right:    { x: 430, y: 110 },
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
            if (range >= 0.90) return { fill: 'rgba(236,72,153,0.18)', stroke: '#ec4899' };
            if (range >= 0.82) return { fill: 'rgba(248,113,113,0.16)', stroke: '#f87171' };
            if (range >= 0.70) return { fill: 'rgba(251,146,60,0.14)', stroke: '#fb923c' };
            if (range >= 0.55) return { fill: 'rgba(251,191,36,0.14)', stroke: '#fbbf24' };
            if (range >= 0.42) return { fill: 'rgba(74,222,128,0.12)', stroke: '#4ade80' };
            if (range >= 0.30) return { fill: 'rgba(96,165,250,0.10)', stroke: '#60a5fa' };
            return { fill: 'rgba(148,163,184,0.08)', stroke: '#94a3b8' };
          };

          const getFitnessColor = (fitness) => {
            if (fitness >= 100) return '#ff1493'; // DeepPink
            if (fitness >= 90) return '#ec4899';  // Pink
            if (fitness >= 80) return '#f87171';  // Red
            if (fitness >= 70) return '#f97316';  // Orange
            if (fitness >= 60) return '#fbbf24';  // Amber
            if (fitness >= 50) return '#eab308';  // Yellow
            if (fitness >= 40) return '#84cc16';  // Lime
            if (fitness >= 30) return '#22c55e';  // Green
            if (fitness >= 20) return '#06b6d4';  // Cyan
            if (fitness >= 10) return '#3b82f6';  // Blue
            return '#6366f1';                     // Indigo
          };

          const getRangeGrade = (range) => {
            if (range >= 0.90) return { label: 'S', color: 'text-pink-400' };
            if (range >= 0.82) return { label: 'A', color: 'text-red-400' };
            if (range >= 0.70) return { label: 'B', color: 'text-orange-400' };
            if (range >= 0.55) return { label: 'C', color: 'text-yellow-400' };
            if (range >= 0.42) return { label: 'D', color: 'text-green-400' };
            if (range >= 0.30) return { label: 'E', color: 'text-blue-400' };
            return { label: 'F', color: 'text-slate-400' };
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

          // 適正に基づくグラデーション色（10刻み）
          const getFitnessGradient = (fitness) => {
            if (fitness >= 100) return { main: '#ff1493', glow: 'rgba(255,20,147,0.6)', bg: 'rgba(255,20,147,0.12)' };
            if (fitness >= 90) return { main: '#ec4899', glow: 'rgba(236,72,153,0.55)', bg: 'rgba(236,72,153,0.11)' };
            if (fitness >= 80) return { main: '#f87171', glow: 'rgba(248,113,113,0.5)', bg: 'rgba(248,113,113,0.10)' };
            if (fitness >= 70) return { main: '#f97316', glow: 'rgba(249,115,22,0.45)', bg: 'rgba(249,115,22,0.09)' };
            if (fitness >= 60) return { main: '#fbbf24', glow: 'rgba(251,191,36,0.4)', bg: 'rgba(251,191,36,0.08)' };
            if (fitness >= 50) return { main: '#eab308', glow: 'rgba(234,179,8,0.38)', bg: 'rgba(234,179,8,0.07)' };
            if (fitness >= 40) return { main: '#84cc16', glow: 'rgba(132,204,22,0.35)', bg: 'rgba(132,204,22,0.07)' };
            if (fitness >= 30) return { main: '#22c55e', glow: 'rgba(34,197,94,0.32)', bg: 'rgba(34,197,94,0.06)' };
            if (fitness >= 20) return { main: '#06b6d4', glow: 'rgba(6,182,212,0.3)', bg: 'rgba(6,182,212,0.06)' };
            if (fitness >= 10) return { main: '#3b82f6', glow: 'rgba(59,130,246,0.28)', bg: 'rgba(59,130,246,0.05)' };
            return { main: '#6366f1', glow: 'rgba(99,102,241,0.25)', bg: 'rgba(99,102,241,0.04)' };
          };

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
                <svg viewBox="0 -20 500 560" className="w-full max-w-2xl mx-auto">
                  <defs>
                    {/* 各ポジションの守備範囲グラデーション（適正で色変化） */}
                    {Object.entries(posCoords).map(([pos]) => {
                      const player = positionPlayers[pos];
                      const fitness = player ? getFitness(player, pos) : 0;
                      const grad = getFitnessGradient(fitness);
                      return (
                        <radialGradient key={`grad-${pos}-${player?.id || 'none'}`} id={`rangeGrad-${pos}`}>
                          <stop offset="0%" stopColor={grad.main} stopOpacity="0.35" />
                          <stop offset="60%" stopColor={grad.main} stopOpacity="0.12" />
                          <stop offset="100%" stopColor={grad.main} stopOpacity="0.02" />
                        </radialGradient>
                      );
                    })}
                    {/* マーカーの光彩フィルター */}
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="glowStrong" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    {/* テキスト影フィルター */}
                    <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.8" />
                    </filter>
                    <filter id="textShadowStrong" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="1" stdDeviation="3" floodColor="#000" floodOpacity="0.9" />
                    </filter>
                    {/* 芝のパターン */}
                    <pattern id="grassPattern" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                      <rect width="8" height="8" fill="#1f5c33" />
                      <line x1="0" y1="4" x2="8" y2="4" stroke="#1a522d" strokeWidth="0.5" opacity="0.3" />
                    </pattern>
                  </defs>

                  {/* グラウンド背景（リッチ版） */}
                  <rect x="0" y="-20" width="500" height="490" fill="#142e1e" rx="12" />
                  <ellipse cx="250" cy="230" rx="230" ry="210" fill="url(#grassPattern)" />
                  {/* 外野の芝模様（同心弧） */}
                  {[140, 170, 200].map(r => (
                    <ellipse key={r} cx="250" cy="395" rx={r} ry={r} fill="none" stroke="#1a4a2c" strokeWidth="16" opacity="0.25" />
                  ))}
                  {/* 内野ダイヤモンド */}
                  <polygon points="250,200 350,275 250,350 150,275" fill="#8B6914" opacity="0.3" />
                  <polygon points="250,155 385,275 250,395 115,275" fill="none" stroke="#c4a35a" strokeWidth="1.5" strokeDasharray="6,3" opacity="0.45" />
                  {/* ファウルライン */}
                  <line x1="250" y1="395" x2="50" y2="210" stroke="#fff" strokeWidth="1.2" opacity="0.3" />
                  <line x1="250" y1="395" x2="450" y2="210" stroke="#fff" strokeWidth="1.2" opacity="0.3" />
                  {/* ベース */}
                  <rect x="244" y="389" width="12" height="12" fill="#fff" transform="rotate(45,250,395)" opacity="0.9" />
                  <rect x="379" y="269" width="10" height="10" fill="#fff" transform="rotate(45,384,274)" opacity="0.8" />
                  <rect x="245" y="189" width="10" height="10" fill="#fff" transform="rotate(45,250,194)" opacity="0.8" />
                  <rect x="110" y="269" width="10" height="10" fill="#fff" transform="rotate(45,115,274)" opacity="0.8" />
                  {/* マウンド */}
                  <ellipse cx="250" cy="290" rx="12" ry="8" fill="#8B6914" opacity="0.4" />

                  {/* 守備範囲の円（getDefenseRangeでサイズ、適正で色） */}
                  {Object.entries(posCoords).map(([pos, coord]) => {
                    const player = positionPlayers[pos];
                    if (!player) return null;
                    const range = getDefenseRange(player, pos);
                    const isOutfield = ['left', 'center', 'right'].includes(pos);
                    const baseRadius = isOutfield ? 55 : 35;
                    // 円のサイズ: getDefenseRange（守備力+走力+肩+適正補正）で決定
                    const radius = baseRadius * (0.4 + range * 0.9);
                    const fitness = getFitness(player, pos);
                    const grad = getFitnessGradient(fitness);
                    const rangeDelay = `${Object.keys(posCoords).indexOf(pos) * 0.06}s`;
                    return (
                      <g key={`range-${pos}-${player.id}`}>
                        {/* 外側のぼかし円 */}
                        <circle cx={coord.x} cy={coord.y}
                          fill={grad.bg} stroke="none" opacity="0">
                          <animate attributeName="r" from="0" to={radius * 1.15} dur="0.7s" begin={rangeDelay} fill="freeze"
                            calcMode="spline" keySplines="0.25 0.46 0.45 0.94" />
                          <animate attributeName="opacity" from="0" to="0.6" dur="0.7s" begin={rangeDelay} fill="freeze" />
                        </circle>
                        {/* メインの守備範囲円 */}
                        <circle cx={coord.x} cy={coord.y}
                          fill={`url(#rangeGrad-${pos})`} stroke={grad.main}
                          strokeWidth="1.5" strokeDasharray="5,3" opacity="0">
                          <animate attributeName="r" from="0" to={radius} dur="0.6s" begin={rangeDelay} fill="freeze"
                            calcMode="spline" keySplines="0.25 0.46 0.45 0.94" />
                          <animate attributeName="opacity" from="0" to="0.9" dur="0.6s" begin={rangeDelay} fill="freeze" />
                        </circle>
                        {/* 内側の強調リング */}
                        <circle cx={coord.x} cy={coord.y} r={radius * 0.6}
                          fill="none" stroke={grad.main} strokeWidth="0.5" opacity="0.3"
                          strokeDasharray="3,5" />

                      </g>
                    );
                  })}

                  {/* 選手マーカー（クリック可能・アニメーション付き） */}
                  {Object.entries(posCoords).map(([pos, coord], posIndex) => {
                    const player = positionPlayers[pos];
                    const isSelected = selectedDefensePos === pos;
                    const fitness = player ? getFitness(player, pos) : 0;
                    const grad = getFitnessGradient(fitness);
                    const isPitcherPos = pos === 'pitcher';
                    const range = getDefenseRange(player, pos);
                    const grade = getRangeGrade(range);
                    // マーカーサイズ: 走力+守備力ベース
                    const def = player?.fielding?.defense || 50;
                    const spd = player?.physical?.speed || 50;
                    const markerSize = player ? 13 + ((spd * 0.5 + def * 0.5) / 100) * 8 : 14;
                    const animDelay = `${posIndex * 0.08}s`;

                    return (
                      <g key={pos} onClick={() => !isPitcherPos && handleDefenseClick(pos)}
                         style={{ cursor: isPitcherPos ? 'default' : 'pointer' }}>
                        {/* 選択リング */}
                        {isSelected && (
                          <>
                            <circle cx={coord.x} cy={coord.y} r={markerSize + 10} fill="none" stroke="#facc15" strokeWidth="2" opacity="0.25" />
                            <circle cx={coord.x} cy={coord.y} r={markerSize + 6} fill="none" stroke="#facc15" strokeWidth="2.5" strokeDasharray="5,3" />
                          </>
                        )}

                        {/* 光彩エフェクト（プレイヤー有の場合） */}
                        {player && !isSelected && (
                          <circle cx={coord.x} cy={coord.y} r={markerSize + 4}
                            fill="none" stroke={grad.main} strokeWidth="1" opacity="0.2" />
                        )}

                        {/* マーカー本体（グラデーション化・登場アニメーション） */}
                        <circle cx={coord.x} cy={coord.y}
                          fill={isSelected ? '#854d0e' : player ? '#1e3a5f' : '#2d3748'}
                          stroke={isSelected ? '#facc15' : player ? grad.main : '#4a5568'}
                          strokeWidth={isSelected ? 2.5 : 2}
                          filter={player ? 'url(#glow)' : undefined}
                          r={markerSize}>
                          <animate attributeName="r" from="0" to={markerSize} dur="0.4s" begin={animDelay} fill="freeze"
                            calcMode="spline" keySplines="0.34 1.56 0.64 1" />
                        </circle>
                        {/* マーカーのハイライト（立体感） */}
                        {player && (
                          <circle cx={coord.x - markerSize * 0.2} cy={coord.y - markerSize * 0.2}
                            r={markerSize * 0.5} fill="white" opacity="0.08" />
                        )}

                        {/* ポジションラベル */}
                        <text x={coord.x} y={coord.y + 1} textAnchor="middle" dominantBaseline="middle"
                          fill="white" fontSize={markerSize > 17 ? '15' : '13'} fontWeight="bold">{posLabels[pos]}</text>

                        {player && (
                          <>
                            {/* 選手名（影付き） */}
                            <text x={coord.x} y={coord.y - markerSize - 16} textAnchor="middle"
                              fill="white" fontSize="13" fontWeight="bold" filter="url(#textShadowStrong)">{player.name}</text>

                            {/* グレードバッジ */}
                            <circle cx={coord.x + markerSize + 3} cy={coord.y - markerSize + 1}
                              r="9" fill="#111827" stroke={grade.color === 'text-pink-400' ? '#ec4899' : grade.color === 'text-red-400' ? '#f87171' : grade.color === 'text-orange-400' ? '#fb923c' : grade.color === 'text-yellow-400' ? '#facc15' : grade.color === 'text-green-400' ? '#4ade80' : '#60a5fa'}
                              strokeWidth="1.5" />
                            <text x={coord.x + markerSize + 3} y={coord.y - markerSize + 2}
                              textAnchor="middle" dominantBaseline="middle"
                              fill={grade.color === 'text-pink-400' ? '#ec4899' : grade.color === 'text-red-400' ? '#f87171' : grade.color === 'text-orange-400' ? '#fb923c' : grade.color === 'text-yellow-400' ? '#facc15' : grade.color === 'text-green-400' ? '#4ade80' : '#60a5fa'}
                              fontSize="11" fontWeight="bold">{grade.label}</text>

                            {/* 適正バー（強化版） */}
                            <rect x={coord.x - 22} y={coord.y + markerSize + 8} width="44" height="6" rx="3" fill="#1f2937" stroke="#374151" strokeWidth="0.5" />
                            <rect x={coord.x - 22} y={coord.y + markerSize + 8} width={44 * fitness / 100} height="6" rx="3" fill={grad.main} opacity="0.85">
                              <animate attributeName="width" from="0" to={44 * fitness / 100} dur="0.6s" begin={animDelay} fill="freeze"
                                calcMode="spline" keySplines="0.25 0.46 0.45 0.94" />
                            </rect>
                            <text x={coord.x} y={coord.y + markerSize + 25} textAnchor="middle"
                              fill={grad.main} fontSize="10" fontWeight="bold" filter="url(#textShadow)">
                              適正{fitness}%
                            </text>

                            {/* 守力・走力の小アイコン */}
                            <text x={coord.x - 16} y={coord.y + markerSize + 37} textAnchor="middle"
                              fill="white" fontSize="9" fontWeight="bold" filter="url(#textShadow)">守{def}</text>
                            <text x={coord.x + 16} y={coord.y + markerSize + 37} textAnchor="middle"
                              fill="white" fontSize="9" fontWeight="bold" filter="url(#textShadow)">走{spd}</text>
                          </>
                        )}
                        {!player && (
                          <text x={coord.x} y={coord.y - 22} textAnchor="middle" fill="#6b7280" fontSize="12" filter="url(#textShadow)">未配置</text>
                        )}
                      </g>
                    );
                  })}

                  {/* 凡例 */}
                  <g transform="translate(10, 510)">
                    <text x="0" y="0" fill="white" fontSize="10" fontWeight="bold" filter="url(#textShadow)">適正:</text>
                    {[
                      { label: '100', color: '#ff1493' }, { label: '90', color: '#ec4899' }, { label: '80', color: '#f87171' },
                      { label: '70', color: '#f97316' }, { label: '60', color: '#fbbf24' }, { label: '50', color: '#eab308' },
                      { label: '40', color: '#84cc16' }, { label: '30', color: '#22c55e' }, { label: '20', color: '#06b6d4' },
                      { label: '10', color: '#3b82f6' }, { label: '0', color: '#6366f1' }
                    ].map((item, i) => (
                      <g key={i} transform={`translate(${35 + i * 40}, 0)`}>
                        <circle cx="0" cy="-3" r="5" fill={item.color} opacity="0.8" />
                        <text x="8" y="0" fill="white" fontSize="8" filter="url(#textShadow)">{item.label}</text>
                      </g>
                    ))}
                  </g>
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
                    const fitColor = fitness >= 100 ? 'text-pink-500' : fitness >= 90 ? 'text-pink-400' : fitness >= 80 ? 'text-red-400' : fitness >= 70 ? 'text-orange-400' : fitness >= 60 ? 'text-amber-400' : fitness >= 50 ? 'text-yellow-400' : fitness >= 40 ? 'text-lime-400' : fitness >= 30 ? 'text-green-400' : fitness >= 20 ? 'text-cyan-400' : fitness >= 10 ? 'text-blue-400' : 'text-indigo-400';
                    const isSelected = selectedDefensePos === pos;
                    const isPitcherPos = pos === 'pitcher';

                    return (
                      <div key={pos}
                        onClick={() => !isPitcherPos && handleDefenseClick(pos)}
                        className={`rounded p-2 transition cursor-pointer ${isSelected ? 'bg-yellow-900 ring-1 ring-yellow-400' : 'bg-gray-700 hover:bg-gray-600'} ${isPitcherPos ? 'cursor-default opacity-60' : ''}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-400 font-bold w-7 text-center text-base">{posLabels[pos]}</span>
                            <span className="text-white text-base font-bold">{player?.name || '-'}</span>
                          </div>
                          {player && <span className={`font-bold text-xl ${grade.color}`}>{grade.label}</span>}
                        </div>
                        {player && (
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-2.5 text-sm">
                              <span className="text-white">守<span className={getRankColor(getAbilityRank(player.fielding?.defense || 0))}>{player.fielding?.defense || 0}</span></span>
                              <span className="text-white">走<span className={getRankColor(getAbilityRank(player.physical?.speed || 0))}>{player.physical?.speed || 0}</span></span>
                              <span className="text-white">肩<span className={getRankColor(getAbilityRank(player.physical?.arm || 0))}>{player.physical?.arm || 0}</span></span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-14 h-2.5 bg-gray-600 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${fitness}%`, backgroundColor: getFitnessColor(fitness) }} />
                              </div>
                              <span className={`text-sm font-bold ${fitColor}`}>{fitness}%</span>
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
                    <div className="text-yellow-400 text-sm font-bold mb-2">{posFullLabels[selectedDefensePos]}と交換:</div>
                    <div className="space-y-1">
                      {selectedPosSwapCandidates.map(({ player, entry }) => {
                        const targetFitness = getFitness(player, selectedDefensePos);
                        const currentFitness = getFitness(player, entry.position);
                        const diff = targetFitness - currentFitness;
                        return (
                          <div key={player.id} onClick={() => handleDefenseClick(entry.position)}
                            className="bg-gray-700 hover:bg-gray-600 rounded px-2 py-1.5 cursor-pointer flex items-center justify-between text-sm">
                            <span className="text-white font-bold">{posLabels[entry.position]} {player.name}</span>
                            <span className={`font-bold ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
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
                      <div className="text-white text-base font-bold mb-1">チーム守備総合</div>
                      <div className={`text-4xl font-bold ${teamGrade.color}`}>{teamGrade.label}</div>
                      <div className="text-gray-300 text-sm mt-1">平均実効守備力: {Math.round(avgRange * 100)}</div>
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

        {/* ポジション変更モーダル（全タブ共通） */}
        {posConvertPlayer && (
          <PosConvertModal player={posConvertPlayer} onClose={() => setPosConvertPlayer(null)} />
        )}
      </div>
    </div>
  );
};

export default LineupSettingScreen;
