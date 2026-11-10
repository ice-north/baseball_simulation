package jp.icenorth.baseball.shared

import kotlinx.serialization.Serializable

/**
 * 紙面のバックナンバー（過去の1面の見出し）。端末に覚えるだけで、サーバーには送らない。
 * ⚠ 紙面はビューから決まるので、見出しを残しておけば「シーズンの物語」が後から読める。
 *    同じ日の紙面は新しいもので上書きする（読み直しで見出しが変わることはないが、試合の詳細が後から届くことはある）。
 * @param key 年度×10000＋月×100＋日（並べる・同じ日を見分けるため）
 * @param team どの球団の紙面か（ビューの teamName）。
 *             ⚠ 端末に1つの並びで覚え、ログアウトしても消さないので、別のアカウント（＝別の球団）で
 *             ログインし直したときに前の人の見出しが混ざらないよう、球団ごとに分ける。
 *             球団の無いもの（分ける前の版で覚えたもの）は誰の紙面か分からないので出さず、次に足すときに捨てる
 */
@Serializable
data class BackIssue(val key: Int, val issue: String, val local: String, val national: String, val team: String = "")

const val BACK_ISSUES_MAX = 120

fun backIssueKey(view: LeagueView): Int? = view.currentDate?.let { (view.year ?: 0) * 10000 + it.month * 100 + it.day }

/** その球団のバックナンバー（古い順） */
fun backIssuesOf(list: List<BackIssue>, team: String): List<BackIssue> = list.filter { it.team.isNotEmpty() && it.team == team }

/**
 * 1日分を足す（同じ球団の同じ日は置き換え、球団ごとに古い順に [BACK_ISSUES_MAX] 件まで）。
 * ⚠ 同じ球団で日付が戻ったら（リーグを作り直した・前の保存に戻した）、その日より後の見出しは
 *    もう無い流れのものなので捨てる。ビューにはリーグを見分ける印が無いので、日付の後戻りで見分ける
 */
fun addBackIssue(list: List<BackIssue>, item: BackIssue): List<BackIssue> {
    val others = list.filter { it.team.isNotEmpty() && it.team != item.team }
    val mine = list.filter { it.team == item.team && it.key < item.key }.sortedBy { it.key } + item
    return others + mine.takeLast(BACK_ISSUES_MAX)
}
