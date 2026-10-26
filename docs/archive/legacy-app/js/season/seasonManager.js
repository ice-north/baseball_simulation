// ============================================================
// シーズン管理システム - seasonManager.js
// 独立リーグをモデルにした年間スケジュール管理
// ============================================================

/**
 * シーズンフェーズ定義
 */
const SEASON_PHASES = {
  SPRING_CAMP: 'spring_camp',      // 1-2月：春季キャンプ
  REGULAR_SEASON: 'regular_season', // 3-9月：レギュラーシーズン
  PLAYOFFS: 'playoffs',             // 10月前半：優勝決定シリーズ
  DRAFT: 'draft',                   // 10月後半：ドラフト会議
  TRYOUT: 'tryout',                 // 11月：トライアウト
  OFF_SEASON: 'off_season'          // 12月：オフシーズン（レギュレーション変更可能）
};

/**
 * フェーズ情報の定義
 */
const PHASE_INFO = {
  [SEASON_PHASES.SPRING_CAMP]: {
    name: '春季キャンプ',
    months: [1, 2],
    color: 'bg-green-100',
    description: '選手調整・練習試合'
  },
  [SEASON_PHASES.REGULAR_SEASON]: {
    name: 'レギュラーシーズン',
    months: [3, 4, 5, 6, 7, 8, 9],
    color: 'bg-blue-100',
    description: '公式戦'
  },
  [SEASON_PHASES.PLAYOFFS]: {
    name: 'プレーオフ',
    months: [10],
    days: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    color: 'bg-yellow-100',
    description: '優勝決定シリーズ'
  },
  [SEASON_PHASES.DRAFT]: {
    name: 'ドラフト',
    months: [10],
    days: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
    color: 'bg-purple-100',
    description: '新人選手獲得'
  },
  [SEASON_PHASES.TRYOUT]: {
    name: 'トライアウト',
    months: [11],
    color: 'bg-orange-100',
    description: '選手補強'
  },
  [SEASON_PHASES.OFF_SEASON]: {
    name: 'オフシーズン',
    months: [12],
    color: 'bg-gray-100',
    description: 'レギュレーション変更可能'
  }
};

/**
 * 月の日数を取得
 */
const getDaysInMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

/**
 * 現在のフェーズを取得
 */
const getCurrentPhase = (month, day) => {
  if (month >= 1 && month <= 2) {
    return SEASON_PHASES.SPRING_CAMP;
  } else if (month >= 3 && month <= 9) {
    return SEASON_PHASES.REGULAR_SEASON;
  } else if (month === 10 && day <= 10) {
    return SEASON_PHASES.PLAYOFFS;
  } else if (month === 10 && day > 10) {
    return SEASON_PHASES.DRAFT;
  } else if (month === 11) {
    return SEASON_PHASES.TRYOUT;
  } else if (month === 12) {
    return SEASON_PHASES.OFF_SEASON;
  }
  return SEASON_PHASES.OFF_SEASON;
};

/**
 * シーズン初期データ作成
 */
const createSeasonData = (year = 1) => {
  return {
    year,                           // シーズン年数
    currentDate: { year: 2024, month: 1, day: 1 },  // 現在の日付
    phase: SEASON_PHASES.SPRING_CAMP,  // 現在のフェーズ
    schedule: [],                   // 試合スケジュール
    results: [],                    // 試合結果
    standings: [],                  // 順位表
    settings: {
      useDH: false,                 // DH制
      gamesPerSeason: 60,           // 年間試合数（チームあたり）
      teamsCount: 4,                // チーム数
      playoffFormat: 'short'        // プレーオフ形式（'short': 3回戦, 'full': 5回戦, 'tournament': 4チームトーナメント）
    }
  };
};

/**
 * 日付を進める
 * @param {Object} currentDate - 現在の日付 {year, month, day}
 * @param {number} days - 進める日数
 * @returns {Object} 新しい日付
 */
const advanceDate = (currentDate, days = 1) => {
  let { year, month, day } = currentDate;

  day += days;

  while (day > getDaysInMonth(year, month)) {
    day -= getDaysInMonth(year, month);
    month++;

    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return { year, month, day };
};

/**
 * 日付を比較
 * @returns {number} -1: date1が前, 0: 同じ, 1: date1が後
 */
const compareDates = (date1, date2) => {
  if (date1.year !== date2.year) return date1.year - date2.year;
  if (date1.month !== date2.month) return date1.month - date2.month;
  return date1.day - date2.day;
};

/**
 * 日付を文字列に変換
 */
const formatDate = (date) => {
  return `${date.year}/${date.month}/${date.day}`;
};

/**
 * 日付から曜日を取得（0:日曜日 - 6:土曜日）
 */
const getDayOfWeek = (date) => {
  return new Date(date.year, date.month - 1, date.day).getDay();
};

/**
 * 試合日かどうかを判定
 * - レギュラーシーズン：火・水・木・金・土・日（月曜休み）
 * - プレーオフ：全日
 */
const isGameDay = (date, phase) => {
  const dayOfWeek = getDayOfWeek(date);

  if (phase === SEASON_PHASES.REGULAR_SEASON) {
    return dayOfWeek !== 1; // 月曜以外
  } else if (phase === SEASON_PHASES.PLAYOFFS) {
    return true; // 全日
  }

  return false;
};

/**
 * レギュラーシーズンの試合スケジュールを生成
 * @param {Array} teams - チーム配列 ['チームA', 'チームB', ...]
 * @param {number} gamesPerOpponent - 各対戦相手との試合数
 * @param {number} startYear - 開始年
 * @returns {Array} スケジュール配列
 */
const generateRegularSeasonSchedule = (teams, gamesPerOpponent = 20, startYear = 2024) => {
  const schedule = [];
  const teamsCount = teams.length;

  // 各チームペアの対戦カードを作成
  const matchups = [];
  for (let i = 0; i < teamsCount; i++) {
    for (let j = i + 1; j < teamsCount; j++) {
      matchups.push({ team1: teams[i], team2: teams[j] });
    }
  }

  // 3月1日から開始
  let currentDate = { year: startYear, month: 3, day: 1 };
  const endDate = { year: startYear, month: 9, day: 30 };

  // 各対戦カードごとに試合を分散配置
  let gameCount = 0;
  const totalGamesNeeded = matchups.length * gamesPerOpponent;

  while (compareDates(currentDate, endDate) <= 0 && gameCount < totalGamesNeeded) {
    const phase = getCurrentPhase(currentDate.month, currentDate.day);

    if (isGameDay(currentDate, phase)) {
      // この日に複数試合を配置（同時開催可能）
      const gamesThisDay = Math.min(Math.floor(teamsCount / 2), totalGamesNeeded - gameCount);

      for (let i = 0; i < gamesThisDay; i++) {
        const matchupIndex = (gameCount + i) % matchups.length;
        const matchup = matchups[matchupIndex];
        const gameNumber = Math.floor((gameCount + i) / matchups.length);

        // ホーム/アウェイを交互に
        const isHomeTeam1 = gameNumber % 2 === 0;

        schedule.push({
          date: { ...currentDate },
          home: isHomeTeam1 ? matchup.team1 : matchup.team2,
          away: isHomeTeam1 ? matchup.team2 : matchup.team1,
          homePitcher: null,  // 後で設定
          awayPitcher: null,  // 後で設定
          result: null,
          phase: SEASON_PHASES.REGULAR_SEASON
        });
      }

      gameCount += gamesThisDay;
    }

    currentDate = advanceDate(currentDate, 1);
  }

  return schedule;
};

/**
 * プレーオフスケジュールを生成
 * @param {Array} teams - 上位チーム配列（順位順）
 * @param {string} format - 'short'（3回戦2勝先取）/ 'full'（5回戦3勝先取）/ 'tournament'（4チームトーナメント）
 * @param {number} year - 年
 * @returns {Array} プレーオフスケジュール
 */
const generatePlayoffSchedule = (teams, format = 'short', year = 2024) => {
  const schedule = [];
  const startDate = { year, month: 10, day: 1 };
  let playoffId = 90001;

  const addSeries = (team1, team2, maxGames, round, seriesId, dayOffset = 0) => {
    for (let game = 1; game <= maxGames; game++) {
      const date = advanceDate(startDate, dayOffset + game - 1);
      const isHomeTeam1 = maxGames === 3
        ? (game <= 1 || game === 3)
        : (game <= 2 || game === 5);
      schedule.push({
        id: playoffId++,
        date,
        home: isHomeTeam1 ? team1 : team2,
        away: isHomeTeam1 ? team2 : team1,
        homePitcher: null, awayPitcher: null, result: null,
        phase: SEASON_PHASES.PLAYOFFS,
        playoffRound: round,
        seriesGame: game,
        seriesId
      });
    }
  };

  if (format === 'short') {
    addSeries(teams[0], teams[1], 3, 'final', 'final');
  } else if (format === 'full') {
    addSeries(teams[0], teams[1], 5, 'final', 'final');
  } else if (format === 'tournament' && teams.length >= 4) {
    addSeries(teams[0], teams[3], 5, 'semi', 'semi1', 0);
    addSeries(teams[1], teams[2], 5, 'semi', 'semi2', 0);
    for (let game = 1; game <= 5; game++) {
      const date = advanceDate(startDate, 6 + game - 1);
      schedule.push({
        id: playoffId++,
        date,
        home: 'TBD', away: 'TBD',
        homePitcher: null, awayPitcher: null, result: null,
        phase: SEASON_PHASES.PLAYOFFS,
        playoffRound: 'final',
        seriesGame: game,
        seriesId: 'final'
      });
    }
  }

  return schedule;
};

/**
 * 順位表を更新
 * @param {Array} standings - 順位表
 * @param {Object} gameResult - 試合結果
 */
const updateStandings = (standings, gameResult) => {
  const { home, away, homeScore, awayScore } = gameResult;

  const homeTeam = standings.find(t => t.team === home);
  const awayTeam = standings.find(t => t.team === away);

  if (!homeTeam || !awayTeam) return standings;

  if (homeScore > awayScore) {
    homeTeam.wins++;
    awayTeam.losses++;
  } else if (awayScore > homeScore) {
    awayTeam.wins++;
    homeTeam.losses++;
  } else {
    homeTeam.draws++;
    awayTeam.draws++;
  }

  // 勝率計算
  homeTeam.winRate = homeTeam.wins / (homeTeam.wins + homeTeam.losses + homeTeam.draws);
  awayTeam.winRate = awayTeam.wins / (awayTeam.wins + awayTeam.losses + awayTeam.draws);

  // 順位でソート
  return standings.sort((a, b) => b.winRate - a.winRate);
};

/**
 * 順位表を初期化
 * @param {Array} teams - チーム配列
 */
const initializeStandings = (teams) => {
  return teams.map(team => ({
    team,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0.000,
    gamesPlayed: 0
  }));
};

/**
 * カレンダー月データを生成
 * @param {number} year - 年
 * @param {number} month - 月
 * @param {Array} schedule - 試合スケジュール
 * @returns {Array} カレンダーデータ
 */
const generateMonthCalendar = (year, month, schedule) => {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = getDayOfWeek({ year, month, day: 1 });

  const calendar = [];

  // 前月の空白日
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendar.push({ day: null, games: [] });
  }

  // 当月の日付
  for (let day = 1; day <= daysInMonth; day++) {
    const date = { year, month, day };
    const phase = getCurrentPhase(month, day);
    const gamesThisDay = schedule.filter(game =>
      game.date.year === year &&
      game.date.month === month &&
      game.date.day === day
    );

    calendar.push({
      day,
      date,
      phase,
      games: gamesThisDay,
      isGameDay: isGameDay(date, phase)
    });
  }

  return calendar;
};
