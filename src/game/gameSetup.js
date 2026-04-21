// ========================================================================
// gameSetup.js - setupManagedGame, handleManagedGameEnd
// Extracted from App.jsx GAME_SETUP section
// ========================================================================

import { TEAMS_DATA } from '../teams-data.js';
import { autoSimulateGame, generateAILineup } from './autoSimulation.js';
import { progressDate, handlePhaseTransition, recordGameResult, updatePlayoffProgress } from '../season/dateProgression.js';

/**
 * setupManagedGame - 采配モードの試合セットアップ
 *
 * ctx に必要なプロパティ:
 *   setCount, setBases, setOuts, setInning, setScore, setGameOver,
 *   setGameStarted, setRemainingPitches, setSimMode, outOccurredRef,
 *   setInningScores, setExtraInningScores, setCurrentInningScore,
 *   setTeamHits, setTeamErrors, setTeamRBIs, setIsTopInning,
 *   setGameLog, setLastResult, setStatistics, setRecentVelocities,
 *   setHomeTeam, setAwayTeam, setCurrentStamina,
 *   setManagedGameInfo, managedGameInfoRef, setScreenMode
 */
export function executeSetupManagedGame(ctx, gameInfo) {
  const {
    setCount, setBases, setOuts, setInning, setScore, setGameOver,
    setGameStarted, setRemainingPitches, setSimMode, outOccurredRef,
    setInningScores, setExtraInningScores, setCurrentInningScore,
    setTeamHits, setTeamErrors, setTeamRBIs, setIsTopInning,
    setGameLog, setLastResult, setStatistics, setRecentVelocities,
    setHomeTeam, setAwayTeam, setCurrentStamina,
    setManagedGameInfo, managedGameInfoRef, setScreenMode
  } = ctx;

  // gameInfo: { gameId, home, away, otherGames: [{gameId, home, away}, ...] }
  const htn = gameInfo.home;
  const atn = gameInfo.away;
  const htd = TEAMS_DATA[htn];
  const atd = TEAMS_DATA[atn];

  if (!htd || !atd) return;

  // ユーザーチームがどちら側かに応じてスタメンを適用
  const applyLineup = (teamData, teamName) => {
    const players = JSON.parse(JSON.stringify(teamData.players));
    const settings = teamData.lineupSettings;
    const isUserTeam = settings?.battingOrder?.length > 0;

    if (isUserTeam) {
      players.forEach(p => { p.battingOrder = 0; });
      settings.battingOrder.forEach(entry => {
        const player = players.find(p => p.id === entry.playerId);
        if (player) {
          player.battingOrder = entry.battingOrder;
          player.position = entry.position;
        }
      });
    } else {
      const tempTeamData = { ...teamData, players };
      generateAILineup(tempTeamData, teamName);
    }

    // ユーザーチームのみローテーションから先発を設定
    // （AIチームはgenerateAILineup内で先発選択＆index更新済み）
    if (isUserTeam) {
      const rotation = teamData.pitchingRotation;
      if (rotation?.starters?.length > 0) {
        const index = rotation.currentStarterIndex || 0;
        const starterId = rotation.starters[index];

        const starterPlayer = players.find(p => p.id === starterId);
        const starterOldOrder = starterPlayer?.battingOrder || 0;
        const starterOldPos = starterPlayer?.position;
        const hadNonPitcherSlot = starterOldOrder > 0 && starterOldOrder !== 9;

        const oldNinthPlayer = players.find(p => p.battingOrder === 9 && p.id !== starterId);

        players.forEach(p => {
          if (p.id === starterId) {
            p.battingOrder = 9;
            p.position = 'pitcher';
          }
        });

        if (oldNinthPlayer) {
          oldNinthPlayer.battingOrder = 0;
        }

        // 二刀流：野手スロットに空きが出た場合、ベンチから最適な野手を補充
        if (hadNonPitcherSlot && starterOldPos) {
          const startersInLineup = new Set(players.filter(p => p.battingOrder > 0).map(p => p.id));
          const benchFielders = players.filter(p =>
            p.battingOrder === 0 && !startersInLineup.has(p.id) && p.position !== 'pitcher'
          );
          if (benchFielders.length > 0) {
            benchFielders.sort((a, b) =>
              (b.positionFitness?.[starterOldPos] || 0) - (a.positionFitness?.[starterOldPos] || 0)
            );
            benchFielders[0].battingOrder = starterOldOrder;
            benchFielders[0].position = starterOldPos;
          } else if (oldNinthPlayer) {
            // ベンチ野手がいない場合は元9番を入れる（フォールバック）
            oldNinthPlayer.battingOrder = starterOldOrder;
            oldNinthPlayer.position = starterOldPos;
          }
        }
      }

      // 同一IDの重複を除去（先頭を残す）
      const seenIds = new Set();
      players.forEach(p => {
        if (seenIds.has(p.id)) {
          p.battingOrder = 0;
          p.isStarter = false;
        }
        seenIds.add(p.id);
      });
    }

    return players;
  };

  const homePlayers = applyLineup(htd, htn);
  const awayPlayers = applyLineup(atd, atn);

  // ゲーム状態をリセット
  setCount({ balls: 0, strikes: 0 });
  setBases([false, false, false]);
  setOuts(0);
  setInning(1);
  setScore({ home: 0, away: 0 });
  setGameOver(false);
  setGameStarted(false);
  setRemainingPitches(0);
  setSimMode(null);
  outOccurredRef.current = false;
  setInningScores({
    away: [null, null, null, null, null, null, null, null, null],
    home: [null, null, null, null, null, null, null, null, null]
  });
  setExtraInningScores({ away: [], home: [] });
  setCurrentInningScore({ away: 0, home: 0 });
  setTeamHits({ home: 0, away: 0 });
  setTeamErrors({ home: 0, away: 0 });
  setTeamRBIs({ home: 0, away: 0 });
  setIsTopInning(true);
  setGameLog([]);
  setLastResult(null);
  setStatistics(null);
  setRecentVelocities([]);

  setHomeTeam({
    name: htn,
    players: homePlayers.map(p => ({
      ...p,
      isStarter: p.battingOrder > 0 && p.battingOrder <= 9,
      hasSubbedOut: false,
      originalPosition: p.position,
      gameStats: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, strikeouts: 0, atBatResults: [] }
    })),
    currentBatterOrder: 1
  });

  setAwayTeam({
    name: atn,
    players: awayPlayers.map(p => ({
      ...p,
      isStarter: p.battingOrder > 0 && p.battingOrder <= 9,
      hasSubbedOut: false,
      originalPosition: p.position,
      gameStats: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, strikeouts: 0, atBatResults: [] }
    })),
    currentBatterOrder: 1
  });

  const startingPitcher = homePlayers.find(p => p.battingOrder === 9);
  if (startingPitcher) {
    const maxStamina = startingPitcher.pitching?.stamina || 100;
    const fatigue = startingPitcher.fatigue || 0;
    // 疲労によりスタミナ上限が低下（最低50%まで）
    const startStamina = Math.max(Math.floor(maxStamina * 0.5), maxStamina - fatigue);
    setCurrentStamina(startStamina);
  }

  setManagedGameInfo(gameInfo);
  managedGameInfoRef.current = gameInfo;
  setScreenMode('game');
}

/**
 * handleManagedGameEnd - 采配モード試合終了後の成績反映処理
 *
 * ctx に必要なプロパティ:
 *   managedGameInfoRef, score, homeTeam, awayTeam,
 *   seasonData, setSeasonData, selectedMonth, setSelectedMonth,
 *   setManagedGameInfo, setScreenMode, setManagementView
 */
export function executeHandleManagedGameEnd(ctx) {
  const {
    managedGameInfoRef, score, homeTeam, awayTeam,
    seasonData, setSeasonData, selectedMonth, setSelectedMonth,
    setManagedGameInfo, setScreenMode, setManagementView
  } = ctx;

  const info = managedGameInfoRef.current;
  if (!info) return;

  const finalScore = { ...score };
  const htn = homeTeam.name;
  const atn = awayTeam.name;

  const gameResult = {
    date: seasonData.currentDate,
    home: htn,
    away: atn,
    homeScore: finalScore.home,
    awayScore: finalScore.away
  };

  let updatedSeasonData = recordGameResult(seasonData, gameResult);

  // ユーザーチームのみローテインデックスを進める
  // （AIチームはgenerateAILineup内で既にインデックス更新済み）
  [htn, atn].forEach(teamName => {
    const teamData = TEAMS_DATA[teamName];
    const isUserTeam = teamData?.lineupSettings?.battingOrder?.length > 0;
    if (isUserTeam) {
      const rotation = teamData?.pitchingRotation;
      if (rotation?.starters?.length > 0) {
        rotation.currentStarterIndex =
          ((rotation.currentStarterIndex || 0) + 1) % rotation.starters.length;
      }
    }
  });

  const updateManagedGameStats = (teamState, teamName) => {
    const teamData = TEAMS_DATA[teamName];
    if (!teamData) return;

    teamState.players.forEach(p => {
      const playerData = teamData.players.find(pl => pl.id === p.id);
      if (!playerData) return;

      const gs = p.gameStats || {};
      if (gs.atBats > 0 || gs.walks > 0) {
        if (!playerData.seasonStats) playerData.seasonStats = { batting: {}, pitching: {} };
        if (!playerData.seasonStats.batting) playerData.seasonStats.batting = {};
        const season = playerData.seasonStats.batting;
        season.games = (season.games || 0) + 1;
        season.atBats = (season.atBats || 0) + (gs.atBats || 0);
        season.hits = (season.hits || 0) + (gs.hits || 0);
        season.homeruns = (season.homeruns || 0) + (gs.homeruns || 0);
        season.rbis = (season.rbis || 0) + (gs.rbis || 0);
        season.strikeouts = (season.strikeouts || 0) + (gs.strikeouts || 0);
        season.walks = (season.walks || 0) + (gs.walks || 0);

        if (!playerData.careerStats) playerData.careerStats = { batting: {}, pitching: {} };
        if (!playerData.careerStats.batting) playerData.careerStats.batting = {};
        const career = playerData.careerStats.batting;
        career.games = (career.games || 0) + 1;
        career.atBats = (career.atBats || 0) + (gs.atBats || 0);
        career.hits = (career.hits || 0) + (gs.hits || 0);
        career.homeruns = (career.homeruns || 0) + (gs.homeruns || 0);
        career.rbis = (career.rbis || 0) + (gs.rbis || 0);
        career.strikeouts = (career.strikeouts || 0) + (gs.strikeouts || 0);
        career.walks = (career.walks || 0) + (gs.walks || 0);
      }

      const ps = p.stats?.pitching || {};
      if (ps.outs > 0 || ps.pitches > 0) {
        if (!playerData.seasonStats.pitching) playerData.seasonStats.pitching = {};
        const sp = playerData.seasonStats.pitching;
        sp.games = (sp.games || 0) + 1;
        sp.inningsPitched = (sp.inningsPitched || 0) + (ps.outs || 0);
        sp.strikeouts = (sp.strikeouts || 0) + (ps.strikeouts || 0);
        sp.walks = (sp.walks || 0) + (ps.walks || 0);
        sp.runsAllowed = (sp.runsAllowed || 0) + (ps.runsAllowed || 0);
        sp.earnedRuns = (sp.earnedRuns || 0) + (ps.earnedRuns || ps.runsAllowed || 0);
        sp.hits = (sp.hits || 0) + (ps.hits || 0);
        sp.homeruns = (sp.homeruns || 0) + (ps.homeruns || 0);
        sp.pitches = (sp.pitches || 0) + (ps.pitches || 0);

        if (!playerData.careerStats.pitching) playerData.careerStats.pitching = {};
        const cp = playerData.careerStats.pitching;
        cp.games = (cp.games || 0) + 1;
        cp.inningsPitched = (cp.inningsPitched || 0) + (ps.outs || 0);
        cp.strikeouts = (cp.strikeouts || 0) + (ps.strikeouts || 0);
        cp.walks = (cp.walks || 0) + (ps.walks || 0);
        cp.runsAllowed = (cp.runsAllowed || 0) + (ps.runsAllowed || 0);
        cp.earnedRuns = (cp.earnedRuns || 0) + (ps.earnedRuns || ps.runsAllowed || 0);
        cp.hits = (cp.hits || 0) + (ps.hits || 0);
        cp.homeruns = (cp.homeruns || 0) + (ps.homeruns || 0);
        cp.pitches = (cp.pitches || 0) + (ps.pitches || 0);

        const fatigue = Math.floor((ps.pitches || 0) / (p.battingOrder === 9 ? 2 : 3));
        playerData.fatigue = (playerData.fatigue || 0) + fatigue;
      }
    });
  };

  updateManagedGameStats(homeTeam, htn);
  updateManagedGameStats(awayTeam, atn);

  // 勝敗セーブの記録
  if (finalScore.home !== finalScore.away) {
    const isHomeWin = finalScore.home > finalScore.away;
    const winTeamState = isHomeWin ? homeTeam : awayTeam;
    const loseTeamState = isHomeWin ? awayTeam : homeTeam;
    const winTeamName = isHomeWin ? htn : atn;
    const loseTeamName = isHomeWin ? atn : htn;

    // 勝利投手判定: 先発が5回以上→先発、それ以外→最多投球回リリーフ
    const winPitchers = winTeamState.players.filter(p => (p.stats?.pitching?.outs || 0) > 0)
      .sort((a, b) => (b.stats?.pitching?.outs || 0) - (a.stats?.pitching?.outs || 0));
    const winStarter = winPitchers.find(p => p.originalPosition === 'pitcher' || p.battingOrder === 9);
    const winPitcher = winStarter && (winStarter.stats?.pitching?.outs || 0) >= 15
      ? winStarter
      : (winPitchers.filter(p => p !== winStarter)[0] || winPitchers[0]);

    // 敗戦投手判定: 最も多く失点した投手
    const losePitchers = loseTeamState.players.filter(p => (p.stats?.pitching?.outs || 0) > 0)
      .sort((a, b) => (b.stats?.pitching?.runsAllowed || 0) - (a.stats?.pitching?.runsAllowed || 0));
    const losePitcher = losePitchers[0];

    // セーブ投手判定: 最後に投げた投手で、3点差以内1イニング以上 or 3イニング以上
    const scoreDiff = Math.abs(finalScore.home - finalScore.away);
    const lastPitcher = winPitchers.length > 1
      ? winPitchers.find(p => p !== winPitcher && p.position === 'pitcher') || winPitchers.find(p => p !== winPitcher)
      : null;
    const savePitcher = lastPitcher && lastPitcher !== winPitcher &&
      ((scoreDiff <= 3 && (lastPitcher.stats?.pitching?.outs || 0) >= 3) || (lastPitcher.stats?.pitching?.outs || 0) >= 9)
      ? lastPitcher : null;

    // ホールド: 勝ちチームのリリーフで、勝ち投手でもセーブでもなく、1アウト以上
    const holdPitchers = winPitchers.filter(p =>
      p !== winPitcher && p !== savePitcher && p !== winStarter &&
      (p.stats?.pitching?.outs || 0) >= 1
    );

    // TEAMS_DATAに反映
    const updatePitcherDecision = (playerState, teamName, stat) => {
      const teamData = TEAMS_DATA[teamName];
      if (!teamData) return;
      const playerData = teamData.players.find(pl => pl.id === playerState.id);
      if (!playerData) return;
      if (!playerData.seasonStats) playerData.seasonStats = { batting: {}, pitching: {} };
      if (!playerData.seasonStats.pitching) playerData.seasonStats.pitching = {};
      if (!playerData.careerStats) playerData.careerStats = { batting: {}, pitching: {} };
      if (!playerData.careerStats.pitching) playerData.careerStats.pitching = {};
      playerData.seasonStats.pitching[stat] = (playerData.seasonStats.pitching[stat] || 0) + 1;
      playerData.careerStats.pitching[stat] = (playerData.careerStats.pitching[stat] || 0) + 1;
    };

    if (winPitcher) updatePitcherDecision(winPitcher, winTeamName, 'wins');
    if (losePitcher) updatePitcherDecision(losePitcher, loseTeamName, 'losses');
    if (savePitcher) updatePitcherDecision(savePitcher, winTeamName, 'saves');
    holdPitchers.forEach(hp => updatePitcherDecision(hp, winTeamName, 'holds'));
  }

  if (info.otherGames && info.otherGames.length > 0) {
    info.otherGames.forEach(otherGame => {
      const oh = TEAMS_DATA[otherGame.home];
      const oa = TEAMS_DATA[otherGame.away];
      if (!oh || !oa) return;

      const otherResult = autoSimulateGame(otherGame.home, otherGame.away);
      if (otherResult) {
        // 投手勝敗・セーブ・ホールドの記録
        if (otherResult.homeScore !== otherResult.awayScore) {
          const oIsHomeWin = otherResult.homeScore > otherResult.awayScore;
          const oWinTeam = oIsHomeWin ? otherResult.homeTeam : otherResult.awayTeam;
          const oLoseTeam = oIsHomeWin ? otherResult.awayTeam : otherResult.homeTeam;
          const oWinName = oIsHomeWin ? otherGame.home : otherGame.away;
          const oLoseName = oIsHomeWin ? otherGame.away : otherGame.home;
          if (oWinTeam && oLoseTeam) {
            const oWinPs = oWinTeam.players.filter(p => p.gameStats?.pitching?.outs > 0);
            const oLosePs = oLoseTeam.players.filter(p => p.gameStats?.pitching?.outs > 0);
            // 勝ち投手
            const oStarter = oWinPs.find(p => p.battingOrder === 9);
            const oWinP = oStarter && oStarter.gameStats.pitching.outs >= 15
              ? oStarter : (oWinPs.filter(p => p !== oStarter).sort((a, b) => b.gameStats.pitching.outs - a.gameStats.pitching.outs)[0] || oWinPs[0]);
            // 負け投手
            const oLoseP = [...oLosePs].sort((a, b) => b.gameStats.pitching.runsAllowed - a.gameStats.pitching.runsAllowed)[0];
            // セーブ
            const oScoreDiff = Math.abs(otherResult.homeScore - otherResult.awayScore);
            const oLastP = oWinPs.length > 1 ? oWinPs[oWinPs.length - 1] : null;
            const oSaveP = oLastP && oLastP !== oWinP &&
              ((oScoreDiff <= 3 && oLastP.gameStats.pitching.outs >= 3) || oLastP.gameStats.pitching.outs >= 9)
              ? oLastP : null;
            const recordOther = (playerState, teamName, stat) => {
              const td = TEAMS_DATA[teamName];
              if (!td) return;
              const pd = td.players.find(pl => pl.id === playerState.id);
              if (!pd) return;
              if (!pd.seasonStats?.pitching) { if (!pd.seasonStats) pd.seasonStats = { batting: {}, pitching: {} }; if (!pd.seasonStats.pitching) pd.seasonStats.pitching = {}; }
              if (!pd.careerStats?.pitching) { if (!pd.careerStats) pd.careerStats = { batting: {}, pitching: {} }; if (!pd.careerStats.pitching) pd.careerStats.pitching = {}; }
              pd.seasonStats.pitching[stat] = (pd.seasonStats.pitching[stat] || 0) + 1;
              pd.careerStats.pitching[stat] = (pd.careerStats.pitching[stat] || 0) + 1;
            };
            if (oWinP) recordOther(oWinP, oWinName, 'wins');
            if (oLoseP) recordOther(oLoseP, oLoseName, 'losses');
            if (oSaveP) recordOther(oSaveP, oWinName, 'saves');
            // ホールド
            oWinPs.forEach(p => {
              if (p !== oWinP && p !== oSaveP && p !== oStarter && p.gameStats.pitching.outs >= 1) {
                recordOther(p, oWinName, 'holds');
              }
            });
          }
        }
        updatedSeasonData = recordGameResult(updatedSeasonData, {
          date: seasonData.currentDate,
          home: otherGame.home,
          away: otherGame.away,
          homeScore: otherResult.homeScore,
          awayScore: otherResult.awayScore
        });
      }
    });
  }

  updatedSeasonData = updatePlayoffProgress(updatedSeasonData);
  updatedSeasonData = progressDate(updatedSeasonData, 1);

  const oldPhase = seasonData.phase;
  const newPhase = updatedSeasonData.phase;
  if (oldPhase !== newPhase) {
    updatedSeasonData = handlePhaseTransition(updatedSeasonData, newPhase);
  }

  // カレンダー月を追従
  if (updatedSeasonData?.currentDate?.month && updatedSeasonData.currentDate.month !== selectedMonth) {
    setSelectedMonth(updatedSeasonData.currentDate.month);
  }

  setSeasonData(updatedSeasonData);

  setManagedGameInfo(null);
  managedGameInfoRef.current = null;
  setScreenMode('management');
  setManagementView('dateprogress');
}
