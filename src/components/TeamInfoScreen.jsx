import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { POSITION_NAMES, getAbilityColor } from '../utils/constants.js';
import { AbilityValue } from './AbilityValue.jsx';
import { AbilityRadar, teamRadarAxes } from './AbilityRadar.jsx';
import { ensureTeamJerseyNumbers } from '../utils/jerseyNumbers.js';
import { formatInnings } from '../utils/physics.js';
import PlayerDetailModal from './PlayerDetailModal.jsx';

const RECRUIT_TYPE_LABEL = {
  scouted: { label: '推薦', cls: 'text-blue-400' },
  selection: { label: 'セレクション', cls: 'text-green-400' },
  recommended: { label: 'AI推薦', cls: 'text-gray-300' },
  general: { label: '一般', cls: 'text-gray-400' },
};

const TeamInfoScreen = ({ gameMode }) => {
  const isUniversity = gameMode === 'university';
  const teamNames = Object.keys(TEAMS_DATA || {});
  const [selectedTeam, setSelectedTeam] = useState(teamNames[0] || 'チームA');
  const [pitcherSortKey, setPitcherSortKey] = useState(null);
  const [pitcherSortDir, setPitcherSortDir] = useState('desc');
  const [fielderSortKey, setFielderSortKey] = useState(null);
  const [fielderSortDir, setFielderSortDir] = useState('desc');
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const team = TEAMS_DATA[selectedTeam];
  if (!team || !team.players) {
    return <div className="text-gray-300 text-center p-8">チームデータがありません</div>;
  }
  ensureTeamJerseyNumbers(team); // 背番号を（未設定なら）割り当て

  const handlePitcherSort = (key) => {
    if (pitcherSortKey === key) setPitcherSortDir(pitcherSortDir === 'asc' ? 'desc' : 'asc');
    else { setPitcherSortKey(key); setPitcherSortDir(['era', 'bb9', 'losses'].includes(key) ? 'asc' : 'desc'); }
  };

  const handleFielderSort = (key) => {
    if (fielderSortKey === key) setFielderSortDir(fielderSortDir === 'asc' ? 'desc' : 'asc');
    else { setFielderSortKey(key); setFielderSortDir(['strikeouts'].includes(key) ? 'asc' : 'desc'); }
  };

  const SortableHeader = ({ label, sortKey, currentKey, currentDir, onClick, align = 'center' }) => (
    <th
      className={`px-2 py-2 text-${align} cursor-pointer hover:bg-gray-500 transition ${currentKey === sortKey ? 'text-yellow-400' : ''}`}
      onClick={() => onClick(sortKey)}
    >
      {label} {currentKey === sortKey && (currentDir === 'asc' ? '▲' : '▼')}
    </th>
  );

  const getPitcherValue = (player, key) => {
    const stats = player.seasonStats?.pitching;
    if (!stats) return key === 'era' || key === 'k9' || key === 'bb9' ? 999 : 0;
    const ip = stats.inningsPitched || 0;
    if (key === 'era') return ip > 0 ? (stats.earnedRuns * 27) / ip : 999;
    if (key === 'k9') return ip > 0 ? (stats.strikeouts * 27) / ip : 0;
    if (key === 'bb9') return ip > 0 ? (stats.walks * 27) / ip : 999;
    if (key === 'qsPct') { const gs = stats.gamesStarted || 0; return gs > 0 ? (stats.qualityStarts || 0) / gs : 0; }
    if (key === 'hqsPct') { const gs = stats.gamesStarted || 0; return gs > 0 ? (stats.highQualityStarts || 0) / gs : 0; }
    if (key === 'velocity') return player.pitching?.velocity || 0;
    if (key === 'control') return player.pitching?.control || 0;
    if (key === 'stamina') return player.pitching?.stamina || 0;
    if (key === 'spinRate') return player.pitching?.spinRate ?? 50;
    if (key === 'bodyStamina') return player.physical?.bodyStamina || 50;
    if (key === 'age') return player.age || 0;
    if (key === 'name') return player.name || '';
    return stats[key] || 0;
  };

  const getFielderValue = (player, key) => {
    const stats = player.seasonStats?.batting;
    if (!stats) return 0;
    if (key === 'avg') return stats.atBats > 0 ? stats.hits / stats.atBats : 0;
    if (key === 'meet') return player.batting?.meet || 0;
    if (key === 'power') return player.batting?.power || 0;
    if (key === 'eye') return player.batting?.eye || 0;
    if (key === 'steal') return player.batting?.steal || 0;
    if (key === 'speed') return player.physical?.speed || 0;
    if (key === 'defense') return player.fielding?.defense || 0;
    if (key === 'arm') return player.physical?.arm || 0;
    if (key === 'bodyStamina') return player.physical?.bodyStamina || 50;
    if (key === 'age') return player.age || 0;
    if (key === 'name') return player.name || '';
    return stats[key] || 0;
  };

  const pitchers = team.players.filter(p => p.position === 'pitcher').map(p => {
    const stats = p.seasonStats?.pitching;
    const ip = stats?.inningsPitched || 0;
    const era = ip > 0 ? (stats.earnedRuns * 27) / ip : null;
    const k9 = ip > 0 ? (stats.strikeouts * 27) / ip : null;
    const bb9 = ip > 0 ? (stats.walks * 27) / ip : null;
    const gs = stats?.gamesStarted || 0;
    const qsPct = gs > 0 ? (stats.qualityStarts || 0) / gs * 100 : null;
    const hqsPct = gs > 0 ? (stats.highQualityStarts || 0) / gs * 100 : null;
    return { ...p, _era: era, _ip: ip > 0 ? formatInnings(ip) : '0', _k9: k9, _bb9: bb9, _qsPct: qsPct, _hqsPct: hqsPct, _gs: gs };
  });
  if (pitcherSortKey) {
    pitchers.sort((a, b) => {
      let valA = getPitcherValue(a, pitcherSortKey), valB = getPitcherValue(b, pitcherSortKey);
      if (typeof valA === 'string') return pitcherSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return pitcherSortDir === 'asc' ? valA - valB : valB - valA;
    });
  }

  const fielders = team.players.filter(p => p.position !== 'pitcher').map(p => {
    const stats = p.seasonStats?.batting;
    const avg = stats?.atBats > 0 ? (stats.hits / stats.atBats) : 0;
    return { ...p, _avg: avg };
  });
  if (fielderSortKey) {
    fielders.sort((a, b) => {
      let valA = getFielderValue(a, fielderSortKey), valB = getFielderValue(b, fielderSortKey);
      if (typeof valA === 'string') return fielderSortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      return fielderSortDir === 'asc' ? valA - valB : valB - valA;
    });
  }


  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">チーム情報</h1>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">チーム選択</label>
          <select value={selectedTeam} onChange={(e) => { setSelectedTeam(e.target.value); setSelectedPlayer(null); }} className="w-full bg-gray-700 text-white rounded px-4 py-2">
            {Object.keys(TEAMS_DATA).map(teamName => (
              <option key={teamName} value={teamName}>{teamName}</option>
            ))}
          </select>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className={`grid ${team.corporateData ? 'grid-cols-5' : 'grid-cols-3'} gap-4 text-white`}>
            <div><div className="text-sm text-gray-300">総人数</div><div className="text-2xl font-bold">{team.players.length}人</div></div>
            <div><div className="text-sm text-gray-300">投手</div><div className="text-2xl font-bold">{pitchers.length}人</div></div>
            <div><div className="text-sm text-gray-300">野手</div><div className="text-2xl font-bold">{fielders.length}人</div></div>
            {team.corporateData && (() => {
              const cd = team.corporateData;
              const rankColor = { S: 'text-yellow-400', A: 'text-blue-400', B: 'text-green-400', C: 'text-gray-300', D: 'text-gray-400' }[cd.rank] || 'text-gray-300';
              return (<>
                <div>
                  <div className="text-sm text-gray-300">ランク</div>
                  <div className={`text-2xl font-black ${rankColor}`}>{cd.rank}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-300">注目度</div>
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-bold">{Math.round(cd.reputation)}</div>
                    <div className="flex-1 max-w-[80px] bg-gray-700 rounded-full h-2.5 mt-1">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{width: `${cd.reputation}%`}} />
                    </div>
                  </div>
                </div>
              </>);
            })()}
          </div>
        </div>

        {/* チーム戦力レーダー */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6 flex flex-col items-center">
          <h2 className="text-sm font-bold text-gray-300 mb-1 self-start">チーム戦力</h2>
          <AbilityRadar axes={teamRadarAxes(team)} size={240} />
        </div>

        {/* 投手テーブル */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-1">投手 ({pitchers.length}人)</h2>
          <p className="text-xs text-gray-400 mb-3">クリックで詳細表示</p>
          {pitchers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-max w-full text-xs">
                <thead>
                  <tr className="bg-gray-600 text-gray-200">
                    <th className="px-2 py-2 text-center" title="背番号">背</th>
                    <SortableHeader label="名前" sortKey="name" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} align="left" />
                    <SortableHeader label="年齢" sortKey="age" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <th className="px-2 py-2 text-center">投</th>
                    {isUniversity && <th className="px-2 py-2 text-center">出身校</th>}
                    {isUniversity && <th className="px-2 py-2 text-center">入部</th>}
                    <SortableHeader label="球速" sortKey="velocity" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="制球" sortKey="control" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="スタミナ" sortKey="stamina" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="回転" sortKey="spinRate" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="体力" sortKey="bodyStamina" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="試合" sortKey="games" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="先発" sortKey="gamesStarted" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="勝" sortKey="wins" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="敗" sortKey="losses" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="H" sortKey="holds" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="S" sortKey="saves" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="回" sortKey="inningsPitched" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="失点" sortKey="runsAllowed" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="奪三振" sortKey="strikeouts" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="与四球" sortKey="walks" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="防御率" sortKey="era" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="K/9" sortKey="k9" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="BB/9" sortKey="bb9" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="QS%" sortKey="qsPct" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                    <SortableHeader label="HQS%" sortKey="hqsPct" currentKey={pitcherSortKey} currentDir={pitcherSortDir} onClick={handlePitcherSort} />
                  </tr>
                </thead>
                <tbody>
                  {pitchers.map((player, index) => {
                    const stats = player.seasonStats?.pitching;
                    const gradeLabel = player.universityYear ? `${player.universityYear}年` : `${player.age}歳`;
                    const rt = RECRUIT_TYPE_LABEL[player.recruitType] || null;
                    return (
                      <tr key={player.id} className={`cursor-pointer hover:bg-gray-500 transition ${index % 2 === 0 ? 'bg-gray-700' : 'bg-gray-800'}`}
                        onClick={() => setSelectedPlayer(player)}>
                        <td className="px-2 py-1 text-gray-300 text-center tabular-nums font-bold">{player.number ?? '-'}</td>
                        <td className="px-2 py-1 text-white font-medium whitespace-nowrap">{player.name}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{gradeLabel}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{player.physical?.throws === 'left' ? '左' : '右'}</td>
                        {isUniversity && <td className="px-2 py-1 text-gray-300 text-center whitespace-nowrap">{player.highSchool?.name || '—'}</td>}
                        {isUniversity && <td className={`px-2 py-1 text-center whitespace-nowrap font-bold ${rt ? rt.cls : 'text-gray-400'}`}>{rt ? rt.label : '—'}</td>}
                        <td className="px-2 py-1 text-center"><AbilityValue value={player.pitching?.velocity} isVel placeholder="-" /></td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.pitching?.control)}`}>{player.pitching?.control || '-'}</td>
                        <td className="px-2 py-1 text-center"><AbilityValue value={player.pitching?.stamina} isSta placeholder="-" /></td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.pitching?.spinRate ?? 50)}`}>{player.pitching?.spinRate ?? 50}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.physical?.bodyStamina || 50)}`}>{player.physical?.bodyStamina || 50}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.games || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{player._gs}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.wins || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.losses || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.holds || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.saves || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{player._ip}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.runsAllowed || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.strikeouts || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.walks || 0}</td>
                        <td className="px-2 py-1 text-yellow-400 text-center font-bold">
                          {player._era !== null ? player._era.toFixed(2) : '-.--'}
                        </td>
                        <td className="px-2 py-1 text-cyan-400 text-center font-bold">
                          {player._k9 !== null ? player._k9.toFixed(1) : '-.–'}
                        </td>
                        <td className="px-2 py-1 text-orange-400 text-center font-bold">
                          {player._bb9 !== null ? player._bb9.toFixed(1) : '-.–'}
                        </td>
                        <td className="px-2 py-1 text-green-400 text-center font-bold">
                          {player._qsPct !== null ? `${Math.round(player._qsPct)}%` : (player._gs > 0 ? '0%' : '—')}
                        </td>
                        <td className="px-2 py-1 text-blue-400 text-center font-bold">
                          {player._hqsPct !== null ? `${Math.round(player._hqsPct)}%` : (player._gs > 0 ? '0%' : '—')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-300 text-center py-4">投手がいません</p>
          )}
        </div>

        {/* 野手テーブル */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-1">野手 ({fielders.length}人)</h2>
          <p className="text-xs text-gray-400 mb-3">クリックで詳細表示</p>
          {fielders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-600 text-gray-200">
                    <th className="px-2 py-2 text-center" title="背番号">背</th>
                    <SortableHeader label="名前" sortKey="name" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} align="left" />
                    <th className="px-2 py-2 text-center">守備</th>
                    <SortableHeader label="年齢" sortKey="age" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <th className="px-2 py-2 text-center">投打</th>
                    {isUniversity && <th className="px-2 py-2 text-center">出身校</th>}
                    {isUniversity && <th className="px-2 py-2 text-center">入部</th>}
                    <SortableHeader label="ミート" sortKey="meet" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="パワー" sortKey="power" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="走力" sortKey="speed" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="守備" sortKey="defense" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="肩" sortKey="arm" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="選球眼" sortKey="eye" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="盗塁力" sortKey="steal" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="体力" sortKey="bodyStamina" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="試合" sortKey="games" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="打席" sortKey="atBats" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="安打" sortKey="hits" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="HR" sortKey="homeruns" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="打点" sortKey="rbis" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="盗塁" sortKey="stolenBases" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="四球" sortKey="walks" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="三振" sortKey="strikeouts" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                    <SortableHeader label="打率" sortKey="avg" currentKey={fielderSortKey} currentDir={fielderSortDir} onClick={handleFielderSort} />
                  </tr>
                </thead>
                <tbody>
                  {fielders.map((player, index) => {
                    const stats = player.seasonStats?.batting;
                    const gradeLabel = player.universityYear ? `${player.universityYear}年` : `${player.age}歳`;
                    const rt = RECRUIT_TYPE_LABEL[player.recruitType] || null;
                    return (
                      <tr key={player.id} className={`cursor-pointer hover:bg-gray-500 transition ${index % 2 === 0 ? 'bg-gray-700' : 'bg-gray-800'}`}
                        onClick={() => setSelectedPlayer(player)}>
                        <td className="px-2 py-1 text-gray-300 text-center tabular-nums font-bold">{player.number ?? '-'}</td>
                        <td className="px-2 py-1 text-white font-medium whitespace-nowrap">{player.name}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{POSITION_NAMES[player.position]}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{gradeLabel}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{player.physical?.throws === 'left' ? '左' : '右'}{player.batting?.bats === 'left' ? '左' : player.batting?.bats === 'switch' ? '両' : '右'}</td>
                        {isUniversity && <td className="px-2 py-1 text-gray-300 text-center whitespace-nowrap">{player.highSchool?.name || '—'}</td>}
                        {isUniversity && <td className={`px-2 py-1 text-center whitespace-nowrap font-bold ${rt ? rt.cls : 'text-gray-400'}`}>{rt ? rt.label : '—'}</td>}
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.batting?.meet)}`}>{player.batting?.meet || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.batting?.power)}`}>{player.batting?.power || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.physical?.speed)}`}>{player.physical?.speed || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.fielding?.defense)}`}>{player.fielding?.defense || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.physical?.arm)}`}>{player.physical?.arm || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.batting?.eye)}`}>{player.batting?.eye || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.batting?.steal)}`}>{player.batting?.steal || '-'}</td>
                        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.physical?.bodyStamina || 50)}`}>{player.physical?.bodyStamina || 50}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.games || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.atBats || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.hits || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.homeruns || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.rbis || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.stolenBases || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.walks || 0}</td>
                        <td className="px-2 py-1 text-gray-300 text-center">{stats?.strikeouts || 0}</td>
                        <td className="px-2 py-1 text-yellow-400 text-center font-bold">{player._avg.toFixed(3)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-300 text-center py-4">野手がいません</p>
          )}
        </div>
      </div>

      {selectedPlayer && <PlayerDetailModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}
    </div>
  );
};

export default TeamInfoScreen;
