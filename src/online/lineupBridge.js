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
//    `validateLineup` も野手8人ちょうど）。DH を入れるなら3箇所を揃えて直す
//    （画面の9番・投手の行も: PCの `LineupBoard.jsx`、スマホの `TapLineup.jsx`）。
// ============================================================

import { placeholderPitcherId } from '../game/lineup.js';
import { sameEditState } from './shared.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

/** view から一人用の画面が期待する `team` 形を組み立てる（複製） */
export function teamFromView(view) {
  const roster = clone(view.roster || []);
  const lineup = view.lineup || {};
  // 打順は view のぶん（野手8人）＋ 投手の枠を復元する
  const battingOrder = clone(lineup.battingOrder || []);
  const starters = clone(lineup.starters || []);
  // ⚠ **打順に入れる投手は「次の先発」**。先発の並びの先頭ではない。
  //    以前は常に先頭を入れていて、画面の打順に次の試合で投げない投手が出ていた。
  const nextIndex = Math.max(0, starters.indexOf(view.nextStarterId));
  // ⚠ 次の先発が野手の枠にも入っている（二刀流）ときは、同じ選手を2回並べない。
  //    サーバーの保存（`server/lineupCommand.mjs`）と同じ決め方（`placeholderPitcherId`）。
  //    先発が全員兼任なら、野手の枠に居ない投手登録の選手を使う（同じ選手を9番にも追加しない）。
  const fielding = new Set(battingOrder.map((e) => e.playerId));
  const pitcherId = placeholderPitcherId(roster, starters, nextIndex, fielding);
  if (pitcherId !== undefined) {
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

/**
 * 編集が2つに分かれている画面の保存（スマホの「打順」: 2タップの打順と方針・采配の下書き）。
 * `parts` は `[{ keys, plan, base }]`（それぞれの受け持ち項目・編集・編集を始めたときの起点）。
 * 起点の決め方は `rebaseLineupSave` と同じ。どれも自分の項目が他で変わっていなければ
 * 最新に載せ、変わっていたらその編集の起点のまま送って弾かせる（本当の食い違い）。
 */
export function rebaseLineupParts(parts, latest) {
  const conflicted = parts.find(
    ({ keys, base }) =>
      !latest || !keys.every((k) => sameValue(base?.[k], latest[k])),
  );
  const from = conflicted ? conflicted.base || {} : latest;
  const payload = clone(from || {});
  parts.forEach(({ keys, plan }) =>
    keys.forEach((k) => {
      if (plan[k] === undefined) delete payload[k];
      else payload[k] = plan[k];
    }),
  );
  return { ...payload, baseLineup: clone(from || {}) };
}

/** 打順・先発・投手の役割。方針・采配（PC）が「自分の項目ではない」と見分けるのに使う */
export const LINEUP_EDITOR_KEYS = ['battingOrder', 'starters', 'pitcherRoles'];
/**
 * PC版のスタメン設定（`LineupBoard.jsx`）と投手起用（`PitchingBoard.jsx`）が受け持つ項目。
 * ⚠ PCでは打順と投手起用を**別のページで別に保存する**。受け持つ項目を分けておかないと、
 *    片方を保存しただけでもう片方の未保存の編集が「編成が更新されています」で
 *    保存できなくなる（自分の項目が他で変わった扱いになる）。
 */
export const LINEUP_BOARD_KEYS = ['battingOrder'];
export const PITCHING_BOARD_KEYS = ['starters', 'pitcherRoles'];
/** 方針・采配（PC）が受け持つ項目 */
export const TACTICS_EDITOR_KEYS = ['strategy', 'tactics'];

/** 全画面の編成（スマホ）に、保存していない編集が残っているか（回転で作り直したときに開き直す判断に使う） */
export function hasUnsavedFullLineup(editing) {
  return (
    !!editing && JSON.stringify(planFromTeam(editing.team)) !== editing.basePlan
  );
}

/**
 * 保存していない編集が**打順のほか**（先発・投手の役割・方針）にも及んでいるか。
 * ⚠ スマホの打順・守備は2タップの表（`TapLineup.jsx`）で編集し、全画面の編成は
 *    投手起用のために開く。PCから受け取った編集が打順だけなら表が引き取り、
 *    ほかにも及んでいれば全画面の編成を開いたまま始める（表では投手起用を持てない）
 */
export function fullLineupTouchesPitching(editing) {
  if (!hasUnsavedFullLineup(editing)) return false;
  const now = planFromTeam(editing.team);
  const before = JSON.parse(editing.basePlan);
  return Object.keys({ ...now, ...before }).some(
    (k) => k !== 'battingOrder' && !sameEditState(now[k], before[k]),
  );
}

// ------------------------------------------------------------
// スマホとPCの間で、保存していない編成の編集を受け渡す。
// ⚠ スマホを横にすると幅が768px以上になり、PCの画面に切り替わる（逆も）。画面ごと
//    作り直されるので、受け渡さないと回転しただけで編集が消える。さらに、横で保存して
//    縦に戻すと古い編集が開き直されて「編成が更新されています」で保存できなかった。
// 入れ物は `Drafts` の `lineup.full`（スマホの全画面編成の形 `{ team, base, basePlan }`）。
// PCはスタメン設定と投手起用が別々の編集を持つので、ここで1つの形にまとめて書き、
// 開くときはそこから両方の編集を起こす。
// ------------------------------------------------------------

/** スマホの全画面編成の編集を、PCで開く形（編集後の編成と起点）にする。無ければ null */
export function restoreFromFullLineup(kept) {
  if (!hasUnsavedFullLineup(kept)) return null;
  return {
    lineup: { ...kept.base, ...planFromTeam(kept.team) },
    base: clone(kept.base),
  };
}

/**
 * PCの編成ページ（スタメン設定・投手起用）の保存していない編集を、スマホの全画面編成の形にする。
 * `boards` は保存していない編集だけ: `[{ keys, plan, baseLineup }]`。1つも無ければ null。
 * ⚠ 起点は `rebaseLineupSave` と同じ決まり。自分の項目が他で変わっていなければ最新に載せ、
 *    変わっていたらその編集の起点のまま（スマホで保存すると食い違いとして弾かれる）。
 */
export function fullLineupFromBoards(view, boards) {
  if (!boards.length) return null;
  const latest = view.lineup || {};
  let base = latest;
  boards.forEach(({ keys, baseLineup }) => {
    if (!keys.every((k) => sameValue(baseLineup?.[k], latest[k])))
      base = baseLineup;
  });
  const lineup = { ...base };
  boards.forEach(({ keys, plan }) =>
    keys.forEach((k) => (lineup[k] = plan[k])),
  );
  return {
    team: teamFromView({ ...view, lineup }),
    base: clone(base),
    // 起点の plan は名簿を使わない（投手の行は plan で外す）。名簿の複製を省く
    basePlan: JSON.stringify(
      planFromTeam(teamFromView({ ...view, roster: [], lineup: base })),
    ),
  };
}
