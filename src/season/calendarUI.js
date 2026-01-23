// ============================================================
// カレンダーUIコンポーネント - calendarUI.js
// シーズンカレンダーの表示・操作
// ============================================================

/**
 * カレンダー月を生成（Reactコンポーネント外で使用可能）
 * @param {number} year - 年
 * @param {number} month - 月
 * @param {Array} schedule - 試合スケジュール
 * @param {Object} currentDate - 現在日付
 * @returns {Object} カレンダー情報
 */
export const generateCalendarMonth = (year, month, schedule, currentDate) => {
  const calendar = generateMonthCalendar(year, month, schedule);
  const phase = getCurrentPhase(month, 1);
  const phaseInfo = PHASE_INFO[phase];

  return {
    calendar,
    phase,
    phaseInfo,
    monthName: `${year}年${month}月`
  };
};

/**
 * 指定日の試合を取得
 * @param {Array} schedule - スケジュール
 * @param {Object} date - 日付
 * @returns {Array} その日の試合配列
 */
export const getGamesForDate = (schedule, date) => {
  return getScheduleByDate(schedule, date);
};

/**
 * チーム別カレンダーを生成
 * @param {Array} schedule - スケジュール
 * @param {string} teamName - チーム名
 * @param {number} year - 年
 * @param {number} month - 月
 * @returns {Array} チーム別カレンダー
 */
export const generateTeamCalendar = (schedule, teamName, year, month) => {
  const teamSchedule = getTeamSchedule(schedule, teamName);
  const calendar = generateMonthCalendar(year, month, teamSchedule);

  return calendar.map(day => {
    if (!day.day) return day;

    const game = day.games[0]; // チーム別なので1日1試合
    if (!game) return day;

    const isHome = game.home === teamName;
    const opponent = isHome ? game.away : game.home;
    const venue = isHome ? 'vs' : '@';

    return {
      ...day,
      opponent,
      venue,
      isHome,
      result: game.result ? (
        game.result.homeScore > game.result.awayScore
          ? (isHome ? '○' : '●')
          : game.result.homeScore < game.result.awayScore
          ? (isHome ? '●' : '○')
          : '△'
      ) : null
    };
  });
};

/**
 * 月の週配列を生成（週ごとに表示するため）
 * @param {Array} calendar - カレンダー配列
 * @returns {Array} 週配列 [[日, 月, ..., 土], ...]
 */
export const splitIntoWeeks = (calendar) => {
  const weeks = [];
  for (let i = 0; i < calendar.length; i += 7) {
    weeks.push(calendar.slice(i, i + 7));
  }
  return weeks;
};

/**
 * 日付の色を取得（フェーズ別）
 * @param {string} phase - フェーズ
 * @returns {string} Tailwind CSSクラス
 */
export const getPhaseColor = (phase) => {
  const colors = {
    [SEASON_PHASES.SPRING_CAMP]: 'bg-green-700',
    [SEASON_PHASES.REGULAR_SEASON]: 'bg-blue-700',
    [SEASON_PHASES.PLAYOFFS]: 'bg-yellow-700',
    [SEASON_PHASES.DRAFT]: 'bg-purple-700',
    [SEASON_PHASES.TRYOUT]: 'bg-orange-700',
    [SEASON_PHASES.OFF_SEASON]: 'bg-gray-700'
  };
  return colors[phase] || 'bg-gray-700';
};

/**
 * 試合結果のマークを取得
 * @param {string} result - '○', '●', '△'
 * @returns {Object} {text, color}
 */
export const getResultMark = (result) => {
  const marks = {
    '○': { text: '○', color: 'text-green-400' },
    '●': { text: '●', color: 'text-red-400' },
    '△': { text: '△', color: 'text-yellow-400' }
  };
  return marks[result] || { text: '', color: '' };
};

// ES module exports
