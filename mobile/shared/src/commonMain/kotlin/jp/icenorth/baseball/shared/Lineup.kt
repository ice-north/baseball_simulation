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
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/**
 * 打順の1枠。`order` は 1〜8。
 * 空き（選手が退団・ドラフトで抜けた枠）は負の番号（[emptySlotId]）で持つ。控えとの交代で埋める
 */
data class BatterSlot(val playerId: Long, val position: String) {
    val isEmpty: Boolean get() = playerId < 0
}

/** 空き枠の番号（打順ごとに別の負の数にして、並べ替えの鍵が重ならないようにする） */
fun emptySlotId(index: Int): Long = -1L - index

/**
 * 打順を「8つの守備位置を1つずつ持つ8枠」に整える（Web 版 normalizeOrder と同じ）。
 * ⚠ 年度末に主力がドラフト・退団で抜けると、保存済みの打順が6人などになっている。そのままだと
 *    抜けた守備位置の枠が画面に無く、**どの操作でも埋められない**（保存も断られ続ける）。
 *    - 9人目以降は外す / 守備位置が重なる・守備位置でない選手は、守る人の居ない位置へ回す
 *    - 足りない枠は空きで埋める（空きは控えとの交代で埋める）
 *    - `known` を渡すと、そこに居ない選手（名簿から外れた）の枠も空きにする
 */
fun normalizeSlots(slots: List<BatterSlot>, known: Set<Long>? = null): List<BatterSlot> {
    val kept = slots.take(8)
    val free = FIELD_POSITIONS.filter { pos -> kept.none { it.position == pos } }.toMutableList()
    val used = mutableSetOf<String>()
    val next = kept.mapIndexed { i, e ->
        val id = if (known != null && e.playerId !in known) emptySlotId(i) else e.playerId
        if (e.position in FIELD_POSITIONS && used.add(e.position)) e.copy(playerId = id)
        else BatterSlot(id, free.removeAt(0).also { used.add(it) })
    }.toMutableList()
    while (next.size < 8) next.add(BatterSlot(emptySlotId(next.size), free.removeAt(0)))
    return next
}

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

    /**
     * 2人の打順を入れ替える（守備位置は選手に付いたまま。間の選手は動かさない）。
     * ⚠ 「その打順へ動かす（間はずれる）」にしないこと。入れ替えたつもりが下の選手が
     *    全員1つずれる、と言われて直した（2026-11。Web の swapOrder と同じ）
     */
    fun swapBatters(a: Int, b: Int): LineupDraft {
        if (a == b || a !in slots.indices || b !in slots.indices) return this
        val next = slots.toMutableList()
        next[a] = slots[b]; next[b] = slots[a]
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
        slots.any { it.isEmpty } -> "空いている打順があります。控えと交代して埋めてください"
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
                .mapIndexed { i, it ->
                    BatterSlot(
                        // 選手の無い枠（null）は空き
                        playerId = it["playerId"]?.jsonPrimitive?.longOrNull ?: emptySlotId(i),
                        position = it["position"]?.jsonPrimitive?.contentOrNull ?: "",
                    )
                }
            val starters = (lineup["starters"] as? JsonArray).orEmpty().map { it.jsonPrimitive.long }
            return LineupDraft(lineup, normalizeSlots(slots), starters)
        }
    }
}

/** 守備の組（投手・捕手・内野・外野）。画面で位置の色を分けるのに使う。Web 版 FIELDER_GROUPS と同じ分け方 */
fun positionGroup(pos: String?): String = when (pos) {
    "pitcher" -> "pitcher"
    "catcher" -> "catcher"
    "first", "second", "third", "short" -> "infield"
    "left", "center", "right" -> "outfield"
    else -> ""
}

/** 控え野手の組（捕手・内野手・外野手。Web 版 groupBench と同じ） */
val FIELDER_GROUP_LABELS = listOf("catcher" to "捕手", "infield" to "内野手", "outfield" to "外野手")

/**
 * 本職以外に守れる位置（適性 min 以上、高い順。Web 版 playablePositions から本職を除いたもの）。
 * @param except 除く位置（既定は本職。スタメンの行では守っている位置を除く）
 */
fun Player.subPositions(min: Int = SUBSTITUTE_MIN_FITNESS, except: String? = position): List<String> =
    FIELD_POSITIONS.filter { it != except && fitness(it) >= min }.sortedByDescending { fitness(it) }

/** その守備位置の交代候補（適性の高い順、同じなら疲労の少ない順。Web 版 candidatesFor と同じ） */
fun List<Player>.candidatesFor(pos: String): List<Player> =
    sortedWith(compareByDescending<Player> { it.fitness(pos) }.thenBy { it.fatigue ?: 0 })

/** 疲労の段（Web 版 getFatigueTone）。0=なし 1=黄（41〜、成長が鈍り始める） 2=赤（81〜） */
fun fatigueTone(fatigue: Int?): Int = when {
    (fatigue ?: 0) > 80 -> 2
    (fatigue ?: 0) > 40 -> 1
    else -> 0
}
