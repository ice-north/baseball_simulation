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
        assertTrue(page.headline.contains("宮崎"), page.headline)
        assertNotNull(page.score)
        assertTrue(page.lead!!.contains("那覇"), page.lead)
        assertTrue(page.articles.any { it.kicker == "次戦予告" })
        assertTrue(page.articles.any { it.kicker == "タイトル戦線" })
        println(page)
        // 題字まわり（以前はホームの上の別カード）: 球団名・部の順位と勝敗
        assertTrue(page.team.isNotEmpty())
        assertTrue(page.standing!!.contains("位"), page.standing)
        // 記事の飛び先・コラム（TIPS）・お知らせ
        assertEquals(LINK_LINEUP, page.articles.first { it.kicker == "次戦予告" }.link)
        val withTip = buildFrontPage(view, raw, alerts = listOf("契約更改 を決めてください"), column = FrontPage.Article("コラム", "t", "b", LINK_TIPS))
        assertEquals("コラム", withTip.articles.last().kicker)
        assertEquals(listOf("契約更改 を決めてください"), withTip.alerts)
        // 試合が終わってすぐ、順位の文が「、。」にならない
        assertTrue(!page.lead!!.contains("、。"), page.lead)
        // 試合の無い紙面（初期メンバー選び）
        val pre = buildFrontPage(view.copy(results = emptyList(), pendingPack = kotlinx.serialization.json.JsonObject(emptyMap())), raw)
        assertEquals(FrontPage.Tone.None, pre.tone)
        assertTrue(pre.headline.contains("宮崎"), pre.headline)
    }

    @Test
    fun frontPageWordingVariesByGameButNotByOpening() {
        fun sit(ours: Int, theirs: Int, streak: Int = 1, broken: Int = 0, facts: GameFacts? = null) =
            Situation("宮崎", "那覇", true, ours, theirs, streak, broken, 3, facts)
        // 同じ試合なら同じ見出し（開き直しても変わらない）
        assertEquals(winHeadline(sit(3, 2), Pen(41)), winHeadline(sit(3, 2), Pen(41)))
        // 試合が変われば言い回しも変わる（40試合で何通りも出る）
        val variants = (1..40).map { winHeadline(sit(5, 2), Pen(it)) }.toSet()
        assertTrue(variants.size >= 4, variants.toString())
        // 場面ごとの言い回し
        assertTrue(winHeadline(sit(2, 1), Pen(1)).let { it.contains("1点") || it.contains("接戦") || it.contains("競り") || it.contains("軍配") }, winHeadline(sit(2, 1), Pen(1)))
        assertTrue(winHeadline(sit(4, 2, broken = 4), Pen(2)).contains("連敗"))
        assertTrue(loseHeadline(sit(0, 3), Pen(3)).let { it.contains("零") || it.contains("完封") || it.contains("打てず") || it.contains("1本") }, loseHeadline(sit(0, 3), Pen(3)))
        assertTrue(loseHeadline(sit(1, 4, broken = 5), Pen(4)).contains("連勝"))
        val noHitter = GameFacts(8, 0, 1, 0, 0, listOf(PitcherLine("山田", 27, 0, 11)), listOf(BatterLine("佐藤", 2, 1, 3)))
        assertTrue(winHeadline(sit(3, 0, facts = noHitter), Pen(5)).let { it.contains("ノー") || it.contains("無安打") || it.contains("1本も") })
        assertTrue(heroSubhead(sit(3, 0, facts = noHitter), FrontPage.Tone.Win, Pen(5))!!.contains("山田"))
        // 打者が主役の日
        val slugger = GameFacts(12, 7, 3, 0, 0, listOf(PitcherLine("田中", 18, 2, 5), PitcherLine("鈴木", 9, 0, 2)), listOf(BatterLine("佐藤", 3, 2, 5)))
        assertTrue(winHeadline(sit(9, 3, facts = slugger), Pen(6)).contains("佐藤"))
        assertTrue(heroSubhead(sit(9, 3, facts = slugger), FrontPage.Tone.Win, Pen(6))!!.contains("佐藤"))
        // 点を取られたら無安打でもノーヒットノーランとは書かない
        val walked = GameFacts(8, 0, 0, 0, 0, listOf(PitcherLine("山田", 27, 1, 9)), emptyList())
        (1..20).forEach { assertTrue(!winHeadline(sit(3, 1, facts = walked), Pen(it)).contains("ノー"), winHeadline(sit(3, 1, facts = walked), Pen(it))) }
        // 引き分けの日に負けの言い回し（実らず・報われず）を使わない
        assertTrue(heroSubhead(sit(2, 2, facts = slugger), FrontPage.Tone.Draw, Pen(8))!!.let { !it.contains("実らず") && !it.contains("報われず") })
        // 試合の無い時期
        assertTrue(phaseCopy("camp", false, true, "宮崎", Pen(7)).first.contains("宮崎"))
    }

    @Test
    fun ownHistoryReadsUntilStreakIsKnown() = kotlinx.coroutines.runBlocking {
        // 新しい順: 勝 勝 勝 負 負 | 負 勝 …（6試合ずつ）。変わり目が2つ見えた2ページ目で止まる
        fun g(id: Long, ours: Int, theirs: Int) = """{"gameId":$id,"date":{"year":2026,"month":4,"day":${id}},"home":"宮崎","away":"那覇","homeScore":$ours,"awayScore":$theirs}"""
        val all = listOf(g(20, 3, 1), g(19, 2, 1), g(18, 5, 0), g(17, 1, 2), g(16, 0, 3), g(15, 1, 4), g(14, 1, 5), g(13, 4, 1), g(12, 1, 0))
        var reads = 0
        val (games, complete) = loadOwnHistory("宮崎") { page ->
            reads++
            OnlineJson.parseToJsonElement("""{"count":${all.size},"games":[${all.drop(page * 6).take(6).joinToString(",")}]}""").jsonObject
        }
        assertEquals(2, reads)
        assertTrue(complete)
        assertEquals(listOf(12L, 13L, 14L, 15L, 16L, 17L, 18L, 19L, 20L), games.map { it.gameId })
        // 紙面: ビューには直近の1試合しか無くても、読んだ試合で3連勝と数える
        val page = buildFrontPage(view.copy(teamName = "宮崎", results = emptyList()), null, history = games, historyComplete = true)
        assertEquals(FrontPage.Tone.Win, page.tone)
        assertTrue(page.kicker!!.startsWith("3連勝"), page.kicker)
        assertTrue(!page.headline.contains("連敗"), page.headline) // 連敗を止めたのは3試合前
    }
}
