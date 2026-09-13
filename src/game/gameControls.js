// ========================================================================
// gameControls.js - resetGame, multiPitch, startSimMode
// Extracted from App.jsx GAME_CONTROLS section (L2791-2965)
// ========================================================================

import { createDefaultPlayers, createAwayPlayers, createHomeBench, createAwayBench } from '../players.js';

/**
 * resetGame - 試合状態を完全にリセットする
 *
 * ctx に必要なプロパティ:
 *   isSubstituting, setCount, setBases, setOuts, setInning, setScore,
 *   setGameOver, setRemainingPitches, setSimMode, outOccurredRef,
 *   setInningScores, setExtraInningScores, setCurrentInningScore,
 *   setTeamHits, setTeamErrors, setTeamRBIs, setIsTopInning,
 *   setGameLog, setLastResult, setStatistics, setRecentVelocities,
 *   setHomeTeam, setAwayTeam, setCurrentStamina,
 *   setBatterStats, setPitcherStats, setCatcherStats
 *
 * ⚠ かつてここに打球統計4種（battedBall*Stats）のリセットが52行あったが、
 *    **その state は一度も描画されていなかった**ので App.jsx ごと除去した
 *    （`lastGameResults` / 「昨日の結果」と同じ defect）。
 *    初期値とリセット値を2箇所に書く形でもあったので、復活させるなら
 *    **描く場所を先に決めてから**にすること。
 */
export function executeResetGame(ctx) {
  const {
    isSubstituting,
    setCount, setBases, setOuts, setInning, setScore,
    setGameOver, setRemainingPitches, setSimMode, outOccurredRef,
    setInningScores, setExtraInningScores, setCurrentInningScore,
    setTeamHits, setTeamErrors, setTeamRBIs, setIsTopInning,
    setGameLog, setLastResult, setStatistics, setRecentVelocities,
    setHomeTeam, setAwayTeam, setCurrentStamina,
    setBatterStats, setPitcherStats, setCatcherStats
  } = ctx;

  // 交代処理中フラグをクリア
  isSubstituting.current = false;

  setCount({ balls: 0, strikes: 0 });
  setBases([false, false, false]);
  setOuts(0);
  setInning(1);
  setScore({ home: 0, away: 0 });
  setGameOver(false);  // 試合終了フラグをリセット
  setRemainingPitches(0);  // 残り投球数をリセット
  setSimMode(null);
  outOccurredRef.current = false;
  setInningScores({
    away: [null, null, null, null, null, null, null, null, null],
    home: [null, null, null, null, null, null, null, null, null]
  });
  setExtraInningScores({ away: [], home: [] });  // 延長スコアリセット
  setCurrentInningScore({ away: 0, home: 0 });
  setTeamHits({ home: 0, away: 0 });
  setTeamErrors({ home: 0, away: 0 });
  setTeamRBIs({ home: 0, away: 0 });
  setIsTopInning(true);
  setGameLog([]);
  setLastResult(null);
  setStatistics(null);
  setRecentVelocities([]);
  // チームを完全に初期状態に戻す（選手の位置・打順・交代フラグなども全てリセット）
  setHomeTeam({
    name: "ホーム",
    players: [...createDefaultPlayers().map(p => ({...p, isStarter: true, hasSubbedOut: false, originalPosition: p.position})), ...createHomeBench().map(p => ({...p, hasSubbedOut: false, originalPosition: p.position}))],
    currentBatterOrder: 1
  });
  setAwayTeam({
    name: "アウェイ",
    players: [...createAwayPlayers().map(p => ({...p, isStarter: true, hasSubbedOut: false, originalPosition: p.position})), ...createAwayBench().map(p => ({...p, hasSubbedOut: false, originalPosition: p.position}))],
    currentBatterOrder: 1
  });
  // スタミナリセット（新しい投手で）
  setTimeout(() => {
    const homePitcher = createDefaultPlayers().find(p => p.position === 'pitcher');
    if (homePitcher) {
      setCurrentStamina(homePitcher.pitching.stamina);
    }
  }, 100);
  setBatterStats({
    plateAppearances: 0,
    atBats: 0,
    hits: 0,
    homeruns: 0,
    walks: 0,
    strikeouts: 0,
    totalBases: 0,
    stolenBases: 0,
    caughtStealing: 0
  });
  setPitcherStats({
    pitches: 0,
    outs: 0,
    strikeouts: 0,
    walks: 0,
    runsAllowed: 0,
    errors: 0,
    wildPitches: 0,
    doublePlay: 0
  });
  setCatcherStats({
    stolenBasesAllowed: 0,
    caughtStealing: 0,
    wildPitchesBlocked: 0
  });
}

/**
 * multiPitch - 指定回数投球を開始
 *
 * ctx に必要なプロパティ:
 *   setRemainingPitches, setIsAutoSimulating
 */
export function executeMultiPitch(ctx, pitchCount) {
  const { setRemainingPitches, setIsAutoSimulating } = ctx;
  setRemainingPitches(pitchCount);
  setIsAutoSimulating(true);
}

/**
 * startSimMode - シミュレーションモードを開始（'out' or 'end'）
 *
 * ctx に必要なプロパティ:
 *   outOccurredRef, setSimMode, setIsAutoSimulating
 */
export function executeStartSimMode(ctx, mode) {
  const { outOccurredRef, setSimMode, setIsAutoSimulating } = ctx;
  outOccurredRef.current = false;
  setSimMode(mode);
  setIsAutoSimulating(true);
}
