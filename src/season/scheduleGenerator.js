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
 * 2リーグ制の対戦カードをラウンド単位で生成
 * 各ラウンド内はチーム重複なし（同日開催可能）
 * @param {Array} league1 - リーグ1のチーム配列
 * @param {Array} league2 - リーグ2のチーム配列
 * @param {number} intraPerPair - 同一リーグ内の各ペア対戦数
 * @param {number} interPerPair - 異リーグ間の各ペア対戦数
 * @returns {Array<Array>} ラウンド配列 [[{home, away, isInterLeague}, ...], ...]
 */
export const generateTwoLeagueMatchups = (league1, league2, intraPerPair, interPerPair) => {
  const rounds = [];

  // リーグ内対戦: ラウンドロビンのラウンド構造を維持
  const l1RR = generateRoundRobin(league1);
  const l2RR = generateRoundRobin(league2);

  for (let rep = 0; rep < intraPerPair; rep++) {
    const maxRounds = Math.max(l1RR.length, l2RR.length);
    for (let r = 0; r < maxRounds; r++) {
      const round = [];
      if (r < l1RR.length) {
        l1RR[r].forEach(g => {
          round.push(rep % 2 === 0
            ? { home: g.home, away: g.away, isInterLeague: false }
            : { home: g.away, away: g.home, isInterLeague: false });
        });
      }
      if (r < l2RR.length) {
        l2RR[r].forEach(g => {
          round.push(rep % 2 === 0
            ? { home: g.home, away: g.away, isInterLeague: false }
            : { home: g.away, away: g.home, isInterLeague: false });
        });
      }
      rounds.push(round);
    }
  }

  // リーグ間対戦: ラテン方格方式で最適ラウンド分け
  // n×nの全ペアをちょうどnラウンド（各n試合）に分割
  const n1 = league1.length, n2 = league2.length;
  const maxN = Math.max(n1, n2);
  for (let rep = 0; rep < interPerPair; rep++) {
    for (let k = 0; k < maxN; k++) {
      const round = [];
      for (let i = 0; i < n1; i++) {
        const j = (i + k) % n2;
        if (j < n2) {
          round.push(rep % 2 === 0
            ? { home: league1[i], away: league2[j], isInterLeague: true }
            : { home: league2[j], away: league1[i], isInterLeague: true });
        }
      }
      if (round.length > 0) rounds.push(round);
    }
  }

  return rounds;
};

/**
 * 2リーグ制の試合数配分を計算
 * 各チームの試合数がちょうどgamesPerSeasonになる整数解を探す
 * @param {number} gamesPerSeason - チームあたりの目標試合数
 * @param {number} intraOpponents - 同一リーグ内の対戦相手数
 * @param {number} interOpponents - 異リーグの対戦相手数
 * @returns {{intraPerPair: number, interPerPair: number}}
 */
export const balanceLeagueGames = (gamesPerSeason, intraOpponents, interOpponents) => {
  // 理想配分: リーグ内70%、リーグ間30%
  const idealIntraPerPair = (gamesPerSeason * 0.7) / intraOpponents;

  let best = null;
  // a * intraOpponents + b * interOpponents = gamesPerSeason となる (a, b) を総当たり
  for (let a = 1; a * intraOpponents < gamesPerSeason; a++) {
    const remaining = gamesPerSeason - a * intraOpponents;
    if (remaining < interOpponents) break; // b >= 1 を要求
    if (remaining % interOpponents !== 0) continue;
    const b = remaining / interOpponents;

    const error = Math.abs(a - idealIntraPerPair);
    if (!best || error < best.error) {
      best = { intraPerPair: a, interPerPair: b, error };
    }
  }

  // 整数解が見つからない場合のフォールバック（近似）
  if (!best) {
    const intraPerPair = Math.max(1, Math.round(idealIntraPerPair));
    const remaining = gamesPerSeason - intraPerPair * intraOpponents;
    const interPerPair = Math.max(1, Math.round(remaining / interOpponents));
    return { intraPerPair, interPerPair };
  }
  return { intraPerPair: best.intraPerPair, interPerPair: best.interPerPair };
};

/**
 * 2リーグ制で有効な試合数の選択肢を生成
 * a * intraOpponents + b * interOpponents = total の整数解が存在する値のみ
 * @param {number} teamsCount - 総チーム数
 * @param {number} maxGames - 最大試合数
 * @returns {Array<{value: number, intra: number, inter: number}>}
 */
export const getValidTwoLeagueGameCounts = (teamsCount, maxGames = 150) => {
  const halfTeams = Math.floor(teamsCount / 2);
  if (halfTeams < 2) return [];
  const intraOpp = halfTeams - 1;
  const interOpp = halfTeams;

  // 4-9月（月曜休み）のカレンダー上限: 約156日
  const MAX_CALENDAR_DAYS = 156;

  // ダミーチーム名でマージ後ラウンド数を計算
  const dummyL1 = Array.from({length: halfTeams}, (_, i) => 'L1_' + i);
  const dummyL2 = Array.from({length: halfTeams}, (_, i) => 'L2_' + i);

  const countMergedDays = (a, b) => {
    const rounds = generateTwoLeagueMatchups(dummyL1, dummyL2, a, b);
    const used = new Array(rounds.length).fill(false);
    let days = 0;
    for (let i = 0; i < rounds.length; i++) {
      if (used[i]) continue;
      const teams = new Set();
      rounds[i].forEach(g => { teams.add(g.home); teams.add(g.away); });
      used[i] = true;
      for (let j = i + 1; j < rounds.length; j++) {
        if (used[j]) continue;
        if (rounds[j].every(g => !teams.has(g.home) && !teams.has(g.away))) {
          rounds[j].forEach(g => { teams.add(g.home); teams.add(g.away); });
          used[j] = true;
        }
      }
      days++;
    }
    return days;
  };

  // 有効な合計値を列挙し、balanceLeagueGamesと同じ(a,b)で日数チェック
  const totals = new Set();
  for (let a = 1; ; a++) {
    for (let b = 1; ; b++) {
      const total = a * intraOpp + b * interOpp;
      if (total > maxGames) break;
      if (total >= intraOpp + interOpp) totals.add(total);
    }
    if (a * intraOpp >= maxGames) break;
  }

  const results = [];
  for (const total of [...totals].sort((a, b) => a - b)) {
    const { intraPerPair, interPerPair } = balanceLeagueGames(total, intraOpp, interOpp);
    if (countMergedDays(intraPerPair, interPerPair) <= MAX_CALENDAR_DAYS) {
      results.push({ value: total, intra: intraPerPair, inter: interPerPair });
    }
  }
  return results;
};

/**
 * 年間スケジュールを生成（レギュラーシーズン）
 * 月間バランス型: 土日優先、平日も含めて全試合を配置
 *
 * @param {Object} config - 設定
 *   - teams: チーム配列
 *   - gamesPerSeason: 年間試合数（チームあたり）
 *   - startDate: 開始日 {year, month, day}
 *   - endDate: 終了日 {year, month, day}
 *   - leagueFormat: 'single' or 'two'
 *   - leagueNames: リーグ名配列（2リーグ制の場合）
 * @returns {Array} スケジュール配列
 */
export const generateFullSeasonSchedule = (config) => {
  const { teams, gamesPerSeason = 60, startDate, endDate, leagueFormat = 'single', leagueNames } = config;
  const teamsCount = teams.length;
  let allMatchups = [];

  // 2リーグ制の場合
  if (leagueFormat === 'two' && teamsCount >= 4) {
    const halfTeams = Math.floor(teamsCount / 2);
    const league1 = teams.slice(0, halfTeams);
    const league2 = teams.slice(halfTeams);

    // 非対称なリーグ構成（奇数チーム等）には完全な配分を保証できないため、
    // 両リーグのサイズが等しい場合のみ整数解ベースの配分を行う
    if (league1.length === league2.length && league1.length >= 2) {
      const intraOpponents = league1.length - 1;
      const interOpponents = league2.length;
      const { intraPerPair, interPerPair } = balanceLeagueGames(gamesPerSeason, intraOpponents, interOpponents);
      allMatchups = generateTwoLeagueMatchups(league1, league2, intraPerPair, interPerPair);
    } else {
      // 非対称リーグのフォールバック（従来の近似ロジック）
      const intraOppA = Math.max(1, league1.length - 1);
      const intraOppB = Math.max(1, league2.length - 1);
      const idealIntraPerPair = Math.max(1, Math.round((gamesPerSeason * 0.7) / Math.max(intraOppA, intraOppB)));
      const intraTotalA = idealIntraPerPair * intraOppA;
      const remainingA = Math.max(0, gamesPerSeason - intraTotalA);
      const interPerPair = Math.max(1, Math.round(remainingA / league2.length));
      allMatchups = generateTwoLeagueMatchups(league1, league2, idealIntraPerPair, interPerPair);
    }
  } else {
    // 1リーグ制（従来のロジック）
    const opponentsCount = teamsCount - 1;
    const gamesPerOpponent = Math.ceil(gamesPerSeason / opponentsCount);
    const oneRound = generateRoundRobin(teams);
    const totalRounds = Math.ceil(gamesPerOpponent);

    for (let round = 0; round < totalRounds; round++) {
      oneRound.forEach(roundGames => {
        roundGames.forEach(game => {
          const teamGames = (teamName) => allMatchups.filter(m =>
            m.home === teamName || m.away === teamName
          ).length;

          if (teamGames(game.home) < gamesPerSeason && teamGames(game.away) < gamesPerSeason) {
            if (round % 2 === 0) {
              allMatchups.push({ home: game.home, away: game.away });
            } else {
              allMatchups.push({ home: game.away, away: game.home });
            }
          }
        });
      });
    }

    // 目標試合数に達していない場合、追加カードを生成
    let attempts = 0;
    while (allMatchups.length < (teamsCount * gamesPerSeason / 2) && attempts < 100) {
      const round = oneRound[attempts % oneRound.length];
      for (const game of round) {
        const teamGames = (teamName) => allMatchups.filter(m =>
          m.home === teamName || m.away === teamName
        ).length;

        if (teamGames(game.home) < gamesPerSeason && teamGames(game.away) < gamesPerSeason) {
          if (attempts % 2 === 0) {
            allMatchups.push({ home: game.home, away: game.away });
          } else {
            allMatchups.push({ home: game.away, away: game.home });
          }
        }
      }
      attempts++;
    }
  }

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

  // 全ての試合日を収集（土日優先、平日も全て使用可能）
  const collectAllGameDays = (year) => {
    const allDays = [];

    for (const monthConfig of seasonMonths) {
      const daysInMonth = new Date(year, monthConfig.month, 0).getDate();

      for (let day = monthConfig.startDay; day <= daysInMonth; day++) {
        const date = new Date(year, monthConfig.month - 1, day);
        const dayOfWeek = date.getDay(); // 0=日, 1=月, ..., 6=土

        // 月曜日は休み、それ以外は開催可能
        if (dayOfWeek !== 1) {
          const priority = (dayOfWeek === 0 || dayOfWeek === 6) ? 1 : 2; // 土日優先
          allDays.push({ year, month: monthConfig.month, day, priority, dayOfWeek });
        }
      }
    }

    return allDays;
  };

  const year = startDate.year;
  const allGameDays = collectAllGameDays(year);

  // 必要な試合日数を計算
  let neededDays;
  if (leagueFormat === 'two' && teamsCount >= 4) {
    neededDays = allMatchups.length;
  } else {
    const totalGamesNeeded = allMatchups.length;
    neededDays = Math.ceil(totalGamesNeeded / gamesPerDay);
  }

  // 土日を優先して選択し、足りなければ平日も使用
  const weekends = allGameDays.filter(d => d.priority === 1);
  const weekdays = allGameDays.filter(d => d.priority === 2);

  let selectedDays = [];

  if (weekends.length >= neededDays) {
    // 土日だけで足りる → 均等に分散
    const step = weekends.length / neededDays;
    for (let i = 0; i < neededDays; i++) {
      const idx = Math.min(Math.floor(i * step), weekends.length - 1);
      selectedDays.push(weekends[idx]);
    }
  } else {
    // 土日全部使用 + 平日も追加
    selectedDays = [...weekends];
    const neededWeekdays = neededDays - weekends.length;

    if (neededWeekdays > 0) {
      // 平日を均等に分散して追加
      const step = Math.max(1, weekdays.length / neededWeekdays);
      for (let i = 0; i < neededWeekdays && i * step < weekdays.length; i++) {
        const idx = Math.min(Math.floor(i * step), weekdays.length - 1);
        if (!selectedDays.find(d => d.month === weekdays[idx].month && d.day === weekdays[idx].day)) {
          selectedDays.push(weekdays[idx]);
        }
      }

      // まだ足りない場合は残りの平日を追加
      if (selectedDays.length < neededDays) {
        for (const wd of weekdays) {
          if (!selectedDays.find(d => d.month === wd.month && d.day === wd.day)) {
            selectedDays.push(wd);
            if (selectedDays.length >= neededDays) break;
          }
        }
      }
    }
  }

  // 日付順にソート
  selectedDays.sort((a, b) => {
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  });

  // スケジュールを配置
  const schedule = [];

  if (leagueFormat === 'two' && teamsCount >= 4) {
    // 2リーグ制: ラウンド単位で配置（各ラウンド内はチーム重複なし）
    // ラウンド数が日数を超える場合、チーム重複のないラウンド同士を同日にまとめる
    let mergedRounds = [...allMatchups.map(r => [...r])];
    if (mergedRounds.length > selectedDays.length) {
      const result = [];
      const used = new Array(mergedRounds.length).fill(false);
      for (let i = 0; i < mergedRounds.length; i++) {
        if (used[i]) continue;
        const dayGames = [...mergedRounds[i]];
        const dayTeams = new Set();
        dayGames.forEach(g => { dayTeams.add(g.home); dayTeams.add(g.away); });
        used[i] = true;
        for (let j = i + 1; j < mergedRounds.length; j++) {
          if (used[j]) continue;
          const canMerge = mergedRounds[j].every(g => !dayTeams.has(g.home) && !dayTeams.has(g.away));
          if (canMerge) {
            mergedRounds[j].forEach(g => { dayGames.push(g); dayTeams.add(g.home); dayTeams.add(g.away); });
            used[j] = true;
          }
        }
        result.push(dayGames);
      }
      mergedRounds = result;
    }

    let roundIdx = 0;
    for (const gameDay of selectedDays) {
      if (roundIdx >= mergedRounds.length) break;
      const round = mergedRounds[roundIdx++];
      round.forEach(matchup => {
        schedule.push({
          id: schedule.length + 1,
          date: { year: gameDay.year, month: gameDay.month, day: gameDay.day },
          home: matchup.home, away: matchup.away,
          starterHome: null, starterAway: null,
          result: null, phase: SEASON_PHASES.REGULAR_SEASON
        });
      });
    }
  } else {
    // 1リーグ制: 従来のシーケンシャル配置
    let matchupIndex = 0;
    for (const gameDay of selectedDays) {
      if (matchupIndex >= allMatchups.length) break;
      const gamesThisDay = Math.min(gamesPerDay, allMatchups.length - matchupIndex);
      for (let i = 0; i < gamesThisDay; i++) {
        const matchup = allMatchups[matchupIndex + i];
        schedule.push({
          id: schedule.length + 1,
          date: { year: gameDay.year, month: gameDay.month, day: gameDay.day },
          home: matchup.home, away: matchup.away,
          starterHome: null, starterAway: null,
          result: null, phase: SEASON_PHASES.REGULAR_SEASON
        });
      }
      matchupIndex += gamesThisDay;
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
