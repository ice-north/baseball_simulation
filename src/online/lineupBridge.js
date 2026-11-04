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

export const sameValue = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (k) => Object.prototype.hasOwnProperty.call(b, k) && sameValue(a[k], b[k]),
    )
  );
};

/**
 * 編成の保存を、**いまの編成の上に載せ直して**送る形にする。
 *
 * 編成（打順・先発・投手の役割・方針・自動采配）はサーバーでは1つの塊で、
 * 保存には「編集を始めたときの塊」（`baseLineup`）を添え、サーバーの今と
 * 違えば弾かれる（他の端末での上書き事故を防ぐため）。
 * ⚠ PCでは「スタメン設定・投手起用」と「方針・采配」が**別の画面で同じ塊を編集する**。
 *    そのままだと、片方を保存しただけで、もう片方の未保存の編集が
 *    「編成が更新されています」で保存できなくなる（しかも方針は古い値で上書きしかける）。
 * そこで、自分の画面が受け持つ項目（`ownKeys`）が編集を始めたときから
 * 変わっていなければ、ほかの項目は最新（`latest`）のまま、自分の項目だけ差し替えて送る。
 * 自分の項目が他で変わっていたら本当の食い違いなので、元の起点のまま送って弾かせる。
 */
export function rebaseLineupSave(plan, base, latest, ownKeys) {
  const clean =
    !!latest && ownKeys.every((k) => sameValue(base?.[k], latest[k]));
  const from = clean ? latest : base || {};
  const payload = clone(from);
  ownKeys.forEach((k) => {
    if (plan[k] === undefined) delete payload[k];
    else payload[k] = plan[k];
  });
  return { ...payload, baseLineup: clone(from) };
}

/** スタメン設定・投手起用（移植した画面）が受け持つ項目。スマホの全画面編成が使う */
export const LINEUP_EDITOR_KEYS = ['battingOrder', 'starters', 'pitcherRoles'];
/**
 * PC版のスタメン設定（`LineupBoard.jsx`）が受け持つ項目。
 * ⚠ PCでは打順と投手起用を**別のページで別に保存する**。投手起用（移植した画面）は
 *    打順も持っているが、PCでは `ROTATION_EDITOR_KEYS` だけを送る。両方が打順を
 *    受け持つと、片方を保存しただけでもう片方の未保存の編集が「編成が更新されて
 *    います」で保存できなくなる（自分の項目が他で変わった扱いになる）。
 */
export const LINEUP_BOARD_KEYS = ['battingOrder'];
/** PC版の投手起用（移植した画面）が受け持つ項目 */
export const ROTATION_EDITOR_KEYS = ['starters', 'pitcherRoles'];
/** 方針・采配（PC）が受け持つ項目 */
export const TACTICS_EDITOR_KEYS = ['strategy', 'tactics'];
