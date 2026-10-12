// ============================================================
// ロスター状態ミューテータ - src/state/roster.js
//
// チーム（や highSchoolPool 等 .players を持つオブジェクト）のロスター配列への
// 変更を集約する。直接 team.players.push / splice を書く代わりにこれらを使うことで、
// (1) 同一IDの二重登録防止（"選手増殖"バグ対策）、(2) 変更経路の一元化、を得る。
//
// 対象は `.players` 配列を持つ任意のオブジェクト（team / highSchoolPool 等）。
// ============================================================

// ロスターに選手を追加する。既に同一IDが存在する場合はスキップ（重複防止）。
export function addToRoster(team, player) {
  if (!team || !Array.isArray(team.players) || !player || player.id == null) return false;
  if (team.players.some(p => p.id === player.id)) return false;
  team.players.push(player);
  return true;
}

// 複数選手をまとめて追加する（各要素は重複防止付き）。
export function addManyToRoster(team, players) {
  if (!Array.isArray(players)) return;
  for (const p of players) addToRoster(team, p);
}

// 指定IDの選手をロスターから除去する。除去できたら true。
export function removeFromRosterById(team, playerId) {
  if (!team || !Array.isArray(team.players)) return false;
  const idx = team.players.findIndex(p => p.id === playerId);
  if (idx >= 0) {
    team.players.splice(idx, 1);
    return true;
  }
  return false;
}

// ロスターの中身を新しい配列で完全に置換する（参照は維持）。
export function replaceRoster(team, players) {
  if (!team || !Array.isArray(team.players)) return;
  team.players.splice(0, team.players.length, ...(Array.isArray(players) ? players : []));
}
