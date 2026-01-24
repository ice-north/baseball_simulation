import { TEAMS_DATA } from '../teams-data.js';

export const autoSimulateGame = (homeTeamName, awayTeamName) => {
  console.log(`🏟️ 試合開始: ${awayTeamName} @ ${homeTeamName}`);

  // TEAMS_DATAからチームデータを取得
  if (!TEAMS_DATA || !TEAMS_DATA[homeTeamName] || !TEAMS_DATA[awayTeamName]) {
    console.error('チームデータが見つかりません');
    return { homeScore: 0, awayScore: 0, result: '引分 0-0', winner: null };
  }

  const homeTeamData = JSON.parse(JSON.stringify(TEAMS_DATA[homeTeamName]));
  const awayTeamData = JSON.parse(JSON.stringify(TEAMS_DATA[awayTeamName]));

  console.log(`  ${homeTeamName}: ${homeTeamData.players.length}人`);
  console.log(`  ${awayTeamName}: ${awayTeamData.players.length}人`);

  // スタメン設定を適用
  const applyLineupSettings = (teamData, teamName) => {
    const settings = teamData.lineupSettings;
    if (!settings || !settings.battingOrder || settings.battingOrder.length === 0) {
      console.log(`  ⚠️ ${teamName}はスタメン設定なし、既存の打順を使用`);
      return;
    }

    console.log(`  ✅ ${teamName}のスタメン設定を適用`);

    // まず全員の打順を0にリセット（ベンチ）
    teamData.players.forEach(p => {
      if (p.position !== 'pitcher') {
        p.battingOrder = 0;
      }
    });

    // lineupSettingsから打順と守備位置を適用
    settings.battingOrder.forEach(entry => {
      const player = teamData.players.find(p => p.id === entry.playerId);
      if (player) {
        player.battingOrder = entry.battingOrder;
        player.position = entry.position;
        console.log(`    ${entry.battingOrder}番 ${entry.position}: ${player.name}`);
      }
    });
  };

  applyLineupSettings(homeTeamData, homeTeamName);
  applyLineupSettings(awayTeamData, awayTeamName);

  // 投手ローテーションから先発投手を選択
  const selectStarterFromRotation = (teamData, teamName) => {
    const rotation = teamData.pitchingRotation;
    if (!rotation || !rotation.starters || rotation.starters.length === 0) {
      console.log(`  ⚠️ ${teamName}は投手ローテーション未設定、打順9の投手を使用`);
      return teamData.players.find(p => p.battingOrder === 9);
    }

    // ローテーションインデックスを取得
    const index = rotation.currentStarterIndex || 0;
    const starterId = rotation.starters[index];
    const starter = teamData.players.find(p => p.id === starterId);

    if (starter) {
      console.log(`  🎯 ${teamName}先発: ${starter.name} (ローテ${index + 1}/${rotation.starters.length}番手)`);

      // 次回のローテーションインデックスを更新
      TEAMS_DATA[teamName].pitchingRotation.currentStarterIndex =
        (index + 1) % rotation.starters.length;

      // 先発投手を打順9、ポジションpitcherに設定
      teamData.players.forEach(p => {
        if (p.id === starterId) {
          p.battingOrder = 9;
          p.position = 'pitcher';
        } else if (p.battingOrder === 9 && p.id !== starterId) {
          p.battingOrder = 0; // 他の投手をベンチに
        }
      });

      return starter;
    }

    console.log(`  ⚠️ ${teamName}のローテーション投手が見つかりません、打順9を使用`);
    return teamData.players.find(p => p.battingOrder === 9);
  };

  selectStarterFromRotation(homeTeamData, homeTeamName);
  selectStarterFromRotation(awayTeamData, awayTeamName);

  // 先発投手を確認
  const homePitchers = homeTeamData.players.filter(p => p.battingOrder === 9);
  const awayPitchers = awayTeamData.players.filter(p => p.battingOrder === 9);
  console.log(`  ${homeTeamName}投手(打順9):`, homePitchers.map(p => p.name).join(', '));
  console.log(`  ${awayTeamName}投手(打順9):`, awayPitchers.map(p => p.name).join(', '));

  // 試合状態の初期化
  let gameState = {
    inning: 1,
    isTopInning: true,
    outs: 0,
    bases: [false, false, false],
    score: { home: 0, away: 0 },
    count: { balls: 0, strikes: 0 },
    homeTeam: {
      ...homeTeamData,
      currentBatterOrder: 1,
      players: homeTeamData.players.map(p => ({
        ...p,
        currentStamina: p.pitching?.stamina || 100,
        gameStats: {
          batting: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0 },
          pitching: { outs: 0, runsAllowed: 0, strikeouts: 0, walks: 0, pitches: 0 }
        }
      }))
    },
    awayTeam: {
      ...awayTeamData,
      currentBatterOrder: 1,
      players: awayTeamData.players.map(p => ({
        ...p,
        currentStamina: p.pitching?.stamina || 100,
        gameStats: {
          batting: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0 },
          pitching: { outs: 0, runsAllowed: 0, strikeouts: 0, walks: 0, pitches: 0 }
        }
      }))
    }
  };

  // 現在の打者を取得
  const getCurrentBatter = (team) => {
    return team.players.find(p => p.battingOrder === team.currentBatterOrder) || team.players[0];
  };

  // 現在の投手を取得
  const getCurrentPitcher = (team) => {
    // 先発投手は打順9番
    const pitcher = team.players.find(p => p.battingOrder === 9 && p.position === 'pitcher');
    if (pitcher) return pitcher;

    // 見つからない場合は投手能力を持つ選手を探す
    const reliever = team.players.find(p => p.position === 'pitcher' && p.pitching);
    if (reliever) return reliever;

    // それでも見つからない場合は最初の投手能力を持つ選手
    return team.players.find(p => p.pitching);
  };

  // 現在の捕手を取得
  const getCurrentCatcher = (team) => {
    return team.players.find(p => p.position === 'catcher') || team.players[0];
  };

  // 守備データを構築
  const buildDefense = (team) => {
    const defense = {};
    team.players.filter(p => p.battingOrder > 0 && p.battingOrder <= 9).forEach(player => {
      defense[player.position] = {
        defense: player.fielding?.defense || 50,
        speed: player.physical?.speed || 50,
        arm: player.physical?.arm || 50,
        throws: player.physical?.throws || 'right'
      };
    });
    return defense;
  };

  // 一球シミュレーション（通常試合と完全に同じロジックを使用）
  const simulateOnePitch = (batterPlayer, pitcherPlayer, catcherPlayer, defense, count, pitcherStamina, bases, lastPitch) => {
    // データ構造を構築
    const batter = {
      name: batterPlayer.name,
      meet: batterPlayer.batting.meet,
      power: batterPlayer.batting.power,
      eye: batterPlayer.batting.eye,
      speed: batterPlayer.physical.speed,
      steal: batterPlayer.batting.steal,
      bats: batterPlayer.batting.bats
    };

    const pitcher = {
      name: pitcherPlayer.name,
      velocity: pitcherPlayer.pitching.velocity,
      control: pitcherPlayer.pitching.control,
      stamina: pitcherPlayer.pitching.stamina,
      throws: pitcherPlayer.physical.throws,
      pitches: pitcherPlayer.pitching.arsenal,
      form: pitcherPlayer.pitching.form
    };

    const catcher = {
      name: catcherPlayer.name,
      lead: catcherPlayer.catching.lead,
      arm: catcherPlayer.physical.arm,
      throws: catcherPlayer.physical.throws
    };

    // 共通関数を呼ぶ
    const { result } = simulateSinglePitch(batter, pitcher, catcher, defense, count, pitcherStamina, lastPitch);

    return result;
  };

  // 走者進塁処理
  const advanceRunners = (hitType, bases) => {
    const newBases = [false, false, false];
    let runsScored = 0;

    if (hitType === 'homerun') {
      runsScored = 1 + bases.filter(b => b).length;
      return { bases: [false, false, false], runsScored };
    }

    const advancement = hitType === 'single' ? 1 : hitType === 'double' ? 2 : 3;

    for (let i = 2; i >= 0; i--) {
      if (bases[i]) {
        const newBase = i + advancement;
        if (newBase >= 3) {
          runsScored++;
        } else {
          newBases[newBase] = true;
        }
      }
    }

    if (advancement < 3) {
      newBases[advancement - 1] = true;
    } else {
      runsScored++;
    }

    return { bases: newBases, runsScored };
  };

  // 打席シミュレーション
  const simulateAtBat = () => {
    const offenseTeam = gameState.isTopInning ? gameState.awayTeam : gameState.homeTeam;
    const defenseTeam = gameState.isTopInning ? gameState.homeTeam : gameState.awayTeam;

    const batter = getCurrentBatter(offenseTeam);
    const pitcher = getCurrentPitcher(defenseTeam);
    const catcher = getCurrentCatcher(defenseTeam);
    const defense = buildDefense(defenseTeam);

    if (!batter) {
      console.error('打者が取得できません', offenseTeam);
      return;
    }
    if (!pitcher) {
      console.error('投手が取得できません', defenseTeam);
      return;
    }

    let atBatOver = false;
    let pitchCount = 0;
    const maxPitches = 20; // 無限ループ防止
    let lastPitch = null; // トンネリング効果のために前球を記録

    while (!atBatOver && pitchCount < maxPitches) {
      pitchCount++;

      // 投手のスタミナを取得
      const pitcherData = defenseTeam.players.find(p => p.id === pitcher.id);
      const pitcherStamina = pitcherData.currentStamina;

      // 一球シミュレーション（simulation-logic.jsの物理エンジンを使用）
      const result = simulateOnePitch(batter, pitcher, catcher, defense, gameState.count, pitcherStamina, gameState.bases, lastPitch);

      // 次回のトンネリング効果のために今回の投球を記録
      if (result.lastPitch) {
        lastPitch = result.lastPitch;
      }

      // スタミナ減少
      pitcherData.currentStamina = Math.max(0, pitcherData.currentStamina - 1);
      pitcherData.gameStats.pitching.pitches++;

      // 結果処理
      switch (result.type) {
        case 'ball':
          gameState.count.balls++;
          if (gameState.count.balls === 4) {
            // 四球
            batter.gameStats.batting.walks++;
            pitcher.gameStats.pitching.walks++;
            if (gameState.bases[0] && gameState.bases[1] && gameState.bases[2]) {
              if (gameState.isTopInning) gameState.score.away++;
              else gameState.score.home++;
              pitcher.gameStats.pitching.runsAllowed++;
            } else {
              if (gameState.bases[1] && gameState.bases[0]) gameState.bases[2] = true;
              if (gameState.bases[0]) gameState.bases[1] = true;
              gameState.bases[0] = true;
            }
            atBatOver = true;
          }
          break;

        case 'called_strike':
        case 'swinging_strike':
          gameState.count.strikes++;
          if (gameState.count.strikes === 3) {
            // 三振
            batter.gameStats.batting.atBats++;
            batter.gameStats.batting.strikeouts++;
            pitcher.gameStats.pitching.outs++;
            pitcher.gameStats.pitching.strikeouts++;
            gameState.outs++;
            atBatOver = true;
          }
          break;

        case 'foul':
        case 'foul_2strike':
          if (gameState.count.strikes < 2) {
            gameState.count.strikes++;
          }
          // 2ストライク時のファウルはカウント変わらず
          break;

        case 'out':
          batter.gameStats.batting.atBats++;
          pitcher.gameStats.pitching.outs++;
          gameState.outs++;
          atBatOver = true;
          break;

        case 'double_play':
          batter.gameStats.batting.atBats++;
          pitcher.gameStats.pitching.outs += 2;
          gameState.outs += 2;
          gameState.bases[0] = false;
          atBatOver = true;
          break;

        case 'single':
        case 'double':
        case 'triple':
        case 'homerun':
          const { bases: newBases, runsScored } = advanceRunners(result.type, gameState.bases);
          batter.gameStats.batting.atBats++;
          batter.gameStats.batting.hits++;
          batter.gameStats.batting.rbis += runsScored;
          if (result.type === 'homerun') batter.gameStats.batting.homeruns++;

          if (gameState.isTopInning) gameState.score.away += runsScored;
          else gameState.score.home += runsScored;

          pitcher.gameStats.pitching.runsAllowed += runsScored;
          gameState.bases = newBases;
          atBatOver = true;
          break;
      }
    }

    // カウントリセット & 打順進行
    gameState.count = { balls: 0, strikes: 0 };
    offenseTeam.currentBatterOrder++;
    if (offenseTeam.currentBatterOrder > 9) offenseTeam.currentBatterOrder = 1;
  };

  // イニングシミュレーション
  const simulateInning = () => {
    gameState.outs = 0;
    gameState.bases = [false, false, false];

    const inningLabel = `${gameState.inning}回${gameState.isTopInning ? '表' : '裏'}`;
    const offenseTeam = gameState.isTopInning ? gameState.awayTeam.name : gameState.homeTeam.name;

    let atBats = 0;
    while (gameState.outs < 3 && atBats < 50) {  // 無限ループ防止（打席数制限）
      simulateAtBat();
      atBats++;
    }

    if (atBats >= 50) {
      console.error(`${inningLabel}: 異常な打席数（${atBats}打席）。強制終了します。`);
    }

    // イニング終了処理
    if (gameState.isTopInning) {
      gameState.isTopInning = false;
    } else {
      gameState.isTopInning = true;
      gameState.inning++;
    }

    // 投手スタミナ回復 & AI監督機能（投手交代判定）
    [gameState.homeTeam, gameState.awayTeam].forEach(team => {
      const pitcher = getCurrentPitcher(team);
      if (pitcher) {
        const pitcherData = team.players.find(p => p.id === pitcher.id);
        if (pitcherData) {
          // スタミナ回復（イニング間の休憩）
          pitcherData.currentStamina = Math.min(
            pitcherData.currentStamina + 3,
            pitcher.pitching.stamina
          );

          // AI監督: スタミナ20%以下で投手交代
          const staminaRate = pitcherData.currentStamina / pitcher.pitching.stamina;
          if (staminaRate < 0.20 && gameState.inning >= 5) {
            // リリーフ投手を探す（投手で打順が0または控え）
            const reliever = team.players.find(p =>
              p.position === 'pitcher' &&
              p.battingOrder === 0 &&
              p.id !== pitcher.id &&
              p.currentStamina > pitcher.pitching.stamina * 0.5
            );

            if (reliever) {
              // 投手交代
              console.log(`   🔄 投手交代: ${team.name} ${pitcher.name}(スタミナ${Math.round(staminaRate * 100)}%) → ${reliever.name}`);

              // 先発投手を控えに
              pitcherData.battingOrder = 0;
              pitcherData.position = 'pitcher';

              // リリーフ投手をマウンドに
              const relieverData = team.players.find(p => p.id === reliever.id);
              relieverData.battingOrder = 9;
              relieverData.position = 'pitcher';
            }
          }
        }
      }
    });
  };

  // 試合実行
  while (gameState.inning <= 9 || (gameState.inning > 9 && gameState.score.home === gameState.score.away)) {
    // 9回裏でホームリードなら終了
    if (gameState.inning === 9 && !gameState.isTopInning && gameState.score.home > gameState.score.away) {
      break;
    }

    // 延長12回まで
    if (gameState.inning > 12) break;

    simulateInning();
  }

  // 試合結果
  const homeScore = gameState.score.home;
  const awayScore = gameState.score.away;
  let result;
  let winner;

  if (homeScore > awayScore) {
    result = `${homeTeamName} ${homeScore}-${awayScore}`;
    winner = homeTeamName;
  } else if (awayScore > homeScore) {
    result = `${awayTeamName} ${awayScore}-${homeScore}`;
    winner = awayTeamName;
  } else {
    result = `引分 ${homeScore}-${awayScore}`;
    winner = null;
  }

  console.log(`✅ 試合終了: ${awayTeamName} ${awayScore} - ${homeScore} ${homeTeamName} (${gameState.inning}回)`);
  console.log(`   スコア詳細: away=${gameState.score.away}, home=${gameState.score.home}`);

  // 試合終了後、選手のシーズン成績と通算成績を更新
  const updatePlayerSeasonStats = (team, isWinner) => {
    team.players.forEach(player => {
      if (!player.gameStats) return;

      // TEAMS_DATAの該当選手を取得（参照を更新）
      const teamData = TEAMS_DATA[team.name];
      if (!teamData) return;

      const playerData = teamData.players.find(p => p.id === player.id);
      if (!playerData) return;

      // 打撃成績の集計
      if (player.gameStats.batting.atBats > 0) {
        const b = player.gameStats.batting;
        const season = playerData.seasonStats.batting;
        const career = playerData.careerStats.batting;

        season.games++;
        season.atBats += b.atBats;
        season.hits += b.hits;
        season.homeruns += b.homeruns;
        season.rbis += b.rbis;
        season.walks += b.walks;
        season.strikeouts += b.strikeouts;

        career.games++;
        career.atBats += b.atBats;
        career.hits += b.hits;
        career.homeruns += b.homeruns;
        career.rbis += b.rbis;
        career.walks += b.walks;
        career.strikeouts += b.strikeouts;
      }

      // 投手成績の集計
      if (player.gameStats.pitching.outs > 0) {
        const p = player.gameStats.pitching;
        const season = playerData.seasonStats.pitching;
        const career = playerData.careerStats.pitching;

        season.games++;
        season.inningsPitched += p.outs;
        season.runsAllowed += p.runsAllowed;
        season.earnedRuns += p.runsAllowed; // 簡易版：全て自責点とする
        season.strikeouts += p.strikeouts;
        season.walks += p.walks;
        season.pitches += p.pitches;

        career.games++;
        career.inningsPitched += p.outs;
        career.runsAllowed += p.runsAllowed;
        career.earnedRuns += p.runsAllowed;
        career.strikeouts += p.strikeouts;
        career.walks += p.walks;
        career.pitches += p.pitches;

        // 勝敗の判定（簡易版：先発投手のみ）
        if (player.battingOrder === 9 && p.outs >= 15) { // 5イニング以上投げた先発
          if (isWinner) {
            season.wins++;
            career.wins++;
          } else if (isWinner === false) { // 引き分けではない
            season.losses++;
            career.losses++;
          }
        }
      }
    });
  };

  // ホームチームとアウェイチームの成績を更新
  updatePlayerSeasonStats(gameState.homeTeam, winner === homeTeamName ? true : winner === awayTeamName ? false : null);
  updatePlayerSeasonStats(gameState.awayTeam, winner === awayTeamName ? true : winner === homeTeamName ? false : null);

  return {
    homeScore,
    awayScore,
    result,
    winner,
    homeTeam: gameState.homeTeam,
    awayTeam: gameState.awayTeam
  };
};

// その日の全試合を自動実行
export const autoSimulateDailyGames = (currentDate, allGames, setAllGames, setCalendar, setLeagueStandings) => {
  const currentDateStr = `${currentDate.month}/${currentDate.day}`;
  const todaysGames = allGames[currentDateStr];

  if (!todaysGames || todaysGames.length === 0) {
    console.log(`📅 ${currentDateStr}: 試合なし`);
    return; // 試合がない日
  }

  console.log(`📅 ${currentDateStr}: ${todaysGames.length}試合を物理シミュレーションで実行`);

  // 各試合をシミュレート
  const updatedGames = todaysGames.map(game => {
    const gameResult = autoSimulateGame(game.home, game.away);
    return {
      ...game,
      result: gameResult.result,
      homeScore: gameResult.homeScore,
      awayScore: gameResult.awayScore
    };
  });

  // allGamesを更新
  setAllGames(prev => ({
    ...prev,
    [currentDateStr]: updatedGames
  }));

  // カレンダーの結果も更新
  setCalendar(prev => prev.map(day => {
    if (day.date === currentDateStr) {
      // この日の自チームの試合を探す
      const myGame = updatedGames.find(g => g.home === 'チームA' || g.away === 'チームA');
      if (myGame) {
        const isHome = myGame.home === 'チームA';
        const won = (isHome && myGame.homeScore > myGame.awayScore) ||
                    (!isHome && myGame.awayScore > myGame.homeScore);
        const draw = myGame.homeScore === myGame.awayScore;
        return {
          ...day,
          result: won ? '○' : draw ? '引' : '●'
        };
      }
    }
    return day;
  }));

  // リーグ順位表を更新
  setLeagueStandings(prev => {
    const updated = [...prev];
    updatedGames.forEach(game => {
      const homeTeam = updated.find(t => t.team === game.home);
      const awayTeam = updated.find(t => t.team === game.away);

      if (homeTeam && awayTeam) {
        if (game.homeScore > game.awayScore) {
          homeTeam.wins++;
          awayTeam.losses++;
        } else if (game.awayScore > game.homeScore) {
          awayTeam.wins++;
          homeTeam.losses++;
        } else {
          homeTeam.draws++;
          awayTeam.draws++;
        }
      }
    });

    // 勝率で並び替え
    updated.sort((a, b) => {
      const winPctA = a.wins + a.losses > 0 ? a.wins / (a.wins + a.losses) : 0;
      const winPctB = b.wins + b.losses > 0 ? b.wins / (b.wins + b.losses) : 0;
      return winPctB - winPctA;
    });

    return updated;
  });
};

// 日程進行処理
export const advanceDate = (currentDate, calendar, setCurrentDate, setCalendar, allGames, setAllGames, setLeagueStandings) => {
  const currentDateStr = `${currentDate.month}/${currentDate.day}`;
  const currentIndex = calendar.findIndex(day => day.date === currentDateStr);

  // 現在の日の試合を全て自動実行
  autoSimulateDailyGames(currentDate, allGames, setAllGames, setCalendar, setLeagueStandings);

  if (currentIndex < calendar.length - 1) {
    // 次の日へ
    const nextDay = calendar[currentIndex + 1];
    const [month, day] = nextDay.date.split('/').map(Number);
    setCurrentDate({ month, day });

    // 土曜日から日曜日に移動するとき（インデックス6→7, 13→14, 20→21）にカレンダーを1週間分シフト
    if (currentIndex === 6 || currentIndex === 13 || currentIndex === 20) {
      // 次の週のデータを生成（ダミー実装）
      const newWeek = Array.from({ length: 7 }, (_, i) => {
        const newDay = calendar[calendar.length - 7 + i].date.split('/');
        const newDate = parseInt(newDay[1]) + 7;
        return {
          date: `${newDay[0]}/${newDate}`,
          opponent: i % 3 === 2 ? null : `vs ${['巨人', '阪神', '中日'][i % 3]}`,
          result: null
        };
      });

      setCalendar(prev => [...prev.slice(7), ...newWeek]);
    }
  }
};
