import { teamMoves } from './chronicle.mjs';
import { honorsView } from './seasonAwards.mjs';
import { PYRAMID_LEAGUES, compareLeagueStanding } from '../src/online/pyramidLeague.js';
import { isYearSummaryTime } from '../src/online/shared.js';

// ============================================================
// その年のまとめ（年度更新の直後に出す）。
//
// 【なぜ】いしだ 2026-11-18「トライアウト後の年度更新の際に、キャンプの結果や
//   オフの成長は要りません。その年の順位、入退団の選手、主なトピックに止めて下さい」。
//   年が替わった画面には、キャンプの結果（前の年の2月の話）と年度更新の伸び（能力の
//   細かい増減）が並んでいて、肝心の「その年がどうだったか」が無かった。
//
// ⚠ **保存を増やさない**。材料はすべてリーグの中にある（年度の記録 `history`・
//    取引の記録 `transactions`・球団史 `chronicle`）ので、ビューを作るときに組む。
//    保存の形を変えないので `ONLINE_SCHEMA` は上げない。
// ⚠ 出すのは**3つだけ**（順位・入退団・主なトピック）。増やすときは、
//    「年が替わったときに読みたいか」で決める。
// ============================================================

/** 部の並び（昇格・降格の向きを決める） */
const LEAGUE_ORDER = PYRAMID_LEAGUES.map((l) => l.id);
const leagueNameOf = (id) =>
  PYRAMID_LEAGUES.find((l) => l.id === id)?.name || id || null;

/**
 * その年のまとめ。年度の記録がまだ無ければ null（1年目のシーズン前）。
 * @param labelOf 球団名 → 表示名
 */
export function yearSummaryFor(league, teamName, labelOf = (n) => n, honors = undefined) {
  const entry = league?.history?.at?.(-1);
  if (!entry || !teamName) return null;
  const year = entry.year;
  // ⚠ **出す時期の外では組まない・載せない**（画面は時期の外では出さないので、
  //    1年の大半は毎回の応答に使わないまとめが乗っていた）
  if (!isYearSummaryTime(year, league.season?.year, league.season?.currentDate)) return null;
  const leagues = entry.leagues || {};
  const myLeague = leagues[teamName] ?? null;
  // ⚠ 順位は**自分の部だけ**（1部と2部を混ぜると「10位」のような順位になる）
  const rows = (entry.standings || [])
    .filter((s) => myLeague == null || leagues[s.team] === myLeague)
    .slice()
    .sort(compareLeagueStanding)
    .map((s, i) => ({
      rank: i + 1,
      team: s.team,
      label: labelOf(s.team),
      wins: s.wins ?? 0,
      losses: s.losses ?? 0,
      draws: s.draws ?? 0,
      mine: s.team === teamName,
    }));
  const mine = rows.find((r) => r.mine) || null;
  // 昇降格は**いまの所属と比べて**出す（`entry.moves` は球団の識別子なので、
  // 名前で引けないことがある）
  const nowLeague =
    (league.teams || []).find((t) => t.name === teamName)?.league ?? myLeague;
  const from = LEAGUE_ORDER.indexOf(myLeague);
  const to = LEAGUE_ORDER.indexOf(nowLeague);
  const move =
    from >= 0 && to >= 0 && from !== to
      ? { to: leagueNameOf(nowLeague), up: to < from }
      : null;

  // --- 入退団（その年のぶんだけ）。材料は球団史と同じ `teamMoves`
  // ⚠ 件数で切らずに年で絞る（`teamMoves` の既定の80件で切ると、取引の多い球団で
  //    その年の分が欠けうる）
  const moves = teamMoves(league, teamName, Infinity).filter((m) => m.year === year);
  const joined = moves.filter((m) => m.side === 'in');
  const left = moves.filter((m) => m.side === 'out');

  // --- 主なトピック（短い文で数行）
  const topics = [];
  if (entry.playoffChampion)
    topics.push(
      entry.playoffChampion === teamName
        ? 'プレーオフ優勝'
        : `プレーオフは${labelOf(entry.playoffChampion)}が優勝`,
    );
  if (mine?.rank === 1 && entry.playoffChampion !== teamName)
    topics.push(`${leagueNameOf(myLeague) || 'リーグ'}1位`);
  if (move) topics.push(`${move.to}へ${move.up ? '昇格' : '降格'}`);
  // 自球団の選手が取った賞（タイトル・MVP・新人王・ベストナイン・最優秀バッテリー）
  // ⚠ 同じ応答の球団史（`chronicleView`）で組んだものがあれば使い回す
  if (honors === undefined)
    honors = honorsView(
      league,
      Object.fromEntries(PYRAMID_LEAGUES.map((l) => [l.id, l.name])),
    );
  if (honors?.year === year) {
    for (const t of honors.titles || [])
      if (t.team === teamName) topics.push(`${t.name}が${t.label}${t.line ? `（${t.line}）` : ''}`);
    for (const l of honors.leagues || []) {
      if (l.mvp?.team === teamName) topics.push(`${l.mvp.name}が${l.league}MVP`);
      if (l.rookie?.team === teamName) topics.push(`${l.rookie.name}が${l.league}新人王`);
      if (l.battery?.team === teamName)
        topics.push(`${l.battery.pitcher}・${l.battery.catcher}が${l.league}最優秀バッテリー`);
      for (const b of l.bestNine || [])
        if (b.team === teamName) topics.push(`${b.name}が${l.league}ベストナイン（${b.label}）`);
    }
  }
  // 節目（通算の記録など）。その年の自球団のぶんだけ、新しいものから2つ
  // ⚠ 節目に文は入っていない（画面が `milestoneText` で組む）。ここでは名前＋中身で短く
  let milestones = 0;
  for (const m of league.chronicle?.milestones || []) {
    if (m.team !== teamName || m.year !== year || !m.label) continue;
    topics.push(`${m.name}が${m.label}`);
    if (++milestones >= 2) break;
  }

  return {
    year,
    league: leagueNameOf(myLeague),
    rank: mine?.rank ?? null,
    record: mine ? { wins: mine.wins, losses: mine.losses, draws: mine.draws } : null,
    standings: rows,
    champion: entry.playoffChampion ? labelOf(entry.playoffChampion) : null,
    move,
    joined,
    left,
    // ⚠ 長くしない（年が替わった画面で読み飛ばされる）。多ければ上から8つ
    topics: topics.slice(0, 8),
  };
}
