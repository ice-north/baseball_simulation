package jp.icenorth.baseball.shared

import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** ローカルの開発サーバーで開幕3日目まで進めたときの実際のビュー（view-running.json）で確かめる */
class ViewTest {
    private val raw = javaClass.getResource("/view-running.json")!!.readText()
    private val view = OnlineJson.decodeFromString<LeagueView>(raw)

    @Test
    fun readsTheServerView() {
        assertEquals("running", view.status)
        assertEquals(12, view.standings.size)
        assertEquals(24, view.roster.size)
        assertEquals("B", view.teamLeagues[view.teamName])
        assertNotNull(view.nextAdvanceAt)
        assertTrue(view.nextGames.isNotEmpty())
    }

    @Test
    fun lineupDraftEditsKeepUnknownFields() {
        val draft = LineupDraft.from(view.lineup!!)
        assertEquals(8, draft.slots.size)
        assertNull(draft.problem())
        val moved = draft.moveBatter(0, 3).swapPositions(0, 1).moveStarter(0, 1)
        assertTrue(moved.isDirty)
        assertNull(moved.problem())
        val payload = moved.toPayload()
        // 知らない項目（投手の役割）を落とさないこと
        assertEquals(view.lineup!!["pitcherRoles"], payload["pitcherRoles"])
        assertEquals(view.lineup, payload["baseLineup"])
        val order = payload["battingOrder"]!!.jsonArray.map { it.jsonObject }
        assertEquals((1..8).toList(), order.map { it["battingOrder"]!!.jsonPrimitive.content.toInt() })
        assertEquals(draft.slots[0].playerId, order[3]["playerId"]!!.jsonPrimitive.long)
        assertEquals(draft.starters[1], payload["starters"]!!.jsonArray[0].jsonPrimitive.long)
    }

    @Test
    fun replacingWithBenchKeepsPosition() {
        val draft = LineupDraft.from(view.lineup!!)
        val bench = view.roster.first { p -> !p.isPitcher && draft.slots.none { it.playerId == p.id } }
        val next = draft.replaceBatter(2, bench.id)
        assertEquals(bench.id, next.slots[2].playerId)
        assertEquals(draft.slots[2].position, next.slots[2].position)
        // 先発中の選手とは入れ替えない
        assertEquals(next, next.replaceBatter(0, next.slots[1].playerId))
    }

    @Test
    fun texts() {
        assertEquals("第4ターン / 160", formatTurn(GameDate(2024, 4, 4)))
        assertEquals("開幕前", formatTurn(GameDate(2024, 1, 1)))
        assertEquals('S', abilityRank(152, velocity = true))
        assertEquals('C', abilityRank(126, stamina = true).let { abilityRank(60) })
        assertEquals(".200", rate3(0.2))
        assertEquals(".385", rate3(0.38461538461538464))
    }

    @Test
    fun battingMetricsGiveOpsAndLabels() {
        val m = view.roster.first { !it.isPitcher }.performance!!.batting!!.metrics!!
        // OPS = 出塁率 + 長打率（= 打率 + iso）
        assertEquals(m.obp!! + m.avg!! + m.iso!!, m.ops!!, 1e-9)
        val labelled = OnlineJson.decodeFromString<BattingPerformance>(
            """{"metrics":{"pa":120,"avg":0.31,"obp":0.36,"iso":0.1,"homeruns":3,"stolenBases":null},"labels":[{"id":"average","text":"アベレージヒッター","tone":"good"}]}""",
        )
        assertEquals("アベレージヒッター", labelled.labels.single().text)
        assertEquals(0, labelled.metrics!!.stolenBases)
    }

    @Test
    fun benchCandidatesAndPositionGroups() {
        val fielders = view.roster.filter { !it.isPitcher }
        val sorted = fielders.candidatesFor("short")
        assertTrue(sorted.zipWithNext().all { (a, b) -> a.fitness("short") >= b.fitness("short") })
        assertEquals("infield", positionGroup("short"))
        assertEquals("outfield", positionGroup("center"))
        fielders.forEach { p -> assertTrue(p.subPositions().none { it == p.position || p.fitness(it) < SUBSTITUTE_MIN_FITNESS }) }
        assertEquals(listOf(0, 1, 2), listOf(40, 41, 81).map { fatigueTone(it) })
    }
}
