package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import kotlin.test.Test
import kotlin.test.assertEquals

/** 年ごとの推移の能力の差（Web 版 `playerYears.js` の `yearDiff` と同じ。online-stats-view-check と同じ値） */
class PlayerYearsTest {
    private fun year(year: Int, vararg abilities: Pair<String, Double>): JsonObject = buildJsonObject {
        put("year", year)
        putJsonObject("abilities") { abilities.forEach { (k, v) -> put(k, v) } }
    }

    @Test
    fun diffsAreRoundedToTenthsAndZeroIsDropped() {
        val player = buildJsonObject { put("position", "first") }
        val table = playerYearTable(
            player,
            listOf(
                year(2, "meet" to 50.3, "power" to 40.5, "eye" to 30.02, "speed" to 20.0),
                year(1, "meet" to 50.0, "power" to 40.9, "eye" to 30.0, "speed" to 22.0),
            ),
            emptyList(),
            2,
        )
        val row = table.rows.first().abilities
        assertEquals(0.3, row["meet"]?.diff)
        assertEquals(-0.4, row["power"]?.diff)
        assertEquals(null, row["eye"]?.diff, "丸めて0の差は出さない")
        assertEquals(-2.0, row["speed"]?.diff)
        assertEquals("+0.3", formatGain(row["meet"]!!.diff!!))
        assertEquals("-0.4", formatGain(row["power"]!!.diff!!))
        assertEquals("-2", formatGain(row["speed"]!!.diff!!))
        assertEquals(null, table.rows.last().abilities["meet"]?.diff, "最初の年は差が無い")
    }
}
