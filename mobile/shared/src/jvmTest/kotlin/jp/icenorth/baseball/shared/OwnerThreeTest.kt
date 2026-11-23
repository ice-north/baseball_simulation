package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** 先方3項目（2026-11-23）: 契約更改の指導者の異動・トライアウトの能力で絞り込み（Web 版と同じ決め方） */
class OwnerThreeTest {
    private val base = buildJsonObject { putJsonArray("releaseIds") {} }

    @Test
    fun staffMoveKeepsOneChoicePerRoleAndDropsEmpty() {
        val a = Commands.withStaffMove(base, "batting", "leave")
        assertEquals("leave", (a["staffMoves"] as JsonObject)["batting"].str())
        // 野手コーチを監督に上げたら、野手コーチの退任は外す（サーバーも弾く）
        val b = Commands.withStaffMove(a, "manager", "batting")
        assertEquals("batting", (b["staffMoves"] as JsonObject)["manager"].str())
        assertNull((b["staffMoves"] as JsonObject)["batting"])
        // 続投に戻すと、1つも無ければ staffMoves ごと外す（前と同じ形の案を送る）
        val c = Commands.withStaffMove(b, "manager", null)
        assertNull(c["staffMoves"])
        assertEquals(base["releaseIds"], c["releaseIds"])
    }

    private fun player(position: String, meet: Int, velocity: Int, arsenal: List<Pair<String, Int>> = emptyList()) = buildJsonObject {
        put("id", 1)
        put("position", position)
        putJsonObject("batting") { put("meet", meet) }
        putJsonObject("pitching") {
            put("velocity", velocity)
            put("arsenal", buildJsonArray { arsenal.forEach { (t, l) -> add(buildJsonObject { put("type", JsonPrimitive(t)); put("level", l) }) } })
        }
    }

    @Test
    fun abilityFiltersUseShownValuesAndAllMustPass() {
        val pitcher = player("pitcher", meet = 48, velocity = 146, arsenal = listOf("straight" to 100, "slider" to 40))
        assertTrue(passesAbilityFilters(pitcher, listOf(AbilityFilter("meet", 45))), "投手のミートで探せる")
        assertFalse(passesAbilityFilters(pitcher, listOf(AbilityFilter("meet", 45), AbilityFilter("velocity", 150))), "条件はすべて満たす")
        assertTrue(passesAbilityFilters(pitcher, listOf(AbilityFilter("velocity", 145))), "球速は km/h のまま")
        assertTrue(passesAbilityFilters(pitcher, listOf(AbilityFilter("breaking", 40))), "変化球は直球を除いた最高")
        assertFalse(passesAbilityFilters(pitcher, listOf(AbilityFilter("breaking", 41))))
        val fielder = player("short", meet = 60, velocity = 138)
        assertTrue(passesAbilityFilters(fielder, listOf(AbilityFilter("velocity", 135))), "野手の球速で探せる")
        assertEquals(ABILITY_FILTERS.map { it.key }, listOf("meet", "power", "eye", "speed", "arm", "defense", "velocity", "control", "stamina", "spin", "breaking"))
    }
}
