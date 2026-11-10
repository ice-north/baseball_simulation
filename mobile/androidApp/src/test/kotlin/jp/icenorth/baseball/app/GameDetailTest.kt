package jp.icenorth.baseball.app

import jp.icenorth.baseball.app.ui.lineScoreCells
import org.junit.Assert.assertEquals
import org.junit.Test

/** 試合の詳細のスコアボード（紙面のスコアボードと同じ書き方） */
class GameDetailTest {
    @Test fun homeWinningWithoutTheLastHalfInningShowsX() {
        val (top, bottom) = lineScoreCells(listOf(0, 1, 0, 0, 0, 0, 0, 0, 0), listOf(0, 0, 2, 0, 0, 0, 0, 0), walkOff = false)
        assertEquals(listOf("0", "1", "0", "0", "0", "0", "0", "0", "0"), top)
        assertEquals("x", bottom.last())
    }

    @Test fun walkOffInExtraInningsAddsTheColumnsAndMarksTheRun() {
        val (top, bottom) = lineScoreCells(List(10) { 0 }, List(9) { 0 } + 1, walkOff = true)
        assertEquals(10, top.size)
        assertEquals("1x", bottom.last())
    }
}
