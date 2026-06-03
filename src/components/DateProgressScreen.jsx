import React, { useState, useEffect, useMemo } from 'react';
import { TEAMS_DATA, LEAGUE_SETTINGS, getTeamAbbreviation } from '../teams-data.js';
import { PHASE_INFO, SEASON_PHASES, formatDate, getDayOfWeek, getCurrentPhase } from '../season/seasonManager.js';
import { getScheduleByDate } from '../season/scheduleGenerator.js';
import { progressDate, handlePhaseTransition, updatePlayoffProgress } from '../season/dateProgression.js';
import { autoSimulateGame } from '../game/autoSimulation.js';
import { generateToshitaikou, createMainTournament, autoPlayMainTournament, getRoundName, getUserNextMatch, simulateQualifierOnDate, simulateMainTournamentOnDate, getUserMatchOnDate, getTournamentDatesForCalendar, simulateQuickMatch, recordResult as recordTournamentResult, generateNihonSenshuken, simulateNihonSenshukenOnDate, getUserNihonSenshukenMatchOnDate, getNihonSenshukenDatesForCalendar, createSenshukenMainTournament } from '../corporate/toshitaikou.js';
import { simulateParallelWorldDate, getAllParallelLeagues, getAllUniversityLeagues } from '../corporate/parallelWorldManager.js';
import { generateAprilHighSchoolClass } from '../season/yearProgressionSystem.js';
import { WORLD_DATA } from '../corporate/worldData.js';
import { INDEPENDENT_LEAGUES } from '../corporate/independentLeagueData.js';
import { CONDITION_LEVELS, CONDITION_LABELS, CONDITION_COLORS, CONDITION_ICONS } from '../game/condition.js';
import { POSITION_NAMES } from '../utils/constants.js';
import { formatInnings } from '../utils/physics.js';
import { checkScoutMissionCompletion, SCOUT_TARGETS } from '../corporate/scoutingSystem.js';

const DateProgressScreen = ({ seasonData, setSeasonData, onForceEvent, onSetupManagedGame, onRegisterAdvance }) => {
  const [selectedMonth, setSelectedMonth] = useState(seasonData?.currentDate?.month || 4);
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastGameResults, setLastGameResults] = useState([]);
  const [showGameChoiceModal, setShowGameChoiceModal] = useState(false);  // 試合選択モーダル
  const [rankingLeague, setRankingLeague] = useState('all');
  const [selectedRegionTab, setSelectedRegionTab] = useState(null);
  const [selectedBracketTab, setSelectedBracketTab] = useState('main');
  const [isGeneratingTournament, setIsGeneratingTournament] = useState(false);
  const [showTournamentMatchModal, setShowTournamentMatchModal] = useState(null);
  const [scoutReportNotifications, setScoutReportNotifications] = useState([]);
  const [showOtherLeagues, setShowOtherLeagues] = useState(false);
  const [showUniversityLeagues, setShowUniversityLeagues] = useState(false);
  const [expandedUniLeagues, setExpandedUniLeagues] = useState({});

  if (!seasonData) return <div className="p-8 text-white">読み込み中...</div>;

  const userTeamName = Object.keys(TEAMS_DATA || {})[0] || 'チームA';
  const currentPhase = seasonData.phase || 'off_season';
  const phaseInfo = PHASE_INFO[currentPhase] || { name: '', color: 'bg-gray-100', description: '' };

  const getStartingPitcher = (teamName) => {
    const team = TEAMS_DATA[teamName];
    if (!team || !team.pitchingRotation || !team.pitchingRotation.starters) return null;
    const rotation = team.pitchingRotation;
    const index = rotation.currentStarterIndex || 0;
    const starterId = rotation.starters[index];
    return team.players.find(p => p.id === starterId);
  };

  const determinePitcherDecisions = (gameResult, homeTeamData, awayTeamData) => {
    const decisions = { winningPitcher: null, losingPitcher: null, savePitcher: null, holdPitchers: [] };
    if (!gameResult || gameResult.homeScore === gameResult.awayScore) return decisions;
    const isHomeWin = gameResult.homeScore > gameResult.awayScore;
    const winningTeam = isHomeWin ? gameResult.homeTeam : gameResult.awayTeam;
    const losingTeam = isHomeWin ? gameResult.awayTeam : gameResult.homeTeam;
    if (!winningTeam || !losingTeam) return decisions;

    const winPitchers = winningTeam.players.filter(p => p.gameStats?.pitching?.outs > 0);
    const losePitchers = losingTeam.players.filter(p => p.gameStats?.pitching?.outs > 0);
    if (winPitchers.length === 0 || losePitchers.length === 0) return decisions;

    // 勝ち投手: 先発が5回以上投げてチームが最後までリードを守れば先発の勝ち
    // そうでなければ、リードを奪った時点で投げていたリリーフ（最多投球回の中継ぎ）
    const winStarter = winPitchers.find(p => p.battingOrder === 9 || (p.position === 'pitcher' && p.battingOrder === 0));
    if (winStarter && winStarter.gameStats.pitching.outs >= 15) {
      decisions.winningPitcher = winStarter;
    } else {
      const relievers = winPitchers.filter(p => p !== winStarter || (winStarter && winStarter.gameStats.pitching.outs < 15));
      if (relievers.length > 0) {
        relievers.sort((a, b) => b.gameStats.pitching.outs - a.gameStats.pitching.outs);
        decisions.winningPitcher = relievers[0];
      } else if (winPitchers.length > 0) {
        decisions.winningPitcher = winPitchers[0];
      }
    }

    // 負け投手: 先発が失点していれば先発、そうでなければ最多失点のリリーフ
    const loseStarter = losePitchers.find(p => p.battingOrder === 9 || (p.position === 'pitcher' && p.battingOrder === 0));
    if (loseStarter && (loseStarter.gameStats?.pitching?.runsAllowed || 0) > 0) {
      decisions.losingPitcher = loseStarter;
    } else {
      losePitchers.sort((a, b) => b.gameStats.pitching.runsAllowed - a.gameStats.pitching.runsAllowed);
      decisions.losingPitcher = losePitchers[0];
    }

    // セーブ: 以下の条件をすべて満たすリリーフ
    // 1) 勝ちチームの最後の投手 2) 勝ち投手ではない 3) 以下のいずれか:
    //    a) 3点差以内でリード時に登板し1回以上投げた
    //    b) 同点の走者を出塁させた状態で登板
    //    c) 3イニング以上投げた
    const scoreDiff = Math.abs(gameResult.homeScore - gameResult.awayScore);
    if (winPitchers.length > 1) {
      const lastPitcher = winPitchers[winPitchers.length - 1];
      if (lastPitcher && lastPitcher !== decisions.winningPitcher) {
        const outs = lastPitcher.gameStats.pitching.outs;
        if ((scoreDiff <= 3 && outs >= 3) || outs >= 9) {
          decisions.savePitcher = lastPitcher;
        }
      }
    }

    // ホールド: 勝ちチームのリリーフで、勝ち投手でもセーブ投手でもなく、
    // リードを保って次の投手に繋いだ投手（1アウト以上取得）
    winPitchers.forEach(p => {
      if (p !== decisions.winningPitcher && p !== decisions.savePitcher && p.gameStats.pitching.outs >= 1) {
        // 先発投手はホールド対象外
        if (winStarter === p) return;
        decisions.holdPitchers.push(p);
      }
    });

    return decisions;
  };

  const recordPitcherDecision = (pitcher, stat, gameHome, gameAway, isHomeWin) => {
    const teamName = stat === 'losses' ? (isHomeWin ? gameAway : gameHome) : (isHomeWin ? gameHome : gameAway);
    const teamData = TEAMS_DATA[teamName];
    if (teamData) {
      const p = teamData.players.find(pl => pl.id === pitcher.id);
      if (p) { p.seasonStats.pitching[stat] = (p.seasonStats.pitching[stat] || 0) + 1; }
    }
  };

  const simulateGamesOnDate = (sData) => {
    const gamesOnDate = getScheduleByDate(sData.schedule, sData.currentDate);
    if (gamesOnDate.length === 0) return { data: sData, results: [] };
    let updatedSchedule = [...sData.schedule];
    let updatedStandings = [...sData.standings];
    let updatedResults = [...sData.results];
    const gameResults = [];
    gamesOnDate.forEach(game => {
      if (game.result) return;
      const homeTeam = TEAMS_DATA[game.home];
      const awayTeam = TEAMS_DATA[game.away];
      if (!homeTeam || !awayTeam) return;
      const result = autoSimulateGame(game.home, game.away);
      const decisions = determinePitcherDecisions(result, homeTeam, awayTeam);
      const isHomeWin = result.homeScore > result.awayScore;
      if (decisions.winningPitcher) recordPitcherDecision(decisions.winningPitcher, 'wins', game.home, game.away, isHomeWin);
      if (decisions.losingPitcher) recordPitcherDecision(decisions.losingPitcher, 'losses', game.home, game.away, isHomeWin);
      if (decisions.savePitcher) recordPitcherDecision(decisions.savePitcher, 'saves', game.home, game.away, isHomeWin);
      decisions.holdPitchers.forEach(hp => recordPitcherDecision(hp, 'holds', game.home, game.away, isHomeWin));
      const scheduleIndex = updatedSchedule.findIndex(g => g.id === game.id);
      const resultWithChanges = { ...result, pitcherChanges: result.pitcherChanges || [] };
      if (scheduleIndex !== -1) updatedSchedule[scheduleIndex] = { ...game, result: resultWithChanges };
      gameResults.push({ gameId: game.id, home: game.home, away: game.away, homeScore: result.homeScore, awayScore: result.awayScore, winner: result.winner, decisions, pitcherChanges: result.pitcherChanges || [] });
      updatedResults.push({ gameId: game.id, date: { ...sData.currentDate }, home: game.home, away: game.away, result: resultWithChanges });
      const standingHome = updatedStandings.find(s => s.team === game.home);
      const standingAway = updatedStandings.find(s => s.team === game.away);
      if (standingHome && standingAway) {
        standingHome.gamesPlayed++; standingAway.gamesPlayed++;
        if (result.homeScore > result.awayScore) { standingHome.wins++; standingAway.losses++; }
        else if (result.awayScore > result.homeScore) { standingAway.wins++; standingHome.losses++; }
        else { standingHome.draws = (standingHome.draws || 0) + 1; standingAway.draws = (standingAway.draws || 0) + 1; }
        standingHome.winRate = standingHome.gamesPlayed > 0 ? standingHome.wins / standingHome.gamesPlayed : 0;
        standingAway.winRate = standingAway.gamesPlayed > 0 ? standingAway.wins / standingAway.gamesPlayed : 0;
      }
    });
    updatedStandings.sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
    let updatedData = { ...sData, schedule: updatedSchedule, standings: updatedStandings, results: updatedResults };
    // プレーオフ進行を更新（シリーズ決着・TBD確定）
    if (sData.phase === SEASON_PHASES.PLAYOFFS) {
      updatedData = updatePlayoffProgress(updatedData);
    }
    return { data: updatedData, results: gameResults };
  };

  const checkAndTriggerEvents = (oldData, newData) => {
    const oldPhase = oldData.phase;
    const newPhase = newData.phase;
    if (oldPhase !== newPhase) {
      newData = handlePhaseTransition(newData, newPhase);
    }
    const { month, day } = newData.currentDate;
    const isCorporate = newData.settings?.corporateMode;

    // 4月1日: 高校3年生を生成
    if (month === 4 && day <= 3 && !newData._highSchoolGenerated) {
      const gameYear = newData.settings?.year || seasonData?.year || 1;
      generateAprilHighSchoolClass(gameYear);
      newData = { ...newData, _highSchoolGenerated: true };
    }

    if (isCorporate && month >= 6 && !newData.toshitaikou?.generated) {
      setSeasonData(newData);
      setIsGeneratingTournament(true);
      setTimeout(() => {
        const calYear = newData.currentDate.year;
        const tournament = generateToshitaikou({ userTeamName, calendarYear: calYear });
        const updated = { ...newData, toshitaikou: { ...tournament, generated: true, qualifiersDone: false, mainDone: false } };
        if (tournament.userRegionId) setSelectedRegionTab(tournament.userRegionId);
        setSeasonData(updated);
        setIsGeneratingTournament(false);
      }, 50);
      return newData;
    }

    if (isCorporate && month >= 8 && newData.toshitaikou?.qualifiersDone && !newData.toshitaikou?.mainDone && !newData.toshitaikou?.mainTournament) {
      setSeasonData(newData);
      setIsGeneratingTournament(true);
      setTimeout(() => {
        const td = newData.toshitaikou;
        const prevChamp = td.prevChampion || null;
        const calYear = newData.currentDate.year;
        const mainTournament = createMainTournament(td.qualifiers, prevChamp, calYear);
        const updated = { ...newData, toshitaikou: { ...td, mainTournament, mainDone: false } };
        setSeasonData(updated);
        setIsGeneratingTournament(false);
      }, 50);
      return newData;
    }

    // 日本選手権（4月から予選（週末のみ）、11月に本戦）
    if (isCorporate && month >= 4 && !newData.nihonSenshuken?.generated) {
      setSeasonData(newData);
      setIsGeneratingTournament(true);
      setTimeout(() => {
        const calYear = newData.currentDate.year;
        const ns = generateNihonSenshuken({
          userTeamName,
          calendarYear: calYear,
        });
        const updated = { ...newData, nihonSenshuken: { ...ns, generated: true } };
        setSeasonData(updated);
        setIsGeneratingTournament(false);
      }, 50);
      return newData;
    }

    // 日本選手権: 予選終了 → 本戦生成
    if (isCorporate && newData.nihonSenshuken?.generated && newData.nihonSenshuken.phase === 'qualifiers_done' && !newData.nihonSenshuken.mainTournament) {
      setSeasonData(newData);
      setIsGeneratingTournament(true);
      setTimeout(() => {
        const ns = newData.nihonSenshuken;
        const calYear = newData.currentDate.year;
        const mainTournament = createSenshukenMainTournament(ns.qualifiers, calYear);
        const updated = { ...newData, nihonSenshuken: { ...ns, mainTournament, phase: 'main' } };
        setSeasonData(updated);
        setIsGeneratingTournament(false);
      }, 50);
      return newData;
    }

    // 独立リーグモード: 社会人都市対抗をバックグラウンドで自動処理
    if (!isCorporate && WORLD_DATA.initialized && WORLD_DATA.mode === 'independent') {
      if (month >= 6 && !WORLD_DATA.corporateToshitaikou?.generated) {
        const calYear = newData.currentDate.year;
        const tournament = generateToshitaikou({ userTeamName: null, calendarYear: calYear });
        if (!WORLD_DATA.corporateToshitaikou) WORLD_DATA.corporateToshitaikou = {};
        WORLD_DATA.corporateToshitaikou = { ...tournament, generated: true, qualifiersDone: true, mainDone: false };
      }
      if (month >= 8 && WORLD_DATA.corporateToshitaikou?.generated && !WORLD_DATA.corporateToshitaikou?.mainDone) {
        const td = WORLD_DATA.corporateToshitaikou;
        const calYear = newData.currentDate.year;
        const mainTournament = createMainTournament(td.qualifiers, null, calYear);
        autoPlayMainTournament(mainTournament);
        WORLD_DATA.corporateToshitaikou.mainTournament = mainTournament;
        WORLD_DATA.corporateToshitaikou.champion = mainTournament.champion;
        WORLD_DATA.corporateToshitaikou.runnerUp = mainTournament.runnerUp;
        WORLD_DATA.corporateToshitaikou.mainDone = true;
      }
    }

    if (month === 10 && day === 24 && newPhase === SEASON_PHASES.DRAFT && !isCorporate) {
      setSeasonData(newData);
      if (onForceEvent) onForceEvent('draft');
      return null;
    }
    if (month === 11 && day === 9 && newPhase === SEASON_PHASES.CONTRACT) {
      setSeasonData(newData);
      if (onForceEvent) onForceEvent(isCorporate ? 'corporate_departure' : 'contract');
      return null;
    }
    if (month === 11 && day === 10 && newPhase === SEASON_PHASES.TRYOUT) {
      setSeasonData(newData);
      if (onForceEvent) onForceEvent(isCorporate ? 'corporate_scout' : 'tryout');
      return null;
    }
    if (month >= 12 || (month === 11 && day >= 30)) {
      newData = { ...newData, phase: SEASON_PHASES.OFF_SEASON };
      setSeasonData(newData);
      if (onForceEvent) onForceEvent('offseason');
      return null;
    }
    return newData;
  };

  const renderBracketWithLines = (bracket, teamDefsMap = null) => {
    if (!bracket || !bracket.rounds || bracket.rounds.length === 0) return null;
    const rounds = bracket.rounds;
    const numRounds = rounds.length;
    const firstRoundCount = rounds[0].length;
    const compact = firstRoundCount > 8;

    const TEAM_H = compact ? 18 : 24;
    const MATCH_GAP = compact ? 4 : 6;
    const SLOT_H = TEAM_H * 2 + MATCH_GAP;
    const NAME_W = compact ? 160 : 200;
    const CONN_W = compact ? 30 : 44;
    const PAD_TOP = 8;
    const PAD_LEFT = 4;
    const PAD_BOTTOM = 18;
    const FONT = compact ? 10 : 12;
    const SCORE_FONT = compact ? 9 : 11;
    const DATE_FONT = compact ? 8 : 9;
    const WIN_COLOR = '#f97316';
    const DEF_COLOR = '#4b5563';
    const WIN_W = 2.5;
    const DEF_W = 1;

    const svgH = PAD_TOP + firstRoundCount * SLOT_H + PAD_BOTTOM;
    const svgW = PAD_LEFT + NAME_W + numRounds * CONN_W + 30;

    const getTeamCY = (ri, mi, isTop) => {
      if (ri === 0) {
        const base = PAD_TOP + mi * SLOT_H;
        return isTop ? base + TEAM_H / 2 : base + TEAM_H + TEAM_H / 2;
      }
      const i1 = mi * 2, i2 = mi * 2 + 1;
      if (i2 >= rounds[ri - 1].length) return getTeamCY(ri - 1, i1, isTop);
      return isTop ? getMatchMidY(ri - 1, i1) : getMatchMidY(ri - 1, i2);
    };
    const getMatchMidY = (ri, mi) => (getTeamCY(ri, mi, true) + getTeamCY(ri, mi, false)) / 2;

    const isEliminated = (teamName) => {
      for (const round of rounds) {
        for (const match of round) {
          if (match.loser === teamName) return true;
        }
      }
      return false;
    };

    const getLabel = (name) => {
      if (!name) return 'TBD';
      const city = teamDefsMap?.[name]?.city;
      return city ? `${name}(${city})` : name;
    };

    const teamEntries = [];
    for (let mi = 0; mi < rounds[0].length; mi++) {
      const m = rounds[0][mi];
      const isByeMatch = m.isBye && !(m.team1 && m.team2);
      if (isByeMatch) {
        const byeTeam = m.team1 || m.team2;
        if (byeTeam) teamEntries.push({ team: byeTeam, mi, isTop: 'mid' });
      } else {
        if (m.team1) teamEntries.push({ team: m.team1, mi, isTop: true });
        if (m.team2) teamEntries.push({ team: m.team2, mi, isTop: false });
      }
    }

    return (
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '700px' }}>
        <svg width={svgW} height={svgH} xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block', fontFamily: "'Hiragino Sans','Yu Gothic','Meiryo',system-ui,sans-serif" }}>

          {/* Team names */}
          {teamEntries.map(({ team, mi, isTop }) => {
            const cy = isTop === 'mid' ? getMatchMidY(0, mi) : getTeamCY(0, mi, isTop);
            const isUser = team === userTeamName;
            const elim = isEliminated(team);
            const fill = isUser ? '#fde047' : elim ? '#6b7280' : '#e5e7eb';
            const fw = isUser ? 'bold' : 'normal';
            return (
              <text key={`t${mi}-${isTop}`} x={PAD_LEFT} y={cy + FONT * 0.35}
                fill={fill} fontSize={FONT} fontWeight={fw}
>
                {bracket.champion === team ? `🏆${getLabel(team)}` : getLabel(team)}
              </text>
            );
          })}

          {/* Bracket lines */}
          {rounds.map((round, ri) => {
            const xL = PAD_LEFT + NAME_W + ri * CONN_W;
            const xMid = xL + CONN_W / 2;
            const xR = xL + CONN_W;

            return round.map((m, mi) => {
              // Bye: straight line through
              if (m.isBye && !(m.team1 && m.team2)) {
                const midY = getMatchMidY(ri, mi);
                return (
                  <g key={`m${ri}-${mi}`}>
                    <line x1={xL} y1={midY} x2={xR} y2={midY} stroke={DEF_COLOR} strokeWidth={DEF_W} />
                  </g>
                );
              }

              const cy1 = getTeamCY(ri, mi, true);
              const cy2 = getTeamCY(ri, mi, false);
              const midY = (cy1 + cy2) / 2;
              const hasW = m.winner != null;
              const w1 = hasW && m.winner === m.team1;
              const w2 = hasW && m.winner === m.team2;

              return (
                <g key={`m${ri}-${mi}`}>
                  {/* Base vertical bar (gray, full height) */}
                  <line x1={xMid} y1={cy1} x2={xMid} y2={cy2} stroke={DEF_COLOR} strokeWidth={DEF_W} />

                  {/* Winner's vertical path overlay (winner's Y → midpoint) */}
                  {hasW && (
                    <line x1={xMid} y1={w1 ? cy1 : cy2} x2={xMid} y2={midY}
                      stroke={WIN_COLOR} strokeWidth={WIN_W} />
                  )}

                  {/* Team1 horizontal */}
                  <line x1={xL} y1={cy1} x2={xMid} y2={cy1}
                    stroke={w1 ? WIN_COLOR : DEF_COLOR} strokeWidth={w1 ? WIN_W : DEF_W} />

                  {/* Team2 horizontal */}
                  <line x1={xL} y1={cy2} x2={xMid} y2={cy2}
                    stroke={w2 ? WIN_COLOR : DEF_COLOR} strokeWidth={w2 ? WIN_W : DEF_W} />

                  {/* Output horizontal (midpoint → next round) */}
                  {ri < numRounds - 1 && (
                    <line x1={xMid} y1={midY} x2={xR} y2={midY}
                      stroke={hasW ? WIN_COLOR : DEF_COLOR} strokeWidth={hasW ? WIN_W : DEF_W} />
                  )}

                  {/* Scores straddling the output line */}
                  {hasW && m.score && (
                    <>
                      <text x={xMid + 3} y={midY - 3}
                        fill={w1 ? '#fbbf24' : '#9ca3af'} fontSize={SCORE_FONT}
                        fontWeight={w1 ? 'bold' : 'normal'}>
                        {m.score[0]}
                      </text>
                      <text x={xMid + 3} y={midY + SCORE_FONT + 1}
                        fill={w2 ? '#fbbf24' : '#9ca3af'} fontSize={SCORE_FONT}
                        fontWeight={w2 ? 'bold' : 'normal'}>
                        {m.score[1]}
                      </text>
                    </>
                  )}
                </g>
              );
            });
          })}

          {/* Champion terminal line */}
          {bracket.champion && (() => {
            const lastXMid = PAD_LEFT + NAME_W + (numRounds - 1) * CONN_W + CONN_W / 2;
            const midY = getMatchMidY(numRounds - 1, 0);
            return (
              <line x1={lastXMid} y1={midY} x2={lastXMid + 20} y2={midY}
                stroke={WIN_COLOR} strokeWidth={WIN_W} />
            );
          })()}

          {/* Round dates */}
          {rounds.map((_, ri) => {
            const x = PAD_LEFT + NAME_W + ri * CONN_W + CONN_W / 2;
            const rd = bracket.roundDates?.[ri];
            if (!rd) return null;
            return <text key={`d${ri}`} x={x} y={svgH - 3} textAnchor="middle" fill="#6b7280" fontSize={DATE_FONT}>{rd.month}/{rd.day}</text>;
          })}
        </svg>
      </div>
    );
  };

  const autoFillLineup = () => {
    const team = TEAMS_DATA[userTeamName];
    if (!team) return true;
    const settings = team.lineupSettings;
    if (!settings) return false;
    if (!settings.battingOrder) settings.battingOrder = [];
    const lineup = settings.battingOrder;
    const useDH = LEAGUE_SETTINGS.useDH;
    const maxSlots = useDH ? 9 : 9;

    // 存在しない選手のエントリを除去
    for (let i = lineup.length - 1; i >= 0; i--) {
      const e = lineup[i];
      if (e.battingOrder >= 1 && e.battingOrder <= maxSlots && !team.players.some(p => p.id === e.playerId)) {
        lineup.splice(i, 1);
      }
    }

    const validStarters = lineup.filter(e => e.battingOrder >= 1 && e.battingOrder <= maxSlots);
    if (validStarters.length >= maxSlots) return true;

    // 空き打順を特定
    const usedOrders = new Set(validStarters.map(e => e.battingOrder));
    const missingOrders = [];
    for (let i = 1; i <= maxSlots; i++) {
      if (!usedOrders.has(i)) missingOrders.push(i);
    }

    const lineupPlayerIds = new Set(lineup.map(e => e.playerId));

    // 投手枠がなければ自動追加（非DH制）
    if (!useDH && !lineup.some(e => e.position === 'pitcher')) {
      const rotation = team.pitchingRotation;
      const starterId = rotation?.starters?.[0] || team.players.find(p => p.position === 'pitcher')?.id;
      if (starterId && missingOrders.length > 0) {
        const order = missingOrders.pop();
        lineup.push({ playerId: starterId, position: 'pitcher', battingOrder: order });
        lineupPlayerIds.add(starterId);
      }
    }

    // 残りの空き枠をベンチ野手で補完
    const fieldPositions = ['catcher', 'first', 'second', 'short', 'third', 'left', 'center', 'right'];
    const usedPositions = new Set(lineup.filter(e => e.position !== 'pitcher' && e.position !== 'dh').map(e => e.position));

    for (const order of [...missingOrders]) {
      const benchFielders = team.players.filter(p =>
        p.position !== 'pitcher' && !lineupPlayerIds.has(p.id)
      );
      if (benchFielders.length === 0) break;
      const player = benchFielders[0];
      let pos = player.position;
      if (usedPositions.has(pos)) {
        const avail = fieldPositions.filter(fp => !usedPositions.has(fp));
        pos = avail.length > 0 ? avail[0] : (useDH ? 'dh' : player.position);
      }
      usedPositions.add(pos);
      lineup.push({ playerId: player.id, position: pos, battingOrder: order });
      lineupPlayerIds.add(player.id);
      missingOrders.shift();
    }

    lineup.sort((a, b) => a.battingOrder - b.battingOrder);
    const finalValid = lineup.filter(e => e.battingOrder >= 1 && e.battingOrder <= maxSlots);
    return finalValid.length >= maxSlots;
  };

  const handleProgressDate = (days) => {
    if (isSimulating) return;
    if ((currentPhase === SEASON_PHASES.REGULAR_SEASON || currentPhase === SEASON_PHASES.PLAYOFFS) && !autoFillLineup()) {
      alert('スタメンを自動補完できませんでした。ロスター管理で打順を設定してください。');
      return;
    }

    // 都市対抗トーナメントのユーザー試合チェック
    if (seasonData.toshitaikou?.generated) {
      const tournamentMatch = getUserMatchOnDate(seasonData.toshitaikou, seasonData.currentDate, userTeamName);
      if (tournamentMatch) {
        setShowTournamentMatchModal(tournamentMatch);
        return;
      }
    }

    // 日本選手権のユーザー試合チェック
    if (seasonData.nihonSenshuken?.generated && seasonData.nihonSenshuken.phase !== 'done') {
      const nsMatch = getUserNihonSenshukenMatchOnDate(seasonData.nihonSenshuken, seasonData.currentDate, userTeamName);
      if (nsMatch) {
        setShowTournamentMatchModal(nsMatch);
        return;
      }
    }

    // ユーザーチームの試合があるかチェック
    const todayGames = getScheduleByDate(seasonData.schedule, seasonData.currentDate);
    const userGame = todayGames.find(g => !g.result && (g.home === userTeamName || g.away === userTeamName));

    if (userGame && onSetupManagedGame && (currentPhase === SEASON_PHASES.REGULAR_SEASON || currentPhase === SEASON_PHASES.PLAYOFFS)) {
      setShowGameChoiceModal(true);
      return;
    }

    // 試合がない日 or ユーザー試合がない → 通常進行
    executeSkipDay(days);
  };

  const executeSkipDay = (days) => {
    setIsSimulating(true);
    const { data: afterSimData, results } = simulateGamesOnDate(seasonData);
    let newSeasonData = progressDate(afterSimData, days);
    setLastGameResults(results);

    // 平行世界の試合をシミュレーション
    if (WORLD_DATA.initialized) {
      simulateParallelWorldDate(seasonData.currentDate);
    }

    // 都市対抗トーナメントを日付ベースで進行
    if (newSeasonData.toshitaikou?.generated) {
      const td = JSON.parse(JSON.stringify(newSeasonData.toshitaikou));
      const dateObj = seasonData.currentDate;

      // 予選を日付ベースで進行
      if (!td.qualifiersDone && td.qualifiers) {
        for (const regionId of Object.keys(td.qualifiers)) {
          simulateQualifierOnDate(td.qualifiers[regionId], dateObj, userTeamName);
        }
        const allDone = Object.values(td.qualifiers).every(q => q.phase === 'done');
        td.qualifiersDone = allDone;
        td.userQualifierDone = !td.userRegionId || td.qualifiers[td.userRegionId]?.phase === 'done';
      }

      // 本戦を日付ベースで進行
      if (td.mainTournament && td.mainTournament.phase !== 'done') {
        simulateMainTournamentOnDate(td.mainTournament, dateObj, userTeamName);
        if (td.mainTournament.phase === 'done') {
          td.champion = td.mainTournament.champion;
          td.runnerUp = td.mainTournament.runnerUp;
          td.mainDone = true;
        }
      }

      newSeasonData = { ...newSeasonData, toshitaikou: td };
    }

    // 日本選手権の試合を消化
    if (newSeasonData.nihonSenshuken?.generated && newSeasonData.nihonSenshuken.phase !== 'done') {
      const ns = JSON.parse(JSON.stringify(newSeasonData.nihonSenshuken));
      simulateNihonSenshukenOnDate(ns, seasonData.currentDate, userTeamName);
      if (ns.phase === 'done') {
        ns.champion = ns.champion;
        ns.runnerUp = ns.runnerUp;
      }
      newSeasonData = { ...newSeasonData, nihonSenshuken: ns };
    }

    // スカウト派遣の完了チェック
    if (seasonData.settings?.corporateMode) {
      const userTeam = TEAMS_DATA[userTeamName];
      if (userTeam?.corporateData?.scoutMissions) {
        const completedMissions = checkScoutMissionCompletion(userTeam, newSeasonData.currentDate, newSeasonData.year || 1);
        if (completedMissions.length > 0) {
          setScoutReportNotifications(prev => [...prev, ...completedMissions]);
        }
      }
    }

    if (newSeasonData.currentDate.month !== selectedMonth) setSelectedMonth(newSeasonData.currentDate.month);
    const finalData = checkAndTriggerEvents(seasonData, newSeasonData);
    if (finalData !== null) setSeasonData(finalData);
    setIsSimulating(false);
  };

  const handleGameChoice = (choice) => {
    if (isSimulating) return;
    setShowGameChoiceModal(false);
    if (choice === 'skip') {
      executeSkipDay(1);
    } else if (choice === 'manage') {
      // 采配モードへ移行
      const todayGames = getScheduleByDate(seasonData.schedule, seasonData.currentDate);
      const userGame = todayGames.find(g => !g.result && (g.home === userTeamName || g.away === userTeamName));
      const otherGames = todayGames.filter(g => !g.result && g.home !== userTeamName && g.away !== userTeamName);

      if (userGame && onSetupManagedGame) {
        onSetupManagedGame({
          gameId: userGame.id,
          home: userGame.home,
          away: userGame.away,
          otherGames: otherGames.map(g => ({ gameId: g.id, home: g.home, away: g.away }))
        });
      }
    }
  };

  // トーナメント: ユーザーの試合を開始（都市対抗 / 日本選手権 共用）
  const startTournamentMatch = (opponentName, opponentDef, matchInfo) => {
    if (!onSetupManagedGame) return;
    const oppName = opponentDef?.displayName || opponentDef?.name || opponentName;
    const isNS = matchInfo.bracketType === 'nihon_senshuken' || matchInfo.bracketType === 'nihon_senshuken_qualifier' || matchInfo.bracketType === 'nihon_senshuken_qualifier_losers';
    const pendingMatch = {
      regionId: matchInfo.regionId,
      roundIdx: matchInfo.roundIdx,
      matchIdx: matchInfo.matchIdx,
      opponentName: oppName,
      bracketType: matchInfo.bracketType || 'main',
    };

    const updatedData = isNS ? {
      ...seasonData,
      nihonSenshuken: { ...seasonData.nihonSenshuken, pendingMatch },
    } : {
      ...seasonData,
      toshitaikou: { ...seasonData.toshitaikou, pendingMatch },
    };
    setSeasonData(updatedData);

    const prefix = isNS ? 'nihon_senshuken' : 'toshitaikou';
    onSetupManagedGame({
      gameId: `${prefix}_${matchInfo.bracketType}_${matchInfo.roundIdx}_${matchInfo.matchIdx}`,
      home: userTeamName,
      away: oppName,
      otherGames: [],
      isTournament: true,
    });
  };

  useEffect(() => {
    if (onRegisterAdvance) onRegisterAdvance(() => handleProgressDate(1));
  });

  const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();
  const getFirstDayOfWeek = (year, month) => new Date(year, month - 1, 1).getDay();

  const year = seasonData.currentDate?.year || 2024;
  const daysInMonth = getDaysInMonth(year, selectedMonth);
  const firstDay = getFirstDayOfWeek(year, selectedMonth);

  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  // トーナメント日程をカレンダー用に取得
  const tournamentCalendarDates = useMemo(() => {
    const allDates = [];
    if (seasonData.toshitaikou?.generated) {
      allDates.push(...getTournamentDatesForCalendar(seasonData.toshitaikou, userTeamName));
    }
    if (seasonData.nihonSenshuken?.generated) {
      allDates.push(...getNihonSenshukenDatesForCalendar(seasonData.nihonSenshuken, userTeamName));
    }
    const dateMap = {};
    allDates.forEach(d => {
      const key = `${d.date.month}-${d.date.day}`;
      if (!dateMap[key]) dateMap[key] = [];
      dateMap[key].push(d);
    });
    return dateMap;
  }, [seasonData.toshitaikou, seasonData.nihonSenshuken, userTeamName]);

  const calendarCells = useMemo(() => {
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push({ day: null, games: [], eventLabel: null, tournamentEvents: [] });
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = { year, month: selectedMonth, day };
      const gamesOnDay = getScheduleByDate(seasonData.schedule, dateObj);
      const isToday = seasonData.currentDate.year === year && seasonData.currentDate.month === selectedMonth && seasonData.currentDate.day === day;
      const phase = getCurrentPhase(selectedMonth, day);
      let eventLabel = null;
      if (selectedMonth === 11 && day === 30) eventLabel = 'シーズン終了';
      else if (phase === SEASON_PHASES.SPRING_CAMP) eventLabel = 'キャンプ';
      else if (phase === SEASON_PHASES.PLAYOFFS) eventLabel = 'プレーオフ';
      else if (phase === SEASON_PHASES.DRAFT) eventLabel = 'ドラフト';
      else if (phase === SEASON_PHASES.CONTRACT) eventLabel = seasonData.settings?.corporateMode ? '退団' : '契約更改';
      else if (phase === SEASON_PHASES.TRYOUT) eventLabel = seasonData.settings?.corporateMode ? 'スカウト入団' : 'トライアウト';
      else if (phase === SEASON_PHASES.OFF_SEASON) eventLabel = 'オフシーズン';
      const tKey = `${selectedMonth}-${day}`;
      const tournamentEvents = tournamentCalendarDates[tKey] || [];
      cells.push({ day, games: gamesOnDay, isToday, eventLabel, tournamentEvents });
    }
    return cells;
  }, [seasonData.schedule, seasonData.currentDate, year, selectedMonth, daysInMonth, firstDay, tournamentCalendarDates]);

  const todaysGames = getScheduleByDate(seasonData.schedule, seasonData.currentDate);

  // 今日のトーナメント試合を取得（「本日の対戦」欄に表示するため）
  const todaysTournamentMatches = useMemo(() => {
    const matches = [];
    const cd = seasonData.currentDate;
    const isDateMatch = (d) => d && cd.year === d.year && cd.month === d.month && cd.day === d.day;

    // 都市対抗 予選
    const td = seasonData.toshitaikou;
    if (td?.generated && !td.qualifiersDone) {
      const qualifiers = td.qualifiers || {};
      for (const [regionId, q] of Object.entries(qualifiers)) {
        for (const [bracketType, bracket] of [['main', q.mainBracket], ['losers', q.losersBracket]]) {
          if (!bracket) continue;
          const um = getUserNextMatch(bracket, userTeamName);
          if (!um) continue;
          const matchDate = bracket.matchDates?.[um.roundIdx]?.[um.matchIdx] || bracket.roundDates?.[um.roundIdx];
          if (!isDateMatch(matchDate)) continue;
          const oppName = um.match.team1 === userTeamName ? um.match.team2 : um.match.team1;
          const oppDef = q.teamDefsMap[oppName];
          matches.push({
            type: 'toshitaikou_qualifier',
            label: `都市対抗 地区予選 ${bracketType === 'losers' ? '敗者復活 ' : ''}${getRoundName(bracket, um.roundIdx)}`,
            opponent: oppName,
            color: 'yellow',
            onStart: () => startTournamentMatch(oppName, oppDef, { regionId, roundIdx: um.roundIdx, matchIdx: um.matchIdx, bracketType }),
          });
        }
      }
    }
    // 都市対抗 本戦
    if (td?.mainTournament) {
      const mt = td.mainTournament;
      const bracket = mt.bracket;
      const um = td.phase !== 'done' ? getUserNextMatch(bracket, userTeamName) : null;
      if (um) {
        const matchDate = bracket?.matchDates?.[um.roundIdx]?.[um.matchIdx] || bracket?.roundDates?.[um.roundIdx];
        if (isDateMatch(matchDate)) {
          const oppName = um.match.team1 === userTeamName ? um.match.team2 : um.match.team1;
          const oppDef = mt.teamDefsMap[oppName];
          matches.push({
            type: 'toshitaikou_main',
            label: `都市対抗 本戦 ${getRoundName(bracket, um.roundIdx)}`,
            opponent: oppName,
            color: 'yellow',
            onStart: () => startTournamentMatch(oppName, oppDef, { roundIdx: um.roundIdx, matchIdx: um.matchIdx, bracketType: 'main_tournament' }),
          });
        }
      }
    }
    // 日本選手権（予選＋本戦）
    const ns = seasonData.nihonSenshuken;
    if (ns?.generated && ns.phase !== 'done') {
      // 予選フェーズ
      if ((ns.phase === 'qualifiers' || ns.phase === 'qualifiers_done') && ns.qualifiers && ns.userRegionId) {
        const q = ns.qualifiers[ns.userRegionId];
        if (q && q.phase !== 'done') {
          for (const [bracketType, bracket] of [['nihon_senshuken_qualifier', q.mainBracket], ['nihon_senshuken_qualifier_losers', q.losersBracket]]) {
            if (!bracket) continue;
            const um = getUserNextMatch(bracket, userTeamName);
            if (!um) continue;
            const matchDate = bracket.matchDates?.[um.roundIdx]?.[um.matchIdx] || bracket.roundDates?.[um.roundIdx];
            if (!isDateMatch(matchDate)) continue;
            const oppName = um.match.team1 === userTeamName ? um.match.team2 : um.match.team1;
            const oppDef = q.teamDefsMap[oppName];
            matches.push({
              type: 'nihon_senshuken_qualifier',
              label: `日本選手権 地区予選 ${bracketType.includes('losers') ? '敗者復活 ' : ''}${getRoundName(bracket, um.roundIdx)}`,
              opponent: oppName,
              color: 'red',
              onStart: () => startTournamentMatch(oppName, oppDef, { regionId: ns.userRegionId, roundIdx: um.roundIdx, matchIdx: um.matchIdx, bracketType }),
            });
          }
        }
      }
      // 本戦フェーズ
      if (ns.phase === 'main' && ns.mainTournament) {
        const nsBracket = ns.mainTournament.bracket;
        const um = ns.mainTournament.phase !== 'done' ? getUserNextMatch(nsBracket, userTeamName) : null;
        if (um) {
          const matchDate = nsBracket?.matchDates?.[um.roundIdx]?.[um.matchIdx] || nsBracket?.roundDates?.[um.roundIdx];
          if (isDateMatch(matchDate)) {
            const oppName = um.match.team1 === userTeamName ? um.match.team2 : um.match.team1;
            const oppDef = ns.mainTournament.teamDefsMap[oppName];
            matches.push({
              type: 'nihon_senshuken',
              label: `日本選手権 本戦 ${getRoundName(nsBracket, um.roundIdx)}`,
              opponent: oppName,
              color: 'red',
              onStart: () => startTournamentMatch(oppName, oppDef, { roundIdx: um.roundIdx, matchIdx: um.matchIdx, bracketType: 'nihon_senshuken' }),
            });
          }
        }
      }
    }
    return matches;
  }, [seasonData.toshitaikou, seasonData.nihonSenshuken, seasonData.currentDate, userTeamName]);

  // 月間戦績を1回だけ計算（ヘッダーとサマリーの両方で使用）
  const monthlyStats = useMemo(() => {
    const monthGames = calendarCells
      .filter(c => c.day !== null)
      .flatMap(c => c.games)
      .filter(g => g.result && !g.result.cancelled && (g.home === userTeamName || g.away === userTeamName));
    if (monthGames.length === 0) return null;
    let wins = 0, losses = 0, draws = 0;
    const results = [];
    monthGames.forEach(g => {
      const isHome = g.home === userTeamName;
      const hw = g.result.homeScore > g.result.awayScore;
      const aw = g.result.awayScore > g.result.homeScore;
      const won = isHome ? hw : aw;
      const lost = isHome ? aw : hw;
      if (won) { wins++; results.push('win'); }
      else if (lost) { losses++; results.push('loss'); }
      else { draws++; results.push('draw'); }
    });
    const winRate = (wins + losses) > 0 ? (wins / (wins + losses)).toFixed(3).slice(2) : '---';
    return { wins, losses, draws, results, winRate };
  }, [calendarCells, userTeamName]);

  const totalGames = seasonData?.settings?.gamesPerSeason || 60;
  const standings = seasonData.standings || [];

  const leagueFormat = seasonData?.settings?.leagueFormat || 'single';
  const isTwoLeague = leagueFormat === 'two';
  const teamNamesList = seasonData?.settings?.teamNames || [];
  const leagueNamesList = seasonData?.settings?.leagueNames || ['リーグ1', 'リーグ2'];
  const halfTeams = Math.floor((seasonData?.settings?.teamsCount || 4) / 2);
  const league1Teams = isTwoLeague ? teamNamesList.slice(0, halfTeams) : [];
  const league2Teams = isTwoLeague ? teamNamesList.slice(halfTeams) : [];
  const getLeagueLabel = (game) => {
    if (!isTwoLeague) return null;
    if (league1Teams.includes(game.home) && league1Teams.includes(game.away)) return leagueNamesList[0];
    if (league2Teams.includes(game.home) && league2Teams.includes(game.away)) return leagueNamesList[1];
    return '交流戦';
  };
  const leader = standings[0];
  const leaderWins = leader?.wins || 0;
  const leaderLosses = leader?.losses || 0;
  const isChampionDecided = leader && standings.length > 1 && (() => {
    const second = standings[1];
    const secondRemaining = totalGames - ((second.wins || 0) + (second.losses || 0) + (second.draws || 0));
    return leaderWins > (second.wins || 0) + secondRemaining;
  })();

  // トピック生成（試合結果が増えた時だけ再計算 = 試合のある日のみ更新）
  const cachedTopics = useMemo(() => {
    const topics = [];
    const userLeagueTeamSet = new Set(seasonData?.settings?.teamNames || []);
    const allTeamNames = userLeagueTeamSet.size > 0
      ? Object.keys(TEAMS_DATA || {}).filter(tn => userLeagueTeamSet.has(tn))
      : Object.keys(TEAMS_DATA || {});
    const allPlayers = [];
    allTeamNames.forEach(tn => {
      (TEAMS_DATA[tn]?.players || []).forEach(p => allPlayers.push({ ...p, teamName: tn }));
    });

    // 直前の試合結果からトピック生成
    const recentResults = (seasonData.results || []).slice(-allTeamNames.length);
    recentResults.forEach(r => {
      if (!r.result || r.result.cancelled) return;
      const hs = r.result.homeScore;
      const as = r.result.awayScore;
      const diff = Math.abs(hs - as);
      if (diff >= 8) {
        const winner = hs > as ? r.home : r.away;
        topics.push({ cat: 'game_blowout', icon: '💥', text: `${getTeamAbbreviation(winner)}が${diff}点差の大勝`, color: 'text-red-400' });
      }
      if (hs === 0 || as === 0) {
        const winner = hs > as ? r.home : r.away;
        topics.push({ cat: 'game_shutout', icon: '🛡️', text: `${getTeamAbbreviation(winner)}投手陣が完封勝利`, color: 'text-blue-400' });
      }
      if (hs > as && diff === 1) {
        topics.push({ cat: 'game_walkoff', icon: '🎉', text: `${getTeamAbbreviation(r.home)}がサヨナラ勝ち！`, color: 'text-yellow-400' });
      }
    });

    // 個人成績のマイルストーン
    allPlayers.forEach(p => {
      const bs = p.seasonStats?.batting;
      const ps = p.seasonStats?.pitching;
      const abbr = getTeamAbbreviation(p.teamName);
      if (bs?.atBats >= 30 && bs.hits / bs.atBats >= 0.350) {
        topics.push({ cat: 'bat_avg', icon: '🔥', text: `${abbr} ${p.name}が打率${(bs.hits / bs.atBats).toFixed(3)}と好調`, color: 'text-orange-400' });
      }
      const hr = bs?.homeruns || 0;
      if (hr > 0 && (hr === 10 || hr === 20 || hr === 30 || hr === 40 || hr === 50)) {
        topics.push({ cat: 'bat_hr', icon: '💣', text: `${abbr} ${p.name}が${hr}号到達`, color: 'text-pink-400', team: p.teamName });
      }
      const w = ps?.wins || 0;
      if (w > 0 && (w === 5 || w === 10 || w === 15 || w === 20)) {
        topics.push({ cat: 'pitch_wins', icon: '🏆', text: `${abbr} ${p.name}が${w}勝目`, color: 'text-yellow-400', team: p.teamName });
      }
      const so = ps?.strikeouts || 0;
      if (so > 0 && (so === 50 || so === 100 || so === 150 || so === 200)) {
        topics.push({ cat: 'pitch_k', icon: '🌀', text: `${abbr} ${p.name}が${so}奪三振達成`, color: 'text-purple-400', team: p.teamName });
      }
      if (p.age <= 22 && bs?.atBats >= 20 && bs.hits / bs.atBats >= 0.300) {
        topics.push({ cat: 'young', icon: '⭐', text: `${abbr} ${p.name}(${p.age}歳)にスカウトが熱視線`, color: 'text-cyan-400' });
      }
    });

    // 順位変動トピック
    const _standings = seasonData.standings || [];
    const userStandingData = _standings.find(s => s.team === userTeamName);
    if (userStandingData) {
      const ur = _standings.indexOf(userStandingData) + 1;
      if (ur === 1 && (userStandingData.wins || 0) >= 3) {
        topics.push({ cat: 'standings', icon: '👑', text: `${userTeamName}が首位をキープ`, color: 'text-yellow-300' });
      }
      if (ur <= 3 && _standings.length >= 2) {
        const first = _standings[0];
        const second = _standings[1];
        const gb = ((first.wins - second.wins) - (first.losses - second.losses)) / 2;
        if (gb <= 1.0 && gb > 0) {
          topics.push({ cat: 'standings', icon: '⚡', text: `首位${getTeamAbbreviation(first.team)}と2位${getTeamAbbreviation(second.team)}が${gb}ゲーム差の接戦`, color: 'text-red-300' });
        }
      }
    }

    // 試合結果からの追加トピック
    recentResults.forEach(r => {
      if (!r.result || r.result.cancelled) return;
      const hs = r.result.homeScore;
      const as = r.result.awayScore;
      const total = hs + as;
      const diff = Math.abs(hs - as);
      if (total >= 15) {
        topics.push({ cat: 'game_slugfest', icon: '🎆', text: `${getTeamAbbreviation(r.home)}vs${getTeamAbbreviation(r.away)}は合計${total}点の乱打戦`, color: 'text-orange-300' });
      }
      if (total <= 2 && total > 0) {
        topics.push({ cat: 'game_pitching', icon: '🧊', text: `${getTeamAbbreviation(r.home)}vs${getTeamAbbreviation(r.away)}は${hs}-${as}の緊迫した投手戦`, color: 'text-blue-300' });
      }
      if (hs > as && diff >= 2 && diff <= 3 && hs >= 5) {
        topics.push({ cat: 'game_comeback', icon: '🔄', text: `${getTeamAbbreviation(r.home)}が終盤の粘りで逆転勝利`, color: 'text-green-400' });
      }
      if (hs === as) {
        topics.push({ cat: 'game_draw', icon: '🤝', text: `${getTeamAbbreviation(r.home)}vs${getTeamAbbreviation(r.away)}は${hs}-${as}の引き分け`, color: 'text-gray-300' });
      }
    });

    // チーム連勝・連敗
    allTeamNames.forEach(tn => {
      const abbr = getTeamAbbreviation(tn);
      const teamResults = (seasonData.results || []).filter(g => g.result && !g.result.cancelled && (g.home === tn || g.away === tn));
      if (teamResults.length >= 5) {
        let streak = 0;
        let streakType = null;
        for (let i = teamResults.length - 1; i >= 0; i--) {
          const g = teamResults[i];
          const isHome = g.home === tn;
          const won = isHome ? g.result.homeScore > g.result.awayScore : g.result.awayScore > g.result.homeScore;
          const lost = isHome ? g.result.homeScore < g.result.awayScore : g.result.awayScore < g.result.homeScore;
          if (streakType === null) {
            streakType = won ? 'win' : lost ? 'loss' : null;
            if (!streakType) break;
            streak = 1;
          } else if ((streakType === 'win' && won) || (streakType === 'loss' && lost)) {
            streak++;
          } else {
            break;
          }
        }
        if (streakType === 'win' && streak >= 5) {
          topics.push({ cat: 'team_streak', icon: '🔥', text: `${abbr}が破竹の${streak}連勝中！`, color: 'text-red-400' });
        }
        if (streakType === 'loss' && streak >= 5) {
          topics.push({ cat: 'team_streak', icon: '📉', text: `${abbr}が${streak}連敗と苦しい展開`, color: 'text-gray-400' });
        }
      }
    });

    // 個人成績の追加トピック
    allPlayers.forEach(p => {
      const bs = p.seasonStats?.batting;
      const ps = p.seasonStats?.pitching;
      const abbr = getTeamAbbreviation(p.teamName);

      const rbi = bs?.rbis || 0;
      if (rbi > 0 && (rbi === 20 || rbi === 30 || rbi === 40 || rbi === 50 || rbi === 60 || rbi === 70 || rbi === 80)) {
        topics.push({ cat: 'bat_rbi', icon: '💪', text: `${abbr} ${p.name}が${rbi}打点到達`, color: 'text-orange-400', team: p.teamName });
      }
      const sb = bs?.stolenBases || 0;
      if (sb > 0 && (sb === 10 || sb === 20 || sb === 30 || sb === 40 || sb === 50)) {
        topics.push({ cat: 'bat_sb', icon: '💨', text: `${abbr} ${p.name}が${sb}盗塁到達、俊足が光る`, color: 'text-green-300', team: p.teamName });
      }
      if (bs?.atBats >= 50 && bs.hits / bs.atBats < 0.200) {
        topics.push({ cat: 'bat_slump', icon: '😰', text: `${abbr} ${p.name}が打率${(bs.hits / bs.atBats).toFixed(3)}と深刻な不振`, color: 'text-gray-400' });
      }
      if ((bs?.hits || 0) > 0 && ((bs.hits) === 50 || (bs.hits) === 100 || (bs.hits) === 150)) {
        topics.push({ cat: 'bat_hits', icon: '📊', text: `${abbr} ${p.name}がシーズン${bs.hits}安打到達`, color: 'text-blue-300', team: p.teamName });
      }
      if (bs?.atBats >= 30) {
        const pa = bs.atBats + (bs.walks || 0);
        const obp = (bs.hits + (bs.walks || 0)) / pa;
        if (obp >= 0.420) {
          topics.push({ cat: 'bat_obp', icon: '👁️', text: `${abbr} ${p.name}の出塁率${obp.toFixed(3)}は驚異的`, color: 'text-teal-400' });
        }
      }
      const bk = bs?.strikeouts || 0;
      if (bk > 0 && (bk === 50 || bk === 100 || bk === 150)) {
        topics.push({ cat: 'bat_k', icon: '🌬️', text: `${abbr} ${p.name}が${bk}三振到達、粗さが目立つ`, color: 'text-gray-400' });
      }

      // inningsPitched はアウト数で保存されている（3アウト=1イニング）
      // 30イニング = 90アウトが閾値
      if (ps && (ps.inningsPitched || 0) >= 90) {
        const era = ((ps.earnedRuns || 0) * 27) / ps.inningsPitched;
        if (era <= 1.99 && era >= 0) {
          topics.push({ cat: 'pitch_era', icon: '🎯', text: `${abbr} ${p.name}が防御率${era.toFixed(2)}と圧巻`, color: 'text-emerald-400' });
        }
        if (era >= 5.00 && ps.games >= 5) {
          topics.push({ cat: 'pitch_era', icon: '🚒', text: `${abbr} ${p.name}が防御率${era.toFixed(2)}と炎上中`, color: 'text-red-300' });
        }
      }
      const sv = ps?.saves || 0;
      if (sv > 0 && (sv === 5 || sv === 10 || sv === 15 || sv === 20 || sv === 25 || sv === 30)) {
        topics.push({ cat: 'pitch_save', icon: '🔒', text: `${abbr} ${p.name}が${sv}セーブ到達、守護神の仕事`, color: 'text-indigo-400', team: p.teamName });
      }
      const qs = ps?.qualityStarts || 0;
      if (qs > 0 && (qs === 5 || qs === 10 || qs === 15 || qs === 20)) {
        topics.push({ cat: 'pitch_qs', icon: '📐', text: `${abbr} ${p.name}がQS${qs}回到達、安定感抜群`, color: 'text-sky-400' });
      }

      if (p.age >= 35 && bs?.atBats >= 20 && bs.hits / bs.atBats >= 0.280) {
        topics.push({ cat: 'veteran', icon: '🫡', text: `${abbr} ${p.name}(${p.age}歳)、衰え知らずの活躍`, color: 'text-amber-400' });
      }
      const dbl = bs?.doubles || 0;
      if (dbl > 0 && (dbl === 10 || dbl === 20 || dbl === 30 || dbl === 40 || dbl === 50)) {
        topics.push({ cat: 'bat_2b', icon: '↗️', text: `${abbr} ${p.name}が${dbl}二塁打到達、広角打法が冴える`, color: 'text-lime-400', team: p.teamName });
      }

      if (bs?.atBats >= 10) {
        const recentGames = (seasonData.results || []).slice(-10);
        let recentHits = 0, recentAB = 0, recentHR = 0;
        recentGames.forEach(g => {
          if (!g.result || g.result.cancelled) return;
          const isHome = g.home === p.teamName;
          const lineup = isHome ? g.result.homeLineup : g.result.awayLineup;
          if (!lineup) return;
          const pStats = lineup?.find(l => l.name === p.name);
          if (pStats) {
            recentHits += pStats.hits || 0;
            recentAB += pStats.atBats || 0;
            recentHR += pStats.homeruns || 0;
          }
        });
        if (recentAB >= 10) {
          const recentAvg = recentHits / recentAB;
          if (recentAvg >= 0.400) {
            topics.push({ cat: 'bat_hot', icon: '🔥', text: `${abbr} ${p.name}が直近${recentAB}打数${recentHits}安打と絶好調！`, color: 'text-red-400' });
          }
          if (recentAB >= 12 && recentAvg < 0.100) {
            topics.push({ cat: 'bat_cold', icon: '❄️', text: `${abbr} ${p.name}が直近${recentAB}打数${recentHits}安打と当たりが止まらない`, color: 'text-blue-300' });
          }
          if (recentHR >= 3) {
            topics.push({ cat: 'bat_hr_streak', icon: '💥', text: `${abbr} ${p.name}が直近で${recentHR}本塁打の量産体制`, color: 'text-pink-400' });
          }
        }
      }

      if (p.abilities?.pitching?.velocity >= 150) {
        topics.push({ cat: 'pitch_velo', icon: '🚀', text: `${abbr} ${p.name}の剛速球${p.abilities.pitching.velocity}km/hにスタンドがどよめく`, color: 'text-red-300' });
      }
      if (p.abilities?.pitching?.velocity >= 140 && p.abilities?.pitching?.velocity < 150 && p.age <= 22) {
        topics.push({ cat: 'pitch_velo_young', icon: '⚡', text: `${abbr} ${p.name}(${p.age}歳)が最速${p.abilities.pitching.velocity}km/h、将来が楽しみ`, color: 'text-cyan-300' });
      }

      if (p.abilities?.fielding?.defense >= 85 && p.position !== 'pitcher') {
        const posNames = { catcher: '捕手', first: '一塁手', second: '二塁手', third: '三塁手', short: '遊撃手', left: '左翼手', center: '中堅手', right: '右翼手' };
        const posName = posNames[p.position] || p.position;
        topics.push({ cat: 'defense_scout', icon: '🧤', text: `${abbr} ${p.name}の${posName}守備にスカウトも高評価`, color: 'text-emerald-300' });
      }

      if (ps && (ps.games || 0) >= 25) {
        topics.push({ cat: 'pitch_ironman', icon: '💪', text: `${abbr} ${p.name}が${ps.games}試合登板、フル回転の活躍`, color: 'text-orange-300' });
      }

      const walks = bs?.walks || 0;
      if (walks > 0 && (walks === 20 || walks === 30 || walks === 40 || walks === 50)) {
        topics.push({ cat: 'bat_bb', icon: '👀', text: `${abbr} ${p.name}が${walks}四球到達、優れた選球眼`, color: 'text-teal-300', team: p.teamName });
      }

      if ((bs?.stolenBases || 0) >= 8 && bs?.atBats >= 30 && bs.hits / bs.atBats >= 0.300) {
        topics.push({ cat: 'bat_allround', icon: '🌟', text: `${abbr} ${p.name}が打率${(bs.hits / bs.atBats).toFixed(3)}・${bs.stolenBases}盗塁の万能ぶり`, color: 'text-yellow-300' });
      }

      // inningsPitched はアウト数（3アウト=1イニング）。20イニング = 60アウト
      if (ps && (ps.inningsPitched || 0) >= 60 && (ps.earnedRuns || 0) === 0) {
        topics.push({ cat: 'pitch_scoreless', icon: '✨', text: `${abbr} ${p.name}が${formatInnings(ps.inningsPitched)}無失点の快投`, color: 'text-amber-300' });
      }
    });

    // 順位争い追加トピック
    if (_standings.length >= 3) {
      const last = _standings[_standings.length - 1];
      const secondLast = _standings[_standings.length - 2];
      const lastGb = ((secondLast.wins - last.wins) - (secondLast.losses - last.losses)) / 2;
      if (lastGb <= 1.0 && lastGb >= 0 && (last.gamesPlayed || 0) >= 10) {
        topics.push({ cat: 'standings', icon: '🏳️', text: `${getTeamAbbreviation(last.team)}と${getTeamAbbreviation(secondLast.team)}が最下位争い`, color: 'text-gray-400' });
      }
      if (_standings.length >= 4) {
        const third = _standings[2];
        const fourth = _standings[3];
        const csGb = ((third.wins - fourth.wins) - (third.losses - fourth.losses)) / 2;
        if (csGb <= 1.5 && csGb >= 0 && (third.gamesPlayed || 0) >= 10) {
          topics.push({ cat: 'standings', icon: '🏁', text: `${getTeamAbbreviation(third.team)}と${getTeamAbbreviation(fourth.team)}がAクラス争い`, color: 'text-yellow-300' });
        }
      }
      if (_standings.length >= 2) {
        const first = _standings[0];
        const second = _standings[1];
        const topGb = ((first.wins - second.wins) - (first.losses - second.losses)) / 2;
        if (topGb >= 5 && (first.gamesPlayed || 0) >= 15) {
          topics.push({ cat: 'standings', icon: '🏇', text: `${getTeamAbbreviation(first.team)}が${topGb}ゲーム差で首位独走`, color: 'text-yellow-400' });
        }
      }
    }

    // チーム勝率トピック
    _standings.forEach(s => {
      const abbr = getTeamAbbreviation(s.team);
      if ((s.gamesPlayed || 0) >= 20 && (s.winRate || 0) >= 0.700) {
        topics.push({ cat: 'team_wr', icon: '🏆', text: `${abbr}が勝率${s.winRate.toFixed(3)}の驚異的ペース`, color: 'text-yellow-400' });
      }
      if ((s.gamesPlayed || 0) >= 20 && (s.winRate || 0) <= 0.300) {
        topics.push({ cat: 'team_wr', icon: '⛈️', text: `${abbr}が勝率${s.winRate.toFixed(3)}と苦しいシーズン`, color: 'text-gray-400' });
      }
    });

    // 重複排除 + 同一カテゴリ最大2件に制限
    const seen = new Set();
    const catCount = {};
    const catTeamSeen = {};
    const milestoneCats = new Set(['pitch_wins', 'pitch_save', 'bat_hr', 'bat_hits', 'bat_2b', 'pitch_k', 'bat_rbi', 'bat_sb', 'bat_bb']);
    const unique = topics.filter(t => {
      if (seen.has(t.text)) return false;
      seen.add(t.text);
      if (t.cat) {
        catCount[t.cat] = (catCount[t.cat] || 0) + 1;
        if (catCount[t.cat] > 2) return false;
        if (milestoneCats.has(t.cat) && t.team) {
          const teamKey = `${t.cat}_${t.team}`;
          if (catTeamSeen[teamKey]) return false;
          catTeamSeen[teamKey] = true;
        }
      }
      return true;
    });
    // シード値で安定シャッフル（結果数ベースでゲーム日ごとに変わる）
    const seed = (seasonData.results?.length || 0) * 31 + 7;
    const shuffled = unique.sort((a, b) => {
      const ha = (a.text.length * 17 + seed) % 97;
      const hb = (b.text.length * 17 + seed) % 97;
      return ha - hb;
    }).slice(0, 6);

    return shuffled;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonData.results?.length]);

  // 自チーム専用レポート（監督・コーチ視点の状況報告）
  const teamReport = useMemo(() => {
    const reports = [];
    const userTeam = TEAMS_DATA[userTeamName];
    if (!userTeam?.players) return reports;
    const players = userTeam.players;
    const results = seasonData.results || [];
    const teamGames = results.filter(g => g.result && !g.result.cancelled && (g.home === userTeamName || g.away === userTeamName));
    if (teamGames.length < 3) return reports;

    // --- 直近5試合の傾向分析 ---
    const recent = teamGames.slice(-5);
    let rWins = 0, rLosses = 0, rScored = 0, rAllowed = 0;
    recent.forEach(g => {
      const isHome = g.home === userTeamName;
      const won = isHome ? g.result.homeScore > g.result.awayScore : g.result.awayScore > g.result.homeScore;
      const lost = isHome ? g.result.homeScore < g.result.awayScore : g.result.awayScore < g.result.homeScore;
      if (won) rWins++; else if (lost) rLosses++;
      rScored += isHome ? g.result.homeScore : g.result.awayScore;
      rAllowed += isHome ? g.result.awayScore : g.result.homeScore;
    });
    const avgScored = (rScored / recent.length).toFixed(1);
    const avgAllowed = (rAllowed / recent.length).toFixed(1);

    if (rWins >= 4) {
      reports.push({ icon: '🔥', text: `直近${recent.length}試合で${rWins}勝と絶好調。この勢いを維持したい。`, color: 'text-green-400' });
    } else if (rLosses >= 4) {
      reports.push({ icon: '⚠️', text: `直近${recent.length}試合で${rLosses}敗。何か手を打たないと順位が下がる一方だ。`, color: 'text-red-400' });
    } else if (rWins >= 3) {
      reports.push({ icon: '📈', text: `直近${recent.length}試合は${rWins}勝${rLosses}敗と上り調子。チームに勢いが出てきた。`, color: 'text-green-300' });
    } else if (rLosses >= 3) {
      reports.push({ icon: '📉', text: `直近${recent.length}試合は${rWins}勝${rLosses}敗。立て直しが急務だ。`, color: 'text-orange-400' });
    }

    if (parseFloat(avgScored) < 2.5 && teamGames.length >= 5) {
      reports.push({ icon: '🦗', text: `直近の平均得点${avgScored}。打線が湿りがちだ。打順の入れ替えも検討したい。`, color: 'text-orange-300' });
    }
    if (parseFloat(avgAllowed) >= 6 && teamGames.length >= 5) {
      reports.push({ icon: '🚒', text: `直近の平均失点${avgAllowed}。投手陣が打ち込まれている。起用法を見直す必要がある。`, color: 'text-red-300' });
    }

    // --- 好調・不調の野手 ---
    const fieldPlayers = players.filter(p => p.position !== 'pitcher');
    fieldPlayers.forEach(p => {
      const bs = p.seasonStats?.batting;
      if (!bs || bs.atBats < 15) return;
      const recentGameData = results.slice(-8);
      let rh = 0, rab = 0, rhr = 0;
      recentGameData.forEach(g => {
        if (!g.result || g.result.cancelled) return;
        const isHome = g.home === userTeamName;
        if (g.home !== userTeamName && g.away !== userTeamName) return;
        const lineup = isHome ? g.result.homeLineup : g.result.awayLineup;
        const ps = lineup?.find(l => l.name === p.name);
        if (ps) { rh += ps.hits || 0; rab += ps.atBats || 0; rhr += ps.homeruns || 0; }
      });
      if (rab >= 8) {
        const avg = rh / rab;
        if (avg >= 0.400) {
          reports.push({ icon: '🔥', text: `${p.name}が直近${rab}打数${rh}安打と打ちまくっている。クリーンナップでの起用が効果的だ。`, color: 'text-red-400' });
        } else if (avg <= 0.100 && rab >= 12) {
          reports.push({ icon: '❄️', text: `${p.name}が直近${rab}打数${rh}安打と深刻な不振。打順を下げるか、思い切って休ませることも必要かもしれない。`, color: 'text-blue-300' });
        }
        if (rhr >= 3) {
          reports.push({ icon: '💣', text: `${p.name}が直近で${rhr}本塁打と量産中。長打力が頼りになる。`, color: 'text-pink-400' });
        }
      }
    });

    // --- 投手陣の状況 ---
    const pitchers = players.filter(p => p.position === 'pitcher');
    pitchers.forEach(p => {
      const ps = p.seasonStats?.pitching;
      if (!ps || (ps.inningsPitched || 0) < 18) return; // 6イニング以上
      const era = ((ps.earnedRuns || 0) * 27) / ps.inningsPitched;
      if (era <= 2.00) {
        reports.push({ icon: '🎯', text: `${p.name}が防御率${era.toFixed(2)}と安定。エース格の働きをしている。`, color: 'text-emerald-400' });
      } else if (era >= 5.50 && ps.games >= 3) {
        reports.push({ icon: '😓', text: `${p.name}が防御率${era.toFixed(2)}と苦しんでいる。配置転換や登板間隔の調整を考えたい。`, color: 'text-red-300' });
      }
    });

    // --- 順位状況 ---
    const standings = seasonData.standings || [];
    const userIdx = standings.findIndex(s => s.team === userTeamName);
    if (userIdx >= 0 && standings[userIdx].gamesPlayed >= 5) {
      const rank = userIdx + 1;
      const total = standings.length;
      const us = standings[userIdx];
      if (rank === 1) {
        const second = standings[1];
        if (second) {
          const gb = ((us.wins - second.wins) - (us.losses - second.losses)) / 2;
          if (gb >= 3) {
            reports.push({ icon: '👑', text: `現在首位。2位に${gb}ゲーム差をつけている。この調子で突き放したい。`, color: 'text-yellow-400' });
          } else {
            reports.push({ icon: '⚡', text: `首位だが2位${getTeamAbbreviation(second.team)}とは${gb}ゲーム差。油断は禁物だ。`, color: 'text-yellow-300' });
          }
        }
      } else if (rank === total) {
        const above = standings[userIdx - 1];
        const gb = ((above.wins - us.wins) - (above.losses - us.losses)) / 2;
        reports.push({ icon: '🏳️', text: `現在最下位。${rank - 1}位${getTeamAbbreviation(above.team)}まで${gb}ゲーム差。巻き返しを図りたい。`, color: 'text-gray-400' });
      } else {
        const above = standings[userIdx - 1];
        const gb = ((above.wins - us.wins) - (above.losses - us.losses)) / 2;
        reports.push({ icon: '📊', text: `現在${rank}位。${rank - 1}位${getTeamAbbreviation(above.team)}まで${gb}ゲーム差。`, color: 'text-blue-300' });
      }
    }

    // --- チーム打撃成績の傾向 ---
    let totalHR = 0, totalSB = 0;
    fieldPlayers.forEach(p => {
      totalHR += p.seasonStats?.batting?.homeruns || 0;
      totalSB += p.seasonStats?.batting?.stolenBases || 0;
    });
    if (teamGames.length >= 10 && totalHR < teamGames.length * 0.3) {
      reports.push({ icon: '💤', text: `チーム本塁打が${totalHR}本と少ない。長打不足が課題だ。`, color: 'text-gray-400' });
    }
    if (teamGames.length >= 10 && totalSB >= teamGames.length * 1.2) {
      reports.push({ icon: '💨', text: `チーム盗塁${totalSB}個と機動力が武器になっている。足を活かした攻撃を続けたい。`, color: 'text-green-300' });
    }

    // --- 疲労蓄積の警告（疲労50超で出場すると成長率が下がる） ---
    const fatigueWarnings = [];
    players.forEach(p => {
      const fatigue = p.fatigue || 0;
      if (fatigue >= 80) {
        fatigueWarnings.push({ name: p.name, fatigue, level: 'critical' });
      } else if (fatigue >= 60) {
        fatigueWarnings.push({ name: p.name, fatigue, level: 'danger' });
      } else if (fatigue >= 45) {
        fatigueWarnings.push({ name: p.name, fatigue, level: 'warning' });
      }
    });
    fatigueWarnings.sort((a, b) => b.fatigue - a.fatigue);

    if (fatigueWarnings.some(w => w.level === 'critical')) {
      const names = fatigueWarnings.filter(w => w.level === 'critical').map(w => w.name).join('、');
      reports.push({ icon: '🚨', text: `${names}の疲労が限界を超えている。出場させると成長率が大幅に低下する。`, color: 'text-red-500' });
    }
    if (fatigueWarnings.some(w => w.level === 'danger')) {
      const names = fatigueWarnings.filter(w => w.level === 'danger').map(w => w.name).join('、');
      reports.push({ icon: '⚠️', text: `${names}の疲労が蓄積している。出場ごとに成長率が低下している。`, color: 'text-orange-400' });
    }
    if (fatigueWarnings.some(w => w.level === 'warning')) {
      const names = fatigueWarnings.filter(w => w.level === 'warning').map(w => w.name).join('、');
      reports.push({ icon: '💤', text: `${names}の疲労が蓄積しつつある。もうすぐ成長率低下ラインに達する。`, color: 'text-yellow-400' });
    }

    return reports.slice(0, 8);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonData.results?.length, seasonData.standings]);

  const getEventColor = (label) => {
    if (label === 'シーズン終了') return 'text-red-400';
    if (label === 'プレーオフ') return 'text-yellow-400';
    if (label === '契約更改') return 'text-teal-400';
    if (label === 'トライアウト') return 'text-orange-400';
    if (label === 'オフシーズン') return 'text-gray-400';
    if (label === 'キャンプ') return 'text-green-400';
    if (label === 'ドラフト') return 'text-purple-400';
    return 'text-gray-500';
  };

  // ユーザーチームの成績取得
  if (isGeneratingTournament) {
    return (
      <div className="p-3 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⚾</div>
          <div className="text-white text-xl font-bold mb-2">都市対抗予選を開催中...</div>
          <div className="text-gray-400 text-sm">全12地区の予選トーナメントをシミュレーション中</div>
          <div className="mt-4 w-48 h-1 bg-gray-700 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{width: '70%'}}></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 min-h-screen">
      {/* 2カラムレイアウト: 左にカレンダー+本日の試合、右に順位表 */}
      <div className="flex gap-3">
        {/* 左カラム: カレンダー＋本日の試合 */}
        <div className="w-[700px] shrink-0">
          <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-gray-700/30 mb-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600/30 flex items-center justify-center">
                  <span className="text-blue-400 text-sm">📅</span>
                </div>
                <span>{selectedMonth}月</span>
                {monthlyStats && (
                  <span className="text-sm font-bold ml-1">
                    <span className="text-green-400">{monthlyStats.wins}勝</span>
                    <span className="text-red-400 ml-1">{monthlyStats.losses}敗</span>
                    {monthlyStats.draws > 0 && <span className="text-gray-400 ml-1">{monthlyStats.draws}分</span>}
                    <span className="text-gray-300 ml-1.5 font-normal text-xs">
                      (.{monthlyStats.winRate})
                    </span>
                  </span>
                )}
              </h2>
              <div className="flex gap-1">
                <button onClick={() => setSelectedMonth(m => m > 1 ? m - 1 : 12)} className="bg-gray-700/60 hover:bg-gray-600 text-gray-300 hover:text-white w-10 h-10 rounded-xl flex items-center justify-center text-base transition-all active:scale-90 border border-gray-600/30 hover:border-gray-500">◀</button>
                <button onClick={() => setSelectedMonth(m => m < 12 ? m + 1 : 1)} className="bg-gray-700/60 hover:bg-gray-600 text-gray-300 hover:text-white w-10 h-10 rounded-xl flex items-center justify-center text-base transition-all active:scale-90 border border-gray-600/30 hover:border-gray-500">▶</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {dayNames.map((name, i) => (
                <div key={i} className={`text-center text-[11px] font-bold py-1.5 rounded-md ${i === 0 ? 'text-red-400 bg-red-900/15' : i === 6 ? 'text-blue-400 bg-blue-900/15' : 'text-gray-400 bg-gray-800/50'}`}>{name}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {calendarCells.map((cell, i) => {
                const showAsScheduled = cell.isToday;
                const colIdx = i % 7;
                const hasUserGame = cell.games?.some(g => g.home === userTeamName || g.away === userTeamName);
                const hasTournament = cell.tournamentEvents?.length > 0;
                const hasUserTournament = cell.tournamentEvents?.some(t => t.isUserMatch);
                return (
                  <div key={i} className={`min-h-[62px] p-1 rounded-lg text-sm transition-all ${
                    cell.day === null ? 'bg-transparent' :
                    cell.isToday ? 'bg-gradient-to-br from-green-700/90 to-emerald-800/80 border-2 border-green-400 shadow-lg shadow-green-500/30 ring-2 ring-green-400/30' :
                    hasUserTournament ? 'bg-yellow-900/30 border border-yellow-500/30 hover:border-yellow-400/40' :
                    hasUserGame && !cell.games.some(g => g.result) ? 'bg-blue-900/30 border border-blue-500/20 hover:border-blue-400/40' :
                    hasUserGame && cell.games.some(g => g.result) ? 'bg-gray-700/60 border border-gray-600/20' :
                    hasTournament ? 'bg-orange-900/20 border border-orange-700/20' :
                    colIdx === 0 ? 'bg-gray-800/60 hover:bg-gray-700/60' :
                    colIdx === 6 ? 'bg-gray-800/60 hover:bg-gray-700/60' :
                    'bg-gray-800/40 hover:bg-gray-700/50'
                  }`}>
                    {cell.day && (
                      <>
                        <div className={`font-bold mb-0.5 text-xs leading-none ${cell.isToday ? 'text-green-300' : colIdx === 0 ? 'text-red-400' : colIdx === 6 ? 'text-blue-400' : 'text-gray-200'}`}>{cell.day}</div>
                        {hasTournament && (
                          <div className="mb-0.5">
                            {(() => {
                              const userRegionEvents = cell.tournamentEvents.filter(t => t.isUserRegion || t.type === 'main');
                              if (userRegionEvents.length === 0) {
                                const hasAnyDone = cell.tournamentEvents.some(t => t.done);
                                return <div className={`text-[9px] font-bold leading-tight ${hasAnyDone ? 'text-gray-500' : 'text-orange-400'}`}>都市対抗</div>;
                              }
                              return userRegionEvents.map((t, ti) => {
                                const label = t.type === 'main' ? `本戦${t.label}` : t.label || '予選';
                                const color = t.isUserMatch ? 'text-yellow-400' : t.done ? 'text-gray-500' : 'text-orange-400';
                                return <div key={ti} className={`text-[9px] font-bold leading-tight ${color}`}>{label}{t.isUserMatch ? '⚾' : ''}</div>;
                              });
                            })()}
                          </div>
                        )}
                        {cell.games.length > 0 ? (
                          <div className="space-y-0">
                            {cell.games.map((game, gIdx) => {
                              const awayShort = getTeamAbbreviation(game.away);
                              const homeShort = getTeamAbbreviation(game.home);
                              const isUserInGame = game.home === userTeamName || game.away === userTeamName;
                              const leagueColor = !isTwoLeague ? '' :
                                (league1Teams.includes(game.home) && league1Teams.includes(game.away)) ? 'border-l border-blue-500/50 pl-0.5' :
                                (league2Teams.includes(game.home) && league2Teams.includes(game.away)) ? 'border-l border-orange-500/50 pl-0.5' :
                                'border-l border-green-500/50 pl-0.5';
                              if (showAsScheduled || !game.result) {
                                return <div key={gIdx} className={`text-[11px] leading-tight text-center font-medium ${isUserInGame ? 'text-yellow-300' : 'text-white'} ${leagueColor}`}>{awayShort}-{homeShort}</div>;
                              }
                              if (game.result?.cancelled) return null;
                              const awayWin = game.result.awayScore > game.result.homeScore;
                              const homeWin = game.result.homeScore > game.result.awayScore;
                              // ユーザーチームの勝敗を視覚的に
                              let userWon = null;
                              if (isUserInGame) {
                                if (game.home === userTeamName) userWon = homeWin;
                                else userWon = awayWin;
                              }
                              // プレーオフの通算成績を計算
                              let seriesInfo = null;
                              if (game.seriesId && game.phase === SEASON_PHASES.PLAYOFFS) {
                                const seriesGames = (seasonData.schedule || []).filter(g => g.seriesId === game.seriesId && g.result && !g.result?.cancelled);
                                const upToThis = seriesGames.filter(g => g.seriesGame <= game.seriesGame);
                                const homeTeamInSeries = (seasonData.schedule || []).find(g => g.seriesId === game.seriesId && g.seriesGame === 1)?.home || game.home;
                                let homeWins = 0, awayWins = 0;
                                upToThis.forEach(g => {
                                  const hWon = g.result.homeScore > g.result.awayScore;
                                  const isSeriesHome = g.home === homeTeamInSeries;
                                  if ((hWon && isSeriesHome) || (!hWon && !isSeriesHome)) homeWins++;
                                  else awayWins++;
                                });
                                seriesInfo = `${homeWins}-${awayWins}`;
                              }
                              return (
                                <div key={gIdx} className={`leading-tight text-center ${leagueColor}`}>
                                  <div className="text-[11px]">
                                    <span className={awayWin ? 'text-green-400 font-bold' : 'text-gray-300'}>{awayShort}</span>
                                    <span className="text-white mx-px font-mono text-[10px]">{game.result.awayScore}-{game.result.homeScore}</span>
                                    <span className={homeWin ? 'text-green-400 font-bold' : 'text-gray-300'}>{homeShort}</span>
                                  </div>
                                  {isUserInGame && userWon !== null && (
                                    <div className={`text-[10px] font-bold ${userWon ? 'text-green-400' : 'text-red-400'}`}>{userWon ? '○' : '●'}</div>
                                  )}
                                  {seriesInfo && <div className="text-[10px] text-yellow-400 font-mono">{seriesInfo}</div>}
                                </div>
                              );
                            })}
                          </div>
                        ) : cell.eventLabel ? (
                          <div className={`text-[10px] font-bold leading-tight mt-0.5 ${getEventColor(cell.eventLabel)}`}>{cell.eventLabel}</div>
                        ) : (
                          <div className="text-[10px] text-gray-600">-</div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 本日の対戦 */}
          <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-2 shadow-xl border border-gray-700/30">
            <h2 className="text-sm font-bold text-white mb-1.5 flex items-center gap-1.5">
              <span className="text-orange-400 text-sm">⚾</span>
              <span>{formatDate(seasonData.currentDate)} の対戦</span>
              <span className="text-xs font-normal text-gray-500 ml-1">{todaysGames.length + todaysTournamentMatches.length}試合</span>
            </h2>
            <div>
            {/* トーナメント試合カード */}
            {todaysTournamentMatches.map((tm, idx) => (
              <div key={`tm-${idx}`} className={`mb-1.5 rounded-lg p-2.5 border shadow-md ${
                tm.color === 'red'
                  ? 'bg-gradient-to-r from-red-900/40 to-red-800/20 border-red-500/40 shadow-red-900/20'
                  : 'bg-gradient-to-r from-yellow-900/40 to-yellow-800/20 border-yellow-500/40 shadow-yellow-900/20'
              }`}>
                <div className={`text-[10px] font-bold mb-1 ${tm.color === 'red' ? 'text-red-400' : 'text-yellow-400'}`}>
                  🏆 {tm.label}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold text-sm">{userTeamName}</span>
                    <span className="text-gray-500 text-xs font-bold">VS</span>
                    <span className="text-white font-bold text-sm">{tm.opponent}</span>
                  </div>
                  <button
                    onClick={tm.onStart}
                    className={`px-4 py-1.5 font-bold text-xs rounded-lg transition ${
                      tm.color === 'red'
                        ? 'bg-red-600 hover:bg-red-500 text-white'
                        : 'bg-yellow-600 hover:bg-yellow-500 text-black'
                    }`}
                  >試合開始</button>
                </div>
              </div>
            ))}
            {todaysGames.length === 0 && todaysTournamentMatches.length === 0 ? (
              <div className="text-center py-3 bg-gray-800/50 rounded-xl h-full flex flex-col items-center justify-center">
                <div className="text-gray-600 text-xl mb-1">⚾</div>
                <span className="text-gray-500 text-xs">本日は試合がありません（休養日）</span>
              </div>
            ) : todaysGames.length > 0 ? (
              <div>
                {(() => {
                  const renderGameCards = (games) => (
                    <div className="grid grid-cols-2 gap-1">
                      {games.map(game => {
                  const awayPitcher = getStartingPitcher(game.away);
                  const homePitcher = getStartingPitcher(game.home);
                  const hasResult = !!game.result;
                  const isUserGame = game.home === userTeamName || game.away === userTeamName;
                  let todaySeriesInfo = null;
                  if (game.seriesId && game.phase === SEASON_PHASES.PLAYOFFS) {
                    const seriesAll = (seasonData.schedule || []).filter(g => g.seriesId === game.seriesId && !g.result?.cancelled);
                    const played = seriesAll.filter(g => g.result);
                    const homeTeamInSeries = seriesAll.find(g => g.seriesGame === 1)?.home || game.home;
                    let hWins = 0, aWins = 0;
                    played.forEach(g => {
                      const hWon = g.result.homeScore > g.result.awayScore;
                      const isSeriesHome = g.home === homeTeamInSeries;
                      if ((hWon && isSeriesHome) || (!hWon && !isSeriesHome)) hWins++;
                      else aWins++;
                    });
                    const roundLabel = game.playoffRound === 'semi' ? '準決勝' : '決勝';
                    todaySeriesInfo = `${roundLabel} 第${game.seriesGame}戦 (${hWins}-${aWins})`;
                  }
                  return (
                    <div key={game.id} className={`rounded-lg p-1.5 transition-all relative overflow-hidden ${
                      isUserGame && !hasResult ? 'bg-gradient-to-br from-blue-900/50 to-blue-800/30 border border-blue-500/30 shadow-md shadow-blue-900/20' :
                      hasResult ? 'bg-gray-800/60 border border-gray-700/20' :
                      'bg-gradient-to-br from-gray-800/80 to-gray-800/50 border border-gray-700/20'
                    }`}>
                      {isUserGame && !hasResult && <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400"></div>}
                      {todaySeriesInfo && (
                        <div className="text-center mb-1.5">
                          <span className="text-[10px] bg-yellow-600/30 text-yellow-300 font-bold px-2 py-0.5 rounded-full">{todaySeriesInfo}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="text-center flex-1">
                          <div className={`font-bold text-sm ${game.away === userTeamName ? 'text-yellow-300' : 'text-white'}`}>{getTeamAbbreviation(game.away)}</div>
                          <div className="text-xs text-gray-400 truncate">{awayPitcher ? awayPitcher.name : '先発未定'}</div>
                          {awayPitcher && !hasResult && (() => {
                            const ps = awayPitcher.seasonStats?.pitching;
                            if (!ps || !ps.games) return null;
                            return <div className="text-[11px] text-gray-500">{ps.wins || 0}勝{ps.losses || 0}敗{(ps.saves || 0) > 0 ? ` ${ps.saves}S` : ''}</div>;
                          })()}
                        </div>
                        {hasResult ? (
                          <div className="px-3 text-center">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-base font-black font-mono ${game.result.awayScore > game.result.homeScore ? 'text-green-400' : 'text-gray-400'}`}>{game.result.awayScore}</span>
                              <span className="text-gray-500 text-xs">-</span>
                              <span className={`text-base font-black font-mono ${game.result.homeScore > game.result.awayScore ? 'text-green-400' : 'text-gray-400'}`}>{game.result.homeScore}</span>
                            </div>
                            {/* 勝敗投手・セーブ表示 */}
                            {(() => {
                              const dec = determinePitcherDecisions(game.result,
                                TEAMS_DATA[game.home], TEAMS_DATA[game.away]);
                              const parts = [];
                              if (dec.winningPitcher) parts.push(<span key="w" className="text-green-400">○{dec.winningPitcher.name}</span>);
                              if (dec.losingPitcher) parts.push(<span key="l" className="text-red-400">●{dec.losingPitcher.name}</span>);
                              if (dec.savePitcher) parts.push(<span key="s" className="text-indigo-400">S{dec.savePitcher.name}</span>);
                              if (parts.length === 0) return <div className="text-[10px] text-gray-500 mt-0.5">試合終了</div>;
                              return <div className="text-[10px] mt-0.5 flex flex-wrap justify-center gap-x-1.5">{parts}</div>;
                            })()}
                            {/* 投手交代理由（ユーザーチームのみ） */}
                            {isUserGame && game.result.pitcherChanges?.length > 0 && (
                              <div className="mt-1 border-t border-gray-700/50 pt-1">
                                {game.result.pitcherChanges
                                  .filter(c => c.team === userTeamName)
                                  .slice(0, 3)
                                  .map((c, ci) => (
                                  <div key={ci} className="text-[10px] text-gray-400 leading-tight">
                                    <span className="text-yellow-400">{c.inning}回</span> {c.out}→<span className="text-cyan-300">{c.in}</span>
                                    <span className="text-gray-500 ml-0.5">({c.role})</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="px-3 text-center">
                            <div className="text-gray-500 text-xs font-bold tracking-wider">VS</div>
                          </div>
                        )}
                        <div className="text-center flex-1">
                          <div className={`font-bold text-sm ${game.home === userTeamName ? 'text-yellow-300' : 'text-white'}`}>{getTeamAbbreviation(game.home)}</div>
                          <div className="text-xs text-gray-400 truncate">{homePitcher ? homePitcher.name : '先発未定'}</div>
                          {homePitcher && !hasResult && (() => {
                            const ps = homePitcher.seasonStats?.pitching;
                            if (!ps || !ps.games) return null;
                            return <div className="text-[11px] text-gray-500">{ps.wins || 0}勝{ps.losses || 0}敗{(ps.saves || 0) > 0 ? ` ${ps.saves}S` : ''}</div>;
                          })()}
                        </div>
                      </div>
                    </div>
                  );
                      })}
                    </div>
                  );
                  if (isTwoLeague) {
                    const l1Games = todaysGames.filter(g => league1Teams.includes(g.home) && league1Teams.includes(g.away));
                    const l2Games = todaysGames.filter(g => league2Teams.includes(g.home) && league2Teams.includes(g.away));
                    const interGames = todaysGames.filter(g => !l1Games.includes(g) && !l2Games.includes(g));
                    return (
                      <div className="space-y-1.5">
                        {l1Games.length > 0 && renderGameCards(l1Games)}
                        {l2Games.length > 0 && renderGameCards(l2Games)}
                        {interGames.length > 0 && renderGameCards(interGames)}
                      </div>
                    );
                  }
                  return renderGameCards(todaysGames);
                })()}
              </div>
            ) : null}
            </div>
          </div>

          {/* 個人成績ランキング */}
          {(() => {
            const allPlayers = [];
            const seenIds = new Set();
            const userLeagueTeams = new Set(seasonData?.settings?.teamNames || []);
            Object.entries(TEAMS_DATA || {}).forEach(([teamName, team]) => {
              if (!team?.players) return;
              if (userLeagueTeams.size > 0 && !userLeagueTeams.has(teamName)) return;
              if (isTwoLeague && rankingLeague === 'l1' && !league1Teams.includes(teamName)) return;
              if (isTwoLeague && rankingLeague === 'l2' && !league2Teams.includes(teamName)) return;
              team.players.forEach(p => {
                if (p.id != null && seenIds.has(p.id)) return;
                if (p.id != null) seenIds.add(p.id);
                allPlayers.push({ ...p, teamName });
              });
            });

            // 規定打席・規定投球回をシーズン進行度に比例して算出
            // NPB基準: 規定打席=試合数×3.1、規定投球回=試合数×1.0（イニング）
            const maxGamesPlayed = Math.max(...(standings.map(s => s.gamesPlayed || 0)), 1);
            const seasonProgress = Math.min(maxGamesPlayed / totalGames, 1);
            const qualifiedAB = Math.max(Math.floor(totalGames * 3.1 * seasonProgress), 10);
            const qualifiedInnings = Math.max(Math.floor(totalGames * 1.0 * seasonProgress), 3);
            const qualifiedOuts = qualifiedInnings * 3;

            const battingQualified = allPlayers.filter(p => (p.seasonStats?.batting?.atBats || 0) >= qualifiedAB);
            const pitchingQualified = allPlayers.filter(p => (p.seasonStats?.pitching?.inningsPitched || 0) >= qualifiedOuts);

            const avgRanking = [...battingQualified]
              .map(p => ({ ...p, value: p.seasonStats.batting.hits / p.seasonStats.batting.atBats }))
              .sort((a, b) => b.value - a.value).slice(0, 5);

            const hrRanking = [...allPlayers]
              .filter(p => (p.seasonStats?.batting?.homeruns || 0) > 0)
              .map(p => ({ ...p, value: p.seasonStats.batting.homeruns }))
              .sort((a, b) => b.value - a.value).slice(0, 5);

            const rbiRanking = [...allPlayers]
              .filter(p => (p.seasonStats?.batting?.rbis || 0) > 0)
              .map(p => ({ ...p, value: p.seasonStats.batting.rbis }))
              .sort((a, b) => b.value - a.value).slice(0, 5);

            const eraRanking = [...pitchingQualified]
              .map(p => ({ ...p, value: (p.seasonStats.pitching.earnedRuns / (p.seasonStats.pitching.inningsPitched / 3)) * 9 }))
              .sort((a, b) => a.value - b.value).slice(0, 5);

            const winRanking = [...allPlayers]
              .filter(p => (p.seasonStats?.pitching?.wins || 0) > 0)
              .map(p => ({ ...p, value: p.seasonStats.pitching.wins }))
              .sort((a, b) => b.value - a.value).slice(0, 5);

            const soRanking = [...allPlayers]
              .filter(p => (p.seasonStats?.pitching?.strikeouts || 0) > 0)
              .map(p => ({ ...p, value: p.seasonStats.pitching.strikeouts }))
              .sort((a, b) => b.value - a.value).slice(0, 5);

            const battingRankings = [
              { title: '打率', data: avgRanking, format: v => v.toFixed(3), color: 'text-blue-400', icon: '🏏' },
              { title: '本塁打', data: hrRanking, format: v => v, color: 'text-pink-400', icon: '💥' },
              { title: '打点', data: rbiRanking, format: v => v, color: 'text-green-400', icon: '🔋' },
            ];

            const pitchingRankings = [
              { title: '防御率', data: eraRanking, format: v => v.toFixed(2), color: 'text-orange-400', icon: '🛡' },
              { title: '勝利', data: winRanking, format: v => v, color: 'text-yellow-400', icon: '🏆' },
              { title: '奪三振', data: soRanking, format: v => v, color: 'text-purple-400', icon: '🔥' },
            ];

            const allRankings = [...battingRankings, ...pitchingRankings];
            const hasAnyData = allRankings.some(r => r.data.length > 0);
            if (!hasAnyData && !isTwoLeague) return null;

            const renderRankingCard = (r) => (
              <div key={r.title} className="bg-gray-900/80 rounded-xl p-2.5 border border-gray-700/20">
                <div className={`text-xs font-bold ${r.color} mb-2 pb-1.5 border-b border-gray-700/40 flex items-center gap-1`}>
                  <span>{r.icon}</span> {r.title}
                </div>
                {r.data.length === 0 ? (
                  <div className="text-xs text-gray-500 py-1">該当者なし</div>
                ) : (
                  r.data.map((p, i) => {
                    const isUser = p.teamName === userTeamName;
                    return (
                      <div key={p.id} className={`flex items-center text-xs py-0.5 rounded-md px-1 ${isUser ? 'text-yellow-300 bg-yellow-900/15' : 'text-gray-300'}`}>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                          i === 0 ? 'bg-yellow-500/90 text-black' : i === 1 ? 'bg-gray-400/80 text-black' : i === 2 ? 'bg-orange-600/80 text-white' : 'text-gray-600'
                        }`}>{i + 1}</span>
                        <span className="flex-1 truncate ml-1.5 text-sm">{p.name} <span className="text-gray-300 text-[10px]">({getTeamAbbreviation(p.teamName)})</span></span>
                        <span className={`font-mono font-bold text-xs ${r.color}`}>{r.format(p.value)}</span>
                      </div>
                    );
                  })
                )}
              </div>
            );

            return (
              <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-gray-700/30 mt-3">
                <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-yellow-600/30 flex items-center justify-center">
                    <span className="text-yellow-400 text-sm">📊</span>
                  </div>
                  <span>個人成績ランキング</span>
                  <span className="text-[10px] text-gray-300 font-normal ml-1">規定打席{qualifiedAB} / 規定投球{qualifiedInnings}回</span>
                  {isTwoLeague && (
                    <div className="flex gap-1 ml-auto">
                      {[
                        { key: 'all', label: '全体', color: 'bg-gray-600' },
                        { key: 'l1', label: leagueNamesList[0], color: 'bg-blue-600' },
                        { key: 'l2', label: leagueNamesList[1], color: 'bg-orange-600' },
                      ].map(opt => (
                        <button
                          key={opt.key}
                          onClick={() => setRankingLeague(opt.key)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                            rankingLeague === opt.key
                              ? `${opt.color} text-white`
                              : 'bg-gray-700/50 text-gray-400 hover:text-white'
                          }`}
                        >{opt.label}</button>
                      ))}
                    </div>
                  )}
                </h2>
                {!hasAnyData ? (
                  <div className="text-center text-gray-500 text-xs py-4">まだ成績データがありません</div>
                ) : (<>
                  {/* 打撃部門 */}
                  <div className="text-[10px] text-blue-300 font-bold mb-1 mt-1">打撃部門</div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {battingRankings.map(r => renderRankingCard(r))}
                  </div>
                  {/* 投手部門 */}
                  <div className="text-[10px] text-orange-300 font-bold mb-1">投手部門</div>
                  <div className="grid grid-cols-3 gap-2">
                    {pitchingRankings.map(r => renderRankingCard(r))}
                  </div>
                </>)}
              </div>
            );
          })()}
        </div>

        {/* 右カラム: 順位表 or 都市対抗トーナメント */}
        <div className="flex-1 min-w-[420px]">
          {seasonData.settings?.corporateMode ? (() => {
            const td = seasonData.toshitaikou;
            const RANK_COLORS = { S: 'text-yellow-400', A: 'text-red-400', B: 'text-blue-400', C: 'text-green-400', D: 'text-gray-400' };

            if (!td || !td.generated) return (
              <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-4 shadow-xl border border-gray-700/30">
                <h2 className="text-base font-bold text-white flex items-center gap-2 mb-2">
                  <span>📅</span> 年間スケジュール
                </h2>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-300"><span>4月〜5月</span><span className="text-gray-500">練習期間</span></div>
                  <div className="flex justify-between text-gray-300"><span>6月</span><span>都市対抗 地区予選</span></div>
                  <div className="flex justify-between text-gray-300"><span>7月</span><span className="text-gray-500">練習期間</span></div>
                  <div className="flex justify-between text-gray-300"><span>8月</span><span>都市対抗 本戦</span></div>
                  <div className="flex justify-between text-gray-300"><span>9月〜10月</span><span className="text-gray-500">練習期間</span></div>
                  <div className="flex justify-between text-gray-300"><span>10月</span><span>日本選手権 地区予選</span></div>
                  <div className="flex justify-between text-gray-300"><span>11月</span><span>日本選手権 本戦</span></div>
                </div>
              </div>
            );

            // 本戦表示（進行中 or 終了）
            if (td.mainTournament) {
              const mt = td.mainTournament;
              const bracket = mt.bracket;
              const userMainMatch = !td.mainDone ? getUserNextMatch(bracket, userTeamName) : null;
              const mainContent = (
                <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-yellow-700/30">
                  <h2 className="text-base font-bold text-yellow-400 flex items-center gap-2 mb-2">
                    <span>🏆</span> 都市対抗野球大会 本戦
                    {!td.mainDone && <span className="text-xs text-blue-400 ml-auto">進行中</span>}
                  </h2>
                  {td.mainDone && (
                    <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-2 mb-2 text-center">
                      <div className="text-yellow-400 font-bold">優勝: {td.champion}</div>
                      <div className="text-gray-400 text-xs">準優勝: {td.runnerUp}</div>
                    </div>
                  )}
                  {bracket && renderBracketWithLines(bracket, mt.teamDefsMap)}
                  {userMainMatch && (() => {
                    const matchDate = bracket?.matchDates?.[userMainMatch.roundIdx]?.[userMainMatch.matchIdx]
                      || bracket?.roundDates?.[userMainMatch.roundIdx];
                    const matchDateStr = matchDate ? `${matchDate.month}/${matchDate.day}` : '';
                    return (
                      <div className="mt-2 bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-2">
                        <div className="text-xs text-yellow-400 font-bold mb-1 flex items-center gap-1">
                          <span>{getRoundName(bracket, userMainMatch.roundIdx)} - あなたの試合</span>
                          {matchDateStr && <span className="text-gray-400 font-normal">({matchDateStr})</span>}
                        </div>
                        <span className="text-sm text-white font-bold">
                          {userTeamName} vs {userMainMatch.match.team1 === userTeamName ? userMainMatch.match.team2 : userMainMatch.match.team1}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              );
              const nsPanel = seasonData.nihonSenshuken?.generated ? (() => {
                const ns = seasonData.nihonSenshuken;
                const nsPhase = ns.phase;
                const nsDone = nsPhase === 'done';

                // 本戦ブラケット表示
                const nsMainBracket = ns.mainTournament?.bracket;
                const nsMainTeamDefs = ns.mainTournament?.teamDefsMap;
                const userNsMainMatch = nsMainBracket && !nsDone ? getUserNextMatch(nsMainBracket, userTeamName) : null;

                return (
                  <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-red-700/30 mt-3">
                    <h2 className="text-base font-bold text-red-400 flex items-center gap-2 mb-2">
                      <span>🏆</span> 日本選手権大会
                      {nsDone && <span className="text-xs text-green-400 ml-auto">大会終了</span>}
                      {nsPhase === 'qualifiers' && <span className="text-xs text-blue-400 ml-auto">予選進行中</span>}
                      {nsPhase === 'qualifiers_done' && <span className="text-xs text-yellow-400 ml-auto">予選終了</span>}
                      {nsPhase === 'main' && <span className="text-xs text-orange-400 ml-auto">本戦進行中</span>}
                    </h2>
                    {nsDone && ns.champion && (
                      <div className="bg-yellow-900/30 border border-yellow-600/30 rounded-lg p-2 mb-2 text-center">
                        <div className="text-yellow-400 font-bold">優勝: {ns.champion}</div>
                        <div className="text-gray-400 text-xs">準優勝: {ns.runnerUp}</div>
                      </div>
                    )}
                    {nsMainBracket && renderBracketWithLines(nsMainBracket, nsMainTeamDefs)}
                    {userNsMainMatch && (() => {
                      const matchDate = nsMainBracket?.matchDates?.[userNsMainMatch.roundIdx]?.[userNsMainMatch.matchIdx]
                        || nsMainBracket?.roundDates?.[userNsMainMatch.roundIdx];
                      const matchDateStr = matchDate ? `${matchDate.month}/${matchDate.day}` : '';
                      return (
                        <div className="mt-2 bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-2">
                          <div className="text-xs text-yellow-400 font-bold mb-1 flex items-center gap-1">
                            <span>{getRoundName(nsMainBracket, userNsMainMatch.roundIdx)} - あなたの試合</span>
                            {matchDateStr && <span className="text-gray-400 font-normal">({matchDateStr})</span>}
                          </div>
                          <span className="text-sm text-white font-bold">
                            {userTeamName} vs {userNsMainMatch.match.team1 === userTeamName ? userNsMainMatch.match.team2 : userNsMainMatch.match.team1}
                          </span>
                        </div>
                      );
                    })()}
                    {/* 予選フェーズ: ユーザー地域の予選状況 */}
                    {(nsPhase === 'qualifiers' || nsPhase === 'qualifiers_done') && ns.userRegionId && ns.qualifiers?.[ns.userRegionId] && (() => {
                      const q = ns.qualifiers[ns.userRegionId];
                      const userQMain = getUserNextMatch(q.mainBracket, userTeamName);
                      const userQLosers = q.losersBracket ? getUserNextMatch(q.losersBracket, userTeamName) : null;
                      const userQNext = userQMain || userQLosers;
                      const userQBracket = userQMain ? q.mainBracket : q.losersBracket;
                      const userQType = userQMain ? '予選' : '敗者復活';
                      return (
                        <div className="mt-2">
                          <div className="text-xs text-red-300 font-bold mb-1">{q.regionName}地区予選 ({q.slots}枠)</div>
                          {renderBracketWithLines(q.mainBracket, q.teamDefsMap)}
                          {q.losersBracket && (
                            <div className="mt-1">
                              <div className="text-xs text-orange-300 font-bold mb-1">敗者復活</div>
                              {renderBracketWithLines(q.losersBracket, q.teamDefsMap)}
                            </div>
                          )}
                          {userQNext && (() => {
                            const matchDate = userQBracket?.matchDates?.[userQNext.roundIdx]?.[userQNext.matchIdx]
                              || userQBracket?.roundDates?.[userQNext.roundIdx];
                            const matchDateStr = matchDate ? `${matchDate.month}/${matchDate.day}` : '';
                            return (
                              <div className="mt-2 bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-2">
                                <div className="text-xs text-yellow-400 font-bold mb-1 flex items-center gap-1">
                                  <span>{userQType} {getRoundName(userQBracket, userQNext.roundIdx)} - あなたの試合</span>
                                  {matchDateStr && <span className="text-gray-400 font-normal">({matchDateStr})</span>}
                                </div>
                                <span className="text-sm text-white font-bold">
                                  {userTeamName} vs {userQNext.match.team1 === userTeamName ? userQNext.match.team2 : userQNext.match.team1}
                                </span>
                              </div>
                            );
                          })()}
                          {q.qualifiedTeams.length > 0 && (
                            <div className="mt-2 bg-green-900/20 border border-green-700/30 rounded-lg p-2">
                              <div className="text-[10px] text-green-400 font-bold mb-0.5">本戦出場</div>
                              <div className="flex flex-wrap gap-x-2">
                                {q.qualifiedTeams.map((name, i) => (
                                  <span key={i} className={`text-[11px] ${name === userTeamName ? 'text-yellow-300 font-bold' : 'text-gray-300'}`}>{name}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })() : null;

              if (td.mainDone) return <>{mainContent}{nsPanel}</>;
              if (td.qualifiersDone) return <>{mainContent}{nsPanel}</>;
            }

            // 予選トーナメント表示（タブ切り替え）
            const qualifiers = td.qualifiers || {};
            const regionIds = Object.keys(qualifiers);
            const activeRegion = selectedRegionTab || td.userRegionId || regionIds[0];
            const activeQ = qualifiers[activeRegion];
            const userNextMatchMain = activeRegion === td.userRegionId && activeQ
              ? getUserNextMatch(activeQ.mainBracket, userTeamName)
              : null;
            const userNextMatchLosers = activeRegion === td.userRegionId && activeQ?.losersBracket
              ? getUserNextMatch(activeQ.losersBracket, userTeamName)
              : null;
            const userNextMatch = userNextMatchMain || userNextMatchLosers;
            const userNextMatchBracketType = userNextMatchMain ? 'main' : 'losers';
            const userNextMatchBracket = userNextMatchMain ? activeQ?.mainBracket : activeQ?.losersBracket;

            return (
              <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-blue-700/30">
                <h2 className="text-base font-bold text-blue-400 flex items-center gap-2 mb-2">
                  <span>⚾</span> 都市対抗 地区予選
                  {td.qualifiersDone && <span className="text-xs text-green-400 ml-auto">予選終了</span>}
                </h2>
                {/* 地域タブ */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {regionIds.map(rid => {
                    const q = qualifiers[rid];
                    const isUser = rid === td.userRegionId;
                    const isActive = rid === activeRegion;
                    return (
                      <button key={rid} onClick={() => { setSelectedRegionTab(rid); setSelectedBracketTab('main'); }}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition ${
                          isActive ? 'bg-blue-600 text-white' :
                          isUser ? 'bg-blue-900/50 text-blue-300 hover:bg-blue-800/50' :
                          q.phase === 'done' ? 'bg-gray-700/50 text-gray-500 hover:text-gray-300' :
                          'bg-gray-700/50 text-gray-400 hover:text-white'
                        }`}>
                        {q.regionName}{isUser ? '*' : ''}
                      </button>
                    );
                  })}
                </div>
                {/* 選択地域のブラケット */}
                {activeQ && (() => {
                  const bracket = activeQ.mainBracket;
                  if (!bracket) return null;
                  const hasLosers = !!activeQ.losersBracket;
                  const showingLosers = hasLosers && selectedBracketTab === 'losers';
                  return (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-gray-400">{activeQ.regionName} ({activeQ.slots}枠)</span>
                        {activeQ.phase === 'done' && (
                          <span className="text-[10px] text-green-400">予選終了</span>
                        )}
                      </div>
                      {/* 地区予選 / 敗者復活 タブ */}
                      {hasLosers && (
                        <div className="flex gap-1 mb-2">
                          <button onClick={() => setSelectedBracketTab('main')}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                              !showingLosers ? 'bg-blue-600 text-white' : 'bg-gray-700/50 text-gray-400 hover:text-white'
                            }`}>地区予選</button>
                          <button onClick={() => setSelectedBracketTab('losers')}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold transition ${
                              showingLosers ? 'bg-orange-600 text-white' : 'bg-gray-700/50 text-gray-400 hover:text-white'
                            }`}>敗者復活</button>
                        </div>
                      )}
                      {showingLosers
                        ? renderBracketWithLines(activeQ.losersBracket, activeQ.teamDefsMap)
                        : renderBracketWithLines(bracket, activeQ.teamDefsMap)
                      }
                      {/* ユーザーの次の試合情報 */}
                      {userNextMatch && (() => {
                        const nmBracket = userNextMatchBracket;
                        const matchDate = nmBracket?.matchDates?.[userNextMatch.roundIdx]?.[userNextMatch.matchIdx]
                          || nmBracket?.roundDates?.[userNextMatch.roundIdx];
                        const matchDateStr = matchDate ? `${matchDate.month}/${matchDate.day}` : '';
                        const labelPrefix = userNextMatchBracketType === 'losers' ? '敗者復活 ' : '';
                        return (
                          <div className="mt-2 bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-2">
                            <div className="text-xs text-yellow-400 font-bold mb-1 flex items-center gap-1">
                              <span>{labelPrefix}{nmBracket ? getRoundName(nmBracket, userNextMatch.roundIdx) : ''} - あなたの試合</span>
                              {matchDateStr && <span className="text-gray-400 font-normal">({matchDateStr})</span>}
                            </div>
                            <span className="text-sm text-white font-bold">
                              {userTeamName} vs {userNextMatch.match.team1 === userTeamName ? userNextMatch.match.team2 : userNextMatch.match.team1}
                            </span>
                          </div>
                        );
                      })()}
                      {/* 予選通過チーム */}
                      {activeQ.qualifiedTeams.length > 0 && (
                        <div className="mt-2 bg-green-900/20 border border-green-700/30 rounded-lg p-2">
                          <div className="text-[10px] text-green-400 font-bold mb-0.5">本戦出場</div>
                          <div className="flex flex-wrap gap-x-2">
                            {activeQ.qualifiedTeams.map((name, i) => {
                              const def = activeQ.teamDefsMap[name];
                              return (
                                <span key={i} className="text-[11px]">
                                  <span className={`font-bold ${RANK_COLORS[def?.rank] || ''}`}>{def?.rank}</span>
                                  <span className={name === userTeamName ? 'text-yellow-300 font-bold' : 'text-gray-300'}> {name}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })() : (() => {
            const renderStandingsTable = (leagueStandings, title, titleColor) => {
              const lLeader = leagueStandings[0];
              const lLeaderWins = lLeader?.wins || 0;
              const lLeaderLosses = lLeader?.losses || 0;
              const isLChampionDecided = lLeader && leagueStandings.length > 1 && (() => {
                const second = leagueStandings[1];
                const secondRemaining = totalGames - ((second.wins || 0) + (second.losses || 0) + (second.draws || 0));
                return lLeaderWins > (second.wins || 0) + secondRemaining;
              })();

              return (
                <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-gray-700/30">
                  <h2 className={`text-base font-bold mb-2.5 ${titleColor || 'text-white'} flex items-center gap-2`}>
                    <div className="w-7 h-7 rounded-lg bg-gray-700/60 flex items-center justify-center text-sm">📊</div>
                    {title}
                  </h2>
                  <table className="w-full text-white text-sm">
                    <thead>
                      <tr className="border-b-2 border-gray-600/50 text-gray-400 text-[11px]">
                        <th className="py-1.5 px-0.5 text-center w-6">#</th>
                        <th className="py-1.5 px-1 text-left">チーム</th>
                        <th className="py-1.5 px-0.5 text-center">試</th>
                        <th className="py-1.5 px-0.5 text-center">勝</th>
                        <th className="py-1.5 px-0.5 text-center">負</th>
                        <th className="py-1.5 px-0.5 text-center">分</th>
                        <th className="py-1.5 px-0.5 text-center">率</th>
                        <th className="py-1.5 px-0.5 text-center">差</th>
                        <th className="py-1.5 px-0.5 text-center">打率</th>
                        <th className="py-1.5 px-0.5 text-center">防</th>
                        <th className="py-1.5 px-0.5 text-center">M</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leagueStandings.map((team, index) => {
                        const isUser = team.team === userTeamName;
                        const wr = (team.wins || 0) + (team.losses || 0) > 0
                          ? ((team.wins || 0) / ((team.wins || 0) + (team.losses || 0))).toFixed(3) : '.000';
                        const td = TEAMS_DATA[team.team];
                        let tAvg = '-', tEra = '-';
                        if (td?.players) {
                          let tH = 0, tAB = 0, tER = 0, tIP = 0;
                          td.players.forEach(p => {
                            tH += p.seasonStats?.batting?.hits || 0;
                            tAB += p.seasonStats?.batting?.atBats || 0;
                            tER += p.seasonStats?.pitching?.earnedRuns || 0;
                            tIP += (p.seasonStats?.pitching?.inningsPitched || 0) / 3;
                          });
                          tAvg = tAB > 0 ? (tH / tAB).toFixed(3) : '-';
                          tEra = tIP > 0 ? (tER / tIP * 9).toFixed(2) : '-';
                        }
                        let gb = '';
                        if (index === 0) gb = isLChampionDecided ? '優勝' : '-';
                        else { const d = ((lLeaderWins - (team.wins || 0)) - (lLeaderLosses - (team.losses || 0))) / 2; gb = d === 0 ? '-' : d.toFixed(1); }
                        let mg = '';
                        if (index === 0 && leagueStandings.length > 1) {
                          const sec = leagueStandings[1];
                          const secMax = (sec.wins || 0) + (totalGames - ((sec.wins || 0) + (sec.losses || 0) + (sec.draws || 0)));
                          const mn = secMax - lLeaderWins + 1;
                          if (mn > 0 && !isLChampionDecided) mg = `M${mn}`;
                          else if (isLChampionDecided) mg = '-';
                        }
                        return (
                          <tr key={team.team} className={`border-b border-gray-700/30 transition-colors hover:bg-gray-700/20 ${isUser ? 'bg-blue-900/30 hover:bg-blue-900/40' : ''} ${index === 0 && isLChampionDecided ? 'bg-yellow-900/15' : ''}`}>
                            <td className="py-1.5 px-0.5 text-center">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mx-auto ${index === 0 ? 'bg-yellow-500/90 text-black' : index === 1 ? 'bg-gray-400/80 text-black' : index === 2 ? 'bg-orange-600/80 text-white' : 'bg-gray-700 text-gray-400'}`}>{index + 1}</span>
                            </td>
                            <td className={`py-1.5 px-1 font-bold text-sm ${isUser ? 'text-yellow-300' : ''}`}>
                              {team.team}
                              {isUser && <span className="ml-1 text-[10px] text-blue-400 font-bold">YOU</span>}
                            </td>
                            <td className="py-1.5 px-0.5 text-center text-white text-xs">{team.gamesPlayed || 0}</td>
                            <td className="py-1.5 px-0.5 text-center text-green-400 font-bold">{team.wins || 0}</td>
                            <td className="py-1.5 px-0.5 text-center text-red-400 font-bold">{team.losses || 0}</td>
                            <td className="py-1.5 px-0.5 text-center text-white">{team.draws || 0}</td>
                            <td className="py-1.5 px-0.5 text-center font-mono text-xs">{wr}</td>
                            <td className={`py-1.5 px-0.5 text-center font-bold text-xs ${index === 0 && isLChampionDecided ? 'text-yellow-400' : 'text-white'}`}>{gb}</td>
                            <td className="py-1.5 px-0.5 text-center font-mono text-blue-300 text-xs">{tAvg}</td>
                            <td className="py-1.5 px-0.5 text-center font-mono text-orange-300 text-xs">{tEra}</td>
                            <td className="py-1.5 px-0.5 text-center text-red-400 font-bold text-xs">{mg}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            };

            // プレーオフ成績表示コンポーネント
            const renderPlayoffBracket = () => {
              const playoffGames = (seasonData.schedule || []).filter(g => g.phase === SEASON_PHASES.PLAYOFFS);
              if (playoffGames.length === 0) return null;
              const playoffFormat = seasonData?.settings?.playoffFormat || 'short';

              // シリーズごとの集計
              const getSeriesData = (seriesId) => {
                const games = playoffGames.filter(g => g.seriesId === seriesId && !g.result?.cancelled);
                if (games.length === 0) return null;
                const firstGame = games.find(g => g.seriesGame === 1);
                if (!firstGame || firstGame.home === 'TBD') return null;
                // seriesGame=1のhomeを「上位チーム」とする
                const team1 = firstGame.home;
                const team2 = firstGame.away;
                let team1Wins = 0, team2Wins = 0;
                const gameResults = games.sort((a, b) => a.seriesGame - b.seriesGame).map(g => {
                  if (!g.result) return { game: g.seriesGame, status: 'pending' };
                  const homeWon = g.result.homeScore > g.result.awayScore;
                  const t1Won = (g.home === team1 && homeWon) || (g.away === team1 && !homeWon);
                  if (t1Won) team1Wins++;
                  else team2Wins++;
                  const t1Score = g.home === team1 ? g.result.homeScore : g.result.awayScore;
                  const t2Score = g.home === team2 ? g.result.homeScore : g.result.awayScore;
                  return { game: g.seriesGame, t1Score, t2Score, t1Won, status: 'done' };
                });
                const maxGames = games.length;
                const maxWins = maxGames === 1 ? 1 : Math.ceil(maxGames / 2);
                const isComplete = team1Wins >= maxWins || team2Wins >= maxWins;
                const winner = isComplete ? (team1Wins >= maxWins ? team1 : team2) : null;
                return { team1, team2, team1Wins, team2Wins, gameResults, isComplete, winner };
              };

              // シリーズ表示（5戦3勝 or 1戦）
              const renderSeries = (seriesData, title, isFinal = false) => {
                if (!seriesData) return (
                  <div className={`rounded-xl p-2.5 text-center border border-dashed ${isFinal ? 'bg-gray-800/40 border-yellow-700/30' : 'bg-gray-800/40 border-gray-600/30'}`}>
                    <div className={`text-xs font-bold mb-1 ${isFinal ? 'text-yellow-500' : 'text-gray-500'}`}>{title}</div>
                    <div className="text-gray-500 text-xs">準決勝結果待ち</div>
                  </div>
                );
                const { team1, team2, team1Wins, team2Wins, gameResults, isComplete, winner } = seriesData;
                const t1Abbr = getTeamAbbreviation(team1);
                const t2Abbr = getTeamAbbreviation(team2);
                return (
                  <div className={`rounded-xl overflow-hidden ${
                    isFinal ? 'bg-gradient-to-b from-yellow-900/30 to-gray-800/80 border border-yellow-600/30 shadow-lg shadow-yellow-900/10' :
                    isComplete ? 'bg-gray-800/60 border border-gray-700/30' :
                    'bg-gradient-to-b from-gray-700/50 to-gray-800/60 border border-gray-600/30'
                  }`}>
                    {/* タイトルバー */}
                    <div className={`px-2.5 py-1 ${
                      isFinal ? 'bg-gradient-to-r from-yellow-700/40 via-yellow-600/30 to-yellow-700/40' :
                      'bg-gradient-to-r from-gray-700/40 via-gray-600/30 to-gray-700/40'
                    }`}>
                      <div className={`text-[11px] font-bold text-center tracking-wide ${isFinal ? 'text-yellow-400' : 'text-gray-400'}`}>{title}</div>
                    </div>
                    <div className="p-2.5">
                      {/* チーム名と勝敗 */}
                      <div className="flex items-center justify-between mb-2">
                        <div className={`text-sm font-bold flex-1 text-center ${winner === team1 ? 'text-yellow-300' : winner === team2 ? 'text-gray-600 line-through' : 'text-white'}`}>
                          {winner === team1 && <span className="text-[10px] mr-0.5">👑</span>}{t1Abbr}
                        </div>
                        <div className="px-2.5">
                          <div className="flex items-center gap-1">
                            <span className={`font-black text-xl font-mono ${winner === team1 ? 'text-yellow-300' : 'text-white'}`}>{team1Wins}</span>
                            <span className="text-gray-600 text-sm">-</span>
                            <span className={`font-black text-xl font-mono ${winner === team2 ? 'text-yellow-300' : 'text-white'}`}>{team2Wins}</span>
                          </div>
                        </div>
                        <div className={`text-sm font-bold flex-1 text-center ${winner === team2 ? 'text-yellow-300' : winner === team1 ? 'text-gray-600 line-through' : 'text-white'}`}>
                          {winner === team2 && <span className="text-[10px] mr-0.5">👑</span>}{t2Abbr}
                        </div>
                      </div>
                      {/* 各試合スコア */}
                      {gameResults.length > 0 && (
                        <div className="space-y-0.5 bg-gray-900/40 rounded-lg p-1.5">
                          {gameResults.map(g => (
                            <div key={g.game} className={`flex items-center text-[11px] rounded-md px-1.5 py-0.5 ${g.status === 'done' ? 'bg-gray-800/40' : ''}`}>
                              <span className="w-10 text-gray-500 text-[10px]">第{g.game}戦</span>
                              {g.status === 'done' ? (
                                <>
                                  <span className={`flex-1 text-right font-mono ${g.t1Won ? 'text-green-400 font-bold' : 'text-gray-400'}`}>{g.t1Score}</span>
                                  <span className="mx-1.5 text-gray-700">-</span>
                                  <span className={`flex-1 text-left font-mono ${!g.t1Won ? 'text-green-400 font-bold' : 'text-gray-400'}`}>{g.t2Score}</span>
                                </>
                              ) : (
                                <span className="flex-1 text-center text-gray-700 text-[10px]">--- 未消化 ---</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {isComplete && winner && isFinal && (
                        <div className="mt-2 text-center py-1.5 bg-yellow-600/20 rounded-lg border border-yellow-600/20">
                          <div className="text-xs font-bold text-yellow-400">🏆 {winner} 優勝!</div>
                        </div>
                      )}
                      {isComplete && winner && !isFinal && (
                        <div className="mt-1.5 text-center text-[11px] font-bold text-gray-400">
                          {winner} → 決勝進出
                        </div>
                      )}
                    </div>
                  </div>
                );
              };

              const renderBracketContainer = (title, content) => (
                <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-gray-700/30 mt-3">
                  <h2 className="text-base font-bold mb-3 text-white flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-yellow-600/30 flex items-center justify-center">
                      <span className="text-yellow-400 text-sm">🏆</span>
                    </div>
                    <span>{title}</span>
                  </h2>
                  {content}
                </div>
              );

              if (playoffFormat === 'tournament') {
                const semi1 = getSeriesData('semi1');
                const semi2 = getSeriesData('semi2');
                const final_ = getSeriesData('final');
                return renderBracketContainer('プレーオフ トーナメント (5戦3勝制)', (
                  <div className="flex items-stretch gap-2">
                    <div className="flex-1 space-y-2">
                      {renderSeries(semi1, '準決勝①')}
                      {renderSeries(semi2, '準決勝②')}
                    </div>
                    <div className="flex items-center">
                      <svg width="24" height="100" className="text-gray-600">
                        <line x1="0" y1="25" x2="12" y2="25" stroke="currentColor" strokeWidth="1.5"/>
                        <line x1="12" y1="25" x2="12" y2="75" stroke="currentColor" strokeWidth="1.5"/>
                        <line x1="0" y1="75" x2="12" y2="75" stroke="currentColor" strokeWidth="1.5"/>
                        <line x1="12" y1="50" x2="24" y2="50" stroke="currentColor" strokeWidth="1.5"/>
                      </svg>
                    </div>
                    <div className="flex-1 flex items-center">
                      {renderSeries(final_, '決勝', true)}
                    </div>
                  </div>
                ));
              } else if (playoffFormat === 'short') {
                const final_ = getSeriesData('final');
                if (!final_) return null;
                return renderBracketContainer('プレーオフ (3回戦2勝先取)',
                  renderSeries(final_, '決勝', true)
                );
              } else {
                // 'full' or fallback
                const final_ = getSeriesData('final');
                if (!final_) return null;
                return renderBracketContainer('プレーオフ (5回戦3勝先取)',
                  renderSeries(final_, '決勝', true)
                );
              }
            };

            if (isTwoLeague) {
              const l1 = standings.filter(s => league1Teams.includes(s.team)).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
              const l2 = standings.filter(s => league2Teams.includes(s.team)).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
              return (
                <div className="space-y-3">
                  {renderStandingsTable(l1, `${leagueNamesList[0]} 順位表`, 'text-blue-400')}
                  {renderStandingsTable(l2, `${leagueNamesList[1]} 順位表`, 'text-orange-400')}
                  {renderPlayoffBracket()}
                </div>
              );
            }

            return (
              <div className="space-y-0">
                {renderStandingsTable(standings, '順位表', 'text-white')}
                {renderPlayoffBracket()}
              </div>
            );
          })()}

          {/* チーム状況レポート（自チーム専用、独立リーグのみ） */}
          {teamReport.length > 0 && (
            <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-blue-700/30 mt-3">
              <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
                <span className="text-blue-400">📋</span> チーム状況レポート
              </h2>
              <div className="space-y-1">
                {teamReport.map((r, i) => (
                  <div key={i} className="flex items-start gap-1.5 bg-blue-950/30 rounded-lg px-2.5 py-1.5 border border-blue-800/20">
                    <span className="text-sm shrink-0">{r.icon}</span>
                    <span className={`text-xs ${r.color}`}>{r.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 主なトピック（試合のある日のみ更新、休日は前日のトピックを表示） */}
          {(cachedTopics.length > 0 || scoutReportNotifications.length > 0) && (
            <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-gray-700/30 mt-3">
              <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
                <span className="text-yellow-400">📰</span> {todaysGames.length === 0 ? '直近のトピック' : '主なトピック'}
              </h2>
              <div className="space-y-1">
                {scoutReportNotifications.map((mission, i) => (
                  <div key={`scout-${i}`} className="flex items-start gap-1.5 bg-cyan-900/30 rounded-lg px-2.5 py-1.5 border border-cyan-700/30">
                    <span className="text-sm shrink-0">🔍</span>
                    <span className="text-xs text-cyan-300">
                      {mission.staffName}のスカウトが{SCOUT_TARGETS[mission.target]?.label || mission.target}から帰還 — {mission.results?.length || 0}名の候補選手を発見
                    </span>
                  </div>
                ))}
                {cachedTopics.map((t, i) => (
                  <div key={i} className="flex items-start gap-1.5 bg-gray-800/60 rounded-lg px-2.5 py-1.5">
                    <span className="text-sm shrink-0">{t.icon}</span>
                    <span className={`text-xs ${t.color}`}>{t.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 平行世界リーグ順位表 */}
          {WORLD_DATA.initialized && (() => {
            const parallelLeagues = getAllParallelLeagues();
            const corpToshi = WORLD_DATA.corporateToshitaikou;
            if (parallelLeagues.length === 0 && !corpToshi?.mainDone) return null;
            return (
              <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-emerald-700/30 mt-3">
                <h2
                  className="text-sm font-bold text-emerald-400 mb-2 flex items-center gap-1.5 cursor-pointer select-none"
                  onClick={() => setShowOtherLeagues(prev => !prev)}
                >
                  <span>🌐</span> 他リーグ状況
                  <span className="text-[10px] text-gray-500 ml-auto">{showOtherLeagues ? '▲' : '▼'}</span>
                </h2>
                {showOtherLeagues && <div className="space-y-2">
                  {parallelLeagues.map(league => {
                    const leagueDef = INDEPENDENT_LEAGUES[league.id];
                    const isTwoLeague = leagueDef?.leagueFormat === 'two';
                    const leagueNames = leagueDef?.leagueNames;
                    const halfCount = isTwoLeague ? Math.floor(league.standings.length / 2) : 0;
                    return (
                    <div key={league.id} className="bg-gray-800/50 rounded-lg p-2 border border-gray-700/30">
                      <div className="text-xs font-bold text-gray-300 mb-1 flex items-center justify-between">
                        <span>{leagueDef?.name || league.name}</span>
                        <span className="text-[10px] text-gray-500">{leagueDef?.gamesPerSeason || '?'}試合中{Math.round(league.gamesPlayed)}試合消化</span>
                      </div>
                      {isTwoLeague && halfCount > 0 ? (
                        <div className="space-y-1.5">
                          {[0, 1].map(li => {
                            const lName = leagueNames?.[li] || `リーグ${li + 1}`;
                            const lTeams = league.standings.filter((_, idx) => {
                              const teamIdx = league.teams.indexOf(league.standings[idx]?.team);
                              return teamIdx >= 0 && Math.floor(teamIdx / halfCount) === li;
                            }).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
                            return (
                              <div key={li}>
                                <div className="text-[9px] text-gray-500 font-bold mb-0.5">{lName}</div>
                                <div className="space-y-0.5">
                                  {lTeams.map((s, i) => {
                                    const wr = (s.wins + s.losses) > 0 ? (s.wins / (s.wins + s.losses)).toFixed(3) : '.000';
                                    return (
                                      <div key={s.team} className="flex items-center text-[11px] gap-1">
                                        <span className={`w-4 text-center font-bold ${i === 0 ? 'text-yellow-400' : 'text-gray-500'}`}>{i + 1}</span>
                                        <span className="flex-1 text-gray-200 truncate">{s.team}</span>
                                        <span className="text-green-400 w-5 text-right">{s.wins}</span>
                                        <span className="text-gray-600">-</span>
                                        <span className="text-red-400 w-5">{s.losses}</span>
                                        <span className="text-gray-400 w-8 text-right font-mono">{wr}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                      <div className="space-y-0.5">
                        {league.standings.map((s, i) => {
                          const wr = (s.wins + s.losses) > 0 ? (s.wins / (s.wins + s.losses)).toFixed(3) : '.000';
                          return (
                            <div key={s.team} className="flex items-center text-[11px] gap-1">
                              <span className={`w-4 text-center font-bold ${i === 0 ? 'text-yellow-400' : 'text-gray-500'}`}>{i + 1}</span>
                              <span className="flex-1 text-gray-200 truncate">{s.team}</span>
                              <span className="text-green-400 w-5 text-right">{s.wins}</span>
                              <span className="text-gray-600">-</span>
                              <span className="text-red-400 w-5">{s.losses}</span>
                              <span className="text-gray-400 w-8 text-right font-mono">{wr}</span>
                            </div>
                          );
                        })}
                      </div>
                      )}
                    </div>
                    );
                  })}
                  {corpToshi?.mainDone && (
                    <div className="bg-yellow-900/20 rounded-lg p-2 border border-yellow-700/30">
                      <div className="text-xs font-bold text-yellow-400 mb-1">🏆 都市対抗野球大会</div>
                      <div className="text-[11px] text-gray-300">
                        <span className="text-yellow-300 font-bold">優勝: {corpToshi.champion}</span>
                        <span className="text-gray-500 ml-2">準優勝: {corpToshi.runnerUp}</span>
                      </div>
                    </div>
                  )}
                </div>}
              </div>
            );
          })()}

          {/* 大学リーグ順位表 */}
          {WORLD_DATA.initialized && (() => {
            const uniLeagues = getAllUniversityLeagues();
            if (uniLeagues.length === 0) return null;
            const activeLeagues = uniLeagues.filter(l => l.playedGames > 0 || l.currentSeason !== '終了');
            if (activeLeagues.length === 0 && !uniLeagues.some(l => l.springDone || l.fallDone)) return null;
            return (
              <div className="bg-gradient-to-b from-gray-800/95 to-gray-900 rounded-2xl p-3 shadow-xl border border-blue-700/30 mt-3">
                <h2
                  className="text-sm font-bold text-blue-400 mb-2 flex items-center gap-1.5 cursor-pointer select-none"
                  onClick={() => setShowUniversityLeagues(prev => !prev)}
                >
                  <span>🎓</span> 大学リーグ
                  <span className="text-[10px] text-gray-500 ml-1">({uniLeagues.length}リーグ)</span>
                  <span className="text-[10px] text-gray-500 ml-auto">{showUniversityLeagues ? '▲' : '▼'}</span>
                </h2>
                {showUniversityLeagues && <div className="space-y-1">
                  {uniLeagues.map(league => {
                    const isExpanded = expandedUniLeagues[league.id] || false;
                    const toggleLeague = () => setExpandedUniLeagues(prev => ({ ...prev, [league.id]: !prev[league.id] }));
                    const renderStandingsRow = (s, i) => {
                      const wr = (s.wins + s.losses) > 0 ? (s.wins / (s.wins + s.losses)).toFixed(3) : '.000';
                      return (
                        <div key={s.team} className="flex items-center text-[11px] gap-1">
                          <span className={`w-4 text-center font-bold ${i === 0 ? 'text-yellow-400' : 'text-gray-500'}`}>{i + 1}</span>
                          <span className="flex-1 text-gray-200 truncate">{s.team}</span>
                          <span className="text-green-400 w-5 text-right">{s.wins}</span>
                          <span className="text-gray-600">-</span>
                          <span className="text-red-400 w-5">{s.losses}</span>
                          <span className="text-gray-400 w-8 text-right font-mono">{wr}</span>
                        </div>
                      );
                    };
                    return (
                      <div key={league.id} className="bg-gray-800/50 rounded-lg px-2 py-1.5 border border-gray-700/30">
                        <div
                          className="text-xs font-bold text-gray-300 flex items-center justify-between cursor-pointer select-none"
                          onClick={toggleLeague}
                        >
                          <span>{league.name}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-[10px] text-blue-400/70">{league.currentSeason}</span>
                            <span className="text-[10px] text-gray-500">{league.playedGames}/{league.totalGames}</span>
                            <span className="text-[10px] text-gray-600">{isExpanded ? '▲' : '▼'}</span>
                          </span>
                        </div>
                        {isExpanded && <div className="mt-1 space-y-0.5">
                          {league.divisions ? (
                            <div className="space-y-1.5">
                              <div>
                                <div className="text-[9px] text-blue-400/60 font-bold mb-0.5">1部</div>
                                <div className="space-y-0.5">
                                  {(league.standings.div1 || []).map((s, i) => renderStandingsRow(s, i))}
                                </div>
                              </div>
                              <div>
                                <div className="text-[9px] text-gray-500 font-bold mb-0.5">2部</div>
                                <div className="space-y-0.5">
                                  {(league.standings.div2 || []).map((s, i) => renderStandingsRow(s, i))}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              {(Array.isArray(league.standings) ? league.standings : []).map((s, i) => renderStandingsRow(s, i))}
                            </div>
                          )}
                        </div>}
                      </div>
                    );
                  })}
                </div>}
              </div>
            );
          })()}
        </div>
      </div>

      {/* 都市対抗試合モーダル */}
      {showTournamentMatchModal && (() => {
        const tm = showTournamentMatchModal;
        const oppName = tm.match.team1 === userTeamName ? tm.match.team2 : tm.match.team1;
        const isNsType = tm.bracketType === 'nihon_senshuken' || tm.bracketType === 'nihon_senshuken_qualifier' || tm.bracketType === 'nihon_senshuken_qualifier_losers';
        const isQualifier = tm.type === 'qualifier' || tm.type === 'nihon_senshuken_qualifier';
        const td = seasonData.toshitaikou;
        const ns = seasonData.nihonSenshuken;
        let oppDef, bracket, modalTitle, modalSubtitle;

        if (isNsType) {
          const nsQ = ns?.qualifiers?.[tm.regionId];
          if (tm.bracketType === 'nihon_senshuken') {
            oppDef = ns?.mainTournament?.teamDefsMap?.[oppName];
            bracket = ns?.mainTournament?.bracket;
          } else if (tm.bracketType === 'nihon_senshuken_qualifier_losers') {
            oppDef = nsQ?.teamDefsMap?.[oppName];
            bracket = nsQ?.losersBracket;
          } else {
            oppDef = nsQ?.teamDefsMap?.[oppName];
            bracket = nsQ?.mainBracket;
          }
          modalTitle = '日本選手権大会';
          const roundName = bracket ? getRoundName(bracket, tm.roundIdx) : '';
          if (tm.bracketType === 'nihon_senshuken') {
            modalSubtitle = `本戦 - ${roundName}`;
          } else {
            modalSubtitle = `地区予選 ${nsQ?.regionName || ''}${tm.bracketType.includes('losers') ? ' 敗者復活' : ''} - ${roundName}`;
          }
        } else {
          const isTdQualifier = tm.type === 'qualifier';
          oppDef = isTdQualifier
            ? td?.qualifiers?.[tm.regionId]?.teamDefsMap?.[oppName]
            : td?.mainTournament?.teamDefsMap?.[oppName];
          bracket = isTdQualifier
            ? (tm.bracketType === 'losers' ? td?.qualifiers?.[tm.regionId]?.losersBracket : td?.qualifiers?.[tm.regionId]?.mainBracket)
            : td?.mainTournament?.bracket;
          modalTitle = '都市対抗野球大会';
          const roundName = bracket ? getRoundName(bracket, tm.roundIdx) : '';
          modalSubtitle = isTdQualifier ? `地区予選 ${td?.qualifiers?.[tm.regionId]?.regionName}${tm.bracketType === 'losers' ? ' 敗者復活' : ''} - ${roundName}` : `本戦 - ${roundName}`;
        }

        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className={`bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl border ${isNsType ? 'border-red-600/50' : 'border-yellow-600/50'}`}>
              <h2 className={`text-xl font-bold text-center mb-1 ${isNsType ? 'text-red-400' : 'text-yellow-400'}`}>
                {modalTitle}
              </h2>
              <div className="text-center text-sm text-gray-400 mb-4">
                {modalSubtitle}
              </div>
              <div className="flex items-center justify-center gap-6 mb-5">
                <div className="text-center">
                  <div className="font-bold text-lg text-yellow-300">{userTeamName}</div>
                </div>
                <div className="text-2xl text-gray-500 font-bold">VS</div>
                <div className="text-center">
                  <div className="font-bold text-lg text-white">{oppName}</div>
                  {oppDef?.rank && <div className="text-xs text-gray-500">ランク: {oppDef.rank}</div>}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowTournamentMatchModal(null);
                    startTournamentMatch(oppName, oppDef, {
                      regionId: tm.regionId || null,
                      roundIdx: tm.roundIdx,
                      matchIdx: tm.matchIdx,
                      bracketType: tm.bracketType,
                    });
                  }}
                  className="flex-1 py-3 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-xl transition text-sm"
                >采配で試合</button>
                <button
                  onClick={() => {
                    setShowTournamentMatchModal(null);
                    if (isNsType) {
                      const nsData = { ...seasonData.nihonSenshuken };
                      let targetBracket, teamDefsMap;
                      if (tm.bracketType === 'nihon_senshuken') {
                        targetBracket = nsData.mainTournament?.bracket;
                        teamDefsMap = nsData.mainTournament?.teamDefsMap;
                      } else if (tm.bracketType === 'nihon_senshuken_qualifier_losers') {
                        targetBracket = nsData.qualifiers?.[tm.regionId]?.losersBracket;
                        teamDefsMap = nsData.qualifiers?.[tm.regionId]?.teamDefsMap;
                      } else {
                        targetBracket = nsData.qualifiers?.[tm.regionId]?.mainBracket;
                        teamDefsMap = nsData.qualifiers?.[tm.regionId]?.teamDefsMap;
                      }
                      if (targetBracket && teamDefsMap) {
                        const def1 = teamDefsMap[tm.match.team1];
                        const def2 = teamDefsMap[tm.match.team2];
                        if (def1 && def2) {
                          const result = simulateQuickMatch(def1, def2);
                          recordTournamentResult(targetBracket, tm.roundIdx, tm.matchIdx, result.winner, result.score);
                        }
                      }
                      setSeasonData(prev => ({ ...prev, nihonSenshuken: nsData }));
                    } else {
                      const td = { ...seasonData.toshitaikou };
                      if (tm.type === 'qualifier' && tm.regionId) {
                        const q = td.qualifiers[tm.regionId];
                        if (q) {
                          const targetBracket = tm.bracketType === 'losers' ? q.losersBracket : q.mainBracket;
                          const def1 = q.teamDefsMap[tm.match.team1];
                          const def2 = q.teamDefsMap[tm.match.team2];
                          if (targetBracket && def1 && def2) {
                            const result = simulateQuickMatch(def1, def2);
                            recordTournamentResult(targetBracket, tm.roundIdx, tm.matchIdx, result.winner, result.score);
                          }
                        }
                      } else if (tm.type === 'main' && td.mainTournament) {
                        const mt = td.mainTournament;
                        const def1 = mt.teamDefsMap[tm.match.team1];
                        const def2 = mt.teamDefsMap[tm.match.team2];
                        if (def1 && def2) {
                          const result = simulateQuickMatch(def1, def2);
                          recordTournamentResult(mt.bracket, tm.roundIdx, tm.matchIdx, result.winner, result.score);
                        }
                      }
                      setSeasonData(prev => ({ ...prev, toshitaikou: td }));
                    }
                    executeSkipDay(1);
                  }}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition text-sm"
                >自動消化</button>
              </div>
              <button
                onClick={() => setShowTournamentMatchModal(null)}
                className="w-full mt-2 py-2 text-gray-500 hover:text-white text-xs transition"
              >閉じる</button>
            </div>
          </div>
        );
      })()}

      {/* 試合選択モーダル */}
      {showGameChoiceModal && <PreGameModal
        seasonData={seasonData}
        userTeamName={userTeamName}
        formatDate={formatDate}
        getStartingPitcher={getStartingPitcher}
        handleGameChoice={handleGameChoice}
        setShowGameChoiceModal={setShowGameChoiceModal}
      />}
    </div>
  );
};

/** 試合前モーダル：スタメン簡易変更・疲労色・相手投手情報 */
const PreGameModal = ({ seasonData, userTeamName, formatDate, getStartingPitcher, handleGameChoice, setShowGameChoiceModal }) => {
  const [swapTarget, setSwapTarget] = useState(null); // 打順入れ替え用
  const [, setTick] = useState(0); // 再レンダリング用
  const [showBench, setShowBench] = useState(false); // 控え選手表示

  const todayGames = getScheduleByDate(seasonData.schedule, seasonData.currentDate);
  const userGame = todayGames.find(g => !g.result && (g.home === userTeamName || g.away === userTeamName));
  const opponentName = userGame ? (userGame.home === userTeamName ? userGame.away : userGame.home) : '';
  const isHome = userGame ? userGame.home === userTeamName : true;
  const userTeam = TEAMS_DATA[userTeamName];
  const opponentTeam = TEAMS_DATA[opponentName];

  // スタメン取得（投手はローテーションから反映）
  const getStarters = (team, teamName) => {
    if (!team?.players) return [];
    const settings = team.lineupSettings;
    if (settings?.battingOrder?.length > 0) {
      // ローテーションから先発投手を取得
      const rotationStarter = getStartingPitcher(teamName);
      const starters = settings.battingOrder
        .sort((a, b) => a.battingOrder - b.battingOrder)
        .map(entry => {
          // 投手枠（battingOrder 9, position pitcher）はローテ投手で上書き
          if (entry.position === 'pitcher' && rotationStarter) {
            return { ...rotationStarter, _position: 'pitcher', _battingOrder: entry.battingOrder };
          }
          const player = team.players.find(p => p.id === entry.playerId);
          return player ? { ...player, _position: entry.position, _battingOrder: entry.battingOrder } : null;
        })
        .filter(Boolean);
      return starters;
    }
    return team.players
      .filter(p => p.battingOrder > 0 && p.battingOrder <= 9)
      .sort((a, b) => a.battingOrder - b.battingOrder);
  };

  const userStarters = getStarters(userTeam, userTeamName);
  const lineup = userTeam?.lineupSettings?.battingOrder || [];

  // 控え野手（スタメンに入っていない野手）
  const starterIds = new Set(lineup.map(e => e.playerId));
  const benchFielders = (userTeam?.players || []).filter(p => !starterIds.has(p.id) && p.position !== 'pitcher');

  // サブポジション取得（適性80以上）
  const getSubPositions = (player, mainPosition) => {
    if (!player?.positionFitness || mainPosition === 'pitcher') return [];
    const allPositions = ['catcher', 'first', 'second', 'short', 'third', 'left', 'center', 'right'];
    return allPositions
      .filter(pos => pos !== mainPosition && (player.positionFitness[pos] ?? 0) >= 80)
      .map(pos => {
        const fitness = player.positionFitness[pos] ?? 0;
        const color = fitness >= 100 ? 'text-white' : fitness >= 90 ? 'text-yellow-400' : 'text-orange-400';
        return { label: POSITION_NAMES[pos], color };
      });
  };

  // 疲労色
  const getFatigueColor = (player) => {
    const f = player.fatigue || 0;
    if (f >= 80) return 'text-red-400';
    if (f >= 60) return 'text-yellow-400';
    if (f >= 40) return 'text-green-400';
    return 'text-white';
  };

  // 打順入れ替え（クリック2回で打順スワップ）
  const handleSwap = (order) => {
    if (swapTarget === null) {
      setSwapTarget(order);
    } else if (swapTarget === order) {
      // 同じ選手を再クリック → 選択解除
      setSwapTarget(null);
      setShowBench(false);
    } else {
      // 別のスタメンをクリック → 打順入れ替え
      const entry1 = lineup.find(e => e.battingOrder === swapTarget);
      const entry2 = lineup.find(e => e.battingOrder === order);
      if (entry1 && entry2) {
        entry1.battingOrder = order;
        entry2.battingOrder = swapTarget;
        lineup.sort((a, b) => a.battingOrder - b.battingOrder);
      }
      setSwapTarget(null);
      setShowBench(false);
      setTick(t => t + 1);
    }
  };

  // 控え交代モードを開く
  const openBenchSwap = (order) => {
    setSwapTarget(order);
    setShowBench(true);
  };

  // 控え選手とスタメン選手を入れ替え
  const handleSubstitute = (benchPlayerId, starterOrder) => {
    const starterEntry = lineup.find(e => e.battingOrder === starterOrder);
    if (starterEntry && starterEntry.position !== 'pitcher') {
      const benchPlayer = userTeam.players.find(p => p.id === benchPlayerId);
      if (benchPlayer) {
        starterEntry.playerId = benchPlayerId;
        // ポジションはそのまま維持
        setSwapTarget(null);
        setShowBench(false);
        setTick(t => t + 1);
      }
    }
  };

  // 相手先発投手情報
  const opponentStarter = getStartingPitcher(opponentName);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center overflow-y-auto">
      <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl p-5 max-w-lg w-full mx-4 shadow-2xl border border-gray-600/50 my-4">
        <h2 className="text-xl font-bold text-white text-center mb-3">
          {formatDate(seasonData.currentDate)} の試合
        </h2>

        <div className="flex items-center justify-center gap-6 mb-4">
          <div className="text-center">
            <div className={`font-bold text-lg ${isHome ? 'text-blue-400' : 'text-red-400'}`}>
              {isHome ? '🏠' : '✈️'} {userTeamName}
            </div>
          </div>
          <div className="text-2xl text-gray-500 font-bold">VS</div>
          <div className="text-center">
            <div className={`font-bold text-lg ${!isHome ? 'text-blue-400' : 'text-red-400'}`}>
              {!isHome ? '🏠' : '✈️'} {opponentName}
            </div>
          </div>
        </div>

        {/* 相手先発投手情報 */}
        {opponentStarter && (() => {
          const FORM_LABELS = { overhand: 'オーバー', threeQuarter: 'スリークォーター', sidearm: 'サイド', submarine: 'アンダー' };
          const ps = opponentStarter.seasonStats?.pitching;
          const era = ps?.inningsPitched > 0 ? ((ps.earnedRuns || 0) / (ps.inningsPitched / 3) * 9).toFixed(2) : '-';
          return (
            <div className="bg-gray-900 rounded-lg p-3 mb-3 border border-gray-700">
              <h3 className="text-xs font-bold text-gray-400 mb-2">相手先発投手</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${opponentStarter.physical?.throws === 'left' ? 'bg-blue-600 text-white' : 'bg-orange-600 text-white'}`}>
                  {opponentStarter.physical?.throws === 'left' ? '左投' : '右投'}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
                  {FORM_LABELS[opponentStarter.pitching?.form] || 'スリークォーター'}
                </span>
                <span className="text-white font-bold text-sm">{opponentStarter.name}</span>
                <div className="flex gap-2 text-xs text-gray-400 ml-auto">
                  <span>球速<span className="text-orange-300 font-bold ml-0.5">{opponentStarter.pitching?.velocity || 0}</span></span>
                  <span>制球<span className="text-blue-300 font-bold ml-0.5">{opponentStarter.pitching?.control || 0}</span></span>
                  <span>スタ<span className="text-green-300 font-bold ml-0.5">{opponentStarter.pitching?.stamina || 0}</span></span>
                </div>
              </div>
              <div className="text-xs text-gray-400 mt-1.5 flex gap-2 flex-wrap">
                <span>防御率<span className="text-orange-300 font-bold ml-0.5">{era}</span></span>
                <span><span className="text-white font-bold">{ps?.wins || 0}</span>勝</span>
                <span><span className="text-white font-bold">{ps?.losses || 0}</span>敗</span>
                <span><span className="text-white font-bold">{ps?.saves || 0}</span>S</span>
                <span>{ps?.strikeouts || 0}奪三振</span>
              </div>
            </div>
          );
        })()}

        {/* スタメン一覧（疲労色+簡易変更） */}
        <div className="bg-gray-900 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-gray-400">スタメン <span className="text-gray-600 font-normal">
              {swapTarget !== null && !showBench ? '（入れ替え先をタップ）' : '（タップで打順入替）'}
            </span></h3>
            <div className="flex items-center gap-2 text-[10px] text-gray-400">
              <span className="inline-block w-4 h-1.5 rounded-sm bg-red-500" />危険
              <span className="inline-block w-4 h-1.5 rounded-sm bg-yellow-400" />注意
              <span className="inline-block w-4 h-1.5 rounded-sm bg-green-600" />良好
            </div>
          </div>
          <div className="space-y-0.5 text-sm">
            {userStarters.map((player, i) => {
              const order = player._battingOrder || (i + 1);
              const pos = player._position || player.position;
              const cond = player.condition ?? CONDITION_LEVELS.NORMAL;
              const isSelected = swapTarget === order;
              const isSwapCandidate = swapTarget !== null && swapTarget !== order && !showBench && pos !== 'pitcher';
              const f = player.fatigue || 0;
              const bats = player.batting?.bats || 'right';
              const batsLabel = bats === 'left' ? '左' : bats === 'switch' ? '両' : '右';
              const batsColor = bats === 'left' ? 'text-blue-400' : bats === 'switch' ? 'text-purple-400' : 'text-gray-500';
              return (
                <div
                  key={player.id}
                  onClick={() => pos !== 'pitcher' && handleSwap(order)}
                  className={`flex items-center gap-1.5 rounded px-2 py-1.5 transition-all ${
                    pos === 'pitcher' ? 'bg-gray-800/50 cursor-default' :
                    isSelected ? 'bg-blue-900 ring-1 ring-blue-400 cursor-pointer' :
                    isSwapCandidate ? 'bg-gray-800 hover:bg-blue-900/50 ring-1 ring-blue-800/50 cursor-pointer' :
                    'bg-gray-800 hover:bg-gray-700 cursor-pointer'
                  }`}
                >
                  <span className={`w-5 text-center font-mono shrink-0 ${isSwapCandidate ? 'text-blue-400' : 'text-gray-500'}`}>{order}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 w-7 text-center ${
                    pos === 'pitcher' ? 'bg-red-800 text-red-200' :
                    ['catcher'].includes(pos) ? 'bg-blue-800 text-blue-200' :
                    ['left','center','right'].includes(pos) ? 'bg-green-800 text-green-200' :
                    'bg-yellow-800 text-yellow-200'
                  }`}>{POSITION_NAMES[pos] || pos}</span>
                  <span className={`font-bold text-white truncate shrink-0`} style={{width:'4.5rem'}}>{player.name}</span>
                  <span className="text-[10px] text-gray-500 shrink-0 w-5 text-right">{player.age || ''}</span>
                  <span className={`shrink-0 ${CONDITION_COLORS[cond]}`} title={CONDITION_LABELS[cond]}>{CONDITION_ICONS[cond]}</span>
                  <span className={`text-xs ${batsColor} shrink-0 w-3`}>{batsLabel}</span>
                  {/* 疲労ゲージ */}
                  {pos !== 'pitcher' && (() => {
                    const maxW = 32;
                    const ratio = Math.min(1, f / 150);
                    const barW = Math.round(ratio * maxW);
                    const barColor = f >= 100 ? 'bg-red-500' : f >= 80 ? 'bg-orange-400' : f >= 60 ? 'bg-yellow-400' : f >= 40 ? 'bg-green-400' : 'bg-green-600';
                    const growthWarning = f >= 100 ? '⚠' : f >= 80 ? '!' : '';
                    return (
                      <span className="shrink-0 flex items-center gap-0.5" title={`疲労: ${f}${f >= 100 ? '（成長率低下）' : f >= 80 ? '（低下間近）' : ''}`}>
                        <span className="relative bg-gray-700 rounded-sm overflow-hidden" style={{ width: maxW, height: 6 }}>
                          <span className={`absolute left-0 top-0 h-full rounded-sm ${barColor}`} style={{ width: barW }} />
                        </span>
                        {growthWarning && <span className="text-[9px] text-red-400">{growthWarning}</span>}
                      </span>
                    );
                  })()}
                  {pos !== 'pitcher' && (() => {
                    const subs = getSubPositions(player, pos);
                    return subs.length > 0 ? <span className="text-xs shrink-0">{subs.map((s, j) => <span key={j} className={s.color}>{s.label}</span>)}</span> : null;
                  })()}
                  <span className="flex-1" />
                  {(() => {
                    const bs = player.seasonStats?.batting;
                    if (!bs || !bs.atBats) return <span className="text-gray-600 text-xs shrink-0" style={{width:'7.5rem'}}>-</span>;
                    const avg = (bs.hits / bs.atBats).toFixed(3);
                    return (
                      <span className="text-xs text-gray-400 shrink-0 font-mono tabular-nums" style={{width:'7.5rem'}}>
                        <span className="text-blue-300 inline-block w-9 text-right">{avg}</span>
                        <span className="inline-block w-7 text-right">{bs.homeruns || 0}本</span>
                        <span className="inline-block w-8 text-right">{bs.rbis || 0}点</span>
                      </span>
                    );
                  })()}
                  {isSelected && pos !== 'pitcher' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openBenchSwap(order); }}
                      className="shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded bg-orange-600 hover:bg-orange-500 text-white transition ml-1"
                    >交代</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 控え野手一覧 */}
        <div className="bg-gray-900 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-gray-400">
              控え野手
              {swapTarget !== null
                ? <span className="text-blue-400 ml-1">→ {swapTarget}番と交代する選手をタップ</span>
                : <span className="text-gray-500 font-normal ml-1">スタメンをタップ後、控えをタップで交代</span>
              }
            </h3>
            {swapTarget !== null && (
              <button onClick={() => { setShowBench(false); setSwapTarget(null); }} className="text-gray-500 hover:text-white text-xs">✕</button>
            )}
          </div>
          <div className="space-y-0.5 text-xs max-h-44 overflow-y-auto">
            {benchFielders.length === 0 && <div className="text-gray-500 text-center py-1">控え野手なし</div>}
            {benchFielders.map(player => {
              const f = player.fatigue || 0;
              const bats = player.batting?.bats || 'right';
              const batsLabel = bats === 'left' ? '左' : bats === 'switch' ? '両' : '右';
              const batsColor = bats === 'left' ? 'text-blue-400' : bats === 'switch' ? 'text-purple-400' : 'text-gray-500';
              const canSwap = swapTarget !== null;
              return (
                <div
                  key={player.id}
                  onClick={() => canSwap && handleSubstitute(player.id, swapTarget)}
                  className={`flex items-center gap-1 rounded px-2 py-1 transition-all ${
                    canSwap ? 'bg-gray-800 hover:bg-blue-900 ring-1 ring-blue-800/50 cursor-pointer' : 'bg-gray-800/60'
                  }`}
                >
                  <span className={`text-[10px] px-1 rounded shrink-0 w-7 text-center ${
                    ['left','center','right'].includes(player.position) ? 'bg-green-800 text-green-200' :
                    player.position === 'catcher' ? 'bg-blue-800 text-blue-200' :
                    'bg-yellow-800 text-yellow-200'
                  }`}>{POSITION_NAMES[player.position] || player.position}</span>
                  <span className="font-bold text-white shrink-0 truncate" style={{width:'4.5rem'}}>{player.name}</span>
                  <span className="text-[10px] text-gray-500 shrink-0 w-5 text-right">{player.age || ''}</span>
                  <span className={`shrink-0 ${CONDITION_COLORS[player.condition ?? CONDITION_LEVELS.NORMAL]}`}>
                    {CONDITION_ICONS[player.condition ?? CONDITION_LEVELS.NORMAL]}
                  </span>
                  <span className={`text-[10px] ${batsColor} shrink-0 w-3`}>{batsLabel}</span>
                  {(() => {
                    const maxW = 24;
                    const ratio = Math.min(1, f / 150);
                    const barW = Math.round(ratio * maxW);
                    const barColor = f >= 100 ? 'bg-red-500' : f >= 80 ? 'bg-orange-400' : f >= 60 ? 'bg-yellow-400' : f >= 40 ? 'bg-green-400' : 'bg-green-600';
                    return (
                      <span className="shrink-0" title={`疲労: ${f}`}>
                        <span className="relative bg-gray-700 rounded-sm overflow-hidden inline-block" style={{ width: maxW, height: 5 }}>
                          <span className={`absolute left-0 top-0 h-full rounded-sm ${barColor}`} style={{ width: barW }} />
                        </span>
                      </span>
                    );
                  })()}
                  {(() => {
                    const subs = getSubPositions(player, player.position);
                    return subs.length > 0 ? <span className="text-[10px]">{subs.map((s, j) => <span key={j} className={s.color}>{s.label}</span>)}</span> : null;
                  })()}
                  <span className="flex-1" />
                  {(() => {
                    const bs = player.seasonStats?.batting;
                    if (!bs || !bs.atBats) return <span className="text-gray-600 text-[10px] shrink-0" style={{width:'7.5rem'}}>-</span>;
                    const avg = (bs.hits / bs.atBats).toFixed(3);
                    return (
                      <span className="text-[10px] text-gray-400 shrink-0 font-mono tabular-nums" style={{width:'7.5rem'}}>
                        <span className="text-blue-300 inline-block w-9 text-right">{avg}</span>
                        <span className="inline-block w-7 text-right">{bs.homeruns || 0}本</span>
                        <span className="inline-block w-8 text-right">{bs.rbis || 0}点</span>
                      </span>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => handleGameChoice('manage')}
            className="group bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold py-3.5 px-8 rounded-xl transition-all text-lg shadow-lg shadow-green-900/40 active:scale-95 flex items-center gap-2"
          >
            <span className="text-xl group-hover:scale-110 transition-transform">🎮</span>
            試合采配
          </button>
          <button
            onClick={() => handleGameChoice('skip')}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 hover:text-white font-bold py-3.5 px-8 rounded-xl transition-all text-lg active:scale-95 border border-gray-600/50 hover:border-gray-500 flex items-center gap-2"
          >
            <span className="text-xl">⏭</span>
            試合スキップ
          </button>
        </div>
        <button
          onClick={() => setShowGameChoiceModal(false)}
          className="mt-4 w-full text-center text-gray-500 hover:text-gray-300 text-sm py-2 rounded-lg hover:bg-gray-700/30 transition-all"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
};

export default DateProgressScreen;
