package jp.icenorth.baseball.shared

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * 作りたてのリーグで、アプリが送る指示を最初から通す（初期メンバー選択 → キャンプ4クール →
 * 開幕 → 編成の保存 → 試合を進める → 読むだけの窓口 → トレード → 名前の変更）。
 *
 * `ONLINE_FLOW_ENDPOINT=http://127.0.0.1:3002/` のときだけ動く。**空のデータで起動した**
 * 開発サーバーに繋ぐこと（`ONLINE_DISABLE_TIMER=1 ONLINE_DATA_FILE=/tmp/x.json.gz node server/dev.mjs`）。
 */
class LocalFlowTest {
    private fun JsonObject.roster() = at("roster").list().mapNotNull { it.obj() }

    @Test
    fun playsThroughOnLocalServer() = runBlocking {
        val endpoint = System.getenv("ONLINE_FLOW_ENDPOINT") ?: return@runBlocking
        val api = OnlineApi(endpoint)
        val auth = api.localLogin("player1")
        suspend fun raw() = OnlineJson.parseToJsonElement(api.viewRaw(auth)) as JsonObject
        suspend fun send(type: String, payload: JsonObject? = null) = api.command(auth, raw().at("revision").int() ?: 0, type, payload)

        if (raw().at("setupRequired").bool() == true) send("create")
        send("testmode", OnlineJson.parseToJsonElement("""{"on":true}""") as JsonObject)

        suspend fun runPhases() {
            var guard = 0
            while (raw().at("status").str() != "running" && guard++ < 20) {
                val view = raw()
                val phase = view["phase"].obj() ?: break
                val phaseId = phase.at("id").str()!!
                val kind = phase.at("kind").str()
                println("手続き: $kind")
                if (kind == "camp") {
                    val roster = view.roster()
                    val done = phase.at("camp", "rounds").int() ?: 0
                    val total = phase.at("camp", "total").int() ?: CAMP_ROUNDS
                    for (round in done + 1..total) {
                        val main = roster.associate { it.pid to clampMenu(resolveTraining(it, "sharpen", "skill").main, it) }
                        val sub = roster.associate { it.pid to clampSub(resolveTraining(it, "sharpen", "skill").sub, it) }
                        send("campRound", Commands.campRound(round, "team", "sharpen", "skill", emptyMap(), main, sub))
                    }
                    assertEquals(total, raw().at("phase", "camp", "rounds").int() ?: total)
                } else {
                    val defaults = api.read(auth, "defaults")
                    assertEquals(phaseId, defaults.at("phaseId").str())
                    var plan = defaults["plan"].obj()!!
                    // トライアウト・初期編成は、アプリと同じ計算で希望順を作り直して出す
                    if (plan["rankedIds"] != null) {
                        val candidates = phase.at("candidates").list().mapNotNull { it.obj() }
                        plan = Commands.withRanked(plan, weightedRanked(candidates, DEFAULT_WEIGHTS, view.roster()))
                    }
                    if (plan["packId"] != null) {
                        val packs = phase.at("packs").list().mapNotNull { it.obj() }
                        plan = Commands.withPack(plan, packs.last().at("id").str()!!)
                    }
                    // 下書き → 決定（baseSubmission は下書きの提出）
                    send("submit", Commands.submit(phaseId, plan, false, null))
                    send("submit", Commands.submit(phaseId, plan, true, Commands.submitted(plan, false)))
                    assertEquals(true, raw().at("phase", "submission", "ready").bool() ?: true)
                }
                if (raw()["phase"].obj()?.at("id").str() == phaseId) send("resolve")
            }
}
        runPhases()
        assertEquals("running", raw().at("status").str())

        // 編成: 投手の役割・方針・自動采配を変えて保存し、読み直して残っているか
        val typed = api.view(auth)
        var draft = PlanDraft.from(typed.lineup!!, typed.roster)
        val reliever = typed.roster.first { it.isPitcher && it.id !in draft.pitching.starters }
        draft = draft.withPitching(draft.pitching.setRole(reliever.id, "closer"))
            .withStrategy("batting", "aggressive").withTactic("starterLimit", "100").moveBatter(0, 2)
        assertEquals(null, draft.problem())
        send("lineup", draft.toPayload())
        val saved = PlanDraft.from(api.view(auth).lineup!!, typed.roster)
        assertTrue(saved.sameEdit(draft), "保存した編成が読み直しで一致しない")

        send("step", OnlineJson.parseToJsonElement("""{"turns":2}""") as JsonObject)
        val view = raw()
        val games = api.read(auth, "games", mapOf("scope" to "league"))
        val first = games.at("games").list().first()
        val game = api.read(auth, "game", mapOf("id" to first.at("gameId").long().toString(), "year" to games.at("year").int().toString()))
        assertTrue(game.at("teams").obj()!!.isNotEmpty())
        val me = view.at("teamName").str()!!
        val other = view.at("teamNames").list().mapNotNull { it.str() }.first { it != me }
        val theirs = api.read(auth, "team", mapOf("team" to other)).roster()
        assertTrue(theirs.isNotEmpty())
        val player = api.read(auth, "player", mapOf("id" to view.roster().first().pid.toString()))
        assertTrue(player.at("periods").list().isNotEmpty())

        // トレード: CPU はその場で答える（受ける・逆提案・断る）。断られたら理由つきで 409
        val give = view.roster().filter { it.isPitcherJson() }.minBy { overallScore(it) }.pid
        val get = theirs.filter { it.isPitcherJson() }.minBy { overallScore(it) }.pid
        assertEquals(emptyList(), dealProblems(view.roster(), theirs, setOf(give), setOf(get)))
        val outcome = runCatching { send("tradeOffer", Commands.tradeOffer(other, listOf(give), listOf(get))) }
        println("トレード: " + (outcome.getOrNull()?.toString() ?: outcome.exceptionOrNull()?.message))
        outcome.exceptionOrNull()?.let { assertTrue(it is OnlineException && it.status == 409, "想定外の失敗: $it") }
        raw().at("trades").list().mapNotNull { it.obj() }.firstOrNull { it.at("myTurn").bool() == true }?.let { t ->
            send("tradeRespond", Commands.tradeRespond(t.at("id").str()!!, "reject", mine = t.at("mine").bool() == true))
        }

        send("profile", Commands.profile("アプリ検証球団", "アプリ"))
        assertNotNull(raw().at("members").list().firstOrNull { it.at("displayName").str() == "アプリ検証球団" })

        // シーズンの終わりまで進め、契約更改・トライアウト・年度更新・次のキャンプも同じ形で通す
        if (System.getenv("ONLINE_FLOW_FULL") == "1") {
            val year = raw().at("year").int()
            // シーズン後もストーブリーグの間は「進行中」で、土曜ごとに手続きが来る
            var loops = 0
            while ((raw().at("year").int() ?: 0) <= (year ?: 0) && loops++ < 40) {
                if (raw().at("status").str() == "running") send("step", OnlineJson.parseToJsonElement("""{"turns":24}""") as JsonObject)
                else runPhases()
            }
            assertTrue((raw().at("year").int() ?: 0) > (year ?: 0), "次の年度に進んでいない")
        }
    }
}
