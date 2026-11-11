package jp.icenorth.baseball.shared

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * 投手×捕手の組み合わせの読み方。形はサーバーの action=player の期間の `battery`
 * （server/recordedViews.mjs の batteryFor）。Web 版 src/online/BatteryStats.jsx と同じ表示になること
 */
class BatteryTest {
    private fun obj(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject

    @Test
    fun catcherPeriod() {
        val period = obj(
            """{"id":"current","battery":{
              "caught":{"outs":271,"era":3.6,"k9":7.0,"bb9":3.1,"avg":0.25,"readRate":0.2,"starts":10},
              "pitchers":[{"key":"a","name":"山田","outs":120,"era":2.25,"k9":8.0,"bb9":2.0,"avg":0.231,"readRate":0.19,"few":false},
                          {"key":"b","name":"佐藤","outs":12,"era":9.0,"k9":4.5,"bb9":6.0,"avg":0.4,"readRate":null,"few":true}],
              "catchers":[]}}""",
        )
        val b = batteryOf(period)!!
        assertEquals(10, b.caught!!.starts)
        assertEquals("90.1", batteryInnings(b.caught!!.outs))
        assertEquals("3.60", batteryDecimal(b.caught!!.era))
        assertEquals("20%", batteryPercent(b.caught!!.readRate))
        assertEquals(".250", batteryRate(b.caught!!.avg))
        assertEquals(listOf("山田", "佐藤"), b.pitchers.map { it.name })
        assertTrue(b.pitchers[1].few)
        assertEquals("—", batteryPercent(b.pitchers[1].readRate))
    }

    @Test
    fun noBattery() {
        assertNull(batteryOf(obj("""{"id":"current"}""")))
        assertTrue(BATTERY_NOTE.startsWith("30回未満"))
    }
}
