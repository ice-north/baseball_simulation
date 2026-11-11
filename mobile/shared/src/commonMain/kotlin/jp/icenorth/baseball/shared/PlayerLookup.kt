package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject

/**
 * 名簿（生の形）から、成績表やタイトル争いの行の選手を探す。
 * ⚠ id があれば id だけで探す（名前に落とさない）。退団・移籍した選手と同じ名前の別人が同じ球団に
 *    いると、名前で探し直して別人のシートが開いていた。id の無い行（古いサーバーのタイトル争い）だけ名前で探す
 */
fun findRosterPlayer(players: List<JsonObject>, id: Long?, name: String?): JsonObject? = when {
    id != null -> players.firstOrNull { it.at("id").num()?.toLong() == id }
    name != null -> players.firstOrNull { it.at("name").str() == name }
    else -> null
}
