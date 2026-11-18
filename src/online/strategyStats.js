// ============================================================
// 作戦別成績（B2）。その試合で敷いていた方針（打撃・投球・走塁・守備）ごとに、
// 自球団の今季の試合をまとめる。
//
// ⚠ 先方回答（2026-11-16）「余裕があれば」B2。守備シフト・前進守備・打撃方針は能力が直接変わる作りだが、
//    効いたかどうかが見えなかった。
// ⚠ 記録は試合の箱（`records.seasons[年].games[id]`）に方針の印 `strategy` を1つ足すだけ
//    （球団ごとに標準と違う方針だけ。標準だけの試合は `{}`）。印の無い試合（この版より前）は数えない。
// ⚠ **自球団だけ**見せる（人の球団の采配は出さない。`teamStaffView` と同じ線引き）。
// ⚠ 見せるだけ。試合の数字・乱数には触らない。
// ============================================================
import { STRATEGY_FIELDS, STRATEGY_DEFAULTS } from './tactics.js';

/** 方針の項目の並び（画面の表の順） */
export const STRATEGY_STAT_FIELDS = ['batting', 'baseRunning', 'pitching', 'defense'];
/** その項目が攻め（自球団の打撃を見る）か守り（相手の打撃を見る）か */
export const STRATEGY_STAT_SIDE = { batting: 'offense', baseRunning: 'offense', pitching: 'defense', defense: 'defense' };

/** 試合の箱に残す印（標準と違う方針だけ） */
export function strategyMark(strategy) {
  const out = {};
  for (const key of STRATEGY_STAT_FIELDS) {
    const v = strategy?.[key];
    if (v && v !== STRATEGY_DEFAULTS[key] && STRATEGY_FIELDS[key][1][v]) out[key] = v;
  }
  return out;
}

const n = (v) => (Number.isFinite(v) ? v : 0);
const sumBatting = (rows) => {
  const t = { pa: 0, ab: 0, h: 0, hr: 0, bb: 0, so: 0, sb: 0 };
  for (const r of rows || []) {
    const b = r.batting || {};
    t.pa += n(b.plateAppearances);
    t.ab += n(b.atBats);
    t.h += n(b.hits);
    t.hr += n(b.homeruns);
    t.bb += n(b.walks) + n(b.hitByPitch);
    t.so += n(b.strikeouts);
    t.sb += n(b.stolenBases);
  }
  return t;
};
const rate3 = (num, den) => (den > 0 ? (num / den).toFixed(3).replace(/^0/, '') : '-');
const perGame = (v, g) => (g > 0 ? (v / g).toFixed(1) : '-');

/**
 * 作戦別成績。`games`: 今季の試合の箱。戻り値は項目ごとの行（使った方針だけ。試合の多い順）。
 * 行の `cells` は画面にそのまま並べる文字（PC・スマホWeb・アプリで同じ）。
 * @returns {{ games: number, fields: { key: string, label: string, side: string, rows: object[] }[] } | null}
 */
export function strategyStats(games, teamName) {
  const acc = {};
  let counted = 0;
  for (const g of Object.values(games || {})) {
    if (!g?.strategy || !g.teams?.[teamName]) continue;
    if (g.homeScore == null || g.awayScore == null) continue;
    counted += 1;
    const home = g.home === teamName;
    const opp = home ? g.away : g.home;
    const runs = home ? g.homeScore : g.awayScore;
    const allowed = home ? g.awayScore : g.homeScore;
    const own = sumBatting(g.teams[teamName]);
    const theirs = sumBatting(g.teams[opp]);
    const mark = g.strategy[teamName] || {};
    for (const key of STRATEGY_STAT_FIELDS) {
      const value = mark[key] || STRATEGY_DEFAULTS[key];
      const a = ((acc[key] ||= {})[value] ||= { games: 0, wins: 0, losses: 0, draws: 0, runs: 0, allowed: 0, own: sumBatting([]), opp: sumBatting([]) });
      a.games += 1;
      if (runs > allowed) a.wins += 1;
      else if (runs < allowed) a.losses += 1;
      else a.draws += 1;
      a.runs += runs;
      a.allowed += allowed;
      for (const k of Object.keys(a.own)) {
        a.own[k] += own[k];
        a.opp[k] += theirs[k];
      }
    }
  }
  if (!counted) return null;
  const fields = STRATEGY_STAT_FIELDS.map((key) => {
    const [label, options] = STRATEGY_FIELDS[key];
    const side = STRATEGY_STAT_SIDE[key];
    const rows = Object.entries(acc[key] || {})
      .map(([value, a]) => {
        const b = side === 'offense' ? a.own : a.opp;
        return {
          value,
          label: options[value] || value,
          games: a.games,
          record: `${a.wins}勝${a.losses}敗${a.draws ? `${a.draws}分` : ''}`,
          runs: perGame(a.runs, a.games),
          allowed: perGame(a.allowed, a.games),
          avg: rate3(b.h, b.ab),
          obp: rate3(b.h + b.bb, b.pa),
          homeruns: b.hr,
          strikeouts: perGame(b.so, a.games),
          stolenBases: a.own.sb,
        };
      })
      .sort((x, y) => y.games - x.games || x.value.localeCompare(y.value))
      // 画面にそのまま並べる文字（列は `columns`）。アプリはこれだけを読む
      .map((r) => ({ ...r, cells: STRATEGY_STAT_COLUMNS[side].map(([k]) => String(r[k])) }));
    return { key, label, side, columns: STRATEGY_STAT_COLUMNS[side].map(([, l]) => l), rows };
  });
  return { games: counted, fields };
}

/** 表の列（攻め: 自球団の打撃、守り: 相手の打撃）。PC・スマホWeb・アプリで同じ見出し */
export const STRATEGY_STAT_COLUMNS = {
  offense: [
    ['games', '試合'], ['record', '勝敗'], ['runs', '得点/試合'], ['avg', '打率'], ['obp', '出塁率'], ['homeruns', '本塁打'], ['stolenBases', '盗塁'],
  ],
  defense: [
    ['games', '試合'], ['record', '勝敗'], ['allowed', '失点/試合'], ['avg', '被打率'], ['obp', '被出塁率'], ['homeruns', '被本塁打'], ['strikeouts', '奪三振/試合'],
  ],
};
