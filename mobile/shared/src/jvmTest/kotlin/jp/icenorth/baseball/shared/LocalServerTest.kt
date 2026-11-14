package jp.icenorth.baseball.shared

import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * ローカルの開発サーバー（`ONLINE_DISABLE_TIMER=1 node server/dev.mjs`、開幕済みのリーグ）に繋いで、
 * ログイン → ビュー → 打順の保存 → 読み直し を通す。
 * `ONLINE_TEST_ENDPOINT=http://127.0.0.1:3002/` のときだけ動く（CI では飛ばす）。
 */
class LocalServerTest {
    @Test
    fun savesLineupOnLocalServer() = runBlocking {
        val endpoint = System.getenv("ONLINE_TEST_ENDPOINT") ?: return@runBlocking
        val api = OnlineApi(endpoint)
        val auth = api.localLogin("player1")
        val view = api.view(auth)
        val draft = LineupDraft.from(view.lineup!!).swapBatters(0, 1)
        api.command(auth, view.revision, "lineup", draft.toPayload())
        val after = LineupDraft.from(api.view(auth).lineup!!)
        assertEquals(draft.slots, after.slots)
        // 古い版で送っても、版のずれだけなら送り直して通る
        val back = after.swapBatters(1, 0)
        api.command(auth, view.revision, "lineup", back.toPayload())
        assertEquals(back.slots, LineupDraft.from(api.view(auth).lineup!!).slots)
    }
}
