package jp.icenorth.baseball.shared

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Web 版の `YearSummary.jsx`・`ProDraftResult.jsx` と同じ出し方・同じ文になっていること */
class YearSummaryTest {
    @Test
    fun shownFromYearEndUntilTheEndOfTheOpeningMonth() {
        assertTrue(isYearSummaryTime(2, 3, 1), "年度更新の直後（1月）")
        assertTrue(isYearSummaryTime(2, 3, 4), "開幕した月（キャンプで見逃した人のため）")
        assertFalse(isYearSummaryTime(2, 3, 5), "5月からは出さない")
        assertFalse(isYearSummaryTime(2, 3, 11), "次のストーブリーグで去年のまとめを出さない")
        assertFalse(isYearSummaryTime(2, 5, 1), "古い年のまとめは出さない")
        assertFalse(isYearSummaryTime(null, 3, 1))
    }

    @Test
    fun textsMatchTheWeb() {
        val s = YearSummary(year = 2, league = "2部", rank = 1, record = YearSummaryRecord(70, 50, 0))
        assertEquals("2部 1位（70勝50敗）", yearSummaryRankText(s))
        assertEquals("2部 1位（70勝49敗1分）", yearSummaryRankText(s.copy(record = YearSummaryRecord(70, 49, 1))))
        assertNull(yearSummaryRankText(YearSummary(year = 2)))
        assertEquals("入団 新人一郎（投）", yearSummaryMoveText(YearSummaryMove("in", "入団", "新人一郎", "pitcher")))
        assertEquals("プロ入り プロ八郎（中） → 中日", yearSummaryMoveText(YearSummaryMove("out", "プロ入り", "プロ八郎", "center", "中日")))
        // 相手の球団は内部名で来る。いまの球団名に引き直す（名前を変えた球団が前の名前で出ていた。2026-11-24 監査）
        val label = { n: String -> if (n == "三河ハリケーンズ") "新名フェニックス" else n }
        assertEquals("トレード 来た人（投） ← 新名フェニックス", yearSummaryMoveText(YearSummaryMove("in", "トレード", "来た人", "pitcher", "三河ハリケーンズ"), label))
    }

    @Test
    fun proDraftShowsOnlyThisYearAndRewardsPerPick() {
        val c = ChronicleView(proDrafted = listOf(
            ProDrafted(year = 3, team = "三陸", name = "甲"),
            ProDrafted(year = 3, team = "三陸", name = "乙"),
            ProDrafted(year = 2, team = "庄内", name = "去年"),
        ))
        val rows = proDraftOfYear(c, 3)
        assertEquals(listOf("甲", "乙"), rows.map { it.name })
        assertEquals("このリーグから2人がNPBへ。三陸アトラスからは2人。", proDraftLead(rows, "三陸", "三陸アトラス"))
        assertEquals("プロ入りに触れて、三陸アトラスの残った選手はプロ意識+10（100まで）・経験+60試合分。", proDraftReward(2, "三陸アトラス"))
        assertNull(proDraftReward(0, "三陸アトラス"))
        assertTrue(proDraftLead(emptyList(), "三陸", "x").startsWith("このリーグから指名された選手はいませんでした"))
    }

    /** 指名した時点の能力の写し（`player`）を読む。発表の名前を押すと開く（Web 版 ProDraftResult と同じ） */
    @Test
    fun proDraftKeepsTheSnapshot() {
        val c = OnlineJson.decodeFromString<ChronicleView>(
            """{"proDrafted":[{"year":3,"team":"三陸","name":"甲","player":{"id":7,"name":"甲","position":"pitcher","pitching":{"velocity":150}}},
               {"year":3,"team":"三陸","name":"乙"}]}""",
        )
        val rows = proDraftOfYear(c, 3)
        assertEquals(150, rows[0].player.at("pitching", "velocity").int())
        assertNull(rows[1].player)
    }
}
