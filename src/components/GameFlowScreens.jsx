import React from 'react';
import { TEAMS_DATA, initializeAllPitchingRotations } from '../teams-data.js';
import { SEASON_PHASES } from '../season/seasonManager.js';
import { initializeAllPlayersCondition } from '../game/condition.js';
import { generateAILineup, setRecommendedLineup } from '../game/autoSimulation.js';
import { generateOptimalLineup, generatePitchingRotation, generateAllTeamsLineup } from '../game/lineupGenerator.js';

import StartScreen from './StartScreen.jsx';
import ManualScreen from './ManualScreen.jsx';
import NewGameRegulationsScreen from './NewGameRegulationsScreen.jsx';
import TryoutScreen from './TryoutScreen.jsx';
import CampScreen from './CampScreen.jsx';
import SandboxSetupScreen from './SandboxSetupScreen.jsx';
import { ModeSelectScreen, CorporateTeamSelectScreen, CorporateNameEditScreen } from './CorporateSelectScreen.jsx';

// ゲームフロースタート画面群
const GameFlowScreens = ({
  gameFlowState,
  setGameFlowState,
  gameMode,
  setGameMode,
  seasonData,
  setSeasonData,
  allTeams,
  userTeamName,
  hasSaveData,
  saveSlots,
  loadGame,
  initializeNewGame,
  setScreenMode,
  setManagementView,
  setSelectedMonth
}) => {
  // TITLE: スタート画面
  if (gameFlowState === 'title') {
    return <StartScreen
      onNewGame={() => { setGameMode('normal'); setGameFlowState('newgame_mode_select'); }}
      onSandbox={() => { setGameMode('sandbox'); setGameFlowState('sandbox_regulations'); }}
      onContinue={(slotIndex) => {
        const result = loadGame(slotIndex);
        if (!result?.success) alert(result?.error || 'ロードに失敗しました');
      }}
      onEdit={(slotIndex) => {
        const result = loadGame(slotIndex);
        if (result?.success) {
          setManagementView('edit');
        } else {
          alert(result?.error || 'ロードに失敗しました');
        }
      }}
      onEditCorporateNames={() => setGameFlowState('edit_corporate_names')}
      onManual={() => setGameFlowState('manual')}
      hasSaveData={hasSaveData}
      saveSlots={saveSlots}
    />;
  }

  // MODE SELECT: 独立リーグ / 社会人野球 選択
  if (gameFlowState === 'newgame_mode_select') {
    return <ModeSelectScreen
      onSelectIndependent={() => setGameFlowState('newgame_regulations')}
      onSelectCorporate={() => setGameFlowState('newgame_corporate_select')}
      onBack={() => setGameFlowState('title')}
    />;
  }

  // CORPORATE: 地区・チーム選択
  if (gameFlowState === 'newgame_corporate_select') {
    return <CorporateTeamSelectScreen
      onSelect={(team) => {
        // TODO: 社会人モードの初期化処理を実装
        // 選手自動生成 → ゲーム開始
        console.log('Selected corporate team:', team);
        alert(`${team.name}を選択しました。\n（社会人モードの初期化は次のステップで実装します）`);
      }}
      onBack={() => setGameFlowState('newgame_mode_select')}
    />;
  }

  // MANUAL: ゲーム辞典
  if (gameFlowState === 'manual') {
    return <ManualScreen onBack={() => setGameFlowState('title')} />;
  }

  // EDIT CORPORATE NAMES: 社会人チーム名編集（セーブ不要）
  if (gameFlowState === 'edit_corporate_names') {
    return <CorporateNameEditScreen onBack={() => setGameFlowState('title')} />;
  }

  // NEW GAME: レギュレーション設定
  if (gameFlowState === 'newgame_regulations') {
    return <NewGameRegulationsScreen
      onComplete={(regulations) => {
        initializeNewGame(regulations);
        setGameFlowState('newgame_tryout');
      }}
    />;
  }

  // NEW GAME: 初期トライアウト
  if (gameFlowState === 'newgame_tryout') {
    return <TryoutScreen
      seasonData={seasonData}
      allTeams={allTeams}
      isInitialTryout={true}
      initializeAllPitchingRotations={initializeAllPitchingRotations}
      onComplete={() => {
        setGameFlowState('newgame_camp');
      }}
    />;
  }

  // NEW GAME: キャンプ
  if (gameFlowState === 'newgame_camp') {
    return <CampScreen
      seasonData={seasonData}
      allTeams={allTeams}
      onComplete={() => {
        initializeAllPlayersCondition();
        Object.keys(TEAMS_DATA).forEach(teamName => {
          const teamData = TEAMS_DATA[teamName];
          if (teamData && teamData.players && teamData.players.length > 0) {
            if (teamName === userTeamName) {
              setRecommendedLineup(teamData, teamName);
            } else {
              generateAILineup(teamData, teamName);
            }
          }
        });

        const calYear = 2024 + (seasonData?.year || 1) - 1;
        setSeasonData(prev => ({
          ...prev,
          currentDate: { year: calYear, month: 4, day: 1 },
          phase: SEASON_PHASES.REGULAR_SEASON
        }));
        setSelectedMonth(4);
        setManagementView('dateprogress');
        setScreenMode('management');
        setGameFlowState('season');
      }}
    />;
  }

  // SANDBOX: レギュレーション設定
  if (gameFlowState === 'sandbox_regulations') {
    return <NewGameRegulationsScreen
      onComplete={(regulations) => {
        initializeNewGame(regulations);
        setGameFlowState('sandbox_setup');
      }}
    />;
  }

  // SANDBOX: チーム設定画面
  if (gameFlowState === 'sandbox_setup') {
    return <SandboxSetupScreen
      allTeams={allTeams}
      generateOptimalLineup={generateOptimalLineup}
      generatePitchingRotation={generatePitchingRotation}
      generateAllTeamsLineup={() => generateAllTeamsLineup(allTeams)}
      onComplete={() => {
        initializeAllPlayersCondition();
        Object.keys(TEAMS_DATA).forEach(teamName => {
          const teamData = TEAMS_DATA[teamName];
          if (teamData && teamData.players && teamData.players.length > 0) {
            if (teamName === userTeamName) {
              setRecommendedLineup(teamData, teamName);
            } else {
              generateAILineup(teamData, teamName);
            }
          }
        });

        const calYear = 2024 + (seasonData?.year || 1) - 1;
        setSeasonData(prev => ({
          ...prev,
          currentDate: { year: calYear, month: 4, day: 1 },
          phase: SEASON_PHASES.REGULAR_SEASON
        }));
        setSelectedMonth(4);
        setManagementView('dateprogress');
        setScreenMode('management');
        setGameFlowState('season');
      }}
    />;
  }

  return null;
};

export default GameFlowScreens;
