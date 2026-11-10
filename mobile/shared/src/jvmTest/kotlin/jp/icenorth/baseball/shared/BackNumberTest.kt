package jp.icenorth.baseball.shared

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** 紙面のバックナンバー（端末に覚える見出し）は球団ごとに分ける */
class BackNumberTest {
    private fun issue(key: Int, team: String, head: String = "$team $key") = BackIssue(key, "$key", head, "全国 $key", team)

    @Test
    fun accountsDoNotShareBackIssues() {
        // 宮崎のアカウントで3日分 → ログアウトして那覇のアカウントで同じ日付の紙面
        var list = listOf(10404, 10405, 10406).fold(emptyList<BackIssue>()) { acc, k -> addBackIssue(acc, issue(k, "宮崎アトラス")) }
        list = addBackIssue(list, issue(10406, "那覇ハリケーンズ"))
        assertEquals(listOf("那覇ハリケーンズ 10406"), backIssuesOf(list, "那覇ハリケーンズ").map { it.local })
        // 同じ日でも別の球団の紙面は置き換えない
        assertEquals(listOf(10404, 10405, 10406), backIssuesOf(list, "宮崎アトラス").map { it.key })
        // 同じ球団の同じ日は置き換え
        list = addBackIssue(list, issue(10406, "宮崎アトラス", "差し替え"))
        assertEquals("差し替え", backIssuesOf(list, "宮崎アトラス").last().local)
        assertEquals(3, backIssuesOf(list, "宮崎アトラス").size)
    }

    @Test
    fun goingBackInTimeStartsOver() {
        // リーグを作り直した（または前の保存に戻した）: 同じ球団で日付が戻ったら、その後の見出しは捨てる
        var list = listOf(10404, 10405, 20601).fold(emptyList<BackIssue>()) { acc, k -> addBackIssue(acc, issue(k, "宮崎アトラス")) }
        list = addBackIssue(list, issue(10405, "宮崎アトラス", "作り直したリーグ"))
        assertEquals(listOf(10404, 10405), backIssuesOf(list, "宮崎アトラス").map { it.key })
        assertEquals("作り直したリーグ", backIssuesOf(list, "宮崎アトラス").last().local)
    }

    @Test
    fun oldUnattributedIssuesAreHiddenAndDropped() {
        // 分ける前の版で覚えたもの（球団が無い）は、誰の紙面か分からないので出さない
        val legacy = listOf(BackIssue(10404, "4月4日", "宮崎、白星", "全国"))
        assertEquals("", legacy[0].team)
        assertTrue(backIssuesOf(legacy, "那覇ハリケーンズ").isEmpty())
        val list = addBackIssue(legacy, issue(10405, "那覇ハリケーンズ"))
        assertEquals(listOf("那覇ハリケーンズ"), list.map { it.team })
        // 覚えた形（JSON）は前の版のものも読める
        val old = OnlineJson.decodeFromString<List<BackIssue>>("""[{"key":10404,"issue":"4月4日","local":"a","national":"b"}]""")
        assertEquals("", old.single().team)
    }

    @Test
    fun keepsAtMostTheLimitPerTeam() {
        var list = emptyList<BackIssue>()
        for (d in 1..(BACK_ISSUES_MAX + 5)) list = addBackIssue(list, issue(10000 + d, "宮崎アトラス"))
        list = addBackIssue(list, issue(10001, "那覇ハリケーンズ"))
        assertEquals(BACK_ISSUES_MAX, backIssuesOf(list, "宮崎アトラス").size)
        assertEquals(10006, backIssuesOf(list, "宮崎アトラス").first().key)
        assertEquals(1, backIssuesOf(list, "那覇ハリケーンズ").size)
    }
}
