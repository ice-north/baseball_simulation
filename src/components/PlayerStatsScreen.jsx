import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { formatInnings } from '../utils/physics.js';
import { checkNPBDraftEligibility } from '../season/yearProgressionSystem.js';

const PlayerStatsScreen = ({ seasonData, allTeams }) => {
  const [statsTab, setStatsTab] = useState('season');
  const [statsType, setStatsType] = useState('batting');
  const [battingSortKey, setBattingSortKey] = useState('avg');
  const [battingSortDir, setBattingSortDir] = useState('desc');
  const [pitchingSortKey, setPitchingSortKey] = useState('era');
  const [pitchingSortDir, setPitchingSortDir] = useState('asc');

  const getAllPlayerStats = () => {
    const allPlayers = [];
    Object.keys(TEAMS_DATA || {}).forEach(teamName => {
      const team = TEAMS_DATA[teamName];
      team.players.forEach(player => {
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

  const battingStats = allPlayers
    .filter(p => {
      const stats = statsTab === 'season' ? p.seasonStats?.batting : p.careerStats?.batting;
      return stats && stats.atBats > 0;
    })
    .map(p => {
      const stats = statsTab === 'season' ? p.seasonStats.batting : p.careerStats.batting;
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
      const stats = statsTab === 'season' ? p.seasonStats?.pitching : p.careerStats?.pitching;
      return stats && stats.inningsPitched > 0;
    })
    .map(p => {
      const stats = statsTab === 'season' ? p.seasonStats.pitching : p.careerStats.pitching;
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
      className={`py-1.5 px-1.5 text-${align} cursor-pointer hover:bg-gray-600/50 transition text-[10px] ${currentKey === sortKey ? 'text-yellow-400' : 'text-gray-500'}`}
      onClick={() => onClick(sortKey)}
    >
      {label} {currentKey === sortKey && (currentDir === 'asc' ? '▲' : '▼')}
    </th>
  );

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold text-white">選手成績</h1>
        <div className="flex gap-1">
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

      {statsType === 'batting' && (
        <div className="bg-gray-800 rounded-lg p-3">
          <h2 className="text-sm font-bold mb-2 text-white">
            {statsTab === 'season' ? 'シーズン' : '通算'}野手成績 (上位20)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-white text-xs">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="py-1.5 px-1.5 text-left text-[10px] text-gray-500">#</th>
                  <th className="py-1.5 px-1.5 text-left text-[10px] text-gray-500">選手</th>
                  <th className="py-1.5 px-1.5 text-left text-[10px] text-gray-500">チーム</th>
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
                          <span className="ml-1 text-[9px] bg-purple-600 text-white px-1 rounded" title={draftCheck.reasons.join(', ')}>NPB</span>
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
                    <td colSpan="16" className="py-6 text-center text-gray-600 text-sm">
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
                  <th className="py-1.5 px-1.5 text-left text-[10px] text-gray-500">#</th>
                  <th className="py-1.5 px-1.5 text-left text-[10px] text-gray-500">選手</th>
                  <th className="py-1.5 px-1.5 text-left text-[10px] text-gray-500">チーム</th>
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
                          <span className="ml-1 text-[9px] bg-purple-600 text-white px-1 rounded" title={draftCheck.reasons.join(', ')}>NPB</span>
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
                    <td colSpan="17" className="py-6 text-center text-gray-600 text-sm">
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
