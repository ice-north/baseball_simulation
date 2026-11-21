package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** 写した計算が Web 版と同じ答えを出すか（期待値は mobile/tools/expect-logic.mjs が書き出す） */
class LogicTest {
    private fun resource(name: String) = OnlineJson.parseToJsonElement(
        LogicTest::class.java.getResource("/$name")!!.readText(),
    ).jsonObject

    private val view = resource("view-running.json")
    private val expected = resource("logic-expected.json")
    private val roster = view.at("roster").list().map { it as JsonObject }

    @Test
    fun campMatchesWeb() {
        for (direction in listOf("sharpen", "balanced", "patch")) for (phase in listOf("physique", "skill")) for (p in roster) {
            val want = expected.at("camp", "$direction:$phase:${p.pid}").list().map { it.str() }
            val t = resolveTraining(p, direction, phase)
            val tone = describeMood(p, direction, phase).tone.name.lowercase()
            assertEquals(want, listOf(clampMenu(t.main, p), clampSub(t.sub, p), tone), "$direction:$phase:${p.at("name").str()}")
        }
        for (p in roster) {
            val w = playerWish(p)
            assertEquals(expected.at("wish", "${p.pid}", "direction").str(), w.direction)
            assertEquals(expected.at("wish", "${p.pid}", "phase").str(), w.phase)
            val r = recommendedPolicy(p)
            assertEquals(expected.at("recommended", "${p.pid}", "direction").str(), r.direction)
            assertEquals(expected.at("recommended", "${p.pid}", "phase").str(), r.phase)
        }
    }

    @Test
    fun tryoutMatchesWeb() {
        val candidates = roster.drop(12)
        val have = roster.take(12)
        val ids = { key: String -> expected.at("tryout", key).list().map { it.long() } }
        val ranked = weightedRanked(candidates, DEFAULT_WEIGHTS, have)
        assertEquals(ids("ranked"), ranked)
        assertEquals(ids("picks"), plannedPicks(ranked, candidates, 6, have).map { it.pid })
        assertEquals(ids("added"), addToPlan(ranked.take(5), ranked.last()))
        assertEquals(ids("removed"), removeFromPlan(ranked, ranked.first()))
        assertEquals(ids("shifted"), shiftInPlan(ranked, 2, -1))
        assertEquals(ids("moved"), moveInPlan(ranked, ranked.last(), 0))
        // 獲得する人数（無ければ空き枠いっぱい・範囲に収める）と、交渉から取りにいく人数
        val totals = listOf(
            signTotal(JsonObject(emptyMap()), 7),
            signTotal(JsonObject(mapOf("total" to JsonPrimitive(3))), 7),
            signTotal(JsonObject(mapOf("total" to JsonPrimitive(20))), 7),
            signTotal(JsonObject(mapOf("total" to JsonPrimitive(-1))), 7),
            // 決めていなければ標準の人数まで（上限の枠より少ない）
            signTotal(JsonObject(emptyMap()), 7, 5),
            signTotal(JsonObject(mapOf("total" to JsonPrimitive(6))), 7, 5),
            wishedCount(ranked, 4),
        )
        assertEquals(expected.at("tryout", "totals").list().map { it.int() }, totals)
        // 最低限に足りない人数（画面の「獲得後の名簿」）。Web 版 tryoutPlan.js の minimumShort
        val pitchersOnly = roster.filter { it.at("position").str() == "pitcher" }.take(3)
        val noCatcher = roster.filter { it.at("position").str() != "pitcher" && it.at("position").str() != "catcher" }.take(9)
        val shorts = listOf(minimumShort(pitchersOnly, emptyList()), minimumShort(noCatcher, emptyList()), minimumShort(roster, emptyList()))
        assertEquals(expected.at("tryout", "shorts").list().map { it.int() }, shorts)
        val summary = planSummary(ranked, candidates, 6, have)
        assertEquals(expected.at("tryout", "warnings").list().map { it.str() }, summary.warnings)
        // 注意は獲得したあとの名簿で数える（投手がそろっている／投手が3人だけ）
        val cases = expected.at("tryout", "warningCases").list().map { c -> c.list().map { it.str() } }
        val full = planSummary(weightedRanked(candidates, DEFAULT_WEIGHTS, have), candidates, candidates.size, have)
        assertEquals(cases[0], full.warnings)
        val own = roster.take(3)
        val pool = roster.drop(11)
        val few = planSummary(weightedRanked(pool, DEFAULT_WEIGHTS, own), pool, pool.size, own)
        assertEquals(cases[1], few.warnings)
    }

    @Test
    fun planKeepsSavedSettings() {
        val typed = OnlineJson.decodeFromString<LeagueView>(view.toString())
        val draft = PlanDraft.from(typed.lineup!!, typed.roster)
        val payload = draft.toPayload()
        // 保存済みの役割・方針はそのまま送り返す
        typed.lineup!!["pitcherRoles"].obj()?.forEach { (id, role) ->
            assertEquals(role.str(), payload.at("pitcherRoles", id).str())
        }
        typed.lineup!!["strategy"].obj()?.forEach { (k, v) -> assertEquals(v.str(), payload.at("strategy", k).str()) }
        STRATEGY_FIELDS.forEach { f -> assertNotNull(payload.at("strategy", f.key).str()) }
        assertEquals(typed.lineup, payload.at("baseLineup"))
        // 編集→元に戻す→やり直す
        var history = EditHistory(draft)
        history = history.push(draft.swapBatters(0, 3))
        history = history.push(history.present.withStrategy("batting", "aggressive"))
        assertTrue(history.canUndo)
        assertEquals(draft.swapBatters(0, 3), history.undo().present)
        assertEquals("aggressive", history.undo().redo().present.strategy["batting"])
        assertTrue(history.undo().undo().present.sameEdit(draft))
        // 自動采配は既定のままなら送らない、変えたら全項目を送る
        if (typed.lineup!!["tactics"] == null) {
            assertEquals(null, payload["tactics"])
            val changed = draft.withTactic("starterLimit", "100").toPayload()
            assertEquals(100, changed.at("tactics", "starterLimit").int())
            assertEquals("auto", changed.at("tactics", "hook").str())
        }
    }

    /**
     * 救援の同じ役割の中の順番（いしだ 2026-11-20。PC の投手起用の▲▼と同じ）。Web 版 pitchingEdit.js の
     * reliefOrderOf・moveRelief・reliefGroups の写しが同じ答えを出し、保存で `pitcherOrder` が送られるか
     */
    @Test
    fun reliefOrderMatchesWeb() {
        val want = expected.at("relief").obj()!!
        val ids = { e: kotlinx.serialization.json.JsonElement? -> e.list().map { it.long()!! } }
        val groups = { e: kotlinx.serialization.json.JsonElement? -> e.list().map { g -> g.list().let { it[0].str() to it[1].list().map { id -> id.long()!! } } } }
        val typed = OnlineJson.decodeFromString<LeagueView>(view.toString())
        val players = typed.roster
        val lineup = JsonObject(typed.lineup!! + mapOf("pitcherRoles" to want.at("roles")!!, "pitcherOrder" to want.at("saved")!!))
        // 保存に順番が無ければ名簿の並び（今までの順）
        assertEquals(ids(want.at("plainOrder")), PlanDraft.from(typed.lineup!!, players).pitching.order)
        val draft = PlanDraft.from(lineup, players)
        assertEquals(ids(want.at("startOrder")), draft.pitching.order)
        val asIds = { s: PitchingState -> s.reliefGroups(players).map { (role, list) -> role to list.map { it.id } } }
        assertEquals(groups(want.at("startGroups")), asIds(draft.pitching))
        var state = draft.pitching
        want.at("steps").list().forEachIndexed { i, step ->
            val id = step.at("id").long()!!; val delta = step.at("delta").int()!!
            val can = state.canMoveRelief(id, delta)
            val next = state.moveRelief(id, delta, players)
            // ▲▼を押せる＝動く（端・1人だけの役割では押せない）
            assertEquals(can, next != state, "step $i canMove")
            state = next
            assertEquals(ids(step.at("order")), state.order, "step $i order")
            assertEquals(groups(step.at("groups")), asIds(state), "step $i groups")
        }
        val tidy = want.at("tidy").list()
        val four = players.take(4).map { it.id }
        assertEquals(ids(tidy[0]), reliefOrderOf(null, four))
        assertEquals(ids(tidy[1]), reliefOrderOf(listOf(four[3], 5L, four[1]), four))
        // 役割を変えても順番は落ちない（`copy` で引き継ぐ）
        assertEquals(state.order, state.setRole(state.order.first { it !in state.starters }, "mopup").order)
        // 保存: 順番を持っていない球団で並べ替えなければ送らない（画面へ返す形を増やさない）。
        // 並べ替えたら送る。元から持っていれば、そのまま送り返す
        val plain = PlanDraft.from(typed.lineup!!, players)
        assertEquals(null, plain.toPayload()["pitcherOrder"])
        assertEquals(null, plain.withPitching(plain.pitching.setRole(want.at("roles").obj()!!.keys.first().toLong(), "long")).toPayload()["pitcherOrder"])
        val moved = draft.withPitching(state)
        assertEquals(state.order, ids(moved.toPayload()["pitcherOrder"]))
        assertEquals(ids(want.at("startOrder")), ids(draft.toPayload()["pitcherOrder"]))
        assertTrue(!moved.sameEdit(draft))
    }

    @Test
    fun restPlanMatchesWeb() {
        // 期待値と同じ場面（expect-logic.mjs の restCase）
        val typed = OnlineJson.decodeFromString<LeagueView>(view.toString())
        val order = typed.lineup!!.at("battingOrder").list().map { it as JsonObject }
        val field = order.filter { it.at("position").str() != "pitcher" }
        val inOrder = order.map { it.at("playerId").long() }.toSet()
        val bench = typed.roster.filter { it.id !in inOrder }
        fun case(levels: List<Int>, leaving: Long? = null): RestPlan.Result? = RestPlan.plan(
            field.mapIndexed { i, e ->
                val p = typed.roster.first { it.id == e.at("playerId").long() }
                RestPlan.Starter(p.copy(fatigue = levels[i]), e.at("position").str()!!)
            },
            bench,
            leaving,
        )
        val cases = mutableListOf<List<Int>>()
        for (i in field.indices) cases += field.indices.map { if (it == i) 100 else 0 }
        for (i in field.indices) for (j in i + 1 until field.size) cases += field.indices.map { if (it == i) 100 else if (it == j) 130 else 0 }
        cases += field.map { 90 }
        fun compare(name: String, want: List<kotlinx.serialization.json.JsonElement>, got: List<RestPlan.Result?>) {
            assertEquals(want.size, got.size, name)
            got.forEachIndexed { n, g ->
                val w = want[n]
                if (w is kotlinx.serialization.json.JsonNull) {
                    assertEquals(null, g, "$name 場面$n")
                    return@forEachIndexed
                }
                assertNotNull(g, "$name 場面$n")
                assertEquals(w.at("resting").list().map { it.long() }, g.resting, "$name 場面$n 休む人")
                val assign = (w.at("assign") as JsonObject).mapKeys { it.key.toLong() }.mapValues { it.value.str() }
                assertEquals(assign, g.assign, "$name 場面$n 守備")
            }
        }
        compare("restPlans", expected.at("restPlans").list(), cases.map { case(it) })
        // 二刀流の先発の日（i 番目の野手が先発として抜け、j 番目が疲労100）
        val twoWay = mutableListOf<RestPlan.Result?>()
        for (i in field.indices) for (j in field.indices) if (i != j)
            twoWay += case(field.indices.map { if (it == j) 100 else 0 }, field[i].at("playerId").long())
        compare("restPlansTwoWay", expected.at("restPlansTwoWay").list(), twoWay)
    }
}
