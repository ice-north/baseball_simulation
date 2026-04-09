// ========================================================================
// aiManager.js - 監督AI（自動投手交代・代打・守備固め・盗塁判定・投手起用最適化）
// Extracted from App.jsx AI_MANAGER section (L594-1205)
// ========================================================================

import { TEAMS_DATA } from '../teams-data.js';
import { calculateDefensiveFitness } from '../simulation-logic.js';

/**
 * autoSubstitutePitcher - 監督AI：自動投手交代ロジック（Phase 3: ロールベース状況判断版）
 *
 * ctx に必要なプロパティ:
 *   autoManagerMode, gameStarted, isSubstituting,
 *   getDefenseTeam, getCurrentPitcher,
 *   isTopInning, setHomeTeam, setAwayTeam,
 *   homeTeam, awayTeam, currentStamina, score, bases, inning,
 *   setCurrentStamina, setGameLog
 */
export function executeAutoSubstitutePitcher(ctx) {
  const {
    autoManagerMode, gameStarted, isSubstituting,
    getDefenseTeam, getCurrentPitcher,
    isTopInning, setHomeTeam, setAwayTeam,
    homeTeam, awayTeam, currentStamina, score, bases, inning,
    setCurrentStamina, setGameLog
  } = ctx;

  if (!autoManagerMode || !gameStarted) return;
  if (isSubstituting.current) return;

  const defenseTeam = getDefenseTeam();
  const currentPitcher = getCurrentPitcher();
  if (!currentPitcher || !currentPitcher.pitching) return;

  const teamType = isTopInning ? 'home' : 'away';
  const setTeam = isTopInning ? setHomeTeam : setAwayTeam;
  const teamName = isTopInning ? homeTeam.name : awayTeam.name;

  // TEAMS_DATAから投手ロール情報を取得
  const rotation = TEAMS_DATA[teamName]?.pitchingRotation;
  const pitcherRoles = rotation?.pitcherRoles || {};
  const fatigue = rotation?.reliefFatigue || {};
  const currentRole = pitcherRoles[currentPitcher.id] || 'auto_s';

  // 状況分析
  const staminaRate = currentStamina / currentPitcher.pitching.stamina;
  const myScore = isTopInning ? score.home : score.away;
  const oppScore = isTopInning ? score.away : score.home;
  const scoreDiff = myScore - oppScore;
  const isCloseGame = Math.abs(scoreDiff) <= 3;
  const runnersOnBase = bases.filter(b => b).length;
  const isScoringSituation = bases[1] || bases[2];

  // 先発ロール別のイニング上限・スタミナ閾値
  const isStarter = ['ace', 'complete', 'short', 'quality', 'auto_s'].includes(currentRole);
  let shouldSubstitute = false;
  let reason = '';

  if (isStarter) {
    if (currentRole === 'ace') {
      if (inning >= 9 && scoreDiff > 0 && scoreDiff <= 3) {
        shouldSubstitute = true;
        reason = `エース${currentPitcher.name}が8回を投げ切り、守護神へリレー`;
      } else if (inning >= 9 && staminaRate < 0.35) {
        shouldSubstitute = true;
        reason = `エース${currentPitcher.name}が8回投球後スタミナ低下(${Math.round(staminaRate * 100)}%)`;
      } else if (staminaRate <= 0.30) {
        shouldSubstitute = true;
        reason = `エース${currentPitcher.name}のスタミナ限界(${Math.round(staminaRate * 100)}%)`;
      }
    } else if (currentRole === 'complete') {
      if (staminaRate <= 0.25) {
        shouldSubstitute = true;
        reason = `完投型${currentPitcher.name}のスタミナ限界(${Math.round(staminaRate * 100)}%)`;
      } else if (isScoringSituation && isCloseGame && staminaRate < 0.35) {
        shouldSubstitute = true;
        reason = `接戦ピンチ場面でスタミナ低下(${Math.round(staminaRate * 100)}%)`;
      }
    } else if (currentRole === 'short') {
      if (inning >= 4 && staminaRate < 0.50) {
        shouldSubstitute = true;
        reason = `ショートスターター${currentPitcher.name}の予定投球回到達`;
      } else if (staminaRate <= 0.30) {
        shouldSubstitute = true;
        reason = `スタミナ限界(${Math.round(staminaRate * 100)}%)`;
      }
    } else if (currentRole === 'quality') {
      if (inning >= 6 && staminaRate < 0.45) {
        shouldSubstitute = true;
        reason = `勝ち権利獲得、${currentPitcher.name}を温存`;
      } else if (inning >= 7) {
        shouldSubstitute = true;
        reason = `${currentPitcher.name}が${inning - 1}回を投げ切り交代`;
      } else if (staminaRate <= 0.30) {
        shouldSubstitute = true;
        reason = `スタミナ限界(${Math.round(staminaRate * 100)}%)`;
      }
    } else {
      // auto_s: 汎用先発
      if (inning >= 8) {
        shouldSubstitute = true;
        reason = `${currentPitcher.name}が7回を投げ切り継投へ`;
      } else if (inning >= 5 && staminaRate < 0.40) {
        shouldSubstitute = true;
        reason = `スタミナ低下(${Math.round(staminaRate * 100)}%)で早めの継投`;
      } else if (isCloseGame && inning >= 7 && staminaRate < 0.50) {
        shouldSubstitute = true;
        reason = `接戦終盤でリリーフへ切り替え`;
      } else if (staminaRate <= 0.25) {
        shouldSubstitute = true;
        reason = `スタミナ限界(${Math.round(staminaRate * 100)}%)`;
      }
    }
  } else {
    // リリーフ投手のスタミナ切れ
    if (staminaRate <= 0.30) {
      shouldSubstitute = true;
      reason = `${currentPitcher.name}のスタミナ限界(${Math.round(staminaRate * 100)}%)`;
    } else if (isScoringSituation && staminaRate < 0.40) {
      shouldSubstitute = true;
      reason = `得点圏ピンチでリリーフ交代`;
    }
  }

  // セーブ場面: 9回リード時にクローザーでなければ交代
  if (!shouldSubstitute && inning >= 9 && scoreDiff > 0 && scoreDiff <= 3) {
    const closerId = rotation?.closer;
    if (closerId && currentPitcher.id !== closerId) {
      const closerPlayer = defenseTeam.players.find(p => p.id === closerId && !p.hasSubbedOut);
      if (closerPlayer && (fatigue[closerId] || 0) < 50) {
        shouldSubstitute = true;
        reason = `9回セーブ場面、守護神${closerPlayer.name}を投入`;
      }
    }
  }

  // 8回僅差: セットアッパーでなければ交代
  if (!shouldSubstitute && inning === 8 && isCloseGame && scoreDiff > 0 && isStarter) {
    shouldSubstitute = true;
    reason = `8回僅差リード、セットアッパーへ切り替え`;
  }

  if (!shouldSubstitute) return;

  // ロールベースの投手選択
  const availablePitchers = defenseTeam.players.filter(p =>
    !p.isStarter && p.position === 'pitcher' && !p.hasSubbedOut
  );
  if (availablePitchers.length === 0) return;

  let selectedPitcher = null;
  let roleLabel = '';

  // 状況に応じた投手選択
  const situation = (inning >= 9 && scoreDiff > 0 && scoreDiff <= 3) ? 'save'
    : (inning >= 7 && isCloseGame && scoreDiff > 0) ? 'hold'
    : (scoreDiff < -4) ? 'mopup'
    : (scoreDiff < 0) ? 'behind'
    : 'middle';

  if (situation === 'save' && rotation?.closer) {
    const closer = availablePitchers.find(p => p.id === rotation.closer && (fatigue[rotation.closer] || 0) < 50);
    if (closer) { selectedPitcher = closer; roleLabel = '守護神'; }
  }

  if (!selectedPitcher && (situation === 'hold' || situation === 'save')) {
    for (const setupId of (rotation?.setupMen || [])) {
      const setup = availablePitchers.find(p => p.id === setupId && (fatigue[setupId] || 0) < 50);
      if (setup) { selectedPitcher = setup; roleLabel = 'セットアッパー'; break; }
    }
  }

  if (!selectedPitcher && situation === 'mopup') {
    const mopupPitcher = availablePitchers.find(p => pitcherRoles[p.id] === 'mopup' && (fatigue[p.id] || 0) < 50);
    if (mopupPitcher) { selectedPitcher = mopupPitcher; roleLabel = '敗戦処理'; }
  }

  if (!selectedPitcher && situation === 'behind') {
    const behindPitcher = availablePitchers.find(p => pitcherRoles[p.id] === 'behind' && (fatigue[p.id] || 0) < 50);
    if (behindPitcher) { selectedPitcher = behindPitcher; roleLabel = 'ビハインド'; }
  }

  if (!selectedPitcher) {
    const middleIds = rotation?.middleRelievers || [];
    const sortedMiddle = middleIds
      .filter(id => availablePitchers.some(p => p.id === id) && (fatigue[id] || 0) < 50)
      .sort((a, b) => (fatigue[a] || 0) - (fatigue[b] || 0));
    if (sortedMiddle.length > 0) {
      selectedPitcher = availablePitchers.find(p => p.id === sortedMiddle[0]);
      const role = pitcherRoles[selectedPitcher.id];
      roleLabel = role === 'long' ? 'ロングリリーフ' :
                  role === 'ace_relief' ? '中継ぎエース' :
                  role === 'onepoint' ? 'ワンポイント' : '中継ぎ';
    }
  }

  if (!selectedPitcher) {
    selectedPitcher = availablePitchers.sort((a, b) => (fatigue[a.id] || 0) - (fatigue[b.id] || 0))[0];
    roleLabel = '緊急登板';
  }

  if (!selectedPitcher) return;

  isSubstituting.current = true;

  setTeam(prev => {
    const players = [...prev.players];
    const oldPitcher = players.find(p => p.id === currentPitcher.id);
    const newPitcher = players.find(p => p.id === selectedPitcher.id);

    if (oldPitcher && newPitcher) {
      oldPitcher.isStarter = false;
      oldPitcher.hasSubbedOut = true;
      oldPitcher.battingOrder = 0;

      newPitcher.isStarter = true;
      newPitcher.battingOrder = currentPitcher.battingOrder;
      newPitcher.position = 'pitcher';

      setTimeout(() => {
        const maxSt = newPitcher.pitching.stamina;
        const fat = newPitcher.fatigue || 0;
        setCurrentStamina(Math.max(Math.floor(maxSt * 0.5), maxSt - fat));
      }, 0);

      setGameLog(prev => {
        const teamLabel = teamType === 'home' ? 'ホーム' : 'アウェイ';
        const updated = [...prev, {
          description: `⚾ [${inning}回${isTopInning ? '裏' : '表'}] ${teamLabel}: 投手交代 ${oldPitcher.name} → ${newPitcher.name}（${roleLabel}）【${reason}】`,
          isSpecial: true
        }];
        return updated.length > 50 ? updated.slice(-50) : updated;
      });

      if (TEAMS_DATA[teamName]?.pitchingRotation?.reliefFatigue) {
        TEAMS_DATA[teamName].pitchingRotation.reliefFatigue[selectedPitcher.id] =
          (TEAMS_DATA[teamName].pitchingRotation.reliefFatigue[selectedPitcher.id] || 0) + 30;
      }
    }

    return { ...prev, players };
  });

  setTimeout(() => {
    isSubstituting.current = false;
  }, 100);
}

/**
 * autoSubstitutePinchHitter - 監督AI：代打ロジック（Phase 3: 状況判断・打撃力比較版）
 */
export function executeAutoSubstitutePinchHitter(ctx) {
  const {
    autoManagerMode, gameStarted, isSubstituting,
    getOffenseTeam, getCurrentBatter,
    isTopInning, setAwayTeam, setHomeTeam,
    score, bases, inning, setGameLog
  } = ctx;

  if (!autoManagerMode || !gameStarted) return;
  if (isSubstituting.current) return;

  const offenseTeam = getOffenseTeam();
  const currentBatter = getCurrentBatter();
  const teamType = isTopInning ? 'away' : 'home';
  const setTeam = isTopInning ? setAwayTeam : setHomeTeam;

  if (currentBatter.position === 'pitcher') return;

  const availablePinchHitters = offenseTeam.players.filter(p =>
    !p.isStarter && p.position !== 'pitcher' && !p.hasSubbedOut
  );
  if (availablePinchHitters.length === 0) return;

  const batterTotal = (currentBatter.batting?.meet || 0) + (currentBatter.batting?.power || 0);
  const bestPH = availablePinchHitters.reduce((best, p) => {
    const total = (p.batting?.meet || 0) + (p.batting?.power || 0);
    const bestTotal = (best.batting?.meet || 0) + (best.batting?.power || 0);
    return total > bestTotal ? p : best;
  }, availablePinchHitters[0]);
  const bestPHTotal = (bestPH.batting?.meet || 0) + (bestPH.batting?.power || 0);

  const myScore = isTopInning ? score.away : score.home;
  const oppScore = isTopInning ? score.home : score.away;
  const scoreDiff = myScore - oppScore;
  const isCloseGame = Math.abs(scoreDiff) <= 3;
  const runnersOnBase = bases.filter(b => b).length;
  const isScoringSituation = bases[1] || bases[2];

  let shouldPinchHit = false;
  let reason = '';

  if (inning >= 7 && isScoringSituation && bestPHTotal > batterTotal + 10) {
    shouldPinchHit = true;
    reason = `チャンス場面で打撃力の高い${bestPH.name}を起用`;
  } else if (inning >= 8 && scoreDiff < 0 && currentBatter.battingOrder >= 6 && bestPHTotal > batterTotal + 5) {
    shouldPinchHit = true;
    reason = `ビハインド終盤、打力アップのため${bestPH.name}を起用`;
  } else if (inning >= 9 && isCloseGame && runnersOnBase > 0 && bestPHTotal > batterTotal + 3) {
    shouldPinchHit = true;
    reason = `最終回の勝負所、${bestPH.name}に託す`;
  } else if (inning >= 7 && isCloseGame && runnersOnBase >= 2 && bestPHTotal > batterTotal) {
    shouldPinchHit = true;
    reason = `接戦の大チャンス、${bestPH.name}を代打に`;
  }

  if (!shouldPinchHit) return;

  isSubstituting.current = true;

  setTeam(prev => {
    const players = [...prev.players];
    const oldBatter = players.find(p => p.id === currentBatter.id);
    const newBatter = players.find(p => p.id === bestPH.id);

    if (oldBatter && newBatter) {
      oldBatter.isStarter = false;
      oldBatter.hasSubbedOut = true;
      oldBatter.battingOrder = 0;

      newBatter.isStarter = true;
      newBatter.battingOrder = currentBatter.battingOrder;
      newBatter.position = currentBatter.position;

      setGameLog(prev => {
        const teamLabel = teamType === 'home' ? 'ホーム' : 'アウェイ';
        const updated = [...prev, {
          description: `🏏 [${inning}回${isTopInning ? '表' : '裏'}] ${teamLabel}: 代打 ${newBatter.name}←${oldBatter.name}【${reason}】`,
          isSpecial: true
        }];
        return updated.length > 50 ? updated.slice(-50) : updated;
      });
    }

    return { ...prev, players };
  });

  setTimeout(() => {
    isSubstituting.current = false;
  }, 100);
}

/**
 * autoDefensiveSubstitution - 監督AI：守備固めロジック（Phase 2）
 */
export function executeAutoDefensiveSubstitution(ctx) {
  const {
    autoManagerMode, gameStarted, isSubstituting,
    getDefenseTeam, isTopInning, setHomeTeam, setAwayTeam,
    score, inning, setGameLog
  } = ctx;

  if (!autoManagerMode || !gameStarted) return;
  if (isSubstituting.current) return;
  if (inning < 7) return;

  const defenseTeam = getDefenseTeam();
  const teamType = isTopInning ? 'home' : 'away';
  const setTeam = isTopInning ? setHomeTeam : setAwayTeam;

  const isLeading = isTopInning
    ? score.home > score.away
    : score.away > score.home;

  if (!isLeading) return;

  const availableDefenders = defenseTeam.players.filter(p =>
    !p.isStarter &&
    p.position !== 'pitcher' &&
    !p.hasSubbedOut &&
    p.name.includes('守備固め')
  );

  if (availableDefenders.length === 0) return;

  const starterFielders = defenseTeam.players.filter(p =>
    p.isStarter &&
    p.position !== 'pitcher' &&
    p.position !== 'catcher'
  );

  for (const starter of starterFielders) {
    const fitness = calculateDefensiveFitness(starter, starter.position);

    if (fitness.grade === 'C' || fitness.grade === 'D') {
      const defender = availableDefenders[0];

      if (defender) {
        isSubstituting.current = true;

        setTeam(prev => {
          const players = [...prev.players];
          const oldPlayer = players.find(p => p.id === starter.id);
          const newPlayer = players.find(p => p.id === defender.id);

          if (oldPlayer && newPlayer) {
            oldPlayer.isStarter = false;
            oldPlayer.hasSubbedOut = true;
            oldPlayer.battingOrder = 0;

            newPlayer.isStarter = true;
            newPlayer.battingOrder = starter.battingOrder;
            newPlayer.position = starter.position;

            setGameLog(prev => {
              const teamName = teamType === 'home' ? 'ホーム' : 'アウェイ';
              const updated = [...prev, {
                description: `🛡️ [${inning}回${isTopInning ? '裏' : '表'}] ${teamName}: 守備固め ${newPlayer.name} (${oldPlayer.name} → 交代)`,
                isSpecial: true
              }];
              return updated.length > 50 ? updated.slice(-50) : updated;
            });
          }

          return { ...prev, players };
        });

        setTimeout(() => {
          isSubstituting.current = false;
        }, 100);

        break;
      }
    }
  }
}

/**
 * autoStealingDecision - 監督AI：盗塁判断ロジック（Phase 3）
 */
export function executeAutoStealingDecision(ctx, runner, situation) {
  const { autoManagerMode, gameStarted, inning } = ctx;

  if (!autoManagerMode || !gameStarted) return 1.0;

  const { scoreDiff, isCloseGame, outs, batterType, runnerSteal } = situation;

  let stealMultiplier = 1.0;

  if (isCloseGame) {
    stealMultiplier *= 1.3;
  } else if (scoreDiff >= 4) {
    stealMultiplier *= 0.5;
  }

  if (outs === 0) {
    stealMultiplier *= 1.2;
  } else if (outs === 2) {
    stealMultiplier *= 0.6;
  }

  if (batterType === 'pitcher' || batterType === 'weak') {
    stealMultiplier *= 1.5;
  } else if (batterType === 'strong') {
    stealMultiplier *= 0.4;
  }

  if (runnerSteal >= 70) {
    stealMultiplier *= 1.4;
  } else if (runnerSteal < 40) {
    stealMultiplier *= 0.3;
  }

  if (inning >= 7 && isCloseGame) {
    stealMultiplier *= 1.3;
  }

  return stealMultiplier;
}

/**
 * autoOptimizePitcherUsage - 監督AI：投手起用最適化（Phase 3）
 */
export function executeAutoOptimizePitcherUsage(ctx) {
  const {
    autoManagerMode, gameStarted, isSubstituting,
    getDefenseTeam, getCurrentPitcher,
    isTopInning, setHomeTeam, setAwayTeam,
    score, inning, setCurrentStamina, setGameLog
  } = ctx;

  if (!autoManagerMode || !gameStarted) return;
  if (isSubstituting.current) return;
  if (inning < 7) return;

  const defenseTeam = getDefenseTeam();
  const currentPitcher = getCurrentPitcher();

  if (!currentPitcher || !currentPitcher.pitching) return;

  const teamType = isTopInning ? 'home' : 'away';
  const setTeam = isTopInning ? setHomeTeam : setAwayTeam;

  const isLeading = isTopInning
    ? score.home > score.away
    : score.away > score.home;
  const scoreDiff = Math.abs(score.home - score.away);
  const isCloseGame = scoreDiff <= 2;

  const isCloser = currentPitcher.name.includes('抑え') || currentPitcher.name.includes('クローザー');
  const isSetup = currentPitcher.name.includes('セットアッパー') || currentPitcher.name.includes('8回');

  const isNinthInning = (inning === 9 && isTopInning) || (inning === 9 && !isTopInning);
  const isEighthInning = (inning === 8 && isTopInning) || (inning === 8 && !isTopInning);

  if (isNinthInning && isLeading && scoreDiff <= 3 && !isCloser) {
    const closerPitcher = defenseTeam.players.find(p =>
      p.position === 'pitcher' &&
      !p.hasSubbedOut &&
      !p.isStarter &&
      (p.name.includes('抑え') || p.name.includes('クローザー'))
    );

    if (closerPitcher) {
      isSubstituting.current = true;

      setTeam(prev => {
        const players = [...prev.players];
        const oldPitcher = players.find(p => p.id === currentPitcher.id);
        const newPitcher = players.find(p => p.id === closerPitcher.id);

        if (oldPitcher && newPitcher) {
          oldPitcher.isStarter = false;
          oldPitcher.hasSubbedOut = true;
          oldPitcher.battingOrder = 0;

          newPitcher.isStarter = true;
          newPitcher.hasSubbedOut = false;
          newPitcher.battingOrder = currentPitcher.battingOrder;
          newPitcher.position = 'pitcher';

          {
            const maxSt = newPitcher.pitching.stamina;
            const fat = newPitcher.fatigue || 0;
            setCurrentStamina(Math.max(Math.floor(maxSt * 0.5), maxSt - fat));
          }

          setGameLog(prev => {
            const teamName = teamType === 'home' ? 'ホーム' : 'アウェイ';
            const updated = [...prev, {
              description: `⚾ [${inning}回${isTopInning ? '裏' : '表'}] ${teamName}: 抑え投手起用 ${oldPitcher.name} → ${newPitcher.name}`,
              isSpecial: true
            }];
            return updated.length > 50 ? updated.slice(-50) : updated;
          });
        }

        return { ...prev, players };
      });

      setTimeout(() => {
        isSubstituting.current = false;
      }, 100);
    }
  }

  if (isEighthInning && isLeading && scoreDiff <= 3 && !isSetup && !isCloser) {
    const setupPitcher = defenseTeam.players.find(p =>
      p.position === 'pitcher' &&
      !p.hasSubbedOut &&
      !p.isStarter &&
      (p.name.includes('セットアッパー') || p.name.includes('8回'))
    );

    if (setupPitcher) {
      isSubstituting.current = true;

      setTeam(prev => {
        const players = [...prev.players];
        const oldPitcher = players.find(p => p.id === currentPitcher.id);
        const newPitcher = players.find(p => p.id === setupPitcher.id);

        if (oldPitcher && newPitcher) {
          oldPitcher.isStarter = false;
          oldPitcher.hasSubbedOut = true;
          oldPitcher.battingOrder = 0;

          newPitcher.isStarter = true;
          newPitcher.hasSubbedOut = false;
          newPitcher.battingOrder = currentPitcher.battingOrder;
          newPitcher.position = 'pitcher';

          {
            const maxSt = newPitcher.pitching.stamina;
            const fat = newPitcher.fatigue || 0;
            setCurrentStamina(Math.max(Math.floor(maxSt * 0.5), maxSt - fat));
          }

          setGameLog(prev => {
            const teamName = teamType === 'home' ? 'ホーム' : 'アウェイ';
            const updated = [...prev, {
              description: `⚾ [${inning}回${isTopInning ? '裏' : '表'}] ${teamName}: セットアッパー起用 ${oldPitcher.name} → ${newPitcher.name}`,
              isSpecial: true
            }];
            return updated.length > 50 ? updated.slice(-50) : updated;
          });
        }

        return { ...prev, players };
      });

      setTimeout(() => {
        isSubstituting.current = false;
      }, 100);
    }
  }
}
