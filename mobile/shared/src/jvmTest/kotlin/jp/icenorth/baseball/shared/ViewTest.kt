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
        // OPS は 1 を超える（打率の表記だと 1.000 で止まっていた）
        assertEquals(".812", ops3(0.8124))
        assertEquals("1.054", ops3(1.0536))
        assertEquals("-", ops3(null))
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

    @Test
    fun missingStartersBecomeEmptySlots() {
        // 年度末に2人抜けて6人になった打順でも、8つの守備位置の枠がそろい、空きは控えとの交代で埋められる
        val full = PlanDraft.from(view.lineup!!, view.roster)
        val gone = full.slots.take(2).map { it.playerId }.toSet()
        val roster = view.roster.filter { it.id !in gone }
        val draft = PlanDraft.from(view.lineup!!, roster)
        assertEquals(8, draft.slots.size)
        assertEquals(FIELD_POSITIONS.toSet(), draft.slots.map { it.position }.toSet())
        assertEquals(2, draft.slots.count { it.isEmpty })
        assertEquals("空いている打順があります。控えと交代して埋めてください", draft.problem())
        val bench = roster.filter { !it.isPitcher && it.isActive && draft.slots.none { s -> s.playerId == it.id } }
        var fixed = draft
        draft.slots.withIndex().filter { it.value.isEmpty }.zip(bench).forEach { (slot, p) -> fixed = fixed.replaceBatter(slot.index, p.id) }
        assertEquals(0, fixed.slots.count { it.isEmpty })
        // 保存済みの形が6人（null の枠も含む）でも同じ
        val six = normalizeSlots(listOf(BatterSlot(1, "catcher"), BatterSlot(2, "catcher"), BatterSlot(3, "pitcher")))
        assertEquals(8, six.size)
        assertEquals(FIELD_POSITIONS.toSet(), six.map { it.position }.toSet())
        assertEquals(5, six.count { it.isEmpty })
        assertEquals(8, six.map { it.playerId }.toSet().size)
    }

    @Test
    fun frontPageReadsLikeANewspaper() {
        val raw = OnlineJson.parseToJsonElement(raw).jsonObject
        val page = buildFrontPage(view, raw)
        // 開幕3日目: 最新の試合は 宮崎 2-6 那覇 の敗戦
        assertEquals(FrontPage.Tone.Lose, page.tone)
        assertTrue(page.headline.startsWith("宮崎"), page.headline)
        assertNotNull(page.score)
        assertTrue(page.lead!!.contains("那覇"), page.lead)
        assertTrue(page.articles.any { it.kicker == "次戦予告" })
        assertTrue(page.articles.any { it.kicker == "タイトル戦線" })
        println(page)
        // 試合の無い紙面（初期メンバー選び）
        val pre = buildFrontPage(view.copy(results = emptyList(), pendingPack = kotlinx.serialization.json.JsonObject(emptyMap())), raw)
        assertEquals(FrontPage.Tone.None, pre.tone)
        assertTrue(pre.headline.contains("初期メンバー"), pre.headline)
    }
}
