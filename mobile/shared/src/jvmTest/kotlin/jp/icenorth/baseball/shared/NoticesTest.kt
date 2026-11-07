package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Web 版の `src/online/notices.js` と同じ数え方になっていること */
class NoticesTest {
    private fun view(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject

    @Test
    fun packSelectionCountsUntilChosen() {
        val waiting = view("""{"pendingPack":{"packs":[],"chosen":null},"phase":{"kind":"contract"}}""")
        assertEquals("pack_select", pendingProcedure(waiting)?.kind, "初期メンバー待ちの間はリーグの手続きを出さない")
        assertNull(pendingProcedure(view("""{"pendingPack":{"packs":[],"chosen":"pack-3"},"phase":{"kind":"contract"}}""")))
    }

    @Test
    fun campCountsUntilAllRoundsAreDone() {
        val half = pendingProcedure(view("""{"phase":{"kind":"camp","deadline":"2026-11-08T00:00:00Z","camp":{"rounds":1,"total":4}}}"""))
        assertEquals("第2クール / 全4クール", half?.progress)
        assertEquals("2026-11-08T00:00:00Z", half?.deadline)
        // ⚠ キャンプには「決定」が無い。4クール終えたら済み
        assertNull(pendingProcedure(view("""{"phase":{"kind":"camp","camp":{"rounds":4,"total":4}}}""")))
    }

    @Test
    fun otherProceduresCountUntilDecided() {
        val open = pendingProcedure(view("""{"phase":{"kind":"contract"},"phaseDeadline":"2026-11-09T00:00:00Z"}"""))
        assertEquals("契約更改", open?.label)
        assertEquals("2026-11-09T00:00:00Z", open?.deadline, "締め切りはビューの側にもある")
        assertNull(pendingProcedure(view("""{"phase":{"kind":"contract","submission":{"ready":true}}}""")))
        assertNull(pendingProcedure(view("""{"phase":null}""")))
        assertNull(pendingProcedure(null))
    }

    @Test
    fun countAddsWaitingTrades() {
        val raw = view("""{"phase":{"kind":"tryout"},"trades":[{"id":"a","myTurn":true},{"id":"b","myTurn":false},{"id":"c","myTurn":true}]}""")
        assertEquals(2, waitingTradeCount(raw))
        assertEquals(3, noticeCount(raw))
        assertEquals(0, noticeCount(view("""{}""")))
    }
}
