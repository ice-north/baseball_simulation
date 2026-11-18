package jp.icenorth.baseball.shared

/**
 * ホーム画面のウィジェット（D1）に出す3行。アプリを開かずに、順位・直近の結果・次の試合が見られる。
 *
 * ⚠ 材料は端末に残したビュー（アプリで開いたとき・裏の試合結果の確認が読んだとき）。ウィジェットは自分では読みに行かない
 *    （裏の確認は通知を切っていると動かないので、そのときはアプリを開いたときに新しくなる）。
 * ⚠ 速報でまだ見ていない試合があれば、結果（勝ち負け・順位）を書かない（通知と同じ。いしだの決定 2026-11-15）。
 * ⚠ 文は試合結果の通知（[resultNotice]）と同じ書き方（「○ 5-3 美瑛（第42戦）」「10勝8敗 1部2位（首位と3差）」）。
 */
data class WidgetSummary(val title: String, val standing: String, val last: String, val next: String)

fun widgetSummary(view: LeagueView?, quickSeen: Set<String>? = null): WidgetSummary? {
    val team = view?.teamName ?: return null
    val title = view.teamShort(team) + (view.currentDate?.let { " ${it.month}/${it.day}" } ?: "")
    val lastGame = view.recentGames.lastOrNull { it.homeScore != null && it.awayScore != null }
    val sealed = quickSeen != null && lastGame?.lineScore != null && quickKey(view, lastGame) !in quickSeen
    val standing = if (sealed) "結果はアプリの速報で" else placeText(view, team)?.takeIf { view.leagueTable(view.teamLeagues[team]).any { it.gamesPlayed > 0 } }
        ?: view.phase?.label?.let { "手続き: $it" }
        ?: "まだ試合がありません"
    val last = if (sealed) "前の試合 ${view.teamShort(if (lastGame!!.home == team) lastGame.away else lastGame.home)}戦（速報で見られます）" else lastGame?.let { "前の試合 " + scoreLine(view, it, team) } ?: "前の試合 —"
    val next = view.nextGames.firstOrNull()?.let { g ->
        val opp = view.teamShort(if (g.home == team) g.away else g.home)
        val where = if (g.home == team) "本拠地" else "敵地"
        val date = g.date?.let { "${it.month}/${it.day} " }.orEmpty()
        "次 ${date}${opp}（${where}）"
    } ?: "次の試合 —"
    return WidgetSummary(title, standing, last, next)
}
