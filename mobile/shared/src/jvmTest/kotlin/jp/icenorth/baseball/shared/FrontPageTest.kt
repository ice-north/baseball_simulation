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
 * （resources/front/ … mobile/tools/view-fixture.mjs で開発サーバーと同じ設定のリーグを6月12日まで進めたもの）。
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

    /** 同率（勝率も勝利数も同じ）の部の順位は球団名の順。PC の順位表・昇降格（compareLeagueStanding）と同じ */
    @Test
    fun tiesAreOrderedLikeThePc() {
        val me = view.teamName!!
        val league = view.teamLeagues[me]
        val mine = view.standings.first { it.team == me }
        // 同じ部の別の球団を自球団と同じ成績にし、ビュー（全球団を通した並び）では名前の後の方を先に置く
        val rival = view.standings.first { it.team != me && view.teamLeagues[it.team] == league }.team
        val (first, second) = listOf(me, rival).sorted()
        val tied = view.copy(standings = listOf(mine.copy(team = second), mine.copy(team = first)) + view.standings.filter { it.team != me && it.team != rival })
        val table = tied.leagueTable(league)
        assertEquals(listOf(first, second), table.map { it.team }.filter { it == me || it == rival })
        val rank = table.indexOfFirst { it.team == me } + 1
        val local = buildFrontPage(tied, raw)
        assertTrue(local.standing!!.contains("${rank}位"), local.standing)
        // 全国紙の戦線: 首位が並んだら名前の順で先の球団を首位と書く
        val (a, b) = view.standings.filter { view.teamLeagues[it.team] == league }.map { it.team }.take(2).sorted()
        val best = Standing(a, wins = 99, losses = 1, winRate = 0.99, gamesPlayed = 100)
        val topTied = view.copy(standings = listOf(best.copy(team = b), best) + view.standings.filter { it.team != a && it.team != b })
        val front = buildNationalPage(topTied, raw, buildFrontPage(topTied, raw)).articles.first { it.kicker == "${LEAGUE_NAMES[league]}戦線" }
        assertTrue(front.body.startsWith("首位は${view.teamShort(a)}（"), front.body)
    }

    /** サヨナラ負けの見出しは、決めた一打が本塁打なら「弾」、安打なら「打」。押し出し・犠飛では「サヨナラ打」と書かない */
    @Test
    fun walkOffLossNamesTheKindOfHit() {
        fun headlines(homerun: Boolean, hit: Boolean): Set<String> {
            val facts = GameFacts(
                5, 8, 0, 0, 0, emptyList(), emptyList(), walkOff = true,
                theirWinningHit = WinningHit("那覇", "比嘉", 9, homerun, hit, 1),
            )
            return (1..60).map { loseHeadline(Situation("宮崎", "那覇", false, 2, 3, 1, 0, 3, facts), Pen(it)) }.toSet()
        }
        val walk = headlines(homerun = false, hit = false)
        assertTrue(walk.none { "サヨナラ打" in it || "サヨナラ弾" in it }, walk.toString())
        val single = headlines(homerun = false, hit = true)
        assertTrue(single.any { "比嘉にサヨナラ打" in it } && single.none { "サヨナラ弾" in it }, single.toString())
        val homer = headlines(homerun = true, hit = true)
        assertTrue(homer.any { "比嘉にサヨナラ弾" in it } && homer.none { "サヨナラ打" in it }, homer.toString())
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
