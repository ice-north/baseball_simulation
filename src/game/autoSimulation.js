import { TEAMS_DATA } from '../teams-data.js';
import { calculatePhysicsContact, calculateBattedBallPhysics, judgeFielderReach, getTunnelingEffect } from '../simulation-logic.js';
import { PITCHING_FORM_EFFECTS } from '../utils/constants.js';

// 選手が投手かどうかを判定（positionだけでなく能力値も確認）
export const isPitcherPlayer = (player) => {
  // 明示的にpitcherと設定されている場合
  if (player.position === 'pitcher') return true;
  // 投手としての能力を持っている（スタミナ100以上は投手専用）
  if (player.pitching?.stamina >= 100) return true;
  // primaryRoleが設定されている場合はそれを優先
  if (player.primaryRole === 'pitcher') return true;
  return false;
};

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

  // 投手を除いた野手を取得（投手能力でも判定）
  const fieldPlayers = players.filter(p => !isPitcherPlayer(p));

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
  const allPitchers = players.filter(p => isPitcherPlayer(p));
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
  // 選手が投手かどうかを判定（ローカル版）
  const isPitcher = (player) => {
    if (player.position === 'pitcher') return true;
    if (player.pitching?.stamina >= 100) return true;
    if (player.primaryRole === 'pitcher') return true;
    return false;
  };

  const getCurrentPitcher = (team) => {
    // 先発投手は打順9番
    const pitcher = team.players.find(p => p.battingOrder === 9 && isPitcher(p));
    if (pitcher) return pitcher;

    // 見つからない場合は投手能力を持つ選手を探す
    const reliever = team.players.find(p => isPitcher(p) && p.pitching);
    if (reliever) return reliever;

    // それでも見つからない場合は投手能力（スタミナ100以上）を持つ選手
    return team.players.find(p => p.pitching?.stamina >= 100);
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
    // 四球を増やすためストライク率を下げる（制球の影響も調整）
    // 制球65で約52%、制球52で約48%がストライクゾーン
    const strikeChance = 35 + effectiveControl * 0.25;

    if (rand < strikeChance) {
      // ストライクゾーン
      const swingRand = Math.random() * 100;
      const swingChance = 60 + (2 - count.strikes) * 10; // ストライク追い込まれるとスイングしやすい

      if (swingRand < swingChance) {
        // スイング
        const contactRand = Math.random() * 100;
        const contactChance = 40 + batter.meet * 0.4 + handBonus;

        if (contactRand < contactChance) {
          // コンタクト成功 - 物理エンジンで打球・守備を判定
          const pitchData = {
            type: 'straight',
            velocity: effectiveVelocity,
            level: 50
          };
          const handEffect = {
            powerBonus: sameHand ? -3 : 3,
            meetBonus: sameHand ? -3 : 3
          };
          const tunnelingEffect = lastPitch ? getTunnelingEffect(lastPitch, pitchData, catcherPlayer?.catching?.lead || 50) : 0;

          // 物理コンタクト計算
          const physicsResult = calculatePhysicsContact(
            { velocity: effectiveVelocity, throws: pitcher.throws, form: pitcherPlayer.pitching?.form || 'threeQuarter' },
            batter,
            Math.random() < 0.3, // 球種予測的中率30%
            pitchData,
            tunnelingEffect,
            handEffect
          );

          if (!physicsResult.isContact) {
            return { type: 'swinging_strike' };
          }

          // 打球物理パラメータ計算
          const battedBall = calculateBattedBallPhysics(batter, pitcher, pitchData, physicsResult);

          // 守備判定（ポジション別の守備力を使用）
          const fieldResult = judgeFielderReach(battedBall, defense, batter);

          if (fieldResult.result === 'homerun') {
            return { type: 'homerun' };
          } else if (fieldResult.result === 'out') {
            // ゲッツー判定（内野ゴロでランナー1塁）
            if (bases[0] && battedBall.launchAngle < 10 && battedBall.distance < 40) {
              const ifDefense = ['second', 'short'].map(p => defense[p]?.defense || 50);
              const ifAvg = ifDefense.reduce((a, b) => a + b, 0) / 2;
              const dpBase = 15 + (ifAvg - 50) * 0.2;
              if (Math.random() * 100 < dpBase) {
                return { type: 'double_play' };
              }
            }
            return {
              type: 'out',
              isOutfieldFly: fieldResult.isOutfieldFly || false,
              tagupThrowbackChance: fieldResult.tagupThrowbackChance || 0
            };
          } else if (fieldResult.result === 'triple') {
            return { type: 'triple' };
          } else if (fieldResult.result === 'double') {
            return { type: 'double' };
          } else {
            return { type: 'single' };
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
      // 選球眼が高いほどボール球を振らない（四球率を抑制調整）
      const chaseChance = 15 + (3 - batter.eye * 0.10) + count.strikes * 5;

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

  // 走者進塁処理（外野手の肩で進塁を抑制）
  const advanceRunners = (hitType, bases, defense) => {
    const newBases = [false, false, false];
    let runsScored = 0;

    if (hitType === 'homerun') {
      runsScored = 1 + bases.filter(b => b).length;
      return { bases: [false, false, false], runsScored };
    }

    const advancement = hitType === 'single' ? 1 : hitType === 'double' ? 2 : 3;

    // 外野手の平均肩力（進塁抑制に使用）
    const ofArms = ['left', 'center', 'right'].map(p => defense?.[p]?.arm || 60);
    const avgArm = ofArms.reduce((a, b) => a + b, 0) / 3;

    for (let i = 2; i >= 0; i--) {
      if (bases[i]) {
        let newBase = i + advancement;

        // 肩による進塁抑制: シングルで1塁走者が3塁を狙う、2塁走者がホームを狙う等
        // 強肩の場合、余分な進塁（1塁→3塁、2塁→本塁on single）をブロック
        if (hitType === 'single' && newBase >= 2) {
          const holdChance = (avgArm - 50) / 100 * 0.4; // 肩90→16%の確率で進塁を阻止
          if (Math.random() < holdChance) {
            newBase = Math.max(i + 1, newBase - 1); // 1つ手前で止める
            console.log(`   💪 強肩で走者を止める（肩力平均${Math.round(avgArm)}）`);
          }
        }

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

        // 盗塁成功確率: 走力ベース（50で40%、70で76%、90で112%→capped）
        const baseChance = (runnerSpeed - 25) * 1.8;
        const catcherPenalty = catcherArm * 0.3;
        const pitcherPenalty = pitcherQuick * 0.1;
        const successChance = baseChance - catcherPenalty - pitcherPenalty + (Math.random() * 20 - 10);

        // 盗塁を試みる条件: 走力48以上、2アウト未満、成功率40%以上（走力強化）
        const shouldAttempt = runnerSpeed >= 48 && gameState.outs < 2 && successChance > 40;
        // 走力が高いほど積極的に走る
        const aggressiveness = Math.random() * 100 < (runnerSpeed - 35) * 2.0;

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

  // 代打判定（AI監督）- より積極的に控え選手を起用
  const considerPinchHitter = (offenseTeam, batter) => {
    const benchFielders = offenseTeam.players.filter(p =>
      p.battingOrder === 0 && !isPitcher(p)
    );
    if (benchFielders.length === 0) return batter;

    // 1. 投手の打順：6回以降で代打（投手は打撃が弱い）
    if (isPitcher(batter) && gameState.inning >= 6) {
      const pinchHitter = benchFielders.reduce((best, p) =>
        (p.batting?.meet || 0) + (p.batting?.power || 0) >
        (best.batting?.meet || 0) + (best.batting?.power || 0) ? p : best
      , benchFielders[0]);

      if (pinchHitter && ((pinchHitter.batting?.meet || 0) > (batter.batting?.meet || 0) + 5)) {
        console.log(`   🔄 代打: ${batter.name} → ${pinchHitter.name}`);
        const batterData = offenseTeam.players.find(p => p.id === batter.id);
        const phData = offenseTeam.players.find(p => p.id === pinchHitter.id);
        if (batterData && phData) {
          phData.battingOrder = batterData.battingOrder;
          phData.position = batterData.position;
          batterData.battingOrder = 0;
          return pinchHitter;
        }
      }
    }

    // 2. 7回以降、得点圏にランナーがいて打撃力の低い野手に代打
    if (gameState.inning >= 7 && (gameState.bases[1] || gameState.bases[2])) {
      const batterTotal = (batter.batting?.meet || 0) + (batter.batting?.power || 0);
      const bestBench = benchFielders.reduce((best, p) => {
        const total = (p.batting?.meet || 0) + (p.batting?.power || 0);
        const bestTotal = (best.batting?.meet || 0) + (best.batting?.power || 0);
        return total > bestTotal ? p : best;
      }, benchFielders[0]);

      if (bestBench) {
        const benchTotal = (bestBench.batting?.meet || 0) + (bestBench.batting?.power || 0);
        if (benchTotal > batterTotal + 10) { // 差がある場合
          console.log(`   🔄 代打(チャンス): ${batter.name} → ${bestBench.name}`);
          const batterData = offenseTeam.players.find(p => p.id === batter.id);
          const phData = offenseTeam.players.find(p => p.id === bestBench.id);
          if (batterData && phData) {
            phData.battingOrder = batterData.battingOrder;
            phData.position = batterData.position;
            batterData.battingOrder = 0;
            return bestBench;
          }
        }
      }
    }

    // 3. 8回以降、ビハインドで打撃力の低い下位打線に代打
    if (gameState.inning >= 8) {
      const isLosing = gameState.isTopInning
        ? gameState.score.away < gameState.score.home
        : gameState.score.home < gameState.score.away;
      if (isLosing && batter.battingOrder >= 6) {
        const batterTotal = (batter.batting?.meet || 0) + (batter.batting?.power || 0);
        const bestBench = benchFielders.reduce((best, p) => {
          const total = (p.batting?.meet || 0) + (p.batting?.power || 0);
          const bestTotal = (best.batting?.meet || 0) + (best.batting?.power || 0);
          return total > bestTotal ? p : best;
        }, benchFielders[0]);

        if (bestBench) {
          const benchTotal = (bestBench.batting?.meet || 0) + (bestBench.batting?.power || 0);
          if (benchTotal > batterTotal + 5) {
            console.log(`   🔄 代打(ビハインド): ${batter.name} → ${bestBench.name}`);
            const batterData = offenseTeam.players.find(p => p.id === batter.id);
            const phData = offenseTeam.players.find(p => p.id === bestBench.id);
            if (batterData && phData) {
              phData.battingOrder = batterData.battingOrder;
              phData.position = batterData.position;
              batterData.battingOrder = 0;
              return bestBench;
            }
          }
        }
      }
    }

    return batter;
  };

  // 守備固め判定（AI監督）- イニング終了時に呼ばれる
  const considerDefensiveReplacement = (defenseTeam) => {
    const isLeading = gameState.isTopInning
      ? gameState.score.home > gameState.score.away
      : gameState.score.away > gameState.score.home;
    const scoreDiff = gameState.isTopInning
      ? gameState.score.home - gameState.score.away
      : gameState.score.away - gameState.score.home;

    const benchFielders = defenseTeam.players.filter(p =>
      p.battingOrder === 0 && !isPitcher(p)
    );
    if (benchFielders.length === 0) return;

    // 1. 7回以降リード時: 守備力が低いスタメンを守備固め（閾値緩め）
    if (gameState.inning >= 7 && isLeading) {
      defenseTeam.players.forEach(starter => {
        if (starter.battingOrder > 0 && starter.battingOrder < 9) {
          const starterDef = starter.fielding?.defense || 50;
          if (starterDef < 60) {
            const replacement = benchFielders.find(p =>
              p.battingOrder === 0 &&
              (p.fielding?.defense || 0) > starterDef + 8
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

    // 2. 8回以降リード時: 代走要員（足が速い控えで塁上のランナーを入れ替え）
    if (gameState.inning >= 8 && isLeading && scoreDiff <= 3) {
      for (let base = 2; base >= 0; base--) {
        const runner = gameState.bases[base];
        if (runner) {
          const runnerSpeed = runner.physical?.speed || 50;
          if (runnerSpeed < 55) {
            const fastRunner = benchFielders.find(p =>
              p.battingOrder === 0 &&
              (p.physical?.speed || 0) > runnerSpeed + 15
            );
            if (fastRunner) {
              console.log(`   🔄 代走: ${runner.name} → ${fastRunner.name} (${base + 1}塁)`);
              const runnerData = defenseTeam.players.find(p => p.id === runner.id);
              if (runnerData) {
                fastRunner.battingOrder = runnerData.battingOrder;
                fastRunner.position = runnerData.position;
                runnerData.battingOrder = 0;
                gameState.bases[base] = fastRunner;
              }
            }
          }
        }
      }
    }

    // 3. 6回以降大量リード: 控え野手を順番に出場させる（経験積ませる）
    if (gameState.inning >= 6 && scoreDiff >= 5) {
      const activeBench = benchFielders.filter(p => p.battingOrder === 0);
      if (activeBench.length > 0) {
        // 出場機会が少ない控えを優先
        const leastUsed = activeBench.reduce((best, p) => {
          const pGames = (p.seasonStats?.games || 0);
          const bGames = (best.seasonStats?.games || 0);
          return pGames < bGames ? p : best;
        }, activeBench[0]);

        // 打撃が最も弱いスタメンと交代
        const starters = defenseTeam.players.filter(p => p.battingOrder > 0 && p.battingOrder < 9);
        if (starters.length > 0) {
          const weakest = starters.reduce((w, p) => {
            const wBat = (w.batting?.meet || 0) + (w.batting?.power || 0);
            const pBat = (p.batting?.meet || 0) + (p.batting?.power || 0);
            return pBat < wBat ? p : w;
          }, starters[0]);

          console.log(`   🔄 選手交代(大量リード): ${weakest.name} → ${leastUsed.name}`);
          leastUsed.battingOrder = weakest.battingOrder;
          leastUsed.position = weakest.position;
          weakest.battingOrder = 0;
        }
      }
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

          // 外野フライでのタッグアップ（犠牲フライ・進塁）
          if (result.isOutfieldFly && gameState.outs < 3) {
            // 3塁走者のタッグアップ（犠牲フライ）
            if (gameState.bases[2]) {
              const throwbackChance = result.tagupThrowbackChance || 0;
              if (Math.random() >= throwbackChance) {
                // 送球間に合わず得点
                gameState.bases[2] = false;
                if (gameState.isTopInning) gameState.score.away++;
                else gameState.score.home++;
                batter.gameStats.batting.rbis++;
                pitcher.gameStats.pitching.runsAllowed++;
                console.log(`   ✈️ 犠牲フライ（タッグアップ得点）`);
              } else {
                console.log(`   💪 好返球！3塁走者タッチアウト`);
                gameState.bases[2] = false;
                gameState.outs++;
                pitcher.gameStats.pitching.outs++;
              }
            }
            // 2塁走者のタッグアップ進塁（深いフライ時）
            if (gameState.bases[1] && !gameState.bases[2] && gameState.outs < 3) {
              const advanceChance = 0.4 - (result.tagupThrowbackChance || 0) * 0.5;
              if (Math.random() < advanceChance) {
                gameState.bases[1] = false;
                gameState.bases[2] = true;
                console.log(`   🏃 タッグアップ 2塁→3塁`);
              }
            }
          }

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
          const { bases: newBases, runsScored } = advanceRunners(result.type, gameState.bases, defense);
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

          // AI監督: 役割ベースの投手交代判定（より積極的に継投）
          const staminaRate = pitcherData.currentStamina / pitcher.pitching.stamina;
          const rotation = TEAMS_DATA[teamName]?.pitchingRotation;
          let shouldChange = false;
          let situation = 'middle';

          // リリーフ投手の登板制限チェック
          const isReliever = reliefTrack.currentRelieverId === pitcher.id;
          if (isReliever) {
            const starterLeft = reliefTrack.starterLeftInning || 9;
            const maxOuts = starterLeft <= 3 ? 12 : 6; // ロングリリーフ4回、通常2回
            if (reliefTrack.relieverOutsPitched >= maxOuts) {
              console.log(`   ⏱️ ${pitcher.name}が登板制限(${Math.floor(reliefTrack.relieverOutsPitched / 3)}回)に達しました`);
              shouldChange = true;
              situation = 'middle';
            }
          }

          // 通常の交代判定条件（積極的な継投策）
          if (!shouldChange) {
            // 先発の投球回数上限: 7回完了で交代（完封ペースでも8回まで）
            if (!isReliever && gameState.inning >= 8) {
              shouldChange = true;
              situation = Math.abs(scoreDiff) <= 2 ? 'hold' : 'middle';
            }
            // 先発は5回以降でスタミナ40%以下 → 交代
            else if (!isReliever && gameState.inning >= 5 && staminaRate < 0.40) {
              shouldChange = true;
              situation = 'middle';
            }
            // スタミナ25%以下なら即交代（先発・リリーフ問わず）
            else if (staminaRate < 0.25) {
              shouldChange = true;
              situation = 'middle';
            }
            // 7回以降、先発スタミナ50%以下 → 交代
            else if (!isReliever && gameState.inning >= 7 && staminaRate < 0.50) {
              shouldChange = true;
              situation = 'hold';
            }
            // 9回、3点差以内のリード → クローザー
            else if (gameState.inning >= 9 && scoreDiff > 0 && scoreDiff <= 3) {
              shouldChange = true;
              situation = 'save';
            }
            // 8回で僅差 → セットアッパー
            else if (gameState.inning === 8 && Math.abs(scoreDiff) <= 2) {
              shouldChange = true;
              situation = 'hold';
            }
            // 6回以降、大量リードでも中継ぎへ（先発温存）
            else if (!isReliever && gameState.inning >= 6 && Math.abs(scoreDiff) >= 5 && staminaRate < 0.50) {
              shouldChange = true;
              situation = 'middle';
            }
          }

          if (shouldChange) {
            let reliever = null;
            const fatigue = rotation?.reliefFatigue || {};

            // セーブ場面: クローザー優先
            if (situation === 'save' && rotation?.closer) {
              const closerData = team.players.find(p => p.id === rotation.closer && p.battingOrder === 0);
              if (closerData && (fatigue[rotation.closer] || 0) < 50) {
                reliever = closerData;
              }
            }

            // ホールド場面: セットアッパー優先
            if (!reliever && (situation === 'hold' || situation === 'save')) {
              for (const setupId of (rotation?.setupMen || [])) {
                const setupData = team.players.find(p => p.id === setupId && p.battingOrder === 0);
                if (setupData && (fatigue[setupId] || 0) < 50) {
                  reliever = setupData;
                  break;
                }
              }
            }

            // 通常の中継ぎ（疲労が少ない順）
            if (!reliever) {
              const sortedMiddle = (rotation?.middleRelievers || [])
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
              const starterIds = new Set(rotation?.starters || []);
              reliever = team.players.find(p =>
                isPitcher(p) &&
                p.battingOrder === 0 &&
                p.id !== pitcher.id &&
                !starterIds.has(p.id) &&
                (p.currentStamina || 80) > 40
              );
              // リリーフが全員使えない場合のみ先発を緊急登板
              if (!reliever) {
                reliever = team.players.find(p =>
                  isPitcher(p) &&
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

        // ポジション・打順別経験を蓄積
        if (!playerData.positionExperience) playerData.positionExperience = {};
        const pos = player.position || 'unknown';
        playerData.positionExperience[pos] = (playerData.positionExperience[pos] || 0) + 1;

        if (!playerData.battingOrderExperience) playerData.battingOrderExperience = {};
        const bo = player.battingOrder || 0;
        if (bo >= 1 && bo <= 9) {
          playerData.battingOrderExperience[bo] = (playerData.battingOrderExperience[bo] || 0) + 1;
        }
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
