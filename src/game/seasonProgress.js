import { TEAMS_DATA } from '../teams-data.js';
import { SEASON_PHASES, getCurrentPhase } from '../season/seasonManager.js';
import { getScheduleByDate } from '../season/scheduleGenerator.js';
import { progressDate, progressToNextGame, progressToNextPhase, handlePhaseTransition, recordGameResult, updatePlayoffProgress } from '../season/dateProgression.js';
import { autoSimulateGame } from './autoSimulation.js';
import { generateToshitaikou, createMainTournament, autoPlayMainTournament } from '../corporate/toshitaikou.js';

// フェーズ遷移検出＆自動画面遷移
export const checkPhaseTransitionAndNavigate = (oldSeasonData, newSeasonData, { setSeasonData, setScreenMode, setManagementView }) => {
  const oldPhase = oldSeasonData.phase;
  const newPhase = newSeasonData.phase;

  if (oldPhase !== newPhase) {
    newSeasonData = handlePhaseTransition(newSeasonData, newPhase);
  }

  const { month, day } = newSeasonData.currentDate;
  const isCorporate = newSeasonData.settings?.corporateMode;

  // 社会人モード: 都市対抗予選（6月）
  if (isCorporate && month >= 6 && !newSeasonData.toshitaikou?.qualifiersDone) {
    const tournament = generateToshitaikou({ autoSimulate: true });
    newSeasonData = {
      ...newSeasonData,
      toshitaikou: {
        ...tournament,
        qualifiersDone: true,
        mainDone: false,
      },
    };
    setSeasonData(newSeasonData);
    setScreenMode('management');
    setManagementView('toshitaikou_qualifier');
    return null;
  }

  // 社会人モード: 都市対抗本戦（8月）
  if (isCorporate && month >= 8 && newSeasonData.toshitaikou?.qualifiersDone && !newSeasonData.toshitaikou?.mainDone) {
    const td = newSeasonData.toshitaikou;
    const prevChamp = newSeasonData.toshitaikou?.prevChampion || null;
    const mainTournament = createMainTournament(td.qualifiers, prevChamp);
    autoPlayMainTournament(mainTournament);
    newSeasonData = {
      ...newSeasonData,
      toshitaikou: {
        ...td,
        mainTournament,
        champion: mainTournament.champion,
        runnerUp: mainTournament.runnerUp,
        mainDone: true,
      },
    };
    setSeasonData(newSeasonData);
    setScreenMode('management');
    setManagementView('toshitaikou_main');
    return null;
  }

  // 11月9日: 契約更改強制
  if (month === 11 && day === 9 && newPhase === SEASON_PHASES.CONTRACT) {
    setSeasonData(newSeasonData);
    setScreenMode('management');
    setManagementView('contract');
    return null;
  }

  // 11月10日〜29日: トライアウト強制
  if (month === 11 && day >= 10 && day < 30 && (newPhase === SEASON_PHASES.TRYOUT || newPhase === SEASON_PHASES.CONTRACT)) {
    newSeasonData = { ...newSeasonData, phase: SEASON_PHASES.TRYOUT };
    setSeasonData(newSeasonData);
    setScreenMode('management');
    setManagementView('tryout');
    return null;
  }

  // 11月30日〜: オフシーズン強制
  if (month >= 12 || (month === 11 && day >= 30)) {
    newSeasonData = { ...newSeasonData, phase: SEASON_PHASES.OFF_SEASON };
    setSeasonData(newSeasonData);
    setScreenMode('management');
    setManagementView('offseason');
    return null;
  }

  return newSeasonData;
};

// ユーザーチームのスタメンが完成しているか確認
export const checkUserLineupComplete = (userTeamName) => {
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

// 指定日の試合を自動シミュレーション
export const simulateGamesOnDate = (seasonData) => {
  const currentDate = seasonData.currentDate;
  const todayGames = getScheduleByDate(seasonData.schedule, currentDate);

  if (todayGames.length === 0) return seasonData;

  let updatedSeasonData = { ...seasonData };

  todayGames.forEach(game => {
    if (game.result) return;
    if (game.home === 'TBD' || game.away === 'TBD') return;

    const homeTeam = TEAMS_DATA?.[game.home];
    const awayTeam = TEAMS_DATA?.[game.away];
    if (!homeTeam || !awayTeam) return;

    const gameResult = autoSimulateGame?.(game.home, game.away);
    if (gameResult) {
      updatedSeasonData = recordGameResult(updatedSeasonData, {
        date: currentDate,
        home: game.home,
        away: game.away,
        homeScore: gameResult.homeScore,
        awayScore: gameResult.awayScore
      });
    }
  });

  updatedSeasonData = updatePlayoffProgress(updatedSeasonData);
  return updatedSeasonData;
};

// フェーズ内の全未消化試合を自動シミュレーション
export const simulateAllRemainingGames = (seasonData) => {
  let updatedSeasonData = { ...seasonData };
  const currentPhase = seasonData.phase;

  const isPlayoff = currentPhase === SEASON_PHASES.PLAYOFFS;
  if (isPlayoff) {
    let maxIterations = 50;
    while (maxIterations-- > 0) {
      const remainingGames = updatedSeasonData.schedule.filter(game => {
        if (game.phase !== SEASON_PHASES.PLAYOFFS) return false;
        if (game.result) return false;
        if (game.home === 'TBD' || game.away === 'TBD') return false;
        return true;
      }).sort((a, b) => {
        if (a.date.month !== b.date.month) return a.date.month - b.date.month;
        return a.date.day - b.date.day;
      });

      if (remainingGames.length === 0) break;

      const game = remainingGames[0];
      const homeTeam = TEAMS_DATA?.[game.home];
      const awayTeam = TEAMS_DATA?.[game.away];
      if (!homeTeam || !awayTeam) break;

      const gameResult = autoSimulateGame?.(game.home, game.away);
      if (gameResult) {
        updatedSeasonData = recordGameResult(updatedSeasonData, {
          date: game.date, home: game.home, away: game.away,
          homeScore: gameResult.homeScore, awayScore: gameResult.awayScore
        });
        updatedSeasonData = updatePlayoffProgress(updatedSeasonData);
      } else {
        break;
      }
    }
  } else {
    const phaseGames = seasonData.schedule.filter(game => {
      const gamePhase = getCurrentPhase(game.date.month, game.date.day);
      return gamePhase === currentPhase && !game.result;
    });
    phaseGames.forEach(game => {
      if (game.result) return;
      const homeTeam = TEAMS_DATA?.[game.home];
      const awayTeam = TEAMS_DATA?.[game.away];
      if (!homeTeam || !awayTeam) return;
      const gameResult = autoSimulateGame?.(game.home, game.away);
      if (gameResult) {
        updatedSeasonData = recordGameResult(updatedSeasonData, {
          date: game.date, home: game.home, away: game.away,
          homeScore: gameResult.homeScore, awayScore: gameResult.awayScore
        });
      }
    });
  }

  return updatedSeasonData;
};

// 日付進行ハンドラー
export const handleProgressDate = (days, { seasonData, setSeasonData, setSelectedMonth, selectedMonth, userTeamName, setScreenMode, setManagementView }) => {
  if (!seasonData) return;

  if ((seasonData.phase === SEASON_PHASES.REGULAR_SEASON || seasonData.phase === SEASON_PHASES.PLAYOFFS) && !checkUserLineupComplete(userTeamName)) {
    alert('スタメンが9人揃っていません。スタメン設定画面で打順を設定してください。');
    return;
  }

  let newSeasonData = progressDate(seasonData, days);

  const oldPhase = seasonData.phase;
  const newPhase = newSeasonData.phase;
  if (oldPhase !== newPhase) {
    newSeasonData = handlePhaseTransition(newSeasonData, newPhase);
  }

  newSeasonData = simulateGamesOnDate(newSeasonData);

  // カレンダー月を現在日付に自動追従
  if (newSeasonData?.currentDate?.month && newSeasonData.currentDate.month !== selectedMonth) {
    setSelectedMonth(newSeasonData.currentDate.month);
  }

  const result = checkPhaseTransitionAndNavigate(seasonData, newSeasonData, { setSeasonData, setScreenMode, setManagementView });
  if (result !== null) setSeasonData(result);
};

// 次の試合まで進行
export const handleProgressToNextGame = ({ seasonData, setSeasonData, setSelectedMonth, selectedMonth, userTeamName, setScreenMode, setManagementView }) => {
  if (!seasonData) return;

  if ((seasonData.phase === SEASON_PHASES.REGULAR_SEASON || seasonData.phase === SEASON_PHASES.PLAYOFFS) && !checkUserLineupComplete(userTeamName)) {
    alert('スタメンが9人揃っていません。スタメン設定画面で打順を設定してください。');
    return;
  }

  let newSeasonData = progressToNextGame(seasonData, userTeamName);

  const oldPhase = seasonData.phase;
  const newPhase = newSeasonData.phase;
  if (oldPhase !== newPhase) {
    newSeasonData = handlePhaseTransition(newSeasonData, newPhase);
  }

  newSeasonData = simulateGamesOnDate(newSeasonData);

  if (newSeasonData?.currentDate?.month && newSeasonData.currentDate.month !== selectedMonth) {
    setSelectedMonth(newSeasonData.currentDate.month);
  }

  const result = checkPhaseTransitionAndNavigate(seasonData, newSeasonData, { setSeasonData, setScreenMode, setManagementView });
  if (result !== null) setSeasonData(result);
};

// 次のフェーズまで進行
export const handleProgressToNextPhase = ({ seasonData, setSeasonData, setSelectedMonth, selectedMonth, userTeamName, setScreenMode, setManagementView }) => {
  if (!seasonData) return;

  if ((seasonData.phase === SEASON_PHASES.REGULAR_SEASON || seasonData.phase === SEASON_PHASES.PLAYOFFS) && !checkUserLineupComplete(userTeamName)) {
    alert('スタメンが9人揃っていません。スタメン設定画面で打順を設定してください。');
    return;
  }

  let newSeasonData = simulateAllRemainingGames(seasonData);
  newSeasonData = progressToNextPhase(newSeasonData);

  const oldPhase = seasonData.phase;
  const newPhase = newSeasonData.phase;
  if (oldPhase !== newPhase) {
    newSeasonData = handlePhaseTransition(newSeasonData, newPhase);
  }

  if (newSeasonData?.currentDate?.month && newSeasonData.currentDate.month !== selectedMonth) {
    setSelectedMonth(newSeasonData.currentDate.month);
  }

  const result = checkPhaseTransitionAndNavigate(seasonData, newSeasonData, { setSeasonData, setScreenMode, setManagementView });
  if (result !== null) setSeasonData(result);
};
