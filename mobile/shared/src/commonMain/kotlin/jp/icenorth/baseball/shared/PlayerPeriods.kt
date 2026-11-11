package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// ============================================================
// 選手の期間ごとの成績（サーバーの `playerPeriods`。今季・対人通算・過去の年）を読む。
// ⚠ 形はサーバー（server/projection.mjs の projectTeamInfo・projectPlayerInfo、
//    server/recordedViews.mjs の playerPeriods）が正本。Web 版の読み方と揃える。
// ============================================================

/** 期間の一覧（名簿の1人の `periods`） */
fun periodsOf(player: JsonObject): List<JsonObject> = player["periods"].list().mapNotNull { it.obj() }

/**
 * その選手の「対人通算」の期間（`periods` の id=career）。1年も記録が無ければ null。
 * Web 版 src/online/CareerStats.jsx の `careerOf` と同じ。
 * ⚠ 以前の `career` の項目はサーバーが外した（期間の一覧にまとめた）。そちらを読むと通算が空になる
 */
fun careerOf(player: JsonObject): JsonObject? = periodsOf(player).firstOrNull { it.at("id").str() == "career" }

/**
 * 通算の数字を、選手成績の表が読む形（`seasonStats` / `performance`）に移す。記録の無い選手は出さない。
 * `career` には通算の期間をそのまま入れる（`years`・`partial` を画面が読む）。
 * Web 版 src/online/CareerStats.jsx の `careerRoster` と同じ。
 */
fun careerRoster(roster: List<JsonObject>): List<JsonObject> = roster.mapNotNull { p ->
    val career = careerOf(p) ?: return@mapNotNull null
    buildJsonObject {
        // ⚠ 今季の捕手の成績（catcherStats）は通算の表に残さない。通算の期間にあればそれを使う
        p.forEach { (k, v) -> if (k != "catcherStats") put(k, v) }
        put("career", career)
        career["seasonStats"]?.let { put("seasonStats", it) }
        career["performance"]?.let { put("performance", it) }
        career["catcherStats"]?.let { put("catcherStats", it) }
    }
}

private fun idKey(player: JsonObject): String? = player.at("id").num()?.toLong()?.toString() ?: player.at("id").str()

/**
 * 選手の詳細で action=player（場面別まで入った期間）を読みに行くか。
 * ⚠ サーバーの projectPlayerInfo は**自球団の選手しか返さない**（他球団・トレード相手・トライアウト候補は
 *    404「選手が見つかりません」）。Web 版 src/online/PlayerPerformance.jsx の Detail と同じく、
 *    ビューの自球団の名簿に付く `detailAvailable` のときだけ読む。
 *    名簿から写した形（キャンプ・手続きの一覧など）で印が落ちていても、自球団の名簿（`ownRoster`、
 *    ビューの `roster`）に印付きで居れば読む。
 */
fun detailReadable(player: JsonObject, ownRoster: List<JsonObject> = emptyList()): Boolean {
    if (player.at("detailAvailable").bool() == true) return true
    val id = idKey(player) ?: return false
    return ownRoster.any { idKey(it) == id && it.at("detailAvailable").bool() == true }
}

/**
 * action=player を読まない選手の期間。球団ごとの読み込みに載った `periods`（今季・対人通算・過去の年）を使い、
 * 無ければ名簿の今季の数字だけを「今季」として出す（Web 版 PlayerPerformance.jsx の Detail と同じ）。
 * 数字が何も無ければ空。
 */
fun localPeriods(player: JsonObject): List<JsonObject> {
    val periods = periodsOf(player)
    if (periods.isNotEmpty()) return periods
    val stats = player["seasonStats"]?.takeIf { it !is JsonNull } ?: return emptyList()
    return listOf(
        buildJsonObject {
            put("id", "current")
            put("label", "今季")
            player["publicSource"]?.let { put("source", it) }
            player["publicPartial"]?.let { put("partial", it) }
            put("seasonStats", stats)
            player["performance"]?.let { put("performance", it) }
        },
    )
}
