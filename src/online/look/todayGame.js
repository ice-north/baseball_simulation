// ============================================================
// 新しい見た目（試作）段3: 「今日の一戦」の札の中身（`TodayGame.jsx`）。ビューから作る。
//
// ⚠ 試合はビューの `nextGames`（近い順。自球団の試合だけ）の先頭。いまのターンの試合なら
//    「今日の一戦」、先の試合なら「次の一戦」（休養日・手続きの日）。
// ⚠ 順位は部の中の順（`compareLeagueStanding`。順位表の画面と同じ並べ方）。
// ⚠ アプリの試合タブの札（`TodayGameCard.kt`）も同じ文にする。
// ============================================================
import { compareLeagueStanding, PYRAMID_LEAGUES } from '../pyramidLeague.js';
import { turnOfDate } from '../shared.js';
import { teamLook } from './teamLook.js';
import { crowdLevel } from './sceneArt.js';

const DAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 先発の1行（「0勝1敗 防23.63」）。投げていなければ防御率は「—」 */
const starterLine = (info) =>
  `${info.wins || 0}勝${info.losses || 0}敗 ${info.era == null ? '防—' : `防${Number(info.era).toFixed(2)}`}`;

/** 部の中の順位と成績（「2部2位 5勝4敗」） */
function standingOf(view, team) {
  const league = view.teamLeagues?.[team];
  const rows = (view.standings || [])
    .filter((s) => !league || view.teamLeagues?.[s.team] === league)
    .slice()
    .sort(compareLeagueStanding);
  const index = rows.findIndex((s) => s.team === team);
  const row = rows[index];
  const name = PYRAMID_LEAGUES.find((l) => l.id === league)?.name || '';
  if (!row) return { rank: null, rows, record: '', teams: rows.length };
  const draws = row.draws ? `${row.draws}分` : '';
  return {
    rank: index + 1,
    rows,
    row,
    teams: rows.length,
    record: `${name}${index + 1}位　${row.wins || 0}勝${row.losses || 0}敗${draws}`,
  };
}

/** 自球団のひとこと（首位との差・連勝） */
function noteOf(view, standing) {
  const parts = [];
  const { rank, rows, row } = standing;
  if (row && rows.length > 1) {
    const gap = (a, b) => ((a.wins || 0) - (b.wins || 0) + ((b.losses || 0) - (a.losses || 0))) / 2;
    if (rank === 1) {
      const lead = gap(row, rows[1]);
      parts.push(lead > 0 ? `首位・2位と${lead.toFixed(1)}差` : '首位タイ');
    } else {
      const behind = gap(rows[0], row);
      parts.push(behind > 0 ? `首位と${behind.toFixed(1)}差` : '首位と0.0差');
    }
  }
  const streak = view.teamStreaks?.[view.teamName];
  if (streak?.count >= 2 && streak.kind === 'W') parts.push(`${streak.count}連勝中`);
  if (streak?.count >= 2 && streak.kind === 'L') parts.push(`${streak.count}連敗中`);
  return parts.join('　');
}

/**
 * 札の中身。自球団の試合が無ければ null。
 * @returns `{ title, when, place, home, city, crowd, note, own, foe }`。
 *   `own` / `foe` は `{ team, record, color, starter: { id, name, age, condition, mark, line } | null }`
 */
export function todayGameCard(view) {
  const game = (view?.nextGames || []).find((g) => g.home === view.teamName || g.away === view.teamName);
  if (!game) return null;
  const now = turnOfDate(view.currentDate, view.seasonTurns);
  const turn = turnOfDate(game.date, view.seasonTurns);
  const today = now != null && turn === now;
  const homeGame = game.home === view.teamName;
  const d = game.date || {};
  const weekday = d.year ? DAYS[new Date(Date.UTC(d.year, (d.month || 1) - 1, d.day || 1)).getUTCDay()] : '';
  const sideOf = (team) => {
    const isHome = team === game.home;
    const info = isHome ? game.homeStarterInfo : game.awayStarterInfo;
    const name = info?.name || (isHome ? game.homeStarter : game.awayStarter) || null;
    const mark = isHome ? game.homeStarterMark : game.awayStarterMark;
    const standing = standingOf(view, team);
    return {
      team,
      record: standing.record,
      standing,
      color: teamLook(team)?.c2 || '#94a3b8',
      starter: name
        ? {
            id: info?.id ?? null,
            name,
            age: info?.age,
            condition: info?.condition,
            mark: mark === 'fixed' ? '予告先発' : '先発予定',
            line: info ? starterLine(info) : '',
          }
        : null,
    };
  };
  const own = sideOf(view.teamName);
  const foe = sideOf(homeGame ? game.away : game.home);
  const homeSide = homeGame ? own : foe;
  const city = view.teamLabels?.[game.home]?.city || '';
  return {
    title: today ? '今日の一戦' : '次の一戦',
    when: `${d.month || ''}月${d.day || ''}日${weekday ? `（${weekday}）` : ''}${turn ? `　第${turn}ターン` : ''}`,
    place: homeGame ? 'ホーム' : `ビジター（${city || '相手の本拠地'}）`,
    home: game.home,
    city,
    crowd: crowdLevel(homeSide.standing.rank, homeSide.standing.teams, streakValue(view.teamStreaks?.[game.home])),
    note: noteOf(view, own.standing),
    own,
    foe,
  };
}

/** 連勝はプラス・連敗はマイナス（客の入り） */
const streakValue = (s) => (!s ? 0 : s.kind === 'W' ? s.count : s.kind === 'L' ? -s.count : 0);
