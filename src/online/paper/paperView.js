// ============================================================
// スポーツ新聞（PC）が読むビューの形。アプリの `Models.kt`（LeagueView ほか）と同じ既定値に直す。
// ⚠ 紙面の文はアプリと同じにする（`kt.js` の先頭）。ビューに無い項目の扱い（0 や空）もアプリに合わせる。
// ============================================================
import { cmpStr } from './kt.js';

export const SEASON_TURNS = 160;
export const SEASON_START_MONTH = 4;
export const LEAGUE_NAMES = { A: '1部', B: '2部' };
export const STATUS_LABELS = { running: '進行中', waiting: '決定待ち', paused: '一時停止', error: '要確認・停止中' };
export const POSITION_LABELS = {
  pitcher: '投', catcher: '捕', first: '一', second: '二', third: '三', short: '遊', left: '左', center: '中', right: '右',
};
/** 野手が休む疲れ（Tables.kt FIELDER_REST_FATIGUE） */
export const FIELDER_REST_FATIGUE = 80;

const date = (d) => (d && typeof d === 'object' && Number.isFinite(d.year) ? { year: d.year, month: d.month ?? 1, day: d.day ?? 1 } : null);
const ref = (p) => (p ? { id: p.id ?? null, name: p.name ?? null } : null);
const decisions = (d) =>
  d ? { winningPitcher: ref(d.winningPitcher), losingPitcher: ref(d.losingPitcher), savePitcher: ref(d.savePitcher) } : null;

export const gameResult = (g) => ({
  gameId: g.gameId ?? null,
  date: date(g.date),
  home: g.home,
  away: g.away,
  homeScore: Number.isFinite(g.homeScore) ? g.homeScore : null,
  awayScore: Number.isFinite(g.awayScore) ? g.awayScore : null,
  decisions: decisions(g.decisions),
});

const starter = (s) =>
  s ? { id: s.id ?? null, name: s.name ?? null, wins: s.wins ?? 0, losses: s.losses ?? 0, era: Number.isFinite(s.era) ? s.era : null } : null;

/** 名簿の1人（Models.kt の Player。既定値も同じ） */
export function player(p) {
  const metrics = p.performance?.batting?.metrics;
  const m = metrics
    ? {
        pa: metrics.pa ?? 0,
        avg: metrics.avg ?? null,
        obp: metrics.obp ?? null,
        iso: metrics.iso ?? null,
        homeruns: metrics.homeruns ?? 0,
        stolenBases: metrics.stolenBases ?? 0,
      }
    : null;
  if (m) m.ops = m.obp != null && m.avg != null && m.iso != null ? m.obp + m.avg + m.iso : null;
  const st = p.seasonStats;
  return {
    id: p.id,
    name: p.name,
    age: p.age ?? null,
    position: p.position,
    isActive: p.isActive ?? true,
    isPitcher: p.position === 'pitcher',
    condition: p.condition ?? null,
    fatigue: p.fatigue ?? null,
    batting: p.batting || null,
    pitching: p.pitching || null,
    physical: p.physical || null,
    performance: p.performance
      ? { batting: p.performance.batting ? { metrics: m, labels: p.performance.batting.labels || [] } : null }
      : null,
    growthPotential: p.growthPotential ?? null,
    origin: p.origin || null,
    careerHistory: p.careerHistory || [],
    seasonStats: st
      ? {
          batting: st.batting
            ? { games: st.batting.games ?? 0, atBats: st.batting.atBats ?? 0, hits: st.batting.hits ?? 0, homeruns: st.batting.homeruns ?? 0, rbis: st.batting.rbis ?? 0 }
            : null,
          pitching: st.pitching
            ? { games: st.pitching.games ?? 0, wins: st.pitching.wins ?? 0, losses: st.pitching.losses ?? 0, saves: st.pitching.saves ?? 0, holds: st.pitching.holds ?? 0 }
            : null,
        }
      : null,
    recent: p.recent
      ? { games: p.recent.games ?? 0, atBats: p.recent.atBats ?? 0, hits: p.recent.hits ?? 0, hitStreak: p.recent.hitStreak ?? 0 }
      : null,
  };
}

const withDefaults = (o, d) => ({ ...d, ...Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null)) });

/** ビュー（server/projection.mjs の projectLeague）を紙面用の形に */
export function paperView(raw) {
  const v = raw || {};
  const c = v.chronicle || {};
  const view = {
    raw: v,
    teamName: v.teamName ?? null,
    year: v.year ?? null,
    status: v.status ?? null,
    currentDate: date(v.currentDate),
    seasonTurns: v.seasonTurns ?? SEASON_TURNS,
    teamLabels: v.teamLabels || {},
    teamLeagues: v.teamLeagues || {},
    members: v.members || [],
    teamOwners: v.teamOwners || {},
    standings: (v.standings || []).map((s) => ({
      team: s.team,
      wins: s.wins ?? 0,
      losses: s.losses ?? 0,
      draws: s.draws ?? 0,
      winRate: s.winRate ?? 0,
      gamesPlayed: s.gamesPlayed ?? 0,
    })),
    teamStreaks: Object.fromEntries(
      Object.entries(v.teamStreaks || {}).map(([k, s]) => [k, { kind: s?.kind ?? '', count: s?.count ?? 0 }]),
    ),
    results: (v.results || []).map(gameResult),
    nextGames: (v.nextGames || []).map((g) => ({
      ...gameResult(g),
      homeStarterInfo: starter(g.homeStarterInfo),
      awayStarterInfo: starter(g.awayStarterInfo),
    })),
    roster: (v.roster || []).map(player),
    lineup: v.lineup ?? null,
    phase: v.phase ?? null,
    pendingPack: v.pendingPack ?? null,
    races: (v.races || []).map((r) =>
      withDefaults(r, { league: null, leagueName: '', kind: '', team: '', magic: 0, clinched: false, rival: null, left: 0 }),
    ),
    chronicle: {
      milestones: (c.milestones || []).map((m) =>
        withDefaults(m, { year: 0, month: 0, day: 0, kind: '', side: '', stat: '', label: '', value: 0, team: '', name: '' }),
      ),
      retired: (c.retired || []).map((r) =>
        withDefaults(r, { year: 0, team: '', name: '', age: null, position: null, seasons: 0, line: null, hallOfFame: false, secondCareer: null }),
      ),
      world: (c.world || []).map((w) => withDefaults(w, { kind: '', year: 0, month: 0, day: 0, champion: '', teams: 0 })),
      honors: c.honors ? withDefaults(c.honors, { year: 0, titles: [], leagues: [] }) : null,
      proNews: (c.proNews || []).map((n) => withDefaults(n, { name: '', team: '', npbTeam: '', text: '', highlight: null })),
    },
    seasonReview: v.seasonReview ? withDefaults(v.seasonReview, { year: 0, headline: '', lead: '', articles: [] }) : null,
    ties: (v.ties || []).map((t) => withDefaults(t, { kicker: '', title: '', body: '' })),
    staff: v.staff || null,
    leagueStaff: v.leagueStaff || null,
  };
  view.teamLabel = (name) => view.teamLabels[name]?.label ?? name;
  view.teamShort = (name) => view.teamLabels[name]?.short ?? name;
  view.leagueTable = (league) => leagueTable(view, league);
  return view;
}

/**
 * 部の中の並べ方（勝率→勝利数→球団名）。Web の `compareLeagueStanding` と同じ（FrontPage.kt の LEAGUE_STANDING_ORDER）
 */
export function leagueTable(view, league) {
  return view.standings
    .filter((s) => league == null || view.teamLeagues[s.team] === league)
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || cmpStr(a.team, b.team));
}

/** 日付の通し番号（年×10000＋月×100＋日） */
export const dayKey = (year, month, day) => year * 10000 + month * 100 + day;
export const dateKey = (d) => (d ? dayKey(d.year, d.month, d.day) : 0);
export const sameDate = (a, b) => a != null && b != null && a.year === b.year && a.month === b.month && a.day === b.day;

function daysFromCivil(y, m, d) {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.trunc((yy >= 0 ? yy : yy - 399) / 400);
  const yoe = yy - era * 400;
  const doy = Math.trunc((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.trunc(yoe / 4) - Math.trunc(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** シーズンの何ターン目か。範囲外は null（Text.kt turnOfDate） */
export function turnOfDate(date, turns = SEASON_TURNS) {
  if (!date) return null;
  const turn = daysFromCivil(date.year, date.month, date.day) - daysFromCivil(date.year, SEASON_START_MONTH, 1) + 1;
  return turn >= 1 && turn <= turns ? turn : null;
}

export function formatTurn(date, turns = SEASON_TURNS) {
  if (!date) return '';
  const turn = turnOfDate(date, turns);
  if (turn != null) return `第${turn}ターン / ${turns}`;
  return date.month < SEASON_START_MONTH ? '開幕前' : 'シーズン終了';
}
