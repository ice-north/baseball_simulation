package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * 指示（command）の中身。形はサーバー（server/leagueService.mjs）と Web 版の画面に合わせる。
 * 画面から直接組み立てず、ここを通す（ローカルの開発サーバーでの検査も同じ関数を使う）。
 */
object Commands {
    private fun ids(list: Collection<Long>) = JsonArray(list.map { JsonPrimitive(it) })

    /** 手続きの提出。`base` は編集を始めたときの提出（無ければ null）。サーバーが別の操作との食い違いを見る */
    fun submit(phaseId: String, plan: JsonObject, ready: Boolean, base: JsonElement?): JsonObject = buildJsonObject {
        put("phaseId", phaseId)
        put("plan", plan)
        put("ready", ready)
        put("baseSubmission", base ?: JsonNull)
    }

    /** キャンプの1クール。⚠ round は「次のクール」（実行済み＋1）。同じクールは2回走らない */
    fun campRound(
        round: Int,
        mode: String,
        direction: String,
        phase: String,
        players: Map<Long, Wish>,
        main: Map<Long, String>,
        sub: Map<Long, String>,
    ): JsonObject = buildJsonObject {
        put("round", round)
        putJsonObject("policy") { put("mode", mode); put("direction", direction); put("phase", phase) }
        // 選手ごとの方針の上書き（「合わせる」）
        putJsonObject("players") {
            players.forEach { (id, w) -> putJsonObject(id.toString()) { put("direction", w.direction); put("phase", w.phase) } }
        }
        putJsonObject("main") { main.forEach { (id, key) -> put(id.toString(), key) } }
        putJsonObject("sub") { sub.forEach { (id, key) -> put(id.toString(), key) } }
    }

    fun pack(packId: String): JsonObject = buildJsonObject { put("packId", packId) }

    fun profile(teamName: String, playerName: String): JsonObject = buildJsonObject {
        put("teamName", teamName.trim())
        put("playerName", playerName.trim())
    }

    /** 新しい提案。offer＝自分が出す、want＝相手からもらう */
    fun tradeOffer(to: String, give: Collection<Long>, get: Collection<Long>): JsonObject = buildJsonObject {
        put("to", to)
        put("offer", ids(give))
        put("want", ids(get))
    }

    /**
     * 提案への返事（accept / reject / counter）。
     * ⚠ 逆提案の offer はいつも**提案した側**が出す選手。自分が提案した側か（mine）で向きを直す。
     */
    fun tradeRespond(tradeId: String, action: String, mine: Boolean = false, give: Collection<Long>? = null, get: Collection<Long>? = null): JsonObject = buildJsonObject {
        put("tradeId", tradeId)
        put("action", action)
        if (action == "counter" && give != null && get != null) {
            put("offer", ids(if (mine) give else get))
            put("want", ids(if (mine) get else give))
        }
    }

    /**
     * 任せ方を変える（area: lineup / pitching / tactics / tryout / release / camp、mode: self / advice / delegate）。
     * ⚠ 変えた分野をまとめて1回で送る（`staffModeChanges`。1つ押すたびに保存しない）
     */
    fun staffModes(modes: Map<String, String>): JsonObject = buildJsonObject {
        putJsonObject("modes") { modes.forEach { (area, mode) -> put(area, mode) } }
    }

    /** 指導者の人事（キャンプの間だけ）。action: release / hire / swap */
    fun staff(action: String, role: String, other: String? = null, coachId: String? = null): JsonObject = buildJsonObject {
        put("action", action)
        put("role", role)
        if (other != null) put("other", other)
        if (coachId != null) put("coachId", coachId)
    }

    fun withReleases(plan: JsonObject, ids: Collection<Long>) = JsonObject(plan + ("releaseIds" to ids(ids)))
    fun withRanked(plan: JsonObject, ids: List<Long>) = JsonObject(plan + ("rankedIds" to ids(ids)))
    fun withCount(plan: JsonObject, count: Int) = JsonObject(plan + ("count" to JsonPrimitive(count)))
    fun withPack(plan: JsonObject, packId: String) = JsonObject(plan + ("packId" to JsonPrimitive(packId)))
}
