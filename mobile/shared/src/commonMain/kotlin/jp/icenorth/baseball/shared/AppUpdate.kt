package jp.icenorth.baseball.shared

import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import kotlinx.serialization.json.JsonArray

/**
 * 入っているアプリが最新かを確かめる（ホームの紙面の記事にする。いしだの指定）。
 *
 * 「最新」は **ice-north/baseball_simulation の main で、最後に mobile/ を変えたコミット**。
 * アプリは作ったときの同じコミット（`git log -1 -- mobile`）を持っている（androidApp/build.gradle.kts の APP_COMMIT）。
 * GitHub の公開 API（認証なし）で main の側を読んで比べる。サーバーには何も足さない。
 *
 * ⚠ 認証なしの GitHub API は1時間に60回まで（端末の IP ごと）。読むのはアプリの起動時と、間を空けた更新のときだけ。
 * ⚠ CI は履歴を全部取ってから作ること（android.yml の fetch-depth: 0）。浅い取得だと最後のコミットが分からず、
 *    main から作ったアプリでも「試作版」に見える。
 */
const val APP_REPOSITORY = "ice-north/baseball_simulation"

/** 配布しているところ（main の android の実行。最新の実行の Artifacts に APK がある） */
const val APP_DOWNLOAD_URL = "https://github.com/$APP_REPOSITORY/actions/workflows/android.yml?query=branch%3Amain"

/** 紙面の記事を押したとき: 配布ページを開く */
const val LINK_APP_UPDATE = "app-update"

/**
 * @param commit 最後に mobile/ を変えたコミット（40桁）。git の無い所で作ったときは空
 * @param time そのコミットの時刻（UTC の ISO 形式「2026-11-08T07:51:07Z」。GitHub の API と同じ形にして文字で比べる）
 * @param branch 作ったブランチ（CI の GITHUB_HEAD_REF / GITHUB_REF_NAME）。手元で作ったときは空
 */
data class AppBuild(val commit: String, val time: String, val branch: String)

/** main の最新（[fetchLatestApp]） */
data class LatestApp(val commit: String, val time: String)

enum class AppFreshness {
    /** main の最新と同じ */
    Latest,
    /** main にもっと新しいアプリがある */
    Outdated,
    /** main より先の版（ブランチで試している版） */
    Preview,
}

fun appFreshness(build: AppBuild, latest: LatestApp): AppFreshness? = when {
    build.commit.isEmpty() || latest.commit.isEmpty() -> null
    build.commit == latest.commit -> AppFreshness.Latest
    // ⚠ 時刻は同じ形（…Z）なので文字のまま比べられる
    latest.time > build.time -> AppFreshness.Outdated
    else -> AppFreshness.Preview
}

/**
 * 紙面の記事。確かめられなかったとき（通信の失敗・手元で作った版）は null（記事を出さない）。
 * @return 記事と、紙面のいちばん上に置くか（古いときだけ上。最新・試作版は紙面の終わり）
 */
fun appVersionArticle(build: AppBuild, latest: LatestApp?): Pair<FrontPage.Article, Boolean>? {
    latest ?: return null
    val mine = "${jstDate(build.time)}の版"
    return when (appFreshness(build, latest) ?: return null) {
        AppFreshness.Latest -> FrontPage.Article("アプリ", "このアプリは最新版", "入っているのは${mine}。配布中の最新と同じ。") to false
        AppFreshness.Outdated -> FrontPage.Article(
            "アプリ更新",
            "新しいアプリが出ています",
            "入っているのは${mine}、配布中の最新は${jstDate(latest.time)}の版。押すと配布ページが開くので、いちばん上の実行の Artifacts から APK を入れ直してください。",
            LINK_APP_UPDATE,
        ) to true
        AppFreshness.Preview -> FrontPage.Article(
            "アプリ",
            "試作版のアプリ",
            "入っているのは${build.branch.ifEmpty { "ブランチ" }.let { "「$it」" }}から作った${mine}。配布中の版（${jstDate(latest.time)}）より先の中身。",
        ) to false
    }
}

/** main で最後に mobile/ を変えたコミットを読む。読めなければ null（通信の道具はここで作って閉じる） */
suspend fun fetchLatestApp(): LatestApp? {
    val client = defaultHttpClient()
    return try { fetchLatestApp(client) } finally { client.close() }
}

suspend fun fetchLatestApp(client: HttpClient): LatestApp? = runCatching {
    val response = client.get("https://api.github.com/repos/$APP_REPOSITORY/commits") {
        parameter("sha", "main")
        parameter("path", "mobile")
        parameter("per_page", "1")
        header("Accept", "application/vnd.github+json")
    }
    if (!response.status.isSuccess()) return null
    parseLatestApp(response.bodyAsText())
}.getOrElse { if (it is kotlin.coroutines.cancellation.CancellationException) throw it else null }

/** GitHub の「コミットの一覧」の答えから、先頭のコミットと時刻を取り出す */
fun parseLatestApp(body: String): LatestApp? {
    val first = (runCatching { OnlineJson.parseToJsonElement(body) }.getOrNull() as? JsonArray)?.firstOrNull()?.obj() ?: return null
    val sha = first.at("sha").str() ?: return null
    val time = first.at("commit", "committer", "date").str() ?: return null
    return LatestApp(sha, time)
}

private val MONTH_DAYS = intArrayOf(31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)

/** 「2026-11-08T07:51:07Z」→ 日本の時刻で「11月8日」。読めなければ空 */
fun jstDate(iso: String): String {
    val m = Regex("""^(\d{4})-(\d{2})-(\d{2})T(\d{2})""").find(iso) ?: return ""
    val (y, mo, d, h) = m.destructured
    var year = y.toInt()
    var month = mo.toInt()
    var day = d.toInt()
    if (h.toInt() + 9 >= 24) {
        val leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
        val days = if (month == 2 && leap) 29 else MONTH_DAYS.getOrElse(month - 1) { 31 }
        day += 1
        if (day > days) { day = 1; month += 1 }
        if (month > 12) { month = 1; year += 1 }
    }
    return "${month}月${day}日"
}
