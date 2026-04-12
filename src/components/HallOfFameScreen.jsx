import React, { useState, useMemo } from 'react';
import { getPitchTypeName } from '../season/yearProgressionSystem.js';

const FULL_POSITION_NAMES = {
  pitcher: '投手', catcher: '捕手', first: '一塁手', second: '二塁手',
  third: '三塁手', short: '遊撃手', left: '左翼手', center: '中堅手', right: '右翼手'
};

const HallOfFameScreen = ({ hallOfFamePlayers = [], allTeams = {}, teamHistory = [], seasonData, onClose }) => {
  const [activeTab, setActiveTab] = useState('draft');
  const [statCategory, setStatCategory] = useState('avg');
  const [expandedPlayer, setExpandedPlayer] = useState(null);
  const [selectedTeamForHistory, setSelectedTeamForHistory] = useState(null);
  const [expandedYear, setExpandedYear] = useState(null);

  const getPositionName = (pos) => {
    const names = {
      pitcher: '投', catcher: '捕', first: '一', second: '二',
      third: '三', short: '遊', left: '左', center: '中', right: '右'
    };
    return names[pos] || pos;
  };

  const draftedPlayers = useMemo(() =>
    hallOfFamePlayers.filter(p =>
      p.departureType === 'npb_drafted' || (p.reason && p.reason.includes('NPBドラフト'))
    ).sort((a, b) => (b.year || 0) - (a.year || 0)),
    [hallOfFamePlayers]
  );

  const allPlayersForStats = useMemo(() => {
    const players = [];
    hallOfFamePlayers.forEach(p => {
      if (p.careerStats) {
        players.push({
          name: p.name, position: p.position,
          teamName: p.teamName || p.team, careerStats: p.careerStats,
          status: p.departureType === 'npb_drafted' ? 'NPB' : '引退',
          age: p.age, yearsPlayed: p.yearsPlayed
        });
      }
    });
    const seenIds = new Set();
    Object.entries(allTeams).forEach(([teamName, team]) => {
      if (!team?.players) return;
      team.players.forEach(p => {
        if (p.id != null && seenIds.has(p.id)) return;
        if (p.id != null) seenIds.add(p.id);
        if (p.careerStats) {
          players.push({
            name: p.name, position: p.position, teamName,
            careerStats: p.careerStats, status: '現役',
            age: p.age, yearsPlayed: p.yearsPlayed
          });
        }
      });
    });
    return players;
  }, [hallOfFamePlayers, allTeams]);

  const battingCategories = [
    { key: 'avg', label: '打率', getValue: (s) => { const ab = s.batting?.atBats || 0; return ab >= 30 ? (s.batting?.hits || 0) / ab : 0; }, format: (v) => v > 0 ? v.toFixed(3) : '.000', minAB: 30 },
    { key: 'hits', label: '安打', getValue: (s) => s.batting?.hits || 0, format: (v) => v },
    { key: 'homeruns', label: 'HR', getValue: (s) => s.batting?.homeruns || 0, format: (v) => v },
    { key: 'rbis', label: '打点', getValue: (s) => s.batting?.rbis || 0, format: (v) => v },
    { key: 'stolenBases', label: '盗塁', getValue: (s) => s.batting?.stolenBases || 0, format: (v) => v },
    { key: 'atBats', label: '打数', getValue: (s) => s.batting?.atBats || 0, format: (v) => v },
  ];

  const pitchingCategories = [
    { key: 'era', label: '防御率', getValue: (s) => { const ip = s.pitching?.inningsPitched || 0; return ip >= 10 ? ((s.pitching?.earnedRuns || 0) / ip) * 9 : 999; }, format: (v) => v < 999 ? v.toFixed(2) : '-', ascending: true, minIP: 10 },
    { key: 'wins', label: '勝利', getValue: (s) => s.pitching?.wins || 0, format: (v) => v },
    { key: 'saves', label: 'S', getValue: (s) => s.pitching?.saves || 0, format: (v) => v },
    { key: 'strikeouts', label: '奪三振', getValue: (s) => s.pitching?.strikeouts || 0, format: (v) => v },
    { key: 'inningsPitched', label: '投球回', getValue: (s) => s.pitching?.inningsPitched || 0, format: (v) => v.toFixed(1) },
  ];

  const allCategories = [...battingCategories, ...pitchingCategories];
  const currentCategory = allCategories.find(c => c.key === statCategory) || battingCategories[0];

  const rankings = useMemo(() => {
    const cat = currentCategory;
    let eligible = allPlayersForStats.filter(p => {
      const val = cat.getValue(p.careerStats);
      if (cat.minAB && (p.careerStats.batting?.atBats || 0) < cat.minAB) return false;
      if (cat.minIP && (p.careerStats.pitching?.inningsPitched || 0) < cat.minIP) return false;
      if (cat.ascending) return val < 999;
      return val > 0;
    });
    eligible.sort((a, b) => {
      const va = cat.getValue(a.careerStats);
      const vb = cat.getValue(b.careerStats);
      return cat.ascending ? va - vb : vb - va;
    });
    return eligible.slice(0, 50);
  }, [allPlayersForStats, statCategory, currentCategory]);

  const statusColor = (status) => {
    if (status === '現役') return 'text-green-400';
    if (status === 'NPB') return 'text-yellow-400';
    return 'text-gray-500';
  };

  // チーム一覧（履歴データまたは現在のチームから取得）
  const teamNames = useMemo(() => {
    const names = new Set();
    teamHistory.forEach(entry => {
      entry.standings?.forEach(s => names.add(s.team));
    });
    Object.keys(allTeams).forEach(t => names.add(t));
    return [...names];
  }, [teamHistory, allTeams]);

  // 選択チームの年度別成績
  const selectedTeamHistory = useMemo(() => {
    if (!selectedTeamForHistory) return [];
    return teamHistory
      .map(entry => {
        const record = entry.standings?.find(s => s.team === selectedTeamForHistory);
        if (!record) return null;
        return { year: entry.year, ...record };
      })
      .filter(Boolean)
      .sort((a, b) => b.year - a.year);
  }, [selectedTeamForHistory, teamHistory]);

  // 全チーム横断の年度別サマリ
  const yearSummaries = useMemo(() => {
    return [...teamHistory].sort((a, b) => b.year - a.year);
  }, [teamHistory]);

  return (
    <div className="p-4 bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* ヘッダー + タブ */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-yellow-400">資料室</h1>
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('draft')}
              className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${
                activeTab === 'draft'
                  ? 'bg-yellow-600 text-white shadow-sm'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              ドラフト指名
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${
                activeTab === 'stats'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              通算成績
            </button>
            <button
              onClick={() => setActiveTab('teamhistory')}
              className={`px-4 py-1.5 rounded-md text-sm font-bold transition ${
                activeTab === 'teamhistory'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              チーム成績
            </button>
          </div>
        </div>

        {/* ドラフト指名タブ */}
        {activeTab === 'draft' && (
          <div>
            {draftedPlayers.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-6 text-center">
                <p className="text-gray-400">まだドラフト指名選手はいません</p>
                <p className="text-gray-600 text-sm mt-1">NPBドラフトで指名された選手がここに表示されます</p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-700/80 text-gray-400 text-[10px]">
                      <th className="py-1.5 px-2 text-left">年</th>
                      <th className="py-1.5 px-2 text-left">選手名</th>
                      <th className="py-1.5 px-1 text-center">位</th>
                      <th className="py-1.5 px-1 text-center">投/打</th>
                      <th className="py-1.5 px-1 text-center">齢</th>
                      <th className="py-1.5 px-2 text-left">所属</th>
                      <th className="py-1.5 px-2 text-left">指名先</th>
                      <th className="py-1.5 px-2 text-right">成績</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftedPlayers.map((player, idx) => {
                      const isP = player.position === 'pitcher';
                      const stats = player.careerStats || { batting: {}, pitching: {} };
                      let mainStat = '';
                      if (isP) {
                        mainStat = `${stats.pitching?.wins || 0}勝 ${stats.pitching?.saves || 0}S ${stats.pitching?.strikeouts || 0}K`;
                      } else {
                        const ab = stats.batting?.atBats || 0;
                        const avg = ab > 0 ? (stats.batting.hits / ab).toFixed(3) : '.000';
                        mainStat = `${avg} ${stats.batting?.homeruns || 0}HR ${stats.batting?.hits || 0}安`;
                      }
                      const isExpanded = expandedPlayer === idx;
                      const ds = player.draftStats;
                      return (
                        <React.Fragment key={idx}>
                          <tr
                            className={`border-b border-gray-700/50 cursor-pointer hover:bg-gray-700/30 ${player.hallOfFame ? 'bg-yellow-900/20' : ''} ${isExpanded ? 'bg-gray-700/40' : ''}`}
                            onClick={() => setExpandedPlayer(isExpanded ? null : idx)}
                          >
                            <td className="py-1.5 px-2 text-gray-500">{player.year || '-'}年目</td>
                            <td className="py-1.5 px-2">
                              <span className={`font-bold ${isP ? 'text-red-400' : 'text-blue-300'}`}>
                                {player.hallOfFame && '🏛️ '}{player.name}
                              </span>
                              <span className="text-gray-600 text-[9px] ml-1">{isExpanded ? '▲' : '▼'}</span>
                            </td>
                            <td className="py-1.5 px-1 text-center text-gray-500">{getPositionName(player.position)}</td>
                            <td className="py-1.5 px-1 text-center text-[10px]">
                              <span className={player.throws === 'left' ? 'text-green-400' : 'text-gray-500'}>
                                {player.throws === 'left' ? '左' : '右'}
                              </span>
                              <span className="text-gray-600">/</span>
                              <span className={player.bats === 'left' ? 'text-green-400' : player.bats === 'switch' ? 'text-purple-400' : 'text-gray-500'}>
                                {player.bats === 'left' ? '左' : player.bats === 'switch' ? '両' : '右'}
                              </span>
                            </td>
                            <td className="py-1.5 px-1 text-center text-gray-500">{player.age}</td>
                            <td className="py-1.5 px-2 text-gray-400">{player.teamName || player.team}</td>
                            <td className="py-1.5 px-2">
                              <span className="text-yellow-400 font-bold">{player.npbTeam || '-'}</span>
                              {player.draftRound && (
                                <span className={`ml-1 text-[9px] px-1 py-0.5 rounded ${player.draftRound === 'ドラフト1位' ? 'bg-red-600/60 text-red-200' : player.draftRound === 'ドラフト2位' ? 'bg-orange-600/60 text-orange-200' : player.draftRound === '育成指名' ? 'bg-gray-600/60 text-gray-300' : 'bg-yellow-700/60 text-yellow-200'}`}>
                                  {player.draftRound}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-right text-gray-300 font-mono text-[10px]">{mainStat}</td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-gray-800/80">
                              <td colSpan={8} className="px-3 py-2">
                                {ds ? (
                                  <div className="text-[11px]">
                                    <div className="text-gray-500 text-[9px] mb-1">指名当時の能力値</div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                      {isP ? (
                                        <>
                                          <span className="text-gray-400">球速 <span className="text-white font-bold">{ds.pitching?.velocity || '-'}</span>km</span>
                                          <span className="text-gray-400">制球 <span className="text-white font-bold">{ds.pitching?.control || '-'}</span></span>
                                          <span className="text-gray-400">スタミナ <span className="text-white font-bold">{ds.pitching?.stamina || '-'}</span></span>
                                          <span className="text-gray-400">ミート <span className="text-white font-bold">{ds.batting?.meet || '-'}</span></span>
                                          <span className="text-gray-400">パワー <span className="text-white font-bold">{ds.batting?.power || '-'}</span></span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-gray-400">ミート <span className="text-white font-bold">{ds.batting?.meet || '-'}</span></span>
                                          <span className="text-gray-400">パワー <span className="text-white font-bold">{ds.batting?.power || '-'}</span></span>
                                          <span className="text-gray-400">選球眼 <span className="text-white font-bold">{ds.batting?.eye || '-'}</span></span>
                                          <span className="text-gray-400">走力 <span className="text-white font-bold">{ds.physical?.speed || '-'}</span></span>
                                          <span className="text-gray-400">守備 <span className="text-white font-bold">{ds.fielding?.defense || '-'}</span></span>
                                          <span className="text-gray-400">肩力 <span className="text-white font-bold">{ds.physical?.arm || '-'}</span></span>
                                          <span className="text-gray-400">盗塁 <span className="text-white font-bold">{ds.batting?.steal || '-'}</span></span>
                                        </>
                                      )}
                                    </div>
                                    {ds.pitching?.arsenal && ds.pitching.arsenal.length > 0 && (
                                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                        <span className="text-gray-500">球種:</span>
                                        {ds.pitching.arsenal.map((pitch, pi) => (
                                          <span key={pi} className={`${pitch.type === 'straight' ? 'text-red-400' : 'text-cyan-400'}`}>
                                            {getPitchTypeName(pitch.type)} <span className="text-gray-500 text-[9px]">Lv{pitch.level}</span>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {ds.positionFitness && (() => {
                                      const subPositions = Object.entries(ds.positionFitness)
                                        .filter(([pos, fit]) => pos !== player.position && fit >= 30)
                                        .sort((a, b) => b[1] - a[1]);
                                      return subPositions.length > 0 ? (
                                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                          <span className="text-gray-500">サブポジ:</span>
                                          {subPositions.map(([pos, fit], si) => (
                                            <span key={si} className={`${fit >= 70 ? 'text-green-400' : fit >= 50 ? 'text-yellow-400' : 'text-gray-400'}`}>
                                              {FULL_POSITION_NAMES[pos] || pos} <span className="text-gray-500 text-[9px]">{fit}</span>
                                            </span>
                                          ))}
                                        </div>
                                      ) : null;
                                    })()}
                                  </div>
                                ) : (
                                  <div className="text-gray-600 text-[10px]">能力値データなし（過去のセーブデータの選手）</div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 通算成績ランキングタブ */}
        {activeTab === 'stats' && (
          <div>
            <div className="bg-gray-800 rounded-lg p-2 mb-2">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-gray-500 text-[10px] mr-1 w-8">打撃</span>
                {battingCategories.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setStatCategory(cat.key)}
                    className={`px-2 py-0.5 text-[11px] rounded transition ${
                      statCategory === cat.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-400'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-500 text-[10px] mr-1 w-8">投手</span>
                {pitchingCategories.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setStatCategory(cat.key)}
                    className={`px-2 py-0.5 text-[11px] rounded transition ${
                      statCategory === cat.key
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-400'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {rankings.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-6 text-center">
                <p className="text-gray-500">データがありません</p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-700/80 text-gray-400 text-[10px]">
                      <th className="py-1.5 px-2 text-center w-8">#</th>
                      <th className="py-1.5 px-2 text-left">選手名</th>
                      <th className="py-1.5 px-1 text-center">位</th>
                      <th className="py-1.5 px-2 text-left">チーム</th>
                      <th className="py-1.5 px-1 text-center">状態</th>
                      <th className="py-1.5 px-2 text-right font-bold">{currentCategory.label}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankings.map((player, idx) => {
                      const val = currentCategory.getValue(player.careerStats);
                      const isP = player.position === 'pitcher';
                      return (
                        <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                          <td className="py-1.5 px-2 text-center">
                            <span className={`font-bold ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-400' : 'text-gray-600'}`}>
                              {idx + 1}
                            </span>
                          </td>
                          <td className="py-1.5 px-2">
                            <span className={`font-bold ${isP ? 'text-red-400' : 'text-blue-300'}`}>{player.name}</span>
                          </td>
                          <td className="py-1.5 px-1 text-center text-gray-500">{getPositionName(player.position)}</td>
                          <td className="py-1.5 px-2 text-gray-400">{player.teamName}</td>
                          <td className={`py-1.5 px-1 text-center text-[10px] font-bold ${statusColor(player.status)}`}>
                            {player.status}
                          </td>
                          <td className="py-1.5 px-2 text-right font-bold text-white text-sm">
                            {currentCategory.format(val)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* チーム成績タブ */}
        {activeTab === 'teamhistory' && (
          <div>
            {teamHistory.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-6 text-center">
                <p className="text-gray-400">まだチーム成績データがありません</p>
                <p className="text-gray-600 text-sm mt-1">シーズン終了後にチーム成績が記録されます</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* チーム選択ボタン */}
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-2">チームを選択して年度別成績を表示</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => { setSelectedTeamForHistory(null); setExpandedYear(null); }}
                      className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${
                        !selectedTeamForHistory
                          ? 'bg-green-600 text-white shadow-sm'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      全体
                    </button>
                    {teamNames.map(name => (
                      <button
                        key={name}
                        onClick={() => { setSelectedTeamForHistory(name); setExpandedYear(null); }}
                        className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${
                          selectedTeamForHistory === name
                            ? 'bg-green-600 text-white shadow-sm'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 全体表示: 年度ごとの順位表 */}
                {!selectedTeamForHistory && (
                  <div className="space-y-2">
                    {yearSummaries.map((entry, yi) => {
                      const isExpanded = expandedYear === entry.year;
                      const champion = entry.standings?.[0];
                      return (
                        <div key={entry.year} className="bg-gray-800 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setExpandedYear(isExpanded ? null : entry.year)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-bold text-white">{entry.year}年目</span>
                              {champion && (
                                <span className="text-yellow-400 font-bold text-sm">
                                  優勝: {champion.team} ({champion.wins}勝{champion.losses}敗{champion.draws > 0 ? ` ${champion.draws}分` : ''})
                                </span>
                              )}
                            </div>
                            <span className="text-gray-500">{isExpanded ? '▲' : '▼'}</span>
                          </button>
                          {isExpanded && entry.standings && (
                            <div className="px-4 pb-3">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-gray-400 text-xs border-b border-gray-700">
                                    <th className="py-1.5 px-2 text-center w-8">順位</th>
                                    <th className="py-1.5 px-2 text-left">チーム</th>
                                    <th className="py-1.5 px-2 text-center">勝</th>
                                    <th className="py-1.5 px-2 text-center">敗</th>
                                    <th className="py-1.5 px-2 text-center">分</th>
                                    <th className="py-1.5 px-2 text-center">勝率</th>
                                    <th className="py-1.5 px-2 text-left">打撃MVP</th>
                                    <th className="py-1.5 px-2 text-left">投手MVP</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {entry.standings.map((s, si) => (
                                    <tr key={si} className={`border-b border-gray-700/50 ${si === 0 ? 'bg-yellow-900/20' : ''}`}>
                                      <td className="py-2 px-2 text-center">
                                        <span className={`font-bold ${si === 0 ? 'text-yellow-400' : si === 1 ? 'text-gray-300' : si === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                                          {s.rank}
                                        </span>
                                      </td>
                                      <td className="py-2 px-2 font-bold text-white">{s.team}</td>
                                      <td className="py-2 px-2 text-center text-green-400 font-bold">{s.wins}</td>
                                      <td className="py-2 px-2 text-center text-red-400">{s.losses}</td>
                                      <td className="py-2 px-2 text-center text-gray-400">{s.draws || 0}</td>
                                      <td className="py-2 px-2 text-center text-white font-mono">{(s.winRate || 0).toFixed(3)}</td>
                                      <td className="py-2 px-2 text-xs">
                                        {s.mvpBatter ? (
                                          <span className="text-blue-300">
                                            {s.mvpBatter.name}
                                            <span className="text-gray-500 ml-1">
                                              {s.mvpBatter.avg} {s.mvpBatter.hr}HR {s.mvpBatter.rbi}打点
                                            </span>
                                          </span>
                                        ) : <span className="text-gray-600">-</span>}
                                      </td>
                                      <td className="py-2 px-2 text-xs">
                                        {s.mvpPitcher ? (
                                          <span className="text-red-300">
                                            {s.mvpPitcher.name}
                                            <span className="text-gray-500 ml-1">
                                              {s.mvpPitcher.wins}勝{s.mvpPitcher.losses}敗 {s.mvpPitcher.saves > 0 ? `${s.mvpPitcher.saves}S ` : ''}防{s.mvpPitcher.era}
                                            </span>
                                          </span>
                                        ) : <span className="text-gray-600">-</span>}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* チーム別表示: 選択チームの年度別成績 */}
                {selectedTeamForHistory && (
                  <div>
                    {selectedTeamHistory.length === 0 ? (
                      <div className="bg-gray-800 rounded-lg p-6 text-center">
                        <p className="text-gray-500">{selectedTeamForHistory}の成績データがありません</p>
                      </div>
                    ) : (
                      <div className="bg-gray-800 rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-3">
                          <span className="text-lg font-bold text-white">{selectedTeamForHistory}</span>
                          <span className="text-sm text-gray-400">
                            通算 {selectedTeamHistory.reduce((s, r) => s + r.wins, 0)}勝
                            {selectedTeamHistory.reduce((s, r) => s + r.losses, 0)}敗
                            {selectedTeamHistory.reduce((s, r) => s + (r.draws || 0), 0) > 0 && ` ${selectedTeamHistory.reduce((s, r) => s + (r.draws || 0), 0)}分`}
                          </span>
                          <span className="text-yellow-400 text-sm font-bold">
                            優勝 {selectedTeamHistory.filter(r => r.rank === 1).length}回
                          </span>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-gray-700/60 text-gray-400 text-xs">
                              <th className="py-1.5 px-3 text-left">年度</th>
                              <th className="py-1.5 px-2 text-center">順位</th>
                              <th className="py-1.5 px-2 text-center">勝</th>
                              <th className="py-1.5 px-2 text-center">敗</th>
                              <th className="py-1.5 px-2 text-center">分</th>
                              <th className="py-1.5 px-2 text-center">勝率</th>
                              <th className="py-1.5 px-2 text-left">打撃MVP</th>
                              <th className="py-1.5 px-2 text-left">投手MVP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedTeamHistory.map((record, ri) => (
                              <tr key={ri} className={`border-b border-gray-700/50 ${record.rank === 1 ? 'bg-yellow-900/20' : ''}`}>
                                <td className="py-2 px-3 font-bold text-white">{record.year}年目</td>
                                <td className="py-2 px-2 text-center">
                                  <span className={`font-bold text-base ${record.rank === 1 ? 'text-yellow-400' : record.rank === 2 ? 'text-gray-300' : record.rank === 3 ? 'text-orange-400' : 'text-gray-500'}`}>
                                    {record.rank}位
                                  </span>
                                </td>
                                <td className="py-2 px-2 text-center text-green-400 font-bold">{record.wins}</td>
                                <td className="py-2 px-2 text-center text-red-400">{record.losses}</td>
                                <td className="py-2 px-2 text-center text-gray-400">{record.draws || 0}</td>
                                <td className="py-2 px-2 text-center text-white font-mono">{(record.winRate || 0).toFixed(3)}</td>
                                <td className="py-2 px-2 text-xs">
                                  {record.mvpBatter ? (
                                    <div>
                                      <span className="text-blue-300 font-bold">{record.mvpBatter.name}</span>
                                      <div className="text-gray-500 text-[10px]">
                                        {record.mvpBatter.avg} {record.mvpBatter.hr}HR {record.mvpBatter.rbi}打点 {record.mvpBatter.hits}安
                                      </div>
                                    </div>
                                  ) : <span className="text-gray-600">-</span>}
                                </td>
                                <td className="py-2 px-2 text-xs">
                                  {record.mvpPitcher ? (
                                    <div>
                                      <span className="text-red-300 font-bold">{record.mvpPitcher.name}</span>
                                      <div className="text-gray-500 text-[10px]">
                                        {record.mvpPitcher.wins}勝{record.mvpPitcher.losses}敗 {record.mvpPitcher.saves > 0 ? `${record.mvpPitcher.saves}S ` : ''}防{record.mvpPitcher.era} {record.mvpPitcher.strikeouts}K
                                      </div>
                                    </div>
                                  ) : <span className="text-gray-600">-</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {onClose && (
          <div className="text-center mt-4">
            <button
              onClick={onClose}
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg text-sm transition"
            >
              戻る
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HallOfFameScreen;
