package jp.icenorth.baseball.app

import android.app.Application
import android.os.Looper
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.headersOf
import jp.icenorth.baseball.app.ui.BaseballTheme
import jp.icenorth.baseball.app.ui.OnlineApp
import jp.icenorth.baseball.shared.OnlineApi
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Rule
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
class AppUiTest {
    @get:Rule val rule = createComposeRule()
    private lateinit var model: AppViewModel
    private lateinit var client: HttpClient

    @After fun cleanup() {
        if (::model.isInitialized) rule.runOnIdle { model.logout() }
        if (::client.isInitialized) client.close()
    }

    private fun open(extra: String) {
        val app = RuntimeEnvironment.getApplication()
        app.getSharedPreferences("online", 0).edit().clear().commit()
        client = HttpClient(MockEngine { request ->
            val text = if (request.url.parameters["action"] == "login")
                """{"userId":"a","accessToken":"token","sessionId":"session"}"""
            else """{"revision":1,"teamName":"team","writable":true,$extra}"""
            respond(text, headers = headersOf(HttpHeaders.ContentType, "application/json"))
        })
        rule.runOnIdle {
            model = AppViewModel(app) { OnlineApi(it, client) }
            model.localLogin("player1")
        }
        rule.waitUntil(10_000) {
            shadowOf(Looper.getMainLooper()).idle()
            model.view != null && !model.busy
        }
        rule.setContent { BaseballTheme { OnlineApp(model) } }
    }

    @Test fun tradeAndProcedureNoticesBothRemainVisibleWithoutOverlap() {
        open(""""pendingPack":{"chosen":null,"packs":[]},"trades":[{"id":"t1","myTurn":true,"mine":false,"fromTeam":"other"}]""")
        val trade = rule.onNodeWithTag("trade-notice").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        val procedure = rule.onNodeWithTag("procedure-notice").assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        assertTrue("トレード通知が手続き通知を隠しています", trade.bottom <= procedure.top)
        rule.onNodeWithTag("procedure-notice").performClick()
        rule.onNodeWithText("初期メンバー選択").assertIsDisplayed()
    }

    @Test fun lastCampGainsCanBeReadAfterThePhaseHasFinished() {
        open(""""roster":[{"id":1,"name":"育成選手","position":"first"}],"lastCamp":{"year":1,"rounds":4,"last":{"round":4,"gains":{"1":{"batting.meet":1}}},"gains":{"1":{"batting.meet":4}}}""")
        rule.onNodeWithTag("tab-Procedures").performClick()
        rule.onNodeWithText("1年目のキャンプ結果").assertIsDisplayed()
        rule.onNodeWithText("練習の成果").assertIsDisplayed()
        rule.onNodeWithText("1人が伸びました").assertIsDisplayed()
    }
}
