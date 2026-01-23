// ============================================================
// 日程生成ロジック - scheduleGenerator.js
// 総当たり戦、投手ローテーション考慮
// ============================================================

/**
 * ラウンドロビン方式で対戦カードを生成
 * @param {Array} teams - チーム配列
 * @returns {Array} 対戦カード配列 [{home, away}, ...]
 */
const generateRoundRobin = (teams) => {
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
 * @param {Object} config - 設定
 *   - teams: チーム配列
 *   - gamesPerSeason: 年間試合数（チームあたり）
 *   - startDate: 開始日 {year, month, day}
 *   - endDate: 終了日 {year, month, day}
 * @returns {Array} スケジュール配列
 */
const generateFullSeasonSchedule = (config) => {
  const { teams, gamesPerSeason = 60, startDate, endDate } = config;
  const teamsCount = teams.length;

  // 各チームが何回対戦するか計算
  const opponentsCount = teamsCount - 1;
  const gamesPerOpponent = Math.floor(gamesPerSeason / opponentsCount);
  const extraGames = gamesPerSeason % opponentsCount; // 余り分

  // ラウンドロビン方式で1周分の対戦カードを生成
  const oneRound = generateRoundRobin(teams);

  // 必要な周回数を計算
  const totalRounds = Math.ceil(gamesPerOpponent / 2);

  // 全対戦カードを生成
  const allMatchups = [];
  for (let i = 0; i < totalRounds; i++) {
    oneRound.forEach(roundGames => {
      roundGames.forEach(game => {
        // ホーム/アウェイを交互に
        if (i % 2 === 0) {
          allMatchups.push({ home: game.home, away: game.away });
        } else {
          allMatchups.push({ home: game.away, away: game.home });
        }
      });
    });
  }

  // 余り分の試合を追加（特定の対戦カードを追加）
  for (let i = 0; i < extraGames; i++) {
    const game = oneRound[0][i % oneRound[0].length];
    allMatchups.push({ home: game.home, away: game.away });
  }

  // 日程に配置
  const schedule = [];
  let currentDate = { ...startDate };
  let matchupIndex = 0;

  while (compareDates(currentDate, endDate) <= 0 && matchupIndex < allMatchups.length) {
    const phase = getCurrentPhase(currentDate.month, currentDate.day);

    if (isGameDay(currentDate, phase)) {
      // この日に開催可能な試合数（同時開催）
      const gamesThisDay = Math.min(Math.floor(teamsCount / 2), allMatchups.length - matchupIndex);

      for (let i = 0; i < gamesThisDay; i++) {
        const matchup = allMatchups[matchupIndex + i];

        schedule.push({
          date: { ...currentDate },
          home: matchup.home,
          away: matchup.away,
          homePitcher: null,
          awayPitcher: null,
          result: null,
          phase: SEASON_PHASES.REGULAR_SEASON
        });
      }

      matchupIndex += gamesThisDay;
    }

    currentDate = advanceDate(currentDate, 1);
  }

  return schedule;
};

/**
 * 投手ローテーションを生成
 * @param {Array} pitchers - 投手配列
 * @param {number} rotation - ローテーション人数（通常4-6人）
 * @returns {Array} ローテーション配列
 */
const generatePitcherRotation = (pitchers, rotation = 5) => {
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
const assignPitchersToSchedule = (schedule, teamRosters, rotationSize = 5) => {
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
const getTeamSchedule = (schedule, teamName) => {
  return schedule.filter(game => game.home === teamName || game.away === teamName);
};

/**
 * 特定日のスケジュールを取得
 * @param {Array} schedule - 全体スケジュール
 * @param {Object} date - 日付 {year, month, day}
 * @returns {Array} その日の試合
 */
const getScheduleByDate = (schedule, date) => {
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
const getScheduleByMonth = (schedule, year, month) => {
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
const getNextGame = (schedule, currentDate, teamName = null) => {
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
const countGames = (schedule, teamName = null) => {
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
export {
  generateRoundRobin,
  generateFullSeasonSchedule,
  generatePitcherRotation,
  assignPitchersToSchedule,
  getTeamSchedule,
  getScheduleByDate,
  getScheduleByMonth,
  getNextGame,
  countGames
};
