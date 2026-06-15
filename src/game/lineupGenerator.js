import { TEAMS_DATA, LEAGUE_SETTINGS } from '../teams-data.js';

// ポジション別の攻守バランス重み
// 守備負担が大きいポジションほどdefenseWeight高、打撃依存ポジションほどoffenseWeight高
const POSITION_WEIGHTS = {
  standard: {
    catcher:  { offenseWeight: 0.35, defenseWeight: 0.65 },
    short:    { offenseWeight: 0.40, defenseWeight: 0.60 },
    center:   { offenseWeight: 0.45, defenseWeight: 0.55 },
    second:   { offenseWeight: 0.45, defenseWeight: 0.55 },
    third:    { offenseWeight: 0.55, defenseWeight: 0.45 },
    right:    { offenseWeight: 0.60, defenseWeight: 0.40 },
    left:     { offenseWeight: 0.65, defenseWeight: 0.35 },
    first:    { offenseWeight: 0.75, defenseWeight: 0.25 },
    dh:       { offenseWeight: 1.00, defenseWeight: 0.00 },
  },
  offense: {
    catcher:  { offenseWeight: 0.55, defenseWeight: 0.45 },
    short:    { offenseWeight: 0.60, defenseWeight: 0.40 },
    center:   { offenseWeight: 0.65, defenseWeight: 0.35 },
    second:   { offenseWeight: 0.65, defenseWeight: 0.35 },
    third:    { offenseWeight: 0.75, defenseWeight: 0.25 },
    right:    { offenseWeight: 0.80, defenseWeight: 0.20 },
    left:     { offenseWeight: 0.85, defenseWeight: 0.15 },
    first:    { offenseWeight: 0.90, defenseWeight: 0.10 },
    dh:       { offenseWeight: 1.00, defenseWeight: 0.00 },
  },
  defense: {
    catcher:  { offenseWeight: 0.20, defenseWeight: 0.80 },
    short:    { offenseWeight: 0.25, defenseWeight: 0.75 },
    center:   { offenseWeight: 0.30, defenseWeight: 0.70 },
    second:   { offenseWeight: 0.30, defenseWeight: 0.70 },
    third:    { offenseWeight: 0.35, defenseWeight: 0.65 },
    right:    { offenseWeight: 0.40, defenseWeight: 0.60 },
    left:     { offenseWeight: 0.45, defenseWeight: 0.55 },
    first:    { offenseWeight: 0.55, defenseWeight: 0.45 },
    dh:       { offenseWeight: 1.00, defenseWeight: 0.00 },
  },
};

// 打撃力スコア（チーム攻撃力の源泉）
const calcOffenseScore = (player) => {
  const b = player.batting || {};
  const ph = player.physical || {};
  // パワーを最重視、ミート・選球眼も重要、走力は加点要素
  return (b.meet || 0) * 1.0 +
         (b.power || 0) * 1.3 +
         (b.eye || 0) * 0.7 +
         (ph.speed || 0) * 0.3;
};

// 守備力スコア（ポジション別）
const calcDefenseScore = (player, position) => {
  const f = player.fielding || {};
  const ph = player.physical || {};
  const fitness = player.positionFitness?.[position] || 0;
  // 適性が低いとペナルティ: fitnessMult = 0.5 + (fitness/100)*0.5
  const fitnessMult = 0.5 + (fitness / 100) * 0.5;

  let baseDefense;
  if (position === 'catcher') {
    baseDefense = (f.defense || 0) * 0.5 + (player.catching?.lead || 0) * 0.5;
  } else if (position === 'center' || position === 'left' || position === 'right') {
    baseDefense = (f.defense || 0) * 0.5 + (ph.speed || 0) * 0.3 + (ph.arm || 0) * 0.2;
  } else if (position === 'short' || position === 'second') {
    baseDefense = (f.defense || 0) * 0.6 + (ph.speed || 0) * 0.25 + (ph.arm || 0) * 0.15;
  } else {
    baseDefense = (f.defense || 0) * 0.6 + (ph.arm || 0) * 0.25 + (ph.speed || 0) * 0.15;
  }

  return baseDefense * fitnessMult;
};

// ポジションでの総合価値（チーム貢献度）
const calcPositionValue = (player, position, mode = 'standard') => {
  const weights = POSITION_WEIGHTS[mode] || POSITION_WEIGHTS.standard;
  const w = weights[position] || { offenseWeight: 0.5, defenseWeight: 0.5 };
  const offense = calcOffenseScore(player);
  const defense = calcDefenseScore(player, position);
  return offense * w.offenseWeight + defense * w.defenseWeight;
};

// AIオーダー編成関数
// mode: 'standard' | 'offense' | 'defense'
export const generateOptimalLineup = (teamName, mode = 'standard') => {
  if (!TEAMS_DATA || !TEAMS_DATA[teamName]) {
    console.error('チームデータが見つかりません:', teamName);
    return;
  }

  const team = TEAMS_DATA[teamName];
  const fielders = team.players.filter(p => !p.position || p.position !== 'pitcher' || p.isTwoWay);
  const positions = ['catcher', 'first', 'second', 'short', 'third', 'left', 'center', 'right'];

  // 全選手×全ポジションの価値マトリクスを構築
  const playerScores = fielders.map(p => ({
    player: p,
    offense: calcOffenseScore(p),
    positions: {}
  }));

  playerScores.forEach(ps => {
    positions.forEach(pos => {
      ps.positions[pos] = calcPositionValue(ps.player, pos, mode);
    });
  });

  // 貪欲法でチーム価値を最大化するポジション割り当て
  // Step 1: まず打力上位9人（DH込み）をスタメン候補に選出
  const sortedByOffense = [...playerScores].sort((a, b) => {
    if (mode === 'defense') {
      const aDefMax = Math.max(...positions.map(pos => calcDefenseScore(a.player, pos)));
      const bDefMax = Math.max(...positions.map(pos => calcDefenseScore(b.player, pos)));
      return (bDefMax + b.offense * 0.3) - (aDefMax + a.offense * 0.3);
    }
    return b.offense - a.offense;
  });
  const numSlots = LEAGUE_SETTINGS.useDH ? 9 : 8;
  const candidates = sortedByOffense.slice(0, Math.min(numSlots + 4, fielders.length));

  // Step 2: 候補者群から最適なポジション割り当てを探索
  // 複数回のイテレーションで改善
  let bestAssignment = null;
  let bestTotalValue = -Infinity;

  const targetPositions = LEAGUE_SETTINGS.useDH ? [...positions, 'dh'] : positions;

  // ランダム初期解 + 改善を複数回試行
  for (let trial = 0; trial < 20; trial++) {
    const assignment = greedyAssignment(candidates, targetPositions, trial);
    if (!assignment) continue;

    const totalValue = Object.entries(assignment).reduce((sum, [pos, ps]) => {
      return sum + calcPositionValue(ps.player, pos, mode);
    }, 0);

    if (totalValue > bestTotalValue) {
      bestTotalValue = totalValue;
      bestAssignment = assignment;
    }
  }

  if (!bestAssignment) return;

  // 打順決定
  const lineupPlayers = Object.entries(bestAssignment).map(([pos, ps]) => ({
    player: ps.player,
    position: pos,
    offense: ps.offense
  }));

  const lineupOrder = assignBattingOrder(lineupPlayers);

  // lineupSettingsに保存
  if (!team.lineupSettings) {
    team.lineupSettings = {
      battingOrder: [],
      benchPlayers: [],
      substitutionRules: { pinchHitter: [], pinchRunner: [] }
    };
  }

  team.lineupSettings.battingOrder = lineupOrder.map((entry, index) => ({
    playerId: entry.player.id,
    battingOrder: index + 1,
    position: entry.position
  }));

  // 旧形式の打順も維持
  team.players.forEach(p => { p.battingOrder = 0; });

  lineupOrder.forEach((entry, index) => {
    const teamPlayer = team.players.find(p => p.id === entry.player.id);
    if (teamPlayer) {
      teamPlayer.battingOrder = index + 1;
      if (entry.position === 'dh') {
        teamPlayer._isDH = true;
      } else {
        teamPlayer.position = entry.position;
        delete teamPlayer._isDH;
      }
    }
  });
};

// 貪欲法によるポジション割り当て
function greedyAssignment(candidates, positions, trialSeed) {
  const assigned = new Set();
  const assignment = {};

  // trialSeedによってポジション割り当て順を変える
  const posOrder = [...positions];
  if (trialSeed > 0) {
    // 守備負担の大きいポジションから埋める（基本戦略）に若干のランダム性
    const priorityOrder = ['catcher', 'short', 'center', 'second', 'third', 'right', 'left', 'first', 'dh'];
    const shuffled = priorityOrder.filter(p => posOrder.includes(p));
    // trial毎に少しだけ順番を入れ替え
    if (trialSeed % 3 === 1) {
      // 打撃重視ポジションから先に埋める
      shuffled.reverse();
    } else if (trialSeed % 3 === 2) {
      // 中間ポジションから
      const mid = Math.floor(shuffled.length / 2);
      const reordered = [...shuffled.slice(mid), ...shuffled.slice(0, mid)];
      shuffled.length = 0;
      shuffled.push(...reordered);
    }
    posOrder.length = 0;
    posOrder.push(...shuffled);
  } else {
    // trial 0: 守備負担大→小の順（デフォルト戦略）
    const priorityOrder = ['catcher', 'short', 'center', 'second', 'third', 'right', 'left', 'first', 'dh'];
    posOrder.length = 0;
    posOrder.push(...priorityOrder.filter(p => positions.includes(p)));
  }

  posOrder.forEach(pos => {
    let bestCandidate = null;
    let bestValue = -Infinity;

    candidates.forEach(ps => {
      if (assigned.has(ps.player.id)) return;

      const fitness = ps.player.positionFitness?.[pos] || 0;
      // 適性が極端に低いポジションはペナルティ（ただし打力が圧倒的なら許容）
      const fitnessThreshold = pos === 'dh' ? 0 : 20;
      if (fitness < fitnessThreshold && pos !== 'dh' && pos !== 'first' && pos !== 'left') {
        // 守備負担の大きいポジションで適性20未満は除外
        return;
      }

      const value = calcPositionValue(ps.player, pos);
      if (value > bestValue) {
        bestValue = value;
        bestCandidate = ps;
      }
    });

    if (bestCandidate) {
      assignment[pos] = bestCandidate;
      assigned.add(bestCandidate.player.id);
    }
  });

  // 全ポジションが埋まらなかった場合は失敗
  if (Object.keys(assignment).length < positions.length) {
    // 埋まらなかったポジションは適性無視で打力から補充
    const remaining = positions.filter(p => !assignment[p]);
    const unassignedPlayers = candidates.filter(ps => !assigned.has(ps.player.id));
    remaining.forEach(pos => {
      if (unassignedPlayers.length === 0) return;
      // 打力最高の未割り当て選手を配置
      const best = unassignedPlayers.sort((a, b) => b.offense - a.offense)[0];
      if (best) {
        assignment[pos] = best;
        assigned.add(best.player.id);
        unassignedPlayers.splice(unassignedPlayers.indexOf(best), 1);
      }
    });
  }

  return Object.keys(assignment).length === positions.length ? assignment : null;
}

// 打順編成（野球セオリーに基づく）
function assignBattingOrder(lineupPlayers) {
  const players = [...lineupPlayers];
  const order = [];

  const pick = (filterFn, sortFn) => {
    const candidates = players.filter(filterFn);
    if (candidates.length === 0) return null;
    candidates.sort(sortFn);
    const picked = candidates[0];
    players.splice(players.indexOf(picked), 1);
    order.push(picked);
    return picked;
  };

  // 1番: 出塁率+走力（俊足巧打）
  pick(
    () => true,
    (a, b) => {
      const aScore = (a.player.batting?.meet || 0) * 0.8 + (a.player.batting?.eye || 0) * 1.0 + (a.player.physical?.speed || 0) * 1.2;
      const bScore = (b.player.batting?.meet || 0) * 0.8 + (b.player.batting?.eye || 0) * 1.0 + (b.player.physical?.speed || 0) * 1.2;
      return bScore - aScore;
    }
  );

  // 2番: ミート+選球眼（つなぎ役、最近は強打者も）
  pick(
    () => true,
    (a, b) => {
      const aScore = (a.player.batting?.meet || 0) * 1.2 + (a.player.batting?.eye || 0) * 0.8 + (a.player.batting?.power || 0) * 0.5 + (a.player.physical?.speed || 0) * 0.5;
      const bScore = (b.player.batting?.meet || 0) * 1.2 + (b.player.batting?.eye || 0) * 0.8 + (b.player.batting?.power || 0) * 0.5 + (b.player.physical?.speed || 0) * 0.5;
      return bScore - aScore;
    }
  );

  // 3番: 最強打者（ミート+パワーの最高バランス）
  pick(
    () => true,
    (a, b) => {
      const aScore = (a.player.batting?.meet || 0) * 1.0 + (a.player.batting?.power || 0) * 1.2 + (a.player.batting?.eye || 0) * 0.5;
      const bScore = (b.player.batting?.meet || 0) * 1.0 + (b.player.batting?.power || 0) * 1.2 + (b.player.batting?.eye || 0) * 0.5;
      return bScore - aScore;
    }
  );

  // 4番: 最強のパワーヒッター（長打力重視）
  pick(
    () => true,
    (a, b) => {
      const aScore = (a.player.batting?.power || 0) * 1.5 + (a.player.batting?.meet || 0) * 0.7 + (a.player.batting?.eye || 0) * 0.3;
      const bScore = (b.player.batting?.power || 0) * 1.5 + (b.player.batting?.meet || 0) * 0.7 + (b.player.batting?.eye || 0) * 0.3;
      return bScore - aScore;
    }
  );

  // 5番: パワー2番手（勝負強さ）
  pick(
    () => true,
    (a, b) => {
      const aScore = (a.player.batting?.power || 0) * 1.3 + (a.player.batting?.meet || 0) * 0.8 + (a.player.batting?.eye || 0) * 0.4;
      const bScore = (b.player.batting?.power || 0) * 1.3 + (b.player.batting?.meet || 0) * 0.8 + (b.player.batting?.eye || 0) * 0.4;
      return bScore - aScore;
    }
  );

  // 6番: バランス型
  pick(
    () => true,
    (a, b) => {
      const aScore = (a.player.batting?.meet || 0) + (a.player.batting?.power || 0) + (a.player.batting?.eye || 0) * 0.5;
      const bScore = (b.player.batting?.meet || 0) + (b.player.batting?.power || 0) + (b.player.batting?.eye || 0) * 0.5;
      return bScore - aScore;
    }
  );

  // 7番: 残りで打撃力の高い順
  pick(
    () => true,
    (a, b) => a.offense - b.offense ? b.offense - a.offense : 0
  );

  // 8番: 残り（下位打線）
  pick(
    () => true,
    (a, b) => b.offense - a.offense
  );

  // 9番: 最後の一人（DH無しならピッチャー枠近くで走力のある選手）
  if (players.length > 0) {
    players.sort((a, b) => {
      const aScore = (a.player.physical?.speed || 0) * 0.6 + (a.player.batting?.meet || 0) * 0.4;
      const bScore = (b.player.physical?.speed || 0) * 0.6 + (b.player.batting?.meet || 0) * 0.4;
      return bScore - aScore;
    });
    order.push(players[0]);
    players.splice(0, 1);
  }

  return order;
}

// 投手ローテーション生成関数（AI監督用）
export const generatePitchingRotation = (teamName) => {
  if (!TEAMS_DATA || !TEAMS_DATA[teamName]) {
    console.error('チームデータが見つかりません:', teamName);
    return;
  }

  const team = TEAMS_DATA[teamName];
  const pitchers = team.players.filter(p => p.position === 'pitcher' || p.pitching?.stamina > 0);

  // 先発適性スコア（スタミナ重視 + 制球 + 球速）
  const starterScore = (p) =>
    (p.pitching?.stamina || 0) * 0.45 +
    (p.pitching?.control || 0) * 0.30 +
    (p.pitching?.velocity || 130) * 0.25;

  // リリーフ適性スコア（球速重視 + 制球、スタミナは低くてもOK）
  const reliefScore = (p) =>
    (p.pitching?.velocity || 130) * 0.45 +
    (p.pitching?.control || 0) * 0.35 +
    (p.pitching?.stamina || 0) * 0.20;

  // 先発候補: スタミナ上位の投手を先発スコア順に5人
  // 閾値は投手陣のスタミナ中央値を基準に動的決定（社会人モード対応）
  const sortedByStamina = [...pitchers].sort((a, b) => (b.pitching?.stamina || 0) - (a.pitching?.stamina || 0));
  const medianStamina = sortedByStamina.length > 0 ? (sortedByStamina[Math.floor(sortedByStamina.length / 2)]?.pitching?.stamina || 80) : 80;
  const starterThreshold = Math.max(60, Math.min(130, medianStamina));
  const starterCandidates = pitchers
    .filter(p => (p.pitching?.stamina || 0) >= starterThreshold)
    .sort((a, b) => starterScore(b) - starterScore(a));
  const starters = starterCandidates.slice(0, 5);
  const starterIds = new Set(starters.map(p => p.id));

  // 先発が足りない場合はスタミナ順で補充
  if (starters.length < 3) {
    const needed = 3 - starters.length;
    const remaining = sortedByStamina.filter(p => !starterIds.has(p.id));
    for (let i = 0; i < Math.min(needed, remaining.length); i++) {
      starters.push(remaining[i]);
      starterIds.add(remaining[i].id);
    }
  }

  // リリーフ候補
  const relievers = pitchers.filter(p => !starterIds.has(p.id));
  const scoredRelievers = relievers
    .map(p => ({ ...p, score: reliefScore(p) }))
    .sort((a, b) => b.score - a.score);

  // ロール割り当て
  const pitcherRoles = {};
  const assigned = new Set();

  // 先発ロール
  const scoredStarters = starters
    .map(p => ({ ...p, score: starterScore(p) }))
    .sort((a, b) => b.score - a.score);

  scoredStarters.forEach((p, i) => {
    const stamina = p.pitching?.stamina || 80;
    if (i === 0) {
      pitcherRoles[p.id] = 'ace';
    } else if (stamina >= 170) {
      pitcherRoles[p.id] = 'complete';
    } else if (stamina < 110) {
      pitcherRoles[p.id] = 'short';
    } else {
      pitcherRoles[p.id] = 'quality';
    }
  });

  // 守護神: リリーフ最高スコア（球速+制球が高い）
  const closer = scoredRelievers[0] || null;
  if (closer) {
    pitcherRoles[closer.id] = 'closer';
    assigned.add(closer.id);
  }

  // セットアッパー: 2番手
  const setupMen = [];
  if (scoredRelievers[1]) {
    setupMen.push(scoredRelievers[1]);
    pitcherRoles[scoredRelievers[1].id] = 'setup';
    assigned.add(scoredRelievers[1].id);
  }

  // 中継ぎエース: 3番手
  const unassigned = scoredRelievers.filter(p => !assigned.has(p.id));
  if (unassigned[0]) {
    pitcherRoles[unassigned[0].id] = 'ace_relief';
    assigned.add(unassigned[0].id);
  }

  // ワンポイント: 左投げ＆スタミナ低め
  const unassigned2 = scoredRelievers.filter(p => !assigned.has(p.id));
  const onepointCandidate = unassigned2.find(p =>
    p.physical?.throws === 'left' && (p.pitching?.stamina || 0) < 110
  );
  if (onepointCandidate) {
    pitcherRoles[onepointCandidate.id] = 'onepoint';
    assigned.add(onepointCandidate.id);
  }

  // ロングリリーフ: スタミナが高いリリーフ
  const unassigned3 = scoredRelievers.filter(p => !assigned.has(p.id));
  const longCandidate = [...unassigned3].sort((a, b) =>
    (b.pitching?.stamina || 0) - (a.pitching?.stamina || 0)
  )[0];
  if (longCandidate) {
    pitcherRoles[longCandidate.id] = 'long';
    assigned.add(longCandidate.id);
  }

  // 残りをビハインド→敗戦処理
  const unassigned4 = scoredRelievers.filter(p => !assigned.has(p.id));
  unassigned4.forEach((p, i) => {
    pitcherRoles[p.id] = i === 0 ? 'behind' : 'mopup';
    assigned.add(p.id);
  });

  // レガシー配列
  const middleRelievers = scoredRelievers.filter(p =>
    p.id !== closer?.id && !setupMen.some(s => s.id === p.id)
  );

  if (!team.pitchingRotation) {
    team.pitchingRotation = {};
  }

  team.pitchingRotation.starters = starters.map(p => p.id);
  team.pitchingRotation.closer = closer ? closer.id : null;
  team.pitchingRotation.setupMen = setupMen.map(p => p.id);
  team.pitchingRotation.middleRelievers = middleRelievers.map(p => p.id);
  team.pitchingRotation.currentStarterIndex = 0;
  team.pitchingRotation.reliefFatigue = {};
  team.pitchingRotation.pitcherRoles = pitcherRoles;
};

// 全チームのAIオーダー編成を実行
export const generateAllTeamsLineup = (allTeams) => {
  allTeams.forEach(teamName => {
    generateOptimalLineup(teamName);
    generatePitchingRotation(teamName);
  });
  alert('全チームのAIオーダー編成と投手ローテーションを設定しました！');
};
