package jp.icenorth.baseball.shared

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TradeSearchTest {
    private var seq = 0L
    private fun fielder(pos: String, bat: Int, def: Int, fit: Map<String, Int> = emptyMap(), age: Int = 25, value: Double = 150.0) = Player(
        id = ++seq, name = "野手$seq", age = age, position = pos,
        batting = Batting(meet = bat, power = bat, eye = bat), physical = Physical(speed = bat, arm = def), fielding = Fielding(def),
        positionFitness = fit, tradeValue = value,
    )
    private fun pitcher(level: Int, value: Double = 150.0) = Player(
        id = ++seq, name = "投手$seq", age = 25, position = "pitcher",
        pitching = Pitching(velocity = 130 + level / 4, control = level, stamina = level * 2, spinRate = level), tradeValue = value,
    )
    private fun team(bat: Int, extra: List<Player> = emptyList()): List<Player> =
        listOf("catcher", "first", "second", "third", "short", "left", "center", "right").map { fielder(it, bat, bat) } +
            (1..10).map { pitcher(bat) } + extra

    @Test
    fun slotStrengthNeedsFitness() {
        val p = fielder("short", 60, 60, mapOf("second" to 70, "third" to 50))
        assertTrue(slotStrength(p, "short")!! > 0)
        assertTrue(slotStrength(p, "second")!! > 0)
        assertNull(slotStrength(p, "third"), "適性60未満は守れない")
        assertNull(slotStrength(p, "sp"), "野手は投手の持ち場に入らない")
    }

    @Test
    fun weakSlotComesFirst() {
        val mine = team(60).toMutableList()
        // 遊撃だけ弱い
        val weakShort = fielder("short", 30, 30)
        mine.removeAt(4); mine.add(4, weakShort)
        val usage = TeamUsage(fielders = mine.take(8).associate { it.position to it.id }, starters = mine.filter { it.isPitcher }.take(5).map { it.id })
        val others = (1..3).associate { "相手$it" to team(55) }
        val points = reinforcePoints(mine, usage, others)
        assertEquals("short", points.first().slot.key)
        assertEquals(4, points.first().rank)
        assertEquals(weakShort.id, points.first().holder?.id)
        val candidates = tradeCandidates("short", mine, usage, others)
        assertTrue(candidates.first().diff > 0, "相手の遊撃のほうが強い")
        assertTrue(candidates.first().theirStarter)
    }

    @Test
    fun oddsUseServerBounds() {
        val rule = CpuTradeRule(1.05, 0.1, null)
        val (low, high) = tradeOddsBounds(rule)
        assertEquals(TradeOdds.Likely, tradeOdds(listOf(100.0 * high + 0.1), listOf(100.0), rule))
        assertEquals(TradeOdds.Depends, tradeOdds(listOf(105.0), listOf(100.0), rule))
        assertEquals(TradeOdds.Short, tradeOdds(listOf(100.0 * low - 0.1), listOf(100.0), rule))
        // 見る目がいちばん不利（出す側0.9倍・もらう側1.1倍）でも届く ⇔ 受けるはず
        val give = 100.0 * high
        assertTrue(give * 0.9 >= 100.0 * 1.1 * 1.05 - 1e-9)
    }

    @Test
    fun surplusFindsTeamsWithHoles() {
        val mine = team(60) + fielder("short", 58, 58)
        val usage = TeamUsage(fielders = mine.take(8).associate { it.position to it.id }, starters = mine.filter { it.isPitcher }.take(5).map { it.id })
        val others = mapOf("弱い" to team(40), "強い" to team(80))
        val surplus = surplusPlayers(mine, usage, others)
        val extra = surplus.first { it.player.position == "short" && it.player.id !in usage.lineupIds }
        assertEquals(listOf("弱い"), extra.wantedBy)
    }
}
