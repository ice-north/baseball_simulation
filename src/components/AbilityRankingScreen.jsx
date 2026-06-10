import React, { useState, useMemo } from 'react';
import { TEAMS_DATA, getTeamAbbreviation } from '../teams-data.js';
import { calcPlayerOverall } from '../season/dispatchSystem.js';
import { POSITION_NAMES } from '../utils/constants.js';

const RANK_COLORS = { S: 'text-yellow-400', A: 'text-red-400', B: 'text-blue-400', C: 'text-green-400', D: 'text-gray-400' };
const RANK_BG = { S: 'bg-yellow-900/30 border-yellow-700/50', A: 'bg-red-900/20 border-red-700/50', B: 'bg-blue-900/20 border-blue-700/50', C: 'bg-green-900/20 border-green-700/50', D: 'bg-gray-800 border-gray-700/50' };

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

const getTeamType = (team) => {
  if (team.corporateTeamId || team.corporateData) return 'corporate';
  if (team.universityData) return 'university';
  if (team.independentLeagueId) return 'independent';
  return 'user';
};

const TYPE_LABEL = {
  corporate: { text: '社会人', color: 'text-blue-400' },
  university: { text: '大学', color: 'text-amber-400' },
  independent: { text: '独立', color: 'text-green-400' },
  user: { text: '自チーム', color: 'text-emerald-400' },
};

const AbilityRankingScreen = () => {
  const [mode, setMode] = useState('player');
  const [category, setCategory] = useState('all');
  const [sortKey, setSortKey] = useState('overall');
  const [limit, setLimit] = useState(50);
  const [teamRankFilter, setTeamRankFilter] = useState('all');

  const { allPlayers, allTeamStats } = useMemo(() => {
    const players = [];
    const teamMap = {};

    for (const [teamName, team] of Object.entries(TEAMS_DATA)) {
      if (!team?.players) continue;
      const type = getTeamType(team);
      const rank = team.corporateData?.rank || team.universityData?.rank || null;

      const teamEntry = {
        name: teamName,
        abbr: getTeamAbbreviation(teamName),
        type,
        rank,
        count: 0, total: 0,
        pitchers: 0, pitcherTotal: 0,
        fielders: 0, fielderTotal: 0,
        topPlayers: [],
      };

      for (const p of team.players) {
        const overall = calcPlayerOverall(p);
        const entry = { ...p, teamName, teamAbbr: teamEntry.abbr, teamType: type, overall };
        players.push(entry);

        teamEntry.count++;
        teamEntry.total += overall;
        if (p.position === 'pitcher') { teamEntry.pitchers++; teamEntry.pitcherTotal += overall; }
        else { teamEntry.fielders++; teamEntry.fielderTotal += overall; }
        teamEntry.topPlayers.push({ name: p.name, position: p.position, overall, age: p.age });
      }

      teamEntry.avg = teamEntry.count > 0 ? teamEntry.total / teamEntry.count : 0;
      teamEntry.pitcherAvg = teamEntry.pitchers > 0 ? teamEntry.pitcherTotal / teamEntry.pitchers : 0;
      teamEntry.fielderAvg = teamEntry.fielders > 0 ? teamEntry.fielderTotal / teamEntry.fielders : 0;
      teamEntry.topPlayers.sort((a, b) => b.overall - a.overall);
      teamEntry.topPlayers = teamEntry.topPlayers.slice(0, 5);
      teamMap[teamName] = teamEntry;
    }

    return { allPlayers: players, allTeamStats: Object.values(teamMap) };
  }, [Object.keys(TEAMS_DATA).length]);

  const filteredPlayers = useMemo(() => {
    let list = allPlayers;
    if (category === 'pitcher') list = list.filter(p => p.position === 'pitcher');
    else if (category === 'fielder') list = list.filter(p => p.position !== 'pitcher');

    list = [...list].sort((a, b) => {
      if (sortKey === 'overall') return b.overall - a.overall;
      if (sortKey === 'meet') return (b.batting?.meet || 0) - (a.batting?.meet || 0);
      if (sortKey === 'power') return (b.batting?.power || 0) - (a.batting?.power || 0);
      if (sortKey === 'speed') return (b.physical?.speed || 0) - (a.physical?.speed || 0);
      if (sortKey === 'defense') return (b.fielding?.defense || 0) - (a.fielding?.defense || 0);
      if (sortKey === 'eye') return (b.batting?.eye || 0) - (a.batting?.eye || 0);
      if (sortKey === 'arm') return (b.physical?.arm || 0) - (a.physical?.arm || 0);
      if (sortKey === 'velocity') return (b.pitching?.velocity || 0) - (a.pitching?.velocity || 0);
      if (sortKey === 'control') return (b.pitching?.control || 0) - (a.pitching?.control || 0);
      if (sortKey === 'stamina') return (b.pitching?.stamina || 0) - (a.pitching?.stamina || 0);
      if (sortKey === 'age') return (a.age || 99) - (b.age || 99);
      return b.overall - a.overall;
    });

    return list.slice(0, limit);
  }, [allPlayers, category, sortKey, limit]);

  const filteredTeams = useMemo(() => {
    let list = allTeamStats;
    if (teamRankFilter !== 'all') {
      if (teamRankFilter === 'user') list = list.filter(t => t.type === 'user');
      else if (teamRankFilter === 'independent') list = list.filter(t => t.type === 'independent' || t.type === 'user');
      else if (teamRankFilter === 'corporate') list = list.filter(t => t.type === 'corporate');
      else list = list.filter(t => t.rank === teamRankFilter);
    }
    return [...list].sort((a, b) => b.avg - a.avg);
  }, [allTeamStats, teamRankFilter]);

  const sortOptions = category === 'pitcher'
    ? [{ key: 'overall', label: '総合' }, { key: 'velocity', label: '球速' }, { key: 'control', label: '制球' }, { key: 'stamina', label: 'スタミナ' }, { key: 'age', label: '年齢' }]
    : category === 'fielder'
    ? [{ key: 'overall', label: '総合' }, { key: 'meet', label: 'ミート' }, { key: 'power', label: 'パワー' }, { key: 'speed', label: '走力' }, { key: 'defense', label: '守備' }, { key: 'eye', label: '選球眼' }, { key: 'age', label: '年齢' }]
    : [{ key: 'overall', label: '総合' }, { key: 'age', label: '年齢' }];

  return (
    <div className="p-4 bg-gray-900 min-h-screen text-white">
      <h1 className="text-2xl font-bold mb-1">📰 総合ランキング</h1>
      <p className="text-gray-400 text-xs mb-4">全チーム・全選手の能力ランキング。注目度が高いほどドラフト上位指名の可能性あり</p>

      {/* モード切替: 選手 / チーム */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode('player')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
            mode === 'player' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >選手ランキング</button>
        <button
          onClick={() => setMode('team')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition ${
            mode === 'team' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >チームランキング</button>
      </div>

      {mode === 'player' ? (
        <>
          <div className="flex gap-1 mb-3">
            {[{ key: 'all', label: '全選手' }, { key: 'pitcher', label: '投手' }, { key: 'fielder', label: '野手' }].map(t => (
              <button key={t.key}
                onClick={() => { setCategory(t.key); setSortKey('overall'); }}
                className={`px-3 py-1.5 rounded text-sm font-bold transition ${
                  category === t.key ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >{t.label}</button>
            ))}
          </div>

          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs text-gray-500">ソート:</span>
            <div className="flex flex-wrap gap-1">
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
                  <th className="px-2 py-2 text-left">所属</th>
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
                {filteredPlayers.map((p, i) => {
                  const isPitcher = p.position === 'pitcher';
                  const typeInfo = TYPE_LABEL[p.teamType] || TYPE_LABEL.user;
                  return (
                    <tr key={`${p.id}-${i}`} className={`border-b border-gray-700/30 hover:bg-gray-700/30 ${i < 3 ? 'bg-gray-700/20' : ''}`}>
                      <td className="px-2 py-1.5 text-gray-500 text-xs">{i + 1}</td>
                      <td className="px-2 py-1.5 font-bold text-white text-xs">{p.name}</td>
                      <td className="px-2 py-1.5 text-center text-gray-400 text-xs">{POSITION_NAMES[p.position] || p.position}</td>
                      <td className="px-2 py-1.5 text-center text-gray-400 text-xs">{p.age}</td>
                      <td className="px-2 py-1.5 text-xs">
                        <span className={typeInfo.color}>{p.teamAbbr}</span>
                      </td>
                      <td className={`px-2 py-1.5 text-center font-bold ${getOverallColor(p.overall)}`}>{p.overall}</td>
                      {(category === 'all' || category === 'fielder') && <>
                        <td className={`px-2 py-1.5 text-center text-xs ${isPitcher ? 'text-gray-700' : getStatColor(p.batting?.meet || 0)}`}>{isPitcher ? '-' : p.batting?.meet || 0}</td>
                        <td className={`px-2 py-1.5 text-center text-xs ${isPitcher ? 'text-gray-700' : getStatColor(p.batting?.power || 0)}`}>{isPitcher ? '-' : p.batting?.power || 0}</td>
                        <td className={`px-2 py-1.5 text-center text-xs ${isPitcher ? 'text-gray-700' : getStatColor(p.physical?.speed || 0)}`}>{isPitcher ? '-' : p.physical?.speed || 0}</td>
                        <td className={`px-2 py-1.5 text-center text-xs ${isPitcher ? 'text-gray-700' : getStatColor(p.fielding?.defense || 0)}`}>{isPitcher ? '-' : p.fielding?.defense || 0}</td>
                        <td className={`px-2 py-1.5 text-center text-xs ${isPitcher ? 'text-gray-700' : getStatColor(p.batting?.eye || 0)}`}>{isPitcher ? '-' : p.batting?.eye || 0}</td>
                      </>}
                      {(category === 'all' || category === 'pitcher') && <>
                        <td className={`px-2 py-1.5 text-center text-xs ${!isPitcher ? 'text-gray-700' : getStatColor((p.pitching?.velocity || 130) - 100)}`}>{!isPitcher ? '-' : p.pitching?.velocity || 130}</td>
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
            全{allPlayers.length}選手中 上位{Math.min(limit, filteredPlayers.length)}名を表示
          </div>
        </>
      ) : (
        <>
          {/* チームランキング: ランク別フィルタ */}
          <div className="flex flex-wrap gap-1 mb-4">
            {[
              { key: 'all', label: '全チーム' },
              { key: 'independent', label: '独立リーグ' },
              { key: 'corporate', label: '社会人' },
              { key: 'S', label: 'Sランク' },
              { key: 'A', label: 'Aランク' },
              { key: 'B', label: 'Bランク' },
              { key: 'C', label: 'Cランク' },
              { key: 'D', label: 'Dランク' },
            ].map(t => (
              <button key={t.key}
                onClick={() => setTeamRankFilter(t.key)}
                className={`px-3 py-1.5 rounded text-xs font-bold transition ${
                  teamRankFilter === t.key
                    ? (RANK_COLORS[t.key] ? `bg-gray-700 ${RANK_COLORS[t.key]}` : 'bg-green-700 text-white')
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >{t.label}</button>
            ))}
          </div>

          <div className="space-y-2">
            {filteredTeams.map((team, i) => {
              const typeInfo = TYPE_LABEL[team.type] || TYPE_LABEL.user;
              const rankKey = team.rank || (team.type === 'user' ? 'B' : null);
              const bgClass = rankKey ? RANK_BG[rankKey] : 'bg-gray-800 border-gray-700/50';

              return (
                <div key={team.name} className={`rounded-lg border p-3 ${bgClass}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-xs w-6">{i + 1}.</span>
                      <span className="font-bold text-sm">{team.name}</span>
                      <span className={`text-xs ${typeInfo.color}`}>{typeInfo.text}</span>
                      {team.rank && <span className={`text-xs font-bold ${RANK_COLORS[team.rank]}`}>{team.rank}</span>}
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-gray-400">{team.count}人</span>
                      <span>
                        総合<span className={`font-bold ml-1 ${getOverallColor(team.avg)}`}>{team.avg.toFixed(1)}</span>
                      </span>
                      <span>
                        投手<span className={`ml-1 ${getOverallColor(team.pitcherAvg)}`}>{team.pitcherAvg.toFixed(1)}</span>
                      </span>
                      <span>
                        野手<span className={`ml-1 ${getOverallColor(team.fielderAvg)}`}>{team.fielderAvg.toFixed(1)}</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {team.topPlayers.map((tp, j) => (
                      <span key={j} className="text-xs bg-gray-900/50 px-2 py-0.5 rounded inline-flex items-center gap-1">
                        <span className="text-gray-500">{POSITION_NAMES[tp.position]}</span>
                        <span className="text-white">{tp.name}</span>
                        <span className={`font-bold ${getOverallColor(tp.overall)}`}>{tp.overall}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-xs text-gray-500 mt-3">
            {filteredTeams.length}チーム表示
          </div>
        </>
      )}
    </div>
  );
};

export default AbilityRankingScreen;
