// ============================================================
// 日付進行機能 - dateProgression.js
// 日付を進めてフェーズを遷移
// ============================================================

import { advanceDate, getCurrentPhase, createSeasonData, initializeStandings, SEASON_PHASES, updateStandings, generatePlayoffSchedule, updatePlayoffProgress } from './seasonManager.js';
import { generateFullSeasonSchedule } from './scheduleGenerator.js';
import { recoverAllPitcherFatigue } from '../game/autoSimulation.js';
import { updateAllPlayersCondition } from '../game/condition.js';

/**
 * 日付を進行（1日/1週間/1ヶ月）
 * @param {Object} seasonData - シーズンデータ
 * @param {number} days - 進める日数（7: 1週間、30: 1ヶ月目安）
 * @returns {Object} 更新されたシーズンデータ
 */
export const progressDate = (seasonData, days = 1) => {
  const newDate = advanceDate(seasonData.currentDate, days);
  const phaseOpts = seasonData.settings?.universityMode ? { universityMode: true } : undefined;
  const newPhase = getCurrentPhase(newDate.month, newDate.day, phaseOpts);

  // 投手の疲労を回復（1日あたり20）+ コンディション更新
  for (let i = 0; i < days; i++) {
    recoverAllPitcherFatigue(20);
    updateAllPlayersCondition();
  }

  return {
    ...seasonData,
    currentDate: newDate,
    phase: newPhase
  };
};

/**
 * 次の試合日まで進行
 * @param {Object} seasonData - シーズンデータ
 * @param {string} teamName - チーム名（オプション）
 * @returns {Object} 更新されたシーズンデータ
 */
export const progressToNextGame = (seasonData, teamName = null) => {
  const nextGame = getNextGame(seasonData.schedule, seasonData.currentDate, teamName);

  if (!nextGame) {
    // 次の試合がない場合は1日進める
    return progressDate(seasonData, 1);
  }

  const newDate = { ...nextGame.date };
  const phaseOpts = seasonData.settings?.universityMode ? { universityMode: true } : undefined;
  const newPhase = getCurrentPhase(newDate.month, newDate.day, phaseOpts);

  return {
    ...seasonData,
    currentDate: newDate,
    phase: newPhase
  };
};

/**
 * 次のフェーズまで進行
 * @param {Object} seasonData - シーズンデータ
 * @returns {Object} 更新されたシーズンデータ
 */
export const progressToNextPhase = (seasonData) => {
  const currentMonth = seasonData.currentDate.month;
  let targetDate;

  // 現在のフェーズから次のフェーズの開始日を計算
  switch (seasonData.phase) {
    case SEASON_PHASES.SPRING_CAMP:
      // キャンプ → レギュラーシーズン（4月1日）
      targetDate = { year: seasonData.currentDate.year, month: 4, day: 1 };
      break;

    case SEASON_PHASES.REGULAR_SEASON:
      if (seasonData.settings?.universityMode) {
        // 大学モード: レギュラーシーズン → ドラフト（10月24日）
        targetDate = { year: seasonData.currentDate.year, month: 10, day: 24 };
      } else {
        // レギュラーシーズン → プレーオフ（10月10日）
        targetDate = { year: seasonData.currentDate.year, month: 10, day: 10 };
      }
      break;

    case SEASON_PHASES.PLAYOFFS:
      // プレーオフ → ドラフト（10月24日）
      targetDate = { year: seasonData.currentDate.year, month: 10, day: 24 };
      break;

    case SEASON_PHASES.DRAFT:
      if (seasonData.settings?.universityMode) {
        // 大学モード: ドラフト → オフシーズン（11月15日）
        targetDate = { year: seasonData.currentDate.year, month: 11, day: 15 };
      } else {
        // ドラフト → 契約更改（11月9日）
        targetDate = { year: seasonData.currentDate.year, month: 11, day: 9 };
      }
      break;

    case SEASON_PHASES.CONTRACT:
      // 契約更改 → トライアウト（11月10日）
      targetDate = { year: seasonData.currentDate.year, month: 11, day: 10 };
      break;

    case SEASON_PHASES.TRYOUT:
      // トライアウト → オフシーズン（11月30日）
      targetDate = { year: seasonData.currentDate.year, month: 11, day: 30 };
      break;

    case SEASON_PHASES.OFF_SEASON:
      // オフシーズン → 次年度のキャンプ（1月1日）
      targetDate = { year: seasonData.currentDate.year + 1, month: 1, day: 1 };
      break;

    default:
      // デフォルトは1日進める
      targetDate = advanceDate(seasonData.currentDate, 1);
  }

  const phaseOpts2 = seasonData.settings?.universityMode ? { universityMode: true } : undefined;
  const newPhase = getCurrentPhase(targetDate.month, targetDate.day, phaseOpts2);

  return {
    ...seasonData,
    currentDate: targetDate,
    phase: newPhase,
    year: targetDate.month === 1 && targetDate.day === 1 ? seasonData.year + 1 : seasonData.year
  };
};

/**
 * 指定日まで進行
 * @param {Object} seasonData - シーズンデータ
 * @param {Object} targetDate - 目標日付 {year, month, day}
 * @returns {Object} 更新されたシーズンデータ
 */
export const progressToDate = (seasonData, targetDate) => {
  const phaseOpts3 = seasonData.settings?.universityMode ? { universityMode: true } : undefined;
  const newPhase = getCurrentPhase(targetDate.month, targetDate.day, phaseOpts3);

  return {
    ...seasonData,
    currentDate: targetDate,
    phase: newPhase
  };
};

/**
 * 試合結果を記録
 * @param {Object} seasonData - シーズンデータ
 * @param {Object} gameResult - 試合結果
 *   - date: 日付
 *   - home: ホームチーム名
 *   - away: アウェイチーム名
 *   - homeScore: ホーム得点
 *   - awayScore: アウェイ得点
 * @returns {Object} 更新されたシーズンデータ
 */
export const recordGameResult = (seasonData, gameResult) => {
  // 大学モード春秋制: 秋季初試合（9月以降）を記録する前に春季順位をスナップショット
  let baseData = seasonData;
  if (
    seasonData.settings?.universityMode &&
    !seasonData.springStandings &&
    (gameResult.date?.month || 0) >= 9
  ) {
    baseData = {
      ...seasonData,
      springStandings: seasonData.standings.map(s => ({ ...s })),
      standings: seasonData.standings.map(s => ({
        team: s.team, wins: 0, losses: 0, draws: 0, winRate: 0, gamesPlayed: 0,
      })),
    };
  }

  // スケジュールの該当試合を更新
  const updatedSchedule = baseData.schedule.map(game => {
    if (
      game.date.year === gameResult.date.year &&
      game.date.month === gameResult.date.month &&
      game.date.day === gameResult.date.day &&
      game.home === gameResult.home &&
      game.away === gameResult.away
    ) {
      return {
        ...game,
        result: {
          homeScore: gameResult.homeScore,
          awayScore: gameResult.awayScore
        }
      };
    }
    return game;
  });

  // 順位表を更新
  const updatedStandings = updateStandings(baseData.standings, gameResult);

  // 試合結果リストに追加
  const updatedResults = [...baseData.results, gameResult];

  return {
    ...baseData,
    schedule: updatedSchedule,
    standings: updatedStandings,
    results: updatedResults
  };
};

/**
 * フェーズ遷移時の自動処理
 * @param {Object} seasonData - シーズンデータ
 * @param {string} newPhase - 新しいフェーズ
 * @returns {Object} 更新されたシーズンデータ
 */
export const handlePhaseTransition = (seasonData, newPhase) => {
  let updatedSeasonData = { ...seasonData, phase: newPhase };

  switch (newPhase) {
    case SEASON_PHASES.PLAYOFFS: {
      // 社会人モードは都市対抗・日本選手権がプレーオフ代替→リーグ戦プレーオフはスキップ
      if (seasonData.settings?.corporateMode) {
        break;
      }
      // 独立リーグ・大学モードはリーグ戦プレーオフなし
      break;
      // プレーオフ開始時：上位チームを取得してプレーオフスケジュールを生成
      let topTeams;
      const playoffFormat = seasonData.settings.playoffFormat;
      const leagueFormat = seasonData.settings.leagueFormat || 'single';
      const teamsNeeded = playoffFormat === 'tournament' ? 4 : 2;

      if (leagueFormat === 'two') {
        // 2リーグ制: リーグ別に上位チームを取得
        const allTeamNames = seasonData.settings.teamNames || Object.keys(seasonData.standings.reduce((acc, s) => { acc[s.team] = true; return acc; }, {}));
        const halfTeams = Math.floor(allTeamNames.length / 2);
        const league1Teams = allTeamNames.slice(0, halfTeams);
        const league2Teams = allTeamNames.slice(halfTeams);

        const sorted = [...seasonData.standings].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
        const l1Sorted = sorted.filter(s => league1Teams.includes(s.team));
        const l2Sorted = sorted.filter(s => league2Teams.includes(s.team));

        if (teamsNeeded === 4) {
          // トーナメント: 各リーグ1位2位（L1-1位 vs L2-2位、L2-1位 vs L1-2位）
          topTeams = [l1Sorted[0]?.team, l2Sorted[0]?.team, l1Sorted[1]?.team, l2Sorted[1]?.team].filter(Boolean);
        } else {
          // 3回戦/5回戦: 両リーグ1位同士
          topTeams = [l1Sorted[0]?.team, l2Sorted[0]?.team].filter(Boolean);
        }
      } else {
        // 1リーグ制: 年間順位から上位チームを取得
        topTeams = [...seasonData.standings]
          .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins)
          .slice(0, teamsNeeded)
          .map(t => t.team);
      }

      const playoffSchedule = generatePlayoffSchedule(
        topTeams,
        playoffFormat,
        seasonData.currentDate.year
      );

      // 既存スケジュールのプレーオフ部分を置き換え
      updatedSeasonData.schedule = [
        ...seasonData.schedule.filter(g => g.phase !== SEASON_PHASES.PLAYOFFS),
        ...playoffSchedule
      ];
      break;
    }

    case SEASON_PHASES.DRAFT:
      // ドラフト開始時：新人選手リストを生成（将来実装）
      break;

    case SEASON_PHASES.CONTRACT:
      // 契約更改：画面遷移はApp.jsx側で処理
      break;

    case SEASON_PHASES.OFF_SEASON:
      // オフシーズン開始時：シーズン統計を保存
      break;

    default:
      break;
  }

  return updatedSeasonData;
};

/**
 * 年度を進める（新シーズン開始）
 * @param {Object} seasonData - シーズンデータ
 * @returns {Object} 新しいシーズンデータ
 */
export const startNewSeason = (seasonData) => {
  const newYear = seasonData.year + 1;
  const newSeasonData = createSeasonData(newYear);

  // 設定を引き継ぎ
  newSeasonData.settings = { ...seasonData.settings };

  // スケジュールを再生成
  const teams = seasonData.standings.map(t => t.team);
  const schedule = generateFullSeasonSchedule({
    teams,
    gamesPerSeason: newSeasonData.settings.gamesPerSeason,
    startDate: { year: 2024 + newYear, month: 3, day: 1 },
    endDate: { year: 2024 + newYear, month: 9, day: 30 }
  });

  newSeasonData.schedule = schedule;
  newSeasonData.standings = initializeStandings(teams);

  return newSeasonData;
};

export { updatePlayoffProgress };

// ES module exports
