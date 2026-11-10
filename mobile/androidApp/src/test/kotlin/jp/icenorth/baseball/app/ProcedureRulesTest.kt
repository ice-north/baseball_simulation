package jp.icenorth.baseball.app

import jp.icenorth.baseball.app.ui.rulesText
import org.junit.Assert.assertEquals
import org.junit.Test

/** 手続きの決まりの文（Web 版 LeaguePanels.jsx の rulesText のスマホの文と同じ） */
class ProcedureRulesTest {
    private val deadline = "2026-11-11T15:00:00Z"

    @Test fun shortTextWithoutRepeatingTheDeadlineShownAbove() {
        // ⚠ 以前は PC 向けの長い文で、締め切りの日時も上の帯と二重に出ていた
        assertEquals("全員が決定するか、締め切りで進みます。", rulesText("contract", deadline, showDate = false))
        assertEquals("締め切り 11/12(木) 0:00。全員が決定するか、締め切りで進みます。", rulesText("contract", deadline, showDate = true))
        assertEquals("全員が決定すると進みます。", rulesText("contract", null, showDate = true))
    }

    @Test fun campKeepsWhatHappensToUnfinishedRounds() {
        assertEquals(
            "全員が4クール終えた時点で次へ進みます。締め切りまでに終わらなかったぶんは、最後に指示した内容で自動で行われます。",
            rulesText("camp", deadline, showDate = false),
        )
        assertEquals("全員が4クール終えると次へ進みます。", rulesText("camp", null, showDate = false))
    }
}
