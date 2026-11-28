package jp.icenorth.baseball.shared

import kotlin.math.floor

// ============================================================
// 新しい見た目（試作）段3: 試合タブの頭の「今日の一戦」の札の中身。
// Web 版 `src/online/look/todayGame.js` の写し。答え合わせは `LookTest`
// （期待値は mobile/tools/expect-look.mjs が書き出す）。文を変えたら両方を直し、期待値を書き出し直す。
//
// ⚠ 試合はビューの `nextGames`（近い順）のうち自球団の最初の試合。いまのターンの試合なら
//    「今日の一戦」、先の試合なら「次の一戦」（休養日・手続きの日）。
// ⚠ 順位は部の中の順（[LEAGUE_STANDING_ORDER]。順位表と同じ並べ方）。
// ============================================================

private val DAYS = listOf("日", "月", "火", "水", "木", "金", "土")

/** 先発予定。顔を描くのに番号・年齢・調子を持つ */
data class TodayStarter(
    val id: Long?,
    val name: String,
    val age: Int?,
    val condition: Int?,
    /** 「予告先発」「先発予定」 */
    val mark: String,
    /** 「0勝1敗 防23.63」。成績の無い古いビューでは空 */
    val line: String,
)

data class TodaySide(
    val team: String,
    /** 「1部2位　5勝4敗」。順位表に無ければ空 */
    val record: String,
    val rank: Int?,
    /** 部の球団の数 */
    val teams: Int,
    val starter: TodayStarter?,
)

data class TodayGame(
    /** 「今日の一戦」「次の一戦」 */
    val title: String,
    /** 「4月7日（火）　第7ターン」 */
    val whenText: String,
    /** 「ホーム」「ビジター（宮崎）」 */
    val place: String,
    /** 本拠地の球団（球場の絵の色） */
    val home: String,
    val city: String,
    /** 客の入り（[crowdLevel]） */
    val crowd: Double,
    /** 自球団のひとこと（「首位と1.5差　3連勝中」） */
    val note: String,
    val own: TodaySide,
    val foe: TodaySide,
)

/** 正の数を小数 [digits] 桁で（0.5 は切り上げ。Web は `Math.round` で丸めてから `toFixed`） */
private fun fixed(v: Double, digits: Int): String {
    var scale = 1L
    repeat(digits) { scale *= 10 }
    val n = floor(v * scale + 0.5).toLong()
    return "${n / scale}.${(n % scale).toString().padStart(digits, '0')}"
}

private fun starterLine(info: StarterInfo): String =
    "${info.wins}勝${info.losses}敗 ${info.era?.let { "防${fixed(it, 2)}" } ?: "防—"}"

/** 部の中の順位と成績（札の両側） */
private class SideStanding(val rank: Int?, val rows: List<Standing>, val row: Standing?, val record: String)

private fun LeagueView.standingOf(team: String): SideStanding {
    val league = teamLeagues[team]?.takeIf { it.isNotEmpty() }
    val rows = leagueTable(league)
    val index = rows.indexOfFirst { it.team == team }
    val row = rows.getOrNull(index) ?: return SideStanding(null, rows, null, "")
    val name = PYRAMID_LEAGUES.firstOrNull { it.id == league }?.name.orEmpty()
    val draws = if (row.draws != 0) "${row.draws}分" else ""
    return SideStanding(index + 1, rows, row, "$name${index + 1}位　${row.wins}勝${row.losses}敗$draws")
}

private fun LeagueView.noteOf(s: SideStanding): String {
    val parts = mutableListOf<String>()
    if (s.row != null && s.rows.size > 1) {
        if (s.rank == 1) {
            val lead = gamesBehind(s.row, s.rows[1])
            parts += if (lead > 0) "首位・2位と${fixed(lead, 1)}差" else "首位タイ"
        } else {
            val behind = gamesBehind(s.rows[0], s.row)
            parts += if (behind > 0) "首位と${fixed(behind, 1)}差" else "首位と0.0差"
        }
    }
    val streak = teamStreaks[teamName]
    if (streak != null && streak.count >= 2 && streak.kind == "W") parts += "${streak.count}連勝中"
    if (streak != null && streak.count >= 2 && streak.kind == "L") parts += "${streak.count}連敗中"
    return parts.joinToString("　")
}

/** 連勝はプラス・連敗はマイナス（客の入り） */
private fun streakValue(s: TeamStreak?): Int = when (s?.kind) {
    "W" -> s.count
    "L" -> -s.count
    else -> 0
}

/** 札の中身。自球団の試合が無ければ null。Web 版 `todayGameCard` */
fun todayGameCard(view: LeagueView): TodayGame? {
    val me = view.teamName ?: return null
    val game = view.nextGames.firstOrNull { it.home == me || it.away == me } ?: return null
    val turn = turnOfDate(game.date, view.seasonTurns)
    // ⚠ 日付で比べる（ターンはシーズンの中だけなので、10月のプレーオフの試合を「次の一戦」にしていた）
    val today = game.date != null && game.date == view.currentDate
    val homeGame = game.home == me
    val d = game.date
    val weekday = d?.let { DAYS[(((daysFromCivil(it.year.toLong(), it.month, it.day) + 4) % 7 + 7) % 7).toInt()] }
    fun sideOf(team: String): Pair<TodaySide, SideStanding> {
        val isHome = team == game.home
        val info = if (isHome) game.homeStarterInfo else game.awayStarterInfo
        val name = info?.name?.takeIf { it.isNotEmpty() } ?: (if (isHome) game.homeStarter else game.awayStarter)?.takeIf { it.isNotEmpty() }
        val mark = if (isHome) game.homeStarterMark else game.awayStarterMark
        val standing = view.standingOf(team)
        val starter = name?.let {
            TodayStarter(
                id = info?.id,
                name = it,
                age = info?.age,
                condition = info?.condition,
                mark = if (mark == "fixed") "予告先発" else "先発予定",
                line = info?.let(::starterLine).orEmpty(),
            )
        }
        return TodaySide(team, standing.record, standing.rank, standing.rows.size, starter) to standing
    }
    val (own, ownStanding) = sideOf(me)
    val (foe, _) = sideOf(if (homeGame) game.away else game.home)
    val homeSide = if (homeGame) own else foe
    val city = view.teamLabels[game.home]?.city.orEmpty()
    return TodayGame(
        title = if (today) "今日の一戦" else "次の一戦",
        whenText = "${d?.month ?: ""}月${d?.day ?: ""}日${weekday?.let { "（$it）" }.orEmpty()}${turn?.let { "　第${it}ターン" }.orEmpty()}",
        place = if (homeGame) "ホーム" else "ビジター（${city.ifEmpty { "相手の本拠地" }}）",
        home = game.home,
        city = city,
        crowd = crowdLevel(homeSide.rank, homeSide.teams, streakValue(view.teamStreaks[game.home])),
        note = view.noteOf(ownStanding),
        own = own,
        foe = foe,
    )
}

/** 同じ日のほかの試合の1枚（Web 版 `otherGameCards` の1件） */
data class OtherGame(
    val id: Long?,
    val home: String,
    val away: String,
    val city: String,
    /** 「1部2位　5勝4敗」。順位表に無ければ空 */
    val homeRecord: String,
    val awayRecord: String,
    /** 先発予定の名前。未定なら null */
    val homeStarter: String?,
    val awayStarter: String?,
)

/**
 * 同じ日のほかの試合（先方要望 #8）。Web 版 `otherGameCards`。
 * ⚠ ビューの `upcoming` から、自球団の一戦と同じ日の、自球団の出ない試合（並びはそのまま）。
 *    自球団の試合が無ければ空。
 */
fun otherGameCards(view: LeagueView): List<OtherGame> {
    val me = view.teamName ?: return emptyList()
    val own = view.nextGames.firstOrNull { it.home == me || it.away == me } ?: return emptyList()
    val date = own.date ?: return emptyList()
    return view.upcoming
        .filter { it.home != me && it.away != me && it.date == date }
        .map { g ->
            OtherGame(
                id = g.id,
                home = g.home,
                away = g.away,
                city = view.teamLabels[g.home]?.city.orEmpty(),
                homeRecord = view.standingOf(g.home).record,
                awayRecord = view.standingOf(g.away).record,
                homeStarter = g.homeStarter?.takeIf { it.isNotEmpty() },
                awayStarter = g.awayStarter?.takeIf { it.isNotEmpty() },
            )
        }
}
