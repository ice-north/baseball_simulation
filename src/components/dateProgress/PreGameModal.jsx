import React, { useState } from 'react';
import { TEAMS_DATA } from '../../teams-data.js';
import { getScheduleByDate } from '../../season/scheduleGenerator.js';
import { CONDITION_LEVELS, CONDITION_COLORS, CONDITION_ICONS } from '../../game/condition.js';
import { POSITION_NAMES, getAbilityColor } from '../../utils/constants.js';
import { getPitchTypeName } from '../../season/yearProgressionSystem.js';
import { AbilityRadar, teamRadarAxes } from '../AbilityRadar.jsx';
import { overallRating } from '../AbilityValue.jsx';

const PreGameModal = ({ seasonData, userTeamName, formatDate, getStartingPitcher, handleGameChoice, setShowGameChoiceModal, tournamentInfo }) => {
  const [swapTarget, setSwapTarget] = useState(null);
  const [selectedBench, setSelectedBench] = useState(null);
  const [, setTick] = useState(0);
  const [benchFilter, setBenchFilter] = useState('fielder');

  const isTournament = !!tournamentInfo;
  let opponentName, isHome;
  if (isTournament) {
    opponentName = tournamentInfo.opponentName;
    isHome = true;
  } else {
    const todayGames = getScheduleByDate(seasonData.schedule, seasonData.currentDate);
    const userGame = todayGames.find(g => !g.result && (g.home === userTeamName || g.away === userTeamName));
    opponentName = userGame ? (userGame.home === userTeamName ? userGame.away : userGame.home) : '';
    isHome = userGame ? userGame.home === userTeamName : true;
  }
  const userTeam = TEAMS_DATA[userTeamName];
  const opponentTeam = TEAMS_DATA[opponentName];
  const FORM_LABELS = { overhand: 'オーバー', threeQuarter: 'スリークォーター', sidearm: 'サイド', submarine: 'アンダー' };
  const isPitcherPlayer = (p) => p.position === 'pitcher';

  const getStarters = (team, teamName) => {
    if (!team?.players) return [];
    const settings = team.lineupSettings;
    if (settings?.battingOrder?.length > 0) {
      // ローテーションから先発投手を取得
      const rotationStarter = getStartingPitcher(teamName);
      const starters = settings.battingOrder
        .sort((a, b) => a.battingOrder - b.battingOrder)
        .map(entry => {
          // 投手枠（battingOrder 9, position pitcher）はローテ投手で上書き
          if (entry.position === 'pitcher' && rotationStarter) {
            return { ...rotationStarter, _position: 'pitcher', _battingOrder: entry.battingOrder };
          }
          const player = team.players.find(p => p.id === entry.playerId && p.isActive !== false);
          return player ? { ...player, _position: entry.position, _battingOrder: entry.battingOrder } : null;
        })
        .filter(Boolean);
      return starters;
    }
    return team.players
      .filter(p => p.battingOrder > 0 && p.battingOrder <= 9 && p.isActive !== false)
      .sort((a, b) => a.battingOrder - b.battingOrder);
  };

  const userStarters = getStarters(userTeam, userTeamName);
  const lineup = userTeam?.lineupSettings?.battingOrder || [];
  const starterIds = new Set(lineup.map(e => e.playerId));
  const currentStarter = getStartingPitcher(userTeamName);
  if (currentStarter) starterIds.add(currentStarter.id);

  const benchFielders = (userTeam?.players || []).filter(p => !starterIds.has(p.id) && !isPitcherPlayer(p) && p.isActive !== false);
  const rotation = userTeam?.pitchingRotation;
  const rotationStarters = (rotation?.starters || []).map(id => userTeam?.players?.find(p => p.id === id)).filter(p => p && p.isActive !== false);
  const benchPitchers = (userTeam?.players || []).filter(p => isPitcherPlayer(p) && !starterIds.has(p.id) && p.isActive !== false);
  const opponentStarter = getStartingPitcher(opponentName);
  const opponentStarters = getStarters(opponentTeam, opponentName);

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

  const handleSwap = (order) => {
    if (selectedBench !== null) {
      // 控え先選択済み → このスタメン枠と交代
      handleSubstitute(selectedBench, order);
      setSelectedBench(null);
      return;
    }
    if (swapTarget === null) {
      setSwapTarget(order);
    } else if (swapTarget === order) {
      setSwapTarget(null);
    } else {
      const entry1 = lineup.find(e => e.battingOrder === swapTarget);
      const entry2 = lineup.find(e => e.battingOrder === order);
      if (entry1 && entry2) {
        entry1.battingOrder = order;
        entry2.battingOrder = swapTarget;
        lineup.sort((a, b) => a.battingOrder - b.battingOrder);
      }
      setSwapTarget(null);
      setTick(t => t + 1);
    }
  };

  const handleSubstitute = (benchPlayerId, starterOrder) => {
    const starterEntry = lineup.find(e => e.battingOrder === starterOrder);
    if (starterEntry && starterEntry.position !== 'pitcher') {
      if (userTeam.players.find(p => p.id === benchPlayerId)) {
        starterEntry.playerId = benchPlayerId;
        setSwapTarget(null);
        setTick(t => t + 1);
      }
    }
  };

  const handleSelectStarter = (pitcherId) => {
    if (!rotation || !userTeam) return;
    const idx = rotation.starters.indexOf(pitcherId);
    if (idx >= 0) {
      rotation.currentStarterIndex = idx;
      rotation._userSelectedStarter = true;
      setTick(t => t + 1);
    }
  };

  const FatigueBar = ({ fatigue, width = 28 }) => {
    const f = fatigue || 0;
    const ratio = Math.min(1, f / 150);
    const barW = Math.round(ratio * width);
    const barColor = f >= 100 ? 'bg-red-500' : f >= 80 ? 'bg-orange-400' : f >= 60 ? 'bg-yellow-400' : f >= 40 ? 'bg-green-400' : 'bg-green-600';
    return (
      <span className="shrink-0 flex items-center gap-0.5" title={`疲労: ${f}`}>
        <span className="relative bg-gray-700 rounded-sm overflow-hidden" style={{ width, height: 5 }}>
          <span className={`absolute left-0 top-0 h-full rounded-sm ${barColor}`} style={{ width: barW }} />
        </span>
        {f >= 100 && <span className="text-xs text-red-400">⚠</span>}
      </span>
    );
  };

  const PosBadge = ({ pos }) => (
    <span className={`text-xs px-1 py-0.5 rounded shrink-0 w-7 text-center ${
      pos === 'pitcher' ? 'bg-red-800 text-red-200' :
      pos === 'catcher' ? 'bg-blue-800 text-blue-200' :
      ['left','center','right'].includes(pos) ? 'bg-green-800 text-green-200' :
      pos === 'dh' ? 'bg-purple-800 text-purple-200' :
      'bg-yellow-800 text-yellow-200'
    }`}>{POSITION_NAMES[pos] || pos}</span>
  );

  const BatsLabel = ({ bats }) => {
    const label = bats === 'left' ? '左' : bats === 'switch' ? '両' : '右';
    const color = bats === 'left' ? 'text-blue-400' : bats === 'switch' ? 'text-purple-400' : 'text-gray-400';
    return <span className={`text-xs ${color} shrink-0 w-3`}>{label}</span>;
  };

  const BattingStats = ({ player }) => {
    const bs = player.seasonStats?.batting;
    if (!bs || !bs.atBats) return <span className="text-gray-400 text-xs">-</span>;
    const avg = (bs.hits / bs.atBats).toFixed(3);
    return (
      <span className="text-xs text-gray-300 font-mono tabular-nums">
        <span className="text-blue-300 inline-block w-9 text-right">{avg}</span>
        <span className="inline-block w-7 text-right">{bs.homeruns || 0}本</span>
        <span className="inline-block w-7 text-right">{bs.rbis || 0}点</span>
      </span>
    );
  };

  const renderPlayerRow = (player, i, { isUser = false } = {}) => {
    const order = player._battingOrder || (i + 1);
    const pos = player._position || player.position;
    const cond = player.condition ?? CONDITION_LEVELS.NORMAL;
    const isSelected = isUser && swapTarget === order && selectedBench === null;
    const isSwapCandidate = isUser && pos !== 'pitcher' && (
      (swapTarget !== null && swapTarget !== order) || selectedBench !== null
    );
    return (
      <div key={player.id}
        onClick={() => isUser && pos !== 'pitcher' && handleSwap(order)}
        className={`flex items-center gap-1 rounded px-1.5 py-1 transition-all ${
          !isUser ? 'bg-gray-800/60' :
          pos === 'pitcher' ? 'bg-gray-800/50 cursor-default' :
          isSelected ? 'bg-blue-900 ring-1 ring-blue-400 cursor-pointer' :
          isSwapCandidate ? 'bg-surface-2 hover:bg-blue-900/50 ring-1 ring-blue-800/50 cursor-pointer' :
          'bg-surface-2 hover:bg-gray-700 cursor-pointer'
        }`}
      >
        <span className={`w-4 text-center font-mono shrink-0 text-xs ${isSwapCandidate ? 'text-blue-400' : 'text-gray-400'}`}>{order}</span>
        <PosBadge pos={pos} />
        <span className="font-bold text-white truncate shrink-0 text-xs" style={{width:'4rem'}}>{player.name}</span>
        <span className="text-xs text-gray-400 shrink-0 w-4 text-right">{player.age || ''}</span>
        <span className={`shrink-0 text-xs ${CONDITION_COLORS[cond]}`}>{CONDITION_ICONS[cond]}</span>
        <BatsLabel bats={player.batting?.bats || 'right'} />
        {pos !== 'pitcher' && <FatigueBar fatigue={player.fatigue} />}
        {isUser && pos !== 'pitcher' && (() => {
          const subs = getSubPositions(player, pos);
          return subs.length > 0 ? <span className="text-xs shrink-0">{subs.map((s, j) => <span key={j} className={s.color}>{s.label}</span>)}</span> : null;
        })()}
        <span className="flex-1" />
        {pos === 'pitcher' ? (
          <span className="text-xs text-gray-300 font-mono">{player.pitching?.velocity || 0}<span className="text-gray-400">km</span></span>
        ) : <BattingStats player={player} />}
        {isUser && isSelected && pos !== 'pitcher' && (
          <button onClick={(e) => { e.stopPropagation(); }} className="btn-warn shrink-0 px-1 py-0.5 text-xs rounded ml-0.5">交代</button>
        )}
      </div>
    );
  };

  const renderBenchPlayer = (player) => {
    const isSelectedBench = selectedBench === player.id;
    const canSwap = swapTarget !== null;
    const handleBenchClick = () => {
      if (canSwap) {
        handleSubstitute(player.id, swapTarget);
      } else if (isSelectedBench) {
        setSelectedBench(null);
      } else {
        setSelectedBench(player.id);
        setSwapTarget(null);
      }
    };
    return (
    <div key={player.id}
      onClick={handleBenchClick}
      className={`flex items-center gap-1 rounded px-1.5 py-1 transition-all cursor-pointer ${
        isSelectedBench ? 'bg-blue-900 ring-1 ring-blue-400' :
        canSwap ? 'bg-surface-2 hover:bg-blue-900 ring-1 ring-blue-800/50' :
        'bg-gray-800/60 hover:bg-gray-700'
      }`}
    >
      <PosBadge pos={player.position} />
      <span className="font-bold text-white shrink-0 truncate text-xs" style={{width:'4rem'}}>{player.name}</span>
      <span className="text-xs text-gray-400 shrink-0 w-4 text-right">{player.age || ''}</span>
      <span className={`shrink-0 text-xs ${CONDITION_COLORS[player.condition ?? CONDITION_LEVELS.NORMAL]}`}>
        {CONDITION_ICONS[player.condition ?? CONDITION_LEVELS.NORMAL]}
      </span>
      <BatsLabel bats={player.batting?.bats || 'right'} />
      <FatigueBar fatigue={player.fatigue} width={24} />
      {(() => {
        const subs = getSubPositions(player, player.position);
        return subs.length > 0 ? <span className="text-xs">{subs.map((s, j) => <span key={j} className={s.color}>{s.label}</span>)}</span> : null;
      })()}
      <span className="flex-1" />
      <BattingStats player={player} />
    </div>
  );
  };

  const renderPitcherRow = (pitcher, { showRole = false, teamRotation = null } = {}) => {
    const role = teamRotation?.pitcherRoles?.[pitcher.id];
    const roleLabel = { closer: '守護神', setup: 'セット', ace_relief: '中エース', long: 'ロング', onepoint: 'ワンポ', behind: 'ビハ', mopup: '敗処' };
    const ps = pitcher.seasonStats?.pitching;
    const era = ps?.inningsPitched > 0 ? ((ps.earnedRuns || 0) / (ps.inningsPitched / 3) * 9).toFixed(2) : null;
    return (
      <div key={pitcher.id} className="flex items-center gap-1 rounded px-1.5 py-0.5 bg-gray-800/40 text-xs">
        <span className={`px-1 py-0.5 rounded font-bold ${pitcher.physical?.throws === 'left' ? 'bg-blue-600/80 text-white' : 'bg-orange-600/80 text-white'}`}>
          {pitcher.physical?.throws === 'left' ? '左' : '右'}
        </span>
        <span className="text-white truncate font-bold" style={{maxWidth:'3.5rem'}}>{pitcher.name}</span>
        {showRole && role && <span className="text-xs px-0.5 rounded bg-gray-700 text-gray-300">{roleLabel[role] || role}</span>}
        <FatigueBar fatigue={pitcher.fatigue} width={20} />
        <span className="text-gray-300">{pitcher.pitching?.velocity || 0}<span className="text-gray-400">km</span></span>
        <span className="flex-1" />
        {era && <span className="text-gray-400">{era} {ps.wins||0}勝{ps.losses||0}敗{(ps.saves||0) > 0 ? ` ${ps.saves}S` : ''}</span>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center overflow-y-auto">
      <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl p-4 max-w-5xl w-full mx-4 shadow-2xl border border-gray-600/50 my-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-white">{formatDate(seasonData.currentDate)} の試合</h2>
            {isTournament && tournamentInfo.title && (
              <div className={`text-sm font-bold ${tournamentInfo.titleColor || 'text-yellow-400'}`}>{tournamentInfo.title}{tournamentInfo.subtitle ? ` - ${tournamentInfo.subtitle}` : ''}</div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className={`font-bold ${isHome ? 'text-blue-400' : 'text-red-400'}`}>{isHome ? '🏠' : '✈️'} {userTeamName}</span>
            <span className="text-xl text-gray-400 font-bold">VS</span>
            <span className={`font-bold ${!isHome ? 'text-blue-400' : 'text-red-400'}`}>{!isHome ? '🏠' : '✈️'} {opponentName}</span>
          </div>
          <button onClick={() => setShowGameChoiceModal(false)} className="text-gray-400 hover:text-white text-lg px-2">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* === 左カラム: 自チーム === */}
          <div className="space-y-2">
            {/* 先発投手選択 */}
            <div className="bg-surface-1 rounded-lg p-2.5 border border-gray-700">
              <h3 className="text-xs font-bold text-gray-300 mb-1.5">先発投手選択</h3>
              <div className="space-y-0.5">
                {rotationStarters.map(pitcher => {
                  const isSelected = pitcher.id === currentStarter?.id;
                  const f = pitcher.fatigue || 0;
                  const tooTired = f >= 80;
                  const ps = pitcher.seasonStats?.pitching;
                  const era = ps?.inningsPitched > 0 ? ((ps.earnedRuns || 0) / (ps.inningsPitched / 3) * 9).toFixed(2) : null;
                  return (
                    <div key={pitcher.id} onClick={() => !tooTired && handleSelectStarter(pitcher.id)}
                      className={`flex items-center gap-1.5 rounded px-2 py-1 transition-all text-xs ${
                        isSelected ? 'bg-red-900/60 ring-1 ring-red-400' :
                        tooTired ? 'bg-gray-800/30 opacity-50 cursor-not-allowed' :
                        'bg-surface-2 hover:bg-red-900/30 cursor-pointer'
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full border-2 shrink-0 ${isSelected ? 'border-red-400 bg-red-400' : 'border-gray-600'}`} />
                      <span className={`text-xs px-1 py-0.5 rounded font-bold ${pitcher.physical?.throws === 'left' ? 'bg-blue-600 text-white' : 'bg-orange-600 text-white'}`}>
                        {pitcher.physical?.throws === 'left' ? '左' : '右'}
                      </span>
                      <span className="text-white font-bold truncate" style={{maxWidth:'4rem'}}>{pitcher.name}</span>
                      <span className="text-xs text-gray-400">{pitcher.age}</span>
                      <FatigueBar fatigue={f} width={24} />
                      <span className="text-xs text-gray-300">{pitcher.pitching?.velocity || 0}<span className="text-gray-400">km</span></span>
                      <span className="text-xs text-gray-300">制<span className="text-blue-300">{pitcher.pitching?.control || 0}</span></span>
                      {era && <span className="text-xs text-gray-400 ml-auto">{era} {ps.wins||0}勝{ps.losses||0}敗</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* スタメン */}
            <div className="bg-surface-1 rounded-lg p-2.5">
              <h3 className="text-xs font-bold text-gray-300 mb-1">スタメン
                <span className="text-gray-400 font-normal ml-1">
                  {selectedBench !== null ? '（交代先をタップ）' : swapTarget !== null ? '（入替先をタップ）' : '（タップで打順入替）'}
                </span>
              </h3>
              <div className="space-y-0.5">{userStarters.map((p, i) => renderPlayerRow(p, i, { isUser: true }))}</div>
            </div>

            {/* 控え */}
            <div className="bg-surface-1 rounded-lg p-2.5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-bold text-gray-300">
                  控え{swapTarget !== null
                    ? <span className="text-blue-400 ml-1">→ {swapTarget}番と交代</span>
                    : selectedBench !== null
                    ? <span className="text-blue-400 ml-1">（スタメンをタップして交代）</span>
                    : null}
                </h3>
                <div className="flex gap-1">
                  <button onClick={() => setBenchFilter('fielder')}
                    className={`text-xs px-1.5 py-0.5 rounded ${benchFilter === 'fielder' ? 'seg-on' : 'seg'}`}>野手</button>
                  <button onClick={() => setBenchFilter('pitcher')}
                    className={`text-xs px-1.5 py-0.5 rounded ${benchFilter === 'pitcher' ? 'seg-on' : 'seg'}`}>投手</button>
                </div>
              </div>
              <div className="space-y-0.5 text-xs">
                {benchFilter === 'fielder' ? (
                  benchFielders.length === 0 ? <div className="text-gray-400 text-center py-1">控え野手なし</div> :
                  benchFielders.map(p => renderBenchPlayer(p))
                ) : (
                  benchPitchers.length === 0 ? <div className="text-gray-400 text-center py-1">控え投手なし</div> :
                  benchPitchers.map(p => renderPitcherRow(p, { showRole: true, teamRotation: rotation }))
                )}
              </div>
            </div>
          </div>

          {/* === 右カラム: 相手チーム === */}
          <div className="space-y-2">
            {/* スカウトレポート: 相手戦力レーダー＋成績＋警戒打者 */}
            {opponentTeam && (() => {
              const st = (seasonData.standings || []).find(s => s.team === opponentName);
              const w = st?.wins ?? 0, l = st?.losses ?? 0, dr = st?.draws ?? 0;
              const wr = st ? (st.winRate ?? (w + l > 0 ? w / (w + l) : 0)) : null;
              // 最警戒打者: スタメンから総合力最大
              let keyHitter = null, keyRating = -1;
              for (const p of opponentStarters) {
                if (p.position === 'pitcher') continue;
                const r = overallRating(p) ?? 0;
                if (r > keyRating) { keyRating = r; keyHitter = p; }
              }
              return (
                <div className="bg-surface-1 rounded-lg p-2.5 border border-cyan-800/40">
                  <h3 className="text-xs font-bold text-cyan-300 mb-1">スカウトレポート — {opponentName}</h3>
                  <div className="flex items-center gap-3">
                    <AbilityRadar axes={teamRadarAxes(opponentTeam)} size={150} />
                    <div className="text-xs text-gray-300 space-y-1.5 flex-1">
                      {st && (
                        <div>
                          <span className="text-gray-300">今季成績 </span>
                          <span className="text-white font-bold tabular-nums">{w}勝{l}敗{dr > 0 ? `${dr}分` : ''}</span>
                          {wr != null && <span className="text-gray-300 ml-1">（{wr.toFixed(3)}）</span>}
                        </div>
                      )}
                      {keyHitter && (
                        <div>
                          <span className="text-gray-300">警戒打者 </span>
                          <span className="text-red-300 font-bold">{keyHitter.name}</span>
                          <span className="text-gray-300 ml-1 tabular-nums">ミ{keyHitter.batting?.meet || 0}/パ{keyHitter.batting?.power || 0}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
            {/* 相手先発投手 */}
            <div className="bg-surface-1 rounded-lg p-2.5 border border-gray-700">
              <h3 className="text-xs font-bold text-gray-300 mb-1.5">相手先発投手</h3>
              {opponentStarter ? (() => {
                const ps = opponentStarter.seasonStats?.pitching;
                const era = ps?.inningsPitched > 0 ? ((ps.earnedRuns || 0) / (ps.inningsPitched / 3) * 9).toFixed(2) : '-';
                return (<>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-xs px-1 py-0.5 rounded font-bold ${opponentStarter.physical?.throws === 'left' ? 'bg-blue-600 text-white' : 'bg-orange-600 text-white'}`}>
                      {opponentStarter.physical?.throws === 'left' ? '左' : '右'}
                    </span>
                    <span className="text-xs px-1 py-0.5 rounded bg-gray-700 text-gray-300">{FORM_LABELS[opponentStarter.pitching?.form] || 'スリー'}</span>
                    <span className="text-white font-bold text-xs">{opponentStarter.name}</span>
                    <span className="text-xs text-gray-400">{opponentStarter.age}</span>
                    <div className="flex gap-1.5 text-xs text-gray-300">
                      <span>{opponentStarter.pitching?.velocity || 0}<span className="text-gray-400">km</span></span>
                      <span>制<span className="text-blue-300">{opponentStarter.pitching?.control || 0}</span></span>
                      <span>ス<span className="text-green-300">{opponentStarter.pitching?.stamina || 0}</span></span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 text-xs text-gray-400 mt-1">
                    <span>防<span className="text-orange-300">{era}</span></span>
                    <span>{ps?.wins || 0}勝{ps?.losses || 0}敗</span>
                    {(ps?.saves || 0) > 0 && <span>{ps.saves}S</span>}
                    <span>{ps?.strikeouts || 0}K</span>
                  </div>
                  {opponentStarter.pitching?.arsenal && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {opponentStarter.pitching.arsenal.filter(a => a.type !== 'straight').map((a, i) => (
                        <span key={i} className={`text-xs px-1 py-0.5 rounded bg-gray-700 ${getAbilityColor(a.level || 0)}`}>{getPitchTypeName(a.type)}{a.level}</span>
                      ))}
                    </div>
                  )}
                </>);
              })() : <span className="text-gray-400 text-xs">情報なし</span>}
            </div>

            {/* 相手スタメン */}
            <div className="bg-surface-1 rounded-lg p-2.5">
              <h3 className="text-xs font-bold text-gray-300 mb-1">相手スタメン</h3>
              <div className="space-y-0.5">
                {opponentStarters.length > 0
                  ? opponentStarters.map((p, i) => renderPlayerRow(p, i))
                  : <div className="text-gray-400 text-center py-2 text-xs">ラインナップ未確定</div>}
              </div>
            </div>

            {/* 相手控え投手 */}
            <div className="bg-surface-1 rounded-lg p-2.5">
              <h3 className="text-xs font-bold text-gray-300 mb-1">相手控え投手</h3>
              <div className="space-y-0.5">
                {(() => {
                  const oppStarterIds = new Set(opponentStarters.map(p => p.id));
                  const oppBullpen = (opponentTeam?.players || []).filter(p => isPitcherPlayer(p) && !oppStarterIds.has(p.id));
                  if (oppBullpen.length === 0) return <div className="text-gray-400 text-center py-1 text-xs">情報なし</div>;
                  const oppRotation = opponentTeam?.pitchingRotation;
                  return oppBullpen.slice(0, 8).map(p => renderPitcherRow(p, { showRole: true, teamRotation: oppRotation }));
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* ボタン */}
        <div className="flex gap-3 justify-center mt-4">
          <button onClick={() => handleGameChoice('manage')}
            className="group btn-primary py-3 px-8 rounded-xl transition-all text-lg shadow-lg active:scale-95 flex items-center gap-2"
          >
            <span className="text-xl group-hover:scale-110 transition-transform">🎮</span>試合采配
          </button>
          <button onClick={() => handleGameChoice('skip')}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 hover:text-white font-bold py-3 px-8 rounded-xl transition-all text-lg active:scale-95 border border-gray-600/50 hover:border-gray-500 flex items-center gap-2"
          >
            <span className="text-xl">⏭</span>試合スキップ
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreGameModal;
