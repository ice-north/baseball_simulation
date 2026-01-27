import React, { useState, useEffect, useRef } from 'react';

// Utility imports
import {
  BALL_EFFECTS,
  PITCHING_FORM_EFFECTS,
  FORM_PITCH_SYNERGY,
  POSITION_NAMES,
  POSITION_COLORS,
  HAND_LABELS
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
import { initializeTeamsData, TEAMS_DATA, initializeAllPitchingRotations, initializeTeamsForCount, selectReliefPitcher, updateReliefFatigue, recoverReliefFatigue } from './teams-data.js';
import { generateRandomPlayerName } from './data/playerNames.js';

// Game logic imports
import { calculatePhysicsContact, calculateDefensiveFitness } from './simulation-logic.js';
import { autoSimulateGame, autoSimulateDailyGames, advanceDate as autoAdvanceDate, generateAILineup } from './game/autoSimulation.js';

// Season management imports
import { createSeasonData, SEASON_PHASES, PHASE_INFO, formatDate, getDayOfWeek, isGameDay, getCurrentPhase, initializeStandings } from './season/seasonManager.js';
import { generateFullSeasonSchedule, assignPitchersToSchedule, getScheduleByDate, getTeamSchedule } from './season/scheduleGenerator.js';
import { generateCalendarMonth, getGamesForDate, generateTeamCalendar } from './season/calendarUI.js';
import { DEFAULT_REGULATIONS, REGULATION_PRESETS, validateRegulations, getPlayoffFormatDescription, canModifyRegulations, applyPreset } from './season/regulationSettings.js';
import { progressDate, progressToNextGame, progressToNextPhase } from './season/dateProgression.js';
import { generateTryoutCandidates, calculatePlayerRank, selectPlayerForAI, generateSnakeDraftOrder } from './season/tryoutSystem.js';
import { processSeasonEnd, advanceToNextYear, processRetirements, updateAllPlayerAges, releasePlayer, TRAINING_MENUS, updateAllPlayersExperience, executeCampTraining, executeTeamCampTraining } from './season/yearProgressionSystem.js';

    const App = () => {
      // チームデータの初期化
      useEffect(() => {
        if (typeof initializeTeamsData === 'function') {
          initializeTeamsData();
        }
      }, []);

      // 画面モード管理
      const [screenMode, setScreenMode] = useState('start'); // 'start', 'game', 'management'
      const [gameFlowState, setGameFlowState] = useState('title'); // 'title', 'newgame_regulations', 'newgame_tryout', 'newgame_camp', 'season'
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

      // 全チームリスト（リーグ構成から自動生成）
      const allTeams = leagueConfig.leagues.flatMap(league => league.teams);

      // ユーザーチーム（常に最初のチーム）
      const userTeamName = allTeams[0] || 'チームA';

      // === 新システム: シーズンデータ統合管理 ===
      const [seasonData, setSeasonData] = useState(null);
      const [selectedMonth, setSelectedMonth] = useState(3); // カレンダー表示月

      // シーズンデータの初期化（NEW GAMEフローから呼ばれる）
      const initializeNewGame = (regulations) => {
        console.log('🎮 NEW GAME開始: レギュレーション', regulations);

        const newSeasonData = createSeasonData(1);

        // レギュレーション設定を適用
        newSeasonData.settings = { ...regulations };

        // チーム数に応じてリーグ構成を更新
        const teamCount = regulations.teamsCount || 4;
        const customNames = regulations.teamNames || null;

        // 動的にチームを作成（カスタム名対応）
        const teamNames = initializeTeamsForCount(teamCount, customNames);
        console.log(`👥 ${teamCount}チームを初期化: ${teamNames.join(', ')}`);

        // チーム名をレギュレーションにも保存（成績表等で使用）
        newSeasonData.settings.teamNames = teamNames;

        setLeagueConfig({
          format: 'single',
          teamsPerLeague: teamCount,
          leagues: [{ name: 'リーグ', teams: teamNames }]
        });

        // スケジュール生成（60試合未満は4月開始、140試合以上は3月後半開始）
        const schedule = generateFullSeasonSchedule({
          teams: teamNames,
          gamesPerSeason: regulations.gamesPerSeason || 60,
          startDate: { year: 2024, month: 4, day: 1 },
          endDate: { year: 2024, month: 9, day: 30 }
        });

        newSeasonData.schedule = schedule;
        newSeasonData.standings = initializeStandings(teamNames);

        setSeasonData(newSeasonData);
        console.log(`✅ NEW GAME初期化完了 - ${schedule.length}試合生成`);
      };

      // セーブデータの有無を確認
      const [hasSaveData, setHasSaveData] = useState(false);
      useEffect(() => {
        const savedData = localStorage.getItem('baseballSim_saveData');
        setHasSaveData(!!savedData);
      }, []);

      // ゲームデータを保存
      const saveGame = (slotName = 'auto') => {
        try {
          const saveData = {
            version: '2.7.0',
            timestamp: new Date().toISOString(),
            slotName,
            seasonData: seasonData,
            leagueConfig: leagueConfig,
            teamsData: JSON.parse(JSON.stringify(TEAMS_DATA)), // ディープコピー
            screenMode,
            managementView,
            gameFlowState,
            selectedMonth
          };

          localStorage.setItem('baseballSim_saveData', JSON.stringify(saveData));
          console.log('💾 ゲームをセーブしました:', slotName);
          setHasSaveData(true);
          return true;
        } catch (error) {
          console.error('セーブ失敗:', error);
          return false;
        }
      };

      // ゲームデータを読み込み
      const loadGame = () => {
        try {
          const savedJson = localStorage.getItem('baseballSim_saveData');
          if (!savedJson) {
            console.warn('セーブデータがありません');
            return false;
          }

          const saveData = JSON.parse(savedJson);
          console.log('📂 ロード開始:', saveData.slotName, saveData.timestamp);

          // TEAMS_DATAを復元
          if (saveData.teamsData) {
            Object.keys(saveData.teamsData).forEach(teamName => {
              if (TEAMS_DATA[teamName]) {
                TEAMS_DATA[teamName] = saveData.teamsData[teamName];
              } else {
                TEAMS_DATA[teamName] = saveData.teamsData[teamName];
              }
            });
          }

          // 状態を復元
          if (saveData.seasonData) setSeasonData(saveData.seasonData);
          if (saveData.leagueConfig) setLeagueConfig(saveData.leagueConfig);
          if (saveData.selectedMonth) setSelectedMonth(saveData.selectedMonth);

          // 画面状態を復元（管理画面に移動）
          setScreenMode('management');
          setManagementView('dateprogress');
          setGameFlowState('season');

          console.log('✅ ロード完了');
          return true;
        } catch (error) {
          console.error('ロード失敗:', error);
          return false;
        }
      };

      // セーブデータを削除
      const deleteSave = () => {
        try {
          localStorage.removeItem('baseballSim_saveData');
          setHasSaveData(false);
          console.log('🗑️ セーブデータを削除しました');
          return true;
        } catch (error) {
          console.error('削除失敗:', error);
          return false;
        }
      };

      // 後方互換性のため、既存の変数名でもアクセス可能にする
      const seasonYear = seasonData?.year || 1;
      const currentDate = seasonData?.currentDate || { year: 2024, month: 3, day: 1 };
      const currentPhase = seasonData?.phase || SEASON_PHASES.REGULAR_SEASON;
      const leagueStandings = seasonData?.standings || [];

      // 変化球の効果設定（外部ファイルから読み込み）
      const [ballEffects, setBallEffects] = useState(BALL_EFFECTS);

      const [showSettings, setShowSettings] = useState(false);
      
      // レギュレーション設定（拡張可能な設定）
      const [maxExtraInnings, setMaxExtraInnings] = useState(12);  // 延長最大回数（変更可能）
      const [rosterConfig, setRosterConfig] = useState({
        starters: 9,           // スタメン人数
        benchFielders: 8,      // 控え野手数（プロ野球: 8, 高校野球: 2など）
        benchPitchers: 7,      // 控え投手数（プロ野球: 7, 高校野球: 9など）
        useDH: false           // DH制の有無（false: 投手も打席に, true: 指名打者制）
      });

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
      const isSubstituting = React.useRef(false);  // 交代処理中フラグ（二重実行防止）
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
                isStarter: p.battingOrder > 0 && p.battingOrder <= 9,
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
                isStarter: p.battingOrder > 0 && p.battingOrder <= 9,
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
      
      const [selectedPlayerId, setSelectedPlayerId] = useState(null);
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
                  stats: { ...p.stats, batting: { ...p.stats.batting, ...statUpdates } },
                  gameStats: { ...p.gameStats, ...statUpdates }
                }
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
              ? { ...p, stats: { ...p.stats, pitching: { ...p.stats.pitching, ...statUpdates } } }
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
          if (gameStarted && player1Current?.isStarter && player2Current?.isStarter) {
            setSelectedSubstitute(null);
            return;
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

              // 試合前：スタメン同士の場合は打順のみ交換（守備位置はそのまま）
              if (player1.isStarter && player2.isStarter) {
                const tempOrder = player1.battingOrder;
                player1.battingOrder = player2.battingOrder;
                player2.battingOrder = tempOrder;
                // 守備位置はそのまま、isStarterフラグも変更なし
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
                      // 新しい投手のスタミナにリセット（setTeamの後に実行される）
                      setTimeout(() => {
                        setCurrentStamina(newPitcher.pitching.stamina);
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
        <div className="flex items-center gap-0.5">
          <span className="text-[7px] text-gray-500 w-2">{label}</span>
          <div className="flex-1 bg-gray-700 rounded-full h-0.5 overflow-hidden">
            <div
              className={`h-full ${getAbilityColor(value)} transition-all`}
              style={{ width: `${value}%` }}
            />
          </div>
          <span className="text-[7px] text-gray-400 w-3.5 text-right">{value}</span>
        </div>
      );

      // 監督AI：自動投手交代ロジック（Phase 2: 状況判断強化版）
      const autoSubstitutePitcher = () => {
        if (!autoManagerMode || !gameStarted) return;

        // 交代処理中の場合はスキップ（二重実行防止）
        if (isSubstituting.current) return;

        const defenseTeam = getDefenseTeam();
        const currentPitcher = getCurrentPitcher();

        // 投手が見つからない場合はスキップ（既に交代処理中の可能性）
        if (!currentPitcher || !currentPitcher.pitching) return;

        const teamType = isTopInning ? 'home' : 'away';
        const setTeam = isTopInning ? setHomeTeam : setAwayTeam;

        // 状況分析
        const staminaRate = currentStamina / currentPitcher.pitching.stamina;
        const scoreDiff = Math.abs(score.home - score.away);
        const isCloseGame = scoreDiff <= 3; // 3点差以内を接戦とする
        const runnersOnBase = bases.filter(b => b).length;
        const isScoringSituation = bases[1] || bases[2]; // 得点圏にランナー

        // 交代判断（Phase 2: 状況に応じた閾値）
        let staminaThreshold = 0.2; // 基本20%

        // 接戦の場合はより早めに交代
        if (isCloseGame && inning >= 7) {
          staminaThreshold = 0.3; // 30%
        }

        // 得点圏にランナーがいる場合は更に早めに
        if (isScoringSituation && isCloseGame) {
          staminaThreshold = 0.35; // 35%
        }

        const shouldSubstitute = staminaRate <= staminaThreshold;

        if (!shouldSubstitute) return;

        // 交代候補の投手を選択
        const availablePitchers = defenseTeam.players.filter(p =>
          !p.isStarter &&
          p.position === 'pitcher' &&
          !p.hasSubbedOut
        );

        if (availablePitchers.length === 0) return; // 交代可能な投手がいない

        // イニング数に応じて投手を選択
        let selectedPitcher;
        if (inning >= 9) {
          // 9回以降：クローザー（名前に「クローザー」を含む）
          selectedPitcher = availablePitchers.find(p => p.name.includes('クローザー'));
        } else if (inning >= 7) {
          // 7-8回：セットアッパー
          selectedPitcher = availablePitchers.find(p => p.name.includes('セットアッパー'));
        }

        // 該当する投手がいなければ、最初の未登板投手を選択
        if (!selectedPitcher) {
          selectedPitcher = availablePitchers[0];
        }

        // 交代処理開始フラグを立てる
        isSubstituting.current = true;

        // 投手交代を実行
        setTeam(prev => {
          const players = [...prev.players];
          const oldPitcher = players.find(p => p.id === currentPitcher.id);
          const newPitcher = players.find(p => p.id === selectedPitcher.id);

          if (oldPitcher && newPitcher) {
            // 交代処理
            oldPitcher.isStarter = false;
            oldPitcher.hasSubbedOut = true;
            oldPitcher.battingOrder = 0;

            newPitcher.isStarter = true;
            newPitcher.battingOrder = currentPitcher.battingOrder;
            newPitcher.position = 'pitcher';

            // スタミナをリセット
            setTimeout(() => {
              setCurrentStamina(newPitcher.pitching.stamina);
            }, 0);

            // 試合ログに交代を記録
            setGameLog(prev => {
              const teamName = teamType === 'home' ? 'ホーム' : 'アウェイ';
              const updated = [...prev, {
                description: `⚾ [${inning}回${isTopInning ? '裏' : '表'}] ${teamName}: 投手交代 ${oldPitcher.name} → ${newPitcher.name}`,
                isSpecial: true
              }];
              return updated.length > 50 ? updated.slice(-50) : updated;
            });
          }

          return { ...prev, players };
        });

        // 交代処理完了後にフラグを解除（状態更新を待つために遅延）
        setTimeout(() => {
          isSubstituting.current = false;
        }, 100);
      };

      // 監督AI：代打ロジック（Phase 2）
      const autoSubstitutePinchHitter = () => {
        if (!autoManagerMode || !gameStarted) return;

        // 交代処理中の場合はスキップ（二重実行防止）
        if (isSubstituting.current) return;

        const offenseTeam = getOffenseTeam();
        const currentBatter = getCurrentBatter();
        const teamType = isTopInning ? 'away' : 'home';
        const setTeam = isTopInning ? setAwayTeam : setHomeTeam;

        // 代打判断条件
        const isPitcher = currentBatter.position === 'pitcher';

        // 投手への代打は禁止（投手は投手交代ロジックで対応）
        if (isPitcher) return;

        const battingAvg = currentBatter.stats?.batting?.atBats > 0
          ? currentBatter.stats.batting.hits / currentBatter.stats.batting.atBats
          : 0;
        const isWeakHitter = battingAvg < 0.150; // 打率.150未満

        // 状況分析
        const scoreDiff = Math.abs(score.home - score.away);
        const isCloseGame = scoreDiff <= 3;
        const runnersOnBase = bases.filter(b => b).length;
        const isImportantSituation = isCloseGame && runnersOnBase >= 2; // 接戦でランナー2人以上
        const isLateInning = inning >= 7;

        // 代打を送る条件（弱打者のみ）
        const shouldPinchHit = isWeakHitter && isImportantSituation && isLateInning;

        if (!shouldPinchHit) return;

        // 代打候補を選択（ベンチの野手で未出場）
        const availablePinchHitters = offenseTeam.players.filter(p =>
          !p.isStarter &&
          p.position !== 'pitcher' &&
          !p.hasSubbedOut
        );

        if (availablePinchHitters.length === 0) return;

        // 打率・パワーの高い選手を優先（名前に「代打」を含む選手を最優先）
        let selectedPinchHitter = availablePinchHitters.find(p => p.name.includes('代打'));
        if (!selectedPinchHitter) {
          selectedPinchHitter = availablePinchHitters[0];
        }

        // 交代処理開始フラグを立てる
        isSubstituting.current = true;

        // 代打交代を実行（野手のみ）
        setTeam(prev => {
          const players = [...prev.players];
          const oldBatter = players.find(p => p.id === currentBatter.id);
          const newBatter = players.find(p => p.id === selectedPinchHitter.id);

          if (oldBatter && newBatter) {
            oldBatter.isStarter = false;
            oldBatter.hasSubbedOut = true;
            oldBatter.battingOrder = 0;

            newBatter.isStarter = true;
            newBatter.battingOrder = currentBatter.battingOrder;
            newBatter.position = currentBatter.position;

            // 試合ログに交代を記録
            setGameLog(prev => {
              const teamName = teamType === 'home' ? 'ホーム' : 'アウェイ';
              const updated = [...prev, {
                description: `🏏 [${inning}回${isTopInning ? '表' : '裏'}] ${teamName}: 代打 ${newBatter.name} (${oldBatter.name} → 交代)`,
                isSpecial: true
              }];
              return updated.length > 50 ? updated.slice(-50) : updated;
            });
          }

          return { ...prev, players };
        });

        // 交代処理完了後にフラグを解除（状態更新を待つために遅延）
        setTimeout(() => {
          isSubstituting.current = false;
        }, 100);
      };

      // 監督AI：守備固めロジック（Phase 2）
      const autoDefensiveSubstitution = () => {
        if (!autoManagerMode || !gameStarted) return;

        // 交代処理中の場合はスキップ（二重実行防止）
        if (isSubstituting.current) return;

        // 7回以降、リードしている時のみ守備固め
        if (inning < 7) return;

        const defenseTeam = getDefenseTeam();
        const teamType = isTopInning ? 'home' : 'away';
        const setTeam = isTopInning ? setHomeTeam : setAwayTeam;

        // スコア判定（守備チームがリードしている場合のみ）
        const isLeading = isTopInning
          ? score.home > score.away
          : score.away > score.home;

        if (!isLeading) return;

        // 守備固め候補の選手を取得（守備適性Bよりも守備固め選手の方が高い位置）
        const availableDefenders = defenseTeam.players.filter(p =>
          !p.isStarter &&
          p.position !== 'pitcher' &&
          !p.hasSubbedOut &&
          p.name.includes('守備固め')
        );

        if (availableDefenders.length === 0) return;

        // 守備固め対象：打率の低いスタメン野手で、守備適性が低い選手
        const starterFielders = defenseTeam.players.filter(p =>
          p.isStarter &&
          p.position !== 'pitcher' &&
          p.position !== 'catcher' // 捕手は交代しない
        );

        for (const starter of starterFielders) {
          const fitness = calculateDefensiveFitness(starter, starter.position);

          // 守備適性がC以下の選手を交代候補とする
          if (fitness.grade === 'C' || fitness.grade === 'D') {
            const defender = availableDefenders[0];

            if (defender) {
              // 交代処理開始フラグを立てる
              isSubstituting.current = true;

              // 守備固め交代を実行
              setTeam(prev => {
                const players = [...prev.players];
                const oldPlayer = players.find(p => p.id === starter.id);
                const newPlayer = players.find(p => p.id === defender.id);

                if (oldPlayer && newPlayer) {
                  oldPlayer.isStarter = false;
                  oldPlayer.hasSubbedOut = true;
                  oldPlayer.battingOrder = 0;

                  newPlayer.isStarter = true;
                  newPlayer.battingOrder = starter.battingOrder;
                  newPlayer.position = starter.position;

                  // 試合ログに交代を記録
                  setGameLog(prev => {
                    const teamName = teamType === 'home' ? 'ホーム' : 'アウェイ';
                    const updated = [...prev, {
                      description: `🛡️ [${inning}回${isTopInning ? '裏' : '表'}] ${teamName}: 守備固め ${newPlayer.name} (${oldPlayer.name} → 交代)`,
                      isSpecial: true
                    }];
                    return updated.length > 50 ? updated.slice(-50) : updated;
                  });
                }

                return { ...prev, players };
              });

              // 交代処理完了後にフラグを解除（状態更新を待つために遅延）
              setTimeout(() => {
                isSubstituting.current = false;
              }, 100);

              break; // 1人だけ交代
            }
          }
        }
      };

      // 監督AI：盗塁判断ロジック（Phase 3）
      const autoStealingDecision = (runner, situation) => {
        if (!autoManagerMode || !gameStarted) return 1.0; // 監督AIオフの場合は通常の試行率

        const { scoreDiff, isCloseGame, outs, batterType, runnerSteal } = situation;

        // 基本倍率
        let stealMultiplier = 1.0;

        // 状況による調整
        // 1. 得点差による判断
        if (isCloseGame) {
          stealMultiplier *= 1.3; // 接戦では積極的
        } else if (scoreDiff >= 4) {
          stealMultiplier *= 0.5; // 大差では消極的
        }

        // 2. アウトカウントによる判断
        if (outs === 0) {
          stealMultiplier *= 1.2; // ノーアウトは積極的
        } else if (outs === 2) {
          stealMultiplier *= 0.6; // 2アウトは消極的
        }

        // 3. 打者の能力による判断
        if (batterType === 'pitcher' || batterType === 'weak') {
          stealMultiplier *= 1.5; // 弱打者の時は積極的
        } else if (batterType === 'strong') {
          stealMultiplier *= 0.4; // 強打者の時は消極的
        }

        // 4. ランナーの盗塁能力による判断
        if (runnerSteal >= 70) {
          stealMultiplier *= 1.4; // 高い盗塁能力は積極的
        } else if (runnerSteal < 40) {
          stealMultiplier *= 0.3; // 低い盗塁能力は消極的
        }

        // 5. イニングによる判断
        if (inning >= 7 && isCloseGame) {
          stealMultiplier *= 1.3; // 終盤の接戦では積極的
        }

        return stealMultiplier;
      };

      // 監督AI：投手起用最適化（Phase 3）
      const autoOptimizePitcherUsage = () => {
        if (!autoManagerMode || !gameStarted) return;

        // 交代処理中の場合はスキップ（二重実行防止）
        if (isSubstituting.current) return;

        // 7回以降の投手起用を最適化
        if (inning < 7) return;

        const defenseTeam = getDefenseTeam();
        const currentPitcher = getCurrentPitcher();

        // 投手が見つからない場合はスキップ（既に交代処理中の可能性）
        if (!currentPitcher || !currentPitcher.pitching) return;

        const teamType = isTopInning ? 'home' : 'away';
        const setTeam = isTopInning ? setHomeTeam : setAwayTeam;

        // スコア判定
        const isLeading = isTopInning
          ? score.home > score.away
          : score.away > score.home;
        const scoreDiff = Math.abs(score.home - score.away);
        const isCloseGame = scoreDiff <= 2;

        // 投手のタイプを判断（名前から）
        const isCloser = currentPitcher.name.includes('抑え') || currentPitcher.name.includes('クローザー');
        const isSetup = currentPitcher.name.includes('セットアッパー') || currentPitcher.name.includes('8回');

        // 9回表（アウェイ守備）または9回裏（ホーム守備）でリードしている場合
        const isNinthInning = (inning === 9 && isTopInning) || (inning === 9 && !isTopInning);
        const isEighthInning = (inning === 8 && isTopInning) || (inning === 8 && !isTopInning);

        // 抑え投手の起用判断
        if (isNinthInning && isLeading && scoreDiff <= 3 && !isCloser) {
          // 9回でリード、3点差以内で抑え投手でない場合、抑え投手を探す
          const closerPitcher = defenseTeam.players.find(p =>
            p.position === 'pitcher' &&
            !p.hasSubbedOut &&
            !p.isStarter &&
            (p.name.includes('抑え') || p.name.includes('クローザー'))
          );

          if (closerPitcher) {
            // 交代処理開始フラグを立てる
            isSubstituting.current = true;

            // 抑え投手に交代
            setTeam(prev => {
              const players = [...prev.players];
              const oldPitcher = players.find(p => p.id === currentPitcher.id);
              const newPitcher = players.find(p => p.id === closerPitcher.id);

              if (oldPitcher && newPitcher) {
                oldPitcher.isStarter = false;
                oldPitcher.hasSubbedOut = true;
                oldPitcher.battingOrder = 0;

                newPitcher.isStarter = true;
                newPitcher.hasSubbedOut = false;
                newPitcher.battingOrder = currentPitcher.battingOrder;
                newPitcher.position = 'pitcher';

                // 新投手のスタミナをセット
                setCurrentStamina(newPitcher.pitching.stamina);

                // 試合ログに交代を記録
                setGameLog(prev => {
                  const teamName = teamType === 'home' ? 'ホーム' : 'アウェイ';
                  const updated = [...prev, {
                    description: `⚾ [${inning}回${isTopInning ? '裏' : '表'}] ${teamName}: 抑え投手起用 ${oldPitcher.name} → ${newPitcher.name}`,
                    isSpecial: true
                  }];
                  return updated.length > 50 ? updated.slice(-50) : updated;
                });
              }

              return { ...prev, players };
            });

            // 交代処理完了後にフラグを解除（状態更新を待つために遅延）
            setTimeout(() => {
              isSubstituting.current = false;
            }, 100);
          }
        }

        // セットアッパーの起用判断
        if (isEighthInning && isLeading && scoreDiff <= 3 && !isSetup && !isCloser) {
          // 8回でリード、3点差以内でセットアッパーでない場合
          const setupPitcher = defenseTeam.players.find(p =>
            p.position === 'pitcher' &&
            !p.hasSubbedOut &&
            !p.isStarter &&
            (p.name.includes('セットアッパー') || p.name.includes('8回'))
          );

          if (setupPitcher) {
            // 交代処理開始フラグを立てる
            isSubstituting.current = true;

            // セットアッパーに交代
            setTeam(prev => {
              const players = [...prev.players];
              const oldPitcher = players.find(p => p.id === currentPitcher.id);
              const newPitcher = players.find(p => p.id === setupPitcher.id);

              if (oldPitcher && newPitcher) {
                oldPitcher.isStarter = false;
                oldPitcher.hasSubbedOut = true;
                oldPitcher.battingOrder = 0;

                newPitcher.isStarter = true;
                newPitcher.hasSubbedOut = false;
                newPitcher.battingOrder = currentPitcher.battingOrder;
                newPitcher.position = 'pitcher';

                setCurrentStamina(newPitcher.pitching.stamina);

                // 試合ログに交代を記録
                setGameLog(prev => {
                  const teamName = teamType === 'home' ? 'ホーム' : 'アウェイ';
                  const updated = [...prev, {
                    description: `⚾ [${inning}回${isTopInning ? '裏' : '表'}] ${teamName}: セットアッパー起用 ${oldPitcher.name} → ${newPitcher.name}`,
                    isSpecial: true
                  }];
                  return updated.length > 50 ? updated.slice(-50) : updated;
                });
              }

              return { ...prev, players };
            });

            // 交代処理完了後にフラグを解除（状態更新を待つために遅延）
            setTimeout(() => {
              isSubstituting.current = false;
            }, 100);
          }
        }
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
      const determineContactResultPhysics = (selectedBall, predictionCorrect, tempoGroundballBonus = 0, handEffect = {}, actualVelocity = 145, batter = null, pitcher = null, defense = null, catcher = null, lastPitchArg = null) => {
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
        const battedBall = calculateBattedBallPhysics(effectiveBatter, pitcher, currentPitch, physicsResult);

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
        const resultMap = {
          'homerun': { type: 'homerun', description: fieldingResult.description, hit: true },
          'triple': { type: 'triple', description: fieldingResult.description, hit: true },
          'double': { type: 'double', description: fieldingResult.description, hit: true },
          'single': { type: 'single', description: fieldingResult.description, hit: true, isError: fieldingResult.isError },
          'out': {
            type: 'out',
            description: fieldingResult.description,
            hit: false,
            isOutfieldFly: fieldingResult.isOutfieldFly,
            tagupThrowbackChance: fieldingResult.tagupThrowbackChance
          }
        };

        const result = resultMap[fieldingResult.result] || resultMap['out'];

        // 打球データを結果に付加（統計ログ用）
        return {
          ...result,
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
      const simulateSinglePitch = (batter, pitcher, catcher, defense, count, currentStamina, lastPitch = null) => {
        // スタミナを1減らす
        const newStamina = Math.max(0, currentStamina - 1);

        // スタミナによる能力補正を取得
        const { velocityPenalty, controlPenalty } = getStaminaPenalty(newStamina, pitcher.stamina);

        // countのデフォルト値設定
        const safeCount = count || { balls: 0, strikes: 0 };
        const adjustment = getCountAdjustment(safeCount.balls, safeCount.strikes);

        // まず球種を選択（全ての球種から選ぶ）
        const totalPitchTypes = pitcher.pitches.length;

        // 新しい予測式: 球種が増えるほど予測が外れやすくなる
        let basePredictionRate;
        if (totalPitchTypes === 1) {
          basePredictionRate = 1.00;
        } else {
          const leadReduction = (catcher.lead / 100) * 0.02 * (totalPitchTypes - 1);
          const baseRates = { 2: 0.50, 3: 0.313, 4: 0.21, 5: 0.16, 6: 0.106 };
          basePredictionRate = baseRates[totalPitchTypes] || (0.106 - (totalPitchTypes - 6) * 0.02);
          basePredictionRate = Math.max(0, basePredictionRate - leadReduction);
        }

        const finalPredictionRate = basePredictionRate;
        const predictionCorrect = Math.random() < finalPredictionRate;

        // キャッチャーリードで配球を最適化
        let pitchChoice;
        let selectedBall;

        if (catcher.lead > 0) {
          const leadInfluence = catcher.lead / 100;
          const pitchingFormEffect = PITCHING_FORM_EFFECTS[pitcher.form] || PITCHING_FORM_EFFECTS.threeQuarter;
          const ballScores = pitcher.pitches.map((ball, index) => {
            const effect = ballEffects[ball.type];
            const levelFactor = ball.level / 100;
            let score = (effect.whiffBonus + effect.groundballBonus + effect.weakBonus) * levelFactor;

            // 投球フォームとの相性ボーナスを適用
            const synergyPitches = FORM_PITCH_SYNERGY[pitcher.form] || [];
            if (synergyPitches.includes(ball.type)) {
              if (['curve', 'fork', 'splitter', 'knuckle'].includes(ball.type)) {
                score += pitchingFormEffect.verticalBreakBonus * levelFactor;
              }
              if (['slider', 'shoot', 'cutter', 'twoSeam'].includes(ball.type)) {
                score += pitchingFormEffect.horizontalBreakBonus * levelFactor;
              }
            }
            return { index, score, ball };
          });

          if (Math.random() < leadInfluence) {
            ballScores.sort((a, b) => b.score - a.score);
            const topChoices = ballScores.slice(0, Math.max(1, Math.floor(ballScores.length / 2)));
            const chosen = topChoices[Math.floor(Math.random() * topChoices.length)];
            pitchChoice = chosen.index;
          } else {
            pitchChoice = Math.floor(Math.random() * totalPitchTypes);
          }
        } else {
          pitchChoice = Math.floor(Math.random() * totalPitchTypes);
        }

        selectedBall = pitcher.pitches[pitchChoice];

        // 球種レベルによる制球ペナルティ + スタミナペナルティ
        let effectiveControl = pitcher.control + controlPenalty;
        if (selectedBall && selectedBall.type !== 'straight') {
          const ballControlPenalty = 30 - (selectedBall.level / 100) * 30;
          effectiveControl = Math.max(0, effectiveControl - ballControlPenalty);
        }

        // ストライクゾーン確率を実効制球で計算
        const strikeZoneProb = 0.25 + (effectiveControl / 100) * 0.65;
        const isInStrikeZone = Math.random() < (strikeZoneProb * adjustment.strikeZone);

        const catcherLeadEffect = (catcher.lead / 100) * 0.10;

        let swingProb;
        if (isInStrikeZone) {
          if (safeCount.strikes === 2) {
            swingProb = 0.90 + ((100 - batter.eye) / 100) * 0.08;
          } else if (safeCount.balls >= 2) {
            swingProb = 0.60 + ((100 - batter.eye) / 100) * 0.30;
          } else {
            swingProb = 0.75 + ((100 - batter.eye) / 100) * 0.20;
          }
          swingProb = swingProb * (1 - catcherLeadEffect);
        } else {
          if (safeCount.strikes === 2) {
            swingProb = 0.20 + ((100 - batter.eye) / 100) * 0.30;
          } else {
            swingProb = 0.15 + ((100 - batter.eye) / 100) * 0.30;
          }
        }
        swingProb *= adjustment.swingRate;

        const doesSwing = Math.random() < swingProb;

        const pitchTypeName = ballEffects[selectedBall.type].name;

        // 投球フォームの効果を適用
        const pitchingFormEffect = PITCHING_FORM_EFFECTS[pitcher.form] || PITCHING_FORM_EFFECTS.threeQuarter;
        let baseVelocity = pitcher.velocity + velocityPenalty + pitchingFormEffect.velocityBonus;
        baseVelocity -= ballEffects[selectedBall.type].velocityMinus;
        const actualVelocity = Math.round(baseVelocity - (Math.random() * 8));

        if (!doesSwing) {
          const result = isInStrikeZone
            ? { type: 'called_strike', description: '見逃しストライク' }
            : { type: 'ball', description: 'ボール' };
          return { result: { ...result, pitchType: pitchTypeName, velocity: actualVelocity }, newStamina };
        }

        if (!isInStrikeZone) {
          return {
            result: { type: 'swinging_strike', description: '空振り（ボール球）', pitchType: pitchTypeName, velocity: actualVelocity },
            newStamina
          };
        }

        // 左右の相性効果を取得
        const handEffect = getHandednessEffect(pitcher.throws, batter.bats);

        // 【新物理モデル】空振り判定も含めて全てdetermineContactResultPhysicsに委ねる
        const result = determineContactResultPhysics(selectedBall, predictionCorrect, 0, handEffect, actualVelocity, batter, pitcher, defense, catcher, lastPitch);
        return { result: { ...result, pitchType: pitchTypeName, velocity: Math.round(actualVelocity) }, newStamina };
      };

      const simulatePitch = () => {
        // 現在の選手データを取得
        const currentBatter = getCurrentBatter();
        const currentPitcher = getCurrentPitcher();
        const currentCatcher = getCurrentCatcher();

        // 選手データから必要な情報を展開
        const batter = {
          name: currentBatter.name,
          meet: currentBatter.batting.meet,
          power: currentBatter.batting.power,
          eye: currentBatter.batting.eye,
          speed: currentBatter.physical.speed,
          steal: currentBatter.batting.steal,
          bats: currentBatter.batting.bats
        };
        
        const pitcher = {
          name: currentPitcher.name,
          velocity: currentPitcher.pitching.velocity,
          control: currentPitcher.pitching.control,
          stamina: currentPitcher.pitching.stamina,
          throws: currentPitcher.physical.throws,
          pitches: currentPitcher.pitching.arsenal,
          form: currentPitcher.pitching.form
        };
        
        const catcher = {
          name: currentCatcher.name,
          lead: currentCatcher.catching.lead,
          arm: currentCatcher.physical.arm,
          throws: currentCatcher.physical.throws
        };
        
        // 守備データ（守備チームの選手データから構築）
        const defenseTeam = getDefenseTeam();
        const defense = {};
        defenseTeam.players.forEach(player => {
          defense[player.position] = {
            defense: player.fielding.defense,
            speed: player.physical.speed,
            arm: player.physical.arm,
            throws: player.physical.throws
          };
        });

        // 前球情報を取得
        const lastPitch = gameLog.length > 0 ? gameLog[gameLog.length - 1] : null;

        // 共通関数を呼び出し
        const { result, newStamina } = simulateSinglePitch(batter, pitcher, catcher, defense, count, currentStamina, lastPitch);

        // スタミナを更新
        setCurrentStamina(newStamina);

        return result;
      };

      // 旧determineContactResult（互換性のために残す）
      const determineContactResult = (selectedBall, predictionCorrect, tempoGroundballBonus = 0, handEffect = {}, actualVelocity = 145, batter = null, pitcher = null, defense = null) => {
        // 新エンジンに転送
        return determineContactResultPhysics(selectedBall, predictionCorrect, tempoGroundballBonus, handEffect, actualVelocity, batter, pitcher, defense, null);
      };

      const advanceRunners = (hitType) => {
        const newBases = [false, false, false];
        let runsScored = 0;
        
        if (hitType === 'homerun') {
          runsScored = 1 + bases.filter(b => b).length;
          // setBases([false, false, false]); ← 削除
          return { bases: [false, false, false], runsScored };
        }
        
        const advancement = hitType === 'single' ? 1 : hitType === 'double' ? 2 : 3;
        
        for (let i = 2; i >= 0; i--) {
          if (bases[i]) {
            const newBase = i + advancement;
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
        return { bases: newBases, runsScored };
      };

      const throwPitch = () => {
        // ガード: countがundefinedの場合は早期リターン
        if (!count || count.balls === undefined) {
          console.warn('count is not ready');
          return;
        }

        // 打席の最初（カウント0-0）で代打チェック
        if (count.balls === 0 && count.strikes === 0) {
          autoSubstitutePinchHitter();
        }

        // 現在の選手データを取得（チーム対応）
        const currentBatter = getCurrentBatter();
        const currentPitcher = getCurrentPitcher();
        const currentCatcher = getCurrentCatcher();
        const defenseTeam = getDefenseTeam();
        
        // ローカル変数として展開
        const batter = {
          name: currentBatter.name,
          meet: currentBatter.batting.meet,
          power: currentBatter.batting.power,
          eye: currentBatter.batting.eye,
          speed: currentBatter.physical.speed,
          steal: currentBatter.batting.steal,
          bats: currentBatter.batting.bats
        };
        
        const pitcher = {
          name: currentPitcher.name,
          velocity: currentPitcher.pitching.velocity,
          control: currentPitcher.pitching.control,
          stamina: currentPitcher.pitching.stamina,
          throws: currentPitcher.physical.throws,
          pitches: currentPitcher.pitching.arsenal,
          form: currentPitcher.pitching.form
        };
        
        const catcher = {
          name: currentCatcher.name,
          lead: currentCatcher.catching.lead,
          arm: currentCatcher.physical.arm,
          throws: currentCatcher.physical.throws
        };
        
        // 守備データ
        const defense = {};
        defenseTeam.players.forEach(player => {
          defense[player.position] = {
            defense: player.fielding.defense,
            speed: player.physical.speed,
            arm: player.physical.arm,
            throws: player.physical.throws
          };
        });
        
        const result = simulatePitch();
        
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
            }
            break;
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
            break;
          case 'foul':
            newCount.strikes++;
            break;
          case 'single':
          case 'double':
          case 'triple':
          case 'homerun':
            const { bases: updatedBases, runsScored: runs } = advanceRunners(result.type);
            
            // 打者成績: ヒット
            const bases_earned = result.type === 'single' ? 1 : result.type === 'double' ? 2 : result.type === 'triple' ? 3 : 4;
            setBatterStats(prev => ({
              ...prev,
              plateAppearances: prev.plateAppearances + 1,
              atBats: prev.atBats + 1,
              hits: prev.hits + 1,
              homeruns: prev.homeruns + (result.type === 'homerun' ? 1 : 0),
              totalBases: prev.totalBases + bases_earned
            }));
            
            // 選手個別成績を更新
            {
              const currentBatterPlayer = getCurrentBatter();
              const currentPitcherPlayer = getCurrentPitcher();
              const offenseTeamType = isTopInning ? 'away' : 'home';
              const defenseTeamType = isTopInning ? 'home' : 'away';
              
              updateBatterStats(currentBatterPlayer.id, offenseTeamType, {
                atBats: (currentBatterPlayer.stats?.batting?.atBats || 0) + 1,
                hits: (currentBatterPlayer.stats?.batting?.hits || 0) + 1,
                homeruns: (currentBatterPlayer.stats?.batting?.homeruns || 0) + (result.type === 'homerun' ? 1 : 0),
                rbis: (currentBatterPlayer.stats?.batting?.rbis || 0) + runs
              });
              
              updatePitcherStats(currentPitcherPlayer.id, defenseTeamType, {
                runsAllowed: (currentPitcherPlayer.stats?.pitching?.runsAllowed || 0) + runs
              });
            }
            
            // チーム別安打・打点をカウント（エラーの場合はエラーもカウント）
        if (isTopInning) {
          setTeamHits(prev => ({ ...prev, away: prev.away + 1 }));
          setTeamRBIs(prev => ({ ...prev, away: prev.away + runs }));
          if (result.isError) {
            setTeamErrors(prev => ({ ...prev, home: prev.home + 1 }));
          }
        } else {
          setTeamHits(prev => ({ ...prev, home: prev.home + 1 }));
          setTeamRBIs(prev => ({ ...prev, home: prev.home + runs }));
          if (result.isError) {
            setTeamErrors(prev => ({ ...prev, away: prev.away + 1 }));
          }
        }
        
        setPitcherStats(prev => ({
          ...prev,
          runsAllowed: prev.runsAllowed + runs
        }));
        
        isTopInning ? (newScore.away += runs) : (newScore.home += runs);
        newBases = updatedBases;
        atBatOver = true;
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
              newBases[2] = false;
              setLastResult({ ...result, description: result.description + '（犠牲フライ）' });
            }
          }
          
          // 二塁ランナーがいる場合（三塁進塁）
          if (newBases[1]) {
            const tagupSuccess = Math.random() > (throwbackChance * 0.7 - runnerSpeed * 0.2);
            if (tagupSuccess) {
              newBases[2] = true;
              newBases[1] = false;
            }
          }
          
          // 一塁ランナーがいる場合（二塁進塁）
          if (newBases[0]) {
            const tagupSuccess = Math.random() > (throwbackChance * 0.5 - runnerSpeed * 0.15);
            if (tagupSuccess) {
              newBases[1] = true;
              newBases[0] = false;
            }
          }
        }
        
        atBatOver = true;
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
          const runnerSpeed = batter.speed / 100;
          const stealSkill = batter.steal / 100;
          const pitcherControl = pitcher.control / 100;
          const pitchVelocity = result.velocity || pitcher.velocity;
          
          // 盗塁試行率（調整版）
          const stealSkillBonus = Math.pow(stealSkill, 1.5) * 0.35;  // 0-35%（より試行しやすく）
          const speedBonus = runnerSpeed * 0.05;  // 0-5%
          const countBonus = newCount.balls >= 2 ? 0.03 : 0;  // 3%
          const outsBonus = newOuts === 2 ? 0.02 : 0;  // 2%
          
          // 二塁盗塁試行
          if (bases[0] && !bases[1]) {
            // 二塁盗塁は正面への送球なので左右ペナルティなし
            let catcherArm = defense.catcher.arm / 100;
            let catcherDeterrent = catcherArm * 0.10;  // 捕手の肩による牽制効果 0-10%
            
            // 左投手は牽制ボーナス
            if (pitcher.throws === 'left') {
              catcherDeterrent += 0.03;  // +3%の牽制ボーナス
            }
            
            let stealAttempt = Math.max(0, stealSkillBonus + speedBonus + countBonus + outsBonus - catcherDeterrent);

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

            if (Math.random() < stealAttempt) {
              // 新しい成功率システム
              // ステップ1: 走力による基本成功率（20%-80%）
              const baseRate = 0.20 + runnerSpeed * 0.60;
              
              // ステップ2: 各種補正
              const stealBonus = stealSkill * 0.15;  // 0-15%
              const velocityEffect = (pitchVelocity - 135) / 350;  // ±10%
              const controlEffect = pitcherControl * 0.05;  // 0-5%
              
              const adjustedRate = baseRate + stealBonus - velocityEffect - controlEffect;
              
              // ステップ3: 捕手の肩による阻止（段階的・削減版）
              let catcherBlock;
              if (adjustedRate < 0.30) {
                // 低成功率: 80%阻止
                catcherBlock = adjustedRate * catcherArm * 0.80;
              } else if (adjustedRate > 0.60) {
                // 高成功率: 35%阻止
                catcherBlock = adjustedRate * catcherArm * 0.35;
              } else {
                // 中間: 線形補間（80% → 35%）
                const t = (adjustedRate - 0.30) / 0.30;
                catcherBlock = adjustedRate * catcherArm * (0.80 - t * 0.45);
              }
              
              const stealSuccess = Math.max(0.05, Math.min(0.95, adjustedRate - catcherBlock));
              
              if (Math.random() < stealSuccess) {
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
    // 三塁盗塁は体の向きを変える必要があるため左投げペナルティあり
    let catcherArmForThird = defense.catcher.arm / 100;
    
    // 左投げ捕手は三塁送球でペナルティ
    if (catcher.throws === 'left') {
      catcherArmForThird = Math.max(0, catcherArmForThird - 0.20);  // -20%
    }
    
    let catcherDeterrentThird = catcherArmForThird * 0.12;
    
    // 左投手は牽制ボーナス
    if (pitcher.throws === 'left') {
      catcherDeterrentThird += 0.05;
    }
    
    let stealThirdAttempt = Math.max(0, (stealSkillBonus + speedBonus + countBonus + outsBonus - catcherDeterrentThird) * 0.7);

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

      stealThirdAttempt *= stealMultiplier * 1.2; // 三塁盗塁はやや積極的
    }

    if (Math.random() < stealThirdAttempt) {
      // 新しい成功率システム（三塁盗塁は基本成功率が高い）
      // ステップ1: 走力による基本成功率（30%-90%）
      const baseRate = 0.30 + runnerSpeed * 0.60;
      
      // ステップ2: 各種補正
      const stealBonus = stealSkill * 0.12;  // 0-12%
      const velocityEffect = (pitchVelocity - 135) / 350;  // ±10%
      const controlEffect = pitcherControl * 0.04;  // 0-4%
      
      const adjustedRate = baseRate + stealBonus - velocityEffect - controlEffect;
      
      // ステップ3: 捕手の肩による阻止（段階的・削減版）
              let catcherBlock;
              if (adjustedRate < 0.30) {
                catcherBlock = adjustedRate * catcherArmForThird * 0.80;
              } else if (adjustedRate > 0.60) {
                catcherBlock = adjustedRate * catcherArmForThird * 0.35;
              } else {
                const t = (adjustedRate - 0.30) / 0.30;
                catcherBlock = adjustedRate * catcherArmForThird * (0.80 - t * 0.45);
              }
              
              const stealThirdSuccess = Math.max(0.05, Math.min(0.95, adjustedRate - catcherBlock));
              
              if (Math.random() < stealThirdSuccess) {
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
        
        setCount(newCount);
        setOuts(newOuts);
        setBases(newBases);
        setScore(newScore);

        // 投球後に監督AIによる自動交代をチェック
        setTimeout(() => {
          autoSubstitutePitcher();
        }, 100);
      };

      const resetGame = () => {
        // 交代処理中フラグをクリア
        isSubstituting.current = false;

        setCount({ balls: 0, strikes: 0 });
        setBases([false, false, false]);
        setOuts(0);
        setInning(1);
        setScore({ home: 0, away: 0 });
        setGameOver(false);  // 試合終了フラグをリセット
        setRemainingPitches(0);  // 残り投球数をリセット
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
        setBattedBallStats({
          innerGrounder: { total: 0, hits: 0 },
          innerLiner: { total: 0, hits: 0 },
          innerFly: { total: 0, hits: 0 },
          shallowOuter: { total: 0, hits: 0 },
          outerLiner: { total: 0, hits: 0 },
          shallowFly: { total: 0, hits: 0 },
          mediumFly: { total: 0, hits: 0 },
          deepFly: { total: 0, hits: 0 },
          outerGrounder: { total: 0, hits: 0 },
          homerun: { total: 0, hits: 0 }
        });
        setBattedBallTypeStats({
          grounder: 0,
          liner: 0,
          fly: 0,
          popup: 0
        });
        setBattedBallDirectionStats({
          left: 0,
          leftCenter: 0,
          center: 0,
          rightCenter: 0,
          right: 0
        });
        setBattedBallAreaStats({
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
      };

      // 指定回数投球を開始
      const multiPitch = (pitchCount) => {
        setRemainingPitches(pitchCount);
        setIsAutoSimulating(true);
      };
      
      // 残り投球数がある場合は自動的に投球を続ける
      React.useEffect(() => {
        if (remainingPitches > 0 && !gameOver) {
          const timer = setTimeout(() => {
            throwPitch();
            setRemainingPitches(prev => prev - 1);
          }, 1);  // 1msごとに投球
          return () => clearTimeout(timer);
        } else if (remainingPitches === 0 && isAutoSimulating) {
          setIsAutoSimulating(false);
        }
      }, [remainingPitches, gameOver]);

      // --- PositionControl コンポーネント (PitchByPitchSimulator 内部に配置) ---
      const PositionControl = ({ position, label, defense, setDefense }) => {
        const [show, setShow] = React.useState(false);
        if (!defense || !defense[position]) return null;

        return (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 shadow-lg border-2 border-white"
            >
              {label}
            </button>
            {show && (
              <div className="absolute z-10 bg-white p-2 rounded shadow-xl border-2 border-blue-600 w-48 text-xs"
                   style={{left: '50%', transform: 'translateX(-50%)', marginTop: '4px'}}>
                <div className="mb-1 text-gray-800">
                  <label className="block font-bold">守:{defense[position].defense}</label>
                  <input type="range" min="0" max="100" value={defense[position].defense}
                    onChange={(e) => setDefense({...defense, [position]: {...defense[position], defense: Number(e.target.value)}})}
                    className="w-full h-1 cursor-pointer" />
                </div>
                <div className="mb-1 text-gray-800">
                  <label className="block font-bold">足:{defense[position].speed}</label>
                  <input type="range" min="0" max="100" value={defense[position].speed}
                    onChange={(e) => setDefense({...defense, [position]: {...defense[position], speed: Number(e.target.value)}})}
                    className="w-full h-1 cursor-pointer" />
                </div>
                <div className="text-gray-800">
                  <label className="block font-bold">肩:{defense[position].arm}</label>
                  <input type="range" min="0" max="100" value={defense[position].arm}
                    onChange={(e) => setDefense({...defense, [position]: {...defense[position], arm: Number(e.target.value)}})}
                    className="w-full h-1 cursor-pointer" />
                </div>
              </div>
            )}
          </div>
        );
      };

      const renderBases = () => (
        <div className="relative w-full max-w-2xl mx-auto">
          {/* 全ポジション一括設定 */}
          <div className="bg-gradient-to-r from-purple-100 to-blue-100 p-4 rounded-lg mb-4 shadow-md">
            <h4 className="font-bold text-sm mb-3 text-purple-800">🌟 全ポジション一括設定</h4>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">
                  守備力: <span className="text-blue-600">{defense.first.defense}</span>
                </label>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={defense.first.defense}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDefense({
                      pitcher: { ...defense.pitcher, defense: val },
                      catcher: { ...defense.catcher, defense: val },
                      first: { ...defense.first, defense: val },
                      second: { ...defense.second, defense: val },
                      short: { ...defense.short, defense: val },
                      third: { ...defense.third, defense: val },
                      left: { ...defense.left, defense: val },
                      center: { ...defense.center, defense: val },
                      right: { ...defense.right, defense: val }
                    });
                  }}
                  className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  足: <span className="text-green-600">{defense.first.speed}</span>
                </label>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={defense.first.speed}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDefense({
                      pitcher: { ...defense.pitcher, speed: val },
                      catcher: { ...defense.catcher, speed: val },
                      first: { ...defense.first, speed: val },
                      second: { ...defense.second, speed: val },
                      short: { ...defense.short, speed: val },
                      third: { ...defense.third, speed: val },
                      left: { ...defense.left, speed: val },
                      center: { ...defense.center, speed: val },
                      right: { ...defense.right, speed: val }
                    });
                  }}
                  className="w-full h-2 bg-green-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">
                  肩: <span className="text-orange-600">{defense.first.arm}</span>
                </label>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={defense.first.arm}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDefense({
                      pitcher: { ...defense.pitcher, arm: val },
                      catcher: { ...defense.catcher, arm: val },
                      first: { ...defense.first, arm: val },
                      second: { ...defense.second, arm: val },
                      short: { ...defense.short, arm: val },
                      third: { ...defense.third, arm: val },
                      left: { ...defense.left, arm: val },
                      center: { ...defense.center, arm: val },
                      right: { ...defense.right, arm: val }
                    });
                  }}
                  className="w-full h-2 bg-orange-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>
          
          <svg viewBox="0 0 400 350" className="w-full h-full">
            {/* スタジアム外周（グレー） */}
            <ellipse cx="200" cy="280" rx="180" ry="140" fill="#9ca3af" />
            
            {/* 観客席 */}
            <path d="M 50 200 Q 200 80 350 200 L 350 320 Q 200 360 50 320 Z" fill="#d1d5db" />
            
            {/* スコアボード（センター後方） */}
            <rect x="160" y="10" width="80" height="35" fill="#1e40af" stroke="#1e3a8a" strokeWidth="2" rx="3" />
            <rect x="165" y="15" width="70" height="10" fill="#16a34a" opacity="0.8" />
            
            {/* ファウルポール（黄色） */}
            <rect x="30" y="200" width="8" height="80" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1" />
            <rect x="362" y="200" width="8" height="80" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1" />
            
            {/* 外野フェンス（曲線） */}
            <path d="M 40 260 Q 200 120 360 260" fill="none" stroke="#8b7355" strokeWidth="4" />
            
            {/* 外野芝（深緑、ストライプ） */}
            <defs>
              <linearGradient id="grassStripes" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#15803d" />
                <stop offset="10%" stopColor="#16a34a" />
                <stop offset="20%" stopColor="#15803d" />
                <stop offset="30%" stopColor="#16a34a" />
                <stop offset="40%" stopColor="#15803d" />
                <stop offset="50%" stopColor="#16a34a" />
                <stop offset="60%" stopColor="#15803d" />
                <stop offset="70%" stopColor="#16a34a" />
                <stop offset="80%" stopColor="#15803d" />
                <stop offset="90%" stopColor="#16a34a" />
                <stop offset="100%" stopColor="#15803d" />
              </linearGradient>
            </defs>
            <path d="M 40 260 Q 200 120 360 260 L 270 300 L 200 265 L 130 300 Z" fill="url(#grassStripes)" />
            
            {/* 内野土（茶色、ダイヤモンド） */}
            <path d="M 200 310 L 270 250 L 200 190 L 130 250 Z" fill="#d4a574" stroke="#b8956a" strokeWidth="2" />
            
            {/* 内野グラス（円弧） */}
            <ellipse cx="200" cy="310" rx="80" ry="55" fill="#22c55e" opacity="0.6" />
            
            {/* ファウルライン（白線） */}
            <line x1="200" y1="310" x2="40" y2="260" stroke="white" strokeWidth="2.5" />
            <line x1="200" y1="310" x2="360" y2="260" stroke="white" strokeWidth="2.5" />
            
            {/* ベースパス */}
            <line x1="200" y1="310" x2="270" y2="250" stroke="#b8956a" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.6" />
            <line x1="270" y1="250" x2="200" y2="190" stroke="#b8956a" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.6" />
            <line x1="200" y1="190" x2="130" y2="250" stroke="#b8956a" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.6" />
            <line x1="130" y1="250" x2="200" y2="310" stroke="#b8956a" strokeWidth="1.5" strokeDasharray="4,4" opacity="0.6" />
            
            {/* 投手マウンド */}
            <ellipse cx="200" cy="280" rx="12" ry="8" fill="#d4a574" stroke="#b8956a" strokeWidth="1.5" />
            <ellipse cx="200" cy="280" rx="4" ry="3" fill="#b8956a" />
            
            {/* ホームベース */}
            <path d="M 200 310 L 195 305 L 195 300 L 205 300 L 205 305 Z" 
                  fill="white" stroke="#333" strokeWidth="1.5" />
            
            {/* 一塁ベース */}
            <rect x="265" y="245" width="10" height="10" 
                  fill={bases[0] ? '#fbbf24' : 'white'} 
                  stroke="#333" strokeWidth="1.5"
                  transform="rotate(45 270 250)" />
            {bases[0] && <circle cx="270" cy="250" r="5" fill="#ef4444" />}
            
            {/* 二塁ベース */}
            <rect x="195" y="185" width="10" height="10" 
                  fill={bases[1] ? '#fbbf24' : 'white'} 
                  stroke="#333" strokeWidth="1.5"
                  transform="rotate(45 200 190)" />
            {bases[1] && <circle cx="200" cy="190" r="5" fill="#ef4444" />}
            
            {/* 三塁ベース */}
            <rect x="125" y="245" width="10" height="10" 
                  fill={bases[2] ? '#fbbf24' : 'white'} 
                  stroke="#333" strokeWidth="1.5"
                  transform="rotate(45 130 250)" />
            {bases[2] && <circle cx="130" cy="250" r="5" fill="#ef4444" />}
            
            {/* ポジション表示（小さい円） */}
            {/* 投手 */}
            <circle cx="200" cy="280" r="3" fill="#1e40af" opacity="0.7" />
            
            {/* 捕手 */}
            <circle cx="200" cy="315" r="3" fill="#dc2626" opacity="0.7" />
            
            {/* 一塁手 */}
            <circle cx="260" cy="260" r="3" fill="#7c3aed" opacity="0.7" />
            
            {/* 二塁手 */}
            <circle cx="230" cy="230" r="3" fill="#7c3aed" opacity="0.7" />
            
            {/* 遊撃手 */}
            <circle cx="170" cy="230" r="3" fill="#7c3aed" opacity="0.7" />
            
            {/* 三塁手 */}
            <circle cx="140" cy="260" r="3" fill="#7c3aed" opacity="0.7" />
            
            {/* 左翼手 */}
            <circle cx="120" cy="200" r="3" fill="#059669" opacity="0.7" />
            
            {/* 中堅手 */}
            <circle cx="200" cy="160" r="3" fill="#059669" opacity="0.7" />
            
            {/* 右翼手 */}
            <circle cx="280" cy="200" r="3" fill="#059669" opacity="0.7" />
          </svg>
          
          {/* ポジション別パラメータ設定UI */}
          <div className="absolute inset-0 pointer-events-none">
            {/* 投手 */}
            <div className="absolute pointer-events-auto" style={{left: '48%', top: '58%'}}>
              <PositionControl position="pitcher" label="投" />
            </div>
            
            {/* 捕手 */}
            <div className="absolute pointer-events-auto" style={{left: '48%', top: '72%'}}>
              <PositionControl position="catcher" label="捕" />
            </div>
            
            {/* 一塁手 */}
            <div className="absolute pointer-events-auto" style={{left: '68%', top: '52%'}}>
              <PositionControl position="first" label="一" />
            </div>
            
            {/* 二塁手 */}
            <div className="absolute pointer-events-auto" style={{left: '60%', top: '38%'}}>
              <PositionControl position="second" label="二" />
            </div>
            
            {/* 遊撃手 */}
            <div className="absolute pointer-events-auto" style={{left: '38%', top: '38%'}}>
              <PositionControl position="short" label="遊" />
            </div>
            
            {/* 三塁手 */}
            <div className="absolute pointer-events-auto" style={{left: '30%', top: '52%'}}>
              <PositionControl position="third" label="三" />
            </div>
            
            {/* 左翼手 */}
            <div className="absolute pointer-events-auto" style={{left: '25%', top: '28%'}}>
              <PositionControl position="left" label="左" defense={defense} setDefense={setDefense} />
            </div>
            
            {/* 中堅手 */}
            <div className="absolute pointer-events-auto" style={{left: '48%', top: '15%'}}>
              <PositionControl position="center" label="中" defense={defense} setDefense={setDefense} />
            </div>
            
            {/* 右翼手 */}
            <div className="absolute pointer-events-auto" style={{left: '71%', top: '28%'}}>
              <PositionControl position="right" label="右" defense={defense} setDefense={setDefense} />
            </div>
          </div>
        </div>
      );
      
      // アコーディオンセクションのコンポーネント
      const AccordionSection = ({ title, isExpanded, onToggle, children, bgColor = "bg-blue-50" }) => (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <button
            onClick={onToggle}
            className={`w-full px-4 py-3 flex justify-between items-center ${bgColor} hover:opacity-90 transition`}
          >
            <span className="font-bold text-gray-800">{title}</span>
            <span className="text-xl">{isExpanded ? '▼' : '▶'}</span>
          </button>
          {isExpanded && (
            <div className="p-4">
              {children}
            </div>
          )}
        </div>
      );

      // サイドバーコンポーネント
      const Sidebar = () => (
        <div className="w-64 bg-gray-900 text-white h-screen fixed left-0 top-0 p-4 flex flex-col">
          <h2 className="text-2xl font-bold mb-6 text-green-400">⚾ 野球シミュレーター</h2>

          {/* メニュー */}
          <nav className="flex-1 space-y-2">
            <button
              onClick={() => {
                setScreenMode('management');
                setManagementView('dateprogress');
              }}
              className={`w-full text-left px-4 py-3 rounded transition ${
                screenMode === 'management' && managementView === 'dateprogress' ? 'bg-green-600' : 'hover:bg-gray-800'
              }`}
            >
              📅 日程進行
            </button>

            <button
              onClick={() => {
                setScreenMode('management');
                setManagementView('teaminfo');
              }}
              className={`w-full text-left px-4 py-3 rounded transition ${
                screenMode === 'management' && managementView === 'teaminfo' ? 'bg-green-600' : 'hover:bg-gray-800'
              }`}
            >
              👥 チーム情報
            </button>

            <button
              onClick={() => {
                setScreenMode('management');
                setManagementView('tryout');
              }}
              className={`w-full text-left px-4 py-3 rounded transition ${
                screenMode === 'management' && managementView === 'tryout' ? 'bg-green-600' : 'hover:bg-gray-800'
              }`}
            >
              🎯 トライアウト
            </button>

            <button
              onClick={() => {
                setScreenMode('management');
                setManagementView('roster');
              }}
              className={`w-full text-left px-4 py-3 rounded transition ${
                screenMode === 'management' && managementView === 'roster' ? 'bg-green-600' : 'hover:bg-gray-800'
              }`}
            >
              👥 ロスター管理
            </button>


            <button
              onClick={() => {
                setScreenMode('management');
                setManagementView('offseason');
              }}
              className={`w-full text-left px-4 py-3 rounded transition ${
                screenMode === 'management' && managementView === 'offseason' ? 'bg-green-600' : 'hover:bg-gray-800'
              }`}
            >
              🏆 オフシーズン
            </button>

            <button
              onClick={() => {
                setScreenMode('management');
                setManagementView('stats');
              }}
              className={`w-full text-left px-4 py-3 rounded transition ${
                screenMode === 'management' && managementView === 'stats' ? 'bg-green-600' : 'hover:bg-gray-800'
              }`}
            >
              📈 選手成績
            </button>

            <button
              onClick={() => {
                setScreenMode('management');
                setManagementView('save');
              }}
              className={`w-full text-left px-4 py-3 rounded transition ${
                screenMode === 'management' && managementView === 'save' ? 'bg-green-600' : 'hover:bg-gray-800'
              }`}
            >
              💾 セーブ＆ロード
            </button>

            <div className="border-t border-gray-700 my-4"></div>

            <button
              onClick={() => {
                setScreenMode('management');
                setManagementView('regulations');
              }}
              className={`w-full text-left px-4 py-3 rounded transition ${
                screenMode === 'management' && managementView === 'regulations' ? 'bg-green-600' : 'hover:bg-gray-800'
              }`}
            >
              ⚙️ レギュレーション設定
            </button>

            <button
              onClick={() => {
                setScreenMode('management');
                setManagementView('edit');
              }}
              className={`w-full text-left px-4 py-3 rounded transition ${
                screenMode === 'management' && managementView === 'edit' ? 'bg-green-600' : 'hover:bg-gray-800'
              }`}
            >
              ✏️ エディット（開発用）
            </button>
          </nav>

          <div className="mt-auto text-xs text-gray-500 border-t border-gray-700 pt-4">
            v2.6.0 - 管理画面追加
          </div>
        </div>
      );

      // AIオーダー編成関数
      const generateOptimalLineup = (teamName) => {
        if (!TEAMS_DATA || !TEAMS_DATA[teamName]) {
          console.error('チームデータが見つかりません:', teamName);
          return;
        }

        const team = TEAMS_DATA[teamName];
        console.log(`🤖 ${teamName}のAIオーダー編成を開始`);

        // 野手と投手を分ける
        const fielders = team.players.filter(p => !p.position || p.position !== 'pitcher');
        const pitchers = team.players.filter(p => p.position === 'pitcher');

        // 野手を総合力でソート（打撃+走力+守備）
        const rankedFielders = fielders.map(p => {
          const battingPower = (p.batting.meet + p.batting.power + p.batting.eye) / 3;
          const fieldingPower = (p.fielding.defense + p.physical.speed + p.physical.arm) / 3;
          const totalPower = battingPower * 0.6 + fieldingPower * 0.4;
          return { ...p, totalPower, battingPower };
        }).sort((a, b) => b.totalPower - a.totalPower);

        // 守備位置を決定（positionFitnessを考慮）
        const positions = ['catcher', 'first', 'second', 'short', 'third', 'left', 'center', 'right'];
        const assigned = new Set();
        const positionAssignments = {};

        // 各ポジションに最適な選手を割り当て
        positions.forEach(pos => {
          let bestPlayer = null;
          let bestScore = -1;

          rankedFielders.forEach(player => {
            if (assigned.has(player.id)) return;

            const fitness = player.positionFitness?.[pos] || 50;
            const fieldingAbility = pos === 'catcher' ? player.catching?.lead || 0 : player.fielding.defense;
            const score = fitness * 0.7 + fieldingAbility * 0.3;

            if (score > bestScore) {
              bestScore = score;
              bestPlayer = player;
            }
          });

          if (bestPlayer) {
            positionAssignments[pos] = bestPlayer;
            assigned.add(bestPlayer.id);
          }
        });

        // 打順を決定（一般的なセオリーに従う）
        const lineupOrder = [];

        // 1番: 足が速い選手（走力重視）
        const leadoffCandidates = Object.values(positionAssignments)
          .sort((a, b) => b.physical.speed - a.physical.speed);
        if (leadoffCandidates[0]) lineupOrder.push(leadoffCandidates[0]);

        // 2番: ミートが高い選手（コンタクト重視）
        const secondCandidates = Object.values(positionAssignments)
          .filter(p => !lineupOrder.includes(p))
          .sort((a, b) => b.batting.meet - a.batting.meet);
        if (secondCandidates[0]) lineupOrder.push(secondCandidates[0]);

        // 3番: バランス型（ミート+パワー）
        const thirdCandidates = Object.values(positionAssignments)
          .filter(p => !lineupOrder.includes(p))
          .sort((a, b) => (b.batting.meet + b.batting.power) - (a.batting.meet + a.batting.power));
        if (thirdCandidates[0]) lineupOrder.push(thirdCandidates[0]);

        // 4番: パワーが最も高い選手（長距離砲）
        const cleanupCandidates = Object.values(positionAssignments)
          .filter(p => !lineupOrder.includes(p))
          .sort((a, b) => b.batting.power - a.batting.power);
        if (cleanupCandidates[0]) lineupOrder.push(cleanupCandidates[0]);

        // 5番: 2番目にパワーが高い選手
        if (cleanupCandidates[1]) lineupOrder.push(cleanupCandidates[1]);

        // 6-8番: 残りの選手（総合力順）
        const remainingFielders = Object.values(positionAssignments)
          .filter(p => !lineupOrder.includes(p))
          .sort((a, b) => b.totalPower - a.totalPower);
        remainingFielders.forEach(p => lineupOrder.push(p));

        // 9番: 投手（スタメンには入れない）

        // lineupSettingsに保存（新形式）
        if (!team.lineupSettings) {
          team.lineupSettings = {
            battingOrder: [],
            benchPlayers: [],
            substitutionRules: { pinchHitter: [], pinchRunner: [] }
          };
        }

        team.lineupSettings.battingOrder = lineupOrder.map((player, index) => {
          const assignedPos = Object.entries(positionAssignments).find(([_, p]) => p.id === player.id);
          return {
            playerId: player.id,
            battingOrder: index + 1,
            position: assignedPos ? assignedPos[0] : player.position
          };
        });

        // 旧形式の打順も維持（互換性のため）
        team.players.forEach(p => {
          p.battingOrder = 0; // リセット
        });

        lineupOrder.forEach((player, index) => {
          const teamPlayer = team.players.find(p => p.id === player.id);
          if (teamPlayer) {
            teamPlayer.battingOrder = index + 1;
            const assignedPos = Object.entries(positionAssignments).find(([_, p]) => p.id === player.id);
            if (assignedPos) {
              teamPlayer.position = assignedPos[0];
            }
          }
        });

        console.log(`✅ ${teamName}のオーダー編成完了`);
        console.log('打順:', lineupOrder.map((p, i) => {
          const pos = Object.entries(positionAssignments).find(([_, pl]) => pl.id === p.id);
          return `${i + 1}. ${p.name} (${pos ? pos[0] : p.position})`;
        }).join(', '));
      };

      // 投手ローテーション生成関数（AI監督用）
      const generatePitchingRotation = (teamName) => {
        if (!TEAMS_DATA || !TEAMS_DATA[teamName]) {
          console.error('チームデータが見つかりません:', teamName);
          return;
        }

        const team = TEAMS_DATA[teamName];
        const pitchers = team.players.filter(p => p.position === 'pitcher' || p.pitching?.stamina > 0);

        // スタミナでソート
        const sortedPitchers = pitchers.sort((a, b) => (b.pitching?.stamina || 0) - (a.pitching?.stamina || 0));

        // 先発ローテーション（スタミナ140以上、最大5人）
        const starters = sortedPitchers.filter(p => p.pitching?.stamina >= 130).slice(0, 5);

        // 残りの投手（リリーフ候補）
        const relievers = sortedPitchers.filter(p => !starters.includes(p));

        // 能力スコアでソート
        const scoredRelievers = relievers.map(p => ({
          ...p,
          reliefScore: (p.pitching?.velocity || 130) * 0.4 +
                       (p.pitching?.control || 50) * 0.4 +
                       (p.pitching?.stamina || 80) * 0.2
        })).sort((a, b) => b.reliefScore - a.reliefScore);

        // クローザー（最高能力、1人）
        const closer = scoredRelievers[0] || null;
        // セットアッパー（2-3番手）
        const setupMen = scoredRelievers.slice(1, 3);
        // 中継ぎ（残り）
        const middleRelievers = scoredRelievers.slice(3);

        // ローテーション情報を新形式で保存
        if (!team.pitchingRotation) {
          team.pitchingRotation = {};
        }

        team.pitchingRotation.starters = starters.map(p => p.id);
        team.pitchingRotation.closer = closer ? closer.id : null;
        team.pitchingRotation.setupMen = setupMen.map(p => p.id);
        team.pitchingRotation.middleRelievers = middleRelievers.map(p => p.id);
        team.pitchingRotation.currentStarterIndex = 0;
        team.pitchingRotation.reliefFatigue = {};

        console.log(`✅ ${teamName}の投手ローテーション設定完了`);
        console.log('先発:', starters.map(p => `${p.name}(スタ${p.pitching.stamina})`).join(', '));
        console.log('守護神:', closer ? `${closer.name}(球${closer.pitching.velocity})` : 'なし');
        console.log('セットアップ:', setupMen.map(p => p.name).join(', '));
        console.log('中継ぎ:', middleRelievers.map(p => p.name).join(', '));
      };

      // 全チームのAIオーダー編成を実行
      const generateAllTeamsLineup = () => {
        allTeams.forEach(teamName => {
          generateOptimalLineup(teamName);
          generatePitchingRotation(teamName);
        });
        alert('全チームのAIオーダー編成と投手ローテーションを設定しました！');
      };

      // トライアウト画面コンポーネント
      const TryoutScreen = ({ seasonData, allTeams, isInitialTryout = false, onComplete }) => {
        const [tryoutCandidates, setTryoutCandidates] = useState([]);
        const [draftOrder, setDraftOrder] = useState([]);
        const [currentPick, setCurrentPick] = useState(0);
        const [userRoster, setUserRoster] = useState([]);
        const [teamRosters, setTeamRosters] = useState({}); // 各チームのドラフト済み選手
        const [positionTab, setPositionTab] = useState('all'); // 'all', 'pitcher', 'catcher', 'infielder', 'outfielder'
        const [draftComplete, setDraftComplete] = useState(false);
        const [viewTab, setViewTab] = useState('draft'); // 'draft' or 'details'

        // ポジション名をカタカナに変換
        const getPositionName = (position) => {
          const positionNames = {
            pitcher: 'ピッチャー',
            catcher: 'キャッチャー',
            first: 'ファースト',
            second: 'セカンド',
            third: 'サード',
            short: 'ショート',
            left: 'レフト',
            center: 'センター',
            right: 'ライト'
          };
          return positionNames[position] || position;
        };

        // 能力値をランク化（S/A/B/C/D）
        const getAbilityRank = (value, isPitcherVelocity = false, isStamina = false) => {
          let adjustedValue = value;
          if (isPitcherVelocity) {
            // 球速は115基準で調整（独立リーグ設定）
            adjustedValue = (value - 115) * 2.5;
          } else if (isStamina) {
            // スタミナは200が最大なので半分に
            adjustedValue = value / 2;
          }

          if (adjustedValue >= 90) return 'S';
          if (adjustedValue >= 80) return 'A';
          if (adjustedValue >= 70) return 'B';
          if (adjustedValue >= 60) return 'C';
          return 'D';
        };

        // ポジションカテゴリ判定
        const getPositionCategory = (position) => {
          if (position === 'pitcher') return 'pitcher';
          if (position === 'catcher') return 'catcher';
          if (['first', 'second', 'third', 'short'].includes(position)) return 'infielder';
          if (['left', 'center', 'right'].includes(position)) return 'outfielder';
          return 'all';
        };

        // 初期化: トライアウト候補者を生成
        useEffect(() => {
          if (tryoutCandidates.length === 0) {
            // isInitialTryoutがtrueならyear=1（30人×チーム数）、falseならyear=2（15人×チーム数）
            const year = isInitialTryout ? 1 : (seasonData?.year || 1);
            // レギュレーション設定のチーム数を使用（設定がない場合はallTeamsから取得）
            const teamCount = seasonData?.settings?.teamsCount || Object.keys(allTeams).length || 4;
            console.log(`🎯 トライアウト初期化: year=${year}, teamCount=${teamCount}, settings.teamsCount=${seasonData?.settings?.teamsCount}`);
            const candidates = generateTryoutCandidates(year, teamCount);
            console.log(`📋 候補者生成完了: ${candidates.length}人`);
            setTryoutCandidates(candidates);

            // ドラフト順序を生成（24ラウンド）
            // allTeamsから実際のチーム名を取得（ユーザーチームは'ユーザー'として表示）
            const teamsArray = Array.isArray(allTeams) ? allTeams : Object.keys(allTeams);
            const teamNames = ['ユーザー', ...teamsArray.slice(1)];
            const order = generateSnakeDraftOrder(teamNames, 24);
            console.log(`📊 ドラフト順序: ${order.length}ラウンド, チーム数: ${teamCount}`);
            setDraftOrder(order);
          }
        }, [seasonData, allTeams, tryoutCandidates.length, isInitialTryout]);

        // 選手選択処理
        const handleSelectPlayer = (player) => {
          if (currentPick >= draftOrder.length) {
            alert('ドラフトは終了しました');
            return;
          }

          const currentTeam = draftOrder[currentPick].team;

          if (currentTeam === 'ユーザー') {
            setUserRoster([...userRoster, player]);
            // チームロスターにも追加
            setTeamRosters({
              ...teamRosters,
              [currentTeam]: [...(teamRosters[currentTeam] || []), player]
            });
            setTryoutCandidates(tryoutCandidates.filter(c => c.id !== player.id));
            setCurrentPick(currentPick + 1);
          }
        };

        // AI自動選択
        useEffect(() => {
          if (currentPick >= draftOrder.length || tryoutCandidates.length === 0) return;

          const currentTeam = draftOrder[currentPick].team;

          if (currentTeam !== 'ユーザー') {
            setTimeout(() => {
              // 現在のチームのロスターを取得して能力バランスを考慮
              const currentTeamRoster = teamRosters[currentTeam] || [];
              const selected = selectPlayerForAI(tryoutCandidates, currentTeamRoster);
              if (selected) {
                console.log(`🤖 ${currentTeam}が${selected.name}（${selected.position}）を指名`);
                // チームロスターに追加
                setTeamRosters(prev => ({
                  ...prev,
                  [currentTeam]: [...(prev[currentTeam] || []), selected]
                }));
                setTryoutCandidates(tryoutCandidates.filter(c => c.id !== selected.id));
                setCurrentPick(currentPick + 1);
              }
            }, 500);
          }
        }, [currentPick, draftOrder, tryoutCandidates, teamRosters]);

        // ドラフト完了検出
        useEffect(() => {
          if (currentPick >= draftOrder.length && draftOrder.length > 0 && !draftComplete) {
            console.log(`✅ ドラフト完了: ${currentPick}/${draftOrder.length}`);
            console.log('📋 各チームのドラフト結果:', teamRosters);

            // TEAMS_DATAに選手を追加
            const teamsArrayForSave = Array.isArray(allTeams) ? allTeams : Object.keys(allTeams);
            Object.keys(teamRosters).forEach(teamName => {
              const draftedPlayers = teamRosters[teamName] || [];
              const actualTeamName = teamName === 'ユーザー' ? teamsArrayForSave[0] : teamName;

              if (TEAMS_DATA[actualTeamName]) {
                console.log(`👥 ${actualTeamName}に${draftedPlayers.length}人の選手を追加`);
                // 既存の選手と統合
                TEAMS_DATA[actualTeamName].players = [
                  ...(TEAMS_DATA[actualTeamName].players || []),
                  ...draftedPlayers
                ];
              }
            });

            // 全チームの投手ローテーションを再初期化
            console.log('⚾ 全チームの投手ローテーションを設定');
            initializeAllPitchingRotations();

            setDraftComplete(true);
            // 初期トライアウトの場合は自動的にキャンプへ進む
            if (isInitialTryout && onComplete) {
              console.log('🏕️ キャンプ画面へ移動');
              setTimeout(() => onComplete(), 1000);
            }
          }
        }, [currentPick, draftOrder.length, draftComplete, onComplete, isInitialTryout, teamRosters]);

        // フィルター＆ソート処理
        const filteredCandidates = tryoutCandidates
          .filter(player => {
            // ポジションタブフィルター
            if (positionTab !== 'all') {
              const category = getPositionCategory(player.position);
              if (category !== positionTab) return false;
            }
            return true;
          })
          .sort((a, b) => {
            // ランク順にソート（S→A→B→C→D）
            const rankOrder = { S: 5, A: 4, B: 3, C: 2, D: 1 };
            const rankA = calculatePlayerRank(a);
            const rankB = calculatePlayerRank(b);
            return rankOrder[rankB] - rankOrder[rankA];
          });

        const currentTeam = currentPick < draftOrder.length ? draftOrder[currentPick].team : null;
        const isUserTurn = currentTeam === 'ユーザー';

        const getRankColor = (rank) => ({
          S: 'text-pink-400',
          A: 'text-red-400',
          B: 'text-orange-400',
          C: 'text-yellow-400',
          D: 'text-gray-400'
        }[rank]);

        return (
          <div className="p-8 bg-green-900 min-h-screen">
            <div className="max-w-7xl mx-auto">
              <h1 className="text-3xl font-bold text-white mb-6">🎯 トライアウト</h1>

              {/* ドラフト状況 */}
              <div className="bg-gray-800 rounded-lg p-6 mb-6">
                <div className="grid grid-cols-3 gap-4 text-white">
                  <div>
                    <div className="text-sm text-gray-400">現在のピック</div>
                    <div className="text-2xl font-bold">{currentPick + 1} / {draftOrder.length}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">指名チーム</div>
                    <div className="text-2xl font-bold">{currentTeam || '終了'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">獲得選手数</div>
                    <div className="text-2xl font-bold">{userRoster.length} 人</div>
                  </div>
                </div>
                {isUserTurn && (
                  <div className="mt-4 text-green-400 font-bold">
                    ✅ あなたの指名順です。選手を選択してください。
                  </div>
                )}
                {!isUserTurn && currentTeam && (
                  <div className="mt-4 text-yellow-400 font-bold">
                    ⏳ {currentTeam} が選択中...
                  </div>
                )}
              </div>

              {/* タブ切り替え */}
              <div className="bg-gray-800 rounded-lg p-2 mb-4 flex gap-2">
                <button
                  onClick={() => setViewTab('draft')}
                  className={`flex-1 px-4 py-2 rounded font-bold transition ${
                    viewTab === 'draft'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  ドラフト
                </button>
                <button
                  onClick={() => setViewTab('details')}
                  className={`flex-1 px-4 py-2 rounded font-bold transition ${
                    viewTab === 'details'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  詳細
                </button>
              </div>

              {/* ドラフトタブ: 簡易編成表示 */}
              {viewTab === 'draft' && userRoster.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-bold">現在の編成 ({userRoster.length}/24人)</h3>
                  </div>
                  {(() => {
                    const positionCounts = {
                      pitcher: 0,
                      catcher: 0,
                      infielder: 0,
                      outfielder: 0
                    };

                    userRoster.forEach(player => {
                      const category = getPositionCategory(player.position);
                      if (category in positionCounts) {
                        positionCounts[category]++;
                      }
                    });

                    const getStatusIcon = (current, min, ideal) => {
                      if (current >= ideal) return '✅';
                      if (current >= min) return '🟡';
                      return '🔴';
                    };

                    return (
                      <div className="grid grid-cols-4 gap-2">
                        <div className="bg-gray-700 rounded p-2 text-center">
                          <div className="text-sm text-gray-400">投手</div>
                          <div className="text-white font-bold text-lg">
                            {getStatusIcon(positionCounts.pitcher, 5, 10)} {positionCounts.pitcher}/10
                          </div>
                        </div>
                        <div className="bg-gray-700 rounded p-2 text-center">
                          <div className="text-sm text-gray-400">捕手</div>
                          <div className="text-white font-bold text-lg">
                            {getStatusIcon(positionCounts.catcher, 1, 2)} {positionCounts.catcher}/2
                          </div>
                        </div>
                        <div className="bg-gray-700 rounded p-2 text-center">
                          <div className="text-sm text-gray-400">内野手</div>
                          <div className="text-white font-bold text-lg">
                            {getStatusIcon(positionCounts.infielder, 4, 6)} {positionCounts.infielder}/6
                          </div>
                        </div>
                        <div className="bg-gray-700 rounded p-2 text-center">
                          <div className="text-sm text-gray-400">外野手</div>
                          <div className="text-white font-bold text-lg">
                            {getStatusIcon(positionCounts.outfielder, 3, 6)} {positionCounts.outfielder}/6
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* 詳細タブ: 詳細編成表示 + 全チーム状況 */}
              {viewTab === 'details' && (
                <div className="space-y-4 mb-6">
                  {/* ユーザーチームの詳細 */}
                  {userRoster.length > 0 && (
                    <div className="bg-gradient-to-r from-blue-900 to-blue-800 rounded-lg p-6 border-2 border-blue-500">
                      <h2 className="text-2xl font-bold text-white mb-4">
                        👥 あなたのチーム ({userRoster.length}/24人)
                      </h2>

                      {/* 獲得選手リスト（ポジション別） */}
                      <div className="space-y-4">
                        {['pitcher', 'catcher', 'infielder', 'outfielder'].map(category => {
                          const categoryPlayers = userRoster.filter(p => getPositionCategory(p.position) === category);
                          if (categoryPlayers.length === 0) return null;

                          const categoryLabels = {
                            pitcher: '投手',
                            catcher: '捕手',
                            infielder: '内野手',
                            outfielder: '外野手'
                          };

                          return (
                            <div key={category}>
                              <h3 className="text-white font-bold mb-2 text-sm border-b border-blue-700 pb-1">
                                {categoryLabels[category]} ({categoryPlayers.length}人)
                              </h3>
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {categoryPlayers.map(player => (
                                  <div key={player.id} className="bg-gray-700 rounded p-2 text-white text-sm">
                                    <div className="font-bold">{player.name}</div>
                                    <div className="text-xs text-gray-400">
                                      {getPositionName(player.position)} | {player.age}歳
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 全チームのドラフト状況 */}
                  <div className="bg-gray-800 rounded-lg p-6">
                    <h2 className="text-2xl font-bold text-white mb-4">🏆 各チームのドラフト状況</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.keys(teamRosters).map(teamName => {
                        const roster = teamRosters[teamName] || [];
                        if (roster.length === 0) return null;

                        return (
                          <div key={teamName} className="bg-gray-700 rounded-lg p-4">
                            <h3 className="text-white font-bold mb-2 flex items-center justify-between">
                              <span>{teamName === 'ユーザー' ? 'あなたのチーム' : teamName}</span>
                              <span className="text-sm text-gray-400">{roster.length}人</span>
                            </h3>
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              {roster.map(player => (
                                <div key={player.id} className="text-sm text-gray-300 flex justify-between">
                                  <span>{player.name}</span>
                                  <span className="text-gray-500">{getPositionName(player.position)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ドラフトタブのみ: ポジションタブと候補者リスト */}
              {viewTab === 'draft' && (
                <>
                  {/* ポジションタブ */}
                  <div className="bg-gray-800 rounded-lg p-4 mb-4">
                    <div className="flex gap-2">
                      {[
                        { key: 'all', label: '全選手' },
                        { key: 'pitcher', label: '投手' },
                        { key: 'catcher', label: '捕手' },
                        { key: 'infielder', label: '内野手' },
                        { key: 'outfielder', label: '外野手' }
                      ].map(tab => (
                        <button
                          key={tab.key}
                          onClick={() => setPositionTab(tab.key)}
                          className={`px-4 py-2 rounded font-bold transition ${
                            positionTab === tab.key
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 候補者数表示 */}
                  <div className="bg-gray-800 rounded-lg p-4 mb-6 flex gap-4">
                    <div className="text-white ml-auto self-center">
                      候補者: {filteredCandidates.length} 人
                    </div>
                  </div>

                  {/* 候補者リスト（4グリッド） */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {filteredCandidates.map(player => {
                  const overallRank = calculatePlayerRank(player);
                  const isPitcher = player.position === 'pitcher';

                  return (
                    <div
                      key={player.id}
                      className={`bg-gray-800 rounded-lg p-4 ${isUserTurn ? 'cursor-pointer hover:bg-gray-700' : 'opacity-60'} transition`}
                      onClick={() => isUserTurn && handleSelectPlayer(player)}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="text-white font-bold text-lg">{player.name}</div>
                          <div className="text-sm text-gray-400">{player.age}歳 | {getPositionName(player.position)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-gray-400">総合</div>
                          <div className={`text-2xl font-bold ${getRankColor(overallRank)}`}>{overallRank}</div>
                        </div>
                      </div>

                      {isPitcher ? (
                        // 投手表示
                        <div className="text-sm space-y-1">
                          <div className="text-gray-300">
                            {player.physical.throws === 'left' ? '左投げ' : '右投げ'} | {
                              player.pitching.form === 'overhand' ? 'オーバー' :
                              player.pitching.form === 'threeQuarter' ? 'スリークォーター' :
                              player.pitching.form === 'sidearm' ? 'サイド' : 'アンダー'
                            }
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <span className={getRankColor(getAbilityRank(player.pitching.velocity, true))}>
                              球速{getAbilityRank(player.pitching.velocity, true)}
                            </span>
                            <span className={getRankColor(getAbilityRank(player.pitching.control))}>
                              制球{getAbilityRank(player.pitching.control)}
                            </span>
                            <span className={getRankColor(getAbilityRank(player.pitching.stamina, false, true))}>
                              スタミナ{getAbilityRank(player.pitching.stamina, false, true)}
                            </span>
                          </div>
                        </div>
                      ) : (
                        // 野手表示
                        <div className="text-sm space-y-1">
                          <div className="text-gray-300">
                            {player.batting.bats === 'left' ? '左打ち' : player.batting.bats === 'switch' ? 'スイッチ' : '右打ち'}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <span className={getRankColor(getAbilityRank(player.batting.meet))}>
                              ミート{getAbilityRank(player.batting.meet)}
                            </span>
                            <span className={getRankColor(getAbilityRank(player.batting.power))}>
                              パワー{getAbilityRank(player.batting.power)}
                            </span>
                            <span className={getRankColor(getAbilityRank(player.physical.speed))}>
                              走力{getAbilityRank(player.physical.speed)}
                            </span>
                            <span className={getRankColor(getAbilityRank(player.physical.arm))}>
                              肩{getAbilityRank(player.physical.arm)}
                            </span>
                            <span className={getRankColor(getAbilityRank(player.fielding.defense))}>
                              守備{getAbilityRank(player.fielding.defense)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                  </div>
                </>
              )}

              {/* 24人超過警告（ドラフト完了後に表示） */}
              {userRoster.length > 24 && draftComplete && (
                <div className="mt-8 bg-red-900 border-2 border-red-700 rounded-lg p-6">
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">⚠️</span>
                    <div>
                      <div className="text-red-200 font-bold text-xl mb-1">
                        ロスター人数が24人を超えています！
                      </div>
                      <div className="text-red-300">
                        ロスター管理画面で{userRoster.length - 24}人を解雇してください
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      };

      const EditScreen = ({ generateOptimalLineup, generatePitchingRotation, generateAllTeamsLineup, allTeams }) => {
  const [editingTeam, setEditingTeam] = useState(allTeams[0] || 'チームA');
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editFormData, setEditFormData] = useState(null);

  // TEAMS_DATAからチーム情報を取得
  const getTeamData = (teamName) => {
    if (TEAMS_DATA && TEAMS_DATA[teamName]) {
      return TEAMS_DATA[teamName];
    }
    return { name: teamName, players: [] };
  };

  const team = getTeamData(editingTeam);
  // 動的にチームカラーを生成
  const teamColorList = ['bg-blue-600', 'bg-red-600', 'bg-green-600', 'bg-yellow-600', 'bg-purple-600', 'bg-pink-600', 'bg-indigo-600', 'bg-teal-600', 'bg-orange-600', 'bg-cyan-600', 'bg-lime-600', 'bg-amber-600'];
  const teamColors = {};
  allTeams.forEach((name, idx) => {
    teamColors[name] = teamColorList[idx % teamColorList.length];
  });

  // 選手編集を開始
  const startEditPlayer = (player) => {
    console.log('選手編集を開始:', player.name);
    setEditingPlayer(player);
    setEditFormData(JSON.parse(JSON.stringify(player)));
  };

  // 編集をキャンセル
  const cancelEdit = () => {
    setEditingPlayer(null);
    setEditFormData(null);
  };

  // 能力値を更新
  const updateAbility = (category, field, value) => {
    const numValue = Math.max(0, Math.min(100, parseInt(value) || 0));
    setEditFormData(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: numValue
      }
    }));
  };

  // 投球フォームを更新
  const updatePitchingForm = (value) => {
    setEditFormData(prev => ({
      ...prev,
      pitching: {
        ...prev.pitching,
        form: value
      }
    }));
  };

  // 利き手を更新
  const updateHand = (category, value) => {
    if (category === 'batting') {
      setEditFormData(prev => ({
        ...prev,
        batting: { ...prev.batting, bats: value }
      }));
    } else if (category === 'physical') {
      setEditFormData(prev => ({
        ...prev,
        physical: { ...prev.physical, throws: value }
      }));
    }
  };

  // 変更を保存
  const savePlayerEdit = () => {
    if (!editFormData || !editingPlayer) {
      console.error('編集データが見つかりません');
      return;
    }

    console.log('保存中:', editFormData.name, editFormData);

    // TEAMS_DATAを更新
    const playerIndex = TEAMS_DATA[editingTeam].players.findIndex(p => p.id === editingPlayer.id);
    if (playerIndex !== -1) {
      TEAMS_DATA[editingTeam].players[playerIndex] = editFormData;
      console.log(`✅ ${editFormData.name}の能力値を更新しました (インデックス: ${playerIndex})`);
      console.log('更新後のデータ:', TEAMS_DATA[editingTeam].players[playerIndex]);

      // 画面を更新するため、state を変更
      cancelEdit();

      // 強制的に再レンダリングをトリガー
      alert(`${editFormData.name}の能力値を保存しました！\n\n変更内容はTEAMS_DATAに反映されています。`);
    } else {
      console.error('選手が見つかりません:', editingPlayer.id);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6 text-white">エディット画面（開発用）</h1>

      {/* チーム選択 */}
      <div className="mb-6 flex gap-4 flex-wrap">
        {allTeams.map((teamName) => (
          <button
            key={teamName}
            onClick={() => setEditingTeam(teamName)}
            className={`px-6 py-3 rounded font-bold transition ${
              editingTeam === teamName
                ? `${teamColors[teamName]} text-white`
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {teamName}
          </button>
        ))}
      </div>

      {/* チーム情報 */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-white">チーム情報</h2>
        <div className="text-white">
          <div className="mb-2">チーム名: <span className="font-bold">{team.name}</span></div>
          <div className="text-sm text-gray-400">選手数: {team.players.length}人</div>
        </div>

        {/* AIオーダー編成ボタン */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => {
              generateOptimalLineup(editingTeam);
              generatePitchingRotation(editingTeam);
              alert(`${editingTeam}のAIオーダー編成と投手ローテーションを設定しました！\n\nページをリロードすると反映されます。`);
            }}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded font-bold transition"
          >
            🤖 AIオーダー編成
          </button>
          <button
            onClick={() => {
              generateAllTeamsLineup();
            }}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-bold transition"
          >
            🤖 全チーム一括編成
          </button>
        </div>
      </div>

      {/* 選手一覧 */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4 text-white">選手一覧（{team.players.length}人）</h2>
        <div className="text-sm text-blue-400 mb-4">💡 選手カードをクリックして能力値を編集できます</div>

        {team.players.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            選手データがありません。ページをリロードしてください。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {team.players.map((player) => (
              <div
                key={player.id}
                className="bg-gray-700 rounded p-4 cursor-pointer hover:bg-gray-600 transition"
                onClick={() => startEditPlayer(player)}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-white">{player.name}</span>
                  <span className="text-xs text-gray-400">#{player.number || player.id}</span>
                </div>
                <div className="text-sm text-gray-300">
                  <div>ポジション: {POSITION_NAMES[player.position] || player.position}</div>
                  <div>打: {player.batting?.meet || 0} / 力: {player.batting?.power || 0}</div>
                  {player.pitching && <div>球速: {player.pitching.velocity}km/h</div>}
                </div>
                <div className="text-xs text-blue-400 mt-2">クリックして編集</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 選手編集モーダル */}
      {editingPlayer && editFormData && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-white">{editFormData.name} の能力値編集</h2>
              <button
                onClick={cancelEdit}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 打撃能力 */}
              <div className="bg-gray-700 rounded p-4">
                <h3 className="text-lg font-bold text-white mb-4">打撃能力</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">ミート (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.batting?.meet || 0}
                      onChange={(e) => updateAbility('batting', 'meet', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">パワー (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.batting?.power || 0}
                      onChange={(e) => updateAbility('batting', 'power', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">選球眼 (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.batting?.eye || 0}
                      onChange={(e) => updateAbility('batting', 'eye', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">打席</label>
                    <select
                      value={editFormData.batting?.bats || 'right'}
                      onChange={(e) => updateHand('batting', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    >
                      <option value="right">右打ち</option>
                      <option value="left">左打ち</option>
                      <option value="switch">スイッチ</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">盗塁 (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.batting?.steal || 0}
                      onChange={(e) => updateAbility('batting', 'steal', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                </div>
              </div>

              {/* 身体能力 */}
              <div className="bg-gray-700 rounded p-4">
                <h3 className="text-lg font-bold text-white mb-4">身体能力</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">走力 (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.physical?.speed || 0}
                      onChange={(e) => updateAbility('physical', 'speed', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">肩力 (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.physical?.arm || 0}
                      onChange={(e) => updateAbility('physical', 'arm', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">投げ手</label>
                    <select
                      value={editFormData.physical?.throws || 'right'}
                      onChange={(e) => updateHand('physical', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    >
                      <option value="right">右投げ</option>
                      <option value="left">左投げ</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 守備能力 */}
              <div className="bg-gray-700 rounded p-4">
                <h3 className="text-lg font-bold text-white mb-4">守備能力</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">守備力 (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.fielding?.defense || 0}
                      onChange={(e) => updateAbility('fielding', 'defense', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                </div>
              </div>

              {/* 守備位置適正 */}
              <div className="bg-gray-700 rounded p-4 md:col-span-2">
                <h3 className="text-lg font-bold text-white mb-4">守備位置適正 (0-100)</h3>
                <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                  {[
                    { key: 'pitcher', label: '投手' },
                    { key: 'catcher', label: '捕手' },
                    { key: 'first', label: '一塁' },
                    { key: 'second', label: '二塁' },
                    { key: 'third', label: '三塁' },
                    { key: 'short', label: '遊撃' },
                    { key: 'left', label: '左翼' },
                    { key: 'center', label: '中堅' },
                    { key: 'right', label: '右翼' }
                  ].map(pos => (
                    <div key={pos.key}>
                      <label className="block text-xs text-gray-300 mb-1">{pos.label}</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={editFormData.positionFitness?.[pos.key] || 0}
                        onChange={(e) => {
                          const numValue = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                          setEditFormData(prev => ({
                            ...prev,
                            positionFitness: {
                              ...prev.positionFitness,
                              [pos.key]: numValue
                            }
                          }));
                        }}
                        className="w-full bg-gray-600 text-white px-2 py-1 rounded text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* 捕手能力 */}
              <div className="bg-gray-700 rounded p-4">
                <h3 className="text-lg font-bold text-white mb-4">捕手能力</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">リード (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.catching?.lead || 0}
                      onChange={(e) => updateAbility('catching', 'lead', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                </div>
              </div>

              {/* 投手能力 */}
              <div className="bg-gray-700 rounded p-4 md:col-span-2">
                <h3 className="text-lg font-bold text-white mb-4">投手能力</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">球速 (km/h)</label>
                    <input
                      type="number"
                      min="80"
                      max="170"
                      value={editFormData.pitching?.velocity || 0}
                      onChange={(e) => {
                        const numValue = Math.max(80, Math.min(170, parseInt(e.target.value) || 0));
                        setEditFormData(prev => ({
                          ...prev,
                          pitching: { ...prev.pitching, velocity: numValue }
                        }));
                      }}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">制球力 (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editFormData.pitching?.control || 0}
                      onChange={(e) => updateAbility('pitching', 'control', e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">スタミナ (0-200)</label>
                    <input
                      type="number"
                      min="0"
                      max="200"
                      value={editFormData.pitching?.stamina || 0}
                      onChange={(e) => {
                        const numValue = Math.max(0, Math.min(200, parseInt(e.target.value) || 0));
                        setEditFormData(prev => ({
                          ...prev,
                          pitching: { ...prev.pitching, stamina: numValue }
                        }));
                      }}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">投球フォーム</label>
                    <select
                      value={editFormData.pitching?.form || 'threeQuarter'}
                      onChange={(e) => updatePitchingForm(e.target.value)}
                      className="w-full bg-gray-600 text-white px-3 py-2 rounded"
                    >
                      <option value="overhand">オーバースロー</option>
                      <option value="threeQuarter">スリークォーター</option>
                      <option value="sidearm">サイドスロー</option>
                      <option value="submarine">アンダースロー</option>
                    </select>
                  </div>
                </div>

                {/* 変化球 */}
                <h4 className="text-md font-bold text-white mb-3 mt-4">変化球</h4>
                <div className="space-y-3">
                  {[1, 2, 3].map((num) => {
                    const ballKey = `breaking${num}`;
                    const ballData = editFormData.pitching?.[ballKey] || { type: 'slider', level: 0 };
                    return (
                      <div key={num} className="grid grid-cols-2 gap-3 bg-gray-600 p-3 rounded">
                        <div>
                          <label className="block text-xs text-gray-300 mb-1">変化球{num} タイプ</label>
                          <select
                            value={ballData.type || 'slider'}
                            onChange={(e) => {
                              setEditFormData(prev => ({
                                ...prev,
                                pitching: {
                                  ...prev.pitching,
                                  [ballKey]: { ...ballData, type: e.target.value }
                                }
                              }));
                            }}
                            className="w-full bg-gray-700 text-white px-2 py-1 rounded text-sm"
                          >
                            <option value="slider">スライダー</option>
                            <option value="curve">カーブ</option>
                            <option value="fork">フォーク</option>
                            <option value="sinker">シンカー</option>
                            <option value="cutter">カッター</option>
                            <option value="changeup">チェンジアップ</option>
                            <option value="shoot">シュート</option>
                            <option value="slurve">スラーブ</option>
                            <option value="screwball">スクリューボール</option>
                            <option value="sweeper">スイーパー</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-300 mb-1">変化量 (0-100)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={ballData.level || 0}
                            onChange={(e) => {
                              const numValue = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                              setEditFormData(prev => ({
                                ...prev,
                                pitching: {
                                  ...prev.pitching,
                                  [ballKey]: { ...ballData, level: numValue }
                                }
                              }));
                            }}
                            className="w-full bg-gray-700 text-white px-2 py-1 rounded text-sm"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 保存・キャンセルボタン */}
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={cancelEdit}
                className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition"
              >
                キャンセル
              </button>
              <button
                onClick={savePlayerEdit}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
      const PlayerStatsScreen = ({ seasonData, allTeams }) => {
  const [statsTab, setStatsTab] = useState('season'); // 'season' or 'career'
  const [statsType, setStatsType] = useState('batting'); // 'batting' or 'pitching'
  const [battingSortKey, setBattingSortKey] = useState('avg'); // ソートキー
  const [battingSortDir, setBattingSortDir] = useState('desc'); // 'asc' or 'desc'
  const [pitchingSortKey, setPitchingSortKey] = useState('era');
  const [pitchingSortDir, setPitchingSortDir] = useState('asc');

  // 全選手のシーズン成績を取得
  const getAllPlayerStats = () => {
    const allPlayers = [];
    Object.keys(TEAMS_DATA || {}).forEach(teamName => {
      const team = TEAMS_DATA[teamName];
      team.players.forEach(player => {
        allPlayers.push({
          ...player,
          teamName: team.name
        });
      });
    });
    return allPlayers;
  };

  const allPlayers = getAllPlayerStats();

  // ソート切り替えハンドラ
  const handleBattingSort = (key) => {
    if (battingSortKey === key) {
      setBattingSortDir(battingSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setBattingSortKey(key);
      // 打率・安打・本塁打・打点・盗塁はdesc、三振はasc
      setBattingSortDir(['strikeouts'].includes(key) ? 'asc' : 'desc');
    }
  };

  const handlePitchingSort = (key) => {
    if (pitchingSortKey === key) {
      setPitchingSortDir(pitchingSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setPitchingSortKey(key);
      // 防御率・失点・与四球はasc、勝利・セーブ・ホールド・奪三振はdesc
      setPitchingSortDir(['era', 'runsAllowed', 'walks'].includes(key) ? 'asc' : 'desc');
    }
  };

  // 打撃成績でソート
  const battingStats = allPlayers
    .filter(p => {
      const stats = statsTab === 'season' ? p.seasonStats?.batting : p.careerStats?.batting;
      return stats && stats.atBats > 0;
    })
    .map(p => {
      const stats = statsTab === 'season' ? p.seasonStats.batting : p.careerStats.batting;
      const avg = stats.atBats > 0 ? (stats.hits / stats.atBats) : 0;
      return { ...p, stats, avg };
    })
    .sort((a, b) => {
      let valA, valB;
      if (battingSortKey === 'avg') {
        valA = a.avg; valB = b.avg;
      } else {
        valA = a.stats[battingSortKey] || 0;
        valB = b.stats[battingSortKey] || 0;
      }
      return battingSortDir === 'asc' ? valA - valB : valB - valA;
    })
    .slice(0, 20);

  // 投手成績でソート
  const pitchingStats = allPlayers
    .filter(p => {
      const stats = statsTab === 'season' ? p.seasonStats?.pitching : p.careerStats?.pitching;
      return stats && stats.inningsPitched > 0;
    })
    .map(p => {
      const stats = statsTab === 'season' ? p.seasonStats.pitching : p.careerStats.pitching;
      const era = stats.inningsPitched > 0
        ? (stats.earnedRuns * 27) / stats.inningsPitched
        : 0;
      const ip = formatInnings(stats.inningsPitched);
      return { ...p, stats, era, ip };
    })
    .sort((a, b) => {
      let valA, valB;
      if (pitchingSortKey === 'era') {
        valA = a.era; valB = b.era;
      } else if (pitchingSortKey === 'inningsPitched') {
        valA = a.stats.inningsPitched || 0; valB = b.stats.inningsPitched || 0;
      } else {
        valA = a.stats[pitchingSortKey] || 0;
        valB = b.stats[pitchingSortKey] || 0;
      }
      return pitchingSortDir === 'asc' ? valA - valB : valB - valA;
    })
    .slice(0, 20);

  // ソート可能なヘッダーコンポーネント
  const SortableHeader = ({ label, sortKey, currentKey, currentDir, onClick, align = 'right' }) => (
    <th
      className={`py-2 px-3 text-${align} cursor-pointer hover:bg-gray-600 transition ${currentKey === sortKey ? 'text-yellow-400' : ''}`}
      onClick={() => onClick(sortKey)}
    >
      {label} {currentKey === sortKey && (currentDir === 'asc' ? '▲' : '▼')}
    </th>
  );

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6 text-white">選手成績</h1>

      {/* タブ選択 */}
      <div className="mb-6 flex gap-4">
        <button
          onClick={() => setStatsTab('season')}
          className={`px-6 py-3 rounded font-bold transition ${
            statsTab === 'season' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          シーズン成績
        </button>
        <button
          onClick={() => setStatsTab('career')}
          className={`px-6 py-3 rounded font-bold transition ${
            statsTab === 'career' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          通算成績
        </button>
      </div>

      {/* 成績タイプ選択 */}
      <div className="mb-6 flex gap-4">
        <button
          onClick={() => setStatsType('batting')}
          className={`px-6 py-3 rounded font-bold transition ${
            statsType === 'batting' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          野手成績
        </button>
        <button
          onClick={() => setStatsType('pitching')}
          className={`px-6 py-3 rounded font-bold transition ${
            statsType === 'pitching' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          投手成績
        </button>
      </div>

      {/* 野手成績テーブル */}
      {statsType === 'batting' && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-white">
            {statsTab === 'season' ? 'シーズン' : '通算'}野手成績 (上位20名)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-white text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="py-2 px-3 text-left">#</th>
                  <th className="py-2 px-3 text-left">選手名</th>
                  <th className="py-2 px-3 text-left">チーム</th>
                  <SortableHeader label="試合" sortKey="games" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="打席" sortKey="atBats" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="安打" sortKey="hits" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="本塁打" sortKey="homeruns" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="打点" sortKey="rbis" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="盗塁" sortKey="stolenBases" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="四球" sortKey="walks" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="三振" sortKey="strikeouts" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                  <SortableHeader label="打率" sortKey="avg" currentKey={battingSortKey} currentDir={battingSortDir} onClick={handleBattingSort} />
                </tr>
              </thead>
              <tbody>
                {battingStats.map((player, index) => (
                  <tr key={player.id + player.teamName} className="border-b border-gray-700 hover:bg-gray-700">
                    <td className="py-2 px-3">{index + 1}</td>
                    <td className="py-2 px-3 font-bold">{player.name}</td>
                    <td className="py-2 px-3">{player.teamName}</td>
                    <td className="py-2 px-3 text-right">{player.stats.games}</td>
                    <td className="py-2 px-3 text-right">{player.stats.atBats}</td>
                    <td className="py-2 px-3 text-right">{player.stats.hits}</td>
                    <td className="py-2 px-3 text-right">{player.stats.homeruns}</td>
                    <td className="py-2 px-3 text-right">{player.stats.rbis}</td>
                    <td className="py-2 px-3 text-right">{player.stats.stolenBases || 0}</td>
                    <td className="py-2 px-3 text-right">{player.stats.walks}</td>
                    <td className="py-2 px-3 text-right">{player.stats.strikeouts}</td>
                    <td className="py-2 px-3 text-right font-bold text-yellow-400">{player.avg.toFixed(3)}</td>
                  </tr>
                ))}
                {battingStats.length === 0 && (
                  <tr>
                    <td colSpan="12" className="py-8 text-center text-gray-500">
                      まだ野手成績がありません。試合を進行してください。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 投手成績テーブル */}
      {statsType === 'pitching' && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-white">
            {statsTab === 'season' ? 'シーズン' : '通算'}投手成績 (上位20名)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-white text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="py-2 px-3 text-left">#</th>
                  <th className="py-2 px-3 text-left">選手名</th>
                  <th className="py-2 px-3 text-left">チーム</th>
                  <SortableHeader label="試合" sortKey="games" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="勝" sortKey="wins" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="敗" sortKey="losses" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="H" sortKey="holds" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="S" sortKey="saves" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="回数" sortKey="inningsPitched" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="失点" sortKey="runsAllowed" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="奪三振" sortKey="strikeouts" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="与四球" sortKey="walks" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                  <SortableHeader label="防御率" sortKey="era" currentKey={pitchingSortKey} currentDir={pitchingSortDir} onClick={handlePitchingSort} />
                </tr>
              </thead>
              <tbody>
                {pitchingStats.map((player, index) => (
                  <tr key={player.id + player.teamName} className="border-b border-gray-700 hover:bg-gray-700">
                    <td className="py-2 px-3">{index + 1}</td>
                    <td className="py-2 px-3 font-bold">{player.name}</td>
                    <td className="py-2 px-3">{player.teamName}</td>
                    <td className="py-2 px-3 text-right">{player.stats.games}</td>
                    <td className="py-2 px-3 text-right">{player.stats.wins}</td>
                    <td className="py-2 px-3 text-right">{player.stats.losses}</td>
                    <td className="py-2 px-3 text-right">{player.stats.holds || 0}</td>
                    <td className="py-2 px-3 text-right">{player.stats.saves || 0}</td>
                    <td className="py-2 px-3 text-right">{player.ip}</td>
                    <td className="py-2 px-3 text-right">{player.stats.runsAllowed}</td>
                    <td className="py-2 px-3 text-right">{player.stats.strikeouts}</td>
                    <td className="py-2 px-3 text-right">{player.stats.walks}</td>
                    <td className="py-2 px-3 text-right font-bold text-yellow-400">{player.era.toFixed(2)}</td>
                  </tr>
                ))}
                {pitchingStats.length === 0 && (
                  <tr>
                    <td colSpan="13" className="py-8 text-center text-gray-500">
                      まだ投手成績がありません。試合を進行してください。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// 日程進行画面コンポーネント
      const ScheduleScreen = ({ seasonData, setSeasonData, allTeams, selectedMonth, setSelectedMonth }) => {
  // 全選手の成績を取得してランキング形式に変換
  const getAllPlayersStats = () => {
    const allPlayers = [];
    Object.keys(TEAMS_DATA || {}).forEach(teamName => {
      const team = TEAMS_DATA[teamName];
      team.players.forEach(player => {
        allPlayers.push({ ...player, teamName: team.name });
      });
    });
    return allPlayers;
  };

  // 打率ランキング
  const getBattingAverageRanking = () => {
    const players = getAllPlayersStats()
      .filter(p => p.seasonStats?.batting?.atBats > 0)
      .map(p => {
        const stats = p.seasonStats.batting;
        const avg = stats.hits / stats.atBats;
        return {
          rank: 0,
          name: p.name,
          team: p.teamName,
          value: avg.toFixed(3),
          sortValue: avg
        };
      })
      .sort((a, b) => b.sortValue - a.sortValue)
      .slice(0, 10);

    players.forEach((p, i) => p.rank = i + 1);
    return players;
  };

  // 本塁打ランキング
  const getHomeRunRanking = () => {
    const players = getAllPlayersStats()
      .filter(p => p.seasonStats?.batting?.homeruns > 0)
      .map(p => ({
        rank: 0,
        name: p.name,
        team: p.teamName,
        value: p.seasonStats.batting.homeruns,
        sortValue: p.seasonStats.batting.homeruns
      }))
      .sort((a, b) => b.sortValue - a.sortValue)
      .slice(0, 10);

    players.forEach((p, i) => p.rank = i + 1);
    return players;
  };

  // 打点ランキング
  const getRBIRanking = () => {
    const players = getAllPlayersStats()
      .filter(p => p.seasonStats?.batting?.rbis > 0)
      .map(p => ({
        rank: 0,
        name: p.name,
        team: p.teamName,
        value: p.seasonStats.batting.rbis,
        sortValue: p.seasonStats.batting.rbis
      }))
      .sort((a, b) => b.sortValue - a.sortValue)
      .slice(0, 10);

    players.forEach((p, i) => p.rank = i + 1);
    return players;
  };

  // 盗塁ランキング
  const getStolenBaseRanking = () => {
    const players = getAllPlayersStats()
      .filter(p => p.seasonStats?.batting?.stolenBases > 0)
      .map(p => ({
        rank: 0,
        name: p.name,
        team: p.teamName,
        value: p.seasonStats.batting.stolenBases,
        sortValue: p.seasonStats.batting.stolenBases
      }))
      .sort((a, b) => b.sortValue - a.sortValue)
      .slice(0, 10);

    players.forEach((p, i) => p.rank = i + 1);
    return players;
  };

  // 防御率ランキング
  const getERARanking = () => {
    const players = getAllPlayersStats()
      .filter(p => p.seasonStats?.pitching?.inningsPitched > 0)
      .map(p => {
        const stats = p.seasonStats.pitching;
        const era = (stats.earnedRuns * 27) / stats.inningsPitched;
        return {
          rank: 0,
          name: p.name,
          team: p.teamName,
          value: era.toFixed(2),
          sortValue: era
        };
      })
      .sort((a, b) => a.sortValue - b.sortValue)
      .slice(0, 10);

    players.forEach((p, i) => p.rank = i + 1);
    return players;
  };

  // 勝利数ランキング
  const getWinsRanking = () => {
    const players = getAllPlayersStats()
      .filter(p => p.seasonStats?.pitching?.wins > 0)
      .map(p => ({
        rank: 0,
        name: p.name,
        team: p.teamName,
        value: p.seasonStats.pitching.wins,
        sortValue: p.seasonStats.pitching.wins
      }))
      .sort((a, b) => b.sortValue - a.sortValue)
      .slice(0, 10);

    players.forEach((p, i) => p.rank = i + 1);
    return players;
  };

  // ホールドランキング
  const getHoldsRanking = () => {
    const players = getAllPlayersStats()
      .filter(p => p.seasonStats?.pitching?.holds > 0)
      .map(p => ({
        rank: 0,
        name: p.name,
        team: p.teamName,
        value: p.seasonStats.pitching.holds,
        sortValue: p.seasonStats.pitching.holds
      }))
      .sort((a, b) => b.sortValue - a.sortValue)
      .slice(0, 10);

    players.forEach((p, i) => p.rank = i + 1);
    return players;
  };

  // セーブランキング
  const getSavesRanking = () => {
    const players = getAllPlayersStats()
      .filter(p => p.seasonStats?.pitching?.saves > 0)
      .map(p => ({
        rank: 0,
        name: p.name,
        team: p.teamName,
        value: p.seasonStats.pitching.saves,
        sortValue: p.seasonStats.pitching.saves
      }))
      .sort((a, b) => b.sortValue - a.sortValue)
      .slice(0, 10);

    players.forEach((p, i) => p.rank = i + 1);
    return players;
  };

  // ランキング表示用コンポーネント
  const RankingTable = ({ title, data, valueLabel }) => (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-lg font-bold mb-3 text-white">{title}</h3>
      <table className="w-full text-white text-sm">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-left py-1 w-12">順位</th>
            <th className="text-left py-1">選手名</th>
            <th className="text-left py-1 w-20">チーム</th>
            <th className="text-right py-1 w-16">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.length > 0 ? (
            data.map((player, index) => (
              <tr key={index} className="border-b border-gray-700">
                <td className="py-1">{player.rank}</td>
                <td className="py-1">{player.name}</td>
                <td className="py-1 text-xs">{player.team}</td>
                <td className="text-right py-1">{player.value}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4" className="py-4 text-center text-gray-500">データなし</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  // 日付進行ハンドラー
  const handleProgressDate = (days) => {
    if (!seasonData) return;
    let newSeasonData = progressDate(seasonData, days);

    // 新しい日付の試合を自動シミュレーション
    newSeasonData = simulateGamesOnDate(newSeasonData);

    setSeasonData(newSeasonData);
  };

  const handleProgressToNextGame = () => {
    if (!seasonData) return;
    let newSeasonData = progressToNextGame(seasonData, userTeamName);

    // 試合日まで進んだら、その日の試合を自動シミュレーション
    newSeasonData = simulateGamesOnDate(newSeasonData);

    setSeasonData(newSeasonData);
  };

  const handleProgressToNextPhase = () => {
    if (!seasonData) return;
    let newSeasonData = progressToNextPhase(seasonData);

    // フェーズ遷移時に途中の全試合を自動シミュレーション
    newSeasonData = simulateAllRemainingGames(newSeasonData);

    setSeasonData(newSeasonData);
  };

  // 指定日の試合を自動シミュレーション
  const simulateGamesOnDate = (seasonData) => {
    const currentDate = seasonData.currentDate;
    const todayGames = getScheduleByDate(seasonData.schedule, currentDate);

    if (todayGames.length === 0) return seasonData;

    let updatedSeasonData = { ...seasonData };

    todayGames.forEach(game => {
      // 既に結果がある場合はスキップ
      if (game.result) return;

      // チームデータの存在確認
      const homeTeam = TEAMS_DATA?.[game.home];
      const awayTeam = TEAMS_DATA?.[game.away];

      if (!homeTeam || !awayTeam) return;

      // 試合をシミュレーション（チーム名を渡す）
      const gameResult = autoSimulateGame?.(game.home, game.away);

      if (gameResult) {
        // 試合結果を記録
        const result = {
          date: currentDate,
          home: game.home,
          away: game.away,
          homeScore: gameResult.homeScore,
          awayScore: gameResult.awayScore
        };

        updatedSeasonData = recordGameResult(updatedSeasonData, result);
      }
    });

    return updatedSeasonData;
  };

  // フェーズ内の全未消化試合を自動シミュレーション
  const simulateAllRemainingGames = (seasonData) => {
    let updatedSeasonData = { ...seasonData };
    const currentPhase = seasonData.phase;

    // 現在フェーズの全試合を取得
    const phaseGames = seasonData.schedule.filter(game => {
      // フェーズが一致し、まだ結果がない試合
      const gamePhase = getCurrentPhase(game.date.month, game.date.day);
      return gamePhase === currentPhase && !game.result;
    });

    phaseGames.forEach(game => {
      const homeTeam = TEAMS_DATA?.[game.home];
      const awayTeam = TEAMS_DATA?.[game.away];

      if (!homeTeam || !awayTeam) return;

      // 試合をシミュレーション（チーム名を渡す）
      const gameResult = autoSimulateGame?.(game.home, game.away);

      if (gameResult) {
        const result = {
          date: game.date,
          home: game.home,
          away: game.away,
          homeScore: gameResult.homeScore,
          awayScore: gameResult.awayScore
        };

        updatedSeasonData = recordGameResult(updatedSeasonData, result);
      }
    });

    return updatedSeasonData;
  };

  // 当月のカレンダーデータを生成
  const calendarData = seasonData && selectedMonth
    ? generateTeamCalendar(seasonData.schedule, userTeamName, currentDate.year, selectedMonth)
    : [];

  // 当日の試合を取得
  const todayGames = seasonData
    ? getScheduleByDate(seasonData.schedule, currentDate)
    : [];

  // フェーズ情報を取得
  const phaseInfo = currentPhase && PHASE_INFO[currentPhase]
    ? PHASE_INFO[currentPhase]
    : { name: '', color: 'bg-gray-100', description: '' };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* ヘッダー */}
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-white">{seasonYear}年目</h1>
          <div className="mt-2 flex items-center gap-3">
            <div className="text-lg text-gray-300">
              {currentDate.year}年{currentDate.month}月{currentDate.day}日
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${phaseInfo.color} text-gray-800`}>
              {phaseInfo.name}
            </span>
          </div>
        </div>
      </div>

      {/* 日付進行ボタン */}
      <div className="mb-4 flex gap-2 items-center">
        <button
          onClick={() => handleProgressDate(1)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-bold transition text-sm"
        >
          ➡️ 1日進める
        </button>
        <button
          onClick={handleProgressToNextGame}
          className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg font-bold transition text-sm"
        >
          ⏩ 次の試合日
        </button>
        <button
          onClick={handleProgressToNextPhase}
          className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg font-bold transition text-sm"
        >
          🔄 次フェーズ
        </button>
        <button
          onClick={() => setScreenMode('game')}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold transition text-sm ml-auto"
        >
          🎮 試合開始
        </button>
      </div>

      {/* カレンダー月選択 */}
      <div className="mb-4 flex gap-2">
        {[3, 4, 5, 6, 7, 8, 9].map(month => (
          <button
            key={month}
            onClick={() => setSelectedMonth(month)}
            className={`px-4 py-2 rounded font-bold transition ${
              selectedMonth === month
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {month}月
          </button>
        ))}
      </div>

      {/* カレンダー */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <h2 className="text-xl font-bold mb-3 text-white">{selectedMonth}月の試合日程（{userTeamName}）</h2>
        <div className="grid grid-cols-7 gap-1">
          <div className="text-center text-gray-400 font-bold py-1 text-xs">日</div>
          <div className="text-center text-gray-400 font-bold py-1 text-xs">月</div>
          <div className="text-center text-gray-400 font-bold py-1 text-xs">火</div>
          <div className="text-center text-gray-400 font-bold py-1 text-xs">水</div>
          <div className="text-center text-gray-400 font-bold py-1 text-xs">木</div>
          <div className="text-center text-gray-400 font-bold py-1 text-xs">金</div>
          <div className="text-center text-gray-400 font-bold py-1 text-xs">土</div>
          {calendarData.map((day, index) => {
            if (!day.day) {
              return <div key={index} className="p-2"></div>;
            }
            const isCurrentDate = day.date &&
              day.date.year === currentDate.year &&
              day.date.month === currentDate.month &&
              day.date.day === currentDate.day;
            return (
              <div
                key={index}
                className={`p-2 rounded text-center transition ${
                  isCurrentDate
                    ? 'bg-orange-600 border-2 border-orange-400'
                    : day.opponent
                    ? 'bg-gray-700 hover:bg-gray-600 cursor-pointer'
                    : 'bg-gray-900'
                }`}
              >
                <div className={`text-xs mb-0.5 ${isCurrentDate ? 'text-white font-bold' : 'text-gray-400'}`}>
                  {day.day}日
                </div>
                {day.opponent ? (
                  <>
                    <div className="text-xs text-white font-bold mb-0.5">{day.venue} {day.opponent}</div>
                    {day.result ? (
                      <div className={`text-sm font-bold ${
                        day.result === '○' ? 'text-green-400' :
                        day.result === '●' ? 'text-red-400' :
                        'text-yellow-400'
                      }`}>
                        {day.result}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">未消化</div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-gray-600">休養日</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 本日の対戦カード */}
      <div className="bg-gray-800 rounded-lg p-6 mb-8">
        <h2 className="text-2xl font-bold mb-4 text-white">
          {currentDate.month}/{currentDate.day} の対戦カード
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {todayGames.length > 0 ? todayGames.map((game, index) => (
            <div key={index} className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-center gap-4 mb-3">
                <div className="text-white font-bold text-lg">{game.away}</div>
                <div className="text-gray-400">vs</div>
                <div className="text-white font-bold text-lg">{game.home}</div>
              </div>
              <div className="flex items-center justify-center gap-4 text-sm text-gray-300 mb-2">
                <div className="text-right flex-1">
                  <div className="text-xs text-gray-500">先発</div>
                  <div className="text-yellow-400 font-bold">{game.awayPitcher || '未定'}</div>
                </div>
                <div className="text-gray-600">⚾</div>
                <div className="text-left flex-1">
                  <div className="text-xs text-gray-500">先発</div>
                  <div className="text-yellow-400 font-bold">{game.homePitcher || '未定'}</div>
                </div>
              </div>
              {game.result ? (
                <div className="mt-2 text-sm text-center">
                  <span className="text-gray-300">結果: </span>
                  <span className="text-green-400 font-bold">
                    {game.result.awayScore} - {game.result.homeScore}
                  </span>
                </div>
              ) : (
                <div className="mt-2 text-sm text-gray-500 text-center">未消化</div>
              )}
            </div>
          )) : (
            <div className="col-span-2 text-center text-gray-500 py-4">
              本日は試合がありません（休養日）
            </div>
          )}
        </div>
      </div>

      {/* タブ切り替えボタン */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setScheduleTab('league')}
          className={`px-6 py-3 rounded-lg font-bold transition ${
            scheduleTab === 'league'
              ? 'bg-green-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          📊 リーグ順位
        </button>
        <button
          onClick={() => setScheduleTab('batting')}
          className={`px-6 py-3 rounded-lg font-bold transition ${
            scheduleTab === 'batting'
              ? 'bg-green-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          ⚾ 打撃成績
        </button>
        <button
          onClick={() => setScheduleTab('pitching')}
          className={`px-6 py-3 rounded-lg font-bold transition ${
            scheduleTab === 'pitching'
              ? 'bg-green-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          🥎 投手成績
        </button>
      </div>

      {/* タブコンテンツ */}
      {scheduleTab === 'league' && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-4 text-white">リーグ順位表</h2>
          <table className="w-full text-white">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-3 text-lg">順位</th>
                <th className="text-left py-3 text-lg">チーム</th>
                <th className="text-center py-3 text-lg">勝</th>
                <th className="text-center py-3 text-lg">敗</th>
                <th className="text-center py-3 text-lg">分</th>
                <th className="text-center py-3 text-lg">勝率</th>
              </tr>
            </thead>
            <tbody>
              {leagueStandings.map((team, index) => (
                <tr key={index} className="border-b border-gray-700">
                  <td className="py-3 text-lg font-bold">{index + 1}</td>
                  <td className="py-3 text-lg font-bold">{team.team}</td>
                  <td className="text-center py-3 text-lg">{team.wins}</td>
                  <td className="text-center py-3 text-lg">{team.losses}</td>
                  <td className="text-center py-3 text-lg">{team.draws}</td>
                  <td className="text-center py-3 text-lg">
                    {team.wins + team.losses > 0
                      ? (team.wins / (team.wins + team.losses)).toFixed(3)
                      : '.000'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scheduleTab === 'batting' && (
        <div className="grid grid-cols-4 gap-4">
          <RankingTable title="打率ランキング" data={getBattingAverageRanking()} valueLabel="打率" />
          <RankingTable title="本塁打ランキング" data={getHomeRunRanking()} valueLabel="本塁打" />
          <RankingTable title="打点ランキング" data={getRBIRanking()} valueLabel="打点" />
          <RankingTable title="盗塁ランキング" data={getStolenBaseRanking()} valueLabel="盗塁" />
        </div>
      )}

      {scheduleTab === 'pitching' && (
        <div className="grid grid-cols-4 gap-4">
          <RankingTable title="防御率ランキング" data={getERARanking()} valueLabel="防御率" />
          <RankingTable title="勝利数ランキング" data={getWinsRanking()} valueLabel="勝利" />
          <RankingTable title="ホールドランキング" data={getHoldsRanking()} valueLabel="ホールド" />
          <RankingTable title="セーブランキング" data={getSavesRanking()} valueLabel="セーブ" />
        </div>
      )}
    </div>
  );
};

// スタメン・投手設定画面
const LineupSettingScreen = ({ teamName, onBack }) => {
  const [tab, setTab] = useState('lineup'); // 'lineup', 'rotation', 'usage'
  const [updateTrigger, setUpdateTrigger] = useState(0);
  const [selectedBattingOrder, setSelectedBattingOrder] = useState(null); // 選択中の打順（1-9）

  const team = TEAMS_DATA[teamName];
  if (!team) return <div className="p-8 text-white">チームが見つかりません</div>;

  // 能力値をランク化（S/A/B/C/D/E）
  const getAbilityRank = (value) => {
    if (value >= 90) return 'S';
    if (value >= 80) return 'A';
    if (value >= 70) return 'B';
    if (value >= 60) return 'C';
    if (value >= 50) return 'D';
    return 'E';
  };

  // ランクの色を取得
  const getRankColor = (rank) => {
    const colors = {
      S: 'text-pink-400',
      A: 'text-red-400',
      B: 'text-orange-400',
      C: 'text-yellow-400',
      D: 'text-green-400',
      E: 'text-gray-400'
    };
    return colors[rank] || 'text-gray-400';
  };

  // 投手の球速をランク化
  const getVelocityRank = (velocity) => {
    const adjusted = (velocity - 115) * 2.5;
    return getAbilityRank(adjusted);
  };

  // 投げ手表示
  const getThrowsLabel = (throws) => throws === 'left' ? '左投' : '右投';

  // フォーム表示
  const getFormLabel = (form) => {
    const forms = {
      overhand: 'オーバー',
      threeQuarter: 'スリークォーター',
      sidearm: 'サイド',
      submarine: 'アンダー'
    };
    return forms[form] || form;
  };

  // スタメン設定の初期化
  if (!team.lineupSettings) {
    team.lineupSettings = {
      battingOrder: [], // [{ playerId, position }, ...]
      benchPlayers: [],
      substitutionRules: {
        pinchHitter: [], // 代打候補のplayerId配列（優先順）
        pinchRunner: [], // 代走候補のplayerId配列（優先順）
      }
    };
  }

  // 投手ローテーション設定の初期化
  if (!team.pitchingRotation) {
    team.pitchingRotation = {
      starters: [], // 先発ローテーションのplayerId配列
      middleRelievers: [], // 中継ぎのplayerId配列
      closers: [], // 抑えのplayerId配列
      currentStarterIndex: 0
    };
  }

  const fielders = team.players.filter(p => p.position !== 'pitcher');
  const pitchers = team.players.filter(p => p.position === 'pitcher');

  // スタメン登録（選択中の打順に追加）
  const handleAddToLineup = (playerId) => {
    if (!selectedBattingOrder) {
      alert('打順を選択してください（1-9番の枠をクリック）');
      return;
    }

    const lineup = team.lineupSettings.battingOrder;

    // 既に同じ打順に選手がいる場合は削除
    const existingIndex = lineup.findIndex(entry => entry.battingOrder === selectedBattingOrder);
    if (existingIndex !== -1) {
      lineup.splice(existingIndex, 1);
    }

    // 選手が既に別の打順にいる場合も削除
    const playerIndex = lineup.findIndex(entry => entry.playerId === playerId);
    if (playerIndex !== -1) {
      lineup.splice(playerIndex, 1);
    }

    const player = team.players.find(p => p.id === playerId);
    let assignedPosition = player.position !== 'pitcher' ? player.position : 'catcher';

    // 同じポジションが既に使われているかチェック（投手以外）
    const existingPositionEntry = lineup.find(e => e.position === assignedPosition);
    if (existingPositionEntry) {
      // 空いているポジションを探す
      const allPositions = ['catcher', 'first', 'second', 'short', 'third', 'left', 'center', 'right'];
      const usedPositions = lineup.map(e => e.position);
      const availablePositions = allPositions.filter(pos => !usedPositions.includes(pos));

      if (availablePositions.length > 0) {
        // 空いているポジションの中から選手の適正が最も高いものを選ぶ
        if (player.positionFitness) {
          const positionFitnessMap = {
            catcher: 'catcher', first: 'first', second: 'second',
            short: 'short', third: 'third', left: 'left', center: 'center', right: 'right'
          };
          availablePositions.sort((a, b) =>
            (player.positionFitness[positionFitnessMap[b]] || 0) -
            (player.positionFitness[positionFitnessMap[a]] || 0)
          );
        }
        assignedPosition = availablePositions[0];
      }
    }

    lineup.push({ playerId, position: assignedPosition, battingOrder: selectedBattingOrder });
    lineup.sort((a, b) => a.battingOrder - b.battingOrder);

    // 次の打順を自動選択
    const nextOrder = selectedBattingOrder < 9 ? selectedBattingOrder + 1 : 1;
    setSelectedBattingOrder(nextOrder);
    setUpdateTrigger(prev => prev + 1);
  };

  // 守備位置変更（同じポジションの重複を禁止）
  const handleChangePosition = (battingOrder, newPosition) => {
    const lineup = team.lineupSettings.battingOrder;
    const entry = lineup.find(e => e.battingOrder === battingOrder);
    if (entry) {
      // 同じポジションが既に使われているかチェック（投手以外）
      if (newPosition !== 'pitcher') {
        const existingEntry = lineup.find(e => e.position === newPosition && e.battingOrder !== battingOrder);
        if (existingEntry) {
          // 既に同じポジションの選手がいる場合は守備位置を入れ替える
          const oldPosition = entry.position;
          existingEntry.position = oldPosition;
          entry.position = newPosition;
          setUpdateTrigger(prev => prev + 1);
          return;
        }
      }
      entry.position = newPosition;
      setUpdateTrigger(prev => prev + 1);
    }
  };

  // スタメン登録
  const handleSetStarter = (playerId, battingOrder, position) => {
    const lineup = team.lineupSettings.battingOrder;
    const existing = lineup.findIndex(entry => entry.playerId === playerId);

    if (existing !== -1) {
      lineup[existing] = { playerId, position, battingOrder };
    } else {
      lineup.push({ playerId, position, battingOrder });
    }

    // 打順でソート
    lineup.sort((a, b) => a.battingOrder - b.battingOrder);
    setUpdateTrigger(prev => prev + 1);
  };

  // スタメンから外す
  const handleRemoveFromLineup = (playerId) => {
    team.lineupSettings.battingOrder = team.lineupSettings.battingOrder.filter(
      entry => entry.playerId !== playerId
    );
    setUpdateTrigger(prev => prev + 1);
  };

  // 投手ローテーションに追加
  const handleAddToRotation = (playerId, role) => {
    const rotation = team.pitchingRotation;
    if (role === 'starter') {
      if (!rotation.starters.includes(playerId)) {
        rotation.starters.push(playerId);
      }
    } else if (role === 'middle') {
      if (!rotation.middleRelievers) rotation.middleRelievers = [];
      if (!rotation.middleRelievers.includes(playerId)) {
        rotation.middleRelievers.push(playerId);
      }
    } else if (role === 'setup') {
      if (!rotation.setupMen) rotation.setupMen = [];
      if (!rotation.setupMen.includes(playerId)) {
        rotation.setupMen.push(playerId);
      }
    } else if (role === 'closer') {
      rotation.closer = playerId;
    }
    setUpdateTrigger(prev => prev + 1);
  };

  // 投手ローテーションから外す
  const handleRemoveFromRotation = (playerId, role) => {
    const rotation = team.pitchingRotation;
    if (role === 'starter') {
      rotation.starters = rotation.starters.filter(id => id !== playerId);
    } else if (role === 'middle') {
      rotation.middleRelievers = (rotation.middleRelievers || []).filter(id => id !== playerId);
    } else if (role === 'setup') {
      rotation.setupMen = (rotation.setupMen || []).filter(id => id !== playerId);
    } else if (role === 'closer') {
      if (rotation.closer === playerId) {
        rotation.closer = null;
      }
    }
    setUpdateTrigger(prev => prev + 1);
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">⚙️ {teamName} - スタメン・投手設定</h1>
          <button
            onClick={onBack}
            className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded font-bold transition"
          >
            ← 戻る
          </button>
        </div>

        {/* タブ切り替え */}
        <div className="bg-gray-800 rounded-lg p-2 mb-6 flex gap-2">
          <button
            onClick={() => setTab('lineup')}
            className={`flex-1 px-4 py-2 rounded font-bold transition ${
              tab === 'lineup' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            スタメン設定
          </button>
          <button
            onClick={() => setTab('rotation')}
            className={`flex-1 px-4 py-2 rounded font-bold transition ${
              tab === 'rotation' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            投手ローテーション
          </button>
          <button
            onClick={() => setTab('usage')}
            className={`flex-1 px-4 py-2 rounded font-bold transition ${
              tab === 'usage' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            起用法
          </button>
        </div>

        {/* スタメン設定タブ */}
        {tab === 'lineup' && (
          <div className="grid grid-cols-2 gap-6">
            {/* 左側：1-9番の打順枠 */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">
                スタメン設定 ({team.lineupSettings.battingOrder.length}/9人)
              </h2>
              <p className="text-sm text-gray-400 mb-4">
                打順をクリックして選択 → 右側の野手をクリックで追加
              </p>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(order => {
                  const entry = team.lineupSettings.battingOrder.find(e => e.battingOrder === order);
                  const player = entry ? team.players.find(p => p.id === entry.playerId) : null;
                  const isSelected = selectedBattingOrder === order;

                  return (
                    <div
                      key={order}
                      onClick={() => setSelectedBattingOrder(order)}
                      className={`rounded p-3 cursor-pointer transition ${
                        isSelected
                          ? 'bg-blue-700 ring-2 ring-blue-400'
                          : player
                          ? 'bg-gray-700 hover:bg-gray-600'
                          : 'bg-gray-900 hover:bg-gray-800 border border-dashed border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`font-bold text-lg w-6 ${isSelected ? 'text-blue-300' : 'text-white'}`}>
                          {order}
                        </div>
                        {player ? (
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-white font-bold">{player.name}</div>
                                <div className="text-xs text-gray-400 flex items-center gap-2">
                                  <select
                                    value={entry.position}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      handleChangePosition(order, e.target.value);
                                    }}
                                    className="bg-gray-600 text-white rounded px-2 py-0.5 text-xs"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="catcher">捕手</option>
                                    <option value="first">一塁</option>
                                    <option value="second">二塁</option>
                                    <option value="third">三塁</option>
                                    <option value="short">遊撃</option>
                                    <option value="left">左翼</option>
                                    <option value="center">中堅</option>
                                    <option value="right">右翼</option>
                                  </select>
                                  <span>| {player.age}歳</span>
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveFromLineup(player.id);
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                              >
                                外す
                              </button>
                            </div>
                            {/* 能力値表示 */}
                            <div className="text-xs mt-2 space-y-0.5">
                              <div className="flex gap-2">
                                {[
                                  { label: 'ミ', value: player.batting.meet },
                                  { label: 'パ', value: player.batting.power },
                                  { label: '走', value: player.physical.speed },
                                  { label: '肩', value: player.physical.arm },
                                  { label: '守', value: player.fielding.defense }
                                ].map(stat => {
                                  const rank = getAbilityRank(stat.value);
                                  return (
                                    <span key={stat.label} className={getRankColor(rank)}>
                                      {stat.label} {rank}{stat.value}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-500 italic">未設定（クリックして選手を追加）</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 右側：野手リスト */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">
                野手リスト（クリックでスタメンに追加）
                {selectedBattingOrder && (
                  <span className="text-blue-400 text-sm ml-2">
                    → {selectedBattingOrder}番に追加
                  </span>
                )}
              </h2>
              <div className="space-y-2 max-h-[700px] overflow-y-auto">
                {fielders.map(player => {
                  const isInLineup = team.lineupSettings.battingOrder.some(entry => entry.playerId === player.id);

                  return (
                    <div
                      key={player.id}
                      className={`rounded p-3 cursor-pointer transition ${
                        isInLineup
                          ? 'bg-gray-900 opacity-50'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                      onClick={() => !isInLineup && handleAddToLineup(player.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-white font-bold flex items-center gap-2">
                            {player.name}
                            {isInLineup && <span className="text-xs bg-blue-600 px-2 py-0.5 rounded">スタメン</span>}
                          </div>
                          <div className="text-xs text-gray-400">
                            {POSITION_NAMES[player.position]} | {player.age}歳
                          </div>
                        </div>
                      </div>
                      {/* 能力値表示 */}
                      <div className="text-xs space-y-0.5">
                        <div className="flex gap-2">
                          {[
                            { label: 'ミ', value: player.batting.meet },
                            { label: 'パ', value: player.batting.power },
                            { label: '走', value: player.physical.speed },
                            { label: '肩', value: player.physical.arm },
                            { label: '守', value: player.fielding.defense }
                          ].map(stat => {
                            const rank = getAbilityRank(stat.value);
                            return (
                              <span key={stat.label} className={getRankColor(rank)}>
                                {stat.label} {rank}{stat.value}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 投手ローテーションタブ */}
        {tab === 'rotation' && (
          <div className="grid grid-cols-2 gap-6">
            {/* 左側：ローテーション設定 */}
            <div className="space-y-4">
              {/* 先発ローテーション */}
              <div className="bg-gray-800 rounded-lg p-6">
                <h2 className="text-xl font-bold text-white mb-4">先発ローテーション ({team.pitchingRotation.starters.length}人)</h2>
                {team.pitchingRotation.starters.length === 0 ? (
                  <p className="text-gray-400 text-sm">右側の投手一覧から選択してください</p>
                ) : (
                  <div className="space-y-2">
                    {team.pitchingRotation.starters.map((playerId, idx) => {
                      const player = team.players.find(p => p.id === playerId);
                      if (!player) return null;

                      const velocityRank = getVelocityRank(player.pitching.velocity);
                      const controlRank = getAbilityRank(player.pitching.control);
                      const staminaRank = getAbilityRank(player.pitching.stamina / 2);

                      return (
                        <div key={player.id} className="bg-gray-700 rounded p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <div className="text-white font-bold flex items-center gap-2">
                                第{idx + 1}先発: {player.name}
                                <span className="text-xs text-gray-400">
                                  {getThrowsLabel(player.physical.throws)} | {getFormLabel(player.pitching.form)}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveFromRotation(player.id, 'starter')}
                              className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                            >
                              外す
                            </button>
                          </div>
                          <div className="text-xs flex gap-2">
                            <span className={getRankColor(velocityRank)}>球速 {velocityRank}{player.pitching.velocity}</span>
                            <span className={getRankColor(controlRank)}>制球 {controlRank}{player.pitching.control}</span>
                            <span className={getRankColor(staminaRank)}>スタミナ {staminaRank}{player.pitching.stamina}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 中継ぎ・抑え */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h2 className="text-lg font-bold text-white mb-3">中継ぎ ({team.pitchingRotation.middleRelievers?.length || 0}人)</h2>
                  <div className="space-y-2">
                    {(team.pitchingRotation.middleRelievers || []).map(playerId => {
                      const player = team.players.find(p => p.id === playerId);
                      if (!player) return null;
                      return (
                        <div key={player.id} className="bg-gray-700 rounded p-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-white text-sm font-bold">{player.name}</div>
                              <div className="text-xs text-gray-400">
                                {getThrowsLabel(player.physical.throws)}
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveFromRotation(player.id, 'middle')}
                              className="bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded text-xs"
                            >
                              外す
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-gray-800 rounded-lg p-4">
                  <h2 className="text-lg font-bold text-white mb-3">セットアップ ({team.pitchingRotation.setupMen?.length || 0}人)</h2>
                  <div className="space-y-2">
                    {(team.pitchingRotation.setupMen || []).map(playerId => {
                      const player = team.players.find(p => p.id === playerId);
                      if (!player) return null;
                      return (
                        <div key={player.id} className="bg-gray-700 rounded p-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-white text-sm font-bold">{player.name}</div>
                              <div className="text-xs text-gray-400">
                                {getThrowsLabel(player.physical.throws)}
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveFromRotation(player.id, 'setup')}
                              className="bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded text-xs"
                            >
                              外す
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-gray-800 rounded-lg p-4">
                  <h2 className="text-lg font-bold text-white mb-3">守護神 ({team.pitchingRotation.closer ? 1 : 0}人)</h2>
                  <div className="space-y-2">
                    {team.pitchingRotation.closer && (() => {
                      const player = team.players.find(p => p.id === team.pitchingRotation.closer);
                      if (!player) return null;
                      return (
                        <div key={player.id} className="bg-gray-700 rounded p-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-white text-sm font-bold">{player.name}</div>
                              <div className="text-xs text-gray-400">
                                {getThrowsLabel(player.physical.throws)}
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveFromRotation(player.id, 'closer')}
                              className="bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded text-xs"
                            >
                              外す
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* 右側：投手一覧 */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">投手一覧（クリックでローテーションに追加）</h2>
              <div className="space-y-2 max-h-[700px] overflow-y-auto">
                {pitchers.map(player => {
                  const rotation = team.pitchingRotation || {};
                  const isStarter = rotation.starters?.includes(player.id) || false;
                  const isMiddle = rotation.middleRelievers?.includes(player.id) || false;
                  const isSetup = rotation.setupMen?.includes(player.id) || false;
                  const isCloser = rotation.closer === player.id;

                  // 能力値のランク計算
                  const velocityRank = getVelocityRank(player.pitching.velocity);
                  const controlRank = getAbilityRank(player.pitching.control);
                  const staminaRank = getAbilityRank(player.pitching.stamina / 2); // スタミナは200が最大なので半分に

                  return (
                    <div key={player.id} className="bg-gray-700 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-white font-bold">
                            {player.name}
                            <span className="text-xs text-gray-400 ml-2">
                              {getThrowsLabel(player.physical.throws)} | {getFormLabel(player.pitching.form)}
                            </span>
                          </div>
                          <div className="text-xs space-y-1 mt-1">
                            <div className="flex gap-3">
                              <span className={getRankColor(velocityRank)}>球速 {velocityRank}{player.pitching.velocity}</span>
                              <span className={getRankColor(controlRank)}>制球 {controlRank}{player.pitching.control}</span>
                              <span className={getRankColor(staminaRank)}>スタミナ {staminaRank}{player.pitching.stamina}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {isStarter && <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs">先発</span>}
                          {isMiddle && <span className="bg-green-600 text-white px-2 py-1 rounded text-xs">中継ぎ</span>}
                          {isSetup && <span className="bg-orange-600 text-white px-2 py-1 rounded text-xs">セットアップ</span>}
                          {isCloser && <span className="bg-purple-600 text-white px-2 py-1 rounded text-xs">守護神</span>}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => handleAddToRotation(player.id, 'starter')}
                          disabled={isStarter}
                          className={`px-3 py-1 rounded text-sm transition ${
                            isStarter
                              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          先発
                        </button>
                        <button
                          onClick={() => handleAddToRotation(player.id, 'middle')}
                          disabled={isMiddle}
                          className={`px-3 py-1 rounded text-sm transition ${
                            isMiddle
                              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                              : 'bg-green-600 hover:bg-green-700 text-white'
                          }`}
                        >
                          中継ぎ
                        </button>
                        <button
                          onClick={() => handleAddToRotation(player.id, 'setup')}
                          disabled={isSetup}
                          className={`px-3 py-1 rounded text-sm transition ${
                            isSetup
                              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                              : 'bg-orange-600 hover:bg-orange-700 text-white'
                          }`}
                        >
                          セットアップ
                        </button>
                        <button
                          onClick={() => handleAddToRotation(player.id, 'closer')}
                          disabled={isCloser}
                          className={`px-3 py-1 rounded text-sm transition ${
                            isCloser
                              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                              : 'bg-purple-600 hover:bg-purple-700 text-white'
                          }`}
                        >
                          守護神
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 起用法タブ */}
        {tab === 'usage' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">起用法設定</h2>
            <p className="text-gray-400">（今後実装予定: 代打・代走の優先順位、リリーフ起用パターンなど）</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ロスター管理画面（スタメン・投手設定）- 自チームのみ
const RosterScreen = () => {
  // TEAMS_DATAの最初のチームをユーザーチームとする
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeam = teamNames[0] || 'チームA';

  if (!TEAMS_DATA[userTeam]) {
    return <div className="p-8 text-white">チームデータが見つかりません。NEW GAMEからゲームを開始してください。</div>;
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* 自チーム表示 */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="text-lg font-bold text-white">🏠 自チーム: {userTeam}</div>
          <p className="text-sm text-gray-400 mt-1">ロスター管理は自チームのみ設定できます</p>
        </div>

        {/* LineupSettingScreenを直接表示 */}
        <LineupSettingScreen teamName={userTeam} onBack={null} />
      </div>
    </div>
  );
};

// チーム情報画面（選手一覧・能力値表示）
const TeamInfoScreen = () => {
  const teamNames = Object.keys(TEAMS_DATA || {});
  const [selectedTeam, setSelectedTeam] = useState(teamNames[0] || 'チームA');

  const allTeamsData = TEAMS_DATA || {};
  const team = allTeamsData[selectedTeam];
  if (!team) return <div className="p-8 text-white">チームが見つかりません。NEW GAMEからゲームを開始してください。</div>;

  // 投手と野手に分ける
  const pitchers = team.players.filter(p => p.position === 'pitcher');
  const fielders = team.players.filter(p => p.position !== 'pitcher');

  // 能力値の色を取得
  const getAbilityColor = (value) => {
    if (value >= 90) return 'text-pink-400';
    if (value >= 80) return 'text-red-400';
    if (value >= 70) return 'text-orange-400';
    if (value >= 60) return 'text-yellow-400';
    if (value >= 50) return 'text-green-400';
    if (value >= 40) return 'text-blue-400';
    return 'text-gray-400';
  };

  const renderPitcherRow = (player, index) => {
    const era = player.seasonStats?.pitching?.inningsPitched > 0
      ? ((player.seasonStats.pitching.earnedRuns * 27) / player.seasonStats.pitching.inningsPitched).toFixed(2)
      : '-.--';

    return (
      <tr key={player.id} className={index % 2 === 0 ? 'bg-gray-700' : 'bg-gray-750'}>
        <td className="px-2 py-1 text-white font-medium">{player.name}</td>
        <td className="px-2 py-1 text-gray-300 text-center">{player.age}</td>
        <td className="px-2 py-1 text-gray-300 text-center">
          {player.physical?.throws === 'left' ? '左' : '右'}
        </td>
        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.pitching?.velocity)}`}>
          {player.pitching?.velocity || '-'}
        </td>
        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.pitching?.control)}`}>
          {player.pitching?.control || '-'}
        </td>
        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(Math.min(99, Math.floor((player.pitching?.stamina || 0) / 2)))}`}>
          {player.pitching?.stamina || '-'}
        </td>
        <td className="px-2 py-1 text-gray-300 text-center">{era}</td>
        <td className="px-2 py-1 text-gray-300 text-center">
          {player.seasonStats?.pitching?.wins || 0}-{player.seasonStats?.pitching?.losses || 0}
        </td>
      </tr>
    );
  };

  const renderFielderRow = (player, index) => {
    const battingAvg = player.seasonStats?.batting?.atBats > 0
      ? (player.seasonStats.batting.hits / player.seasonStats.batting.atBats).toFixed(3)
      : '.000';

    return (
      <tr key={player.id} className={index % 2 === 0 ? 'bg-gray-700' : 'bg-gray-750'}>
        <td className="px-2 py-1 text-white font-medium">{player.name}</td>
        <td className="px-2 py-1 text-gray-300 text-center">{POSITION_NAMES[player.position]}</td>
        <td className="px-2 py-1 text-gray-300 text-center">{player.age}</td>
        <td className="px-2 py-1 text-gray-300 text-center">
          {player.physical?.throws === 'left' ? '左' : '右'}{player.batting?.bats === 'left' ? '左' : player.batting?.bats === 'switch' ? '両' : '右'}
        </td>
        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.batting?.meet)}`}>
          {player.batting?.meet || '-'}
        </td>
        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.batting?.power)}`}>
          {player.batting?.power || '-'}
        </td>
        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.physical?.speed)}`}>
          {player.physical?.speed || '-'}
        </td>
        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.fielding?.defense)}`}>
          {player.fielding?.defense || '-'}
        </td>
        <td className={`px-2 py-1 text-center font-bold ${getAbilityColor(player.physical?.arm)}`}>
          {player.physical?.arm || '-'}
        </td>
        <td className="px-2 py-1 text-gray-300 text-center">{battingAvg}</td>
        <td className="px-2 py-1 text-gray-300 text-center">{player.seasonStats?.batting?.homeruns || 0}</td>
      </tr>
    );
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">📊 チーム情報</h1>
        </div>

        {/* チーム選択 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">チーム選択</label>
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="w-full bg-gray-700 text-white rounded px-4 py-2"
          >
            {Object.keys(allTeamsData).map(teamName => (
              <option key={teamName} value={teamName}>{teamName}</option>
            ))}
          </select>
        </div>

        {/* ロスター情報 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="grid grid-cols-3 gap-4 text-white">
            <div>
              <div className="text-sm text-gray-400">総人数</div>
              <div className="text-2xl font-bold">{team.players.length}人</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">投手</div>
              <div className="text-2xl font-bold">{pitchers.length}人</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">野手</div>
              <div className="text-2xl font-bold">{fielders.length}人</div>
            </div>
          </div>
        </div>

        {/* 投手一覧（テーブル形式） */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">投手 ({pitchers.length}人)</h2>
          {pitchers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-600 text-gray-200">
                    <th className="px-2 py-2 text-left">名前</th>
                    <th className="px-2 py-2 text-center">年齢</th>
                    <th className="px-2 py-2 text-center">投</th>
                    <th className="px-2 py-2 text-center">球速</th>
                    <th className="px-2 py-2 text-center">制球</th>
                    <th className="px-2 py-2 text-center">スタミナ</th>
                    <th className="px-2 py-2 text-center">防御率</th>
                    <th className="px-2 py-2 text-center">勝敗</th>
                  </tr>
                </thead>
                <tbody>
                  {pitchers.map((player, index) => renderPitcherRow(player, index))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">投手がいません</p>
          )}
        </div>

        {/* 野手一覧（テーブル形式） */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">野手 ({fielders.length}人)</h2>
          {fielders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-600 text-gray-200">
                    <th className="px-2 py-2 text-left">名前</th>
                    <th className="px-2 py-2 text-center">守備</th>
                    <th className="px-2 py-2 text-center">年齢</th>
                    <th className="px-2 py-2 text-center">投打</th>
                    <th className="px-2 py-2 text-center">ミート</th>
                    <th className="px-2 py-2 text-center">パワー</th>
                    <th className="px-2 py-2 text-center">走力</th>
                    <th className="px-2 py-2 text-center">守備</th>
                    <th className="px-2 py-2 text-center">肩</th>
                    <th className="px-2 py-2 text-center">打率</th>
                    <th className="px-2 py-2 text-center">HR</th>
                  </tr>
                </thead>
                <tbody>
                  {fielders.map((player, index) => renderFielderRow(player, index))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-4">野手がいません</p>
          )}
        </div>
      </div>
    </div>
  );
};

// 日程進行画面（大幅刷新版）
const DateProgressScreen = ({ seasonData, setSeasonData }) => {
  const [selectedMonth, setSelectedMonth] = useState(seasonData?.currentDate?.month || 3);
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastGameResults, setLastGameResults] = useState([]);

  if (!seasonData) return <div className="p-8 text-white">読み込み中...</div>;

  const currentPhase = seasonData.phase || 'off_season';
  const phaseInfo = PHASE_INFO[currentPhase] || { name: '', color: 'bg-gray-100', description: '' };

  // 先発投手を取得
  const getStartingPitcher = (teamName) => {
    const team = TEAMS_DATA[teamName];
    if (!team || !team.pitchingRotation || !team.pitchingRotation.starters) {
      return null;
    }
    const rotation = team.pitchingRotation;
    const index = rotation.currentStarterIndex || 0;
    const starterId = rotation.starters[index];
    return team.players.find(p => p.id === starterId);
  };

  // 勝利投手・敗戦投手・セーブ・ホールドを判定
  const determinePitcherDecisions = (gameResult, homeTeamData, awayTeamData) => {
    const decisions = {
      winningPitcher: null,
      losingPitcher: null,
      savePitcher: null,
      holdPitchers: []
    };

    if (!gameResult || gameResult.homeScore === gameResult.awayScore) {
      return decisions; // 引き分け
    }

    const isHomeWin = gameResult.homeScore > gameResult.awayScore;
    const winningTeam = isHomeWin ? gameResult.homeTeam : gameResult.awayTeam;
    const losingTeam = isHomeWin ? gameResult.awayTeam : gameResult.homeTeam;

    if (!winningTeam || !losingTeam) return decisions;

    // 投手成績を持つ選手を抽出
    const winningPitchers = winningTeam.players.filter(p => p.gameStats?.pitching?.outs > 0);
    const losingPitchers = losingTeam.players.filter(p => p.gameStats?.pitching?.outs > 0);

    // 勝利投手: リード時に投げた投手で最低5イニング（先発）または救援で逆転時に投げた投手
    const winningStarter = winningPitchers.find(p => p.gameStats.pitching.outs >= 15);
    if (winningStarter) {
      decisions.winningPitcher = winningStarter;
    } else {
      // 救援投手で最も多くアウトを取った投手
      const reliever = winningPitchers.sort((a, b) => b.gameStats.pitching.outs - a.gameStats.pitching.outs)[0];
      if (reliever) {
        decisions.winningPitcher = reliever;
      }
    }

    // 敗戦投手: 負けチームで最初に失点を許した投手（簡易版: 最も失点の多い投手）
    const losingPitcher = losingPitchers.sort((a, b) => b.gameStats.pitching.runsAllowed - a.gameStats.pitching.runsAllowed)[0];
    if (losingPitcher) {
      decisions.losingPitcher = losingPitcher;
    }

    // セーブ: 3点差以内でリードを守り切った最後の投手
    const scoreDiff = Math.abs(gameResult.homeScore - gameResult.awayScore);
    if (scoreDiff <= 3 && winningPitchers.length > 1) {
      const lastPitcher = winningPitchers[winningPitchers.length - 1];
      if (lastPitcher && lastPitcher !== decisions.winningPitcher && lastPitcher.gameStats.pitching.outs >= 3) {
        decisions.savePitcher = lastPitcher;
      }
    }

    // ホールド: 勝利投手とセーブ投手以外の中継ぎ
    winningPitchers.forEach(p => {
      if (p !== decisions.winningPitcher && p !== decisions.savePitcher && p.gameStats.pitching.outs >= 3) {
        decisions.holdPitchers.push(p);
      }
    });

    return decisions;
  };

  // 試合日の全試合を自動シミュレーション（投手成績判定付き）
  const simulateGamesOnDate = (sData) => {
    const gamesOnDate = getScheduleByDate(sData.schedule, sData.currentDate);
    if (gamesOnDate.length === 0) return { data: sData, results: [] };

    let updatedSchedule = [...sData.schedule];
    let updatedStandings = [...sData.standings];
    let updatedResults = [...sData.results];
    const gameResults = [];

    gamesOnDate.forEach(game => {
      if (game.result) return; // 既に試合済み

      const homeTeam = TEAMS_DATA[game.home];
      const awayTeam = TEAMS_DATA[game.away];
      if (!homeTeam || !awayTeam) return;

      const result = autoSimulateGame(game.home, game.away);

      // 投手成績の判定
      const decisions = determinePitcherDecisions(result, homeTeam, awayTeam);

      // 投手の勝利/敗戦/セーブ/ホールドを記録
      if (decisions.winningPitcher) {
        const teamName = result.homeScore > result.awayScore ? game.home : game.away;
        const teamData = TEAMS_DATA[teamName];
        if (teamData) {
          const pitcher = teamData.players.find(p => p.id === decisions.winningPitcher.id);
          if (pitcher) {
            pitcher.seasonStats.pitching.wins = (pitcher.seasonStats.pitching.wins || 0) + 1;
            pitcher.careerStats.pitching.wins = (pitcher.careerStats.pitching.wins || 0) + 1;
          }
        }
      }
      if (decisions.losingPitcher) {
        const teamName = result.homeScore > result.awayScore ? game.away : game.home;
        const teamData = TEAMS_DATA[teamName];
        if (teamData) {
          const pitcher = teamData.players.find(p => p.id === decisions.losingPitcher.id);
          if (pitcher) {
            pitcher.seasonStats.pitching.losses = (pitcher.seasonStats.pitching.losses || 0) + 1;
            pitcher.careerStats.pitching.losses = (pitcher.careerStats.pitching.losses || 0) + 1;
          }
        }
      }
      if (decisions.savePitcher) {
        const teamName = result.homeScore > result.awayScore ? game.home : game.away;
        const teamData = TEAMS_DATA[teamName];
        if (teamData) {
          const pitcher = teamData.players.find(p => p.id === decisions.savePitcher.id);
          if (pitcher) {
            pitcher.seasonStats.pitching.saves = (pitcher.seasonStats.pitching.saves || 0) + 1;
            pitcher.careerStats.pitching.saves = (pitcher.careerStats.pitching.saves || 0) + 1;
          }
        }
      }
      decisions.holdPitchers.forEach(holdPitcher => {
        const teamName = result.homeScore > result.awayScore ? game.home : game.away;
        const teamData = TEAMS_DATA[teamName];
        if (teamData) {
          const pitcher = teamData.players.find(p => p.id === holdPitcher.id);
          if (pitcher) {
            pitcher.seasonStats.pitching.holds = (pitcher.seasonStats.pitching.holds || 0) + 1;
            pitcher.careerStats.pitching.holds = (pitcher.careerStats.pitching.holds || 0) + 1;
          }
        }
      });

      const scheduleIndex = updatedSchedule.findIndex(g => g.id === game.id);
      if (scheduleIndex !== -1) {
        updatedSchedule[scheduleIndex] = { ...game, result };
      }

      gameResults.push({
        gameId: game.id,
        home: game.home,
        away: game.away,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        winner: result.winner,
        decisions
      });

      updatedResults.push({
        gameId: game.id,
        date: { ...sData.currentDate },
        home: game.home,
        away: game.away,
        result
      });

      const standingHome = updatedStandings.find(s => s.team === game.home);
      const standingAway = updatedStandings.find(s => s.team === game.away);
      if (standingHome && standingAway) {
        standingHome.gamesPlayed++;
        standingAway.gamesPlayed++;
        if (result.homeScore > result.awayScore) {
          standingHome.wins++;
          standingAway.losses++;
        } else if (result.awayScore > result.homeScore) {
          standingAway.wins++;
          standingHome.losses++;
        } else {
          standingHome.draws = (standingHome.draws || 0) + 1;
          standingAway.draws = (standingAway.draws || 0) + 1;
        }
        standingHome.winRate = standingHome.gamesPlayed > 0 ? standingHome.wins / standingHome.gamesPlayed : 0;
        standingAway.winRate = standingAway.gamesPlayed > 0 ? standingAway.wins / standingAway.gamesPlayed : 0;
      }
    });

    updatedStandings.sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);

    return {
      data: {
        ...sData,
        schedule: updatedSchedule,
        standings: updatedStandings,
        results: updatedResults
      },
      results: gameResults
    };
  };

  // 現在フェーズの全未消化試合を自動シミュレーション
  const simulateAllRemainingGames = (sData) => {
    const remainingGames = sData.schedule.filter(game => !game.result && game.phase === sData.phase);
    if (remainingGames.length === 0) return sData;

    let updatedSchedule = [...sData.schedule];
    let updatedStandings = [...sData.standings];
    let updatedResults = [...sData.results];

    remainingGames.forEach(game => {
      const homeTeam = TEAMS_DATA[game.home];
      const awayTeam = TEAMS_DATA[game.away];
      if (!homeTeam || !awayTeam) return;

      const result = autoSimulateGame(game.home, game.away);

      const scheduleIndex = updatedSchedule.findIndex(g => g.id === game.id);
      if (scheduleIndex !== -1) {
        updatedSchedule[scheduleIndex] = { ...game, result };
      }

      updatedResults.push({
        gameId: game.id,
        date: game.date,
        home: game.home,
        away: game.away,
        result
      });

      const standingHome = updatedStandings.find(s => s.team === game.home);
      const standingAway = updatedStandings.find(s => s.team === game.away);
      if (standingHome && standingAway) {
        standingHome.gamesPlayed++;
        standingAway.gamesPlayed++;
        if (result.homeScore > result.awayScore) {
          standingHome.wins++;
          standingAway.losses++;
        } else if (result.awayScore > result.homeScore) {
          standingAway.wins++;
          standingHome.losses++;
        } else {
          standingHome.draws = (standingHome.draws || 0) + 1;
          standingAway.draws = (standingAway.draws || 0) + 1;
        }
        standingHome.winRate = standingHome.gamesPlayed > 0 ? standingHome.wins / standingHome.gamesPlayed : 0;
        standingAway.winRate = standingAway.gamesPlayed > 0 ? standingAway.wins / standingAway.gamesPlayed : 0;
      }
    });

    updatedStandings.sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
    return {
      ...sData,
      schedule: updatedSchedule,
      standings: updatedStandings,
      results: updatedResults
    };
  };

  // 日付進行ハンドラー
  // 重要: 現在の日の試合を消化してから日付を進める
  const handleProgressDate = (days) => {
    setIsSimulating(true);
    // 1. まず現在の日の試合を消化
    const { data: afterSimData, results } = simulateGamesOnDate(seasonData);
    // 2. その後、日付を進める
    const newSeasonData = progressDate(afterSimData, days);
    setSeasonData(newSeasonData);
    setLastGameResults(results);
    setIsSimulating(false);
  };

  const handleProgressToNextGame = () => {
    setIsSimulating(true);
    let newSeasonData = progressToNextGame(seasonData, userTeamName);
    const { data, results } = simulateGamesOnDate(newSeasonData);
    setSeasonData(data);
    setLastGameResults(results);
    setIsSimulating(false);
  };

  const handleProgressToNextPhase = () => {
    setIsSimulating(true);
    let newSeasonData = progressToNextPhase(seasonData);
    newSeasonData = simulateAllRemainingGames(newSeasonData);
    setSeasonData(newSeasonData);
    setLastGameResults([]);
    setIsSimulating(false);
  };

  // カレンダー用のデータ生成
  const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();
  const getFirstDayOfWeek = (year, month) => new Date(year, month - 1, 1).getDay();

  const year = seasonData.currentDate?.year || 2024;
  const daysInMonth = getDaysInMonth(year, selectedMonth);
  const firstDay = getFirstDayOfWeek(year, selectedMonth);

  const calendarCells = [];
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  for (let i = 0; i < firstDay; i++) {
    calendarCells.push({ day: null, games: [] });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = { year, month: selectedMonth, day };
    const gamesOnDay = getScheduleByDate(seasonData.schedule, dateObj);
    const isToday = seasonData.currentDate.year === year &&
                    seasonData.currentDate.month === selectedMonth &&
                    seasonData.currentDate.day === day;
    const isPast = (selectedMonth < seasonData.currentDate.month) ||
                   (selectedMonth === seasonData.currentDate.month && day < seasonData.currentDate.day);
    calendarCells.push({ day, games: gamesOnDay, isToday, isPast });
  }

  // 本日の試合データ取得
  const todaysGames = getScheduleByDate(seasonData.schedule, seasonData.currentDate);

  return (
    <div className="p-4 min-h-screen">
      {/* 年目表示 */}
      <div className="text-center mb-4">
        <span className="text-2xl font-bold text-yellow-400">{seasonData.year}年目</span>
        <span className="text-gray-400 ml-4">{formatDate(seasonData.currentDate)} ({getDayOfWeek(seasonData.currentDate)})</span>
      </div>

      {/* 上段: カレンダー（フル幅） */}
      <div className="bg-gray-800 rounded-xl p-4 shadow-lg mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleProgressDate(1)}
              disabled={isSimulating}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-4 py-2 rounded-lg font-bold transition shadow disabled:opacity-50"
            >
              {isSimulating ? '...' : '1日進める'}
            </button>
            <h2 className="text-xl font-bold text-white">{selectedMonth}月</h2>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setSelectedMonth(m => m > 1 ? m - 1 : 12)}
              className="bg-gray-700 hover:bg-gray-600 text-white w-8 h-8 rounded-lg flex items-center justify-center"
            >
              ◀
            </button>
            <button
              onClick={() => setSelectedMonth(m => m < 12 ? m + 1 : 1)}
              className="bg-gray-700 hover:bg-gray-600 text-white w-8 h-8 rounded-lg flex items-center justify-center"
            >
              ▶
            </button>
          </div>
        </div>

        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {dayNames.map((name, i) => (
            <div key={i} className={`text-center text-sm font-bold py-2 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
              {name}
            </div>
          ))}
        </div>

        {/* カレンダーグリッド（大きめ） */}
        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell, i) => {
            // 今日の日は試合前として表示（結果なし）
            const showAsScheduled = cell.isToday;

            return (
              <div
                key={i}
                className={`min-h-[80px] p-2 rounded text-sm transition ${
                  cell.day === null ? 'bg-transparent' :
                  cell.isToday ? 'bg-green-800 border-2 border-green-400 shadow-lg' :
                  cell.isPast ? 'bg-gray-700' : 'bg-gray-700'
                }`}
              >
                {cell.day && (
                  <>
                    <div className={`font-bold mb-1 ${
                      i % 7 === 0 ? 'text-red-400' : i % 7 === 6 ? 'text-blue-400' : 'text-gray-300'
                    }`}>
                      {cell.day}
                    </div>
                    {/* 全試合を表示 */}
                    {cell.games.length > 0 && (
                      <div className="space-y-1">
                        {cell.games.map((game, gIdx) => {
                          // 今日の試合は試合前として表示
                          if (showAsScheduled || !game.result) {
                            return (
                              <div key={gIdx} className="text-[11px] text-yellow-300">
                                {game.away.replace('チーム', '')} vs {game.home.replace('チーム', '')}
                              </div>
                            );
                          }
                          // 過去の試合は結果表示
                          const awayWin = game.result.awayScore > game.result.homeScore;
                          const homeWin = game.result.homeScore > game.result.awayScore;
                          return (
                            <div key={gIdx} className="text-[11px]">
                              <span className={awayWin ? 'text-green-400 font-bold' : 'text-gray-400'}>
                                {game.away.replace('チーム', '')}
                              </span>
                              <span className="text-gray-500 mx-1">
                                {game.result.awayScore}-{game.result.homeScore}
                              </span>
                              <span className={homeWin ? 'text-green-400 font-bold' : 'text-gray-400'}>
                                {game.home.replace('チーム', '')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {cell.games.length === 0 && (
                      <div className="text-[10px] text-gray-500">-</div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 中段: 本日の対戦 */}
      <div className="bg-gray-800 rounded-xl p-4 shadow-lg mb-4">
        <h2 className="text-lg font-bold text-white mb-3">
          📅 {formatDate(seasonData.currentDate)} ({getDayOfWeek(seasonData.currentDate)}) の対戦
        </h2>

        {todaysGames.length === 0 ? (
          <div className="text-center py-4">
            <span className="text-gray-400">本日は試合がありません</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {todaysGames.map(game => {
              const awayPitcher = getStartingPitcher(game.away);
              const homePitcher = getStartingPitcher(game.home);

              return (
                <div key={game.id} className="rounded-lg p-3 bg-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="text-center flex-1">
                      <div className="text-white font-bold text-lg">{game.away}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        先発: {awayPitcher ? `${awayPitcher.name} (${awayPitcher.physical?.throws === 'left' ? '左' : '右'})` : '未定'}
                      </div>
                    </div>
                    <div className="px-4 text-gray-500 text-xl">vs</div>
                    <div className="text-center flex-1">
                      <div className="text-white font-bold text-lg">{game.home}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        先発: {homePitcher ? `${homePitcher.name} (${homePitcher.physical?.throws === 'left' ? '左' : '右'})` : '未定'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 下段: 順位表（テーブル形式） */}
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
            </tr>
          </thead>
          <tbody>
            {seasonData.standings.map((team, index) => {
              const isUserTeam = team.team === userTeamName;
              const winRate = team.gamesPlayed > 0 ? (team.wins / team.gamesPlayed).toFixed(3).substring(1) : '.000';
              const gb = index === 0 ? '-' :
                ((seasonData.standings[0].wins - team.wins) - (seasonData.standings[0].losses - team.losses)) / 2;

              return (
                <tr key={team.team} className={`border-b border-gray-700 ${isUserTeam ? 'bg-blue-900/50' : ''}`}>
                  <td className="py-3 px-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0 ? 'bg-yellow-500 text-black' :
                      index === 1 ? 'bg-gray-400 text-black' :
                      index === 2 ? 'bg-orange-600 text-white' :
                      'bg-gray-600 text-white'
                    }`}>
                      {index + 1}
                    </span>
                  </td>
                  <td className={`py-3 px-2 font-bold ${isUserTeam ? 'text-yellow-300' : ''}`}>
                    {team.team}
                  </td>
                  <td className="py-3 px-3 text-center">{team.gamesPlayed || 0}</td>
                  <td className="py-3 px-3 text-center text-green-400 font-bold">{team.wins || 0}</td>
                  <td className="py-3 px-3 text-center text-red-400 font-bold">{team.losses || 0}</td>
                  <td className="py-3 px-3 text-center text-gray-400">{team.draws || 0}</td>
                  <td className="py-3 px-3 text-center font-mono">{winRate}</td>
                  <td className="py-3 px-3 text-center text-gray-400">
                    {gb === '-' ? '-' : (typeof gb === 'number' ? gb.toFixed(1) : gb)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// オフシーズン画面
const OffSeasonScreen = ({ seasonData, setSeasonData }) => {
  const [processing, setProcessing] = useState(false);
  const [seasonResults, setSeasonResults] = useState(null);

  const handleAdvanceYear = () => {
    if (!advanceToNextYear) {
      alert('年間進行システムが読み込まれていません');
      return;
    }

    setProcessing(true);

    try {
      const allTeams = TEAMS_DATA || {};
      const result = advanceToNextYear(seasonData, allTeams);
      setSeasonResults(result);
      setSeasonData(result.newSeasonData);
      // TEAMS_DATAを更新
      Object.keys(result.updatedTeams).forEach(teamName => {
        TEAMS_DATA[teamName] = result.updatedTeams[teamName];
      });
    } catch (error) {
      console.error('年度進行エラー:', error);
      alert('年度進行中にエラーが発生しました');
    } finally {
      setProcessing(false);
    }
  };

  if (!seasonResults) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-6">🏆 オフシーズン</h1>

          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <h2 className="text-2xl font-bold text-white mb-4">
              {seasonData.year}年目のシーズンを終了しますか？
            </h2>
            <p className="text-gray-300 mb-8">
              シーズン終了処理を実行すると、以下の処理が行われます：<br/>
              1. 表彰（首位打者・本塁打王など）<br/>
              2. 選手の年齢+1<br/>
              3. 引退処理（40歳以上、成績不振など）<br/>
              4. シーズン成績を通算成績に加算<br/>
              5. 次年度（{seasonData.year + 1}年目）へ移行
            </p>
            <button
              onClick={handleAdvanceYear}
              disabled={processing}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-lg font-bold text-xl transition disabled:bg-gray-600"
            >
              {processing ? '処理中...' : `${seasonData.year + 1}年目へ進む`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 結果表示
  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">🏆 {seasonData.year - 1}年目 シーズン結果</h1>

        {/* 優勝チーム */}
        {seasonResults.awards.champion && (
          <div className="bg-gradient-to-r from-yellow-600 to-yellow-500 rounded-lg p-8 mb-6 text-center">
            <div className="text-4xl mb-2">🏆</div>
            <h2 className="text-3xl font-bold text-white mb-2">優勝</h2>
            <div className="text-5xl font-bold text-white">{seasonResults.awards.champion}</div>
          </div>
        )}

        {/* 個人タイトル */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-bold text-white mb-4">📊 個人タイトル</h2>
          <div className="grid grid-cols-2 gap-4">
            {seasonResults.awards.battingChampion && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">首位打者</div>
                <div className="text-white text-lg">{seasonResults.awards.battingChampion.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.battingChampion.team} | {seasonResults.awards.battingChampion.avg}</div>
              </div>
            )}
            {seasonResults.awards.homeRunKing && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">本塁打王</div>
                <div className="text-white text-lg">{seasonResults.awards.homeRunKing.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.homeRunKing.team} | {seasonResults.awards.homeRunKing.homeruns}本</div>
              </div>
            )}
            {seasonResults.awards.rbiKing && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">打点王</div>
                <div className="text-white text-lg">{seasonResults.awards.rbiKing.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.rbiKing.team} | {seasonResults.awards.rbiKing.rbis}打点</div>
              </div>
            )}
            {seasonResults.awards.stolenBaseKing && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">盗塁王</div>
                <div className="text-white text-lg">{seasonResults.awards.stolenBaseKing.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.stolenBaseKing.team} | {seasonResults.awards.stolenBaseKing.stolenBases}盗塁</div>
              </div>
            )}
            {seasonResults.awards.eraChampion && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">最優秀防御率</div>
                <div className="text-white text-lg">{seasonResults.awards.eraChampion.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.eraChampion.team} | {seasonResults.awards.eraChampion.era}</div>
              </div>
            )}
            {seasonResults.awards.winsLeader && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">最多勝</div>
                <div className="text-white text-lg">{seasonResults.awards.winsLeader.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.winsLeader.team} | {seasonResults.awards.winsLeader.wins}勝</div>
              </div>
            )}
            {seasonResults.awards.savesLeader && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">最多セーブ</div>
                <div className="text-white text-lg">{seasonResults.awards.savesLeader.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.savesLeader.team} | {seasonResults.awards.savesLeader.saves}S</div>
              </div>
            )}
            {seasonResults.awards.strikeoutKing && (
              <div className="bg-gray-700 rounded p-4">
                <div className="text-yellow-400 font-bold mb-1">最多奪三振</div>
                <div className="text-white text-lg">{seasonResults.awards.strikeoutKing.name}</div>
                <div className="text-gray-400 text-sm">{seasonResults.awards.strikeoutKing.team} | {seasonResults.awards.strikeoutKing.strikeouts}K</div>
              </div>
            )}
          </div>
        </div>

        {/* 引退選手 */}
        {seasonResults.retirements.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-white mb-4">👋 引退選手</h2>
            <div className="space-y-2">
              {seasonResults.retirements.map((retirement, idx) => (
                <div key={idx} className={`rounded p-4 ${retirement.hallOfFame ? 'bg-yellow-900 border border-yellow-600' : 'bg-gray-700'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-bold">
                        {retirement.hallOfFame && '🏛️ '}
                        {retirement.name} ({retirement.age}歳)
                      </div>
                      <div className="text-sm text-gray-400">
                        {retirement.team} | {POSITION_NAMES[retirement.position]} | {retirement.reason}
                      </div>
                    </div>
                    {retirement.hallOfFame && (
                      <div className="text-yellow-400 font-bold">殿堂入り</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 次へ進むボタン */}
        <div className="text-center">
          <button
            onClick={() => setSeasonResults(null)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-bold text-xl transition"
          >
            {seasonData.year}年目を開始
          </button>
        </div>
      </div>
    </div>
  );
};

// セーブ＆ロード画面
const SaveLoadScreen = ({ onSave, onLoad, onDelete, hasSaveData, seasonData }) => {
  const [saveStatus, setSaveStatus] = useState(null);
  const [saveInfo, setSaveInfo] = useState(null);

  useEffect(() => {
    // 既存のセーブデータ情報を取得
    try {
      const savedJson = localStorage.getItem('baseballSim_saveData');
      if (savedJson) {
        const data = JSON.parse(savedJson);
        setSaveInfo({
          timestamp: data.timestamp,
          year: data.seasonData?.year || 1,
          date: data.seasonData?.currentDate || { month: 4, day: 1 },
          phase: data.seasonData?.phase || 'regular_season'
        });
      }
    } catch (e) {
      console.error('セーブデータ読み込みエラー:', e);
    }
  }, [hasSaveData]);

  const handleSave = () => {
    const success = onSave();
    setSaveStatus(success ? 'saved' : 'error');
    if (success) {
      // セーブ情報を更新
      setSaveInfo({
        timestamp: new Date().toISOString(),
        year: seasonData?.year || 1,
        date: seasonData?.currentDate || { month: 4, day: 1 },
        phase: seasonData?.phase || 'regular_season'
      });
    }
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleLoad = () => {
    if (window.confirm('現在の進行データは失われます。ロードしますか？')) {
      const success = onLoad();
      setSaveStatus(success ? 'loaded' : 'error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const handleDelete = () => {
    if (window.confirm('セーブデータを削除しますか？この操作は取り消せません。')) {
      const success = onDelete();
      if (success) {
        setSaveInfo(null);
        setSaveStatus('deleted');
      } else {
        setSaveStatus('error');
      }
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '---';
    const date = new Date(ts);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const getPhaseLabel = (phase) => {
    const labels = {
      spring_camp: '春季キャンプ',
      regular_season: 'レギュラーシーズン',
      playoffs: 'プレーオフ',
      draft: 'ドラフト',
      tryout: 'トライアウト',
      offseason: 'オフシーズン'
    };
    return labels[phase] || phase;
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8 text-white">💾 セーブ＆ロード</h1>

      {/* ステータスメッセージ */}
      {saveStatus && (
        <div className={`mb-6 p-4 rounded-lg font-bold text-center ${
          saveStatus === 'saved' ? 'bg-green-600 text-white' :
          saveStatus === 'loaded' ? 'bg-blue-600 text-white' :
          saveStatus === 'deleted' ? 'bg-yellow-600 text-white' :
          'bg-red-600 text-white'
        }`}>
          {saveStatus === 'saved' && '✅ セーブしました'}
          {saveStatus === 'loaded' && '✅ ロードしました'}
          {saveStatus === 'deleted' && '🗑️ 削除しました'}
          {saveStatus === 'error' && '❌ エラーが発生しました'}
        </div>
      )}

      {/* 現在の進行状況 */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-white mb-4">📍 現在の進行状況</h2>
        {seasonData ? (
          <div className="text-gray-300">
            <p className="mb-2">シーズン: <span className="text-yellow-400 font-bold">{seasonData.year}年目</span></p>
            <p className="mb-2">日付: <span className="text-white">{seasonData.currentDate?.month}月{seasonData.currentDate?.day}日</span></p>
            <p>フェーズ: <span className="text-blue-400">{getPhaseLabel(seasonData.phase)}</span></p>
          </div>
        ) : (
          <p className="text-gray-500">ゲームが開始されていません</p>
        )}
      </div>

      {/* セーブスロット */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-white mb-4">💾 セーブスロット</h2>

        <div className="border border-gray-600 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <div className="text-white font-bold text-lg">オートセーブ</div>
              {saveInfo ? (
                <div className="text-sm text-gray-400 mt-1">
                  <p>{saveInfo.year}年目 | {saveInfo.date?.month}月{saveInfo.date?.day}日 | {getPhaseLabel(saveInfo.phase)}</p>
                  <p>保存日時: {formatTimestamp(saveInfo.timestamp)}</p>
                </div>
              ) : (
                <p className="text-gray-500 text-sm mt-1">セーブデータなし</p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={!seasonData}
              className={`flex-1 px-4 py-2 rounded font-bold transition ${
                seasonData
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              上書き保存
            </button>
            <button
              onClick={handleLoad}
              disabled={!saveInfo}
              className={`flex-1 px-4 py-2 rounded font-bold transition ${
                saveInfo
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              ロード
            </button>
            <button
              onClick={handleDelete}
              disabled={!saveInfo}
              className={`px-4 py-2 rounded font-bold transition ${
                saveInfo
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              🗑️
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          ※ セーブデータはブラウザのローカルストレージに保存されます。<br />
          ※ ブラウザのデータを消去すると、セーブデータも削除されます。
        </p>
      </div>
    </div>
  );
};

// スタート画面
const StartScreen = ({ onNewGame, onContinue, onEdit, hasSaveData }) => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-white mb-4">⚾ 野球シミュレーター</h1>
        <p className="text-xl text-gray-400 mb-12">Baseball Management Simulator</p>

        <div className="space-y-4">
          <button
            onClick={onNewGame}
            className="w-80 bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-lg font-bold text-2xl transition shadow-lg"
          >
            NEW GAME
          </button>

          <button
            onClick={onContinue}
            disabled={!hasSaveData}
            className={`w-80 px-8 py-4 rounded-lg font-bold text-2xl transition shadow-lg ${
              hasSaveData
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            CONTINUE
          </button>

          <button
            onClick={onEdit}
            disabled
            className="w-80 bg-gray-600 text-gray-400 px-8 py-4 rounded-lg font-bold text-2xl cursor-not-allowed shadow-lg"
          >
            EDIT
          </button>
        </div>

        <p className="text-sm text-gray-500 mt-8">{hasSaveData ? 'セーブデータあり' : ''} | EDITは開発中です</p>
      </div>
    </div>
  );
};

// NEW GAME用レギュレーション設定画面
const NewGameRegulationsScreen = ({ onComplete }) => {
  const [tempSettings, setTempSettings] = useState({
    useDH: false,
    gamesPerSeason: 76,
    teamsCount: 4,
    playoffFormat: 'split',
    maxExtraInnings: 12,
    teamNames: ['チームA', 'チームB', 'チームC', 'チームD']
  });
  const [selectedPreset, setSelectedPreset] = useState('shikoku');

  // チーム数変更時にチーム名配列も更新
  const handleTeamsCountChange = (newCount) => {
    const currentNames = tempSettings.teamNames || [];
    const newNames = [];
    for (let i = 0; i < newCount; i++) {
      newNames.push(currentNames[i] || `チーム${String.fromCharCode(65 + i)}`);
    }
    setTempSettings({
      ...tempSettings,
      teamsCount: newCount,
      teamNames: newNames
    });
  };

  // チーム名変更
  const handleTeamNameChange = (index, newName) => {
    const newNames = [...tempSettings.teamNames];
    newNames[index] = newName;
    setTempSettings({ ...tempSettings, teamNames: newNames });
  };

  const handleApplyPreset = (presetName) => {
    const preset = REGULATION_PRESETS[presetName];
    if (preset) {
      const newTeamsCount = preset.regulations.teamsCount || 4;
      const newNames = [];
      for (let i = 0; i < newTeamsCount; i++) {
        newNames.push(`チーム${String.fromCharCode(65 + i)}`);
      }
      setTempSettings({
        ...preset.regulations,
        teamNames: newNames
      });
      setSelectedPreset(presetName);
    }
  };

  const handleStart = () => {
    onComplete(tempSettings);
  };

  // プリセットリストを取得
  const presetList = [
    { key: 'shikoku', name: '四国IL', icon: '🏝️' },
    { key: 'bc', name: 'BCリーグ', icon: '⚾' },
    { key: 'kyushu', name: '九州AL', icon: '🌸' },
    { key: 'hokkaido', name: '北海道FL', icon: '🐻' },
    { key: 'kansai', name: '関西BL', icon: '🏯' },
    { key: 'independent', name: '汎用', icon: '⚡' },
    { key: 'professional', name: 'NPB', icon: '🏆' }
  ];

  return (
    <div className="p-8 bg-gray-900 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">⚙️ レギュレーション設定</h1>

        {/* プリセット選択 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 text-white">実在リーグから選択</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {presetList.map(preset => {
              const presetData = REGULATION_PRESETS[preset.key];
              return (
                <button
                  key={preset.key}
                  onClick={() => handleApplyPreset(preset.key)}
                  className={`p-4 rounded-lg transition ${
                    selectedPreset === preset.key
                      ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <div className="text-3xl mb-2">{preset.icon}</div>
                  <div className="font-bold">{presetData.name}</div>
                  {presetData.description && (
                    <div className="text-xs mt-1 opacity-80">{presetData.description}</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 選択中のプリセット情報 */}
        {selectedPreset && (
          <div className="bg-blue-900 border border-blue-700 rounded-lg p-4 mb-6">
            <div className="text-white">
              <div className="font-bold text-lg mb-2">
                📋 {REGULATION_PRESETS[selectedPreset].name}
              </div>
              <div className="text-sm text-blue-200">
                {getPlayoffFormatDescription(tempSettings.playoffFormat)}
              </div>
            </div>
          </div>
        )}

        {/* 詳細設定 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 text-white">詳細設定（カスタマイズ可能）</h2>
          <div className="space-y-4 text-white">
            <div className="flex items-center justify-between">
              <label className="font-medium">DH制</label>
              <select value={tempSettings.useDH ? 'true' : 'false'} onChange={(e) => setTempSettings({...tempSettings, useDH: e.target.value === 'true'})} className="bg-gray-700 rounded px-3 py-2">
                <option value="true">有効</option>
                <option value="false">無効</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className="font-medium">チーム数</label>
              <input type="number" min="2" max="12" value={tempSettings.teamsCount} onChange={(e) => handleTeamsCountChange(parseInt(e.target.value) || 4)} className="bg-gray-700 rounded px-3 py-2 w-24" />
            </div>
            <div className="flex items-center justify-between">
              <label className="font-medium">年間試合数</label>
              <input type="number" min="10" max="200" value={tempSettings.gamesPerSeason} onChange={(e) => setTempSettings({...tempSettings, gamesPerSeason: parseInt(e.target.value)})} className="bg-gray-700 rounded px-3 py-2 w-24" />
            </div>
            <div className="flex items-center justify-between">
              <label className="font-medium">プレーオフ形式</label>
              <select value={tempSettings.playoffFormat} onChange={(e) => setTempSettings({...tempSettings, playoffFormat: e.target.value})} className="bg-gray-700 rounded px-3 py-2">
                <option value="split">前後期制（3戦2勝）</option>
                <option value="single">1位vs2位（3戦2勝）</option>
                <option value="top2">上位2チーム（5戦3勝）</option>
                <option value="tournament">トーナメント</option>
                <option value="double">4チーム</option>
                <option value="none">なし</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className="font-medium">延長最大回数</label>
              <input type="number" min="9" max="20" value={tempSettings.maxExtraInnings} onChange={(e) => setTempSettings({...tempSettings, maxExtraInnings: parseInt(e.target.value)})} className="bg-gray-700 rounded px-3 py-2 w-24" />
            </div>
          </div>
        </div>

        {/* チーム名設定 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 text-white">📝 チーム名設定</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {tempSettings.teamNames.map((name, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-gray-400 text-sm w-8">#{index + 1}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => handleTeamNameChange(index, e.target.value)}
                  maxLength={15}
                  className="bg-gray-700 text-white rounded px-3 py-2 flex-1 w-full"
                  placeholder={`チーム${String.fromCharCode(65 + index)}`}
                />
              </div>
            ))}
          </div>
          <p className="text-gray-500 text-xs mt-3">※チーム名はカレンダー・成績表に反映されます（最大15文字）</p>
        </div>

        <div className="text-center">
          <button onClick={handleStart} className="bg-green-600 hover:bg-green-700 text-white px-12 py-4 rounded-lg font-bold text-xl transition">
            設定完了 - トライアウトへ
          </button>
        </div>
      </div>
    </div>
  );
};

// キャンプ画面（練習メニュー選択対応）
const CampScreen = ({ onComplete, allTeams }) => {
  // ユーザーチーム（最初のチーム）
  const teamNames = Object.keys(TEAMS_DATA || {});
  const userTeamName = teamNames[0] || 'チームA';
  const userTeam = TEAMS_DATA[userTeamName];

  const [selectedTraining, setSelectedTraining] = useState('batting'); // 全体練習メニュー
  const [trainingResults, setTrainingResults] = useState(null);
  const [isTrainingComplete, setIsTrainingComplete] = useState(false);

  // 練習実行
  const handleExecuteTraining = () => {
    if (!userTeam || !userTeam.players) return;

    // 全選手に同じ練習を適用
    const assignments = {};
    userTeam.players.forEach(p => {
      // 投手は投手用練習、野手は野手用練習を自動選択
      if (p.position === 'pitcher') {
        assignments[p.id] = ['stamina', 'control', 'velocity'].includes(selectedTraining)
          ? selectedTraining : 'stamina';
      } else {
        assignments[p.id] = ['batting', 'baserunning', 'fielding', 'eye'].includes(selectedTraining)
          ? selectedTraining : 'batting';
      }
    });

    const { updatedTeam, allReports } = executeTeamCampTraining(userTeam, assignments);

    // TEAMS_DATAを更新
    TEAMS_DATA[userTeamName] = updatedTeam;

    setTrainingResults(allReports);
    setIsTrainingComplete(true);
  };

  // 経験値の取得
  const getPlayerExp = (player) => player.experience || 0;

  return (
    <div className="p-8 bg-gray-900 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">🏕️ 春季キャンプ</h1>

        {!isTrainingComplete ? (
          <>
            {/* 練習メニュー選択 */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4">練習メニューを選択</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(TRAINING_MENUS).map(([key, menu]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedTraining(key)}
                    className={`p-4 rounded-lg transition text-left ${
                      selectedTraining === key
                        ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <div className="text-2xl mb-1">{menu.icon}</div>
                    <div className="font-bold text-sm">{menu.name}</div>
                    <div className="text-xs opacity-80">{menu.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 選手一覧（経験値表示） */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4">📊 選手経験値一覧</h2>
              <p className="text-gray-400 text-sm mb-4">
                経験値が多いほど覚醒（爆発成長）の可能性が上がります。経験10につき覚醒確率+1%
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                {userTeam?.players?.map(player => (
                  <div key={player.id} className="bg-gray-700 rounded p-2 text-sm">
                    <div className="text-white font-medium">{player.name}</div>
                    <div className="text-gray-400 text-xs">
                      {player.position === 'pitcher' ? '投手' : '野手'} | {player.age}歳
                    </div>
                    <div className="text-yellow-400 text-xs">
                      経験値: {getPlayerExp(player)} (覚醒{Math.floor(getPlayerExp(player) / 10)}%)
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={handleExecuteTraining}
                className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-4 rounded-lg font-bold text-xl transition"
              >
                🏋️ 練習を実行する
              </button>
            </div>
          </>
        ) : (
          <>
            {/* 練習結果表示 */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4">📈 練習結果</h2>
              <div className="max-h-96 overflow-y-auto space-y-2">
                {trainingResults?.map((result, idx) => (
                  <div key={idx} className="bg-gray-700 rounded p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-white font-medium">{result.player.name}</div>
                      <div className="text-gray-400 text-sm">{TRAINING_MENUS[result.trainingType]?.name}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {result.growthReport.map((growth, gIdx) => (
                        <span
                          key={gIdx}
                          className={`px-2 py-1 rounded text-xs ${
                            growth.isAwakening
                              ? 'bg-yellow-500 text-black font-bold'
                              : 'bg-green-700 text-white'
                          }`}
                        >
                          {growth.statName}: {growth.before}→{growth.after}
                          {growth.isAwakening && ' 🌟覚醒!'}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={onComplete}
                className="bg-green-600 hover:bg-green-700 text-white px-12 py-4 rounded-lg font-bold text-xl transition"
              >
                キャンプ終了 - シーズン開始
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// レギュレーション設定画面
      const RegulationsScreen = ({ seasonData, setSeasonData }) => {
  if (!seasonData) return <div className="p-8 text-white">読み込み中...</div>;

  const currentPhase = seasonData.phase || 'off_season';
  const canModify = canModifyRegulations(currentPhase);
  const phaseInfo = currentPhase && PHASE_INFO[currentPhase]
    ? PHASE_INFO[currentPhase]
    : { name: '', color: 'bg-gray-100', description: '' };
  const [tempSettings, setTempSettings] = React.useState(seasonData.settings);

  const handleApplyPreset = (presetName) => {
    const presetRegulations = applyPreset(presetName);
    setTempSettings(presetRegulations);
  };

  const handleSaveSettings = () => {
    const validation = validateRegulations(tempSettings);
    if (!validation.valid) {
      alert('設定エラー:\n' + validation.errors.join('\n'));
      return;
    }
    setSeasonData({ ...seasonData, settings: tempSettings });
    alert('レギュレーション設定を保存しました');
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-white">レギュレーション設定</h1>

      {!canModify && (
        <div className="bg-yellow-900 border-2 border-yellow-600 rounded-lg p-4 mb-6">
          <p className="text-yellow-200 font-bold">
            ⚠️ レギュレーション変更はオフシーズン（12月）のみ可能です
          </p>
          <p className="text-yellow-300 text-sm mt-2">
            現在のフェーズ: {phaseInfo.name}
          </p>
        </div>
      )}

      {/* プリセット選択 */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-white">プリセット</h2>
        <div className="grid grid-cols-2 gap-4">
          {Object.keys(REGULATION_PRESETS).map(presetKey => {
            const preset = REGULATION_PRESETS[presetKey];
            return (
              <button
                key={presetKey}
                onClick={() => handleApplyPreset(presetKey)}
                disabled={!canModify}
                className={`p-4 rounded-lg text-left transition ${
                  canModify
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-900 text-gray-600 cursor-not-allowed'
                }`}
              >
                <div className="font-bold text-lg mb-2">{preset.name}</div>
                <div className="text-sm text-gray-400">
                  {preset.regulations.teamsCount}チーム / {preset.regulations.gamesPerSeason}試合
                  {preset.regulations.useDH ? ' / DH制' : ''}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 詳細設定 */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4 text-white">詳細設定</h2>

        <div className="space-y-4">
          {/* DH制 */}
          <div className="flex items-center justify-between">
            <label className="text-white font-bold">DH制（指名打者制度）</label>
            <input
              type="checkbox"
              checked={tempSettings.useDH}
              onChange={(e) => setTempSettings({ ...tempSettings, useDH: e.target.checked })}
              disabled={!canModify}
              className="w-6 h-6"
            />
          </div>

          {/* チーム数 */}
          <div className="flex items-center justify-between">
            <label className="text-white font-bold">チーム数</label>
            <input
              type="number"
              value={tempSettings.teamsCount}
              onChange={(e) => setTempSettings({ ...tempSettings, teamsCount: parseInt(e.target.value) })}
              disabled={!canModify}
              min="2"
              max="12"
              className="bg-gray-700 text-white px-4 py-2 rounded w-24"
            />
          </div>

          {/* 年間試合数 */}
          <div className="flex items-center justify-between">
            <label className="text-white font-bold">年間試合数（チームあたり）</label>
            <input
              type="number"
              value={tempSettings.gamesPerSeason}
              onChange={(e) => setTempSettings({ ...tempSettings, gamesPerSeason: parseInt(e.target.value) })}
              disabled={!canModify}
              min="6"
              max="200"
              className="bg-gray-700 text-white px-4 py-2 rounded w-24"
            />
          </div>

          {/* プレーオフ形式 */}
          <div className="flex items-center justify-between">
            <label className="text-white font-bold">プレーオフ形式</label>
            <select
              value={tempSettings.playoffFormat}
              onChange={(e) => setTempSettings({ ...tempSettings, playoffFormat: e.target.value })}
              disabled={!canModify}
              className="bg-gray-700 text-white px-4 py-2 rounded"
            >
              <option value="single">1位 vs 2位</option>
              <option value="double">4チームトーナメント</option>
              <option value="none">プレーオフなし</option>
            </select>
          </div>
          <div className="text-sm text-gray-400 pl-4">
            {getPlayoffFormatDescription(tempSettings.playoffFormat)}
          </div>

          {/* 延長最大回数 */}
          <div className="flex items-center justify-between">
            <label className="text-white font-bold">延長最大回数</label>
            <input
              type="number"
              value={tempSettings.maxExtraInnings}
              onChange={(e) => setTempSettings({ ...tempSettings, maxExtraInnings: parseInt(e.target.value) })}
              disabled={!canModify}
              min="0"
              max="30"
              className="bg-gray-700 text-white px-4 py-2 rounded w-24"
            />
          </div>
        </div>

        {/* 保存ボタン */}
        <div className="mt-6">
          <button
            onClick={handleSaveSettings}
            disabled={!canModify}
            className={`w-full py-3 rounded-lg font-bold transition ${
              canModify
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-900 text-gray-600 cursor-not-allowed'
            }`}
          >
            設定を保存
          </button>
        </div>
      </div>

      {/* 現在の設定 */}
      <div className="bg-gray-800 rounded-lg p-6 mt-6">
        <h2 className="text-xl font-bold mb-4 text-white">現在の設定</h2>
        <div className="space-y-2 text-white">
          <div>DH制: {seasonData.settings.useDH ? '有効' : '無効'}</div>
          <div>チーム数: {seasonData.settings.teamsCount}チーム</div>
          <div>年間試合数: {seasonData.settings.gamesPerSeason}試合</div>
          <div>プレーオフ: {getPlayoffFormatDescription(seasonData.settings.playoffFormat)}</div>
          <div>延長最大: {seasonData.settings.maxExtraInnings}回</div>
        </div>
      </div>
    </div>
  );
};

// 管理画面のルーター
      // エディット画面コンポーネント
      const ManagementScreen = () => {
        if (managementView === 'schedule') return <ScheduleScreen
          seasonData={seasonData}
          setSeasonData={setSeasonData}
          allTeams={allTeams}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
        />;
        if (managementView === 'tryout') return <TryoutScreen
          seasonData={seasonData}
          allTeams={allTeams}
        />;
        if (managementView === 'roster') return <RosterScreen />;
        if (managementView === 'teaminfo') return <TeamInfoScreen />;
        if (managementView === 'dateprogress') return <DateProgressScreen
          seasonData={seasonData}
          setSeasonData={setSeasonData}
        />;
        if (managementView === 'offseason') return <OffSeasonScreen
          seasonData={seasonData}
          setSeasonData={setSeasonData}
        />;
        if (managementView === 'stats') return <PlayerStatsScreen
          seasonData={seasonData}
          allTeams={allTeams}
        />;
        if (managementView === 'save') return <SaveLoadScreen
          onSave={() => saveGame('auto')}
          onLoad={loadGame}
          onDelete={deleteSave}
          hasSaveData={hasSaveData}
          seasonData={seasonData}
        />;
        if (managementView === 'regulations') return <RegulationsScreen
          seasonData={seasonData}
          setSeasonData={setSeasonData}
        />;
        if (managementView === 'edit') return <EditScreen
          generateOptimalLineup={generateOptimalLineup}
          generatePitchingRotation={generatePitchingRotation}
          generateAllTeamsLineup={generateAllTeamsLineup}
          allTeams={allTeams}
        />;
        // 他のビューは今後追加
        return <div className="p-8 text-white">準備中...</div>;
      };

      // ゲームフロー統合ロジック: スタート画面
      if (screenMode === 'start' && gameFlowState === 'title') {
        return <StartScreen
          onNewGame={() => setGameFlowState('newgame_regulations')}
          onContinue={() => {
            if (loadGame()) {
              console.log('✅ ゲームをロードしました');
            }
          }}
          onEdit={() => alert('開発中')}
          hasSaveData={hasSaveData}
        />;
      }

      // NEW GAME: レギュレーション設定
      if (screenMode === 'start' && gameFlowState === 'newgame_regulations') {
        return <NewGameRegulationsScreen
          onComplete={(regulations) => {
            initializeNewGame(regulations);
            setGameFlowState('newgame_tryout');
          }}
        />;
      }

      // NEW GAME: 初期トライアウト
      if (screenMode === 'start' && gameFlowState === 'newgame_tryout') {
        return <TryoutScreen
          seasonData={seasonData}
          allTeams={allTeams}
          isInitialTryout={true}
          onComplete={() => {
            // トライアウト完了後、直接シーズンへ移行（キャンプスキップ）
            setSeasonData(prev => ({
              ...prev,
              currentDate: { year: 2024, month: 4, day: 1 },
              phase: SEASON_PHASES.REGULAR_SEASON
            }));
            setSelectedMonth(4);
            setManagementView('dateprogress');
            setScreenMode('management');
            setGameFlowState('season');
          }}
        />;
      }

      // NEW GAME: キャンプ
      if (screenMode === 'start' && gameFlowState === 'newgame_camp') {
        return <CampScreen
          onComplete={() => {
            // キャンプ終了時に全チームのスタメンを自動生成
            console.log('🏕️ キャンプ終了: 全チームのスタメンを生成');
            Object.keys(TEAMS_DATA).forEach(teamName => {
              const teamData = TEAMS_DATA[teamName];
              if (teamData && teamData.players && teamData.players.length > 0) {
                generateAILineup(teamData, teamName);
                // 生成結果をTEAMS_DATAに反映
                console.log(`  ✅ ${teamName}のスタメンを生成完了`);
              }
            });

            // 日付を4/1に設定し、レギュラーシーズンに移行
            setSeasonData(prev => ({
              ...prev,
              currentDate: { year: 2024, month: 4, day: 1 },
              phase: SEASON_PHASES.REGULAR_SEASON
            }));
            setScreenMode('management');
            setGameFlowState('season');
          }}
        />;
      }

      return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-800">
          {screenMode === 'management' && <Sidebar />}

          <div className={screenMode === 'management' ? 'ml-64' : ''}>
            {screenMode === 'game' ? (
              <div className="p-2">
          {/* 管理画面へボタン */}
          <div className="max-w-[1800px] mx-auto mb-2 flex justify-end">
            <button
              onClick={() => setScreenMode('management')}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded transition"
            >
              ⚙️ 管理画面へ
            </button>
          </div>

          {/* 3カラムレイアウト: 試合前は選手欄重視(5-3-5)、試合中は中央重視(3-6-3) */}
          <div className="grid gap-2 max-w-[1800px] mx-auto" style={{gridTemplateColumns: gameStarted ? '3fr 6fr 3fr' : '5fr 3fr 5fr'}}>

            {/* ===== 左カラム: アウェイチーム ===== */}
            <div className="bg-gray-900 rounded-lg p-2 text-white">
              <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-700">
                <h3 className="font-bold text-red-400">✈️ {awayTeam.name}</h3>
                <span className="text-2xl font-bold text-red-400">{score?.away || 0}</span>
              </div>
              
              {/* スタメンと控え選手を横並び表示 */}
              {!gameStarted ? (
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {/* 左: スタメン */}
                  <div>
                    <div className="text-xs text-gray-500 mb-1 px-1 font-semibold">スターティングメンバー</div>
                    <div className="space-y-1 text-xs max-h-[calc(100vh-350px)] overflow-y-auto">
                      {awayTeam.players
                        .filter(p => p.isStarter)
                        .sort((a, b) => a.battingOrder - b.battingOrder)
                        .map(player => {
                          const isPitcher = player.position === 'pitcher';
                          const posNames = { pitcher: '投', catcher: '捕', first: '一', second: '二', short: '遊', third: '三', left: '左', center: '中', right: '右' };
                          const getPositionColor = (pos) => {
                            if (pos === 'pitcher') return 'bg-red-600 text-white';
                            if (pos === 'catcher') return 'bg-blue-600 text-white';
                            if (['first', 'second', 'third', 'short'].includes(pos)) return 'bg-yellow-600 text-white';
                            if (['left', 'center', 'right'].includes(pos)) return 'bg-green-600 text-white';
                            return 'bg-gray-700';
                          };
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
                                </span>
                                <span className="text-xs text-gray-600 font-mono font-bold">#{player.number || player.id}</span>
<span className="text-sm text-gray-400 font-semibold">{throwHand}{batHand}</span>
                                {isSubSelected && <span className="text-blue-300">👆</span>}
                                {isSelected && <span className="text-blue-300">👆</span>}
                                {isPositionSelected && <span className="text-purple-300">🔄</span>}
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
                    <div className="text-xs text-gray-500 mb-1 px-1 font-semibold">ベンチメンバー</div>
                    <div className="space-y-0.5 text-xs max-h-[calc(100vh-350px)] overflow-y-auto">
                      {awayTeam.players
                        .filter(p => !p.isStarter)
                        .map(player => {
                          const posNames = { pitcher: '投', catcher: '捕', first: '一', second: '二', short: '遊', third: '三', left: '左', center: '中', right: '右' };
                          const isPitcher = player.position === 'pitcher';
                          const throwHand = player.physical.throws === 'right' ? '右' : '左';
                          const batHand = player.batting.bats === 'right' ? '右' : player.batting.bats === 'left' ? '左' : '両';
                          const isSubSelected = selectedSubstituteAway === player.id;
                          const isSubbedOut = player.hasSubbedOut;
                          // 守備位置の色分け
                          const getPositionColor = (pos) => {
                            if (pos === 'pitcher') return 'bg-red-600 text-white';  // 投：赤
                            if (pos === 'catcher') return 'bg-blue-600 text-white';  // 捕：青
                            if (['first', 'second', 'third', 'short'].includes(pos)) return 'bg-yellow-600 text-white';  // 内野：黄
                            if (['left', 'center', 'right'].includes(pos)) return 'bg-green-600 text-white';  // 外野：緑
                            return 'bg-gray-700 text-white';
                          };

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
                                <span className="text-xs text-gray-400">{throwHand}{batHand}</span>
                                {isSubbedOut && <span className="text-red-400 text-xs">交代済</span>}
                                {isSubSelected && <span className="text-blue-300">👆</span>}
                              </div>
                              <div className="flex gap-1.5 text-[10px] ml-6 text-gray-400">
                                <span>M{player.batting.meet}</span>
                                <span>P{player.batting.power}</span>
                                {isPitcher && <span className="text-blue-400">⚡{player.pitching.velocity}km</span>}
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
                  <div className="space-y-1 text-sm">
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
                    const posNames = { pitcher: '投', catcher: '捕', first: '一', second: '二', short: '遊', third: '三', left: '左', center: '中', right: '右' };

                    // 守備位置の色分け
                    const getPositionColor = (pos) => {
                      if (pos === 'pitcher') return isCurrentBatter ? 'bg-red-600 text-white' : 'bg-red-600 text-white';  // 🔴 赤
                      if (pos === 'catcher') return isCurrentBatter ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white';  // 🔵 青
                      if (['first', 'second', 'third', 'short'].includes(pos)) return isCurrentBatter ? 'bg-yellow-400 text-black' : 'bg-yellow-600 text-white';  // 🟡 黄色
                      if (['left', 'center', 'right'].includes(pos)) return isCurrentBatter ? 'bg-green-500 text-white' : 'bg-green-600 text-white';  // 🟢 緑
                      return 'bg-gray-700';
                    };

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
                        <div className="flex items-center gap-1.5">
                          <span className={`w-5 ${isCurrentBatter ? 'text-black font-bold' : isSelected ? 'text-white font-bold' : 'text-gray-400'}`}>{player.battingOrder}</span>
                          {!gameStarted ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePositionClick('away', player.id);
                              }}
                              className={`w-6 text-center rounded text-xs py-0.5 font-semibold transition ${
                                isPositionSelected
                                  ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                                  : getPositionColor(player.position) + ' hover:opacity-80'
                              }`}
                            >
                              {posNames[player.position]}
                            </button>
                          ) : (
                            <span className={`w-6 text-center rounded text-sm py-0.5 font-bold ${getPositionColor(player.position)}`}>{posNames[player.position]}</span>
                          )}
                          <span className="font-bold">{player.name}</span>
                          <span className={`text-xs ${isCurrentBatter ? 'text-yellow-800' : isSelected ? 'text-blue-200' : 'text-gray-400'}`}>{throwHand}{batHand}</span>
                          <span className="flex-1"></span>
                          {isSubbedOut && <span className="text-red-400 text-xs">交代済</span>}
                          {isCurrentBatter && <span>⚾</span>}
                          {isSubSelected && <span className="text-orange-300">⚡</span>}
                          {isSelected && <span>👆</span>}
                          {isPositionSelected && <span>🔄</span>}
                        </div>
                        <div className={`flex gap-2 text-xs ml-6 mt-0.5 ${isCurrentBatter ? 'text-yellow-800' : isSelected ? 'text-blue-200' : 'text-gray-400'}`}>
                          <span>M{player.batting.meet}</span>
                          <span>P{player.batting.power}</span>
                          <span>E{player.batting.eye}</span>
                          {isPitcher && <span className={isCurrentBatter ? 'text-yellow-800' : isSelected ? 'text-blue-200' : 'text-blue-400'}>⚡{player.pitching.velocity}km</span>}
                        </div>
                        {!gameStarted && (
                          <div className={`text-[10px] ml-6 mt-0.5 ${
                            fitness.grade === 'S' ? 'text-yellow-400' :
                            fitness.grade === 'A' ? 'text-green-400' :
                            fitness.grade === 'B' ? 'text-blue-400' :
                            fitness.grade === 'D' ? 'text-red-400' :
                            'text-gray-400'
                          }`}>
                            守備適性 [{fitness.grade}] {fitness.comments}
                          </div>
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
                      {awayTeam.players
                        .filter(p => !p.isStarter)
                        .map(player => {
                          const posNames = { pitcher: '投', catcher: '捕', first: '一', second: '二', short: '遊', third: '三', left: '左', center: '中', right: '右' };
                          const isPitcher = player.position === 'pitcher';
                          const throwHand = player.physical.throws === 'right' ? '右' : '左';
                          const batHand = player.batting.bats === 'right' ? '右' : player.batting.bats === 'left' ? '左' : '両';
                          const isSubSelected = selectedSubstituteAway === player.id;
                          const isSubbedOut = player.hasSubbedOut;
                          // 守備位置の色分け
                          const getPositionColor = (pos) => {
                            if (pos === 'pitcher') return 'bg-red-600 text-white';  // 投：赤
                            if (pos === 'catcher') return 'bg-blue-600 text-white';  // 捕：青
                            if (['first', 'second', 'third', 'short'].includes(pos)) return 'bg-yellow-600 text-white';  // 内野：黄
                            if (['left', 'center', 'right'].includes(pos)) return 'bg-green-600 text-white';  // 外野：緑
                            return 'bg-gray-700 text-white';
                          };

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
                                <span className="text-xs text-gray-400">{throwHand}{batHand}</span>
                                {isSubbedOut && <span className="text-red-400 text-xs">交代済</span>}
                                {isSubSelected && <span className="text-blue-300">👆</span>}
                              </div>
                              <div className="flex gap-1.5 text-[10px] ml-6 text-gray-400">
                                <span>M{player.batting.meet}</span>
                                <span>P{player.batting.power}</span>
                                {isPitcher && <span className="text-blue-400">⚡{player.pitching.velocity}km</span>}
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
                    <div className="text-xs text-gray-400 mb-1">📊 試合スタッツ</div>
                    {/* 投手成績 */}
                    <div className="bg-gray-800 rounded p-1.5 mb-1">
                      <div className="text-[10px] text-blue-400 mb-0.5">投手</div>
                      <div className="text-xs">
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
                                  <div key={p.id} className="flex justify-between text-gray-300">
                                    <span>{p.name}</span>
                                    <span className="text-gray-400">
                                      {ip} {s.strikeouts || 0}K {s.walks || 0}BB 防{era}
                                    </span>
                                  </div>
                                );
                              })}
                              {pitchers.length > 1 && (
                                <div className="flex justify-between text-yellow-400 text-[10px] mt-1 pt-1 border-t border-gray-700">
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
                    <div className="text-xs text-gray-400 mb-1">⚾ 先発投手</div>
                    {(() => {
                      const pitcher = awayTeam.players.find(p => p.position === 'pitcher' && p.battingOrder === 9);
                      if (!pitcher) return null;
                      const formNames = {
                        overhand: 'オーバー',
                        threeQuarter: 'スリークォーター',
                        sidearm: 'サイドアーム',
                        submarine: 'アンダースロー'
                      };
                      const ballTypeNames = {
                        straight: 'ストレート',
                        slider: 'スライダー',
                        curveball: 'カーブ',
                        curve: 'カーブ',
                        changeup: 'チェンジアップ',
                        fork: 'フォーク',
                        sinker: 'シンカー',
                        cutter: 'カッター',
                        splitter: 'スプリット',
                        knuckleball: 'ナックル',
                        shoot: 'シュート'
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
                                    {ballTypeNames[ball.type] || ball.type}
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
            <div className="space-y-2">

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
                    <p className="text-[10px] text-gray-500 mt-2 text-center">
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
                          gameStats: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, strikeouts: 0 }
                        }))
                      }));
                      setHomeTeam(prev => ({
                        ...prev,
                        players: prev.players.map(p => ({
                          ...p,
                          gameStats: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, strikeouts: 0 }
                        }))
                      }));
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-12 rounded-lg text-xl transition shadow-lg"
                  >
                    ⚾ 試合開始
                  </button>
                  <div className="mt-6">
                    <button
                      onClick={() => setShowEditScreen(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition shadow-lg"
                    >
                      ✏️ エディット
                    </button>
                  </div>
                </div>
              )}

              {/* 電光掲示板風スコアボード */}
              {gameStarted && (
              <div className="bg-black rounded-lg p-1 font-mono border-4 border-gray-800 shadow-2xl">
                {/* 上段: イニングスコア（電光掲示板風） */}
                <div className="bg-black rounded-t overflow-hidden p-2">
                  <table className="w-full text-center text-base">
                    {/* ヘッダー行 */}
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="py-1.5 px-2 w-24 text-left text-orange-600">TEAM</th>
                        {inning <= 9 ? (
                          // 9回まで: 1-9回を表示
                          [1,2,3,4,5,6,7,8,9].map(i => (
                            <th key={i} className={`py-1.5 px-1 w-8 font-normal ${inning === i ? 'text-orange-300' : 'text-orange-600'}`} style={{textShadow: inning === i ? '0 0 8px #fb923c' : 'none'}}>{i}</th>
                          ))
                        ) : (
                          // 延長: 10回以降を表示（最大3イニング分）
                          [0,1,2].map(i => {
                            const extraInn = 10 + i;
                            return (
                              <th key={i} className={`py-1.5 px-1 w-8 font-normal ${inning === extraInn ? 'text-orange-300' : 'text-orange-600'}`} style={{textShadow: inning === extraInn ? '0 0 8px #fb923c' : 'none'}}>{extraInn}</th>
                            );
                          })
                        )}
                        <th className="py-1.5 px-2 w-12 text-orange-400 font-bold border-l border-gray-700">計</th>
                        <th className="py-1.5 px-2 w-10 text-orange-600">安</th>
                        <th className="py-1.5 px-2 w-10 text-orange-600">失</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* アウェイチーム */}
                      <tr className="border-b border-gray-800">
                        <td className={`py-2 px-2 text-left font-bold ${isTopInning ? 'text-orange-300' : 'text-orange-500'}`} style={{textShadow: isTopInning ? '0 0 8px #fb923c' : 'none'}}>{awayTeam.name}</td>
                        {inning <= 9 ? (
                          // 9回まで
                          [0,1,2,3,4,5,6,7,8].map(i => (
                            <td key={i} className="py-2 px-1 text-orange-400 font-bold" style={{textShadow: inningScores?.away?.[i] !== null && inningScores?.away?.[i] !== undefined ? '0 0 6px #fb923c' : 'none'}}>
                              {inningScores?.away?.[i] !== null && inningScores?.away?.[i] !== undefined ? inningScores.away[i] : ''}
                            </td>
                          ))
                        ) : (
                          // 延長（アウェイ）
                          [0,1,2].map(i => (
                            <td key={i} className="py-2 px-1 text-orange-400 font-bold" style={{textShadow: extraInningScores?.away?.[i] !== null && extraInningScores?.away?.[i] !== undefined ? '0 0 6px #fb923c' : 'none'}}>
                              {extraInningScores?.away?.[i] !== null && extraInningScores?.away?.[i] !== undefined ? extraInningScores.away[i] : ''}
                            </td>
                          ))
                        )}
                        <td className="py-2 px-2 font-bold text-2xl text-orange-300 border-l border-gray-700" style={{textShadow: '0 0 10px #fb923c'}}>{score?.away || 0}</td>
                        <td className="py-2 px-2 text-orange-400">{teamHits?.away || 0}</td>
                        <td className="py-2 px-2 text-orange-400">{teamErrors?.home || 0}</td>
                      </tr>
                      {/* ホームチーム */}
                      <tr>
                        <td className={`py-2 px-2 text-left font-bold ${!isTopInning ? 'text-orange-300' : 'text-orange-500'}`} style={{textShadow: !isTopInning ? '0 0 8px #fb923c' : 'none'}}>{homeTeam.name}</td>
                        {inning <= 9 ? (
                          // 9回まで
                          [0,1,2,3,4,5,6,7,8].map(i => {
                            const homeScore = inningScores?.home?.[i];
                            // 9回裏、ホームチームがリードしている場合に「X」を表示する判定
                            const showX = i === 8 && inning === 9 && !isTopInning && (score?.home || 0) > (score?.away || 0) && homeScore === null;
                            return (
                              <td key={i} className="py-2 px-1 text-orange-400 font-bold" style={{textShadow: homeScore !== null && homeScore !== undefined || showX ? '0 0 6px #fb923c' : 'none'}}>
                                {showX ? 'X' : (homeScore !== null && homeScore !== undefined ? homeScore : '')}
                              </td>
                            );
                          })
                        ) : (
                          // 延長（ホーム）
                          [0,1,2].map(i => {
                            const homeScore = extraInningScores?.home?.[i];
                            return (
                              <td key={i} className="py-2 px-1 text-orange-400 font-bold" style={{textShadow: homeScore !== null && homeScore !== undefined ? '0 0 6px #fb923c' : 'none'}}>
                                {homeScore !== null && homeScore !== undefined ? homeScore : ''}
                              </td>
                            );
                          })
                        )}
                        <td className="py-2 px-2 font-bold text-2xl text-orange-300 border-l border-gray-700" style={{textShadow: '0 0 10px #fb923c'}}>{score?.home || 0}</td>
                        <td className="py-2 px-2 text-orange-400">{teamHits?.home || 0}</td>
                        <td className="py-2 px-2 text-orange-400">{teamErrors?.away || 0}</td>
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
                  <div className="text-center w-20 flex-shrink-0">
                    <div className="text-orange-500 text-[10px] truncate">{getCurrentPitcher().name}</div>
                    <div className="text-orange-600 text-xs">投球数</div>
                    <div className="text-orange-400 text-xl font-bold font-mono" style={{textShadow: '0 0 6px #f97316'}}>
                      {String(getCurrentPitcher().stats?.pitching?.pitches || 0).padStart(3, ' ')}
                    </div>
                  </div>
                  
                  {/* 区切り線 */}
                  <div className="w-px h-14 bg-gray-700 flex-shrink-0" />
                  
                  {/* 球種・球速表示（固定幅） */}
                  <div className="text-center w-20 flex-shrink-0">
                    <div className="text-orange-500 text-xs truncate">
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
              <div className="bg-white rounded-lg p-3 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  {/* 投手情報 */}
                  <div className="text-center flex-1">
                    <div className="text-xs text-gray-500">投手 ({isTopInning ? homeTeam.name : awayTeam.name})</div>
                    <div className="font-bold text-xl text-blue-600">{getCurrentPitcher().name}</div>
                    <div className="text-sm text-gray-600">
                      {getCurrentPitcher().physical.throws === 'right' ? '右投' : '左投'} | 
                      {getCurrentPitcher().pitching.velocity}km/h
                    </div>
                    <div className="text-sm font-bold text-blue-700">
                      防御率 {getCurrentPitcher().stats?.pitching?.outs > 0 
                        ? ((getCurrentPitcher().stats.pitching.runsAllowed * 27) / getCurrentPitcher().stats.pitching.outs).toFixed(2) 
                        : '-.--'}
                    </div>
                    <div className="text-xs text-orange-500 mt-1">
                      スタミナ: {currentStamina}/{getCurrentPitcher().pitching.stamina}
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                      <div 
                        className="bg-orange-500 h-1.5 rounded-full" 
                        style={{width: `${(currentStamina / getCurrentPitcher().pitching.stamina) * 100}%`}}
                      />
                    </div>
                  </div>
                  
                  <div className="text-3xl font-bold text-gray-300 px-4">VS</div>
                  
                  {/* 打者情報 */}
                  <div className="text-center flex-1">
                    <div className="text-xs text-gray-500">{currentBatterOrder}番打者 ({isTopInning ? awayTeam.name : homeTeam.name})</div>
                    <div className="font-bold text-xl text-red-600">{getCurrentBatter().name}</div>
                    <div className="text-sm text-gray-600">
                      {getCurrentBatter().batting.bats === 'switch' ? '両打' : getCurrentBatter().batting.bats === 'right' ? '右打' : '左打'}
                    </div>
                    <div className="text-sm font-bold text-red-700">
                      {getCurrentBatter().stats?.batting?.atBats > 0 
                        ? (getCurrentBatter().stats.batting.hits / getCurrentBatter().stats.batting.atBats).toFixed(3) 
                        : '.000'} | 
                      {getCurrentBatter().stats?.batting?.homeruns || 0}本 | 
                      {getCurrentBatter().stats?.batting?.rbis || 0}打点
                    </div>
                    <div className="text-xs mt-1">
                      <span className={`px-2 py-0.5 rounded ${
                        getHandednessEffect(getCurrentPitcher().physical.throws, getCurrentBatter().batting.bats).meetBonus 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {getHandednessEffect(getCurrentPitcher().physical.throws, getCurrentBatter().batting.bats).label}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* 操作ボタン */}
                <div className="flex justify-center gap-2 flex-wrap">
                  <button onClick={throwPitch} disabled={isAutoSimulating || gameOver}
                    className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700 disabled:opacity-50">
                    ⚾ 1球
                  </button>
                  <button onClick={() => multiPitch(10)} disabled={isAutoSimulating || gameOver}
                    className="bg-purple-600 text-white px-3 py-2 rounded text-sm hover:bg-purple-700 disabled:opacity-50">
                    ⚾×10
                  </button>
                  <button onClick={() => multiPitch(1000)} disabled={isAutoSimulating || gameOver}
                    className="bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700 disabled:opacity-50">
                    ⚾×1000
                  </button>
                  <button onClick={resetGame}
                    className="bg-gray-600 text-white px-3 py-2 rounded text-sm hover:bg-gray-700">
                    🔄 リセット
                  </button>
                  <button
                    onClick={() => setAutoManagerMode(!autoManagerMode)}
                    className={`px-3 py-2 rounded text-sm font-semibold transition ${
                      autoManagerMode ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    🤖 {autoManagerMode ? 'AI ON' : 'AI OFF'}
                  </button>
                </div>
              </div>
              )}

              {/* 最新結果 */}
              {gameStarted && lastResult && (
                <div className="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-2 text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    <div>
                      <span className="font-bold text-lg">{lastResult.description}</span>
                      {lastResult.pitchType && (
                        <span className="ml-2 text-gray-600 text-sm">
                          ({lastResult.pitchType} {lastResult.velocity}km/h)
                        </span>
                      )}
                    </div>
                    {/* 打球物理データ */}
                    {lastResult.exitVelocity && (
                      <div className="text-[10px] text-gray-500">
                        EV:{lastResult.exitVelocity} LA:{lastResult.launchAngle}° {lastResult.distance}m 芯:{lastResult.meetQuality}%
                      </div>
                    )}
                  </div>
                  {/* タイミングデータ（空振り時など） */}
                  {lastResult.timingWindow && !lastResult.exitVelocity && (
                    <div className="text-xs text-red-500 mt-1">
                      窓: {lastResult.timingWindow}ms | 誤差: {lastResult.timingError}ms
                    </div>
                  )}
                </div>
              )}

              {/* 試合ログ */}
              {gameStarted && (
              <div className="bg-white rounded-lg p-2 shadow-lg">
                <h4 className="font-bold text-sm text-gray-700 mb-1">📝 試合ログ</h4>
                <div className="max-h-40 overflow-y-auto text-xs space-y-0.5">
                  {gameLog.slice().reverse().slice(0, 20).map((log, i) => (
                    <div key={i} className={`p-1 rounded ${i === 0 ? 'bg-blue-50' : 'bg-gray-50'}`}>
                      {log.isSpecial ? (
                        <span className="font-bold text-purple-600">{log.description}</span>
                      ) : (
                        <>
                          <span className="text-gray-500">{log.inning}回{log.isTop ? '表' : '裏'}</span>
                          <span className="mx-1">|</span>
                          <span className="font-mono">{log.count?.balls || 0}-{log.count?.strikes || 0}</span>
                          <span className="mx-1">|</span>
                          <span className="text-blue-600">{log.pitchType}</span>
                          <span className="text-gray-500 ml-1">{log.velocity}km</span>
                          <span className="mx-1">→</span>
                          <span className="font-bold">{log.result}</span>
                          {/* 打球物理データ（ヒット/アウト時のみ表示） */}
                          {log.exitVelocity && (
                            <span className="ml-2 text-gray-400 text-[10px]">
                              EV:{log.exitVelocity} LA:{log.launchAngle}° {log.distance}m 芯:{log.meetQuality}%
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  {gameLog.length === 0 && (
                    <div className="text-gray-400 text-center py-2">試合ログがありません</div>
                  )}
                </div>
              </div>
              )}

              {/* 試合結果（下段に配置） */}
              {gameOver && (
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
                  <div className="text-center text-lg mb-3">
                    {score.away > score.home ? `${awayTeam.name} の勝利！` : score.home > score.away ? `${homeTeam.name} の勝利！` : '引き分け'}
                  </div>

                  {/* 打撃成績サマリー */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <h4 className="font-bold text-red-400 mb-2">✈️ {awayTeam.name} 打撃成績</h4>
                      <div className="space-y-1">
                        {awayTeam.players.sort((a, b) => a.battingOrder - b.battingOrder).slice(0, 3).map(player => {
                          const stats = player.gameStats || { atBats: 0, hits: 0, homeruns: 0, rbis: 0, strikeouts: 0 };
                          return (
                            <div key={player.id} className="text-xs text-gray-400">
                              {player.name}: {stats.atBats}打数 {stats.hits}安打 {stats.homeruns}HR {stats.rbis || 0}打点
                            </div>
                          );
                        })}
                        <div className="text-xs text-gray-500 mt-1">他{awayTeam.players.length - 3}名...</div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-blue-400 mb-2">🏠 {homeTeam.name} 打撃成績</h4>
                      <div className="space-y-1">
                        {homeTeam.players.sort((a, b) => a.battingOrder - b.battingOrder).slice(0, 3).map(player => {
                          const stats = player.gameStats || { atBats: 0, hits: 0, homeruns: 0, rbis: 0, strikeouts: 0 };
                          return (
                            <div key={player.id} className="text-xs text-gray-400">
                              {player.name}: {stats.atBats}打数 {stats.hits}安打 {stats.homeruns}HR {stats.rbis || 0}打点
                            </div>
                          );
                        })}
                        <div className="text-xs text-gray-500 mt-1">他{homeTeam.players.length - 3}名...</div>
                      </div>
                    </div>
                  </div>

                  <div className="text-center mt-4">
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
                  </div>
                </div>
              )}
            </div>

            {/* ===== 右カラム: ホームチーム ===== */}
            <div className="bg-gray-900 rounded-lg p-2 text-white">
              <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-700">
                <span className="text-2xl font-bold text-blue-400">{score?.home || 0}</span>
                <h3 className="font-bold text-blue-400">🏠 {homeTeam.name}</h3>
              </div>
              
              {/* スタメンと控え選手を横並び表示 */}
              {!gameStarted ? (
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {/* 左: スタメン */}
                  <div>
                    <div className="text-xs text-gray-500 mb-1 px-1 font-semibold">スターティングメンバー</div>
                    <div className="space-y-1 text-xs max-h-[calc(100vh-350px)] overflow-y-auto">
                      {homeTeam.players
                        .filter(p => p.isStarter)
                        .sort((a, b) => a.battingOrder - b.battingOrder)
                        .map(player => {
                          const isPitcher = player.position === 'pitcher';
                          const posNames = { pitcher: '投', catcher: '捕', first: '一', second: '二', short: '遊', third: '三', left: '左', center: '中', right: '右' };
                          const getPositionColor = (pos) => {
                            if (pos === 'pitcher') return 'bg-red-600 text-white';
                            if (pos === 'catcher') return 'bg-blue-600 text-white';
                            if (['first', 'second', 'third', 'short'].includes(pos)) return 'bg-yellow-600 text-white';
                            if (['left', 'center', 'right'].includes(pos)) return 'bg-green-600 text-white';
                            return 'bg-gray-700';
                          };
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
                                </span>
                                <span className="text-xs text-gray-600 font-mono font-bold">#{player.number || player.id}</span>
<span className="text-sm text-gray-400 font-semibold">{throwHand}{batHand}</span>
                                {isSubSelected && <span className="text-blue-300">👆</span>}
                                {isSelected && <span className="text-blue-300">👆</span>}
                                {isPositionSelected && <span className="text-purple-300">🔄</span>}
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
                    <div className="text-xs text-gray-500 mb-1 px-1 font-semibold">ベンチメンバー</div>
                    <div className="space-y-0.5 text-xs max-h-[calc(100vh-350px)] overflow-y-auto">
                      {homeTeam.players
                        .filter(p => !p.isStarter)
                        .map(player => {
                          const posNames = { pitcher: '投', catcher: '捕', first: '一', second: '二', short: '遊', third: '三', left: '左', center: '中', right: '右' };
                          const isPitcher = player.position === 'pitcher';
                          const throwHand = player.physical.throws === 'right' ? '右' : '左';
                          const batHand = player.batting.bats === 'right' ? '右' : player.batting.bats === 'left' ? '左' : '両';
                          const isSubSelected = selectedSubstituteHome === player.id;
                          const isSubbedOut = player.hasSubbedOut;
                          // 守備位置の色分け
                          const getPositionColor = (pos) => {
                            if (pos === 'pitcher') return 'bg-red-600 text-white';  // 投：赤
                            if (pos === 'catcher') return 'bg-blue-600 text-white';  // 捕：青
                            if (['first', 'second', 'third', 'short'].includes(pos)) return 'bg-yellow-600 text-white';  // 内野：黄
                            if (['left', 'center', 'right'].includes(pos)) return 'bg-green-600 text-white';  // 外野：緑
                            return 'bg-gray-700 text-white';
                          };

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
                                <span className="text-xs text-gray-400">{throwHand}{batHand}</span>
                                {isSubbedOut && <span className="text-red-400 text-xs">交代済</span>}
                                {isSubSelected && <span className="text-blue-300">👆</span>}
                              </div>
                              <div className="flex gap-1.5 text-[10px] ml-6 text-gray-400">
                                <span>M{player.batting.meet}</span>
                                <span>P{player.batting.power}</span>
                                {isPitcher && <span className="text-blue-400">⚡{player.pitching.velocity}km</span>}
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
                  <div className="space-y-1 text-sm">
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
                      const posNames = { pitcher: '投', catcher: '捕', first: '一', second: '二', short: '遊', third: '三', left: '左', center: '中', right: '右' };

                    // 守備位置の色分け
                    const getPositionColor = (pos) => {
                      if (pos === 'pitcher') return isCurrentBatter ? 'bg-red-600 text-white' : 'bg-red-600 text-white';  // 🔴 赤
                      if (pos === 'catcher') return isCurrentBatter ? 'bg-blue-500 text-white' : 'bg-blue-600 text-white';  // 🔵 青
                      if (['first', 'second', 'third', 'short'].includes(pos)) return isCurrentBatter ? 'bg-yellow-400 text-black' : 'bg-yellow-600 text-white';  // 🟡 黄色
                      if (['left', 'center', 'right'].includes(pos)) return isCurrentBatter ? 'bg-green-500 text-white' : 'bg-green-600 text-white';  // 🟢 緑
                      return 'bg-gray-700';
                    };

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
                        <div className="flex items-center gap-1.5">
                          <span className={`w-5 ${isCurrentBatter ? 'text-black font-bold' : isSelected ? 'text-white font-bold' : 'text-gray-400'}`}>{player.battingOrder}</span>
                          {!gameStarted ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePositionClick('home', player.id);
                              }}
                              className={`w-6 text-center rounded text-xs py-0.5 font-semibold transition ${
                                isPositionSelected
                                  ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                                  : getPositionColor(player.position) + ' hover:opacity-80'
                              }`}
                            >
                              {posNames[player.position]}
                            </button>
                          ) : (
                            <span className={`w-6 text-center rounded text-sm py-0.5 font-bold ${getPositionColor(player.position)}`}>{posNames[player.position]}</span>
                          )}
                          <span className="font-bold">{player.name}</span>
                          <span className={`text-xs ${isCurrentBatter ? 'text-yellow-800' : isSelected ? 'text-blue-200' : 'text-gray-400'}`}>{throwHand}{batHand}</span>
                          <span className="flex-1"></span>
                          {isSubbedOut && <span className="text-red-400 text-xs">交代済</span>}
                          {isCurrentBatter && <span>⚾</span>}
                          {isSubSelected && <span className="text-orange-300">⚡</span>}
                          {isSelected && <span>👆</span>}
                          {isPositionSelected && <span>🔄</span>}
                        </div>
                        <div className={`flex gap-2 text-xs ml-6 mt-0.5 ${isCurrentBatter ? 'text-yellow-800' : isSelected ? 'text-blue-200' : 'text-gray-400'}`}>
                          <span>M{player.batting.meet}</span>
                          <span>P{player.batting.power}</span>
                          <span>E{player.batting.eye}</span>
                          {isPitcher && <span className={isCurrentBatter ? 'text-yellow-800' : isSelected ? 'text-blue-200' : 'text-blue-400'}>⚡{player.pitching.velocity}km</span>}
                        </div>
                        {!gameStarted && (
                          <div className={`text-[10px] ml-6 mt-0.5 ${
                            fitness.grade === 'S' ? 'text-yellow-400' :
                            fitness.grade === 'A' ? 'text-green-400' :
                            fitness.grade === 'B' ? 'text-blue-400' :
                            fitness.grade === 'D' ? 'text-red-400' :
                            'text-gray-400'
                          }`}>
                            守備適性 [{fitness.grade}] {fitness.comments}
                          </div>
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
                      {homeTeam.players
                        .filter(p => !p.isStarter)
                        .map(player => {
                          const posNames = { pitcher: '投', catcher: '捕', first: '一', second: '二', short: '遊', third: '三', left: '左', center: '中', right: '右' };
                          const isPitcher = player.position === 'pitcher';
                          const throwHand = player.physical.throws === 'right' ? '右' : '左';
                          const batHand = player.batting.bats === 'right' ? '右' : player.batting.bats === 'left' ? '左' : '両';
                          const isSubSelected = selectedSubstituteHome === player.id;
                          const isSubbedOut = player.hasSubbedOut;
                          // 守備位置の色分け
                          const getPositionColor = (pos) => {
                            if (pos === 'pitcher') return 'bg-red-600 text-white';  // 投：赤
                            if (pos === 'catcher') return 'bg-blue-600 text-white';  // 捕：青
                            if (['first', 'second', 'third', 'short'].includes(pos)) return 'bg-yellow-600 text-white';  // 内野：黄
                            if (['left', 'center', 'right'].includes(pos)) return 'bg-green-600 text-white';  // 外野：緑
                            return 'bg-gray-700 text-white';
                          };

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
                                <span className="text-xs text-gray-400">{throwHand}{batHand}</span>
                                {isSubbedOut && <span className="text-red-400 text-xs">交代済</span>}
                                {isSubSelected && <span className="text-blue-300">👆</span>}
                              </div>
                              <div className="flex gap-1.5 text-[10px] ml-6 text-gray-400">
                                <span>M{player.batting.meet}</span>
                                <span>P{player.batting.power}</span>
                                {isPitcher && <span className="text-blue-400">⚡{player.pitching.velocity}km</span>}
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
                    <div className="text-xs text-gray-400 mb-1">📊 試合スタッツ</div>
                    {/* 投手成績 */}
                    <div className="bg-gray-800 rounded p-1.5 mb-1">
                      <div className="text-[10px] text-blue-400 mb-0.5">投手</div>
                      <div className="text-xs">
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
                                  <div key={p.id} className="flex justify-between text-gray-300">
                                    <span>{p.name}</span>
                                    <span className="text-gray-400">
                                      {ip} {s.strikeouts || 0}K {s.walks || 0}BB 防{era}
                                    </span>
                                  </div>
                                );
                              })}
                              {pitchers.length > 1 && (
                                <div className="flex justify-between text-yellow-400 text-[10px] mt-1 pt-1 border-t border-gray-700">
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
                    <div className="text-xs text-gray-400 mb-1">⚾ 先発投手</div>
                    {(() => {
                      const pitcher = homeTeam.players.find(p => p.position === 'pitcher' && p.battingOrder === 9);
                      if (!pitcher) return null;
                      const formNames = {
                        overhand: 'オーバー',
                        threeQuarter: 'スリークォーター',
                        sidearm: 'サイドアーム',
                        submarine: 'アンダースロー'
                      };
                      const ballTypeNames = {
                        straight: 'ストレート',
                        slider: 'スライダー',
                        curveball: 'カーブ',
                        curve: 'カーブ',
                        changeup: 'チェンジアップ',
                        fork: 'フォーク',
                        sinker: 'シンカー',
                        cutter: 'カッター',
                        splitter: 'スプリット',
                        knuckleball: 'ナックル',
                        shoot: 'シュート'
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
                                    {ballTypeNames[ball.type] || ball.type}
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
              <div className="bg-white rounded-lg shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div className="p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">📝 {editingPlayer.name} を編集</h2>
                    <button onClick={() => setEditingPlayer(null)} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                  </div>
                  
                  {/* 基本情報 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">名前</label>
                    <input
                      type="text"
                      value={editingPlayer.name}
                      onChange={(e) => setEditingPlayer({...editingPlayer, name: e.target.value})}
                      className="w-full border border-gray-300 rounded px-3 py-2"
                    />
                  </div>

                  {/* 守備位置選択 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">守備位置</label>
                    <select
                      value={editingPlayer.position}
                      onChange={(e) => setEditingPlayer({...editingPlayer, position: e.target.value})}
                      className="w-full border border-gray-300 rounded px-3 py-2"
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
                          fitness.grade === 'S' ? 'text-yellow-600' :
                          fitness.grade === 'A' ? 'text-green-600' :
                          fitness.grade === 'B' ? 'text-blue-600' :
                          fitness.grade === 'D' ? 'text-red-600' :
                          'text-gray-600'
                        }`}>
                          守備適性: [{fitness.grade}] {fitness.comments}
                        </div>
                      );
                    })()}
                  </div>
                  
                  {/* 打撃能力 */}
                  <div className="mb-4">
                    <h3 className="font-bold text-sm text-gray-700 mb-2">打撃能力</h3>
                    <div className="space-y-2">
                      {[
                        {key: 'meet', label: 'ミート', color: 'blue'},
                        {key: 'power', label: 'パワー', color: 'red'},
                        {key: 'eye', label: '選球眼', color: 'green'},
                        {key: 'steal', label: '盗塁', color: 'purple'}
                      ].map(({key, label, color}) => (
                        <div key={key}>
                          <label className="block text-xs text-gray-600">{label}: <span className={`font-bold text-${color}-600`}>{editingPlayer.batting[key]}</span></label>
                          <input type="range" min="0" max="100" value={editingPlayer.batting[key]}
                            onChange={(e) => setEditingPlayer({...editingPlayer, batting: {...editingPlayer.batting, [key]: parseInt(e.target.value)}})}
                            className="w-full" />
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* 身体能力 */}
                  <div className="mb-4">
                    <h3 className="font-bold text-sm text-gray-700 mb-2">身体能力</h3>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-600">走力: <span className="font-bold">{editingPlayer.physical.speed}</span></label>
                        <input type="range" min="0" max="100" value={editingPlayer.physical.speed}
                          onChange={(e) => setEditingPlayer({...editingPlayer, physical: {...editingPlayer.physical, speed: parseInt(e.target.value)}})}
                          className="w-full" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600">肩力: <span className="font-bold">{editingPlayer.physical.arm}</span></label>
                        <input type="range" min="0" max="100" value={editingPlayer.physical.arm}
                          onChange={(e) => setEditingPlayer({...editingPlayer, physical: {...editingPlayer.physical, arm: parseInt(e.target.value)}})}
                          className="w-full" />
                      </div>
                    </div>
                  </div>
                  
                  {/* 守備能力 */}
                  <div className="mb-4">
                    <h3 className="font-bold text-sm text-gray-700 mb-2">守備能力</h3>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-600">守備力: <span className="font-bold text-yellow-600">{editingPlayer.fielding?.defense || 50}</span></label>
                        <input type="range" min="0" max="100" value={editingPlayer.fielding?.defense || 50}
                          onChange={(e) => setEditingPlayer({...editingPlayer, fielding: {...(editingPlayer.fielding || {}), defense: parseInt(e.target.value)}})}
                          className="w-full" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600">キャッチャーリード: <span className="font-bold text-orange-600">{editingPlayer.catching?.lead || 50}</span></label>
                        <input type="range" min="0" max="100" value={editingPlayer.catching?.lead || 50}
                          onChange={(e) => setEditingPlayer({...editingPlayer, catching: {...(editingPlayer.catching || {}), lead: parseInt(e.target.value)}})}
                          className="w-full" />
                      </div>
                    </div>
                  </div>
                  
                  {/* 投手能力 */}
                  <div className="mb-4">
                    <h3 className="font-bold text-sm text-gray-700 mb-2">投手能力</h3>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-600">球速: <span className="font-bold">{editingPlayer.pitching.velocity}km/h</span></label>
                        <input type="range" min="100" max="170" value={editingPlayer.pitching.velocity}
                          onChange={(e) => setEditingPlayer({...editingPlayer, pitching: {...editingPlayer.pitching, velocity: parseInt(e.target.value)}})}
                          className="w-full" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600">制球: <span className="font-bold">{editingPlayer.pitching.control}</span></label>
                        <input type="range" min="0" max="100" value={editingPlayer.pitching.control}
                          onChange={(e) => setEditingPlayer({...editingPlayer, pitching: {...editingPlayer.pitching, control: parseInt(e.target.value)}})}
                          className="w-full" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600">スタミナ: <span className="font-bold">{editingPlayer.pitching.stamina}</span></label>
                        <input type="range" min="50" max="250" value={editingPlayer.pitching.stamina}
                          onChange={(e) => setEditingPlayer({...editingPlayer, pitching: {...editingPlayer.pitching, stamina: parseInt(e.target.value)}})}
                          className="w-full" />
                      </div>
                    </div>

                    {/* 持ち球 */}
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">持ち球</label>
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
                              className="border rounded px-2 py-1 text-xs flex-1"
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
                              className="border rounded px-2 py-1 w-14 text-xs" />
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
                      className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50">キャンセル</button>
                    <button onClick={() => { updatePlayer(editingPlayer.id, editingPlayer); setEditingPlayer(null); }}
                      className="px-20 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">保存</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* エディット画面 */}
          {showEditScreen && (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg w-full max-w-7xl max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex justify-between items-center mb-6 sticky top-0 bg-white pb-4 border-b z-10">
                    <h2 className="text-2xl font-bold">✏️ 選手エディット</h2>
                    <button
                      onClick={() => setShowEditScreen(false)}
                      className="text-gray-500 hover:text-gray-700 text-3xl"
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
                        <div key={player.id} className="bg-gray-50 p-3 rounded-lg">
                          <div className="mb-3">
                            <label className="block text-xs text-gray-600 mb-1">選手名</label>
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
                              className="w-full px-2 py-1 border rounded text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            {/* 打撃能力 */}
                            <div>
                              <label className="block text-sm text-gray-600 mb-1">ミート: <span className="font-bold text-blue-600">{player.batting.meet}</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">パワー: <span className="font-bold text-blue-600">{player.batting.power}</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">選球眼: <span className="font-bold text-blue-600">{player.batting.eye}</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">走力: <span className="font-bold text-blue-600">{player.physical.speed}</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">守備: <span className="font-bold text-green-600">{player.fielding.defense}</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">肩: <span className="font-bold text-green-600">{player.physical.arm}</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">球速: <span className="font-bold text-red-600">{player.pitching.velocity}km/h</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">制球: <span className="font-bold text-red-600">{player.pitching.control}</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">投球フォーム: <span className="font-bold text-orange-600">{PITCHING_FORM_EFFECTS[player.pitching.form]?.name || player.pitching.form}</span></label>
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
                                className="w-full px-2 py-1 border rounded text-sm"
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
                                  <label className="block text-xs text-gray-600 mb-1">
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
                        <div key={player.id} className="bg-gray-50 p-3 rounded-lg">
                          <div className="mb-3">
                            <label className="block text-xs text-gray-600 mb-1">選手名</label>
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
                              className="w-full px-2 py-1 border rounded text-sm"
                            />
                          </div>
                          <div className="space-y-2">
                            {/* 打撃能力 */}
                            <div>
                              <label className="block text-sm text-gray-600 mb-1">ミート: <span className="font-bold text-blue-600">{player.batting.meet}</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">パワー: <span className="font-bold text-blue-600">{player.batting.power}</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">選球眼: <span className="font-bold text-blue-600">{player.batting.eye}</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">走力: <span className="font-bold text-blue-600">{player.physical.speed}</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">守備: <span className="font-bold text-green-600">{player.fielding.defense}</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">肩: <span className="font-bold text-green-600">{player.physical.arm}</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">球速: <span className="font-bold text-red-600">{player.pitching.velocity}km/h</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">制球: <span className="font-bold text-red-600">{player.pitching.control}</span></label>
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
                              <label className="block text-sm text-gray-600 mb-1">投球フォーム: <span className="font-bold text-orange-600">{PITCHING_FORM_EFFECTS[player.pitching.form]?.name || player.pitching.form}</span></label>
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
                                className="w-full px-2 py-1 border rounded text-sm"
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
                                  <label className="block text-xs text-gray-600 mb-1">
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
                  <div className="flex justify-end sticky bottom-0 bg-white pt-4 border-t">
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
              <ManagementScreen />
            )}
          </div>
        </div>
      );
    };

export default App;
