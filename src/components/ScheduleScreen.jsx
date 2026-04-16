import React from 'react';
import { TEAMS_DATA, getTeamAbbreviation } from '../teams-data.js';
import { getScheduleByDate } from '../season/scheduleGenerator.js';
import { generateTeamCalendar } from '../season/calendarUI.js';
import { PHASE_INFO } from '../season/seasonManager.js';

// 全選手の成績を取得してランキング形式に変換（IDで重複排除）
const getAllPlayersStats = () => {
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

const getBattingAverageRanking = () => {
  const players = getAllPlayersStats()
    .filter(p => p.seasonStats?.batting?.atBats > 0)
    .map(p => {
      const stats = p.seasonStats.batting;
      const avg = stats.hits / stats.atBats;
      return {
        rank: 0,
        name: p.name,
        team: p.teamName,
        value: avg.toFixed(3),
        sortValue: avg
      };
    })
    .sort((a, b) => b.sortValue - a.sortValue)
    .slice(0, 10);

  players.forEach((p, i) => p.rank = i + 1);
  return players;
};

const getHomeRunRanking = () => {
  const players = getAllPlayersStats()
    .filter(p => p.seasonStats?.batting?.homeruns > 0)
    .map(p => ({
      rank: 0,
      name: p.name,
      team: p.teamName,
      value: p.seasonStats.batting.homeruns,
      sortValue: p.seasonStats.batting.homeruns
    }))
    .sort((a, b) => b.sortValue - a.sortValue)
    .slice(0, 10);

  players.forEach((p, i) => p.rank = i + 1);
  return players;
};

const getRBIRanking = () => {
  const players = getAllPlayersStats()
    .filter(p => p.seasonStats?.batting?.rbis > 0)
    .map(p => ({
      rank: 0,
      name: p.name,
      team: p.teamName,
      value: p.seasonStats.batting.rbis,
      sortValue: p.seasonStats.batting.rbis
    }))
    .sort((a, b) => b.sortValue - a.sortValue)
    .slice(0, 10);

  players.forEach((p, i) => p.rank = i + 1);
  return players;
};

const getStolenBaseRanking = () => {
  const players = getAllPlayersStats()
    .filter(p => p.seasonStats?.batting?.stolenBases > 0)
    .map(p => ({
      rank: 0,
      name: p.name,
      team: p.teamName,
      value: p.seasonStats.batting.stolenBases,
      sortValue: p.seasonStats.batting.stolenBases
    }))
    .sort((a, b) => b.sortValue - a.sortValue)
    .slice(0, 10);

  players.forEach((p, i) => p.rank = i + 1);
  return players;
};

const getERARanking = () => {
  const players = getAllPlayersStats()
    .filter(p => p.seasonStats?.pitching?.inningsPitched > 0)
    .map(p => {
      const stats = p.seasonStats.pitching;
      const era = (stats.earnedRuns * 27) / stats.inningsPitched;
      return {
        rank: 0,
        name: p.name,
        team: p.teamName,
        value: era.toFixed(2),
        sortValue: era
      };
    })
    .sort((a, b) => a.sortValue - b.sortValue)
    .slice(0, 10);

  players.forEach((p, i) => p.rank = i + 1);
  return players;
};

const getWinsRanking = () => {
  const players = getAllPlayersStats()
    .filter(p => p.seasonStats?.pitching?.wins > 0)
    .map(p => ({
      rank: 0,
      name: p.name,
      team: p.teamName,
      value: p.seasonStats.pitching.wins,
      sortValue: p.seasonStats.pitching.wins
    }))
    .sort((a, b) => b.sortValue - a.sortValue)
    .slice(0, 10);

  players.forEach((p, i) => p.rank = i + 1);
  return players;
};

const getHoldsRanking = () => {
  const players = getAllPlayersStats()
    .filter(p => p.seasonStats?.pitching?.holds > 0)
    .map(p => ({
      rank: 0,
      name: p.name,
      team: p.teamName,
      value: p.seasonStats.pitching.holds,
      sortValue: p.seasonStats.pitching.holds
    }))
    .sort((a, b) => b.sortValue - a.sortValue)
    .slice(0, 10);

  players.forEach((p, i) => p.rank = i + 1);
  return players;
};

const getSavesRanking = () => {
  const players = getAllPlayersStats()
    .filter(p => p.seasonStats?.pitching?.saves > 0)
    .map(p => ({
      rank: 0,
      name: p.name,
      team: p.teamName,
      value: p.seasonStats.pitching.saves,
      sortValue: p.seasonStats.pitching.saves
    }))
    .sort((a, b) => b.sortValue - a.sortValue)
    .slice(0, 10);

  players.forEach((p, i) => p.rank = i + 1);
  return players;
};

// ランキング表示用コンポーネント
const RankingTable = ({ title, data, valueLabel }) => (
  <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 overflow-hidden">
    <div className="px-4 py-2.5 border-b border-gray-700/50">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
    </div>
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-700/40 text-[10px] text-gray-500 font-medium">
          <th className="text-left py-1.5 pl-3 w-8">#</th>
          <th className="text-left py-1.5">選手名</th>
          <th className="text-left py-1.5 w-14">チーム</th>
          <th className="text-right py-1.5 pr-3 w-16">{valueLabel}</th>
        </tr>
      </thead>
      <tbody>
        {data.length > 0 ? (
          data.map((player, index) => (
            <tr key={index} className={`border-b border-gray-700/30 hover:bg-gray-700/30 transition-colors ${index === 0 ? 'bg-yellow-900/10' : ''}`}>
              <td className={`py-1.5 pl-3 font-bold text-xs ${index === 0 ? 'text-yellow-400' : index < 3 ? 'text-gray-300' : 'text-gray-600'}`}>{player.rank}</td>
              <td className="py-1.5 text-white text-xs font-medium">{player.name}</td>
              <td className="py-1.5 text-[10px] text-gray-400">{getTeamAbbreviation(player.team)}</td>
              <td className={`text-right py-1.5 pr-3 font-bold text-sm ${index === 0 ? 'text-yellow-300' : 'text-gray-200'}`}>{player.value}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan="4" className="py-6 text-center text-gray-600 text-xs">データなし</td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

const ScheduleScreen = ({
  seasonData,
  selectedMonth,
  setSelectedMonth,
  scheduleTab,
  setScheduleTab,
  seasonYear,
  currentDate,
  currentPhase,
  leagueStandings,
  userTeamName,
  onProgressDate,
  onProgressToNextGame,
  onProgressToNextPhase,
  onStartGame,
}) => {
  // 当月のカレンダーデータを生成
  const calendarData = seasonData && selectedMonth
    ? generateTeamCalendar(seasonData.schedule, userTeamName, currentDate.year, selectedMonth)
    : [];

  // 当日の試合を取得
  const todayGames = seasonData
    ? getScheduleByDate(seasonData.schedule, currentDate)
    : [];

  // フェーズ情報を取得
  const phaseInfo = currentPhase && PHASE_INFO[currentPhase]
    ? PHASE_INFO[currentPhase]
    : { name: '', color: 'bg-gray-100', description: '' };

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            {seasonYear}年目シーズン
            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${phaseInfo.color} text-gray-800`}>
              {phaseInfo.name}
            </span>
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {currentDate.year}年{currentDate.month}月{currentDate.day}日
          </p>
        </div>
        {/* 日付進行ボタン */}
        <div className="flex gap-1.5 items-center">
          <button onClick={() => onProgressDate(1)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition">
            ➡ 1日進める
          </button>
          <button onClick={onProgressToNextGame} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition">
            ⏩ 次の試合日
          </button>
          <button onClick={onProgressToNextPhase} className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition">
            次フェーズ
          </button>
          <button onClick={onStartGame} className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition border border-green-500/50">
            ⚾ 試合開始
          </button>
        </div>
      </div>

      {/* カレンダー月選択 */}
      <div className="mb-3 flex gap-1 flex-wrap">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => (
          <button
            key={month}
            onClick={() => setSelectedMonth(month)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
              selectedMonth === month
                ? 'bg-blue-600 text-white'
                : month === currentDate.month
                ? 'bg-gray-700 text-white ring-1 ring-blue-400/50'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {month}月
          </button>
        ))}
      </div>

      {/* カレンダー */}
      <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 p-3 mb-4">
        <div className="text-xs font-semibold text-gray-400 mb-2 px-1">{selectedMonth}月の日程（{userTeamName}）</div>
        <div className="grid grid-cols-7 gap-0.5">
          <div className="text-center text-red-400 font-bold py-1 text-[10px]">日</div>
          <div className="text-center text-gray-500 font-bold py-1 text-[10px]">月</div>
          <div className="text-center text-gray-500 font-bold py-1 text-[10px]">火</div>
          <div className="text-center text-gray-500 font-bold py-1 text-[10px]">水</div>
          <div className="text-center text-gray-500 font-bold py-1 text-[10px]">木</div>
          <div className="text-center text-gray-500 font-bold py-1 text-[10px]">金</div>
          <div className="text-center text-blue-400 font-bold py-1 text-[10px]">土</div>
          {calendarData.map((day, index) => {
            if (!day.day) {
              return <div key={index} className="p-2"></div>;
            }
            const isCurrentDate = day.date &&
              day.date.year === currentDate.year &&
              day.date.month === currentDate.month &&
              day.date.day === currentDate.day;
            return (
              <div
                key={index}
                className={`p-2 rounded text-center transition ${
                  isCurrentDate
                    ? 'bg-orange-600 border-2 border-orange-400'
                    : day.opponent
                    ? 'bg-gray-700 hover:bg-gray-600 cursor-pointer'
                    : 'bg-gray-900'
                }`}
              >
                <div className={`text-xs mb-0.5 ${isCurrentDate ? 'text-white font-bold' : 'text-gray-400'}`}>
                  {day.day}日
                </div>
                {day.opponent ? (
                  <>
                    <div className="text-xs text-white font-bold mb-0.5 text-center">{day.venue} {getTeamAbbreviation(day.opponent)}</div>
                    {day.result ? (
                      <div className={`text-sm font-bold ${
                        day.result === '○' ? 'text-green-400' :
                        day.result === '●' ? 'text-red-400' :
                        'text-yellow-400'
                      }`}>
                        {day.result}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">未消化</div>
                    )}
                  </>
                ) : day.eventLabel ? (
                  <div className={`text-xs font-bold ${
                    day.eventLabel === 'シーズン終了' ? 'text-red-400' :
                    day.eventLabel === 'プレーオフ' ? 'text-yellow-400' :
                    day.eventLabel === '契約更改' ? 'text-teal-400' :
                    day.eventLabel === 'トライアウト' ? 'text-orange-400' :
                    day.eventLabel === 'オフシーズン' ? 'text-gray-400' :
                    day.eventLabel === 'キャンプ' ? 'text-green-400' :
                    day.eventLabel === 'ドラフト' ? 'text-purple-400' :
                    'text-gray-500'
                  }`}>{day.eventLabel}</div>
                ) : (
                  <div className="text-xs text-gray-600">-</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 本日の対戦カード */}
      <div className="bg-gray-800/80 rounded-xl border border-gray-700/50 p-3 mb-4">
        <div className="text-xs font-semibold text-gray-400 mb-2 px-1">
          {currentDate.month}/{currentDate.day} の対戦カード
        </div>
        <div className="grid grid-cols-2 gap-2">
          {todayGames.length > 0 ? todayGames.map((game, index) => (
            <div key={index} className="bg-gray-900/50 border border-gray-700/40 rounded-lg p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-center flex-1">
                  <div className="text-white font-bold text-sm">{getTeamAbbreviation(game.away)}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{game.awayPitcher || '未定'}</div>
                </div>
                <div className="text-gray-600 text-xs font-mono px-1">
                  {game.result ? (
                    <span>
                      <span className={game.result.awayScore > game.result.homeScore ? 'text-green-400 font-bold' : 'text-gray-400'}>{game.result.awayScore}</span>
                      <span className="text-gray-600 mx-0.5">-</span>
                      <span className={game.result.homeScore > game.result.awayScore ? 'text-green-400 font-bold' : 'text-gray-400'}>{game.result.homeScore}</span>
                    </span>
                  ) : <span className="text-gray-600">vs</span>}
                </div>
                <div className="text-center flex-1">
                  <div className="text-white font-bold text-sm">{getTeamAbbreviation(game.home)}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{game.homePitcher || '未定'}</div>
                </div>
              </div>
            </div>
          )) : (
            <div className="col-span-2 text-center text-gray-600 text-xs py-3">本日は試合がありません（休養日）</div>
          )}
        </div>
      </div>

      {/* タブ切り替えボタン */}
      <div className="flex gap-1 mb-4 bg-gray-800/60 p-1 rounded-xl border border-gray-700/50">
        {[
          { key: 'league',   label: 'リーグ順位', icon: '📊' },
          { key: 'batting',  label: '打撃成績',   icon: '⚾' },
          { key: 'pitching', label: '投手成績',   icon: '🥎' },
        ].map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setScheduleTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
              scheduleTab === key
                ? 'bg-green-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/60'
            }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* タブコンテンツ */}
      {scheduleTab === 'league' && (() => {
        const totalGames = seasonData?.settings?.gamesPerSeason || 60;
        const leader = leagueStandings[0];
        const leaderWins = leader?.wins || 0;
        const leaderLosses = leader?.losses || 0;
        const leaderWinRate = leaderWins + leaderLosses > 0 ? leaderWins / (leaderWins + leaderLosses) : 0;
        const leaderRemaining = totalGames - (leaderWins + leaderLosses + (leader?.draws || 0));
        const isChampionDecided = leader && leagueStandings.length > 1 && (() => {
          const second = leagueStandings[1];
          const secondRemaining = totalGames - (second.wins + second.losses + (second.draws || 0));
          return leaderWins > second.wins + secondRemaining;
        })();

        return (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-4 text-white">リーグ順位表</h2>
          <table className="w-full text-white">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-3 text-lg">順位</th>
                <th className="text-left py-3 text-lg">チーム</th>
                <th className="text-center py-3 text-lg">勝</th>
                <th className="text-center py-3 text-lg">敗</th>
                <th className="text-center py-3 text-lg">分</th>
                <th className="text-center py-3 text-lg">勝率</th>
                <th className="text-center py-3 text-lg">差</th>
                <th className="text-center py-3 text-lg">M</th>
              </tr>
            </thead>
            <tbody>
              {leagueStandings.map((team, index) => {
                const winRate = team.wins + team.losses > 0
                  ? (team.wins / (team.wins + team.losses))
                  : 0;
                const teamPlayed = team.wins + team.losses + (team.draws || 0);
                const teamRemaining = totalGames - teamPlayed;

                // ゲーム差（首位との差）
                let gameBehind = '';
                if (index === 0) {
                  gameBehind = isChampionDecided ? '優勝' : '-';
                } else {
                  const diff = ((leaderWins - team.wins) - (leaderLosses - team.losses)) / 2;
                  gameBehind = diff === 0 ? '-' : diff.toFixed(1);
                }

                // マジック（首位チームのみ、2位チームの残り試合に基づく計算）
                let magic = '';
                if (index === 0 && leagueStandings.length > 1) {
                  const second = leagueStandings[1];
                  const secondMaxWins = second.wins + (totalGames - (second.wins + second.losses + (second.draws || 0)));
                  const magicNum = secondMaxWins - leaderWins + 1;
                  if (magicNum > 0 && !isChampionDecided) {
                    magic = `M${magicNum}`;
                  } else if (isChampionDecided) {
                    magic = '-';
                  }
                }

                return (
                <tr key={index} className={`border-b border-gray-700 ${index === 0 && isChampionDecided ? 'bg-yellow-900/30' : ''}`}>
                  <td className="py-3 text-lg font-bold">{index + 1}</td>
                  <td className="py-3 text-lg font-bold">{team.team}</td>
                  <td className="text-center py-3 text-lg">{team.wins}</td>
                  <td className="text-center py-3 text-lg">{team.losses}</td>
                  <td className="text-center py-3 text-lg">{team.draws}</td>
                  <td className="text-center py-3 text-lg">{winRate > 0 ? winRate.toFixed(3) : '.000'}</td>
                  <td className={`text-center py-3 text-lg font-bold ${index === 0 && isChampionDecided ? 'text-yellow-400' : 'text-gray-300'}`}>
                    {gameBehind}
                  </td>
                  <td className="text-center py-3 text-lg text-red-400 font-bold">{magic}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        );
      })()}

      {scheduleTab === 'batting' && (
        <div className="grid grid-cols-4 gap-4">
          <RankingTable title="打率ランキング" data={getBattingAverageRanking()} valueLabel="打率" />
          <RankingTable title="本塁打ランキング" data={getHomeRunRanking()} valueLabel="本塁打" />
          <RankingTable title="打点ランキング" data={getRBIRanking()} valueLabel="打点" />
          <RankingTable title="盗塁ランキング" data={getStolenBaseRanking()} valueLabel="盗塁" />
        </div>
      )}

      {scheduleTab === 'pitching' && (
        <div className="grid grid-cols-4 gap-4">
          <RankingTable title="防御率ランキング" data={getERARanking()} valueLabel="防御率" />
          <RankingTable title="勝利数ランキング" data={getWinsRanking()} valueLabel="勝利" />
          <RankingTable title="ホールドランキング" data={getHoldsRanking()} valueLabel="ホールド" />
          <RankingTable title="セーブランキング" data={getSavesRanking()} valueLabel="セーブ" />
        </div>
      )}
    </div>
      </div>
  );
};

export default ScheduleScreen;
