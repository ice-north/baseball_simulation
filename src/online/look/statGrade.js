// 新しい見た目（試作）: 成績の数字に、能力と同じ S〜F の札を付ける（いしだ依頼 2026-11-23
// 「数字に意味の色」。先方は能力値の前の S〜F の札をとても気に入っている）。
//
// ⚠ 物差しは**リーグ平均との比**。打率 .250 が良いか悪いかは部や年で変わる（独立リーグの
//    チーム打率は .2 前後、1部はもっと高い）ので、決まった値で切らない。平均は自球団と
//    同じ部の球団の `view.teamStats`（サーバーの `teamSeasonStats`）から出す。
// ⚠ 出場の少ない人には付けない（3打数2安打で S になる）。目安は打者が「試合数×1打席」、
//    投手が「試合数×1アウト」（救援の柱も入る）。
// ⚠ 区切りの比は、1季（105試合）を回して出場の目安を満たした選手（打者147人・投手130人）の
//    上位 3%・10%・25%・50%・75%・90% がおおよそ S・A・B・C・D・E の下限になるように決めた
//    （2026-11-23 に一時スクリプトで測った。OPS は 1.47/1.26/1.13/0.95/0.84/0.74、
//    防御率（平均÷本人）は 2.31/1.69/1.29/0.99/0.78/0.59）。
//    アプリの `LookGrade.kt` が写し。変えたら両方を直す。

/** 札を付ける列と、平均の名前・向き（`asc` は小さいほど良い） */
const GRADED = {
  avg: { key: 'average', side: 'batting' },
  obp: { key: 'obp', side: 'batting' },
  slg: { key: 'slg', side: 'batting' },
  ops: { key: 'ops', side: 'batting' },
  era: { key: 'era', side: 'pitching', asc: true },
};
/** 比（良いほど大きい）→ 段位。上から順に見る */
const BANDS = {
  batting: [
    ['S', 1.4],
    ['A', 1.25],
    ['B', 1.12],
    ['C', 0.96],
    ['D', 0.85],
    ['E', 0.75],
  ],
  // 防御率は散らばりが大きい（少ない回で大きく動く）ので幅を広く取る
  pitching: [
    ['S', 2.2],
    ['A', 1.6],
    ['B', 1.25],
    ['C', 0.97],
    ['D', 0.78],
    ['E', 0.6],
  ],
};

export const isGradedColumn = (column) => !!column && Object.hasOwn(GRADED, column.id);

/**
 * その球団（省くと自球団）と同じ部の平均（球団ごとの値をならす）と、その球団の試合数。
 * 値の無い球団（開幕前）は数えない。1球団も無ければ `null`。
 * @param team 見ている球団（他球団の表に札を付けるとき）。`view` は自分のビュー
 */
export function leagueBaseline(view, team = view?.teamName) {
  const stats = view?.teamStats;
  if (!stats) return null;
  const own = view.teamLeagues?.[team];
  const teams = Object.keys(stats).filter(
    (team) => !own || !view.teamLeagues || view.teamLeagues[team] === own,
  );
  const mean = (pick) => {
    const list = teams.map((team) => pick(stats[team])).filter((v) => typeof v === 'number' && Number.isFinite(v));
    return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
  };
  const obp = mean((s) => s?.obp);
  const slg = mean((s) => s?.slg);
  const games = view.standings?.find((s) => s.team === team)?.gamesPlayed ?? 0;
  return {
    average: mean((s) => s?.average),
    era: mean((s) => s?.era),
    obp,
    slg,
    ops: obp != null && slg != null ? obp + slg : null,
    games,
  };
}

/** 出場が足りているか（打者は打席、投手はアウト数） */
function enough(player, side, games) {
  if (!games) return false;
  if (side === 'pitching') return (player?.seasonStats?.pitching?.inningsPitched || 0) >= games;
  const b = player?.seasonStats?.batting || {};
  const pa = (b.atBats || 0) + (b.walks || 0) + (b.hitByPitch || 0) + (b.sacrificeFlies || 0) + (b.sacrificeBunts || 0);
  return pa >= games;
}

/** 比 → 段位（S〜F） */
export function gradeOfRatio(ratio, side) {
  if (!Number.isFinite(ratio)) return null;
  for (const [rank, min] of BANDS[side]) if (ratio >= min) return rank;
  return 'F';
}

/**
 * その列のその値の段位（S〜F）。付けない列・平均が無い・出場が少ないときは `null`。
 * @param column `statsView.js` の列
 */
export function statGrade(column, value, player, baseline) {
  const spec = column && GRADED[column.id];
  if (!spec || !baseline) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const mean = baseline[spec.key];
  if (!mean || !enough(player, spec.side, baseline.games)) return null;
  // 防御率0（自責0）は比が無限になるので S にする
  const ratio = spec.asc ? (value > 0 ? mean / value : Infinity) : value / mean;
  return ratio === Infinity ? 'S' : gradeOfRatio(ratio, spec.side);
}
