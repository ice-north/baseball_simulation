import { TEAMS_DATA, LEAGUE_SETTINGS } from '../teams-data.js';
import { calculatePhysicsContact, calculateBattedBallPhysics, judgeFielderReach, getTunnelingEffect } from '../simulation-logic.js';
import { PITCHING_FORM_EFFECTS } from '../utils/constants.js';
import { CONDITION_BATTING_MODIFIER, CONDITION_PITCHING_MODIFIER, CONDITION_LEVELS, initializeCondition } from './condition.js';
import { getPositionFitness } from '../utils/physics.js';

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
    return;
  }


  // 全員の打順をリセット
  players.forEach(p => { p.battingOrder = 0; });

  // 先発投手を先に決定（二刀流選手のフィールド配置に影響するため）
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

  const useDH = LEAGUE_SETTINGS.useDH;

  if (starter) {
    starter.battingOrder = useDH ? 0 : 9;
    starter.position = 'pitcher';
  }

  // 野手を取得（投手登録の二刀流は今日の先発でなければ野手として起用）
  const fieldPlayers = players.filter(p => {
    if (starter && p.id === starter.id) return false;
    if (p.isTwoWay) return true;
    return !isPitcherPlayer(p);
  });

  // コンディション・疲労による実効打撃力の計算
  const getEffectiveBatting = (p) => {
    const condMod = { 4: 5, 3: 2, 2: 0, 1: -2, 0: -5 }[p.condition ?? 2] || 0;
    const fatigue = p.fatigue || 0;
    const fatiguePenalty = fatigue > 0 ? Math.round(fatigue * fatigue / 1200) : 0;
    const meet = (p.batting?.meet || 50) + condMod - fatiguePenalty;
    const power = (p.batting?.power || 50) + condMod - fatiguePenalty;
    return { meet, power, condMod, fatiguePenalty };
  };

  // ポジションごとに最適な選手を選ぶ（守備適性+打撃力+調子+疲労の総合判断）
  const lineup = [];
  const usedPlayers = new Set();

  // 重要守備位置を先に埋める
  const priorityPositions = ['short', 'second', 'center', 'catcher', 'third', 'first', 'left', 'right'];
  priorityPositions.forEach(pos => {
    const available = fieldPlayers.filter(p => !usedPlayers.has(p.id));
    if (available.length === 0) return;

    available.sort((a, b) => {
      const aFit = getPositionFitness(a, pos);
      const bFit = getPositionFitness(b, pos);
      const aEff = getEffectiveBatting(a);
      const bEff = getEffectiveBatting(b);
      const aBat = aEff.meet + aEff.power;
      const bBat = bEff.meet + bEff.power;
      const aFatigueMalus = aEff.fatiguePenalty >= 8 ? -20 : aEff.fatiguePenalty >= 5 ? -10 : 0;
      const bFatigueMalus = bEff.fatiguePenalty >= 8 ? -20 : bEff.fatiguePenalty >= 5 ? -10 : 0;
      return (bFit * 0.6 + bBat * 0.4 + bFatigueMalus) - (aFit * 0.6 + aBat * 0.4 + aFatigueMalus);
    });

    const selected = available[0];
    lineup.push({ player: selected, position: pos });
    usedPlayers.add(selected.id);
  });

  // DH制: 打撃専門のDHをベンチから選出
  if (useDH) {
    const dhCandidates = fieldPlayers.filter(p => !usedPlayers.has(p.id));
    if (dhCandidates.length > 0) {
      dhCandidates.sort((a, b) => {
        const aEff = getEffectiveBatting(a);
        const bEff = getEffectiveBatting(b);
        return (bEff.meet + bEff.power) - (aEff.meet + aEff.power);
      });
      lineup.push({ player: dhCandidates[0], position: 'dh' });
      usedPlayers.add(dhCandidates[0].id);
    }
  }

  // 打順を決定
  const battingOrder = [];
  const remaining = [...lineup];
  const maxBattingOrder = useDH ? 9 : 8;

  // 1番: 出塁率重視（ミート+選球眼+足）※調子・疲労込み
  remaining.sort((a, b) => {
    const aEff = getEffectiveBatting(a.player);
    const bEff = getEffectiveBatting(b.player);
    const aVal = aEff.meet * 0.4 + (a.player.batting?.eye || 50) * 0.3 + (a.player.physical?.speed || 50) * 0.3;
    const bVal = bEff.meet * 0.4 + (b.player.batting?.eye || 50) * 0.3 + (b.player.physical?.speed || 50) * 0.3;
    return bVal - aVal;
  });
  if (remaining.length > 0) battingOrder.push({ ...remaining.shift(), battingOrder: 1 });

  // 2番: ミート重視
  remaining.sort((a, b) => {
    const aEff = getEffectiveBatting(a.player);
    const bEff = getEffectiveBatting(b.player);
    const aVal = aEff.meet * 0.5 + (a.player.batting?.eye || 50) * 0.3 + (a.player.physical?.speed || 50) * 0.2;
    const bVal = bEff.meet * 0.5 + (b.player.batting?.eye || 50) * 0.3 + (b.player.physical?.speed || 50) * 0.2;
    return bVal - aVal;
  });
  if (remaining.length > 0) battingOrder.push({ ...remaining.shift(), battingOrder: 2 });

  // 3番: 総合力
  remaining.sort((a, b) => {
    const aEff = getEffectiveBatting(a.player);
    const bEff = getEffectiveBatting(b.player);
    return (bEff.meet * 0.5 + bEff.power * 0.5) - (aEff.meet * 0.5 + aEff.power * 0.5);
  });
  if (remaining.length > 0) battingOrder.push({ ...remaining.shift(), battingOrder: 3 });

  // 4番: パワー最重視
  remaining.sort((a, b) => getEffectiveBatting(b.player).power - getEffectiveBatting(a.player).power);
  if (remaining.length > 0) battingOrder.push({ ...remaining.shift(), battingOrder: 4 });

  // 5番: パワー2番手
  remaining.sort((a, b) => getEffectiveBatting(b.player).power - getEffectiveBatting(a.player).power);
  if (remaining.length > 0) battingOrder.push({ ...remaining.shift(), battingOrder: 5 });

  // 6-最終番: 残りを総合打力順
  remaining.sort((a, b) => {
    const aEff = getEffectiveBatting(a.player);
    const bEff = getEffectiveBatting(b.player);
    return (bEff.meet + bEff.power) - (aEff.meet + aEff.power);
  });
  let nextOrder = 6;
  while (remaining.length > 0 && nextOrder <= maxBattingOrder) {
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

};

// ユーザーチームに推奨スタメンを設定
export const setRecommendedLineup = (teamData, teamName) => {
  // AI同様の最適配置を作成し、lineupSettingsに保存
  const players = teamData.players || [];
  if (players.length === 0) return;

  // 一旦AIロジックでスタメンを組む
  generateAILineup(teamData, teamName);

  // 結果をlineupSettingsに保存
  if (!teamData.lineupSettings) {
    teamData.lineupSettings = { battingOrder: [], benchPlayers: [], substitutionRules: { pinchHitter: [], pinchRunner: [] } };
  }

  const starters = players.filter(p => p.battingOrder > 0 && p.battingOrder <= 9);
  teamData.lineupSettings.battingOrder = starters.map(p => ({
    playerId: p.id,
    battingOrder: p.battingOrder,
    position: p.position
  }));

};

// 野手の日次回復ベース量（投手は別途 recoveryAmount を使用）
export const POSITION_PLAYER_RECOVERY_BASE = 7;

// 全チームの疲労を回復（日次処理）
// 投手はrecoveryAmount(20)で回復、野手はPOSITION_PLAYER_RECOVERY_BASE(7)で回復
export const recoverAllPitcherFatigue = (recoveryAmount = 25) => {
  Object.entries(TEAMS_DATA).forEach(([teamName, team]) => {
    if (!team || !team.players) return;

    // 選手個人の疲労回復（回復能力が高いほど多く回復）
    team.players.forEach(player => {
      if (player.fatigue && player.fatigue > 0) {
        const recoveryAbility = player.physical?.recovery || 50;
        // 回復量 = ベース回復 × (0.7〜1.3)（回復能力50で1.0倍）
        const recoveryMult = 0.7 + (recoveryAbility / 100) * 0.6;
        // 野手は回復が遅い（投手は登板間隔があるため高回復を維持）
        const baseRecov = isPitcherPlayer(player) ? recoveryAmount : POSITION_PLAYER_RECOVERY_BASE;
        const actualRecovery = Math.round(baseRecov * recoveryMult);
        player.fatigue = Math.max(0, player.fatigue - actualRecovery);
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
};

export const autoSimulateGame = (homeTeamName, awayTeamName) => {

  // TEAMS_DATAからチームデータを取得
  if (!TEAMS_DATA || !TEAMS_DATA[homeTeamName] || !TEAMS_DATA[awayTeamName]) {
    console.error('チームデータが見つかりません');
    return { homeScore: 0, awayScore: 0, result: '引分 0-0', winner: null };
  }

  const homeTeamData = JSON.parse(JSON.stringify(TEAMS_DATA[homeTeamName]));
  const awayTeamData = JSON.parse(JSON.stringify(TEAMS_DATA[awayTeamName]));


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


    // まず全員の打順を0にリセット
    teamData.players.forEach(p => { p.battingOrder = 0; });

    // lineupSettingsから打順と守備位置を適用
    settings.battingOrder.forEach(entry => {
      const player = teamData.players.find(p => p.id === entry.playerId);
      if (player) {
        player.battingOrder = entry.battingOrder;
        player.position = entry.position;
      }
    });
  };

  applyLineupSettings(homeTeamData, homeTeamName);
  applyLineupSettings(awayTeamData, awayTeamName);

  const useDH = LEAGUE_SETTINGS.useDH;
  const pitcherBattingOrder = useDH ? 0 : 9;

  // 投手ローテーションから先発投手を選択
  const selectStarterFromRotation = (teamData, teamName) => {
    const rotation = teamData.pitchingRotation;
    if (!rotation || !rotation.starters || rotation.starters.length === 0) {
      return teamData.players.find(p => p.position === 'pitcher');
    }

    // ローテーションインデックスを取得
    const index = rotation.currentStarterIndex || 0;
    const starterId = rotation.starters[index];
    const starter = teamData.players.find(p => p.id === starterId);

    if (starter) {

      // 次回のローテーションインデックスを更新
      TEAMS_DATA[teamName].pitchingRotation.currentStarterIndex =
        (index + 1) % rotation.starters.length;

      // 先発投手を設定（DH制では打順0＝打席に立たない）
      teamData.players.forEach(p => {
        if (p.id === starterId) {
          p.battingOrder = pitcherBattingOrder;
          p.position = 'pitcher';
        } else if (!useDH && p.battingOrder === 9 && p.id !== starterId) {
          p.battingOrder = 0;
        }
      });

      return starter;
    }

    return teamData.players.find(p => p.position === 'pitcher');
  };

  selectStarterFromRotation(homeTeamData, homeTeamName);
  selectStarterFromRotation(awayTeamData, awayTeamName);

  // 先発投手を確認
  const homePitchers = homeTeamData.players.filter(p => p.position === 'pitcher' && (p.battingOrder === pitcherBattingOrder || p.battingOrder === 9));
  const awayPitchers = awayTeamData.players.filter(p => p.position === 'pitcher' && (p.battingOrder === pitcherBattingOrder || p.battingOrder === 9));

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
      players: homeTeamData.players.map(p => {
        const maxStamina = p.pitching?.stamina || 100;
        const fatigue = p.fatigue || 0;
        // 疲労によりスタミナ上限が低下（最低50%まで）
        const startStamina = Math.max(Math.floor(maxStamina * 0.5), maxStamina - fatigue);
        return {
        ...p,
        currentStamina: startStamina,
        gameStats: {
          batting: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 },
          pitching: { outs: 0, runsAllowed: 0, strikeouts: 0, walks: 0, pitches: 0 },
          fielding: { chances: 0, errors: 0 }
        }
      };})
    },
    awayTeam: {
      ...awayTeamData,
      currentBatterOrder: 1,
      players: awayTeamData.players.map(p => {
        const maxStamina = p.pitching?.stamina || 100;
        const fatigue = p.fatigue || 0;
        const startStamina = Math.max(Math.floor(maxStamina * 0.5), maxStamina - fatigue);
        return {
        ...p,
        currentStamina: startStamina,
        gameStats: {
          batting: { atBats: 0, hits: 0, homeruns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 },
          pitching: { outs: 0, runsAllowed: 0, strikeouts: 0, walks: 0, pitches: 0 },
          fielding: { chances: 0, errors: 0 }
        }
      };})
    },
    // リリーフ投手追跡（登板制限用）
    reliefTracking: {
      home: {
        starterLeftInning: null,  // 先発が降板したイニング
        currentRelieverId: null,  // 現在のリリーフ投手ID
        relieverOutsPitched: 0,   // 現在のリリーフの投球アウト数
        relieverBattersFaced: 0,  // 現在のリリーフの対戦打者数
        relieverInningRuns: 0     // 現在のリリーフの今イニング失点
      },
      away: {
        starterLeftInning: null,
        currentRelieverId: null,
        relieverOutsPitched: 0,
        relieverBattersFaced: 0,
        relieverInningRuns: 0     // 現在のリリーフの今イニング失点
      }
    },
    // イニング開始時の失点記録（イニング失点計算用）
    inningStartRuns: { home: 0, away: 0 },
    // 先発投手のダメージポイント積算（降板判定用）
    // 単打/四球=4点、長打=6点、失点=10点。イニングまたぎで-10（最低0）
    starterDamagePoints: { home: 0, away: 0 },
    // 投手登板記録（セーブ・ホールド判定用）
    pitcherAppearances: { home: [], away: [] },
    // 投手交代記録（理由表示用）
    pitcherChanges: []
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
    // DH制: 投手は打順0でposition='pitcher'
    // 非DH制: 投手は打順9でposition='pitcher'
    const pitcher = team.players.find(p => p.position === 'pitcher' && (p.battingOrder === pitcherBattingOrder || p.battingOrder === 9));
    if (pitcher) return pitcher;

    const reliever = team.players.find(p => isPitcher(p) && p.pitching);
    if (reliever) return reliever;

    return team.players.find(p => p.pitching?.stamina >= 100);
  };

  // 現在の捕手を取得
  const getCurrentCatcher = (team) => {
    return team.players.find(p => p.position === 'catcher') || team.players[0];
  };

  // 守備データを構築（守備位置適正を反映: 適正100→100%、適正0→50%）
  const buildDefense = (team) => {
    const defense = {};
    const defStrat = team.strategy?.defense || 'normal';
    // 守備方針: 前進守備は内野守備+10/外野守備-5, シフトは全体+5
    const infieldBonus = defStrat === 'infield_in' ? 10 : defStrat === 'shift' ? 5 : 0;
    const outfieldBonus = defStrat === 'infield_in' ? -5 : defStrat === 'shift' ? 5 : 0;
    const infieldPositions = ['first', 'second', 'short', 'third', 'catcher', 'pitcher'];

    // DH制: 投手はbattingOrder=0だが守備参加、DHはbattingOrder>0だが守備不参加
    const currentPitcherForDef = getCurrentPitcher(team);
    team.players.filter(p =>
      (p.battingOrder > 0 && p.battingOrder <= 9 && p.position !== 'dh') ||
      (p.position === 'pitcher' && p.id === currentPitcherForDef?.id)
    ).forEach(player => {
      const fitness = getPositionFitness(player, player.position);
      const fitnessMult = 0.5 + (fitness / 100) * 0.5;
      const posBonus = infieldPositions.includes(player.position) ? infieldBonus : outfieldBonus;
      defense[player.position] = {
        defense: Math.round((player.fielding?.defense || 50) * fitnessMult) + posBonus,
        speed: Math.round((player.physical?.speed || 50) * fitnessMult),
        arm: Math.round((player.physical?.arm || 50) * fitnessMult),
        throws: player.physical?.throws || 'right'
      };
    });
    return defense;
  };

  // 一球シミュレーション（自己完結型）
  const simulateOnePitch = (batterPlayer, pitcherPlayer, catcherPlayer, defense, count, pitcherStamina, bases, lastPitch, offenseStrategy, defenseStrategy) => {
    const battingStrat = offenseStrategy?.batting || 'balanced';
    const pitchingStrat = defenseStrategy?.pitching || 'balanced';

    // 打撃方針の効果
    const stratMeetMod = battingStrat === 'patient' ? 3 : battingStrat === 'aggressive' ? -5 : 0;
    const stratPowerMod = battingStrat === 'aggressive' ? 8 : battingStrat === 'patient' ? -5 : 0;
    const stratEyeMod = battingStrat === 'patient' ? 10 : battingStrat === 'aggressive' ? -5 : 0;

    // コンディション補正
    const batterCondition = batterPlayer.condition ?? CONDITION_LEVELS.NORMAL;
    const pitcherCondition = pitcherPlayer.condition ?? CONDITION_LEVELS.NORMAL;
    const batterCondMod = CONDITION_BATTING_MODIFIER[batterCondition] || 0;
    const pitcherCondMod = CONDITION_PITCHING_MODIFIER[pitcherCondition] || 0;

    // 疲労による能力低下（疲労0→0%, 疲労50→-5%, 疲労100→-15%）
    const batterFatigue = batterPlayer.fatigue || 0;
    const fatiguePenalty = batterFatigue > 0 ? Math.round(batterFatigue * batterFatigue / 1200) : 0;

    const batter = {
      meet: (batterPlayer.batting?.meet || 50) + stratMeetMod + batterCondMod - fatiguePenalty,
      power: (batterPlayer.batting?.power || 50) + stratPowerMod + batterCondMod - fatiguePenalty,
      eye: (batterPlayer.batting?.eye || 50) + stratEyeMod - Math.floor(fatiguePenalty * 0.5),
      speed: (batterPlayer.physical?.speed || 50) - fatiguePenalty,
      bats: batterPlayer.batting?.bats || 'right'
    };

    // 投手の疲労ペナルティ（打者と同じ二次曲線: 疲労0→0, 50→-4, 100→-15）
    const pitcherFatigue = pitcherPlayer.fatigue || 0;
    const pitcherFatiguePenalty = pitcherFatigue > 0 ? Math.round(pitcherFatigue * pitcherFatigue / 670) : 0;

    const pitcher = {
      velocity: (pitcherPlayer.pitching?.velocity || 140) - pitcherFatiguePenalty,
      control: (pitcherPlayer.pitching?.control || 50) + pitcherCondMod - pitcherFatiguePenalty,
      throws: pitcherPlayer.physical?.throws || 'right'
    };

    // スタミナによる能力低下（2次曲線: スタミナ50%以下で急激に低下）
    const pitcherMaxStamina = pitcherPlayer.pitching?.stamina || 100;
    const staminaRatio = Math.max(0, Math.min(pitcherStamina / pitcherMaxStamina, 1));
    const staminaCurve = staminaRatio * staminaRatio; // 0→0, 0.5→0.25, 0.7→0.49, 1.0→1.0
    const effectiveControl = pitcher.control * (0.6 + 0.4 * staminaCurve);
    const effectiveVelocity = pitcher.velocity * (0.88 + 0.12 * staminaCurve);

    // 左右相性
    const sameHand = pitcher.throws === batter.bats;
    const handBonus = sameHand ? -5 : 5;

    // 投球する球種を選択（投手のarsenalから）
    const arsenal = pitcherPlayer.pitching?.arsenal || [{ type: 'straight', level: 50 }];
    const breakingBalls = arsenal.filter(a => a.type !== 'straight');
    let selectedPitch;
    // 投球方針による変化球選択率調整
    const breakingBallBonus = pitchingStrat === 'strikeout' ? 0.12 : pitchingStrat === 'contact' ? -0.08 : 0;
    if (breakingBalls.length > 0 && Math.random() < 0.35 + breakingBalls.length * 0.06 + breakingBallBonus) {
      selectedPitch = breakingBalls[Math.floor(Math.random() * breakingBalls.length)];
    } else {
      selectedPitch = arsenal.find(a => a.type === 'straight') || { type: 'straight', level: 50 };
    }

    // 変化球の球速減速（緩急効果）
    let pitchVelocityFinal = effectiveVelocity;
    if (selectedPitch.type !== 'straight') {
      const speedReduction = 8 + (selectedPitch.level / 100) * 15;
      pitchVelocityFinal = effectiveVelocity - speedReduction;
    }

    // 緩急ペナルティ: 前球と球種が違うと打者のタイミングが狂う（比率ベース）
    // 遅い投手ほど同じ球速差でも体感の緩急が大きくなる
    let speedDiffPenalty = 0;
    if (lastPitch && selectedPitch.type !== lastPitch.type) {
      const veloDiff = Math.abs(effectiveVelocity - pitchVelocityFinal);
      const speedDiffRatio = effectiveVelocity > 0 ? veloDiff / effectiveVelocity : 0;
      speedDiffPenalty = speedDiffRatio * 22;
    }

    // 投球結果を決定
    const rand = Math.random() * 100;

    // 投球方針の効果
    const pitchStrikeBonus = pitchingStrat === 'contact' ? 5 : pitchingStrat === 'strikeout' ? -3 : 0;

    // ストライク/ボールの判定（変化球は制球が落ちる）
    const strikeChance = 35 + effectiveControl * 0.25 + pitchStrikeBonus;
    const breakingControlPenalty = selectedPitch.type !== 'straight' ? (100 - (selectedPitch.level || 50)) * 0.05 : 0;
    const adjustedStrikeChance = strikeChance - breakingControlPenalty;

    if (rand < adjustedStrikeChance) {
      // ストライクゾーン
      const swingRand = Math.random() * 100;
      const swingChance = 60 + (2 - count.strikes) * 10;

      if (swingRand < swingChance) {
        // スイング - 変化球のコンタクトペナルティ
        const contactRand = Math.random() * 100;
        const breakingPenalty = selectedPitch.type !== 'straight' ? (selectedPitch.level || 50) * 0.12 : 0;
        const contactChance = 45 + batter.meet * 0.45 + handBonus - breakingPenalty - speedDiffPenalty;

        if (contactRand < contactChance) {
          // コンタクト成功 - 物理エンジンで打球・守備を判定
          const pitchData = {
            type: selectedPitch.type,
            velocity: pitchVelocityFinal,
            level: selectedPitch.level || 50
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
            Math.random() < (selectedPitch.type === 'straight' ? 0.3 : 0.2),
            pitchData,
            tunnelingEffect,
            handEffect
          );

          if (!physicsResult.isContact) {
            return { type: 'swinging_strike' };
          }

          // 打球物理パラメータ計算
          const battedBall = calculateBattedBallPhysics(batter, pitcher, pitchData, physicsResult);

          // 守備判定
          const fieldResult = judgeFielderReach(battedBall, defense, batter);

          if (fieldResult.result === 'homerun') {
            return { type: 'homerun' };
          } else if (fieldResult.result === 'out') {
            if (bases[0] && battedBall.launchAngle < 10 && battedBall.distance < 40) {
              const ifDefense = ['second', 'short'].map(p => defense[p]?.defense || 50);
              const ifAvg = ifDefense.reduce((a, b) => a + b, 0) / 2;
              const dpBase = 15 + (ifAvg - 50) * 0.35;
              if (Math.random() * 100 < dpBase) {
                return { type: 'double_play' };
              }
            }
            return {
              type: 'out',
              isOutfieldFly: fieldResult.isOutfieldFly || false,
              tagupThrowbackChance: fieldResult.tagupThrowbackChance || 0,
              fieldingPosition: fieldResult.fieldingPosition
            };
          } else if (fieldResult.result === 'triple') {
            return { type: 'triple' };
          } else if (fieldResult.result === 'double') {
            return { type: 'double' };
          } else {
            return { type: 'single', isError: fieldResult.isError || false, errorPosition: fieldResult.errorPosition };
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
      // 変化球のボール球は追いかけやすい
      const breakingChaseBonus = selectedPitch.type !== 'straight' ? (selectedPitch.level || 50) * 0.05 : 0;
      const chaseChance = 12 + (3 - batter.eye * 0.12) + count.strikes * 4 + breakingChaseBonus;

      if (swingRand < chaseChance) {
        const contactRand = Math.random() * 100;
        if (contactRand < 20) {
          return { type: 'foul' };
        }
        return { type: 'swinging_strike' };
      } else {
        return { type: 'ball' };
      }
    }
  };

  // 走者進塁処理（外野手の肩で進塁を抑制）
  // bases配列にはプレイヤーオブジェクト or false が格納される
  const advanceRunners = (hitType, bases, defense, batter) => {
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
          }
        }

        if (newBase >= 3) {
          runsScored++;
        } else {
          newBases[newBase] = bases[i]; // プレイヤー参照を維持
        }
      }
    }

    // 打者自身を塁に配置
    if (advancement < 3) {
      newBases[advancement - 1] = batter || true;
    } else {
      runsScored++;
    }

    return { bases: newBases, runsScored };
  };

  // 盗塁判定（AI監督）- 走者の実際の走力を使用
  const attemptStolenBase = (offenseTeam, defenseTeam) => {
    const pitcher = getCurrentPitcher(defenseTeam);
    const catcher = defenseTeam.players.find(p => p.position === 'catcher');

    for (let base = 0; base < 2; base++) {
      if (gameState.bases[base] && !gameState.bases[base + 1]) {
        // 塁上の走者オブジェクトから直接走力を取得
        const runner = gameState.bases[base];
        const runnerSpeed = (typeof runner === 'object' && runner?.physical?.speed)
          ? runner.physical.speed
          : offenseTeam.players.filter(p => p.battingOrder > 0 && p.battingOrder <= 9)
              .reduce((sum, p) => sum + (p.physical?.speed || 50), 0) / 9;

        const catcherArm = catcher?.physical?.arm || 50;
        const pitcherQuick = pitcher?.pitching?.control || 50;

        // 盗塁成功確率: 走力ベース（50で40%、70で76%、90で112%→capped）
        const baseChance = (runnerSpeed - 25) * 1.8;
        const catcherPenalty = catcherArm * 0.3;
        const pitcherPenalty = pitcherQuick * 0.1;
        const successChance = Math.max(0, Math.min(100, baseChance - catcherPenalty - pitcherPenalty + (Math.random() * 20 - 10)));

        // 走塁方針の効果
        const baseRunStrat = offenseTeam.strategy?.baseRunning || 'normal';
        const stealThreshold = baseRunStrat === 'aggressive' ? 45 : baseRunStrat === 'conservative' ? 65 : 55;
        const stealAggressMod = baseRunStrat === 'aggressive' ? 1.1 : baseRunStrat === 'conservative' ? 0.3 : 0.6;

        // 盗塁を試みる条件
        const shouldAttempt = runnerSpeed >= 55 && gameState.outs < 2 && successChance > stealThreshold;
        // 走力が高いほど積極的に走る（方針で補正）
        const aggressiveness = Math.random() * 100 < (runnerSpeed - 45) * 1.0 * stealAggressMod;

        if (shouldAttempt && aggressiveness) {
          const rand = Math.random() * 100;
          if (rand < successChance) {
            const stolenRunner = gameState.bases[base];
            gameState.bases[base] = false;
            gameState.bases[base + 1] = stolenRunner;
            // 盗塁成功を実際の走者の成績に記録
            if (typeof stolenRunner === 'object' && stolenRunner?.gameStats?.batting) {
              stolenRunner.gameStats.batting.stolenBases = (stolenRunner.gameStats.batting.stolenBases || 0) + 1;
            }
            const runnerName = typeof stolenRunner === 'object' ? stolenRunner.name : '走者';
            return { success: true, base };
          } else {
            gameState.bases[base] = false;
            gameState.outs++;
            const runnerName = typeof runner === 'object' ? runner.name : '走者';
            return { success: false, base };
          }
        }
      }
    }
    return null;
  };

  // 代打判定（AI監督）- 状況判断・理由付き版
  const considerPinchHitter = (offenseTeam, batter) => {
    const benchFielders = offenseTeam.players.filter(p =>
      p.battingOrder === 0 && !isPitcher(p)
    );
    if (benchFielders.length === 0) return batter;

    // 控え選手の中から最強打者を選ぶヘルパー
    const getBestBench = () => benchFielders.reduce((best, p) => {
      const total = (p.batting?.meet || 0) + (p.batting?.power || 0);
      const bestTotal = (best.batting?.meet || 0) + (best.batting?.power || 0);
      return total > bestTotal ? p : best;
    }, benchFielders[0]);

    // 代打実行ヘルパー
    const executePinchHit = (pinchHitter, reason) => {
      const batterData = offenseTeam.players.find(p => p.id === batter.id);
      const phData = offenseTeam.players.find(p => p.id === pinchHitter.id);
      if (batterData && phData) {
        phData.battingOrder = batterData.battingOrder;
        phData.position = batterData.position;
        batterData.battingOrder = 0;
        return pinchHitter;
      }
      return batter;
    };

    const batterTotal = (batter.batting?.meet || 0) + (batter.batting?.power || 0);
    const bestBench = getBestBench();
    const bestBenchTotal = bestBench ? (bestBench.batting?.meet || 0) + (bestBench.batting?.power || 0) : 0;

    const myScore = gameState.isTopInning ? gameState.score.away : gameState.score.home;
    const oppScore = gameState.isTopInning ? gameState.score.home : gameState.score.away;
    const scoreDiff = myScore - oppScore;
    const runnersOn = gameState.bases.filter(Boolean).length;
    const isScoring = gameState.bases[1] || gameState.bases[2];

    // 1. 投手の打順：6回以降で代打（投手は打撃が弱い）
    if (isPitcher(batter) && gameState.inning >= 6) {
      if (bestBench && ((bestBench.batting?.meet || 0) > (batter.batting?.meet || 0) + 5)) {
        return executePinchHit(bestBench, `${gameState.inning}回、投手に代わり打力アップ`);
      }
    }

    // 2. 7回以降、得点圏にランナーがいて打撃力差が大きい
    if (gameState.inning >= 7 && isScoring && bestBenchTotal > batterTotal + 10) {
      const runnerDesc = gameState.bases[2] ? '三塁' : '二塁';
      return executePinchHit(bestBench, `チャンス(${runnerDesc}にランナー)で打撃力の高い代打`);
    }

    // 3. 8回以降、ビハインドで下位打線に代打
    if (gameState.inning >= 8 && scoreDiff < 0 && batter.battingOrder >= 6 && bestBenchTotal > batterTotal + 5) {
      return executePinchHit(bestBench, `${Math.abs(scoreDiff)}点ビハインド、反撃のため代打起用`);
    }

    // 4. 9回以降、接戦でランナーあり、少しでも打力が上がるなら代打
    if (gameState.inning >= 9 && Math.abs(scoreDiff) <= 2 && runnersOn > 0 && bestBenchTotal > batterTotal + 3) {
      const situationDesc = scoreDiff < 0 ? `${Math.abs(scoreDiff)}点ビハインド最終回の勝負` :
                           scoreDiff === 0 ? '同点の勝負所' : 'リード守る一打';
      return executePinchHit(bestBench, `${situationDesc}、${bestBench.name}に託す`);
    }

    // 5. 7回以降、接戦でランナー2人以上、控えの方が打撃力が高い
    if (gameState.inning >= 7 && Math.abs(scoreDiff) <= 3 && runnersOn >= 2 && bestBenchTotal > batterTotal) {
      return executePinchHit(bestBench, `接戦の大チャンス(ランナー${runnersOn}人)で代打起用`);
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
        if (starter.battingOrder > 0 && starter.position !== 'pitcher' && starter.position !== 'dh') {
          const starterDef = starter.fielding?.defense || 50;
          if (starterDef < 60) {
            const replacement = benchFielders.find(p =>
              p.battingOrder === 0 &&
              (p.fielding?.defense || 0) > starterDef + 8
            );
            if (replacement) {
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

        // 打撃が最も弱いスタメンと交代（投手・DHは守備固め対象外）
        const starters = defenseTeam.players.filter(p => p.battingOrder > 0 && p.position !== 'pitcher' && p.position !== 'dh');
        if (starters.length > 0) {
          const weakest = starters.reduce((w, p) => {
            const wBat = (w.batting?.meet || 0) + (w.batting?.power || 0);
            const pBat = (p.batting?.meet || 0) + (p.batting?.power || 0);
            return pBat < wBat ? p : w;
          }, starters[0]);

          leastUsed.battingOrder = weakest.battingOrder;
          leastUsed.position = weakest.position;
          weakest.battingOrder = 0;
        }
      }
    }
  };

  // AI監督: 打席間のピンチ投手交代（ロールベース対応）
  const considerMidInningPitcherChange = (defenseTeam, currentPitcher, gs) => {
    const teamName = defenseTeam === gs.homeTeam ? homeTeamName : awayTeamName;
    const teamKey = defenseTeam === gs.homeTeam ? 'home' : 'away';
    const team = TEAMS_DATA[teamName];
    if (!team) return;
    const rotation = team.pitchingRotation;
    if (!rotation) return;
    const fatigue = rotation.reliefFatigue || {};
    const pitcherRoles = rotation.pitcherRoles || {};
    const reliefTrack = gs.reliefTracking[teamKey];

    const pitcherData = defenseTeam.players.find(p => p.id === currentPitcher.id);
    if (!pitcherData) return;
    const staminaRate = pitcherData.currentStamina / (currentPitcher.pitching?.stamina || 80);

    const scoreDiff = defenseTeam === gs.homeTeam
      ? gs.score.home - gs.score.away
      : gs.score.away - gs.score.home;

    const runnersOn = gs.bases.filter(Boolean).length;
    const isLate = gs.inning >= 7;

    let shouldChange = false;
    let situation = 'middle';
    let changeReason = '';

    // ワンポイント投手の1打者制限チェック
    const currentPitcherRole = pitcherRoles[currentPitcher.id] || '';
    if (currentPitcherRole === 'onepoint' && reliefTrack.currentRelieverId === currentPitcher.id) {
      if (reliefTrack.relieverBattersFaced >= 1) {
        shouldChange = true;
        situation = 'middle';
        changeReason = `ワンポイント${currentPitcher.name}が1打者対戦済み、交代`;
      }
    }

    // セットアッパー/中継ぎエース: 失点したら即交代（イニング途中でも）
    if (!shouldChange && reliefTrack.currentRelieverId === currentPitcher.id) {
      if (currentPitcherRole === 'setup' || currentPitcherRole === 'ace_relief') {
        const currentRuns = pitcherData.gameStats?.pitching?.runsAllowed || 0;
        const inningStartRuns = gs.inningStartRuns?.[teamKey] || 0;
        const inningRuns = currentRuns - inningStartRuns;
        if (inningRuns > 0) {
          shouldChange = true;
          situation = 'middle';
          changeReason = `${currentPitcherRole === 'setup' ? 'セットアッパー' : '中継ぎエース'}${currentPitcher.name}が失点、緊急交代`;
        }
      }
    }

    // === 新降板ルール: 打席間チェック（対戦中の勝負が終わったタイミング） ===
    const isRelieverMid = reliefTrack.currentRelieverId === currentPitcher.id;
    const totalPitchesMid = pitcherData.gameStats?.pitching?.pitches || 0;

    // 条件1: 球数制限（ロール別）
    if (!shouldChange) {
      const PITCH_LIMITS = {
        complete: 120, ace: 110, quality: 100, short: 65, auto_s: 100,
        closer: 40, setup: 35, ace_relief: 40, long: 60,
        onepoint: 15, behind: 50, mopup: 50, auto_r: 35
      };
      const pitchLimit = PITCH_LIMITS[currentPitcherRole] || (isRelieverMid ? 35 : 100);
      if (totalPitchesMid >= pitchLimit) {
        shouldChange = true;
        situation = Math.abs(scoreDiff) <= 2 ? 'hold' : 'middle';
        changeReason = `${currentPitcher.name}が球数制限到達(${totalPitchesMid}/${pitchLimit}球)`;
      }
    }

    // 条件2: スタミナ25%以下
    if (!shouldChange && staminaRate < 0.25) {
      shouldChange = true;
      situation = 'middle';
      changeReason = `${currentPitcher.name}のスタミナ限界(${Math.round(staminaRate * 100)}%)`;
    }

    // 条件3: ダメージポイント制（先発のみ）
    if (!shouldChange && !isRelieverMid) {
      const INNING_DAMAGE_THRESHOLDS = [45, 40, 35, 30, 25, 20, 15, 10, 5];
      const inningIdx = Math.min(gs.inning - 1, 8);
      const threshold = INNING_DAMAGE_THRESHOLDS[inningIdx] || 5;
      const currentDamage = gs.starterDamagePoints[teamKey];
      if (currentDamage >= threshold) {
        shouldChange = true;
        situation = Math.abs(scoreDiff) <= 2 ? 'hold' : 'middle';
        changeReason = `先発${currentPitcher.name}がダメージ蓄積で降板(DP:${currentDamage}/${threshold})`;
      }
    }

    // 9回リード時→クローザー必須
    if (!shouldChange && gs.inning >= 9 && scoreDiff > 0 && scoreDiff <= 3) {
      const isCloser = rotation.closer && currentPitcher.id === rotation.closer;
      if (!isCloser) {
        shouldChange = true;
        situation = 'save';
        changeReason = `9回${scoreDiff}点リード、守護神を投入`;
      }
    }
    // 8回僅差→セットアッパー
    if (!shouldChange && gs.inning === 8 && Math.abs(scoreDiff) <= 2) {
      const isSetup = (rotation.setupMen || []).includes(currentPitcher.id);
      const isCloser = rotation.closer && currentPitcher.id === rotation.closer;
      if (!isSetup && !isCloser && staminaRate < 0.60) {
        shouldChange = true;
        situation = 'hold';
        changeReason = `8回僅差(${scoreDiff > 0 ? scoreDiff + '点リード' : Math.abs(scoreDiff) + '点ビハインド'})、セットアッパーへ`;
      }
    }
    // ピンチ場面: ランナー2人以上+アウト1以下+後半+スタミナ低い
    if (!shouldChange && runnersOn >= 2 && gs.outs <= 1 && isLate && staminaRate < 0.45) {
      shouldChange = true;
      situation = 'middle';
      changeReason = `ピンチ(ランナー${runnersOn}人・${gs.outs}アウト)でスタミナ${Math.round(staminaRate * 100)}%`;
    }
    // 満塁+アウト1以下（回に関係なく）でスタミナ低い
    else if (runnersOn === 3 && gs.outs <= 1 && staminaRate < 0.50) {
      shouldChange = true;
      situation = 'middle';
      changeReason = `満塁のピンチでスタミナ${Math.round(staminaRate * 100)}%、緊急交代`;
    }

    // 左打者にワンポイント左投手を送り込む判定
    // 条件: 7回以降、僅差、現在の投手が右投げ、次の打者が左打ち
    const offenseTeamForOnepoint = defenseTeam === gs.homeTeam ? gs.awayTeam : gs.homeTeam;
    const nextBatter = offenseTeamForOnepoint.players.find(p => p.battingOrder === offenseTeamForOnepoint.currentBatterOrder);
    const nextBatterBats = nextBatter?.batting?.bats || 'right';
    const currentPitcherThrows = currentPitcher.physical?.throws || 'right';
    if (!shouldChange && gs.inning >= 7 && Math.abs(scoreDiff) <= 3 && nextBatterBats === 'left' && currentPitcherThrows !== 'left') {
      // 左投げのワンポイント投手が使えるか確認
      const onepointIds = (rotation.middleRelievers || []).filter(id =>
        pitcherRoles[id] === 'onepoint' && (fatigue[id] || 0) < 50 && id !== currentPitcher.id
      );
      for (const opId of onepointIds) {
        const opPlayer = defenseTeam.players.find(p => p.id === opId);
        if (opPlayer && (opPlayer.physical?.throws === 'left')) {
          shouldChange = true;
          situation = 'lefty';
          changeReason = `左打者${nextBatter.name}に対し左ワンポイント投入`;
          break;
        }
      }
    }

    if (!shouldChange) return;

    // リリーフ投手選択（ロールベース、再登板防止）
    let reliever = null;
    let selectedRoleLabel = '';

    // 今試合で既に登板した投手のIDセット（再登板防止）
    const alreadyPitchedIds = new Set(
      gs.pitcherAppearances[teamKey].map(a => a.id)
    );
    alreadyPitchedIds.add(currentPitcher.id);
    const isAvailableMid = (id) => !alreadyPitchedIds.has(id) && (fatigue[id] || 0) < 50;

    // 左打者対策: ワンポイント左投手を優先選択
    if (situation === 'lefty') {
      const onepointIds = (rotation.middleRelievers || []).filter(id =>
        pitcherRoles[id] === 'onepoint' && isAvailableMid(id)
      );
      for (const opId of onepointIds) {
        const opPlayer = defenseTeam.players.find(p => p.id === opId);
        if (opPlayer && opPlayer.physical?.throws === 'left') {
          reliever = opPlayer;
          selectedRoleLabel = 'ワンポイント(左)';
          break;
        }
      }
    }

    if (situation === 'save' && rotation.closer) {
      const closerData = defenseTeam.players.find(p => p.id === rotation.closer);
      if (closerData && isAvailableMid(rotation.closer)) {
        reliever = closerData;
        selectedRoleLabel = '守護神';
      }
    }

    if (!reliever && (situation === 'hold' || situation === 'save')) {
      for (const setupId of (rotation.setupMen || [])) {
        const setupData = defenseTeam.players.find(p => p.id === setupId);
        if (setupData && isAvailableMid(setupId)) {
          reliever = setupData;
          selectedRoleLabel = 'セットアッパー';
          break;
        }
      }
    }

    // 接戦ピンチ: 中継ぎエースを優先
    if (!reliever && Math.abs(scoreDiff) <= 3) {
      const aceRelievers = (rotation.middleRelievers || [])
        .filter(id => pitcherRoles[id] === 'ace_relief' && isAvailableMid(id))
        .map(id => defenseTeam.players.find(p => p.id === id))
        .filter(Boolean);
      if (aceRelievers.length > 0) {
        reliever = aceRelievers[0];
        selectedRoleLabel = '中継ぎエース';
      }
    }

    if (!reliever) {
      const sortedMiddle = (rotation.middleRelievers || [])
        .filter(id => {
          const p = defenseTeam.players.find(pl => pl.id === id);
          return p && isAvailableMid(id) && pitcherRoles[id] !== 'onepoint';
        })
        .sort((a, b) => (fatigue[a] || 0) - (fatigue[b] || 0));
      if (sortedMiddle.length > 0) {
        reliever = defenseTeam.players.find(p => p.id === sortedMiddle[0]);
        const role = pitcherRoles[sortedMiddle[0]];
        selectedRoleLabel = role === 'long' ? 'ロングリリーフ' :
                           role === 'ace_relief' ? '中継ぎエース' : '中継ぎ';
      }
    }

    if (!reliever) {
      const starterIds = new Set(rotation.starters || []);
      reliever = defenseTeam.players.find(p =>
        isPitcher(p) &&
        p.battingOrder === 0 &&
        !alreadyPitchedIds.has(p.id) &&
        !starterIds.has(p.id) &&
        (p.currentStamina || 80) > 40
      );
      if (reliever) selectedRoleLabel = '緊急中継ぎ';
    }

    // 最終フォールバック: 全員疲労でも最もスタミナの残っている投手を選ぶ
    if (!reliever) {
      const allPitchers = defenseTeam.players
        .filter(p => isPitcher(p) && p.battingOrder === 0 && !alreadyPitchedIds.has(p.id))
        .sort((a, b) => (b.currentStamina || 0) - (a.currentStamina || 0));
      if (allPitchers.length > 0) {
        reliever = allPitchers[0];
        selectedRoleLabel = '緊急登板';
      }
    }

    if (reliever) {

      // 投手交代記録を保存
      gs.pitcherChanges.push({
        inning: gs.inning,
        isTop: gs.isTopInning,
        team: teamName,
        out: currentPitcher.name,
        in: reliever.name,
        role: selectedRoleLabel,
        reason: changeReason
      });

      if (!reliefTrack.starterLeftInning) {
        reliefTrack.starterLeftInning = gs.inning;
      }

      // 登板記録を追加（セーブ・ホールド判定用）
      const appearances = gs.pitcherAppearances[teamKey];
      appearances.push({
        id: reliever.id,
        entryInning: gs.inning,
        entryIsTop: gs.isTopInning,
        entryScore: { ...gs.score },
        isStarter: false
      });

      const relieverData = defenseTeam.players.find(p => p.id === reliever.id);
      const relieverOldOrder = relieverData.battingOrder;
      const relieverOldPos = relieverData.position;
      const isTwoWaySwap = relieverOldOrder > 0 && relieverOldOrder < 9;

      pitcherData.battingOrder = 0;
      pitcherData.position = 'pitcher';

      relieverData.battingOrder = useDH ? 0 : 9;
      relieverData.position = 'pitcher';
      relieverData.currentStamina = relieverData.pitching?.stamina || 80;

      // 二刀流リリーフ: 空いた野手スロットをベンチから補充
      if (isTwoWaySwap && relieverOldPos) {
        const benchFielders = defenseTeam.players.filter(p =>
          p.battingOrder === 0 && !isPitcher(p) && p.id !== relieverData.id
        );
        if (benchFielders.length > 0) {
          benchFielders.sort((a, b) =>
            (b.positionFitness?.[relieverOldPos] || 0) - (a.positionFitness?.[relieverOldPos] || 0)
          );
          benchFielders[0].battingOrder = relieverOldOrder;
          benchFielders[0].position = relieverOldPos;
        }
      }

      reliefTrack.currentRelieverId = reliever.id;
      reliefTrack.relieverOutsPitched = 0;
      reliefTrack.relieverBattersFaced = 0;
      reliefTrack.relieverInningRuns = 0;

      if (TEAMS_DATA[teamName]?.pitchingRotation?.reliefFatigue) {
        TEAMS_DATA[teamName].pitchingRotation.reliefFatigue[reliever.id] =
          (TEAMS_DATA[teamName].pitchingRotation.reliefFatigue[reliever.id] || 0) + 30;
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

    // AI監督: 打席間のピンチ投手交代（ランナー状況・スタミナ考慮）
    considerMidInningPitcherChange(defenseTeam, pitcher, gameState);

    let atBatOver = false;
    let pitchCount = 0;
    const maxPitches = 20;
    let lastPitch = null;
    gameState._stolenAttempted = false;
    let atBatDamagePoints = 0; // この打席で先発に蓄積するダメージポイント

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

      // チームの作戦設定を取得
      const offenseStrategy = (gameState.isTopInning ? gameState.awayTeam : gameState.homeTeam).strategy;
      const defenseStrategy = (gameState.isTopInning ? gameState.homeTeam : gameState.awayTeam).strategy;

      // 一球シミュレーション（simulation-logic.jsの物理エンジンを使用）
      const result = simulateOnePitch(batter, pitcher, catcher, defense, gameState.count, pitcherStamina, gameState.bases, lastPitch, offenseStrategy, defenseStrategy);

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
            atBatDamagePoints += 4; // 四球=4ダメージ
            if (gameState.bases[0] && gameState.bases[1] && gameState.bases[2]) {
              // 満塁押し出し: 3塁走者が生還
              if (gameState.isTopInning) gameState.score.away++;
              else gameState.score.home++;
              pitcher.gameStats.pitching.runsAllowed++;
              atBatDamagePoints += 10; // 失点=10ダメージ
              gameState.bases[2] = gameState.bases[1];
              gameState.bases[1] = gameState.bases[0];
              gameState.bases[0] = batter;
            } else {
              if (gameState.bases[1] && gameState.bases[0]) gameState.bases[2] = gameState.bases[1];
              if (gameState.bases[0]) gameState.bases[1] = gameState.bases[0];
              gameState.bases[0] = batter;
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

        case 'out': {
          batter.gameStats.batting.atBats++;
          pitcher.gameStats.pitching.outs++;
          gameState.outs++;

          // 守備機会を記録（アウトにした野手）
          if (result.fieldingPosition) {
            const outFielder = defenseTeam.players.find(p => p.position === result.fieldingPosition && p.battingOrder >= 1);
            if (outFielder) {
              outFielder.gameStats.fielding.chances++;
            }
          }

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
                atBatDamagePoints += 10; // 失点=10ダメージ
              } else {
                gameState.bases[2] = false;
                gameState.outs++;
                pitcher.gameStats.pitching.outs++;
              }
            }
            // 2塁走者のタッグアップ進塁（深いフライ時）
            if (gameState.bases[1] && !gameState.bases[2] && gameState.outs < 3) {
              const advanceChance = 0.4 - (result.tagupThrowbackChance || 0) * 0.5;
              if (Math.random() < advanceChance) {
                gameState.bases[2] = gameState.bases[1]; // 走者参照を維持
                gameState.bases[1] = false;
              }
            }
          }

          atBatOver = true;
          break;
        }

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
          const { bases: newBases, runsScored } = advanceRunners(result.type, gameState.bases, defense, batter);
          batter.gameStats.batting.atBats++;
          batter.gameStats.batting.hits++;
          batter.gameStats.batting.rbis += runsScored;
          if (result.type === 'double') batter.gameStats.batting.doubles = (batter.gameStats.batting.doubles || 0) + 1;
          if (result.type === 'triple') batter.gameStats.batting.triples = (batter.gameStats.batting.triples || 0) + 1;
          if (result.type === 'homerun') batter.gameStats.batting.homeruns++;
          // ダメージポイント: 単打=4, 長打(二塁打/三塁打/本塁打)=6, 失点=10×得点数
          atBatDamagePoints += (result.type === 'single') ? 4 : 6;
          atBatDamagePoints += runsScored * 10;

          // 投手の被安打・被本塁打を記録
          pitcher.gameStats.pitching.hits = (pitcher.gameStats.pitching.hits || 0) + 1;
          if (result.type === 'homerun') pitcher.gameStats.pitching.homeruns = (pitcher.gameStats.pitching.homeruns || 0) + 1;

          // エラー記録（守備側の該当野手）
          if (result.isError && result.errorPosition) {
            const errorFielder = defenseTeam.players.find(p => p.position === result.errorPosition && p.battingOrder >= 1);
            if (errorFielder) {
              errorFielder.gameStats.fielding.errors++;
              errorFielder.gameStats.fielding.chances++;
            }
          }

          if (gameState.isTopInning) gameState.score.away += runsScored;
          else gameState.score.home += runsScored;

          pitcher.gameStats.pitching.runsAllowed += runsScored;
          gameState.bases = newBases;
          atBatOver = true;
          break;
      }
    }

    // 先発投手のダメージポイント積算（先発のみに適用）
    const dmgTeamKey = defenseTeam === gameState.homeTeam ? 'home' : 'away';
    const isStarterOnMound = !gameState.reliefTracking[dmgTeamKey].currentRelieverId;
    if (isStarterOnMound && atBatDamagePoints > 0) {
      gameState.starterDamagePoints[dmgTeamKey] += atBatDamagePoints;
    }

    // リリーフ投手の対戦打者数を追跡
    const teamKeyForReliefBatter = defenseTeam === gameState.homeTeam ? 'home' : 'away';
    const reliefTrackBatter = gameState.reliefTracking[teamKeyForReliefBatter];
    if (reliefTrackBatter.currentRelieverId === pitcher.id) {
      reliefTrackBatter.relieverBattersFaced++;
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

    // イニング開始時の失点を記録（イニング失点計算用）
    // 守備チーム = 攻撃チームの反対
    const defenseKey = gameState.isTopInning ? 'home' : 'away';
    const defenseTeamForInning = gameState.isTopInning ? gameState.homeTeam : gameState.awayTeam;
    const defPitcher = getCurrentPitcher(defenseTeamForInning);
    if (defPitcher) {
      const defPitcherData = defenseTeamForInning.players.find(p => p.id === defPitcher.id);
      gameState.inningStartRuns[defenseKey] = defPitcherData?.gameStats?.pitching?.runsAllowed || 0;
    }
    // リリーフのイニング失点をリセット
    gameState.reliefTracking[defenseKey].relieverInningRuns = 0;

    let atBats = 0;
    while (gameState.outs < 3 && atBats < 50) {  // 無限ループ防止（打席数制限）
      simulateAtBat();
      atBats++;
    }

    if (atBats >= 50) {
      console.error(`${inningLabel}: 異常な打席数（${atBats}打席）。強制終了します。`);
      // ゲーム状態を正常化: アウトを3にしてベースをクリア
      gameState.outs = 3;
      gameState.bases = [false, false, false];
    }

    // イニング終了処理
    if (gameState.isTopInning) {
      gameState.isTopInning = false;
    } else {
      gameState.isTopInning = true;
      gameState.inning++;
    }

    // 先発ダメージポイントのイニングまたぎ回復（-10、最低0）
    ['home', 'away'].forEach(key => {
      if (!gameState.reliefTracking[key].currentRelieverId) {
        gameState.starterDamagePoints[key] = Math.max(0, gameState.starterDamagePoints[key] - 10);
      }
    });

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

          // このイニングで守備したかどうかを判定
          // ※ isTopInning は既に反転済み
          // 表終了後: isTopInning = false → home が守備していた
          // 裏終了後: isTopInning = true, inning++ → away が守備していた
          const defendedThisInning = (!gameState.isTopInning && teamKey === 'home') ||
                                     (gameState.isTopInning && teamKey === 'away');
          // 今イニングの失点数を計算
          const inningRunsAllowed = defendedThisInning
            ? (pitcherData.gameStats?.pitching?.runsAllowed || 0) - (gameState.inningStartRuns[teamKey] || 0)
            : 0;

          // AI監督: ロール別の投手交代判定（pitcherRoles対応）
          const staminaRate = pitcherData.currentStamina / pitcher.pitching.stamina;
          const rotation = TEAMS_DATA[teamName]?.pitchingRotation;
          const pitcherRoles = rotation?.pitcherRoles || {};
          const currentRole = pitcherRoles[pitcher.id] || '';
          let shouldChange = false;
          let situation = 'middle';
          let changeReason = '';

          // 球数制限チェック（先発投手用）
          const totalPitches = pitcherData.gameStats?.pitching?.pitches || 0;
          const isReliever = reliefTrack.currentRelieverId === pitcher.id;

          // リリーフ投手の役割完了チェック（登板制限を役割ベースに変更）
          if (isReliever && defendedThisInning) {
            const relieverRole = pitcherRoles[pitcher.id] || 'auto_r';
            const inningRuns = (pitcherData.gameStats?.pitching?.runsAllowed || 0) - (gameState.inningStartRuns[teamKey] || 0);

            if (relieverRole === 'onepoint') {
              // ワンポイント: 打っても抑えても必ず交代（イニング終了時のフォールバック）
              shouldChange = true;
              changeReason = `ワンポイント${pitcher.name}の仕事完了、交代`;
              situation = 'middle';
            } else if (relieverRole === 'setup' || relieverRole === 'ace_relief') {
              // セットアッパー/中継ぎエース: イニングを抑えたら交代、失点でも交代
              if (inningRuns > 0) {
                shouldChange = true;
                changeReason = `${relieverRole === 'setup' ? 'セットアッパー' : '中継ぎエース'}${pitcher.name}が失点、交代`;
                situation = 'middle';
              } else if (reliefTrack.relieverOutsPitched >= 3) {
                // 1イニング完了で交代（好投でも役割完了）
                shouldChange = true;
                changeReason = `${relieverRole === 'setup' ? 'セットアッパー' : '中継ぎエース'}${pitcher.name}が1イニング完了、交代`;
                situation = 'middle';
              }
            } else if (relieverRole === 'closer') {
              // クローザー: イニングを抑えたら交代、最大2イニング
              if (reliefTrack.relieverOutsPitched >= 6) {
                shouldChange = true;
                changeReason = `守護神${pitcher.name}が2イニング投球、交代`;
                situation = 'middle';
              }
            } else if (relieverRole === 'long' || relieverRole === 'mopup' || relieverRole === 'behind') {
              // ロング/敗戦処理/ビハインド: イニングイーター、多少の失点はOK
              const maxOuts = relieverRole === 'long' ? 9 : // ロング: 3イニング
                (reliefTrack.starterLeftInning || 9) <= 3 ? 12 : 6; // 早期降板なら4回、通常2回
              if (reliefTrack.relieverOutsPitched >= maxOuts) {
                const inningsStr = Math.floor(reliefTrack.relieverOutsPitched / 3);
                changeReason = `${pitcher.name}が登板制限(${inningsStr}回)に到達`;
                shouldChange = true;
                situation = 'middle';
              } else if (inningRuns >= 3) {
                // さすがに3失点以上は交代
                changeReason = `${pitcher.name}が${inningRuns}失点、交代`;
                shouldChange = true;
                situation = 'middle';
              }
            } else {
              // auto_r / 未設定: 従来どおりのアウト数制限
              const starterLeft = reliefTrack.starterLeftInning || 9;
              const maxOuts = starterLeft <= 3 ? 12 : 6;
              if (reliefTrack.relieverOutsPitched >= maxOuts) {
                const inningsStr = Math.floor(reliefTrack.relieverOutsPitched / 3);
                changeReason = `${pitcher.name}が登板制限(${inningsStr}回)に到達`;
                shouldChange = true;
                situation = 'middle';
              }
            }
          } else if (isReliever && !defendedThisInning) {
            // 守備していないイニングでもワンポイントのフォールバックチェック
            const relieverRole = pitcherRoles[pitcher.id] || 'auto_r';
            if (relieverRole === 'onepoint' && reliefTrack.relieverBattersFaced >= 1) {
              changeReason = `ワンポイント${pitcher.name}が1打者対戦済み、交代`;
              shouldChange = true;
              situation = 'middle';
            }
          }

          // === 新降板ルール: 3条件のいずれか1つで降板 ===
          // 条件1: 球数制限（ロール別）
          // 条件2: スタミナ25%以下
          // 条件3: ダメージポイント制（先発のみ）

          // --- 条件1: 球数制限（先発・リリーフ共通） ---
          if (!shouldChange) {
            const PITCH_LIMITS = {
              // 先発
              complete: 120, ace: 110, quality: 100, short: 65, auto_s: 100,
              // リリーフ
              closer: 40, setup: 35, ace_relief: 40, long: 60,
              onepoint: 15, behind: 50, mopup: 50, auto_r: 35
            };
            const pitchLimit = PITCH_LIMITS[currentRole] || (isReliever ? 35 : 100);
            if (totalPitches >= pitchLimit) {
              shouldChange = true;
              situation = Math.abs(scoreDiff) <= 2 ? 'hold' : 'middle';
              const roleLabel = {
                complete: '完投型', ace: 'ゲームメーカー', quality: '勝ち権利型',
                short: 'ショートスターター', closer: '守護神', setup: 'セットアッパー',
                ace_relief: '中継ぎエース', long: 'ロングリリーフ', onepoint: 'ワンポイント',
                behind: 'ビハインド', mopup: '敗戦処理'
              }[currentRole] || (isReliever ? 'リリーフ' : '先発');
              changeReason = `${roleLabel}${pitcher.name}が球数制限到達(${totalPitches}/${pitchLimit}球)`;
            }
          }

          // --- 条件2: スタミナ25%以下（先発・リリーフ共通） ---
          if (!shouldChange && staminaRate < 0.25) {
            shouldChange = true;
            situation = 'middle';
            changeReason = `${pitcher.name}のスタミナ限界(${Math.round(staminaRate * 100)}%)`;
          }

          // --- 条件3: ダメージポイント制（先発のみ） ---
          if (!shouldChange && !isReliever && defendedThisInning) {
            // イニング別閾値: 1回=45, 2回=40, ..., 9回=5
            const INNING_DAMAGE_THRESHOLDS = [45, 40, 35, 30, 25, 20, 15, 10, 5];
            const inningIdx = Math.min(gameState.inning - 1, 8); // 0-indexed, 延長は9回の閾値(5)を使用
            const threshold = INNING_DAMAGE_THRESHOLDS[inningIdx] || 5;
            const currentDamage = gameState.starterDamagePoints[teamKey];
            if (currentDamage >= threshold) {
              shouldChange = true;
              situation = Math.abs(scoreDiff) <= 2 ? 'hold' : 'middle';
              changeReason = `先発${pitcher.name}がダメージ蓄積で降板(DP:${currentDamage}/${threshold})`;
            }
          }
          // 9回、3点差以内のリード → クローザー
          if (!shouldChange && gameState.inning >= 9 && scoreDiff > 0 && scoreDiff <= 3) {
            const closerId = rotation?.closer;
            if (closerId && pitcher.id !== closerId) {
              shouldChange = true;
              situation = 'save';
              changeReason = `9回セーブ場面、守護神を投入`;
            }
          }
          // 8回で僅差リード → セットアッパー
          if (!shouldChange && gameState.inning === 8 && scoreDiff > 0 && Math.abs(scoreDiff) <= 2 && !isReliever) {
            shouldChange = true;
            situation = 'hold';
            changeReason = `8回僅差リード、セットアッパーへ`;
          }
          // 6回以降、大量リードで先発温存
          if (!shouldChange && !isReliever && gameState.inning >= 6 && Math.abs(scoreDiff) >= 5 && staminaRate < 0.50) {
            shouldChange = true;
            situation = scoreDiff < 0 ? 'behind' : 'middle';
            changeReason = scoreDiff >= 5 ? `大量リードで先発${pitcher.name}を温存` : `大量ビハインドで先発${pitcher.name}を温存`;
          }

          if (shouldChange) {
            let reliever = null;
            const fatigue = rotation?.reliefFatigue || {};
            let selectedRoleLabel = '';

            // 今試合で既に登板した投手のIDセット（再登板防止）
            const alreadyPitchedIds = new Set(
              gameState.pitcherAppearances[teamKey].map(a => a.id)
            );
            // 現在の投手も除外対象に追加
            alreadyPitchedIds.add(pitcher.id);
            // 選手が起用可能かチェック（未登板 & 疲労OK & 現在の投手でない）
            const isAvailable = (id) => !alreadyPitchedIds.has(id) && (fatigue[id] || 0) < 50;

            // セーブ場面: クローザー最優先（既にマウンドにいる場合は交代不要）
            if (situation === 'save' && rotation?.closer) {
              if (pitcher.id === rotation.closer) {
                shouldChange = false;
              } else {
                const closerData = team.players.find(p => p.id === rotation.closer && p.id !== pitcher.id);
                if (closerData && isAvailable(rotation.closer)) {
                  reliever = closerData;
                  selectedRoleLabel = '守護神';
                }
              }
            }

            // ホールド場面: セットアッパー優先
            if (shouldChange && !reliever && (situation === 'hold' || situation === 'save')) {
              for (const setupId of (rotation?.setupMen || [])) {
                const setupData = team.players.find(p => p.id === setupId);
                if (setupData && isAvailable(setupId)) {
                  reliever = setupData;
                  selectedRoleLabel = 'セットアッパー';
                  break;
                }
              }
            }

            // ビハインド場面: ビハインドロール優先
            if (shouldChange && !reliever && situation === 'behind') {
              const behindPitchers = (rotation?.middleRelievers || [])
                .filter(id => pitcherRoles[id] === 'behind' && isAvailable(id))
                .map(id => team.players.find(p => p.id === id))
                .filter(Boolean);
              if (behindPitchers.length > 0) {
                reliever = behindPitchers[0];
                selectedRoleLabel = 'ビハインド';
              }
            }

            // 大量リード: 敗戦処理ロール優先
            if (shouldChange && !reliever && scoreDiff >= 5) {
              const mopupPitchers = (rotation?.middleRelievers || [])
                .filter(id => pitcherRoles[id] === 'mopup' && isAvailable(id))
                .map(id => team.players.find(p => p.id === id))
                .filter(Boolean);
              if (mopupPitchers.length > 0) {
                reliever = mopupPitchers[0];
                selectedRoleLabel = '敗戦処理';
              }
            }

            // ショートスターター後: ロングリリーフ優先
            if (shouldChange && !reliever && currentRole === 'short') {
              const longRelievers = (rotation?.middleRelievers || [])
                .filter(id => pitcherRoles[id] === 'long' && isAvailable(id))
                .map(id => team.players.find(p => p.id === id))
                .filter(Boolean);
              if (longRelievers.length > 0) {
                reliever = longRelievers[0];
                selectedRoleLabel = 'ロングリリーフ';
              }
            }

            // 中継ぎエース→通常中継ぎ（疲労が少ない順、ロール別ラベル付き）
            // ワンポイント投手は左打者対策専用なので一般選択から除外
            if (shouldChange && !reliever) {
              const sortedMiddle = (rotation?.middleRelievers || [])
                .filter(id => {
                  const p = team.players.find(pl => pl.id === id);
                  return p && isAvailable(id) && pitcherRoles[id] !== 'onepoint';
                })
                .sort((a, b) => {
                  // 中継ぎエースを接戦時に優先
                  const aIsAce = pitcherRoles[a] === 'ace_relief' ? -1 : 0;
                  const bIsAce = pitcherRoles[b] === 'ace_relief' ? -1 : 0;
                  if (Math.abs(scoreDiff) <= 3) return aIsAce - bIsAce || (fatigue[a] || 0) - (fatigue[b] || 0);
                  return (fatigue[a] || 0) - (fatigue[b] || 0);
                });

              if (sortedMiddle.length > 0) {
                reliever = team.players.find(p => p.id === sortedMiddle[0]);
                const role = pitcherRoles[sortedMiddle[0]];
                selectedRoleLabel = role === 'long' ? 'ロングリリーフ' :
                                   role === 'ace_relief' ? '中継ぎエース' :
                                   role === 'mopup' ? '敗戦処理' :
                                   role === 'behind' ? 'ビハインド' : '中継ぎ';
              }
            }

            // フォールバック（先発ローテーション投手・登板済み投手は除外）
            if (shouldChange && !reliever) {
              const starterIds = new Set(rotation?.starters || []);
              reliever = team.players.find(p =>
                isPitcher(p) &&
                p.battingOrder === 0 &&
                !alreadyPitchedIds.has(p.id) &&
                !starterIds.has(p.id) &&
                (p.currentStamina || 80) > 40
              );
              if (reliever) selectedRoleLabel = '緊急中継ぎ';
              if (!reliever) {
                // 最終手段: 最もスタミナの残っている投手を選ぶ
                const allPitchers = team.players
                  .filter(p => isPitcher(p) && p.battingOrder === 0 && p.id !== pitcher.id)
                  .sort((a, b) => (b.currentStamina || 0) - (a.currentStamina || 0));
                if (allPitchers.length > 0) {
                  reliever = allPitchers[0];
                  selectedRoleLabel = '緊急登板';
                }
              }
            }

            if (reliever) {

              // 投手交代記録を保存
              gameState.pitcherChanges.push({
                inning: gameState.inning,
                isTop: gameState.isTopInning,
                team: teamName,
                out: pitcher.name,
                in: reliever.name,
                role: selectedRoleLabel,
                reason: changeReason
              });

              if (!reliefTrack.starterLeftInning) {
                reliefTrack.starterLeftInning = gameState.inning;
              }

              // 登板記録を追加（セーブ・ホールド判定用）
              const teamKey = team === gameState.homeTeam ? 'home' : 'away';
              const appearances = gameState.pitcherAppearances[teamKey];
              appearances.push({
                id: reliever.id,
                entryInning: gameState.inning,
                entryIsTop: gameState.isTopInning,
                entryScore: { ...gameState.score },
                isStarter: false
              });

              const relieverData = team.players.find(p => p.id === reliever.id);
              const relieverOldOrder2 = relieverData.battingOrder;
              const relieverOldPos2 = relieverData.position;
              const isTwoWaySwap2 = relieverOldOrder2 > 0 && relieverOldOrder2 < 9;

              pitcherData.battingOrder = 0;
              pitcherData.position = 'pitcher';

              relieverData.battingOrder = useDH ? 0 : 9;
              relieverData.position = 'pitcher';
              relieverData.currentStamina = relieverData.pitching?.stamina || 80;

              if (isTwoWaySwap2 && relieverOldPos2) {
                const benchFielders2 = team.players.filter(p =>
                  p.battingOrder === 0 && !isPitcher(p) && p.id !== relieverData.id
                );
                if (benchFielders2.length > 0) {
                  benchFielders2.sort((a, b) =>
                    (b.positionFitness?.[relieverOldPos2] || 0) - (a.positionFitness?.[relieverOldPos2] || 0)
                  );
                  benchFielders2[0].battingOrder = relieverOldOrder2;
                  benchFielders2[0].position = relieverOldPos2;
                }
              }

              reliefTrack.currentRelieverId = reliever.id;
              reliefTrack.relieverOutsPitched = 0;
              reliefTrack.relieverBattersFaced = 0;
      reliefTrack.relieverInningRuns = 0;

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


  // 試合終了後、選手のシーズン成績と通算成績を更新
  const updatePlayerSeasonStats = (team, isWinner) => {
    // 先発投手のIDを特定（pitcherAppearancesはリリーフ投手のみ記録されるため、
    // リリーフリストに含まれない＆投球イニングがある投手＝先発投手）
    const teamKey = team === gameState.homeTeam ? 'home' : 'away';
    const reliefIds = new Set(gameState.pitcherAppearances[teamKey].map(a => a.id));

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

        season.games++;
        season.atBats += b.atBats;
        season.hits += b.hits;
        season.doubles = (season.doubles || 0) + (b.doubles || 0);
        season.triples = (season.triples || 0) + (b.triples || 0);
        season.homeruns += b.homeruns;
        season.rbis += b.rbis;
        season.walks += b.walks;
        season.strikeouts += b.strikeouts;
        season.stolenBases = (season.stolenBases || 0) + (b.stolenBases || 0);

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

        // 野手疲労蓄積: スタメン出場(3打席以上)のみ疲労が溜まる
        // 代打(1-2打席)や守備固めは疲労なし
        if (b.atBats >= 3) {
          const bodyStamina = playerData.physical?.bodyStamina || 50;
          // 基礎疲労 7〜15（体力100→7, 体力1→15）
          const baseFatigue = Math.round(15 - (bodyStamina / 100) * 8);
          // 試合日は回復を相殺（progressDateで先に回復が適用されているため）
          // これにより試合出場日は回復せず、休養日のみ回復する
          const recoveryAbility = playerData.physical?.recovery || 50;
          const recoveryMult = 0.7 + (recoveryAbility / 100) * 0.6;
          const recovCancelled = Math.round(POSITION_PLAYER_RECOVERY_BASE * recoveryMult);
          playerData.fatigue = (playerData.fatigue || 0) + baseFatigue + recovCancelled;
        }

        // 成長率変動: 10試合出場ごとに+0.01、疲労50超で出場なら-0.01
        if ((playerData.fatigue || 0) > 50) {
          playerData.growthModifier = Math.round(((playerData.growthModifier || 0) - 0.01) * 100) / 100;
        }
        if (season.games % 10 === 0) {
          playerData.growthModifier = Math.round(((playerData.growthModifier || 0) + 0.01) * 100) / 100;
        }
      }

      // 投手成績の集計
      if (player.gameStats.pitching.outs > 0) {
        const p = player.gameStats.pitching;
        const season = playerData.seasonStats.pitching;

        season.games++;
        season.inningsPitched += p.outs;
        season.runsAllowed += p.runsAllowed;
        season.earnedRuns += p.runsAllowed; // 簡易版：全て自責点とする
        season.hits = (season.hits || 0) + (p.hits || 0);
        season.homeruns = (season.homeruns || 0) + (p.homeruns || 0);
        season.strikeouts += p.strikeouts;
        season.walks += p.walks;
        season.pitches += p.pitches;

        // 成長率変動: 疲労50超で登板なら-0.01
        if ((playerData.fatigue || 0) > 50) {
          playerData.growthModifier = Math.round(((playerData.growthModifier || 0) - 0.01) * 100) / 100;
        }

        // 疲労度を蓄積（先発は球数/2、リリーフは球数/3で蓄積）
        const isStarterPitcher = p.outs >= 15; // 5回以上投げたら先発扱い
        const fatigueGain = isStarterPitcher ? Math.floor(p.pitches / 2) : Math.floor(p.pitches / 3);
        playerData.fatigue = (playerData.fatigue || 0) + fatigueGain;

        // 成長率変動: 通算投球回が5イニング(15アウト)の倍数になったら+0.01
        const prevTotalOuts = season.inningsPitched - p.outs;
        if (Math.floor(season.inningsPitched / 15) > Math.floor(prevTotalOuts / 15)) {
          playerData.growthModifier = Math.round(((playerData.growthModifier || 0) + 0.01) * 100) / 100;
        }

        // 経験値蓄積（登板1 + 投球回数）
        const inningsPitched = Math.floor(p.outs / 3);
        const expGained = 1 + inningsPitched;
        playerData.experience = (playerData.experience || 0) + expGained;

        // QS/HQS判定（先発投手のみ: pitcherAppearancesに含まれない投手＝先発）
        // 注: 試合中にリリーフ登板すると先発投手のbattingOrderは0に書き換えられるため、
        // battingOrderでは判定できない
        const wasStarter = !reliefIds.has(player.id);
        if (wasStarter) {
          const innings = p.outs; // アウト数（18アウト = 6回）
          const earnedRuns = p.runsAllowed; // 簡易版：全て自責点
          // QS: 6回以上 && 自責点3以下
          if (innings >= 18 && earnedRuns <= 3) {
            season.qualityStarts = (season.qualityStarts || 0) + 1;
          }
          // HQS: 7回以上 && 自責点2以下
          if (innings >= 21 && earnedRuns <= 2) {
            season.highQualityStarts = (season.highQualityStarts || 0) + 1;
          }
        }

        // 勝敗はDateProgressScreen.determinePitcherDecisionsで正式判定・記録する
        // ここでは二重計上を防ぐため記録しない
      }

      // 守備成績の集計
      if (player.gameStats.fielding) {
        const f = player.gameStats.fielding;
        if (f.chances > 0 || f.errors > 0) {
          const season = playerData.seasonStats.batting;
          season.fieldingChances = (season.fieldingChances || 0) + f.chances;
          season.errors = (season.errors || 0) + f.errors;
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
    awayTeam: gameState.awayTeam,
    pitcherChanges: gameState.pitcherChanges
  };
};

// その日の全試合を自動実行
export const autoSimulateDailyGames = (currentDate, allGames, setAllGames, setCalendar, setLeagueStandings) => {
  const currentDateStr = `${currentDate.month}/${currentDate.day}`;
  const todaysGames = allGames[currentDateStr];

  if (!todaysGames || todaysGames.length === 0) {
    return; // 試合がない日
  }


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
        homeTeam.gamesPlayed = (homeTeam.gamesPlayed || 0) + 1;
        awayTeam.gamesPlayed = (awayTeam.gamesPlayed || 0) + 1;
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
