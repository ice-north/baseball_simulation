package jp.icenorth.baseball.shared

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** 先方5項目（2026-11-20）のアプリ側の計算。PC（standingsGap.js・teamHistory.js・defenseRange.js・LeagueHistory.jsx）と同じ答えか */
class TeamAnalysisTest {
    private fun obj(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject

    @Test
    fun gapIsToTheTeamDirectlyAbove() {
        val rows = listOf(Standing("a", 10, 5), Standing("b", 9, 6), Standing("c", 9, 6), Standing("d", 6, 8))
        assertEquals(listOf(null, 1.0, 0.0, 2.5), gamesBehindAbove(rows))
        assertEquals(listOf("—", "1.0", "0.0", "2.5"), gamesBehindAbove(rows).map(::gapText))
        assertEquals("0.0", gapText(-0.0))
    }

    @Test
    fun historySlotPutsFirstDivisionOnTop() {
        assertEquals(1, historySlot("1部", 1))
        assertEquals(6, historySlot("1部", 6))
        assertEquals(7, historySlot("2部", 1))
        assertNull(historySlot("3部", 1))
        assertNull(historySlot("1部", null))
        val points = historyPoints(
            listOf(TeamSeason(2, "1部", 1, 40, 20), TeamSeason(1, "2部", 1, 38, 22, move = "昇格")),
            null,
            null,
        )
        assertEquals(listOf(1, 2), points.map { it.year })
        assertEquals("2部優勝・昇格", points.first().mark)
        assertEquals("1部優勝", points.last().mark)
    }

    @Test
    fun defenseRangeMatchesWeb() {
        val p = obj("""{"position":"short","fielding":{"defense":80},"physical":{"speed":70,"arm":60},"positionFitness":{"second":50}}""")
        // 遊撃は本職（適性100）: (80*0.4 + 70*0.3 + 60*0.3)/100 = 0.71
        assertEquals(0.71, defenseRange(p, "short"), 1e-9)
        // 二塁は適性50 → 0.75倍
        assertEquals(0.71 * 0.75, defenseRange(p, "second"), 1e-9)
        assertEquals("B", defenseGrade(0.71).label)
        // 一塁は適性無し（0）→ 半分
        assertEquals((80 * 0.5 + 70 * 0.25 + 60 * 0.25) / 100 * 0.5, defenseRange(p, "first"), 1e-9)
    }

    @Test
    fun pastTablesSplitByDivision() {
        val entry = obj(
            """{"year":1,"standings":[{"team":"x","wins":5,"losses":5},{"team":"y","wins":7,"losses":3},{"team":"z","wins":2,"losses":8}],
            "leagues":{"x":"A","y":"A","z":"B"},"moves":[{"teamId":"z","from":"B","to":"A"},{"teamId":"x","from":"A","to":"B"}],"playoffChampion":"y"}""",
        )
        val tables = pastTables(entry)
        assertEquals(listOf("1部", "2部"), tables.map { it.league?.name })
        assertEquals(listOf("y", "x"), tables.first().rows.map { it.team })
        assertEquals(mapOf("z" to "昇格", "x" to "降格"), pastMoves(entry))
    }

    @Test
    fun radarScalesByLeaguePosition() {
        val all = listOf(mapOf("offense" to 40), mapOf("offense" to 60))
        val scales = ratingScales(all)
        assertEquals(RADAR_INNER, radarFraction(scales, "offense", 40), 1e-9)
        assertEquals(1.0, radarFraction(scales, "offense", 60), 1e-9)
        assertEquals(2, rankIn(listOf(40.0, 60.0, 50.0), 50.0))
        assertEquals(1, rankIn(listOf(3.1, 2.5), 2.5, better = false))
        assertTrue(COACH_ABILITY_ITEMS.size == 8)
    }

    /** 部の平均は PC（TeamAnalysis.jsx）の Math.round と同じく .5 を上へ丸める（kotlin.math.round は偶数へ丸めて1ずれた） */
    @Test
    fun ratingAverageRoundsHalfUpLikeMathRound() {
        val avg = ratingAverage(listOf(mapOf("offense" to 2, "defense" to 50), mapOf("offense" to 3, "defense" to 51)))
        assertEquals(3, avg["offense"])
        assertEquals(51, avg["defense"])
        assertNull(avg["speed"])
        assertEquals(3, jsRound(2.5))
        assertEquals(4, jsRound(3.5))
        assertEquals(-2, jsRound(-2.5))
        assertEquals(-3, jsRound(-2.6))
    }

    /** 判断6（2026-11-20 監査）: 守備分析は DH の行を末尾に出し（PC と同じ）、チーム守備の平均には入れない */
    @Test
    fun defenseRowsKeepDhAtTheEnd() {
        val rows = listOf("dh", "short", "catcher", "right", "first").mapIndexed { i, pos ->
            obj("""{"playerId":$i,"battingOrder":${i + 1},"position":"$pos"}""")
        }
        assertEquals(listOf("catcher", "first", "short", "right", "dh"), defenseRows(rows).map { it.at("position").str() })
        assertEquals(listOf(false, true, true, true, true), rows.map { isFieldPosition(it.at("position").str()) })
        assertEquals("DH", defensePositionLabel("dh"))
        assertEquals("遊", defensePositionLabel("short"))
    }

    /**
     * 判断6（2026-11-20 監査）: 項目が無い（古いサーバー）のと空を見分ける。
     * ⚠ kotlinx.serialization の既定値を空の一覧にすると、無いのと空が同じになり「まだ指導した球団は
     *    ありません」と事実と違う文になっていた
     */
    @Test
    fun missingItemsAreNotEmpty() {
        assertTrue(!hasTeamRatings(obj("""{"teamName":"x"}""")))
        assertTrue(hasTeamRatings(obj("""{"teamRatings":{}}""")))
        assertNull(teamRatingsOf(obj("""{"teamRatings":{}}"""), "x"))
        val old = OnlineJson.decodeFromString(CoachCard.serializer(), """{"id":"c1","name":"山田 太郎"}""")
        assertNull(old.stints)
        assertNull(old.pupils)
        val fresh = OnlineJson.decodeFromString(CoachCard.serializer(), """{"id":"c1","name":"山田 太郎","stints":[],"pupils":[]}""")
        assertEquals(emptyList(), fresh.stints)
        assertEquals(emptyList(), fresh.pupils)
    }
}
