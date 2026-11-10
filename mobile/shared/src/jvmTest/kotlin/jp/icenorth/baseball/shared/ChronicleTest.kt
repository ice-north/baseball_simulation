package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * 年代記（節目・引退・裏の大会・マジック・球団史）の紙面と文。
 * 窓口の答えは mobile/tools/chronicle-fixtures.mjs で作ったもの（resources/chronicle/）。
 * 作った紙面は build/chronicle-pages.txt に書き出す（文面を目で確かめる用）
 */
class ChronicleTest {
    private fun res(name: String) = javaClass.getResource("/chronicle/$name")!!.readText()
    private val late = OnlineJson.decodeFromString<LeagueView>(res("view-late.json"))
    private val lateRaw = OnlineJson.decodeFromString<JsonObject>(res("view-late.json"))
    private val off = OnlineJson.decodeFromString<LeagueView>(res("view-offseason.json"))
    private val offRaw = OnlineJson.decodeFromString<JsonObject>(res("view-offseason.json"))
    private val team = OnlineJson.decodeFromString<JsonObject>(res("team.json"))

    private fun dump(page: FrontPage): String = buildString {
        appendLine("【${page.title}】 ${page.issue}  ${page.team} ${page.standing}")
        appendLine("■ ${page.headline}")
        page.articles.forEach { appendLine("- <${it.kicker}> ${it.title}\n    ${it.body}") }
    }

    private fun noHoles(page: FrontPage) {
        for (a in page.articles) for (text in listOf(a.title, a.body))
            assertTrue("null" !in text && "\${" !in text, "穴がある: $text")
    }

    @Test
    fun readsChronicle() {
        assertTrue(late.races.isNotEmpty(), "マジックが無い")
        assertTrue(late.chronicle.milestones.isNotEmpty(), "節目が無い")
        assertTrue(off.chronicle.retired.isNotEmpty(), "引退が無い")
        assertTrue(off.chronicle.world.any { it.kind == "koshien" } && off.chronicle.world.any { it.kind == "grand" }, "裏の大会が無い")
        val c = OnlineJson.decodeFromJsonElement(TeamChronicle.serializer(), team.at("chronicle")!!)
        assertTrue(c.seasons.isNotEmpty() && c.records.isNotEmpty())
        assertTrue(c.seasons.first().line.contains("勝"), c.seasons.first().line)
    }

    @Test
    fun papersCarryChronicle() {
        val localLate = buildFrontPage(late, lateRaw)
        val nationalLate = buildNationalPage(late, lateRaw, localLate)
        val localOff = buildFrontPage(off, offRaw)
        val nationalOff = buildNationalPage(off, offRaw, localOff)
        File("build/chronicle-pages.txt").writeText(listOf(localLate, nationalLate, localOff, nationalOff).joinToString("\n") { dump(it) })
        listOf(localLate, nationalLate, localOff, nationalOff).forEach(::noHoles)
        // 終盤: 戦線にマジック、リーグ全体の記録
        assertTrue(nationalLate.articles.any { it.kicker.endsWith("戦線") && ("マジック" in it.body || "決定" in it.body) }, "戦線にマジックが無い")
        assertTrue(nationalLate.articles.any { it.kicker == "記録" }, "全国紙に節目が無い")
        // 甲子園（8月）は同じ年のうちは載る。年度更新のあとは載せない（去年の話になる）
        assertTrue(nationalLate.articles.any { it.kicker == "甲子園" }, "全国紙に甲子園が無い")
        assertTrue(nationalOff.articles.none { it.kicker == "甲子園" }, "年をまたいだ甲子園が載っている")
        // オフ: 引退
        assertTrue(nationalOff.articles.any { it.kicker == "引退" }, "全国紙に引退が無い")
        assertTrue(nationalOff.articles.first { it.kicker == "引退" }.body.contains("の打撃コーチとして"), "引退後の役職の書き方")
    }

    /** 決着の記事は11月の手続きの間も残るので、時期によらない文にする（「プレーオフに臨む」と書かない） */
    @Test
    fun decidedRaceReadsTheSameAfterTheSeason() {
        val team = late.teamName!!
        val decided = Race(league = late.teamLeagues[team], leagueName = "1部", kind = "first", team = team, clinched = true)
        val contract = late.copy(phase = Phase(kind = "contract"), races = listOf(decided))
        val article = buildFrontPage(contract, lateRaw).articles.first { it.kicker == "決定" }
        assertEquals("レギュラーシーズン1位の座を手にした。", article.body)
        // 決定の文はどれも先の予定（プレーオフ・開幕）を言わない
        for (kind in listOf("first", "promotion", "survive", "relegated"))
            assertTrue("臨む" !in raceText(decided.copy(kind = kind), { it })!!.body, kind)
    }

    @Test
    fun raceWording() {
        val short = { n: String -> n.take(2) }
        assertEquals("宮崎、昇格へマジック3", raceText(Race(leagueName = "2部", kind = "promotion", team = "宮崎アトラス", magic = 3, rival = "新潟ブルズ", left = 5), short)!!.head)
        assertEquals("宮崎、1部1位が決定", raceText(Race(leagueName = "1部", kind = "first", team = "宮崎アトラス", clinched = true), short)!!.head)
        assertEquals("通算100安打に到達（このリーグで）", milestoneText(Milestone(kind = "career", label = "通算100安打")))
        assertNotNull(worldText(WorldNews(kind = "koshien", champion = "A高"), short))
    }
}
