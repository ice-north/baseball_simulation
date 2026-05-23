import React from 'react';
import { TEAMS_DATA, initializeAllPitchingRotations } from '../teams-data.js';
import { SEASON_PHASES, createSeasonData, initializeStandings } from '../season/seasonManager.js';
import { initializeAllPlayersCondition } from '../game/condition.js';
import { generateAILineup, setRecommendedLineup } from '../game/autoSimulation.js';
import { generateOptimalLineup, generatePitchingRotation, generateAllTeamsLineup } from '../game/lineupGenerator.js';
import { initializeCorporateGame, initializeParallelWorldForIndependent } from '../corporate/corporateInit.js';

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
  setSelectedMonth,
  setLeagueConfig
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
        setGameMode('corporate');
        setGameFlowState('corporate_loading');
        setTimeout(() => {
          const result = initializeCorporateGame(team);
          const teamNames = result.allTeamNames;
          const teamCount = teamNames.length;

          setLeagueConfig({
            format: 'single',
            teamsPerLeague: teamCount,
            leagues: [{ name: '社会人リーグ', teams: teamNames }]
          });

          const newSeasonData = createSeasonData(1);
          newSeasonData.settings = {
            teamsCount: teamCount,
            teamNames: teamNames,
            teamAbbreviations: teamNames.map(n => n.length <= 3 ? n : (/^[A-Za-z]/.test(n) ? n.slice(0, 3).toUpperCase() : n.slice(0, 3))),
            gamesPerSeason: 0,
            useDH: true,
            leagueFormat: 'single',
            corporateMode: true,
            corporateTeamId: team.id,
          };

          newSeasonData.schedule = [];
          newSeasonData.standings = initializeStandings(teamNames);
          setSeasonData(newSeasonData);
          setGameFlowState('corporate_camp');
        }, 50);
      }}
      onBack={() => setGameFlowState('newgame_mode_select')}
    />;
  }

  // CORPORATE: ローディング画面
  if (gameFlowState === 'corporate_loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⚾</div>
          <div className="text-white text-xl font-bold mb-2">全チームを初期化中...</div>
          <div className="text-gray-400 text-sm">179チームの選手を生成しています</div>
          <div className="mt-4 w-48 h-1 bg-gray-700 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{width: '60%'}}></div>
          </div>
        </div>
      </div>
    );
  }

  // CORPORATE: キャンプ
  if (gameFlowState === 'corporate_camp') {
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
        if (regulations.preset) {
          setGameFlowState('independent_loading');
          setTimeout(() => {
            const teamNames = Object.keys(TEAMS_DATA).filter(name => {
              const team = TEAMS_DATA[name];
              return team && !team.corporateTeamId && !team.independentLeagueId;
            });
            initializeParallelWorldForIndependent(regulations.preset, teamNames);
            setGameFlowState('newgame_tryout');
          }, 50);
        } else {
          setGameFlowState('newgame_tryout');
        }
      }}
    />;
  }

  // INDEPENDENT: ローディング画面（平行世界の生成）
  if (gameFlowState === 'independent_loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⚾</div>
          <div className="text-white text-xl font-bold mb-2">平行世界を初期化中...</div>
          <div className="text-gray-400 text-sm">社会人チーム179チーム＋独立リーグの選手を生成しています</div>
          <div className="mt-4 w-48 h-1 bg-gray-700 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-green-500 rounded-full animate-pulse" style={{width: '60%'}}></div>
          </div>
        </div>
      </div>
    );
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
