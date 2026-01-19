// ============================================================
// 日付進行機能 - dateProgression.js
// 日付を進めてフェーズを遷移
// ============================================================

/**
 * 日付を進行（1日/1週間/1ヶ月）
 * @param {Object} seasonData - シーズンデータ
 * @param {number} days - 進める日数（7: 1週間、30: 1ヶ月目安）
 * @returns {Object} 更新されたシーズンデータ
 */
const progressDate = (seasonData, days = 1) => {
  const newDate = advanceDate(seasonData.currentDate, days);
  const newPhase = getCurrentPhase(newDate.month, newDate.day);

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
const progressToNextGame = (seasonData, teamName = null) => {
  const nextGame = getNextGame(seasonData.schedule, seasonData.currentDate, teamName);

  if (!nextGame) {
    // 次の試合がない場合は1日進める
    return progressDate(seasonData, 1);
  }

  const newDate = { ...nextGame.date };
  const newPhase = getCurrentPhase(newDate.month, newDate.day);

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
const progressToNextPhase = (seasonData) => {
  const currentMonth = seasonData.currentDate.month;
  let targetDate;

  // 現在のフェーズから次のフェーズの開始日を計算
  switch (seasonData.phase) {
    case SEASON_PHASES.SPRING_CAMP:
      // キャンプ → レギュラーシーズン（3月1日）
      targetDate = { year: seasonData.currentDate.year, month: 3, day: 1 };
      break;

    case SEASON_PHASES.REGULAR_SEASON:
      // レギュラーシーズン → プレーオフ（10月1日）
      targetDate = { year: seasonData.currentDate.year, month: 10, day: 1 };
      break;

    case SEASON_PHASES.PLAYOFFS:
      // プレーオフ → ドラフト（10月11日）
      targetDate = { year: seasonData.currentDate.year, month: 10, day: 11 };
      break;

    case SEASON_PHASES.DRAFT:
      // ドラフト → トライアウト（11月1日）
      targetDate = { year: seasonData.currentDate.year, month: 11, day: 1 };
      break;

    case SEASON_PHASES.TRYOUT:
      // トライアウト → オフシーズン（12月1日）
      targetDate = { year: seasonData.currentDate.year, month: 12, day: 1 };
      break;

    case SEASON_PHASES.OFF_SEASON:
      // オフシーズン → 次年度のキャンプ（1月1日）
      targetDate = { year: seasonData.currentDate.year + 1, month: 1, day: 1 };
      break;

    default:
      // デフォルトは1日進める
      targetDate = advanceDate(seasonData.currentDate, 1);
  }

  const newPhase = getCurrentPhase(targetDate.month, targetDate.day);

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
const progressToDate = (seasonData, targetDate) => {
  const newPhase = getCurrentPhase(targetDate.month, targetDate.day);

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
const recordGameResult = (seasonData, gameResult) => {
  // スケジュールの該当試合を更新
  const updatedSchedule = seasonData.schedule.map(game => {
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
  const updatedStandings = updateStandings(seasonData.standings, gameResult);

  // 試合結果リストに追加
  const updatedResults = [...seasonData.results, gameResult];

  return {
    ...seasonData,
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
const handlePhaseTransition = (seasonData, newPhase) => {
  let updatedSeasonData = { ...seasonData, phase: newPhase };

  switch (newPhase) {
    case SEASON_PHASES.PLAYOFFS:
      // プレーオフ開始時：上位チームを取得してプレーオフスケジュールを生成
      const topTeams = [...seasonData.standings]
        .sort((a, b) => b.winRate - a.winRate)
        .slice(0, seasonData.settings.playoffFormat === 'single' ? 2 : 4)
        .map(t => t.team);

      const playoffSchedule = generatePlayoffSchedule(
        topTeams,
        seasonData.settings.playoffFormat,
        seasonData.currentDate.year
      );

      // 既存スケジュールのプレーオフ部分を置き換え
      updatedSeasonData.schedule = [
        ...seasonData.schedule.filter(g => g.phase !== SEASON_PHASES.PLAYOFFS),
        ...playoffSchedule
      ];
      break;

    case SEASON_PHASES.DRAFT:
      // ドラフト開始時：新人選手リストを生成（将来実装）
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
const startNewSeason = (seasonData) => {
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
