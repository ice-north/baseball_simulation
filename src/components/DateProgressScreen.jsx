import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { PHASE_INFO, SEASON_PHASES, formatDate, getDayOfWeek, getCurrentPhase } from '../season/seasonManager.js';
import { getScheduleByDate } from '../season/scheduleGenerator.js';
import { progressDate, handlePhaseTransition } from '../season/dateProgression.js';
import { autoSimulateGame } from '../game/autoSimulation.js';

const DateProgressScreen = ({ seasonData, setSeasonData, onForceEvent }) => {
  const [selectedMonth, setSelectedMonth] = useState(seasonData?.currentDate?.month || 4);
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastGameResults, setLastGameResults] = useState([]);

  if (!seasonData) return <div className="p-8 text-white">読み込み中...</div>;

  const userTeamName = Object.keys(TEAMS_DATA || {})[0] || 'チームA';
  const currentPhase = seasonData.phase || 'off_season';
  const phaseInfo = PHASE_INFO[currentPhase] || { name: '', color: 'bg-gray-100', description: '' };

  const getStartingPitcher = (teamName) => {
    const team = TEAMS_DATA[teamName];
    if (!team || !team.pitchingRotation || !team.pitchingRotation.starters) return null;
    const rotation = team.pitchingRotation;
    const index = rotation.currentStarterIndex || 0;
    const starterId = rotation.starters[index];
    return team.players.find(p => p.id === starterId);
  };

  const determinePitcherDecisions = (gameResult, homeTeamData, awayTeamData) => {
    const decisions = { winningPitcher: null, losingPitcher: null, savePitcher: null, holdPitchers: [] };
    if (!gameResult || gameResult.homeScore === gameResult.awayScore) return decisions;
    const isHomeWin = gameResult.homeScore > gameResult.awayScore;
    const winningTeam = isHomeWin ? gameResult.homeTeam : gameResult.awayTeam;
    const losingTeam = isHomeWin ? gameResult.awayTeam : gameResult.homeTeam;
    if (!winningTeam || !losingTeam) return decisions;
    const winningPitchers = winningTeam.players.filter(p => p.gameStats?.pitching?.outs > 0);
    const losingPitchers = losingTeam.players.filter(p => p.gameStats?.pitching?.outs > 0);
    const winningStarter = winningPitchers.find(p => p.gameStats.pitching.outs >= 15);
    if (winningStarter) decisions.winningPitcher = winningStarter;
    else { const reliever = winningPitchers.sort((a, b) => b.gameStats.pitching.outs - a.gameStats.pitching.outs)[0]; if (reliever) decisions.winningPitcher = reliever; }
    const losingPitcher = losingPitchers.sort((a, b) => b.gameStats.pitching.runsAllowed - a.gameStats.pitching.runsAllowed)[0];
    if (losingPitcher) decisions.losingPitcher = losingPitcher;
    const scoreDiff = Math.abs(gameResult.homeScore - gameResult.awayScore);
    if (scoreDiff <= 3 && winningPitchers.length > 1) {
      const lastPitcher = winningPitchers[winningPitchers.length - 1];
      if (lastPitcher && lastPitcher !== decisions.winningPitcher && lastPitcher.gameStats.pitching.outs >= 3) decisions.savePitcher = lastPitcher;
    }
    winningPitchers.forEach(p => { if (p !== decisions.winningPitcher && p !== decisions.savePitcher && p.gameStats.pitching.outs >= 3) decisions.holdPitchers.push(p); });
    return decisions;
  };

  const recordPitcherDecision = (pitcher, stat, gameHome, gameAway, isHomeWin) => {
    const teamName = stat === 'losses' ? (isHomeWin ? gameAway : gameHome) : (isHomeWin ? gameHome : gameAway);
    const teamData = TEAMS_DATA[teamName];
    if (teamData) {
      const p = teamData.players.find(pl => pl.id === pitcher.id);
      if (p) { p.seasonStats.pitching[stat] = (p.seasonStats.pitching[stat] || 0) + 1; p.careerStats.pitching[stat] = (p.careerStats.pitching[stat] || 0) + 1; }
    }
  };

  const simulateGamesOnDate = (sData) => {
    const gamesOnDate = getScheduleByDate(sData.schedule, sData.currentDate);
    if (gamesOnDate.length === 0) return { data: sData, results: [] };
    let updatedSchedule = [...sData.schedule];
    let updatedStandings = [...sData.standings];
    let updatedResults = [...sData.results];
    const gameResults = [];
    gamesOnDate.forEach(game => {
      if (game.result) return;
      const homeTeam = TEAMS_DATA[game.home];
      const awayTeam = TEAMS_DATA[game.away];
      if (!homeTeam || !awayTeam) return;
      const result = autoSimulateGame(game.home, game.away);
      const decisions = determinePitcherDecisions(result, homeTeam, awayTeam);
      const isHomeWin = result.homeScore > result.awayScore;
      if (decisions.winningPitcher) recordPitcherDecision(decisions.winningPitcher, 'wins', game.home, game.away, isHomeWin);
      if (decisions.losingPitcher) recordPitcherDecision(decisions.losingPitcher, 'losses', game.home, game.away, isHomeWin);
      if (decisions.savePitcher) recordPitcherDecision(decisions.savePitcher, 'saves', game.home, game.away, isHomeWin);
      decisions.holdPitchers.forEach(hp => recordPitcherDecision(hp, 'holds', game.home, game.away, isHomeWin));
      const scheduleIndex = updatedSchedule.findIndex(g => g.id === game.id);
      if (scheduleIndex !== -1) updatedSchedule[scheduleIndex] = { ...game, result };
      gameResults.push({ gameId: game.id, home: game.home, away: game.away, homeScore: result.homeScore, awayScore: result.awayScore, winner: result.winner, decisions });
      updatedResults.push({ gameId: game.id, date: { ...sData.currentDate }, home: game.home, away: game.away, result });
      const standingHome = updatedStandings.find(s => s.team === game.home);
      const standingAway = updatedStandings.find(s => s.team === game.away);
      if (standingHome && standingAway) {
        standingHome.gamesPlayed++; standingAway.gamesPlayed++;
        if (result.homeScore > result.awayScore) { standingHome.wins++; standingAway.losses++; }
        else if (result.awayScore > result.homeScore) { standingAway.wins++; standingHome.losses++; }
        else { standingHome.draws = (standingHome.draws || 0) + 1; standingAway.draws = (standingAway.draws || 0) + 1; }
        standingHome.winRate = standingHome.gamesPlayed > 0 ? standingHome.wins / standingHome.gamesPlayed : 0;
        standingAway.winRate = standingAway.gamesPlayed > 0 ? standingAway.wins / standingAway.gamesPlayed : 0;
      }
    });
    updatedStandings.sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
    return { data: { ...sData, schedule: updatedSchedule, standings: updatedStandings, results: updatedResults }, results: gameResults };
  };

  // フェーズ遷移検出＆強制イベント発火
  const checkAndTriggerEvents = (oldData, newData) => {
    const oldPhase = oldData.phase;
    const newPhase = newData.phase;
    if (oldPhase !== newPhase) {
      newData = handlePhaseTransition(newData, newPhase);
    }
    const { month, day } = newData.currentDate;

    // 10/24: ドラフト
    if (month === 10 && day === 24 && newPhase === SEASON_PHASES.DRAFT) {
      setSeasonData(newData);
      if (onForceEvent) onForceEvent('draft');
      return null;
    }
    // 11/9: 契約更改
    if (month === 11 && day === 9 && newPhase === SEASON_PHASES.CONTRACT) {
      setSeasonData(newData);
      if (onForceEvent) onForceEvent('contract');
      return null;
    }
    // 11/10: トライアウト
    if (month === 11 && day === 10 && newPhase === SEASON_PHASES.TRYOUT) {
      setSeasonData(newData);
      if (onForceEvent) onForceEvent('tryout');
      return null;
    }
    // 11/30〜: オフシーズン
    if (month >= 12 || (month === 11 && day >= 30)) {
      newData = { ...newData, phase: SEASON_PHASES.OFF_SEASON };
      setSeasonData(newData);
      if (onForceEvent) onForceEvent('offseason');
      return null;
    }
    return newData;
  };

  const handleProgressDate = (days) => {
    setIsSimulating(true);
    const { data: afterSimData, results } = simulateGamesOnDate(seasonData);
    let newSeasonData = progressDate(afterSimData, days);
    setLastGameResults(results);
    // 月を追従
    if (newSeasonData.currentDate.month !== selectedMonth) setSelectedMonth(newSeasonData.currentDate.month);
    const finalData = checkAndTriggerEvents(seasonData, newSeasonData);
    if (finalData !== null) setSeasonData(finalData);
    setIsSimulating(false);
  };

  // カレンダーデータ生成
  const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();
  const getFirstDayOfWeek = (year, month) => new Date(year, month - 1, 1).getDay();

  const year = seasonData.currentDate?.year || 2024;
  const daysInMonth = getDaysInMonth(year, selectedMonth);
  const firstDay = getFirstDayOfWeek(year, selectedMonth);

  const calendarCells = [];
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  for (let i = 0; i < firstDay; i++) calendarCells.push({ day: null, games: [], eventLabel: null });
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = { year, month: selectedMonth, day };
    const gamesOnDay = getScheduleByDate(seasonData.schedule, dateObj);
    const isToday = seasonData.currentDate.year === year && seasonData.currentDate.month === selectedMonth && seasonData.currentDate.day === day;
    // フェーズイベントラベル
    const phase = getCurrentPhase(selectedMonth, day);
    let eventLabel = null;
    if (phase === SEASON_PHASES.SPRING_CAMP) eventLabel = 'キャンプ';
    else if (phase === SEASON_PHASES.PLAYOFFS) eventLabel = 'プレーオフ';
    else if (phase === SEASON_PHASES.DRAFT) eventLabel = 'ドラフト';
    else if (phase === SEASON_PHASES.CONTRACT) eventLabel = '契約更改';
    else if (phase === SEASON_PHASES.TRYOUT) eventLabel = 'トライアウト';
    else if (phase === SEASON_PHASES.OFF_SEASON) eventLabel = 'オフシーズン';
    calendarCells.push({ day, games: gamesOnDay, isToday, eventLabel });
  }

  const todaysGames = getScheduleByDate(seasonData.schedule, seasonData.currentDate);

  // 順位表計算
  const totalGames = seasonData?.settings?.gamesPerSeason || 60;
  const standings = seasonData.standings || [];
  const leader = standings[0];
  const leaderWins = leader?.wins || 0;
  const leaderLosses = leader?.losses || 0;
  const isChampionDecided = leader && standings.length > 1 && (() => {
    const second = standings[1];
    const secondRemaining = totalGames - ((second.wins || 0) + (second.losses || 0) + (second.draws || 0));
    return leaderWins > (second.wins || 0) + secondRemaining;
  })();

  // イベントラベルの色
  const getEventColor = (label) => {
    if (label === 'プレーオフ') return 'text-yellow-400';
    if (label === '契約更改') return 'text-teal-400';
    if (label === 'トライアウト') return 'text-orange-400';
    if (label === 'オフシーズン') return 'text-gray-400';
    if (label === 'キャンプ') return 'text-green-400';
    if (label === 'ドラフト') return 'text-purple-400';
    return 'text-gray-500';
  };

  return (
    <div className="p-4 min-h-screen">
      <div className="text-center mb-4">
        <span className="text-2xl font-bold text-yellow-400">{seasonData.year}年目</span>
        <span className="text-gray-400 ml-4">{formatDate(seasonData.currentDate)} ({getDayOfWeek(seasonData.currentDate)})</span>
        <span className={`ml-3 px-3 py-1 rounded-full text-sm font-bold ${phaseInfo.color} text-gray-800`}>{phaseInfo.name}</span>
      </div>

      <div className="bg-gray-800 rounded-xl p-4 shadow-lg mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => handleProgressDate(1)} disabled={isSimulating} className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-4 py-2 rounded-lg font-bold transition shadow disabled:opacity-50">
              {isSimulating ? '...' : '1日進める'}
            </button>
            <h2 className="text-xl font-bold text-white">{selectedMonth}月</h2>
          </div>
          <div className="flex gap-1">
            <button onClick={() => setSelectedMonth(m => m > 1 ? m - 1 : 12)} className="bg-gray-700 hover:bg-gray-600 text-white w-8 h-8 rounded-lg flex items-center justify-center">◀</button>
            <button onClick={() => setSelectedMonth(m => m < 12 ? m + 1 : 1)} className="bg-gray-700 hover:bg-gray-600 text-white w-8 h-8 rounded-lg flex items-center justify-center">▶</button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {dayNames.map((name, i) => (
            <div key={i} className={`text-center text-sm font-bold py-2 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>{name}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell, i) => {
            const showAsScheduled = cell.isToday;
            return (
              <div key={i} className={`min-h-[80px] p-2 rounded text-sm transition ${cell.day === null ? 'bg-transparent' : cell.isToday ? 'bg-green-800 border-2 border-green-400 shadow-lg' : 'bg-gray-700'}`}>
                {cell.day && (
                  <>
                    <div className={`font-bold mb-1 ${i % 7 === 0 ? 'text-red-400' : i % 7 === 6 ? 'text-blue-400' : 'text-gray-300'}`}>{cell.day}</div>
                    {cell.games.length > 0 ? (
                      <div className="space-y-0.5">
                        {cell.games.map((game, gIdx) => {
                          const awayShort = (game.away || '').slice(0, 4);
                          const homeShort = (game.home || '').slice(0, 4);
                          if (showAsScheduled || !game.result) {
                            return <div key={gIdx} className="text-[11px] text-yellow-300">{awayShort} vs {homeShort}</div>;
                          }
                          const awayWin = game.result.awayScore > game.result.homeScore;
                          const homeWin = game.result.homeScore > game.result.awayScore;
                          return (
                            <div key={gIdx} className="text-[11px]">
                              <span className={awayWin ? 'text-green-400 font-bold' : 'text-gray-400'}>{awayShort}</span>
                              <span className="text-gray-500 mx-0.5">{game.result.awayScore}-{game.result.homeScore}</span>
                              <span className={homeWin ? 'text-green-400 font-bold' : 'text-gray-400'}>{homeShort}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : cell.eventLabel ? (
                      <div className={`text-[11px] font-bold ${getEventColor(cell.eventLabel)}`}>{cell.eventLabel}</div>
                    ) : (
                      <div className="text-[10px] text-gray-500">-</div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-4 shadow-lg mb-4">
        <h2 className="text-lg font-bold text-white mb-3">{formatDate(seasonData.currentDate)} ({getDayOfWeek(seasonData.currentDate)}) の対戦</h2>
        {todaysGames.length === 0 ? (
          <div className="text-center py-4"><span className="text-gray-400">本日は試合がありません</span></div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {todaysGames.map(game => {
              const awayPitcher = getStartingPitcher(game.away);
              const homePitcher = getStartingPitcher(game.home);
              return (
                <div key={game.id} className="rounded-lg p-3 bg-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="text-center flex-1">
                      <div className="text-white font-bold text-lg">{(game.away || '').slice(0, 4)}</div>
                      <div className="text-xs text-gray-400 mt-1">先発: {awayPitcher ? `${awayPitcher.name} (${awayPitcher.physical?.throws === 'left' ? '左' : '右'})` : '未定'}</div>
                    </div>
                    <div className="px-4 text-gray-500 text-xl">vs</div>
                    <div className="text-center flex-1">
                      <div className="text-white font-bold text-lg">{(game.home || '').slice(0, 4)}</div>
                      <div className="text-xs text-gray-400 mt-1">先発: {homePitcher ? `${homePitcher.name} (${homePitcher.physical?.throws === 'left' ? '左' : '右'})` : '未定'}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 順位表（マジック・優勝表示付き） */}
      <div className="bg-gray-800 rounded-xl p-4 shadow-lg">
        <h2 className="text-xl font-bold text-white mb-4">順位表</h2>
        <table className="w-full text-white">
          <thead>
            <tr className="border-b border-gray-600 text-gray-400 text-sm">
              <th className="py-2 px-2 text-left w-12">順位</th>
              <th className="py-2 px-2 text-left">チーム</th>
              <th className="py-2 px-3 text-center">試合</th>
              <th className="py-2 px-3 text-center">勝</th>
              <th className="py-2 px-3 text-center">負</th>
              <th className="py-2 px-3 text-center">分</th>
              <th className="py-2 px-3 text-center">勝率</th>
              <th className="py-2 px-3 text-center">差</th>
              <th className="py-2 px-3 text-center">M</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((team, index) => {
              const isUserTeam = team.team === userTeamName;
              const winRate = (team.wins || 0) + (team.losses || 0) > 0
                ? ((team.wins || 0) / ((team.wins || 0) + (team.losses || 0))).toFixed(3)
                : '.000';

              let gameBehind = '';
              if (index === 0) {
                gameBehind = isChampionDecided ? '優勝' : '-';
              } else {
                const diff = ((leaderWins - (team.wins || 0)) - (leaderLosses - (team.losses || 0))) / 2;
                gameBehind = diff === 0 ? '-' : diff.toFixed(1);
              }

              let magic = '';
              if (index === 0 && standings.length > 1) {
                const second = standings[1];
                const secondMaxWins = (second.wins || 0) + (totalGames - ((second.wins || 0) + (second.losses || 0) + (second.draws || 0)));
                const magicNum = secondMaxWins - leaderWins + 1;
                if (magicNum > 0 && !isChampionDecided) magic = `M${magicNum}`;
                else if (isChampionDecided) magic = '-';
              }

              return (
                <tr key={team.team} className={`border-b border-gray-700 ${isUserTeam ? 'bg-blue-900/50' : ''} ${index === 0 && isChampionDecided ? 'bg-yellow-900/30' : ''}`}>
                  <td className="py-3 px-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${index === 0 ? 'bg-yellow-500 text-black' : index === 1 ? 'bg-gray-400 text-black' : index === 2 ? 'bg-orange-600 text-white' : 'bg-gray-600 text-white'}`}>{index + 1}</span>
                  </td>
                  <td className={`py-3 px-2 font-bold ${isUserTeam ? 'text-yellow-300' : ''}`}>{team.team}</td>
                  <td className="py-3 px-3 text-center">{team.gamesPlayed || 0}</td>
                  <td className="py-3 px-3 text-center text-green-400 font-bold">{team.wins || 0}</td>
                  <td className="py-3 px-3 text-center text-red-400 font-bold">{team.losses || 0}</td>
                  <td className="py-3 px-3 text-center text-gray-400">{team.draws || 0}</td>
                  <td className="py-3 px-3 text-center font-mono">{winRate}</td>
                  <td className={`py-3 px-3 text-center font-bold ${index === 0 && isChampionDecided ? 'text-yellow-400' : 'text-gray-400'}`}>{gameBehind}</td>
                  <td className="py-3 px-3 text-center text-red-400 font-bold">{magic}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DateProgressScreen;
