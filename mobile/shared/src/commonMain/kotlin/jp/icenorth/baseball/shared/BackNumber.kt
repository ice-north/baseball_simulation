package jp.icenorth.baseball.shared

import kotlinx.serialization.Serializable

/**
 * 紙面のバックナンバー（過去の1面の見出し）。端末に覚えるだけで、サーバーには送らない。
 * ⚠ 紙面はビューから決まるので、見出しを残しておけば「シーズンの物語」が後から読める。
 *    同じ日の紙面は新しいもので上書きする（読み直しで見出しが変わることはないが、試合の詳細が後から届くことはある）。
 * @param key 年度×10000＋月×100＋日（並べる・同じ日を見分けるため）
 */
@Serializable
data class BackIssue(val key: Int, val issue: String, val local: String, val national: String)

const val BACK_ISSUES_MAX = 120

fun backIssueKey(view: LeagueView): Int? = view.currentDate?.let { (view.year ?: 0) * 10000 + it.month * 100 + it.day }

/** 1日分を足す（同じ日は置き換え、古い順に [BACK_ISSUES_MAX] 件まで） */
fun addBackIssue(list: List<BackIssue>, item: BackIssue): List<BackIssue> =
    (list.filter { it.key != item.key } + item).sortedBy { it.key }.takeLast(BACK_ISSUES_MAX)
