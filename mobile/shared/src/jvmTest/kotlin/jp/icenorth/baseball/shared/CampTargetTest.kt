package jp.icenorth.baseball.shared

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals

/** キャンプのサブ練習の対象（Web 版 CampPlanner.jsx の subTargetChoices と同じ決まり） */
class CampTargetTest {
    private fun obj(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject

    private val pitcher = obj(
        """{"id":1,"position":"pitcher","pitching":{"arsenal":[{"type":"straight","level":60},{"type":"slider","level":40},{"type":"splitter","level":55},{"type":"curve","level":100}]}}""",
    )
    private val fielder = obj("""{"id":2,"position":"short","positionFitness":{"second":80,"first":45.5}}""")

    @Test
    fun newPitchOffersOnlyPitchesNotYetOwned() {
        assertEquals(listOf("fork", "changeup", "sinker", "cutter", "knuckle", "shoot"), campSubTargetChoices("newpitch", pitcher).map { it.key })
    }

    @Test
    fun breakingOffersOwnedPitchesBelowTheTop() {
        // ⚠ 覚えられる8種の外（スプリッター）も、持っていれば磨ける。極めた球種（100）は出さない
        assertEquals(listOf("slider" to "スライダー40", "splitter" to "スプリッター55"), campSubTargetChoices("breaking", pitcher).map { it.key to it.label })
    }

    @Test
    fun subPositionOffersOtherPositionsWithFitness() {
        val choices = campSubTargetChoices("subposition", fielder)
        assertEquals(listOf("catcher", "first", "second", "third", "left", "center", "right"), choices.map { it.key })
        assertEquals(listOf("捕手", "一塁 45.5%", "二塁 80%"), choices.take(3).map { it.label })
        assertEquals(emptyList(), campSubTargetChoices("physique", fielder))
    }

    @Test
    fun formAndBatsOfferOnlyOtherShapes() {
        // ⚠ Web 版と同じ文（「サイドへ」「両打へ」）。いまの形は出さない
        assertEquals(listOf("overhand" to "オーバーへ", "sidearm" to "サイドへ", "submarine" to "アンダーへ"), campSubTargetChoices("form_change", pitcher).map { it.key to it.label })
        val lefty = obj("""{"id":3,"position":"left","batting":{"bats":"left"}}""")
        assertEquals(listOf("right" to "右打へ", "switch" to "両打へ"), campSubTargetChoices("switch_hit", lefty).map { it.key to it.label })
        assertEquals(true, campTargetRequired("switch_hit", lefty))
        assertEquals(false, campTargetRequired("newpitch", pitcher))
        // ⚠ 野手のフォーム改造は**打撃フォーム**（いしだ 2026-11-23）。投球フォームは出さない
        val stances = campSubTargetChoices("form_change", lefty)
        assertEquals(2, stances.size)
        assertEquals(true, stances.all { it.key in CAMP_STANCES && it.label.endsWith("へ") })
        assertEquals(true, stances.none { it.key == battingStanceOf(lefty) })
        assertEquals(true, campTargetRequired("form_change", lefty))
    }

    @Test
    fun onlyTargetsThatFitTheCurrentSubTrainingAreSent() {
        val sub = mapOf(1L to "physique", 2L to "subposition")
        // 投手は練習を変えたので前の対象（fork）を送らない。合わない値（pitcher）も送らない
        val sent = Commands.campTargetsToSend(listOf(pitcher, fielder), { sub.getValue(it.pid) }, mapOf(1L to "fork", 2L to "second"))
        assertEquals(mapOf(2L to "second"), sent)
        assertEquals(emptyMap(), Commands.campTargetsToSend(listOf(fielder), { "subposition" }, mapOf(2L to "pitcher")))
        val payload = Commands.campRound(1, "team", "balanced", "skill", emptyMap(), emptyMap(), sub, sent)
        assertEquals("second", payload.at("subTarget", "2").str())
    }
}
