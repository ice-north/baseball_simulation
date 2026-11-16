package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** 選手枠の上限・標準の人数はビューの値（`rosterLimit`・`rosterStandard`）を正にし、無ければ表の数 */
class RosterLimitTest {
    private fun player(id: Int, position: String): JsonObject = buildJsonObject {
        put("id", id)
        put("position", position)
    }

    private fun roster(size: Int): List<JsonObject> =
        List(size) { i -> player(i + 1, if (i == 0) "pitcher" else if (i == 1) "catcher" else "shortstop") }

    @Test
    fun prefersTheServersNumbers() {
        val view = buildJsonObject { put("rosterLimit", 30); put("rosterStandard", 27) }
        assertEquals(30, rosterLimitOf(view))
        assertEquals(27, rosterStandardOf(view))
    }

    @Test
    fun fallsBackToTheTableForOldServers() {
        assertEquals(ROSTER_LIMIT, rosterLimitOf(buildJsonObject {}))
        assertEquals(ROSTER_STANDARD, rosterStandardOf(buildJsonObject {}))
        assertEquals(ROSTER_LIMIT, rosterLimitOf(null))
    }

    @Test
    fun tradeCheckUsesTheGivenLimit() {
        val mine = roster(ROSTER_LIMIT)
        val theirs = roster(20).map { buildJsonObject { it.forEach { (k, v) -> put(k, v) }; put("id", (it.pid + 100).toInt()) } }
        // 1人もらうだけ: 表の上限では超えるが、サーバーが枠を広げていれば成り立つ
        val get = setOf(theirs.last().pid)
        assertTrue(dealProblems(mine, theirs, emptySet(), get).any { it.startsWith("${ROSTER_LIMIT}人を超えます") })
        assertEquals(emptyList(), dealProblems(mine, theirs, emptySet(), get, limit = ROSTER_LIMIT + 2))
    }
}
