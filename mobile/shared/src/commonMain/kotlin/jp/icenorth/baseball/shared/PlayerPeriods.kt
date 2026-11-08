package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject

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
        p.forEach { (k, v) -> put(k, v) }
        put("career", career)
        career["seasonStats"]?.let { put("seasonStats", it) }
        career["performance"]?.let { put("performance", it) }
    }
}
