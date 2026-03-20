import React, { useState } from 'react';
import { TEAMS_DATA, getTeamAbbreviation } from '../teams-data.js';
import { PHASE_INFO, SEASON_PHASES, formatDate, getDayOfWeek, getCurrentPhase } from '../season/seasonManager.js';
import { getScheduleByDate } from '../season/scheduleGenerator.js';
import { progressDate, handlePhaseTransition, updatePlayoffProgress } from '../season/dateProgression.js';
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
    let updatedData = { ...sData, schedule: updatedSchedule, standings: updatedStandings, results: updatedResults };
    // プレーオフ進行を更新（シリーズ決着・TBD確定）
    if (sData.phase === SEASON_PHASES.PLAYOFFS) {
      updatedData = updatePlayoffProgress(updatedData);
    }
    return { data: updatedData, results: gameResults };
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

  // ユーザーチームの成績取得
  const userStanding = standings.find(s => s.team === userTeamName);
  const userWins = userStanding?.wins || 0;
  const userLosses = userStanding?.losses || 0;
  const userDraws = userStanding?.draws || 0;
  const userRank = standings.findIndex(s => s.team === userTeamName) + 1;

  return (
    <div className="p-3 min-h-screen">
      {/* ヘッダー */}
      <div className="mb-3 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl border border-gray-700/50 overflow-hidden">
        {/* トップバー：フェーズ表示 */}
        <div className={`px-4 py-1 ${
          currentPhase === SEASON_PHASES.PLAYOFFS ? 'bg-gradient-to-r from-yellow-600/80 via-amber-500/60 to-yellow-600/80' :
          currentPhase === SEASON_PHASES.REGULAR_SEASON ? 'bg-gradient-to-r from-blue-700/60 via-blue-600/40 to-blue-700/60' :
          currentPhase === SEASON_PHASES.SPRING_CAMP ? 'bg-gradient-to-r from-green-700/60 via-green-600/40 to-green-700/60' :
          'bg-gradient-to-r from-gray-700/60 via-gray-600/40 to-gray-700/60'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold tracking-wider uppercase ${
              currentPhase === SEASON_PHASES.PLAYOFFS ? 'text-yellow-200' : 'text-gray-300'
            }`}>{phaseInfo.name}</span>
            <span className="text-xs text-gray-400">{seasonData.year}年目シーズン</span>
          </div>
        </div>
        {/* メインヘッダー */}
        <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => handleProgressDate(1)}
            disabled={isSimulating}
            className="bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white px-7 py-3.5 rounded-xl font-bold text-lg transition-all shadow-lg shadow-green-900/40 disabled:opacity-50 flex items-center gap-2 shrink-0 active:scale-95 ring-1 ring-green-400/20"
          >
            <span className="text-xl">▶</span>
            {isSimulating ? '処理中...' : '1日進める'}
          </button>
          <div className="flex-1 flex items-center justify-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-black bg-gradient-to-b from-white to-gray-300 bg-clip-text text-transparent leading-tight">
                {formatDate(seasonData.currentDate)}
              </div>
              <div className="text-sm text-gray-400 font-medium">{getDayOfWeek(seasonData.currentDate)}</div>
            </div>
          </div>
          {/* チーム成績サマリー */}
          <div className="shrink-0 bg-gray-800/80 rounded-xl px-4 py-2 border border-gray-700/50">
            <div className="text-xs text-gray-400 mb-0.5 text-center">{userTeamName}</div>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-lg font-bold text-green-400">{userWins}</div>
                <div className="text-[10px] text-gray-500">勝</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-red-400">{userLosses}</div>
                <div className="text-[10px] text-gray-500">敗</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-gray-400">{userDraws}</div>
                <div className="text-[10px] text-gray-500">分</div>
              </div>
              <div className="border-l border-gray-600 pl-3">
                <div className={`text-lg font-bold ${userRank <= 2 ? 'text-yellow-400' : 'text-white'}`}>{userRank}位</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2カラムレイアウト: 左にカレンダー+本日の試合、右に順位表 */}
      <div className="flex gap-3">
        {/* 左カラム: カレンダー＋本日の試合 */}
        <div className="flex-1 min-w-0">
          <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-gray-700/30 mb-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600/30 flex items-center justify-center">
                  <span className="text-blue-400 text-sm">📅</span>
                </div>
                <span>{selectedMonth}月</span>
                <span className="text-sm font-normal text-gray-500">スケジュール</span>
              </h2>
              <div className="flex gap-1">
                <button onClick={() => setSelectedMonth(m => m > 1 ? m - 1 : 12)} className="bg-gray-700/80 hover:bg-gray-600 text-white w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all active:scale-95 border border-gray-600/30">◀</button>
                <button onClick={() => setSelectedMonth(m => m < 12 ? m + 1 : 1)} className="bg-gray-700/80 hover:bg-gray-600 text-white w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all active:scale-95 border border-gray-600/30">▶</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {dayNames.map((name, i) => (
                <div key={i} className={`text-center text-[11px] font-bold py-1.5 rounded-md ${i === 0 ? 'text-red-400 bg-red-900/15' : i === 6 ? 'text-blue-400 bg-blue-900/15' : 'text-gray-400 bg-gray-800/50'}`}>{name}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {calendarCells.map((cell, i) => {
                const showAsScheduled = cell.isToday;
                const colIdx = i % 7;
                const hasUserGame = cell.games?.some(g => g.home === userTeamName || g.away === userTeamName);
                return (
                  <div key={i} className={`min-h-[62px] p-1 rounded-lg text-sm transition-all ${
                    cell.day === null ? 'bg-transparent' :
                    cell.isToday ? 'bg-gradient-to-br from-green-800/90 to-emerald-900/80 border-2 border-green-400/80 shadow-lg shadow-green-900/50 ring-1 ring-green-400/20' :
                    hasUserGame && cell.games.some(g => g.result) ? 'bg-gray-700/60 border border-gray-600/20' :
                    colIdx === 0 ? 'bg-gray-800/60 hover:bg-gray-700/60' :
                    colIdx === 6 ? 'bg-gray-800/60 hover:bg-gray-700/60' :
                    'bg-gray-800/40 hover:bg-gray-700/50'
                  }`}>
                    {cell.day && (
                      <>
                        <div className={`font-bold mb-0.5 text-xs leading-none ${cell.isToday ? 'text-green-300' : colIdx === 0 ? 'text-red-400' : colIdx === 6 ? 'text-blue-400' : 'text-gray-200'}`}>{cell.day}</div>
                        {cell.games.length > 0 ? (
                          <div className="space-y-0">
                            {cell.games.map((game, gIdx) => {
                              const awayShort = getTeamAbbreviation(game.away);
                              const homeShort = getTeamAbbreviation(game.home);
                              const isUserInGame = game.home === userTeamName || game.away === userTeamName;
                              if (showAsScheduled || !game.result) {
                                return <div key={gIdx} className={`text-[11px] leading-tight text-center font-medium ${isUserInGame ? 'text-yellow-300' : 'text-white'}`}>{awayShort}-{homeShort}</div>;
                              }
                              if (game.result?.cancelled) return null;
                              const awayWin = game.result.awayScore > game.result.homeScore;
                              const homeWin = game.result.homeScore > game.result.awayScore;
                              // ユーザーチームの勝敗を視覚的に
                              let userWon = null;
                              if (isUserInGame) {
                                if (game.home === userTeamName) userWon = homeWin;
                                else userWon = awayWin;
                              }
                              // プレーオフの通算成績を計算
                              let seriesInfo = null;
                              if (game.seriesId && game.phase === SEASON_PHASES.PLAYOFFS) {
                                const seriesGames = (seasonData.schedule || []).filter(g => g.seriesId === game.seriesId && g.result && !g.result?.cancelled);
                                const upToThis = seriesGames.filter(g => g.seriesGame <= game.seriesGame);
                                const homeTeamInSeries = (seasonData.schedule || []).find(g => g.seriesId === game.seriesId && g.seriesGame === 1)?.home || game.home;
                                let homeWins = 0, awayWins = 0;
                                upToThis.forEach(g => {
                                  const hWon = g.result.homeScore > g.result.awayScore;
                                  const isSeriesHome = g.home === homeTeamInSeries;
                                  if ((hWon && isSeriesHome) || (!hWon && !isSeriesHome)) homeWins++;
                                  else awayWins++;
                                });
                                seriesInfo = `${homeWins}-${awayWins}`;
                              }
                              return (
                                <div key={gIdx} className="leading-tight text-center">
                                  <div className="text-[11px]">
                                    <span className={awayWin ? 'text-green-400 font-bold' : 'text-gray-300'}>{awayShort}</span>
                                    <span className="text-white mx-px font-mono text-[10px]">{game.result.awayScore}-{game.result.homeScore}</span>
                                    <span className={homeWin ? 'text-green-400 font-bold' : 'text-gray-300'}>{homeShort}</span>
                                  </div>
                                  {isUserInGame && userWon !== null && (
                                    <div className={`text-[9px] font-bold ${userWon ? 'text-green-400' : 'text-red-400'}`}>{userWon ? '○' : '●'}</div>
                                  )}
                                  {seriesInfo && <div className="text-[9px] text-yellow-300 font-mono">{seriesInfo}</div>}
                                </div>
                              );
                            })}
                          </div>
                        ) : cell.eventLabel ? (
                          <div className={`text-[10px] font-bold leading-tight mt-0.5 ${getEventColor(cell.eventLabel)}`}>{cell.eventLabel}</div>
                        ) : (
                          <div className="text-[10px] text-gray-700">-</div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 本日の対戦 */}
          <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-gray-700/30">
            <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-orange-600/30 flex items-center justify-center">
                <span className="text-orange-400 text-sm">⚾</span>
              </div>
              <span>{formatDate(seasonData.currentDate)} の対戦</span>
              <span className="text-xs font-normal text-gray-500 ml-1">{todaysGames.length}試合</span>
            </h2>
            <div className="h-[220px] overflow-y-auto">
            {todaysGames.length === 0 ? (
              <div className="text-center py-6 bg-gray-800/50 rounded-xl h-full flex flex-col items-center justify-center">
                <div className="text-gray-600 text-2xl mb-1">⚾</div>
                <span className="text-gray-500 text-sm">本日は試合がありません（休養日）</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {todaysGames.map(game => {
                  const awayPitcher = getStartingPitcher(game.away);
                  const homePitcher = getStartingPitcher(game.home);
                  const hasResult = !!game.result;
                  const isUserGame = game.home === userTeamName || game.away === userTeamName;
                  // プレーオフ通算成績
                  let todaySeriesInfo = null;
                  if (game.seriesId && game.phase === SEASON_PHASES.PLAYOFFS) {
                    const seriesAll = (seasonData.schedule || []).filter(g => g.seriesId === game.seriesId && !g.result?.cancelled);
                    const played = seriesAll.filter(g => g.result);
                    const homeTeamInSeries = seriesAll.find(g => g.seriesGame === 1)?.home || game.home;
                    let hWins = 0, aWins = 0;
                    played.forEach(g => {
                      const hWon = g.result.homeScore > g.result.awayScore;
                      const isSeriesHome = g.home === homeTeamInSeries;
                      if ((hWon && isSeriesHome) || (!hWon && !isSeriesHome)) hWins++;
                      else aWins++;
                    });
                    const roundLabel = game.playoffRound === 'semi' ? '準決勝' : '決勝';
                    todaySeriesInfo = `${roundLabel} 第${game.seriesGame}戦 (${hWins}-${aWins})`;
                  }
                  return (
                    <div key={game.id} className={`rounded-xl p-3 transition-all relative overflow-hidden ${
                      isUserGame && !hasResult ? 'bg-gradient-to-br from-blue-900/50 to-blue-800/30 border border-blue-500/30 shadow-md shadow-blue-900/20' :
                      hasResult ? 'bg-gray-800/60 border border-gray-700/20' :
                      'bg-gradient-to-br from-gray-800/80 to-gray-800/50 border border-gray-700/20'
                    }`}>
                      {isUserGame && !hasResult && <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400"></div>}
                      {todaySeriesInfo && (
                        <div className="text-center mb-1.5">
                          <span className="text-[10px] bg-yellow-600/30 text-yellow-300 font-bold px-2 py-0.5 rounded-full">{todaySeriesInfo}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="text-center flex-1">
                          <div className={`font-bold text-base ${game.away === userTeamName ? 'text-yellow-300' : 'text-white'}`}>{getTeamAbbreviation(game.away)}</div>
                          <div className="text-[11px] text-gray-400 mt-0.5 truncate">{awayPitcher ? awayPitcher.name : '先発未定'}</div>
                        </div>
                        {hasResult ? (
                          <div className="px-3 text-center">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xl font-black font-mono ${game.result.awayScore > game.result.homeScore ? 'text-green-400' : 'text-gray-400'}`}>{game.result.awayScore}</span>
                              <span className="text-gray-600 text-sm">-</span>
                              <span className={`text-xl font-black font-mono ${game.result.homeScore > game.result.awayScore ? 'text-green-400' : 'text-gray-400'}`}>{game.result.homeScore}</span>
                            </div>
                            <div className="text-[9px] text-gray-500 mt-0.5">試合終了</div>
                          </div>
                        ) : (
                          <div className="px-3 text-center">
                            <div className="text-gray-500 text-xs font-bold tracking-wider">VS</div>
                          </div>
                        )}
                        <div className="text-center flex-1">
                          <div className={`font-bold text-base ${game.home === userTeamName ? 'text-yellow-300' : 'text-white'}`}>{getTeamAbbreviation(game.home)}</div>
                          <div className="text-[11px] text-gray-400 mt-0.5 truncate">{homePitcher ? homePitcher.name : '先発未定'}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </div>
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

            // 規定打席・規定投球回をシーズン進行度に比例して算出
            // NPB基準: 規定打席=試合数×3.1、規定投球回=試合数×1.0（イニング）
            const maxGamesPlayed = Math.max(...(standings.map(s => s.gamesPlayed || 0)), 1);
            const seasonProgress = Math.min(maxGamesPlayed / totalGames, 1);
            const qualifiedAB = Math.max(Math.floor(totalGames * 3.1 * seasonProgress), 10);
            const qualifiedInnings = Math.max(Math.floor(totalGames * 1.0 * seasonProgress), 3);
            const qualifiedOuts = qualifiedInnings * 3;

            const battingQualified = allPlayers.filter(p => (p.seasonStats?.batting?.atBats || 0) >= qualifiedAB);
            const pitchingQualified = allPlayers.filter(p => (p.seasonStats?.pitching?.inningsPitched || 0) >= qualifiedOuts);

            const avgRanking = [...battingQualified]
              .map(p => ({ ...p, value: p.seasonStats.batting.hits / p.seasonStats.batting.atBats }))
              .sort((a, b) => b.value - a.value).slice(0, 5);

            const hrRanking = [...battingQualified]
              .filter(p => (p.seasonStats?.batting?.homeruns || 0) > 0)
              .map(p => ({ ...p, value: p.seasonStats.batting.homeruns }))
              .sort((a, b) => b.value - a.value).slice(0, 5);

            const rbiRanking = [...battingQualified]
              .filter(p => (p.seasonStats?.batting?.rbis || 0) > 0)
              .map(p => ({ ...p, value: p.seasonStats.batting.rbis }))
              .sort((a, b) => b.value - a.value).slice(0, 5);

            const eraRanking = [...pitchingQualified]
              .map(p => ({ ...p, value: (p.seasonStats.pitching.earnedRuns / (p.seasonStats.pitching.inningsPitched / 3)) * 9 }))
              .sort((a, b) => a.value - b.value).slice(0, 5);

            const winRanking = [...pitchingQualified]
              .filter(p => (p.seasonStats?.pitching?.wins || 0) > 0)
              .map(p => ({ ...p, value: p.seasonStats.pitching.wins }))
              .sort((a, b) => b.value - a.value).slice(0, 5);

            const soRanking = [...pitchingQualified]
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
              <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-gray-700/30 mt-3">
                <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-yellow-600/30 flex items-center justify-center">
                    <span className="text-yellow-400 text-sm">📊</span>
                  </div>
                  <span>個人成績ランキング</span>
                  <span className="text-[10px] text-gray-300 font-normal ml-1">規定打席{qualifiedAB} / 規定投球{qualifiedInnings}回</span>
                </h2>
                <div className="grid grid-cols-3 gap-2">
                  {rankings.map(r => (
                    <div key={r.title} className="bg-gray-900/80 rounded-xl p-2.5 border border-gray-700/20">
                      <div className={`text-xs font-bold ${r.color} mb-2 pb-1.5 border-b border-gray-700/40 flex items-center gap-1`}>
                        <span>{r.icon}</span> {r.title}
                      </div>
                      {r.data.length === 0 ? (
                        <div className="text-xs text-gray-600 py-1">該当者なし</div>
                      ) : (
                        r.data.map((p, i) => {
                          const isUser = p.teamName === userTeamName;
                          return (
                            <div key={p.id} className={`flex items-center text-xs py-0.5 rounded-md px-1 ${isUser ? 'text-yellow-300 bg-yellow-900/15' : 'text-gray-300'}`}>
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                i === 0 ? 'bg-yellow-500/90 text-black' : i === 1 ? 'bg-gray-400/80 text-black' : i === 2 ? 'bg-orange-600/80 text-white' : 'text-gray-600'
                              }`}>{i + 1}</span>
                              <span className="flex-1 truncate ml-1.5 text-sm">{p.name} <span className="text-gray-300 text-[10px]">({getTeamAbbreviation(p.teamName)})</span></span>
                              <span className={`font-mono font-bold text-xs ${r.color}`}>{r.format(p.value)}</span>
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
                <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-gray-700/30">
                  <h2 className={`text-base font-bold mb-2.5 ${titleColor || 'text-white'} flex items-center gap-2`}>
                    <div className="w-7 h-7 rounded-lg bg-gray-700/60 flex items-center justify-center text-sm">📊</div>
                    {title}
                  </h2>
                  <table className="w-full text-white text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-600/50 text-gray-400 text-[11px]">
                        <th className="py-1.5 px-0.5 text-center w-6">#</th>
                        <th className="py-1.5 px-1 text-left">チーム</th>
                        <th className="py-1.5 px-0.5 text-center">試</th>
                        <th className="py-1.5 px-0.5 text-center">勝</th>
                        <th className="py-1.5 px-0.5 text-center">負</th>
                        <th className="py-1.5 px-0.5 text-center">分</th>
                        <th className="py-1.5 px-0.5 text-center">率</th>
                        <th className="py-1.5 px-0.5 text-center">差</th>
                        <th className="py-1.5 px-0.5 text-center">打率</th>
                        <th className="py-1.5 px-0.5 text-center">防</th>
                        <th className="py-1.5 px-0.5 text-center">M</th>
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
                          <tr key={team.team} className={`border-b border-gray-700/30 transition-colors hover:bg-gray-700/20 ${isUser ? 'bg-blue-900/30 hover:bg-blue-900/40' : ''} ${index === 0 && isLChampionDecided ? 'bg-yellow-900/15' : ''}`}>
                            <td className="py-1.5 px-0.5 text-center">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mx-auto ${index === 0 ? 'bg-yellow-500/90 text-black' : index === 1 ? 'bg-gray-400/80 text-black' : index === 2 ? 'bg-orange-600/80 text-white' : 'bg-gray-700 text-gray-400'}`}>{index + 1}</span>
                            </td>
                            <td className={`py-1.5 px-1 font-bold text-sm ${isUser ? 'text-yellow-300' : ''}`}>
                              {team.team}
                              {isUser && <span className="ml-1 text-[9px] text-blue-400">YOU</span>}
                            </td>
                            <td className="py-1.5 px-0.5 text-center text-white text-xs">{team.gamesPlayed || 0}</td>
                            <td className="py-1.5 px-0.5 text-center text-green-400 font-bold">{team.wins || 0}</td>
                            <td className="py-1.5 px-0.5 text-center text-red-400 font-bold">{team.losses || 0}</td>
                            <td className="py-1.5 px-0.5 text-center text-white">{team.draws || 0}</td>
                            <td className="py-1.5 px-0.5 text-center font-mono text-xs">{wr}</td>
                            <td className={`py-1.5 px-0.5 text-center font-bold text-xs ${index === 0 && isLChampionDecided ? 'text-yellow-400' : 'text-white'}`}>{gb}</td>
                            <td className="py-1.5 px-0.5 text-center font-mono text-blue-300 text-xs">{tAvg}</td>
                            <td className="py-1.5 px-0.5 text-center font-mono text-orange-300 text-xs">{tEra}</td>
                            <td className="py-1.5 px-0.5 text-center text-red-400 font-bold text-xs">{mg}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            };

            // プレーオフ成績表示コンポーネント
            const renderPlayoffBracket = () => {
              const playoffGames = (seasonData.schedule || []).filter(g => g.phase === SEASON_PHASES.PLAYOFFS);
              if (playoffGames.length === 0) return null;
              const playoffFormat = seasonData?.settings?.playoffFormat || 'single';

              // シリーズごとの集計
              const getSeriesData = (seriesId) => {
                const games = playoffGames.filter(g => g.seriesId === seriesId && !g.result?.cancelled);
                if (games.length === 0) return null;
                const firstGame = games.find(g => g.seriesGame === 1);
                if (!firstGame || firstGame.home === 'TBD') return null;
                // seriesGame=1のhomeを「上位チーム」とする
                const team1 = firstGame.home;
                const team2 = firstGame.away;
                let team1Wins = 0, team2Wins = 0;
                const gameResults = games.sort((a, b) => a.seriesGame - b.seriesGame).map(g => {
                  if (!g.result) return { game: g.seriesGame, status: 'pending' };
                  const homeWon = g.result.homeScore > g.result.awayScore;
                  const t1Won = (g.home === team1 && homeWon) || (g.away === team1 && !homeWon);
                  if (t1Won) team1Wins++;
                  else team2Wins++;
                  const t1Score = g.home === team1 ? g.result.homeScore : g.result.awayScore;
                  const t2Score = g.home === team2 ? g.result.homeScore : g.result.awayScore;
                  return { game: g.seriesGame, t1Score, t2Score, t1Won, status: 'done' };
                });
                const maxGames = games.length;
                const maxWins = maxGames === 1 ? 1 : Math.ceil(maxGames / 2);
                const isComplete = team1Wins >= maxWins || team2Wins >= maxWins;
                const winner = isComplete ? (team1Wins >= maxWins ? team1 : team2) : null;
                return { team1, team2, team1Wins, team2Wins, gameResults, isComplete, winner };
              };

              // シリーズ表示（5戦3勝 or 1戦）
              const renderSeries = (seriesData, title, isFinal = false) => {
                if (!seriesData) return (
                  <div className={`rounded-xl p-2.5 text-center border border-dashed ${isFinal ? 'bg-gray-800/40 border-yellow-700/30' : 'bg-gray-800/40 border-gray-600/30'}`}>
                    <div className={`text-xs font-bold mb-1 ${isFinal ? 'text-yellow-500' : 'text-gray-500'}`}>{title}</div>
                    <div className="text-gray-600 text-xs">準決勝結果待ち</div>
                  </div>
                );
                const { team1, team2, team1Wins, team2Wins, gameResults, isComplete, winner } = seriesData;
                const t1Abbr = getTeamAbbreviation(team1);
                const t2Abbr = getTeamAbbreviation(team2);
                return (
                  <div className={`rounded-xl overflow-hidden ${
                    isFinal ? 'bg-gradient-to-b from-yellow-900/30 to-gray-800/80 border border-yellow-600/30 shadow-lg shadow-yellow-900/10' :
                    isComplete ? 'bg-gray-800/60 border border-gray-700/30' :
                    'bg-gradient-to-b from-gray-700/50 to-gray-800/60 border border-gray-600/30'
                  }`}>
                    {/* タイトルバー */}
                    <div className={`px-2.5 py-1 ${
                      isFinal ? 'bg-gradient-to-r from-yellow-700/40 via-yellow-600/30 to-yellow-700/40' :
                      'bg-gradient-to-r from-gray-700/40 via-gray-600/30 to-gray-700/40'
                    }`}>
                      <div className={`text-[11px] font-bold text-center tracking-wide ${isFinal ? 'text-yellow-400' : 'text-gray-400'}`}>{title}</div>
                    </div>
                    <div className="p-2.5">
                      {/* チーム名と勝敗 */}
                      <div className="flex items-center justify-between mb-2">
                        <div className={`text-sm font-bold flex-1 text-center ${winner === team1 ? 'text-yellow-300' : winner === team2 ? 'text-gray-600 line-through' : 'text-white'}`}>
                          {winner === team1 && <span className="text-[10px] mr-0.5">👑</span>}{t1Abbr}
                        </div>
                        <div className="px-2.5">
                          <div className="flex items-center gap-1">
                            <span className={`font-black text-xl font-mono ${winner === team1 ? 'text-yellow-300' : 'text-white'}`}>{team1Wins}</span>
                            <span className="text-gray-600 text-sm">-</span>
                            <span className={`font-black text-xl font-mono ${winner === team2 ? 'text-yellow-300' : 'text-white'}`}>{team2Wins}</span>
                          </div>
                        </div>
                        <div className={`text-sm font-bold flex-1 text-center ${winner === team2 ? 'text-yellow-300' : winner === team1 ? 'text-gray-600 line-through' : 'text-white'}`}>
                          {winner === team2 && <span className="text-[10px] mr-0.5">👑</span>}{t2Abbr}
                        </div>
                      </div>
                      {/* 各試合スコア */}
                      {gameResults.length > 0 && (
                        <div className="space-y-0.5 bg-gray-900/40 rounded-lg p-1.5">
                          {gameResults.map(g => (
                            <div key={g.game} className={`flex items-center text-[11px] rounded-md px-1.5 py-0.5 ${g.status === 'done' ? 'bg-gray-800/40' : ''}`}>
                              <span className="w-10 text-gray-500 text-[10px]">第{g.game}戦</span>
                              {g.status === 'done' ? (
                                <>
                                  <span className={`flex-1 text-right font-mono ${g.t1Won ? 'text-green-400 font-bold' : 'text-gray-400'}`}>{g.t1Score}</span>
                                  <span className="mx-1.5 text-gray-700">-</span>
                                  <span className={`flex-1 text-left font-mono ${!g.t1Won ? 'text-green-400 font-bold' : 'text-gray-400'}`}>{g.t2Score}</span>
                                </>
                              ) : (
                                <span className="flex-1 text-center text-gray-700 text-[10px]">--- 未消化 ---</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {isComplete && winner && isFinal && (
                        <div className="mt-2 text-center py-1.5 bg-yellow-600/20 rounded-lg border border-yellow-600/20">
                          <div className="text-xs font-bold text-yellow-400">🏆 {winner} 優勝!</div>
                        </div>
                      )}
                      {isComplete && winner && !isFinal && (
                        <div className="mt-1.5 text-center text-[11px] font-bold text-gray-400">
                          {winner} → 決勝進出
                        </div>
                      )}
                    </div>
                  </div>
                );
              };

              const renderBracketContainer = (title, content) => (
                <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-gray-700/30 mt-3">
                  <h2 className="text-base font-bold mb-3 text-white flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-yellow-600/30 flex items-center justify-center">
                      <span className="text-yellow-400 text-sm">🏆</span>
                    </div>
                    <span>{title}</span>
                  </h2>
                  {content}
                </div>
              );

              if (playoffFormat === 'tournament') {
                const semi1 = getSeriesData('semi1');
                const semi2 = getSeriesData('semi2');
                const final_ = getSeriesData('final');
                return renderBracketContainer('プレーオフ トーナメント', (
                  <div className="flex items-stretch gap-2">
                    <div className="flex-1 space-y-2">
                      {renderSeries(semi1, '準決勝①')}
                      {renderSeries(semi2, '準決勝②')}
                    </div>
                    <div className="flex items-center">
                      <svg width="24" height="100" className="text-gray-600">
                        <line x1="0" y1="25" x2="12" y2="25" stroke="currentColor" strokeWidth="1.5"/>
                        <line x1="12" y1="25" x2="12" y2="75" stroke="currentColor" strokeWidth="1.5"/>
                        <line x1="0" y1="75" x2="12" y2="75" stroke="currentColor" strokeWidth="1.5"/>
                        <line x1="12" y1="50" x2="24" y2="50" stroke="currentColor" strokeWidth="1.5"/>
                      </svg>
                    </div>
                    <div className="flex-1 flex items-center">
                      {renderSeries(final_, '決勝', true)}
                    </div>
                  </div>
                ));
              } else if (playoffFormat === 'double') {
                const semi1 = getSeriesData('semi1');
                const semi2 = getSeriesData('semi2');
                const final_ = getSeriesData('final');
                return renderBracketContainer('プレーオフ', (
                  <div className="flex items-stretch gap-2">
                    <div className="flex-1 space-y-2">
                      {renderSeries(semi1, '準決勝① (5戦3勝)')}
                      {renderSeries(semi2, '準決勝② (5戦3勝)')}
                    </div>
                    <div className="flex items-center">
                      <svg width="24" height="100" className="text-gray-600">
                        <line x1="0" y1="25" x2="12" y2="25" stroke="currentColor" strokeWidth="1.5"/>
                        <line x1="12" y1="25" x2="12" y2="75" stroke="currentColor" strokeWidth="1.5"/>
                        <line x1="0" y1="75" x2="12" y2="75" stroke="currentColor" strokeWidth="1.5"/>
                        <line x1="12" y1="50" x2="24" y2="50" stroke="currentColor" strokeWidth="1.5"/>
                      </svg>
                    </div>
                    <div className="flex-1 flex items-center">
                      {renderSeries(final_, '決勝 (5戦3勝)', true)}
                    </div>
                  </div>
                ));
              } else if (playoffFormat === 'split') {
                const final_ = getSeriesData('final');
                if (!final_) return null;
                return renderBracketContainer('前後期優勝対決 (3戦2勝制)', (
                  <div>
                    {seasonData.playoffNote && (
                      <div className="text-center mb-2 px-2 py-1 bg-orange-900/30 rounded-lg border border-orange-600/20">
                        <span className="text-[11px] text-orange-300">{seasonData.playoffNote}</span>
                      </div>
                    )}
                    {renderSeries(final_, '決勝', true)}
                  </div>
                ));
              } else {
                const final_ = getSeriesData('final');
                if (!final_) return null;
                return renderBracketContainer('プレーオフ (5戦3勝制)',
                  renderSeries(final_, '決勝', true)
                );
              }
            };

            if (isTwoLeague) {
              const l1 = standings.filter(s => league1Teams.includes(s.team)).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
              const l2 = standings.filter(s => league2Teams.includes(s.team)).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
              return (
                <div className="space-y-3">
                  {renderStandingsTable(l1, `${leagueNamesList[0]} 順位表`, 'text-blue-400')}
                  {renderStandingsTable(l2, `${leagueNamesList[1]} 順位表`, 'text-orange-400')}
                  {renderPlayoffBracket()}
                </div>
              );
            }
            // 前後期制の前期優勝チーム表示
            const renderFirstHalfWinner = () => {
              if (seasonData?.settings?.playoffFormat !== 'split') return null;
              const firstHalf = seasonData.firstHalfStandings;
              if (!firstHalf || firstHalf.length === 0) return null;
              const sorted = [...firstHalf].sort((a, b) => b.winRate - a.winRate);
              const winner = sorted[0];
              return (
                <div className="bg-gradient-to-r from-orange-900/30 to-gray-800/80 rounded-xl p-2.5 mt-2 border border-orange-600/20">
                  <div className="flex items-center gap-2">
                    <span className="text-orange-400 text-xs font-bold">前期優勝</span>
                    <span className="text-white text-sm font-bold">{winner.team}</span>
                    <span className="text-gray-400 text-xs ml-auto">{winner.wins}勝{winner.losses}敗{winner.draws > 0 ? `${winner.draws}分` : ''} ({winner.winRate.toFixed(3)})</span>
                  </div>
                </div>
              );
            };

            return (
              <div className="space-y-0">
                {renderStandingsTable(standings, '順位表', 'text-white')}
                {renderFirstHalfWinner()}
                {renderPlayoffBracket()}
              </div>
            );
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
