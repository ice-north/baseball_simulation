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

// 先発ローテに入れられる選手。投手登録か、投球の能力を持つ選手（オンラインの二刀流で野手もローテに入れられる）。
// 投手登録の選手はいつも先発できる（投球の能力を持たない古い形でも）
const canStartPlayer = player => player?.position === 'pitcher' || !!player?.pitching;

/**
 * 次に投げる先発の id。ローテの今の順番から、抹消中でなく先発できる最初の選手。
 * ⚠ `ensureCompleteLineup` が9番に入れる選手と**同じ決め方**にすること。二刀流の先発の日の
 *    入れ替え（`server/dailyLineup.mjs` の `benchTwoWayStarter`）がこれで先発を見る。
 *    ずれると、先発を野手の枠から外したまま打順を保存してしまう
 */
export function nextRotationStarterId(team) {
  const byId = new Map((team?.players || []).map(p => [p.id, p]));
  const starters = team?.pitchingRotation?.starters || [];
  const index = team?.pitchingRotation?.currentStarterIndex || 0;
  return [...starters.slice(index), ...starters.slice(0, index)].find(id => {
    const player = byId.get(id);
    return !!player && player.isActive !== false && canStartPlayer(player);
  });
}

/**
 * 保存する打順の9番（投手）に**仮に**置く選手の id（9番は試合の日に組み直す）。
 * 次の先発から、野手の枠に入っていない人。居なければ、野手の枠に入っていない投手登録の選手。
 * ⚠ 二刀流で次の先発が野手の枠にも居るとき、同じ選手を9番に重ねない。
 * ⚠ 控えを「投球の能力を持つ」で広く拾わないこと。野手もみな投球の能力を持つので、
 *    控えの野手が投手として9番に並んでしまう。
 * サーバーの保存（`lineupCommand`）・試合の後の戻し（`dailyLineup`）・スマホの編成（`lineupBridge`）で使う。
 */
export function placeholderPitcherId(players = [], starters = [], index = 0, fielding = new Set()) {
  const byId = new Map(players.map(p => [p.id, p]));
  const free = p => !!p && p.isActive !== false && !fielding.has(p.id);
  return [...starters.slice(index), ...starters.slice(0, index)]
    .map(id => byId.get(id)).find(p => free(p) && canStartPlayer(p))?.id
    ?? players.find(p => free(p) && p.position === 'pitcher')?.id;
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
  const canStart = canStartPlayer;
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
    // ⚠ 先発は `nextRotationStarterId`（二刀流の先発の日の入れ替えと同じ決め方）
    const pitcher = active.get(nextRotationStarterId(team))
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
