package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import kotlin.test.Test
import kotlin.test.assertEquals

/** 契約更改の表（Web 版 `src/online/contractTable.js` と同じ値） */
class ContractTableTest {
    private fun player(id: Int, position: String, build: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit = {}): JsonObject = buildJsonObject {
        put("id", id)
        put("position", position)
        build()
    }

    @Test
    fun pitchersWithoutStatsShowZeroWinsAndSaves() {
        val columns = contractColumns().associateBy { it.id }
        val pitcher = player(1, "pitcher")
        val fielder = player(2, "first")
        assertEquals(0.0, columns.getValue("wins").get(pitcher), "登板の無い投手は0勝（Web 版の ?? 0）")
        assertEquals(0.0, columns.getValue("saves").get(pitcher))
        assertEquals(null, columns.getValue("wins").get(fielder), "野手は「—」")
        val winner = player(3, "pitcher") { putJsonObject("seasonStats") { putJsonObject("pitching") { put("wins", 7); put("saves", 2) } } }
        assertEquals(7.0, columns.getValue("wins").get(winner))
        assertEquals(2.0, columns.getValue("saves").get(winner))
    }

    @Test
    fun handednessUnknownIsADash() {
        assertEquals("—投—打", handLabel(player(1, "pitcher")), "分からない側を右と決めつけない")
        val lefty = player(2, "left") {
            putJsonObject("physical") { put("throws", "left") }
            putJsonObject("batting") { put("bats", "switch") }
        }
        assertEquals("左投両打", handLabel(lefty))
    }
}
