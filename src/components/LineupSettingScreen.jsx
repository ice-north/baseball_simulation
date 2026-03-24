import React, { useState, useEffect, useMemo } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
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

    const wasStarter = (rotation.starters || []).includes(playerId);
    const isNewStarter = ['complete', 'short', 'quality', 'auto_s'].includes(newRole);

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

    const StatCell = ({ value, isVelocity }) => {
      const rank = isVelocity ? getVelocityRank(value) : getAbilityRank(value);
      return <td className={`py-1 px-1 text-xs text-center ${getRankColor(rank)}`}>{value}</td>;
    };
    const EmptyCell = () => <td className="py-1 px-1 text-xs text-center text-gray-600">-</td>;

    return (
      <tr
        className={`border-b border-gray-700 cursor-pointer transition ${isInLineup ? 'opacity-40' : swapSource !== null ? 'hover:bg-blue-900' : 'hover:bg-gray-600'}`}
        onClick={() => {
          if (isInLineup) return;
          // swapSource が設定されている場合 → スタメンと控えを入れ替え
          if (swapSource !== null) {
            const entry = lineup.find(e => e.battingOrder === swapSource);
            if (entry && entry.position !== 'pitcher') {
              entry.playerId = player.id;
              setSwapSource(null);
              setUpdateTrigger(prev => prev + 1);
            }
            return;
          }
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
        <td className="py-1 px-1 text-sm text-white font-bold whitespace-nowrap">{player.name} <span className={`text-[10px] ${CONDITION_COLORS[player.condition ?? CONDITION_LEVELS.NORMAL]}`}>{CONDITION_ICONS[player.condition ?? CONDITION_LEVELS.NORMAL]}</span></td>
        <td className="py-1 px-1 text-xs text-gray-400 text-center">{player.age}</td>
        <td className="py-1 px-1 text-xs whitespace-nowrap">
          <span className={isPitcher ? 'text-indigo-300' : 'text-gray-300'}>
            {POSITION_NAMES[player.position] || player.position}
          </span>
          {!isPitcher && (() => {
            const subs = getSubPositions(player, player.position);
            if (subs.length === 0) return null;
            return subs.map((s, i) => <span key={i} className={s.color}>{s.label}</span>);
          })()}
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
        <StatCell value={player.physical?.bodyStamina || 50} />
        <StatCell value={player.physical?.recovery || 50} />
        <td className="py-1 px-1 text-[10px] text-center">
          {(() => {
            const f = player.fatigue || 0;
            const color = f >= 80 ? 'text-red-400' : f >= 50 ? 'text-orange-400' : f >= 20 ? 'text-yellow-400' : 'text-green-400';
            return <span className={color}>{f}</span>;
          })()}
        </td>
        {/* 投手能力: 球速、制球、スタミナ（全選手表示） */}
        <StatCell value={player.pitching?.velocity || 0} isVelocity />
        <StatCell value={player.pitching?.control || 0} />
        <StatCell value={player.pitching?.stamina || 0} />
        <td className="py-1 px-1 text-[10px] text-center whitespace-nowrap">
          {isPitcher ? (() => {
            const ps = player.seasonStats?.pitching;
            if (!ps || !ps.games) return <span className="text-gray-600">-</span>;
            const ip = ps.inningsPitched ? (ps.inningsPitched / 3).toFixed(1) : '0.0';
            const era = ps.inningsPitched > 0 ? ((ps.earnedRuns || 0) / (ps.inningsPitched / 3) * 9).toFixed(2) : '-';
            return <span className="text-gray-300">{ps.wins||0}勝{ps.losses||0}敗 防<span className="text-orange-300">{era}</span></span>;
          })() : (() => {
            const bs = player.seasonStats?.batting;
            if (!bs || !bs.atBats) return <span className="text-gray-600">-</span>;
            const avg = (bs.hits / bs.atBats).toFixed(3);
            return <span className="text-gray-300"><span className="text-blue-300">{avg}</span> {bs.homeruns||0}本 {bs.rbis||0}点</span>;
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
              <p className="text-sm text-gray-300 mb-2">1-8番: 野手を配置 / 9番: 投手 / タップ2回で打順入替</p>
              <div className="space-y-2">
                {[1,2,3,4,5,6,7,8,9].map(order => {
                  const entry = lineup.find(e => e.battingOrder === order);
                  const player = entry ? team.players.find(p => p.id === entry.playerId) : null;
                  const isSelected = selectedBattingOrder === order;
                  const isPitcherSlot = entry?.position === 'pitcher';
                  const isSwapSource = swapSource === order;
                  const isSwapTarget = swapSource !== null && swapSource !== order;

                  const handleSlotClick = () => {
                    if (swapSource !== null) {
                      // 入れ替え実行
                      if (swapSource !== order) {
                        handleSwapBattingOrder(swapSource, order);
                      }
                      setSwapSource(null);
                    } else if (entry) {
                      // 選手がいる枠をタップ → 入れ替えソースにする
                      setSwapSource(order);
                    } else {
                      // 空枠をタップ → 追加モード
                      setSelectedBattingOrder(order);
                    }
                  };

                  return (
                    <div key={order} onClick={handleSlotClick} className={`rounded p-3 cursor-pointer transition ${
                      isSwapSource ? 'bg-blue-700 ring-2 ring-blue-400' :
                      isSwapTarget ? 'bg-gray-700 ring-1 ring-blue-400/50 hover:bg-blue-800' :
                      isSelected ? 'bg-blue-700 ring-2 ring-blue-400' :
                      player ? (isPitcherSlot ? 'bg-indigo-800 hover:bg-indigo-700' : 'bg-gray-700 hover:bg-gray-600') :
                      'bg-gray-900 hover:bg-gray-800 border border-dashed border-gray-600'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`font-bold text-lg w-6 ${isSwapSource ? 'text-blue-300' : isSelected ? 'text-blue-300' : 'text-white'}`}>{order}</div>
                        {isPitcherSlot ? (
                          <div className="flex-1 flex items-center justify-between">
                            <div>
                              <span className="text-indigo-300 font-bold">投手</span>
                              <span className="text-xs text-gray-400 ml-2">（試合時に先発投手が打席に立つ）</span>
                            </div>
                          </div>
                        ) : player ? (
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-white font-bold whitespace-nowrap">{player.name}</span>
                                  <span className="text-[10px] text-gray-300 whitespace-nowrap">{player.physical?.throws === 'left' ? '左投' : '右投'}{player.batting?.bats === 'left' ? '左打' : player.batting?.bats === 'switch' ? '両打' : '右打'}</span>
                                  {/* 体力・疲労バー */}
                                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[8px] text-gray-400 shrink-0">体</span>
                                      <div className="flex-1 h-1.5 bg-gray-600 rounded-full overflow-hidden min-w-0">
                                        <div className="h-full bg-green-500 rounded-full" style={{width:`${player.physical?.bodyStamina || 50}%`}} />
                                      </div>
                                      <span className="text-[8px] text-gray-300 shrink-0">{player.physical?.bodyStamina || 50}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[8px] text-gray-400 shrink-0">疲</span>
                                      <div className="flex-1 h-1.5 bg-gray-600 rounded-full overflow-hidden min-w-0">
                                        <div className="h-full bg-red-500 rounded-full" style={{width:`${Math.min(player.fatigue || 0, 100)}%`}} />
                                      </div>
                                      <span className="text-[8px] text-gray-300 shrink-0">{player.fatigue || 0}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-xs text-gray-300 flex items-center gap-2">
                                  <select value={entry.position} onChange={(e) => { e.stopPropagation(); handleChangePosition(order, e.target.value); }} className="bg-gray-600 text-white rounded px-2 py-0.5 text-xs" onClick={(e) => e.stopPropagation()}>
                                    <option value="pitcher">投手</option><option value="catcher">捕手</option><option value="first">一塁</option><option value="second">二塁</option><option value="third">三塁</option><option value="short">遊撃</option><option value="left">左翼</option><option value="center">中堅</option><option value="right">右翼</option>
                                  </select>
                                  {(() => {
                                    const subs = getSubPositions(player, entry.position);
                                    if (subs.length === 0) return null;
                                    return <span className="font-bold">{POSITION_NAMES[entry.position]}{subs.map((s, i) => <span key={i} className={s.color}>{s.label}</span>)}</span>;
                                  })()}
                                  <span>| {player.age}歳 回復{player.physical?.recovery || 50}</span>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={(e) => { e.stopPropagation(); handleRemoveFromLineup(player.id); }} className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs">外す</button>
                              </div>
                            </div>
                            <div className="text-xs mt-1 flex gap-2">
                              {[{label:'ミ',value:player.batting?.meet||0},{label:'パ',value:player.batting?.power||0},{label:'走',value:player.physical?.speed||0},{label:'肩',value:player.physical?.arm||0},{label:'守',value:player.fielding?.defense||0}].map(stat => {
                                const rank = getAbilityRank(stat.value);
                                return <span key={stat.label} className={getRankColor(rank)}>{stat.label}{stat.value}</span>;
                              })}
                            </div>
                            {(() => {
                              const bs = player.seasonStats?.batting;
                              if (!bs || !bs.atBats) return null;
                              const avg = bs.atBats > 0 ? (bs.hits / bs.atBats).toFixed(3) : '.000';
                              return (
                                <div className="text-[10px] mt-0.5 text-gray-200">
                                  打率<span className="text-blue-300 font-bold ml-0.5">{avg}</span>
                                  <span className="ml-1.5">{bs.homeruns || 0}本</span>
                                  <span className="ml-1.5">{bs.rbis || 0}打点</span>
                                  <span className="ml-1.5">{bs.hits || 0}安</span>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <div className="text-gray-400 italic">未設定（クリックして選手を追加）</div>
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
                {swapSource !== null
                  ? <span className="text-blue-400 text-sm ml-2">→ {swapSource}番と入れ替え</span>
                  : selectedBattingOrder && <span className="text-blue-400 text-sm ml-2">→ {selectedBattingOrder}番に追加</span>
                }
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
                      <SortHeader label="体" sortKey="bodyStamina" className="text-center" />
                      <SortHeader label="回" sortKey="recovery" className="text-center" />
                      <SortHeader label="疲" sortKey="fatigue" className="text-center" />
                      <SortHeader label="球速" sortKey="velocity" className="text-center" />
                      <SortHeader label="制球" sortKey="control" className="text-center" />
                      <SortHeader label="スタ" sortKey="stamina" className="text-center" />
                      <th className="py-1 px-1 text-center text-xs text-gray-400">成績</th>
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
          const starterPitchers = allPlayers.filter(p => ['complete', 'short', 'quality', 'auto_s'].includes(getPitcherRole(p.id)));
          // rotation.starters の順序でソート（ローテ順）
          const starterOrder = team.pitchingRotation.starters || [];
          starterPitchers.sort((a, b) => {
            const ia = starterOrder.indexOf(a.id);
            const ib = starterOrder.indexOf(b.id);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
          });

          // 先発ローテ順入れ替え（starterPitchers配列のインデックスからstarters配列内の位置を特定）
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
          const reliefPitchers = allPlayers.filter(p => ['long', 'onepoint', 'ace_relief', 'mopup', 'behind', 'auto_r', 'setup', 'closer'].includes(getPitcherRole(p.id)));
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
          const PitcherRow = ({ player, index, showConvert, showReorder, totalCount }) => {
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
                    <span className={`font-bold text-sm truncate ${player.position === 'pitcher' ? 'text-white' : 'text-cyan-300'}`}>{player.name} <span className={`text-[10px] ${CONDITION_COLORS[player.condition ?? CONDITION_LEVELS.NORMAL]}`}>{CONDITION_ICONS[player.condition ?? CONDITION_LEVELS.NORMAL]}</span></span>
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
                    {showReorder && (
                      <>
                        <button
                          onClick={() => handleSwapStarter(index, -1)}
                          disabled={index === 0}
                          className={`px-2 py-0.5 rounded text-xs font-bold ${index === 0 ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-500 hover:bg-gray-400 text-white'}`}
                        >↑</button>
                        <button
                          onClick={() => handleSwapStarter(index, 1)}
                          disabled={index === totalCount - 1}
                          className={`px-2 py-0.5 rounded text-xs font-bold ${index === totalCount - 1 ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-500 hover:bg-gray-400 text-white'}`}
                        >↓</button>
                      </>
                    )}
                    <span className={`${roleInfo.color} text-white px-2 py-0.5 rounded text-xs font-bold`}>{roleInfo.label}</span>
                    <select
                      value={role}
                      onChange={(e) => handleSetPitcherRole(player.id, e.target.value)}
                      className="bg-gray-600 text-white rounded px-1 py-0.5 text-xs cursor-pointer"
                    >
                      <optgroup label="先発">
                        <option value="auto_s">おまかせ</option>
                        <option value="complete">完投型</option>
                        <option value="short">ショートスターター</option>
                        <option value="quality">勝ち権利</option>
                      </optgroup>
                      <optgroup label="リリーフ">
                        <option value="auto_r">おまかせ</option>
                        <option value="long">ロングリリーフ</option>
                        <option value="mopup">敗戦処理</option>
                        <option value="behind">ビハインド</option>
                        <option value="onepoint">ワンポイント</option>
                        <option value="setup">セットアッパー</option>
                        <option value="closer">守護神</option>
                      </optgroup>
                      <option value="none">未設定</option>
                    </select>
                  </div>
                </div>
                <div className="text-xs text-gray-300 text-right mt-0.5">
                  {role === 'complete' && '完投を目指して長いイニングを投げる'}
                  {role === 'short' && '3-4回で降板し中継ぎに繋ぐ'}
                  {role === 'quality' && '6回・勝ち権利まで投げて降板'}
                  {role === 'auto_s' && '能力に応じて自動で投球回数を調整'}
                  {role === 'long' && '先発降板後に長いイニングをカバー'}
                  {role === 'mopup' && '大差ビハインド時に登板しスタミナ温存'}
                  {role === 'behind' && 'ビハインド時にイニングを繋ぐ'}
                  {role === 'onepoint' && '特定の打者1人に対して登板'}
                  {role === 'ace_relief' && '中継ぎの柱として僅差で登板'}
                  {role === 'setup' && '7-8回の僅差で守護神に繋ぐ'}
                  {role === 'closer' && '9回・リード時に試合を締める'}
                  {role === 'auto_r' && '状況に応じて自動で登板場面を判断'}
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
                {(() => {
                  const ps = player.seasonStats?.pitching;
                  const bs = player.seasonStats?.batting;
                  if (!ps?.games && !bs?.atBats) return null;
                  return (
                    <div className="flex items-center gap-1 text-[11px] mt-1 flex-wrap">
                      {ps?.games > 0 && (() => {
                        const ip = ps.inningsPitched ? (ps.inningsPitched / 3).toFixed(1) : '0.0';
                        const era = ps.inningsPitched > 0 ? ((ps.earnedRuns || 0) / (ps.inningsPitched / 3) * 9).toFixed(2) : '-';
                        const whip = ps.inningsPitched > 0 ? (((ps.walks || 0) + (ps.hits || 0)) / (ps.inningsPitched / 3)).toFixed(2) : '-';
                        return <>
                          <span className="text-gray-500">Season:</span>
                          <span className="text-white">{ps.wins||0}勝{ps.losses||0}敗</span>
                          {(ps.saves > 0) && <span className="text-white">{ps.saves}S</span>}
                          {(ps.holds > 0) && <span className="text-white">{ps.holds}H</span>}
                          <span className="text-orange-300">防{era}</span>
                          <span className="text-gray-400">{ip}回</span>
                          <span className="text-gray-400">WHIP{whip}</span>
                          <span className="text-gray-400">{ps.games}試合</span>
                        </>;
                      })()}
                      {bs?.atBats > 0 && <>
                        <span className="text-gray-600 mx-1">│</span>
                        <span className="text-blue-300">打率{(bs.hits / bs.atBats).toFixed(3)}</span>
                        {bs.homeruns > 0 && <span className="text-gray-300">{bs.homeruns}本</span>}
                      </>}
                    </div>
                  );
                })()}
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
                      <PitcherRow key={player.id} player={player} index={idx} showConvert showReorder totalCount={starterPitchers.length} />
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
                <svg viewBox="0 0 500 440" className="w-full max-w-2xl mx-auto">
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
                    {/* 芝のパターン */}
                    <pattern id="grassPattern" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                      <rect width="8" height="8" fill="#1f5c33" />
                      <line x1="0" y1="4" x2="8" y2="4" stroke="#1a522d" strokeWidth="0.5" opacity="0.3" />
                    </pattern>
                  </defs>

                  {/* グラウンド背景（リッチ版） */}
                  <rect x="0" y="0" width="500" height="440" fill="#142e1e" rx="12" />
                  <ellipse cx="250" cy="210" rx="230" ry="190" fill="url(#grassPattern)" />
                  {/* 外野の芝模様（同心弧） */}
                  {[140, 170, 200].map(r => (
                    <ellipse key={r} cx="250" cy="370" rx={r} ry={r} fill="none" stroke="#1a4a2c" strokeWidth="16" opacity="0.25" />
                  ))}
                  {/* 内野ダイヤモンド */}
                  <polygon points="250,190 340,260 250,330 160,260" fill="#8B6914" opacity="0.3" />
                  <polygon points="250,145 370,260 250,375 130,260" fill="none" stroke="#c4a35a" strokeWidth="1.5" strokeDasharray="6,3" opacity="0.45" />
                  {/* ファウルライン */}
                  <line x1="250" y1="370" x2="60" y2="200" stroke="#fff" strokeWidth="1.2" opacity="0.3" />
                  <line x1="250" y1="370" x2="440" y2="200" stroke="#fff" strokeWidth="1.2" opacity="0.3" />
                  {/* ベース */}
                  <rect x="244" y="364" width="12" height="12" fill="#fff" transform="rotate(45,250,370)" opacity="0.9" />
                  <rect x="364" y="254" width="10" height="10" fill="#fff" transform="rotate(45,369,259)" opacity="0.8" />
                  <rect x="245" y="179" width="10" height="10" fill="#fff" transform="rotate(45,250,184)" opacity="0.8" />
                  <rect x="125" y="254" width="10" height="10" fill="#fff" transform="rotate(45,130,259)" opacity="0.8" />
                  {/* マウンド */}
                  <ellipse cx="250" cy="275" rx="12" ry="8" fill="#8B6914" opacity="0.4" />

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
                          fill="white" fontSize={markerSize > 17 ? '13' : '11'} fontWeight="bold">{posLabels[pos]}</text>

                        {player && (
                          <>
                            {/* 選手名（影付き） */}
                            <text x={coord.x} y={coord.y - markerSize - 14} textAnchor="middle"
                              fill="#000" fontSize="11" fontWeight="bold" opacity="0.4">{player.name}</text>
                            <text x={coord.x} y={coord.y - markerSize - 15} textAnchor="middle"
                              fill="white" fontSize="11" fontWeight="bold">{player.name}</text>

                            {/* グレードバッジ */}
                            <circle cx={coord.x + markerSize + 2} cy={coord.y - markerSize + 2}
                              r="8" fill="#111827" stroke={grade.color === 'text-pink-400' ? '#ec4899' : grade.color === 'text-red-400' ? '#f87171' : grade.color === 'text-orange-400' ? '#fb923c' : grade.color === 'text-yellow-400' ? '#facc15' : grade.color === 'text-green-400' ? '#4ade80' : '#60a5fa'}
                              strokeWidth="1.5" />
                            <text x={coord.x + markerSize + 2} y={coord.y - markerSize + 3}
                              textAnchor="middle" dominantBaseline="middle"
                              fill={grade.color === 'text-pink-400' ? '#ec4899' : grade.color === 'text-red-400' ? '#f87171' : grade.color === 'text-orange-400' ? '#fb923c' : grade.color === 'text-yellow-400' ? '#facc15' : grade.color === 'text-green-400' ? '#4ade80' : '#60a5fa'}
                              fontSize="9" fontWeight="bold">{grade.label}</text>

                            {/* 適正バー（強化版） */}
                            <rect x={coord.x - 20} y={coord.y + markerSize + 6} width="40" height="5" rx="2.5" fill="#1f2937" stroke="#374151" strokeWidth="0.5" />
                            <rect x={coord.x - 20} y={coord.y + markerSize + 6} width={40 * fitness / 100} height="5" rx="2.5" fill={grad.main} opacity="0.85">
                              <animate attributeName="width" from="0" to={40 * fitness / 100} dur="0.6s" begin={animDelay} fill="freeze"
                                calcMode="spline" keySplines="0.25 0.46 0.45 0.94" />
                            </rect>
                            <text x={coord.x} y={coord.y + markerSize + 20} textAnchor="middle"
                              fill={grad.main} fontSize="8" fontWeight="bold" opacity="0.9">
                              適正{fitness}%
                            </text>

                            {/* 守力・走力の小アイコン */}
                            <text x={coord.x - 14} y={coord.y + markerSize + 29} textAnchor="middle"
                              fill="#9ca3af" fontSize="7">守{def}</text>
                            <text x={coord.x + 14} y={coord.y + markerSize + 29} textAnchor="middle"
                              fill="#9ca3af" fontSize="7">走{spd}</text>
                          </>
                        )}
                        {!player && (
                          <text x={coord.x} y={coord.y - 22} textAnchor="middle" fill="#4a5568" fontSize="10">未配置</text>
                        )}
                      </g>
                    );
                  })}

                  {/* 凡例 */}
                  <g transform="translate(10, 405)">
                    <text x="0" y="0" fill="#9ca3af" fontSize="8">適正:</text>
                    {[
                      { label: '100', color: '#ff1493' }, { label: '90', color: '#ec4899' }, { label: '80', color: '#f87171' },
                      { label: '70', color: '#f97316' }, { label: '60', color: '#fbbf24' }, { label: '50', color: '#eab308' },
                      { label: '40', color: '#84cc16' }, { label: '30', color: '#22c55e' }, { label: '20', color: '#06b6d4' },
                      { label: '10', color: '#3b82f6' }, { label: '0', color: '#6366f1' }
                    ].map((item, i) => (
                      <g key={i} transform={`translate(${30 + i * 38}, 0)`}>
                        <circle cx="0" cy="-3" r="4" fill={item.color} opacity="0.7" />
                        <text x="7" y="0" fill="#9ca3af" fontSize="6">{item.label}</text>
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
