package jp.icenorth.baseball.shared

import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TipsTest {
    @Test
    fun everyTipHasAKnownCategoryAndText() {
        assertTrue(GAME_TIPS.isNotEmpty())
        GAME_TIPS.forEach {
            assertTrue(it.category in TIP_CATEGORIES, "見出しが一覧に無い: ${it.category}")
            assertTrue(it.title.isNotBlank() && it.body.isNotBlank())
        }
        assertEquals(GAME_TIPS.size, GAME_TIPS.map { it.title }.toSet().size, "同じ題名がある")
    }

    private fun lineup(order: List<Pair<Long, String>>, starters: List<Long>) = buildJsonObject {
        putJsonArray("battingOrder") {
            order.forEachIndexed { i, (id, pos) -> addJsonObject { put("playerId", id); put("position", pos); put("battingOrder", i + 1) } }
        }
        putJsonArray("starters") { starters.forEach { add(it) } }
    }

    @Test
    fun picksTipsThatMatchTheTeamNow() {
        val roster = listOf(
            Player(1, "疲れ太郎", position = "center", fatigue = 85),
            Player(2, "やや疲れ", position = "first", fatigue = 50, condition = 0),
            Player(3, "元気", position = "short", fatigue = 10, positionFitness = mapOf("catcher" to 30)),
            Player(4, "先発A", position = "pitcher", fatigue = 45),
            Player(5, "先発B", position = "pitcher", fatigue = 39),
        )
        val tips = situationTips(roster, lineup(listOf(1L to "center", 2L to "first", 3L to "catcher"), listOf(4L, 5L)))
        val byId = tips.associate { it.tip.id to it.who }
        assertEquals(listOf("fielderRest", "starterSkip", "offPosition", "condition", "growthWear"), tips.map { it.tip.id })
        assertEquals(listOf("疲れ太郎（疲労85）"), byId["fielderRest"])
        assertEquals(listOf("先発A（疲労45）"), byId["starterSkip"])
        assertEquals(listOf("元気（捕・適性30）"), byId["offPosition"])
        assertEquals(listOf("やや疲れ（絶不調）"), byId["condition"])
        assertEquals(listOf("やや疲れ（疲労50）"), byId["growthWear"], "80以上は自動で休むほうで知らせるので重ねない")
    }

    @Test
    fun nothingMatchesForAFreshTeam() {
        val roster = listOf(Player(1, "元気", position = "center", fatigue = 0, condition = 2), Player(4, "先発", position = "pitcher", fatigue = 0))
        assertTrue(situationTips(roster, lineup(listOf(1L to "center"), listOf(4L))).isEmpty())
        assertTrue(situationTips(roster, null).isEmpty())
    }

    @Test
    fun everyTipUsedBySituationsExists() {
        val ids = GAME_TIPS.map { it.id }.filter { it.isNotEmpty() }
        assertEquals(setOf("fielderRest", "starterSkip", "growthWear", "offPosition", "condition"), ids.toSet())
        assertEquals(ids.size, ids.toSet().size)
    }

    @Test
    fun worksOnARealServerView() {
        val view = OnlineJson.decodeFromString<LeagueView>(javaClass.getResource("/view-running.json")!!.readText())
        situationTips(view.roster, view.lineup).forEach { assertTrue(it.who.isNotEmpty()) }
    }
}
