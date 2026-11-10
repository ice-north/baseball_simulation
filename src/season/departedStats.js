// ============================================================
// その年に名簿を離れた選手の、その年のシーズン成績 - departedStats.js
//
// 選手成績の画面（`PlayerStatsScreen`）は `TEAMS_DATA` の名簿から集計し、成績は選手そのものが
// 持っている。そのため戦力外（11/9）・ドラフトで指名されて抜けた・社会人の退団で名簿から外れると、
// 年度の終わりを待たずにその年の成績ごと一覧から消えていた（一人用の見回りで見つけたもの）。
//
// ⚠ 外れる**直前**に、成績だけを `seasonData.departedSeasonStats` に写しておき、画面はそれを足して
//    並べる。写すのは画面が使う項目だけ（名前・守備位置・球団・シーズン成績）。全選手を丸ごと
//    写すと保存が重くなる。
// ⚠ 年度で持つ（`year`）。年が替わったら古い年の分は使わず、次に写すときに捨てる。
// ⚠ 戦力外の選手は外れるときにシーズンの締め（`finalizePlayerSeason`）を済ませ、成績が0に戻る。
//    トライアウトでほかの球団に拾われると、名簿には成績0の本人がいる。シーズンの表では写した
//    成績のほうを使い、その年に在籍した球団の名前で出す。
// ============================================================

const hasSeasonStats = (stats) =>
  (stats?.batting?.atBats || 0) > 0 || (stats?.pitching?.inningsPitched || 0) > 0;

/** 名簿を離れる選手1人ぶんの写し。成績が無ければ `null`（写さない） */
export function departedEntry(player, teamKey, teamName) {
  if (!player || player.id == null || !hasSeasonStats(player.seasonStats)) return null;
  return {
    id: player.id,
    name: player.name,
    position: player.position,
    teamKey,
    teamName: teamName || teamKey,
    seasonStats: JSON.parse(JSON.stringify(player.seasonStats)),
  };
}

/** 写しを足した `seasonData` を返す（同じ選手はあとの写しで置き換えない。先に外れた球団で残す） */
export function withDeparted(seasonData, entries) {
  const year = seasonData?.year || 1;
  const fresh = (entries || []).filter(Boolean);
  if (!fresh.length) return seasonData;
  const kept = seasonData?.departedSeasonStats?.year === year
    ? seasonData.departedSeasonStats.players || []
    : [];
  const seen = new Set(kept.map((p) => p.id));
  return {
    ...seasonData,
    departedSeasonStats: {
      year,
      players: [...kept, ...fresh.filter((p) => !seen.has(p.id) && seen.add(p.id))],
    },
  };
}

/**
 * 名簿の一覧から、いま名簿にいる選手の `[id, { player, teamKey, teamName }]` を作る。
 * 名簿を書き換える処理（ドラフトなど）の前後で比べて、外れた選手を見つけるのに使う。
 */
export function rosterIndex(allTeams) {
  const index = new Map();
  for (const [teamKey, team] of Object.entries(allTeams || {}))
    for (const player of team?.players || [])
      if (player?.id != null && !index.has(player.id))
        index.set(player.id, { player, teamKey, teamName: team.name || teamKey });
  return index;
}

/** `before`（`rosterIndex`）にいて、いまの名簿の同じ球団にいない選手の写し */
export function departedSince(before, allTeams) {
  const entries = [];
  for (const [id, { player, teamKey, teamName }] of before) {
    const stillThere = (allTeams?.[teamKey]?.players || []).some((p) => p.id === id);
    if (!stillThere) entries.push(departedEntry(player, teamKey, teamName));
  }
  return entries.filter(Boolean);
}

/**
 * シーズンの表に並べる選手。いまの名簿（`livePlayers`。`{ ...player, teamName, teamKey }`）に、
 * その年に外れた選手の写しを足す。写しがある選手は写しの成績と球団で出す
 * （拾われた先の名簿にいる本人は、締めを済ませて成績が0なので使わない）。
 */
export function withDepartedPlayers(livePlayers, seasonData) {
  const archive = seasonData?.departedSeasonStats;
  if (!archive || archive.year !== (seasonData?.year || 1) || !archive.players?.length)
    return livePlayers;
  const departedIds = new Set(archive.players.map((p) => p.id));
  return [
    ...livePlayers.filter((p) => !departedIds.has(p.id)),
    ...archive.players.map((p) => ({ ...p, departed: true })),
  ];
}
