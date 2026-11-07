const FIELD_POSITIONS = ['catcher', 'first', 'second', 'short', 'third', 'left', 'center', 'right'];

/**
 * 試合を組むのに足りない人数（`ensureCompleteLineup` が打順を埋められる条件）。
 * 投手1人と野手8人（DH制は9人）。足りていれば空配列。
 * ⚠ 人数の合計だけで確かめないこと。投手ばかりの名簿でも合計は足りてしまい、
 *    開幕後に打順が組めず1日も進められなくなる
 */
export function rosterShortage(players = [], useDH = false) {
  const active = players.filter(p => p && p.isActive !== false);
  const pitchers = active.filter(p => p.position === 'pitcher').length;
  const fielders = active.length - pitchers;
  const needFielders = useDH ? 9 : 8;
  const missing = [];
  if (pitchers < 1) missing.push('投手1人');
  if (fielders < needFielders) missing.push(`野手${needFielders - fielders}人`);
  return missing;
}

// 日付進行前に打順・守備位置・先発投手を揃える。既存の有効な指定を優先する。
export function ensureCompleteLineup(team, useDH = false) {
  if (!team) return true;
  if (!team.lineupSettings) return false;
  const players = team.players || [];
  const active = new Map(players.filter(player => player.isActive !== false).map(player => [player.id, player]));
  const source = team.lineupSettings.battingOrder || [];
  const lineup = [];
  const usedOrders = new Set();
  const usedPlayers = new Set();
  // ⚠ DH制では**次の先発投手を打順に残さない**。試合では先発に決まった投手の
  //    打順を外す（`selectStarterFromRotation`）ので、打順に入れたままだと
  //    その枠と守備位置が空き、8人で戦うことになっていた（空いた打席は
  //    1人目の選手が代わりに立ち、1試合7打席になる）。外した枠は控えで埋める。
  const rotationStarters = team.pitchingRotation?.starters || [];
  const startIndex = team.pitchingRotation?.currentStarterIndex || 0;
  // ⚠ 先発ローテの選手は**投手登録でなくてよい**（オンラインの二刀流。野手を
  //    ローテに入れられる）。登録で絞ると、ローテの野手を飛ばして別の投手が投げる
  //    投手登録の選手はいつも先発できる（投球の能力を持たない古い形でも）
  const canStart = player => player?.position === 'pitcher' || !!player?.pitching;
  const nextStarterId = useDH
    ? [...rotationStarters.slice(startIndex), ...rotationStarters.slice(0, startIndex)]
      .find(id => canStart(active.get(id)))
    : undefined;
  for (const entry of source) {
    const player = active.get(entry.playerId);
    const order = entry.battingOrder;
    if (!player || !Number.isInteger(order) || order < 1 || order > 9
      || usedOrders.has(order) || usedPlayers.has(player.id)) continue;
    if (useDH && entry.position === 'pitcher') continue;
    if (useDH && nextStarterId !== undefined && player.id === nextStarterId) continue;
    if (!useDH && (order === 9 || entry.position === 'pitcher')) continue;
    lineup.push({ ...entry });
    usedOrders.add(order);
    usedPlayers.add(player.id);
  }

  if (!useDH) {
    const rotation = team.pitchingRotation?.starters || [];
    const rotationIndex = team.pitchingRotation?.currentStarterIndex || 0;
    const rotated = [...rotation.slice(rotationIndex), ...rotation.slice(0, rotationIndex)];
    const pitcher = rotated.map(id => active.get(id)).find(canStart)
      || source.map(entry => active.get(entry.playerId)).find(player => player?.position === 'pitcher')
      || players.find(player => player.position === 'pitcher' && player.isActive !== false);
    if (!pitcher) return false;
    const previousSlot = lineup.findIndex(entry => entry.playerId === pitcher.id);
    if (previousSlot !== -1) {
      usedOrders.delete(lineup[previousSlot].battingOrder);
      lineup.splice(previousSlot, 1);
    }
    lineup.push({ playerId: pitcher.id, position: 'pitcher', battingOrder: 9 });
    usedOrders.add(9);
    usedPlayers.add(pitcher.id);
  } else if (!players.some(player => player.position === 'pitcher' && player.isActive !== false)) {
    return false;
  }

  const usedPositions = new Set();
  for (const entry of lineup) {
    if (entry.position === 'pitcher') continue;
    if (!FIELD_POSITIONS.includes(entry.position) && !(useDH && entry.position === 'dh')
      || usedPositions.has(entry.position)) {
      entry.position = FIELD_POSITIONS.find(position => !usedPositions.has(position)) || (useDH ? 'dh' : null);
    }
    if (!entry.position) return false;
    usedPositions.add(entry.position);
  }

  for (let order = 1; order <= (useDH ? 9 : 8); order++) {
    if (usedOrders.has(order)) continue;
    const position = FIELD_POSITIONS.find(candidate => !usedPositions.has(candidate)) || (useDH ? 'dh' : null);
    const bench = players.find(player => player.isActive !== false && player.position !== 'pitcher'
      && !usedPlayers.has(player.id) && player.position === position)
      || players.find(player => player.isActive !== false && player.position !== 'pitcher'
        && !usedPlayers.has(player.id));
    if (!position || !bench) return false;
    lineup.push({ playerId: bench.id, position, battingOrder: order });
    usedOrders.add(order);
    usedPlayers.add(bench.id);
    usedPositions.add(position);
  }
  team.lineupSettings.battingOrder = lineup.sort((a, b) => a.battingOrder - b.battingOrder);
  return lineup.length === 9 && usedOrders.size === 9 && usedPositions.size === (useDH ? 9 : 8);
}
