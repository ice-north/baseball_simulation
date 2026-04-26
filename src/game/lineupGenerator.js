import { TEAMS_DATA, LEAGUE_SETTINGS } from '../teams-data.js';

// AIオーダー編成関数
export const generateOptimalLineup = (teamName) => {
  if (!TEAMS_DATA || !TEAMS_DATA[teamName]) {
    console.error('チームデータが見つかりません:', teamName);
    return;
  }

  const team = TEAMS_DATA[teamName];
  // 野手と投手を分ける（投手登録の二刀流は野手候補にも含める）
  const fielders = team.players.filter(p => !p.position || p.position !== 'pitcher' || p.isTwoWay);
  const pitchers = team.players.filter(p => p.position === 'pitcher');

  // 野手を総合力でソート（打撃+走力+守備）
  const rankedFielders = fielders.map(p => {
    const battingPower = (p.batting.meet + p.batting.power + p.batting.eye) / 3;
    const fieldingPower = (p.fielding.defense + p.physical.speed + p.physical.arm) / 3;
    const totalPower = battingPower * 0.6 + fieldingPower * 0.4;
    return { ...p, totalPower, battingPower };
  }).sort((a, b) => b.totalPower - a.totalPower);

  // 守備位置を決定（positionFitnessを考慮）
  const positions = ['catcher', 'first', 'second', 'short', 'third', 'left', 'center', 'right'];
  const assigned = new Set();
  const positionAssignments = {};

  // 各ポジションに最適な選手を割り当て
  positions.forEach(pos => {
    let bestPlayer = null;
    let bestScore = -1;

    rankedFielders.forEach(player => {
      if (assigned.has(player.id)) return;

      const fitness = player.positionFitness?.[pos] || 50;
      const fieldingAbility = pos === 'catcher' ? player.catching?.lead || 0 : player.fielding.defense;
      const score = fitness * 0.7 + fieldingAbility * 0.3;

      if (score > bestScore) {
        bestScore = score;
        bestPlayer = player;
      }
    });

    if (bestPlayer) {
      positionAssignments[pos] = bestPlayer;
      assigned.add(bestPlayer.id);
    }
  });

  // 打順を決定（一般的なセオリーに従う）
  const lineupOrder = [];

  // 1番: 足が速い選手（走力重視）
  const leadoffCandidates = Object.values(positionAssignments)
    .sort((a, b) => b.physical.speed - a.physical.speed);
  if (leadoffCandidates[0]) lineupOrder.push(leadoffCandidates[0]);

  // 2番: ミートが高い選手（コンタクト重視）
  const secondCandidates = Object.values(positionAssignments)
    .filter(p => !lineupOrder.includes(p))
    .sort((a, b) => b.batting.meet - a.batting.meet);
  if (secondCandidates[0]) lineupOrder.push(secondCandidates[0]);

  // 3番: バランス型（ミート+パワー）
  const thirdCandidates = Object.values(positionAssignments)
    .filter(p => !lineupOrder.includes(p))
    .sort((a, b) => (b.batting.meet + b.batting.power) - (a.batting.meet + a.batting.power));
  if (thirdCandidates[0]) lineupOrder.push(thirdCandidates[0]);

  // 4番: パワーが最も高い選手（長距離砲）
  const cleanupCandidates = Object.values(positionAssignments)
    .filter(p => !lineupOrder.includes(p))
    .sort((a, b) => b.batting.power - a.batting.power);
  if (cleanupCandidates[0]) lineupOrder.push(cleanupCandidates[0]);

  // 5番: 2番目にパワーが高い選手
  if (cleanupCandidates[1]) lineupOrder.push(cleanupCandidates[1]);

  // 6-8番: 残りの選手（総合力順）
  const remainingFielders = Object.values(positionAssignments)
    .filter(p => !lineupOrder.includes(p))
    .sort((a, b) => b.totalPower - a.totalPower);
  remainingFielders.forEach(p => lineupOrder.push(p));

  // DH制: ベンチから打撃力の高い選手をDHとして追加
  if (LEAGUE_SETTINGS.useDH) {
    const dhCandidates = rankedFielders.filter(p => !assigned.has(p.id));
    if (dhCandidates.length > 0) {
      lineupOrder.push(dhCandidates[0]);
      positionAssignments['dh'] = dhCandidates[0];
      assigned.add(dhCandidates[0].id);
    }
  }

  // lineupSettingsに保存（新形式）
  if (!team.lineupSettings) {
    team.lineupSettings = {
      battingOrder: [],
      benchPlayers: [],
      substitutionRules: { pinchHitter: [], pinchRunner: [] }
    };
  }

  team.lineupSettings.battingOrder = lineupOrder.map((player, index) => {
    const assignedPos = Object.entries(positionAssignments).find(([_, p]) => p.id === player.id);
    return {
      playerId: player.id,
      battingOrder: index + 1,
      position: assignedPos ? assignedPos[0] : player.position
    };
  });

  // 旧形式の打順も維持（互換性のため）
  team.players.forEach(p => {
    p.battingOrder = 0; // リセット
  });

  lineupOrder.forEach((player, index) => {
    const teamPlayer = team.players.find(p => p.id === player.id);
    if (teamPlayer) {
      teamPlayer.battingOrder = index + 1;
      const assignedPos = Object.entries(positionAssignments).find(([_, p]) => p.id === player.id);
      if (assignedPos) {
        teamPlayer.position = assignedPos[0];
      }
    }
  });
};

// 投手ローテーション生成関数（AI監督用）
export const generatePitchingRotation = (teamName) => {
  if (!TEAMS_DATA || !TEAMS_DATA[teamName]) {
    console.error('チームデータが見つかりません:', teamName);
    return;
  }

  const team = TEAMS_DATA[teamName];
  const pitchers = team.players.filter(p => p.position === 'pitcher' || p.pitching?.stamina > 0);

  // スタミナでソート
  const sortedPitchers = pitchers.sort((a, b) => (b.pitching?.stamina || 0) - (a.pitching?.stamina || 0));

  // 先発ローテーション（スタミナ140以上、最大5人）
  const starters = sortedPitchers.filter(p => p.pitching?.stamina >= 130).slice(0, 5);

  // 残りの投手（リリーフ候補）
  const relievers = sortedPitchers.filter(p => !starters.includes(p));

  // 能力スコアでソート
  const scoredRelievers = relievers.map(p => ({
    ...p,
    reliefScore: (p.pitching?.velocity || 130) * 0.4 +
                 (p.pitching?.control || 50) * 0.4 +
                 (p.pitching?.stamina || 80) * 0.2
  })).sort((a, b) => b.reliefScore - a.reliefScore);

  // 特性に基づいて適材適所で配置
  const pitcherRoles = team.pitchingRotation?.pitcherRoles || {};
  const assigned = new Set();

  // 先発ロールを特性に基づいて振り分け
  const scoredStarters = starters.map(p => ({
    ...p,
    starterScore: (p.pitching?.velocity || 130) * 0.3 +
                  (p.pitching?.control || 50) * 0.3 +
                  (p.pitching?.stamina || 80) * 0.4
  })).sort((a, b) => b.starterScore - a.starterScore);

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

  // 1. 守護神: 最高能力（1人）
  const closer = scoredRelievers[0] || null;
  if (closer) {
    pitcherRoles[closer.id] = 'closer';
    assigned.add(closer.id);
  }

  // 2. セットアッパー: 2番手（1人）
  const setupMen = [];
  if (scoredRelievers[1]) {
    setupMen.push(scoredRelievers[1]);
    pitcherRoles[scoredRelievers[1].id] = 'setup';
    assigned.add(scoredRelievers[1].id);
  }

  // 残りの未割り当てリリーフ
  const unassigned = scoredRelievers.filter(p => !assigned.has(p.id));

  // 3. 中継ぎエース: 残りで最も能力が高い（1人）
  if (unassigned[0]) {
    pitcherRoles[unassigned[0].id] = 'ace_relief';
    assigned.add(unassigned[0].id);
  }

  // 4. ワンポイント: 左投げ＆スタミナ低め（1人まで）
  const unassigned2 = scoredRelievers.filter(p => !assigned.has(p.id));
  const onepointCandidate = unassigned2.find(p =>
    p.physical?.throws === 'left' && (p.pitching?.stamina || 0) < 110
  );
  if (onepointCandidate) {
    pitcherRoles[onepointCandidate.id] = 'onepoint';
    assigned.add(onepointCandidate.id);
  }

  // 5. ロングリリーフ: スタミナが高い投手（1人）
  const unassigned3 = scoredRelievers.filter(p => !assigned.has(p.id));
  const longCandidate = [...unassigned3].sort((a, b) =>
    (b.pitching?.stamina || 0) - (a.pitching?.stamina || 0)
  )[0];
  if (longCandidate) {
    pitcherRoles[longCandidate.id] = 'long';
    assigned.add(longCandidate.id);
  }

  // 6. 残りを能力順にビハインド→敗戦処理
  const unassigned4 = scoredRelievers.filter(p => !assigned.has(p.id));
  unassigned4.forEach((p, i) => {
    if (i === 0) {
      pitcherRoles[p.id] = 'behind';
    } else {
      pitcherRoles[p.id] = 'mopup';
    }
    assigned.add(p.id);
  });

  // レガシー配列を構築
  const middleRelievers = scoredRelievers.filter(p =>
    p.id !== closer?.id && !setupMen.some(s => s.id === p.id)
  );

  // ローテーション情報を新形式で保存
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
