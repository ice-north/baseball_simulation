import { TEAMS_DATA } from '../teams-data.js';

// AI監督がスタメンを自動生成する機能
const generateAILineup = (teamData, teamName) => {
  const players = teamData.players || [];
  if (players.length === 0) {
    console.log(`  ⚠️ ${teamName}には選手がいません`);
    return;
  }

  console.log(`  🤖 ${teamName}: AI監督がスタメンを生成`);

  // 全員の打順をリセット
  players.forEach(p => { p.battingOrder = 0; });

  // 投手を除いた野手を取得
  const fieldPlayers = players.filter(p => {
    const isPitcher = p.position === 'pitcher' ||
      (p.pitching?.velocity >= 140 && p.positionFitness?.pitcher >= 80);
    return !isPitcher;
  });

  // ポジションごとに最適な選手を選ぶ
  const positions = ['catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  const lineup = [];
  const usedPlayers = new Set();

  // 各ポジションで最高適性の選手を選択
  positions.forEach(pos => {
    const available = fieldPlayers.filter(p => !usedPlayers.has(p.id));
    if (available.length === 0) return;

    // ポジション適性でソート
    available.sort((a, b) => {
      const aFit = a.positionFitness?.[pos] || 50;
      const bFit = b.positionFitness?.[pos] || 50;
      return bFit - aFit;
    });

    const selected = available[0];
    lineup.push({ player: selected, position: pos });
    usedPlayers.add(selected.id);
  });

  // 打順を決定（能力値に基づく）
  // 1番: 足が速い、出塁率が高い
  // 2番: バント、進塁打が上手い（ミート高い）
  // 3番: 最も総合力が高い打者
  // 4番: パワーが最も高い
  // 5番: 2番目にパワーが高い
  // 6-8番: 残りを適当に配置
  lineup.sort((a, b) => {
    const aPlayer = a.player;
    const bPlayer = b.player;

    // 総合打撃力 = ミート + パワー + 選球眼
    const aTotal = (aPlayer.batting?.meet || 50) + (aPlayer.batting?.power || 50) + (aPlayer.batting?.eye || 50);
    const bTotal = (bPlayer.batting?.meet || 50) + (bPlayer.batting?.power || 50) + (bPlayer.batting?.eye || 50);

    return bTotal - aTotal; // 高い順
  });

  // 打順を再配置
  const battingOrder = [];
  const remaining = [...lineup];

  // 1番: 足が速い選手
  remaining.sort((a, b) => (b.player.physical?.speed || 50) - (a.player.physical?.speed || 50));
  if (remaining.length > 0) {
    battingOrder.push({ ...remaining.shift(), battingOrder: 1 });
  }

  // 4番: パワーが高い選手
  remaining.sort((a, b) => (b.player.batting?.power || 50) - (a.player.batting?.power || 50));
  if (remaining.length > 0) {
    battingOrder.push({ ...remaining.shift(), battingOrder: 4 });
  }

  // 3番: 総合力が高い選手
  remaining.sort((a, b) => {
    const aTotal = (a.player.batting?.meet || 50) + (a.player.batting?.power || 50);
    const bTotal = (b.player.batting?.meet || 50) + (b.player.batting?.power || 50);
    return bTotal - aTotal;
  });
  if (remaining.length > 0) {
    battingOrder.push({ ...remaining.shift(), battingOrder: 3 });
  }

  // 5番: パワー系
  remaining.sort((a, b) => (b.player.batting?.power || 50) - (a.player.batting?.power || 50));
  if (remaining.length > 0) {
    battingOrder.push({ ...remaining.shift(), battingOrder: 5 });
  }

  // 2番: ミートが高い
  remaining.sort((a, b) => (b.player.batting?.meet || 50) - (a.player.batting?.meet || 50));
  if (remaining.length > 0) {
    battingOrder.push({ ...remaining.shift(), battingOrder: 2 });
  }

  // 残りは6,7,8番に配置
  let nextOrder = 6;
  while (remaining.length > 0 && nextOrder <= 8) {
    battingOrder.push({ ...remaining.shift(), battingOrder: nextOrder++ });
  }

  // 打順を選手に適用
  battingOrder.forEach(entry => {
    const player = teamData.players.find(p => p.id === entry.player.id);
    if (player) {
      player.battingOrder = entry.battingOrder;
      player.position = entry.position;
    }
  });

  // 投手を9番に設定（疲労度が低い投手を優先）
  const pitchers = players.filter(p =>
    p.position === 'pitcher' ||
    (p.pitching?.velocity >= 135 && !usedPlayers.has(p.id))
  );

  if (pitchers.length > 0) {
    // 疲労度が低い順にソート（疲労度が同じ場合は球速順）
    // 疲労度100以上の投手は先発不可
    const availablePitchers = pitchers.filter(p => (p.fatigue || 0) < 100);

    if (availablePitchers.length > 0) {
      availablePitchers.sort((a, b) => {
        const fatigueA = a.fatigue || 0;
        const fatigueB = b.fatigue || 0;
        if (fatigueA !== fatigueB) return fatigueA - fatigueB; // 疲労度が低い順
        return (b.pitching?.velocity || 0) - (a.pitching?.velocity || 0); // 同じなら球速順
      });
      const starter = availablePitchers[0];
      starter.battingOrder = 9;
      starter.position = 'pitcher';
      console.log(`    先発投手: ${starter.name} (${starter.pitching?.velocity || 0}km/h, 疲労:${starter.fatigue || 0})`);
    } else {
      // 全員疲労が高い場合は最も疲労が低い投手
      pitchers.sort((a, b) => (a.fatigue || 0) - (b.fatigue || 0));
      const starter = pitchers[0];
      starter.battingOrder = 9;
      starter.position = 'pitcher';
      console.log(`    先発投手(疲労高): ${starter.name} (疲労:${starter.fatigue || 0})`);
    }
  }

  console.log(`    スタメン: ${battingOrder.map(e => `${e.battingOrder}番${e.position}:${e.player.name}`).join(', ')}`);
};

// 全チームの投手疲労を回復（日次処理）
export const recoverAllPitcherFatigue = (recoveryAmount = 20) => {
  Object.values(TEAMS_DATA).forEach(team => {
    if (!team || !team.players) return;
    team.players.forEach(player => {
      if (player.fatigue && player.fatigue > 0) {
        player.fatigue = Math.max(0, player.fatigue - recoveryAmount);
      }
    });
  });
  console.log(`💤 全投手の疲労を${recoveryAmount}回復`);
};

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

  // スタメン設定を適用（なければAI生成）
  const applyLineupSettings = (teamData, teamName) => {
    const settings = teamData.lineupSettings;
    if (!settings || !settings.battingOrder || settings.battingOrder.length === 0) {
      // スタメン設定がない場合はAIが生成
      generateAILineup(teamData, teamName);
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

  // 一球シミュレーション（自己完結型）
  const simulateOnePitch = (batterPlayer, pitcherPlayer, catcherPlayer, defense, count, pitcherStamina, bases, lastPitch) => {
    const batter = {
      meet: batterPlayer.batting?.meet || 50,
      power: batterPlayer.batting?.power || 50,
      eye: batterPlayer.batting?.eye || 50,
      speed: batterPlayer.physical?.speed || 50,
      bats: batterPlayer.batting?.bats || 'right'
    };

    const pitcher = {
      velocity: pitcherPlayer.pitching?.velocity || 140,
      control: pitcherPlayer.pitching?.control || 50,
      throws: pitcherPlayer.physical?.throws || 'right'
    };

    // スタミナによる能力低下
    const staminaRatio = pitcherStamina / 100;
    const effectiveControl = pitcher.control * (0.7 + 0.3 * staminaRatio);
    const effectiveVelocity = pitcher.velocity * (0.9 + 0.1 * staminaRatio);

    // 左右相性
    const sameHand = pitcher.throws === batter.bats;
    const handBonus = sameHand ? -5 : 5;

    // 投球結果を決定
    const rand = Math.random() * 100;

    // ストライク/ボールの判定
    const strikeChance = 45 + effectiveControl * 0.3;

    if (rand < strikeChance) {
      // ストライクゾーン
      const swingRand = Math.random() * 100;
      const swingChance = 60 + (2 - count.strikes) * 10; // ストライク追い込まれるとスイングしやすい

      if (swingRand < swingChance) {
        // スイング
        const contactRand = Math.random() * 100;
        const contactChance = 40 + batter.meet * 0.4 + handBonus;

        if (contactRand < contactChance) {
          // コンタクト成功
          const hitRand = Math.random() * 100;
          const powerFactor = batter.power / 100;
          const hitChance = 25 + batter.meet * 0.2 - effectiveVelocity * 0.1 + handBonus;

          if (hitRand < hitChance) {
            // ヒット
            const hitTypeRand = Math.random() * 100;
            const hrChance = powerFactor * 8; // ホームラン確率
            const tripleChance = batter.speed * 0.05;
            const doubleChance = 15 + powerFactor * 10;

            if (hitTypeRand < hrChance) {
              return { type: 'homerun' };
            } else if (hitTypeRand < hrChance + tripleChance) {
              return { type: 'triple' };
            } else if (hitTypeRand < hrChance + tripleChance + doubleChance) {
              return { type: 'double' };
            } else {
              return { type: 'single' };
            }
          } else {
            // アウト
            const dpRand = Math.random() * 100;
            if (bases[0] && dpRand < 20) {
              return { type: 'double_play' };
            }
            return { type: 'out' };
          }
        } else {
          // 空振り
          return { type: 'swinging_strike' };
        }
      } else {
        // 見逃しストライク
        return { type: 'called_strike' };
      }
    } else {
      // ボールゾーン
      const swingRand = Math.random() * 100;
      const chaseChance = 15 + (3 - batter.eye * 0.1) + count.strikes * 5;

      if (swingRand < chaseChance) {
        // ボール球をスイング
        const contactRand = Math.random() * 100;
        if (contactRand < 20) {
          // ファウル
          return { type: 'foul' };
        }
        return { type: 'swinging_strike' };
      } else {
        // ボール
        return { type: 'ball' };
      }
    }
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

  // 盗塁判定（AI監督）
  const attemptStolenBase = (offenseTeam, defenseTeam) => {
    // 1塁または2塁にランナーがいて、次の塁が空いている場合
    const pitcher = getCurrentPitcher(defenseTeam);
    const catcher = defenseTeam.players.find(p => p.position === 'catcher');

    for (let base = 0; base < 2; base++) {
      if (gameState.bases[base] && !gameState.bases[base + 1]) {
        // このランナーの盗塁を検討
        const runnerSpeed = 60; // 仮の走力（本来は走者の能力を取得）
        const catcherArm = catcher?.physical?.arm || 50;
        const pitcherQuick = pitcher?.pitching?.control || 50; // クイック代用

        // 盗塁成功率 = 走力 - 捕手肩力/2 - 投手クイック/4 + ランダム
        const successChance = runnerSpeed - catcherArm / 2 - pitcherQuick / 4 + (Math.random() * 30 - 15);

        // 走力70以上で2アウト未満、成功率50%以上なら盗塁試行
        if (runnerSpeed >= 70 && gameState.outs < 2 && successChance > 50) {
          const rand = Math.random() * 100;
          if (rand < successChance) {
            // 盗塁成功
            gameState.bases[base] = false;
            gameState.bases[base + 1] = true;
            console.log(`   🏃 盗塁成功: ${base + 1}塁 → ${base + 2}塁`);
            return { success: true, base };
          } else {
            // 盗塁失敗（アウト）
            gameState.bases[base] = false;
            gameState.outs++;
            console.log(`   🚫 盗塁失敗: ${base + 1}塁走者アウト`);
            return { success: false, base };
          }
        }
      }
    }
    return null;
  };

  // 代打判定（AI監督）
  const considerPinchHitter = (offenseTeam, batter) => {
    // 7回以降、投手の打順で代打を検討
    if (gameState.inning >= 7 && batter.position === 'pitcher') {
      // ベンチにいる野手で打撃能力が高い選手を探す
      const pinchHitter = offenseTeam.players.find(p =>
        p.battingOrder === 0 &&
        p.position !== 'pitcher' &&
        (p.batting?.meet || 0) > (batter.batting?.meet || 0)
      );

      if (pinchHitter) {
        console.log(`   🔄 代打: ${batter.name} → ${pinchHitter.name}`);
        // 代打を送る
        const batterData = offenseTeam.players.find(p => p.id === batter.id);
        const phData = offenseTeam.players.find(p => p.id === pinchHitter.id);
        if (batterData && phData) {
          phData.battingOrder = batterData.battingOrder;
          batterData.battingOrder = 0;
          return pinchHitter;
        }
      }
    }
    return batter;
  };

  // 守備固め判定（AI監督）- イニング終了時に呼ばれる
  const considerDefensiveReplacement = (defenseTeam) => {
    // 7回以降、リード時に守備固めを検討
    const isLeading = gameState.isTopInning
      ? gameState.score.home > gameState.score.away
      : gameState.score.away > gameState.score.home;

    if (gameState.inning >= 7 && isLeading) {
      defenseTeam.players.forEach(starter => {
        if (starter.battingOrder > 0 && starter.battingOrder < 9) {
          // 守備が弱い選手を探す
          if ((starter.fielding?.defense || 50) < 50) {
            const replacement = defenseTeam.players.find(p =>
              p.battingOrder === 0 &&
              p.position !== 'pitcher' &&
              (p.fielding?.defense || 0) > (starter.fielding?.defense || 0) + 15
            );

            if (replacement) {
              console.log(`   🔄 守備固め: ${starter.name} → ${replacement.name} (${starter.position})`);
              replacement.battingOrder = starter.battingOrder;
              replacement.position = starter.position;
              starter.battingOrder = 0;
            }
          }
        }
      });
    }
  };

  // 打席シミュレーション
  const simulateAtBat = () => {
    const offenseTeam = gameState.isTopInning ? gameState.awayTeam : gameState.homeTeam;
    const defenseTeam = gameState.isTopInning ? gameState.homeTeam : gameState.awayTeam;

    let batter = getCurrentBatter(offenseTeam);
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

    // AI監督: 代打を検討
    batter = considerPinchHitter(offenseTeam, batter);

    let atBatOver = false;
    let pitchCount = 0;
    const maxPitches = 20; // 無限ループ防止
    let lastPitch = null; // トンネリング効果のために前球を記録

    while (!atBatOver && pitchCount < maxPitches) {
      pitchCount++;

      // AI監督: 盗塁を検討（1球目のみ）
      if (pitchCount === 1 && gameState.outs < 2) {
        const stealResult = attemptStolenBase(offenseTeam, defenseTeam);
        if (stealResult && !stealResult.success && gameState.outs >= 3) {
          // 盗塁死で3アウトなら打席終了
          atBatOver = true;
          break;
        }
      }

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

      // AI監督: 守備固めを検討
      considerDefensiveReplacement(team);
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

        // 疲労度を蓄積（投げた球数分）
        playerData.fatigue = (playerData.fatigue || 0) + p.pitches;
        console.log(`   疲労蓄積: ${playerData.name} +${p.pitches}球 → 疲労${playerData.fatigue}`);

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
