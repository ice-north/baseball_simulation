package jp.icenorth.baseball.app

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import jp.icenorth.baseball.shared.AuthSession
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.OnlineApi
import jp.icenorth.baseball.shared.OnlineException
import jp.icenorth.baseball.shared.OnlineJson
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val store = SessionStore(app)

    var endpoint by mutableStateOf(store.endpoint ?: BuildConfig.DEFAULT_ENDPOINT)
        private set
    var auth by mutableStateOf(store.auth)
        private set
    var view by mutableStateOf(store.viewJson?.let(::parseView))
        private set

    /** 引っ張って更新している間 */
    var refreshing by mutableStateOf(false)
        private set

    /** 保存などの操作中（ボタンを押せなくする） */
    var busy by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
    var message by mutableStateOf<String?>(null)

    private var api = OnlineApi(endpoint)
    private var reloadJob: Job? = null

    init {
        if (auth != null) reload()
    }

    fun changeEndpoint(value: String) {
        endpoint = value.trim()
        store.endpoint = endpoint
        api = OnlineApi(endpoint)
    }

    // メールは全角を半角に、前後の空白を落とし小文字に（日本語キーボードの全角や先頭の自動大文字を吸収する）
    fun login(email: String, password: String) = signIn { api.login(java.text.Normalizer.normalize(email, java.text.Normalizer.Form.NFKC).trim().lowercase(), password) }

    /** ローカルの開発サーバー（server/dev.mjs）用 */
    fun localLogin(user: String) = signIn { api.localLogin(user) }

    private fun signIn(block: suspend () -> AuthSession) {
        if (busy) return
        busy = true
        error = null
        viewModelScope.launch {
            // ⚠ ログインと最初の読み込みの失敗を分けて出す。以前は読み込みの 401 でも
            //    ログイン画面に戻り「ログインできない」ように見えて、どこで弾かれたか分からなかった
            val next = try {
                block()
            } catch (e: Exception) {
                error = "ログインできませんでした: ${e.readable()}"
                busy = false
                return@launch
            }
            try {
                store.auth = next
                auth = next
                load(next)
            } catch (e: Exception) {
                store.auth = null
                auth = null
                error = "ログインは通りましたが、リーグの読み込みで失敗しました: ${e.readable()}"
            } finally {
                busy = false
            }
        }
    }

    fun logout() {
        val current = auth
        store.auth = null
        auth = null
        view = null
        if (current != null) viewModelScope.launch { runCatching { api.logout(current) } }
    }

    fun reload(pull: Boolean = false) {
        val current = auth ?: return
        if (reloadJob?.isActive == true) return
        if (pull) refreshing = true
        reloadJob = viewModelScope.launch {
            try {
                load(fresh(current))
            } catch (e: Exception) {
                handle(e)
            } finally {
                refreshing = false
            }
        }
    }

    /** 編成を保存する。成功したら最新のビューを読み直す */
    fun saveLineup(payload: JsonObject, onSaved: () -> Unit) {
        val current = auth ?: return
        val revision = view?.revision ?: return
        if (busy) return
        busy = true
        error = null
        viewModelScope.launch {
            try {
                val credentials = fresh(current)
                api.command(credentials, revision, "lineup", payload)
                load(credentials)
                message = "編成を保存しました"
                onSaved()
            } catch (e: Exception) {
                handle(e)
            } finally {
                busy = false
            }
        }
    }

    private suspend fun load(credentials: AuthSession) {
        val raw = api.viewRaw(credentials)
        view = parseView(raw)
        store.viewJson = raw
    }

    /** アクセストークンの期限が近ければ先に更新する（本番の Supabase は1時間で切れる） */
    private suspend fun fresh(current: AuthSession): AuthSession {
        val expiresAt = current.expiresAt ?: return current
        val refreshToken = current.refreshToken ?: return current
        if (expiresAt - System.currentTimeMillis() > 60_000) return current
        val result = api.refresh(refreshToken)
        val next = current.copy(
            accessToken = result.accessToken,
            refreshToken = result.refreshToken ?: refreshToken,
            expiresAt = result.expiresAt,
        )
        store.auth = next
        auth = next
        return next
    }

    private fun handle(e: Exception) {
        // 別の端末でログインし直した／認証が切れた → ログイン画面へ戻す
        if (e is OnlineException && (e.code == "session" || e.code == "auth" || e.status == 401)) {
            logout()
        }
        error = e.readable()
    }

    private fun Exception.readable(): String = when (this) {
        is OnlineException -> message ?: "サーバー処理に失敗しました"
        // ⚠ 原因の切り分けのため、試作のうちは中身も出す（スクショで送ってもらう）
        else -> "通信できませんでした。電波の良いところで、もう一度試してください（${this::class.simpleName}: ${message ?: ""}）"
    }
}

private fun parseView(raw: String): LeagueView? = runCatching { OnlineJson.decodeFromString<LeagueView>(raw) }.getOrNull()
