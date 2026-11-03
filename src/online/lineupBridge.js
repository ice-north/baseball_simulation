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
  // ⚠ **打順に入れる投手は「次の先発」**。先発の並びの先頭ではない。
  //    以前は常に先頭を入れていて、画面の打順に次の試合で投げない投手が出ていた。
  const nextIndex = Math.max(0, starters.indexOf(view.nextStarterId));
  const pitcherId = starters[nextIndex];
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
      currentStarterIndex: nextIndex,
      pitcherRoles: clone(lineup.pitcherRoles || {}),
    },
    strategy: clone(lineup.strategy || {}),
  };
}

/** 書き換えられた `team` から、サーバーへ送る `plan` を組み立てる */
export function planFromTeam(team) {
  return {
    // ⚠ 投手を外す。サーバーは野手8人ちょうどを求める
    // ⚠ **外したあと1〜8に振り直す**。画面では投手と野手の打順を入れ替えられるので、
    //    投手が3番なら野手は 1,2,4…9 になる。そのまま送るとサーバーの
    //    「打順は1〜8」に弾かれ、保存できないうえ編集も消えていた。
    //    オンラインは投手が常に9番で打つ（サーバー側の組み立て）ので、
    //    野手の並びの順だけを残す。
    battingOrder: (team.lineupSettings?.battingOrder || [])
      .filter((e) => e.position !== 'pitcher')
      .sort((a, b) => a.battingOrder - b.battingOrder)
      .map((e, i) => ({
        playerId: e.playerId,
        position: e.position,
        battingOrder: i + 1,
      })),
    starters: team.pitchingRotation?.starters || [],
    strategy: team.strategy || {},
    ...(team.pitchingRotation?.pitcherRoles
      ? { pitcherRoles: team.pitchingRotation.pitcherRoles }
      : {}),
  };
}
