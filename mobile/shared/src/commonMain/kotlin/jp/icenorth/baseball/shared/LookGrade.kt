package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject

/**
 * 新しい見た目（試作）: 成績の数字に付ける S〜F の札（リーグ平均との比）。
 * Web 版 `src/online/look/statGrade.js` の写し。区切りを変えたら両方を直し、
 * `node mobile/tools/expect-look.mjs > mobile/shared/src/jvmTest/resources/look-expected.json` で期待値を書き出し直す
 * （答え合わせは `LookTest.gradesMatchWeb`）。
 *
 * ⚠ 平均は自球団と同じ部の球団の `teamStats`（サーバーの `teamSeasonStats`）をならしたもの。
 * ⚠ 出場の少ない人（打者は試合数×1打席、投手は試合数×1アウトに満たない）には付けない。
 */
data class LeagueBaseline(
    val average: Double?,
    val era: Double?,
    val obp: Double?,
    val slg: Double?,
    val ops: Double?,
    val games: Int,
)

private class Graded(val key: String, val pitching: Boolean, val asc: Boolean = false)

private val GRADED = mapOf(
    "avg" to Graded("average", false),
    "obp" to Graded("obp", false),
    "slg" to Graded("slg", false),
    "ops" to Graded("ops", false),
    "era" to Graded("era", true, asc = true),
)

private val BATTING_BANDS = listOf('S' to 1.4, 'A' to 1.25, 'B' to 1.12, 'C' to 0.96, 'D' to 0.85, 'E' to 0.75)
// 防御率は散らばりが大きい（少ない回で大きく動く）ので幅を広く取る
private val PITCHING_BANDS = listOf('S' to 2.2, 'A' to 1.6, 'B' to 1.25, 'C' to 0.97, 'D' to 0.78, 'E' to 0.6)

fun isGradedColumn(id: String): Boolean = id in GRADED

/**
 * その球団（省くと自球団）と同じ部の平均と、その球団の試合数（生のビュー）。`teamStats` が無ければ null。
 * `team` は見ている球団（他球団の表に札を付けるとき。Web の `leagueBaseline(view, team)` と同じ）
 */
fun leagueBaseline(view: JsonObject?, team: String? = null): LeagueBaseline? {
    val stats = view.at("teamStats").obj() ?: return null
    val ownTeam = team ?: view.at("teamName").str()
    val leagues = view.at("teamLeagues").obj()
    val own = ownTeam?.let { leagues.at(it).str() }
    val teams = stats.keys.filter { name -> own == null || leagues == null || leagues.at(name).str() == own }
    fun mean(key: String): Double? {
        val list = teams.mapNotNull { stats.at(it, key).num()?.takeIf { v -> v.isFinite() } }
        return if (list.isEmpty()) null else list.sum() / list.size
    }
    val obp = mean("obp")
    val slg = mean("slg")
    val games = view.at("standings").list().firstOrNull { it.at("team").str() == ownTeam }.at("gamesPlayed").int() ?: 0
    return LeagueBaseline(
        average = mean("average"),
        era = mean("era"),
        obp = obp,
        slg = slg,
        ops = if (obp != null && slg != null) obp + slg else null,
        games = games,
    )
}

private fun enough(player: JsonObject, pitching: Boolean, games: Int): Boolean {
    if (games <= 0) return false
    if (pitching) return (player.at("seasonStats", "pitching", "inningsPitched").num() ?: 0.0) >= games
    fun n(key: String) = player.at("seasonStats", "batting", key).num() ?: 0.0
    val pa = n("atBats") + n("walks") + n("hitByPitch") + n("sacrificeFlies") + n("sacrificeBunts")
    return pa >= games
}

/** 比（良いほど大きい）→ 段位 */
fun gradeOfRatio(ratio: Double, pitching: Boolean): Char? {
    if (ratio.isNaN()) return null
    if (ratio == Double.POSITIVE_INFINITY) return 'S'
    for ((rank, min) in if (pitching) PITCHING_BANDS else BATTING_BANDS) if (ratio >= min) return rank
    return 'F'
}

/** その列のその値の段位（S〜F）。付けない列・平均が無い・出場が少ないときは null */
fun statGrade(columnId: String, value: Double?, player: JsonObject, baseline: LeagueBaseline?): Char? {
    val spec = GRADED[columnId] ?: return null
    if (baseline == null || value == null || !value.isFinite()) return null
    val mean = when (spec.key) {
        "average" -> baseline.average
        "era" -> baseline.era
        "obp" -> baseline.obp
        "slg" -> baseline.slg
        else -> baseline.ops
    }
    if (mean == null || mean == 0.0 || !enough(player, spec.pitching, baseline.games)) return null
    // 防御率0（自責0）は比が無限になるので S
    val ratio = if (spec.asc) (if (value > 0) mean / value else Double.POSITIVE_INFINITY) else value / mean
    return gradeOfRatio(ratio, spec.pitching)
}
