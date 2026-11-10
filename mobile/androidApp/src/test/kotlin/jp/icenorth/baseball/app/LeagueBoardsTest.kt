package jp.icenorth.baseball.app

import jp.icenorth.baseball.app.ui.moveMark
import jp.icenorth.baseball.app.ui.standingGroups
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.Standing
import org.junit.Assert.assertEquals
import org.junit.Test

/** 試合タブの順位表（Web 版 LeaguePanels.jsx の Standings と同じ決まり） */
class LeagueBoardsTest {
    @Test fun standingsAreSplitByLeagueAndMarkPromotionAndRelegation() {
        val view = LeagueView(
            teamLeagues = mapOf("a1" to "A", "a2" to "A", "a3" to "A", "b1" to "B", "b2" to "B"),
            standings = listOf(
                Standing("a3", wins = 5, losses = 5, winRate = 0.5),
                Standing("b2", wins = 3, losses = 7, winRate = 0.3),
                Standing("a1", wins = 7, losses = 3, winRate = 0.7),
                Standing("b1", wins = 6, losses = 4, winRate = 0.6),
                Standing("a2", wins = 5, losses = 5, winRate = 0.5),
            ),
        )
        val groups = standingGroups(view)
        assertEquals(listOf("1部 順位", "2部 順位"), groups.map { it.title })
        // 同率は勝ち数 → 球団名の順（compareLeagueStanding）
        assertEquals(listOf("a1", "a2", "a3"), groups[0].rows.map { it.team })
        // 1部は最下位が降格圏、2部は首位が昇格圏
        assertEquals(listOf(null, null, "降格圏"), groups[0].rows.indices.map { groups[0].moveMark(it) })
        assertEquals(listOf("昇格圏", null), groups[1].rows.indices.map { groups[1].moveMark(it) })
    }

    @Test fun oldViewWithoutLeaguesHasNoMarks() {
        val view = LeagueView(standings = listOf(Standing("x", wins = 1, winRate = 1.0), Standing("y", losses = 1)))
        val groups = standingGroups(view)
        assertEquals(1, groups.size)
        assertEquals(listOf(null, null), groups[0].rows.indices.map { groups[0].moveMark(it) })
    }
}
