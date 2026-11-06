package jp.icenorth.baseball.shared

/** Web 版と同じ表記。出どころ: src/online/api.js / shared.js / src/utils/constants.js / src/game/condition.js */

const val SEASON_TURNS = 160
const val SEASON_START_MONTH = 4

val POSITION_LABELS = mapOf(
    "pitcher" to "投", "catcher" to "捕", "first" to "一", "second" to "二", "third" to "三",
    "short" to "遊", "left" to "左", "center" to "中", "right" to "右",
)

val STATUS_LABELS = mapOf(
    "running" to "進行中", "waiting" to "決定待ち", "paused" to "一時停止", "error" to "要確認・停止中",
)

val LEAGUE_NAMES = mapOf("A" to "1部", "B" to "2部")

fun positionLabel(pos: String?): String = POSITION_LABELS[pos] ?: (pos ?: "")

/** 調子（0〜4）の顔。Web 版 CONDITION_ICONS と同じ */
fun conditionIcon(condition: Int?): String = when (condition) {
    4 -> "🔥"; 3 -> "😊"; 2 -> "😐"; 1 -> "😞"; 0 -> "😰"; else -> ""
}

/** 能力値のランク（S〜F）。球速は (v-115)×2.5、投手スタミナは v/2 に直してから測る（getAbilityRank） */
fun abilityRank(value: Int, velocity: Boolean = false, stamina: Boolean = false): Char {
    val v = when {
        velocity -> (value - 115) * 2.5
        stamina -> value / 2.0
        else -> value.toDouble()
    }
    return when {
        v >= 90 -> 'S'; v >= 80 -> 'A'; v >= 70 -> 'B'; v >= 60 -> 'C'; v >= 50 -> 'D'; v >= 40 -> 'E'; else -> 'F'
    }
}

private fun daysFromCivil(y: Int, m: Int, d: Int): Long {
    val yy = if (m <= 2) y - 1 else y
    val era = (if (yy >= 0) yy else yy - 399) / 400
    val yoe = yy - era * 400
    val doy = (153 * (m + (if (m > 2) -3 else 9)) + 2) / 5 + d - 1
    val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146097L + doe - 719468
}

/** シーズンの何ターン目か。範囲外は null（shared.js の turnOfDate） */
fun turnOfDate(date: GameDate?, turns: Int = SEASON_TURNS): Int? {
    date ?: return null
    val turn = (daysFromCivil(date.year, date.month, date.day) - daysFromCivil(date.year, SEASON_START_MONTH, 1)).toInt() + 1
    return if (turn in 1..turns) turn else null
}

/** 見出し用（「第23ターン / 160」「開幕前」「シーズン終了」） */
fun formatTurn(date: GameDate?, turns: Int = SEASON_TURNS): String {
    date ?: return ""
    val turn = turnOfDate(date, turns)
    return when {
        turn != null -> "第${turn}ターン / $turns"
        date.month < SEASON_START_MONTH -> "開幕前"
        else -> "シーズン終了"
    }
}

fun LeagueView.teamLabel(name: String): String = teamLabels[name]?.label ?: name
fun LeagueView.teamShort(name: String): String = teamLabels[name]?.short ?: name

/** 打率などの表記（.312）。打席が無ければ「-」 */
fun rate3(value: Double?): String {
    value ?: return "-"
    val s = kotlin.math.round(value * 1000).toInt().toString().padStart(3, '0')
    return if (value >= 1.0) "1.000" else ".$s"
}
