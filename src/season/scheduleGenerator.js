// ============================================================
// 日程生成ロジック - scheduleGenerator.js
// 総当たり戦、投手ローテーション考慮
// ============================================================

import { compareDates, advanceDate, isGameDay, getCurrentPhase, SEASON_PHASES } from './seasonManager.js';

/**
 * ラウンドロビン方式で対戦カードを生成
 * @param {Array} teams - チーム配列
 * @returns {Array} 対戦カード配列 [{home, away}, ...]
 */
export const generateRoundRobin = (teams) => {
  const matchups = [];
  const n = teams.length;

  // 奇数チームの場合はダミーチームを追加
  const teamsWithBye = n % 2 === 1 ? [...teams, 'BYE'] : [...teams];
  const totalTeams = teamsWithBye.length;

  // ラウンドロビンアルゴリズム（円卓方式）
  for (let round = 0; round < totalTeams - 1; round++) {
    const roundMatchups = [];

    for (let i = 0; i < totalTeams / 2; i++) {
      const home = teamsWithBye[i];
      const away = teamsWithBye[totalTeams - 1 - i];

      // BYEチーム（休養日）をスキップ
      if (home !== 'BYE' && away !== 'BYE') {
        roundMatchups.push({ home, away });
      }
    }

    matchups.push(roundMatchups);

    // チームをローテーション（先頭固定、他を時計回りに回転）
    const rotated = [
      teamsWithBye[0],
      teamsWithBye[totalTeams - 1],
      ...teamsWithBye.slice(1, totalTeams - 1)
    ];
    teamsWithBye.splice(0, totalTeams, ...rotated);
  }

  return matchups;
};

/**
 * 年間スケジュールを生成（レギュラーシーズン）
 * 月間バランス型: 4-6月が前半戦、7-9月が後半戦
 * 土日中心に配置（平日は火・水・金も使用）
 *
 * @param {Object} config - 設定
 *   - teams: チーム配列
 *   - gamesPerSeason: 年間試合数（チームあたり）
 *   - startDate: 開始日 {year, month, day}
 *   - endDate: 終了日 {year, month, day}
 * @returns {Array} スケジュール配列
 */
export const generateFullSeasonSchedule = (config) => {
  const { teams, gamesPerSeason = 60, startDate, endDate } = config;
  const teamsCount = teams.length;

  // 各チームが何回対戦するか計算
  const opponentsCount = teamsCount - 1;
  const gamesPerOpponent = Math.floor(gamesPerSeason / opponentsCount);
  const extraGames = gamesPerSeason % opponentsCount;

  // ラウンドロビン方式で1周分の対戦カードを生成
  const oneRound = generateRoundRobin(teams);

  // 必要な周回数を計算
  const totalRounds = Math.ceil(gamesPerOpponent / 2);

  // 全対戦カードを生成
  const allMatchups = [];
  for (let i = 0; i < totalRounds; i++) {
    oneRound.forEach(roundGames => {
      roundGames.forEach(game => {
        if (i % 2 === 0) {
          allMatchups.push({ home: game.home, away: game.away });
        } else {
          allMatchups.push({ home: game.away, away: game.home });
        }
      });
    });
  }

  for (let i = 0; i < extraGames; i++) {
    const game = oneRound[0][i % oneRound[0].length];
    allMatchups.push({ home: game.home, away: game.away });
  }

  // 月別に試合を配分
  // 60試合 → 各月10試合 (4-9月)
  // 120試合 → 各月20試合
  // 143試合 → 3月後半も使用、約24試合/月

  const totalGamesNeeded = allMatchups.length;
  const gamesPerDay = Math.floor(teamsCount / 2); // 同時開催試合数

  // 試合開催月を決定
  let seasonMonths;
  if (gamesPerSeason >= 140) {
    // 140試合以上: 3月後半〜9月
    seasonMonths = [
      { month: 3, startDay: 20 },
      { month: 4, startDay: 1 },
      { month: 5, startDay: 1 },
      { month: 6, startDay: 1 },
      { month: 7, startDay: 1 },
      { month: 8, startDay: 1 },
      { month: 9, startDay: 1 }
    ];
  } else {
    // 140試合未満: 4月〜9月
    seasonMonths = [
      { month: 4, startDay: 1 },
      { month: 5, startDay: 1 },
      { month: 6, startDay: 1 },
      { month: 7, startDay: 1 },
      { month: 8, startDay: 1 },
      { month: 9, startDay: 1 }
    ];
  }

  // 1チームあたりの月間試合数
  const gamesPerMonth = Math.ceil(gamesPerSeason / seasonMonths.length);

  // 試合日を生成（土日優先、火水金も使用、月内バランス配置）
  const generateGameDays = (year, month, startDay, targetGames, gamesPerDay) => {
    const gameDays = [];
    const daysInMonth = new Date(year, month, 0).getDate();

    // まず土日を収集
    const weekends = [];
    // 次に火水金を収集
    const weekdays = [];

    for (let day = startDay; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay(); // 0=日, 1=月, ..., 6=土

      if (dayOfWeek === 0 || dayOfWeek === 6) {
        // 土日
        weekends.push({ year, month, day, priority: 1 });
      } else if (dayOfWeek === 2 || dayOfWeek === 3 || dayOfWeek === 5) {
        // 火水金
        weekdays.push({ year, month, day, priority: 2 });
      }
    }

    // 必要な試合日数
    const neededDays = Math.ceil(targetGames / gamesPerDay);

    // 土日だけで足りる場合は土日のみ、足りない場合は平日も追加
    if (weekends.length >= neededDays) {
      // 土日を月内で均等に配置（間引く）
      const step = weekends.length / neededDays;
      for (let i = 0; i < neededDays; i++) {
        const idx = Math.floor(i * step);
        gameDays.push(weekends[idx]);
      }
    } else {
      // 全土日を使用
      gameDays.push(...weekends);

      // 平日から追加（月内で均等に）
      const neededWeekdays = neededDays - weekends.length;
      if (neededWeekdays > 0 && weekdays.length > 0) {
        const step = weekdays.length / neededWeekdays;
        for (let i = 0; i < neededWeekdays && i < weekdays.length; i++) {
          const idx = Math.floor(i * step);
          gameDays.push(weekdays[idx]);
        }
      }
    }

    // 日付順でソート
    gameDays.sort((a, b) => a.day - b.day);

    return gameDays;
  };

  // スケジュールを月別に配置
  const schedule = [];
  let matchupIndex = 0;
  const year = startDate.year;

  // 各月に試合を配分
  for (const monthConfig of seasonMonths) {
    if (matchupIndex >= allMatchups.length) break;

    // 月間で配置する試合数を計算
    const remainingGames = allMatchups.length - matchupIndex;
    const monthIndex = seasonMonths.indexOf(monthConfig);
    const remainingMonths = seasonMonths.length - monthIndex;
    const targetGamesThisMonth = Math.ceil(remainingGames / remainingMonths / gamesPerDay) * gamesPerDay;

    // この月の試合日を生成（月内バランス配置）
    const monthGameDays = generateGameDays(
      year,
      monthConfig.month,
      monthConfig.startDay,
      targetGamesThisMonth,
      gamesPerDay
    );

    let gamesScheduledThisMonth = 0;

    for (const gameDay of monthGameDays) {
      if (matchupIndex >= allMatchups.length) break;
      if (gamesScheduledThisMonth >= targetGamesThisMonth) break;

      // この日の試合数
      const gamesThisDay = Math.min(gamesPerDay, allMatchups.length - matchupIndex);

      for (let i = 0; i < gamesThisDay; i++) {
        const matchup = allMatchups[matchupIndex + i];

        schedule.push({
          id: schedule.length + 1,
          date: { year: gameDay.year, month: gameDay.month, day: gameDay.day },
          home: matchup.home,
          away: matchup.away,
          starterHome: null,
          starterAway: null,
          result: null,
          phase: SEASON_PHASES.REGULAR_SEASON
        });
      }

      matchupIndex += gamesThisDay;
      gamesScheduledThisMonth += gamesThisDay;
    }
  }

  return schedule;
};

/**
 * 投手ローテーションを生成
 * @param {Array} pitchers - 投手配列
 * @param {number} rotation - ローテーション人数（通常4-6人）
 * @returns {Array} ローテーション配列
 */
export const generatePitcherRotation = (pitchers, rotation = 5) => {
  // スタミナと能力でソート
  const sortedPitchers = [...pitchers]
    .filter(p => p.pitching && p.pitching.stamina > 100)
    .sort((a, b) => {
      const scoreA = a.pitching.velocity * 0.4 + a.pitching.control * 0.6 + a.pitching.stamina * 0.1;
      const scoreB = b.pitching.velocity * 0.4 + b.pitching.control * 0.6 + b.pitching.stamina * 0.1;
      return scoreB - scoreA;
    });

  return sortedPitchers.slice(0, rotation);
};

/**
 * スケジュールに投手を割り当て
 * @param {Array} schedule - スケジュール配列
 * @param {Object} teamRosters - チーム別ロスター {teamName: [players]}
 * @param {number} rotationSize - ローテーション人数
 * @returns {Array} 投手が割り当てられたスケジュール
 */
export const assignPitchersToSchedule = (schedule, teamRosters, rotationSize = 5) => {
  // 各チームのローテーションを生成
  const rotations = {};
  Object.keys(teamRosters).forEach(teamName => {
    rotations[teamName] = generatePitcherRotation(teamRosters[teamName], rotationSize);
  });

  // 各チームの次の登板投手インデックス
  const nextPitcherIndex = {};
  Object.keys(rotations).forEach(teamName => {
    nextPitcherIndex[teamName] = 0;
  });

  // スケジュールに投手を割り当て
  return schedule.map(game => {
    const homeRotation = rotations[game.home];
    const awayRotation = rotations[game.away];

    if (!homeRotation || !awayRotation) return game;

    const homePitcher = homeRotation[nextPitcherIndex[game.home]];
    const awayPitcher = awayRotation[nextPitcherIndex[game.away]];

    // 次の投手へ
    nextPitcherIndex[game.home] = (nextPitcherIndex[game.home] + 1) % homeRotation.length;
    nextPitcherIndex[game.away] = (nextPitcherIndex[game.away] + 1) % awayRotation.length;

    return {
      ...game,
      homePitcher: homePitcher ? homePitcher.name : null,
      awayPitcher: awayPitcher ? awayPitcher.name : null
    };
  });
};

/**
 * 特定チームのスケジュールを抽出
 * @param {Array} schedule - 全体スケジュール
 * @param {string} teamName - チーム名
 * @returns {Array} チーム別スケジュール
 */
export const getTeamSchedule = (schedule, teamName) => {
  return schedule.filter(game => game.home === teamName || game.away === teamName);
};

/**
 * 特定日のスケジュールを取得
 * @param {Array} schedule - 全体スケジュール
 * @param {Object} date - 日付 {year, month, day}
 * @returns {Array} その日の試合
 */
export const getScheduleByDate = (schedule, date) => {
  return schedule.filter(game =>
    game.date.year === date.year &&
    game.date.month === date.month &&
    game.date.day === date.day
  );
};

/**
 * 特定月のスケジュールを取得
 * @param {Array} schedule - 全体スケジュール
 * @param {number} year - 年
 * @param {number} month - 月
 * @returns {Array} その月の試合
 */
export const getScheduleByMonth = (schedule, year, month) => {
  return schedule.filter(game =>
    game.date.year === year &&
    game.date.month === month
  );
};

/**
 * 次の試合を取得
 * @param {Array} schedule - 全体スケジュール
 * @param {Object} currentDate - 現在日付
 * @param {string} teamName - チーム名（オプション）
 * @returns {Object} 次の試合
 */
export const getNextGame = (schedule, currentDate, teamName = null) => {
  let filteredSchedule = schedule.filter(game => !game.result); // 未実施の試合

  if (teamName) {
    filteredSchedule = filteredSchedule.filter(game =>
      game.home === teamName || game.away === teamName
    );
  }

  // 日付でソート
  filteredSchedule.sort((a, b) => compareDates(a.date, b.date));

  // 現在日付以降の試合を探す
  return filteredSchedule.find(game => compareDates(game.date, currentDate) >= 0) || null;
};

/**
 * レギュラーシーズンの試合数をカウント
 * @param {Array} schedule - スケジュール
 * @param {string} teamName - チーム名（オプション）
 * @returns {Object} {total: 総試合数, played: 実施済み, remaining: 残り}
 */
export const countGames = (schedule, teamName = null) => {
  let filteredSchedule = schedule;

  if (teamName) {
    filteredSchedule = schedule.filter(game =>
      game.home === teamName || game.away === teamName
    );
  }

  const total = filteredSchedule.length;
  const played = filteredSchedule.filter(game => game.result !== null).length;
  const remaining = total - played;

  return { total, played, remaining };
};

// ES module exports
