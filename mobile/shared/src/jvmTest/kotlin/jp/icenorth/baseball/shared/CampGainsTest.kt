package jp.icenorth.baseball.shared

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals

/** Web 版の `src/online/campGains.js` と同じまとめ方になっていること */
class CampGainsTest {
    private fun obj(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject

    private val roster = listOf(
        obj("""{"id":101,"name":"山田","position":"short"}"""),
        obj("""{"id":102,"name":"佐藤","position":"pitcher"}"""),
        obj("""{"id":103,"name":"鈴木","position":"left"}"""),
    )

    @Test
    fun rowsAreSortedByHowMuchThePlayerGrew() {
        val gains = obj("""{"101":{"batting.meet":2,"physical.speed":-1},"102":{"pitching.control":3,"pitch.slider":1},"999":{"batting.meet":5}}""")
        val rows = campGainRows(gains, roster)
        assertEquals(listOf("佐藤", "山田"), rows.map { it.player.at("name").str() }, "名簿に居ない選手は落とす")
        assertEquals(listOf("制球", "スライダー"), rows.first().items.map { it.label })
        assertEquals(listOf(2.0, -1.0), rows[1].items.map { it.diff }, "下がった項目も残す（後ろに）")
    }

    @Test
    fun playersWithOnlyAnEventAreListed() {
        val rows = campGainRows(obj("{}"), roster, obj("""{"103":["フォーム改造成功 サイド"]}"""))
        assertEquals(listOf("鈴木"), rows.map { it.player.at("name").str() })
        assertEquals(listOf("フォーム改造成功 サイド"), rows.single().events)
    }

    @Test
    fun labelsPositionPracticeAndMentalGrowth() {
        val gains = obj("""{"101":{"positionFitness.first":3,"positionFitness.center":2,"personality.mental":1}}""")
        val row = campGainRows(gains, roster).single()
        assertEquals(listOf("一塁適性", "中堅適性", "精神"), row.items.map { it.label })
        assertEquals(listOf("一塁適性", "中堅適性", "精神"), campGainTotals(gains).map { it.label })
    }

    @Test
    fun totalsAddUpPerAbility() {
        val totals = campGainTotals(obj("""{"101":{"batting.meet":2},"103":{"batting.meet":1,"physical.arm":1}}"""))
        assertEquals(listOf("ミート" to 3.0, "肩力" to 1.0), totals.map { it.label to it.diff })
        assertEquals("+3", formatGain(3.0))
        assertEquals("-1", formatGain(-1.0))
        assertEquals("+0.5", formatGain(0.5))
    }
}
