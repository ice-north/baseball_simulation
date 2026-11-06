package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put

/** 打順の1枠。`order` は 1〜8 */
data class BatterSlot(val playerId: Long, val position: String)

val FIELD_POSITIONS = listOf("catcher", "first", "second", "third", "short", "left", "center", "right")

/**
 * 編集中の編成。サーバーから来た編成の塊（`base`）を土台にし、打順・守備・先発の順だけを差し替える。
 *
 * ⚠ 保存は `base` の全項目＋変更＋ `baseLineup`（編集を始めたときの塊）。サーバーは
 *    `baseLineup` と今の編成を比べ、別の画面で変わっていたら edit_conflict で断る
 *    （server/leagueService.mjs の lineup）。
 */
data class LineupDraft(
    val base: JsonObject,
    val slots: List<BatterSlot>,
    val starters: List<Long>,
) {
    val isDirty: Boolean get() = this != from(base)

    fun moveBatter(from: Int, to: Int): LineupDraft {
        if (from == to || from !in slots.indices || to !in slots.indices) return this
        val next = slots.toMutableList()
        next.add(to, next.removeAt(from))
        return copy(slots = next)
    }

    /** 2人の守備位置を入れ替える（打順はそのまま） */
    fun swapPositions(a: Int, b: Int): LineupDraft {
        if (a == b || a !in slots.indices || b !in slots.indices) return this
        val next = slots.toMutableList()
        next[a] = slots[a].copy(position = slots[b].position)
        next[b] = slots[b].copy(position = slots[a].position)
        return copy(slots = next)
    }

    /** 打順 index の選手を控えの選手と入れ替える（打順と守備位置は引き継ぐ） */
    fun replaceBatter(index: Int, playerId: Long): LineupDraft {
        if (index !in slots.indices || slots.any { it.playerId == playerId }) return this
        val next = slots.toMutableList()
        next[index] = slots[index].copy(playerId = playerId)
        return copy(slots = next)
    }

    fun moveStarter(from: Int, to: Int): LineupDraft {
        if (from == to || from !in starters.indices || to !in starters.indices) return this
        val next = starters.toMutableList()
        next.add(to, next.removeAt(from))
        return copy(starters = next)
    }

    /** サーバーの validateLineup（src/online/shared.js）と同じ前提を、送る前に確かめる */
    fun problem(): String? = when {
        slots.size != 8 -> "野手8人の打順を指定してください"
        slots.map { it.playerId }.toSet().size != 8 -> "同じ選手を重複して指定できません"
        FIELD_POSITIONS.any { pos -> slots.none { it.position == pos } } -> "野手の守備位置を一度ずつ指定してください"
        starters.isEmpty() -> "先発投手を1人以上指定してください"
        else -> null
    }

    fun toPayload(): JsonObject = buildJsonObject {
        base.forEach { (key, value) -> put(key, value) }
        put(
            "battingOrder",
            buildJsonArray {
                slots.forEachIndexed { i, slot ->
                    add(
                        buildJsonObject {
                            put("playerId", slot.playerId)
                            put("battingOrder", i + 1)
                            put("position", slot.position)
                        },
                    )
                }
            },
        )
        put("starters", JsonArray(starters.map { JsonPrimitive(it) }))
        put("baseLineup", base)
    }

    companion object {
        fun from(lineup: JsonObject): LineupDraft {
            val slots = (lineup["battingOrder"] as? JsonArray).orEmpty()
                .map { it.jsonObject }
                .sortedBy { it["battingOrder"]?.jsonPrimitive?.int ?: 0 }
                .map {
                    BatterSlot(
                        playerId = it["playerId"]!!.jsonPrimitive.long,
                        position = it["position"]?.jsonPrimitive?.contentOrNull ?: "",
                    )
                }
            val starters = (lineup["starters"] as? JsonArray).orEmpty().map { it.jsonPrimitive.long }
            return LineupDraft(lineup, slots, starters)
        }
    }
}
