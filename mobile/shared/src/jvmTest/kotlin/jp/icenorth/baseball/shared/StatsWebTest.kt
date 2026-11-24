package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * 成績の表の列・能力の絞り込み・段位・疲労の段・調子の顔が Web 版と同じ値・同じ文字を出すか
 * （期待値は mobile/tools/expect-stats.mjs が書き出す。表そのものは gen-tables.mjs が Tables.kt に書き出す）
 */
class StatsWebTest {
    private val expected = OnlineJson.parseToJsonElement(
        StatsWebTest::class.java.getResource("/stats-expected.json")!!.readText(),
    ).jsonObject
    private val players = expected.at("players").list().map { it as JsonObject }

    private fun number(e: kotlinx.serialization.json.JsonElement?): Double? {
        val p = e as? JsonPrimitive ?: return null
        if (p.isString) return if (p.content == "Infinity") Double.POSITIVE_INFINITY else error("数でない: $p")
        return p.content.toDoubleOrNull()
    }

    @Test
    fun columnsMatchWeb() {
        var compared = 0
        for ((category, groups) in listOf("batting" to BATTING_GROUPS, "pitching" to PITCHING_GROUPS)) for (group in groups) {
            group.columns.forEachIndexed { i, column ->
                val key = "$category/${group.id}/$i"
                val want = expected.at("columns", key).list()
                assertEquals(players.size, want.size, "Web 版に無い列: $key")
                players.forEachIndexed { n, p ->
                    val (value, text) = want[n].list()
                    val got = column.get(p)
                    val w = number(value)
                    if (w == null || got == null) assertEquals(w, got, "$key ${column.label} ${p.at("name").str()}")
                    else assertEquals(w, got, 1e-9, "$key ${column.label} ${p.at("name").str()}")
                    text.str()?.let { assertEquals(it, formatStat(column, got), "$key ${column.label} の文字") }
                    compared += 1
                }
            }
        }
        assertTrue(compared > 1000, "比べた数が少ない: $compared")
    }

    @Test
    fun overviewAndSortMatchWeb() {
        for ((category, batting) in listOf("batting" to true, "pitching" to false)) {
            assertEquals(expected.at("overview", category).list().map { it.str() }, overviewGroup(batting).columns.map { it.label })
            assertEquals(expected.at("sortLabels", category).str(), defaultSortColumn(batting).label)
        }
    }

    @Test
    fun abilityFiltersMatchWeb() {
        for (def in ABILITY_FILTERS) {
            val want = expected.at("filters", def.key).list().map { number(it) }
            assertEquals(want, players.map { def.get(it) }, def.key)
        }
    }

    @Test
    fun ranksTonesIconsMatchWeb() {
        val sweep = expected.at("sweep").list().map { number(it)!!.toInt() }
        val ranks = expected.at("ranks").list().map { it.str() }
        sweep.forEachIndexed { i, v ->
            assertEquals(ranks[i], "${abilityRank(v)}${abilityRank(v, velocity = true)}${abilityRank(v, stamina = true)}", "段位 $v")
        }
        val tones = expected.at("tones").list().map { number(it)!!.toInt() }
        tones.forEachIndexed { i, t -> assertEquals(t, fatigueTone(i - 5), "疲労 ${i - 5}") }
        val icons = expected.at("icons").list().map { it.str() }
        listOf(-1, 0, 1, 2, 3, 4, 5).forEachIndexed { i, c -> assertEquals(icons[i], conditionIcon(c), "調子 $c") }
    }
}
