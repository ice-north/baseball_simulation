import { SEASON_PHASES } from './seasonManager.js';

// 順位表の「M」（優勝マジック）と優勝決定。勝ち数で数える（以前からの物差しのまま）。
// ⚠ マジックは**点灯してから**出す: 追う球団のどれも、直接対決を含めて残りを全部勝っても、
//    首位がほかの試合を全部勝てば上に立てない状態になってから。以前は2位の「最大の勝ち数＋1−首位の勝ち数」
//    をそのまま出していたので、開幕前（0試合）から「M31」が出ていた（オンラインの `canPassAlone` と同じ考え方）
// ⚠ 2位だけでなく追う球団すべてと比べる（消化試合数が違うと、3位以下のほうが最大の勝ち数が多いことがある）

const played = (t) => (t.wins || 0) + (t.losses || 0) + (t.draws || 0);

/** レギュラーシーズンの残りの直接対決の数（`"球団A|球団B"`。名前の順に並べた鍵） */
export const remainingHeadToHead = (schedule) => {
  const out = {};
  for (const g of schedule || []) {
    if (g.phase !== SEASON_PHASES.REGULAR_SEASON || g.result) continue;
    const key = [g.home, g.away].sort().join('|');
    out[key] = (out[key] || 0) + 1;
  }
  return out;
};

/**
 * `sorted` は順位の順に並んだ1リーグ分の行。
 * 返り値: `decided`（首位の優勝が決まった）、`magic`（点灯していれば数、していなければ null）
 */
export const leagueMagic = (sorted, totalGames, pairs) => {
  const lead = sorted?.[0];
  if (!lead || sorted.length < 2) return { decided: false, magic: null };
  const left = (t) => Math.max(0, totalGames - played(t));
  const maxWins = (t) => (t.wins || 0) + left(t);
  const leadWins = lead.wins || 0;
  const chasers = sorted.slice(1);
  const bestChaser = Math.max(...chasers.map(maxWins));
  const decided = leadWins > bestChaser;
  if (decided) return { decided, magic: null };
  const h2h = (c) => pairs?.[[c.team, lead.team].sort().join('|')] || 0;
  // 首位が直接対決を全部落とし、ほかを全部勝ったときの勝ち数に、追う球団が届かないか
  const lit = chasers.every((c) => maxWins(c) < leadWins + left(lead) - h2h(c));
  return { decided, magic: lit ? bestChaser - leadWins + 1 : null };
};
