package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlin.math.roundToInt

// ============================================================
// キャンプで伸びた能力のまとめ（Web 版の `src/online/campGains.js` と同じ形）。
// 伸びはサーバーが1クールごとに練習の前後を比べて残す（`phase.camp.last` と `phase.camp.gains`）。
// ⚠ 差を画面で作らないこと（読み直しや別の端末で前の値が無く、伸びが0に見える）。
// ============================================================

private val GAIN_LABELS = mapOf(
    "batting.meet" to "ミート", "batting.power" to "パワー", "batting.eye" to "選球眼",
    "batting.steal" to "盗塁", "batting.bunt" to "バント",
    "pitching.velocity" to "球速", "pitching.control" to "制球", "pitching.stamina" to "スタミナ", "pitching.spinRate" to "回転",
    "physical.speed" to "走力", "physical.arm" to "肩力", "physical.bodyStamina" to "体力",
    "physical.recovery" to "回復", "physical.muscle" to "体幹", "physical.dexterity" to "器用さ",
    "fielding.defense" to "守備", "catching.lead" to "リード",
)

/** 項目の画面の名前。変化球は `pitch.<球種>` */
fun campGainLabel(key: String): String =
    if (key.startsWith("pitch.")) PITCH_TYPE_NAMES[key.removePrefix("pitch.")] ?: key.removePrefix("pitch.")
    else GAIN_LABELS[key] ?: key

data class CampGainItem(val key: String, val label: String, val diff: Double)
data class CampGainRow(val player: JsonObject, val items: List<CampGainItem>, val events: List<String>) {
    val sum: Double get() = items.sumOf { it.diff }
    val grew: Boolean get() = items.any { it.diff > 0 }
}

private fun itemsOf(changes: JsonObject?): List<CampGainItem> =
    changes.orEmpty().mapNotNull { (key, v) -> v.num()?.takeIf { it != 0.0 }?.let { CampGainItem(key, campGainLabel(key), it) } }
        .sortedByDescending { it.diff }

/** 選手ごとの伸び（伸びた量の多い選手から）。名簿に居ない選手は落とす */
fun campGainRows(gains: JsonObject?, roster: List<JsonObject>, events: JsonObject? = null): List<CampGainRow> {
    val byId = roster.associateBy { it.at("id").num()?.toLong()?.toString() ?: it.at("id").str().orEmpty() }
    val ids = gains.orEmpty().keys + events.orEmpty().keys
    return ids.mapNotNull { id ->
        val player = byId[id] ?: return@mapNotNull null
        CampGainRow(player, itemsOf(gains?.get(id).obj()), events?.get(id).list().mapNotNull { it.str() })
    }.sortedWith(compareByDescending<CampGainRow> { it.sum }.thenBy { it.player.at("id").num() ?: 0.0 })
}

/** 球団全体で、項目ごとの伸びの合計（多い順） */
fun campGainTotals(gains: JsonObject?): List<CampGainItem> {
    val sums = linkedMapOf<String, Double>()
    gains.orEmpty().values.forEach { changes ->
        changes.obj().orEmpty().forEach { (key, v) -> v.num()?.let { sums[key] = (sums[key] ?: 0.0) + it } }
    }
    return sums.mapNotNull { (key, diff) ->
        val rounded = (diff * 10).roundToInt() / 10.0
        if (rounded == 0.0) null else CampGainItem(key, campGainLabel(key), rounded)
    }.sortedByDescending { it.diff }
}

/** 「+2」「-1」「+0.5」 */
fun formatGain(diff: Double): String {
    val text = if (diff == diff.roundToInt().toDouble()) diff.roundToInt().toString() else ((diff * 10).roundToInt() / 10.0).toString()
    return if (diff > 0) "+$text" else text
}
