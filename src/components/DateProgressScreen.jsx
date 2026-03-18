import React, { useState } from 'react';
import { TEAMS_DATA } from '../teams-data.js';
import { PHASE_INFO, SEASON_PHASES, formatDate, getDayOfWeek, getCurrentPhase } from '../season/seasonManager.js';
import { getScheduleByDate } from '../season/scheduleGenerator.js';
import { progressDate, handlePhaseTransition } from '../season/dateProgression.js';
import { autoSimulateGame } from '../game/autoSimulation.js';
import { CONDITION_LEVELS, CONDITION_LABELS, CONDITION_COLORS, CONDITION_ICONS } from '../game/condition.js';

const DateProgressScreen = ({ seasonData, setSeasonData, onForceEvent, onSetupManagedGame }) => {
  const [selectedMonth, setSelectedMonth] = useState(seasonData?.currentDate?.month || 4);
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastGameResults, setLastGameResults] = useState([]);
  const [showGameChoiceModal, setShowGameChoiceModal] = useState(false);  // 試合選択モーダル

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

  const checkAndTriggerEvents = (oldData, newData) => {
    const oldPhase = oldData.phase;
    const newPhase = newData.phase;
    if (oldPhase !== newPhase) {
      newData = handlePhaseTransition(newData, newPhase);
    }
    const { month, day } = newData.currentDate;
    if (month === 10 && day === 24 && newPhase === SEASON_PHASES.DRAFT) {
      setSeasonData(newData);
      if (onForceEvent) onForceEvent('draft');
      return null;
    }
    if (month === 11 && day === 9 && newPhase === SEASON_PHASES.CONTRACT) {
      setSeasonData(newData);
      if (onForceEvent) onForceEvent('contract');
      return null;
    }
    if (month === 11 && day === 10 && newPhase === SEASON_PHASES.TRYOUT) {
      setSeasonData(newData);
      if (onForceEvent) onForceEvent('tryout');
      return null;
    }
    if (month >= 12 || (month === 11 && day >= 30)) {
      newData = { ...newData, phase: SEASON_PHASES.OFF_SEASON };
      setSeasonData(newData);
      if (onForceEvent) onForceEvent('offseason');
      return null;
    }
    return newData;
  };

  const checkUserLineupComplete = () => {
    const team = TEAMS_DATA[userTeamName];
    if (!team) return true;
    const settings = team.lineupSettings;
    if (!settings || !settings.battingOrder || settings.battingOrder.length === 0) return false;
    const validStarters = settings.battingOrder.filter(e => {
      if (e.battingOrder < 1 || e.battingOrder > 9) return false;
      return team.players.some(p => p.id === e.playerId);
    });
    return validStarters.length >= 9;
  };

  const handleProgressDate = (days) => {
    if ((currentPhase === SEASON_PHASES.REGULAR_SEASON || currentPhase === SEASON_PHASES.PLAYOFFS) && !checkUserLineupComplete()) {
      alert('スタメンが9人揃っていません。ロスター管理で打順を設定してください。');
      return;
    }

    // ユーザーチームの試合があるかチェック
    const todayGames = getScheduleByDate(seasonData.schedule, seasonData.currentDate);
    const userGame = todayGames.find(g => !g.result && (g.home === userTeamName || g.away === userTeamName));

    if (userGame && onSetupManagedGame && (currentPhase === SEASON_PHASES.REGULAR_SEASON || currentPhase === SEASON_PHASES.PLAYOFFS)) {
      // ユーザーチームの試合がある日 → 試合スキップ/采配モード選択を表示
      setShowGameChoiceModal(true);
      return;
    }

    // 試合がない日 or ユーザー試合がない → 通常進行
    executeSkipDay(days);
  };

  const executeSkipDay = (days) => {
    setIsSimulating(true);
    const { data: afterSimData, results } = simulateGamesOnDate(seasonData);
    let newSeasonData = progressDate(afterSimData, days);
    setLastGameResults(results);
    if (newSeasonData.currentDate.month !== selectedMonth) setSelectedMonth(newSeasonData.currentDate.month);
    const finalData = checkAndTriggerEvents(seasonData, newSeasonData);
    if (finalData !== null) setSeasonData(finalData);
    setIsSimulating(false);
  };

  const handleGameChoice = (choice) => {
    setShowGameChoiceModal(false);
    if (choice === 'skip') {
      executeSkipDay(1);
    } else if (choice === 'manage') {
      // 采配モードへ移行
      const todayGames = getScheduleByDate(seasonData.schedule, seasonData.currentDate);
      const userGame = todayGames.find(g => !g.result && (g.home === userTeamName || g.away === userTeamName));
      const otherGames = todayGames.filter(g => !g.result && g.home !== userTeamName && g.away !== userTeamName);

      if (userGame && onSetupManagedGame) {
        onSetupManagedGame({
          gameId: userGame.id,
          home: userGame.home,
          away: userGame.away,
          otherGames: otherGames.map(g => ({ gameId: g.id, home: g.home, away: g.away }))
        });
      }
    }
  };

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
    const phase = getCurrentPhase(selectedMonth, day);
    let eventLabel = null;
    if (selectedMonth === 11 && day === 30) eventLabel = 'シーズン終了';
    else if (phase === SEASON_PHASES.SPRING_CAMP) eventLabel = 'キャンプ';
    else if (phase === SEASON_PHASES.PLAYOFFS) eventLabel = 'プレーオフ';
    else if (phase === SEASON_PHASES.DRAFT) eventLabel = 'ドラフト';
    else if (phase === SEASON_PHASES.CONTRACT) eventLabel = '契約更改';
    else if (phase === SEASON_PHASES.TRYOUT) eventLabel = 'トライアウト';
    else if (phase === SEASON_PHASES.OFF_SEASON) eventLabel = 'オフシーズン';
    calendarCells.push({ day, games: gamesOnDay, isToday, eventLabel });
  }

  const todaysGames = getScheduleByDate(seasonData.schedule, seasonData.currentDate);

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

  const getEventColor = (label) => {
    if (label === 'シーズン終了') return 'text-red-400';
    if (label === 'プレーオフ') return 'text-yellow-400';
    if (label === '契約更改') return 'text-teal-400';
    if (label === 'トライアウト') return 'text-orange-400';
    if (label === 'オフシーズン') return 'text-gray-400';
    if (label === 'キャンプ') return 'text-green-400';
    if (label === 'ドラフト') return 'text-purple-400';
    return 'text-gray-500';
  };

  return (
    <div className="p-3 min-h-screen">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-3 bg-gradient-to-r from-gray-800 via-gray-800 to-gray-900 rounded-xl p-3 shadow-lg border border-gray-700/50">
        <button
          onClick={() => handleProgressDate(1)}
          disabled={isSimulating}
          className="bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white px-6 py-3 rounded-xl font-bold text-lg transition-all shadow-lg shadow-green-900/30 disabled:opacity-50 flex items-center gap-2 shrink-0 active:scale-95"
        >
          <span className="text-xl">▶</span>
          {isSimulating ? '処理中...' : '1日進める'}
        </button>
        <div className="flex items-center gap-3 flex-1 justify-center">
          <span className="text-2xl font-bold bg-gradient-to-r from-yellow-300 to-amber-400 bg-clip-text text-transparent">{seasonData.year}年目</span>
          <span className="text-gray-300 text-base font-medium">{formatDate(seasonData.currentDate)} ({getDayOfWeek(seasonData.currentDate)})</span>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${phaseInfo.color} text-gray-900 shadow-sm`}>{phaseInfo.name}</span>
        </div>
      </div>

      {/* 2カラムレイアウト: 左にカレンダー+本日の試合、右に順位表 */}
      <div className="flex gap-3">
        {/* 左カラム: カレンダー＋本日の試合 */}
        <div className="flex-1 min-w-0">
          <div className="bg-gradient-to-b from-gray-800 to-gray-850 rounded-xl p-3 shadow-lg border border-gray-700/40 mb-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold text-white flex items-center gap-1.5">
                <span className="text-blue-400">📅</span> {selectedMonth}月
              </h2>
              <div className="flex gap-1">
                <button onClick={() => setSelectedMonth(m => m > 1 ? m - 1 : 12)} className="bg-gray-700 hover:bg-gray-600 text-white w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors active:scale-95">◀</button>
                <button onClick={() => setSelectedMonth(m => m < 12 ? m + 1 : 1)} className="bg-gray-700 hover:bg-gray-600 text-white w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors active:scale-95">▶</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-0.5 mb-0.5">
              {dayNames.map((name, i) => (
                <div key={i} className={`text-center text-[10px] font-bold py-1 rounded ${i === 0 ? 'text-red-400 bg-red-900/20' : i === 6 ? 'text-blue-400 bg-blue-900/20' : 'text-gray-500'}`}>{name}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {calendarCells.map((cell, i) => {
                const showAsScheduled = cell.isToday;
                const colIdx = i % 7;
                return (
                  <div key={i} className={`min-h-[56px] p-1 rounded-lg text-xs transition-all ${
                    cell.day === null ? 'bg-transparent' :
                    cell.isToday ? 'bg-gradient-to-br from-green-900/90 to-emerald-900/70 border border-green-400 shadow-md shadow-green-900/40 ring-1 ring-green-400/30' :
                    colIdx === 0 ? 'bg-gray-700/50 hover:bg-gray-700/80' :
                    colIdx === 6 ? 'bg-gray-700/50 hover:bg-gray-700/80' :
                    'bg-gray-700/70 hover:bg-gray-700/90'
                  }`}>
                    {cell.day && (
                      <>
                        <div className={`font-bold mb-0.5 text-[11px] ${cell.isToday ? 'text-green-300' : colIdx === 0 ? 'text-red-400' : colIdx === 6 ? 'text-blue-400' : 'text-gray-300'}`}>{cell.day}</div>
                        {cell.games.length > 0 ? (
                          <div className="space-y-0">
                            {cell.games.map((game, gIdx) => {
                              const awayShort = (game.away || '').slice(0, 4);
                              const homeShort = (game.home || '').slice(0, 4);
                              if (showAsScheduled || !game.result) {
                                return <div key={gIdx} className="text-[10px] text-yellow-300 leading-tight">{awayShort}-{homeShort}</div>;
                              }
                              const awayWin = game.result.awayScore > game.result.homeScore;
                              const homeWin = game.result.homeScore > game.result.awayScore;
                              return (
                                <div key={gIdx} className="text-[10px] leading-tight">
                                  <span className={awayWin ? 'text-green-400 font-bold' : 'text-gray-500'}>{awayShort}</span>
                                  <span className="text-gray-600 mx-px">{game.result.awayScore}-{game.result.homeScore}</span>
                                  <span className={homeWin ? 'text-green-400 font-bold' : 'text-gray-500'}>{homeShort}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : cell.eventLabel ? (
                          <div className={`text-[10px] font-bold leading-tight ${getEventColor(cell.eventLabel)}`}>{cell.eventLabel}</div>
                        ) : (
                          <div className="text-[9px] text-gray-600">-</div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 本日の対戦 */}
          <div className="bg-gradient-to-b from-gray-800 to-gray-850 rounded-xl p-3 shadow-lg border border-gray-700/40">
            <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
              <span className="text-orange-400">⚾</span> {formatDate(seasonData.currentDate)} の対戦
            </h2>
            {todaysGames.length === 0 ? (
              <div className="text-center py-3"><span className="text-gray-500 text-sm">本日は試合がありません</span></div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {todaysGames.map(game => {
                  const awayPitcher = getStartingPitcher(game.away);
                  const homePitcher = getStartingPitcher(game.home);
                  const hasResult = !!game.result;
                  return (
                    <div key={game.id} className={`rounded-xl p-2.5 transition-all ${hasResult ? 'bg-gray-700/50' : 'bg-gradient-to-r from-gray-700/80 to-gray-700/60 border border-gray-600/30'}`}>
                      <div className="flex items-center justify-between">
                        <div className="text-center flex-1">
                          <div className="text-white font-bold text-sm">{(game.away || '').slice(0, 4)}</div>
                          <div className="text-[10px] text-yellow-400/80 mt-0.5">{awayPitcher ? `${awayPitcher.name}` : '未定'}</div>
                        </div>
                        <div className="px-2 text-gray-500 text-xs font-bold">vs</div>
                        <div className="text-center flex-1">
                          <div className="text-white font-bold text-sm">{(game.home || '').slice(0, 4)}</div>
                          <div className="text-[10px] text-yellow-400/80 mt-0.5">{homePitcher ? `${homePitcher.name}` : '未定'}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 個人成績ランキング */}
          {(() => {
            const allPlayers = [];
            Object.entries(TEAMS_DATA || {}).forEach(([teamName, team]) => {
              if (!team?.players) return;
              team.players.forEach(p => {
                allPlayers.push({ ...p, teamName });
              });
            });

            const battingQualified = allPlayers.filter(p => (p.seasonStats?.batting?.atBats || 0) >= 10);
            const pitchingQualified = allPlayers.filter(p => (p.seasonStats?.pitching?.inningsPitched || 0) / 3 >= 3);

            const avgRanking = [...battingQualified]
              .map(p => ({ ...p, value: p.seasonStats.batting.hits / p.seasonStats.batting.atBats }))
              .sort((a, b) => b.value - a.value).slice(0, 5);

            const hrRanking = [...allPlayers]
              .filter(p => (p.seasonStats?.batting?.homeruns || 0) > 0)
              .map(p => ({ ...p, value: p.seasonStats.batting.homeruns }))
              .sort((a, b) => b.value - a.value).slice(0, 5);

            const rbiRanking = [...allPlayers]
              .filter(p => (p.seasonStats?.batting?.rbis || 0) > 0)
              .map(p => ({ ...p, value: p.seasonStats.batting.rbis }))
              .sort((a, b) => b.value - a.value).slice(0, 5);

            const eraRanking = [...pitchingQualified]
              .map(p => ({ ...p, value: (p.seasonStats.pitching.earnedRuns / (p.seasonStats.pitching.inningsPitched / 3)) * 9 }))
              .sort((a, b) => a.value - b.value).slice(0, 5);

            const winRanking = [...allPlayers]
              .filter(p => (p.seasonStats?.pitching?.wins || 0) > 0)
              .map(p => ({ ...p, value: p.seasonStats.pitching.wins }))
              .sort((a, b) => b.value - a.value).slice(0, 5);

            const soRanking = [...allPlayers]
              .filter(p => (p.seasonStats?.pitching?.strikeouts || 0) > 0)
              .map(p => ({ ...p, value: p.seasonStats.pitching.strikeouts }))
              .sort((a, b) => b.value - a.value).slice(0, 5);

            const rankings = [
              { title: '打率', data: avgRanking, format: v => v.toFixed(3), color: 'text-blue-400', icon: '🏏' },
              { title: '本塁打', data: hrRanking, format: v => v, color: 'text-pink-400', icon: '💥' },
              { title: '打点', data: rbiRanking, format: v => v, color: 'text-green-400', icon: '🔋' },
              { title: '防御率', data: eraRanking, format: v => v.toFixed(2), color: 'text-orange-400', icon: '🛡' },
              { title: '勝利', data: winRanking, format: v => v, color: 'text-yellow-400', icon: '🏆' },
              { title: '奪三振', data: soRanking, format: v => v, color: 'text-purple-400', icon: '🔥' },
            ];

            const hasAnyData = rankings.some(r => r.data.length > 0);
            if (!hasAnyData) return null;

            return (
              <div className="bg-gradient-to-b from-gray-800 to-gray-850 rounded-xl p-3 shadow-lg border border-gray-700/40 mt-3">
                <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
                  <span className="text-yellow-400">📊</span> 個人成績ランキング
                </h2>
                <div className="grid grid-cols-3 gap-2">
                  {rankings.map(r => (
                    <div key={r.title} className="bg-gray-900/70 rounded-lg p-2 border border-gray-700/30">
                      <div className={`text-[10px] font-bold ${r.color} mb-1 pb-0.5 border-b border-gray-700/50`}>{r.icon} {r.title}</div>
                      {r.data.length === 0 ? (
                        <div className="text-[10px] text-gray-600">データなし</div>
                      ) : (
                        r.data.map((p, i) => {
                          const isUser = p.teamName === userTeamName;
                          return (
                            <div key={p.id} className={`flex items-center text-[10px] leading-relaxed ${isUser ? 'text-yellow-300' : 'text-gray-300'}`}>
                              <span className={`w-3 text-center font-bold ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-600' : 'text-gray-600'}`}>{i + 1}</span>
                              <span className="flex-1 truncate ml-1">{p.name}</span>
                              <span className={`font-mono font-bold ${r.color}`}>{r.format(p.value)}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* 右カラム: 順位表 */}
        <div className="w-[420px] shrink-0">
          {(() => {
            const leagueFormat = seasonData?.settings?.leagueFormat || 'single';
            const isTwoLeague = leagueFormat === 'two';
            const teamNamesList = seasonData?.settings?.teamNames || [];
            const leagueNamesList = seasonData?.settings?.leagueNames || ['リーグ1', 'リーグ2'];
            const halfTeams = Math.floor((seasonData?.settings?.teamsCount || 4) / 2);
            const league1Teams = teamNamesList.slice(0, halfTeams);
            const league2Teams = teamNamesList.slice(halfTeams);

            const renderStandingsTable = (leagueStandings, title, titleColor) => {
              const lLeader = leagueStandings[0];
              const lLeaderWins = lLeader?.wins || 0;
              const lLeaderLosses = lLeader?.losses || 0;
              const isLChampionDecided = lLeader && leagueStandings.length > 1 && (() => {
                const second = leagueStandings[1];
                const secondRemaining = totalGames - ((second.wins || 0) + (second.losses || 0) + (second.draws || 0));
                return lLeaderWins > (second.wins || 0) + secondRemaining;
              })();

              return (
                <div className="bg-gradient-to-b from-gray-800 to-gray-850 rounded-xl p-3 shadow-lg border border-gray-700/40">
                  <h2 className={`text-sm font-bold mb-2 ${titleColor || 'text-white'} flex items-center gap-1.5`}>
                    <span>📊</span> {title}
                  </h2>
                  <table className="w-full text-white text-xs">
                    <thead>
                      <tr className="border-b border-gray-600 text-gray-500 text-[10px]">
                        <th className="py-1 px-0.5 text-center w-6">#</th>
                        <th className="py-1 px-1 text-left">チーム</th>
                        <th className="py-1 px-0.5 text-center">試</th>
                        <th className="py-1 px-0.5 text-center">勝</th>
                        <th className="py-1 px-0.5 text-center">負</th>
                        <th className="py-1 px-0.5 text-center">分</th>
                        <th className="py-1 px-0.5 text-center">率</th>
                        <th className="py-1 px-0.5 text-center">差</th>
                        <th className="py-1 px-0.5 text-center">打率</th>
                        <th className="py-1 px-0.5 text-center">防</th>
                        <th className="py-1 px-0.5 text-center">M</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leagueStandings.map((team, index) => {
                        const isUser = team.team === userTeamName;
                        const wr = (team.wins || 0) + (team.losses || 0) > 0
                          ? ((team.wins || 0) / ((team.wins || 0) + (team.losses || 0))).toFixed(3) : '.000';
                        const td = TEAMS_DATA[team.team];
                        let tAvg = '-', tEra = '-';
                        if (td?.players) {
                          let tH = 0, tAB = 0, tER = 0, tIP = 0;
                          td.players.forEach(p => {
                            tH += p.seasonStats?.batting?.hits || 0;
                            tAB += p.seasonStats?.batting?.atBats || 0;
                            tER += p.seasonStats?.pitching?.earnedRuns || 0;
                            tIP += (p.seasonStats?.pitching?.inningsPitched || 0) / 3;
                          });
                          tAvg = tAB > 0 ? (tH / tAB).toFixed(3) : '-';
                          tEra = tIP > 0 ? (tER / tIP * 9).toFixed(2) : '-';
                        }
                        let gb = '';
                        if (index === 0) gb = isLChampionDecided ? '優勝' : '-';
                        else { const d = ((lLeaderWins - (team.wins || 0)) - (lLeaderLosses - (team.losses || 0))) / 2; gb = d === 0 ? '-' : d.toFixed(1); }
                        let mg = '';
                        if (index === 0 && leagueStandings.length > 1) {
                          const sec = leagueStandings[1];
                          const secMax = (sec.wins || 0) + (totalGames - ((sec.wins || 0) + (sec.losses || 0) + (sec.draws || 0)));
                          const mn = secMax - lLeaderWins + 1;
                          if (mn > 0 && !isLChampionDecided) mg = `M${mn}`;
                          else if (isLChampionDecided) mg = '-';
                        }
                        return (
                          <tr key={team.team} className={`border-b border-gray-700/50 ${isUser ? 'bg-blue-900/40' : ''} ${index === 0 && isLChampionDecided ? 'bg-yellow-900/20' : ''}`}>
                            <td className="py-1.5 px-0.5 text-center">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mx-auto ${index === 0 ? 'bg-yellow-500 text-black' : index === 1 ? 'bg-gray-400 text-black' : index === 2 ? 'bg-orange-600 text-white' : 'bg-gray-600 text-white'}`}>{index + 1}</span>
                            </td>
                            <td className={`py-1.5 px-1 font-bold text-xs ${isUser ? 'text-yellow-300' : ''}`}>{team.team}</td>
                            <td className="py-1.5 px-0.5 text-center text-gray-400">{team.gamesPlayed || 0}</td>
                            <td className="py-1.5 px-0.5 text-center text-green-400 font-bold">{team.wins || 0}</td>
                            <td className="py-1.5 px-0.5 text-center text-red-400 font-bold">{team.losses || 0}</td>
                            <td className="py-1.5 px-0.5 text-center text-gray-500">{team.draws || 0}</td>
                            <td className="py-1.5 px-0.5 text-center font-mono">{wr}</td>
                            <td className={`py-1.5 px-0.5 text-center font-bold ${index === 0 && isLChampionDecided ? 'text-yellow-400 text-[10px]' : 'text-gray-400'}`}>{gb}</td>
                            <td className="py-1.5 px-0.5 text-center font-mono text-blue-300">{tAvg}</td>
                            <td className="py-1.5 px-0.5 text-center font-mono text-orange-300">{tEra}</td>
                            <td className="py-1.5 px-0.5 text-center text-red-400 font-bold">{mg}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            };

            if (isTwoLeague) {
              const l1 = standings.filter(s => league1Teams.includes(s.team)).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
              const l2 = standings.filter(s => league2Teams.includes(s.team)).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
              return (
                <div className="space-y-3">
                  {renderStandingsTable(l1, `${leagueNamesList[0]} 順位表`, 'text-blue-400')}
                  {renderStandingsTable(l2, `${leagueNamesList[1]} 順位表`, 'text-orange-400')}
                </div>
              );
            }
            return renderStandingsTable(standings, '順位表', 'text-white');
          })()}
        </div>
      </div>

      {/* 試合選択モーダル */}
      {showGameChoiceModal && (() => {
        const todayGames = getScheduleByDate(seasonData.schedule, seasonData.currentDate);
        const userGame = todayGames.find(g => !g.result && (g.home === userTeamName || g.away === userTeamName));
        const opponentName = userGame ? (userGame.home === userTeamName ? userGame.away : userGame.home) : '';
        const isHome = userGame ? userGame.home === userTeamName : true;
        const userTeam = TEAMS_DATA[userTeamName];
        const opponentTeam = TEAMS_DATA[opponentName];

        // スタメン選手のコンディション取得
        const getStarters = (team) => {
          if (!team?.players) return [];
          const settings = team.lineupSettings;
          if (settings?.battingOrder?.length > 0) {
            return settings.battingOrder
              .sort((a, b) => a.battingOrder - b.battingOrder)
              .map(entry => team.players.find(p => p.id === entry.playerId))
              .filter(Boolean);
          }
          return team.players
            .filter(p => p.battingOrder > 0 && p.battingOrder <= 9)
            .sort((a, b) => a.battingOrder - b.battingOrder);
        };

        const userStarters = getStarters(userTeam);

        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl p-6 max-w-xl w-full mx-4 shadow-2xl border border-gray-600/50">
              <h2 className="text-xl font-bold text-white text-center mb-4">
                {formatDate(seasonData.currentDate)} の試合
              </h2>

              <div className="flex items-center justify-center gap-6 mb-5">
                <div className="text-center">
                  <div className={`font-bold text-lg ${isHome ? 'text-blue-400' : 'text-red-400'}`}>
                    {isHome ? '🏠' : '✈️'} {userTeamName}
                  </div>
                </div>
                <div className="text-2xl text-gray-500 font-bold">VS</div>
                <div className="text-center">
                  <div className={`font-bold text-lg ${!isHome ? 'text-blue-400' : 'text-red-400'}`}>
                    {!isHome ? '🏠' : '✈️'} {opponentName}
                  </div>
                </div>
              </div>

              {/* スタメンコンディション一覧 */}
              <div className="bg-gray-900 rounded-lg p-3 mb-5">
                <h3 className="text-sm font-bold text-gray-400 mb-2">スタメン コンディション</h3>
                <div className="grid grid-cols-3 gap-1 text-xs">
                  {userStarters.map((player, i) => {
                    const cond = player.condition ?? CONDITION_LEVELS.NORMAL;
                    return (
                      <div key={player.id} className="flex items-center gap-1 bg-gray-800 rounded px-2 py-1">
                        <span className="text-gray-500 w-4">{i + 1}</span>
                        <span className="text-white truncate flex-1">{player.name}</span>
                        <span className={CONDITION_COLORS[cond]}>{CONDITION_ICONS[cond]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => handleGameChoice('manage')}
                  className="bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold py-3 px-8 rounded-xl transition-all text-lg shadow-lg shadow-green-900/30 active:scale-95"
                >
                  試合采配
                </button>
                <button
                  onClick={() => handleGameChoice('skip')}
                  className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-8 rounded-xl transition-all text-lg active:scale-95"
                >
                  試合スキップ
                </button>
              </div>
              <button
                onClick={() => setShowGameChoiceModal(false)}
                className="mt-3 w-full text-center text-gray-500 hover:text-gray-300 text-sm transition"
              >
                キャンセル
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default DateProgressScreen;
