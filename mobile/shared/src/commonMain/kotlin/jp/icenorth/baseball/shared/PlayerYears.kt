package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlin.math.roundToInt

/**
 * 選手の「年ごとの推移」（年・年齢・所属・成績・能力を1年1行）。Web 版 `src/online/playerYears.js` と同じ中身。
 *
 * ⚠ 先方指摘「選手の詳細に、年齢ごとの能力と成績、所属球団を表示。どれだけ成長し、どれだけの成績を残したか」。
 *    能力・年齢・所属はサーバーの `years`（`playerYears`）、成績は同じ年の期間（current / online:年 / legacy:年）。
 *    成績の式は書き写さず [BATTING_GROUPS]・[PITCHING_GROUPS] の列を使う。
 * ⚠ 投手は投球の能力と投手成績、野手は打撃・守備の能力と打撃成績（二刀流は両方）。捕手はリードも。
 */
data class YearAbility(val key: String, val label: String, val format: StatFormat)
data class YearCell(val value: Double?, val diff: Double?)
data class YearRow(
    val year: Int,
    val age: Int?,
    val teams: List<String>,
    val abilities: Map<String, YearCell>,
    val stats: Map<String, Double?>,
)
data class YearTable(val abilities: List<YearAbility>, val stats: List<StatColumn>, val rows: List<YearRow>)

private val BATTING_YEAR_ABILITIES = listOf(
    YearAbility("meet", "ミ", StatFormat.Ability), YearAbility("power", "パ", StatFormat.Ability),
    YearAbility("eye", "眼", StatFormat.Ability), YearAbility("speed", "走", StatFormat.Ability),
    YearAbility("arm", "肩", StatFormat.Ability), YearAbility("defense", "守", StatFormat.Ability),
)
private val PITCHING_YEAR_ABILITIES = listOf(
    YearAbility("velocity", "速", StatFormat.Velocity), YearAbility("control", "制", StatFormat.Ability),
    YearAbility("stamina", "ス", StatFormat.Stamina),
)

/**
 * 能力の差を0.1刻みに丸める。丸めて0なら null（出さない）。Web 版の `yearDiff` と同じ
 * （能力は小数で動く。以前はアプリが整数に切り捨てて +0.5 を緑の「+0」と出し、Web 版は +0.29999999999999716 と出した）
 */
fun yearDiff(value: Double?, before: Double?): Double? {
    if (value == null || before == null) return null
    val diff = ((value - before) * 10).roundToInt() / 10.0
    return if (diff == 0.0) null else diff
}

private fun groupColumn(groups: List<StatGroup>, group: String, id: String) =
    groups.firstOrNull { it.id == group }?.columns?.firstOrNull { it.id == id }

/** その年の期間（今季は current、過去は対人の記録を優先し、無ければ参考の成績） */
fun periodForYear(periods: List<JsonObject>, year: Int, current: Int?): JsonObject? =
    if (year == current) periods.firstOrNull { it.at("id").str() == "current" }
    else periods.firstOrNull { it.at("id").str() == "online:$year" } ?: periods.firstOrNull { it.at("id").str() == "legacy:$year" }

fun playerYearTable(player: JsonObject, years: List<JsonObject>, periods: List<JsonObject>, currentYear: Int?): YearTable {
    val pitcher = player.isPitcherJson()
    val two = player.at("isTwoWay").bool() == true
    val lead = if (player.at("position").str() == "catcher") listOf(YearAbility("lead", "リ", StatFormat.Ability)) else emptyList()
    val abilities = (if (pitcher && !two) emptyList() else BATTING_YEAR_ABILITIES + lead) +
        (if (pitcher || two) PITCHING_YEAR_ABILITIES else emptyList())
    val batting = listOf("appearances" to "games", "basic" to "avg", "basic" to "homeruns", "basic" to "rbis")
        .mapNotNull { (g, id) -> groupColumn(BATTING_GROUPS, g, id)?.let { it.copy(id = "batting.$id") } }
    val pitching = listOf("record" to "games", "basic" to "era", "record" to "wins", "record" to "losses", "record" to "saves")
        .mapNotNull { (g, id) -> groupColumn(PITCHING_GROUPS, g, id)?.let { it.copy(id = "pitching.$id") } }
    val stats = (if (pitcher && !two) emptyList() else batting) + (if (pitcher || two) pitching else emptyList())
    val rows = years.mapIndexedNotNull { i, y ->
        val year = y.at("year").int() ?: return@mapIndexedNotNull null
        val older = years.getOrNull(i + 1)
        val period = periodForYear(periods, year, currentYear)
        YearRow(
            year = year,
            age = y.at("age").int(),
            teams = y.at("teams").list().mapNotNull { it.str() },
            abilities = abilities.associate { a ->
                val value = y.at("abilities", a.key).num()
                val before = older?.at("abilities", a.key).num()
                a.key to YearCell(value, yearDiff(value, before))
            },
            stats = stats.associate { c -> c.id to period?.let(c.get) },
        )
    }
    return YearTable(abilities, stats, rows)
}
