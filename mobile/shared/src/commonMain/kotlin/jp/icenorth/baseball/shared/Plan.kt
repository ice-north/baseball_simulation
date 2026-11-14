package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * 編成の編集をまとめたもの（打順・守備／先発ローテと投手の役割／方針と自動采配）。
 *
 * ⚠ **保存は1か所**。アプリでは3つの面（スタメン・投手・方針）を同じ編集として持ち、
 *    保存ボタン1つで送る（以前の指摘: 保存の場所がページごとに違うと迷う）。
 * ⚠ 送るのは `base`（編集を始めたときの塊）の全項目＋変更＋ `baseLineup`。
 *    サーバーは `baseLineup` と今の編成を比べ、別の画面で変わっていたら edit_conflict で断る。
 */
data class PlanDraft(
    val base: JsonObject,
    val slots: List<BatterSlot>,
    val pitching: PitchingState,
    val strategy: Map<String, String>,
    val tactics: Map<String, String>,
) {
    private fun withSlots(op: LineupDraft.() -> LineupDraft) = copy(slots = LineupDraft(base, slots, emptyList()).op().slots)

    fun swapPositions(a: Int, b: Int) = withSlots { swapPositions(a, b) }
    fun replaceBatter(index: Int, playerId: Long) = withSlots { replaceBatter(index, playerId) }

    /** 打順の2人を入れ替える（ドラッグで別の行に落としたとき。間の選手は動かさない） */
    fun swapBatters(a: Int, b: Int): PlanDraft {
        if (a == b || a !in slots.indices || b !in slots.indices) return this
        val next = slots.toMutableList(); next[a] = slots[b]; next[b] = slots[a]
        return copy(slots = next)
    }

    fun withPitching(next: PitchingState) = copy(pitching = next)
    fun withStrategy(key: String, value: String) = copy(strategy = strategy + (key to value))
    fun withTactic(key: String, value: String) = copy(tactics = tactics + (key to value))

    /**
     * @param roster 今の名簿。渡すと、打順に名簿から外れた選手（トレード・抹消）が残っていないかも見る
     *               （サーバーは「登録できない選手が含まれています」で断る）
     */
    fun problem(roster: List<Player>? = null): String? = LineupDraft(base, slots, pitching.starters).problem()
        ?: roster?.let { list ->
            // ⚠ 投手も野手の枠に入れてよい（二刀流。サーバーの validateLineup と同じ）
            val eligible = list.filter { it.isActive }.map { it.id }.toSet()
            if (slots.any { it.playerId !in eligible }) "打順に名簿から外れた選手が居ます。控えと交代してください" else null
        }
        ?: when {
            pitching.starters.size > MAX_STARTERS -> "先発投手は${MAX_STARTERS}人までです"
            // 保存済みの先発に、名簿から外れた・抹消中の投手が残っていることがある（Web 版 pitchingProblems と同じ）
            pitching.starters.any { id ->
                id !in pitching.roles || (roster != null && roster.none { it.id == id && it.isActive && it.pitching != null })
            } -> "名簿に居ない・起用できない投手が先発に入っています"
            pitching.roles.values.count { it == "closer" } > 1 -> "クローザーは1人までです"
            else -> null
        }

    fun toPayload(): JsonObject {
        val lineup = LineupDraft(base, slots, pitching.starters).toPayload()
        val hadTactics = base["tactics"] != null
        val tacticsChanged = TACTIC_FIELDS.any { f -> tactics[f.key] != f.default }
        return buildJsonObject {
            lineup.forEach { (k, v) -> put(k, v) }
            put("pitcherRoles", buildJsonObject { pitching.roles.forEach { (id, role) -> put(id.toString(), role) } })
            put("strategy", buildJsonObject { STRATEGY_FIELDS.forEach { f -> put(f.key, strategy[f.key] ?: f.default) } })
            // ⚠ 自動采配は、元から持っているか既定から変えたときだけ送る（Web 版と同じ。無い球団に既定の塊を増やさない）
            if (hadTactics || tacticsChanged) {
                put(
                    "tactics",
                    buildJsonObject {
                        base["tactics"].obj()?.forEach { (k, v) -> put(k, v) }
                        TACTIC_FIELDS.forEach { f ->
                            val value = tactics[f.key] ?: f.default
                            if (f.numeric) put(f.key, JsonPrimitive(value.toIntOrNull() ?: 0)) else put(f.key, value)
                        }
                    },
                )
            }
        }
    }

    fun sameEdit(other: PlanDraft) =
        slots == other.slots && pitching == other.pitching && strategy == other.strategy && tactics == other.tactics

    companion object {
        fun from(lineup: JsonObject, roster: List<Player>): PlanDraft {
            val order = LineupDraft.from(lineup)
            val saved = lineup["pitcherRoles"].obj().orEmpty()
                .mapNotNull { (k, v) -> k.toLongOrNull()?.let { id -> v.str()?.let { id to it } } }.toMap()
            val strategy = STRATEGY_FIELDS.associate { f ->
                f.key to (lineup.at("strategy", f.key).str()?.takeIf { v -> f.options.any { it.key == v } } ?: f.default)
            }
            val tactics = TACTIC_FIELDS.associate { f ->
                val raw = lineup.at("tactics", f.key)
                val text = raw.num()?.toInt()?.toString() ?: raw.str()
                f.key to (text?.takeIf { v -> f.options.any { it.key == v } } ?: f.default)
            }
            // 名簿に居ない・抹消中の選手が打順に残っていたら、その枠は空きにして控えとの交代で埋めてもらう
            // ⚠ 投手は空きにしない（二刀流で野手の枠に入れられる）
            val eligible = roster.filter { it.isActive }.map { it.id }.toSet()
            val slots = if (roster.isEmpty()) order.slots else normalizeSlots(order.slots, eligible)
            return PlanDraft(lineup, slots, PitchingState.from(order.starters, saved, roster), strategy, tactics)
        }
    }
}

/** 元に戻す／やり直す。まとめて変える操作（自動で組むなど）も1手として積む */
data class EditHistory<T>(val present: T, val past: List<T> = emptyList(), val future: List<T> = emptyList()) {
    val canUndo get() = past.isNotEmpty()
    val canRedo get() = future.isNotEmpty()

    fun push(next: T): EditHistory<T> = if (next == present) this else EditHistory(next, (past + present).takeLast(100), emptyList())
    /** 今の1手を差し替える（ドラッグ中の連続した移動を1手にまとめるため） */
    fun replace(next: T): EditHistory<T> = if (next == present) this else copy(present = next, future = emptyList())
    fun undo(): EditHistory<T> = if (past.isEmpty()) this else EditHistory(past.last(), past.dropLast(1), listOf(present) + future)
    fun redo(): EditHistory<T> = if (future.isEmpty()) this else EditHistory(future.first(), past + present, future.drop(1))
}
