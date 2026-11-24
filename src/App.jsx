import React, { useState, useEffect, useMemo } from 'react';

// Utility imports
import { FORM_PITCH_SYNERGY, HAND_LABELS, formatAtBatResult, atBatResultColor, getPitchTypeName, FORM_SHORT } from './utils/constants.js';

import { formatInnings, getAbilityColor, getInfielderEffectiveArm } from './utils/physics.js';

// Data imports
import { createPlayerStats, createSeasonStats, createCareerStats } from './players.js';
import { initializeTeamsData, TEAMS_DATA, LEAGUE_SETTINGS, normalizeMaxExtraInnings, initializeTeamsForCount, selectReliefPitcher, updateReliefFatigue, recoverReliefFatigue } from './teams-data.js';
import { generateRandomPlayerName } from './data/playerNames.js';

// Game logic imports
import { judgeFielderReach } from './simulation-logic.js';
import { autoSimulateGame } from './game/autoSimulation.js';
import { useManagedGame } from './game/useManagedGame.jsx';
import { describeDeception } from './game/deception.js';
import { setGameSnapshotProvider } from './game/crashRecovery.js';
import { getUiScale, UISCALE_EVENT } from './game/uiSettings.js';
import { CONDITION_COLORS, CONDITION_ICONS, updateAllPlayersCondition, initializeAllPlayersCondition } from './game/condition.js';

// Save system imports
import { readSaveSlots, readSaveSlotsSync, setCachedSlots, ensureMigration, migrateOldSaveData, saveGameToSlot, loadGameFromSlot, deleteSaveSlot, autoSave, isAutosaveEnabled, AUTOSAVE_KEY, resumeTargetOf } from './game/saveSystem.js';

// Season management imports
import { createSeasonData, PHASE_INFO, formatDate, getDayOfWeek, isGameDay, getCurrentPhase, initializeStandings } from './season/seasonManager.js';
import { generateFullSeasonSchedule, assignPitchersToSchedule, getScheduleByDate, getTeamSchedule } from './season/scheduleGenerator.js';
import { DEFAULT_REGULATIONS, REGULATION_PRESETS, validateRegulations, getPlayoffFormatDescription, canModifyRegulations, applyPreset } from './season/regulationSettings.js';
import { progressDate, handlePhaseTransition, recordGameResult, updatePlayoffProgress } from './season/dateProgression.js';
import { generateTryoutCandidates, selectPlayerForAI, generateSnakeDraftOrder } from './season/tryoutSystem.js';
import { processSeasonEnd, advanceToNextYear, advanceToNextYearSandbox, processRetirements, updateAllPlayerAges, releasePlayer, TRAINING_MENUS, updateAllPlayersExperience, executeCampTraining, executeTeamCampTraining } from './season/yearProgressionSystem.js';
import { processNPBDraft } from './season/npbDraft.js';
import { repairLeagueConfig } from './season/nextSeasonRegulations.js';
import { initializeParallelWorldForIndependent, ensureUserIndependentLeagueTagged, recoverMissingParallelTeams } from './corporate/corporateInit.js';
import { WORLD_DATA } from './corporate/worldData.js';

// Component imports
import ManagementScreen from './components/ManagementScreen.jsx';
import ManagedGameScreen from './components/ManagedGameScreen.jsx';
import GameFlowScreens from './components/GameFlowScreens.jsx';
import { Sidebar, AccordionSection, TeamPitcherPanel } from './components/GameUIComponents.jsx';

    // ========================================================================
    // App.jsx セクション構成 (行番号はおおよその目安)
    // ========================================================================
    // ⚠ **セクションの行番号をここに書かないこと**。以前はこの位置に
    //    「L611-2030: throwPitch」のような表があったが、コードが伸びて
    //    実際は L1751、RENDER も L2131 のはずが L2995 とずれていた。
    //    しかも同じ表が CLAUDE.md にもあり、2箇所とも腐っていた。
    //    各セクションの先頭に `// [SECTION: 名前]` を置いてあるので、
    //    `grep -n "\[SECTION:" src/App.jsx src/game/useManagedGame.jsx` で現在地を引くこと。
    //
    // ★ 采配の試合（GAME_HANDLERS・THROW_PITCH・GAME_CONTROLS・GAME_SETUP）は 2026-11-24 に
    //    src/game/useManagedGame.jsx（state と処理）と src/components/ManagedGameScreen.jsx（画面）へ移した。
    // ========================================================================

    // サイドバーを出さず全画面で開く管理画面のビュー（サイドバーと本文の左の余白の両方がこれを見る）
    const FULLSCREEN_MANAGEMENT_VIEWS = ['contract', 'tryout', 'offseason', 'camp', 'summer_camp', 'jersey', 'regulations_next', 'sandbox_next_regulations', 'sandbox_setup', 'edit', 'corporate_departure', 'corporate_scout', 'club_recruit', 'budget_settlement'];

    const App = () => {
      // チームデータの初期化
      useEffect(() => {
        if (typeof initializeTeamsData === 'function') {
          initializeTeamsData();
        }
      }, []);

      // 画面モード管理
      // [SECTION: APP_STATE] アプリ全体のstate定義
      const [screenMode, setScreenMode] = useState('start'); // 'start', 'game', 'management'
      const [gameFlowState, setGameFlowState] = useState('title'); // 'title', 'newgame_regulations', 'newgame_tryout', 'newgame_camp', 'sandbox_regulations', 'sandbox_setup', 'season'
      const [gameMode, setGameMode] = useState('normal'); // 'normal', 'sandbox'
      // ⚠ 初期値は日程進行。以前は 'schedule'（どこからも開けない日程表）で、ゲームを始める・
      //    ロードするときに必ず上書きされるので出ることは無かった。日程表は 2026-11-10 に除いた
      const [managementView, setManagementView] = useState('dateprogress'); // 'dateprogress', 'roster', 'stats', 'save', 'regulations' ほか

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
      const [seasonData, setSeasonDataState] = useState(null);
      // ⚠ **最新の seasonData を同期的に持つ印**。オートセーブは `TEAMS_DATA`（選手成績）と
      //    一緒に保存するので、日付も「いまの世界」と揃っていないといけない。
      //    画面の再描画を待つ `seasonData` だと、月替わりの描画のあとに子の自動進行が
      //    先に1日進め（子の effect は親より先に走る）、さらにアイドル待ちの間にも
      //    進むので、**日付だけ古く選手成績は新しい**保存ができていた。ロードすると
      //    その間の試合をもう一度消化し、成績が二重に積まれる。
      //    日を進める処理は世界を書き換えた直後に同期で setSeasonData を呼ぶので、
      //    ここで印を更新すれば保存の瞬間の世界と必ず揃う。
      const seasonDataLiveRef = React.useRef(null);
      const setSeasonData = React.useCallback((next) => {
        if (typeof next === 'function') {
          setSeasonDataState(prev => {
            const value = next(prev);
            seasonDataLiveRef.current = value;
            return value;
          });
        } else {
          seasonDataLiveRef.current = next;
          setSeasonDataState(next);
        }
      }, []);
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
        LEAGUE_SETTINGS.maxExtraInnings = normalizeMaxExtraInnings(seasonData?.settings?.maxExtraInnings ?? 12);
      }, [seasonData?.settings?.useDH, seasonData?.settings?.maxExtraInnings]);

      const [autoSaveFlash, setAutoSaveFlash] = useState(false); // オートセーブ完了の一時表示

      const saveGame = async (slotIndex = 0, onProgress) => {
        const result = await saveGameToSlot(slotIndex, {
          seasonData, leagueConfig, screenMode, managementView,
          gameFlowState, gameMode, selectedMonth, hallOfFamePlayers, teamHistory
        }, onProgress);
        if (result.success) await refreshSaveSlots();
        return result;
      };

      // 画面スケール（ズーム）: 'auto'はビューポートに合わせて自動縮小し、
      // 情報量・レイアウトを保ったまま1画面に収める（はみ出し・スクロールバー抑制）。
      //
      // ⚠ **かつては横幅しか見ておらず、一度も発動していなかった**。
      // レイアウトが flex/% の流動幅なので `root.scrollWidth` は常にビューポート幅と
      // 一致し、`natural > vw` が成立しない。実測でも 1024px 幅で zoom は 1 のままだった。
      // 実際に溢れるのは**縦**で、1536×864（Full HDの125%スケーリング。実世界で最も多い
      // 構成のひとつ）ではブラウザの可視高が約730pxしかなく、試合画面が下へ切れていた。
      //
      // ⚠ **縦のフィットは「1画面に収める設計の画面」だけに掛けること**（`data-fit-height`）。
      // 能力ランキングのように縦に読み進める画面（自然高1900px超）まで縮めると、
      // 文字が小さくなるだけで何の得もない。
      const refitRef = React.useRef(null);
      React.useEffect(() => {
        let pending = 0;
        const applyFit = () => {
          pending = 0;
          const root = document.getElementById('root');
          if (!root) return;
          const scale = getUiScale();
          if (scale !== 'auto') { root.style.zoom = scale; return; }
          root.style.zoom = '1'; // 一旦等倍で自然サイズを測る
          const de = document.documentElement;
          const vw = de.clientWidth, vh = de.clientHeight;
          // ⚠ 幅が md（768px）未満では縮めない。PC 向けの横幅の画面を 390px に収めようとして
          //   いつも下限の0.7になり、文字が小さくなるうえ、収まりきらずに横へはみ出し、
          //   縦では下に地色の帯が残っていた。狭い画面は等倍のまま横に送って読む
          if (vw < 768) return;
          let z = root.scrollWidth > vw ? vw / root.scrollWidth : 1;
          if (root.querySelector('[data-fit-height]') && root.scrollHeight > vh) {
            z = Math.min(z, vh / root.scrollHeight);
          }
          // 下限0.7。これ以上縮めると text-xs(12px) が 8px 台になって読めない
          root.style.zoom = z < 1 ? String(Math.max(0.7, z)) : '1';
        };
        // rAFで束ねる。1フレームに何度呼ばれても実測は1回
        const schedule = () => { if (!pending) pending = requestAnimationFrame(applyFit); };
        refitRef.current = schedule;
        schedule();
        window.addEventListener('resize', schedule);
        window.addEventListener(UISCALE_EVENT, schedule);
        return () => {
          if (pending) cancelAnimationFrame(pending);
          refitRef.current = null;
          window.removeEventListener('resize', schedule);
          window.removeEventListener(UISCALE_EVENT, schedule);
        };
      }, []);

      // ⚠ **依存配列を持たせない**（毎レンダー後に再フィット）。
      // 以前は [screenMode, managementView, gameFlowState] だけを見ていたため、
      // **画面内で中身の高さが変わっても再計算されなかった**。実際
      // 「試合開始」を押すと gameStarted が変わって掲示板・采配パネルが増えるのに
      // 再フィットが走らず、57px はみ出したまま切れていた（gameStarted は
      // このフックより後で宣言されるので依存に入れられない、という事情もあった）。
      // 打者交代・チュートリアルヒントの開閉でも高さは動くので、レンダーに追従させる。
      // 実測は rAF で束ねてあるので1フレーム1回。
      React.useEffect(() => { refitRef.current?.(); });

      // 画面を切り替えたら一番上から見せる（描く前に戻すので、前の位置が一瞬も見えない）。
      // ⚠ 以前は一人用に scrollTo が無く、前の画面の縦のスクロール位置のまま次の画面を開いていた
      //    （采配試合の「結果確定・翌日へ」→ 日程画面が176px下、選手検索を下まで送って
      //    ロスター管理 → 450px下、契約更改も見出しが隠れて開いた）。
      // ⚠ 画面の名前（screenMode・gameFlowState・managementView）が変わったときだけ戻す。
      //    同じ画面の中の再描画（日を進める・タブを替える・試合終了の欄へ送る）では動かさない
      React.useLayoutEffect(() => {
        window.scrollTo(0, 0);
      }, [screenMode, gameFlowState, managementView]);

      // クラッシュ時の緊急保存用に、現在のゲーム状態を返すスナップショットを登録
      React.useEffect(() => {
        setGameSnapshotProvider(() => ({
          // 呼ばれた瞬間の世界と揃った日付（`seasonDataLiveRef` の説明を参照）
          seasonData: seasonDataLiveRef.current || seasonData, leagueConfig, screenMode, managementView,
          gameFlowState, gameMode, selectedMonth, hallOfFamePlayers, teamHistory,
        }));
      }, [seasonData, leagueConfig, screenMode, managementView, gameFlowState, gameMode, selectedMonth, hallOfFamePlayers, teamHistory]);

      // ロードしたときに戻る画面（データ編集から「ゲームに戻る」で使う）
      const resumeViewRef = React.useRef('dateprogress');
      // ロード結果(saveData)を各stateへ適用する共通処理（通常ロード/オートセーブロード共用）
      const applyLoadedGame = (result) => {
        if (!result.success) return result;
        const saveData = result.data;
        if (saveData.seasonData) setSeasonData(saveData.seasonData);
        // 球団数を変えた年より後の古い保存は leagueConfig が古いまま入っているので、設定の球団に合わせる
        if (saveData.leagueConfig) {
          setLeagueConfig(repairLeagueConfig(saveData.leagueConfig, saveData.seasonData?.settings, saveData.gameMode || 'normal'));
        }
        if (saveData.selectedMonth) setSelectedMonth(saveData.selectedMonth);
        // ⚠ 持っていない保存でも**空に戻す**。残すと、直前に遊んでいた別の保存の
        //    殿堂入り・球団の年度成績がそのまま引き継がれて、次の保存に混ざる
        setHallOfFamePlayers(saveData.hallOfFamePlayers || []);
        setTeamHistory(saveData.teamHistory || []);
        // ⚠ ロード直後の月を「前回の節目」として数え直す。古い印のままだと、
        //    ロードしただけで節目が変わったと判断し、**別の保存の進行を入れていた
        //    オートセーブを、いまロードした保存で上書きしていた**
        _prevAutoSaveKey.current = null;
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

        // 戻す画面は保存したときの画面で決める（`resumeTargetOf` の説明を参照）
        const target = resumeTargetOf(saveData);
        setScreenMode(target.screenMode);
        // ⚠ データ編集（タイトルの「編集」）から「ゲームに戻る」ときも、ここで決めた
        //    画面へ戻すこと。ロードの直後に 'edit' で上書きするので、覚えておかないと
        //    日程画面へ戻り、規定の確定（独立リーグはここで日程を作る）を飛ばしていた
        resumeViewRef.current = target.managementView;
        setManagementView(target.managementView);
        setGameFlowState(target.gameFlowState);
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
          // 保存の瞬間の世界（`TEAMS_DATA`）と揃った日付を使う（`seasonDataLiveRef` の説明を参照）
          const liveSeasonData = seasonDataLiveRef.current || seasonData;
          autoSave({
            seasonData: liveSeasonData, leagueConfig, screenMode, managementView,
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

      // 新しく始めるときは、前の保存から持ち越した殿堂入り・年度成績・オートセーブの印を捨てる
      // （タイトルへ戻ってから始め直すと、以前は前のゲームの殿堂入りが新しいゲームに残った）
      React.useEffect(() => {
        if (gameFlowState !== 'newgame_mode_select' && gameFlowState !== 'sandbox_regulations') return;
        setHallOfFamePlayers([]);
        setTeamHistory([]);
        _prevAutoSaveKey.current = null;
      }, [gameFlowState]);

      const deleteSave = async (slotIndex = 0) => {
        const result = await deleteSaveSlot(slotIndex);
        if (result) await refreshSaveSlots();
        return result;
      };

      // [SECTION: MANAGED_GAME] 采配の試合の state と処理 → src/game/useManagedGame.jsx
      const managedGame = useManagedGame({
        allTeams,
        seasonData,
        selectedMonth,
        setManagementView,
        setScreenMode,
        setSeasonData,
        setSelectedMonth,
        userTeamName,
      });
      const {
        setupManagedGame,
      } = managedGame;
      // 試合画面へは、フックの戻り値に App の値を3つ足して渡す
      const managedGameAppProps = {
        seasonData,
        setScreenMode,
        userTeamName,
      };

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
          saveGame={saveGame}
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

      // ⚠ ここはアプリ全体の地色。かつて `from-green-900 to-green-800` の緑だった。
      //    カードは全て surface-* の紺なので、**中身が短い画面では緑の帯が剥き出しになり**
      //    （日程進行のシーズン序盤で 800×460px）、さらに `bg-gray-800/30` のような
      //    半透明のサーフェスが全部この緑の上で合成されて画面全体が緑がかっていた。
      //    地色は最深部（surface-0）にして、サイドバー(surface-1)・カード(surface-2) と
      //    3段の深度を作る。
      // [SECTION: RENDER] メインreturn（試合画面UI・管理シェル）
      return (
        <div className="min-h-screen bg-surface-0">
          {/* オートセーブ完了トースト。
              ⚠ 右**上**に出す。下は取り消せない操作の確認の帯（`ConfirmBar`、下端の中央）の
                 置き場で、狭い幅では帯のボタンの上に重なっていた */}
          {autoSaveFlash && (
            <div className="fixed top-3 right-3 z-[60] bg-gray-900/95 border border-cyan-600/50 text-cyan-200 text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg pointer-events-none">
              💾 オートセーブしました
            </div>
          )}
          {screenMode === 'management' && !FULLSCREEN_MANAGEMENT_VIEWS.includes(managementView) && <Sidebar
            gameMode={gameMode}
            userTeamName={userTeamName}
            seasonData={seasonData}
            formatDate={formatDate}
            screenMode={screenMode}
            managementView={managementView}
            setScreenMode={setScreenMode}
            setManagementView={setManagementView}
          />}

          <div className={screenMode === 'management' && !FULLSCREEN_MANAGEMENT_VIEWS.includes(managementView) ? 'md:ml-56 pt-12 md:pt-0' : ''}>
            {screenMode === 'game' ? (
              <ManagedGameScreen {...managedGame} {...managedGameAppProps} />
            ) : (
              <ManagementScreen
                managementView={managementView}
                setManagementView={setManagementView}
                resumeViewRef={resumeViewRef}
                seasonData={seasonData}
                setSeasonData={setSeasonData}
                setSelectedMonth={setSelectedMonth}
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
                setScreenMode={setScreenMode}
                setGameFlowState={setGameFlowState}
              />
            )}
          </div>
        </div>
      );
    };

export default App;
