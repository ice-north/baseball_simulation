// ========================================================================
// gameSetup.js - setupManagedGame, handleManagedGameEnd
// Extracted from App.jsx GAME_SETUP section
// ========================================================================

import { TEAMS_DATA, LEAGUE_SETTINGS } from '../teams-data.js';
import { generateAILineup, writeBackGameStats } from './autoSimulation.js';
import { applyBattingOrderEntries } from './lineup.js';
import { recordGameResult } from '../season/dateProgression.js';
import { decidePitchers, recordDecisions } from './pitcherDecisions.js';

import { advanceQualifierWithResult, autoPlayBracket, isBracketComplete, getBracketRankings, buildLosersBracket, recordResult } from '../corporate/toshitaikou.js';

/**
 * setupManagedGame - 采配モードの試合セットアップ
 *
 * ctx に必要なプロパティ:
 *   setCount, setBases, setOuts, setInning, setScore, setGameOver,
 *   setGameStarted, setRemainingPitches, setSimMode, outOccurredRef,
 *   setInningScores, setExtraInningScores,
 *   setTeamHits, setTeamErrors, setIsTopInning,
 *   setGameLog, setLastResult,
 *   setHomeTeam, setAwayTeam, setCurrentStamina,
 *   setManagedGameInfo, managedGameInfoRef, setScreenMode
 */
export function executeSetupManagedGame(ctx, gameInfo) {
  const {
    setCount, setBases, setOuts, setInning, setScore, setGameOver,
    setGameStarted, setRemainingPitches, setSimMode, outOccurredRef,
    setInningScores, setExtraInningScores,
    setTeamHits, setTeamErrors, setIsTopInning,
    setGameLog, setLastResult,
    setHomeTeam, setAwayTeam, setCurrentStamina,
    setManagedGameInfo, managedGameInfoRef, setScreenMode
  } = ctx;

  // gameInfo: { gameId, home, away, otherGames: [{gameId, home, away}, ...] }
  const htn = gameInfo.home;
  const atn = gameInfo.away;
  const htd = TEAMS_DATA[htn];
  const atd = TEAMS_DATA[atn];

  // 引けないときは false を返す（呼ぶ側は試合を始めない）
  if (!htd || !atd) {
    console.error('[executeSetupManagedGame] チームが見つかりません', htn, atn);
    return false;
  }

  const useDH = LEAGUE_SETTINGS.useDH;

  // ユーザーチームがどちら側かに応じてスタメンを適用
  const applyLineup = (teamData, teamName) => {
    const players = JSON.parse(JSON.stringify(teamData.players));
    const settings = teamData.lineupSettings;
    const isUserTeam = settings?.battingOrder?.length > 0;
    // AIチームの今日の先発（generateAILineup がローテと疲労から選んだ人）
    let aiStarterId = null;

    if (isUserTeam) {
      // DH の印も外す（打順に入る人だけ付け直す。`generateAILineup` の説明を参照）
      players.forEach(p => { p.battingOrder = 0; delete p._isDH; });
      applyBattingOrderEntries(players, settings.battingOrder);
    } else {
      const tempTeamData = { ...teamData, players };
      aiStarterId = generateAILineup(tempTeamData, teamName)?.id ?? null;
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
        // ⚠ AIチームは generateAILineup が選んだ先発を使う。以前は名簿で最初の投手を
        //    選び直しており、試合前の「相手先発」と違う人（抑えなど）がマウンドに立ち、
        //    ローテだけ1つ進んでいた
        starterPitcherId = aiStarterId ?? players.find(p => p.position === 'pitcher')?.id;
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
  setTeamHits({ home: 0, away: 0 });
  setTeamErrors({ home: 0, away: 0 });
  setIsTopInning(true);
  setGameLog([]);
  setLastResult(null);

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
  return true;
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
    managedGameInfoRef, score, homeTeam, awayTeam, decisionLog,
    seasonData, setSeasonData, selectedMonth, setSelectedMonth,
    setManagedGameInfo, setScreenMode, setManagementView
  } = ctx;

  const info = managedGameInfoRef.current;
  if (!info) return;

  const finalScore = { ...score };
  const htn = homeTeam.name;
  const atn = awayTeam.name;

  // トーナメントの勝ち上がり。⚠ **引き分けを「ホームの負け」にしないこと**。
  //    采配した大会の試合はユーザーがホームなので、以前は同点で終わると
  //    無条件にユーザーの敗退になっていた。自動の試合（`simulateQuickMatch`）と同じく
  //    タイブレークで決着させる（采配試合はチームの格が引けないので五分）。
  const tournamentOutcome = () => {
    let h = finalScore.home, a = finalScore.away;
    if (h === a) {
      const homeWins = Math.random() < 0.5;
      const loseAdd = Math.random() < 0.4 ? 1 : 0;
      const winAdd = loseAdd + 1 + (Math.random() < 0.35 ? 1 : 0);
      if (homeWins) { h += winAdd; a += loseAdd; } else { a += winAdd; h += loseAdd; }
    }
    return { userWon: h > a, winnerName: h > a ? htn : atn, scoreArr: [h, a] };
  };

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

  const updateManagedGameStats = (teamState, teamName, side) => {
    const teamData = TEAMS_DATA[teamName];
    if (!teamData) return;
    // この試合の先発＝登板記録の最初の投手。⚠ ローテに入っているかで決めないこと
    //    （以前はそうしていて、救援に回ったローテ投手が先発扱いの疲労を背負い、
    //    逆に采配試合の先発には先発数・QSが一度も付かなかった）
    const gameStarterId = (decisionLog?.appearances?.[side] || []).find(a => a.isStarter)?.id
      ?? decisionLog?.appearances?.[side]?.[0]?.id ?? null;

    const starterIds = new Set(teamData.pitchingRotation?.starters || []);
    teamState.players.forEach(p => {
      const playerData = teamData.players.find(pl => pl.id === p.id);
      if (!playerData) return;

      const gs = p.gameStats || {};
      // 書き戻しは自動の試合と同じ関数（autoSimulation.js の writeBackGameStats）。
      // 采配の試合は打撃と守備を gameStats に平らに、投手を stats.pitching に持つので形をそろえて渡す
      writeBackGameStats(playerData, teamData, p, {
        batting: gs,
        pitching: p.stats?.pitching || {},
        fielding: { chances: gs.fieldingChances || 0, errors: gs.fieldErrors || 0, assists: gs.assists || 0 },
        wasStarter: gameStarterId != null ? p.id === gameStarterId : starterIds.has(p.id),
      });
    });
  };

  updateManagedGameStats(homeTeam, htn, 'home');
  updateManagedGameStats(awayTeam, atn, 'away');

  // 勝敗・セーブ・ホールド（自動シミュと同じ判定。pitcherDecisions.js）。
  // ⚠ 以前はここに独自の推定があり（先発が5回以上なら先発の勝ち／最少アウト＝最後の投手）、
  //    0-0で5回に降りた先発に勝ちが付き、1-0の9回の守護神にセーブが付かなかった
  if (finalScore.home !== finalScore.away && decisionLog) {
    const teamState = { home: homeTeam, away: awayTeam };
    const outsOf = (side, id) => teamState[side]?.players?.find(p => p.id === id)?.stats?.pitching?.outs || 0;
    const d = decidePitchers({
      finalScore, appearances: decisionLog.appearances, lastLead: decisionLog.lastLead, outsOf,
    });
    if (d.winSide) {
      const find = (side, id) => (id == null ? null : teamState[side].players.find(p => p.id === id) || null);
      const loseSide = d.winSide === 'home' ? 'away' : 'home';
      const nameOf = { home: htn, away: atn };
      recordDecisions({
        winningPitcher: find(d.winSide, d.win),
        losingPitcher: find(loseSide, d.loss),
        savePitcher: find(d.winSide, d.save),
        holdPitchers: d.holds.map(id => find(d.winSide, id)).filter(Boolean),
      }, { winTeam: nameOf[d.winSide], loseTeam: nameOf[loseSide] }, TEAMS_DATA);
    }
  }

  // ⚠ 同じ日の他の試合はここで消化しない。日付送りと一緒に日程進行の
  //    `executeSkipDay`（`simulateScheduledGamesOnDate`）が消化する（下記 `_resumeDayAfterManagedGame`）。
  //    以前はここに**勝敗・セーブ・ホールドの判定をもう1本**持っていた（表の二重化）

  // 大学トーナメントの結果処理（全日本大学野球選手権 / 明治神宮大会）
  for (const tournamentKey of ['universityChampionship', 'meijiJingu']) {
    const utPending = updatedSeasonData[tournamentKey]?.pendingMatch;
    if (utPending && info.isTournament) {
      const ut = { ...updatedSeasonData[tournamentKey] };
      const { userWon, winnerName, scoreArr } = tournamentOutcome();

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
    const { userWon, winnerName, scoreArr } = tournamentOutcome();

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
    const { userWon, winnerName, scoreArr } = tournamentOutcome();

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
    const { userWon, winnerName, scoreArr } = tournamentOutcome();

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
    const { userWon, winnerName, scoreArr } = tournamentOutcome();

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

  // ⚠ **ここで日付を進めないこと**。以前は `progressDate` だけ呼んで日程進行へ戻っており、
  //    通常の日送り（`DateProgressScreen.executeSkipDay`）が行う
  //    他リーグ・大学リーグの試合 / 背景の社会人大会 / 推薦スカウトの日次処理 /
  //    2ヶ月ごとの注目度 / `checkAndTriggerEvents` が**采配した日だけ丸ごと抜けていた**。
  //    それらは日付の完全一致でしか消化しないので、後からも拾われない
  //    （大学モードではドラフト前日の試合を采配するとドラフトまで飛んでいた）。
  //    印を付けて日程進行へ戻り、向こうで同じ1日の処理を通す。
  updatedSeasonData = { ...updatedSeasonData, _resumeDayAfterManagedGame: true };

  setSeasonData(updatedSeasonData);

  setManagedGameInfo(null);
  managedGameInfoRef.current = null;
  setScreenMode('management');
  setManagementView('dateprogress');
}
