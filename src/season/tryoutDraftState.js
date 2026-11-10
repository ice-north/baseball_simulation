// ============================================================
// 一人用のトライアウトの途中の状態（保存用） - src/season/tryoutDraftState.js
//
// トライアウト（新しく始めた直後の初回・毎年11/10）の指名は、終わるまで TEAMS_DATA に
// 書かない（`TryoutScreen` の finalizeDraft でまとめて書く）。途中の状態は画面の state に
// しか無いので、保存に入るよう `seasonData.tryoutDraft` へ写しておく。
// ⚠ 以前は写しておらず、途中で保存したもの（緊急保存）をロードすると、初回は最初から、
//    毎年のものは日程画面の11/10に戻ってトライアウトの日が過ぎた扱いになり
//    （その日ちょうどでしか開かない）、その年のトライアウトが丸ごと飛んでいた。
//
// 形（項目は足す方向でだけ変えること。古い保存は `v` を見て読めなければ最初からやり直す）:
//   { v: 1, year, initial,
//     candidates: [残っている候補の選手],
//     order: 指名の順番（draftOrder）, pick: 次に指名する番号（currentPick）,
//     history: [{ pick, round, team, player|null, skipped?, reason? }],
//     rosters: { 球団のキー（自チームは 'ユーザー'）: [選手id] }, userRoster: [選手id],
//     userDone: 自チームの指名を打ち切ったか, complete: 名簿へ書き終えたか }
// 指名した選手の本体は history にだけ置き、rosters・userRoster は id で持つ
// （画面の state は同じ選手を3か所で持つので、そのまま写すと保存が膨らむ）。
// ⚠ 「直前の指名を取り消す」の写しは入れない。ロードした続きからは取り消せない。
// ============================================================

export const TRYOUT_DRAFT_VERSION = 1;

/** 画面の state を保存用の形にする（選手の中身は写さず参照のまま。保存で JSON になる） */
export function packTryoutDraft({ year, initial, candidates, draftOrder, currentPick, draftHistory, teamRosters, userRoster, userDone, complete }) {
  const ids = (list) => (list || []).map(p => p.id);
  return {
    v: TRYOUT_DRAFT_VERSION,
    year,
    initial: !!initial,
    candidates: candidates || [],
    order: draftOrder || [],
    pick: currentPick || 0,
    history: draftHistory || [],
    rosters: Object.fromEntries(Object.entries(teamRosters || {}).map(([team, list]) => [team, ids(list)])),
    userRoster: ids(userRoster),
    userDone: !!userDone,
    complete: !!complete,
  };
}

/**
 * 保存から画面の state を作り直す。別の年・別の種類（初回かどうか）・壊れたものは null
 * （呼ぶ側は null なら最初から始める）。
 */
export function unpackTryoutDraft(saved, { year, initial }) {
  if (!saved || saved.v !== TRYOUT_DRAFT_VERSION) return null;
  if (saved.year !== year || !!saved.initial !== !!initial) return null;
  if (!Array.isArray(saved.candidates) || !Array.isArray(saved.order) || !Array.isArray(saved.history)) return null;
  // 指名した選手は history の本体を引く（名簿と指名結果で同じ選手を指すように）
  const byId = new Map();
  for (const entry of saved.history) if (entry?.player) byId.set(entry.player.id, entry.player);
  const resolve = (list) => {
    const players = (list || []).map(id => byId.get(id));
    return players.every(Boolean) ? players : null;
  };
  const teamRosters = {};
  for (const [team, list] of Object.entries(saved.rosters || {})) {
    const players = resolve(list);
    if (!players) return null;
    teamRosters[team] = players;
  }
  const userRoster = resolve(saved.userRoster);
  if (!userRoster) return null;
  const pick = Number.isInteger(saved.pick) ? Math.max(0, Math.min(saved.pick, saved.order.length)) : 0;
  return {
    candidates: saved.candidates,
    draftOrder: saved.order,
    currentPick: pick,
    draftHistory: saved.history,
    teamRosters,
    userRoster,
    userDone: !!saved.userDone,
    complete: !!saved.complete,
  };
}

/** 保存の中の途中のトライアウトの選手（ロードの正規化で欠けた項目を補うため） */
export function tryoutDraftPlayers(saved) {
  if (!saved || typeof saved !== 'object') return [];
  return [
    ...(Array.isArray(saved.candidates) ? saved.candidates : []),
    ...(Array.isArray(saved.history) ? saved.history.map(entry => entry?.player).filter(Boolean) : []),
  ];
}

/** seasonData から途中のトライアウトを外す（トライアウトを終えたとき） */
export function withoutTryoutDraft(seasonData) {
  if (!seasonData || !('tryoutDraft' in seasonData)) return seasonData;
  const { tryoutDraft: _done, ...rest } = seasonData;
  return rest;
}
