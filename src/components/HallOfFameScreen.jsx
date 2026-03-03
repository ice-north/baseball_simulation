import React, { useState, useMemo } from 'react';

/**
 * 選手記録画面（旧殿堂入り画面）
 * タブ1: ドラフト指名選手一覧
 * タブ2: 通算成績ランキング
 */
const HallOfFameScreen = ({ hallOfFamePlayers = [], allTeams = {}, onClose }) => {
  const [activeTab, setActiveTab] = useState('draft');
  const [statCategory, setStatCategory] = useState('avg');

  const getPositionName = (pos) => {
    const names = {
      pitcher: '投手', catcher: '捕手', first: '一塁手', second: '二塁手',
      third: '三塁手', short: '遊撃手', left: '左翼手', center: '中堅手', right: '右翼手'
    };
    return names[pos] || pos;
  };

  // ドラフト指名選手（departureType === 'npb_drafted' または reason に NPBドラフト）
  const draftedPlayers = useMemo(() =>
    hallOfFamePlayers.filter(p =>
      p.departureType === 'npb_drafted' || (p.reason && p.reason.includes('NPBドラフト'))
    ).sort((a, b) => (b.year || 0) - (a.year || 0)),
    [hallOfFamePlayers]
  );

  // 通算成績: 過去の選手 + 現在の全チーム選手を統合
  const allPlayersForStats = useMemo(() => {
    const players = [];
    // 過去の選手（引退＋ドラフト指名）
    hallOfFamePlayers.forEach(p => {
      if (p.careerStats) {
        players.push({
          name: p.name,
          position: p.position,
          teamName: p.teamName || p.team,
          careerStats: p.careerStats,
          status: p.departureType === 'npb_drafted' ? 'NPB' : '引退',
          age: p.age,
          yearsPlayed: p.yearsPlayed
        });
      }
    });
    // 現役選手
    Object.entries(allTeams).forEach(([teamName, team]) => {
      if (!team?.players) return;
      team.players.forEach(p => {
        if (p.careerStats) {
          players.push({
            name: p.name,
            position: p.position,
            teamName,
            careerStats: p.careerStats,
            status: '現役',
            age: p.age,
            yearsPlayed: p.yearsPlayed
          });
        }
      });
    });
    return players;
  }, [hallOfFamePlayers, allTeams]);

  // 打撃成績カテゴリ
  const battingCategories = [
    { key: 'avg', label: '打率', getValue: (s) => {
      const ab = s.batting?.atBats || 0;
      return ab >= 30 ? (s.batting?.hits || 0) / ab : 0;
    }, format: (v) => v > 0 ? v.toFixed(3) : '.000', minAB: 30 },
    { key: 'hits', label: '安打', getValue: (s) => s.batting?.hits || 0, format: (v) => v },
    { key: 'homeruns', label: '本塁打', getValue: (s) => s.batting?.homeruns || 0, format: (v) => v },
    { key: 'rbis', label: '打点', getValue: (s) => s.batting?.rbis || 0, format: (v) => v },
    { key: 'stolenBases', label: '盗塁', getValue: (s) => s.batting?.stolenBases || 0, format: (v) => v },
    { key: 'atBats', label: '打数', getValue: (s) => s.batting?.atBats || 0, format: (v) => v },
  ];

  // 投手成績カテゴリ
  const pitchingCategories = [
    { key: 'era', label: '防御率', getValue: (s) => {
      const ip = s.pitching?.inningsPitched || 0;
      return ip >= 10 ? ((s.pitching?.earnedRuns || 0) / ip) * 9 : 999;
    }, format: (v) => v < 999 ? v.toFixed(2) : '-', ascending: true, minIP: 10 },
    { key: 'wins', label: '勝利', getValue: (s) => s.pitching?.wins || 0, format: (v) => v },
    { key: 'saves', label: 'セーブ', getValue: (s) => s.pitching?.saves || 0, format: (v) => v },
    { key: 'strikeouts', label: '奪三振', getValue: (s) => s.pitching?.strikeouts || 0, format: (v) => v },
    { key: 'inningsPitched', label: '投球回', getValue: (s) => s.pitching?.inningsPitched || 0, format: (v) => v.toFixed(1) },
  ];

  const allCategories = [...battingCategories, ...pitchingCategories];
  const currentCategory = allCategories.find(c => c.key === statCategory) || battingCategories[0];

  // ランキング生成
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
    return 'text-gray-400';
  };

  return (
    <div className="p-4 bg-gray-900 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-yellow-400 mb-4 text-center">
          選手記録
        </h1>

        {/* タブ */}
        <div className="flex gap-2 mb-4 justify-center">
          <button
            onClick={() => setActiveTab('draft')}
            className={`px-6 py-2 rounded-lg font-bold transition ${
              activeTab === 'draft'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            ドラフト指名選手
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-6 py-2 rounded-lg font-bold transition ${
              activeTab === 'stats'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            通算成績ランキング
          </button>
        </div>

        {/* ドラフト指名タブ */}
        {activeTab === 'draft' && (
          <div>
            {draftedPlayers.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <p className="text-gray-400 text-xl">まだドラフト指名選手はいません</p>
                <p className="text-gray-500 mt-2">NPBドラフトで指名された選手がここに表示されます</p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-700 text-gray-300 text-xs">
                      <th className="py-2 px-3 text-left">年</th>
                      <th className="py-2 px-3 text-left">選手名</th>
                      <th className="py-2 px-3 text-center">位</th>
                      <th className="py-2 px-3 text-center">年齢</th>
                      <th className="py-2 px-3 text-left">所属</th>
                      <th className="py-2 px-3 text-left">指名先</th>
                      <th className="py-2 px-3 text-right">主要成績</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftedPlayers.map((player, idx) => {
                      const isPitcher = player.position === 'pitcher';
                      const stats = player.careerStats || { batting: {}, pitching: {} };
                      let mainStat = '';
                      if (isPitcher) {
                        const w = stats.pitching?.wins || 0;
                        const s = stats.pitching?.saves || 0;
                        const k = stats.pitching?.strikeouts || 0;
                        mainStat = `${w}勝 ${s}S ${k}K`;
                      } else {
                        const ab = stats.batting?.atBats || 0;
                        const avg = ab > 0 ? (stats.batting.hits / ab).toFixed(3) : '.000';
                        const hr = stats.batting?.homeruns || 0;
                        const h = stats.batting?.hits || 0;
                        mainStat = `${avg} ${hr}HR ${h}安`;
                      }
                      return (
                        <tr key={idx} className={`border-b border-gray-700 ${player.hallOfFame ? 'bg-yellow-900/30' : ''}`}>
                          <td className="py-2 px-3 text-gray-400">{player.year || '-'}年目</td>
                          <td className="py-2 px-3">
                            <span className={`font-bold ${isPitcher ? 'text-red-400' : 'text-blue-300'}`}>
                              {player.hallOfFame && '🏛️ '}{player.name}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center text-gray-400 text-xs">{getPositionName(player.position)}</td>
                          <td className="py-2 px-3 text-center text-gray-400">{player.age}歳</td>
                          <td className="py-2 px-3 text-gray-300">{player.teamName || player.team}</td>
                          <td className="py-2 px-3 text-yellow-400">{player.npbTeam || '-'}</td>
                          <td className="py-2 px-3 text-right text-gray-300 font-mono text-xs">{mainStat}</td>
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
            {/* カテゴリ選択 */}
            <div className="bg-gray-800 rounded-lg p-3 mb-3">
              <div className="mb-2">
                <span className="text-gray-400 text-sm mr-3">打撃:</span>
                {battingCategories.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setStatCategory(cat.key)}
                    className={`px-3 py-1 mr-1 mb-1 text-xs rounded transition ${
                      statCategory === cat.key
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <div>
                <span className="text-gray-400 text-sm mr-3">投手:</span>
                {pitchingCategories.map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setStatCategory(cat.key)}
                    className={`px-3 py-1 mr-1 mb-1 text-xs rounded transition ${
                      statCategory === cat.key
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ランキング表 */}
            {rankings.length === 0 ? (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <p className="text-gray-400">データがありません</p>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-700 text-gray-300 text-xs">
                      <th className="py-2 px-3 text-center w-10">#</th>
                      <th className="py-2 px-3 text-left">選手名</th>
                      <th className="py-2 px-3 text-center">位</th>
                      <th className="py-2 px-3 text-left">チーム</th>
                      <th className="py-2 px-3 text-center">状態</th>
                      <th className="py-2 px-3 text-right font-bold">{currentCategory.label}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankings.map((player, idx) => {
                      const val = currentCategory.getValue(player.careerStats);
                      const isPitcher = player.position === 'pitcher';
                      return (
                        <tr key={idx} className="border-b border-gray-700 hover:bg-gray-750">
                          <td className="py-2 px-3 text-center">
                            {idx < 3 ? (
                              <span className={`font-bold ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : 'text-orange-400'}`}>
                                {idx + 1}
                              </span>
                            ) : (
                              <span className="text-gray-500">{idx + 1}</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <span className={`font-bold ${isPitcher ? 'text-red-400' : 'text-blue-300'}`}>
                              {player.name}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center text-gray-400 text-xs">{getPositionName(player.position)}</td>
                          <td className="py-2 px-3 text-gray-300">{player.teamName}</td>
                          <td className={`py-2 px-3 text-center text-xs font-bold ${statusColor(player.status)}`}>
                            {player.status}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-white text-lg">
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
          <div className="text-center mt-6">
            <button
              onClick={onClose}
              className="bg-gray-600 hover:bg-gray-500 text-white px-8 py-3 rounded-lg text-lg"
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
