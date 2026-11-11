package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PlayerLookupTest {
    private val roster = OnlineJson.decodeFromString<List<JsonObject>>(
        """[{"id":1,"name":"山田 太郎"},{"id":2,"name":"佐藤 次郎"}]""",
    )

    @Test
    fun findsByIdAndNeverFallsBackToTheName() {
        assertEquals(2L, findRosterPlayer(roster, 2, "佐藤 次郎")?.pid)
        // ⚠ 退団した「山田 太郎」（id 9）と同じ名前の別人が名簿にいても、別人を開かない
        assertNull(findRosterPlayer(roster, 9, "山田 太郎"))
    }

    @Test
    fun rowsWithoutAnIdAreFoundByName() {
        // 古いサーバーのタイトル争いの行には id が無い
        assertEquals(1L, findRosterPlayer(roster, null, "山田 太郎")?.pid)
        assertNull(findRosterPlayer(roster, null, "鈴木 三郎"))
        assertNull(findRosterPlayer(roster, null, null))
    }
}
