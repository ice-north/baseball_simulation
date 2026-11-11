package jp.icenorth.baseball.app

import android.app.Application
import android.os.Looper
import androidx.activity.OnBackPressedDispatcher
import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import io.ktor.http.content.TextContent
import java.util.Collections
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.headersOf
import jp.icenorth.baseball.app.ui.BaseballTheme
import jp.icenorth.baseball.app.ui.OnlineApp
import jp.icenorth.baseball.shared.LatestApp
import jp.icenorth.baseball.shared.OnlineApi
import org.junit.Assume.assumeTrue
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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

    /** @param answer ビューのほかの窓口の答え（action ごと）。null ならビューと同じものを返す */
    private fun open(extra: String, latest: LatestApp? = null, answer: (String) -> String? = { null }) {
        val app = RuntimeEnvironment.getApplication()
        app.getSharedPreferences("online", 0).edit().clear().commit()
        client = HttpClient(MockEngine { request ->
            val action = request.url.parameters["action"].orEmpty()
            if (action == "command") commands += (request.body as TextContent).text
            val text = if (action == "login")
                """{"userId":"a","accessToken":"token","sessionId":"session"}"""
            else answer(action) ?: """{"revision":1,"teamName":"team","writable":true,$extra}"""
            respond(text, headers = headersOf(HttpHeaders.ContentType, "application/json"))
        })
        rule.runOnIdle {
            model = AppViewModel(app, { latest }) { OnlineApi(it, client) }
            model.localLogin("player1")
        }
        rule.waitUntil(10_000) {
            shadowOf(Looper.getMainLooper()).idle()
            model.view != null && !model.busy
        }
        rule.setContent {
            back = LocalOnBackPressedDispatcherOwner.current?.onBackPressedDispatcher
            BaseballTheme { OnlineApp(model) }
        }
    }

    private var back: OnBackPressedDispatcher? = null
    /** 送った指示（本文） */
    private val commands: MutableList<String> = Collections.synchronizedList(mutableListOf())

    @Test fun tradeAndProcedureNoticesBothRemainVisibleWithoutOverlap() {
        open(""""pendingPack":{"chosen":null,"packs":[]},"trades":[{"id":"t1","myTurn":true,"mine":false,"fromTeam":"other"}]""")
        // ⚠ ホームでは手続きの帯を出さない（紙面の「お知らせ」に同じ文がある）。ほかのタブで確かめる
        rule.onNodeWithTag("tab-Games").performClick()
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

    @Test fun backGoesToHomeInsteadOfClosingTheApp() {
        open(""""roster":[]""")
        rule.onNodeWithTag("tab-Games").performClick()
        rule.onNodeWithTag("tab-Games").assertIsSelected()
        // ⚠ 以前は戻るでどのタブからでもアプリが閉じた
        rule.runOnIdle { back!!.onBackPressed() }
        rule.onNodeWithTag("tab-Home").assertIsSelected()
    }

    @Test fun choosingAPackInTheProcedureIsSavedRightAway() {
        val packs = """[{"id":"p1","name":"セットA","counts":{},"ranks":{},"players":[]},{"id":"p2","name":"セットB","counts":{},"ranks":{},"players":[]}]"""
        open(""""roster":[],"phase":{"id":"ph1","kind":"pack_select","packs":$packs,"submission":{"plan":{"packId":"p1"},"ready":false}}""")
        rule.onNodeWithTag("tab-Procedures").performClick()
        rule.onNodeWithTag("decision-bar").assertExists()
        rule.onNodeWithText("セットB").performScrollTo().performClick()
        // ⚠ 中身を見ている間は決定の帯を出さない（帯は選んでいるセットAを指したまま「この内容で決定」を出していた）
        rule.onNodeWithTag("decision-bar").assertDoesNotExist()
        rule.onNodeWithText("このセットにする").performScrollTo().performClick()
        rule.waitUntil(10_000) {
            shadowOf(Looper.getMainLooper()).idle()
            commands.isNotEmpty()
        }
        rule.onNodeWithTag("decision-bar").assertExists()
        // ⚠ 以前は未保存の編集になるだけで、「選択中」と出ても保存されなかった（途中参加の選択は押せば保存される）
        val sent = commands.single()
        assertTrue(sent, sent.contains("\"type\":\"submit\""))
        assertTrue(sent, sent.contains("\"packId\":\"p2\""))
        assertTrue(sent, sent.contains("\"ready\":false"))
    }

    @Test fun savingTheTryoutKeepsTheCandidateList() {
        val candidates = """[{"id":11,"name":"候補一","position":"pitcher"},{"id":12,"name":"候補二","position":"first"}]"""
        open(""""roster":[],"phase":{"id":"ph1","kind":"tryout","candidates":$candidates,"submission":{"plan":{"rankedIds":[11,12],"count":1},"ready":false}}""")
        rule.onNodeWithTag("tab-Procedures").performClick()
        // 候補の側に切り替える（切り替えの字と、候補の見出しの2つに「候補 2人」が出る）
        rule.onNodeWithText("候補 2人").performScrollTo().performClick()
        rule.onAllNodesWithText("候補 2人").assertCountEquals(2)
        rule.onNodeWithText("下書きを保存").performClick()
        rule.waitUntil(10_000) {
            shadowOf(Looper.getMainLooper()).idle()
            commands.isNotEmpty() && !model.busy
        }
        rule.waitForIdle()
        // ⚠ 以前は保存のたびに案を捨てて面を作り直し、候補の絞り込みや件数ごと「獲得予定」の側に戻っていた
        rule.onAllNodesWithText("候補 2人").assertCountEquals(2)
        assertTrue(model.phaseDraft?.dirty == false)
    }

    @Test fun backFromAGameKeepsTheListWhereItWas() {
        val games = (1..30).joinToString(",") { """{"gameId":$it,"date":{"month":5,"day":$it},"home":"team","away":"other","homeScore":1,"awayScore":0}""" }
        open(""""roster":[],"seasonYears":[1],"year":1""", answer = { action -> if (action == "games") """{"year":1,"count":30,"games":[$games]}""" else null })
        rule.onNodeWithTag("tab-Games").performClick()
        rule.onNodeWithText("5/25").performScrollTo().performClick()
        rule.onNodeWithText("‹ 試合結果へ戻る").assertIsDisplayed()
        rule.runOnIdle { back!!.onBackPressed() }
        // ⚠ 以前は一覧とスクロールの位置が詳細の分岐の後ろにあり、戻ると一覧の先頭に戻っていた
        rule.onNodeWithText("5/25").assertIsDisplayed()
    }

    @Test fun backFromTeamPlayersReturnsToTheStandings() {
        open(""""roster":[],"standings":[{"team":"team","wins":2},{"team":"rival","wins":1}]""")
        rule.onNodeWithTag("tab-Games").performClick()
        rule.onNodeWithTag("chip-standings").performClick()
        rule.onNodeWithText("rival").performClick()
        rule.onNodeWithTag("tab-Players").assertIsSelected()
        rule.runOnIdle { assertEquals("rival", model.playersTeam) }
        rule.runOnIdle { back!!.onBackPressed() }
        // ⚠ 以前は戻るでホームへ行き、試合タブも「試合結果」から。見ている球団も他球団のまま残っていた
        rule.onNodeWithTag("tab-Games").assertIsSelected()
        rule.onNodeWithTag("chip-standings").assertIsSelected()
        rule.runOnIdle { assertNull(model.playersTeam) }
    }

    @Test fun situationTipsCanBeReadAgainFromTheMenu() {
        open(""""roster":[{"id":1,"name":"疲れた人","position":"first","fatigue":85}],"lineup":{"battingOrder":[{"playerId":1,"position":"first","battingOrder":1}],"starters":[]}""")
        // 未読なので左下に印が出る
        rule.onNodeWithTag("situation-tips").assertExists()
        rule.onAllNodesWithContentDescription("メニュー").onFirst().performClick()
        rule.onNodeWithText("ゲームのTIPS（いま当てはまる1件）").performClick()
        // ⚠ 印は未読のときだけ出す（いしだ決定）。読んだあとも、当てはまる人はTIPSの一覧の先頭で見直せる
        //    （以前は who を出す入口が印だけで、一度読むと同じ種類のTIPSでは二度と見られなかった）
        rule.onNodeWithText("いまの状態に当てはまるTIPS").assertExists()
        rule.onNodeWithText("疲れた人（疲労85）").assertExists()
        rule.runOnIdle { assertTrue("fielderRest" in model.seenSituationTips) }
    }

    @Test fun delegatedProcedureShowsTheCoachPlanWithoutDecisions() {
        val roster = """[{"id":1,"name":"出す人","position":"first"},{"id":2,"name":"残す人","position":"second"}]"""
        open(
            """"roster":$roster,"lineup":{"battingOrder":[]},"phase":{"id":"ph1","kind":"contract","delegated":true,"submission":{"plan":{"releaseIds":[]},"ready":true}}""",
            answer = { action -> if (action == "defaults") """{"phaseId":"ph1","plan":{"releaseIds":[1]}}""" else null },
        )
        rule.onNodeWithTag("tab-Procedures").performClick()
        // ⚠ 任せた手続きはサーバーが指導者の案で決める。以前は編集・決定がそのまま出て「決定済み」と出るのに、案は使われなかった
        rule.onNodeWithTag("delegated-bar").assertExists()
        rule.onNodeWithTag("decision-bar").assertDoesNotExist()
        rule.onNodeWithText("この内容で決定").assertDoesNotExist()
        rule.onNodeWithText("下書きを保存").assertDoesNotExist()
        // 見せるのは指導者の案（標準案）。自分の提出（退団なし）ではない
        rule.onNodeWithText("退団させる選手（1人）").assertExists()
        rule.onNodeWithText("指導者の画面へ").performClick()
        rule.onNodeWithTag("tab-Plan").assertIsSelected()
        rule.onNodeWithTag("chip-Staff").assertIsSelected()
    }

    @Test fun homePaperTellsWhenANewerAppIsOut() {
        // 版の分からない所（git の無い手元）で作ったときは確かめない
        assumeTrue(BuildConfig.APP_COMMIT.isNotEmpty())
        open(""""roster":[]""", LatestApp("0".repeat(40), "2099-01-01T00:00:00Z"))
        rule.onNodeWithText("新しいアプリが出ています").assertExists()
    }

    @Test fun homePaperSaysTheAppIsLatest() {
        assumeTrue(BuildConfig.APP_COMMIT.isNotEmpty())
        open(""""roster":[]""", LatestApp(BuildConfig.APP_COMMIT, BuildConfig.APP_COMMIT_TIME))
        rule.onNodeWithText("このアプリは最新版").assertExists()
    }
}
