// ============================================================
// 試合の詳細のスコアボード（回ごとの得点・計・安打・失策・勝敗投手）。画面は `GameHistory.jsx` の `ScoreBoard`。
//
// ⚠ 先方指摘「過去の試合をクリックした際のリザルトを、スコアボードを使ってグラフィカルに」。
//    以前は「2 – 3」の点数と個人成績の表だけで、何回に点が動いたか分からなかった。
// ⚠ 枠の数と書き方はアプリ（`GamesScreen.kt` の `lineScoreCells`）・紙面のスコアボードと同じ:
//    9回に満たなくても9回まで枠を取り、後攻のやらなかった裏は「x」、サヨナラの回は「1x」。
// ⚠ 安打・失策は個人成績（`game.teams`）を足して出す。失策は**守った側**の数（その球団の選手の失策）。
//    回ごとの得点（`lineScore`）は記録を取り始めた後の試合だけにあり、古い試合は null を返す。
// ============================================================

const sum = (list, get) => list.reduce((a, p) => a + (Number(get(p)) || 0), 0);

export function lineScoreCells(away = [], home = [], walkOff = false) {
  const innings = Math.max(9, away.length, home.length);
  const top = Array.from({ length: innings }, (_, i) => (i < away.length ? String(away[i]) : ''));
  const bottom = Array.from({ length: innings }, (_, i) => {
    if (i < home.length) return i === home.length - 1 && walkOff ? `${home[i]}x` : String(home[i]);
    return i < away.length ? 'x' : '';
  });
  return { innings, top, bottom };
}

export function scoreBoard(game) {
  const ls = game?.lineScore;
  if (!Array.isArray(ls?.away) || !ls.away.length) return null;
  const home = Array.isArray(ls.home) ? ls.home : [];
  const { innings, top, bottom } = lineScoreCells(ls.away, home, !!game.walkOff);
  const totals = (team, cells, score) => {
    const players = game.teams?.[team];
    return {
      team,
      cells,
      runs: Number.isFinite(score) ? score : sum(cells, (c) => parseInt(c, 10)),
      hits: Array.isArray(players) ? sum(players, (p) => p.batting?.hits) : null,
      errors: Array.isArray(players) ? sum(players, (p) => p.batting?.errors) : null,
    };
  };
  const d = game.decisions || {};
  const decisions = [
    ['勝', d.winningPitcher?.name],
    ['敗', d.losingPitcher?.name],
    ['S', d.savePitcher?.name],
    ['H', (d.holdPitchers || []).map((h) => h?.name).filter(Boolean).join('・')],
  ]
    .filter(([, name]) => name)
    .map(([label, name]) => ({ label, name }));
  return {
    innings,
    rows: [totals(game.away, top, game.awayScore), totals(game.home, bottom, game.homeScore)],
    decisions,
  };
}
