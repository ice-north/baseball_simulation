package jp.icenorth.baseball.shared

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** ホーム画面のウィジェットの3行（D1） */
class WidgetTest {
    private fun view(games: String) = OnlineJson.decodeFromString<LeagueView>(
        """{"teamName":"津田沼","year":2027,"currentDate":{"year":2027,"month":6,"day":3},
            "teamLabels":{"美瑛":{"label":"美瑛ベアーズ","short":"美瑛"}},
            "teamLeagues":{"津田沼":"A","美瑛":"A"},
            "standings":[{"team":"美瑛","wins":31,"losses":19,"gamesPlayed":50},{"team":"津田沼","wins":30,"losses":20,"gamesPlayed":50}],
            "recentGames":[$games],
            "nextGames":[{"id":11,"date":{"year":2027,"month":6,"day":4},"home":"美瑛","away":"津田沼"}]}""",
    )

    private val g42 = """{"id":9,"date":{"year":2027,"month":6,"day":2},"number":42,"home":"美瑛","away":"津田沼","homeScore":3,"awayScore":5}"""

    @Test
    fun threeLines() {
        val w = widgetSummary(view(g42))!!
        assertEquals("津田沼 6/3", w.title)
        assertEquals("30勝20敗 1部2位（首位と1差）", w.standing)
        assertEquals("前の試合 ○ 5-3 美瑛（第42戦）", w.last)
        assertEquals("次 6/4 美瑛（敵地）", w.next)
    }

    @Test
    fun unseenQuickReplayHidesTheResult() {
        val withLine = g42.replace("\"homeScore\":3", "\"lineScore\":{\"away\":[0,5],\"home\":[3,0]},\"homeScore\":3")
        val w = widgetSummary(view(withLine), emptySet())!!
        assertEquals("結果はアプリの速報で", w.standing)
        assertEquals("前の試合 美瑛戦（速報で見られます）", w.last)
        val seen = widgetSummary(view(withLine), setOf("2027:9"))!!
        assertEquals("前の試合 ○ 5-3 美瑛（第42戦）", seen.last)
    }

    @Test
    fun noViewNoWidget() {
        assertNull(widgetSummary(null))
    }
}
