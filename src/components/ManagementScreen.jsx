import React, { useState } from 'react';
import { TEAMS_DATA, initializeAllPitchingRotations, releasedPlayersPool } from '../teams-data.js';
import { SEASON_PHASES } from '../season/seasonManager.js';
import { generateFullSeasonSchedule } from '../season/scheduleGenerator.js';
import { progressDate } from '../season/dateProgression.js';
import { initializeAllPlayersCondition } from '../game/condition.js';
import { generateAILineup, setRecommendedLineup } from '../game/autoSimulation.js';
import { generateOptimalLineup, generatePitchingRotation, generateAllTeamsLineup } from '../game/lineupGenerator.js';
import { processNPBDraft, processSeasonEnd, snapshotRankings, snapshotAbilityHistory } from '../season/yearProgressionSystem.js';
import { generateExpansionRoster } from '../season/tryoutSystem.js';
import { generateRegionalTournament } from '../corporate/toshitaikou.js';

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
import { ToshitaikouQualifierScreen, ToshitaikouMainScreen } from './ToshitaikouScreen.jsx';
import CorporateDepartureScreen from './CorporateDepartureScreen.jsx';
import AbilityRankingScreen from './AbilityRankingScreen.jsx';
import CorporateScoutScreen from './CorporateScoutScreen.jsx';
import CorporateManagementScreen from './CorporateManagementScreen.jsx';
import ClubRecruitScreen from './ClubRecruitScreen.jsx';
import BudgetSettlementScreen from './BudgetSettlementScreen.jsx';
import UniversityScoutScreen from './UniversityScoutScreen.jsx';
import PlayerSearchScreen from './PlayerSearchScreen.jsx';

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
  const draftedIds = seasonData?.draftedPlayerIds || [];
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
  if (managementView === 'corporate_departure') return <CorporateDepartureScreen
    seasonData={seasonData}
    allTeams={allTeams}
    onComplete={() => {
      const newData = progressDate(seasonData, 1);
      setSeasonData({ ...newData, phase: 'tryout' });
      setManagementView(seasonData?.settings?.clubMode ? 'club_recruit' : 'corporate_scout');
    }}
  />;
  if (managementView === 'corporate_scout') return <CorporateScoutScreen
    seasonData={seasonData}
    allTeams={allTeams}
    draftedPlayerIds={draftedIds}
    onComplete={() => {
      // 完了済みスカウトミッションをクリア（翌年の派遣用にリセット）
      const ut = TEAMS_DATA[userTeamName];
      if (ut?.corporateData?.scoutMissions) {
        ut.corporateData.scoutMissions = [];
      }
      const newData = { ...seasonData, currentDate: { ...seasonData.currentDate, month: 11, day: 11 }, phase: 'off_season' };
      setSeasonData(newData);
      setManagementView('dateprogress');
    }}
  />;
  if (managementView === 'club_recruit') return <ClubRecruitScreen
    seasonData={seasonData}
    onComplete={() => {
      const newData = { ...seasonData, currentDate: { ...seasonData.currentDate, month: 11, day: 11 }, phase: 'off_season' };
      setSeasonData(newData);
      setManagementView('dateprogress');
    }}
  />;
  if (managementView === 'university_scout') {
    const isForced = seasonData.currentDate?.month === 11 && seasonData.currentDate?.day >= 10;
    return <UniversityScoutScreen
      seasonData={seasonData}
      onBack={!isForced ? () => setManagementView('dateprogress') : null}
      onComplete={isForced ? (result) => {
        const recommended = result?.recommended || [];
        const selection = result?.selection || [];
        const newData = {
          ...seasonData,
          currentDate: { ...seasonData.currentDate, month: 11, day: 15 },
          phase: 'off_season',
          universityRecruits: [
            ...recommended.map(p => ({ id: p.id, name: p.name, position: p.position, source: p._scoutSource, type: 'recommended' })),
            ...selection.map(p => ({ id: p.id, name: p.name, position: p.position, source: p.highSchool?.name || '高校', type: 'selection' })),
          ],
        };
        setSeasonData(newData);
        setManagementView('dateprogress');
      } : null}
    />;
  }
  if (managementView === 'budget_settlement') return <BudgetSettlementScreen
    seasonData={seasonData}
    onComplete={(penalties) => {
      const newData = {
        ...seasonData,
        phase: 'off_season',
        ...(penalties && penalties.length > 0 ? { deficitPenalties: penalties } : {}),
      };
      setSeasonData(newData);
      setManagementView('offseason');
    }}
  />;
  if (managementView === 'draft') return <DraftResultScreen
    draftedPlayers={draftResults?.draftedPlayers || []}
    nearMissPlayers={draftResults?.nearMissPlayers || []}
    proBonus={draftResults?.proBonus || []}
    draftBySource={draftResults?.draftBySource || null}
    firstRoundData={draftResults?.firstRoundData || null}
    npbStandings={draftResults?.npbStandings || null}
    userTeamName={userTeamName}
    onContinue={() => {
      if (draftResults?.draftedPlayers) {
        const ids = draftResults.draftedPlayers.map(d => d.playerId);
        setSeasonData(prev => ({ ...prev, draftedPlayerIds: ids }));
      }
      setDraftResults(null);
      setManagementView('dateprogress');
    }}
  />;
  if (managementView === 'corporate_management') return <CorporateManagementScreen
    seasonData={seasonData}
    gameMode={gameMode}
  />;
  if (managementView === 'player_search') return <PlayerSearchScreen
    onBack={() => setManagementView('dateprogress')}
  />;
  if (managementView === 'roster') return <RosterScreen seasonData={seasonData} gameMode={gameMode} />;
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
      if (gameMode === 'sandbox' && (eventType === 'contract' || eventType === 'tryout' || eventType === 'draft' || eventType === 'corporate_departure' || eventType === 'corporate_scout' || eventType === 'club_recruit' || eventType === 'budget_settlement' || eventType === 'university_scout')) {
        const update = {};
        if (!seasonData.frozenAwards) update.frozenAwards = processSeasonEnd(seasonData, TEAMS_DATA);
        if (!seasonData.finalRankings) update.finalRankings = snapshotRankings(TEAMS_DATA);
        if (Object.keys(update).length > 0) setSeasonData(prev => ({ ...prev, ...update }));
        setManagementView('offseason');
        return;
      }
      if (eventType === 'contract') setManagementView('contract');
      else if (eventType === 'corporate_departure') setManagementView('corporate_departure');
      else if (eventType === 'corporate_scout') setManagementView('corporate_scout');
      else if (eventType === 'club_recruit') setManagementView('club_recruit');
      else if (eventType === 'university_scout') setManagementView('university_scout');
      else if (eventType === 'budget_settlement') setManagementView('budget_settlement');
      else if (eventType === 'tryout') setManagementView('tryout');
      else if (eventType === 'draft') {
        // プロ指名で選手が消える前にランキング・表彰を確定する
        const preUpdate = {};
        if (!seasonData.frozenAwards) preUpdate.frozenAwards = processSeasonEnd(seasonData, TEAMS_DATA);
        if (!seasonData.finalRankings) preUpdate.finalRankings = snapshotRankings(TEAMS_DATA);
        if (Object.keys(preUpdate).length > 0) setSeasonData(prev => ({ ...prev, ...preUpdate }));
        const results = processNPBDraft(TEAMS_DATA, seasonData.year);
        setDraftResults(results);
        // 大学モード: ドラフト指名された大学チーム選手をseasonDataに記録
        if (seasonData.settings?.universityMode && results.draftedPlayers.length > 0) {
          const uniTeamNames = new Set(seasonData.settings.teamNames || []);
          const uniDrafted = results.draftedPlayers
            .filter(d => uniTeamNames.has(d.teamName) || d.source === 'university_team')
            .map(d => ({ name: d.name, team: d.teamName, position: d.position, npbTeam: d.npbTeam, draftRound: d.draftRound }));
          if (uniDrafted.length > 0) {
            setSeasonData(prev => ({ ...prev, universityNpbDrafted: uniDrafted }));
          }
        }
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
              year: seasonData?.year,
              source: d.source || null,
              draftInfo: p?.draftInfo || null
            };
          })]);
        }
        setManagementView('draft');
      }
      else if (eventType === 'offseason') {
        const update = {};
        if (!seasonData.frozenAwards) update.frozenAwards = processSeasonEnd(seasonData, TEAMS_DATA);
        if (!seasonData.finalRankings) update.finalRankings = snapshotRankings(TEAMS_DATA);
        if (Object.keys(update).length > 0) setSeasonData(prev => ({ ...prev, ...update }));
        setManagementView('offseason');
      }
    }}
  />;
  if (managementView === 'offseason') return <OffSeasonScreen
    seasonData={seasonData}
    setSeasonData={setSeasonData}
    gameMode={gameMode}
    onSave={async (slotIndex) => { await saveGame(slotIndex); }}
    saveSlots={saveSlots}
    onStartNextSeason={() => {
      if (gameMode === 'sandbox') {
        setManagementView('sandbox_next_regulations');
      } else if (gameMode === 'university' || gameMode === 'corporate') {
        if (seasonData?.settings?.clubMode) {
          // クラブチームはキャンプなし → 直接シーズンへ
          initializeAllPlayersCondition();
          Object.keys(TEAMS_DATA).forEach(teamName => {
            const teamData = TEAMS_DATA[teamName];
            if (teamData && teamData.players && teamData.players.length > 0) {
              if (!teamData.pitchingRotation || !teamData.pitchingRotation.starters?.length) {
                generatePitchingRotation(teamName);
              }
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
          const calYear = 2024 + (seasonData?.year || 1) - 1;
          const rtSeeds = seasonData?.tournamentSeeds || null;
          const rt = generateRegionalTournament({ userTeamName, calendarYear: calYear, seeds: rtSeeds });
          setSeasonData(prev => ({
            ...prev,
            currentDate: { year: calYear, month: 4, day: 1 },
            phase: SEASON_PHASES.REGULAR_SEASON,
            regionalTournament: { ...rt, generated: true },
          }));
          setSelectedMonth(4);
          setManagementView('dateprogress');
        } else {
          setManagementView('camp');
        }
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
    onConfirm={(confirmedSettings) => {
      const settings = confirmedSettings || seasonData.settings || {};
      const calendarYear = 2024 + seasonData.year - 1;
      const configuredTeams = settings.teamNames || [];

      // 新チーム追加
      const existingTeams = new Set(Object.keys(TEAMS_DATA));
      const newTeamNames = configuredTeams.filter(t => !existingTeams.has(t));
      if (newTeamNames.length > 0) {
        const abbrs = settings.teamAbbreviations || [];
        newTeamNames.forEach(teamName => {
          const idx = configuredTeams.indexOf(teamName);
          const abbr = abbrs[idx] || teamName.slice(0, 3);
          TEAMS_DATA[teamName] = {
            name: teamName,
            abbreviation: abbr,
            players: generateExpansionRoster(seasonData.year || 1, 24),
            pitchingRotation: null
          };
          generatePitchingRotation(teamName);
        });
      }

      // 解散チーム処理
      const configuredSet = new Set(configuredTeams);
      const dissolvedTeamNames = Object.keys(TEAMS_DATA).filter(t => configuredTeams.length > 0 && !configuredSet.has(t));
      let dissolvedPlayerCount = 0;
      if (dissolvedTeamNames.length > 0) {
        dissolvedTeamNames.forEach(teamName => {
          const teamData = TEAMS_DATA[teamName];
          if (teamData && teamData.players) {
            teamData.players.forEach(player => {
              releasedPlayersPool.push({
                ...JSON.parse(JSON.stringify(player)),
                formerTeam: teamName,
                attemptsInPool: 0
              });
              dissolvedPlayerCount++;
            });
          }
          delete TEAMS_DATA[teamName];
        });
      }

      const teams = configuredTeams.length > 0 ? configuredTeams : Object.keys(TEAMS_DATA);
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
      const alerts = [];
      if (newTeamNames.length > 0) {
        alerts.push(`新規参入チーム（${newTeamNames.join('、')}）にロスター24人を自動編成しました`);
      }
      if (dissolvedTeamNames.length > 0) {
        alerts.push(`${dissolvedTeamNames.join('、')}が解散しました。所属${dissolvedPlayerCount}名の選手はフリーエージェントプールに移動し、次回トライアウトに参加します`);
      }
      if (alerts.length > 0) {
        alert(alerts.join('\n\n'));
      }
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
          if (!teamData.pitchingRotation || !teamData.pitchingRotation.starters?.length) {
            generatePitchingRotation(teamName);
          }
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
    onConfirm={(confirmedSettings) => {
      const settings = confirmedSettings || seasonData.settings || {};
      const calendarYear = 2024 + seasonData.year - 1;

      // 新チーム検出: settings.teamNamesにあるがTEAMS_DATAに存在しないチーム
      const configuredTeams = settings.teamNames || [];
      const existingTeams = new Set(Object.keys(TEAMS_DATA));
      const newTeamNames = configuredTeams.filter(t => !existingTeams.has(t));

      if (newTeamNames.length > 0) {
        const abbrs = settings.teamAbbreviations || [];
        newTeamNames.forEach(teamName => {
          const idx = configuredTeams.indexOf(teamName);
          const abbr = abbrs[idx] || teamName.slice(0, 3);
          TEAMS_DATA[teamName] = {
            name: teamName,
            abbreviation: abbr,
            players: generateExpansionRoster(seasonData.year || 1, 24),
            pitchingRotation: null
          };
          generatePitchingRotation(teamName);
        });
      }

      // 解散チーム検出: TEAMS_DATAにあるがsettings.teamNamesに存在しないチーム
      const configuredSet = new Set(configuredTeams);
      const dissolvedTeamNames = Object.keys(TEAMS_DATA).filter(t => configuredTeams.length > 0 && !configuredSet.has(t));
      let dissolvedPlayerCount = 0;

      if (dissolvedTeamNames.length > 0) {
        dissolvedTeamNames.forEach(teamName => {
          const teamData = TEAMS_DATA[teamName];
          if (teamData && teamData.players) {
            teamData.players.forEach(player => {
              releasedPlayersPool.push({
                ...JSON.parse(JSON.stringify(player)),
                formerTeam: teamName,
                attemptsInPool: 0
              });
              dissolvedPlayerCount++;
            });
          }
          delete TEAMS_DATA[teamName];
        });
      }

      const teams = configuredTeams.length > 0 ? configuredTeams : Object.keys(TEAMS_DATA);
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
      const alerts = [];
      if (newTeamNames.length > 0) {
        alerts.push(`新規参入チーム（${newTeamNames.join('、')}）にロスター24人を自動編成しました`);
      }
      if (dissolvedTeamNames.length > 0) {
        alerts.push(`${dissolvedTeamNames.join('、')}が解散しました。所属${dissolvedPlayerCount}名の選手はフリーエージェントプールに移動し、次回トライアウトに参加します`);
      }
      if (alerts.length > 0) {
        alert(alerts.join('\n\n'));
      }
      setManagementView('camp');
    }}
  />;
  if (managementView === 'camp') return <CampScreen
    seasonData={seasonData}
    allTeams={allTeams}
    gameMode={gameMode}
    onComplete={() => {
      Object.keys(TEAMS_DATA).forEach(teamName => {
        const teamData = TEAMS_DATA[teamName];
        if (teamData && teamData.players && teamData.players.length > 0) {
          if (!teamData.pitchingRotation || !teamData.pitchingRotation.starters?.length) {
            generatePitchingRotation(teamName);
          }
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
  if (managementView === 'ranking') return <AbilityRankingScreen />;
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
  if (managementView === 'toshitaikou_qualifier') return <ToshitaikouQualifierScreen
    toshitaikou={seasonData?.toshitaikou}
    userTeamName={userTeamName}
    onContinue={() => setManagementView('dateprogress')}
  />;
  if (managementView === 'toshitaikou_main') return <ToshitaikouMainScreen
    toshitaikou={seasonData?.toshitaikou}
    userTeamName={userTeamName}
    onContinue={() => setManagementView('dateprogress')}
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
