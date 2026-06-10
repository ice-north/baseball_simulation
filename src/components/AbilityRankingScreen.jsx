import React, { useState, useMemo } from 'react';
import { TEAMS_DATA, getTeamAbbreviation } from '../teams-data.js';
import { calcPlayerOverall } from '../season/dispatchSystem.js';
import { POSITION_NAMES } from '../utils/constants.js';

const AbilityRankingScreen = () => {
  const [category, setCategory] = useState('all');
  const [sortKey, setSortKey] = useState('overall');
  const [limit, setLimit] = useState(50);

  const allPlayers = useMemo(() => {
    const players = [];
    for (const [teamName, team] of Object.entries(TEAMS_DATA)) {
      if (!team?.players) continue;
      if (team.corporateTeamId || team.corporateData || team.universityData) continue;
      for (const p of team.players) {
        const overall = calcPlayerOverall(p);
        players.push({ ...p, teamName, teamAbbr: getTeamAbbreviation(teamName), overall });
      }
    }
    return players;
  }, [Object.keys(TEAMS_DATA).length]);

  const filtered = useMemo(() => {
    let list = allPlayers;
    if (category === 'pitcher') list = list.filter(p => p.position === 'pitcher');
    else if (category === 'fielder') list = list.filter(p => p.position !== 'pitcher');

    const key = sortKey;
    list = [...list].sort((a, b) => {
      if (key === 'overall') return b.overall - a.overall;
      if (key === 'meet') return (b.batting?.meet || 0) - (a.batting?.meet || 0);
      if (key === 'power') return (b.batting?.power || 0) - (a.batting?.power || 0);
      if (key === 'speed') return (b.physical?.speed || 0) - (a.physical?.speed || 0);
      if (key === 'defense') return (b.fielding?.defense || 0) - (a.fielding?.defense || 0);
      if (key === 'eye') return (b.batting?.eye || 0) - (a.batting?.eye || 0);
      if (key === 'arm') return (b.physical?.arm || 0) - (a.physical?.arm || 0);
      if (key === 'velocity') return (b.pitching?.velocity || 0) - (a.pitching?.velocity || 0);
      if (key === 'control') return (b.pitching?.control || 0) - (a.pitching?.control || 0);
      if (key === 'stamina') return (b.pitching?.stamina || 0) - (a.pitching?.stamina || 0);
      if (key === 'age') return (a.age || 99) - (b.age || 99);
      return b.overall - a.overall;
    });

    return list.slice(0, limit);
  }, [allPlayers, category, sortKey, limit]);

  const teamStats = useMemo(() => {
    const stats = {};
    for (const p of allPlayers) {
      if (!stats[p.teamName]) stats[p.teamName] = { name: p.teamName, abbr: p.teamAbbr, total: 0, count: 0, pitchers: 0, fielders: 0, pitcherTotal: 0, fielderTotal: 0 };
      const s = stats[p.teamName];
      s.total += p.overall;
      s.count++;
      if (p.position === 'pitcher') { s.pitchers++; s.pitcherTotal += p.overall; }
      else { s.fielders++; s.fielderTotal += p.overall; }
    }
    return Object.values(stats)
      .map(s => ({ ...s, avg: s.count > 0 ? (s.total / s.count).toFixed(1) : 0, pitcherAvg: s.pitchers > 0 ? (s.pitcherTotal / s.pitchers).toFixed(1) : 0, fielderAvg: s.fielders > 0 ? (s.fielderTotal / s.fielders).toFixed(1) : 0 }))
      .sort((a, b) => b.avg - a.avg);
  }, [allPlayers]);

  const getOverallColor = (v) => {
    if (v >= 70) return 'text-yellow-400';
    if (v >= 60) return 'text-red-400';
    if (v >= 50) return 'text-blue-400';
    if (v >= 40) return 'text-green-400';
    return 'text-gray-400';
  };

  const getStatColor = (v) => {
    if (v >= 80) return 'text-yellow-400';
    if (v >= 65) return 'text-red-400';
    if (v >= 50) return 'text-blue-400';
    if (v >= 35) return 'text-green-400';
    return 'text-gray-500';
  };

  const tabs = [
    { key: 'all', label: '全選手' },
    { key: 'pitcher', label: '投手' },
    { key: 'fielder', label: '野手' },
    { key: 'team', label: 'チーム別' },
  ];

  const sortOptions = category === 'pitcher'
    ? [{ key: 'overall', label: '総合' }, { key: 'velocity', label: '球速' }, { key: 'control', label: '制球' }, { key: 'stamina', label: 'スタミナ' }, { key: 'age', label: '年齢' }]
    : category === 'fielder'
    ? [{ key: 'overall', label: '総合' }, { key: 'meet', label: 'ミート' }, { key: 'power', label: 'パワー' }, { key: 'speed', label: '走力' }, { key: 'defense', label: '守備' }, { key: 'eye', label: '選球眼' }, { key: 'age', label: '年齢' }]
    : [{ key: 'overall', label: '総合' }, { key: 'age', label: '年齢' }];

  return (
    <div className="p-4 bg-gray-900 min-h-screen text-white">
      <h1 className="text-2xl font-bold mb-1">📰 総合ランキング</h1>
      <p className="text-gray-400 text-xs mb-4">リーグ全選手の能力ランキング（社会人チームは除く）</p>

      <div className="flex gap-1 mb-3">
        {tabs.map(t => (
          <button key={t.key}
            onClick={() => { setCategory(t.key); setSortKey('overall'); }}
            className={`px-3 py-1.5 rounded text-sm font-bold transition ${
              category === t.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {category === 'team' ? (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs border-b border-gray-700">
                <th className="px-3 py-2 text-left w-8">#</th>
                <th className="px-3 py-2 text-left">チーム</th>
                <th className="px-3 py-2 text-center">人数</th>
                <th className="px-3 py-2 text-center">総合平均</th>
                <th className="px-3 py-2 text-center">投手平均</th>
                <th className="px-3 py-2 text-center">野手平均</th>
              </tr>
            </thead>
            <tbody>
              {teamStats.map((s, i) => (
                <tr key={s.name} className={`border-b border-gray-700/50 ${i < 3 ? 'bg-gray-700/30' : ''}`}>
                  <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2 font-bold">{s.name}</td>
                  <td className="px-3 py-2 text-center text-gray-400">{s.count}</td>
                  <td className={`px-3 py-2 text-center font-bold ${getOverallColor(Number(s.avg))}`}>{s.avg}</td>
                  <td className={`px-3 py-2 text-center ${getOverallColor(Number(s.pitcherAvg))}`}>{s.pitcherAvg}</td>
                  <td className={`px-3 py-2 text-center ${getOverallColor(Number(s.fielderAvg))}`}>{s.fielderAvg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs text-gray-500">ソート:</span>
            <div className="flex gap-1">
              {sortOptions.map(o => (
                <button key={o.key}
                  onClick={() => setSortKey(o.key)}
                  className={`px-2 py-1 rounded text-xs font-bold transition ${
                    sortKey === o.key ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >{o.label}</button>
              ))}
            </div>
            <div className="ml-auto flex gap-1">
              {[50, 100, 200].map(n => (
                <button key={n} onClick={() => setLimit(n)}
                  className={`px-2 py-1 rounded text-xs ${limit === n ? 'bg-gray-600 text-white' : 'bg-gray-800 text-gray-500'}`}
                >Top{n}</button>
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs border-b border-gray-700">
                  <th className="px-2 py-2 text-left w-8">#</th>
                  <th className="px-2 py-2 text-left">選手</th>
                  <th className="px-2 py-2 text-center">守</th>
                  <th className="px-2 py-2 text-center">年</th>
                  <th className="px-2 py-2 text-left">チーム</th>
                  <th className="px-2 py-2 text-center font-bold">総合</th>
                  {(category === 'all' || category === 'fielder') && <>
                    <th className="px-2 py-2 text-center">ミ</th>
                    <th className="px-2 py-2 text-center">パ</th>
                    <th className="px-2 py-2 text-center">走</th>
                    <th className="px-2 py-2 text-center">守</th>
                    <th className="px-2 py-2 text-center">眼</th>
                  </>}
                  {(category === 'all' || category === 'pitcher') && <>
                    <th className="px-2 py-2 text-center">球速</th>
                    <th className="px-2 py-2 text-center">制球</th>
                    <th className="px-2 py-2 text-center">ス</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const isPitcher = p.position === 'pitcher';
                  return (
                    <tr key={`${p.id}-${i}`} className={`border-b border-gray-700/30 hover:bg-gray-700/30 ${i < 3 ? 'bg-gray-700/20' : ''}`}>
                      <td className="px-2 py-1.5 text-gray-500 text-xs">{i + 1}</td>
                      <td className="px-2 py-1.5 font-bold text-white text-xs">{p.name}</td>
                      <td className="px-2 py-1.5 text-center text-gray-400 text-xs">{POSITION_NAMES[p.position] || p.position}</td>
                      <td className="px-2 py-1.5 text-center text-gray-400 text-xs">{p.age}</td>
                      <td className="px-2 py-1.5 text-gray-300 text-xs">{p.teamAbbr}</td>
                      <td className={`px-2 py-1.5 text-center font-bold ${getOverallColor(p.overall)}`}>{p.overall}</td>
                      {(category === 'all' || category === 'fielder') && <>
                        <td className={`px-2 py-1.5 text-center text-xs ${isPitcher ? 'text-gray-700' : getStatColor(p.batting?.meet || 0)}`}>{isPitcher ? '-' : p.batting?.meet || 0}</td>
                        <td className={`px-2 py-1.5 text-center text-xs ${isPitcher ? 'text-gray-700' : getStatColor(p.batting?.power || 0)}`}>{isPitcher ? '-' : p.batting?.power || 0}</td>
                        <td className={`px-2 py-1.5 text-center text-xs ${isPitcher ? 'text-gray-700' : getStatColor(p.physical?.speed || 0)}`}>{isPitcher ? '-' : p.physical?.speed || 0}</td>
                        <td className={`px-2 py-1.5 text-center text-xs ${isPitcher ? 'text-gray-700' : getStatColor(p.fielding?.defense || 0)}`}>{isPitcher ? '-' : p.fielding?.defense || 0}</td>
                        <td className={`px-2 py-1.5 text-center text-xs ${isPitcher ? 'text-gray-700' : getStatColor(p.batting?.eye || 0)}`}>{isPitcher ? '-' : p.batting?.eye || 0}</td>
                      </>}
                      {(category === 'all' || category === 'pitcher') && <>
                        <td className={`px-2 py-1.5 text-center text-xs ${!isPitcher ? 'text-gray-700' : getStatColor((p.pitching?.velocity || 130) - 100)}`}>{!isPitcher ? '-' : `${p.pitching?.velocity || 130}`}</td>
                        <td className={`px-2 py-1.5 text-center text-xs ${!isPitcher ? 'text-gray-700' : getStatColor(p.pitching?.control || 0)}`}>{!isPitcher ? '-' : p.pitching?.control || 0}</td>
                        <td className={`px-2 py-1.5 text-center text-xs ${!isPitcher ? 'text-gray-700' : getStatColor(p.pitching?.stamina || 0)}`}>{!isPitcher ? '-' : p.pitching?.stamina || 0}</td>
                      </>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            全{allPlayers.length}選手中 上位{Math.min(limit, filtered.length)}名を表示
          </div>
        </>
      )}
    </div>
  );
};

export default AbilityRankingScreen;
