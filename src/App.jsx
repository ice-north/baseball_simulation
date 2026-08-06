import React, { useState, useEffect, useRef, useMemo } from 'react';

// Utility imports
import {
  BALL_EFFECTS,
  PITCHING_FORM_EFFECTS,
  FORM_PITCH_SYNERGY,
  POSITION_NAMES,
  POSITION_COLORS,
  HAND_LABELS,
  sortBenchByPosition,
  formatAtBatResult,
  atBatResultColor,
  getPitchTypeName,
  DP_BASE
} from './utils/constants.js';

import {
  formatInnings,
  getAbilityColor,
  getAbilityTextColor,
  getBestFitPosition,
  getStaminaPenalty,
  getInfielderEffectiveArm,
  getHandednessEffect
} from './utils/physics.js';

// Data imports
import { createPlayerStats, createSeasonStats, createCareerStats } from './players.js';
import { initializeTeamsData, TEAMS_DATA, LEAGUE_SETTINGS, initializeTeamsForCount, selectReliefPitcher, updateReliefFatigue, recoverReliefFatigue, getTeamAbbreviation } from './teams-data.js';
import { generateRandomPlayerName } from './data/playerNames.js';

// Game logic imports
import { calculatePhysicsContact, calculateBattedBallPhysics, judgeFielderReach, calculateDefensiveFitness, getTunnelingEffect } from './simulation-logic.js';
import { autoSimulateGame } from './game/autoSimulation.js';
import { useGameStrategy } from './game/useGameStrategy.js';
import { callPitchTarget, resolvePitchLocation, swingProbability, ballZoneContactChance, getPitchQualityEffect, getHeightPitchEffect, BALL_ZONE_PENALTY, AIM_LABEL, selectPitchType, guessSuccessRate, resolveBatterGuess, GUESS_TYPE_LABEL, GUESS_ZONE_LABEL } from './game/pitchCalling.js';
import { getBatterType, resolveAiBatterGuess, BATTER_TYPE_LABEL, BATTER_TYPE_NOTE } from './game/batterType.js';
import { getZoneProfile, getZoneMatchupEffect, combineBatterEffects, zoneWeaknessAt,
  zoneHeatmap, describeZoneProfile } from './game/batterZone.js';
import { decideSwingPower, getSwingPowerEffect, swingPowerLabel } from './game/swingType.js';
import { createSequence, pushCall, lastCall, sequenceShift, shiftMeetAdjust, locationReadChance,
  pushSwingQuality, decayFooled, fooledLevel } from './game/pitchSequence.js';
import { decidePitchObjective, OBJECTIVE_LABEL, OBJECTIVE_NOTE } from './game/pitchSituation.js';
import { hitByPitchChance, hitByPitchFatigue } from './game/pitchZone.js';
import PitchZonePlot, { HEAT_HOT, HEAT_COLD } from './components/PitchZonePlot.jsx';
import { resolveGroundOutAdvance, tryExtraAdvance } from './game/baserunning.js';
import { stealSuccessRate, stealAttemptRate } from './game/stealing.js';
import { effectiveArsenalSize } from './game/arsenal.js';
import TutorialHint from './components/TutorialHint.jsx';
import { setGameSnapshotProvider } from './game/crashRecovery.js';
import { getUiScale, UISCALE_EVENT } from './game/uiSettings.js';
import { CONDITION_LEVELS, CONDITION_COLORS, CONDITION_ICONS, CONDITION_BATTING_MODIFIER, CONDITION_PITCHING_MODIFIER, updateAllPlayersCondition, initializeAllPlayersCondition } from './game/condition.js';

// Save system imports
import { readSaveSlots, readSaveSlotsSync, setCachedSlots, ensureMigration, migrateOldSaveData, saveGameToSlot, loadGameFromSlot, deleteSaveSlot, autoSave, isAutosaveEnabled, AUTOSAVE_KEY } from './game/saveSystem.js';

// Game controls imports
import { executeResetGame, executeMultiPitch, executeStartSimMode } from './game/gameControls.js';
import { executeSetupManagedGame, executeHandleManagedGameEnd } from './game/gameSetup.js';

// AI Manager imports
import { executeAutoSubstitutePitcher, executeAutoSubstitutePinchHitter, executeAutoDefensiveSubstitution, executeAutoStealingDecision, executeAutoOptimizePitcherUsage } from './game/aiManager.js';

// Season progress imports
import { handleProgressDate as progressDateHandler, handleProgressToNextGame as progressToNextGameHandler, handleProgressToNextPhase as progressToNextPhaseHandler } from './game/seasonProgress.js';

// Season management imports
import { createSeasonData, SEASON_PHASES, PHASE_INFO, formatDate, getDayOfWeek, isGameDay, getCurrentPhase, initializeStandings } from './season/seasonManager.js';
import { generateFullSeasonSchedule, assignPitchersToSchedule, getScheduleByDate, getTeamSchedule } from './season/scheduleGenerator.js';
import { generateCalendarMonth, getGamesForDate, generateTeamCalendar } from './season/calendarUI.js';
import { DEFAULT_REGULATIONS, REGULATION_PRESETS, validateRegulations, getPlayoffFormatDescription, canModifyRegulations, applyPreset } from './season/regulationSettings.js';
import { progressDate, handlePhaseTransition, recordGameResult, updatePlayoffProgress } from './season/dateProgression.js';
import { generateTryoutCandidates, selectPlayerForAI, generateSnakeDraftOrder } from './season/tryoutSystem.js';
import { processSeasonEnd, advanceToNextYear, advanceToNextYearSandbox, processRetirements, updateAllPlayerAges, releasePlayer, TRAINING_MENUS, updateAllPlayersExperience, executeCampTraining, executeTeamCampTraining } from './season/yearProgressionSystem.js';
import { processNPBDraft } from './season/npbDraft.js';
import { initializeParallelWorldForIndependent, ensureUserIndependentLeagueTagged, recoverMissingParallelTeams } from './corporate/corporateInit.js';
import { WORLD_DATA } from './corporate/worldData.js';

// Component imports
import ManagementScreen from './components/ManagementScreen.jsx';
import GameFlowScreens from './components/GameFlowScreens.jsx';
import { Sidebar, RenderBases, AccordionSection } from './components/GameUIComponents.jsx';

    // ========================================================================
    // App.jsx セクション構成 (行番号はおおよその目安)
    // ========================================================================
    // [SECTION: IMPORTS]         L1-57    : import文
    // [SECTION: APP_STATE]       L58-340  : アプリ全体のstate定義
    // [SECTION: GAME_HANDLERS]   L341-595 : 成績更新・選手交代ハンドラー
    // [SECTION: AI_MANAGER]      L596-610 : → aiManager.js に抽出済み（ラッパーのみ）
    // [SECTION: THROW_PITCH]     L611-2030: throwPitch（投球シミュレーション本体）
    // [SECTION: GAME_CONTROLS]   L2031-2080: → gameControls.js に抽出済み（ラッパーのみ）
    // [SECTION: GAME_SETUP]      L2081-2100: → gameSetup.js に抽出済み（ラッパーのみ）
    // [SECTION: SEASON_PROGRESS] L2101-2110: → seasonProgress.js に抽出済み（ラッパーのみ）
    // [SECTION: MANAGEMENT]      L2111-2112: → ManagementScreen.jsx に抽出済み
    // [SECTION: GAME_FLOW]       L2113-2130: → GameFlowScreens.jsx に抽出済み
    // [SECTION: RENDER]          L2131-END : メインreturn（試合画面UI）
    //
    // ★ 分割作業は完了しました。今後は通常の開発（機能追加・バグ修正）に集中できます。
    // ========================================================================
    const App = () => {
      // チームデータの初期化
      useEffect(() => {
        if (typeof initializeTeamsData === 'function') {
          initializeTeamsData();
        }
      }, []);

      // 画面モード管理
      const [screenMode, setScreenMode] = useState('start'); // 'start', 'game', 'management'
      const [gameFlowState, setGameFlowState] = useState('title'); // 'title', 'newgame_regulations', 'newgame_tryout', 'newgame_camp', 'sandbox_regulations', 'sandbox_setup', 'season'
      const [gameMode, setGameMode] = useState('normal'); // 'normal', 'sandbox'
      const [managementView, setManagementView] = useState('schedule'); // 'edit', 'schedule', 'team', 'stats', 'save', 'regulations'
      const [scheduleTab, setScheduleTab] = useState('league'); // 'league', 'batting', 'pitching'

      // リーグ構成設定（拡張可能な設計）
      const [leagueConfig, setLeagueConfig] = useState({
        format: 'single', // 'single', 'dual', 'triple' (1リーグ、2リーグ、3部制)
        teamsPerLeague: 4, // リーグあたりのチーム数
        leagues: [
          {
            name: 'リーグ',
            teams: ['チームA', 'チームB', 'チームC', 'チームD']
          }
        ]
      });

      // 全チームリスト（リーグ構成から自動生成）- useMemoで無限ループ防止
      const allTeams = useMemo(() => leagueConfig.leagues.flatMap(league => league.teams), [leagueConfig]);

      // ユーザーチーム（常に最初のチーム）
      const userTeamName = allTeams[0] || 'チームA';

      // === 新システム: シーズンデータ統合管理 ===
      const [seasonData, setSeasonData] = useState(null);
      const [selectedMonth, setSelectedMonth] = useState(4); // カレンダー表示月

      // シーズンデータの初期化（NEW GAMEフローから呼ばれる）
      const initializeNewGame = (regulations) => {
        const newSeasonData = createSeasonData(1);

        // レギュレーション設定を適用
        newSeasonData.settings = { ...regulations };

        // チーム数に応じてリーグ構成を更新
        const teamCount = regulations.teamsCount || 4;
        let customNames = regulations.teamNames ? [...regulations.teamNames] : null;
        let customAbbreviations = regulations.teamAbbreviations ? [...regulations.teamAbbreviations] : null;

        // 選択チームを先頭に並べ替え（既存リーグでチーム選択した場合）
        if (regulations.selectedTeamIndex != null && regulations.selectedTeamIndex > 0 && customNames) {
          const idx = regulations.selectedTeamIndex;
          const [name] = customNames.splice(idx, 1);
          customNames.unshift(name);
          if (customAbbreviations) {
            const [abbr] = customAbbreviations.splice(idx, 1);
            customAbbreviations.unshift(abbr);
          }
        }

        // 動的にチームを作成（カスタム名・略称対応）
        const teamNames = initializeTeamsForCount(teamCount, customNames, customAbbreviations);
        // チーム名・略称をレギュレーションにも保存（成績表等で使用）
        newSeasonData.settings.teamNames = teamNames;
        newSeasonData.settings.teamAbbreviations = customAbbreviations || teamNames.map((_, i) => String.fromCharCode(0xFF21 + i));
        newSeasonData.settings.preset = regulations.preset || null;

        setLeagueConfig({
          format: regulations.leagueFormat || 'single',
          teamsPerLeague: teamCount,
          leagues: [{ name: 'リーグ', teams: teamNames }]
        });

        // スケジュール生成（60試合未満は4月開始、140試合以上は3月後半開始）
        const schedule = generateFullSeasonSchedule({
          teams: teamNames,
          gamesPerSeason: regulations.gamesPerSeason || 60,
          startDate: { year: 2024, month: 4, day: 1 },
          endDate: { year: 2024, month: 9, day: 30 },
          leagueFormat: regulations.leagueFormat || 'single',
          leagueNames: regulations.leagueNames
        });

        newSeasonData.schedule = schedule;
        newSeasonData.standings = initializeStandings(teamNames);

        setSeasonData(newSeasonData);
      };

      // セーブスロット管理（3スロット対応）
      const [saveSlots, setSaveSlots] = useState([null, null, null]);
      const [hasSaveData, setHasSaveData] = useState(false);
      const [hallOfFamePlayers, setHallOfFamePlayers] = useState([]);
      const [teamHistory, setTeamHistory] = useState([]); // 年度別チーム成績履歴
      const [draftResults, setDraftResults] = useState(null); // { draftedPlayers, nearMissPlayers }

      const refreshSaveSlots = async () => {
        const slots = await readSaveSlots();
        setCachedSlots(slots);
        setSaveSlots(slots);
        setHasSaveData(slots.some(s => s !== null));
      };

      useEffect(() => {
        refreshSaveSlots();
      }, []);

      // LEAGUE_SETTINGSをseasonDataと同期
      useEffect(() => {
        LEAGUE_SETTINGS.useDH = seasonData?.settings?.useDH || false;
      }, [seasonData?.settings?.useDH]);

      const [autoSaveFlash, setAutoSaveFlash] = useState(false); // オートセーブ完了の一時表示

      const saveGame = async (slotIndex = 0, onProgress) => {
        const result = await saveGameToSlot(slotIndex, {
          seasonData, leagueConfig, screenMode, managementView,
          gameFlowState, gameMode, selectedMonth, hallOfFamePlayers, teamHistory
        }, onProgress);
        if (result.success) await refreshSaveSlots();
        return result;
      };

      // 画面スケール（ズーム）: 'auto'はビューポート幅に合わせて自動縮小し、
      // 情報量・レイアウトを保ったまま1画面に収める（横はみ出し・スクロールバー抑制）。
      React.useEffect(() => {
        const applyFit = () => {
          const root = document.getElementById('root');
          if (!root) return;
          const scale = getUiScale();
          if (scale !== 'auto') { root.style.zoom = scale; return; }
          root.style.zoom = '1'; // 一旦等倍で自然幅を測る
          const natural = root.scrollWidth;
          const vw = document.documentElement.clientWidth;
          root.style.zoom = natural > vw ? String(Math.max(0.5, vw / natural)) : '1';
        };
        const schedule = () => requestAnimationFrame(applyFit);
        schedule();
        window.addEventListener('resize', schedule);
        window.addEventListener(UISCALE_EVENT, schedule);
        return () => {
          window.removeEventListener('resize', schedule);
          window.removeEventListener(UISCALE_EVENT, schedule);
        };
        // gameStarted はここより後で宣言されるため依存に入れない（TDZ回避）。
        // 画面遷移(screenMode等)とresize/uiscalechangeで再フィットは十分カバーされる。
      }, [screenMode, managementView, gameFlowState]);

      // クラッシュ時の緊急保存用に、現在のゲーム状態を返すスナップショットを登録
      React.useEffect(() => {
        setGameSnapshotProvider(() => ({
          seasonData, leagueConfig, screenMode, managementView,
          gameFlowState, gameMode, selectedMonth, hallOfFamePlayers, teamHistory,
        }));
      }, [seasonData, leagueConfig, screenMode, managementView, gameFlowState, gameMode, selectedMonth, hallOfFamePlayers, teamHistory]);

      // ロード結果(saveData)を各stateへ適用する共通処理（通常ロード/オートセーブロード共用）
      const applyLoadedGame = (result) => {
        if (!result.success) return result;
        const saveData = result.data;
        if (saveData.seasonData) setSeasonData(saveData.seasonData);
        if (saveData.leagueConfig) setLeagueConfig(saveData.leagueConfig);
        if (saveData.selectedMonth) setSelectedMonth(saveData.selectedMonth);
        if (saveData.hallOfFamePlayers) setHallOfFamePlayers(saveData.hallOfFamePlayers);
        if (saveData.teamHistory) setTeamHistory(saveData.teamHistory);
        const loadedMode = saveData.gameMode || 'normal';
        setGameMode(loadedMode);

        // 独立モードの旧セーブ: 自リーグのチームに独立リーグ用マーカーが無いと
        // チームランキング/トレードから漏れるため、ロード時に補完する
        if (loadedMode === 'normal') {
          ensureUserIndependentLeagueTagged(
            saveData.seasonData?.settings?.teamNames || [],
            saveData.seasonData?.settings?.preset || null
          );
          // 旧バージョンの年度移行バグで並行世界（他の独立リーグ・社会人・大学）が
          // 削除されたセーブを復旧する。社会人/大学チームが1つも無ければ欠落と判断。
          const hasParallel = Object.values(TEAMS_DATA).some(t => t.corporateTeamId || t.universityTeamId);
          if (!hasParallel) {
            const userLeague = WORLD_DATA.userLeagueId || saveData.seasonData?.settings?.preset || null;
            recoverMissingParallelTeams(userLeague);
          }
        }

        initializeAllPlayersCondition();

        setScreenMode('management');
        // オフシーズンで保存された場合はオフシーズン画面に戻す（12/1等の日付が日程画面に表示されるバグを防ぐ）
        const savedPhase = saveData.seasonData?.phase;
        if (savedPhase === 'off_season') {
          setManagementView('offseason');
        } else {
          setManagementView('dateprogress');
        }
        setGameFlowState('season');
        return result;
      };

      const loadGame = async (slotIndex = 0) => {
        const result = await loadGameFromSlot(slotIndex);
        return applyLoadedGame(result);
      };

      // オートセーブ枠からロード
      const loadAutosave = async () => {
        const result = await loadGameFromSlot(0, AUTOSAVE_KEY);
        return applyLoadedGame(result);
      };

      // オートセーブ: 月替わり・年替わりの節目で自動保存（手動3スロットとは別枠）
      const _autoSaveKey = seasonData ? `${seasonData.year}-${seasonData.currentDate?.month}` : null;
      const _prevAutoSaveKey = React.useRef(null);
      React.useEffect(() => {
        if (!_autoSaveKey || gameFlowState !== 'season') return;
        // 初回（ロード直後等）はスキップし、以降の節目変化でのみ保存
        if (_prevAutoSaveKey.current === null) { _prevAutoSaveKey.current = _autoSaveKey; return; }
        if (_prevAutoSaveKey.current === _autoSaveKey) return;
        _prevAutoSaveKey.current = _autoSaveKey;
        if (!isAutosaveEnabled()) return;
        // オートセーブは全世界(数百チーム)のシリアライズで数百ms〜メインスレッドを占有する。
        // 月替わりの日程進行をブロックしないよう、アイドル時間へ逃がして実行する
        // （画面の切り替わりを先に描画し、保存は空き時間に行う）。
        const runAutoSave = () => {
          autoSave({
            seasonData, leagueConfig, screenMode, managementView,
            gameFlowState, gameMode, selectedMonth, hallOfFamePlayers, teamHistory,
          }).then(r => { if (r.success) { setAutoSaveFlash(true); setTimeout(() => setAutoSaveFlash(false), 2000); } });
        };
        const ric = typeof window !== 'undefined' && window.requestIdleCallback;
        if (ric) {
          const id = window.requestIdleCallback(runAutoSave, { timeout: 4000 });
          return () => window.cancelIdleCallback?.(id);
        }
        const t = setTimeout(runAutoSave, 300);
        return () => clearTimeout(t);
      }, [_autoSaveKey, gameFlowState]);

      const deleteSave = async (slotIndex = 0) => {
        const result = await deleteSaveSlot(slotIndex);
        if (result) await refreshSaveSlots();
        return result;
      };

      // 後方互換性のため、既存の変数名でもアクセス可能にする
      const seasonYear = seasonData?.year || 1;
      const currentDate = seasonData?.currentDate || { year: 2024, month: 3, day: 1 };
      const currentPhase = seasonData?.phase || SEASON_PHASES.REGULAR_SEASON;
      const leagueStandings = seasonData?.standings || [];
      const springStandings = seasonData?.springStandings || null;

      // 変化球の効果設定（外部ファイルから読み込み）
      const [ballEffects, setBallEffects] = useState(BALL_EFFECTS);

      // レギュレーション設定（拡張可能な設定）
      const [maxExtraInnings, setMaxExtraInnings] = useState(12);  // 延長最大回数（変更可能）

      // 試合状態（先に定義が必要）
      const [isTopInning, setIsTopInning] = useState(true);
      const [inning, setInning] = useState(1);
      const [score, setScore] = useState({ home: 0, away: 0 });
      const [gameOver, setGameOver] = useState(false);  // 試合終了フラグ
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
      const isSubstituting = React.useRef(false);  // 交代処理中フラグ（二重実行防止）
      // 采配モード（日程進行から起動した試合）
      const [managedGameInfo, setManagedGameInfo] = useState(null);  // { gameId, home, away, otherGames }
      const managedGameInfoRef = useRef(null);
      const advanceDayRef = useRef(null);
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
      // 現在のイニングの得点（イニング終了時にinningScoresに反映）
      const [currentInningScore, setCurrentInningScore] = useState({ away: 0, home: 0 });
      // チーム別安打・エラー・打点
      const [teamHits, setTeamHits] = useState({ home: 0, away: 0 });
      const [teamErrors, setTeamErrors] = useState({ home: 0, away: 0 });
      const [teamRBIs, setTeamRBIs] = useState({ home: 0, away: 0 });
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
      // 采配モードの bases は boolean 配列で走者を識別できないため、
      // 「失策で免れたアウト数」と「失策で出塁した走者の在塁数」をイニング単位で数える。
      // 得点時に (a) 失策出塁の走者ぶん (b) 失策が無ければ既に3アウトだった後の得点 を非自責とする。
      const inningErrorOutsRef = React.useRef(0);
      const errorRunnersOnBaseRef = React.useRef(0);
      // イニング開始時に呼ぶ（両カウンタをリセット）
      const resetEarnedRunTracking = () => {
        inningErrorOutsRef.current = 0;
        errorRunnersOnBaseRef.current = 0;
      };
      // 失点のうち自責点となる数を返し、消費した非自責走者を減算する
      const takeEarnedRuns = (runs, currentOuts) => {
        if (runs <= 0) return 0;
        if ((currentOuts + inningErrorOutsRef.current) >= 3) return 0; // (b) 想定3アウト後は全て非自責
        const unearned = Math.min(runs, errorRunnersOnBaseRef.current); // (a) 失策出塁の走者ぶん
        errorRunnersOnBaseRef.current -= unearned;
        return Math.max(0, runs - unearned);
      };
      // 犠飛・暴投・スクイズ等の失点を現在の投手の個人成績にも反映する。
      // （これらは従来ボックススコア用の集計にしか加算されておらず、
      //   個人の失点・防御率に載っていなかった）
      const recordRunsToCurrentPitcher = (runs, currentOuts) => {
        if (runs <= 0) return;
        const p = getCurrentPitcher();
        if (!p) return;
        const defenseTeamType = isTopInning ? 'home' : 'away';
        const earned = takeEarnedRuns(runs, currentOuts);
        updatePitcherStats(p.id, defenseTeamType, {
          runsAllowed: (p.stats?.pitching?.runsAllowed || 0) + runs,
          earnedRuns: (p.stats?.pitching?.earnedRuns || 0) + earned,
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
      
      // 互換性のため players を動的に取得
      const players = isTopInning ? homeTeam.players : awayTeam.players;  // 守備側
      const setPlayers = isTopInning 
        ? (fn) => setHomeTeam(prev => ({...prev, players: typeof fn === 'function' ? fn(prev.players) : fn}))
        : (fn) => setAwayTeam(prev => ({...prev, players: typeof fn === 'function' ? fn(prev.players) : fn}));
      
      const [editingPlayer, setEditingPlayer] = useState(null);  // 編集中の選手
      const [editingTeam, setEditingTeam] = useState('home');  // 編集中のチーム
      const [showEditScreen, setShowEditScreen] = useState(false);  // エディット画面表示フラグ
      
      // 選手成績更新関数（元の定義を維持）
      const updateBatterStats = (playerId, teamType, statUpdates) => {
        const setTeam = teamType === 'home' ? setHomeTeam : setAwayTeam;
        setTeam(prev => ({
          ...prev,
          players: prev.players.map(p =>
            p.id === playerId
              ? {
                  ...p,
                  stats: { ...(p.stats || {}), batting: { ...(p.stats?.batting || {}), ...statUpdates } },
                  gameStats: { ...(p.gameStats || {}), ...statUpdates }
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

      const updatePitcherStats = (playerId, teamType, statUpdates) => {
        const setTeam = teamType === 'home' ? setHomeTeam : setAwayTeam;
        setTeam(prev => ({
          ...prev,
          players: prev.players.map(p =>
            p.id === playerId
              ? { ...p, stats: { ...(p.stats || {}), pitching: { ...(p.stats?.pitching || {}), ...statUpdates } } }
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
      
      // 現在の投手を取得（守備チームから）
      const getCurrentPitcher = () => {
        const team = getDefenseTeam();
        return team.players.find(p => p.isStarter && p.position === 'pitcher') || team.players[8];
      };

      // 現在の捕手を取得（守備チームから）
      const getCurrentCatcher = () => {
        const team = getDefenseTeam();
        return team.players.find(p => p.isStarter && p.position === 'catcher') || team.players[7];
      };

      // ※ formatInnings, getAbilityColor, getAbilityTextColor, getBestFitPosition は
      //    js/utils/physics.js に移動済み（グローバルスコープで利用可能）

      // 能力値バーを表示するコンポーネント（コンパクト版）
      const AbilityBar = ({ label, value }) => (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400 w-3">{label}</span>
          <div className="flex-1 bg-gray-700 rounded-full h-1 overflow-hidden">
            <div
              className={`h-full ${getAbilityColor(value)} transition-all`}
              style={{ width: `${value}%` }}
            />
          </div>
          <span className="text-xs text-gray-300 w-4 text-right font-mono">{value}</span>
        </div>
      );


      // 監督AI関数（→ aiManager.js に抽出済み、ラッパーのみ）
      const aiManagerCtx = () => ({
        autoManagerMode, gameStarted, isSubstituting,
        getDefenseTeam, getOffenseTeam, getCurrentPitcher, getCurrentBatter,
        isTopInning, setHomeTeam, setAwayTeam,
        homeTeam, awayTeam, currentStamina, score, bases, inning,
        setCurrentStamina, setGameLog
      });
      const autoSubstitutePitcher = () => executeAutoSubstitutePitcher(aiManagerCtx());
      const autoSubstitutePinchHitter = () => executeAutoSubstitutePinchHitter(aiManagerCtx());
      const autoDefensiveSubstitution = () => executeAutoDefensiveSubstitution(aiManagerCtx());
      const autoStealingDecision = (runner, situation) => executeAutoStealingDecision(aiManagerCtx(), runner, situation);
      const autoOptimizePitcherUsage = () => executeAutoOptimizePitcherUsage(aiManagerCtx());

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
      
      // 選手編集用の関数
      // チーム対応の選手更新関数
      const updatePlayer = (playerId, updates) => {
        if (editingTeam === 'home') {
          setHomeTeam(prev => ({
            ...prev,
            players: prev.players.map(p => p.id === playerId ? { ...p, ...updates } : p)
          }));
        } else {
          setAwayTeam(prev => ({
            ...prev,
            players: prev.players.map(p => p.id === playerId ? { ...p, ...updates } : p)
          }));
        }
      };
      
      const updatePlayerBatting = (playerId, battingUpdates) => {
        if (editingTeam === 'home') {
          setHomeTeam(prev => ({
            ...prev,
            players: prev.players.map(p => 
              p.id === playerId ? { ...p, batting: { ...p.batting, ...battingUpdates } } : p
            )
          }));
        } else {
          setAwayTeam(prev => ({
            ...prev,
            players: prev.players.map(p => 
              p.id === playerId ? { ...p, batting: { ...p.batting, ...battingUpdates } } : p
            )
          }));
        }
      };
      
      const updatePlayerFielding = (playerId, fieldingUpdates) => {
        if (editingTeam === 'home') {
          setHomeTeam(prev => ({
            ...prev,
            players: prev.players.map(p => 
              p.id === playerId ? { ...p, fielding: { ...p.fielding, ...fieldingUpdates } } : p
            )
          }));
        } else {
          setAwayTeam(prev => ({
            ...prev,
            players: prev.players.map(p => 
              p.id === playerId ? { ...p, fielding: { ...p.fielding, ...fieldingUpdates } } : p
            )
          }));
        }
      };
      
      const updatePlayerPitching = (playerId, pitchingUpdates) => {
        if (editingTeam === 'home') {
          setHomeTeam(prev => ({
            ...prev,
            players: prev.players.map(p => 
              p.id === playerId && p.pitching ? { ...p, pitching: { ...p.pitching, ...pitchingUpdates } } : p
            )
          }));
        } else {
          setAwayTeam(prev => ({
            ...prev,
            players: prev.players.map(p => 
              p.id === playerId && p.pitching ? { ...p, pitching: { ...p.pitching, ...pitchingUpdates } } : p
            )
          }));
        }
      };
      
      // 既存のstate（互換性のために残す）

      const [batter, setBatter] = useState({
        name: '打者A',
        meet: 60,
        power: 60,
        eye: 60,
        speed: 60,  // 走力（成功率に影響）
        steal: 50,  // 盗塁スキル（試行率と成功率に影響）
        bats: 'right'  // 'right', 'left', or 'switch'
      });

      const [pitcher, setPitcher] = useState({
        name: '投手B',
        velocity: 145,
        control: 60,
        stamina: 200,  // スタミナ追加
        throws: 'right',  // 'right' or 'left' を追加
        pitches: [  // breakingBalls → pitches に変更
          { id: 1, type: 'straight', level: 100 },  // ストレートは常に習得済み
          { id: 2, type: 'slider', level: 50 },
          { id: 3, type: 'curve', level: 50 },
          { id: 4, type: 'fork', level: 50 }
        ]
      });

      // 現在のスタミナを管理
      const [currentStamina, setCurrentStamina] = useState(200);

      const [catcher, setCatcher] = useState({
        name: 'キャッチャーC',
        lead: 50,
        arm: 70,
        throws: 'right'  // 投げる腕
      });
      
      // 守備パラメータ（ポジション別）
      const [defense, setDefense] = useState({
        // バッテリー
        pitcher: { defense: 60, speed: 60, arm: 60, throws: 'right' },    // 投手
        catcher: { defense: 60, speed: 60, arm: 60, throws: 'right' },    // 捕手
        // 内野
        first: { defense: 60, speed: 60, arm: 60, throws: 'right' },      // 一塁手
        second: { defense: 60, speed: 60, arm: 60, throws: 'right' },     // 二塁手
        short: { defense: 60, speed: 60, arm: 60, throws: 'right' },      // 遊撃手
        third: { defense: 60, speed: 60, arm: 60, throws: 'right' },      // 三塁手
        // 外野
        left: { defense: 60, speed: 60, arm: 60, throws: 'right' },       // 左翼手
        center: { defense: 60, speed: 60, arm: 60, throws: 'right' },     // 中堅手
        right: { defense: 60, speed: 60, arm: 60, throws: 'right' }       // 右翼手
      });

      const [gameLog, setGameLog] = useState([]);
      const [lastResult, setLastResult] = useState(null);
      const [isAutoSimulating, setIsAutoSimulating] = useState(false);
      const [statistics, setStatistics] = useState(null);
      
      // 直近の投球履歴（球速）
      const [recentVelocities, setRecentVelocities] = useState([]);
      
      // 打者・投手の成績
      const [batterStats, setBatterStats] = useState({
        plateAppearances: 0, // 打席数
        atBats: 0,
        hits: 0,
        homeruns: 0,
        walks: 0,
        hitByPitch: 0,
        strikeouts: 0,
        totalBases: 0,
        stolenBases: 0,       // 盗塁成功数
        caughtStealing: 0     // 盗塁失敗数
      });
      
      const [pitcherStats, setPitcherStats] = useState({
        pitches: 0,
        outs: 0,
        strikeouts: 0,
        walks: 0,
        hitBatters: 0,   // 与死球
        runsAllowed: 0,
        errors: 0,  // エラー数
        wildPitches: 0,  // 暴投数を追加
        doublePlay: 0  // 併殺打
      });
      
      // 捕手統計を追加
      const [catcherStats, setCatcherStats] = useState({
        stolenBasesAllowed: 0,  // 盗塁許可数
        caughtStealing: 0,      // 盗塁刺
        wildPitchesBlocked: 0   // 暴投阻止数
      });
      
      // 打球統計
      const [battedBallStats, setBattedBallStats] = useState({
        innerGrounder: { total: 0, hits: 0 }, // 内野ゴロ
        innerLiner: { total: 0, hits: 0 },    // 内野ライナー
        innerFly: { total: 0, hits: 0 },      // 内野フライ
        shallowOuter: { total: 0, hits: 0 },  // 浅い外野
        outerLiner: { total: 0, hits: 0 },    // 外野ライナー
        shallowFly: { total: 0, hits: 0 },    // 浅いフライ
        mediumFly: { total: 0, hits: 0 },     // 中堅フライ
        deepFly: { total: 0, hits: 0 },       // 深いフライ
        outerGrounder: { total: 0, hits: 0 }, // 外野ゴロ
        homerun: { total: 0, hits: 0 }        // 本塁打
      });
      
      // 打球タイプ別統計
      const [battedBallTypeStats, setBattedBallTypeStats] = useState({
        grounder: 0,  // ゴロ
        liner: 0,     // ライナー
        fly: 0,       // フライ
        popup: 0      // ポップフライ
      });
      
      // 打球方向別統計（5方向）
      const [battedBallDirectionStats, setBattedBallDirectionStats] = useState({
        left: 0,        // 左
        leftCenter: 0,  // 左中間
        center: 0,      // 中央
        rightCenter: 0, // 右中間
        right: 0        // 右
      });
      
      // 打球エリア別統計（方向×タイプ）- 詳細版（5方向×5タイプ）
      const [battedBallAreaStats, setBattedBallAreaStats] = useState({
        'left-homerun': { total: 0, outs: 0, hits: 0 },
        'left-fly': { total: 0, outs: 0, hits: 0 },
        'left-liner': { total: 0, outs: 0, hits: 0 },
        'left-popup': { total: 0, outs: 0, hits: 0 },
        'left-grounder': { total: 0, outs: 0, hits: 0 },
        'leftCenter-homerun': { total: 0, outs: 0, hits: 0 },
        'leftCenter-fly': { total: 0, outs: 0, hits: 0 },
        'leftCenter-liner': { total: 0, outs: 0, hits: 0 },
        'leftCenter-popup': { total: 0, outs: 0, hits: 0 },
        'leftCenter-grounder': { total: 0, outs: 0, hits: 0 },
        'center-homerun': { total: 0, outs: 0, hits: 0 },
        'center-fly': { total: 0, outs: 0, hits: 0 },
        'center-liner': { total: 0, outs: 0, hits: 0 },
        'center-popup': { total: 0, outs: 0, hits: 0 },
        'center-grounder': { total: 0, outs: 0, hits: 0 },
        'rightCenter-homerun': { total: 0, outs: 0, hits: 0 },
        'rightCenter-fly': { total: 0, outs: 0, hits: 0 },
        'rightCenter-liner': { total: 0, outs: 0, hits: 0 },
        'rightCenter-popup': { total: 0, outs: 0, hits: 0 },
        'rightCenter-grounder': { total: 0, outs: 0, hits: 0 },
        'right-homerun': { total: 0, outs: 0, hits: 0 },
        'right-fly': { total: 0, outs: 0, hits: 0 },
        'right-liner': { total: 0, outs: 0, hits: 0 },
        'right-popup': { total: 0, outs: 0, hits: 0 },
        'right-grounder': { total: 0, outs: 0, hits: 0 }
      });

      const addPitch = () => {
        const newId = pitcher.pitches.length > 0 
          ? Math.max(...pitcher.pitches.map(b => b.id)) + 1 
          : 1;
        setPitcher({
          ...pitcher,
          pitches: [...pitcher.pitches, { id: newId, type: 'slider', level: 50 }]
        });
      };

      const removePitch = (id) => {
        // ストレート（id=1）は削除不可
        if (id === 1) return;
        setPitcher({
          ...pitcher,
          pitches: pitcher.pitches.filter(b => b.id !== id)
        });
      };

      const updatePitch = (id, field, value) => {
        setPitcher({
          ...pitcher,
          pitches: pitcher.pitches.map(b => 
            b.id === id ? { ...b, [field]: value } : b
          )
        });
      };

      const updateBallEffect = (type, field, value) => {
        setBallEffects({
          ...ballEffects,
          [type]: { ...ballEffects[type], [field]: parseFloat(value) }
        });
      };

      const getCountAdjustment = (balls, strikes) => {
        if (balls === 3 && strikes <= 1) {
          return { strikeZone: 0.7, swingRate: 0.6 };
        }
        if (strikes === 2) {
          return { strikeZone: 1.2, swingRate: 1.3 };
        }
        return { strikeZone: 1.0, swingRate: 1.0 };
      };

      // ※ getStaminaPenalty, getInfielderEffectiveArm, getHandednessEffect は
      //    js/utils/physics.js に移動済み（グローバルスコープで利用可能）

      /**
       * 物理演算ベースのコンタクト結果判定（新エンジン）
       */
      const determineContactResultPhysics = (selectedBall, predictionCorrect, tempoGroundballBonus = 0, handEffect = {}, actualVelocity = 145, batter = null, pitcher = null, defense = null, catcher = null, lastPitchArg = null, pitchLoc = null) => {
        const effectiveBatter = batter || { meet: 60, power: 60, eye: 60, speed: 60 };
        const effectiveCatcher = catcher || { lead: 50 };
        const safeCount = count || { balls: 0, strikes: 0 };

        // 前球情報（トンネリング用） - 引数で渡された場合はそれを使用、なければgameLogから取得
        const lastPitch = lastPitchArg !== null ? lastPitchArg : (gameLog.length > 0 ? gameLog[gameLog.length - 1] : null);
        const currentPitch = {
          type: selectedBall?.type || 'straight',
          velocity: actualVelocity,
          level: selectedBall?.level || 100
        };

        // トンネリング効果を計算
        const tunnelingEffect = getTunnelingEffect(lastPitch, currentPitch, effectiveCatcher.lead);

        // 【新物理モデル】タイミングウィンドウベースのコンタクト計算
        const physicsResult = calculatePhysicsContact(
          pitcher,
          effectiveBatter,
          predictionCorrect,
          currentPitch,
          tunnelingEffect,
          handEffect
        );

        // 崩されたか（芯品質）を打席の記憶に残す。次の球の振り方に効く。
        // ※ pitchSeqRef は ref なので別関数からでも安全に参照できる
        pushSwingQuality(pitchSeqRef.current.seq,
          physicsResult.isContact ? physicsResult.meetQuality : null);

        // 空振り判定（物理モデルから）
        if (!physicsResult.isContact) {
          return {
            type: 'swinging_strike',
            description: `空振り（窓${physicsResult.timingWindow.toFixed(1)}ms/誤差${physicsResult.timingError.toFixed(1)}ms）`,
            timingWindow: physicsResult.timingWindow,
            timingError: physicsResult.timingError,
            pitchType: ballEffects[currentPitch.type]?.name || 'ストレート',
            velocity: Math.round(actualVelocity)
          };
        }

        // ===== ファウル判定（大幅強化）=====
        // ミート品質が低いほどファウルになりやすい
        const foulBaseRate = 0.35;  // 基本ファウル率35%
        const qualityPenalty = (1 - physicsResult.meetQuality) * 0.25;  // 芯を外すほど+25%
        let foulRate = foulBaseRate + qualityPenalty;

        // 2ストライク時は粘りやすい（ファウル率上昇）
        if (safeCount.strikes === 2) {
          foulRate += 0.10;
        }

        const pitchTypeName = ballEffects[currentPitch.type]?.name || 'ストレート';
        const roundedVelocity = Math.round(actualVelocity);

        if (Math.random() < foulRate) {
          if (safeCount.strikes === 2) {
            return { type: 'foul_2strike', description: 'ファウル', pitchType: pitchTypeName, velocity: roundedVelocity };
          }
          return { type: 'foul', description: 'ファウル', pitchType: pitchTypeName, velocity: roundedVelocity };
        }

        // 物理演算で打球パラメータを計算
        const battedBall = calculateBattedBallPhysics(effectiveBatter, pitcher, currentPitch, physicsResult, pitchLoc, lastPitch);

        // 角度によるファウル判定（強化）
        if (Math.abs(battedBall.direction) > 30 && Math.random() < 0.70) {  // 55%→70%
          if (safeCount.strikes === 2) {
            return { type: 'foul_2strike', description: 'ファウル', pitchType: pitchTypeName, velocity: roundedVelocity };
          }
          return { type: 'foul', description: 'ファウル', pitchType: pitchTypeName, velocity: roundedVelocity };
        }

        // 打球統計を記録
        const battedBallType = battedBall.launchAngle < 10 ? 'grounder' :
                               battedBall.launchAngle < 25 ? 'liner' :
                               battedBall.launchAngle < 50 ? 'fly' : 'popup';

        setBattedBallTypeStats(prev => ({
          ...prev,
          [battedBallType]: prev[battedBallType] + 1
        }));

        // 打球方向を記録
        let ballDirection;
        if (battedBall.direction < -20) ballDirection = 'left';
        else if (battedBall.direction < -5) ballDirection = 'leftCenter';
        else if (battedBall.direction <= 5) ballDirection = 'center';
        else if (battedBall.direction <= 20) ballDirection = 'rightCenter';
        else ballDirection = 'right';

        setBattedBallDirectionStats(prev => ({
          ...prev,
          [ballDirection]: prev[ballDirection] + 1
        }));

        // 時間競合モデルで守備判定
        const fieldingResult = judgeFielderReach(battedBall, defense, effectiveBatter);

        // 結果を変換して返す
        // ⚠ **自動シミュレーションと同じ情報を持たせること**。以前は 'out' にしか
        //   fieldingPosition が載っておらず、采配モードだけ
        //   「積極進塁で使う外野手の肩」と「守備成績の記録先」が分からなかった。
        const fp = fieldingResult.fieldingPosition;
        const ep = fieldingResult.errorPosition;
        const resultMap = {
          'homerun': { type: 'homerun', description: fieldingResult.description, hit: true },
          'triple': { type: 'triple', description: fieldingResult.description, hit: true, fieldingPosition: fp },
          'double': { type: 'double', description: fieldingResult.description, hit: true, fieldingPosition: fp },
          'single': { type: 'single', description: fieldingResult.description, hit: true,
            isError: fieldingResult.isError, errorPosition: ep, fieldingPosition: fp },
          'out': {
            type: 'out',
            description: fieldingResult.description,
            hit: false,
            // 打席結果を「中飛」「右直」と書くのに使う（バッジの表記を揃えるため）
            fieldingPosition: fp,
            isOutfieldFly: fieldingResult.isOutfieldFly,
            // 内野ゴロは走者を進める（ゴロGO・進塁打）。フライ・ライナーは進まない
            isGroundOut: battedBall.launchAngle < 10 && !fieldingResult.isOutfieldFly,
            tagupThrowbackChance: fieldingResult.tagupThrowbackChance
          }
        };

        const result = resultMap[fieldingResult.result] || resultMap['out'];

        // 打球データを結果に付加（統計ログ用）
        return {
          ...result,
          ballDirection,
          exitVelocity: battedBall.exitVelocity,
          launchAngle: battedBall.launchAngle,
          distance: battedBall.distance,
          meetQuality: battedBall.meetQuality,
          v_swing: physicsResult.v_swing,
          timingWindow: physicsResult.timingWindow,
          timingError: physicsResult.timingError
        };
      };

      // 共通投球シミュレーション関数（通常試合・自動シミュレーション共用）
      const simulateSinglePitch = (batter, pitcher, catcher, defense, count, currentStamina, sequence = null) => {
        // 前球（打席内の配球メモリ。自動シミュレーションと共有 / pitchSequence.js）
        const lastPitch = lastCall(sequence);
        // この場面で捕手が求める結果（併殺狙い / 三振狙い / 通常。pitchSituation.js）
        const objective = decidePitchObjective(bases, outs);
        // スタミナを1減らす
        const newStamina = Math.max(0, currentStamina - 1);

        // スタミナによる能力補正を取得
        const { velocityPenalty, controlPenalty } = getStaminaPenalty(newStamina, pitcher.stamina);

        // countのデフォルト値設定
        const safeCount = count || { balls: 0, strikes: 0 };
        const adjustment = getCountAdjustment(safeCount.balls, safeCount.strikes);

        // まず球種を選択（全ての球種から選ぶ）
        const totalPitchTypes = pitcher.pitches.length;

        // 打者の狙い球（自動シミュレーションと共有。pitchCalling.js）。
        // 従来はリード係数が0.02しかなく、3球種の投手でリード100でも
        // 的中率が 0.313→0.273 と13%しか下がらなかった。
        const predictionCorrect = Math.random() < guessSuccessRate({
          catcherLead: catcher.lead ?? 50,
          // 持ち球の「幅」で読まれにくさが決まる（arsenal.js）
          arsenalSize: effectiveArsenalSize(pitcher.pitches),
          batterEye: batter.eye,
        });

        // 捕手のリードで球種を選ぶ（自動シミュレーションと共有。pitchCalling.js）。
        // 従来はここだけがスコア選択で、自動側は変化球を完全ランダムに選んでいた。
        let pitchChoice;
        let selectedBall;
        {
          const chosen = selectPitchType({
            arsenal: pitcher.pitches,
            catcherLead: catcher.lead ?? 50,
            form: pitcher.form || 'threeQuarter',
            strikes: safeCount.strikes,
            ballEffects,
            // 奥行き: 速球のあとは変化球、変化球のあとは速球
            lastWasBreaking: lastPitch ? lastPitch.isBreaking : null,
            // 場面: 走者一塁ならゴロ系、走者三塁なら空振り系の決め球
            objective: objective.goal,
          });
          pitchChoice = Math.max(0, pitcher.pitches.indexOf(chosen));
        }

        // プレイヤーが球種を指定していればそれを使う（'auto' は捕手のリードに任せる）
        const aimedTypeIndex = pitchTypeIndexRef.current;
        if (aimedTypeIndex !== 'auto' && pitcher.pitches[aimedTypeIndex]) {
          pitchChoice = Number(aimedTypeIndex);
        }
        selectedBall = pitcher.pitches[pitchChoice];

        // スタミナペナルティのみ。変化球のばらつきは pitchShape.shapeSigma に一本化
        // （旧 ballControlPenalty。自動シミュとは係数が違っていた）
        const effectiveControl = Math.max(0, pitcher.control + controlPenalty);

        // ===== 配球 → 投球位置 → スイング判定 =====
        // 自動シミュレーションと同じ共有モデル（src/game/pitchCalling.js）を使う。
        // 以前は采配モードだけ「ゾーン率=0.25+制球*0.65（制球60で64%）」という
        // 独自式で、自動モードの48%と全く違う世界になっていた。
        const isBreakingPitch = selectedBall.type !== 'straight';
        // プレイヤーが狙いを指定していればそれを使う（'auto' は捕手AIに任せる）
        const aimChoice = pitchAimRef.current;
        const aim = (aimChoice && aimChoice !== 'auto') ? aimChoice : callPitchTarget({
          balls: safeCount.balls, strikes: safeCount.strikes, batterEye: batter.eye,
          catcherLead: catcher.lead ?? 50,
          pitcherControl: effectiveControl, objective,
        });
        // 投球フォームの効果を適用（球速は配球の「奥行き」に使うので位置決定より前に出す）
        const pitchingFormEffect = PITCHING_FORM_EFFECTS[pitcher.form] || PITCHING_FORM_EFFECTS.threeQuarter;
        let baseVelocity = Math.round(pitcher.velocity * (pitchingFormEffect.velocityMult || 1.0)) + velocityPenalty;
        baseVelocity -= ballEffects[selectedBall.type].velocityMinus;
        const actualVelocity = Math.round(baseVelocity - (Math.random() * 8));

        const loc = resolvePitchLocation({
          aim, control: effectiveControl, catcherDefense: catcher.defense ?? 50,
          // 捕手は打者の弱点コースを要求する（狙いの配分は変えない）
          batterZone: batter.zone, catcherLead: catcher.lead ?? 50,
          // 前球との関係（対角へ動かす／同じ引き出しを続けない）
          sequence, velocity: actualVelocity, isBreaking: isBreakingPitch,
          // 場面: 併殺が欲しければ低め、三振が欲しければ高め
          objective: objective.goal,
          // 球種に合ったコースと、変化球レベルによる決まりやすさ
          pitchType: selectedBall.type, pitchLevel: selectedBall.level ?? 50,
          pitcherThrows: pitcher.throws, batterBats: batter.bats,
        });
        const isInStrikeZone = loc.inZone;

        // 揺さぶれた球は打ちにくく、同じ所へ続けた球は打たれやすい（リーグ平均で±0）
        const shiftMeet = shiftMeetAdjust(sequenceShift(lastPitch,
          { col: loc.col, row: loc.row, velocity: actualVelocity }));
        // 同じ引き出しが続くと打者に読まれる（効果は球種の読みと同じ）
        // 打者の狙い球（コース）。捕手の要求の偏りと引き出しの繰り返しで読む
        const locationRead = Math.random()
          < locationReadChance(sequence, loc.col, loc.row, isBreakingPitch, batter.eye, loc.readSignal);

        // そのセルが打者にとってどれだけ苦手か。スイング判断・打撃補正・振り方で共有する
        const weakness = zoneWeaknessAt(loc, batter.zone);

        // 采配: 自チームの攻撃中はプレイヤーが狙い球を張れる。
        // 張った次元はAIの読み合いを置き換える（当たれば+1 / 外せば-1）。
        const userIsBatting = (isTopInning ? awayTeam.name : homeTeam.name) === userTeamName;
        const gType = userIsBatting ? batGuessTypeRef.current : 'auto';
        const gZone = userIsBatting ? batGuessZoneRef.current : 'auto';
        const committed = gType !== 'auto' || gZone !== 'auto';
        const guess = committed
          ? resolveBatterGuess(gType, gZone, { isBreaking: isBreakingPitch, col: loc.col, row: loc.row })
          : { delta: 0 };
        // プレイヤーが張らない打者（＝相手チーム、または「おまかせ」）は
        // 打者の型（野村の4分類）に従って自分で狙う。batterType.js
        const aiG = resolveAiBatterGuess({
          type: batter.type || 'D', player: batter.player,
          balls: safeCount.balls, strikes: safeCount.strikes,
          isBreaking: isBreakingPitch, col: loc.col, guessRight: predictionCorrect,
          sequence, batterEye: batter.eye,
        });
        // プレイヤーが張った次元はAIの読みを使わない
        const anyCommit = gType !== 'auto' || gZone !== 'auto';
        const aiLevel = anyCommit ? 0 : aiG.level;
        const aiZone = gZone === 'auto' && locationRead ? 1 : 0;
        const guessLevel = Math.max(-2, Math.min(2, guess.delta + aiLevel + aiZone));
        const dirBias = anyCommit ? 0 : aiG.dirBias;
        pushCall(sequence, {
          col: loc.col, row: loc.row, isBreaking: isBreakingPitch,
          velocity: actualVelocity, type: selectedBall.type,
        });
        let swingProb = swingProbability({
          inZone: loc.inZone, quality: loc.quality, strikes: safeCount.strikes,
          batterEye: batter.eye, pitcherControl: effectiveControl,
          isBreaking: isBreakingPitch, breakingLevel: selectedBall.level || 50,
          // 打者は自分の得意コースをより振る
          zoneWeakness: weakness,
        });
        // 捕手のリードは打者の狙いを外す（スイング判断を鈍らせる）
        swingProb *= 1 - (catcher.lead / 100) * 0.08;
        swingProb *= adjustment.swingRate;
        // B型は張っていないコースを見送る（プレイヤーが張っている場合は適用しない）
        if (!anyCommit) swingProb *= (aiG.swingMult ?? 1);
        // 采配: 自チームが攻撃中のとき打撃方針を反映（待て=見送り増/積極=打ちにいく）
        if ((isTopInning ? awayTeam.name : homeTeam.name) === userTeamName) {
          const _bam = battingApproachRef.current === 'take' ? 0.55
            : battingApproachRef.current === 'aggressive' ? 1.3 : 1.0;
          swingProb *= _bam;
        }
        // 采配: エンドランは打者を必ず打ちにいかせる（走者を守るため空振りしにくく）
        // ※ throwPitch のローカル変数ではなく ref を直接参照する（simulateSinglePitch は
        //   throwPitch と別関数のためローカル変数は参照できない）。
        if (forceSwingRef.current) swingProb = Math.max(swingProb, 0.92);

        const doesSwing = Math.random() < swingProb;

        const pitchTypeName = ballEffects[selectedBall.type].name;

        // 投球位置（試合画面のコース表示用）。セル内のどこに来たかは描画時に
        // 揺らすのではなく**ここで一度だけ決める**。再レンダリングのたびに
        // 点が動いてしまうため。
        const pitchLoc = {
          col: loc.col, row: loc.row, inZone: loc.inZone, quality: loc.quality,
          // 表示のマーカー形状は球種で決まるので、生のキーを持たせる
          // （gameLog の pitchType は日本語の表示名なので逆引きできない）
          type: selectedBall.type,
          jx: Math.random(), jy: Math.random(),
        };

        if (!doesSwing) {
          decayFooled(sequence);
          // あまりにも内角へ外れた球は打者に当たる（pitchZone.js）
          // 死球は疲労が大きく溜まる。隠れたコストにしないよう投球ログにも出す
          const hbpFat = hitByPitchFatigue(actualVelocity, batter.player?.physical?.bodyStamina ?? 50);
          const result = !isInStrikeZone && Math.random() < hitByPitchChance(loc.col, loc.row)
            ? { type: 'hit_by_pitch', description: `死球（疲労+${hbpFat}）`, hbpFatigue: hbpFat }
            : isInStrikeZone
              ? { type: 'called_strike', description: '見逃しストライク' }
              : { type: 'ball', description: 'ボール' };
          return { result: { ...result, pitchType: pitchTypeName, velocity: actualVelocity, pitchLoc }, newStamina };
        }

        // 振り方: 得意コース・打者有利カウントならフルスイング、
        // 苦手コース・2ストライクなら当てにいく（swingType.js）。
        // 采配モードでは自チームの打撃方針（待て/おまかせ/積極）がここに乗る。
        const swingPower = decideSwingPower({
          weakness, balls: safeCount.balls, strikes: safeCount.strikes,
          // 前の球で崩されていれば当てにいく（pitchSequence.js）
          fooled: fooledLevel(sequence),
          meet: batter.meet, power: batter.power,
          approach: userIsBatting ? battingApproachRef.current : 'balanced',
        });
        pitchLoc.swing = swingPowerLabel(swingPower);

        // コース適性 + 振り方 + 前球からの揺さぶり（どれもリーグ平均では±0）
        const zoneMatchup = combineBatterEffects(
          combineBatterEffects(
            combineBatterEffects(getZoneMatchupEffect(loc, batter.zone),
              // 高めの速球・低めの変化球は空振りを取れる（逆は打たれる）
              getHeightPitchEffect(loc.row, isBreakingPitch)),
            getSwingPowerEffect(swingPower)),
          { meet: shiftMeet, power: shiftMeet * 0.6 });

        if (!isInStrikeZone) {
          // ボール球でもバットに当たる（引っ掛けゴロ、泳いでフライ等）。
          // 品質を落として物理エンジンに通すので、ほとんどが凡打になる。
          if (Math.random() < ballZoneContactChance(batter.eye)) {
            const handEffect = getHandednessEffect(pitcher.throws, batter.bats);
            const bz = combineBatterEffects(BALL_ZONE_PENALTY, zoneMatchup);
            const weakBatter = { ...batter, dirBias,
              meet: Math.max(1, batter.meet + bz.meet),
              power: Math.max(1, batter.power + bz.power) };
            const result = determineContactResultPhysics(selectedBall, guessLevel, 0, handEffect, actualVelocity, weakBatter, pitcher, defense, catcher, lastPitch, loc);
            return { result: { ...result, pitchType: pitchTypeName, velocity: Math.round(actualVelocity), isBallZone: true, pitchLoc }, newStamina };
          }
          pushSwingQuality(sequence, null);
          return {
            result: { type: 'swinging_strike', description: '空振り（ボール球）', pitchType: pitchTypeName, velocity: actualVelocity, pitchLoc },
            newStamina
          };
        }

        // 左右の相性効果を取得
        const handEffect = getHandednessEffect(pitcher.throws, batter.bats);

        // 【新物理モデル】空振り判定も含めて全てdetermineContactResultPhysicsに委ねる。
        // 甘く入った失投(meatball)は長打され、際どいコース(edge)は打ち損じる。
        const q = combineBatterEffects(getPitchQualityEffect(loc.quality), zoneMatchup);
        const zoneBatter = { ...batter, dirBias,
          meet: Math.max(1, Math.min(100, batter.meet + q.meet)),
          power: Math.max(1, Math.min(100, batter.power + q.power)) };
        // コースを読み切った場合も球種を読んだのと同じ効果
        const result = determineContactResultPhysics(selectedBall, guessLevel, 0, handEffect, actualVelocity, zoneBatter, pitcher, defense, catcher, lastPitch, loc);
        return { result: { ...result, pitchType: pitchTypeName, velocity: Math.round(actualVelocity), pitchLoc }, newStamina };
      };

      const simulatePitch = () => {
        // 現在の選手データを取得
        const currentBatter = getCurrentBatter();
        const currentPitcher = getCurrentPitcher();
        const currentCatcher = getCurrentCatcher();

        // コンディション補正
        const batterCondMod = CONDITION_BATTING_MODIFIER[currentBatter.condition ?? CONDITION_LEVELS.NORMAL] || 0;
        const pitcherCondMod = CONDITION_PITCHING_MODIFIER[currentPitcher.condition ?? CONDITION_LEVELS.NORMAL] || 0;

        // 精神力によるチャンス/ピンチ補正（得点圏にランナー）
        const isClutchSituation = bases[1] || bases[2];
        const batterMentalMod = isClutchSituation ? Math.round(((currentBatter.personality?.mental ?? 50) - 50) / 10) : 0;
        const pitcherMentalMod = isClutchSituation ? Math.round(((currentPitcher.personality?.mental ?? 50) - 50) / 10) : 0;

        // 選手データから必要な情報を展開
        const batter = {
          name: currentBatter.name,
          meet: currentBatter.batting.meet + batterCondMod + batterMentalMod,
          power: currentBatter.batting.power + batterCondMod + batterMentalMod,
          eye: currentBatter.batting.eye,
          speed: currentBatter.physical.speed,
          steal: currentBatter.batting.steal,
          bats: currentBatter.batting.bats,
          // コース適性（内外角・高低の得手不得手）。自動シミュレーションと同じ導出
          zone: getZoneProfile(currentBatter),
          // 打者の型と選手実体。simulateSinglePitch は別関数なので
          // currentBatter を直接は参照できない（ここで詰めて渡す）
          type: getBatterType(currentBatter),
          player: currentBatter,
        };

        const pitcher = {
          name: currentPitcher.name,
          velocity: currentPitcher.pitching.velocity,
          control: currentPitcher.pitching.control + pitcherCondMod + pitcherMentalMod,
          stamina: currentPitcher.pitching.stamina,
          throws: currentPitcher.physical.throws,
          pitches: currentPitcher.pitching.arsenal,
          form: currentPitcher.pitching.form,
          spinRate: currentPitcher.pitching.spinRate ?? 50
        };

        const catcher = {
          name: currentCatcher.name,
          lead: currentCatcher.catching.lead,
          arm: currentCatcher.physical.arm,
          defense: currentCatcher.fielding?.defense ?? 50,
          throws: currentCatcher.physical.throws
        };
        
        // 守備データ（守備チームの選手データから構築、守備位置適正を反映）
        const defenseTeam = getDefenseTeam();
        const defense = {};
        defenseTeam.players.forEach(player => {
          const fitness = player.positionFitness?.[player.position] ?? 50;
          const fitMult = 0.5 + (fitness / 100) * 0.5;
          defense[player.position] = {
            defense: Math.round(player.fielding.defense * fitMult),
            speed: Math.round(player.physical.speed * fitMult),
            arm: Math.round(player.physical.arm * fitMult),
            throws: player.physical.throws
          };
        });

        // 打席ごとの配球メモリ。打者が変わったらリセットする
        const seqKey = `${currentBatter.id}-${currentBatter.name}`;
        if (pitchSeqRef.current.key !== seqKey) {
          pitchSeqRef.current = { key: seqKey, seq: createSequence() };
        }

        // 共通関数を呼び出し
        const { result, newStamina } = simulateSinglePitch(batter, pitcher, catcher, defense, count, currentStamina, pitchSeqRef.current.seq);

        // スタミナを更新
        setCurrentStamina(newStamina);

        return result;
      };

      // 旧determineContactResult（互換性のために残す）
      const determineContactResult = (selectedBall, predictionCorrect, tempoGroundballBonus = 0, handEffect = {}, actualVelocity = 145, batter = null, pitcher = null, defense = null) => {
        // 新エンジンに転送
        return determineContactResultPhysics(selectedBall, predictionCorrect, tempoGroundballBonus, handEffect, actualVelocity, batter, pitcher, defense, null);
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

      const advanceRunners = (hitType, fieldingPosition = null) => {
        const newBases = [false, false, false];
        let runsScored = 0;
        
        if (hitType === 'homerun') {
          runsScored = 1 + bases.filter(b => b).length;
          // setBases([false, false, false]); ← 削除
          return { bases: [false, false, false], runsScored };
        }
        
        const advancement = hitType === 'single' ? 1 : hitType === 'double' ? 2 : 3;

        // 積極進塁の判定に使う守備値。采配モードの bases は boolean で走者を識別
        // できないため、走者の走力は攻撃側の平均で近似する。
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
            if (outsFromThrow === 0) {
              // 打球を処理した野手の肩で判定する（自動シミュと同じ）。
              // avgArm だけだと「強肩の外野手を置く」意味が出ない
              const thrower = fieldingPosition ? def?.[fieldingPosition] : null;
              const { attempt, thrownOut } = tryExtraAdvance({
                hitType, fromBase: i, runnerSpeed: avgSpeed, avgArm,
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
            } else {
              newBases[newBase] = true;
            }
          }
        }
        
        if (advancement < 3) {
          newBases[advancement - 1] = true;
        } else {
          runsScored++;
        }
        
        // setBases(newBases); ← 削除
        return { bases: newBases, runsScored, outsMade: outsFromThrow };
      };

      const throwPitch = () => {
        // ガード: countがundefinedの場合は早期リターン
        if (!count || count.balls === undefined) {
          console.warn('count is not ready');
          return;
        }

        // 采配フラグを 1 球分だけ有効。値は先にスナップショット、消費（= false に戻す）は
        // simulatePitch() 呼び出し後 (strategy.consumeOneShot()) に行う。
        // 理由: simulateSinglePitch は forceSwingRef.current を直接参照するので、
        //       呼び出し時点ではまだ true のまま残っていないといけない。
        const strat = strategy.snapshot();
        const doForceSteal = strat.forceSteal;
        const doIntentionalWalk = strat.intentionalWalk;

        // 打席の最初（カウント0-0）で代打チェック
        if (count.balls === 0 && count.strikes === 0) {
          autoSubstitutePinchHitter();
        }

        // 現在の選手データを取得（チーム対応）
        const currentBatter = getCurrentBatter();
        const currentPitcher = getCurrentPitcher();
        const currentCatcher = getCurrentCatcher();
        const defenseTeam = getDefenseTeam();
        
        // コンディション補正
        const bCondMod = CONDITION_BATTING_MODIFIER[currentBatter.condition ?? CONDITION_LEVELS.NORMAL] || 0;
        const pCondMod = CONDITION_PITCHING_MODIFIER[currentPitcher.condition ?? CONDITION_LEVELS.NORMAL] || 0;

        // ローカル変数として展開
        const batter = {
          name: currentBatter.name,
          meet: currentBatter.batting.meet + bCondMod,
          power: currentBatter.batting.power + bCondMod,
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
          pitches: currentPitcher.pitching.arsenal,
          form: currentPitcher.pitching.form,
          spinRate: currentPitcher.pitching.spinRate ?? 50
        };
        
        const catcher = {
          name: currentCatcher.name,
          lead: currentCatcher.catching.lead,
          arm: currentCatcher.physical.arm,
          defense: currentCatcher.fielding?.defense ?? 50,
          throws: currentCatcher.physical.throws
        };
        
        // 守備データ（守備位置適正を反映）
        const defense = {};
        defenseTeam.players.forEach(player => {
          const fitness = player.positionFitness?.[player.position] ?? 50;
          const fitMult = 0.5 + (fitness / 100) * 0.5;
          defense[player.position] = {
            defense: Math.round(player.fielding.defense * fitMult),
            speed: Math.round(player.physical.speed * fitMult),
            arm: Math.round(player.physical.arm * fitMult),
            throws: player.physical.throws
          };
        });
        
        let result = simulatePitch();
        // simulateSinglePitch が読み終わったので采配のワンショットフラグを消費
        strategy.consumeOneShot();
        // 采配: 敬遠指示があればこの1球で四球にする（ボール扱い）
        if (doIntentionalWalk) {
          result = { type: 'ball', description: '敬遠', pitchType: '—', velocity: 0 };
        }
        // 【守備シフトは廃止】打球方向モデル（段階5）を作った後も、シフトは
        // 「単打の35%をアウトに書き換える」後付け処理のままで整合していなかった。
        // 守備は全て基本配置とする。
        // 球速履歴を更新（最新2球分のみ保持）
        setRecentVelocities(prev => {
          const updated = [...prev, result.velocity];
          return updated.slice(-2); // 最新2球のみ
        });
        
        // 投手成績の更新
        setPitcherStats(prev => ({
          ...prev,
          pitches: prev.pitches + 1
        }));
        
        // 投手個別の投球数を更新
        {
          const currentPitcherPlayer = getCurrentPitcher();
          const defenseTeamType = isTopInning ? 'home' : 'away';
          updatePitcherStats(currentPitcherPlayer.id, defenseTeamType, {
            pitches: (currentPitcherPlayer.stats?.pitching?.pitches || 0) + 1
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
            bases: [...bases],
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
              setBatterStats(prev => ({
                ...prev,
                plateAppearances: prev.plateAppearances + 1,
                walks: prev.walks + 1
              }));
              setPitcherStats(prev => ({
                ...prev,
                walks: prev.walks + 1
              }));
              
              // 選手個別成績を更新
              {
                const currentBatterPlayer = getCurrentBatter();
                const currentPitcherPlayer = getCurrentPitcher();
                const offenseTeamType = isTopInning ? 'away' : 'home';
                const defenseTeamType = isTopInning ? 'home' : 'away';
                
                updateBatterStats(currentBatterPlayer.id, offenseTeamType, {
                  walks: (currentBatterPlayer.stats?.batting?.walks || 0) + 1
                });
                
                updatePitcherStats(currentPitcherPlayer.id, defenseTeamType, {
                  walks: (currentPitcherPlayer.stats?.pitching?.walks || 0) + 1
                });
              }
              
              if (bases[0] && bases[1] && bases[2]) {
                const run = 1;
                isTopInning ? newScore.away++ : newScore.home++;
                setPitcherStats(prev => ({
                  ...prev,
                  runsAllowed: prev.runsAllowed + run
                }));
                
                // 押し出しの得点も投手成績に
                {
                  const currentPitcherPlayer = getCurrentPitcher();
                  const defenseTeamType = isTopInning ? 'home' : 'away';
                  updatePitcherStats(currentPitcherPlayer.id, defenseTeamType, {
                    runsAllowed: (currentPitcherPlayer.stats?.pitching?.runsAllowed || 0) + 1
                  });
                }
              } else {
                if (bases[1] && bases[0]) newBases[2] = true;
                if (bases[0]) newBases[1] = true;
                newBases[0] = true;
              }
              atBatOver = true;
              addAtBatResult(getCurrentBatter().id, isTopInning ? 'away' : 'home', '四球');
            }
            break;
          case 'hit_by_pitch': {
            // 死球。四球と同じ押し出し進塁だが、打数にも四球にも計上しない
            setBatterStats(prev => ({
              ...prev,
              plateAppearances: prev.plateAppearances + 1,
              hitByPitch: (prev.hitByPitch || 0) + 1
            }));
            setPitcherStats(prev => ({ ...prev, hitBatters: (prev.hitBatters || 0) + 1 }));
            {
              const b = getCurrentBatter();
              const pi = getCurrentPitcher();
              // 故障は作らないが、**疲労は大きく溜まる**（速い球ほど・体力が無いほど）
              updateBatterStats(b.id, isTopInning ? 'away' : 'home', {
                hitByPitch: (b.stats?.batting?.hitByPitch || 0) + 1,
                hbpFatigue: (b.gameStats?.hbpFatigue || 0) + (result.hbpFatigue || 0)
              });
              updatePitcherStats(pi.id, isTopInning ? 'home' : 'away', {
                hitBatters: (pi.stats?.pitching?.hitBatters || 0) + 1
              });
            }
            if (bases[0] && bases[1] && bases[2]) {
              isTopInning ? newScore.away++ : newScore.home++;
              setPitcherStats(prev => ({ ...prev, runsAllowed: prev.runsAllowed + 1 }));
              {
                const pi = getCurrentPitcher();
                updatePitcherStats(pi.id, isTopInning ? 'home' : 'away', {
                  runsAllowed: (pi.stats?.pitching?.runsAllowed || 0) + 1
                });
              }
            } else {
              if (bases[1] && bases[0]) newBases[2] = true;
              if (bases[0]) newBases[1] = true;
              newBases[0] = true;
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
              setBatterStats(prev => ({
                ...prev,
                plateAppearances: prev.plateAppearances + 1,
                atBats: prev.atBats + 1,
                strikeouts: prev.strikeouts + 1
              }));
              setPitcherStats(prev => ({
                ...prev,
                outs: prev.outs + 1,
                strikeouts: prev.strikeouts + 1
              }));
              
              // 選手個別成績を更新
              {
                const currentBatterPlayer = getCurrentBatter();
                const currentPitcherPlayer = getCurrentPitcher();
                const offenseTeamType = isTopInning ? 'away' : 'home';
                const defenseTeamType = isTopInning ? 'home' : 'away';
                
                updateBatterStats(currentBatterPlayer.id, offenseTeamType, {
                  atBats: (currentBatterPlayer.stats?.batting?.atBats || 0) + 1,
                  strikeouts: (currentBatterPlayer.stats?.batting?.strikeouts || 0) + 1
                });
                
                updatePitcherStats(currentPitcherPlayer.id, defenseTeamType, {
                  outs: (currentPitcherPlayer.stats?.pitching?.outs || 0) + 1,
                  strikeouts: (currentPitcherPlayer.stats?.pitching?.strikeouts || 0) + 1
                });
              }
              
              newOuts++;
              atBatOver = true;
              recordFielding('catcher', { chance: 1 });   // 三振は捕手の刺殺
              addAtBatResult(getCurrentBatter().id, isTopInning ? 'away' : 'home', '三振');
            }
            break;
          case 'double_play':
            // ダブルプレー処理
            setBatterStats(prev => ({
              ...prev,
              plateAppearances: prev.plateAppearances + 1,
              atBats: prev.atBats + 1
            }));
            setPitcherStats(prev => ({
              ...prev,
              outs: prev.outs + 2,
              doublePlay: (prev.doublePlay || 0) + 1  // 併殺打カウント
            }));
            newOuts += 2;  // 2アウト追加
            newBases[0] = false;  // 一塁ランナー消える
            atBatOver = true;
            addAtBatResult(getCurrentBatter().id, isTopInning ? 'away' : 'home', '併殺');
            break;
          case 'foul':
            newCount.strikes++;
            break;
          case 'single':
          case 'double':
          case 'triple':
          case 'homerun':
            const { bases: updatedBases, runsScored: runs, outsMade: throwOuts = 0 } = advanceRunners(result.type, result.fieldingPosition);
            
            // 打者成績: ヒット
            const bases_earned = result.type === 'single' ? 1 : result.type === 'double' ? 2 : result.type === 'triple' ? 3 : 4;
            // 失策での出塁は「安打」ではない（打数のみ加算）
            const reachedOnError = !!result.isError;
            setBatterStats(prev => ({
              ...prev,
              plateAppearances: prev.plateAppearances + 1,
              atBats: prev.atBats + 1,
              hits: prev.hits + (reachedOnError ? 0 : 1),
              homeruns: prev.homeruns + (!reachedOnError && result.type === 'homerun' ? 1 : 0),
              totalBases: prev.totalBases + (reachedOnError ? 0 : bases_earned)
            }));
            
            // 選手個別成績を更新
            {
              const currentBatterPlayer = getCurrentBatter();
              const currentPitcherPlayer = getCurrentPitcher();
              const offenseTeamType = isTopInning ? 'away' : 'home';
              const defenseTeamType = isTopInning ? 'home' : 'away';
              
              updateBatterStats(currentBatterPlayer.id, offenseTeamType, {
                atBats: (currentBatterPlayer.stats?.batting?.atBats || 0) + 1,
                hits: (currentBatterPlayer.stats?.batting?.hits || 0) + (reachedOnError ? 0 : 1),
                homeruns: (currentBatterPlayer.stats?.batting?.homeruns || 0) + (!reachedOnError && result.type === 'homerun' ? 1 : 0),
                // 失策による得点には打点が付かない
                rbis: (currentBatterPlayer.stats?.batting?.rbis || 0) + (reachedOnError ? 0 : runs)
              });
              
              // 失策での出塁は非自責走者として計上（失策が無ければアウトだったので想定アウトも+1）
              if (result.isError) {
                inningErrorOutsRef.current++;
                errorRunnersOnBaseRef.current++;
              }
              const earned = takeEarnedRuns(runs, outs);
              updatePitcherStats(currentPitcherPlayer.id, defenseTeamType, {
                runsAllowed: (currentPitcherPlayer.stats?.pitching?.runsAllowed || 0) + runs,
                earnedRuns: (currentPitcherPlayer.stats?.pitching?.earnedRuns || 0) + earned
              });
            }
            
            // チーム別安打・打点をカウント（エラーの場合はエラーもカウント）
        if (isTopInning) {
          setTeamHits(prev => ({ ...prev, away: prev.away + 1 }));
          setTeamRBIs(prev => ({ ...prev, away: prev.away + runs }));
          if (result.isError) {
            setTeamErrors(prev => ({ ...prev, home: prev.home + 1 }));
            recordFielding(result.errorPosition, { error: 1 });
          }
        } else {
          setTeamHits(prev => ({ ...prev, home: prev.home + 1 }));
          setTeamRBIs(prev => ({ ...prev, home: prev.home + runs }));
          if (result.isError) {
            setTeamErrors(prev => ({ ...prev, away: prev.away + 1 }));
            recordFielding(result.errorPosition, { error: 1 });
          }
        }
        
        setPitcherStats(prev => ({
          ...prev,
          runsAllowed: prev.runsAllowed + runs
        }));
        
        isTopInning ? (newScore.away += runs) : (newScore.home += runs);
        newBases = updatedBases;
        // 捕殺: 積極進塁を狙って刺された走者はアウトになる
        if (throwOuts > 0) {
          newOuts += throwOuts;
          setPitcherStats(prev => ({ ...prev, outs: prev.outs + throwOuts }));
        }
        atBatOver = true;
        {
          const hitLabel = result.type === 'homerun' ? '本塁打' : result.type === 'triple' ? '三塁打' : result.type === 'double' ? '二塁打' : '安打';
          addAtBatResult(getCurrentBatter().id, isTopInning ? 'away' : 'home', hitLabel);
        }
        break;
      case 'out':
        // 打者成績: アウト
        setBatterStats(prev => ({
          ...prev,
          plateAppearances: prev.plateAppearances + 1,
          atBats: prev.atBats + 1
        }));
        setPitcherStats(prev => ({
          ...prev,
          outs: prev.outs + 1
        }));
        
        // 選手個別成績を更新
            {
              const currentBatterPlayer = getCurrentBatter();
              const currentPitcherPlayer = getCurrentPitcher();
              const offenseTeamType = isTopInning ? 'away' : 'home';
              const defenseTeamType = isTopInning ? 'home' : 'away';
              
              updateBatterStats(currentBatterPlayer.id, offenseTeamType, {
                atBats: (currentBatterPlayer.stats?.batting?.atBats || 0) + 1
              });
              
              updatePitcherStats(currentPitcherPlayer.id, defenseTeamType, {
                outs: (currentPitcherPlayer.stats?.pitching?.outs || 0) + 1
              });
            }
            
            newOuts++;

            // 守備機会（刺殺・補殺）。内野ゴロは「捕った野手の補殺＋一塁手の刺殺」
            recordFielding(result.fieldingPosition, { chance: 1 });
            if (result.isGroundOut && result.fieldingPosition && result.fieldingPosition !== 'first') {
              recordFielding('first', { chance: 1 });
            }

            // 併殺打判定（一塁ランナーがいて内野ゴロの場合）
            let isDoublePlay = false;
            // **内野ゴロのアウトなら距離は問わない**（自動シミュと同じ条件）。
            // 外野へ抜けた打球はそもそも 'out' にならないので、距離を足すと
            // 二重の門番になって併殺が実NPBの1/4しか出なくなる
            if (newBases[0] && result.launchAngle != null && result.launchAngle < 10
                && !result.isOutfieldFly && newOuts < 3) {
              const ssDefense = defense.short?.defense || 50;
              const sbDefense = defense.second?.defense || 50;
              const ifAvg = (ssDefense + sbDefense) / 2;
              // 走者の足は采配モードでは走者オブジェクトを持たないので基準値のまま
              const dpBase = DP_BASE + (ifAvg - 50) * 0.35;
              if (Math.random() * 100 < dpBase) {
                isDoublePlay = true;
                recordFielding('first', { chance: 1 });   // 一塁でのアウト
                newOuts++;
                newBases[0] = false;
                setPitcherStats(prev => ({
                  ...prev,
                  outs: prev.outs + 1,
                  doublePlay: (prev.doublePlay || 0) + 1
                }));
                {
                  const currentPitcherPlayer = getCurrentPitcher();
                  const defenseTeamType = isTopInning ? 'home' : 'away';
                  updatePitcherStats(currentPitcherPlayer.id, defenseTeamType, {
                    outs: (currentPitcherPlayer.stats?.pitching?.outs || 0) + 1
                  });
                }
                setLastResult({ ...result, description: result.description + '（併殺打）' });
              }
            }

            // 内野ゴロでの走者進塁（ゴロGO・進塁打）。詳細は baserunning.js 参照
        if (result.isGroundOut && !result.isOutfieldFly && newOuts < 3) {
          const dt = getDefenseTeam();
          const infPos = ['first', 'second', 'third', 'short'];
          const infVals = infPos.map(pos => {
            const pl = dt.players.find(p => p.position === pos && p.battingOrder >= 1);
            return pl?.fielding?.defense ?? 50;
          });
          const adv = resolveGroundOutAdvance({
            hasThird: !!newBases[2], hasSecond: !!newBases[1],
            infieldDefense: infVals.reduce((a, b) => a + b, 0) / infVals.length,
          });
          if (adv.scoreFromThird) {
            newBases[2] = false;
            if (isTopInning) newScore.away++; else newScore.home++;
            setPitcherStats(prev => ({ ...prev, runsAllowed: prev.runsAllowed + 1 }));
            recordRunsToCurrentPitcher(1, outs);
            setLastResult({ ...result, description: (result.description || 'アウト') + '（進塁打）' });
          }
          if (adv.secondToThird) { newBases[2] = true; newBases[1] = false; }
        }

            // タッチアップ判定（外野フライのみ）
        if (result.isOutfieldFly && newOuts < 3) {
          const throwbackChance = result.tagupThrowbackChance || 0;
          const runnerSpeed = batter.speed / 100; // 走者の速さ（簡易的に打者と同じ）
          
          // 三塁ランナーがいる場合（ホーム進塁）
          if (newBases[2]) {
            const tagupSuccess = Math.random() > (throwbackChance - runnerSpeed * 0.3);
            if (tagupSuccess) {
              if (isTopInning) {
                setScore(prev => ({ ...prev, away: prev.away + 1 }));
              } else {
                setScore(prev => ({ ...prev, home: prev.home + 1 }));
              }
              setPitcherStats(prev => ({ ...prev, runsAllowed: prev.runsAllowed + 1 }));
              recordRunsToCurrentPitcher(1, outs);
              newBases[2] = false;
              setLastResult({ ...result, description: result.description + '（犠牲フライ）' });
            }
          }
          
          // 二塁ランナーの三塁進塁（三塁が空いている深いフライのみ）。
          // 以前は1塁走者まで無条件にタッグアップさせており、自動シミュレーション
          // （2塁走者のみ・確率0.4基準）より大幅に走者が進んでいた。
          if (newBases[1] && !newBases[2] && newOuts < 3) {
            if (Math.random() < 0.4 - throwbackChance * 0.5 + runnerSpeed * 0.15) {
              newBases[2] = true;
              newBases[1] = false;
            }
          }
        }
        
        atBatOver = true;
        if (isDoublePlay) {
          addAtBatResult(getCurrentBatter().id, isTopInning ? 'away' : 'home', '併殺');
        } else {
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
      const catcherDefense = defense.catcher.defense / 100;
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
            setPitcherStats(prev => ({ ...prev, wildPitches: prev.wildPitches + 1 }));
            
            const catcherArm = defense.catcher.arm / 100;
            const runnerSpeed = batter.speed / 100;
            const throwoutChance = Math.max(0, catcherArm * 0.40 - runnerSpeed * 0.20);
            
            let wpDescription = '💥 ワイルドピッチ！';
            
            // 三塁→ホーム
            if (newBases[2]) {
              if (Math.random() < throwoutChance) {
                setCatcherStats(prev => ({ ...prev, wildPitchesBlocked: prev.wildPitchesBlocked + 1 }));
                wpDescription += ' 🛡️ 捕手が三塁ランナーを刺した！';
                newOuts++;
              } else {
                isTopInning ? newScore.away++ : newScore.home++;
                setPitcherStats(prev => ({ ...prev, runsAllowed: prev.runsAllowed + 1 }));
              recordRunsToCurrentPitcher(1, outs);
                wpDescription += ' ⚡ 三塁ランナーがホームイン';
              }
              newBases[2] = false;
            }
            
            // 二塁→三塁
            if (newBases[1] && newOuts < 3) {
              if (Math.random() < throwoutChance) {
                setCatcherStats(prev => ({ ...prev, wildPitchesBlocked: prev.wildPitchesBlocked + 1 }));
                wpDescription += ' 🛡️ 二塁ランナーを刺した！';
                newOuts++;
              } else {
                newBases[2] = true;
                wpDescription += ' ⚡ 二塁ランナーが三塁へ';
              }
              newBases[1] = false;
            }
            
            // 一塁→二塁
            if (newBases[0] && newOuts < 3) {
              if (Math.random() < throwoutChance) {
                setCatcherStats(prev => ({ ...prev, wildPitchesBlocked: prev.wildPitchesBlocked + 1 }));
                wpDescription += ' 🛡️ 一塁ランナーを刺した！';
                newOuts++;
              } else {
                newBases[1] = true;
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
          // 二塁盗塁試行
          if (bases[0] && !bases[1]) {
            // 盗塁の判断・成否は自動シミュレーションと共有する（stealing.js）。
            // ⚠ 采配モードの bases は boolean で走者を識別できないため、
            //    走者の走力・盗塁スキルは打者のもので近似している（構造的制約）
            const stealRate2 = stealSuccessRate({
              runnerSpeed: batter.speed, runnerSteal: batter.steal,
              catcherArm: defense.catcher.arm, pitcherControl: pitcher.control,
              pitcherThrows: pitcher.throws, toBase: 2,
            });
            let stealAttempt = stealAttemptRate({
              successRate: stealRate2, runnerSteal: batter.steal, outs: newOuts, toBase: 2,
            });

            // 監督AI：盗塁判断（Phase 3）
            if (autoManagerMode) {
              const batterAvg = batter.stats?.batting?.atBats > 0
                ? batter.stats.batting.hits / batter.stats.batting.atBats
                : (batter.batting?.contact || 50) / 200; // 成績がない場合は能力値から推定
              const isPitcher = batter.position === 'pitcher';
              const isWeakBatter = batterAvg < 0.200 || isPitcher;
              const isStrongBatter = batterAvg > 0.300 && batter.batting?.power > 50;

              const batterType = isPitcher ? 'pitcher' : isWeakBatter ? 'weak' : isStrongBatter ? 'strong' : 'normal';
              const scoreDiff = Math.abs(score.home - score.away);
              const isCloseGame = scoreDiff <= 3;

              const stealMultiplier = autoStealingDecision(batter, {
                scoreDiff,
                isCloseGame,
                outs: newOuts,
                batterType,
                runnerSteal: batter.steal
              });

              stealAttempt *= stealMultiplier;
            }

            // 采配: 盗塁指示/エンドランがあれば強制的に試行（成否は走力・肩で決まる）
            if (doForceSteal) { stealAttempt = 1; }

            if (Math.random() < stealAttempt) {
              if (Math.random() < stealRate2) {
                // 盗塁成功
        newBases[1] = true;
        newBases[0] = false;
        setCatcherStats(prev => ({ ...prev, stolenBasesAllowed: prev.stolenBasesAllowed + 1 }));
        setBatterStats(prev => ({ ...prev, stolenBases: prev.stolenBases + 1 }));
        setGameLog(prev => {
          const updated = [...prev, { description: '🏃 盗塁成功！一塁→二塁', isSpecial: true }];
          return updated.length > 50 ? updated.slice(-50) : updated;
        });
      } else {
        // 盗塁失敗
        newBases[0] = false;
        newOuts++;
        setCatcherStats(prev => ({ ...prev, caughtStealing: prev.caughtStealing + 1 }));
        setBatterStats(prev => ({ ...prev, caughtStealing: prev.caughtStealing + 1 }));
        setPitcherStats(prev => ({ ...prev, outs: prev.outs + 1 }));
        setGameLog(prev => {
          const updated = [...prev, { description: '❌ 盗塁失敗、アウト', isSpecial: true }];
          return updated.length > 50 ? updated.slice(-50) : updated;
        });
      }
    }
  }
  
  // 三塁盗塁試行
  if (bases[1] && !bases[2] && newOuts < 3) {
    // 判断・成否は自動シミュレーションと共有（stealing.js）。三塁は成功しやすいが試行は少ない
    const stealRate3 = stealSuccessRate({
      runnerSpeed: batter.speed, runnerSteal: batter.steal,
      catcherArm: defense.catcher.arm, pitcherControl: pitcher.control,
      pitcherThrows: pitcher.throws, toBase: 3,
    });
    let stealThirdAttempt = stealAttemptRate({
      successRate: stealRate3, runnerSteal: batter.steal, outs: newOuts, toBase: 3,
    });

    // 監督AI：盗塁判断（Phase 3）
    if (autoManagerMode) {
      const batterAvg = batter.stats?.batting?.atBats > 0
        ? batter.stats.batting.hits / batter.stats.batting.atBats
        : (batter.batting?.contact || 50) / 200;
      const isPitcher = batter.position === 'pitcher';
      const isWeakBatter = batterAvg < 0.200 || isPitcher;
      const isStrongBatter = batterAvg > 0.300 && batter.batting?.power > 50;

      const batterType = isPitcher ? 'pitcher' : isWeakBatter ? 'weak' : isStrongBatter ? 'strong' : 'normal';
      const scoreDiff = Math.abs(score.home - score.away);
      const isCloseGame = scoreDiff <= 3;

      const stealMultiplier = autoStealingDecision(batter, {
        scoreDiff,
        isCloseGame,
        outs: newOuts,
        batterType,
        runnerSteal: batter.steal
      });

      stealThirdAttempt *= stealMultiplier; // 三塁盗塁
    }

    if (Math.random() < stealThirdAttempt) {
              if (Math.random() < stealRate3) {
                // 盗塁成功
        newBases[2] = true;
        newBases[1] = false;
        setCatcherStats(prev => ({ ...prev, stolenBasesAllowed: prev.stolenBasesAllowed + 1 }));
        setBatterStats(prev => ({ ...prev, stolenBases: prev.stolenBases + 1 }));
        setGameLog(prev => {
          const updated = [...prev, { description: '🏃 盗塁成功！二塁→三塁', isSpecial: true }];
          return updated.length > 50 ? updated.slice(-50) : updated;
        });
      } else {
        // 盗塁失敗
        newBases[1] = false;
        newOuts++;
        setCatcherStats(prev => ({ ...prev, caughtStealing: prev.caughtStealing + 1 }));
        setBatterStats(prev => ({ ...prev, caughtStealing: prev.caughtStealing + 1 }));
        setPitcherStats(prev => ({ ...prev, outs: prev.outs + 1 }));
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
  
  // イニング終了時にスタミナ+3回復
  setCurrentStamina(prev => Math.min(pitcher.stamina, prev + 3));
  
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
              // イニング切り替え後に守備固めと投手起用最適化をチェック（順次実行）
              setTimeout(() => {
                autoDefensiveSubstitution();
                // 守備固めの後、投手起用最適化を実行
                setTimeout(() => {
                  autoOptimizePitcherUsage();
                }, 200);
              }, 100);
            } else {
              setIsTopInning(true);
              resetEarnedRunTracking(); // 自責点判定はイニング単位
              setInning(inning + 1);
              // イニング切り替え後に守備固めと投手起用最適化をチェック（順次実行）
              setTimeout(() => {
                autoDefensiveSubstitution();
                // 守備固めの後、投手起用最適化を実行
                setTimeout(() => {
                  autoOptimizePitcherUsage();
                }, 200);
              }, 100);
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
        }
        
        // アウトが増えた場合フラグを立てる（1アウトモード用）
        if (newOuts > outs || (newOuts === 0 && outs > 0)) {
          outOccurredRef.current = true;
        }

        setCount(newCount);
        setOuts(newOuts);
        setBases(newBases);
        setScore(newScore);

        // 投球後に監督AIによる自動交代をチェック
        setTimeout(() => {
          autoSubstitutePitcher();
        }, 100);
      };

      // バント実行ハンドラー（手動操作モード用）
      const handleBunt = () => {
        if (!count || count.balls === undefined) return;

        const currentBatter = getCurrentBatter();
        const currentPitcher = getCurrentPitcher();
        const currentCatcher = getCurrentCatcher();
        const defenseTeam = getDefenseTeam();

        const bCondMod = CONDITION_BATTING_MODIFIER[currentBatter.condition ?? CONDITION_LEVELS.NORMAL] || 0;

        const buntSkill = currentBatter.batting?.bunt || 30;
        const meet = (currentBatter.batting?.meet || 50) + bCondMod;
        const speed = currentBatter.physical?.speed || 50;

        // バント種別を状況から自動判定
        let buntType = 'safety';
        if (bases[2] && outs <= 1) {
          buntType = 'squeeze';
        } else if ((bases[0] || bases[1]) && outs <= 1) {
          buntType = 'sacrifice';
        }

        // スタミナ消費（1球分）
        setCurrentStamina(prev => Math.max(0, prev - 1));
        setPitcherStats(prev => ({ ...prev, pitches: prev.pitches + 1 }));
        {
          const defenseTeamType = isTopInning ? 'home' : 'away';
          updatePitcherStats(currentPitcher.id, defenseTeamType, {
            pitches: (currentPitcher.stats?.pitching?.pitches || 0) + 1
          });
        }

        // Step 1: フェア/ファウル/フライ
        const fairRate = Math.min(85, 40 + buntSkill * 0.40 + meet * 0.10);
        const popupRate = Math.max(2, 15 - buntSkill * 0.12);
        const roll = Math.random() * 100;

        let newOuts = outs;
        let newBases = [...bases];
        let newScore = { ...score };
        let newCount = { ...count };
        let atBatOver = false;

        if (roll < popupRate) {
          // バントフライ → アウト
          newOuts++;
          setBatterStats(prev => ({ ...prev, plateAppearances: prev.plateAppearances + 1, atBats: prev.atBats + 1 }));
          setPitcherStats(prev => ({ ...prev, outs: prev.outs + 1 }));
          {
            const offenseTeamType = isTopInning ? 'away' : 'home';
            const defenseTeamType = isTopInning ? 'home' : 'away';
            updateBatterStats(currentBatter.id, offenseTeamType, { atBats: (currentBatter.stats?.batting?.atBats || 0) + 1 });
            updatePitcherStats(currentPitcher.id, defenseTeamType, { outs: (currentPitcher.stats?.pitching?.outs || 0) + 1 });
          }
          setLastResult({ description: 'バントフライ アウト' });
          addAtBatResult(currentBatter.id, isTopInning ? 'away' : 'home', 'バ飛');
          atBatOver = true;
        } else if (roll >= popupRate + fairRate) {
          // バントファウル
          if (count.strikes >= 2) {
            // 2ストライクからのバントファウルは三振
            newOuts++;
            setBatterStats(prev => ({ ...prev, plateAppearances: prev.plateAppearances + 1, atBats: prev.atBats + 1, strikeouts: prev.strikeouts + 1 }));
            setPitcherStats(prev => ({ ...prev, outs: prev.outs + 1, strikeouts: prev.strikeouts + 1 }));
            {
              const offenseTeamType = isTopInning ? 'away' : 'home';
              const defenseTeamType = isTopInning ? 'home' : 'away';
              updateBatterStats(currentBatter.id, offenseTeamType, {
                atBats: (currentBatter.stats?.batting?.atBats || 0) + 1,
                strikeouts: (currentBatter.stats?.batting?.strikeouts || 0) + 1
              });
              updatePitcherStats(currentPitcher.id, defenseTeamType, {
                outs: (currentPitcher.stats?.pitching?.outs || 0) + 1,
                strikeouts: (currentPitcher.stats?.pitching?.strikeouts || 0) + 1
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
          const qualityScore = buntSkill * 0.5 + meet * 0.2 + (Math.random() * 20 - 10);
          const quality = qualityScore >= 70 ? 'dead' : qualityScore >= 40 ? 'normal' : 'hard';

          const pitcherDef = defenseTeam.players.find(p => p.position === 'pitcher' && p.battingOrder >= 1)?.fielding?.defense || 50;
          const firstDef = defenseTeam.players.find(p => p.position === 'first' && p.battingOrder >= 1)?.fielding?.defense || 50;
          const thirdDef = defenseTeam.players.find(p => p.position === 'third' && p.battingOrder >= 1)?.fielding?.defense || 50;
          const catcherDef = currentCatcher?.fielding?.defense || 50;
          const avgFieldDef = (pitcherDef + firstDef + thirdDef + catcherDef) / 4;

          let baseThrowout;
          if (buntType === 'sacrifice') baseThrowout = 75;
          else if (buntType === 'squeeze') baseThrowout = 85;
          else baseThrowout = 60;

          const speedReduction = speed * (buntType === 'safety' ? 0.35 : 0.15);
          const qualityMod = quality === 'dead' ? (buntType === 'safety' ? -20 : -15) : quality === 'hard' ? (buntType === 'safety' ? 15 : 10) : 0;
          const fieldingMod = (avgFieldDef - 50) * 0.3;
          const throwOutChance = Math.max(5, Math.min(95, baseThrowout - speedReduction + qualityMod + fieldingMod));
          const batterOut = Math.random() * 100 < throwOutChance;

          const offenseTeamType = isTopInning ? 'away' : 'home';
          const defenseTeamType = isTopInning ? 'home' : 'away';

          if (buntType === 'squeeze') {
            // スクイズ: 3塁ランナーの生還判定
            let squeezeRunnerSafe = true;
            if (newBases[2]) {
              const homeThrowChance = Math.max(5, 15 + (avgFieldDef - 50) * 0.4 - (quality === 'dead' ? 15 : quality === 'hard' ? -5 : 0));
              squeezeRunnerSafe = Math.random() * 100 >= homeThrowChance;

              if (squeezeRunnerSafe) {
                isTopInning ? newScore.away++ : newScore.home++;
                setPitcherStats(prev => ({ ...prev, runsAllowed: prev.runsAllowed + 1 }));
              recordRunsToCurrentPitcher(1, outs);
                setBatterStats(prev => ({ ...prev, rbis: prev.rbis + 1 }));
                newBases[2] = false;
              } else {
                newOuts++;
                setPitcherStats(prev => ({ ...prev, outs: prev.outs + 1 }));
                updatePitcherStats(currentPitcher.id, defenseTeamType, { outs: (currentPitcher.stats?.pitching?.outs || 0) + 1 });
                newBases[2] = false;
              }
            }

            if (batterOut) {
              newOuts++;
              setPitcherStats(prev => ({ ...prev, outs: prev.outs + 1 }));
              updatePitcherStats(currentPitcher.id, defenseTeamType, { outs: (currentPitcher.stats?.pitching?.outs || 0) + 1 });
              updateBatterStats(currentBatter.id, offenseTeamType, {
                sacrificeBunts: (currentBatter.stats?.batting?.sacrificeBunts || 0) + 1
              });
              const qualityText = quality === 'dead' ? '絶妙な' : quality === 'hard' ? '強い' : '';
              setLastResult({ description: `${qualityText}スクイズ${squeezeRunnerSafe ? '成功！' : '（本塁封殺）'}` });
              addAtBatResult(currentBatter.id, offenseTeamType, '犠打');
            } else {
              setBatterStats(prev => ({ ...prev, plateAppearances: prev.plateAppearances + 1, atBats: prev.atBats + 1, hits: prev.hits + 1 }));
              updateBatterStats(currentBatter.id, offenseTeamType, {
                atBats: (currentBatter.stats?.batting?.atBats || 0) + 1,
                hits: (currentBatter.stats?.batting?.hits || 0) + 1
              });
              if (newBases[1]) { newBases[2] = newBases[1]; }
              if (newBases[0]) { newBases[1] = newBases[0]; }
              newBases[0] = true;
              setLastResult({ description: 'スクイズバント安打！' });
              addAtBatResult(currentBatter.id, offenseTeamType, '安打');
            }
            atBatOver = true;
          } else if (buntType === 'sacrifice') {
            if (batterOut) {
              newOuts++;
              setPitcherStats(prev => ({ ...prev, outs: prev.outs + 1 }));
              updatePitcherStats(currentPitcher.id, defenseTeamType, { outs: (currentPitcher.stats?.pitching?.outs || 0) + 1 });
              updateBatterStats(currentBatter.id, offenseTeamType, {
                sacrificeBunts: (currentBatter.stats?.batting?.sacrificeBunts || 0) + 1
              });
              if (newOuts < 3) {
                if (newBases[1]) { newBases[2] = newBases[1]; newBases[1] = false; }
                if (newBases[0]) { newBases[1] = newBases[0]; newBases[0] = false; }
              }
              const qualityText = quality === 'dead' ? '絶妙な' : quality === 'hard' ? '強い' : '';
              setLastResult({ description: `${qualityText}犠打成功` });
              addAtBatResult(currentBatter.id, offenseTeamType, '犠打');
            } else {
              setBatterStats(prev => ({ ...prev, plateAppearances: prev.plateAppearances + 1, atBats: prev.atBats + 1, hits: prev.hits + 1 }));
              updateBatterStats(currentBatter.id, offenseTeamType, {
                atBats: (currentBatter.stats?.batting?.atBats || 0) + 1,
                hits: (currentBatter.stats?.batting?.hits || 0) + 1
              });
              if (newBases[1]) { newBases[2] = newBases[1]; }
              if (newBases[0]) { newBases[1] = newBases[0]; }
              newBases[0] = true;
              setLastResult({ description: 'バント安打！' });
              addAtBatResult(currentBatter.id, offenseTeamType, '安打');
            }
            atBatOver = true;
          } else {
            // セーフティバント
            if (batterOut) {
              newOuts++;
              setBatterStats(prev => ({ ...prev, plateAppearances: prev.plateAppearances + 1, atBats: prev.atBats + 1 }));
              setPitcherStats(prev => ({ ...prev, outs: prev.outs + 1 }));
              updateBatterStats(currentBatter.id, offenseTeamType, { atBats: (currentBatter.stats?.batting?.atBats || 0) + 1 });
              updatePitcherStats(currentPitcher.id, defenseTeamType, { outs: (currentPitcher.stats?.pitching?.outs || 0) + 1 });
              setLastResult({ description: 'セーフティバント失敗' });
              addAtBatResult(currentBatter.id, offenseTeamType, 'バ失');
            } else {
              setBatterStats(prev => ({ ...prev, plateAppearances: prev.plateAppearances + 1, atBats: prev.atBats + 1, hits: prev.hits + 1 }));
              updateBatterStats(currentBatter.id, offenseTeamType, {
                atBats: (currentBatter.stats?.batting?.atBats || 0) + 1,
                hits: (currentBatter.stats?.batting?.hits || 0) + 1
              });
              if (newBases[1]) { newBases[2] = newBases[1]; }
              if (newBases[0]) { newBases[1] = newBases[0]; }
              newBases[0] = true;
              setLastResult({ description: 'セーフティバント成功！' });
              addAtBatResult(currentBatter.id, offenseTeamType, '安打');
            }
            atBatOver = true;
          }
        }

        // 3アウトチェンジ
        if (newOuts >= 3) {
          newOuts = 0;
          newBases = [false, false, false];
          atBatOver = true;

          if (inning >= 9 && !isTopInning && newScore.home > newScore.away && !gameOver) {
            setGameOver(true);
            setLastResult({ description: `サヨナラ！ ${homeTeam.name} の勝利！` });
          } else if (inning >= 9 && isTopInning && newScore.home > newScore.away && !gameOver) {
            setGameOver(true);
            setLastResult({ description: `試合終了！ ${homeTeam.name} の勝利！` });
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
        if (inning >= 9 && !isTopInning && newScore.home > newScore.away && !gameOver) {
          setGameOver(true);
          setLastResult(prev => ({ ...prev, description: (prev?.description || '') + ` サヨナラ！` }));
        }

        if (atBatOver) {
          newCount = { balls: 0, strikes: 0 };
          advanceBatter();
        }

        setCount(newCount);
        setOuts(newOuts);
        setBases(newBases);
        setScore(newScore);
      };

      // ゲームコントロール関数（gameControls.jsからインポート済み、stateバインド用ラッパー）
      const gameControlsCtx = {
        isSubstituting, setCount, setBases, setOuts, setInning, setScore,
        setGameOver, setRemainingPitches, setSimMode, outOccurredRef,
        setInningScores, setExtraInningScores, setCurrentInningScore,
        setTeamHits, setTeamErrors, setTeamRBIs, setIsTopInning,
        setGameLog, setLastResult, setStatistics, setRecentVelocities,
        setHomeTeam, setAwayTeam, setCurrentStamina,
        setBatterStats, setPitcherStats, setCatcherStats,
        setBattedBallStats, setBattedBallTypeStats,
        setBattedBallDirectionStats, setBattedBallAreaStats,
        setIsAutoSimulating
      };
      const resetGame = () => executeResetGame(gameControlsCtx);
      const multiPitch = (pitchCount) => executeMultiPitch(gameControlsCtx, pitchCount);
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

      // renderBases: GameUIComponentsのRenderBasesを使用
      const renderBases = () => <RenderBases defense={defense} setDefense={setDefense} bases={bases} />;

      // AccordionSection, Sidebar: GameUIComponentsからimport済み

      // 采配モード: 試合セットアップ（DateProgressScreenから呼ばれる）
      // 采配モード関数（gameSetup.jsからインポート済み、stateバインド用ラッパー）
      const gameSetupCtx = {
        setCount, setBases, setOuts, setInning, setScore, setGameOver,
        setGameStarted, setRemainingPitches, setSimMode, outOccurredRef,
        setInningScores, setExtraInningScores, setCurrentInningScore,
        setTeamHits, setTeamErrors, setTeamRBIs, setIsTopInning,
        setGameLog, setLastResult, setStatistics, setRecentVelocities,
        setHomeTeam, setAwayTeam, setCurrentStamina,
        setManagedGameInfo, managedGameInfoRef, setScreenMode
      };
      const setupManagedGame = (gameInfo) => executeSetupManagedGame(gameSetupCtx, gameInfo);

      const handleManagedGameEnd = () => executeHandleManagedGameEnd({
        managedGameInfoRef, score, homeTeam, awayTeam,
        seasonData, setSeasonData, selectedMonth, setSelectedMonth,
        setManagedGameInfo, setScreenMode, setManagementView
      });

  // 日程進行ハンドラー（seasonProgress.jsからインポート済み、stateバインド用ラッパー）
  const seasonProgressCtx = { seasonData, setSeasonData, setSelectedMonth, selectedMonth, userTeamName, setScreenMode, setManagementView };
  const handleProgressDate = (days) => progressDateHandler(days, seasonProgressCtx);
  const handleProgressToNextGame = () => progressToNextGameHandler(seasonProgressCtx);
  const handleProgressToNextPhase = () => progressToNextPhaseHandler(seasonProgressCtx);


// 管理画面のルーター（ManagementScreen.jsxからインポート済み）

      // ゲームフロー（スタート画面群）: GameFlowScreens.jsxからインポート済み
      if (screenMode === 'start') {
        const flowScreen = <GameFlowScreens
          gameFlowState={gameFlowState}
          setGameFlowState={setGameFlowState}
          gameMode={gameMode}
          setGameMode={setGameMode}
          seasonData={seasonData}
          setSeasonData={setSeasonData}
          allTeams={allTeams}
          userTeamName={userTeamName}
          hasSaveData={hasSaveData}
          saveSlots={saveSlots}
          loadGame={loadGame}
          loadAutosave={loadAutosave}
          initializeNewGame={initializeNewGame}
          setScreenMode={setScreenMode}
          setManagementView={setManagementView}
          setSelectedMonth={setSelectedMonth}
          setLeagueConfig={setLeagueConfig}
        />;
        if (flowScreen) return flowScreen;
      }

      const getPositionColor = (pos) => POSITION_COLORS[pos] || 'bg-gray-700';
      const getPositionColorHighlighted = (pos, isCurrentBatter) => {
        if (!isCurrentBatter) return POSITION_COLORS[pos] || 'bg-gray-700';
        if (pos === 'pitcher') return 'bg-red-600 text-white';
        if (pos === 'catcher') return 'bg-blue-500 text-white';
        if (['first', 'second', 'third', 'short'].includes(pos)) return 'bg-yellow-400 text-black';
        if (['left', 'center', 'right'].includes(pos)) return 'bg-green-500 text-white';
        if (pos === 'dh') return 'bg-purple-500 text-white';
        return 'bg-gray-700';
      };

      return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-800">
          {/* オートセーブ完了トースト */}
          {autoSaveFlash && (
            <div className="fixed top-3 right-3 z-[60] bg-gray-900/90 border border-cyan-600/50 text-cyan-200 text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg pointer-events-none animate-pulse">
              💾 オートセーブしました
            </div>
          )}
          {screenMode === 'management' && !['contract', 'tryout', 'offseason', 'camp', 'summer_camp', 'jersey', 'regulations_next', 'sandbox_next_regulations', 'sandbox_setup', 'edit', 'corporate_departure', 'corporate_scout', 'club_recruit', 'budget_settlement'].includes(managementView) && <Sidebar
            gameMode={gameMode}
            userTeamName={userTeamName}
            seasonData={seasonData}
            formatDate={formatDate}
            screenMode={screenMode}
            managementView={managementView}
            setScreenMode={setScreenMode}
            setManagementView={setManagementView}
            advanceDayRef={advanceDayRef}
          />}

          <div className={screenMode === 'management' && !['contract', 'tryout', 'offseason', 'camp', 'summer_camp', 'jersey', 'regulations_next', 'sandbox_next_regulations', 'sandbox_setup', 'edit', 'corporate_departure', 'corporate_scout', 'club_recruit', 'budget_settlement'].includes(managementView) ? 'ml-56' : ''}>
            {screenMode === 'game' ? (
              <div className="p-2">
          {/* 管理画面へボタン（采配モード中は非表示） */}
          <div className="max-w-[1800px] mx-auto mb-2 flex justify-between items-center">
            {managedGameInfo && (
              <span className="text-yellow-400 text-sm font-bold">
                {formatDate(seasonData?.currentDate)} - 采配モード
                {(() => {
                  const fmt = seasonData?.settings?.leagueFormat;
                  if (fmt !== 'two') return null;
                  const allTeamNames = seasonData?.settings?.teamNames || [];
                  const half = Math.floor(allTeamNames.length / 2);
                  const l1 = new Set(allTeamNames.slice(0, half));
                  const h = homeTeam?.name, a = awayTeam?.name;
                  if (!h || !a) return null;
                  const isInter = l1.has(h) !== l1.has(a);
                  if (isInter) return <span className="ml-2 text-green-400">[ 交流戦 ]</span>;
                  const leagueNames = seasonData?.settings?.leagueNames;
                  const lName = l1.has(h) ? (leagueNames?.[0] || 'リーグ1') : (leagueNames?.[1] || 'リーグ2');
                  return <span className="ml-2 text-blue-400">[ {lName} ]</span>;
                })()}
              </span>
            )}
            <div className="ml-auto">
              {!managedGameInfo && (
                <button
                  onClick={() => setScreenMode('management')}
                  className="bg-gray-700/80 hover:bg-gray-600 text-gray-300 hover:text-white px-5 py-2.5 rounded-xl transition-all border border-gray-600/50 hover:border-gray-500 flex items-center gap-2 active:scale-95"
                >
                  <span>⚙️</span>
                  <span className="font-medium">管理画面へ</span>
                </button>
              )}
            </div>
          </div>

          {/* 3カラムレイアウト。試合前は選手を並べ替えるので選手欄重視(5-3-5)、
              試合中は中央（掲示板・対戦カード・コース図・ログ・采配）が主役なので
              中央を広げる(3-5-3)。左右のメンバー表は試合中は参照用 */}
          <div className="grid gap-2 max-w-[1800px] mx-auto" style={{gridTemplateColumns: gameStarted ? '3fr 5fr 3fr' : '5fr 3fr 5fr'}}>

            {/* ===== 左カラム: アウェイチーム ===== */}
            <div className="bg-gray-900 rounded-lg p-2 text-white min-w-0 overflow-hidden">
              <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-700">
                <h3 className="font-bold text-red-400">✈️ {awayTeam.name}</h3>
                <span className="text-2xl font-bold text-red-400">{score?.away || 0}</span>
              </div>
              
              {/* スタメンと控え選手を横並び表示 */}
              {!gameStarted ? (
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {/* 左: スタメン */}
                  <div>
                    <div className="text-xs text-gray-300 mb-1 px-1 font-semibold">スターティングメンバー</div>
                    <div className="space-y-1 text-xs max-h-[calc(100vh-350px)] overflow-y-auto">
                      {awayTeam.players
                        .filter(p => p.isStarter)
                        .sort((a, b) => a.battingOrder - b.battingOrder)
                        .map(player => {
                          const isPitcher = player.position === 'pitcher';
                          const posNames = POSITION_NAMES;
                          const throwHand = player.physical.throws === 'right' ? '右' : '左';
                          const batHand = player.batting.bats === 'right' ? '右' : player.batting.bats === 'left' ? '左' : '両';
                          const isSubSelected = selectedSubstituteAway === player.id;
                          const isSelected = selectedBatterAway === player.battingOrder;
                          const isPositionSelected = selectedPositionAway === player.id;

                          return (
                            <div
                              key={player.id}
                              onClick={() => handleSubstituteClick('away', player.id)}
                              className={`p-1.5 rounded cursor-pointer transition ${
                                isSubSelected ? 'bg-blue-600 text-white ring-2 ring-blue-400' :
                                'bg-gray-800 hover:bg-gray-700'
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleBatterClick('away', player.battingOrder);
                                  }}
                                  className="w-4 text-gray-400 text-xs hover:text-blue-400 transition font-bold"
                                >
                                  {player.battingOrder}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePositionClick('away', player.id);
                                  }}
                                  className={`w-6 text-center rounded text-sm py-0.5 font-bold transition ${
                                    isPositionSelected
                                      ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                                      : getPositionColor(player.position) + ' hover:opacity-80'
                                  }`}
                                >
                                  {posNames[player.position]}
                                </button>
                                <span className="font-medium text-base truncate flex-1">
                                  {player.name}
                                  <span className={`ml-0.5 text-xs ${CONDITION_COLORS[player.condition ?? CONDITION_LEVELS.NORMAL]}`}>{CONDITION_ICONS[player.condition ?? CONDITION_LEVELS.NORMAL]}</span>
                                </span>
                                <span className="text-xs text-gray-600 font-mono font-bold">#{player.number || player.id}</span>
<span className="text-sm text-gray-300 font-semibold">{throwHand}{batHand}</span>
                                {isSubSelected && <span className="text-blue-300 animate-pulse">◀</span>}
                                {isSelected && <span className="text-blue-300 animate-pulse">◀</span>}
                                {isPositionSelected && <span className="text-purple-300 animate-pulse">◀</span>}
                              </div>
                              <div className="ml-9 mt-0.5">
                                <div className="flex gap-3 text-xs text-gray-500 font-bold">
                                  <span className="w-7 text-center">ミ</span>
                                  <span className="w-7 text-center">パ</span>
                                  <span className="w-7 text-center">走</span>
                                  <span className="w-7 text-center">肩</span>
                                  <span className="w-7 text-center">守</span>
                                </div>
                                <div className="flex gap-3 text-sm font-bold">
                                  <span className={`w-7 text-center ${getAbilityTextColor(player.batting.meet)}`}>{player.batting.meet}</span>
                                  <span className={`w-7 text-center ${getAbilityTextColor(player.batting.power)}`}>{player.batting.power}</span>
                                  <span className={`w-7 text-center ${getAbilityTextColor(player.physical.speed)}`}>{player.physical.speed}</span>
                                  <span className={`w-7 text-center ${getAbilityTextColor(player.physical.arm)}`}>{player.physical.arm}</span>
                                  <span className={`w-7 text-center ${getAbilityTextColor(player.fielding.defense)}`}>{player.fielding.defense}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* 右: 控え選手 */}
                  <div>
                    <div className="text-xs text-gray-300 mb-1 px-1 font-semibold">ベンチメンバー</div>
                    <div className="space-y-0.5 text-xs max-h-[calc(100vh-350px)] overflow-y-auto">
                      {/* 控えは 捕→一→二→三→遊→左→中→右→投 の順に並べる（constants.js）。
                          ロスター順のままだと投手と野手が混ざって交代要員を探せない */}
                      {sortBenchByPosition(awayTeam.players.filter(p => !p.isStarter))
                        .map(player => {
                          const posNames = POSITION_NAMES;
                          const isPitcher = player.position === 'pitcher';
                          const throwHand = player.physical.throws === 'right' ? '右' : '左';
                          const batHand = player.batting.bats === 'right' ? '右' : player.batting.bats === 'left' ? '左' : '両';
                          const isSubSelected = selectedSubstituteAway === player.id;
                          const isSubbedOut = player.hasSubbedOut;

                          return (
                            <div
                              key={player.id}
                              onClick={() => !isSubbedOut && handleSubstituteClick('away', player.id)}
                              className={`p-1.5 rounded transition ${
                                isSubbedOut
                                  ? 'bg-gray-900 opacity-50 cursor-not-allowed'
                                  : isSubSelected
                                    ? 'bg-blue-600 text-white ring-2 ring-blue-400 cursor-pointer'
                                    : 'bg-gray-800 hover:bg-gray-700 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                <span className={`w-6 text-center text-sm font-bold ${getPositionColor(player.position)} rounded`}>{posNames[player.position]}</span>
                                <span className="font-medium text-sm truncate flex-1">{player.name}</span>
                                <span className="text-xs text-gray-300 shrink-0">{throwHand}{batHand}</span>
                                {isSubbedOut && <span className="text-red-400 text-xs">交代済</span>}
                                {isSubSelected && <span className="text-blue-300">👆</span>}
                              </div>
                              <div className="grid grid-cols-3 gap-1 text-xs ml-6 text-gray-300 tabular-nums">
                                <span>M{player.batting.meet}</span>
                                <span>P{player.batting.power}</span>
                                <span className="text-blue-300">{isPitcher ? `⚡${player.pitching.velocity}` : ''}</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              ) : (
                /* 試合中/試合終了後は現在フィールドにいる選手のみ表示 */
                <div className="mb-2">
                  <div className="space-y-1 text-sm max-h-[calc(100vh-200px)] overflow-y-auto">
                    {awayTeam.players
                      .filter(p => {
                        // 試合終了後：実際に出場した選手のみ
                        if (gameOver) {
                          const hasBattingStats = p.stats?.batting && (p.stats.batting.atBats > 0 || p.stats.batting.walks > 0 || p.stats.batting.hits > 0);
                          const hasPitchingStats = p.stats?.pitching && p.stats.pitching.outs > 0;
                          const isOnField = p.isStarter && !p.hasSubbedOut && p.battingOrder > 0;
                          return hasBattingStats || hasPitchingStats || isOnField;
                        }
                        // 試合中：現在フィールドにいる選手
                        return p.isStarter && !p.hasSubbedOut && p.battingOrder > 0;
                      })
                      .sort((a, b) => a.battingOrder - b.battingOrder)
                      .map(player => {
                    const isCurrentBatter = gameStarted && isTopInning && player.battingOrder === awayTeam.currentBatterOrder;
                    const isPitcher = player.position === 'pitcher';
                    const posNames = POSITION_NAMES;
                    const getPosColor = (pos) => getPositionColorHighlighted(pos, isCurrentBatter);

                    const throwHand = player.physical.throws === 'right' ? '右' : '左';
                    const batHand = player.batting.bats === 'right' ? '右' : player.batting.bats === 'left' ? '左' : '両';

                    const isSelected = !gameStarted && selectedBatterAway === player.battingOrder;
                    const isPositionSelected = !gameStarted && selectedPositionAway === player.id;
                    const isSubSelected = gameStarted && selectedSubstituteAway === player.id;
                    const isSubbedOut = player.hasSubbedOut;
                    const fitness = calculateDefensiveFitness(player, player.position);

                    return (
                      <div
                        key={player.id}
                        onClick={() => {
                          if (gameStarted && !isSubbedOut) {
                            handleSubstituteClick('away', player.id);
                          } else if (!gameStarted) {
                            handleBatterClick('away', player.battingOrder);
                          }
                        }}
                        className={`p-2 rounded transition ${
                          isSubbedOut ? 'opacity-50 cursor-not-allowed' :
                          isCurrentBatter ? 'bg-yellow-500 text-black cursor-pointer' :
                          isSubSelected ? 'bg-orange-600 text-white ring-2 ring-orange-400 cursor-pointer' :
                          isSelected ? 'bg-blue-600 text-white cursor-pointer' :
                          'hover:bg-gray-800 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <span className={`w-5 shrink-0 ${isCurrentBatter ? 'text-black font-bold' : isSelected ? 'text-white font-bold' : 'text-gray-400'}`}>{player.battingOrder}</span>
                          {!gameStarted ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePositionClick('away', player.id);
                              }}
                              className={`w-6 shrink-0 text-center rounded text-xs py-0.5 font-semibold transition ${
                                isPositionSelected
                                  ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                                  : getPosColor(player.position) + ' hover:opacity-80'
                              }`}
                            >
                              {posNames[player.position]}
                            </button>
                          ) : (
                            <span className={`w-6 shrink-0 text-center rounded text-sm py-0.5 font-bold ${getPosColor(player.position)}`}>{posNames[player.position]}</span>
                          )}
                          <span className="font-bold truncate">{player.name}</span>
                          <span className={`text-xs shrink-0 ${CONDITION_COLORS[player.condition ?? CONDITION_LEVELS.NORMAL]}`}>{CONDITION_ICONS[player.condition ?? CONDITION_LEVELS.NORMAL]}</span>
                          <span className={`text-xs shrink-0 ${isCurrentBatter ? 'text-yellow-800' : isSelected ? 'text-blue-200' : 'text-gray-400'}`}>{throwHand}{batHand}</span>
                          <span className="flex-1"></span>
                          {isSubbedOut && <span className="text-red-400 text-xs shrink-0">交代済</span>}
                          {isCurrentBatter && <span className="shrink-0">⚾</span>}
                          {isSubSelected && <span className="text-orange-300 shrink-0">⚡</span>}
                          {isSelected && <span className="shrink-0">👆</span>}
                          {isPositionSelected && <span className="shrink-0">🔄</span>}
                        </div>
                        {/* 2行目: 成績（打率・本塁打・打点）と打席結果。
                            打席結果を1行目に置くと選手名が切れるのでこちらへ移した。
                            成績は固定幅の右寄せで縦に揃えつつ、間隔を詰めて1かたまりに見せる。
                            バッジは右端に寄せ、入り切らない場合は**古い方から隠れる**
                            （justify-end + overflow-hidden） */}
                        {gameStarted ? (
                          <div className="flex items-center gap-2 ml-6 mt-0.5 text-xs">
                            <div className={`flex gap-1 font-bold tabular-nums shrink-0 ${isCurrentBatter ? 'text-yellow-800' : 'text-white'}`}>
                              {(() => {
                                const ss = player.seasonStats?.batting;
                                if (ss && ss.atBats > 0) {
                                  const avg = (ss.hits / ss.atBats).toFixed(3);
                                  return <>
                                    <span className="w-8 text-right">.{avg.split('.')[1]}</span>
                                    <span className="w-9 text-right">{ss.homeruns || 0}本</span>
                                    <span className="w-10 text-right">{ss.rbis || 0}点</span>
                                  </>;
                                }
                                if (isPitcher) {
                                  const ps = player.seasonStats?.pitching;
                                  if (ps && ps.inningsPitched > 0) {
                                    const era = ((ps.earnedRuns || 0) * 27 / ps.inningsPitched).toFixed(2);
                                    return <span>防御率 {era}</span>;
                                  }
                                }
                                return <span className={isCurrentBatter ? '' : 'text-gray-400'}>出場なし</span>;
                              })()}
                            </div>
                            {player.gameStats?.atBatResults?.length > 0 && (
                              /* **左から右へ増やす**。右寄せ(justify-end)にすると
                                 打席が増えるたびに既存のバッジが左へずれて落ち着かない。
                                 先頭から並べれば N打席目は常に同じ位置に出る。
                                 slice も先頭からにすること（-6 だと6打席目で全部ずれる） */
                              <div className="flex gap-0.5 flex-1 min-w-0 overflow-hidden">
                                {player.gameStats.atBatResults.slice(0, 6).map((r, i) => (
                                  <span key={i} title={r}
                                    style={{ textAlignLast: 'justify' }}
                                    className={`w-10 shrink-0 px-0.5 rounded text-white font-bold tracking-tight ${atBatResultColor(r)}`}>
                                    {formatAtBatResult(r)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className={`grid grid-cols-4 gap-1 text-xs ml-6 mt-0.5 tabular-nums ${isSelected ? 'text-blue-200' : 'text-gray-300'}`}>
                              <span>M{player.batting.meet}</span>
                              <span>P{player.batting.power}</span>
                              <span>E{player.batting.eye}</span>
                              <span className={isSelected ? 'text-blue-200' : 'text-blue-300'}>
                                {isPitcher ? `⚡${player.pitching.velocity}` : ''}
                              </span>
                            </div>
                            <div className={`text-xs ml-6 mt-0.5 ${
                              fitness.grade === 'S' ? 'text-yellow-400' :
                              fitness.grade === 'A' ? 'text-green-400' :
                              fitness.grade === 'B' ? 'text-blue-400' :
                              fitness.grade === 'D' ? 'text-red-400' :
                              'text-gray-400'
                            }`}>
                              守備適性 [{fitness.grade}] {fitness.comments}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 試合中の選手交代アコーディオン */}
                <div className="mt-2">
                  <button
                    onClick={() => setShowBenchAway(!showBenchAway)}
                    className="w-full p-2 bg-gray-800 hover:bg-gray-700 rounded text-sm text-orange-400 font-semibold transition flex items-center justify-between"
                  >
                    <span>⚡ 選手交代</span>
                    <span>{showBenchAway ? '▼' : '▶'}</span>
                  </button>

                  {showBenchAway && (
                    <div className="mt-2 space-y-1 text-xs max-h-64 overflow-y-auto">
                      {/* 控えは 捕→一→二→三→遊→左→中→右→投 の順に並べる（constants.js）。
                          ロスター順のままだと投手と野手が混ざって交代要員を探せない */}
                      {sortBenchByPosition(awayTeam.players.filter(p => !p.isStarter))
                        .map(player => {
                          const posNames = POSITION_NAMES;
                          const isPitcher = player.position === 'pitcher';
                          const throwHand = player.physical.throws === 'right' ? '右' : '左';
                          const batHand = player.batting.bats === 'right' ? '右' : player.batting.bats === 'left' ? '左' : '両';
                          const isSubSelected = selectedSubstituteAway === player.id;
                          const isSubbedOut = player.hasSubbedOut;

                          return (
                            <div
                              key={player.id}
                              onClick={() => !isSubbedOut && handleSubstituteClick('away', player.id)}
                              className={`p-1.5 rounded transition ${
                                isSubbedOut
                                  ? 'bg-gray-900 opacity-50 cursor-not-allowed'
                                  : isSubSelected
                                    ? 'bg-blue-600 text-white ring-2 ring-blue-400 cursor-pointer'
                                    : 'bg-gray-800 hover:bg-gray-700 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                <span className={`w-6 text-center text-sm font-bold ${getPositionColor(player.position)} rounded`}>{posNames[player.position]}</span>
                                <span className="font-medium text-sm truncate flex-1">{player.name}</span>
                                <span className="text-xs text-gray-300 shrink-0">{throwHand}{batHand}</span>
                                {isSubbedOut && <span className="text-red-400 text-xs">交代済</span>}
                                {isSubSelected && <span className="text-blue-300">👆</span>}
                              </div>
                              <div className="grid grid-cols-3 gap-1 text-xs ml-6 text-gray-300 tabular-nums">
                                <span>M{player.batting.meet}</span>
                                <span>P{player.batting.power}</span>
                                <span className="text-blue-300">{isPitcher ? `⚡${player.pitching.velocity}` : ''}</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* アウェイチーム 試合スタッツ/投手詳細 */}
              <div className="mt-2 pt-2 border-t border-gray-700">
                {gameStarted ? (
                  <>
                    <div className="text-sm text-gray-300 mb-1 font-semibold">📊 試合スタッツ</div>
                    {/* 投手成績 */}
                    <div className="bg-gray-800 rounded p-2 mb-1">
                      <div className="text-xs text-blue-400 mb-0.5">投手</div>
                      <div className="text-sm">
                        {(() => {
                          const pitchers = awayTeam.players.filter(p => (p.stats?.pitching?.outs || 0) > 0);
                          const totalOuts = pitchers.reduce((sum, p) => sum + (p.stats?.pitching?.outs || 0), 0);
                          const totalIP = totalOuts > 0 ? formatInnings(totalOuts) : '0回0/3';
                          return (
                            <>
                              {pitchers.map(p => {
                                const s = p.stats?.pitching || {};
                                const outs = s.outs || 0;
                                const ip = outs > 0 ? formatInnings(outs) : '0回0/3';
                                const era = outs > 0 ? ((s.runsAllowed || 0) * 27 / outs).toFixed(2) : '-.--';
                                return (
                                  <div key={p.id} className="flex justify-between text-gray-300 gap-1">
                                    <span className="truncate">{p.name}</span>
                                    <span className="text-gray-400 whitespace-nowrap text-xs">
                                      {ip} {s.strikeouts || 0}K {s.walks || 0}BB 防{era}
                                    </span>
                                  </div>
                                );
                              })}
                              {pitchers.length > 1 && (
                                <div className="flex justify-between text-yellow-400 text-xs mt-1 pt-1 border-t border-gray-700">
                                  <span>合計イニング</span>
                                  <span>{totalIP}</span>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-bold text-gray-300 mb-1">⚾ 予告先発</div>
                    {(() => {
                      const pitcher = awayTeam.players.find(p => p.isStarter && p.position === 'pitcher');
                      if (!pitcher) return null;
                      const formNames = {
                        overhand: 'オーバー',
                        threeQuarter: 'スリークォーター',
                        sidearm: 'サイドアーム',
                        submarine: 'アンダースロー'
                      };
                      const getValueColor = (val) => {
                        if (val >= 80) return 'text-red-400';
                        if (val >= 70) return 'text-orange-400';
                        if (val >= 60) return 'text-yellow-400';
                        if (val >= 50) return 'text-green-400';
                        return 'text-gray-400';
                      };
                      const getBgColor = (val) => {
                        if (val >= 80) return 'bg-red-500';
                        if (val >= 70) return 'bg-orange-500';
                        if (val >= 60) return 'bg-yellow-500';
                        if (val >= 50) return 'bg-green-500';
                        return 'bg-gray-500';
                      };
                      const velocityScore = Math.min(100, (pitcher.pitching.velocity - 100) * 2);
                      const staminaScore = Math.min(100, pitcher.pitching.stamina / 2);
                      return (
                        <div className="bg-gray-800 rounded p-3 border-2 border-gray-700">
                          <div className="text-base text-white mb-2 font-bold flex items-center gap-2">
                            <span>⚾</span>
                            <span>{pitcher.name}</span>
                            <span className="text-sm text-gray-400">#{pitcher.number || pitcher.id}</span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-xs text-gray-400">投げ手:</span>
                              <span className="text-white font-bold">{pitcher.physical.throws === 'right' ? '右投' : '左投'}</span>
                              <span className="text-gray-600">|</span>
                              <span className="text-white">{formNames[pitcher.pitching.form]}</span>
                              <span className="text-gray-600">|</span>
                              <span className="text-xs text-gray-400">球速:</span>
                              <span className={`text-lg font-bold ${getValueColor(velocityScore)}`}>{pitcher.pitching.velocity}</span>
                              <span className="text-xs text-gray-500">km/h</span>
                              <span className="text-gray-600">|</span>
                              <span className="text-xs text-gray-400">回転:</span>
                              <span className={`text-sm font-bold ${getValueColor(pitcher.pitching.spinRate ?? 50)}`}>{pitcher.pitching.spinRate ?? 50}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-12">制球</span>
                              <div className="flex-1 bg-gray-700 rounded h-3 overflow-hidden">
                                <div className={`h-full ${getBgColor(pitcher.pitching.control)}`} style={{ width: `${pitcher.pitching.control}%` }} />
                              </div>
                              <span className={`text-sm font-bold ${getValueColor(pitcher.pitching.control)}`}>{pitcher.pitching.control}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-12">体力</span>
                              <div className="flex-1 bg-gray-700 rounded h-3 overflow-hidden">
                                <div className={`h-full ${getBgColor(staminaScore)}`} style={{ width: `${staminaScore}%` }} />
                              </div>
                              <span className={`text-sm font-bold ${getValueColor(staminaScore)}`}>{pitcher.pitching.stamina}</span>
                            </div>
                            <div className="pt-1 border-t border-gray-700">
                              <div className="text-xs text-gray-400 mb-1">変化球</div>
                              <div className="flex flex-wrap gap-1.5">
                                {pitcher.pitching.arsenal.map((ball, i) => (
                                  <span key={i} className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded font-semibold">
                                    {getPitchTypeName(ball.type)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
            
            {/* ===== 中央カラム: メイン試合画面 ===== */}
            <div className="space-y-2 min-w-0">

              {/* 試合開始前の画面 */}
              {!gameStarted && (
                <div className="bg-gray-900 rounded-lg p-4 text-white text-center">
                  <h2 className="text-2xl font-bold mb-3">⚾ 野球シミュレーター</h2>
                  <p className="text-sm text-blue-400 mb-1">👆 選手パネルクリック → スタメン⇔ベンチ交代</p>
                  <p className="text-sm text-purple-400 mb-4">🔄 守備位置クリック → 守備交換</p>

                  {/* 監督AI設定 */}
                  <div className="mb-6 p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-center justify-center gap-3">
                      <span className="text-sm font-semibold">🤖 監督AI</span>
                      <button
                        onClick={() => setAutoManagerMode(!autoManagerMode)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          autoManagerMode ? 'bg-green-600' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            autoManagerMode ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <span className={`text-xs ${autoManagerMode ? 'text-green-400' : 'text-gray-400'}`}>
                        {autoManagerMode ? 'ON (自動采配)' : 'OFF (手動采配)'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      {autoManagerMode
                        ? '投手のスタミナが20%以下になると自動的に交代します'
                        : '選手交代は手動で行います'}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setGameStarted(true);
                      setSelectedBatterAway(null);
                      setSelectedBatterHome(null);
                      setSelectedPositionAway(null);
                      setSelectedPositionHome(null);
                      // 各選手のgameStatsを初期化
                      setAwayTeam(prev => ({
                        ...prev,
                        players: prev.players.map(p => ({
                          ...p,
                          gameStats: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, strikeouts: 0, atBatResults: [],
                            fieldingChances: 0, fieldErrors: 0, assists: 0 }
                        }))
                      }));
                      setHomeTeam(prev => ({
                        ...prev,
                        players: prev.players.map(p => ({
                          ...p,
                          gameStats: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, strikeouts: 0, atBatResults: [],
                            fieldingChances: 0, fieldErrors: 0, assists: 0 }
                        }))
                      }));
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-12 rounded-lg text-xl transition shadow-lg"
                  >
                    ⚾ 試合開始
                  </button>
                </div>
              )}

              {/* 電光掲示板風スコアボード */}
              {gameStarted && (
              <div className="bg-black rounded-lg p-1 font-mono border-4 border-gray-800 shadow-2xl overflow-hidden">
                {/* 上段: イニングスコア（電光掲示板風） */}
                <div className="bg-black rounded-t overflow-x-auto p-1">
                  <table className="w-full text-center text-xs table-fixed">
                    {/* ヘッダー行 */}
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="py-1 px-1 text-left text-orange-400" style={{width: '20%'}}>TEAM</th>
                        {inning <= 9 ? (
                          // 9回まで: 1-9回を表示
                          [1,2,3,4,5,6,7,8,9].map(i => (
                            <th key={i} className={`py-1 px-0 font-normal ${inning === i ? 'text-orange-300' : 'text-orange-500'}`} style={{textShadow: inning === i ? '0 0 8px #fb923c' : 'none'}}>{i}</th>
                          ))
                        ) : (
                          // 延長: 10回以降を表示（最大3イニング分）
                          [0,1,2].map(i => {
                            const extraInn = 10 + i;
                            return (
                              <th key={i} className={`py-1 px-0 font-normal ${inning === extraInn ? 'text-orange-300' : 'text-orange-500'}`} style={{textShadow: inning === extraInn ? '0 0 8px #fb923c' : 'none'}}>{extraInn}</th>
                            );
                          })
                        )}
                        <th className="py-1 px-1 text-orange-400 font-bold border-l border-gray-700" style={{width: '8%'}}>計</th>
                        <th className="py-1 px-1 text-orange-400" style={{width: '7%'}}>安</th>
                        <th className="py-1 px-1 text-orange-400" style={{width: '7%'}}>失</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* アウェイチーム */}
                      <tr className="border-b border-gray-800">
                        <td className={`py-1 px-1 text-left font-bold truncate ${isTopInning ? 'text-orange-300' : 'text-orange-500'}`} style={{textShadow: isTopInning ? '0 0 8px #fb923c' : 'none'}}>{awayTeam.name}</td>
                        {inning <= 9 ? (
                          // 9回まで
                          [0,1,2,3,4,5,6,7,8].map(i => (
                            <td key={i} className="py-1 px-0 text-orange-400 font-bold" style={{textShadow: inningScores?.away?.[i] !== null && inningScores?.away?.[i] !== undefined ? '0 0 6px #fb923c' : 'none'}}>
                              {inningScores?.away?.[i] !== null && inningScores?.away?.[i] !== undefined ? inningScores.away[i] : ''}
                            </td>
                          ))
                        ) : (
                          // 延長（アウェイ）
                          [0,1,2].map(i => (
                            <td key={i} className="py-1 px-0 text-orange-400 font-bold" style={{textShadow: extraInningScores?.away?.[i] !== null && extraInningScores?.away?.[i] !== undefined ? '0 0 6px #fb923c' : 'none'}}>
                              {extraInningScores?.away?.[i] !== null && extraInningScores?.away?.[i] !== undefined ? extraInningScores.away[i] : ''}
                            </td>
                          ))
                        )}
                        <td className="py-1 px-1 font-bold text-lg text-orange-300 border-l border-gray-700" style={{textShadow: '0 0 10px #fb923c'}}>{score?.away || 0}</td>
                        <td className="py-1 px-1 text-orange-400">{teamHits?.away || 0}</td>
                        <td className="py-1 px-1 text-orange-400">{teamErrors?.home || 0}</td>
                      </tr>
                      {/* ホームチーム */}
                      <tr>
                        <td className={`py-1 px-1 text-left font-bold truncate ${!isTopInning ? 'text-orange-300' : 'text-orange-500'}`} style={{textShadow: !isTopInning ? '0 0 8px #fb923c' : 'none'}}>{homeTeam.name}</td>
                        {inning <= 9 ? (
                          // 9回まで
                          [0,1,2,3,4,5,6,7,8].map(i => {
                            const homeScore = inningScores?.home?.[i];
                            // 9回裏、ホームチームがリードしている場合に「X」を表示する判定
                            const showX = i === 8 && inning === 9 && !isTopInning && (score?.home || 0) > (score?.away || 0) && homeScore === null;
                            return (
                              <td key={i} className="py-1 px-0 text-orange-400 font-bold" style={{textShadow: homeScore !== null && homeScore !== undefined || showX ? '0 0 6px #fb923c' : 'none'}}>
                                {showX ? 'X' : (homeScore !== null && homeScore !== undefined ? homeScore : '')}
                              </td>
                            );
                          })
                        ) : (
                          // 延長（ホーム）
                          [0,1,2].map(i => {
                            const homeScore = extraInningScores?.home?.[i];
                            return (
                              <td key={i} className="py-1 px-0 text-orange-400 font-bold" style={{textShadow: homeScore !== null && homeScore !== undefined ? '0 0 6px #fb923c' : 'none'}}>
                                {homeScore !== null && homeScore !== undefined ? homeScore : ''}
                              </td>
                            );
                          })
                        )}
                        <td className="py-1 px-1 font-bold text-lg text-orange-300 border-l border-gray-700" style={{textShadow: '0 0 10px #fb923c'}}>{score?.home || 0}</td>
                        <td className="py-1 px-1 text-orange-400">{teamHits?.home || 0}</td>
                        <td className="py-1 px-1 text-orange-400">{teamErrors?.away || 0}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                {/* 下段: BSO + 塁状況 + 投球数 + 球速（固定幅） */}
                <div className="bg-black p-2 rounded-b flex items-center justify-between border-t border-gray-800">
                  {/* BSO (3-2-2) 緑・黄・赤 - 固定幅 */}
                  <div className="flex flex-col gap-0.5 w-24 flex-shrink-0">
                    <div className="flex items-center gap-1">
                      <span className="w-4 text-xs text-green-500 font-bold">B</span>
                      {[0,1,2].map(i => (
                        <div key={i} className={`w-4 h-4 rounded-full border ${i < (count?.balls || 0) ? 'bg-green-500 border-green-400' : 'bg-gray-900 border-gray-700'}`} 
                             style={{boxShadow: i < (count?.balls || 0) ? '0 0 6px #22c55e' : 'none'}} />
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-4 text-xs text-yellow-400 font-bold">S</span>
                      {[0,1].map(i => (
                        <div key={i} className={`w-4 h-4 rounded-full border ${i < (count?.strikes || 0) ? 'bg-yellow-400 border-yellow-300' : 'bg-gray-900 border-gray-700'}`}
                             style={{boxShadow: i < (count?.strikes || 0) ? '0 0 6px #facc15' : 'none'}} />
                      ))}
                      <div className="w-4 h-4" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-4 text-xs text-red-500 font-bold">O</span>
                      {[0,1].map(i => (
                        <div key={i} className={`w-4 h-4 rounded-full border ${i < outs ? 'bg-red-500 border-red-400' : 'bg-gray-900 border-gray-700'}`}
                             style={{boxShadow: i < outs ? '0 0 6px #ef4444' : 'none'}} />
                      ))}
                      <div className="w-4 h-4" />
                    </div>
                  </div>
                  
                  {/* 区切り線 */}
                  <div className="w-px h-14 bg-gray-700 flex-shrink-0" />
                  
                  {/* 塁状況（固定幅） */}
                  <div className="relative w-16 h-14 flex items-center justify-center flex-shrink-0">
                    {/* 二塁 */}
                    <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-5 h-5 rotate-45 border ${bases[1] ? 'bg-yellow-400 border-yellow-300' : 'bg-gray-900 border-gray-700'}`}
                         style={{boxShadow: bases[1] ? '0 0 8px #facc15' : 'none'}} />
                    {/* 三塁 */}
                    <div className={`absolute top-1/2 left-1 -translate-y-1/2 w-5 h-5 rotate-45 border ${bases[2] ? 'bg-yellow-400 border-yellow-300' : 'bg-gray-900 border-gray-700'}`}
                         style={{boxShadow: bases[2] ? '0 0 8px #facc15' : 'none'}} />
                    {/* 一塁 */}
                    <div className={`absolute top-1/2 right-1 -translate-y-1/2 w-5 h-5 rotate-45 border ${bases[0] ? 'bg-yellow-400 border-yellow-300' : 'bg-gray-900 border-gray-700'}`}
                         style={{boxShadow: bases[0] ? '0 0 8px #facc15' : 'none'}} />
                  </div>
                  
                  {/* 区切り線 */}
                  <div className="w-px h-14 bg-gray-700 flex-shrink-0" />
                  
                  {/* 投手名・投球数（固定幅） */}
                  <div className="text-center w-24 flex-shrink-0">
                    <div className="text-orange-500 text-xs">P</div>
                    <div className="text-orange-300 text-xs truncate" style={{textShadow: '0 0 6px #f97316'}}>{getCurrentPitcher().name}</div>
                    <div className="text-orange-400 text-xl font-bold font-mono leading-tight" style={{textShadow: '0 0 6px #f97316'}}>
                      {String(getCurrentPitcher().stats?.pitching?.pitches || 0).padStart(3, ' ')}
                    </div>
                    <div className="text-orange-500 text-xs leading-none">球</div>
                  </div>

                  {/* 区切り線 */}
                  <div className="w-px h-14 bg-gray-700 flex-shrink-0" />

                  {/* 打者（球場の電光掲示板は打順・名前・打率を出す） */}
                  <div className="text-center w-24 flex-shrink-0">
                    <div className="text-orange-500 text-xs">B {currentBatterOrder}</div>
                    <div className="text-orange-300 text-xs truncate" style={{textShadow: '0 0 6px #f97316'}}>{getCurrentBatter().name}</div>
                    <div className="text-orange-400 text-xl font-bold font-mono leading-tight" style={{textShadow: '0 0 6px #f97316'}}>
                      {(() => {
                        const b = getCurrentBatter();
                        const ab = (b.seasonStats?.batting?.atBats || 0) + (b.gameStats?.atBats || 0);
                        const h = (b.seasonStats?.batting?.hits || 0) + (b.gameStats?.hits || 0);
                        return ab > 0 ? (h / ab).toFixed(3).replace(/^0/, '') : '.---';
                      })()}
                    </div>
                    <div className="text-orange-500 text-xs leading-none">打率</div>
                  </div>

                  {/* 区切り線 */}
                  <div className="w-px h-14 bg-gray-700 flex-shrink-0" />
                  
                  {/* 球種・球速表示（固定幅） */}
                  <div className="text-center w-20 flex-shrink-0">
                    <div className="text-orange-300 text-xs truncate">
                      {(() => {
                        const lastPitch = [...gameLog].reverse().find(log => log.velocity !== undefined);
                        return lastPitch ? lastPitch.pitchType : '---';
                      })()}
                    </div>
                    <div className="text-orange-400 text-2xl font-bold font-mono" style={{textShadow: '0 0 8px #f97316'}}>
                      {(() => {
                        const lastPitch = [...gameLog].reverse().find(log => log.velocity !== undefined);
                        return lastPitch ? String(lastPitch.velocity).padStart(3, ' ') : '---';
                      })()}
                    </div>
                    <div className="text-orange-500 text-xs">km/h</div>
                  </div>
                </div>
              </div>
              )}

              {/* 対戦カード & 操作ボタン */}
              {gameStarted && (
              <div className="bg-gray-800 rounded-lg p-3 shadow-lg border border-gray-700/50">
                {/* 対戦カード。**チーム色分けは使わない**（表裏で意味が反転するため）。
                    守備側=amber / 攻撃側=cyan で采配パネルと語彙を揃える。
                    名前は白、数字は tabular-nums で「目に入りやすさ」を優先する */}
                <div className="flex items-stretch gap-2 mb-3">
                  {/* ===== 守備側 ===== */}
                  <div className="flex-1 min-w-0 bg-gray-900/50 rounded p-2 border-l-2 border-amber-600/70">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-amber-300 shrink-0">守備</span>
                      <span className="text-xs text-gray-300 truncate">{isTopInning ? homeTeam.name : awayTeam.name}</span>
                    </div>
                    <div className="font-bold text-xl text-gray-100 truncate leading-tight">{getCurrentPitcher().name}</div>
                    <div className="text-xs text-gray-300 tabular-nums">
                      {getCurrentPitcher().physical.throws === 'right' ? '右投' : '左投'}
                      <span className="mx-1 text-gray-500">|</span>{getCurrentPitcher().pitching.velocity}km
                      <span className="mx-1 text-gray-500">|</span>回転{getCurrentPitcher().pitching.spinRate ?? 50}
                      <span className="mx-1 text-gray-500">|</span>防{(() => {
                        const p = getCurrentPitcher();
                        const totalOuts = (p.seasonStats?.pitching?.inningsPitched || 0) + (p.stats?.pitching?.outs || 0);
                        if (totalOuts === 0) return '-.--';
                        const er = (p.seasonStats?.pitching?.earnedRuns || 0)
                          + (p.stats?.pitching?.earnedRuns ?? p.stats?.pitching?.runsAllowed ?? 0);
                        return (er * 27 / totalOuts).toFixed(2);
                      })()}
                    </div>
                    {/* スタミナ */}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs text-gray-300 shrink-0">体力</span>
                      <div className="flex-1 bg-gray-700 rounded-full h-1.5 min-w-0">
                        <div className="bg-amber-500 h-1.5 rounded-full transition-all"
                          style={{width: `${(currentStamina / getCurrentPitcher().pitching.stamina) * 100}%`}} />
                      </div>
                      <span className="text-xs text-gray-200 tabular-nums shrink-0">
                        {currentStamina}/{getCurrentPitcher().pitching.stamina}
                      </span>
                    </div>
                    {/* 捕手。このゲームで配球を決めているのは捕手なので試合画面に出す */}
                    {(() => {
                      const c = getCurrentCatcher();
                      if (!c) return null;
                      const lead = c.catching?.lead ?? 50;
                      const def = c.fielding?.defense ?? 50;
                      return (
                        <div className="text-xs text-gray-300 mt-1 truncate"
                          title="リード=配球の巧さ（弱点を突く・読ませない） / 守備=フレーミング・暴投抑止">
                          捕 <span className="text-gray-100">{c.name}</span>
                          <span className="ml-1 tabular-nums">リード<span className={`font-bold ${getAbilityTextColor(lead)}`}>{lead}</span></span>
                          <span className="ml-1 tabular-nums">守<span className={`font-bold ${getAbilityTextColor(def)}`}>{def}</span></span>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="self-center text-lg font-bold text-gray-500 px-1 shrink-0">VS</div>

                  {/* ===== 攻撃側 ===== */}
                  <div className="flex-1 min-w-0 bg-gray-900/50 rounded p-2 border-r-2 border-cyan-600/70">
                    <div className="flex items-baseline gap-2 justify-end">
                      <span className="text-xs text-gray-300 truncate">{isTopInning ? awayTeam.name : homeTeam.name}</span>
                      <span className="text-xs font-bold text-cyan-300 shrink-0">攻撃 {currentBatterOrder}番</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-xl text-gray-100 truncate leading-tight">{getCurrentBatter().name}</div>
                        <div className="text-xs text-gray-300 tabular-nums">
                          {getCurrentBatter().batting.bats === 'switch' ? '両打' : getCurrentBatter().batting.bats === 'right' ? '右打' : '左打'}
                          {(() => {
                            const b = getCurrentBatter();
                            const ab = (b.seasonStats?.batting?.atBats || 0) + (b.gameStats?.atBats || 0);
                            const h = (b.seasonStats?.batting?.hits || 0) + (b.gameStats?.hits || 0);
                            const hr = (b.seasonStats?.batting?.homeruns || 0) + (b.gameStats?.homeruns || 0);
                            const rbi = (b.seasonStats?.batting?.rbis || 0) + (b.gameStats?.rbis || 0);
                            return <>
                              <span className="mx-1 text-gray-500">|</span>{ab > 0 ? (h / ab).toFixed(3).replace(/^0/, '') : '.---'}
                              <span className="mx-1 text-gray-500">|</span>{hr}本
                              <span className="mx-1 text-gray-500">|</span>{rbi}点
                            </>;
                          })()}
                        </div>
                        {/* 打者の型（野村の4分類）。狙い方が型で変わるので配球の材料になる */}
                        {(() => {
                          const t = getBatterType(getCurrentBatter());
                          const prof = getZoneProfile(getCurrentBatter());
                          const desc = describeZoneProfile(prof);
                          return (
                            <div className="flex items-center gap-1 justify-end flex-wrap mt-1">
                              <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-900/70 text-cyan-200 font-bold"
                                title={BATTER_TYPE_NOTE[t]}>{BATTER_TYPE_LABEL[t]}</span>
                              {desc.length > 0 && (
                                <span className="text-xs text-gray-300">{desc.join('・')}</span>
                              )}
                            </div>
                          );
                        })()}
                        <div className="text-xs mt-1">
                          <span className={`px-2 py-0.5 rounded ${
                            getHandednessEffect(getCurrentPitcher().physical.throws, getCurrentBatter().batting.bats).meetBonus
                              ? 'bg-blue-900/50 text-blue-200'
                              : 'bg-red-900/50 text-red-200'
                          }`}>
                            {getHandednessEffect(getCurrentPitcher().physical.throws, getCurrentBatter().batting.bats).label}
                          </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 投球コース（投手視点）と投球ログ。図と文字を同じ行に並べて
                    「どこに来て何が起きたか」を目線を動かさずに追えるようにする */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="shrink-0">
                    {/* カウントは図のすぐ上に置く。配球を決める時に電光掲示板まで
                        目線を戻さずに済ませるため（掲示板側にも残してある） */}
                    <div className="flex items-center gap-2 mb-1 h-4">
                      {[['B', count?.balls || 0, 3, 'bg-green-500'],
                        ['S', count?.strikes || 0, 2, 'bg-yellow-400'],
                        ['O', outs, 2, 'bg-red-500']].map(([label, n, max, on]) => (
                        <span key={label} className="flex items-center gap-0.5">
                          <span className="text-xs font-bold text-gray-300 mr-0.5">{label}</span>
                          {Array.from({ length: max }, (_, i) => (
                            <span key={i} className={`w-2 h-2 rounded-full ${i < n ? on : 'bg-gray-700'}`} />
                          ))}
                        </span>
                      ))}
                    </div>
                    {/* 打者の得手不得手（heat）は図に重ねる。別の小さいヒートマップを
                        対戦カードに置くと2枚を見比べることになって読みにくい */}
                    <PitchZonePlot size={168}
                      bats={getCurrentBatter().batting?.bats}
                      pitcherThrows={getCurrentPitcher().physical?.throws}
                      heat={zoneHeatmap(getZoneProfile(getCurrentBatter()))}
                      pitches={(() => {
                        const key = pitchSeqRef.current.key;
                        return gameLog.filter(l => l.pitchLoc && l.paKey === key);
                      })()} />
                    <div className="flex items-center justify-center gap-2 mt-1 text-xs text-gray-300">
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: HEAT_HOT, opacity: 0.55 }} />得意
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: HEAT_COLD, opacity: 0.55 }} />苦手
                      </span>
                    </div>
                  </div>
                  {/* 投球ログ。コースの右いっぱいに広げる
                      （flex内のスクロール領域なので高さを明示すること） */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1 h-4">
                      <span className="text-xs font-bold text-gray-300">投球ログ</span>
                      <span className="text-xs text-gray-400 tabular-nums">
                        この打席 {gameLog.filter(l => l.pitchLoc && l.paKey === pitchSeqRef.current.key).length}球
                      </span>
                    </div>
                    <div className="h-[168px] overflow-y-auto text-xs space-y-0.5 pr-1">
                      {gameLog.slice().reverse().slice(0, 30).map((log, i) => (
                        <div key={i} className={`px-1.5 py-1 rounded leading-tight ${
                          i === 0 ? 'bg-blue-900/40' : 'bg-gray-700/40'}`}>
                          {log.isSpecial ? (
                            <span className="font-bold text-purple-300">{log.description}</span>
                          ) : (
                            <>
                              <span className="text-gray-300">{log.inning}回{log.isTop ? '表' : '裏'}</span>
                              <span className="mx-1 text-gray-600">|</span>
                              <span className="font-mono tabular-nums text-gray-300">
                                {log.count?.balls || 0}-{log.count?.strikes || 0}
                              </span>
                              <span className="mx-1 text-gray-600">|</span>
                              <span className="text-blue-300">{log.pitchType}</span>
                              <span className="text-gray-300 ml-1 tabular-nums">{log.velocity}km</span>
                              <span className="mx-1 text-gray-600">→</span>
                              <span className="font-bold text-gray-100">{log.result}</span>
                              {/* 振り方（得意コース・打者有利カウントならフルスイング） */}
                              {log.pitchLoc?.swing && (
                                <span className={`ml-1 ${log.pitchLoc.swing === 'フルスイング'
                                  ? 'text-orange-300' : 'text-sky-300'}`}>[{log.pitchLoc.swing}]</span>
                              )}
                              {log.exitVelocity && (
                                <span className="text-gray-300 ml-1 tabular-nums">
                                  {/* 打出し角は整数で出す。物理側は回転数・球速・コースの補正を
                                      足した生の小数（16.15000000000002 のような値）を持っている。
                                      ⚠ 丸めるのは表示だけ。judgeFielderReach が
                                      「20〜45度なら本塁打」「10度未満はゴロ」と閾値で見ているので、
                                      物理側の値を丸めると境目の打球の判定が変わってしまう */}
                                  （EV{log.exitVelocity} {Math.round(log.launchAngle ?? 0)}° {log.distance}m 芯{log.meetQuality}%）
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                      {gameLog.length === 0 && (
                        <div className="text-gray-300 text-center py-2">まだ投球がありません</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 最新結果 */}
                {gameStarted && lastResult && (() => {
                  // 結果種別で色分け（安打=緑/長打=金/三振=赤/四死球=青/アウト=灰）
                  const d = lastResult.description || '';
                  const cat = /本塁打|ホームラン|三塁打|３塁打|二塁打|２塁打/.test(d) ? 'xbh'
                    : /ヒット|安打|出塁/.test(d) ? 'hit'
                    : /三振/.test(d) ? 'k'
                    : /四球|死球|フォアボール|敬遠/.test(d) ? 'bb'
                    : /アウト|ゴロ|フライ|併殺|邪飛|ライナー|失敗/.test(d) ? 'out'
                    : 'neutral';
                  const S = {
                    xbh: { box: 'border-amber-400 bg-amber-900/30', text: 'text-amber-200', icon: '💥' },
                    hit: { box: 'border-green-500 bg-green-900/25', text: 'text-green-200', icon: '🟢' },
                    k: { box: 'border-red-500 bg-red-900/25', text: 'text-red-200', icon: '❌' },
                    bb: { box: 'border-blue-500 bg-blue-900/25', text: 'text-blue-200', icon: '🎫' },
                    out: { box: 'border-gray-600 bg-gray-800', text: 'text-gray-200', icon: '' },
                    neutral: { box: 'border-yellow-500/60 bg-gray-800', text: 'text-yellow-100', icon: '' },
                  }[cat];
                  // 打球の飛距離バー（0-140m目安）
                  const distPct = lastResult.distance ? Math.max(4, Math.min(100, (lastResult.distance / 140) * 100)) : 0;
                  // 1行に畳む。球種・球速は電光掲示板とログに出ているので繰り返さない
                  return (
                    <div className={`rounded-lg px-3 py-1.5 border mb-2 flex items-center gap-3 ${S.box}`}>
                      <div className="shrink-0">
                        {S.icon && <span className="mr-1">{S.icon}</span>}
                        <span className={`font-bold text-lg ${S.text}`}>{d}</span>
                      </div>
                      {lastResult.exitVelocity ? (
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-300 tabular-nums text-right">
                            EV {lastResult.exitVelocity} / {Math.round(lastResult.launchAngle ?? 0)}° / {lastResult.distance}m / 芯 {lastResult.meetQuality}%
                          </div>
                          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mt-0.5">
                            <div className={`h-full rounded-full ${cat === 'xbh' ? 'bg-amber-400' : cat === 'hit' ? 'bg-green-500' : 'bg-gray-500'}`} style={{ width: `${distPct}%` }} />
                          </div>
                        </div>
                      ) : lastResult.timingWindow ? (
                        <div className="flex-1 text-xs text-gray-300 tabular-nums text-right">
                          タイミング窓 {lastResult.timingWindow}ms / 誤差 {lastResult.timingError}ms
                        </div>
                      ) : <div className="flex-1" />}
                    </div>
                  );
                })()}

                {/* 采配コントロール。攻撃中は攻撃の指示だけ、守備中は配球だけを出す
                    （従来は両方を常に並べて、使えない側を薄く表示していた） */}
                <TutorialHint id="ingame-tactics" title="試合の采配">
                  <b className="text-cyan-200">攻撃中</b>は打撃方針・狙い球（球種／コース）・盗塁・エンドラン・バント、
                  <b className="text-amber-200">守備中</b>は配球（球種／狙い）・敬遠を指示できます。
                  いま操作できる側だけが表示されます。おまかせにすれば監督AIと捕手AIが自動で判断します。
                </TutorialHint>
                {(() => {
                  const isUserBatting = (isTopInning ? awayTeam.name : homeTeam.name) === userTeamName;
                  const busy = isAutoSimulating || gameOver;
                  const pick = (active, color) => `px-2.5 py-1 rounded text-xs font-bold transition ${
                    active ? `${color} text-white` : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`;
                  const act = 'px-2.5 py-1 rounded text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed';
                  const row = 'flex items-center justify-center gap-1.5 flex-wrap';
                  const tag = (color) => `text-xs w-14 text-right ${color}`;

                  // ===== 攻撃中 =====
                  if (isUserBatting) {
                    const aiming = batGuessType !== 'auto' || batGuessZone !== 'auto';
                    return (
                      <div className="bg-cyan-950/30 border border-cyan-800/40 rounded p-2 mb-2 space-y-1.5">
                        <div className={row}>
                          <span className={tag('text-cyan-300')}>打撃</span>
                          {[['take', '待て'], ['normal', 'おまかせ'], ['aggressive', '積極']].map(([v, label]) => (
                            <button key={v} onClick={() => setBattingApproach(v)} disabled={gameOver}
                              title={v === 'take' ? '見送りを増やして球数を稼ぐ。振るときも当てにいく'
                                : v === 'aggressive' ? '早いカウントから積極的に打ちにいく。フルスイングが増える'
                                : '監督AIに任せる（得意コースはフルスイング／追い込まれたら当てにいく）'}
                              className={pick(battingApproach === v, 'bg-cyan-600')}>{label}</button>
                          ))}
                          <span className="text-xs text-gray-600">｜</span>
                          <button onClick={() => triggerSteal(throwPitch)} disabled={!bases[0] || busy}
                            title="一塁走者が次球で盗塁"
                            className={`${act} bg-emerald-700 text-emerald-100 hover:bg-emerald-600`}>🏃 盗塁</button>
                          <button onClick={() => triggerHitAndRun(throwPitch)} disabled={!bases[0] || outs >= 2 || busy}
                            title="走者を走らせ打者は必ず打ちにいく"
                            className={`${act} bg-emerald-800 text-emerald-100 hover:bg-emerald-700`}>エンドラン</button>
                          <button onClick={() => handleBunt()} disabled={busy}
                            title="送りバント"
                            className={`${act} bg-yellow-700 text-yellow-100 hover:bg-yellow-600`}>バント</button>
                          <button onClick={() => handleBunt()} disabled={!bases[2] || outs > 1 || busy}
                            title="三塁走者を還すスクイズバント"
                            className={`${act} bg-yellow-800 text-yellow-100 hover:bg-yellow-700`}>スクイズ</button>
                        </div>
                        <div className={row}>
                          <span className={tag('text-cyan-300')}>狙い球</span>
                          <button onClick={() => setBatGuessType('auto')} disabled={gameOver}
                            title="球種は張らない（読み合いはAIに任せる）"
                            className={pick(batGuessType === 'auto', 'bg-cyan-700')}>おまかせ</button>
                          {['straight', 'breaking'].map(v => (
                            <button key={v} onClick={() => setBatGuessType(v)} disabled={gameOver}
                              title={`${GUESS_TYPE_LABEL[v]}に張る。来れば強く振れるが、違えば対応が遅れる`}
                              className={pick(batGuessType === v, 'bg-cyan-700')}>{GUESS_TYPE_LABEL[v]}</button>
                          ))}
                          <span className="text-xs text-gray-600">｜</span>
                          <span className={tag('text-teal-300')}>コース</span>
                          <button onClick={() => setBatGuessZone('auto')} disabled={gameOver}
                            title="コースは張らない"
                            className={pick(batGuessZone === 'auto', 'bg-teal-700')}>おまかせ</button>
                          {['in', 'out', 'high', 'low'].map(v => (
                            <button key={v} onClick={() => setBatGuessZone(v)} disabled={gameOver}
                              title={`${GUESS_ZONE_LABEL[v]}に張る。その半面に来れば読み切れる`}
                              className={pick(batGuessZone === v, 'bg-teal-700')}>{GUESS_ZONE_LABEL[v]}</button>
                          ))}
                          {aiming && (
                            <span className="text-xs px-2 py-1 rounded bg-amber-900 text-amber-200"
                              title="張った次元が当たれば読み、外せば対応が遅れる。両方当てるとタイミング窓が1.5倍">
                              ヤマ張り中
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // ===== 守備中 =====
                  const arsenal = getCurrentPitcher()?.pitches || [];
                  const obj = decidePitchObjective(bases, outs);
                  return (
                    <div className="bg-amber-950/30 border border-amber-800/40 rounded p-2 mb-2 space-y-1.5">
                      <div className={row}>
                        <span className={tag('text-amber-300')}>配球</span>
                        <button onClick={() => setPitchTypeIndex('auto')} disabled={gameOver}
                          title="球種は捕手のリードに任せる"
                          className={pick(pitchTypeIndex === 'auto', 'bg-amber-700')}>おまかせ</button>
                        {arsenal.map((b, i) => (
                          <button key={i} onClick={() => setPitchTypeIndex(i)} disabled={gameOver}
                            title={`${ballEffects[b.type]?.name || b.type} Lv${b.level}`}
                            className={pick(pitchTypeIndex === i, 'bg-amber-700')}>
                            {ballEffects[b.type]?.name || b.type}
                          </button>
                        ))}
                      </div>
                      <div className={row}>
                        <span className={tag('text-rose-300')}>狙い</span>
                        <button onClick={() => setPitchAim('auto')} disabled={gameOver}
                          title="狙いも捕手のリードに任せる"
                          className={pick(pitchAim === 'auto', 'bg-rose-700')}>おまかせ</button>
                        {['zone', 'edge', 'chase'].map(v => (
                          <button key={v} onClick={() => setPitchAim(v)} disabled={gameOver}
                            title={v === 'zone' ? 'ゾーンで勝負。ストライクは取れるが打たれやすい'
                              : v === 'edge' ? '際どいコース。打ち損じを誘うが四球のリスク'
                              : '誘い球（ボール球）。振らせれば凡打、見逃されれば四球に近づく'}
                            className={pick(pitchAim === v, 'bg-rose-700')}>{AIM_LABEL[v]}</button>
                        ))}
                        <span className="text-xs text-gray-600">｜</span>
                        <button onClick={() => triggerIntentionalWalk(throwPitch)} disabled={busy}
                          title="現在の打者を敬遠"
                          className={`${act} bg-indigo-700 text-indigo-100 hover:bg-indigo-600`}>敬遠</button>
                        {/* 場面から捕手が求める結果。プレイヤーは操作しないが何を狙っているかは見せる */}
                        {obj.goal !== 'normal' && (
                          <span className={`text-xs px-2 py-1 rounded ${
                            obj.goal === 'groundball' ? 'bg-emerald-900 text-emerald-200' : 'bg-sky-900 text-sky-200'}`}
                            title={OBJECTIVE_NOTE[obj.goal] + (obj.avoidWalk ? '（満塁なので押し出しを避ける）' : '')}>
                            {OBJECTIVE_LABEL[obj.goal]}{obj.avoidWalk ? '・押し出し回避' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })()}
                {/* 試合進行。采配（上）と進行（下）を分ける */}
                <div className="flex justify-center items-center gap-2 flex-wrap border-t border-gray-700/60 pt-2">
                  <button onClick={throwPitch} disabled={isAutoSimulating || gameOver}
                    className="bg-blue-600 text-white px-5 py-2 rounded font-bold hover:bg-blue-700 disabled:opacity-50">
                    ⚾ 1球
                  </button>
                  <button onClick={() => startSimMode('out')} disabled={isAutoSimulating || gameOver}
                    className="bg-purple-600 text-white px-3 py-2 rounded text-sm hover:bg-purple-700 disabled:opacity-50">
                    1アウトまで
                  </button>
                  <button onClick={() => startSimMode('end')} disabled={isAutoSimulating || gameOver}
                    className="bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700 disabled:opacity-50">
                    試合終了まで
                  </button>
                  <span className="w-px h-7 bg-gray-700 mx-1" />
                  <button onClick={() => setAutoManagerMode(!autoManagerMode)}
                    title="監督AIに采配を任せる"
                    className={`px-3 py-2 rounded text-sm font-semibold transition ${
                      autoManagerMode ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}>
                    🤖 {autoManagerMode ? 'AI ON' : 'AI OFF'}
                  </button>
                  {managedGameInfo && !gameOver && (
                    <button
                      onClick={() => {
                        if (isAutoSimulating) {
                          setSimMode(null);
                          setRemainingPitches(0);
                          setIsAutoSimulating(false);
                        }
                        setSubModalSelected(null);
                        setShowSubModal(true);
                      }}
                      className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded text-sm font-semibold transition"
                    >
                      選手交代
                    </button>
                  )}
                </div>
              </div>
              )}

              {/* 選手交代モーダル */}
              {showSubModal && gameStarted && managedGameInfo && (() => {
                const isUserHome = homeTeam.name === userTeamName;
                const userTeam = isUserHome ? homeTeam : awayTeam;
                const teamType = isUserHome ? 'home' : 'away';
                const fieldPlayers = userTeam.players
                  .filter(p => p.isStarter && !p.hasSubbedOut && (p.battingOrder > 0 || p.position === 'pitcher'))
                  .sort((a, b) => (a.battingOrder || 10) - (b.battingOrder || 10));
                // 交代モーダルも同じ並び（捕→一→…→右→投）
                const benchPlayers = sortBenchByPosition(userTeam.players.filter(p => !p.isStarter && !p.hasSubbedOut));
                const posNames = POSITION_NAMES;
                const selectedPlayer = subModalSelected ? userTeam.players.find(p => p.id === subModalSelected) : null;
                const selectedIsField = selectedPlayer?.isStarter && !selectedPlayer?.hasSubbedOut && (selectedPlayer?.battingOrder > 0 || selectedPlayer?.position === 'pitcher');

                const setUserTeam = isUserHome ? setHomeTeam : setAwayTeam;
                const handleModalClick = (playerId) => {
                  const clicked = userTeam.players.find(p => p.id === playerId);
                  if (!clicked) return;
                  const clickedIsField = clicked.isStarter && !clicked.hasSubbedOut && (clicked.battingOrder > 0 || clicked.position === 'pitcher');

                  if (!subModalSelected) {
                    setSubModalSelected(playerId);
                  } else if (subModalSelected === playerId) {
                    setSubModalSelected(null);
                  } else {
                    const fieldId = selectedIsField ? subModalSelected : (clickedIsField ? playerId : null);
                    const benchId = !selectedIsField ? subModalSelected : (!clickedIsField ? playerId : null);
                    if (!fieldId || !benchId) {
                      setSubModalSelected(playerId);
                      return;
                    }
                    const fieldPlayer = userTeam.players.find(p => p.id === fieldId);
                    const benchPlayer = userTeam.players.find(p => p.id === benchId);
                    const posLabel = { pitcher: '投手', catcher: '捕手', first: '一塁', second: '二塁', short: '遊撃', third: '三塁', left: '左翼', center: '中堅', right: '右翼', dh: 'DH' };
                    setGameLog(prev => [...prev, {
                      description: `[選手交代] ${fieldPlayer?.name} → ${benchPlayer?.name} (${posLabel[fieldPlayer?.position] || ''})`,
                      isSpecial: true
                    }]);
                    setUserTeam(prev => {
                      const players = prev.players.map(p => ({...p}));
                      const fieldP = players.find(p => p.id === fieldId);
                      const benchP = players.find(p => p.id === benchId);
                      if (!fieldP || !benchP) return prev;

                      const oldOrder = fieldP.battingOrder;
                      const oldPos = fieldP.position;

                      fieldP.isStarter = false;
                      fieldP.hasSubbedOut = true;
                      fieldP.battingOrder = 0;
                      fieldP.position = getBestFitPosition(fieldP);

                      benchP.isStarter = true;
                      benchP.battingOrder = oldOrder;
                      benchP.position = oldPos;

                      if (oldPos === 'pitcher') {
                        const isDefense = (isUserHome && isTopInning) || (!isUserHome && !isTopInning);
                        if (isDefense) {
                          setTimeout(() => {
                            const maxSt = benchP.pitching?.stamina || 100;
                            const fat = benchP.fatigue || 0;
                            setCurrentStamina(Math.max(Math.floor(maxSt * 0.5), maxSt - fat));
                          }, 0);
                        }
                      }
                      return { ...prev, players };
                    });
                    setSubModalSelected(null);
                    setShowSubModal(false);
                  }
                };

                return (
                  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => { setShowSubModal(false); setSubModalSelected(null); }}>
                    <div className="bg-gray-900 rounded-xl p-4 max-w-lg w-full mx-4 border border-gray-600 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-white font-bold text-lg">選手交代</h3>
                        <button onClick={() => { setShowSubModal(false); setSubModalSelected(null); }} className="text-gray-400 hover:text-white text-xl">&times;</button>
                      </div>
                      <p className="text-xs text-gray-400 mb-3">フィールド選手を選んでからベンチ選手を選ぶと交代します</p>

                      <div className="mb-3">
                        <div className="text-xs text-gray-500 font-bold mb-1">フィールド</div>
                        <div className="space-y-1">
                          {fieldPlayers.map(p => {
                            const isPitcher = p.position === 'pitcher';
                            const throwH = p.physical.throws === 'right' ? '右' : '左';
                            const batH = p.batting.bats === 'right' ? '右' : p.batting.bats === 'left' ? '左' : '両';
                            const isSelected = subModalSelected === p.id;
                            const fitness = calculateDefensiveFitness(p, p.position);
                            return (
                              <div key={p.id} onClick={() => handleModalClick(p.id)}
                                className={`p-1.5 rounded cursor-pointer transition ${isSelected ? 'bg-orange-600 ring-2 ring-orange-400' : 'bg-gray-800 hover:bg-gray-700'}`}>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-gray-400 w-4 text-center text-xs">{p.battingOrder}</span>
                                  <span className={`w-6 text-center text-xs font-bold rounded ${getPositionColor(p.position)}`}>{posNames[p.position]}</span>
                                  <span className="text-white text-sm font-medium truncate flex-1">{p.name}</span>
                                  <span className="text-gray-400 text-xs">{throwH}{batH}</span>
                                  <span className="text-gray-500 text-xs">M{p.batting.meet} P{p.batting.power}</span>
                                  {isPitcher && <span className="text-blue-400 text-xs">{p.pitching.velocity}km</span>}
                                  <span className={`text-xs ${fitness.grade === 'S' ? 'text-yellow-400' : fitness.grade === 'A' ? 'text-green-400' : fitness.grade === 'B' ? 'text-blue-400' : fitness.grade === 'D' ? 'text-red-400' : 'text-gray-500'}`}>{fitness.grade}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-gray-500 font-bold mb-1">ベンチ</div>
                        {benchPlayers.length === 0 ? (
                          <div className="text-xs text-gray-600 p-2">交代可能な選手がいません</div>
                        ) : (
                          <div className="space-y-1">
                            {benchPlayers.map(p => {
                              const isPitcher = p.position === 'pitcher';
                              const throwH = p.physical.throws === 'right' ? '右' : '左';
                              const batH = p.batting.bats === 'right' ? '右' : p.batting.bats === 'left' ? '左' : '両';
                              const isSelected = subModalSelected === p.id;
                              return (
                                <div key={p.id} onClick={() => handleModalClick(p.id)}
                                  className={`p-1.5 rounded cursor-pointer transition ${isSelected ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-gray-800 hover:bg-gray-700'}`}>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-6 text-center text-xs font-bold rounded ${getPositionColor(p.position)}`}>{posNames[p.position]}</span>
                                    <span className="text-white text-sm font-medium truncate flex-1">{p.name}</span>
                                    <span className="text-gray-400 text-xs">{throwH}{batH}</span>
                                    <span className="text-gray-500 text-xs">M{p.batting.meet} P{p.batting.power}</span>
                                    {isPitcher && <span className="text-blue-400 text-xs">{p.pitching.velocity}km</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 試合結果（下段に配置） */}
              {gameOver && (() => {
                // 勝利/敗戦/セーブ投手と本塁打の判定
                const isHomeWin = score.home > score.away;
                const isDraw = score.home === score.away;
                const winTeam = isHomeWin ? homeTeam : awayTeam;
                const loseTeam = isHomeWin ? awayTeam : homeTeam;

                // 勝利投手: 先発が5回（15アウト）以上→先発の勝ち、それ以外→最多投球回リリーフの勝ち
                const winPitchers = winTeam.players.filter(p => (p.stats?.pitching?.outs || 0) > 0).sort((a, b) => (b.stats?.pitching?.outs || 0) - (a.stats?.pitching?.outs || 0));
                const starter = winPitchers.find(p => p.originalPosition === 'pitcher' || p.battingOrder === 9);
                const winPitcher = !isDraw ? (
                  starter && (starter.stats?.pitching?.outs || 0) >= 15
                    ? starter
                    : winPitchers.find(p => p !== starter) || winPitchers[0]
                ) : null;

                // 敗戦投手: 先発が失点していれば先発、そうでなければ最多失点のリリーフ
                const losePitchers = loseTeam.players.filter(p => (p.stats?.pitching?.outs || 0) > 0);
                const loseStarter = losePitchers.find(p => p.originalPosition === 'pitcher' || p.battingOrder === 9) || losePitchers.sort((a, b) => (b.stats?.pitching?.outs || 0) - (a.stats?.pitching?.outs || 0))[0];
                const losePitcher = !isDraw ? (
                  loseStarter && (loseStarter.stats?.pitching?.runsAllowed || 0) > 0
                    ? loseStarter
                    : losePitchers.sort((a, b) => (b.stats?.pitching?.runsAllowed || 0) - (a.stats?.pitching?.runsAllowed || 0))[0] || null
                ) : null;

                // セーブ投手: 勝ちチームの最後の投手で以下のいずれか:
                //   a) 3点差以内でリード時に1イニング以上(3アウト以上)
                //   b) 3イニング以上(9アウト以上)
                const scoreDiff = Math.abs(score.home - score.away);
                const lastPitcher = winPitchers.length > 1
                  ? [...winPitchers].filter(p => p !== winPitcher).sort((a, b) => (a.stats?.pitching?.outs || 0) - (b.stats?.pitching?.outs || 0))[0]
                  : null;
                const saveOuts = lastPitcher?.stats?.pitching?.outs || 0;
                const savePitcher = !isDraw && lastPitcher && lastPitcher !== winPitcher &&
                  ((scoreDiff <= 3 && saveOuts >= 3) || saveOuts >= 9) ? lastPitcher : null;

                // 本塁打を打った選手
                const hrHitters = [
                  ...awayTeam.players.filter(p => (p.gameStats?.homeruns || 0) > 0).map(p => ({ ...p, team: awayTeam.name })),
                  ...homeTeam.players.filter(p => (p.gameStats?.homeruns || 0) > 0).map(p => ({ ...p, team: homeTeam.name }))
                ];

                // 投手の成績を取得（今の試合結果を含む）
                const getPitcherRecord = (pitcher, teamState, decisionType) => {
                  if (!pitcher) return '';
                  const teamName = teamState === winTeam ? (isHomeWin ? homeTeam.name : awayTeam.name) : (isHomeWin ? awayTeam.name : homeTeam.name);
                  const teamData = TEAMS_DATA[teamName];
                  const playerData = teamData?.players?.find(p => p.id === pitcher.id);
                  const sp = playerData?.seasonStats?.pitching || {};
                  // 今の試合の結果を加算（handleManagedGameEnd前に表示されるため）
                  const wins = (sp.wins || 0) + (decisionType === 'win' ? 1 : 0);
                  const losses = (sp.losses || 0) + (decisionType === 'lose' ? 1 : 0);
                  const saves = (sp.saves || 0) + (decisionType === 'save' ? 1 : 0);
                  if (decisionType === 'save') return `${saves}S`;
                  return `${wins}勝${losses}敗`;
                };

                // スクロール用テキスト組み立て
                const scrollParts = [];
                if (!isDraw) {
                  scrollParts.push(`🏆 ${isHomeWin ? homeTeam.name : awayTeam.name} の勝利！`);
                } else {
                  scrollParts.push('引き分け');
                }
                if (winPitcher) scrollParts.push(`勝利投手：${winPitcher.name}（${getPitcherRecord(winPitcher, winTeam, 'win')}）`);
                if (losePitcher) scrollParts.push(`敗戦投手：${losePitcher.name}（${getPitcherRecord(losePitcher, loseTeam, 'lose')}）`);
                if (savePitcher) scrollParts.push(`セーブ：${savePitcher.name}（${getPitcherRecord(savePitcher, winTeam, 'save')}）`);

                // 完封勝利 / 完投勝利
                if (!isDraw && winPitcher) {
                  const winTeamPitchers = winTeam.players.filter(p => (p.stats?.pitching?.outs || 0) > 0);
                  if (winTeamPitchers.length === 1) {
                    const loseScore = isHomeWin ? score.away : score.home;
                    if (loseScore === 0) {
                      scrollParts.push(`✨${winPitcher.name}が完封勝利！`);
                    } else {
                      scrollParts.push(`💪${winPitcher.name}が完投勝利！`);
                    }
                  }
                }

                // 本塁打ハイライト
                hrHitters.forEach(p => {
                  const seasonHR = (p.seasonStats?.batting?.homeruns || 0) + (p.gameStats?.homeruns || 0);
                  const count = p.gameStats?.homeruns || 0;
                  for (let i = 0; i < count; i++) {
                    scrollParts.push(`⚾${p.name}（${p.team}）${seasonHR - count + i + 1}号`);
                  }
                });

                // 猛打賞（3打数3安打以上）
                const allGamePlayers = [
                  ...awayTeam.players.map(p => ({ ...p, teamLabel: awayTeam.name })),
                  ...homeTeam.players.map(p => ({ ...p, teamLabel: homeTeam.name }))
                ];
                allGamePlayers.forEach(p => {
                  const gs = p.gameStats || {};
                  const ab = gs.atBats || 0;
                  const hits = gs.hits || 0;
                  if (ab >= 3 && hits >= 3) {
                    scrollParts.push(`🔥${p.name}（${p.teamLabel}）${ab}打数${hits}安打の猛打賞！`);
                  }
                });

                // 多打点（3打点以上）
                allGamePlayers.forEach(p => {
                  const rbis = p.gameStats?.rbis || 0;
                  if (rbis >= 3) {
                    scrollParts.push(`💥${p.name}（${p.teamLabel}）${rbis}打点の大活躍！`);
                  }
                });

                // 二桁奪三振
                const allPitchers = [
                  ...awayTeam.players.filter(p => (p.stats?.pitching?.outs || 0) > 0).map(p => ({ ...p, teamLabel: awayTeam.name })),
                  ...homeTeam.players.filter(p => (p.stats?.pitching?.outs || 0) > 0).map(p => ({ ...p, teamLabel: homeTeam.name }))
                ];
                allPitchers.forEach(p => {
                  const so = p.stats?.pitching?.strikeouts || 0;
                  if (so >= 10) {
                    scrollParts.push(`🌟${p.name}（${p.teamLabel}）${so}奪三振の力投！`);
                  }
                });

                const scrollText = scrollParts.join('　　');

                return (
                <div className="bg-gray-900 rounded-lg p-4 text-white">
                  <h3 className="text-2xl font-bold mb-3 text-center text-yellow-400">🏆 試合終了</h3>
                  <div className="flex justify-center items-center gap-8 text-xl font-bold mb-4">
                    <div className="text-red-400">
                      <div>{awayTeam.name}</div>
                      <div className="text-4xl mt-1">{score.away}</div>
                    </div>
                    <div className="text-3xl text-gray-500">-</div>
                    <div className="text-blue-400">
                      <div>{homeTeam.name}</div>
                      <div className="text-4xl mt-1">{score.home}</div>
                    </div>
                  </div>

                  {/* スクロールテロップ */}
                  <div className="overflow-hidden bg-gray-800 rounded-lg mb-3 py-2">
                    <div className="whitespace-nowrap text-lg font-bold text-yellow-300" style={{
                      display: 'inline-block',
                      animation: 'marquee 12s linear infinite',
                      willChange: 'transform',
                      backfaceVisibility: 'hidden',
                    }}>
                      <span>{scrollText}　　　　</span><span>{scrollText}　　　　</span>
                    </div>
                    <style>{`
                      @keyframes marquee {
                        0% { transform: translate3d(0, 0, 0); }
                        100% { transform: translate3d(-50%, 0, 0); }
                      }
                    `}</style>
                  </div>

                  {/* 投手・本塁打情報 */}
                  <div className="flex justify-center gap-6 text-sm mb-3">
                    {winPitcher && (
                      <div className="flex items-center gap-1">
                        <span className="text-red-400 font-bold">○</span>
                        <span>{winPitcher.name}</span>
                        <span className="text-gray-400 text-xs">{getPitcherRecord(winPitcher, winTeam, 'win')}</span>
                      </div>
                    )}
                    {losePitcher && (
                      <div className="flex items-center gap-1">
                        <span className="text-blue-400 font-bold">●</span>
                        <span>{losePitcher.name}</span>
                        <span className="text-gray-400 text-xs">{getPitcherRecord(losePitcher, loseTeam, 'lose')}</span>
                      </div>
                    )}
                    {savePitcher && (
                      <div className="flex items-center gap-1">
                        <span className="text-green-400 font-bold">S</span>
                        <span>{savePitcher.name}</span>
                        <span className="text-gray-400 text-xs">{getPitcherRecord(savePitcher, winTeam, 'save')}</span>
                      </div>
                    )}
                  </div>
                  {hrHitters.length > 0 && (
                    <div className="text-center text-sm mb-3">
                      <span className="text-gray-400 mr-2">本塁打</span>
                      {hrHitters.map((p, i) => {
                        const seasonHR = (p.seasonStats?.batting?.homeruns || 0) + (p.gameStats?.homeruns || 0);
                        const count = p.gameStats?.homeruns || 0;
                        return (
                          <span key={i} className="text-yellow-300 mr-3">
                            {p.name}（{p.team}）{Array.from({length: count}, (_, j) => `${seasonHR - count + j + 1}号`).join('・')}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* 打撃成績サマリー。**列を固定した表**にする。
                      以前は「名前: N打数 N安打 NHR N打点」という自由文で、
                      名前の長さで数字の位置が毎行ずれて縦に読めなかった。
                      ⚠ players.sort() は state配列を破壊するので必ずコピーしてから並べる */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {[[awayTeam, '✈️'], [homeTeam, '🏠']].map(([team, icon]) => (
                      <div key={team.name} className="min-w-0">
                        <h4 className="font-bold text-gray-100 mb-2 truncate" title={team.name}>
                          {icon} {team.name} 打撃成績
                        </h4>
                        <div className="grid grid-cols-[1fr_2rem_2rem_2rem_2rem] gap-x-1 text-xs tabular-nums">
                          <span className="text-gray-400">選手</span>
                          <span className="text-gray-400 text-right">打数</span>
                          <span className="text-gray-400 text-right">安打</span>
                          <span className="text-gray-400 text-right">本</span>
                          <span className="text-gray-400 text-right">打点</span>
                          {[...team.players]
                            .filter(p => (p.gameStats?.atBats || 0) > 0 || (p.gameStats?.hits || 0) > 0)
                            .sort((a, b) => (a.battingOrder || 99) - (b.battingOrder || 99))
                            .map(player => {
                              const st = player.gameStats || {};
                              return (
                                <React.Fragment key={player.id}>
                                  <span className="text-gray-200 truncate" title={player.name}>{player.name}</span>
                                  <span className="text-gray-200 text-right">{st.atBats || 0}</span>
                                  <span className="text-gray-200 text-right">{st.hits || 0}</span>
                                  <span className={`text-right ${st.homeruns ? 'text-amber-300 font-bold' : 'text-gray-200'}`}>{st.homeruns || 0}</span>
                                  <span className="text-gray-200 text-right">{st.rbis || 0}</span>
                                </React.Fragment>
                              );
                            })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-center mt-4 flex justify-center gap-3">
                    {managedGameInfo ? (
                      <button
                        onClick={handleManagedGameEnd}
                        className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-8 rounded-lg transition text-lg"
                      >
                        結果確定・翌日へ
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          resetGame();
                          setGameStarted(false);
                          setSelectedBatterAway(null);
                          setSelectedBatterHome(null);
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition"
                      >
                        新しい試合
                      </button>
                    )}
                  </div>
                </div>
                );
              })()}
            </div>

            {/* ===== 右カラム: ホームチーム ===== */}
            <div className="bg-gray-900 rounded-lg p-2 text-white min-w-0 overflow-hidden">
              <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-700">
                {/* 長いチーム名で2行にならないよう truncate。チーム色分けは使わない */}
                <span className="text-2xl font-bold text-gray-100 tabular-nums shrink-0 mr-2">{score?.home || 0}</span>
                <h3 className="font-bold text-gray-100 truncate min-w-0 text-right" title={homeTeam.name}>🏠 {homeTeam.name}</h3>
              </div>
              
              {/* スタメンと控え選手を横並び表示 */}
              {!gameStarted ? (
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {/* 左: スタメン */}
                  <div>
                    <div className="text-xs text-gray-300 mb-1 px-1 font-semibold">スターティングメンバー</div>
                    <div className="space-y-1 text-xs max-h-[calc(100vh-350px)] overflow-y-auto">
                      {homeTeam.players
                        .filter(p => p.isStarter)
                        .sort((a, b) => a.battingOrder - b.battingOrder)
                        .map(player => {
                          const isPitcher = player.position === 'pitcher';
                          const posNames = POSITION_NAMES;
                          const throwHand = player.physical.throws === 'right' ? '右' : '左';
                          const batHand = player.batting.bats === 'right' ? '右' : player.batting.bats === 'left' ? '左' : '両';
                          const isSubSelected = selectedSubstituteHome === player.id;
                          const isSelected = selectedBatterHome === player.battingOrder;
                          const isPositionSelected = selectedPositionHome === player.id;

                          return (
                            <div
                              key={player.id}
                              onClick={() => handleSubstituteClick('home', player.id)}
                              className={`p-1.5 rounded cursor-pointer transition ${
                                isSubSelected ? 'bg-blue-600 text-white ring-2 ring-blue-400' :
                                'bg-gray-800 hover:bg-gray-700'
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleBatterClick('home', player.battingOrder);
                                  }}
                                  className="w-4 text-gray-400 text-xs hover:text-blue-400 transition font-bold"
                                >
                                  {player.battingOrder}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePositionClick('home', player.id);
                                  }}
                                  className={`w-6 text-center rounded text-sm py-0.5 font-bold transition ${
                                    isPositionSelected
                                      ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                                      : getPositionColor(player.position) + ' hover:opacity-80'
                                  }`}
                                >
                                  {posNames[player.position]}
                                </button>
                                <span className="font-medium text-base truncate flex-1">
                                  {player.name}
                                  <span className={`ml-0.5 text-xs ${CONDITION_COLORS[player.condition ?? CONDITION_LEVELS.NORMAL]}`}>{CONDITION_ICONS[player.condition ?? CONDITION_LEVELS.NORMAL]}</span>
                                </span>
                                <span className="text-xs text-gray-600 font-mono font-bold">#{player.number || player.id}</span>
<span className="text-sm text-gray-300 font-semibold">{throwHand}{batHand}</span>
                                {isSubSelected && <span className="text-blue-300 animate-pulse">◀</span>}
                                {isSelected && <span className="text-blue-300 animate-pulse">◀</span>}
                                {isPositionSelected && <span className="text-purple-300 animate-pulse">◀</span>}
                              </div>
                              <div className="ml-9 mt-0.5">
                                <div className="flex gap-3 text-xs text-gray-500 font-bold">
                                  <span className="w-7 text-center">ミ</span>
                                  <span className="w-7 text-center">パ</span>
                                  <span className="w-7 text-center">走</span>
                                  <span className="w-7 text-center">肩</span>
                                  <span className="w-7 text-center">守</span>
                                </div>
                                <div className="flex gap-3 text-sm font-bold">
                                  <span className={`w-7 text-center ${getAbilityTextColor(player.batting.meet)}`}>{player.batting.meet}</span>
                                  <span className={`w-7 text-center ${getAbilityTextColor(player.batting.power)}`}>{player.batting.power}</span>
                                  <span className={`w-7 text-center ${getAbilityTextColor(player.physical.speed)}`}>{player.physical.speed}</span>
                                  <span className={`w-7 text-center ${getAbilityTextColor(player.physical.arm)}`}>{player.physical.arm}</span>
                                  <span className={`w-7 text-center ${getAbilityTextColor(player.fielding.defense)}`}>{player.fielding.defense}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* 右: 控え選手 */}
                  <div>
                    <div className="text-xs text-gray-300 mb-1 px-1 font-semibold">ベンチメンバー</div>
                    <div className="space-y-0.5 text-xs max-h-[calc(100vh-350px)] overflow-y-auto">
                      {/* 控えは 捕→一→二→三→遊→左→中→右→投 の順に並べる（constants.js）。
                          ロスター順のままだと投手と野手が混ざって交代要員を探せない */}
                      {sortBenchByPosition(homeTeam.players.filter(p => !p.isStarter))
                        .map(player => {
                          const posNames = POSITION_NAMES;
                          const isPitcher = player.position === 'pitcher';
                          const throwHand = player.physical.throws === 'right' ? '右' : '左';
                          const batHand = player.batting.bats === 'right' ? '右' : player.batting.bats === 'left' ? '左' : '両';
                          const isSubSelected = selectedSubstituteHome === player.id;
                          const isSubbedOut = player.hasSubbedOut;

                          return (
                            <div
                              key={player.id}
                              onClick={() => !isSubbedOut && handleSubstituteClick('home', player.id)}
                              className={`p-1.5 rounded transition ${
                                isSubbedOut
                                  ? 'bg-gray-900 opacity-50 cursor-not-allowed'
                                  : isSubSelected
                                    ? 'bg-blue-600 text-white ring-2 ring-blue-400 cursor-pointer'
                                    : 'bg-gray-800 hover:bg-gray-700 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                <span className={`w-6 text-center text-sm font-bold ${getPositionColor(player.position)} rounded`}>{posNames[player.position]}</span>
                                <span className="font-medium text-sm truncate flex-1">{player.name}</span>
                                <span className="text-xs text-gray-300 shrink-0">{throwHand}{batHand}</span>
                                {isSubbedOut && <span className="text-red-400 text-xs">交代済</span>}
                                {isSubSelected && <span className="text-blue-300">👆</span>}
                              </div>
                              <div className="grid grid-cols-3 gap-1 text-xs ml-6 text-gray-300 tabular-nums">
                                <span>M{player.batting.meet}</span>
                                <span>P{player.batting.power}</span>
                                <span className="text-blue-300">{isPitcher ? `⚡${player.pitching.velocity}` : ''}</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              ) : (
                /* 試合中/試合終了後は現在フィールドにいる選手のみ表示 */
                <div className="mb-2">
                  <div className="space-y-1 text-sm max-h-[calc(100vh-200px)] overflow-y-auto">
                    {homeTeam.players
                      .filter(p => {
                        // 試合終了後：実際に出場した選手のみ
                        if (gameOver) {
                          const hasBattingStats = p.stats?.batting && (p.stats.batting.atBats > 0 || p.stats.batting.walks > 0 || p.stats.batting.hits > 0);
                          const hasPitchingStats = p.stats?.pitching && p.stats.pitching.outs > 0;
                          const isOnField = p.isStarter && !p.hasSubbedOut && p.battingOrder > 0;
                          return hasBattingStats || hasPitchingStats || isOnField;
                        }
                        // 試合中：現在フィールドにいる選手
                        return p.isStarter && !p.hasSubbedOut && p.battingOrder > 0;
                      })
                      .sort((a, b) => a.battingOrder - b.battingOrder)
                      .map(player => {
                      const isCurrentBatter = gameStarted && !isTopInning && player.battingOrder === homeTeam.currentBatterOrder;
                      const isPitcher = player.position === 'pitcher';
                      const posNames = POSITION_NAMES;
                      const getPosColor = (pos) => getPositionColorHighlighted(pos, isCurrentBatter);

                    const throwHand = player.physical.throws === 'right' ? '右' : '左';
                    const batHand = player.batting.bats === 'right' ? '右' : player.batting.bats === 'left' ? '左' : '両';

                    const isSelected = !gameStarted && selectedBatterHome === player.battingOrder;
                    const isPositionSelected = !gameStarted && selectedPositionHome === player.id;
                    const isSubSelected = gameStarted && selectedSubstituteHome === player.id;
                    const isSubbedOut = player.hasSubbedOut;
                    const fitness = calculateDefensiveFitness(player, player.position);

                    return (
                      <div
                        key={player.id}
                        onClick={() => {
                          if (gameStarted && !isSubbedOut) {
                            handleSubstituteClick('home', player.id);
                          } else if (!gameStarted) {
                            handleBatterClick('home', player.battingOrder);
                          }
                        }}
                        className={`p-2 rounded transition ${
                          isSubbedOut ? 'opacity-50 cursor-not-allowed' :
                          isCurrentBatter ? 'bg-yellow-500 text-black cursor-pointer' :
                          isSubSelected ? 'bg-orange-600 text-white ring-2 ring-orange-400 cursor-pointer' :
                          isSelected ? 'bg-blue-600 text-white cursor-pointer' :
                          'hover:bg-gray-800 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <span className={`w-5 shrink-0 ${isCurrentBatter ? 'text-black font-bold' : isSelected ? 'text-white font-bold' : 'text-gray-400'}`}>{player.battingOrder}</span>
                          {!gameStarted ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePositionClick('home', player.id);
                              }}
                              className={`w-6 shrink-0 text-center rounded text-xs py-0.5 font-semibold transition ${
                                isPositionSelected
                                  ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                                  : getPosColor(player.position) + ' hover:opacity-80'
                              }`}
                            >
                              {posNames[player.position]}
                            </button>
                          ) : (
                            <span className={`w-6 shrink-0 text-center rounded text-sm py-0.5 font-bold ${getPosColor(player.position)}`}>{posNames[player.position]}</span>
                          )}
                          <span className="font-bold truncate">{player.name}</span>
                          <span className={`text-xs shrink-0 ${CONDITION_COLORS[player.condition ?? CONDITION_LEVELS.NORMAL]}`}>{CONDITION_ICONS[player.condition ?? CONDITION_LEVELS.NORMAL]}</span>
                          <span className={`text-xs shrink-0 ${isCurrentBatter ? 'text-yellow-800' : isSelected ? 'text-blue-200' : 'text-gray-400'}`}>{throwHand}{batHand}</span>
                          <span className="flex-1"></span>
                          {isSubbedOut && <span className="text-red-400 text-xs shrink-0">交代済</span>}
                          {isCurrentBatter && <span className="shrink-0">⚾</span>}
                          {isSubSelected && <span className="text-orange-300">⚡</span>}
                          {isSelected && <span>👆</span>}
                          {isPositionSelected && <span>🔄</span>}
                        </div>
                        {/* 2行目: 成績（打率・本塁打・打点）と打席結果。
                            打席結果を1行目に置くと選手名が切れるのでこちらへ移した。
                            成績は固定幅の右寄せで縦に揃えつつ、間隔を詰めて1かたまりに見せる。
                            バッジは右端に寄せ、入り切らない場合は**古い方から隠れる**
                            （justify-end + overflow-hidden） */}
                        {gameStarted ? (
                          <div className="flex items-center gap-2 ml-6 mt-0.5 text-xs">
                            <div className={`flex gap-1 font-bold tabular-nums shrink-0 ${isCurrentBatter ? 'text-yellow-800' : 'text-white'}`}>
                              {(() => {
                                const ss = player.seasonStats?.batting;
                                if (ss && ss.atBats > 0) {
                                  const avg = (ss.hits / ss.atBats).toFixed(3);
                                  return <>
                                    <span className="w-8 text-right">.{avg.split('.')[1]}</span>
                                    <span className="w-9 text-right">{ss.homeruns || 0}本</span>
                                    <span className="w-10 text-right">{ss.rbis || 0}点</span>
                                  </>;
                                }
                                if (isPitcher) {
                                  const ps = player.seasonStats?.pitching;
                                  if (ps && ps.inningsPitched > 0) {
                                    const era = ((ps.earnedRuns || 0) * 27 / ps.inningsPitched).toFixed(2);
                                    return <span>防御率 {era}</span>;
                                  }
                                }
                                return <span className={isCurrentBatter ? '' : 'text-gray-400'}>出場なし</span>;
                              })()}
                            </div>
                            {player.gameStats?.atBatResults?.length > 0 && (
                              /* **左から右へ増やす**。右寄せ(justify-end)にすると
                                 打席が増えるたびに既存のバッジが左へずれて落ち着かない。
                                 先頭から並べれば N打席目は常に同じ位置に出る。
                                 slice も先頭からにすること（-6 だと6打席目で全部ずれる） */
                              <div className="flex gap-0.5 flex-1 min-w-0 overflow-hidden">
                                {player.gameStats.atBatResults.slice(0, 6).map((r, i) => (
                                  <span key={i} title={r}
                                    style={{ textAlignLast: 'justify' }}
                                    className={`w-10 shrink-0 px-0.5 rounded text-white font-bold tracking-tight ${atBatResultColor(r)}`}>
                                    {formatAtBatResult(r)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className={`grid grid-cols-4 gap-1 text-xs ml-6 mt-0.5 tabular-nums ${isSelected ? 'text-blue-200' : 'text-gray-300'}`}>
                              <span>M{player.batting.meet}</span>
                              <span>P{player.batting.power}</span>
                              <span>E{player.batting.eye}</span>
                              <span className={isSelected ? 'text-blue-200' : 'text-blue-300'}>
                                {isPitcher ? `⚡${player.pitching.velocity}` : ''}
                              </span>
                            </div>
                            <div className={`text-xs ml-6 mt-0.5 ${
                              fitness.grade === 'S' ? 'text-yellow-400' :
                              fitness.grade === 'A' ? 'text-green-400' :
                              fitness.grade === 'B' ? 'text-blue-400' :
                              fitness.grade === 'D' ? 'text-red-400' :
                              'text-gray-400'
                            }`}>
                              守備適性 [{fitness.grade}] {fitness.comments}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 試合中の選手交代アコーディオン */}
                <div className="mt-2">
                  <button
                    onClick={() => setShowBenchHome(!showBenchHome)}
                    className="w-full p-2 bg-gray-800 hover:bg-gray-700 rounded text-sm text-orange-400 font-semibold transition flex items-center justify-between"
                  >
                    <span>⚡ 選手交代</span>
                    <span>{showBenchHome ? '▼' : '▶'}</span>
                  </button>

                  {showBenchHome && (
                    <div className="mt-2 space-y-1 text-xs max-h-64 overflow-y-auto">
                      {/* 控えは 捕→一→二→三→遊→左→中→右→投 の順に並べる（constants.js）。
                          ロスター順のままだと投手と野手が混ざって交代要員を探せない */}
                      {sortBenchByPosition(homeTeam.players.filter(p => !p.isStarter))
                        .map(player => {
                          const posNames = POSITION_NAMES;
                          const isPitcher = player.position === 'pitcher';
                          const throwHand = player.physical.throws === 'right' ? '右' : '左';
                          const batHand = player.batting.bats === 'right' ? '右' : player.batting.bats === 'left' ? '左' : '両';
                          const isSubSelected = selectedSubstituteHome === player.id;
                          const isSubbedOut = player.hasSubbedOut;

                          return (
                            <div
                              key={player.id}
                              onClick={() => !isSubbedOut && handleSubstituteClick('home', player.id)}
                              className={`p-1.5 rounded transition ${
                                isSubbedOut
                                  ? 'bg-gray-900 opacity-50 cursor-not-allowed'
                                  : isSubSelected
                                    ? 'bg-blue-600 text-white ring-2 ring-blue-400 cursor-pointer'
                                    : 'bg-gray-800 hover:bg-gray-700 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center gap-1">
                                <span className={`w-6 text-center text-sm font-bold ${getPositionColor(player.position)} rounded`}>{posNames[player.position]}</span>
                                <span className="font-medium text-sm truncate flex-1">{player.name}</span>
                                <span className="text-xs text-gray-300 shrink-0">{throwHand}{batHand}</span>
                                {isSubbedOut && <span className="text-red-400 text-xs">交代済</span>}
                                {isSubSelected && <span className="text-blue-300">👆</span>}
                              </div>
                              <div className="grid grid-cols-3 gap-1 text-xs ml-6 text-gray-300 tabular-nums">
                                <span>M{player.batting.meet}</span>
                                <span>P{player.batting.power}</span>
                                <span className="text-blue-300">{isPitcher ? `⚡${player.pitching.velocity}` : ''}</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
              )}

              {/* ホームチーム試合スタッツ/投手詳細 */}
              <div className="mt-2 pt-2 border-t border-gray-700">
                {gameStarted ? (
                  <>
                    <div className="text-sm text-gray-300 mb-1 font-semibold">📊 試合スタッツ</div>
                    {/* 投手成績 */}
                    <div className="bg-gray-800 rounded p-2 mb-1">
                      <div className="text-xs text-blue-400 mb-0.5">投手</div>
                      <div className="text-sm">
                        {(() => {
                          const pitchers = homeTeam.players.filter(p => (p.stats?.pitching?.outs || 0) > 0);
                          const totalOuts = pitchers.reduce((sum, p) => sum + (p.stats?.pitching?.outs || 0), 0);
                          const totalIP = totalOuts > 0 ? formatInnings(totalOuts) : '0回0/3';
                          return (
                            <>
                              {pitchers.map(p => {
                                const s = p.stats?.pitching || {};
                                const outs = s.outs || 0;
                                const ip = outs > 0 ? formatInnings(outs) : '0回0/3';
                                const era = outs > 0 ? ((s.runsAllowed || 0) * 27 / outs).toFixed(2) : '-.--';
                                return (
                                  <div key={p.id} className="flex justify-between text-gray-300 gap-1">
                                    <span className="truncate">{p.name}</span>
                                    <span className="text-gray-400 whitespace-nowrap text-xs">
                                      {ip} {s.strikeouts || 0}K {s.walks || 0}BB 防{era}
                                    </span>
                                  </div>
                                );
                              })}
                              {pitchers.length > 1 && (
                                <div className="flex justify-between text-yellow-400 text-xs mt-1 pt-1 border-t border-gray-700">
                                  <span>合計イニング</span>
                                  <span>{totalIP}</span>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-bold text-gray-300 mb-1">⚾ 予告先発</div>
                    {(() => {
                      const pitcher = homeTeam.players.find(p => p.isStarter && p.position === 'pitcher');
                      if (!pitcher) return null;
                      const formNames = {
                        overhand: 'オーバー',
                        threeQuarter: 'スリークォーター',
                        sidearm: 'サイドアーム',
                        submarine: 'アンダースロー'
                      };
                      const getValueColor = (val) => {
                        if (val >= 80) return 'text-red-400';
                        if (val >= 70) return 'text-orange-400';
                        if (val >= 60) return 'text-yellow-400';
                        if (val >= 50) return 'text-green-400';
                        return 'text-gray-400';
                      };
                      const getBgColor = (val) => {
                        if (val >= 80) return 'bg-red-500';
                        if (val >= 70) return 'bg-orange-500';
                        if (val >= 60) return 'bg-yellow-500';
                        if (val >= 50) return 'bg-green-500';
                        return 'bg-gray-500';
                      };
                      const velocityScore = Math.min(100, (pitcher.pitching.velocity - 100) * 2);
                      const staminaScore = Math.min(100, pitcher.pitching.stamina / 2);
                      return (
                        <div className="bg-gray-800 rounded p-3 border-2 border-gray-700">
                          <div className="text-base text-white mb-2 font-bold flex items-center gap-2">
                            <span>⚾</span>
                            <span>{pitcher.name}</span>
                            <span className="text-sm text-gray-400">#{pitcher.number || pitcher.id}</span>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-xs text-gray-400">投げ手:</span>
                              <span className="text-white font-bold">{pitcher.physical.throws === 'right' ? '右投' : '左投'}</span>
                              <span className="text-gray-600">|</span>
                              <span className="text-white">{formNames[pitcher.pitching.form]}</span>
                              <span className="text-gray-600">|</span>
                              <span className="text-xs text-gray-400">球速:</span>
                              <span className={`text-lg font-bold ${getValueColor(velocityScore)}`}>{pitcher.pitching.velocity}</span>
                              <span className="text-xs text-gray-500">km/h</span>
                              <span className="text-gray-600">|</span>
                              <span className="text-xs text-gray-400">回転:</span>
                              <span className={`text-sm font-bold ${getValueColor(pitcher.pitching.spinRate ?? 50)}`}>{pitcher.pitching.spinRate ?? 50}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-12">制球</span>
                              <div className="flex-1 bg-gray-700 rounded h-3 overflow-hidden">
                                <div className={`h-full ${getBgColor(pitcher.pitching.control)}`} style={{ width: `${pitcher.pitching.control}%` }} />
                              </div>
                              <span className={`text-sm font-bold ${getValueColor(pitcher.pitching.control)}`}>{pitcher.pitching.control}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400 w-12">体力</span>
                              <div className="flex-1 bg-gray-700 rounded h-3 overflow-hidden">
                                <div className={`h-full ${getBgColor(staminaScore)}`} style={{ width: `${staminaScore}%` }} />
                              </div>
                              <span className={`text-sm font-bold ${getValueColor(staminaScore)}`}>{pitcher.pitching.stamina}</span>
                            </div>
                            <div className="pt-1 border-t border-gray-700">
                              <div className="text-xs text-gray-400 mb-1">変化球</div>
                              <div className="flex flex-wrap gap-1.5">
                                {pitcher.pitching.arsenal.map((ball, i) => (
                                  <span key={i} className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded font-semibold">
                                    {getPitchTypeName(ball.type)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          </div>
          
          {/* 選手編集モーダル */}
          {editingPlayer && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-gray-700">
                <div className="p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-100">{editingPlayer.name} を編集</h2>
                    <button onClick={() => setEditingPlayer(null)} className="text-gray-300 hover:text-white text-2xl">&times;</button>
                  </div>

                  {/* 基本情報 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-200 mb-1">名前</label>
                    <input
                      type="text"
                      value={editingPlayer.name}
                      onChange={(e) => setEditingPlayer({...editingPlayer, name: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-2"
                    />
                  </div>

                  {/* 守備位置選択 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-200 mb-1">守備位置</label>
                    <select
                      value={editingPlayer.position}
                      onChange={(e) => setEditingPlayer({...editingPlayer, position: e.target.value})}
                      className="w-full bg-gray-700 border border-gray-600 text-gray-100 rounded px-3 py-2"
                    >
                      <option value="pitcher">投手</option>
                      <option value="catcher">捕手</option>
                      <option value="first">一塁手</option>
                      <option value="second">二塁手</option>
                      <option value="third">三塁手</option>
                      <option value="short">遊撃手</option>
                      <option value="left">左翼手</option>
                      <option value="center">中堅手</option>
                      <option value="right">右翼手</option>
                    </select>
                    {(() => {
                      const fitness = calculateDefensiveFitness(editingPlayer, editingPlayer.position);
                      return (
                        <div className={`mt-1 text-xs ${
                          fitness.grade === 'S' ? 'text-yellow-400' :
                          fitness.grade === 'A' ? 'text-green-400' :
                          fitness.grade === 'B' ? 'text-blue-400' :
                          fitness.grade === 'D' ? 'text-red-400' :
                          'text-gray-300'
                        }`}>
                          守備適性: [{fitness.grade}] {fitness.comments}
                        </div>
                      );
                    })()}
                  </div>
                  
                  {/* 打撃能力 */}
                  <div className="mb-4">
                    <h3 className="font-bold text-sm text-gray-200 mb-2">打撃能力</h3>
                    <div className="space-y-2">
                      {[
                        {key: 'meet', label: 'ミート', color: 'blue'},
                        {key: 'power', label: 'パワー', color: 'red'},
                        {key: 'eye', label: '選球眼', color: 'green'},
                        {key: 'steal', label: '盗塁', color: 'purple'}
                      ].map(({key, label, color}) => (
                        <div key={key}>
                          <label className="block text-xs text-gray-300">{label}: <span className={`font-bold text-${color}-400`}>{editingPlayer.batting[key]}</span></label>
                          <input type="range" min="0" max="100" value={editingPlayer.batting[key]}
                            onChange={(e) => setEditingPlayer({...editingPlayer, batting: {...editingPlayer.batting, [key]: parseInt(e.target.value)}})}
                            className="w-full" />
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* 身体能力 */}
                  <div className="mb-4">
                    <h3 className="font-bold text-sm text-gray-200 mb-2">身体能力</h3>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-300">走力: <span className="font-bold text-gray-100">{editingPlayer.physical.speed}</span></label>
                        <input type="range" min="0" max="100" value={editingPlayer.physical.speed}
                          onChange={(e) => setEditingPlayer({...editingPlayer, physical: {...editingPlayer.physical, speed: parseInt(e.target.value)}})}
                          className="w-full" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-300">肩力: <span className="font-bold text-gray-100">{editingPlayer.physical.arm}</span></label>
                        <input type="range" min="0" max="100" value={editingPlayer.physical.arm}
                          onChange={(e) => setEditingPlayer({...editingPlayer, physical: {...editingPlayer.physical, arm: parseInt(e.target.value)}})}
                          className="w-full" />
                      </div>
                    </div>
                  </div>

                  {/* 守備能力 */}
                  <div className="mb-4">
                    <h3 className="font-bold text-sm text-gray-200 mb-2">守備能力</h3>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-300">守備力: <span className="font-bold text-yellow-400">{editingPlayer.fielding?.defense || 50}</span></label>
                        <input type="range" min="0" max="100" value={editingPlayer.fielding?.defense || 50}
                          onChange={(e) => setEditingPlayer({...editingPlayer, fielding: {...(editingPlayer.fielding || {}), defense: parseInt(e.target.value)}})}
                          className="w-full" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-300">キャッチャーリード: <span className="font-bold text-orange-400">{editingPlayer.catching?.lead || 50}</span></label>
                        <input type="range" min="0" max="100" value={editingPlayer.catching?.lead || 50}
                          onChange={(e) => setEditingPlayer({...editingPlayer, catching: {...(editingPlayer.catching || {}), lead: parseInt(e.target.value)}})}
                          className="w-full" />
                      </div>
                    </div>
                  </div>
                  
                  {/* 投手能力 */}
                  <div className="mb-4">
                    <h3 className="font-bold text-sm text-gray-200 mb-2">投手能力</h3>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-300">球速: <span className="font-bold text-gray-100">{editingPlayer.pitching.velocity}km/h</span></label>
                        <input type="range" min="100" max="170" value={editingPlayer.pitching.velocity}
                          onChange={(e) => setEditingPlayer({...editingPlayer, pitching: {...editingPlayer.pitching, velocity: parseInt(e.target.value)}})}
                          className="w-full" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-300">制球: <span className="font-bold text-gray-100">{editingPlayer.pitching.control}</span></label>
                        <input type="range" min="0" max="100" value={editingPlayer.pitching.control}
                          onChange={(e) => setEditingPlayer({...editingPlayer, pitching: {...editingPlayer.pitching, control: parseInt(e.target.value)}})}
                          className="w-full" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-300">スタミナ: <span className="font-bold text-gray-100">{editingPlayer.pitching.stamina}</span></label>
                        <input type="range" min="50" max="250" value={editingPlayer.pitching.stamina}
                          onChange={(e) => setEditingPlayer({...editingPlayer, pitching: {...editingPlayer.pitching, stamina: parseInt(e.target.value)}})}
                          className="w-full" />
                      </div>
                    </div>

                    {/* 持ち球 */}
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-300 mb-1">持ち球</label>
                      <div className="space-y-1">
                        {editingPlayer.pitching.arsenal.map((ball, index) => (
                          <div key={ball.id} className="flex items-center gap-2 text-sm">
                            <select
                              value={ball.type}
                              onChange={(e) => {
                                const newArsenal = [...editingPlayer.pitching.arsenal];
                                newArsenal[index] = {...newArsenal[index], type: e.target.value};
                                setEditingPlayer({...editingPlayer, pitching: {...editingPlayer.pitching, arsenal: newArsenal}});
                              }}
                              className="bg-gray-700 border border-gray-600 text-gray-100 rounded px-2 py-1 text-xs flex-1"
                            >
                              {Object.keys(ballEffects).filter(type => 
                                type === ball.type || !editingPlayer.pitching.arsenal.some((b, i) => i !== index && b.type === type)
                              ).map(type => (
                                <option key={type} value={type}>{ballEffects[type].name}</option>
                              ))}
                            </select>
                            <span className="text-xs">Lv.</span>
                            <input type="number" min="0" max="100" value={ball.level}
                              onChange={(e) => {
                                const newArsenal = [...editingPlayer.pitching.arsenal];
                                newArsenal[index] = {...newArsenal[index], level: parseInt(e.target.value) || 0};
                                setEditingPlayer({...editingPlayer, pitching: {...editingPlayer.pitching, arsenal: newArsenal}});
                              }}
                              className="bg-gray-700 border border-gray-600 text-gray-100 rounded px-2 py-1 w-14 text-xs" />
                            {index > 0 && (
                              <button onClick={() => {
                                const newArsenal = editingPlayer.pitching.arsenal.filter((_, i) => i !== index);
                                setEditingPlayer({...editingPlayer, pitching: {...editingPlayer.pitching, arsenal: newArsenal}});
                              }} className="text-red-500 text-xs">削除</button>
                            )}
                          </div>
                        ))}
                        {editingPlayer.pitching.arsenal.length < 6 && (
                          <button onClick={() => {
                            const usedTypes = editingPlayer.pitching.arsenal.map(b => b.type);
                            const availableTypes = Object.keys(ballEffects).filter(type => !usedTypes.includes(type));
                            if (availableTypes.length === 0) { alert('すべての球種を習得済みです'); return; }
                            const newArsenal = [...editingPlayer.pitching.arsenal, {
                              id: Math.max(...editingPlayer.pitching.arsenal.map(b => b.id)) + 1,
                              type: availableTypes[0], level: 50
                            }];
                            setEditingPlayer({...editingPlayer, pitching: {...editingPlayer.pitching, arsenal: newArsenal}});
                          }} className="text-blue-500 text-xs">+ 球種追加 </button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* 保存ボタン */}
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setEditingPlayer(null)}
                      className="px-4 py-2 border border-gray-600 text-gray-200 rounded hover:bg-gray-700">キャンセル</button>
                    <button onClick={() => { updatePlayer(editingPlayer.id, editingPlayer); setEditingPlayer(null); }}
                      className="px-20 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">保存</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* エディット画面 */}
          {showEditScreen && (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
              <div className="bg-gray-900 rounded-lg w-full max-w-7xl max-h-[90vh] overflow-y-auto border border-gray-700">
                <div className="p-6">
                  <div className="flex justify-between items-center mb-6 sticky top-0 bg-gray-900 pb-4 border-b border-gray-700 z-10">
                    <h2 className="text-2xl font-bold text-gray-100">選手エディット</h2>
                    <button
                      onClick={() => setShowEditScreen(false)}
                      className="text-gray-300 hover:text-white text-3xl"
                    >
                      ×
                    </button>
                  </div>

                  {/* 2カラムレイアウト */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* 左: アウェイチーム */}
                    <div>
                    <h3 className="text-xl font-bold text-red-500 mb-4">✈️ {awayTeam.name}</h3>
                    <div className="space-y-6">
                      {awayTeam.players.map(player => (
                        <div key={player.id} className="bg-gray-800 p-3 rounded-lg border border-gray-700/50">
                          <div className="mb-3">
                            <label className="block text-xs text-gray-300 mb-1">選手名</label>
                            <input
                              type="text"
                              value={player.name}
                              onChange={(e) => {
                                const newValue = e.target.value;
                                const teamSetter = awayTeam.players.find(p => p.id === player.id) ? setAwayTeam : setHomeTeam;
                                teamSetter(prev => ({
                                  ...prev,
                                  players: prev.players.map(p =>
                                    p.id === player.id ? { ...p, name: newValue } : p
                                  )
                                }));
                              }}
                              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 text-gray-100 rounded text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            {/* 打撃能力 */}
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">ミート: <span className="font-bold text-blue-400">{player.batting.meet}</span></label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={player.batting.meet}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setAwayTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, batting: { ...p.batting, meet: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">パワー: <span className="font-bold text-blue-400">{player.batting.power}</span></label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={player.batting.power}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setAwayTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, batting: { ...p.batting, power: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">選球眼: <span className="font-bold text-blue-400">{player.batting.eye}</span></label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={player.batting.eye}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setAwayTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, batting: { ...p.batting, eye: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">走力: <span className="font-bold text-blue-400">{player.physical.speed}</span></label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={player.physical.speed}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setAwayTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, physical: { ...p.physical, speed: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full"
                              />
                            </div>
                            {/* 守備能力 */}
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">守備: <span className="font-bold text-green-400">{player.fielding.defense}</span></label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={player.fielding.defense}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setAwayTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, fielding: { ...p.fielding, defense: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">肩: <span className="font-bold text-green-400">{player.physical.arm}</span></label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={player.physical.arm}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setAwayTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, physical: { ...p.physical, arm: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full"
                              />
                            </div>
                            {/* 投手能力（全選手） */}
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">球速: <span className="font-bold text-red-400">{player.pitching.velocity}km/h</span></label>
                              <input
                                type="range"
                                min="100"
                                max="170"
                                value={player.pitching.velocity}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setAwayTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, pitching: { ...p.pitching, velocity: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full h-2"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">制球: <span className="font-bold text-red-400">{player.pitching.control}</span></label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={player.pitching.control}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setAwayTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, pitching: { ...p.pitching, control: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full h-2"
                              />
                            </div>
                            {/* 投球フォーム */}
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">投球フォーム: <span className="font-bold text-orange-400">{PITCHING_FORM_EFFECTS[player.pitching.form]?.name || player.pitching.form}</span></label>
                              <select
                                value={player.pitching.form}
                                onChange={(e) => {
                                  const newValue = e.target.value;
                                  const teamSetter = awayTeam.players.find(p => p.id === player.id) ? setAwayTeam : setHomeTeam;
                                  teamSetter(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, pitching: { ...p.pitching, form: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 text-gray-100 rounded text-sm"
                              >
                                <option value="overhand">オーバースロー</option>
                                <option value="threeQuarter">スリークォーター</option>
                                <option value="sidearm">サイドスロー</option>
                                <option value="submarine">アンダースロー</option>
                              </select>
                            </div>
                            {/* 変化球 */}
                            <div className="mt-2 pt-2 border-t border-gray-300">
                              <label className="block text-sm font-semibold text-gray-700 mb-2">変化球</label>
                              {player.pitching.arsenal.map((ball) => (
                                <div key={ball.id} className="mb-2">
                                  <label className="block text-xs text-gray-300 mb-1">
                                    {BALL_EFFECTS[ball.type]?.name || ball.type}: <span className="font-bold text-purple-600">{ball.level}</span>
                                  </label>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={ball.level}
                                    onChange={(e) => {
                                      const newValue = parseInt(e.target.value);
                                      setAwayTeam(prev => ({
                                        ...prev,
                                        players: prev.players.map(p =>
                                          p.id === player.id
                                            ? {
                                                ...p,
                                                pitching: {
                                                  ...p.pitching,
                                                  arsenal: p.pitching.arsenal.map(b =>
                                                    b.id === ball.id ? { ...b, level: newValue } : b
                                                  )
                                                }
                                              }
                                            : p
                                        )
                                      }));
                                    }}
                                    className="w-full h-2"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    </div>

                    {/* 右: ホームチーム */}
                    <div>
                    <h3 className="text-xl font-bold text-blue-500 mb-4">🏠 {homeTeam.name}</h3>
                    <div className="space-y-6">
                      {homeTeam.players.map(player => (
                        <div key={player.id} className="bg-gray-800 p-3 rounded-lg border border-gray-700/50">
                          <div className="mb-3">
                            <label className="block text-xs text-gray-300 mb-1">選手名</label>
                            <input
                              type="text"
                              value={player.name}
                              onChange={(e) => {
                                const newValue = e.target.value;
                                const teamSetter = awayTeam.players.find(p => p.id === player.id) ? setAwayTeam : setHomeTeam;
                                teamSetter(prev => ({
                                  ...prev,
                                  players: prev.players.map(p =>
                                    p.id === player.id ? { ...p, name: newValue } : p
                                  )
                                }));
                              }}
                              className="w-full px-2 py-1 bg-gray-700 border border-gray-600 text-gray-100 rounded text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            {/* 打撃能力 */}
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">ミート: <span className="font-bold text-blue-400">{player.batting.meet}</span></label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={player.batting.meet}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setHomeTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, batting: { ...p.batting, meet: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">パワー: <span className="font-bold text-blue-400">{player.batting.power}</span></label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={player.batting.power}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setHomeTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, batting: { ...p.batting, power: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">選球眼: <span className="font-bold text-blue-400">{player.batting.eye}</span></label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={player.batting.eye}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setHomeTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, batting: { ...p.batting, eye: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">走力: <span className="font-bold text-blue-400">{player.physical.speed}</span></label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={player.physical.speed}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setHomeTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, physical: { ...p.physical, speed: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full"
                              />
                            </div>
                            {/* 守備能力 */}
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">守備: <span className="font-bold text-green-400">{player.fielding.defense}</span></label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={player.fielding.defense}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setHomeTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, fielding: { ...p.fielding, defense: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">肩: <span className="font-bold text-green-400">{player.physical.arm}</span></label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={player.physical.arm}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setHomeTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, physical: { ...p.physical, arm: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full"
                              />
                            </div>
                            {/* 投手能力（全選手） */}
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">球速: <span className="font-bold text-red-400">{player.pitching.velocity}km/h</span></label>
                              <input
                                type="range"
                                min="100"
                                max="170"
                                value={player.pitching.velocity}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setHomeTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, pitching: { ...p.pitching, velocity: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full h-2"
                              />
                            </div>
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">制球: <span className="font-bold text-red-400">{player.pitching.control}</span></label>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={player.pitching.control}
                                onChange={(e) => {
                                  const newValue = parseInt(e.target.value);
                                  setHomeTeam(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, pitching: { ...p.pitching, control: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full h-2"
                              />
                            </div>
                            {/* 投球フォーム */}
                            <div>
                              <label className="block text-sm text-gray-300 mb-1">投球フォーム: <span className="font-bold text-orange-400">{PITCHING_FORM_EFFECTS[player.pitching.form]?.name || player.pitching.form}</span></label>
                              <select
                                value={player.pitching.form}
                                onChange={(e) => {
                                  const newValue = e.target.value;
                                  const teamSetter = awayTeam.players.find(p => p.id === player.id) ? setAwayTeam : setHomeTeam;
                                  teamSetter(prev => ({
                                    ...prev,
                                    players: prev.players.map(p =>
                                      p.id === player.id
                                        ? { ...p, pitching: { ...p.pitching, form: newValue } }
                                        : p
                                    )
                                  }));
                                }}
                                className="w-full px-2 py-1 bg-gray-700 border border-gray-600 text-gray-100 rounded text-sm"
                              >
                                <option value="overhand">オーバースロー</option>
                                <option value="threeQuarter">スリークォーター</option>
                                <option value="sidearm">サイドスロー</option>
                                <option value="submarine">アンダースロー</option>
                              </select>
                            </div>
                            {/* 変化球 */}
                            <div className="mt-2 pt-2 border-t border-gray-300">
                              <label className="block text-sm font-semibold text-gray-700 mb-2">変化球</label>
                              {player.pitching.arsenal.map((ball) => (
                                <div key={ball.id} className="mb-2">
                                  <label className="block text-xs text-gray-300 mb-1">
                                    {BALL_EFFECTS[ball.type]?.name || ball.type}: <span className="font-bold text-purple-600">{ball.level}</span>
                                  </label>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={ball.level}
                                    onChange={(e) => {
                                      const newValue = parseInt(e.target.value);
                                      setHomeTeam(prev => ({
                                        ...prev,
                                        players: prev.players.map(p =>
                                          p.id === player.id
                                            ? {
                                                ...p,
                                                pitching: {
                                                  ...p.pitching,
                                                  arsenal: p.pitching.arsenal.map(b =>
                                                    b.id === ball.id ? { ...b, level: newValue } : b
                                                  )
                                                }
                                              }
                                            : p
                                        )
                                      }));
                                    }}
                                    className="w-full h-2"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    </div>
                  </div>

                  {/* 閉じるボタン */}
                  <div className="flex justify-end sticky bottom-0 bg-gray-900 pt-4 border-t border-gray-700">
                    <button
                      onClick={() => setShowEditScreen(false)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg"
                    >
                      完了
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
              </div>
            ) : (
              <ManagementScreen
                managementView={managementView}
                setManagementView={setManagementView}
                seasonData={seasonData}
                setSeasonData={setSeasonData}
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
                scheduleTab={scheduleTab}
                setScheduleTab={setScheduleTab}
                seasonYear={seasonYear}
                currentDate={currentDate}
                currentPhase={currentPhase}
                leagueStandings={leagueStandings}
                springStandings={springStandings}
                userTeamName={userTeamName}
                allTeams={allTeams}
                gameMode={gameMode}
                setGameMode={setGameMode}
                setLeagueConfig={setLeagueConfig}
                hallOfFamePlayers={hallOfFamePlayers}
                setHallOfFamePlayers={setHallOfFamePlayers}
                teamHistory={teamHistory}
                setTeamHistory={setTeamHistory}
                draftResults={draftResults}
                setDraftResults={setDraftResults}
                saveSlots={saveSlots}
                saveGame={saveGame}
                loadGame={loadGame}
                loadAutosave={loadAutosave}
                deleteSave={deleteSave}
                refreshSaveSlots={refreshSaveSlots}
                setupManagedGame={setupManagedGame}
                advanceDayRef={advanceDayRef}
                setScreenMode={setScreenMode}
                setGameFlowState={setGameFlowState}
                handleProgressDate={handleProgressDate}
                handleProgressToNextGame={handleProgressToNextGame}
                handleProgressToNextPhase={handleProgressToNextPhase}
              />
            )}
          </div>
        </div>
      );
    };

export default App;
