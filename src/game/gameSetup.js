// ========================================================================
// gameSetup.js - setupManagedGame, handleManagedGameEnd
// Extracted from App.jsx GAME_SETUP section
// ========================================================================

import { TEAMS_DATA, LEAGUE_SETTINGS } from '../teams-data.js';
import { autoSimulateGame, generateAILineup, POSITION_PLAYER_RECOVERY_BASE } from './autoSimulation.js';
import { progressDate, handlePhaseTransition, recordGameResult, updatePlayoffProgress } from '../season/dateProgression.js';
import { adjustGrowthModifier } from '../utils/constants.js';
import { advanceQualifierWithResult, autoPlayBracket, isBracketComplete, getBracketRankings, buildLosersBracket, recordResult } from '../corporate/toshitaikou.js';

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

  const useDH = LEAGUE_SETTINGS.useDH;

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
          if (entry.position === 'dh') {
            player._isDH = true;
          } else {
            player.position = entry.position;
            delete player._isDH;
          }
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
        const hadNonPitcherSlot = starterOldOrder > 0 && (!useDH ? starterOldOrder !== 9 : true);

        if (!useDH) {
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
              oldNinthPlayer.battingOrder = starterOldOrder;
              oldNinthPlayer.position = starterOldPos;
            }
          }
        } else {
          // DH制: 投手はbattingOrder=0で守備のみ参加
          players.forEach(p => {
            if (p.id === starterId) {
              p.battingOrder = 0;
              p.position = 'pitcher';
            }
          });

          // 二刀流：空いた野手スロットをベンチから補充
          if (hadNonPitcherSlot && starterOldPos && !starterPlayer?._isDH) {
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
            }
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

    // DH制: 先発投手を特定（isStartingPitcherフラグ）
    if (useDH) {
      const rotation = teamData.pitchingRotation;
      let starterPitcherId = null;
      if (isUserTeam && rotation?.starters?.length > 0) {
        const index = rotation.currentStarterIndex || 0;
        starterPitcherId = rotation.starters[index];
      } else {
        const pitcher = players.find(p => p.position === 'pitcher');
        starterPitcherId = pitcher?.id;
      }
      players.forEach(p => {
        p._isStartingPitcher = (p.id === starterPitcherId && p.position === 'pitcher');
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
      isStarter: (p.battingOrder > 0 && p.battingOrder <= 9) || (useDH && p._isStartingPitcher),
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
      isStarter: (p.battingOrder > 0 && p.battingOrder <= 9) || (useDH && p._isStartingPitcher),
      hasSubbedOut: false,
      originalPosition: p.position,
      gameStats: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, strikeouts: 0, atBatResults: [] }
    })),
    currentBatterOrder: 1
  });

  const startingPitcher = useDH
    ? homePlayers.find(p => p._isStartingPitcher)
    : homePlayers.find(p => p.battingOrder === 9);
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

        // 成長率変動: 疲労50超で出場なら-0.01、10試合ごとに+0.01
        if ((playerData.fatigue || 0) > 50) adjustGrowthModifier(playerData, -0.01);
        if (season.games % 10 === 0) adjustGrowthModifier(playerData, 0.01);

        // 野手疲労蓄積: スタメン出場(3打席以上)のみ
        if ((gs.atBats || 0) >= 3) {
          const bodyStamina = playerData.physical?.bodyStamina || 50;
          const baseFatigue = Math.round(15 - (bodyStamina / 100) * 8);
          const recoveryAbility = playerData.physical?.recovery || 50;
          const recoveryMult = 0.7 + (recoveryAbility / 100) * 0.6;
          const recovCancelled = Math.round(POSITION_PLAYER_RECOVERY_BASE * recoveryMult);
          playerData.fatigue = (playerData.fatigue || 0) + baseFatigue + recovCancelled;
        }
      }

      const ps = p.stats?.pitching || {};
      if (ps.outs > 0 || ps.pitches > 0) {
        if (!playerData.seasonStats.pitching) playerData.seasonStats.pitching = {};
        const sp = playerData.seasonStats.pitching;
        const prevTotalOuts = sp.inningsPitched || 0;
        sp.games = (sp.games || 0) + 1;
        sp.inningsPitched = (sp.inningsPitched || 0) + (ps.outs || 0);
        sp.strikeouts = (sp.strikeouts || 0) + (ps.strikeouts || 0);
        sp.walks = (sp.walks || 0) + (ps.walks || 0);
        sp.runsAllowed = (sp.runsAllowed || 0) + (ps.runsAllowed || 0);
        sp.earnedRuns = (sp.earnedRuns || 0) + (ps.earnedRuns || ps.runsAllowed || 0);
        sp.hits = (sp.hits || 0) + (ps.hits || 0);
        sp.homeruns = (sp.homeruns || 0) + (ps.homeruns || 0);
        sp.pitches = (sp.pitches || 0) + (ps.pitches || 0);

        // 成長率変動: 疲労50超で登板なら-0.01
        if ((playerData.fatigue || 0) > 50) adjustGrowthModifier(playerData, -0.01);

        // 投手疲労蓄積: bodyStaminaが高いほど疲労が溜まりにくい
        const bodyStamina = playerData.physical?.bodyStamina || 50;
        const staminaBonus = (bodyStamina / 100) * 1.5;
        const pitcherRoles = teamData.pitchingRotation?.pitcherRoles || {};
        const starterIds = new Set(teamData.pitchingRotation?.starters || []);
        const isStarter = starterIds.has(p.id);
        const baseDivisor = isStarter ? 1.5 : 3;
        const pitchFatigue = Math.floor((ps.pitches || 0) / (baseDivisor + staminaBonus));
        const startBonus = isStarter ? 30 : 0;
        const fatigue = isStarter ? pitchFatigue + startBonus : Math.max(11, pitchFatigue);
        playerData.fatigue = (playerData.fatigue || 0) + fatigue;
        if (isStarter) {
          // 先発: 15イニング(45アウト)ごとに+0.01
          if (Math.floor(sp.inningsPitched / 45) > Math.floor(prevTotalOuts / 45)) {
            adjustGrowthModifier(playerData, 0.01);
          }
        } else {
          // リリーフ: 登板数ベース（守護神/セットアッパー/中継ぎエースは4登板、その他は5登板ごと）
          const role = pitcherRoles[p.id] || '';
          const highPressureRoles = ['closer', 'setup', 'ace_relief'];
          const threshold = highPressureRoles.includes(role) ? 4 : 5;
          if (sp.games % threshold === 0) {
            adjustGrowthModifier(playerData, 0.01);
          }
        }
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

    // 先発IDをローテーションから特定（試合後はインデックス+1済みなので-1で逆算）
    const getRotStarterId = (teamName) => {
      const rot = TEAMS_DATA[teamName]?.pitchingRotation;
      if (!rot?.starters?.length) return null;
      const idx = ((rot.currentStarterIndex || 0) - 1 + rot.starters.length) % rot.starters.length;
      return rot.starters[idx];
    };
    const winStarterId = getRotStarterId(winTeamName);

    // 勝利投手判定: 先発が5回以上→先発、それ以外→最多投球回リリーフ
    const winPitchers = winTeamState.players.filter(p => (p.stats?.pitching?.outs || 0) > 0)
      .sort((a, b) => (b.stats?.pitching?.outs || 0) - (a.stats?.pitching?.outs || 0));
    const winStarter = winPitchers.find(p => p.originalPosition === 'pitcher' || p.battingOrder === 9);
    const winPitcher = winStarter && (winStarter.stats?.pitching?.outs || 0) >= 15
      ? winStarter
      : (winPitchers.filter(p => p !== winStarter)[0] || winPitchers[0]);

    // 敗戦投手判定: 先発が失点していれば先発、そうでなければ最多失点のリリーフ
    const losePitchers = loseTeamState.players.filter(p => (p.stats?.pitching?.outs || 0) > 0);
    const loseStarter = losePitchers.find(p => p.originalPosition === 'pitcher' || p.battingOrder === 9)
      || [...losePitchers].sort((a, b) => (b.stats?.pitching?.outs || 0) - (a.stats?.pitching?.outs || 0))[0];
    const losePitcher = loseStarter && (loseStarter.stats?.pitching?.runsAllowed || 0) > 0
      ? loseStarter
      : [...losePitchers].sort((a, b) => (b.stats?.pitching?.runsAllowed || 0) - (a.stats?.pitching?.runsAllowed || 0))[0] || null;

    // セーブ投手判定: 勝ち投手・先発を除いた最少アウト（最後に登板）の投手
    const scoreDiff = Math.abs(finalScore.home - finalScore.away);
    let savePitcher = null;
    if (winPitchers.length > 1) {
      const saveEligible = winPitchers.filter(p =>
        p !== winPitcher &&
        (winStarterId ? p.id !== winStarterId : p !== winStarter)
      );
      const lastPitcher = saveEligible.length > 0 ? saveEligible[saveEligible.length - 1] : null;
      if (lastPitcher) {
        const outs = lastPitcher.stats?.pitching?.outs || 0;
        if ((scoreDiff <= 3 && outs >= 3) || outs >= 9) {
          savePitcher = lastPitcher;
        }
      }
    }

    // ホールド: 勝ちチームのリリーフで、勝ち投手・セーブ・先発でなく1アウト以上
    const holdPitchers = winPitchers.filter(p =>
      p !== winPitcher && p !== savePitcher && p !== winStarter &&
      (winStarterId ? p.id !== winStarterId : true) &&
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
      playerData.seasonStats.pitching[stat] = (playerData.seasonStats.pitching[stat] || 0) + 1;
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

      // 先発IDをautoSimulateGame実行前のローテーションインデックスから記録
      const ohStarterId = (() => {
        const rot = oh.pitchingRotation;
        if (!rot?.starters?.length) return null;
        return rot.starters[(rot.currentStarterIndex || 0) % rot.starters.length];
      })();
      const oaStarterId = (() => {
        const rot = oa.pitchingRotation;
        if (!rot?.starters?.length) return null;
        return rot.starters[(rot.currentStarterIndex || 0) % rot.starters.length];
      })();
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
            // 勝ちチームの先発ID（試合前に取得済み）
            const oWinStarterId = oIsHomeWin ? ohStarterId : oaStarterId;
            // 勝ち投手（DH制では投手battingOrder=0）
            const oStarter = oWinPs.find(p => p.battingOrder === 9 || (p.position === 'pitcher' && p.battingOrder === 0));
            const oWinP = oStarter && oStarter.gameStats.pitching.outs >= 15
              ? oStarter : (oWinPs.filter(p => p !== oStarter).sort((a, b) => b.gameStats.pitching.outs - a.gameStats.pitching.outs)[0] || oWinPs[0]);
            // 負け投手: 先発が失点していれば先発、そうでなければ最多失点のリリーフ
            const oLoseStarter = oLosePs.find(p => p.battingOrder === 9 || (p.position === 'pitcher' && p.battingOrder === 0));
            const oLoseP = oLoseStarter && (oLoseStarter.gameStats?.pitching?.runsAllowed || 0) > 0
              ? oLoseStarter
              : [...oLosePs].sort((a, b) => b.gameStats.pitching.runsAllowed - a.gameStats.pitching.runsAllowed)[0];
            // セーブ: 勝ち投手・先発を除いた最少アウト（最後に登板）の投手
            const oScoreDiff = Math.abs(otherResult.homeScore - otherResult.awayScore);
            const oSaveCandidates = [...oWinPs]
              .filter(p => p !== oWinP && (oWinStarterId ? p.id !== oWinStarterId : p !== oStarter))
              .sort((a, b) => (b.gameStats.pitching.outs || 0) - (a.gameStats.pitching.outs || 0));
            const oLastP = oSaveCandidates.length > 0 ? oSaveCandidates[oSaveCandidates.length - 1] : null;
            const oSaveP = oLastP &&
              ((oScoreDiff <= 3 && oLastP.gameStats.pitching.outs >= 3) || oLastP.gameStats.pitching.outs >= 9)
              ? oLastP : null;
            const recordOther = (playerState, teamName, stat) => {
              const td = TEAMS_DATA[teamName];
              if (!td) return;
              const pd = td.players.find(pl => pl.id === playerState.id);
              if (!pd) return;
              if (!pd.seasonStats?.pitching) { if (!pd.seasonStats) pd.seasonStats = { batting: {}, pitching: {} }; if (!pd.seasonStats.pitching) pd.seasonStats.pitching = {}; }
              pd.seasonStats.pitching[stat] = (pd.seasonStats.pitching[stat] || 0) + 1;
            };
            if (oWinP) recordOther(oWinP, oWinName, 'wins');
            if (oLoseP) recordOther(oLoseP, oLoseName, 'losses');
            if (oSaveP) recordOther(oSaveP, oWinName, 'saves');
            // ホールド: 勝ち投手・セーブ・先発を除く
            oWinPs.forEach(p => {
              if (p !== oWinP && p !== oSaveP && p !== oStarter &&
                  (oWinStarterId ? p.id !== oWinStarterId : true) &&
                  p.gameStats.pitching.outs >= 1) {
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

  // 大学トーナメントの結果処理（全日本大学野球選手権 / 明治神宮大会）
  for (const tournamentKey of ['universityChampionship', 'meijiJingu']) {
    const utPending = updatedSeasonData[tournamentKey]?.pendingMatch;
    if (utPending && info.isTournament) {
      const ut = { ...updatedSeasonData[tournamentKey] };
      const userWon = finalScore.home > finalScore.away;
      const winnerName = userWon ? htn : atn;
      const scoreArr = [finalScore.home, finalScore.away];

      recordResult(ut.bracket, utPending.roundIdx, utPending.matchIdx, winnerName, scoreArr);
      if (isBracketComplete(ut.bracket)) {
        ut.champion = ut.bracket.champion;
        const finalRound = ut.bracket.rounds[ut.bracket.rounds.length - 1];
        ut.runnerUp = finalRound?.[0]?.loser || null;
        ut.phase = 'done';
      }

      ut.pendingMatch = null;
      updatedSeasonData = { ...updatedSeasonData, [tournamentKey]: ut };
      setSeasonData(updatedSeasonData);
      setManagedGameInfo(null);
      managedGameInfoRef.current = null;
      setScreenMode('management');
      setManagementView('dateprogress');
      return;
    }
  }

  // 地域トーナメントの結果処理
  const rtPending = updatedSeasonData.regionalTournament?.pendingMatch;
  if (rtPending && info.isTournament) {
    const rt = { ...updatedSeasonData.regionalTournament };
    const userWon = finalScore.home > finalScore.away;
    const winnerName = userWon ? htn : atn;
    const scoreArr = [finalScore.home, finalScore.away];

    const region = rt.brackets?.[rtPending.regionId];
    if (region) {
      recordResult(region.bracket, rtPending.roundIdx, rtPending.matchIdx, winnerName, scoreArr);
      if (isBracketComplete(region.bracket)) {
        region.champion = region.bracket.champion;
        region.phase = 'done';
        const allDone = Object.values(rt.brackets).every(r => r.phase === 'done');
        if (allDone) {
          rt.champions = Object.values(rt.brackets).map(r => r.champion).filter(Boolean);
          rt.phase = 'done';
        }
      }
    }

    rt.pendingMatch = null;
    updatedSeasonData = { ...updatedSeasonData, regionalTournament: rt };
    setSeasonData(updatedSeasonData);
    setManagedGameInfo(null);
    managedGameInfoRef.current = null;
    setScreenMode('management');
    setManagementView('dateprogress');
    return;
  }

  // 日本選手権の結果処理
  const nsPending = updatedSeasonData.nihonSenshuken?.pendingMatch;
  if (nsPending && info.isTournament) {
    const ns = { ...updatedSeasonData.nihonSenshuken };
    const userWon = finalScore.home > finalScore.away;
    const winnerName = userWon ? htn : atn;
    const scoreArr = [finalScore.home, finalScore.away];

    if (nsPending.bracketType === 'nihon_senshuken' && ns.mainTournament) {
      recordResult(ns.mainTournament.bracket, nsPending.roundIdx, nsPending.matchIdx, winnerName, scoreArr);
      if (isBracketComplete(ns.mainTournament.bracket)) {
        const rankings = getBracketRankings(ns.mainTournament.bracket);
        ns.mainTournament.champion = rankings[0] || null;
        ns.mainTournament.runnerUp = rankings[1] || null;
        ns.mainTournament.phase = 'done';
        ns.champion = ns.mainTournament.champion;
        ns.runnerUp = ns.mainTournament.runnerUp;
        ns.phase = 'done';
      }
    } else if (nsPending.bracketType === 'nihon_senshuken_qualifier_losers' && nsPending.regionId) {
      const qualifier = ns.qualifiers[nsPending.regionId];
      if (qualifier?.losersBracket) {
        recordResult(qualifier.losersBracket, nsPending.roundIdx, nsPending.matchIdx, winnerName, scoreArr);
        if (!userWon) {
          autoPlayBracket(qualifier.losersBracket, qualifier.teamDefsMap);
        }
        if (isBracketComplete(qualifier.losersBracket)) {
          const losersRankings = getBracketRankings(qualifier.losersBracket);
          qualifier.qualifiedTeams.push(...losersRankings.slice(0, qualifier.slots - 1));
          qualifier.phase = 'done';
        }
        const allDone = Object.values(ns.qualifiers).every(q => q.phase === 'done');
        if (allDone) {
          ns.userQualifierDone = true;
          ns.phase = 'qualifiers_done';
        }
      }
    } else if (nsPending.bracketType === 'nihon_senshuken_qualifier' && nsPending.regionId) {
      const qualifier = ns.qualifiers[nsPending.regionId];
      if (qualifier) {
        advanceQualifierWithResult(qualifier, nsPending.roundIdx, nsPending.matchIdx, winnerName, scoreArr, htn);
        const allDone = Object.values(ns.qualifiers).every(q => q.phase === 'done');
        if (allDone) {
          ns.userQualifierDone = true;
          ns.phase = 'qualifiers_done';
        }
      }
    }

    ns.pendingMatch = null;
    updatedSeasonData = { ...updatedSeasonData, nihonSenshuken: ns };
    setSeasonData(updatedSeasonData);
    setManagedGameInfo(null);
    managedGameInfoRef.current = null;
    setScreenMode('management');
    setManagementView('dateprogress');
    return;
  }

  // クラブ選手権の結果処理
  const csPending = updatedSeasonData.clubSenshuken?.pendingMatch;
  if (csPending && info.isTournament) {
    const cs = { ...updatedSeasonData.clubSenshuken };
    const userWon = finalScore.home > finalScore.away;
    const winnerName = userWon ? htn : atn;
    const scoreArr = [finalScore.home, finalScore.away];

    if (csPending.bracketType === 'club_senshuken' && cs.mainTournament) {
      recordResult(cs.mainTournament.bracket, csPending.roundIdx, csPending.matchIdx, winnerName, scoreArr);
      if (isBracketComplete(cs.mainTournament.bracket)) {
        const rankings = getBracketRankings(cs.mainTournament.bracket);
        cs.mainTournament.champion = rankings[0] || null;
        cs.mainTournament.runnerUp = rankings[1] || null;
        cs.mainTournament.phase = 'done';
        cs.champion = cs.mainTournament.champion;
        cs.runnerUp = cs.mainTournament.runnerUp;
        cs.phase = 'done';
      }
    } else if (csPending.bracketType === 'club_senshuken_qualifier_losers' && csPending.regionId) {
      const qualifier = cs.qualifiers[csPending.regionId];
      if (qualifier?.losersBracket) {
        recordResult(qualifier.losersBracket, csPending.roundIdx, csPending.matchIdx, winnerName, scoreArr);
        if (!userWon) {
          autoPlayBracket(qualifier.losersBracket, qualifier.teamDefsMap);
        }
        if (isBracketComplete(qualifier.losersBracket)) {
          const losersRankings = getBracketRankings(qualifier.losersBracket);
          qualifier.qualifiedTeams.push(...losersRankings.slice(0, qualifier.slots - 1));
          qualifier.phase = 'done';
        }
        const allDone = Object.values(cs.qualifiers).every(q => q.phase === 'done');
        if (allDone) {
          cs.userQualifierDone = true;
          cs.phase = 'qualifiers_done';
        }
      }
    } else if (csPending.bracketType === 'club_senshuken_qualifier' && csPending.regionId) {
      const qualifier = cs.qualifiers[csPending.regionId];
      if (qualifier) {
        advanceQualifierWithResult(qualifier, csPending.roundIdx, csPending.matchIdx, winnerName, scoreArr, htn);
        const allDone = Object.values(cs.qualifiers).every(q => q.phase === 'done');
        if (allDone) {
          cs.userQualifierDone = true;
          cs.phase = 'qualifiers_done';
        }
      }
    }

    cs.pendingMatch = null;
    updatedSeasonData = { ...updatedSeasonData, clubSenshuken: cs };
    setSeasonData(updatedSeasonData);
    setManagedGameInfo(null);
    managedGameInfoRef.current = null;
    setScreenMode('management');
    setManagementView('dateprogress');
    return;
  }

  // トーナメント試合の結果処理
  const pendingMatch = updatedSeasonData.toshitaikou?.pendingMatch;
  if (pendingMatch && info.isTournament) {
    const td = { ...updatedSeasonData.toshitaikou };
    const userWon = finalScore.home > finalScore.away;
    const winnerName = userWon ? htn : atn;
    const scoreArr = [finalScore.home, finalScore.away];

    if (pendingMatch.bracketType === 'main_tournament' && td.mainTournament) {
      // 本戦の結果記録
      recordResult(td.mainTournament.bracket, pendingMatch.roundIdx, pendingMatch.matchIdx, winnerName, scoreArr);
      if (isBracketComplete(td.mainTournament.bracket)) {
        const rankings = getBracketRankings(td.mainTournament.bracket);
        td.mainTournament.champion = rankings[0] || null;
        td.mainTournament.runnerUp = rankings[1] || null;
        td.mainTournament.phase = 'done';
        td.champion = td.mainTournament.champion;
        td.runnerUp = td.mainTournament.runnerUp;
        td.mainDone = true;
      }
    } else if (pendingMatch.bracketType === 'losers' && pendingMatch.regionId) {
      // 敗者復活の結果記録
      const qualifier = td.qualifiers[pendingMatch.regionId];
      if (qualifier?.losersBracket) {
        recordResult(qualifier.losersBracket, pendingMatch.roundIdx, pendingMatch.matchIdx, winnerName, scoreArr);
        // ユーザーが負けたら残りの敗者復活を全消化
        if (!userWon) {
          autoPlayBracket(qualifier.losersBracket, qualifier.teamDefsMap);
        }
        if (isBracketComplete(qualifier.losersBracket)) {
          const losersRankings = getBracketRankings(qualifier.losersBracket);
          qualifier.qualifiedTeams.push(...losersRankings.slice(0, qualifier.slots - 1));
          qualifier.phase = 'done';
        }
        const allDone = Object.values(td.qualifiers).every(q => q.phase === 'done');
        td.qualifiersDone = allDone;
        td.userQualifierDone = qualifier.phase === 'done';
      }
    } else if (pendingMatch.regionId) {
      // 予選(勝者側)の結果記録
      const qualifier = td.qualifiers[pendingMatch.regionId];
      if (qualifier) {
        advanceQualifierWithResult(qualifier, pendingMatch.roundIdx, pendingMatch.matchIdx, winnerName, scoreArr, htn);
        const allDone = Object.values(td.qualifiers).every(q => q.phase === 'done');
        td.qualifiersDone = allDone;
        td.userQualifierDone = qualifier.phase === 'done';
      }
    }
    td.pendingMatch = null;
    updatedSeasonData = { ...updatedSeasonData, toshitaikou: td };
    setSeasonData(updatedSeasonData);
    setManagedGameInfo(null);
    managedGameInfoRef.current = null;
    setScreenMode('management');
    setManagementView('dateprogress');
    return;
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
