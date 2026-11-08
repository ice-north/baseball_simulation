package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlin.math.max
import kotlin.math.min

/**
 * 初期編成・トライアウトの希望リスト。Web 版 src/online/tryoutPlan.js の写し。
 *
 * ⚠ 提出は `{ count, rankedIds }` だけ。サーバーは上から見て空いている選手を、
 *    目標構成（ONLINE_ROSTER_TARGETS）に空きのある区分から count 人まで取る。
 *    画面の「獲得予定」もサーバーと同じ規則（plannedPicks）で出すこと。
 * ⚠ `rankedIds` からは誰も消さない（競合したとき繰り上がるため）。「外す」は末尾送り。
 */

val JsonObject.pid: Long get() = at("id").long() ?: 0L

fun rosterGroup(position: String?): String = when (position) {
    "pitcher" -> "pitcher"
    "catcher" -> "catcher"
    "first", "second", "third", "short" -> "infielder"
    else -> "outfielder"
}

val ROSTER_GROUP_LABELS = mapOf("pitcher" to "投手", "catcher" to "捕手", "infielder" to "内野手", "outfielder" to "外野手")

fun rosterCounts(players: List<JsonObject>): MutableMap<String, Int> {
    val counts = mutableMapOf("pitcher" to 0, "catcher" to 0, "infielder" to 0, "outfielder" to 0)
    for (p in players) counts.merge(rosterGroup(p.at("position").str()), 1, Int::plus)
    return counts
}

private fun nextFromPlan(ordered: List<JsonObject>, roster: List<JsonObject>): JsonObject? {
    val counts = rosterCounts(roster)
    return ordered.firstOrNull { p ->
        val g = rosterGroup(p.at("position").str())
        (counts[g] ?: 0) < (ONLINE_ROSTER_TARGETS[g] ?: 0)
    } ?: ordered.firstOrNull()
}

/** 競合しなかった場合に実際に取る顔ぶれ */
fun plannedPicks(rankedIds: List<Long>, candidates: List<JsonObject>, count: Int, roster: List<JsonObject>): List<JsonObject> {
    val byId = candidates.associateBy { it.pid }
    val pool = rankedIds.mapNotNull { byId[it] }
    val taken = mutableListOf<JsonObject>()
    val have = roster.toMutableList()
    repeat(count) {
        val p = nextFromPlan(pool.filter { it !in taken }, have) ?: return taken
        taken += p; have += p
    }
    return taken
}

fun normalizedVelocity(v: Double?): Double = if (v == null || v == 0.0) 0.0 else (v - 115) * 2.5
fun normalizedStamina(v: Double?): Double = if (v == null || v == 0.0) 0.0 else v / 2

/** 並べ替えの目安の総合点（overallScore）。試合の強さではない */
fun overallScore(p: JsonObject): Double = if (p.isPitcherJson()) {
    normalizedVelocity(p.at("pitching", "velocity").num()) * 0.35 +
        (p.at("pitching", "control").num() ?: 0.0) * 0.35 +
        normalizedStamina(p.at("pitching", "stamina").num()) * 0.2 +
        (p.at("pitching", "spinRate").num() ?: 0.0) * 0.1
} else {
    (p.at("batting", "meet").num() ?: 0.0) * 0.35 +
        (p.at("batting", "power").num() ?: 0.0) * 0.3 +
        (p.at("physical", "speed").num() ?: 0.0) * 0.15 +
        (p.at("fielding", "defense").num() ?: 0.0) * 0.2
}

data class SortKey(val key: String, val label: String, val of: (JsonObject) -> Double)

const val WEIGHTED_SORT_KEY = "weighted"

val TRYOUT_SORT_KEYS: List<SortKey> = listOf(
    SortKey("overall", "総合", ::overallScore),
    SortKey("age", "年齢") { it.at("age").num() ?: 0.0 },
    SortKey("meet", "ミート") { it.at("batting", "meet").num() ?: 0.0 },
    SortKey("power", "パワー") { it.at("batting", "power").num() ?: 0.0 },
    SortKey("velocity", "球速") { it.at("pitching", "velocity").num() ?: 0.0 },
    SortKey("control", "制球") { it.at("pitching", "control").num() ?: 0.0 },
    SortKey("defense", "守備") { it.at("fielding", "defense").num() ?: 0.0 },
)

data class WeightField(val key: String, val label: String, val group: String)

val WEIGHT_FIELDS = listOf(
    WeightField("meet", "ミート", "fielder"), WeightField("power", "パワー", "fielder"),
    WeightField("eye", "選球眼", "fielder"), WeightField("speed", "走力", "fielder"),
    WeightField("defense", "守備", "fielder"), WeightField("arm", "肩", "fielder"),
    WeightField("velocity", "球速", "pitcher"), WeightField("control", "制球", "pitcher"),
    WeightField("stamina", "スタミナ", "pitcher"), WeightField("breaking", "変化球", "pitcher"),
    WeightField("youth", "若さ", "common"),
)

val WEIGHT_LEVELS = listOf("軽視" to 0.6, "やや軽視" to 0.8, "普通" to 1.0, "やや重視" to 1.2, "重視" to 1.4, "最重視" to 1.6)
val WEIGHT_MAX = WEIGHT_LEVELS.size - 1

val DEFAULT_WEIGHTS = mapOf(
    "meet" to 4, "power" to 4, "eye" to 1, "speed" to 2, "defense" to 2, "arm" to 1,
    "velocity" to 4, "control" to 4, "stamina" to 2, "breaking" to 2, "youth" to 1,
)

fun sanitizeWeights(weights: Map<String, Int>?): Map<String, Int> =
    WEIGHT_FIELDS.associate { f -> f.key to (weights?.get(f.key)?.coerceIn(0, WEIGHT_MAX) ?: DEFAULT_WEIGHTS.getValue(f.key)) }

private fun clamp100(v: Double?) = max(0.0, min(100.0, v ?: 0.0))

fun abilityValue(p: JsonObject, key: String): Double = when (key) {
    "meet", "power", "eye" -> clamp100(p.at("batting", key).num())
    "speed", "arm" -> clamp100(p.at("physical", key).num())
    "defense" -> clamp100(p.at("fielding", "defense").num())
    "velocity" -> clamp100(normalizedVelocity(p.at("pitching", "velocity").num()))
    "control" -> clamp100(p.at("pitching", "control").num())
    "stamina" -> clamp100(normalizedStamina(p.at("pitching", "stamina").num()))
    "breaking" -> clamp100(
        p.at("pitching", "arsenal").list().filter { it.at("type").str() != "straight" }
            .maxOfOrNull { it.at("level").num() ?: 0.0 } ?: 0.0,
    )
    "youth" -> clamp100((32 - (p.at("age").num() ?: 25.0)) * 100 / 14)
    else -> 0.0
}

/** 重み付きの評価値（0〜100） */
fun weightedScore(p: JsonObject, weights: Map<String, Int>): Double {
    val side = if (p.isPitcherJson()) "pitcher" else "fielder"
    var total = 0.0; var sum = 0.0
    for (f in WEIGHT_FIELDS) {
        if (f.group != side && f.group != "common") continue
        val w = WEIGHT_LEVELS.getOrNull(weights[f.key] ?: 0)?.second ?: WEIGHT_LEVELS[0].second
        total += w * abilityValue(p, f.key); sum += w
    }
    return if (sum > 0) total / sum else 0.0
}

/** 重みからおすすめの希望順（目標構成に空きのある区分を先に） */
fun weightedRanked(candidates: List<JsonObject>, weights: Map<String, Int>, roster: List<JsonObject>): List<Long> {
    val score = candidates.associate { it.pid to weightedScore(it, weights) }
    val sorted = candidates.sortedWith(compareByDescending<JsonObject> { score[it.pid] }.thenBy { it.pid })
    val counts = rosterCounts(roster)
    val head = mutableListOf<Long>(); val tail = mutableListOf<Long>()
    for (p in sorted) {
        val g = rosterGroup(p.at("position").str())
        if ((counts[g] ?: 0) < (ONLINE_ROSTER_TARGETS[g] ?: 0)) { counts.merge(g, 1, Int::plus); head += p.pid } else tail += p.pid
    }
    return head + tail
}

val TRYOUT_GROUPS = listOf(
    "all" to "全部", "pitcher" to "投手", "catcher" to "捕手", "infield" to "内野", "outfield" to "外野",
)

fun inTryoutGroup(p: JsonObject, group: String): Boolean = when (group) {
    "all" -> true
    "pitcher" -> p.at("position").str() == "pitcher"
    "catcher" -> p.at("position").str() == "catcher"
    "infield" -> p.at("position").str() in setOf("first", "second", "third", "short")
    else -> p.at("position").str() in setOf("left", "center", "right")
}

/** 獲得予定を先頭に、残りを元の順で後ろに */
fun normalizeRanked(rankedIds: List<Long>, candidates: List<JsonObject>, count: Int, roster: List<JsonObject>): List<Long> {
    val picked = plannedPicks(rankedIds, candidates, count, roster).map { it.pid }
    val set = picked.toSet()
    return picked + rankedIds.filter { it !in set }
}

/** 控えの選手を獲得予定へ入れる（代わりに1人が控えの先頭へ） */
fun addToPlan(rankedIds: List<Long>, candidates: List<JsonObject>, count: Int, roster: List<JsonObject>, id: Long, first: Boolean = false): List<Long> {
    if (id !in rankedIds || count <= 0) return rankedIds
    val byId = candidates.associateBy { it.pid }
    val player = byId[id] ?: return rankedIds
    val wanted = plannedPicks(rankedIds, candidates, count, roster).map { it.pid }
    if (id in wanted) {
        if (!first) return normalizeRanked(rankedIds, candidates, count, roster)
        return normalizeRanked(listOf(id) + rankedIds.filter { it != id }, candidates, count, roster)
    }
    val group = rosterGroup(player.at("position").str())
    val counts = rosterCounts(roster + wanted.mapNotNull { byId[it] })
    val sameGroup = wanted.filter { rosterGroup(byId[it]?.at("position").str()) == group }
    val victim = when {
        (counts[group] ?: 0) >= (ONLINE_ROSTER_TARGETS[group] ?: 0) && sameGroup.isNotEmpty() -> sameGroup.last()
        wanted.size >= count -> wanted.lastOrNull()
        else -> null
    }
    val kept = wanted.filter { it != victim }
    val rest = rankedIds.filter { it != id && it != victim && it !in kept }
    val order = if (first) listOf(id) + kept + listOfNotNull(victim) + rest else kept + id + listOfNotNull(victim) + rest
    return normalizeRanked(order, candidates, count, roster)
}

/** 獲得予定から外して控えの末尾へ */
fun benchFromPlan(rankedIds: List<Long>, candidates: List<JsonObject>, count: Int, roster: List<JsonObject>, id: Long): List<Long> {
    if (id !in rankedIds) return rankedIds
    return normalizeRanked(rankedIds.filter { it != id } + id, candidates, count, roster)
}

private fun swapRanked(ids: List<Long>, index: Int, delta: Int): List<Long> {
    val next = index + delta
    if (index !in ids.indices || next !in ids.indices) return ids
    return ids.toMutableList().also { it[index] = ids[next]; it[next] = ids[index] }
}

/** 獲得予定の中で隣と入れ替える */
fun shiftInPlan(rankedIds: List<Long>, candidates: List<JsonObject>, count: Int, roster: List<JsonObject>, index: Int, delta: Int): List<Long> {
    val normalized = normalizeRanked(rankedIds, candidates, count, roster)
    val wantedCount = plannedPicks(normalized, candidates, count, roster).size
    val next = index + delta
    if (index !in 0 until wantedCount || next !in 0 until wantedCount) return normalized
    return normalizeRanked(swapRanked(normalized, index, delta), candidates, count, roster)
}

/** 獲得予定の中で id を to 番目へ（ドラッグ用。1つずつ動かして毎回探し直す） */
fun moveInPlan(rankedIds: List<Long>, candidates: List<JsonObject>, count: Int, roster: List<JsonObject>, id: Long, to: Int): List<Long> {
    var ids = normalizeRanked(rankedIds, candidates, count, roster)
    repeat(2 * max(1, ids.size)) {
        val at = plannedPicks(ids, candidates, count, roster).indexOfFirst { it.pid == id }
        if (at < 0 || at == to) return ids
        val next = shiftInPlan(ids, candidates, count, roster, at, if (to > at) 1 else -1)
        if (next == ids) return ids
        ids = next
    }
    return ids
}

data class PlanSummary(val counts: Map<String, Int>, val picked: List<JsonObject>, val blocking: List<String>, val warnings: List<String>)

/** 獲得予定の内訳と、成り立たない点（サーバーが拒む条件）・物足りない点 */
fun planSummary(rankedIds: List<Long>, candidates: List<JsonObject>, count: Int, roster: List<JsonObject>): PlanSummary {
    val picked = plannedPicks(rankedIds, candidates, count, roster)
    val counts = rosterCounts(picked)
    val combined = roster + picked
    val fielders = combined.count { !it.isPitcherJson() }
    val pitchers = combined.count { it.isPitcherJson() }
    val catchers = combined.count { it.at("position").str() == "catcher" }
    val blocking = buildList {
        if (fielders < 8) add("野手が${fielders}人（8人以上必要）")
        if (pitchers < 1) add("投手が1人もいません")
        if (catchers < 1) add("捕手が1人もいません")
    }
    val warnings = if (blocking.isNotEmpty()) emptyList() else buildList {
        if ((counts["pitcher"] ?: 0) < 5) add("投手が5人未満です")
        if ((counts["infielder"] ?: 0) < 4) add("内野手が4人未満です")
        if ((counts["outfielder"] ?: 0) < 3) add("外野手が3人未満です")
    }
    return PlanSummary(counts, picked, blocking, warnings)
}

// --- トレード（src/online/trades.js と同じ条件） ---------------------------

/** 名簿として成り立つか（rosterShortfall） */
fun rosterShortfall(players: List<JsonObject>): List<String> = buildList {
    if (players.size > ROSTER_LIMIT) add("${ROSTER_LIMIT}人を超えます（${players.size}人）")
    if (players.none { it.isPitcherJson() }) add("投手が居なくなります")
    if (players.none { it.at("position").str() == "catcher" }) add("捕手が居なくなります")
    val fielders = players.count { !it.isPitcherJson() }
    if (fielders < 8) add("野手が8人を割ります（${fielders}人）")
}

data class TradeAfter(val mine: List<JsonObject>, val theirs: List<JsonObject>)

fun rostersAfterTrade(mine: List<JsonObject>, theirs: List<JsonObject>, give: Set<Long>, get: Set<Long>): TradeAfter {
    val moving = mine.filter { it.pid in give }
    val coming = theirs.filter { it.pid in get }
    return TradeAfter(mine.filter { it.pid !in give } + coming, theirs.filter { it.pid !in get } + moving)
}

fun dealProblems(mine: List<JsonObject>, theirs: List<JsonObject>?, give: Set<Long>, get: Set<Long>): List<String> {
    theirs ?: return emptyList()
    val after = rostersAfterTrade(mine, theirs, give, get)
    return rosterShortfall(after.mine) + rosterShortfall(after.theirs)
}

const val MAX_OPEN_TRADES = 5

/** 候補がいまの名簿の同じ区分で何番手にあたるか（Web 版の `teamFitRank` と同じ） */
data class TeamFit(val group: String, val rank: Int, val of: Int)

fun teamFitRank(candidate: JsonObject, roster: List<JsonObject>, weights: Map<String, Int>): TeamFit {
    val group = rosterGroup(candidate.at("position").str())
    val score = weightedScore(candidate, weights)
    val same = roster.filter { rosterGroup(it.at("position").str()) == group }
    return TeamFit(group, 1 + same.count { weightedScore(it, weights) > score }, same.size)
}
