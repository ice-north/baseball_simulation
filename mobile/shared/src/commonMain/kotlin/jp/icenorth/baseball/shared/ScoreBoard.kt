package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject

/**
 * 試合の詳細のスコアボードの右端（R・H・E）。`side` は "away"（先攻）/ "home"（後攻）。
 * Web 版 `src/online/scoreBoard.js` の `scoreBoard` の `totals` と同じ中身:
 * 得点は試合の点数（無ければ回ごとの得点の合計）、安打・失策は個人成績（`game.teams`）を足す。
 * 失策は**守った側**の数（その球団の選手の失策）。個人成績が無ければ「-」
 */
fun scoreBoardTotals(game: JsonObject, side: String): List<String> {
    val team = game.at(side).str().orEmpty()
    val players = game.at("teams", team).list().mapNotNull { it.obj() }
    fun sum(key: String): String =
        if (players.isEmpty()) "-" else "${players.sumOf { it.at("batting", key).num() ?: 0.0 }.toInt()}"
    val runs = game.at("${side}Score").int() ?: game.at("lineScore", side).list().mapNotNull { it.int() }.sum()
    return listOf("$runs", sum("hits"), sum("errors"))
}
