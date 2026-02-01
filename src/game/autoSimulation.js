import { TEAMS_DATA } from '../teams-data.js';

// AI監督がスタメンを自動生成する機能（エクスポート）
// 毎試合呼ばれ、ローテーション・疲労を考慮して合理的なラインナップを組む
export const generateAILineup = (teamData, teamName) => {
  const players = teamData.players || [];
  if (players.length === 0) {
    console.log(`  ⚠️ ${teamName}には選手がいません`);
    return;
  }

  console.log(`  🤖 ${teamName}: AI監督がスタメンを生成`);

  // 全員の打順をリセット
  players.forEach(p => { p.battingOrder = 0; });

  // 投手を除いた野手を取得
  const fieldPlayers = players.filter(p => p.position !== 'pitcher');

  // ポジションごとに最適な選手を選ぶ（守備適性+打撃力の総合判断）
  const lineup = [];
  const usedPlayers = new Set();

  // 重要守備位置を先に埋める
  const priorityPositions = ['short', 'second', 'center', 'catcher', 'third', 'first', 'left', 'right'];
  priorityPositions.forEach(pos => {
    const available = fieldPlayers.filter(p => !usedPlayers.has(p.id));
    if (available.length === 0) return;

    available.sort((a, b) => {
      const aFit = a.positionFitness?.[pos] || 50;
      const bFit = b.positionFitness?.[pos] || 50;
      const aBat = (a.batting?.meet || 50) + (a.batting?.power || 50);
      const bBat = (b.batting?.meet || 50) + (b.batting?.power || 50);
      return (bFit * 0.6 + bBat * 0.4) - (aFit * 0.6 + aBat * 0.4);
    });

    const selected = available[0];
    lineup.push({ player: selected, position: pos });
    usedPlayers.add(selected.id);
  });

  // 打順を決定
  const battingOrder = [];
  const remaining = [...lineup];

  // 1番: 出塁率重視（ミート+選球眼+足）
  remaining.sort((a, b) => {
    const aVal = (a.player.batting?.meet || 50) * 0.4 + (a.player.batting?.eye || 50) * 0.3 + (a.player.physical?.speed || 50) * 0.3;
    const bVal = (b.player.batting?.meet || 50) * 0.4 + (b.player.batting?.eye || 50) * 0.3 + (b.player.physical?.speed || 50) * 0.3;
    return bVal - aVal;
  });
  if (remaining.length > 0) battingOrder.push({ ...remaining.shift(), battingOrder: 1 });

  // 2番: ミート重視
  remaining.sort((a, b) => {
    const aVal = (a.player.batting?.meet || 50) * 0.5 + (a.player.batting?.eye || 50) * 0.3 + (a.player.physical?.speed || 50) * 0.2;
    const bVal = (b.player.batting?.meet || 50) * 0.5 + (b.player.batting?.eye || 50) * 0.3 + (b.player.physical?.speed || 50) * 0.2;
    return bVal - aVal;
  });
  if (remaining.length > 0) battingOrder.push({ ...remaining.shift(), battingOrder: 2 });

  // 3番: 総合力
  remaining.sort((a, b) => {
    const aVal = (a.player.batting?.meet || 50) * 0.5 + (a.player.batting?.power || 50) * 0.5;
    const bVal = (b.player.batting?.meet || 50) * 0.5 + (b.player.batting?.power || 50) * 0.5;
    return bVal - aVal;
  });
  if (remaining.length > 0) battingOrder.push({ ...remaining.shift(), battingOrder: 3 });

  // 4番: パワー最重視
  remaining.sort((a, b) => (b.player.batting?.power || 50) - (a.player.batting?.power || 50));
  if (remaining.length > 0) battingOrder.push({ ...remaining.shift(), battingOrder: 4 });

  // 5番: パワー2番手
  remaining.sort((a, b) => (b.player.batting?.power || 50) - (a.player.batting?.power || 50));
  if (remaining.length > 0) battingOrder.push({ ...remaining.shift(), battingOrder: 5 });

  // 6-8番: 残りを総合打力順
  remaining.sort((a, b) => {
    const aVal = (a.player.batting?.meet || 50) + (a.player.batting?.power || 50);
    const bVal = (b.player.batting?.meet || 50) + (b.player.batting?.power || 50);
    return bVal - aVal;
  });
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

  // 先発投手をローテーションから選択
  const rotation = teamData.pitchingRotation;
  const allPitchers = players.filter(p => p.position === 'pitcher');
  let starter = null;

  if (rotation?.starters?.length > 0) {
    const index = rotation.currentStarterIndex || 0;
    for (let i = 0; i < rotation.starters.length; i++) {
      const candidateIdx = (index + i) % rotation.starters.length;
      const candidateId = rotation.starters[candidateIdx];
      const candidate = allPitchers.find(p => p.id === candidateId);
      if (candidate && (candidate.fatigue || 0) < 80) {
        starter = candidate;
        if (TEAMS_DATA[teamName]?.pitchingRotation) {
          TEAMS_DATA[teamName].pitchingRotation.currentStarterIndex =
            (candidateIdx + 1) % rotation.starters.length;
        }
        break;
      }
    }
  }

  if (!starter) {
    // ローテ未設定 or 全員疲労: スタミナが高い投手を先発に
    const availablePitchers = allPitchers.filter(p => (p.fatigue || 0) < 80);
    if (availablePitchers.length > 0) {
      availablePitchers.sort((a, b) => {
        const staminaA = a.pitching?.stamina || 100;
        const staminaB = b.pitching?.stamina || 100;
        if (staminaA !== staminaB) return staminaB - staminaA;
        return (a.fatigue || 0) - (b.fatigue || 0);
      });
      starter = availablePitchers[0];
    } else {
      allPitchers.sort((a, b) => (a.fatigue || 0) - (b.fatigue || 0));
      starter = allPitchers[0];
    }
  }

  if (starter) {
    starter.battingOrder = 9;
    starter.position = 'pitcher';
    console.log(`    先発投手: ${starter.name} (${starter.pitching?.velocity || 0}km/h, 疲労:${starter.fatigue || 0})`);
  }

  console.log(`    スタメン: ${battingOrder.map(e => `${e.battingOrder}番${e.position}:${e.player.name}`).join(', ')}`);
};

// 全チームの投手疲労を回復（日次処理）
export const recoverAllPitcherFatigue = (recoveryAmount = 25) => {
  Object.entries(TEAMS_DATA).forEach(([teamName, team]) => {
    if (!team || !team.players) return;

    // 選手個人の疲労回復
    team.players.forEach(player => {
      if (player.fatigue && player.fatigue > 0) {
        player.fatigue = Math.max(0, player.fatigue - recoveryAmount);
      }
    });

    // リリーフ投手の疲労回復
    if (team.pitchingRotation && team.pitchingRotation.reliefFatigue) {
      Object.keys(team.pitchingRotation.reliefFatigue).forEach(id => {
        team.pitchingRotation.reliefFatigue[id] = Math.max(0,
          team.pitchingRotation.reliefFatigue[id] - recoveryAmount
        );
      });
    }
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
  // AI監督は毎試合新しくスタメンを決める
  const applyLineupSettings = (teamData, teamName) => {
    const settings = teamData.lineupSettings;
    const isUserTeam = settings?.battingOrder?.length > 0;

    if (!isUserTeam) {
      // AI監督が毎試合スタメンを決定
      generateAILineup(teamData, teamName);
      return;
    }

    console.log(`  ✅ ${teamName}のスタメン設定を適用`);

    // まず全員の打順を0にリセット
    teamData.players.forEach(p => { p.battingOrder = 0; });

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
          batting: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 },
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
          batting: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 },
          pitching: { outs: 0, runsAllowed: 0, strikeouts: 0, walks: 0, pitches: 0 }
        }
      }))
    },
    // リリーフ投手追跡（登板制限用）
    reliefTracking: {
      home: {
        starterLeftInning: null,  // 先発が降板したイニング
        currentRelieverId: null,  // 現在のリリーフ投手ID
        relieverOutsPitched: 0    // 現在のリリーフの投球アウト数
      },
      away: {
        starterLeftInning: null,
        currentRelieverId: null,
        relieverOutsPitched: 0
      }
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
          // コンタクト成功 - 守備力を考慮
          const hitRand = Math.random() * 100;
          const powerFactor = batter.power / 100;
          // 球速の影響を軽減（0.1→0.04）、ミートの影響を強化
          const hitChance = 28 + batter.meet * 0.25 - effectiveVelocity * 0.04 + handBonus;

          // 守備力による補正（チーム守備平均で±3%）
          const defenseValues = Object.values(defense).map(d => d.defense || 50);
          const avgDefense = defenseValues.length > 0 ? defenseValues.reduce((a, b) => a + b, 0) / defenseValues.length : 50;
          const defenseBonus = (avgDefense - 50) * 0.06; // 守備50基準、±3%

          if (hitRand < hitChance - defenseBonus) {
            // ヒット - 守備の速さでヒット種別が変わる
            const hitTypeRand = Math.random() * 100;
            const hrChance = powerFactor * 8;
            const tripleChance = batter.speed * 0.05;
            const doubleChance = 15 + powerFactor * 10;

            // 外野守備が良いとエクストラベースヒットが減る
            const ofDefense = ['left', 'center', 'right'].map(p => defense[p]?.defense || 50);
            const ofAvg = ofDefense.reduce((a, b) => a + b, 0) / 3;
            const ofPenalty = (ofAvg - 50) * 0.1; // 外野守備による長打抑制

            if (hitTypeRand < hrChance) {
              return { type: 'homerun' };
            } else if (hitTypeRand < hrChance + tripleChance - ofPenalty) {
              return { type: 'triple' };
            } else if (hitTypeRand < hrChance + tripleChance + doubleChance - ofPenalty) {
              return { type: 'double' };
            } else {
              return { type: 'single' };
            }
          } else {
            // アウト - 内野守備でゲッツー率が変化
            const ifDefense = ['second', 'short'].map(p => defense[p]?.defense || 50);
            const ifAvg = ifDefense.reduce((a, b) => a + b, 0) / 2;
            const dpBase = 15 + (ifAvg - 50) * 0.2; // 二遊間の守備でゲッツー率変動
            const dpRand = Math.random() * 100;
            if (bases[0] && dpRand < dpBase) {
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

  // 盗塁判定（AI監督）- 走者の実際の走力を使用
  const attemptStolenBase = (offenseTeam, defenseTeam) => {
    const pitcher = getCurrentPitcher(defenseTeam);
    const catcher = defenseTeam.players.find(p => p.position === 'catcher');

    // 走塁中の走者を追跡（簡易: 直前の出塁者の走力を使用）
    for (let base = 0; base < 2; base++) {
      if (gameState.bases[base] && !gameState.bases[base + 1]) {
        // 走者の走力を取得（打順を遡って最近出塁した選手を推定）
        // 簡易実装: チームの打順から走力の高い走者を想定
        const runnersOnBase = offenseTeam.players.filter(p =>
          p.battingOrder > 0 && p.battingOrder <= 9
        );
        // 走力の平均的な値を使用（出塁した選手の特定は困難なため、チーム平均+ランダム）
        const avgSpeed = runnersOnBase.reduce((sum, p) => sum + (p.physical?.speed || 50), 0) / (runnersOnBase.length || 1);
        const runnerSpeed = avgSpeed + (Math.random() * 20 - 10); // ある程度のバラつき

        const catcherArm = catcher?.physical?.arm || 50;
        const pitcherQuick = pitcher?.pitching?.control || 50;

        // 盗塁成功確率: 走力ベース（50で25%、70で55%、90で85%）
        const baseChance = (runnerSpeed - 30) * 1.5;
        const catcherPenalty = catcherArm * 0.3;
        const pitcherPenalty = pitcherQuick * 0.1;
        const successChance = baseChance - catcherPenalty - pitcherPenalty + (Math.random() * 20 - 10);

        // 盗塁を試みる条件: 走力55以上、2アウト未満、成功率40%以上
        const shouldAttempt = runnerSpeed >= 55 && gameState.outs < 2 && successChance > 40;
        // 走力が高いほど積極的に走る
        const aggressiveness = Math.random() * 100 < (runnerSpeed - 40) * 1.5;

        if (shouldAttempt && aggressiveness) {
          const rand = Math.random() * 100;
          if (rand < successChance) {
            gameState.bases[base] = false;
            gameState.bases[base + 1] = true;
            // 盗塁成功を打者の成績に記録（簡易: 現在の打者の成績に加算）
            const currentBatter = getCurrentBatter(offenseTeam);
            if (currentBatter?.gameStats?.batting) {
              currentBatter.gameStats.batting.stolenBases = (currentBatter.gameStats.batting.stolenBases || 0) + 1;
            }
            console.log(`   🏃 盗塁成功: ${base + 1}塁 → ${base + 2}塁 (走力${Math.round(runnerSpeed)})`);
            return { success: true, base };
          } else {
            gameState.bases[base] = false;
            gameState.outs++;
            console.log(`   🚫 盗塁失敗: ${base + 1}塁走者アウト (走力${Math.round(runnerSpeed)})`);
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
    const maxPitches = 20;
    let lastPitch = null;
    gameState._stolenAttempted = false;

    while (!atBatOver && pitchCount < maxPitches) {
      pitchCount++;

      // AI監督: 盗塁を検討（各球で検討、ただし1打席1回まで）
      if (pitchCount <= 3 && gameState.outs < 2 && !gameState._stolenAttempted) {
        const stealResult = attemptStolenBase(offenseTeam, defenseTeam);
        if (stealResult) gameState._stolenAttempted = true;
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

    // 投手スタミナ回復 & AI監督機能（役割ベースの投手交代・登板制限）
    [gameState.homeTeam, gameState.awayTeam].forEach(team => {
      const pitcher = getCurrentPitcher(team);
      const teamName = team === gameState.homeTeam ? homeTeamName : awayTeamName;
      const teamKey = team === gameState.homeTeam ? 'home' : 'away';
      const scoreDiff = team === gameState.homeTeam
        ? gameState.score.home - gameState.score.away
        : gameState.score.away - gameState.score.home;
      const reliefTrack = gameState.reliefTracking[teamKey];

      if (pitcher) {
        const pitcherData = team.players.find(p => p.id === pitcher.id);
        if (pitcherData) {
          // スタミナ回復（イニング間の休憩）
          pitcherData.currentStamina = Math.min(
            pitcherData.currentStamina + 3,
            pitcher.pitching.stamina
          );

          // リリーフ投手のイニング追跡
          if (reliefTrack.currentRelieverId === pitcher.id) {
            reliefTrack.relieverOutsPitched += 3; // 1イニング = 3アウト
          }

          // AI監督: 役割ベースの投手交代判定
          const staminaRate = pitcherData.currentStamina / pitcher.pitching.stamina;
          const rotation = TEAMS_DATA[teamName]?.pitchingRotation;
          let shouldChange = false;
          let situation = 'middle';

          // リリーフ投手の登板制限チェック
          const isReliever = reliefTrack.currentRelieverId === pitcher.id;
          if (isReliever) {
            const starterLeft = reliefTrack.starterLeftInning || 9;
            // 先発が1-3回で降板した場合は5イニング（15アウト）まで、それ以外は2イニング（6アウト）
            const maxOuts = starterLeft <= 3 ? 15 : 6;
            if (reliefTrack.relieverOutsPitched >= maxOuts) {
              console.log(`   ⏱️ ${pitcher.name}が登板制限(${Math.floor(reliefTrack.relieverOutsPitched / 3)}回)に達しました`);
              shouldChange = true;
              situation = 'middle';
            }
          }

          // 通常の交代判定条件
          if (!shouldChange) {
            if (staminaRate < 0.25 && gameState.inning >= 5) {
              shouldChange = true;
              situation = 'middle';
            } else if (gameState.inning === 9 && !gameState.isTopInning && scoreDiff > 0 && scoreDiff <= 3) {
              // 9回裏、3点差以内のリード → クローザー
              shouldChange = true;
              situation = 'save';
            } else if (gameState.inning >= 7 && Math.abs(scoreDiff) <= 2 && staminaRate < 0.40) {
              // 7回以降で僅差 → セットアッパー
              shouldChange = true;
              situation = 'hold';
            }
          }

          if (shouldChange && rotation) {
            let reliever = null;
            const fatigue = rotation.reliefFatigue || {};

            // セーブ場面: クローザー優先
            if (situation === 'save' && rotation.closer) {
              const closerData = team.players.find(p => p.id === rotation.closer && p.battingOrder === 0);
              if (closerData && (fatigue[rotation.closer] || 0) < 50) {
                reliever = closerData;
              }
            }

            // ホールド場面: セットアッパー優先
            if (!reliever && (situation === 'hold' || situation === 'save')) {
              for (const setupId of (rotation.setupMen || [])) {
                const setupData = team.players.find(p => p.id === setupId && p.battingOrder === 0);
                if (setupData && (fatigue[setupId] || 0) < 50) {
                  reliever = setupData;
                  break;
                }
              }
            }

            // 通常の中継ぎ（疲労が少ない順）
            if (!reliever) {
              const sortedMiddle = (rotation.middleRelievers || [])
                .filter(id => {
                  const p = team.players.find(pl => pl.id === id && pl.battingOrder === 0);
                  return p && (fatigue[id] || 0) < 50;
                })
                .sort((a, b) => (fatigue[a] || 0) - (fatigue[b] || 0));

              if (sortedMiddle.length > 0) {
                reliever = team.players.find(p => p.id === sortedMiddle[0]);
              }
            }

            // フォールバック（先発ローテーション投手は除外）
            if (!reliever) {
              const starterIds = new Set(rotation.starters || []);
              reliever = team.players.find(p =>
                p.position === 'pitcher' &&
                p.battingOrder === 0 &&
                p.id !== pitcher.id &&
                !starterIds.has(p.id) &&
                (p.currentStamina || 80) > 40
              );
              // リリーフが全員使えない場合のみ先発を緊急登板
              if (!reliever) {
                reliever = team.players.find(p =>
                  p.position === 'pitcher' &&
                  p.battingOrder === 0 &&
                  p.id !== pitcher.id &&
                  (p.currentStamina || 80) > 20
                );
              }
            }

            if (reliever) {
              const roleLabel = situation === 'save' ? '守護神' :
                              situation === 'hold' ? 'セットアップ' : '中継ぎ';
              console.log(`   🔄 投手交代: ${teamName} ${pitcher.name}(${Math.round(staminaRate * 100)}%) → ${reliever.name}(${roleLabel})`);

              // 先発降板時は記録
              if (!reliefTrack.starterLeftInning) {
                reliefTrack.starterLeftInning = gameState.inning;
                console.log(`   📊 先発${pitcher.name}が${gameState.inning}回で降板`);
              }

              pitcherData.battingOrder = 0;
              pitcherData.position = 'pitcher';

              const relieverData = team.players.find(p => p.id === reliever.id);
              relieverData.battingOrder = 9;
              relieverData.position = 'pitcher';
              relieverData.currentStamina = relieverData.pitching?.stamina || 80;

              // リリーフ追跡を更新
              reliefTrack.currentRelieverId = reliever.id;
              reliefTrack.relieverOutsPitched = 0; // 新しいリリーフの投球数をリセット

              // リリーフ疲労を記録（TEAMS_DATAに反映）
              if (TEAMS_DATA[teamName]?.pitchingRotation?.reliefFatigue) {
                TEAMS_DATA[teamName].pitchingRotation.reliefFatigue[reliever.id] =
                  (TEAMS_DATA[teamName].pitchingRotation.reliefFatigue[reliever.id] || 0) + 30;
              }
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
        season.stolenBases = (season.stolenBases || 0) + (b.stolenBases || 0);

        career.games++;
        career.atBats += b.atBats;
        career.hits += b.hits;
        career.homeruns += b.homeruns;
        career.rbis += b.rbis;
        career.walks += b.walks;
        career.strikeouts += b.strikeouts;
        career.stolenBases = (career.stolenBases || 0) + (b.stolenBases || 0);

        // 経験値蓄積（出場1 + 打席数/3）
        const expGained = 1 + Math.floor(b.atBats / 3);
        playerData.experience = (playerData.experience || 0) + expGained;
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

        // 疲労度を蓄積（先発は球数/2、リリーフは球数/3で蓄積）
        const isStarterPitcher = p.outs >= 15; // 5回以上投げたら先発扱い
        const fatigueGain = isStarterPitcher ? Math.floor(p.pitches / 2) : Math.floor(p.pitches / 3);
        playerData.fatigue = (playerData.fatigue || 0) + fatigueGain;

        // 経験値蓄積（登板1 + 投球回数）
        const inningsPitched = Math.floor(p.outs / 3);
        const expGained = 1 + inningsPitched;
        playerData.experience = (playerData.experience || 0) + expGained;
        console.log(`   疲労蓄積: ${playerData.name} +${p.pitches}球 → 疲労${playerData.fatigue}, 経験+${expGained}`);

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
