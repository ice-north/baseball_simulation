window.PlayerStatsScreen = ({ seasonData, allTeams }) => {
  const [statsTab, setStatsTab] = useState('season'); // 'season' or 'career'
  const [statsType, setStatsType] = useState('batting'); // 'batting' or 'pitching'

  // 全選手のシーズン成績を取得
  const getAllPlayerStats = () => {
    const allPlayers = [];
    Object.keys(window.TEAMS_DATA || {}).forEach(teamName => {
      const team = window.TEAMS_DATA[teamName];
      team.players.forEach(player => {
        allPlayers.push({
          ...player,
          teamName: team.name
        });
      });
    });
    return allPlayers;
  };

  const allPlayers = getAllPlayerStats();

  // 打撃成績でソート
  const battingStats = allPlayers
    .filter(p => {
      const stats = statsTab === 'season' ? p.seasonStats?.batting : p.careerStats?.batting;
      return stats && stats.atBats > 0;
    })
    .map(p => {
      const stats = statsTab === 'season' ? p.seasonStats.batting : p.careerStats.batting;
      const avg = stats.atBats > 0 ? (stats.hits / stats.atBats).toFixed(3) : '.000';
      return { ...p, stats, avg: parseFloat(avg) };
    })
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 20);

  // 投手成績でソート（防御率順）
  const pitchingStats = allPlayers
    .filter(p => {
      const stats = statsTab === 'season' ? p.seasonStats?.pitching : p.careerStats?.pitching;
      return stats && stats.inningsPitched > 0;
    })
    .map(p => {
      const stats = statsTab === 'season' ? p.seasonStats.pitching : p.careerStats.pitching;
      const era = stats.inningsPitched > 0
        ? ((stats.earnedRuns * 27) / stats.inningsPitched).toFixed(2)
        : '0.00';
      const ip = (stats.inningsPitched / 3).toFixed(1);
      return { ...p, stats, era: parseFloat(era), ip };
    })
    .sort((a, b) => a.era - b.era)
    .slice(0, 20);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6 text-white">選手成績</h1>

      {/* タブ選択 */}
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

      {/* 成績タイプ選択 */}
      <div className="mb-6 flex gap-4">
        <button
          onClick={() => setStatsType('batting')}
          className={`px-6 py-3 rounded font-bold transition ${
            statsType === 'batting' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          打撃成績
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

      {/* 打撃成績テーブル */}
      {statsType === 'batting' && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-white">
            {statsTab === 'season' ? 'シーズン' : '通算'}打撃成績 (上位20名)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-white text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="py-2 px-3 text-left">順位</th>
                  <th className="py-2 px-3 text-left">選手名</th>
                  <th className="py-2 px-3 text-left">チーム</th>
                  <th className="py-2 px-3 text-right">試合</th>
                  <th className="py-2 px-3 text-right">打席</th>
                  <th className="py-2 px-3 text-right">安打</th>
                  <th className="py-2 px-3 text-right">本塁打</th>
                  <th className="py-2 px-3 text-right">打点</th>
                  <th className="py-2 px-3 text-right">四球</th>
                  <th className="py-2 px-3 text-right">三振</th>
                  <th className="py-2 px-3 text-right font-bold">打率</th>
                </tr>
              </thead>
              <tbody>
                {battingStats.map((player, index) => (
                  <tr key={player.id + player.teamName} className="border-b border-gray-700 hover:bg-gray-700">
                    <td className="py-2 px-3">{index + 1}</td>
                    <td className="py-2 px-3 font-bold">{player.name}</td>
                    <td className="py-2 px-3">{player.teamName}</td>
                    <td className="py-2 px-3 text-right">{player.stats.games}</td>
                    <td className="py-2 px-3 text-right">{player.stats.atBats}</td>
                    <td className="py-2 px-3 text-right">{player.stats.hits}</td>
                    <td className="py-2 px-3 text-right">{player.stats.homeruns}</td>
                    <td className="py-2 px-3 text-right">{player.stats.rbis}</td>
                    <td className="py-2 px-3 text-right">{player.stats.walks}</td>
                    <td className="py-2 px-3 text-right">{player.stats.strikeouts}</td>
                    <td className="py-2 px-3 text-right font-bold text-yellow-400">{player.avg.toFixed(3)}</td>
                  </tr>
                ))}
                {battingStats.length === 0 && (
                  <tr>
                    <td colSpan="11" className="py-8 text-center text-gray-500">
                      まだ打撃成績がありません。試合を進行してください。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 投手成績テーブル */}
      {statsType === 'pitching' && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-white">
            {statsTab === 'season' ? 'シーズン' : '通算'}投手成績 (上位20名)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-white text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="py-2 px-3 text-left">順位</th>
                  <th className="py-2 px-3 text-left">選手名</th>
                  <th className="py-2 px-3 text-left">チーム</th>
                  <th className="py-2 px-3 text-right">試合</th>
                  <th className="py-2 px-3 text-right">勝</th>
                  <th className="py-2 px-3 text-right">敗</th>
                  <th className="py-2 px-3 text-right">イニング</th>
                  <th className="py-2 px-3 text-right">失点</th>
                  <th className="py-2 px-3 text-right">奪三振</th>
                  <th className="py-2 px-3 text-right">与四球</th>
                  <th className="py-2 px-3 text-right font-bold">防御率</th>
                </tr>
              </thead>
              <tbody>
                {pitchingStats.map((player, index) => (
                  <tr key={player.id + player.teamName} className="border-b border-gray-700 hover:bg-gray-700">
                    <td className="py-2 px-3">{index + 1}</td>
                    <td className="py-2 px-3 font-bold">{player.name}</td>
                    <td className="py-2 px-3">{player.teamName}</td>
                    <td className="py-2 px-3 text-right">{player.stats.games}</td>
                    <td className="py-2 px-3 text-right">{player.stats.wins}</td>
                    <td className="py-2 px-3 text-right">{player.stats.losses}</td>
                    <td className="py-2 px-3 text-right">{player.ip}</td>
                    <td className="py-2 px-3 text-right">{player.stats.runsAllowed}</td>
                    <td className="py-2 px-3 text-right">{player.stats.strikeouts}</td>
                    <td className="py-2 px-3 text-right">{player.stats.walks}</td>
                    <td className="py-2 px-3 text-right font-bold text-yellow-400">{player.era.toFixed(2)}</td>
                  </tr>
                ))}
                {pitchingStats.length === 0 && (
                  <tr>
                    <td colSpan="11" className="py-8 text-center text-gray-500">
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

// 日程進行画面コンポーネント
