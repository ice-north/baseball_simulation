package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlin.test.Test
import kotlin.test.assertEquals

/** 画面ごとに書いていた小さな道具をまとめたもの（成績の書式・id の鍵・スコアボードの R・H・E） */
class StatHelpersTest {
    private fun json(text: String): JsonObject = OnlineJson.parseToJsonElement(text) as JsonObject

    @Test
    fun formatsCareerValuesLikeTheTables() {
        assertEquals(".312", formatStat(statFormatOf("rate"), 0.3123))
        assertEquals("1.000", formatStat(statFormatOf("rate"), 1.0))
        assertEquals("3.05", formatStat(statFormatOf("decimal"), 3.049))
        assertEquals("12.00", formatStat(statFormatOf("decimal"), 12.0))
        assertEquals("45", formatStat(statFormatOf("count"), 45.0))
        assertEquals("45", formatStat(statFormatOf(null), 44.6))
        assertEquals("—", formatStat(StatFormat.Rate, null))
    }

    @Test
    fun idKeyMatchesNumbersAndStrings() {
        assertEquals("12", json("""{"id":12}""").idKey())
        assertEquals("12", json("""{"id":12.0}""").idKey())
        assertEquals("p-3", json("""{"id":"p-3"}""").idKey())
        assertEquals(null, json("""{}""").idKey())
    }

    @Test
    fun scoreBoardTotalsAddUpPlayers() {
        val game = json(
            """{"away":"美瑛","home":"津田沼","awayScore":3,"lineScore":{"away":[1,0,2],"home":[0,0,1]},
            "teams":{"美瑛":[{"batting":{"hits":2,"errors":1}},{"batting":{"hits":3}}]}}""",
        )
        assertEquals(listOf("3", "5", "1"), scoreBoardTotals(game, "away"))
        // 点数が無ければ回ごとの得点の合計、個人成績が無ければ「-」
        assertEquals(listOf("1", "-", "-"), scoreBoardTotals(game, "home"))
    }
}
