// ============================================================
// オンラインの view と、一人用の編成画面が期待する `team` 形との変換。
//
// ⚠ **画面(JSX)と分けてある**。この2つだけはハーネス（node）から直接読めないと
//    検査が書けない。node は JSX を解釈しないので、同じファイルに置くと
//    `tools/sim-harness/online-lineup-port-check.mjs` が import できなくなる。
//
// ⚠ 読み書きの形は**サーバーの `projectLineup` / `validateLineup` が正本**。
//    どちらかを変えたら、ここも検査も一緒に直すこと。
// ⚠ オンラインは DH 無し固定（`leagueEngine` の `useDH: false`、
//    `validateLineup` も野手8人ちょうど）。DH を入れるなら3箇所を揃えて直す。
// ============================================================

const clone = (value) => JSON.parse(JSON.stringify(value));

/** view から一人用の画面が期待する `team` 形を組み立てる（複製） */
export function teamFromView(view) {
  const roster = clone(view.roster || []);
  const lineup = view.lineup || {};
  const byId = new Map(roster.map((p) => [p.id, p]));
  // 打順は view のぶん（野手8人）＋ 投手の枠を復元する
  const battingOrder = clone(lineup.battingOrder || []);
  const starters = clone(lineup.starters || []);
  const pitcherId = starters[0];
  if (pitcherId && byId.has(pitcherId)) {
    battingOrder.push({
      playerId: pitcherId,
      position: 'pitcher',
      battingOrder: 9,
    });
  }
  return {
    name: view.teamName,
    players: roster,
    lineupSettings: {
      battingOrder,
      benchPlayers: [],
      substitutionRules: { pinchHitter: [], pinchRunner: [] },
    },
    pitchingRotation: {
      starters,
      middleRelievers: [],
      closers: [],
      currentStarterIndex: 0,
      pitcherRoles: clone(lineup.pitcherRoles || {}),
    },
    strategy: clone(lineup.strategy || {}),
  };
}

/** 書き換えられた `team` から、サーバーへ送る `plan` を組み立てる */
export function planFromTeam(team) {
  return {
    // ⚠ 投手を外す。サーバーは野手8人ちょうどを求める
    battingOrder: (team.lineupSettings?.battingOrder || [])
      .filter((e) => e.position !== 'pitcher')
      .sort((a, b) => a.battingOrder - b.battingOrder)
      .map((e) => ({
        playerId: e.playerId,
        position: e.position,
        battingOrder: e.battingOrder,
      })),
    starters: team.pitchingRotation?.starters || [],
    strategy: team.strategy || {},
    ...(team.pitchingRotation?.pitcherRoles
      ? { pitcherRoles: team.pitchingRotation.pitcherRoles }
      : {}),
  };
}
