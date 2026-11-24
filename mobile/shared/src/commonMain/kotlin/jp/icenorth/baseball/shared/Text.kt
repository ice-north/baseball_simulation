package jp.icenorth.baseball.shared

/**
 * Web 版と同じ表記。出どころ: src/online/api.js / shared.js / src/utils/constants.js / src/game/condition.js
 * ⚠ SEASON_TURNS・SEASON_START_MONTH・POSITION_LABELS・STATUS_LABELS・CONDITION_ICONS・ABILITY_RANKS は Tables.kt（gen-tables.mjs が Web 版から書き出す）
 */

/** リーグの名前（"A" → "1部"）。階層リーグの表（[PYRAMID_LEAGUES]）から作る */
val LEAGUE_NAMES: Map<String, String> = PYRAMID_LEAGUES.associate { it.id to it.name }

fun positionLabel(pos: String?): String = POSITION_LABELS[pos] ?: (pos ?: "")

/** 調子（0〜4）の顔。表は Tables.kt の CONDITION_ICONS（Web 版 condition.js から書き出す） */
fun conditionIcon(condition: Int?): String = CONDITION_ICONS[condition] ?: ""

/** 能力を0〜100の物差しにそろえる（球速は km/h、スタミナは0〜200）。Web 版 `normalizeAbility` と同じ */
fun normalizedAbility(value: Int, velocity: Boolean = false, stamina: Boolean = false): Double = when {
    velocity -> (value - 115) * 2.5
    stamina -> value / 2.0
    else -> value.toDouble()
}

/**
 * 能力のデータバーの長さ（0〜1）。段位と同じ物差し（[normalizedAbility]）。
 * ⚠ Web 版の `abilityBarPercent`（src/online/playerInfo.js）と同じ式（先方指摘 2026-11-16: 数字だけで見づらい）
 */
fun abilityBarFraction(value: Int, velocity: Boolean = false, stamina: Boolean = false): Float =
    (kotlin.math.round(normalizedAbility(value, velocity, stamina)) / 100.0).coerceIn(0.0, 1.0).toFloat()

/** 能力値のランク（S〜F）。球速は (v-115)×2.5、投手スタミナは v/2 に直してから測る（getAbilityRank） */
fun abilityRank(value: Int, velocity: Boolean = false, stamina: Boolean = false): Char {
    val v = normalizedAbility(value, velocity, stamina)
    // 境目は Tables.kt の ABILITY_RANKS（Web 版 getAbilityRank から書き出す）。下の段より低い値は一番下の段
    return ABILITY_RANKS.firstOrNull { v >= it.first }?.second ?: ABILITY_RANKS.last().second
}

/** シーズンの何ターン目か。範囲外は null（shared.js の turnOfDate） */
fun turnOfDate(date: GameDate?, turns: Int = SEASON_TURNS): Int? {
    date ?: return null
    val turn = (daysFromCivil(date.year.toLong(), date.month, date.day) - daysFromCivil(date.year.toLong(), SEASON_START_MONTH, 1)).toInt() + 1
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

/** OPS の表記（.812 / 1.054）。打率と違って 1 を超えるので [rate3] だと 1.000 で止まる */
fun ops3(value: Double?): String {
    value ?: return "-"
    val r = kotlin.math.round(value * 1000).toInt()
    return if (r >= 1000) "${r / 1000}.${(r % 1000).toString().padStart(3, '0')}" else ".${r.toString().padStart(3, '0')}"
}

/** 成績の特徴ラベルの短い形（行に1行で収めるため。いしだ指定:「アベヒ」のように縮める） */
private val SHORT_LABELS = mapOf(
    "アベレージヒッター" to "アベヒ", "パワーヒッター" to "パワヒ", "長打型" to "長打", "出塁型" to "出塁",
    "選球眼" to "選球", "固め打ち" to "固め", "粘り打ち" to "粘り", "対左投手B" to "対左B", "対左投手F" to "対左F",
    "制球安定" to "制球", "尻上がり" to "尻上",
)

fun shortLabel(text: String): String = SHORT_LABELS[text] ?: if (text.length > 5) text.take(4) else text

/** 生成のときに積んでいた仮の高校の名前。Web 版 `src/utils/careerHistory.js` の `PLACEHOLDER_HIGH_SCHOOL` と同じ */
const val PLACEHOLDER_HIGH_SCHOOL = "高校卒"

/**
 * 経歴から、名前の付いた高校と並んでいる仮の「高校卒」を外す（Web 版 `withoutPlaceholderHighSchool` の写し）。
 * ⚠ 古いリーグには「〇〇高 → 高校卒」と2つ並んだ経歴が残っている（保存は直さず、出すときに外す）。
 *    高校が仮の1つだけなら残す。
 */
fun <T> withoutPlaceholderHighSchool(history: List<T>, type: (T) -> String?, label: (T) -> String?): List<T> {
    val placeholder = { h: T -> type(h) == "highschool" && label(h) == PLACEHOLDER_HIGH_SCHOOL }
    val named = history.any { type(it) == "highschool" && !placeholder(it) }
    return if (named) history.filterNot(placeholder) else history
}
