package jp.icenorth.baseball.shared

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AppUpdateTest {
    private val main = LatestApp("a".repeat(40), "2026-11-08T07:51:07Z")

    @Test
    fun sameCommitIsLatest() {
        val build = AppBuild(main.commit, main.time, "main")
        assertEquals(AppFreshness.Latest, appFreshness(build, main))
        val (article, top) = appVersionArticle(build, main)!!
        assertEquals("このアプリは最新版", article.title)
        assertEquals(false, top)
    }

    @Test
    fun olderBuildIsOutdatedAndGoesOnTop() {
        val build = AppBuild("b".repeat(40), "2026-11-07T20:00:00Z", "main")
        assertEquals(AppFreshness.Outdated, appFreshness(build, main))
        val (article, top) = appVersionArticle(build, main)!!
        assertTrue(top)
        assertEquals(LINK_APP_UPDATE, article.link)
        // 日本の時刻で日付を書く（20時 UTC は翌日の朝）
        assertTrue("11月8日の版" in article.body, article.body)
    }

    @Test
    fun newerBranchBuildIsPreview() {
        val build = AppBuild("c".repeat(40), "2026-11-08T22:30:00Z", "claude/app-version-news")
        assertEquals(AppFreshness.Preview, appFreshness(build, main))
        assertTrue("claude/app-version-news" in appVersionArticle(build, main)!!.first.body)
    }

    @Test
    fun unknownGivesNoArticle() {
        assertNull(appVersionArticle(AppBuild("", "", ""), main))
        assertNull(appVersionArticle(AppBuild(main.commit, main.time, "main"), null))
    }

    @Test
    fun parsesGitHubCommitList() {
        val body = """[{"sha":"${main.commit}","commit":{"author":{"date":"2026-11-08T07:00:00Z"},"committer":{"date":"${main.time}"}}}]"""
        assertEquals(main, parseLatestApp(body))
        assertNull(parseLatestApp("""{"message":"API rate limit exceeded"}"""))
        assertNull(parseLatestApp("[]"))
    }

    @Test
    fun japaneseDate() {
        assertEquals("11月8日", jstDate("2026-11-08T14:59:59Z"))
        assertEquals("11月9日", jstDate("2026-11-08T15:00:00Z"))
        assertEquals("1月1日", jstDate("2026-12-31T15:00:00Z"))
        assertEquals("2月29日", jstDate("2028-02-28T16:00:00Z"))
        assertEquals("", jstDate(""))
    }
}
