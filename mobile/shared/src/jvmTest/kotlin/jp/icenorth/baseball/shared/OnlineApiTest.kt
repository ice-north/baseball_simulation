package jp.icenorth.baseball.shared

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.http.headersOf
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/** 指示の送り直し（版のずれだけなら最新の版で1回だけ）。Web 版 OnlineApp.jsx の command と同じ決まり */
class OnlineApiTest {
    private val auth = AuthSession(userId = "a", accessToken = "token", sessionId = "session")

    /** 版 1 で送ると「版のずれ」で断り、版 2 なら受け付けるサーバー。送られた (命令, 版) を残す */
    private fun server(sent: MutableList<Pair<String, Int>>): OnlineApi = OnlineApi(
        "http://test/",
        HttpClient(
            MockEngine { request ->
                val json = headersOf(HttpHeaders.ContentType, "application/json")
                when (request.url.parameters["action"]) {
                    "view" -> respond("""{"revision":2}""", headers = json)
                    "command" -> {
                        val body = OnlineJson.parseToJsonElement((request.body as TextContent).text).jsonObject
                        val revision = body.at("revision").int() ?: 0
                        sent += body.at("type").str().orEmpty() to revision
                        if (revision == 2) respond("""{"ok":true}""", headers = json)
                        else respond("""{"error":"他の操作で更新されました","code":"revision"}""", HttpStatusCode.Conflict, json)
                    }
                    else -> respond("{}", headers = json)
                }
            },
        ),
    )

    @Test
    fun campRoundIsSentAgainOnlyForARevisionMismatch() = runBlocking {
        // ⚠ アプリだけキャンプのクールが抜けていた（Web 版の一覧には入っている）
        assertEquals(setOf("lineup", "submit", "campRound"), RETRY_ON_REVISION)
        for (type in RETRY_ON_REVISION) {
            val sent = mutableListOf<Pair<String, Int>>()
            server(sent).command(auth, 1, type, JsonObject(emptyMap()))
            assertEquals(listOf(type to 1, type to 2), sent, "$type を最新の版で送り直していない")
        }
    }

    @Test
    fun tradeIsNotSentAgain() = runBlocking {
        // トレードの申し込みは送り直さない（二重の申し込みになりうる）
        val sent = mutableListOf<Pair<String, Int>>()
        val e = assertFailsWith<OnlineException> { server(sent).command(auth, 1, "trade", JsonObject(emptyMap())) }
        assertEquals("revision", e.code)
        assertEquals(listOf("trade" to 1), sent)
        assertTrue("trade" !in RETRY_ON_REVISION)
    }
}
