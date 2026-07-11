import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { formatInnings } from '../utils/physics.js';
import { checkNPBDraftEligibility } from '../season/yearProgressionSystem.js';

const PlayerStatsScreen = ({ seasonData, allTeams, userTeamName }) => {
  const [statsTab, setStatsTab] = useState('season');
  const [statsType, setStatsType] = useState('batting');
  const [battingSortKey, setBattingSortKey] = useState('avg');
  const [battingSortDir, setBattingSortDir] = useState('desc');
  const [pitchingSortKey, setPitchingSortKey] = useState('era');
  const [pitchingSortDir, setPitchingSortDir] = useState('asc');

  const getAllPlayerStats = () => {
    const seen = new Set();
    const allPlayers = [];
    Object.keys(TEAMS_DATA || {}).forEach(teamName => {
      const team = TEAMS_DATA[teamName];
      team.players.forEach(player => {
        if (player.id != null && seen.has(player.id)) return;
        if (player.id != null) seen.add(player.id);
        allPlayers.push({ ...player, teamName: team.name });
      });
    });
    return allPlayers;
  };

  const allPlayers = getAllPlayerStats();

  const handleBattingSort = (key) => {
    if (battingSortKey === key) {
      setBattingSortDir(battingSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setBattingSortKey(key);
      setBattingSortDir(['strikeouts', 'errors'].includes(key) ? 'asc' : 'desc');
    }
  };

  const handlePitchingSort = (key) => {
    if (pitchingSortKey === key) {
      setPitchingSortDir(pitchingSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setPitchingSortKey(key);
      setPitchingSortDir(['era', 'runsAllowed', 'walks', 'whip'].includes(key) ? 'asc' : 'desc');
    }
  };

  const getCombinedCareer = (p, type) => {
    const career = p.careerStats?.[type] || {};
    const season = p.seasonStats?.[type] || {};
    const combined = {};
    const keys = new Set([...Object.keys(career), ...Object.keys(season)]);
    keys.forEach(key => { combined[key] = (career[key] || 0) + (season[key] || 0); });
    return combined;
  };

  const battingStats = allPlayers
    .filter(p => {
      const stats = statsTab === 'season' ? p.seasonStats?.batting : getCombinedCareer(p, 'batting');
      return stats && stats.atBats > 0;
    })
    .map(p => {
      const stats = statsTab === 'season' ? p.seasonStats.batting : getCombinedCareer(p, 'batting');
      const avg = stats.atBats > 0 ? (stats.hits / stats.atBats) : 0;
      const pa = stats.atBats + (stats.walks || 0);
      const obp = pa > 0 ? ((stats.hits + (stats.walks || 0)) / pa) : 0;
      const singles = stats.hits - (stats.doubles || 0) - (stats.triples || 0) - stats.homeruns;
      const slg = stats.atBats > 0 ? ((singles + (stats.doubles || 0) * 2 + (stats.triples || 0) * 3 + stats.homeruns * 4) / stats.atBats) : 0;
      const ops = obp + slg;
      const fieldingPct = (stats.fieldingChances || 0) > 0 ? ((stats.fieldingChances - (stats.errors || 0)) / stats.fieldingChances) : 0;
      return { ...p, stats, avg, obp, slg, ops, fieldingPct };
    })
    .sort((a, b) => {
      let valA, valB;
      if (battingSortKey === 'avg') { valA = a.avg; valB = b.avg; }
      else if (battingSortKey === 'ops') { valA = a.ops; valB = b.ops; }
      else if (battingSortKey === 'obp') { valA = a.obp; valB = b.obp; }
      else if (battingSortKey === 'fieldingPct') { valA = a.fieldingPct; valB = b.fieldingPct; }
      else { valA = a.stats[battingSortKey] || 0; valB = b.stats[battingSortKey] || 0; }
      return battingSortDir === 'asc' ? valA - valB : valB - valA;
    })
    .slice(0, 20);

  const pitchingStats = allPlayers
    .filter(p => {
      const stats = statsTab === 'season' ? p.seasonStats?.pitching : getCombinedCareer(p, 'pitching');
      return stats && stats.inningsPitched > 0;
    })
    .map(p => {
      const stats = statsTab === 'season' ? p.seasonStats.pitching : getCombinedCareer(p, 'pitching');
      const era = stats.inningsPitched > 0 ? (stats.earnedRuns * 27) / stats.inningsPitched : 0;
      const ip = formatInnings(stats.inningsPitched);
      const innings = stats.inningsPitched / 3;
      const whip = innings > 0 ? ((stats.walks || 0) + (stats.hits || 0)) / innings : 0;
      const kbb = (stats.walks || 0) > 0 ? (stats.strikeouts / stats.walks) : stats.strikeouts > 0 ? 99.9 : 0;
      return { ...p, stats, era, ip, whip, kbb };
    })
    .sort((a, b) => {
      let valA, valB;
      if (pitchingSortKey === 'era') { valA = a.era; valB = b.era; }
      else if (pitchingSortKey === 'whip') { valA = a.whip; valB = b.whip; }
      else if (pitchingSortKey === 'kbb') { valA = a.kbb; valB = b.kbb; }
      else if (pitchingSortKey === 'inningsPitched') { valA = a.stats.inningsPitched || 0; valB = b.stats.inningsPitched || 0; }
      else { valA = a.stats[pitchingSortKey] || 0; valB = b.stats[pitchingSortKey] || 0; }
      return pitchingSortDir === 'asc' ? valA - valB : valB - valA;
    })
    .slice(0, 20);

  const SortableHeader = ({ label, sortKey, currentKey, currentDir, onClick, align = 'right' }) => (
    <th
      className={`py-1.5 px-1.5 text-${align} cursor-pointer hover:bg-gray-600/50 transition text-xs ${currentKey === sortKey ? 'text-yellow-400' : 'text-gray-500'}`}
      onClick={() => onClick(sortKey)}
    >
      {label} {currentKey === sortKey && (currentDir === 'asc' ? '▲' : '▼')}
    </th>
  );

  // --- 成長グラフ用データ ---
  const GROWTH_STATS_FIELDER = [
    { key: 'meet',    label: 'ミート',  color: '#60a5fa' },
    { key: 'power',   label: 'パワー',  color: '#f87171' },
    { key: 'speed',   label: '走力',    color: '#34d399' },
    { key: 'defense', label: '守備',    color: '#a78bfa' },
  ];
  const GROWTH_STATS_PITCHER = [
    { key: 'velocity', label: '球速',   color: '#f87171' },
    { key: 'control',  label: '制球',   color: '#60a5fa' },
    { key: 'stamina',  label: 'スタミナ',color: '#34d399' },
  ];

  const Sparkline = ({ history, statKey, color, width = 80, height = 28 }) => {
    if (!history || history.length < 2) return <span className="text-gray-700 text-xs">-</span>;
    const vals = history.map(h => h[statKey] || 0);
    const min = Math.max(0, Math.min(...vals) - 5);
    const max = Math.min(100, Math.max(...vals) + 5);
    const range = max - min || 1;
    const pts = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');
    const last = vals[vals.length - 1];
    const prev = vals[vals.length - 2];
    const delta = last - prev;
    return (
      <div className="flex items-center gap-1.5">
        <svg width={width} height={height} className="shrink-0">
          <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
          {vals.map((v, i) => (
            <circle key={i} cx={(i / (vals.length - 1)) * width} cy={height - ((v - min) / range) * height}
              r="2" fill={i === vals.length - 1 ? color : 'transparent'} />
          ))}
        </svg>
        <span className="text-xs font-semibold" style={{ color }}>{last}</span>
        {delta !== 0 && (
          <span className={`text-xs ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </div>
    );
  };

  const growthPlayers = userTeamName
    ? (allTeams[userTeamName]?.players || Object.values(TEAMS_DATA || {})[0]?.players || [])
    : [];

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold text-white">選手成績</h1>
        <div className="flex gap-1">
          <button
            onClick={() => setStatsTab('growth')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition ${
              statsTab === 'growth' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            成長
          </button>
          <div className="w-px bg-gray-600 mx-1"></div>
          <button
            onClick={() => setStatsTab('season')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition ${
              statsTab === 'season' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            シーズン
          </button>
          <button
            onClick={() => setStatsTab('career')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition ${
              statsTab === 'career' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            通算
          </button>
          <div className="w-px bg-gray-600 mx-1"></div>
          <button
            onClick={() => setStatsType('batting')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition ${
              statsType === 'batting' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            野手
          </button>
          <button
            onClick={() => setStatsType('pitching')}
            className={`px-3 py-1 rounded-md text-xs font-bold transition ${
              statsType === 'pitching' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            投手
          </button>
        </div>
      </div>

      {statsTab === 'growth' && (
        <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700/50">
            <h2 className="text-sm font-semibold text-white">自チーム選手 能力成長履歴</h2>
            <p className="text-xs text-gray-500 mt-0.5">キャンプ完了時にスナップショットを記録。2年目以降から表示されます。</p>
          </div>
          {growthPlayers.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-sm">選手データがありません</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-gray-800 border-b border-gray-700/50 text-xs text-gray-400">
                    <th className="py-2 px-3 font-medium">選手</th>
                    <th className="py-2 px-2 font-medium">守備</th>
                    <th className="py-2 px-2 font-medium text-center">齢</th>
                    <th className="py-2 px-2 font-medium text-blue-400/80">ミート</th>
                    <th className="py-2 px-2 font-medium text-red-400/80">パワー</th>
                    <th className="py-2 px-2 font-medium text-green-400/80">走力</th>
                    <th className="py-2 px-2 font-medium text-purple-400/80">守備</th>
                    <th className="py-2 px-2 font-medium text-red-400/80 border-l border-gray-700/40">球速</th>
                    <th className="py-2 px-2 font-medium text-blue-400/80">制球</th>
                    <th className="py-2 px-2 font-medium text-green-400/80">スタミナ</th>
                    <th className="py-2 px-2 font-medium text-gray-500 border-l border-gray-700/40">履歴</th>
                  </tr>
                </thead>
                <tbody>
                  {growthPlayers.map((player, i) => {
                    const isPitcher = player.position === 'pitcher';
                    const hist = player.growthHistory || [];
                    const keyStats = isPitcher ? GROWTH_STATS_PITCHER : GROWTH_STATS_FIELDER;
                    const POSITION_NAMES_LOCAL = { pitcher: '投', catcher: '捕', first: '一', second: '二', third: '三', short: '遊', left: '左', center: '中', right: '右' };
                    return (
                      <tr key={player.id || i} className="border-b border-gray-700/30 hover:bg-gray-700/30 transition">
                        <td className="py-1.5 px-3 font-bold text-white">{player.name}</td>
                        <td className="py-1.5 px-2 text-gray-400">{POSITION_NAMES_LOCAL[player.position] || player.position}</td>
                        <td className="py-1.5 px-2 text-gray-500 text-center">{player.age}</td>
                        {/* 野手能力 */}
                        <td className="py-1.5 px-2 text-blue-300">{player.batting?.meet || 0}</td>
                        <td className="py-1.5 px-2 text-red-300">{player.batting?.power || 0}</td>
                        <td className="py-1.5 px-2 text-green-300">{player.physical?.speed || 0}</td>
                        <td className="py-1.5 px-2 text-purple-300">{player.fielding?.defense || 0}</td>
                        {/* 投手能力 */}
                        <td className="py-1.5 px-2 text-red-300 border-l border-gray-700/30">{player.pitching?.velocity || 0}</td>
                        <td className="py-1.5 px-2 text-blue-300">{player.pitching?.control || 0}</td>
                        <td className="py-1.5 px-2 text-green-300">{player.pitching?.stamina || 0}</td>
                        {/* スパークライン */}
                        <td className="py-1.5 px-2 border-l border-gray-700/30">
                          {hist.length >= 2 ? (
                            <div className="flex flex-col gap-0.5">
                              {keyStats.map(s => (
                                <div key={s.key} className="flex items-center gap-1">
                                  <span className="text-xs text-gray-600 w-6">{s.label.slice(0,2)}</span>
                                  <Sparkline history={hist} statKey={s.key} color={s.color} />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-700 text-xs">2年目以降</span>
                          )}
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

      {statsType === 'batting' && (
        <div className="bg-gray-800 rounded-lg p-3">
          <h2 className="text-sm font-bold mb-2 text-white">
            {statsTab === 'season' ? 'シーズン' : '通算'}野手成績 (上位20)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-white text-xs">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="py-1.5 px-1.5 text-left text-xs text-gray-500">#</th>
                  <th className="py-1.5 px-1.5 text-left text-xs text-gray-500">選手</th>
                  <th className="py-1.5 px-1.5 text-left text-xs text-gray-500">チーム</th>
                  <SortableHeader label="試" sortKey="games" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="打席" sortKey="atBats" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="安打" sortKey="hits" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="HR" sortKey="homeruns" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="打点" sortKey="rbis" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="盗塁" sortKey="stolenBases" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="四球" sortKey="walks" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="三振" sortKey="strikeouts" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="打率" sortKey="avg" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="出塁" sortKey="obp" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="OPS" sortKey="ops" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="守備率" sortKey="fieldingPct" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="E" sortKey="errors" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                </tr>
              </thead>
              <tbody>
                {battingStats.map((player, index) => {
                  const draftCheck = statsTab === 'career' ? checkNPBDraftEligibility(player) : { isDraftEligible: false, reasons: [] };
                  return (
                    <tr key={player.id + player.teamName} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="py-1.5 px-1.5 text-gray-500">{index + 1}</td>
                      <td className="py-1.5 px-1.5 font-bold">
                        {player.name}
                        {draftCheck.isDraftEligible && (
                          <span className="ml-1 text-xs bg-purple-600 text-white px-1.5 rounded" title={draftCheck.reasons.join(', ')}>NPB</span>
                        )}
                      </td>
                      <td className="py-1.5 px-1.5 text-gray-400">{player.teamName}</td>
                      <td className="py-1.5 px-1.5 text-right text-gray-400">{player.stats.games}</td>
                      <td className="py-1.5 px-1.5 text-right text-gray-400">{player.stats.atBats}</td>
                      <td className="py-1.5 px-1.5 text-right">{player.stats.hits}</td>
                      <td className="py-1.5 px-1.5 text-right">{player.stats.homeruns}</td>
                      <td className="py-1.5 px-1.5 text-right">{player.stats.rbis}</td>
                      <td className="py-1.5 px-1.5 text-right">{player.stats.stolenBases || 0}</td>
                      <td className="py-1.5 px-1.5 text-right text-gray-400">{player.stats.walks}</td>
                      <td className="py-1.5 px-1.5 text-right text-gray-400">{player.stats.strikeouts}</td>
                      <td className="py-1.5 px-1.5 text-right font-bold text-yellow-400">{player.avg.toFixed(3)}</td>
                      <td className="py-1.5 px-1.5 text-right text-gray-300">{player.obp.toFixed(3)}</td>
                      <td className="py-1.5 px-1.5 text-right font-bold text-cyan-400">{player.ops.toFixed(3)}</td>
                      <td className="py-1.5 px-1.5 text-right text-gray-300">{(player.stats.fieldingChances || 0) > 0 ? player.fieldingPct.toFixed(3) : '-'}</td>
                      <td className="py-1.5 px-1.5 text-right text-gray-400">{player.stats.errors || 0}</td>
                    </tr>
                  );
                })}
                {battingStats.length === 0 && (
                  <tr>
                    <td colSpan="16" className="py-6 text-center text-gray-500 text-sm">
                      まだ野手成績がありません。試合を進行してください。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {statsType === 'pitching' && (
        <div className="bg-gray-800 rounded-lg p-3">
          <h2 className="text-sm font-bold mb-2 text-white">
            {statsTab === 'season' ? 'シーズン' : '通算'}投手成績 (上位20)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-white text-xs">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="py-1.5 px-1.5 text-left text-xs text-gray-500">#</th>
                  <th className="py-1.5 px-1.5 text-left text-xs text-gray-500">選手</th>
                  <th className="py-1.5 px-1.5 text-left text-xs text-gray-500">チーム</th>
                  <SortableHeader label="試" sortKey="games" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="勝" sortKey="wins" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="敗" sortKey="losses" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="H" sortKey="holds" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="S" sortKey="saves" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="回" sortKey="inningsPitched" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="失点" sortKey="runsAllowed" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="K" sortKey="strikeouts" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="BB" sortKey="walks" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="防御率" sortKey="era" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="WHIP" sortKey="whip" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="K/BB" sortKey="kbb" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="QS" sortKey="qualityStarts" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="HQS" sortKey="highQualityStarts" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                </tr>
              </thead>
              <tbody>
                {pitchingStats.map((player, index) => {
                  const draftCheck = statsTab === 'career' ? checkNPBDraftEligibility(player) : { isDraftEligible: false, reasons: [] };
                  return (
                    <tr key={player.id + player.teamName} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="py-1.5 px-1.5 text-gray-500">{index + 1}</td>
                      <td className="py-1.5 px-1.5 font-bold">
                        {player.name}
                        {draftCheck.isDraftEligible && (
                          <span className="ml-1 text-xs bg-purple-600 text-white px-1.5 rounded" title={draftCheck.reasons.join(', ')}>NPB</span>
                        )}
                      </td>
                      <td className="py-1.5 px-1.5 text-gray-400">{player.teamName}</td>
                      <td className="py-1.5 px-1.5 text-right text-gray-400">{player.stats.games}</td>
                      <td className="py-1.5 px-1.5 text-right">{player.stats.wins}</td>
                      <td className="py-1.5 px-1.5 text-right">{player.stats.losses}</td>
                      <td className="py-1.5 px-1.5 text-right text-gray-400">{player.stats.holds || 0}</td>
                      <td className="py-1.5 px-1.5 text-right text-gray-400">{player.stats.saves || 0}</td>
                      <td className="py-1.5 px-1.5 text-right">{player.ip}</td>
                      <td className="py-1.5 px-1.5 text-right text-gray-400">{player.stats.runsAllowed}</td>
                      <td className="py-1.5 px-1.5 text-right">{player.stats.strikeouts}</td>
                      <td className="py-1.5 px-1.5 text-right text-gray-400">{player.stats.walks}</td>
                      <td className="py-1.5 px-1.5 text-right font-bold text-yellow-400">{player.era.toFixed(2)}</td>
                      <td className="py-1.5 px-1.5 text-right text-cyan-400">{player.whip.toFixed(2)}</td>
                      <td className="py-1.5 px-1.5 text-right">{player.kbb >= 99 ? '-' : player.kbb.toFixed(2)}</td>
                      <td className="py-1.5 px-1.5 text-right text-gray-300">{player.stats.qualityStarts || 0}</td>
                      <td className="py-1.5 px-1.5 text-right text-gray-300">{player.stats.highQualityStarts || 0}</td>
                    </tr>
                  );
                })}
                {pitchingStats.length === 0 && (
                  <tr>
                    <td colSpan="17" className="py-6 text-center text-gray-500 text-sm">
                      まだ投手成績がありません。試合を進行してください。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlayerStatsScreen;
