// ============================================================
// オーナーの通算記録（オーナー名鑑）。
//
// ⚠ 先方回答（2026-11-16）「余裕があれば」A4。参加者にはシーズンをまたぐ記録が無かった。
//    年ごとの順位・昇降格・優勝・表彰・プロへ送った人数を、人ごとにまとめる。
// ⚠ **新しい記録は足さない**（参加した年 `member.joinedYear` だけ）。年表は球団の年表（`teamSeasons`、
//    `league.history` から作る）を、その人が球団を持っていた年だけ数える。球団は内部の名前で引くので、
//    球団名（見せる名前）を変えても続く。
// ⚠ 途中で参加した人は、参加した年から数える。参加した年の無い人（作ったときからの人・
//    この版より前に途中参加した人）は、球団の全部の年を数える。
// ⚠ 文はサーバーが作り、PC・スマホWeb・アプリはそのまま出す。
// ============================================================
import { teamSeasons } from './chronicle.mjs';

/** Aクラス（部の上半分）とみなす順位 */
const A_CLASS = 3;

/**
 * 参加者ごとの通算（`chronicleView` の `owners`）。勝ちの多い順ではなく、
 * 優勝 → 1部の年数 → 年数 の順に並べる（長く続けた人と勝った人が上）。
 */
export function ownerRecords(league) {
  const out = [];
  for (const m of league.members || []) {
    if (!m.teamName) continue;
    const since = Number.isFinite(m.joinedYear) ? m.joinedYear : null;
    const rows = teamSeasons(league, m.teamName).filter((r) => since == null || r.year >= since);
    const pro = (league.chronicle?.proDrafted || []).filter(
      (r) => r.team === m.teamName && (since == null || r.year >= since),
    ).length;
    const top = rows.filter((r) => r.league === '1部').length;
    const champions = rows.filter((r) => r.champion).length;
    const promotions = rows.filter((r) => r.move === '昇格').length;
    const titles = rows.reduce((n, r) => n + (r.titles?.length || 0), 0);
    // いちばん良い順位（1部を上に）
    const best = rows
      .filter((r) => r.rank)
      .sort((a, b) => (a.league === '1部' ? 0 : 1) - (b.league === '1部' ? 0 : 1) || a.rank - b.rank || b.year - a.year)[0];
    // 直近から続くAクラス（rows は新しい順）
    let streak = 0;
    for (const r of rows) {
      if (r.rank && r.rank <= A_CLASS) streak += 1;
      else break;
    }
    const line = rows.length
      ? `${rows.length}シーズン・1部${top}年・優勝${champions}回・昇格${promotions}回・タイトル${titles}・プロ入り${pro}人`
      : 'まだ終えたシーズンがありません';
    const bestText = best ? `${best.league || ''}${best.rank}位（${best.year}年目）` : null;
    const milestone = milestoneOf(rows, streak);
    out.push({
      label: m.label || m.displayName || m.teamName,
      team: m.displayName || m.teamName,
      seasons: rows.length,
      top,
      champions,
      promotions,
      titles,
      pro,
      best: bestText,
      streak,
      milestone,
      // PC・スマホWeb・アプリはこの一文をそのまま出す
      text: [line, bestText && `最高は${bestText}`, milestone].filter(Boolean).join('。'),
    });
  }
  return out.sort((a, b) => b.champions - a.champions || b.top - a.top || b.seasons - a.seasons || a.label.localeCompare(b.label, 'ja'));
}

/**
 * 直近の年の節目（紙面に出す一行）。無ければ null。
 * 優勝 > 初の1部昇格 > 3年以上続くAクラス
 */
function milestoneOf(rows, streak) {
  const last = rows[0];
  if (!last) return null;
  const year = last.year;
  if (last.champion) {
    const n = rows.filter((r) => r.champion).length;
    return n === 1 ? `${year}年目に初めて優勝` : `${year}年目に優勝（${n}回目）`;
  }
  if (last.move === '昇格' && !rows.slice(1).some((r) => r.league === '1部' || r.move === '昇格'))
    return `${year}年目に初の1部昇格`;
  if (streak >= 3) return `${streak}年連続Aクラス`;
  return null;
}
