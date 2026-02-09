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
      setBattingSortDir(['strikeouts'].includes(key) ? 'asc' : 'desc');
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
      // OPS計算: OBP(出塁率) + SLG(長打率)
      const pa = stats.atBats + (stats.walks || 0); // 打席数（簡易版: 打数+四球）
      const obp = pa > 0 ? ((stats.hits + (stats.walks || 0)) / pa) : 0;
      const singles = stats.hits - (stats.doubles || 0) - (stats.triples || 0) - stats.homeruns;
      const slg = stats.atBats > 0 ? ((singles + (stats.doubles || 0) * 2 + (stats.triples || 0) * 3 + stats.homeruns * 4) / stats.atBats) : 0;
      const ops = obp + slg;
      return { ...p, stats, avg, obp, slg, ops };
    })
    .sort((a, b) => {
      let valA, valB;
      if (battingSortKey === 'avg') {
        valA = a.avg; valB = b.avg;
      } else if (battingSortKey === 'ops') {
        valA = a.ops; valB = b.ops;
      } else if (battingSortKey === 'obp') {
        valA = a.obp; valB = b.obp;
      } else {
        valA = a.stats[battingSortKey] || 0;
        valB = b.stats[battingSortKey] || 0;
      }
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
      // WHIP = (与四球 + 被安打) / 投球回
      const innings = stats.inningsPitched / 3; // アウト数→投球回
      const whip = innings > 0 ? ((stats.walks || 0) + (stats.hits || 0)) / innings : 0;
      // K/BB = 奪三振 / 与四球
      const kbb = (stats.walks || 0) > 0 ? (stats.strikeouts / stats.walks) : stats.strikeouts > 0 ? 99.9 : 0;
      return { ...p, stats, era, ip, whip, kbb };
    })
    .sort((a, b) => {
      let valA, valB;
      if (pitchingSortKey === 'era') {
        valA = a.era; valB = b.era;
      } else if (pitchingSortKey === 'whip') {
        valA = a.whip; valB = b.whip;
      } else if (pitchingSortKey === 'kbb') {
        valA = a.kbb; valB = b.kbb;
      } else if (pitchingSortKey === 'inningsPitched') {
        valA = a.stats.inningsPitched || 0; valB = b.stats.inningsPitched || 0;
      } else {
        valA = a.stats[pitchingSortKey] || 0;
        valB = b.stats[pitchingSortKey] || 0;
      }
      return pitchingSortDir === 'asc' ? valA - valB : valB - valA;
    })
    .slice(0, 20);

  const SortableHeader = ({ label, sortKey, currentKey, currentDir, onClick, align = 'right' }) => (
    <th
      className={`py-2 px-3 text-${align} cursor-pointer hover:bg-gray-600 transition ${currentKey === sortKey ? 'text-yellow-400' : ''}`}
      onClick={() => onClick(sortKey)}
    >
      {label} {currentKey === sortKey && (currentDir === 'asc' ? '▲' : '▼')}
    </th>
  );

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6 text-white">選手成績</h1>

      <div className="mb-6 flex gap-4">
        <button
          onClick={() => setStatsTab('season')}
          className={`px-6 py-3 rounded font-bold transition ${
            statsTab === 'season' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          シーズン成績
        </button>
        <button
          onClick={() => setStatsTab('career')}
          className={`px-6 py-3 rounded font-bold transition ${
            statsTab === 'career' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          通算成績
        </button>
      </div>

      <div className="mb-6 flex gap-4">
        <button
          onClick={() => setStatsType('batting')}
          className={`px-6 py-3 rounded font-bold transition ${
            statsType === 'batting' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          野手成績
        </button>
        <button
          onClick={() => setStatsType('pitching')}
          className={`px-6 py-3 rounded font-bold transition ${
            statsType === 'pitching' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          投手成績
        </button>
      </div>

      {statsType === 'batting' && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-white">
            {statsTab === 'season' ? 'シーズン' : '通算'}野手成績 (上位20名)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-white text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="py-2 px-3 text-left">#</th>
                  <th className="py-2 px-3 text-left">選手名</th>
                  <th className="py-2 px-3 text-left">チーム</th>
                  <SortableHeader label="試合" sortKey="games" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="打席" sortKey="atBats" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="安打" sortKey="hits" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="本塁打" sortKey="homeruns" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="打点" sortKey="rbis" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="盗塁" sortKey="stolenBases" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="四球" sortKey="walks" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="三振" sortKey="strikeouts" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="打率" sortKey="avg" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="出塁率" sortKey="obp" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="OPS" sortKey="ops" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                </tr>
              </thead>
              <tbody>
                {battingStats.map((player, index) => {
                  const draftCheck = statsTab === 'career' ? checkNPBDraftEligibility(player) : { isDraftEligible: false, reasons: [] };
                  return (
                    <tr key={player.id + player.teamName} className="border-b border-gray-700 hover:bg-gray-700">
                      <td className="py-2 px-3">{index + 1}</td>
                      <td className="py-2 px-3 font-bold">
                        {player.name}
                        {draftCheck.isDraftEligible && (
                          <span className="ml-2 text-xs bg-purple-600 text-white px-1 rounded" title={draftCheck.reasons.join(', ')}>NPB</span>
                        )}
                      </td>
                      <td className="py-2 px-3">{player.teamName}</td>
                      <td className="py-2 px-3 text-right">{player.stats.games}</td>
                      <td className="py-2 px-3 text-right">{player.stats.atBats}</td>
                      <td className="py-2 px-3 text-right">{player.stats.hits}</td>
                      <td className="py-2 px-3 text-right">{player.stats.homeruns}</td>
                      <td className="py-2 px-3 text-right">{player.stats.rbis}</td>
                      <td className="py-2 px-3 text-right">{player.stats.stolenBases || 0}</td>
                      <td className="py-2 px-3 text-right">{player.stats.walks}</td>
                      <td className="py-2 px-3 text-right">{player.stats.strikeouts}</td>
                      <td className="py-2 px-3 text-right font-bold text-yellow-400">{player.avg.toFixed(3)}</td>
                      <td className="py-2 px-3 text-right">{player.obp.toFixed(3)}</td>
                      <td className="py-2 px-3 text-right font-bold text-cyan-400">{player.ops.toFixed(3)}</td>
                    </tr>
                  );
                })}
                {battingStats.length === 0 && (
                  <tr>
                    <td colSpan="14" className="py-8 text-center text-gray-500">
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
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-white">
            {statsTab === 'season' ? 'シーズン' : '通算'}投手成績 (上位20名)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-white text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="py-2 px-3 text-left">#</th>
                  <th className="py-2 px-3 text-left">選手名</th>
                  <th className="py-2 px-3 text-left">チーム</th>
                  <SortableHeader label="試合" sortKey="games" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="勝" sortKey="wins" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="敗" sortKey="losses" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="H" sortKey="holds" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="S" sortKey="saves" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="回数" sortKey="inningsPitched" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="失点" sortKey="runsAllowed" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="奪三振" sortKey="strikeouts" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="与四球" sortKey="walks" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="防御率" sortKey="era" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="WHIP" sortKey="whip" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="K/BB" sortKey="kbb" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                </tr>
              </thead>
              <tbody>
                {pitchingStats.map((player, index) => {
                  const draftCheck = statsTab === 'career' ? checkNPBDraftEligibility(player) : { isDraftEligible: false, reasons: [] };
                  return (
                    <tr key={player.id + player.teamName} className="border-b border-gray-700 hover:bg-gray-700">
                      <td className="py-2 px-3">{index + 1}</td>
                      <td className="py-2 px-3 font-bold">
                        {player.name}
                        {draftCheck.isDraftEligible && (
                          <span className="ml-2 text-xs bg-purple-600 text-white px-1 rounded" title={draftCheck.reasons.join(', ')}>NPB</span>
                        )}
                      </td>
                      <td className="py-2 px-3">{player.teamName}</td>
                      <td className="py-2 px-3 text-right">{player.stats.games}</td>
                      <td className="py-2 px-3 text-right">{player.stats.wins}</td>
                      <td className="py-2 px-3 text-right">{player.stats.losses}</td>
                      <td className="py-2 px-3 text-right">{player.stats.holds || 0}</td>
                      <td className="py-2 px-3 text-right">{player.stats.saves || 0}</td>
                      <td className="py-2 px-3 text-right">{player.ip}</td>
                      <td className="py-2 px-3 text-right">{player.stats.runsAllowed}</td>
                      <td className="py-2 px-3 text-right">{player.stats.strikeouts}</td>
                      <td className="py-2 px-3 text-right">{player.stats.walks}</td>
                      <td className="py-2 px-3 text-right font-bold text-yellow-400">{player.era.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-cyan-400">{player.whip.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right">{player.kbb >= 99 ? '-' : player.kbb.toFixed(2)}</td>
                    </tr>
                  );
                })}
                {pitchingStats.length === 0 && (
                  <tr>
                    <td colSpan="15" className="py-8 text-center text-gray-500">
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
