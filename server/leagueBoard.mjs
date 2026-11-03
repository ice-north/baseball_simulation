// ============================================================
// ホームに出すリーグ全体の眺めのうち、サーバーで作る分。
//   1. 今後の日程に重ねる先発予定（`withStarters`）
//   2. 各項目のベスト5（`leagueLeaders`）
//
// ⚠ 順位表の2部制分けは `projection.teamLeagues` ＋ 画面側の `Standings` が持つ。
//    ここで作り直さないこと（同じものが2つになる）。
//
// ⚠ **投影（表示用）であって、保存データではない**。ここで作った値を
//    判定や保存に使わないこと。内部名（`name`）での照合は呼ぶ側が行う。
// ⚠ 12球団×24人＝288人を毎回なめる。1回の投影で**1度だけ**呼ぶこと
//    （参加者ごとに呼ぶと人数ぶん重くなる）。
// ============================================================

/**
 * これから行う試合に**先発予定を重ねる**。
 *
 * ⚠ 並べ方（日付順・自球団を必ず含める）は `projection.upcomingGames` が正本。
 *    ここでは順番を変えず、先発だけ足す。並べ直すと出どころが2つになる。
 * ⚠ **予定であって確定ではない**。実際の先発は当日の疲労で入れ替わる
 *    （`prepareDailyLineup` が疲れた投手を外す）。画面にもそう書くこと。
 * ⚠ 同じ球団が続けて出るときは**ローテを回すこと**。毎回同じだと
 *    1人が全試合に先発する予定になる。
 */
export function withStarters(games, teams, statsOf = null) {
  const seen = {};
  const nextStarter = (name, offset) => {
    const rotation = teams[name]?.pitchingRotation;
    const list = rotation?.starters || [];
    if (!list.length) return null;
    const base = rotation.currentStarterIndex || 0;
    const id = list[(base + offset) % list.length];
    return teams[name].players.find((p) => p.id === id) || null;
  };
  // ⚠ 投げる手と今季成績は `statsOf` を渡したときだけ付ける。渡さない呼び出し
  //    （試合結果の画面が使う `upcoming`）は名前だけのままにする——あちらは
  //    一覧に出すだけで、投影を重くする意味がない。
  const profile = (teamName, player) => {
    if (!player) return null;
    const pitching = statsOf(teamName, player)?.pitching;
    const outs = pitching?.inningsPitched || 0;
    return {
      name: player.name,
      // ⚠ 投げる手は `physical.throws`（選手直下ではない）。選手直下を見ると
      //    全員 undefined になり、**全員が右投げ**として出る。
      // ⚠ 既定は右。未設定の選手を「左」に倒すと、左投手が実際より多く見える
      throws: player.physical?.throws === 'left' ? 'left' : 'right',
      wins: pitching?.wins || 0,
      losses: pitching?.losses || 0,
      // ⚠ `inningsPitched` はアウト数。投げていなければ null（0.00 と出さない）
      era: outs > 0 ? ((pitching.earnedRuns || 0) * 27) / outs : null,
    };
  };
  return games.map((g) => {
    const homeOffset = seen[g.home] || 0;
    const awayOffset = seen[g.away] || 0;
    seen[g.home] = homeOffset + 1;
    seen[g.away] = awayOffset + 1;
    const home = nextStarter(g.home, homeOffset);
    const away = nextStarter(g.away, awayOffset);
    return {
      ...g,
      homeStarter: home?.name || null,
      awayStarter: away?.name || null,
      ...(statsOf
        ? {
            homeStarterInfo: profile(g.home, home),
            awayStarterInfo: profile(g.away, away),
          }
        : null),
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

/**
 * 球団ごとのチーム打率・チーム防御率。順位表に添える。
 *
 * ⚠ **選手の成績から足し上げること**。順位表（`season.standings`）は勝敗しか
 *    持っていない。別に数えた値を置くと、選手成績と合わない数字が出る。
 * ⚠ `inningsPitched` は**アウト数**（`leagueLeaders` の防御率と同じ式を使う）。
 *    イニング数だと思って9を掛けると3倍の防御率になる。
 * ⚠ 打席・投球回が0の球団は `null`。0除算を画面に出さない（開幕前は全球団）。
 * ⚠ 288人をなめるので、`leagueLeaders` と**同じ成績の引き当て**を渡すこと
 *    （投影で2回数え直さない）。
 */
export function teamSeasonStats(league, statsOf) {
  const out = {};
  for (const name of league.season.settings.teamNames || []) {
    let hits = 0;
    let atBats = 0;
    let earnedRuns = 0;
    let outs = 0;
    for (const player of league.game.teams[name]?.players || []) {
      const stats = statsOf(name, player);
      hits += stats?.batting?.hits || 0;
      atBats += stats?.batting?.atBats || 0;
      earnedRuns += stats?.pitching?.earnedRuns || 0;
      outs += stats?.pitching?.inningsPitched || 0;
    }
    out[name] = {
      average: atBats > 0 ? hits / atBats : null,
      era: outs > 0 ? (earnedRuns * 27) / outs : null,
    };
  }
  return out;
}
