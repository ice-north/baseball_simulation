package jp.icenorth.baseball.app

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import jp.icenorth.baseball.shared.AuthSession
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.OnlineApi
import jp.icenorth.baseball.shared.OnlineException
import jp.icenorth.baseball.shared.OnlineJson
import jp.icenorth.baseball.shared.eventNotice
import jp.icenorth.baseball.shared.resultKeys
import jp.icenorth.baseball.shared.withEventKeys
import kotlinx.serialization.json.JsonObject
import jp.icenorth.baseball.shared.resultNotice
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/**
 * 裏で（およそ15分ごと）ビューを読み、自球団に新しい試合結果があれば通知する（[ResultNotifier]）。
 *
 * ⚠ 手元に残したビューの世代を添えて読むので、試合が進んでいなければサーバーは中身を送らない（軽い）。
 *    進んでいたら新しいビューを端末に残す（次にアプリを開いたとき、すぐ最新の紙面が出る）。
 * ⚠ 失敗しても何もしない（ログアウトもしない）。次の回にまた確かめ、ログインの切れはアプリを開いたときに画面が扱う。
 *    ただしトークンの更新を断られたら（ログインが切れている）、アプリでログインし直すまで休む（[SessionStore.authBroken]）。
 * ⚠ 端末の設定で通知を切られている間は読まない（トークンも回さない）。仕事は残す（また許されたら続ける）。
 * ⚠ 更新の手順は画面（[AppViewModel] の fresh / refreshOnce）と同じ考えで別に書いてある。まとめるのは別の機会に。
 */
class ResultWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val store = SessionStore(applicationContext)
        if (!store.resultNotify || ResultNotifier.appVisible) return Result.success()
        // 通知を出せないのに読みに行かない（裏でトークンを回すだけになる）。仕事は止めない（設定で許し直したら続ける）
        if (!ResultNotifier.permitted(applicationContext)) return Result.success()
        // 更新を断られたログインで読み続けない（アプリでログインし直すと下りる）
        if (store.authBroken) return Result.success()
        val start = store.auth ?: return Result.success()
        // ⚠ 回ごとに作るので、終わったら閉じる（閉じないと通信の道具が回ごとに残る。AppUpdate.kt の fetchLatestApp と同じ）
        val api = createApi(store.endpoint ?: BuildConfig.DEFAULT_ENDPOINT)
        try {
            check(store, api, start)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // 電波・サーバーの失敗は次の回に任せる
        } finally {
            api.close()
        }
        return Result.success()
    }

    private suspend fun check(store: SessionStore, api: OnlineApi, start: AuthSession) {
        val since = store.viewJson?.let { text ->
            runCatching { OnlineJson.parseToJsonElement(text).jsonObject["viewGeneration"]?.jsonPrimitive?.longOrNull }.getOrNull()
        }
        val first = fresh(store, api, start, failed = null) ?: return
        val text = try {
            api.viewRaw(first, since)
        } catch (e: OnlineException) {
            // 期限の判定がずれていて断られたら、一度だけ更新してやり直す（画面の authed と同じ）
            if (e.code != "auth") throw e
            api.viewRaw(fresh(store, api, start, failed = first.accessToken) ?: return, since)
        }
        val head = OnlineJson.parseToJsonElement(text).jsonObject
        // ⚠ 変わっていなくても、締め切りが近いかは時刻で変わるので、手元のビューで確かめる
        val changed = head["unchanged"]?.jsonPrimitive?.booleanOrNull != true
        val current = if (changed) text else store.viewJson ?: return
        val view = OnlineJson.decodeFromString<LeagueView>(current)
        val raw = if (changed) head else OnlineJson.parseToJsonElement(current).jsonObject
        // ⚠ 読んでいる間にログアウト・別の人でログインし直していたら、残さず知らせない
        if (store.auth?.userId != start.userId || view.teamName == null || ResultNotifier.appVisible) return
        if (changed) {
            store.viewJson = text
            notifyResults(store, view)
        }
        notifyEvents(store, view, raw)
    }

    private fun notifyResults(store: SessionStore, view: LeagueView) {
        val now = resultKeys(view)
        val seen = store.seenResults
        val notified = store.notifiedResults
        if (seen == null || notified == null) {
            // 入れた直後・ログインし直した直後は印だけ付ける（今季の試合をまとめて知らせない）
            if (seen == null) store.seenResults = now
            store.notifiedResults = now
            return
        }
        store.notifiedResults = now
        if ((now - notified).isEmpty()) return
        // ⚠ 中身は「アプリで見ていない試合」すべて（開かずにいた間の試合を1つの通知に）
        // 速報でまだ見ていない試合は結果を書かない（印がまだ無ければ見ていない扱い）
        resultNotice(view, seen, store.quickSeen ?: emptySet())?.let { ResultNotifier.showResult(applicationContext, it.title, it.body) }
    }

    /** 手続き・トレード・手続きの結果（[jp.icenorth.baseball.shared.eventNotices]） */
    private fun notifyEvents(store: SessionStore, view: LeagueView, raw: JsonObject) {
        val events = ResultNotifier.events(view, raw)
        val notified = store.notifiedEvents
        // 印がまだ無いとき（入れた直後）は印だけ付ける
        val notice = eventNotice(events, notified)
        store.notifiedEvents = withEventKeys(notified, events)
        notice?.let { ResultNotifier.showEvent(applicationContext, it.title, it.body) }
    }

    /**
     * 期限が近ければトークンを更新する（画面と同じ鍵で。[AuthLock]）。ログインが変わっていた・更新が時間切れなら null。
     * `failed` は断られたアクセストークン（あれば必ず更新する。ただし画面がもう新しくしていたらそれを使う）
     * ⚠ 鍵を持ったまま待つのは [REFRESH_TIMEOUT_MS] まで。通信の道具の待ち時間は290秒あり、電波の悪い所では
     *    その間ずっと画面の読み込み（画面も同じ鍵で更新する）が止まっていた。時間切れは失敗と同じ（ログアウトしない）
     * ⚠ 断られた（400 / 401）ら [SessionStore.authBroken] を立てる。ログイン情報はそのまま（画面が扱う）
     */
    private suspend fun fresh(store: SessionStore, api: OnlineApi, start: AuthSession, failed: String?): AuthSession? =
        AuthLock.mutex.withLock {
            val current = store.auth ?: return@withLock null
            if (current.userId != start.userId || current.sessionId != start.sessionId) return@withLock null
            val force = failed != null
            // 画面がもう更新していたら、それを使う
            if (force && current.accessToken != failed) return@withLock current
            val expiresAt = current.expiresAt ?: return@withLock current
            val refreshToken = current.refreshToken ?: return@withLock current
            if (!force && expiresAt - System.currentTimeMillis() > 60_000) return@withLock current
            val result = try {
                withTimeoutOrNull(REFRESH_TIMEOUT_MS) { api.refresh(refreshToken) } ?: return@withLock null
            } catch (e: OnlineException) {
                if ((e.status == 400 || e.status == 401) && store.auth?.refreshToken == refreshToken) store.authBroken = true
                throw e
            }
            val next = current.copy(
                accessToken = result.accessToken,
                refreshToken = result.refreshToken ?: refreshToken,
                expiresAt = result.expiresAt,
            )
            // ⚠ 更新している間に画面がログアウトしていたら残さない。
            //    残すときは書き終わるまで待つ（更新トークンは1回きり。書く前に止まると次は古いのを使ってしまう）
            if (store.auth?.refreshToken == refreshToken) store.commitAuth(next)
            next
        }

    companion object {
        /** 検査で差し替える（偽のサーバーにつなぐ） */
        internal var createApi: (String) -> OnlineApi = { OnlineApi(it) }

        /** トークンの更新を待つ長さ（画面と同じ鍵を持ったまま待つので短く） */
        internal const val REFRESH_TIMEOUT_MS = 20_000L
    }
}
