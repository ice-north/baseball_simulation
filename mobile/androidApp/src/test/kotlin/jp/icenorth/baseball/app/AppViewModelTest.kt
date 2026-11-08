package jp.icenorth.baseball.app

import android.app.Application
import android.os.Looper
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.headersOf
import jp.icenorth.baseball.shared.OnlineApi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
@LooperMode(LooperMode.Mode.PAUSED)
class AppViewModelTest {
    private lateinit var app: Application
    private lateinit var model: AppViewModel
    private val clients = mutableListOf<HttpClient>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    @Before fun prepare() {
        app = RuntimeEnvironment.getApplication()
        app.getSharedPreferences("online", 0).edit().clear().commit()
    }

    @After fun cleanup() {
        if (::model.isInitialized) model.logout()
        idle()
        scope.cancel()
        clients.forEach { it.close() }
    }

    private fun create(handler: suspend (String) -> String) {
        model = AppViewModel(app) { endpoint ->
            val client = HttpClient(MockEngine { request ->
                respond(handler(request.url.parameters["action"].orEmpty()), headers = headersOf(HttpHeaders.ContentType, "application/json"))
            })
            clients.add(client)
            OnlineApi(endpoint, client)
        }
    }

    private fun login() {
        model.localLogin("player1")
        until { model.view?.revision == 1 && !model.busy }
    }

    @Test fun commandKeepsItsViewWhenAnOlderReloadFinishesLater() {
        val oldReadStarted = CompletableDeferred<Unit>()
        val releaseOldRead = CompletableDeferred<Unit>()
        var views = 0
        create { action ->
            when (action) {
                "login" -> AUTH
                "view" -> if (++views == 1) VIEW_1 else {
                    oldReadStarted.complete(Unit)
                    releaseOldRead.await()
                    VIEW_1
                }
                "command" -> """{"view":$VIEW_2}"""
                else -> "{}"
            }
        }
        login()
        model.reload(quiet = true)
        until { oldReadStarted.isCompleted }
        var completed = false
        model.command("rename", JsonObject(emptyMap())) { completed = true }
        until { completed && !model.busy }
        releaseOldRead.complete(Unit)
        idle()
        assertEquals(2, model.view?.revision)
        assertTrue(SessionStore(app).viewJson.orEmpty().contains("\"revision\":2"))
    }

    @Test fun refreshThatStartedBeforeLogoutCannotRestoreTheSession() {
        val refreshStarted = CompletableDeferred<Unit>()
        val releaseRefresh = CompletableDeferred<Unit>()
        create { action ->
            when (action) {
                "login" -> AUTH_EXPIRED
                "view" -> VIEW_1
                "refresh" -> {
                    refreshStarted.complete(Unit)
                    releaseRefresh.await()
                    """{"accessToken":"renewed","refreshToken":"new-refresh","expiresAt":9999999999999}"""
                }
                else -> "{}"
            }
        }
        login()
        var failure: Throwable? = null
        val read = scope.launch { runCatching { model.read("team") }.onFailure { failure = it } }
        until { refreshStarted.isCompleted }
        model.logout()
        releaseRefresh.complete(Unit)
        until { read.isCompleted }
        assertTrue(failure is CancellationException)
        assertNull(model.auth)
        assertNull(model.view)
        assertNull(SessionStore(app).auth)
        assertNull(SessionStore(app).viewJson)
        assertNull(model.error)
    }

    @Test fun savingDuringTokenRefreshKeepsTheRotatedCredentials() {
        val refreshStarted = CompletableDeferred<Unit>()
        val releaseRefresh = CompletableDeferred<Unit>()
        var refreshes = 0
        create { action ->
            when (action) {
                "login" -> AUTH_EXPIRED
                "view" -> VIEW_1
                "refresh" -> {
                    refreshes += 1
                    refreshStarted.complete(Unit)
                    releaseRefresh.await()
                    """{"accessToken":"renewed","refreshToken":"new-refresh","expiresAt":9999999999999}"""
                }
                "command" -> """{"view":$VIEW_2}"""
                else -> "{}"
            }
        }
        login()
        model.reload(quiet = true)
        until { refreshStarted.isCompleted }
        var completed = false
        model.command("rename", JsonObject(emptyMap())) { completed = true }
        releaseRefresh.complete(Unit)
        until { completed && !model.busy }
        assertEquals(1, refreshes)
        assertEquals("renewed", model.auth?.accessToken)
        assertEquals("new-refresh", SessionStore(app).auth?.refreshToken)
        assertEquals(2, model.view?.revision)
    }

    @Test fun responseFromLoggedOutUserCannotFillTheNextUsersReadCache() {
        val readStarted = CompletableDeferred<Unit>()
        val releaseRead = CompletableDeferred<Unit>()
        var reads = 0
        create { action ->
            when (action) {
                "login" -> AUTH
                "view" -> VIEW_1
                "team" -> if (++reads == 1) {
                    readStarted.complete(Unit)
                    releaseRead.await()
                    """{"owner":"old"}"""
                } else """{"owner":"new"}"""
                else -> "{}"
            }
        }
        login()
        var failure: Throwable? = null
        val old = scope.launch { runCatching { model.read("team") }.onFailure { failure = it } }
        until { readStarted.isCompleted }
        model.logout()
        releaseRead.complete(Unit)
        until { old.isCompleted }
        login()
        var next: JsonObject? = null
        val fresh = scope.launch { next = model.read("team") }
        until { fresh.isCompleted }
        assertTrue(failure is CancellationException)
        assertEquals(2, reads)
        assertEquals("\"new\"", next?.get("owner").toString())
    }

    @Test fun changingEndpointClearsThePreviousServersCredentialsAndView() {
        create { action -> if (action == "login") AUTH else if (action == "view") VIEW_1 else "{}" }
        login()
        model.changeEndpoint("https://another.invalid/api/online")
        assertNull(model.auth)
        assertNull(model.view)
        assertNull(SessionStore(app).auth)
        assertNull(SessionStore(app).viewJson)
    }

    private fun idle() {
        repeat(5) {
            shadowOf(Looper.getMainLooper()).idle()
            Thread.sleep(10)
        }
    }

    private fun until(condition: () -> Boolean) {
        val deadline = System.nanoTime() + 10_000_000_000L
        while (!condition()) {
            if (System.nanoTime() > deadline) fail("非同期処理が完了しませんでした")
            idle()
        }
        idle()
    }

    companion object {
        private const val AUTH = """{"userId":"a","accessToken":"token","sessionId":"session"}"""
        private const val AUTH_EXPIRED = """{"userId":"a","accessToken":"token","sessionId":"session","refreshToken":"refresh","expiresAt":0}"""
        private const val VIEW_1 = """{"revision":1,"teamName":"team","writable":true}"""
        private const val VIEW_2 = """{"revision":2,"teamName":"team","writable":true}"""
    }
}
