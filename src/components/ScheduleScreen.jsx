import React from 'react';
import { TEAMS_DATA, getTeamAbbreviation } from '../teams-data.js';
import { getScheduleByDate } from '../season/scheduleGenerator.js';
import { generateTeamCalendar } from '../season/calendarUI.js';
import { PHASE_INFO } from '../season/seasonManager.js';

// 全選手の成績を取得してランキング形式に変換
const getAllPlayersStats = () => {
  const allPlayers = [];
  Object.keys(TEAMS_DATA || {}).forEach(teamName => {
    const team = TEAMS_DATA[teamName];
    team.players.forEach(player => {
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
  <div className="bg-gray-800 rounded-lg p-4">
    <h3 className="text-lg font-bold mb-3 text-white">{title}</h3>
    <table className="w-full text-white text-sm">
      <thead>
        <tr className="border-b border-gray-700">
          <th className="text-left py-1 w-12">順位</th>
          <th className="text-left py-1">選手名</th>
          <th className="text-left py-1 w-20">チーム</th>
          <th className="text-right py-1 w-16">{valueLabel}</th>
        </tr>
      </thead>
      <tbody>
        {data.length > 0 ? (
          data.map((player, index) => (
            <tr key={index} className="border-b border-gray-700">
              <td className="py-1">{player.rank}</td>
              <td className="py-1">{player.name}</td>
              <td className="py-1 text-xs text-center">{getTeamAbbreviation(player.team)}</td>
              <td className="text-right py-1">{player.value}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan="4" className="py-4 text-center text-gray-500">データなし</td>
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
    <div className="p-8 max-w-7xl mx-auto">
      {/* ヘッダー */}
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-white">{seasonYear}年目</h1>
          <div className="mt-2 flex items-center gap-3">
            <div className="text-lg text-gray-300">
              {currentDate.year}年{currentDate.month}月{currentDate.day}日
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${phaseInfo.color} text-gray-800`}>
              {phaseInfo.name}
            </span>
          </div>
        </div>
      </div>

      {/* 日付進行ボタン */}
      <div className="mb-4 flex gap-2 items-center">
        <button
          onClick={() => onProgressDate(1)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-bold transition text-sm"
        >
          ➡️ 1日進める
        </button>
        <button
          onClick={onProgressToNextGame}
          className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg font-bold transition text-sm"
        >
          ⏩ 次の試合日
        </button>
        <button
          onClick={onProgressToNextPhase}
          className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg font-bold transition text-sm"
        >
          🔄 次フェーズ
        </button>
        <button
          onClick={onStartGame}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold transition text-sm ml-auto"
        >
          🎮 試合開始
        </button>
      </div>

      {/* カレンダー月選択 */}
      <div className="mb-4 flex gap-1 flex-wrap">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => (
          <button
            key={month}
            onClick={() => setSelectedMonth(month)}
            className={`px-3 py-1.5 rounded font-bold transition text-sm ${
              selectedMonth === month
                ? 'bg-blue-600 text-white'
                : month === currentDate.month
                ? 'bg-gray-600 text-white border border-blue-400'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {month}月
          </button>
        ))}
      </div>

      {/* カレンダー */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <h2 className="text-xl font-bold mb-3 text-white">{selectedMonth}月の試合日程（{userTeamName}）</h2>
        <div className="grid grid-cols-7 gap-1">
          <div className="text-center text-gray-400 font-bold py-1 text-xs">日</div>
          <div className="text-center text-gray-400 font-bold py-1 text-xs">月</div>
          <div className="text-center text-gray-400 font-bold py-1 text-xs">火</div>
          <div className="text-center text-gray-400 font-bold py-1 text-xs">水</div>
          <div className="text-center text-gray-400 font-bold py-1 text-xs">木</div>
          <div className="text-center text-gray-400 font-bold py-1 text-xs">金</div>
          <div className="text-center text-gray-400 font-bold py-1 text-xs">土</div>
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
      <div className="bg-gray-800 rounded-lg p-6 mb-8">
        <h2 className="text-2xl font-bold mb-4 text-white">
          {currentDate.month}/{currentDate.day} の対戦カード
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {todayGames.length > 0 ? todayGames.map((game, index) => (
            <div key={index} className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-center gap-4 mb-3">
                <div className="text-white font-bold text-lg">{getTeamAbbreviation(game.away)}</div>
                <div className="text-gray-400">vs</div>
                <div className="text-white font-bold text-lg">{getTeamAbbreviation(game.home)}</div>
              </div>
              <div className="flex items-center justify-center gap-4 text-sm text-gray-300 mb-2">
                <div className="text-right flex-1">
                  <div className="text-xs text-gray-500">先発</div>
                  <div className="text-yellow-400 font-bold">{game.awayPitcher || '未定'}</div>
                </div>
                <div className="text-gray-600">⚾</div>
                <div className="text-left flex-1">
                  <div className="text-xs text-gray-500">先発</div>
                  <div className="text-yellow-400 font-bold">{game.homePitcher || '未定'}</div>
                </div>
              </div>
              {game.result ? (
                <div className="mt-2 text-sm text-center">
                  <span className="text-gray-300">結果: </span>
                  <span className="text-green-400 font-bold">
                    {game.result.awayScore} - {game.result.homeScore}
                  </span>
                </div>
              ) : (
                <div className="mt-2 text-sm text-gray-500 text-center">未消化</div>
              )}
            </div>
          )) : (
            <div className="col-span-2 text-center text-gray-500 py-4">
              本日は試合がありません（休養日）
            </div>
          )}
        </div>
      </div>

      {/* タブ切り替えボタン */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setScheduleTab('league')}
          className={`px-6 py-3 rounded-lg font-bold transition ${
            scheduleTab === 'league'
              ? 'bg-green-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          📊 リーグ順位
        </button>
        <button
          onClick={() => setScheduleTab('batting')}
          className={`px-6 py-3 rounded-lg font-bold transition ${
            scheduleTab === 'batting'
              ? 'bg-green-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          ⚾ 打撃成績
        </button>
        <button
          onClick={() => setScheduleTab('pitching')}
          className={`px-6 py-3 rounded-lg font-bold transition ${
            scheduleTab === 'pitching'
              ? 'bg-green-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          🥎 投手成績
        </button>
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
  );
};

export default ScheduleScreen;
