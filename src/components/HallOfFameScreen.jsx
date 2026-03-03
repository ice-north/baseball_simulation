import React, { useState, useMemo } from 'react';

const HallOfFameScreen = ({ hallOfFamePlayers = [], allTeams = {}, onClose }) => {
  const [activeTab, setActiveTab] = useState('draft');
  const [statCategory, setStatCategory] = useState('avg');

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
    Object.entries(allTeams).forEach(([teamName, team]) => {
      if (!team?.players) return;
      team.players.forEach(p => {
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

  return (
    <div className="p-4 bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* ヘッダー + タブ */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-yellow-400">選手記録</h1>
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
                      return (
                        <tr key={idx} className={`border-b border-gray-700/50 ${player.hallOfFame ? 'bg-yellow-900/20' : ''}`}>
                          <td className="py-1.5 px-2 text-gray-500">{player.year || '-'}年目</td>
                          <td className="py-1.5 px-2">
                            <span className={`font-bold ${isP ? 'text-red-400' : 'text-blue-300'}`}>
                              {player.hallOfFame && '🏛️ '}{player.name}
                            </span>
                          </td>
                          <td className="py-1.5 px-1 text-center text-gray-500">{getPositionName(player.position)}</td>
                          <td className="py-1.5 px-1 text-center text-gray-500">{player.age}</td>
                          <td className="py-1.5 px-2 text-gray-400">{player.teamName || player.team}</td>
                          <td className="py-1.5 px-2 text-yellow-400 font-bold">{player.npbTeam || '-'}</td>
                          <td className="py-1.5 px-2 text-right text-gray-300 font-mono text-[10px]">{mainStat}</td>
                        </tr>
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
