// ============================================================
// 采配の試合（一人用で自分で采配する試合）の state と処理
//
// 2026-11-24 に App.jsx から切り出した（中身は動かさず、そのまま移した）。
// App は前と同じ位置でこのフックを呼ぶので、フックの順番も effect の順番も変わらない。
// 画面は src/components/ManagedGameScreen.jsx。1球の計算は pitchEngine.js、
// CPU の采配は managedTactics.js → cpuTactics.js（どちらも自動の試合と同じ正本）。
// ============================================================
import React, { useState, useEffect, useRef } from 'react';
import { createDecisionLog, observeDecisionLog } from './pitcherDecisions.js';
import { BALL_EFFECTS, POSITION_NAMES } from '../utils/constants.js';
import { getBestFitPosition } from '../utils/physics.js';
import { TEAMS_DATA, LEAGUE_SETTINGS, normalizeMaxExtraInnings } from '../teams-data.js';
import { spinAdjustedArsenal } from '../simulation-logic.js';
import { simulatePitch as simulateEnginePitch, pitchArsenalOf, fieldDefenseOf } from './pitchEngine.js';
import { useGameStrategy } from './useGameStrategy.js';
import { getDeception, deceptionAxis } from './deception.js';
import { swingPowerLabel } from './swingType.js';
import { createSequence } from './pitchSequence.js';
import { hitByPitchFatigue } from './pitchZone.js';
import { resolveGroundOutAdvance, tryExtraAdvance } from './baserunning.js';
import { stealSuccessRate, stealAttemptRate } from './stealing.js';
import { classifyBuntContact, rollBuntQuality, buntFieldDefense, buntThrowOutChance, squeezeHomeThrowChance } from './bunting.js';
import { makeRunner, runnerOf, asFlags, forceAdvance, isUnearnedRunner, unearnedAt } from './baseState.js';
import { activeArsenal } from './arsenal.js';
import { CONDITION_LEVELS, conditionBattingMod, CONDITION_PITCHING_MODIFIER } from './condition.js';
import { executeResetGame, executeStartSimMode } from './gameControls.js';
import { executeSetupManagedGame, executeHandleManagedGameEnd } from './gameSetup.js';
import { createManagedTacticsMemory, runManagedTactics, noteAtBatEnd, noteHalfInningEnd, staminaOf, setStamina } from './managedTactics.js';
import { useEscapeToClose } from '../components/useEscapeToClose.js';
import { setAutoManagerPref } from './managedGamePrefs.js';

export function useManagedGame(app) {
  const {
    allTeams,
    seasonData,
    selectedMonth,
    setManagementView,
    setScreenMode,
    setSeasonData,
    setSelectedMonth,
    userTeamName,
  } = app;

  // 変化球の効果設定（外部ファイルから読み込み）
  const ballEffects = BALL_EFFECTS;

  // 試合状態（先に定義が必要）
  const [isTopInning, setIsTopInning] = useState(true);
  const [inning, setInning] = useState(1);
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [gameOver, setGameOver] = useState(false);  // 試合終了フラグ
  // 試合終了の欄。
  // ⚠ 以前は終わったら欄まで送っていた（「結果確定・翌日へ」が欄のいちばん下にあり、1280×720 では
  //    画面の下に隠れていたため）。確定ボタンは進行の列（1球の場所）へ移した（UI点検 S3）ので送らない。
  //    送ると、押す場所（進行の列）が画面の上へ出ていく
  const gameEndPanelRef = useRef(null);
  const [gameStarted, setGameStarted] = useState(false);  // 試合開始フラグ
  const [selectedBatterAway, setSelectedBatterAway] = useState(null);  // 打順変更用（アウェイ）
  const [selectedBatterHome, setSelectedBatterHome] = useState(null);  // 打順変更用（ホーム）
  const [selectedPositionAway, setSelectedPositionAway] = useState(null);  // 守備位置変更用（アウェイ）
  const [selectedPositionHome, setSelectedPositionHome] = useState(null);  // 守備位置変更用（ホーム）
  const [selectedSubstituteAway, setSelectedSubstituteAway] = useState(null);  // 選手交代用（アウェイ）
  const [selectedSubstituteHome, setSelectedSubstituteHome] = useState(null);  // 選手交代用（ホーム）
  const [showBenchAway, setShowBenchAway] = useState(false);  // ベンチ表示切り替え（アウェイ）
  const [showBenchHome, setShowBenchHome] = useState(false);  // ベンチ表示切り替え（ホーム）
  const [autoManagerMode, setAutoManagerMode] = useState(true);  // 監督AI自動采配モード
  const [showSubModal, setShowSubModal] = useState(false);  // 選手交代モーダル
  const [subModalSelected, setSubModalSelected] = useState(null);  // モーダル内選択中選手ID
  useEscapeToClose(() => { setShowSubModal(false); setSubModalSelected(null); }, showSubModal);
  const isSubstituting = React.useRef(false);  // 交代処理中フラグ（二重実行防止）
  // 采配モード（日程進行から起動した試合）
  const [managedGameInfo, setManagedGameInfo] = useState(null);  // { gameId, home, away, otherGames }
  const managedGameInfoRef = useRef(null);
  // レギュレーション設定（拡張可能な設定）
  // 延長最大回数。規定（seasonData.settings.maxExtraInnings）に従う。
  // ⚠ 以前は12で固定の state で、規定を変えても采配試合に効かなかった
  // ⚠ 大会の試合（`isTournament`）は規定を使わず12回まで。自動の大会試合
  //    （`autoSimulateGame` の `isCupGame`）と同じ。規定を9回にしていると、
  //    自分で采配した大会の試合だけ9回で打ち切られ、勝敗がコイン投げで決まっていた
  const maxExtraInnings = managedGameInfo?.isTournament
    ? 12
    : normalizeMaxExtraInnings(seasonData?.settings?.maxExtraInnings ?? 12);
  // 勝敗・セーブ・ホールドの判定用（登板順とリードの移り変わり。自動シミュと同じ帳簿）
  const decisionLogRef = useRef(createDecisionLog());
  // イニングごとの得点（9回まで）
  const [inningScores, setInningScores] = useState({
    away: [null, null, null, null, null, null, null, null, null],
    home: [null, null, null, null, null, null, null, null, null]
  });
  // 延長イニングの得点（10回以降）
  const [extraInningScores, setExtraInningScores] = useState({
    away: [],
    home: []
  });
  // チーム別安打・エラー
  const [teamHits, setTeamHits] = useState({ home: 0, away: 0 });
  const [teamErrors, setTeamErrors] = useState({ home: 0, away: 0 });
  const [count, setCount] = useState({ balls: 0, strikes: 0 });
  const [bases, setBases] = useState([false, false, false]);
  const [outs, setOuts] = useState(0);
  const [remainingPitches, setRemainingPitches] = useState(0);  // 残り投球数（自動投球用）
  // 采配 state（打撃方針/守備シフト/盗塁/エンドラン/敬遠）を1箇所に集約。
  // 詳細は src/game/useGameStrategy.js 参照。
  const strategy = useGameStrategy();
  const {
    battingApproach, pitchAim, pitchTypeIndex,
    setBattingApproach, setPitchAim, setPitchTypeIndex,
    triggerSteal, triggerHitAndRun, triggerIntentionalWalk,
    battingApproachRef, pitchAimRef, pitchTypeIndexRef,
    batGuessType, batGuessZone, setBatGuessType, setBatGuessZone,
    batGuessTypeRef, batGuessZoneRef,
    forceStealRef, forceSwingRef, intentionalWalkRef,
  } = strategy;
  const [simMode, setSimMode] = useState(null); // 'out' | 'end' | null
  const outOccurredRef = React.useRef(false); // アウト発生フラグ
  // 打席ごとの配球メモリ（前球の位置・球速・引き出し）。自動シミュレーションと同じ
  // モデルを共有する（src/game/pitchSequence.js）。打者が変わったら作り直す。
  const pitchSeqRef = React.useRef({ key: null, seq: createSequence() });

  // --- 自責点（防御率）判定用 ---
  // 自動シミュと同じ追い方。(a) **失策で出塁した走者本人**（塁に置いた走者の
  // `onError`。塁を移っても値ごと動くので追随する）の生還と、
  // (b) 失策が無ければ既に3アウトだった後の得点 を非自責とする。
  // ⚠ かつては「失策で出塁した走者の在塁数」をイニング単位で数える近似で、
  //    誰が還ったかを見ていなかった（失策の走者が残塁して別の走者が還っても非自責になった）。
  // (b) の「免れたアウト数」だけはイニング単位で持つ（自動シミュの `inningErrorOuts` と同じ）。
  const inningErrorOutsRef = React.useRef(0);
  // イニング開始時に呼ぶ
  const resetEarnedRunTracking = () => {
    inningErrorOutsRef.current = 0;
  };
  // 失点のうち自責点となる数を返す。unearned は生還した走者のうち失策出塁だった数
  const takeEarnedRuns = (runs, currentOuts, unearned = 0) => {
    if (runs <= 0) return 0;
    if ((currentOuts + inningErrorOutsRef.current) >= 3) return 0; // (b) 想定3アウト後は全て非自責
    return Math.max(0, runs - unearned);                            // (a) 失策出塁の走者ぶん
  };
  // 犠飛・暴投・スクイズ等の失点を現在の投手の個人成績にも反映する。
  // （これらは従来ボックススコア用の集計にしか加算されておらず、
  //   個人の失点・防御率に載っていなかった）
  const recordRunsToCurrentPitcher = (runs, currentOuts, unearned = 0) => {
    if (runs <= 0) return;
    const p = getCurrentPitcher();
    if (!p) return;
    const defenseTeamType = isTopInning ? 'home' : 'away';
    const earned = takeEarnedRuns(runs, currentOuts, unearned);
    updatePitcherStats(p.id, defenseTeamType, {
      runsAllowed: runs,
      earnedRuns: earned,
    });
  };
  
  // チームシステム（ホーム vs アウェイ対戦機能）
  const [homeTeam, setHomeTeam] = useState({
    name: "",
    players: [],
    currentBatterOrder: 1
  });

  const [awayTeam, setAwayTeam] = useState({
    name: "",
    players: [],
    currentBatterOrder: 1
  });

  // TEAMS_DATAからチームデータを初期化（allTeamsを使用）
  useEffect(() => {
    if (TEAMS_DATA && allTeams.length >= 2) {
      const homeTeamName = allTeams[0];
      const awayTeamName = allTeams[1];
      const homeTeamData = TEAMS_DATA[homeTeamName];
      const awayTeamData = TEAMS_DATA[awayTeamName];

      if (homeTeamData && homeTeamData.players && homeTeamData.players.length > 0) {
        setHomeTeam({
          name: homeTeamName,
          players: homeTeamData.players.map(p => ({
            ...p,
            isStarter: (p.battingOrder > 0 && p.battingOrder <= 9) || (LEAGUE_SETTINGS.useDH && p.position === 'pitcher' && p._isStartingPitcher),
            hasSubbedOut: false,
            originalPosition: p.position
          })),
          currentBatterOrder: 1
        });
      }

      if (awayTeamData && awayTeamData.players && awayTeamData.players.length > 0) {
        setAwayTeam({
          name: awayTeamName,
          players: awayTeamData.players.map(p => ({
            ...p,
            isStarter: (p.battingOrder > 0 && p.battingOrder <= 9) || (LEAGUE_SETTINGS.useDH && p.position === 'pitcher' && p._isStartingPitcher),
            hasSubbedOut: false,
            originalPosition: p.position
          })),
          currentBatterOrder: 1
        });
      }
    }
  }, [allTeams]);
  
  
  // 選手成績更新関数（元の定義を維持）
  // ⚠ **増分を渡すこと**（`{ atBats: 1 }`）。以前は呼び出し側が「描画時点の値 + 1」を
  //    絶対値で渡しており、1球の中で2回更新すると後の更新が前を上書きしていた
  //    （併殺の2つ目のアウト・スクイズの走者と打者の2アウトが投手に付かなかった）。
  //    ここで state の最新値に足す
  const addDeltas = (base, deltas) => {
    const next = { ...(base || {}) };
    for (const [k, v] of Object.entries(deltas)) next[k] = (next[k] || 0) + (v || 0);
    return next;
  };
  const updateBatterStats = (playerId, teamType, statDeltas) => {
    const setTeam = teamType === 'home' ? setHomeTeam : setAwayTeam;
    setTeam(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.id === playerId
          ? {
              ...p,
              stats: { ...(p.stats || {}), batting: addDeltas(p.stats?.batting, statDeltas) },
              gameStats: addDeltas(p.gameStats, statDeltas)
            }
          : p
      )
    }));
  };

  const addAtBatResult = (playerId, teamType, label) => {
    const setTeam = teamType === 'home' ? setHomeTeam : setAwayTeam;
    setTeam(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.id === playerId
          ? { ...p, gameStats: { ...(p.gameStats || {}), atBatResults: [...(p.gameStats?.atBatResults || []), label] } }
          : p
      )
    }));
  };

  const updatePitcherStats = (playerId, teamType, statUpdates) => {   // 増分（上の⚠）
    const setTeam = teamType === 'home' ? setHomeTeam : setAwayTeam;
    setTeam(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.id === playerId
          ? { ...p, stats: { ...(p.stats || {}), pitching: addDeltas(p.stats?.pitching, statUpdates) } }
          : p
      )
    }));
  };

  // 打順変更関数（クリックベース）
  const handleBatterClick = (teamType, battingOrder) => {
    const setTeam = teamType === 'home' ? setHomeTeam : setAwayTeam;
    const selectedBatter = teamType === 'home' ? selectedBatterHome : selectedBatterAway;
    const setSelectedBatter = teamType === 'home' ? setSelectedBatterHome : setSelectedBatterAway;

    if (selectedBatter === null) {
      // 1人目を選択
      setSelectedBatter(battingOrder);
    } else if (selectedBatter === battingOrder) {
      // 同じ選手をクリック -> 選択解除
      setSelectedBatter(null);
    } else {
      // 2人目をクリック -> 打順のみ入れ替え（守備位置は選手に付いたまま）
      setTeam(prev => {
        const players = prev.players.map(p => {
          if (p.battingOrder === selectedBatter) {
            // player1: 打順のみ変更、守備位置はそのまま
            return { ...p, battingOrder: battingOrder };
          } else if (p.battingOrder === battingOrder) {
            // player2: 打順のみ変更、守備位置はそのまま
            return { ...p, battingOrder: selectedBatter };
          }
          return p;
        });

        return { ...prev, players };
      });
      setSelectedBatter(null);
    }
  };

  // 守備位置変更関数（クリックベース）
  const handlePositionClick = (teamType, playerId) => {
    const setTeam = teamType === 'home' ? setHomeTeam : setAwayTeam;
    const selectedPosition = teamType === 'home' ? selectedPositionHome : selectedPositionAway;
    const setSelectedPosition = teamType === 'home' ? setSelectedPositionHome : setSelectedPositionAway;

    if (selectedPosition === null) {
      // 1人目を選択
      setSelectedPosition(playerId);
    } else if (selectedPosition === playerId) {
      // 同じ選手をクリック -> 選択解除
      setSelectedPosition(null);
    } else {
      // 2人目をクリック -> 守備位置を入れ替え
      setTeam(prev => {
        const players = [...prev.players];
        const player1 = players.find(p => p.id === selectedPosition);
        const player2 = players.find(p => p.id === playerId);

        if (player1 && player2) {
          const tempPosition = player1.position;
          player1.position = player2.position;
          player2.position = tempPosition;
          // ⚠ DH は守備位置ではなく `_isDH` の印で持つ（position は本来の守備位置のまま）。
          //    印も入れ替えないと、DH と野手を入れ替えても表の上で何も変わらない
          const p1DH = !!player1._isDH;
          if (player2._isDH) player1._isDH = true; else delete player1._isDH;
          if (p1DH) player2._isDH = true; else delete player2._isDH;
        }

        return { ...prev, players };
      });
      setSelectedPosition(null);
    }
  };

  // 選手交代ハンドラー
  const handleSubstituteClick = (teamType, playerId) => {
    const setTeam = teamType === 'home' ? setHomeTeam : setAwayTeam;
    const team = teamType === 'home' ? homeTeam : awayTeam;
    const selectedSubstitute = teamType === 'home' ? selectedSubstituteHome : selectedSubstituteAway;
    const setSelectedSubstitute = teamType === 'home' ? setSelectedSubstituteHome : setSelectedSubstituteAway;

    // クリックされた選手を取得
    const clickedPlayer = team.players.find(p => p.id === playerId);

    // 試合中：交代済み選手は選択できない
    if (gameStarted && clickedPlayer && clickedPlayer.hasSubbedOut) {
      // 既に選択されている場合は解除
      if (selectedSubstitute !== null) {
        setSelectedSubstitute(null);
      }
      return;
    }

    if (selectedSubstitute === null) {
      // 最初の選手を選択
      setSelectedSubstitute(playerId);
    } else if (selectedSubstitute === playerId) {
      // 同じ選手をクリックしたらキャンセル
      setSelectedSubstitute(null);
    } else {
      // 2人目の選手をクリック：交代処理
      // まず現在のチーム状態から選手情報を取得して事前チェック
      const player1Current = team.players.find(p => p.id === selectedSubstitute);
      const player2Current = team.players.find(p => p.id === playerId);

      // 試合中：どちらかが交代済みなら処理しない
      if (gameStarted && (player1Current?.hasSubbedOut || player2Current?.hasSubbedOut)) {
        setSelectedSubstitute(null);
        return;
      }

      // 試合中：スタメン同士の打順変更は禁止（野球のルール）
      // ただし一方が投手、他方がリリーフ登録の野手なら二刀流交代を許可
      if (gameStarted && player1Current?.isStarter && player2Current?.isStarter) {
        const teamName = team.name;
        const pitcherRoles = TEAMS_DATA[teamName]?.pitchingRotation?.pitcherRoles || {};
        const RELIEF_ROLES = new Set(['closer', 'setup', 'ace_relief', 'onepoint', 'long', 'behind', 'mopup']);
        const p1IsPitcher = player1Current.position === 'pitcher';
        const p2IsPitcher = player2Current.position === 'pitcher';
        const p1HasReliefRole = RELIEF_ROLES.has(pitcherRoles[player1Current.id]);
        const p2HasReliefRole = RELIEF_ROLES.has(pitcherRoles[player2Current.id]);
        const isTwoWaySwap = (p1IsPitcher && !p2IsPitcher && p2HasReliefRole) ||
                             (p2IsPitcher && !p1IsPitcher && p1HasReliefRole);
        if (!isTwoWaySwap) {
          setSelectedSubstitute(null);
          return;
        }
      }

      setTeam(prev => {
        const players = prev.players.map(p => ({...p})); // ディープコピー
        const player1 = players.find(p => p.id === selectedSubstitute);
        const player2 = players.find(p => p.id === playerId);

        if (player1 && player2) {
          // 念のため再度チェック
          if (gameStarted && (player1.hasSubbedOut || player2.hasSubbedOut)) {
            return prev;
          }

          // スタメン同士の場合
          if (player1.isStarter && player2.isStarter) {
            // 試合中の二刀流リリーフ交代：野手→投手にポジションチェンジ
            if (gameStarted && (player1.position === 'pitcher' || player2.position === 'pitcher')) {
              const pitcher = player1.position === 'pitcher' ? player1 : player2;
              const fielder = player1.position === 'pitcher' ? player2 : player1;
              const oldFieldPos = fielder.position;
              const oldFieldOrder = fielder.battingOrder;
              const pitcherOldOrder = pitcher.battingOrder;

              pitcher.isStarter = false;
              pitcher.hasSubbedOut = true;
              pitcher.battingOrder = 0;
              pitcher.position = getBestFitPosition(pitcher);

              fielder.battingOrder = pitcherOldOrder;
              fielder.position = 'pitcher';

              // 空いた野手スロットにベンチから最適な野手を補充
              const benchFielders = players.filter(p =>
                !p.isStarter && !p.hasSubbedOut && p.position !== 'pitcher' && p.id !== fielder.id
              );
              if (benchFielders.length > 0) {
                benchFielders.sort((a, b) =>
                  (b.positionFitness?.[oldFieldPos] || 0) - (a.positionFitness?.[oldFieldPos] || 0)
                );
                const replacement = benchFielders[0];
                replacement.isStarter = true;
                replacement.battingOrder = oldFieldOrder;
                replacement.position = oldFieldPos;
              }

              // 投手スタミナリセット
              const isDefenseTeamChange = (teamType === 'home' && isTopInning) || (teamType === 'away' && !isTopInning);
              if (isDefenseTeamChange) {
                setTimeout(() => {
                  const maxSt = fielder.pitching?.stamina || 100;
                  const fat = fielder.fatigue || 0;
                  setCurrentStamina(Math.max(Math.floor(maxSt * 0.5), maxSt - fat));
                }, 0);
              }
            } else {
              // 試合前：打順のみ交換（守備位置はそのまま）
              const tempOrder = player1.battingOrder;
              player1.battingOrder = player2.battingOrder;
              player2.battingOrder = tempOrder;
            }
          }
          // スタメンと控えの場合：交代処理
          else {
            // スタメンフラグを交換
            const tempStarter = player1.isStarter;
            player1.isStarter = player2.isStarter;
            player2.isStarter = tempStarter;

            // 試合中：ベンチに下がった選手にフラグを設定
            if (gameStarted) {
              if (tempStarter) {
                // player1が元々スタメンだった → player1がベンチに下がった
                player1.hasSubbedOut = true;
              } else {
                // player2が元々スタメンだった → player2がベンチに下がった
                player2.hasSubbedOut = true;
              }
            }

            // スタメンと控えの交代：控えがスタメンの打順・ポジションを引き継ぐ
            if (tempStarter) {
              // player1がスタメンだった → player2がスタメンになる
              player2.battingOrder = player1.battingOrder;
              player2.position = player1.position;
              player1.battingOrder = 0;
              // ベンチに下がる選手の守備位置を最高適正ポジションに戻す
              player1.position = getBestFitPosition(player1);
            } else {
              // player2がスタメンだった → player1がスタメンになる
              player1.battingOrder = player2.battingOrder;
              player1.position = player2.position;
              player2.battingOrder = 0;
              // ベンチに下がる選手の守備位置を最高適正ポジションに戻す
              player2.position = getBestFitPosition(player2);
            }

            // 試合中：投手交代の場合はスタミナをリセット
            if (gameStarted) {
              const defenseTeam = isTopInning ? homeTeam : awayTeam;
              const isDefenseTeamChange = (teamType === 'home' && isTopInning) || (teamType === 'away' && !isTopInning);

              if (isDefenseTeamChange) {
                // 守備チームの交代で、投手が交代した場合
                const newPitcher = tempStarter ? player2 : player1; // スタメンになった選手
                if (newPitcher.position === 'pitcher') {
                  // 新しい投手のスタミナにリセット（疲労考慮、setTeamの後に実行される）
                  setTimeout(() => {
                    const maxSt = newPitcher.pitching.stamina;
                    const fat = newPitcher.fatigue || 0;
                    setCurrentStamina(Math.max(Math.floor(maxSt * 0.5), maxSt - fat));
                  }, 0);
                }
              }
            }
          }
        }
        return { ...prev, players };
      });
      setSelectedSubstitute(null);
    }
  };

  // 現在の打者・投手・捕手管理（対戦モード対応）
  
  // 攻撃チームを取得
  const getOffenseTeam = () => isTopInning ? awayTeam : homeTeam;
  const getDefenseTeam = () => isTopInning ? homeTeam : awayTeam;
  
  // 現在の打順を取得
  const currentBatterOrder = isTopInning ? awayTeam.currentBatterOrder : homeTeam.currentBatterOrder;
  
  // 現在の打者を取得（攻撃チームから）
  const getCurrentBatter = () => {
    const team = getOffenseTeam();
    return team.players.find(p => p.battingOrder === team.currentBatterOrder) || team.players[0];
  };
  
  // 打者を塁に置くときの走者（誰が塁に居るかを識別する。baseState.js）
  const batterAsRunner = (onError = false) => makeRunner(getCurrentBatter(), isTopInning ? 'away' : 'home', onError);

  // 現在の投手を取得（守備チームから）
  const getCurrentPitcher = () => {
    const team = getDefenseTeam();
    return team.players.find(p => p.isStarter && p.position === 'pitcher') || team.players[8];
  };

  // 現在の捕手を取得（守備チームから）
  const getCurrentCatcher = () => {
    const team = getDefenseTeam();
    return team.players.find(p => p.isStarter && p.position === 'catcher' && !p._isDH) || team.players[7];
  };

  // CPU の采配（代打・守備固め・継投）は自動の試合と同じ決まり（cpuTactics.js）。
  // 帳簿（救援の記録・先発のダメージ・投手ごとのスタミナ）は1試合のあいだこの ref に持つ。
  // ⚠ 以前は aiManager.js の別の決まりで、「おまかせ」を切ると CPU の球団まで
  //    一度も投手を代えなかった。いまは CPU の球団はいつも、自分の球団は「おまかせ」のときだけ
  const tacticsMemoryRef = useRef(createManagedTacticsMemory());
  // 投げる前に CPU の采配を走らせる。交代があれば true（その球は投げずに交代だけを反映する）
  const applyCpuTactics = () => {
    const { changed, updates, messages } = runManagedTactics({
      memory: tacticsMemoryRef.current, homeTeam, awayTeam, inning, isTopInning, outs, score, bases,
      controls: {
        home: homeTeam.name !== userTeamName || autoManagerMode,
        away: awayTeam.name !== userTeamName || autoManagerMode,
      },
    });
    const patch = (map) => (prev) => (map.size === 0 ? prev : {
      ...prev,
      players: prev.players.map(p => (map.has(p.id) ? { ...p, ...map.get(p.id) } : p)),
    });
    if (updates.home.size) setHomeTeam(patch(updates.home));
    if (updates.away.size) setAwayTeam(patch(updates.away));
    if (messages.length) {
      setGameLog(prev => {
        const updated = [...prev, ...messages.map(description => ({ description, isSpecial: true }))];
        return updated.length > 50 ? updated.slice(-50) : updated;
      });
    }
    return changed;
  };

  // 次の打者に進む（攻撃チームの打順を進める）
  const advanceBatter = () => {
    if (isTopInning) {
      setAwayTeam(prev => ({
        ...prev,
        currentBatterOrder: prev.currentBatterOrder >= 9 ? 1 : prev.currentBatterOrder + 1
      }));
    } else {
      setHomeTeam(prev => ({
        ...prev,
        currentBatterOrder: prev.currentBatterOrder >= 9 ? 1 : prev.currentBatterOrder + 1
      }));
    }
  };
  
  // 現在のスタミナを管理
  const [currentStamina, setCurrentStamina] = useState(200);

  const [gameLog, setGameLog] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  const [isAutoSimulating, setIsAutoSimulating] = useState(false);
  
  
  // ⚠ ここに **打者・投手・捕手の成績3種**（batterStats / pitcherStats /
  //    catcherStats）の useState が31行あったが、**書き込み52箇所・読み出し0**で
  //    一度も描画されていなかったので除去した。1球ごとに setState していたので、
  //    誰も見ないデータのために再描画コストだけ払っていたことになる
  //    （`lastGameResults` / 打球統計4種 と同じ defect。これで3度目）。
  //    ⚠ 選手ごとの成績は `updateBatterStats` / `updatePitcherStats`（別物・現役）が
  //    `player.stats` に積んでおり、画面もシーズン集計もそちらを読む。
  //
  // ⚠ ここに打球統計4種（battedBallStats / …Type / …Direction / …Area）の
  //    useState が58行あったが、**一度も描画されていなかった**ので除去した。
  //    2つは打球のたびに setState していて、誰も見ないデータのために
  //    再描画コストだけ払っていた（`lastGameResults` と同じ defect）。
  //    リセット側（gameControls.js）にも同じ形が52行あり、二重定義でもあった。
  //    復活させるなら**描く場所を先に決めてから**にすること。

  // [SECTION: GAME_HANDLERS] 投球生成・接触判定・走者進塁・守備記録・成績更新
  // 1球の計算は自動の試合と同じもの（src/game/pitchEngine.js）を使う。
  // ⚠ 以前は采配の試合だけ別の写し（simulateSinglePitch）を持っていて、
  //    スタミナの効き方・カウントの補正・守備の値・打者の疲労と方針が
  //    自動の試合と食い違っていた（2026-11-24 に自動の側へそろえた）。
  //    ここでは人の指示（球種・コース・狙い球・打撃の指示・エンドラン）を渡し、
  //    答えを画面の投球ログの形に直すだけにする。
  const simulatePitch = () => {
    const currentBatter = getCurrentBatter();
    const currentPitcher = getCurrentPitcher();
    const currentCatcher = getCurrentCatcher();
    const defenseTeam = getDefenseTeam();
    const offenseTeam = isTopInning ? awayTeam : homeTeam;
    const userIsBatting = offenseTeam.name === userTeamName;
    const userIsPitching = defenseTeam.name === userTeamName;

    // 打席ごとの配球メモリ。打者が変わったらリセットする
    const seqKey = `${currentBatter.id}-${currentBatter.name}`;
    if (pitchSeqRef.current.key !== seqKey) {
      pitchSeqRef.current = { key: seqKey, seq: createSequence() };
    }

    const pitchArsenal = pitchArsenalOf(currentPitcher);
    const typeIndex = pitchTypeIndexRef.current;
    const aimChoice = pitchAimRef.current;
    const approach = battingApproachRef.current;
    const control = {
      // 守っているときだけ人が球種・コースを選べる（'auto' は捕手のリード）
      pitchIndex: userIsPitching && typeIndex !== 'auto' && pitchArsenal.arsenal[typeIndex] ? Number(typeIndex) : null,
      aim: userIsPitching && aimChoice && aimChoice !== 'auto' ? aimChoice : null,
      // 攻めているときだけ人が狙い球と打撃の指示を出せる
      guessType: userIsBatting ? batGuessTypeRef.current : 'auto',
      guessZone: userIsBatting ? batGuessZoneRef.current : 'auto',
      swingMult: userIsBatting ? (approach === 'take' ? 0.55 : approach === 'aggressive' ? 1.3 : 1.0) : null,
      // 「普通」は指示なし（球団の打撃方針 strategy.batting がそのまま効く。自動の試合と同じ）
      approach: userIsBatting && approach !== 'normal' ? approach : null,
      // エンドランは打者を必ず打ちにいかせる
      swingFloor: forceSwingRef.current ? 0.92 : null,
    };
    // 塁は走者の要約（baseState.js）。1球の計算は走者の足を physical.speed で読む
    const pitchBases = bases.map(b => (b ? { physical: { speed: runnerOf(b)?.speed ?? 55 } } : false));

    const { result: r, info } = simulateEnginePitch({
      batterPlayer: currentBatter, pitcherPlayer: currentPitcher, catcherPlayer: currentCatcher,
      defense: fieldDefenseOf(defenseTeam, currentPitcher),
      count: count || { balls: 0, strikes: 0 }, pitcherStamina: staminaOf(tacticsMemoryRef.current, currentPitcher),
      bases: pitchBases, outs, sequence: pitchSeqRef.current.seq,
      offenseStrategy: offenseTeam.strategy, defenseStrategy: defenseTeam.strategy,
      pitchArsenal, control,
    });
    // スタミナを1減らす（自動の試合と同じく、投げた後に減る。投手ごとに持つ）
    {
      const left = Math.max(0, staminaOf(tacticsMemoryRef.current, currentPitcher) - 1);
      setStamina(tacticsMemoryRef.current, currentPitcher, left);
      setCurrentStamina(left);
    }

    const pitchType = info.pitch?.type || 'straight';
    const velocity = Math.round(info.velocity || 0);
    // 投球位置（試合画面のコース表示用）。セル内のどこに来たかは描画時に
    // 揺らすのではなく**ここで一度だけ決める**。再レンダリングのたびに点が動くため
    const loc = info.loc || {};
    const pitchLoc = {
      col: loc.col, row: loc.row, inZone: loc.inZone, quality: loc.quality,
      // 表示のマーカー形状は球種で決まるので、生のキーを持たせる
      type: pitchType,
      jx: Math.random(), jy: Math.random(),
    };
    if (info.swung) pitchLoc.swing = swingPowerLabel(info.swingPower);
    const contact = info.contact || {};
    const strikes = (count || {}).strikes || 0;
    const description = (() => {
      switch (r.type) {
        case 'ball': return 'ボール';
        case 'called_strike': return '見逃しストライク';
        case 'swinging_strike':
          if (!loc.inZone) return '空振り（ボール球）';
          return info.timingWindow != null
            ? `空振り（窓${info.timingWindow.toFixed(1)}ms/誤差${info.timingError.toFixed(1)}ms）` : '空振り';
        case 'foul': return 'ファウル';
        case 'double_play': return `${contact.description || 'ゴロ'}（併殺打）`;
        default: return contact.description || '';
      }
    })();
    // 死球は疲労が大きく溜まる。隠れたコストにしないよう投球ログにも出す
    const hbpFatigue = r.type === 'hit_by_pitch'
      ? hitByPitchFatigue(r.velocity, currentBatter.physical?.bodyStamina ?? 50) : undefined;
    return {
      ...r,
      // 2ストライクからのファウルはカウントが進まない（投球の処理が type で分ける）
      type: r.type === 'foul' && strikes >= 2 ? 'foul_2strike' : r.type,
      description: r.type === 'hit_by_pitch' ? `死球（疲労+${hbpFatigue}）` : description,
      hbpFatigue,
      hit: ['single', 'double', 'triple', 'homerun'].includes(r.type),
      pitchType: ballEffects[pitchType]?.name || 'ストレート',
      velocity, pitchLoc,
      isBallZone: loc.inZone === false && !!info.contact,
      exitVelocity: contact.exitVelocity, launchAngle: contact.launchAngle,
      distance: contact.distance, meetQuality: contact.meetQuality,
      timingWindow: info.timingWindow, timingError: info.timingError,
    };
  };

  // 守備成績（守備機会＝刺殺+補殺 / 失策）を記録する。
  // ⚠ **采配モードには従来これが一切なかった**。自動シミュ（スキップ）だけが
  //    記録しており、自分で采配した試合の守備成績が誰にも付かなかった。
  const recordFielding = (position, { chance = 0, error = 0, assist = 0 } = {}) => {
    if (!position) return;
    const defenseTeamType = isTopInning ? 'home' : 'away';
    const setTeam = defenseTeamType === 'home' ? setHomeTeam : setAwayTeam;
    setTeam(prev => ({
      ...prev,
      players: prev.players.map(p => {
        if (p.position !== position || !(p.battingOrder > 0)) return p;
        const g = p.gameStats || {};
        return { ...p, gameStats: {
          ...g,
          fieldingChances: (g.fieldingChances || 0) + chance + error,
          fieldErrors: (g.fieldErrors || 0) + error,
          assists: (g.assists || 0) + assist,
        } };
      }),
    }));
  };

  const advanceRunners = (hitType, fieldingPosition = null, isError = false, extraAdvance = false) => {
    const newBases = [false, false, false];
    let runsScored = 0;
    let unearnedScored = 0;   // 生還した走者のうち失策で出塁していた数（自責点の判定）

    if (hitType === 'homerun') {
      runsScored = 1 + bases.filter(b => b).length;
      unearnedScored = bases.reduce((n, b) => n + (isUnearnedRunner(b) ? 1 : 0), 0) + (isError ? 1 : 0);
      // setBases([false, false, false]); ← 削除
      return { bases: [false, false, false], runsScored, unearnedScored };
    }
    
    const advancement = hitType === 'single' ? 1 : hitType === 'double' ? 2 : 3;

    // 積極進塁の判定に使う守備値。走者の足は塁に置いた走者本人のもの
    // （識別できない旧形式の `true` だけ攻撃側の平均で近似する）
    const defTeam = getDefenseTeam();
    const def = {};
    defTeam.players.forEach(p => { if (p.battingOrder >= 1) def[p.position] = p; });
    const ofArms = ['left', 'center', 'right'].map(p => def?.[p]?.physical?.arm ?? 60);
    const avgArm = ofArms.reduce((a, b) => a + b, 0) / 3;
    const offense = isTopInning ? awayTeam : homeTeam;
    const starters = offense.players.filter(p => p.battingOrder > 0 && p.battingOrder <= 9);
    const avgSpeed = starters.length
      ? starters.reduce((sum, p) => sum + (p.physical?.speed ?? 55), 0) / starters.length : 55;
    let outsFromThrow = 0;

    for (let i = 2; i >= 0; i--) {
      if (bases[i]) {
        let newBase = i + advancement;
        // 積極進塁（単打で 2塁→本塁 / 1塁→3塁、二塁打で 1塁→本塁）。
        // 自動シミュレーションと同じ判定を共有する（baserunning.js）。
        if (extraAdvance) {
          // 中継ミス: 送球が乱れているので走者が余分に1つ進む（自動試合と同じ）
          newBase++;
        } else if (outsFromThrow === 0 && !(newBase + 1 < 3 && newBases[newBase + 1])) {
          // ⚠ 先を走る走者がその先の塁に止まっていたら狙わない（自動試合と同じ。以前は狙って
          //    刺されることがあった）
          // 打球を処理した野手の肩で判定する（自動シミュと同じ）。
          // avgArm だけだと「強肩の外野手を置く」意味が出ない
          const thrower = fieldingPosition ? def?.[fieldingPosition] : null;
          const { attempt, thrownOut } = tryExtraAdvance({
            hitType, fromBase: i, runnerSpeed: runnerOf(bases[i])?.speed ?? avgSpeed, avgArm,
            throwerArm: thrower?.physical?.arm ?? null,
            currentOuts: outs, cutoffDefense: def?.short?.fielding?.defense ?? 60,
          });
          if (attempt && thrownOut) {
            outsFromThrow++;
            recordFielding(fieldingPosition, { chance: 1, assist: 1 });   // 捕殺
            continue;
          }
          if (attempt) newBase++;
        }
        if (newBase >= 3) {
          runsScored++;
          if (isUnearnedRunner(bases[i])) unearnedScored++;
        } else {
          newBases[newBase] = bases[i];
        }
      }
    }
    
    // 打者自身を塁に置く（三塁打は三塁に残る。本塁打は別の道で処理する。
    // 以前は `advancement < 3` で分けていたので、三塁打の打者が必ず生還していた）
    newBases[advancement - 1] = batterAsRunner(isError);

    // setBases(newBases); ← 削除
    return { bases: newBases, runsScored, unearnedScored, outsMade: outsFromThrow };
  };

  // [SECTION: THROW_PITCH] throwPitch（投球シミュレーション本体）
  const throwPitch = () => {
    // ガード: countがundefinedの場合は早期リターン
    if (!count || count.balls === undefined) {
      console.warn('count is not ready');
      return;
    }

    // 采配フラグを 1 球分だけ有効。値は先にスナップショット、消費（= false に戻す）は
    // simulatePitch() 呼び出し後 (strategy.consumeOneShot()) に行う。
    // 理由: simulatePitch は forceSwingRef.current を直接参照するので、
    //       呼び出し時点ではまだ true のまま残っていないといけない。
    const strat = strategy.snapshot();
    const doForceSteal = strat.forceSteal;
    const doIntentionalWalk = strat.intentionalWalk;

    // CPU の采配（打席の頭の代打・継投、半イニングの後の継投・守備固め）。
    // 交代したらこの球は投げない（次の球は交代した後の選手で投げる）
    if (count.balls === 0 && count.strikes === 0 && applyCpuTactics()) return;

    // 現在の選手データを取得（チーム対応）
    const currentBatter = getCurrentBatter();
    const currentPitcher = getCurrentPitcher();
    const currentCatcher = getCurrentCatcher();
    const defenseTeam = getDefenseTeam();
    
    // コンディション補正
    const bCondMod = conditionBattingMod(currentBatter.condition);
    const pCondMod = CONDITION_PITCHING_MODIFIER[currentPitcher.condition ?? CONDITION_LEVELS.NORMAL] || 0;

    // ローカル変数として展開
    const batter = {
      name: currentBatter.name,
      meet: currentBatter.batting.meet + bCondMod.meet,
      power: currentBatter.batting.power + bCondMod.power,
      eye: currentBatter.batting.eye,
      speed: currentBatter.physical.speed,
      steal: currentBatter.batting.steal,
      bunt: currentBatter.batting?.bunt || 30,
      bats: currentBatter.batting.bats
    };

    const pitcher = {
      name: currentPitcher.name,
      velocity: currentPitcher.pitching.velocity,
      control: currentPitcher.pitching.control + pCondMod,
      stamina: currentPitcher.pitching.stamina,
      throws: currentPitcher.physical.throws,
      // 封印した球は投げない（arsenal.js）。回転数を変化量へ織り込む
      // （ここで一度だけ。simulation-logic.js の getEffectiveBreakLevel 参照）
      pitches: spinAdjustedArsenal(activeArsenal(currentPitcher.pitching.arsenal),
        currentPitcher.pitching.spinRate ?? 50),
      form: currentPitcher.pitching.form,
      spinRate: currentPitcher.pitching.spinRate ?? 50,
      // 球の出どころの見づらさ（deception.js）。-1=丸見え 〜 +1=見えない
      deception: deceptionAxis(getDeception(currentPitcher))
    };
    
    
    // 守備データ（自動の試合と同じ作り。出場中の野手とマウンドの投手だけ）
    const defense = fieldDefenseOf(defenseTeam, currentPitcher);

    let result = simulatePitch();
    // simulatePitch が読み終わったので采配のワンショットフラグを消費
    strategy.consumeOneShot();
    // 采配: 敬遠指示があればこの1球で四球にする（ボール扱い）
    if (doIntentionalWalk) {
      result = { type: 'ball', description: '敬遠', pitchType: '—', velocity: 0 };
    }
    // 【守備シフトは廃止】打球方向モデル（段階5）を作った後も、シフトは
    // 「単打の35%をアウトに書き換える」後付け処理のままで整合していなかった。
    // 守備は全て基本配置とする。
    
    // 投手成績の更新
    
    // 投手個別の投球数を更新
    {
      const currentPitcherPlayer = getCurrentPitcher();
      const defenseTeamType = isTopInning ? 'home' : 'away';
      updatePitcherStats(currentPitcherPlayer.id, defenseTeamType, {
        pitches: 1
      });
    }
    
    setGameLog(prev => {
      const updated = [...prev, {
        inning,
        isTop: isTopInning,
        count: { ...count },
        result: result.description,
        pitchType: result.pitchType,
        velocity: result.velocity,
        // コース表示用。paKey は打席の識別子（打者が変わったら描き直す）
        pitchLoc: result.pitchLoc,
        resultType: result.type,
        paKey: pitchSeqRef.current.key,
        // 打球物理データ（インプレー時のみ）
        exitVelocity: result.exitVelocity,
        launchAngle: result.launchAngle,
        distance: result.distance,
        meetQuality: result.meetQuality,
        bases: asFlags(bases),
        outs
      }];
      // 最新50球のみ保持（パフォーマンス最適化）
      return updated.length > 50 ? updated.slice(-50) : updated;
    });
    setLastResult(result);
    
    let newCount = { ...count };
    let newOuts = outs;
    let newBases = [...bases];
    let newScore = { ...score };
    let atBatOver = false;
    
    switch (result.type) {
      case 'ball':
        newCount.balls++;
        // 敬遠: この1球で四球成立させる
        if (doIntentionalWalk) { newCount.balls = 4; }
        if (newCount.balls === 4) {
          // 打者成績: 四球
          
          // 選手個別成績を更新
          {
            const currentBatterPlayer = getCurrentBatter();
            const currentPitcherPlayer = getCurrentPitcher();
            const offenseTeamType = isTopInning ? 'away' : 'home';
            const defenseTeamType = isTopInning ? 'home' : 'away';
            
            updateBatterStats(currentBatterPlayer.id, offenseTeamType, {
              walks: 1
            });
            
            updatePitcherStats(currentPitcherPlayer.id, defenseTeamType, {
              walks: 1
            });
          }
          
          if (bases[0] && bases[1] && bases[2]) {
            const run = 1;
            isTopInning ? newScore.away++ : newScore.home++;
            
            // 押し出し: 投手の失点（自責の判定込み）と打者の打点。
            // ⚠ 以前は失点だけ足して自責点に入らず、打点も付いていなかった
            recordRunsToCurrentPitcher(1, outs, unearnedAt(bases, 2));
            updateBatterStats(getCurrentBatter().id, isTopInning ? 'away' : 'home', { rbis: 1 });
          } else {
            newBases = forceAdvance(bases, batterAsRunner()).bases;
          }
          atBatOver = true;
          addAtBatResult(getCurrentBatter().id, isTopInning ? 'away' : 'home', '四球');
        }
        break;
      case 'hit_by_pitch': {
        // 死球。四球と同じ押し出し進塁だが、打数にも四球にも計上しない
        {
          const b = getCurrentBatter();
          const pi = getCurrentPitcher();
          // 故障は作らないが、**疲労は大きく溜まる**（速い球ほど・体力が無いほど）
          updateBatterStats(b.id, isTopInning ? 'away' : 'home', {
            hitByPitch: 1,
            hbpFatigue: (result.hbpFatigue || 0)
          });
          updatePitcherStats(pi.id, isTopInning ? 'home' : 'away', {
            hitBatters: 1
          });
        }
        if (bases[0] && bases[1] && bases[2]) {
          isTopInning ? newScore.away++ : newScore.home++;
          recordRunsToCurrentPitcher(1, outs, unearnedAt(bases, 2));   // 押し出し（自責の判定込み）
          updateBatterStats(getCurrentBatter().id, isTopInning ? 'away' : 'home', { rbis: 1 });
        } else {
          newBases = forceAdvance(bases, batterAsRunner()).bases;
        }
        atBatOver = true;
        addAtBatResult(getCurrentBatter().id, isTopInning ? 'away' : 'home', '死球');
        break;
      }
      case 'called_strike':
      case 'swinging_strike':
        newCount.strikes++;
        if (newCount.strikes === 3) {
          // 打者成績: 三振
          
          // 選手個別成績を更新
          {
            const currentBatterPlayer = getCurrentBatter();
            const currentPitcherPlayer = getCurrentPitcher();
            const offenseTeamType = isTopInning ? 'away' : 'home';
            const defenseTeamType = isTopInning ? 'home' : 'away';
            
            updateBatterStats(currentBatterPlayer.id, offenseTeamType, {
              atBats: 1,
              strikeouts: 1
            });
            
            updatePitcherStats(currentPitcherPlayer.id, defenseTeamType, {
              outs: 1,
              strikeouts: 1
            });
          }
          
          newOuts++;
          atBatOver = true;
          recordFielding('catcher', { chance: 1 });   // 三振は捕手の刺殺
          addAtBatResult(getCurrentBatter().id, isTopInning ? 'away' : 'home', '三振');
        }
        break;
      case 'double_play':
        // 併殺打（自動の試合と同じ処理。判定は1球の計算 pitchEngine.js が行う）。
        // 一塁でのアウトの刺殺を記録する
        recordFielding('first', { chance: 1 });
        newOuts += 2;  // 2アウト追加
        newBases[0] = false;  // 一塁ランナー消える
        atBatOver = true;
        // 打数と投手の2アウト（以前はどちらも記録されていなかった）
        updateBatterStats(getCurrentBatter().id, isTopInning ? 'away' : 'home', { atBats: 1 });
        updatePitcherStats(getCurrentPitcher().id, isTopInning ? 'home' : 'away', { outs: 2 });
        addAtBatResult(getCurrentBatter().id, isTopInning ? 'away' : 'home', '併殺');
        break;
      case 'foul':
        newCount.strikes++;
        break;
      case 'single':
      case 'double':
      case 'triple':
      case 'homerun':
        // 失策での出塁は「安打」ではない（打数のみ加算）。
        // ⚠ 中継ミス（hitWithError）は安打のあとの失策なので、打者は安打で出塁している
        const reachedOnError = !!result.isError && !result.hitWithError;
        const { bases: updatedBases, runsScored: runs, unearnedScored = 0, outsMade: throwOuts = 0 } = advanceRunners(result.type, result.fieldingPosition, reachedOnError, !!result.extraAdvance);
        
        // 打者成績: ヒット
        const bases_earned = result.type === 'single' ? 1 : result.type === 'double' ? 2 : result.type === 'triple' ? 3 : 4;
        
        // 選手個別成績を更新
        {
          const currentBatterPlayer = getCurrentBatter();
          const currentPitcherPlayer = getCurrentPitcher();
          const offenseTeamType = isTopInning ? 'away' : 'home';
          const defenseTeamType = isTopInning ? 'home' : 'away';
          
          updateBatterStats(currentBatterPlayer.id, offenseTeamType, {
            atBats: 1,
            hits: (reachedOnError ? 0 : 1),
            doubles: (!reachedOnError && result.type === 'double' ? 1 : 0),
            triples: (!reachedOnError && result.type === 'triple' ? 1 : 0),
            homeruns: (!reachedOnError && result.type === 'homerun' ? 1 : 0),
            // 失策による得点には打点が付かない
            rbis: (reachedOnError ? 0 : runs)
          });
          
          // 失策が無ければアウトだったので「免れたアウト」を+1（走者本人の印は
          // advanceRunners が batterAsRunner(isError) で塁に持たせている）
          if (reachedOnError) inningErrorOutsRef.current++;
          const earned = takeEarnedRuns(runs, outs, unearnedScored);
          // ⚠ 被安打・被本塁打は以前一度も記録していなかった（采配した試合だけ被安打0）。
          //    積極進塁で刺した走者のアウトも投手の投球回に入る
          updatePitcherStats(currentPitcherPlayer.id, defenseTeamType, {
            runsAllowed: runs,
            earnedRuns: earned,
            hits: reachedOnError ? 0 : 1,
            homeruns: (!reachedOnError && result.type === 'homerun') ? 1 : 0,
            outs: throwOuts,
          });
        }
        
        // チーム別安打・打点をカウント（エラーの場合はエラーもカウント）
    // ⚠ 失策での出塁は安打ではない（チームの安打数にも数えない）
    if (isTopInning) {
      if (!reachedOnError) setTeamHits(prev => ({ ...prev, away: prev.away + 1 }));
      if (result.isError) {
        setTeamErrors(prev => ({ ...prev, home: prev.home + 1 }));
        recordFielding(result.errorPosition, { error: 1 });
      }
    } else {
      if (!reachedOnError) setTeamHits(prev => ({ ...prev, home: prev.home + 1 }));
      if (result.isError) {
        setTeamErrors(prev => ({ ...prev, away: prev.away + 1 }));
        recordFielding(result.errorPosition, { error: 1 });
      }
    }
    
    
    isTopInning ? (newScore.away += runs) : (newScore.home += runs);
    newBases = updatedBases;
    // 捕殺: 積極進塁を狙って刺された走者はアウトになる
    if (throwOuts > 0) {
      newOuts += throwOuts;
    }
    atBatOver = true;
    {
      const hitLabel = reachedOnError ? '失策'
        : result.type === 'homerun' ? '本塁打' : result.type === 'triple' ? '三塁打' : result.type === 'double' ? '二塁打' : '安打';
      addAtBatResult(getCurrentBatter().id, isTopInning ? 'away' : 'home', hitLabel);
    }
    break;
  case 'out':
    // 打者成績: アウト
    
    // 選手個別成績を更新
        {
          const currentBatterPlayer = getCurrentBatter();
          const currentPitcherPlayer = getCurrentPitcher();
          const offenseTeamType = isTopInning ? 'away' : 'home';
          const defenseTeamType = isTopInning ? 'home' : 'away';
          
          updateBatterStats(currentBatterPlayer.id, offenseTeamType, {
            atBats: 1
          });
          
          updatePitcherStats(currentPitcherPlayer.id, defenseTeamType, {
            outs: 1
          });
        }
        
        newOuts++;

        // 守備機会（刺殺・補殺）。内野ゴロは「捕った野手の補殺＋一塁手の刺殺」
        recordFielding(result.fieldingPosition, { chance: 1 });
        if (result.isGroundOut && result.fieldingPosition && result.fieldingPosition !== 'first') {
          recordFielding('first', { chance: 1 });
        }

        // 併殺打は1球の計算（pitchEngine.js）が 'double_play' として返す。
        // ⚠ 以前はここで采配の試合だけの写しの判定をしていた

        // 内野ゴロでの走者進塁（ゴロGO・進塁打）。詳細は baserunning.js 参照
    if (result.isGroundOut && !result.isOutfieldFly && newOuts < 3) {
      const dt = getDefenseTeam();
      const infPos = ['first', 'second', 'third', 'short'];
      const infVals = infPos.map(pos => {
        const pl = dt.players.find(p => p.position === pos && p.battingOrder >= 1 && !p._isDH);
        return pl?.fielding?.defense ?? 50;
      });
      const adv = resolveGroundOutAdvance({
        hasThird: !!newBases[2], hasSecond: !!newBases[1],
        infieldDefense: infVals.reduce((a, b) => a + b, 0) / infVals.length,
      });
      if (adv.scoreFromThird) {
        const unearned = unearnedAt(newBases, 2);   // ⚠ 塁を空ける前に読む
        newBases[2] = false;
        if (isTopInning) newScore.away++; else newScore.home++;
        recordRunsToCurrentPitcher(1, outs, unearned);
        // 内野ゴロの間の生還は打点（併殺の場合は付かない）
        updateBatterStats(getCurrentBatter().id, isTopInning ? 'away' : 'home', { rbis: 1 });
        setLastResult({ ...result, description: (result.description || 'アウト') + '（進塁打）' });
      }
      if (adv.secondToThird) { newBases[2] = newBases[1]; newBases[1] = false; }
    }

        // タッチアップ判定（外野フライのみ）
    if (result.isOutfieldFly && newOuts < 3) {
      const throwbackChance = result.tagupThrowbackChance || 0;
      // 走者の速さは塁に居る走者本人のもの（識別できない旧形式は打者で近似）
      const tagupSpeed = (at) => (runnerOf(newBases[at])?.speed ?? batter.speed) / 100;

      // 三塁ランナーがいる場合（ホーム進塁）
      if (newBases[2]) {
        const tagupSuccess = Math.random() > (throwbackChance - tagupSpeed(2) * 0.3);
        if (tagupSuccess) {
          // ⚠ newScore に足すこと。`setScore(prev => …)` は投球の最後の
          //    `setScore(newScore)` に上書きされ、犠飛の得点がスコアから消えていた
          //    （投手の失点にだけ入り、犠飛でのサヨナラも成立しなかった）
          if (isTopInning) newScore.away++; else newScore.home++;
          recordRunsToCurrentPitcher(1, outs, unearnedAt(newBases, 2));
          updateBatterStats(getCurrentBatter().id, isTopInning ? 'away' : 'home', { rbis: 1 });
          newBases[2] = false;
          setLastResult({ ...result, description: result.description + '（犠牲フライ）' });
        }
      }
      
      // 二塁ランナーの三塁進塁（三塁が空いている深いフライのみ）。
      // 以前は1塁走者まで無条件にタッグアップさせており、自動シミュレーション
      // （2塁走者のみ・確率0.4基準）より大幅に走者が進んでいた。
      if (newBases[1] && !newBases[2] && newOuts < 3) {
        if (Math.random() < 0.4 - throwbackChance * 0.5 + tagupSpeed(1) * 0.15) {
          newBases[2] = newBases[1];
          newBases[1] = false;
        }
      }
    }
    
    atBatOver = true;
    {
    // スコアブックと同じ表記にする（遊ゴロ / 中飛 / 右直）。
    // 元は description から「アウト」を削るだけで、ゴロは3文字・
    // ライナーは4文字・フライは3文字とバラバラだった
    const desc = result.description || '';
    const pc = POSITION_NAMES[result.fieldingPosition] || '';
    const outLabel = desc.includes('ゴロ') ? (desc.replace('アウト', '') || 'ゴロ')
      : desc.includes('ライナー') ? (pc ? `${pc}直` : '直線')
      : desc.includes('フライ') ? (pc ? `${pc}飛` : '飛球')
      : (desc.replace('アウト', '').replace('（ポップフライ）', '') || 'アウト');
    addAtBatResult(getCurrentBatter().id, isTopInning ? 'away' : 'home', outLabel);
    }
    break;
}

// ワイルドピッチ/パスボール判定
if (!atBatOver && newOuts < 3 && (bases[0] || bases[1] || bases[2])) {
  const pitcherControl = pitcher.control / 100;
  const catcherDefense = (defense.catcher?.defense ?? 50) / 100;
  const velocity = result.velocity || pitcher.velocity;
  
  // 基本発生率（制球力で変動）
  const baseWildPitchRate = (1 - pitcherControl) * 0.025;
  
  // 球速ボーナス（140km/h以上で影響）
  const velocityFactor = Math.max(0, (velocity - 140) / 100);
  
  // 捕手守備力で軽減
  const catcherReduction = catcherDefense * 0.5;
  
  // 最終発生率
      const wildPitchRate = baseWildPitchRate * (1 + velocityFactor) * (1 - catcherReduction);
      
      if (Math.random() < wildPitchRate) {
        // ãƒ¯ã‚¤ãƒ«ãƒ‰ãƒ”ãƒƒãƒç™ºç”Ÿ
        
        const catcherArm = (defense.catcher?.arm ?? 50) / 100;
        // 刺されるかは走る走者本人の足で決まる（識別できない旧形式は打者で近似）
        const throwoutChance = (at) =>
          Math.max(0, catcherArm * 0.40 - (runnerOf(newBases[at])?.speed ?? batter.speed) / 100 * 0.20);
        
        let wpDescription = '💥 ワイルドピッチ！';
        
        // 三塁→ホーム
        if (newBases[2]) {
          if (Math.random() < throwoutChance(2)) {
            wpDescription += ' 🛡️ 捕手が三塁ランナーを刺した！';
            newOuts++;
            updatePitcherStats(getCurrentPitcher().id, isTopInning ? 'home' : 'away', { outs: 1 });
          } else {
            isTopInning ? newScore.away++ : newScore.home++;
            recordRunsToCurrentPitcher(1, outs, unearnedAt(newBases, 2));
            wpDescription += ' ⚡ 三塁ランナーがホームイン';
          }
          newBases[2] = false;
        }
        
        // 二塁→三塁
        if (newBases[1] && newOuts < 3) {
          if (Math.random() < throwoutChance(1)) {
            wpDescription += ' 🛡️ 二塁ランナーを刺した！';
            newOuts++;
            updatePitcherStats(getCurrentPitcher().id, isTopInning ? 'home' : 'away', { outs: 1 });
          } else {
            newBases[2] = newBases[1];
            wpDescription += ' ⚡ 二塁ランナーが三塁へ';
          }
          newBases[1] = false;
        }
        
        // 一塁→二塁
        if (newBases[0] && newOuts < 3) {
          if (Math.random() < throwoutChance(0)) {
            wpDescription += ' 🛡️ 一塁ランナーを刺した！';
            newOuts++;
            updatePitcherStats(getCurrentPitcher().id, isTopInning ? 'home' : 'away', { outs: 1 });
          } else {
            newBases[1] = newBases[0];
            wpDescription += ' ⚡ 一塁ランナーが二塁へ';
          }
          newBases[0] = false;
        }
        
        setGameLog(prev => {
          const updated = [...prev, { description: wpDescription, isSpecial: true }];
          return updated.length > 50 ? updated.slice(-50) : updated;
        });
      }
    }
    
    // 盗塁判定
    if (!atBatOver && newOuts < 3 && result.type !== 'foul' && result.type !== 'foul_2strike' && (bases[0] || bases[1])) {
      // 二塁盗塁試行（⚠ 暴投で既に動いた走者は走らないので、投球後の塁でも確かめる）
      if (bases[0] && !bases[1] && newBases[0] && !newBases[1]) {
        // 盗塁の判断・成否は自動シミュレーションと共有する（stealing.js）。
        // 走者の足と盗塁の技術は**一塁走者本人**のもの（baseState.js）。
        // ⚠ 以前は塁が boolean で走者を識別できず、打者の値で近似していた
        //    （俊足の走者でも鈍足の打者の打席では走れなかった）
        const runner1 = runnerOf(newBases[0]);
        const r1Speed = runner1?.speed ?? batter.speed;
        const r1Steal = runner1?.steal ?? batter.steal;
        const stealRate2 = stealSuccessRate({
          runnerSpeed: r1Speed, runnerSteal: r1Steal,
          catcherArm: defense.catcher?.arm ?? 50, pitcherControl: pitcher.control,
          pitcherThrows: pitcher.throws, toBase: 2,
        });
        // 走るかどうかは自動の試合と同じ決まり（stealing.js。球団の走塁の方針も見る）。
        // ⚠ 以前は「おまかせ」のときだけ別の倍率（aiManager.js）を掛けていた
        let stealAttempt = stealAttemptRate({
          successRate: stealRate2, runnerSteal: r1Steal, outs: newOuts, toBase: 2,
          strategy: (isTopInning ? awayTeam : homeTeam).strategy?.baseRunning || 'normal',
        });


        // 采配: 盗塁指示/エンドランがあれば強制的に試行（成否は走力・肩で決まる）
        if (doForceSteal) { stealAttempt = 1; }

        if (Math.random() < stealAttempt) {
          if (Math.random() < stealRate2) {
            // 盗塁成功（盗塁は走者本人に付ける）
    newBases[1] = newBases[0];
    newBases[0] = false;
    if (runner1) updateBatterStats(runner1.id, runner1.side, { stolenBases: 1 });
    setGameLog(prev => {
      const updated = [...prev, { description: `🏃 盗塁成功！${runner1 ? runner1.name + ' ' : ''}一塁→二塁`, isSpecial: true }];
      return updated.length > 50 ? updated.slice(-50) : updated;
    });
  } else {
    // 盗塁失敗（盗塁死のアウトも投手の投球回に入る）
    newBases[0] = false;
    if (runner1) updateBatterStats(runner1.id, runner1.side, { caughtStealing: 1 });
    newOuts++;
    updatePitcherStats(getCurrentPitcher().id, isTopInning ? 'home' : 'away', { outs: 1 });
    setGameLog(prev => {
      const updated = [...prev, { description: '❌ 盗塁失敗、アウト', isSpecial: true }];
      return updated.length > 50 ? updated.slice(-50) : updated;
    });
  }
}
  }

  // 三塁盗塁試行
  if (bases[1] && !bases[2] && newBases[1] && !newBases[2] && newOuts < 3) {
// 判断・成否は自動シミュレーションと共有（stealing.js）。三塁は成功しやすいが試行は少ない
// ⚠ 投球後の塁（newBases）で見ること。この球で二塁走者が既に動いていれば走らない
const runner2 = runnerOf(newBases[1]);
const r2Speed = runner2?.speed ?? batter.speed;
const r2Steal = runner2?.steal ?? batter.steal;
const stealRate3 = stealSuccessRate({
  runnerSpeed: r2Speed, runnerSteal: r2Steal,
  catcherArm: defense.catcher?.arm ?? 50, pitcherControl: pitcher.control,
  pitcherThrows: pitcher.throws, toBase: 3,
});
let stealThirdAttempt = stealAttemptRate({
  successRate: stealRate3, runnerSteal: r2Steal, outs: newOuts, toBase: 3,
  strategy: (isTopInning ? awayTeam : homeTeam).strategy?.baseRunning || 'normal',
});


if (Math.random() < stealThirdAttempt) {
          if (Math.random() < stealRate3) {
            // 盗塁成功（盗塁は走者本人に付ける）
    newBases[2] = newBases[1];
    newBases[1] = false;
    if (runner2) updateBatterStats(runner2.id, runner2.side, { stolenBases: 1 });
    setGameLog(prev => {
      const updated = [...prev, { description: `🏃 盗塁成功！${runner2 ? runner2.name + ' ' : ''}二塁→三塁`, isSpecial: true }];
      return updated.length > 50 ? updated.slice(-50) : updated;
    });
  } else {
    // 盗塁失敗（盗塁死のアウトも投手の投球回に入る）
    newBases[1] = false;
    if (runner2) updateBatterStats(runner2.id, runner2.side, { caughtStealing: 1 });
    newOuts++;
    updatePitcherStats(getCurrentPitcher().id, isTopInning ? 'home' : 'away', { outs: 1 });
    setGameLog(prev => {
      const updated = [...prev, { description: '❌ 盗塁失敗、アウト', isSpecial: true }];
      return updated.length > 50 ? updated.slice(-50) : updated;
    });
  }
}
  }
}

if (newOuts === 3) {
  newOuts = 0;
  newBases = [false, false, false];
  // 打席の途中の3アウト（盗塁死・牽制死など）でもカウントは0-0に戻す。打者は次の回の先頭に残る。
  // ⚠ 戻さないと次の回が前のカウントで始まり、0-0 でだけ走る CPU の采配（継投・守備固め）も飛んでいた
  newCount = { balls: 0, strikes: 0 };

  // 半イニングの後のスタミナ回復（+3）・継投・守備固めは次の球の前に CPU の采配で行う
  noteHalfInningEnd(tacticsMemoryRef.current);

  // イニングの得点を記録
  const currentInn = inning - 1; // 0-indexed
  if (inning <= 9) {
// 9回まで
        if (isTopInning) {
          const prevTotal = inningScores.away.slice(0, currentInn).filter(x => x !== null).reduce((a, b) => a + b, 0);
          const awayInningRuns = newScore.away - prevTotal;
          setInningScores(prev => {
            const newAway = [...prev.away];
            newAway[currentInn] = awayInningRuns;
            return { ...prev, away: newAway };
          });
        } else {
          const prevTotal = inningScores.home.slice(0, currentInn).filter(x => x !== null).reduce((a, b) => a + b, 0);
          const homeInningRuns = newScore.home - prevTotal;
          setInningScores(prev => {
            const newHome = [...prev.home];
            newHome[currentInn] = homeInningRuns;
            return { ...prev, home: newHome };
          });
        }
      } else {
        // 延長（10回以降）
        const extraInn = inning - 10; // 0-indexed for extra innings
        if (isTopInning) {
          const prevRegular = inningScores.away.filter(x => x !== null).reduce((a, b) => a + b, 0);
          const prevExtra = extraInningScores.away.reduce((a, b) => a + b, 0);
          const awayInningRuns = newScore.away - prevRegular - prevExtra;
          setExtraInningScores(prev => {
            const newAway = [...prev.away];
            newAway[extraInn] = awayInningRuns;
            return { ...prev, away: newAway };
          });
        } else {
          const prevRegular = inningScores.home.filter(x => x !== null).reduce((a, b) => a + b, 0);
          const prevExtra = extraInningScores.home.reduce((a, b) => a + b, 0);
          const homeInningRuns = newScore.home - prevRegular - prevExtra;
          setExtraInningScores(prev => {
            const newHome = [...prev.home];
            newHome[extraInn] = homeInningRuns;
            return { ...prev, home: newHome };
          });
        }
      }
      
      // 試合終了判定（3アウト時）
      if (inning >= 9 && isTopInning && newScore.home > newScore.away) {
        // 9回表終了時、ホームがリードしていれば試合終了（9回裏不要）
        setGameOver(true);
        setLastResult({ description: `試合終了！ ${homeTeam.name} の勝利！` });
      } else if (inning >= 9 && !isTopInning && newScore.home !== newScore.away) {
        // 9回裏以降で決着（3アウトで終了）
        setGameOver(true);
        setLastResult({ description: `試合終了！ ${newScore.home > newScore.away ? homeTeam.name : awayTeam.name} の勝利！` });
      } else if (inning >= maxExtraInnings && !isTopInning) {
        // 延長最大回数で引き分け
        setGameOver(true);
        setLastResult({ description: `試合終了！ 延長${maxExtraInnings}回 引き分け` });
      } else {
        if (isTopInning) {
          setIsTopInning(false);
          resetEarnedRunTracking(); // 自責点判定はイニング単位
        } else {
          setIsTopInning(true);
          resetEarnedRunTracking(); // 自責点判定はイニング単位
          setInning(inning + 1);
        }
      }
    }
    
    // サヨナラ勝ち判定（9回裏以降、ホームが得点してリードした瞬間）
    if (inning >= 9 && !isTopInning && newScore.home > newScore.away && !gameOver) {
      // 延長の場合は得点を記録
      if (inning > 9) {
        const extraInn = inning - 10;
        const prevRegular = inningScores.home.filter(x => x !== null).reduce((a, b) => a + b, 0);
        const prevExtra = extraInningScores.home.reduce((a, b) => a + b, 0);
        const homeInningRuns = newScore.home - prevRegular - prevExtra;
        setExtraInningScores(prev => {
          const newHome = [...prev.home];
          newHome[extraInn] = homeInningRuns;
          return { ...prev, home: newHome };
        });
      } else {
        // 9回裏サヨナラ
        const prevTotal = inningScores.home.slice(0, 8).filter(x => x !== null).reduce((a, b) => a + b, 0);
        const homeInningRuns = newScore.home - prevTotal;
        setInningScores(prev => {
          const newHome = [...prev.home];
          newHome[8] = homeInningRuns;
          return { ...prev, home: newHome };
        });
      }
      setGameOver(true);
      setLastResult({ description: `サヨナラ勝ち！ ${homeTeam.name} の勝利！` });
    }
    
    if (atBatOver) {
      newCount = { balls: 0, strikes: 0 };
      // 次の打者に進む
      advanceBatter();
      // 先発のダメージ・救援の対戦打者数（CPU の継投の判断に使う。自動の試合と同じ帳簿）
      noteAtBatEnd(tacticsMemoryRef.current, {
        defenseSide: isTopInning ? 'home' : 'away', pitcherId: getCurrentPitcher()?.id,
        kind: result.type === 'ball' || result.type === 'hit_by_pitch' ? 'walk' : result.type,
        runs: isTopInning ? newScore.away - score.away : newScore.home - score.home,
      });
    }
    
    // アウトが増えた場合フラグを立てる（1アウトモード用）
    if (newOuts > outs || (newOuts === 0 && outs > 0)) {
      outOccurredRef.current = true;
    }

    setCount(newCount);
    setOuts(newOuts);
    setBases(newBases);
    setScore(newScore);
  };

  // バント実行ハンドラー（手動操作モード用）
  const handleBunt = () => {
    if (!count || count.balls === undefined) return;
    // CPU の采配は throwPitch と同じく打席の頭（0-0）で先に走らせる。交代したらこのバントはしない
    // ⚠ 以前は初球のバントだと CPU の継投・守備固め・代打が飛ばされていた
    if (count.balls === 0 && count.strikes === 0 && applyCpuTactics()) return;

    const currentBatter = getCurrentBatter();
    const currentPitcher = getCurrentPitcher();
    const currentCatcher = getCurrentCatcher();
    const defenseTeam = getDefenseTeam();

    const bCondMod = conditionBattingMod(currentBatter.condition);

    const buntSkill = currentBatter.batting?.bunt || 30;
    const meet = (currentBatter.batting?.meet || 50) + bCondMod.meet;
    const speed = currentBatter.physical?.speed || 50;

    // バント種別を状況から自動判定
    let buntType = 'safety';
    if (bases[2] && outs <= 1) {
      buntType = 'squeeze';
    } else if ((bases[0] || bases[1]) && outs <= 1) {
      buntType = 'sacrifice';
    }

    // スタミナ消費（1球分。投手ごとに持つ）
    {
      const left = Math.max(0, staminaOf(tacticsMemoryRef.current, currentPitcher) - 1);
      setStamina(tacticsMemoryRef.current, currentPitcher, left);
      setCurrentStamina(left);
    }
    {
      const defenseTeamType = isTopInning ? 'home' : 'away';
      updatePitcherStats(currentPitcher.id, defenseTeamType, {
        pitches: 1
      });
    }

    // Step 1: フェア/ファウル/フライ（式は `bunting.js` で自動シミュと共有）
    const contact = classifyBuntContact(Math.random() * 100, buntSkill, meet);

    let newOuts = outs;
    let newBases = [...bases];
    let newScore = { ...score };
    let newCount = { ...count };
    let atBatOver = false;
    const offense = isTopInning ? 'away' : 'home';
    const recordBuntInningScore = () => {
      if (inning <= 9) {
        setInningScores(prev => {
          const next = { ...prev, [offense]: [...prev[offense]] };
          const priorRuns = next[offense].slice(0, inning - 1).filter(v => v !== null).reduce((sum, v) => sum + v, 0);
          next[offense][inning - 1] = newScore[offense] - priorRuns;
          return next;
        });
      } else {
        setExtraInningScores(prev => {
          const next = { ...prev, [offense]: [...prev[offense]] };
          const regularRuns = inningScores[offense].filter(v => v !== null).reduce((sum, v) => sum + v, 0);
          const priorExtraRuns = next[offense].slice(0, inning - 10).reduce((sum, v) => sum + (v || 0), 0);
          next[offense][inning - 10] = newScore[offense] - regularRuns - priorExtraRuns;
          return next;
        });
      }
    };

    // バント安打の進塁。一塁が埋まっていれば押し出し、二塁だけなら三塁へ進める。
    // ⚠ 以前は満塁のバント安打で三塁走者を上書きしており、1点と走者が消えていた。
    //    二塁走者を三塁へ送ったら二塁を空けること（二塁にも残ると走者が1人増える）
    let buntHit = false;   // 先発のダメージ（noteAtBatEnd）で単打に数える
    const advanceOnBuntHit = () => {
      buntHit = true;
      setTeamHits(prev => ({ ...prev, [offense]: prev[offense] + 1 }));
      if (!newBases[0] && newBases[1] && !newBases[2]) { newBases[2] = newBases[1]; newBases[1] = false; }
      const fa = forceAdvance(newBases, batterAsRunner());
      newBases = fa.bases;
      if (fa.scored.length) {
        isTopInning ? newScore.away++ : newScore.home++;
        recordRunsToCurrentPitcher(1, outs, isUnearnedRunner(fa.scored[0]) ? 1 : 0);
        updateBatterStats(currentBatter.id, isTopInning ? 'away' : 'home', { rbis: 1 });
      }
    };

    if (contact === 'popup') {
      // バントフライ → アウト
      newOuts++;
      {
        const offenseTeamType = isTopInning ? 'away' : 'home';
        const defenseTeamType = isTopInning ? 'home' : 'away';
        updateBatterStats(currentBatter.id, offenseTeamType, { atBats: 1 });
        updatePitcherStats(currentPitcher.id, defenseTeamType, { outs: 1 });
      }
      setLastResult({ description: 'バントフライ アウト' });
      addAtBatResult(currentBatter.id, isTopInning ? 'away' : 'home', 'バ飛');
      atBatOver = true;
    } else if (contact === 'foul') {
      // バントファウル
      if (count.strikes >= 2) {
        // 2ストライクからのバントファウルは三振
        newOuts++;
        {
          const offenseTeamType = isTopInning ? 'away' : 'home';
          const defenseTeamType = isTopInning ? 'home' : 'away';
          updateBatterStats(currentBatter.id, offenseTeamType, {
            atBats: 1,
            strikeouts: 1
          });
          updatePitcherStats(currentPitcher.id, defenseTeamType, {
            outs: 1,
            strikeouts: 1
          });
        }
        setLastResult({ description: 'バントファウル → 三振！' });
        addAtBatResult(currentBatter.id, isTopInning ? 'away' : 'home', '三振');
        atBatOver = true;
      } else {
        newCount = { ...count, strikes: count.strikes + 1 };
        setLastResult({ description: 'バントファウル' });
        setGameLog(prev => [...prev, { description: 'バントファウル' }]);
      }
    } else {
      // フェアバント
      const quality = rollBuntQuality(buntSkill, meet);

      const fieldOf = (pos) => defenseTeam.players
        .find(p => p.position === pos && p.battingOrder >= 1 && !p._isDH)?.fielding?.defense;
      const avgFieldDef = buntFieldDefense(
        fieldOf('pitcher'), fieldOf('first'), fieldOf('third'),
        currentCatcher?.fielding?.defense);
      const batterOut = Math.random() * 100 < buntThrowOutChance(buntType, speed, quality, avgFieldDef);

      const offenseTeamType = isTopInning ? 'away' : 'home';
      const defenseTeamType = isTopInning ? 'home' : 'away';

      if (buntType === 'squeeze') {
        // スクイズ: 3塁ランナーの生還判定
        let squeezeRunnerSafe = true;
        if (newBases[2]) {
          squeezeRunnerSafe = Math.random() * 100 >= squeezeHomeThrowChance(quality, avgFieldDef);

          if (squeezeRunnerSafe) {
            isTopInning ? newScore.away++ : newScore.home++;
            recordRunsToCurrentPitcher(1, outs, unearnedAt(newBases, 2));
            updateBatterStats(currentBatter.id, offenseTeamType, { rbis: 1 });   // スクイズは打点
            newBases[2] = false;
          } else {
            newOuts++;
            updatePitcherStats(currentPitcher.id, defenseTeamType, { outs: 1 });
            newBases[2] = false;
          }
        }

        if (batterOut) {
          newOuts++;
          updatePitcherStats(currentPitcher.id, defenseTeamType, { outs: 1 });
          updateBatterStats(currentBatter.id, offenseTeamType, {
            sacrificeBunts: 1
          });
          const qualityText = quality === 'dead' ? '絶妙な' : quality === 'hard' ? '強い' : '';
          setLastResult({ description: `${qualityText}スクイズ${squeezeRunnerSafe ? '成功！' : '（本塁封殺）'}` });
          addAtBatResult(currentBatter.id, offenseTeamType, '犠打');
        } else {
          updateBatterStats(currentBatter.id, offenseTeamType, {
            atBats: 1,
            hits: 1
          });
          updatePitcherStats(currentPitcher.id, defenseTeamType, { hits: 1 });   // バント安打も被安打
          advanceOnBuntHit();
          setLastResult({ description: 'スクイズバント安打！' });
          addAtBatResult(currentBatter.id, offenseTeamType, '安打');
        }
        atBatOver = true;
      } else if (buntType === 'sacrifice') {
        if (batterOut) {
          newOuts++;
          updatePitcherStats(currentPitcher.id, defenseTeamType, { outs: 1 });
          updateBatterStats(currentBatter.id, offenseTeamType, {
            sacrificeBunts: 1
          });
          if (newOuts < 3) {
            if (newBases[1]) { newBases[2] = newBases[1]; newBases[1] = false; }
            if (newBases[0]) { newBases[1] = newBases[0]; newBases[0] = false; }
          }
          const qualityText = quality === 'dead' ? '絶妙な' : quality === 'hard' ? '強い' : '';
          setLastResult({ description: `${qualityText}犠打成功` });
          addAtBatResult(currentBatter.id, offenseTeamType, '犠打');
        } else {
          updateBatterStats(currentBatter.id, offenseTeamType, {
            atBats: 1,
            hits: 1
          });
          updatePitcherStats(currentPitcher.id, defenseTeamType, { hits: 1 });   // バント安打も被安打
          advanceOnBuntHit();
          setLastResult({ description: 'バント安打！' });
          addAtBatResult(currentBatter.id, offenseTeamType, '安打');
        }
        atBatOver = true;
      } else {
        // セーフティバント
        if (batterOut) {
          newOuts++;
          updateBatterStats(currentBatter.id, offenseTeamType, { atBats: 1 });
          updatePitcherStats(currentPitcher.id, defenseTeamType, { outs: 1 });
          setLastResult({ description: 'セーフティバント失敗' });
          addAtBatResult(currentBatter.id, offenseTeamType, 'バ失');
        } else {
          updateBatterStats(currentBatter.id, offenseTeamType, {
            atBats: 1,
            hits: 1
          });
          updatePitcherStats(currentPitcher.id, defenseTeamType, { hits: 1 });   // バント安打も被安打
          advanceOnBuntHit();
          setLastResult({ description: 'セーフティバント成功！' });
          addAtBatResult(currentBatter.id, offenseTeamType, '安打');
        }
        atBatOver = true;
      }
    }

    // 3アウトチェンジ
    const halfInningEnded = newOuts >= 3;
    if (halfInningEnded) {
      newOuts = 0;
      newBases = [false, false, false];
      atBatOver = true;
      recordBuntInningScore();

      if (inning >= 9 && !isTopInning && newScore.home > newScore.away && !gameOver) {
        setGameOver(true);
        setLastResult({ description: `試合終了！ ${homeTeam.name} の勝利！` });
      } else if (inning >= 9 && isTopInning && newScore.home > newScore.away && !gameOver) {
        setGameOver(true);
        setLastResult({ description: `試合終了！ ${homeTeam.name} の勝利！` });
      } else if (inning >= 9 && !isTopInning && newScore.home !== newScore.away && !gameOver) {
        setGameOver(true);
        setLastResult({ description: `試合終了！ ${newScore.home > newScore.away ? homeTeam.name : awayTeam.name} の勝利！` });
      } else if (inning >= maxExtraInnings && !isTopInning && !gameOver) {
        setGameOver(true);
        setLastResult({ description: `試合終了！ 延長${maxExtraInnings}回 引き分け` });
      } else {
        if (isTopInning) {
          setIsTopInning(false);
          resetEarnedRunTracking(); // 自責点判定はイニング単位
        } else {
          setIsTopInning(true);
          resetEarnedRunTracking(); // 自責点判定はイニング単位
          setInning(inning + 1);
        }
      }
    }

    // サヨナラ判定
    if (!halfInningEnded && inning >= 9 && !isTopInning && newScore.home > newScore.away && !gameOver) {
      recordBuntInningScore();
      setGameOver(true);
      setLastResult({ description: `サヨナラ！ ${homeTeam.name} の勝利！` });
    }

    if (atBatOver) {
      newCount = { balls: 0, strikes: 0 };
      advanceBatter();
      noteAtBatEnd(tacticsMemoryRef.current, {
        defenseSide: isTopInning ? 'home' : 'away', pitcherId: currentPitcher?.id,
        kind: buntHit ? 'single' : 'out', runs: isTopInning ? newScore.away - score.away : newScore.home - score.home,
      });
    }
    if (halfInningEnded) noteHalfInningEnd(tacticsMemoryRef.current);

    setCount(newCount);
    setOuts(newOuts);
    setBases(newBases);
    setScore(newScore);
  };

  // ゲームコントロール関数（gameControls.jsからインポート済み、stateバインド用ラッパー）
  const gameControlsCtx = {
    isSubstituting, setCount, setBases, setOuts, setInning, setScore,
    setGameOver, setRemainingPitches, setSimMode, outOccurredRef,
    setInningScores, setExtraInningScores,
    setTeamHits, setTeamErrors, setIsTopInning,
    setGameLog, setLastResult,
    setHomeTeam, setAwayTeam, setCurrentStamina,
    setIsAutoSimulating
  };
  // [SECTION: GAME_CONTROLS] → gameControls.js に抽出済み（ラッパーのみ）
  // 1試合のあいだだけ持つ ref を作り直す（試合をまたいで持ち越さない）。
  // ⚠ 以前は CPU の采配の帳簿だけを作り直し、自責点の「免れたアウト数」と配球の記憶は
  //    前の試合の最後の回のものが次の試合の1回に残っていた（同じ打者が先頭なら配球も続きから）
  const resetPerGameRefs = () => {
    tacticsMemoryRef.current = createManagedTacticsMemory();
    inningErrorOutsRef.current = 0;
    pitchSeqRef.current = { key: null, seq: createSequence() };
  };
  const resetGame = () => {
    resetPerGameRefs();
    executeResetGame(gameControlsCtx);
  };
  const startSimMode = (mode) => executeStartSimMode(gameControlsCtx, mode);

  // 残り投球数がある場合は自動的に投球を続ける
  React.useEffect(() => {
    if (remainingPitches > 0 && !gameOver) {
      const timer = setTimeout(() => {
        throwPitch();
        setRemainingPitches(prev => prev - 1);
      }, 1);  // 1msごとに投球
      return () => clearTimeout(timer);
    } else if (remainingPitches === 0 && isAutoSimulating && !simMode) {
      setIsAutoSimulating(false);
    }
  }, [remainingPitches, gameOver]);

  // simMode による自動投球ループ
  React.useEffect(() => {
    if (!simMode || gameOver) {
      if (simMode) {
        setSimMode(null);
        setIsAutoSimulating(false);
      }
      return;
    }
    if (simMode === 'out' && outOccurredRef.current) {
      // アウト発生で停止
      setSimMode(null);
      setIsAutoSimulating(false);
      outOccurredRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      throwPitch();
      // throwPitch内でoutOccurredRefが更新される → 次のレンダーで判定
    }, 1);
    return () => clearTimeout(timer);
  });

  // AccordionSection, Sidebar: GameUIComponentsからimport済み

  // 采配モード: 試合セットアップ（DateProgressScreenから呼ばれる）
  // 采配モード関数（gameSetup.jsからインポート済み、stateバインド用ラッパー）
  const gameSetupCtx = {
    setCount, setBases, setOuts, setInning, setScore, setGameOver,
    setGameStarted, setRemainingPitches, setSimMode, outOccurredRef,
    setInningScores, setExtraInningScores,
    setTeamHits, setTeamErrors, setIsTopInning,
    setGameLog, setLastResult,
    setHomeTeam, setAwayTeam, setCurrentStamina,
    setManagedGameInfo, managedGameInfoRef, setScreenMode
  };
  // [SECTION: GAME_SETUP] → gameSetup.js に抽出済み（ラッパーのみ）
  // 試合を始める（以前は試合前のスタメン画面の「試合開始」だけが呼んでいた）
  const startManagedGame = () => {
    // ⚠ 帳簿は effect（gameStarted の変化）に頼らず、ここで作り直す。2試合目は準備の
    //    setGameStarted(false) とこの true が同じ描画にまとまり、値が変わらないので effect が走らない
    //    （前の試合の投手・先発の印・リードが残り、勝敗投手を誤った。監査16）
    decisionLogRef.current = createDecisionLog();
    setGameStarted(true);
    setSelectedBatterAway(null);
    setSelectedBatterHome(null);
    setSelectedPositionAway(null);
    setSelectedPositionHome(null);
    // 各選手のgameStatsを初期化
    const freshStats = (prev) => ({
      ...prev,
      players: prev.players.map(p => ({
        ...p,
        gameStats: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, strikeouts: 0, atBatResults: [],
          fieldingChances: 0, fieldErrors: 0, assists: 0 }
      }))
    });
    setAwayTeam(freshStats);
    setHomeTeam(freshStats);
  };
  // `gameInfo.autoManager`: 試合前の窓で選んだ「おまかせ采配」の入／切。
  // `gameInfo.startNow`: 試合前の窓でスタメンを決めてきたので、2つ目のスタメン画面を出さずに始める
  //   （UI点検 S9。以前はここで「野球シミュレーター」の見出しの画面がもう一度スタメンを並べ、
  //   試合前の窓へ戻る手段も無かった）
  const setupManagedGame = (gameInfo) => {
    // CPU の采配の帳簿・自責点・配球の記憶は1試合ごとに作り直す
    resetPerGameRefs();
    const { autoManager, startNow, ...info } = gameInfo || {};
    if (typeof autoManager === 'boolean') setAutoManagerMode(autoManager);
    const ready = executeSetupManagedGame(gameSetupCtx, info);
    // ⚠ 準備（両チームの state を作り直す）のあとに積むこと。`startManagedGame` の更新は関数の形なので、
    //    同じ描画の中で準備の値の上に重なる
    if (startNow && ready) startManagedGame();
  };
  // 試合中に切り替えた入／切も、次の試合前の窓の初期値にする
  useEffect(() => { setAutoManagerPref(autoManagerMode); }, [autoManagerMode]);

  // 試合中の両チームの投手とリードを記録する（帳簿は startManagedGame で作り直す）。
  // ⚠ 以前の采配モードは「先発が5回以上なら先発の勝ち」「最少アウトの投手＝最後の投手」
  //    という推定で勝敗を付けており、0-0で5回に降りた先発に勝ちが付いていた
  const currentPitcherIdOf = (team) =>
    team?.players?.find(p => p.isStarter && p.position === 'pitcher')?.id ?? null;
  // 画面のスタミナの棒は、いま守っている投手のもの（スタミナは投手ごとに帳簿に持つ）
  useEffect(() => {
    if (!gameStarted) return;
    const p = getCurrentPitcher();
    if (p?.pitching) setCurrentStamina(staminaOf(tacticsMemoryRef.current, p));
  }, [gameStarted, isTopInning, homeTeam, awayTeam]);
  useEffect(() => {
    if (!gameStarted) return;
    observeDecisionLog(decisionLogRef.current, {
      score, pitcherIds: { home: currentPitcherIdOf(homeTeam), away: currentPitcherIdOf(awayTeam) },
    });
  }, [gameStarted, score.home, score.away, homeTeam, awayTeam]);

  const handleManagedGameEnd = () => executeHandleManagedGameEnd({
    managedGameInfoRef, score, homeTeam, awayTeam, decisionLog: decisionLogRef.current,
    seasonData, setSeasonData, selectedMonth, setSelectedMonth,
    setManagedGameInfo, setScreenMode, setManagementView
  });

  return {
    autoManagerMode,
    awayTeam,
    ballEffects,
    bases,
    batGuessType,
    batGuessZone,
    battingApproach,
    count,
    currentBatterOrder,
    currentStamina,
    decisionLogRef,
    extraInningScores,
    gameEndPanelRef,
    gameLog,
    gameOver,
    gameStarted,
    getCurrentBatter,
    getCurrentCatcher,
    getCurrentPitcher,
    handleBatterClick,
    handleBunt,
    handleManagedGameEnd,
    handlePositionClick,
    handleSubstituteClick,
    homeTeam,
    inning,
    inningScores,
    isAutoSimulating,
    isTopInning,
    lastResult,
    managedGameInfo,
    outs,
    pitchAim,
    pitchSeqRef,
    pitchTypeIndex,
    resetGame,
    score,
    selectedBatterAway,
    selectedBatterHome,
    selectedPositionAway,
    selectedPositionHome,
    selectedSubstituteAway,
    selectedSubstituteHome,
    setAutoManagerMode,
    setAwayTeam,
    setBatGuessType,
    setBatGuessZone,
    setBattingApproach,
    setCurrentStamina,
    setGameLog,
    setGameStarted,
    setHomeTeam,
    setIsAutoSimulating,
    setPitchAim,
    setPitchTypeIndex,
    setRemainingPitches,
    setSelectedBatterAway,
    setSelectedBatterHome,
    setSelectedPositionAway,
    setSelectedPositionHome,
    setShowBenchAway,
    setShowBenchHome,
    setShowSubModal,
    setSimMode,
    setSubModalSelected,
    setupManagedGame,
    startManagedGame,
    showBenchAway,
    showBenchHome,
    showSubModal,
    startSimMode,
    subModalSelected,
    teamErrors,
    teamHits,
    throwPitch,
    triggerHitAndRun,
    triggerIntentionalWalk,
    triggerSteal,
  };
}
