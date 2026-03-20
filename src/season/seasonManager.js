// ============================================================
// シーズン管理システム - seasonManager.js
// 独立リーグをモデルにした年間スケジュール管理
// ============================================================

/**
 * シーズンフェーズ定義
 */
export const SEASON_PHASES = {
  SPRING_CAMP: 'spring_camp',      // 1-3月：春季キャンプ
  REGULAR_SEASON: 'regular_season', // 4-9月：レギュラーシーズン
  PLAYOFFS: 'playoffs',             // 10月前半：優勝決定シリーズ
  DRAFT: 'draft',                   // 10月後半：ドラフト会議
  CONTRACT: 'contract',             // 11月9日：契約更改
  TRYOUT: 'tryout',                 // 11月10日〜：トライアウト
  OFF_SEASON: 'off_season'          // 11月30日〜：オフシーズン
};

/**
 * フェーズ情報の定義
 */
export const PHASE_INFO = {
  [SEASON_PHASES.SPRING_CAMP]: {
    name: '春季キャンプ',
    months: [1, 2, 3],
    color: 'bg-green-100',
    description: '選手調整・練習試合'
  },
  [SEASON_PHASES.REGULAR_SEASON]: {
    name: 'レギュラーシーズン',
    months: [4, 5, 6, 7, 8, 9],
    color: 'bg-blue-100',
    description: '公式戦'
  },
  [SEASON_PHASES.PLAYOFFS]: {
    name: 'プレーオフ',
    months: [10],
    days: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    color: 'bg-yellow-100',
    description: '優勝決定シリーズ'
  },
  [SEASON_PHASES.DRAFT]: {
    name: 'ドラフト',
    months: [10],
    days: [24],
    color: 'bg-purple-100',
    description: 'プロ野球ドラフト会議'
  },
  [SEASON_PHASES.CONTRACT]: {
    name: '契約更改',
    months: [11],
    days: [9],
    color: 'bg-teal-100',
    description: '次年度の選手契約判断'
  },
  [SEASON_PHASES.TRYOUT]: {
    name: 'トライアウト',
    months: [11],
    days: [10],
    color: 'bg-orange-100',
    description: '選手補強'
  },
  [SEASON_PHASES.OFF_SEASON]: {
    name: 'オフシーズン',
    months: [11, 12],
    startDay: 30,
    color: 'bg-gray-100',
    description: 'レギュレーション変更可能'
  }
};

/**
 * 月の日数を取得
 */
export const getDaysInMonth = (year, month) => {
  return new Date(year, month, 0).getDate();
};

/**
 * 現在のフェーズを取得
 */
export const getCurrentPhase = (month, day) => {
  if (month >= 1 && month <= 3) {
    return SEASON_PHASES.SPRING_CAMP;
  } else if (month >= 4 && month <= 9) {
    return SEASON_PHASES.REGULAR_SEASON;
  } else if (month === 10 && day < 10) {
    return SEASON_PHASES.REGULAR_SEASON;
  } else if (month === 10 && day >= 10 && day <= 20) {
    return SEASON_PHASES.PLAYOFFS;
  } else if (month === 10 && day >= 21 && day < 24) {
    return SEASON_PHASES.OFF_SEASON;
  } else if (month === 10 && day === 24) {
    return SEASON_PHASES.DRAFT;
  } else if (month === 10 && day > 24) {
    return SEASON_PHASES.OFF_SEASON;
  } else if (month === 11 && day < 9) {
    return SEASON_PHASES.OFF_SEASON;
  } else if (month === 11 && day === 9) {
    return SEASON_PHASES.CONTRACT;
  } else if (month === 11 && day === 10) {
    return SEASON_PHASES.TRYOUT;
  } else if (month === 11 && day > 10 && day < 30) {
    return SEASON_PHASES.OFF_SEASON;
  } else if (month === 11 && day >= 30) {
    return SEASON_PHASES.OFF_SEASON;
  } else if (month === 12) {
    return SEASON_PHASES.OFF_SEASON;
  }
  return SEASON_PHASES.OFF_SEASON;
};

/**
 * シーズン初期データ作成
 */
export const createSeasonData = (year = 1) => {
  return {
    year,                           // シーズン年数
    currentDate: { year: 2024 + (year - 1), month: 1, day: 1 },  // 現在の日付（年数に連動）
    phase: SEASON_PHASES.SPRING_CAMP,  // 現在のフェーズ
    schedule: [],                   // 試合スケジュール
    results: [],                    // 試合結果
    standings: [],                  // 順位表
    settings: {
      useDH: false,                 // DH制
      gamesPerSeason: 60,           // 年間試合数（チームあたり）
      teamsCount: 4,                // チーム数
      playoffFormat: 'single'       // プレーオフ形式（'single': 1位vs2位, 'double': 4チームトーナメント）
    }
  };
};

/**
 * 日付を進める
 * @param {Object} currentDate - 現在の日付 {year, month, day}
 * @param {number} days - 進める日数
 * @returns {Object} 新しい日付
 */
export const advanceDate = (currentDate, days = 1) => {
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
export const compareDates = (date1, date2) => {
  if (date1.year !== date2.year) return date1.year - date2.year;
  if (date1.month !== date2.month) return date1.month - date2.month;
  return date1.day - date2.day;
};

/**
 * 日付を文字列に変換
 */
export const formatDate = (date) => {
  return `${date.year}/${date.month}/${date.day}`;
};

/**
 * 日付から曜日を取得（0:日曜日 - 6:土曜日）
 */
export const getDayOfWeek = (date) => {
  return new Date(date.year, date.month - 1, date.day).getDay();
};

/**
 * 試合日かどうかを判定
 * - レギュラーシーズン：火・水・木・金・土・日（月曜休み）
 * - プレーオフ：全日
 */
export const isGameDay = (date, phase) => {
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
export const generateRegularSeasonSchedule = (teams, gamesPerOpponent = 20, startYear = 2024) => {
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
 * @param {string} format - 'single'（1位vs2位の1シリーズ）or 'double'（4チームトーナメント）
 * @param {number} year - 年
 * @returns {Array} プレーオフスケジュール
 */
export const generatePlayoffSchedule = (teams, format = 'single', year = 2024) => {
  const schedule = [];
  const startDate = { year, month: 10, day: 10 };
  let playoffId = 90001; // レギュラーシーズンのidと重複しない番号帯

  if (format === 'single') {
    // 1位 vs 2位の3戦先取制（最大5試合）
    const team1 = teams[0];
    const team2 = teams[1];

    for (let game = 1; game <= 5; game++) {
      const date = advanceDate(startDate, game - 1); // 毎日開催
      const isHomeTeam1 = game <= 2 || game === 5;

      schedule.push({
        id: playoffId++,
        date,
        home: isHomeTeam1 ? team1 : team2,
        away: isHomeTeam1 ? team2 : team1,
        homePitcher: null,
        awayPitcher: null,
        result: null,
        phase: SEASON_PHASES.PLAYOFFS,
        playoffRound: 'final',
        seriesGame: game,
        seriesId: 'final'
      });
    }
  } else if (format === 'double' && teams.length >= 4) {
    // 4チームトーナメント: 準決勝3戦先取(最大5試合)×2 + 決勝3戦先取(最大5試合)
    // 準決勝1: 1位 vs 4位
    for (let game = 1; game <= 5; game++) {
      const date = advanceDate(startDate, game - 1);
      const isHome1 = game <= 2 || game === 5;
      schedule.push({
        id: playoffId++,
        date,
        home: isHome1 ? teams[0] : teams[3],
        away: isHome1 ? teams[3] : teams[0],
        homePitcher: null, awayPitcher: null, result: null,
        phase: SEASON_PHASES.PLAYOFFS,
        playoffRound: 'semi',
        seriesGame: game,
        seriesId: 'semi1'
      });
    }
    // 準決勝2: 2位 vs 3位
    for (let game = 1; game <= 5; game++) {
      const date = advanceDate(startDate, game - 1);
      const isHome1 = game <= 2 || game === 5;
      schedule.push({
        id: playoffId++,
        date,
        home: isHome1 ? teams[1] : teams[2],
        away: isHome1 ? teams[2] : teams[1],
        homePitcher: null, awayPitcher: null, result: null,
        phase: SEASON_PHASES.PLAYOFFS,
        playoffRound: 'semi',
        seriesGame: game,
        seriesId: 'semi2'
      });
    }
    // 決勝（TBD - 準決勝結果で埋まる）
    for (let game = 1; game <= 5; game++) {
      const date = advanceDate(startDate, 6 + game - 1); // 準決勝後1日空けて
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
  } else if (format === 'top2' || format === 'split' || format === 'championship') {
    // 上位2チーム / 前後期 / 両リーグ：5戦3勝制
    const team1 = teams[0];
    const team2 = teams[1];
    for (let game = 1; game <= 5; game++) {
      const date = advanceDate(startDate, game - 1);
      const isHomeTeam1 = game <= 2 || game === 5;
      schedule.push({
        id: playoffId++,
        date,
        home: isHomeTeam1 ? team1 : team2,
        away: isHomeTeam1 ? team2 : team1,
        homePitcher: null, awayPitcher: null, result: null,
        phase: SEASON_PHASES.PLAYOFFS,
        playoffRound: 'final',
        seriesGame: game,
        seriesId: 'final'
      });
    }
  } else if (format === 'tournament') {
    // トーナメント: 上位4チーム、1戦勝負の準決勝→決勝
    schedule.push({
      id: playoffId++,
      date: { ...startDate },
      home: teams[0], away: teams[3],
      homePitcher: null, awayPitcher: null, result: null,
      phase: SEASON_PHASES.PLAYOFFS,
      playoffRound: 'semi', seriesGame: 1, seriesId: 'semi1'
    });
    schedule.push({
      id: playoffId++,
      date: advanceDate(startDate, 1),
      home: teams[1], away: teams[2],
      homePitcher: null, awayPitcher: null, result: null,
      phase: SEASON_PHASES.PLAYOFFS,
      playoffRound: 'semi', seriesGame: 1, seriesId: 'semi2'
    });
    schedule.push({
      id: playoffId++,
      date: advanceDate(startDate, 3),
      home: 'TBD', away: 'TBD',
      homePitcher: null, awayPitcher: null, result: null,
      phase: SEASON_PHASES.PLAYOFFS,
      playoffRound: 'final', seriesGame: 1, seriesId: 'final'
    });
  }

  return schedule;
};

/**
 * プレーオフシリーズの進行を管理
 * 3戦先取なら3勝した時点でシリーズ終了、残りの試合をスキップ
 * 準決勝が終わったら決勝のTBDチームを確定
 */
export const updatePlayoffProgress = (seasonData) => {
  const schedule = seasonData.schedule;
  const playoffGames = schedule.filter(g => g.phase === SEASON_PHASES.PLAYOFFS);
  if (playoffGames.length === 0) return seasonData;

  // シリーズIDごとに勝敗を集計
  const seriesMap = {};
  playoffGames.forEach(g => {
    if (!g.seriesId) return;
    if (!seriesMap[g.seriesId]) seriesMap[g.seriesId] = { games: [], teams: new Set() };
    seriesMap[g.seriesId].games.push(g);
    if (g.home !== 'TBD') seriesMap[g.seriesId].teams.add(g.home);
    if (g.away !== 'TBD') seriesMap[g.seriesId].teams.add(g.away);
  });

  let updated = false;

  // 各シリーズの勝敗チェック
  Object.entries(seriesMap).forEach(([seriesId, series]) => {
    const teams = [...series.teams];
    if (teams.length < 2 || teams.includes('TBD')) return;

    const wins = {};
    teams.forEach(t => { wins[t] = 0; });

    const completedGames = series.games.filter(g => g.result);
    completedGames.forEach(g => {
      if (g.result.homeScore > g.result.awayScore) wins[g.home] = (wins[g.home] || 0) + 1;
      else if (g.result.awayScore > g.result.homeScore) wins[g.away] = (wins[g.away] || 0) + 1;
    });

    // 3勝でシリーズ決着 → 残り試合をキャンセル
    const winsNeeded = series.games.length === 1 ? 1 : 3;
    const winner = teams.find(t => (wins[t] || 0) >= winsNeeded);
    if (winner) {
      series.games.forEach(g => {
        if (!g.result) {
          g.result = { homeScore: 0, awayScore: 0, cancelled: true };
          updated = true;
        }
      });
      series.winner = winner;
    }
  });

  // 準決勝が両方終わったら決勝のTBDを確定
  const semi1 = seriesMap['semi1'];
  const semi2 = seriesMap['semi2'];
  const final = seriesMap['final'];

  if (semi1?.winner && semi2?.winner && final) {
    const hasRealTeams = final.games.some(g => g.home !== 'TBD');
    if (!hasRealTeams) {
      final.games.forEach(g => {
        // 上位シードがホーム
        g.home = semi1.winner;
        g.away = semi2.winner;
      });
      updated = true;
    }
  }

  return updated ? { ...seasonData, schedule: [...schedule] } : seasonData;
};

/**
 * 順位表を更新
 * @param {Array} standings - 順位表
 * @param {Object} gameResult - 試合結果
 */
export const updateStandings = (standings, gameResult) => {
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

  // 勝率計算（引き分けを除外: 勝利 / (勝利 + 敗北)）
  homeTeam.winRate = (homeTeam.wins + homeTeam.losses) > 0 ? homeTeam.wins / (homeTeam.wins + homeTeam.losses) : 0;
  awayTeam.winRate = (awayTeam.wins + awayTeam.losses) > 0 ? awayTeam.wins / (awayTeam.wins + awayTeam.losses) : 0;

  // 順位でソート
  return standings.sort((a, b) => b.winRate - a.winRate);
};

/**
 * 順位表を初期化
 * @param {Array} teams - チーム配列
 */
export const initializeStandings = (teams) => {
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
export const generateMonthCalendar = (year, month, schedule) => {
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

// ES module exports
