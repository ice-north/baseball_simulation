package jp.icenorth.baseball.app

import jp.icenorth.baseball.app.ui.countdownText
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/** ホームの「次の進行まで」（Web 版 api.js の nextAdvanceText と同じ決まり） */
class CountdownTextTest {
    @Test fun waitingForADecisionIsNotCalledStopped() {
        // 手続き中は進行の時刻を持たない。以前は止まっているときと同じ「停止中」だった
        assertEquals("手続きの決定待ち", countdownText(null, awaitingDecision = true, now = 0))
        assertEquals("停止中", countdownText(null, awaitingDecision = false, now = 0))
        assertEquals("進行中…", countdownText(0, awaitingDecision = false, now = 0))
    }

    @Test fun moreThanAnHourShowsTheTimeInsteadOfThousandsOfMinutes() {
        // 日本時間 11/11 0:00:00.4 から 11/12(木) 0:00 まで（残り秒は切り捨てで 86399）
        val now = Instant.parse("2026-11-10T15:00:00.400Z").toEpochMilli()
        val at = Instant.parse("2026-11-11T15:00:00Z").toEpochMilli()
        assertEquals("11/12(木) 0:00", countdownText((at - now) / 1000, awaitingDecision = false, now = now))
        assertEquals("60:00", countdownText(3600, awaitingDecision = false, now = now))
        assertEquals("4:05", countdownText(245, awaitingDecision = false, now = now))
    }
}
