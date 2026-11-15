package jp.icenorth.baseball.shared

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** 試合結果の通知の中身と、二重に知らせない印 */
class ResultNoticeTest {
    private fun view(games: String) = OnlineJson.decodeFromString<LeagueView>(
        """{"teamName":"津田沼","teamLabels":{"美瑛":{"label":"美瑛ベアーズ","short":"美瑛"}},
            "teamLeagues":{"津田沼":"A","美瑛":"A"},
            "standings":[{"team":"美瑛","wins":31,"losses":19,"gamesPlayed":50},{"team":"津田沼","wins":30,"losses":20,"gamesPlayed":50}],
            "recentGames":[$games]}""",
    )

    private val g41 = """{"id":7,"date":{"year":2027,"month":6,"day":1},"number":41,"home":"津田沼","away":"美瑛","homeScore":2,"awayScore":4}"""
    private val g42 = """{"id":9,"date":{"year":2027,"month":6,"day":2},"number":42,"home":"美瑛","away":"津田沼","homeScore":3,"awayScore":5,
        "decisions":{"winningPitcher":{"name":"山田"},"losingPitcher":{"name":"佐藤"},"savePitcher":{"name":"鈴木"}},
        "homeruns":[{"name":"田中","team":"津田沼","number":12},{"name":"高橋","team":"美瑛","number":3}]}"""

    @Test
    fun firstRunOnlyMarks() {
        val v = view("$g41,$g42")
        assertNull(resultNotice(v, null), "印がまだ無いときは知らせない（今季の試合をまとめて出さない）")
        assertNull(resultNotice(v, resultKeys(v)), "見た試合は二度知らせない")
    }

    @Test
    fun oneNewGame() {
        val before = view(g41)
        val after = view("$g41,$g42")
        val n = resultNotice(after, resultKeys(before))!!
        assertEquals("○ 5-3 美瑛（第42戦）", n.title)
        assertEquals("勝 山田  敗 佐藤  S 鈴木\n本塁打 田中12号\n30勝20敗 1部2位（首位と1差）", n.body)
    }

    @Test
    fun severalNewGamesAreOneNotice() {
        val n = resultNotice(view("$g41,$g42"), setOf("old"))!!
        assertEquals(2, n.games)
        assertEquals("2試合の結果（1勝1敗）", n.title)
        assertTrue(n.body.startsWith("● 2-4 美瑛（第41戦）\n○ 5-3 美瑛（第42戦）"))
    }

    @Test
    fun unplayedGamesAreIgnored() {
        val v = view("""{"id":1,"date":{"year":2027,"month":6,"day":3},"home":"津田沼","away":"美瑛"}""")
        assertTrue(resultKeys(v).isEmpty())
        assertNull(resultNotice(v, emptySet()))
    }

    /** 速報でまだ見ていない試合は、題にも本文にも結果を書かない（いしだの決定 2026-11-15） */
    @Test
    fun quickReplayNotSeenHidesTheScore() {
        val withLine = g42.replace("\"homeScore\":3", "\"lineScore\":{\"away\":[0,5],\"home\":[3,0]},\"homeScore\":3")
        val before = view(g41)
        val after = view("$g41,$withLine")
        val n = resultNotice(after, resultKeys(before), emptySet())!!
        assertEquals("試合が終わりました", n.title)
        assertEquals("美瑛戦の結果が届いています。アプリの速報で見られます", n.body)
        assertTrue(quickPending(after, null) != null, "印がまだ無ければ速報を出す")
        // 速報で見たあと（または回ごとの得点の無い古い試合）は今までどおり結果を書く
        val seenQuick = setOf(quickKey(after, after.recentGames.last()))
        assertNull(quickPending(after, seenQuick))
        assertEquals("○ 5-3 美瑛（第42戦）", resultNotice(after, resultKeys(before), seenQuick)!!.title)
        assertEquals("○ 5-3 美瑛（第42戦）", resultNotice(view("$g41,$g42"), resultKeys(before), emptySet())!!.title)
    }

    /** 速報を見るまでの紙面は、結果の分かる所を伏せてコラムだけ残す */
    @Test
    fun sealedFrontPageHidesTheResult() {
        val page = FrontPage(
            issue = "6月2日", team = "津田沼", standing = "1部 2位 30勝20敗", status = null, alerts = listOf("手続き"),
            headline = "津田沼 逆転勝ち", kicker = "連勝", subhead = "山田 5勝目", lead = "5-3で勝った", tone = FrontPage.Tone.Win,
            score = FrontPage.Score("津田沼", 5, "美瑛", 3),
            articles = listOf(FrontPage.Article("監督談話", "よく打った", "…"), FrontPage.Article("コラム", "TIPS", "…", LINK_TIPS)),
            shorts = listOf("美瑛 3-5 津田沼"), extra = true, box = listOf("勝" to "山田"),
        )
        val s = page.sealedForQuick()
        assertEquals("速報が届いています", s.headline)
        assertNull(s.score); assertNull(s.standing); assertNull(s.kicker); assertNull(s.subhead)
        assertEquals(listOf("コラム"), s.articles.map { it.kicker })
        assertTrue(s.shorts.isEmpty() && s.box.isEmpty() && !s.extra)
        assertEquals(listOf("手続き"), s.alerts)
    }

    /** 本物のビュー（view-fixture.mjs が書き出した6月のビュー）の recentGames を読めること */
    @Test
    fun readsTheRealView() {
        val v = OnlineJson.decodeFromString<LeagueView>(javaClass.getResource("/front/view.json")!!.readText())
        assertEquals(5, resultKeys(v).size)
        val last = v.recentGames.last()
        val n = resultNotice(v, resultKeys(v) - last.noticeKey())!!
        assertEquals(1, n.games)
        assertTrue(n.title.contains("（第${last.number}戦）"), n.title)
        assertTrue(n.body.contains("位"), n.body)
    }
}
