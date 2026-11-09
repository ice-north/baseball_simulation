package jp.icenorth.baseball.app

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import jp.icenorth.baseball.app.ui.TradeDraft
import jp.icenorth.baseball.shared.AuthSession
import jp.icenorth.baseball.shared.AppBuild
import jp.icenorth.baseball.shared.EditHistory
import jp.icenorth.baseball.shared.LatestApp
import jp.icenorth.baseball.shared.fetchLatestApp
import jp.icenorth.baseball.shared.PlanDraft
import jp.icenorth.baseball.shared.Wish
import jp.icenorth.baseball.shared.sanitizeWeights
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.OnlineApi
import jp.icenorth.baseball.shared.OnlineException
import jp.icenorth.baseball.shared.OnlineJson
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

/**
 * @param fetchLatest main の最新のアプリを読む（[fetchLatestApp]）。検査では外へ読みに行かないよう既定は null を返す
 */
class AppViewModel internal constructor(
    app: Application,
    private val fetchLatest: suspend () -> LatestApp? = { null },
    private val createApi: (String) -> OnlineApi,
) : AndroidViewModel(app) {
    constructor(app: Application) : this(app, { fetchLatestApp() }, { OnlineApi(it) })

    private val store = SessionStore(app)

    var endpoint by mutableStateOf(store.endpoint ?: BuildConfig.DEFAULT_ENDPOINT)
        private set
    var auth by mutableStateOf(store.auth)
        private set
    var view by mutableStateOf(store.viewJson?.let(::parseView))
        private set

    /** ビューの生の形（型にしていない項目——名簿の細かい能力・手続き・トレードなど——を引くため） */
    var raw by mutableStateOf(store.viewJson?.let(::parseRaw))
        private set

    /** 編成の編集（タブを移っても消えないよう、画面ではなくここに置く） */
    var plan by mutableStateOf<EditHistory<PlanDraft>?>(null)

    /** 手続きの編集中の案（タブを移っても消えないよう、ここに置く） */
    var phaseDraft by mutableStateOf<PhaseDraft?>(null)
    var campDraft by mutableStateOf<CampDraft?>(null)
    var tradeDraft by mutableStateOf<TradeDraft?>(null)

    /**
     * 届いた提案の知らせから一覧を開いたときに、脇へ置いた作りかけの案。
     * ⚠ 知らせを押しただけで作りかけの案を捨てないこと（選んだ選手が黙って消えていた）。
     *    一覧の「作りかけの提案を続ける」で戻す
     */
    var parkedTradeDraft by mutableStateOf<TradeDraft?>(null)

    /** 手続きタブでトレードの側を開いているか（届いた提案の知らせから直接開くため、ここに置く） */
    var procTrade by mutableStateOf(false)

    /** 知らせ終えた届いた提案の印。端末に覚える（開き直すたびに知らせない） */
    var seenTrades by mutableStateOf(store.seenTrades)
        private set

    fun markTradesSeen(keys: Set<String>) {
        if (keys == seenTrades) return
        seenTrades = keys
        store.seenTrades = keys
    }

    /** トライアウトの評価値の重み（端末に覚える。サーバーには送らない） */
    var tryoutWeights by mutableStateOf(sanitizeWeights(store.tryoutWeights))
        private set

    /** ホームの見た目（[jp.icenorth.baseball.app.ui.HomeStyle] の名前）。端末に覚える */
    var homeStyle by mutableStateOf(store.homeStyle)
        private set

    fun changeHomeStyle(name: String) {
        homeStyle = name
        store.homeStyle = name
    }

    /** ホームで開く新聞（地元紙・全国紙）。端末に覚える */
    var homePaper by mutableStateOf(store.homePaper)
        private set

    fun changeHomePaper(name: String) {
        homePaper = name
        store.homePaper = name
    }

    /** 紙面のバックナンバー（古い順）。端末に覚える */
    var backIssues by mutableStateOf(
        store.backIssues?.let { runCatching { OnlineJson.decodeFromString<List<jp.icenorth.baseball.shared.BackIssue>>(it) }.getOrNull() }.orEmpty(),
    )
        private set

    fun recordBackIssue(item: jp.icenorth.baseball.shared.BackIssue) {
        if (backIssues.any { it == item }) return
        val next = jp.icenorth.baseball.shared.addBackIssue(backIssues, item)
        backIssues = next
        store.backIssues = OnlineJson.encodeToString(next)
    }

    /** 状況に応じたTIPSを最後に読んだときのTIPSの id。端末に覚える（[jp.icenorth.baseball.shared.hasUnreadTips]） */
    var seenSituationTips by mutableStateOf(store.seenSituationTips)
        private set

    fun markSituationTipsSeen(ids: Set<String>) {
        if (ids == seenSituationTips) return
        seenSituationTips = ids
        store.seenSituationTips = ids
    }

    fun changeWeights(next: Map<String, Int>) {
        tryoutWeights = sanitizeWeights(next)
        store.tryoutWeights = tryoutWeights
    }

    /** 選手の詳細を開いている選手（名簿の生の形）。どの画面からでも同じシートで開く */
    var openPlayer by mutableStateOf<JsonObject?>(null)

    /** 引っ張って更新している間 */
    var refreshing by mutableStateOf(false)
        private set

    /** 保存などの操作中（画面全体を塞いで、二重に押せなくする） */
    var busy by mutableStateOf(false)
        private set

    /** 塞いでいる間に出す文言（「保存中…」「練習中…」など） */
    var busyLabel by mutableStateOf("")
        private set
    var error by mutableStateOf<String?>(null)
    var message by mutableStateOf<String?>(null)

    private var api = createApi(endpoint)
    private var reloadJob: Job? = null
    private var operationJob: Job? = null
    private var sessionEpoch = 0L

    // 指示を送る前から進行中だった読込で、保存後のビューを巻き戻さない。
    private var viewRequestEpoch = 0L

    /** トークンの更新を1本にまとめる（同時に読み込むと同じ更新トークンで2回更新しにいくため） */
    private val refreshLock = Mutex()

    // ⚠ init（起動時の読み込み）より前に置く。後ろに置くと、読み込みが走ったあとで初期値に戻される
    /**
     * 手元のビューの世代（サーバーが公開のたびに上げる）。null なら次は全部読む。
     * ⚠ 起動直後も、端末に残したビューの世代から始める（残したビューの中に入っている）。以前は起動のたびに
     *    null から始めて、何も変わっていなくてもビューをまるごと取り直していた
     */
    private var viewGeneration: Long? = raw?.get("viewGeneration")?.jsonPrimitive?.longOrNull

    /**
     * 読むだけの窓口の答えを覚えておく（同じ画面を開き直すたびに取りに行かない）。
     * 版（view.revision）が同じ間だけ使う。版はリーグに何か書かれるたびに上がるので、試合が進めば読み直す。
     * 試合の詳細（終わった試合のボックススコア）は変わらないので、版に関係なく使い回す。
     */
    private val readCache = object : LinkedHashMap<String, Pair<Int?, JsonObject>>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Pair<Int?, JsonObject>>?) = size > 40
    }

    /** 入っているアプリの版（作ったときに build.gradle.kts が入れる） */
    val appBuild = AppBuild(BuildConfig.APP_COMMIT, BuildConfig.APP_COMMIT_TIME, BuildConfig.APP_BRANCH)

    /** main の最新のアプリ（ホームの紙面の「アプリ」の記事）。まだ読めていない・読めなかったら null */
    var latestApp by mutableStateOf<LatestApp?>(null)
        private set
    private var latestAppCheckedAt = 0L
    private var latestAppJob: Job? = null

    /**
     * main の最新のアプリを読む。⚠ GitHub の認証なしの API は1時間に60回までなので、30分に1回まで
     * （起動時と、引っ張って更新したとき）。手元で作った版（コミットが分からない）は読まない
     */
    private fun checkLatestApp() {
        if (appBuild.commit.isEmpty() || latestAppJob?.isActive == true) return
        val now = System.currentTimeMillis()
        if (latestAppCheckedAt != 0L && now - latestAppCheckedAt < 30 * 60_000L) return
        latestAppCheckedAt = now
        latestAppJob = viewModelScope.launch {
            // 読めなかったときは前の答えを残す（電波の悪い所で記事が消えたり出たりしないように）
            fetchLatest()?.let { latestApp = it } ?: run { latestAppCheckedAt = 0L }
        }
    }

    init {
        checkLatestApp()
        if (auth != null) reload()
    }

    fun changeEndpoint(value: String) {
        val next = value.trim()
        if (next == endpoint) return
        logout()
        endpoint = next
        store.endpoint = endpoint
        api = createApi(endpoint)
    }

    // メールは全角を半角に、前後の空白を落とし小文字に（日本語キーボードの全角や先頭の自動大文字を吸収する）
    fun login(email: String, password: String) = signIn { it.login(java.text.Normalizer.normalize(email, java.text.Normalizer.Form.NFKC).trim().lowercase(), password) }

    /** ローカルの開発サーバー（server/dev.mjs）用 */
    fun localLogin(user: String) = signIn { it.localLogin(user) }

    private fun signIn(block: suspend (OnlineApi) -> AuthSession) {
        if (busy) return
        val epoch = sessionEpoch
        val readEpoch = viewRequestEpoch
        val client = api
        busy = true
        error = null
        operationJob = viewModelScope.launch {
            // ⚠ ログインと最初の読み込みの失敗を分けて出す。以前は読み込みの 401 でも
            //    ログイン画面に戻り「ログインできない」ように見えて、どこで弾かれたか分からなかった
            val next = try {
                block(client).also { requireSession(epoch) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (epoch != sessionEpoch) return@launch
                error = "ログインできませんでした: ${e.readable()}"
                busy = false
                return@launch
            }
            try {
                store.auth = next
                auth = next
                load(next, epoch, readEpoch)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (epoch != sessionEpoch) return@launch
                store.auth = null
                auth = null
                error = "ログインは通りましたが、リーグの読み込みで失敗しました: ${e.readable()}"
            } finally {
                if (epoch == sessionEpoch) busy = false
            }
        }
    }

    fun logout() {
        val current = auth
        val client = api
        sessionEpoch += 1
        reloadJob?.cancel()
        reloadJob = null
        operationJob?.cancel()
        operationJob = null
        busy = false
        refreshing = false
        store.auth = null
        auth = null
        view = null
        raw = null
        openPlayer = null
        plan = null
        phaseDraft = null
        campDraft = null
        tradeDraft = null
        parkedTradeDraft = null
        procTrade = false
        message = null
        error = null
        clearCaches()
        if (current != null) viewModelScope.launch { runCatching { client.logout(current) } }
    }

    /**
     * 最新のビューを読み直す。`quiet` は画面を開いている間の自動の読み直し（届いた提案に気づくため）で、
     * 保存の最中は読まず、通信の失敗も出さない（電波の悪い所で失敗の知らせが続かないように）。
     */
    fun reload(pull: Boolean = false, quiet: Boolean = false) {
        val current = auth ?: return
        val epoch = sessionEpoch
        val readEpoch = viewRequestEpoch
        if (reloadJob?.isActive == true || busy) return
        if (pull) {
            refreshing = true
            checkLatestApp()
        }
        reloadJob = viewModelScope.launch {
            try {
                authed(current, epoch) { load(it, epoch, readEpoch) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (epoch == sessionEpoch && (!quiet || e.isAuthFailure())) handle(e)
            } finally {
                if (epoch == sessionEpoch) refreshing = false
            }
        }
    }

    /** 編成を保存する。成功したら最新のビューを読み直す */
    fun saveLineup(payload: JsonObject, onSaved: () -> Unit) =
        command("lineup", payload, label = "編成を保存中…", done = "編成を保存しました") { onSaved() }

    /**
     * 指示を送る（保存・提出・練習・トレードなど）。送っている間は画面全体を塞ぐ。
     * 成功したら最新のビューを読み直してから `onDone` を呼ぶ（結果は送った指示の応答）。
     * ⚠ 失敗しても編集中の内容は消さない（呼ぶ側の状態に触らない）。
     */
    fun command(
        type: String,
        payload: JsonElement?,
        label: String = "保存中…",
        done: String? = null,
        onDone: (JsonObject) -> Unit = {},
    ) {
        val current = auth ?: return
        val epoch = sessionEpoch
        val revision = view?.revision ?: return
        if (busy) return
        val readEpoch = ++viewRequestEpoch
        busy = true
        busyLabel = label
        error = null
        refreshing = false
        operationJob = viewModelScope.launch {
            try {
                val result = authed(current, epoch) { api.command(it, revision, type, payload) }
                // ⚠ 返事に最新のビューが載っていればそのまま使う（読み直しの往復を省く）。
                //    載っていない（古いサーバー・二重送信の控えから返った）ときは読み直す
                val fresh = result["view"] as? JsonObject
                if (fresh != null) applyView(fresh.toString()) else authed(epoch = epoch) { load(it, epoch, readEpoch) }
                if (done != null) message = done
                onDone(result)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (epoch == sessionEpoch) handle(e)
            } finally {
                if (epoch == sessionEpoch) busy = false
            }
        }
    }

    /** 読むだけの窓口（team / player / games / game / defaults）。失敗は例外のまま返す */
    suspend fun read(action: String, params: Map<String, String?> = emptyMap()): JsonObject {
        val epoch = sessionEpoch
        val key = action + "?" + params.filterValues { it != null }.toSortedMap().entries.joinToString("&")
        val revision = view?.revision
        val cached = synchronized(readCache) { readCache[key] }
        if (cached != null && (action == "game" || (revision != null && cached.first == revision))) return cached.second
        // ⚠ 試合の詳細の一球ごとの経過（replay）はアプリでは使わず大きいので、覚える前に落とす（40試合ぶん持つと重い）
        val value = authed(epoch = epoch) { api.read(it, action, params) }.let { if (action == "game") JsonObject(it - "replay") else it }
        synchronized(readCache) { readCache[key] = revision to value }
        return value
    }

    /**
     * 認証付きで呼ぶ。期限の判定がずれていて認証切れ（auth）で断られたら、一度だけ更新してやり直す
     * （すぐログアウトにしない）。断られた指示はサーバーで行われていないので、やり直しても二重にならない。
     */
    private suspend fun <T> authed(start: AuthSession? = auth, epoch: Long = sessionEpoch, block: suspend (AuthSession) -> T): T {
        requireSession(epoch)
        val current = start ?: throw OnlineException("ログインしていません")
        return try {
            val credentials = fresh(current, epoch)
            requireSession(epoch)
            block(credentials).also { requireSession(epoch) }
        } catch (e: OnlineException) {
            requireSession(epoch)
            if (e.code != "auth" || current.refreshToken == null) throw e
            val credentials = fresh(current, epoch, force = true)
            requireSession(epoch)
            block(credentials).also { requireSession(epoch) }
        }
    }

    /**
     * ビューを読み直す。手元のビューの世代を添え、サーバーで何も変わっていなければ（試合が進んでいない・
     * 誰も保存していない）ビューは送られてこないので、今のまま使う（アプリに戻るたびの読み直しが軽くなる）。
     */
    private suspend fun load(credentials: AuthSession, epoch: Long, readEpoch: Long) {
        requireSession(epoch)
        if (readEpoch != viewRequestEpoch) return
        val since = viewGeneration.takeIf { view != null }
        val text = api.viewRaw(credentials, since)
        requireSession(epoch)
        if (readEpoch != viewRequestEpoch) return
        if (since != null) {
            val head = runCatching { OnlineJson.parseToJsonElement(text).jsonObject }.getOrNull()
            if (head?.get("unchanged")?.jsonPrimitive?.booleanOrNull == true) {
                // 書き込めるかどうか（保守中など）だけは世代と関係なく変わるので合わせる
                head["writable"]?.jsonPrimitive?.booleanOrNull?.let { w -> if (view?.writable != w) view = view?.copy(writable = w) }
                return
            }
        }
        applyView(text)
    }

    private fun applyView(text: String) {
        view = parseView(text)
        raw = parseRaw(text)
        // 指示の返事に載ったビューにも、公開した世代が入っている（サーバーが押す）。
        // 古いサーバーの返事には無いので、そのときは null にして次は全部読む
        viewGeneration = raw?.get("viewGeneration")?.jsonPrimitive?.longOrNull
        store.viewJson = text
    }

    private fun clearCaches() {
        synchronized(readCache) { readCache.clear() }
        viewGeneration = null
    }

    /** アクセストークンの期限が近ければ先に更新する（本番の Supabase は1時間で切れる） */
    private suspend fun fresh(current: AuthSession, epoch: Long, force: Boolean = false): AuthSession = refreshLock.withLock {
        requireSession(epoch)
        // ほかの呼び出しが待っている間に更新を済ませていたら、それを使う
        val latest = auth
        if (latest != null && latest.accessToken != current.accessToken) return@withLock latest
        refreshOnce(current, epoch, force)
    }

    private suspend fun refreshOnce(current: AuthSession, epoch: Long, force: Boolean): AuthSession {
        val expiresAt = current.expiresAt ?: return current
        val refreshToken = current.refreshToken ?: return current
        if (!force && expiresAt - System.currentTimeMillis() > 60_000) return current
        val result = api.refresh(refreshToken)
        requireSession(epoch)
        val next = current.copy(
            accessToken = result.accessToken,
            refreshToken = result.refreshToken ?: refreshToken,
            expiresAt = result.expiresAt,
        )
        store.auth = next
        auth = next
        return next
    }

    private fun requireSession(epoch: Long) {
        if (epoch != sessionEpoch) throw CancellationException("セッションが変わりました")
    }

    /** 画面で読み込みに失敗したとき（認証切れならログイン画面へ戻す） */
    fun report(e: Exception) = handle(e)

    fun describe(e: Exception): String = e.readable()

    private fun handle(e: Exception) {
        // 別の端末でログインし直した／認証が切れた → ログイン画面へ戻す
        if (e.isAuthFailure()) logout()
        error = e.readable()
    }

    private fun Exception.isAuthFailure() = this is OnlineException && (code == "session" || code == "auth" || status == 401)

    private fun Exception.readable(): String = when (this) {
        is OnlineException -> message ?: "サーバー処理に失敗しました"
        // ⚠ 原因の切り分けのため、試作のうちは中身も出す（スクショで送ってもらう）
        else -> "通信できませんでした。電波の良いところで、もう一度試してください（${this::class.simpleName}: ${message ?: ""}）"
    }
}

private fun parseView(raw: String): LeagueView? = runCatching { OnlineJson.decodeFromString<LeagueView>(raw) }.getOrNull()
private fun parseRaw(raw: String): JsonObject? = runCatching { OnlineJson.parseToJsonElement(raw).jsonObject }.getOrNull()

/**
 * 手続き（初期メンバー・トライアウト・契約更改・年度更新）の編集中の案。
 * `base` は編集を始めたときの提出（サーバーが別の操作との食い違いを見る baseSubmission）。
 */
data class PhaseDraft(val phaseId: String, val plan: JsonObject, val base: JsonElement?, val dirty: Boolean)

/** キャンプの方針と、選手ごとのメイン・サブ練習（未実行のクールの指示） */
data class CampDraft(
    val phaseId: String,
    val direction: String,
    val phase: String,
    val main: Map<Long, String>,
    val sub: Map<Long, String>,
    /** 決め方（recommended / wish / team）。⚠ 既定はおすすめ */
    val mode: String = "recommended",
    /** 選手ごとの方針の上書き（「合わせる」） */
    val players: Map<Long, Wish> = emptyMap(),
)
