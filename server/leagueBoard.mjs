import { PYRAMID_LEAGUES, standingsByLeague } from '../src/online/pyramidLeague.js';

// ============================================================
// 「今日」の画面に出す、リーグ全体の眺め。
//   1. 2部制の順位表（人が持っている球団はプレイヤー名を添える）
//   2. 今後の日程（対戦相手と先発予定）
//   3. 各項目のベスト5
//
// ⚠ **投影（表示用）であって、保存データではない**。ここで作った値を
//    判定や保存に使わないこと。内部名（`name`）での照合は呼ぶ側が行う。
// ⚠ 12球団×24人＝288人を毎回なめる。1回の投影で**1度だけ**呼ぶこと
//    （参加者ごとに呼ぶと人数ぶん重くなる）。
// ============================================================

/** 2部制の順位表。上の階層から順に返す */
export function divisionStandings(league, labelOf = (n) => n) {
  const teams = league.teams || [];
  const order = standingsByLeague(teams, league.season.standings || []);
  const byName = Object.fromEntries(
    (league.season.standings || []).map((s) => [s.team, s]),
  );
  // 人が持っている球団 → その人の呼び名
  const ownerOf = Object.fromEntries(
    (league.members || []).map((m) => [m.teamName, m.label || m.displayName]),
  );
  return [...PYRAMID_LEAGUES]
    .sort((a, b) => a.tier - b.tier)
    .map((division) => ({
      id: division.id,
      name: division.name,
      rows: (order[division.id] || []).map((name, index) => {
        const s = byName[name] || {};
        return {
          rank: index + 1,
          team: name,
          label: labelOf(name),
          // ⚠ 人が持っている球団かどうか。CPUとの区別はこれで行う
          human: Object.hasOwn(ownerOf, name),
          // ⚠ 呼び名が球団名と同じときは出さない。参加時の既定が球団名なので、
          //    そのままだと「湘南サンズ（湘南サンズ）」と2回並ぶ
          player:
            ownerOf[name] && ownerOf[name] !== labelOf(name)
              ? ownerOf[name]
              : null,
          wins: s.wins || 0,
          losses: s.losses || 0,
          draws: s.draws || 0,
          winRate: s.winRate || 0,
          gamesPlayed: s.gamesPlayed || 0,
        };
      }),
    }));
}

/**
 * これから行う試合。先発予定を添える。
 * ⚠ **予定であって確定ではない**。実際の先発は試合当日の疲労で入れ替わる
 *    （`prepareDailyLineup` が疲れた投手を外す）。画面にもそう書くこと。
 */
export function upcomingGames(league, teams, limit = 8) {
  // 球団ごとに「あと何試合目か」を数えて、ローテを回した位置を見る
  const seen = {};
  const nextStarter = (name, offset) => {
    const rotation = teams[name]?.pitchingRotation;
    const list = rotation?.starters || [];
    if (!list.length) return null;
    const base = rotation.currentStarterIndex || 0;
    const id = list[(base + offset) % list.length];
    return teams[name].players.find((p) => p.id === id)?.name || null;
  };
  return (league.season.schedule || [])
    .filter((g) => !g.result && g.home !== 'TBD' && g.away !== 'TBD')
    .slice(0, limit)
    .map((g) => {
      const homeOffset = seen[g.home] || 0;
      const awayOffset = seen[g.away] || 0;
      seen[g.home] = homeOffset + 1;
      seen[g.away] = awayOffset + 1;
      return {
        id: g.id,
        date: g.date,
        home: g.home,
        away: g.away,
        homeStarter: nextStarter(g.home, homeOffset),
        awayStarter: nextStarter(g.away, awayOffset),
      };
    });
}

// ⚠ 率の項目は**規定に届いた選手だけ**で競う。届かない人を混ぜると、
//    3打数2安打の控えが打率1位になって順位表として意味を成さない。
const PLATE_PER_GAME = 3.1;
const INNINGS_PER_GAME = 1;

const LEADER_CATEGORIES = [
  {
    id: 'avg', label: '打率', side: 'batting', digits: 3, desc: true, qualified: true,
    of: (s) => (s.atBats > 0 ? s.hits / s.atBats : null),
  },
  { id: 'homeruns', label: '本塁打', side: 'batting', desc: true, of: (s) => s.homeruns },
  { id: 'rbis', label: '打点', side: 'batting', desc: true, of: (s) => s.rbis },
  { id: 'stolenBases', label: '盗塁', side: 'batting', desc: true, of: (s) => s.stolenBases },
  {
    id: 'era', label: '防御率', side: 'pitching', digits: 2, desc: false, qualified: true,
    of: (s) => (s.inningsPitched > 0 ? (s.earnedRuns * 27) / s.inningsPitched : null),
  },
  { id: 'wins', label: '勝利', side: 'pitching', desc: true, of: (s) => s.wins },
  { id: 'strikeouts', label: '奪三振', side: 'pitching', desc: true, of: (s) => s.strikeouts },
  { id: 'saves', label: 'セーブ', side: 'pitching', desc: true, of: (s) => s.saves },
];

/**
 * 各項目のベスト5。
 * ⚠ 並びを決定的にすること（同値は名前で分ける）。実行のたびに順位が
 *    入れ替わると、見るたび違う人が1位になる。
 */
export function leagueLeaders(league, statsOf, labelOf = (n) => n, top = 5) {
  const names = league.season.settings.teamNames || [];
  const played = Object.fromEntries(
    (league.season.standings || []).map((s) => [s.team, s.gamesPlayed || 0]),
  );
  const entries = [];
  for (const team of names) {
    for (const player of league.game.teams[team]?.players || []) {
      entries.push({ team, player, stats: statsOf(team, player) });
    }
  }
  return LEADER_CATEGORIES.map((category) => {
    const rows = entries
      .map((entry) => {
        const stats = entry.stats?.[category.side];
        if (!stats) return null;
        if (category.qualified) {
          const games = played[entry.team] || 0;
          const enough =
            category.side === 'batting'
              ? (stats.atBats || 0) + (stats.walks || 0) >= games * PLATE_PER_GAME
              : (stats.inningsPitched || 0) / 3 >= games * INNINGS_PER_GAME;
          if (!enough) return null;
        }
        const value = category.of(stats);
        if (value === null || value === undefined || !Number.isFinite(value))
          return null;
        if (!category.qualified && value <= 0) return null;
        return {
          name: entry.player.name,
          team: entry.team,
          label: labelOf(entry.team),
          value,
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          (category.desc ? b.value - a.value : a.value - b.value) ||
          a.name.localeCompare(b.name, 'ja'),
      )
      .slice(0, top);
    return { id: category.id, label: category.label, digits: category.digits || 0, rows };
  });
}
