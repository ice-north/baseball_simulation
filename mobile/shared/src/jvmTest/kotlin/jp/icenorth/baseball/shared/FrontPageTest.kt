package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.coroutines.runBlocking
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * 紙面（地元紙・全国紙）を、開発サーバーで6月まで進めたリーグの実際の窓口の答えで作って確かめる
 * （resources/front/ … mobile/tools/seed-league.mjs の running から8ターン×6進めたもの）。
 * 作った紙面は build/front-pages.txt に書き出す（文面を目で確かめる用）
 */
class FrontPageTest {
    private fun res(name: String) = javaClass.getResource("/front/$name")!!.readText()
    private val view = OnlineJson.decodeFromString<LeagueView>(res("view.json"))
    private val raw = OnlineJson.decodeFromString<JsonObject>(res("view.json"))
    private val game = OnlineJson.decodeFromString<JsonObject>(res("game.json"))
    private val team = OnlineJson.decodeFromString<JsonObject>(res("team.json"))
    private val opponent = team.at("roster").list().mapNotNull { e -> runCatching { OnlineJson.decodeFromJsonElement(Player.serializer(), e) }.getOrNull() }
    private val history = runBlocking {
        loadOwnHistory(view.teamName!!) { OnlineJson.decodeFromString<JsonObject>(res("games.json")) }
    }

    private fun local() = buildFrontPage(view, raw, game, history = history.first, historyComplete = history.second, opponent = opponent)

    private fun dump(page: FrontPage): String = buildString {
        appendLine("【${page.title}】${page.badge}${if (page.extra) "（号外）" else ""}  ${page.issue}  ${page.team} ${page.standing}")
        page.kicker?.let { appendLine("［$it］") }
        appendLine("■ ${page.headline}")
        page.score?.let { appendLine("  ${it.away} ${it.awayScore}-${it.homeScore} ${it.home}") }
        page.lineScore?.let { appendLine("  ${it.away}: ${it.awayRuns}  ${it.home}: ${it.homeRuns}${if (it.walkOff) "x" else ""}") }
        page.subhead?.let { appendLine("  $it") }
        page.lead?.let { appendLine("  $it") }
        page.box.forEach { (k, v) -> appendLine("  [$k] $v") }
        page.articles.forEach { appendLine("- <${it.kicker}> ${it.title}\n    ${it.body}") }
        page.shorts.forEach { appendLine("  ・$it") }
    }

    @Test
    fun readsNewFields() {
        assertTrue(view.teamStreaks.isNotEmpty())
        assertTrue(view.roster.any { it.recent != null })
        assertTrue(view.roster.any { it.careerHistory.isNotEmpty() })
        assertNotNull(game.at("lineScore").obj())
        assertTrue(opponent.isNotEmpty())
    }

    @Test
    fun buildsBothPapers() {
        val local = local()
        val national = buildNationalPage(view, raw, local)
        File("build/front-pages.txt").writeText(dump(local) + "\n" + dump(national))
        assertEquals(FrontPage.Paper.Local, local.paper)
        assertEquals(localTitle(view.teamShort(view.teamName!!)), local.title)
        assertNotNull(local.lineScore)
        assertTrue(local.box.any { it.first == "勝" })
        assertTrue(local.articles.any { it.kicker == "警戒警報" })
        assertTrue(local.articles.any { it.kicker == "ひと言" })
        assertEquals(FrontPage.Paper.National, national.paper)
        assertTrue(national.articles.any { it.kicker == "1部戦線" })
        assertTrue(national.articles.any { it.kicker == "2部戦線" })
        // 紙面の文に「null」「-」だけの穴が出ないこと
        for (p in listOf(local, national)) {
            val text = dump(p)
            assertTrue("null" !in text, text)
        }
    }

    /** 読み終わる前の別の試合の詳細では、見出しもスコアボードも勝敗投手・本塁打の欄も作らない */
    @Test
    fun ignoresDetailOfAnotherGame() {
        val stale = JsonObject(game + ("gameId" to JsonPrimitive(-1L)))
        val page = buildFrontPage(view, raw, stale, history = history.first, historyComplete = history.second, opponent = opponent)
        val bare = buildFrontPage(view, raw, null, history = history.first, historyComplete = history.second, opponent = opponent)
        assertNotEquals(bare.box, local().box) // 詳細があれば欄の中身が変わる（他球団の投手に球団名）
        assertNull(page.lineScore)
        assertEquals(bare.box, page.box)
        assertEquals(bare.headline, page.headline)
    }

    /** 回ごとの得点から逆転・先制が分かる */
    @Test
    fun readsTheFlowOfTheGame() {
        val facts = GameFacts(0, 0, 0, 0, 0, emptyList(), emptyList(), ourInnings = listOf(0, 0, 3), theirInnings = listOf(2, 0, 0), ourHome = true)
        assertEquals(listOf(-2, -2, -2, -2, -2, 1), facts.diffs)
        assertTrue(facts.trailed)
        assertEquals(2, facts.maxDeficit)
        assertEquals(false, facts.scoredFirst)
    }
}
