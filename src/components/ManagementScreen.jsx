import React from 'react';
import { TEAMS_DATA, initializeAllPitchingRotations } from '../teams-data.js';
import { SEASON_PHASES } from '../season/seasonManager.js';
import { generateFullSeasonSchedule } from '../season/scheduleGenerator.js';
import { progressDate } from '../season/dateProgression.js';
import { initializeAllPlayersCondition } from '../game/condition.js';
import { generateAILineup, setRecommendedLineup } from '../game/autoSimulation.js';
import { generateOptimalLineup, generatePitchingRotation, generateAllTeamsLineup } from '../game/lineupGenerator.js';
import { processNPBDraft, snapshotAbilityHistory } from '../season/yearProgressionSystem.js';

import ScheduleScreen from './ScheduleScreen.jsx';
import TryoutScreen from './TryoutScreen.jsx';
import ContractScreen from './ContractScreen.jsx';
import DraftResultScreen from './DraftResultScreen.jsx';
import RosterScreen from './RosterScreen.jsx';
import TeamInfoScreen from './TeamInfoScreen.jsx';
import TradeScreen from './TradeScreen.jsx';
import DateProgressScreen from './DateProgressScreen.jsx';
import OffSeasonScreen from './OffSeasonScreen.jsx';
import RegulationsScreen from './RegulationsScreen.jsx';
import SandboxSetupScreen from './SandboxSetupScreen.jsx';
import CampScreen from './CampScreen.jsx';
import PlayerStatsScreen from './PlayerStatsScreen.jsx';
import HallOfFameScreen from './HallOfFameScreen.jsx';
import SaveLoadScreen from './SaveLoadScreen.jsx';
import EditScreen from './EditScreen.jsx';

const ManagementScreen = ({
  managementView,
  setManagementView,
  seasonData,
  setSeasonData,
  selectedMonth,
  setSelectedMonth,
  scheduleTab,
  setScheduleTab,
  seasonYear,
  currentDate,
  currentPhase,
  leagueStandings,
  userTeamName,
  allTeams,
  gameMode,
  hallOfFamePlayers,
  setHallOfFamePlayers,
  teamHistory,
  setTeamHistory,
  draftResults,
  setDraftResults,
  saveSlots,
  saveGame,
  loadGame,
  deleteSave,
  refreshSaveSlots,
  setupManagedGame,
  advanceDayRef,
  setScreenMode,
  setGameFlowState,
  handleProgressDate,
  handleProgressToNextGame,
  handleProgressToNextPhase
}) => {
  if (managementView === 'schedule') return <ScheduleScreen
    seasonData={seasonData}
    selectedMonth={selectedMonth}
    setSelectedMonth={setSelectedMonth}
    scheduleTab={scheduleTab}
    setScheduleTab={setScheduleTab}
    seasonYear={seasonYear}
    currentDate={currentDate}
    currentPhase={currentPhase}
    leagueStandings={leagueStandings}
    userTeamName={userTeamName}
    onProgressDate={handleProgressDate}
    onProgressToNextGame={handleProgressToNextGame}
    onProgressToNextPhase={handleProgressToNextPhase}
    onStartGame={() => setScreenMode('game')}
  />;
  if (managementView === 'tryout') return <TryoutScreen
    seasonData={seasonData}
    allTeams={allTeams}
    initializeAllPitchingRotations={initializeAllPitchingRotations}
    onComplete={() => {
      const newData = { ...seasonData, currentDate: { ...seasonData.currentDate, month: 11, day: 11 }, phase: 'off_season' };
      setSeasonData(newData);
      setManagementView('dateprogress');
    }}
  />;
  if (managementView === 'contract') return <ContractScreen
    seasonData={seasonData}
    allTeams={allTeams}
    onComplete={() => {
      const newData = progressDate(seasonData, 1);
      setSeasonData({ ...newData, phase: 'tryout' });
      setManagementView('tryout');
    }}
  />;
  if (managementView === 'draft') return <DraftResultScreen
    draftedPlayers={draftResults?.draftedPlayers || []}
    nearMissPlayers={draftResults?.nearMissPlayers || []}
    proBonus={draftResults?.proBonus || []}
    onContinue={() => {
      setDraftResults(null);
      setManagementView('dateprogress');
    }}
  />;
  if (managementView === 'roster') return <RosterScreen />;
  if (managementView === 'teaminfo') return <TeamInfoScreen />;
  if (managementView === 'trade') return <TradeScreen
    userTeamName={userTeamName}
    onBack={() => setManagementView('dateprogress')}
  />;
  if (managementView === 'dateprogress') return <DateProgressScreen
    seasonData={seasonData}
    setSeasonData={setSeasonData}
    onSetupManagedGame={setupManagedGame}
    onRegisterAdvance={(fn) => { advanceDayRef.current = fn; }}
    onForceEvent={(eventType) => {
      if (gameMode === 'sandbox' && (eventType === 'contract' || eventType === 'tryout' || eventType === 'draft')) {
        setManagementView('offseason');
        return;
      }
      if (eventType === 'contract') setManagementView('contract');
      else if (eventType === 'tryout') setManagementView('tryout');
      else if (eventType === 'draft') {
        const results = processNPBDraft(TEAMS_DATA);
        setDraftResults(results);
        if (results.draftedPlayers.length > 0) {
          setHallOfFamePlayers(prev => [...prev, ...results.draftedPlayers.map(d => {
            const p = d.player;
            const draftStats = p ? {
              batting: p.batting ? { meet: p.batting.meet, power: p.batting.power, eye: p.batting.eye, steal: p.batting.steal } : null,
              physical: p.physical ? { speed: p.physical.speed, arm: p.physical.arm } : null,
              fielding: p.fielding ? { defense: p.fielding.defense } : null,
              pitching: p.pitching ? { velocity: p.pitching.velocity, control: p.pitching.control, stamina: p.pitching.stamina, arsenal: p.pitching.arsenal ? JSON.parse(JSON.stringify(p.pitching.arsenal)) : null } : null,
              positionFitness: p.positionFitness ? JSON.parse(JSON.stringify(p.positionFitness)) : null,
              traits: p.traits ? [...p.traits] : null
            } : null;
            return {
              name: d.name,
              position: d.position,
              teamName: d.teamName,
              departureType: 'npb_drafted',
              npbTeam: d.npbTeam,
              draftRound: d.draftRound,
              hallOfFame: d.hallOfFame || false,
              hofReason: d.hofReason,
              reason: `NPBドラフト指名 (${d.npbTeam})`,
              careerStats: d.careerStats,
              draftStats,
              throws: p?.physical?.throws || 'right',
              bats: p?.batting?.bats || 'right',
              age: d.age,
              yearsPlayed: d.yearsPlayed,
              year: seasonData?.year
            };
          })]);
        }
        setManagementView('draft');
      }
      else if (eventType === 'offseason') setManagementView('offseason');
    }}
  />;
  if (managementView === 'offseason') return <OffSeasonScreen
    seasonData={seasonData}
    setSeasonData={setSeasonData}
    gameMode={gameMode}
    onSave={(slotIndex) => { saveGame(slotIndex); refreshSaveSlots(); }}
    saveSlots={saveSlots}
    onStartNextSeason={() => {
      if (gameMode === 'sandbox') {
        setManagementView('sandbox_next_regulations');
      } else {
        setManagementView('regulations_next');
      }
    }}
    onAddHallOfFamePlayers={(newPlayers) => {
      setHallOfFamePlayers(prev => [...prev, ...newPlayers]);
    }}
    onRecordTeamHistory={(historyEntry) => {
      setTeamHistory(prev => [...prev, historyEntry]);
    }}
  />;
  if (managementView === 'sandbox_next_regulations') return <RegulationsScreen
    seasonData={seasonData}
    setSeasonData={setSeasonData}
    onConfirm={() => {
      const teams = Object.keys(TEAMS_DATA);
      const settings = seasonData.settings || {};
      const calendarYear = 2024 + seasonData.year - 1;
      const schedule = generateFullSeasonSchedule({
        teams,
        gamesPerSeason: settings.gamesPerSeason || 60,
        startDate: { year: calendarYear, month: 3, day: 1 },
        endDate: { year: calendarYear, month: 9, day: 30 },
        leagueFormat: settings.leagueFormat || 'single',
        leagueNames: settings.leagueNames
      });
      setSeasonData(prev => ({
        ...prev,
        currentDate: { year: calendarYear, month: 1, day: 1 },
        schedule,
        standings: teams.map(t => ({
          team: t, wins: 0, losses: 0, draws: 0, winRate: 0, gamesPlayed: 0
        }))
      }));
      setManagementView('sandbox_setup');
    }}
  />;
  if (managementView === 'sandbox_setup') return <SandboxSetupScreen
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
            if (!teamData.lineupSettings || !teamData.lineupSettings.battingOrder?.length) {
              setRecommendedLineup(teamData, teamName);
            }
          } else {
            generateAILineup(teamData, teamName);
          }
        }
      });
      snapshotAbilityHistory(TEAMS_DATA, seasonData.year);
      setSeasonData(prev => {
        const calYear = 2024 + prev.year - 1;
        return {
          ...prev,
          currentDate: { year: calYear, month: 4, day: 1 },
          phase: SEASON_PHASES.REGULAR_SEASON
        };
      });
      setSelectedMonth(4);
      setManagementView('dateprogress');
    }}
  />;
  if (managementView === 'regulations_next') return <RegulationsScreen
    seasonData={seasonData}
    setSeasonData={setSeasonData}
    onConfirm={() => {
      const teams = Object.keys(TEAMS_DATA);
      const settings = seasonData.settings || {};
      const calendarYear = 2024 + seasonData.year - 1;
      const schedule = generateFullSeasonSchedule({
        teams,
        gamesPerSeason: settings.gamesPerSeason || 60,
        startDate: { year: calendarYear, month: 3, day: 1 },
        endDate: { year: calendarYear, month: 9, day: 30 },
        leagueFormat: settings.leagueFormat || 'single',
        leagueNames: settings.leagueNames
      });
      setSeasonData(prev => ({
        ...prev,
        currentDate: { year: calendarYear, month: 1, day: 1 },
        schedule,
        standings: teams.map(t => ({
          team: t, wins: 0, losses: 0, draws: 0, winRate: 0, gamesPlayed: 0
        }))
      }));
      setManagementView('camp');
    }}
  />;
  if (managementView === 'camp') return <CampScreen
    seasonData={seasonData}
    allTeams={allTeams}
    onComplete={() => {
      Object.keys(TEAMS_DATA).forEach(teamName => {
        const teamData = TEAMS_DATA[teamName];
        if (teamData && teamData.players && teamData.players.length > 0) {
          if (teamName === userTeamName) {
            if (!teamData.lineupSettings || !teamData.lineupSettings.battingOrder?.length) {
              setRecommendedLineup(teamData, teamName);
            }
          } else {
            generateAILineup(teamData, teamName);
          }
        }
      });
      snapshotAbilityHistory(TEAMS_DATA, seasonData.year);
      setSeasonData(prev => {
        const calYear = 2024 + prev.year - 1;
        return {
          ...prev,
          currentDate: { year: calYear, month: 4, day: 1 },
          phase: SEASON_PHASES.REGULAR_SEASON
        };
      });
      setSelectedMonth(4);
      setManagementView('dateprogress');
    }}
  />;
  if (managementView === 'stats') return <PlayerStatsScreen
    seasonData={seasonData}
    allTeams={allTeams}
    userTeamName={userTeamName}
  />;
  if (managementView === 'halloffame') return <HallOfFameScreen
    hallOfFamePlayers={hallOfFamePlayers}
    allTeams={TEAMS_DATA}
    teamHistory={teamHistory}
    seasonData={seasonData}
    onClose={() => setManagementView('dateprogress')}
  />;
  if (managementView === 'save') return <SaveLoadScreen
    onSave={saveGame}
    onLoad={loadGame}
    onDelete={deleteSave}
    saveSlots={saveSlots}
    seasonData={seasonData}
    onReturnToTitle={() => {
      setScreenMode('start');
      setGameFlowState('title');
    }}
  />;
  if (managementView === 'regulations') return <RegulationsScreen
    seasonData={seasonData}
    setSeasonData={setSeasonData}
  />;
  if (managementView === 'edit') return <EditScreen
    generateOptimalLineup={generateOptimalLineup}
    generatePitchingRotation={generatePitchingRotation}
    generateAllTeamsLineup={() => generateAllTeamsLineup(allTeams)}
    allTeams={allTeams}
  />;
  return <div className="p-8 text-white">準備中...</div>;
};

export default ManagementScreen;
