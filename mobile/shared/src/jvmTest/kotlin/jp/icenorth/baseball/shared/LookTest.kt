package jp.icenorth.baseball.shared

import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/** 新しい見た目（試作）の表・球団の見た目・描く手順が Web 版と同じか（期待値は mobile/tools/expect-look.mjs が書き出す） */
class LookTest {
    private val expected = OnlineJson.parseToJsonElement(
        LookTest::class.java.getResource("/look-expected.json")!!.readText(),
    ).jsonObject
    private val artJson = Json { explicitNulls = false }

    private fun lookOf(e: JsonElement?) = TeamLook(
        name = e.at("name").str() ?: "",
        c1 = e.at("c1").str()!!,
        c2 = e.at("c2").str()!!,
        c3 = e.at("c3").str()!!,
        style = e.at("style").str()!!,
        latin = (e.at("latin") as JsonPrimitive).booleanOrNull!!,
        mono = e.at("mono").str() ?: "",
        font = e.at("font").str()!!,
    )

    private fun labelsOf(e: JsonElement?): Map<String, TeamLabel> =
        OnlineJson.decodeFromJsonElement(MapSerializer(String.serializer(), TeamLabel.serializer()), e!!)

    /** JSON の形を比べる（数は値で、無い項目と null は同じ。絵の `c` は無いと false も同じ） */
    private fun same(want: JsonElement?, got: JsonElement?, where: String) {
        val w = want ?: JsonNull
        val g = got ?: JsonNull
        when {
            w is JsonObject || g is JsonObject -> {
                val wo = w as? JsonObject ?: fail("$where: 期待は ${w}、実際は ${g}")
                val go = g as? JsonObject ?: fail("$where: 期待は ${w}、実際は ${g}")
                for (k in wo.keys + go.keys) same(wo[k], go[k], "$where.$k")
            }
            w is JsonArray || g is JsonArray -> {
                val wa = w as? JsonArray ?: fail("$where: 期待は ${w}、実際は ${g}")
                val ga = g as? JsonArray ?: fail("$where: 期待は ${w}、実際は ${g}")
                assertEquals(wa.size, ga.size, "$where の数")
                for (i in wa.indices) same(wa[i], ga[i], "$where[$i]")
            }
            w is JsonNull || g is JsonNull -> {
                // 絵の `c`（丸い線の端）だけは、Web では無い・アプリでは false
                val off = { e: JsonElement -> e is JsonNull || (where.endsWith(".c") && (e as JsonPrimitive).booleanOrNull == false) }
                assertTrue(off(w) && off(g), "$where: 期待は ${w}、実際は ${g}")
            }
            else -> {
                val wp = w as JsonPrimitive
                val gp = g as JsonPrimitive
                if (wp.isString || gp.isString) assertEquals(wp.content, gp.content, where)
                else if (wp.booleanOrNull != null) assertEquals(wp.booleanOrNull, gp.booleanOrNull, where)
                else assertEquals(wp.doubleOrNull, gp.doubleOrNull, where)
            }
        }
    }

    private fun sameArt(want: JsonElement?, got: LookArt, where: String) =
        same(want, artJson.encodeToJsonElement(LookArt.serializer(), got), where)

    @Test
    fun tablesMatchWeb() {
        val t = expected.at("tables")
        assertEquals(t.at("cityEn").obj()!!.mapValues { it.value.str() }.toList(), CITY_EN.toList())
        assertEquals(t.at("nickEn").obj()!!.mapValues { it.value.str() }.toList(), NICK_EN.toList())
        assertEquals(t.at("palettes").list().map { p -> p.list().map { it.str() } }, LOOK_PALETTES)
        assertEquals(t.at("styles").list().map { it.str() }, LOOK_STYLES)
        // 所属の分からない人の帽子（顔の期待値は JSON の見た目から作るので、表そのものもここで比べる）
        assertEquals(lookOf(t.at("neutral")), NEUTRAL_LOOK)
    }

    @Test
    fun randomAndShadeMatchWeb() {
        for (c in expected.at("hashes").list()) assertEquals(c.at("h").long(), lookHash(c.at("s").str()!!), "hash(${c.at("s").str()})")
        for (c in expected.at("rngs").list()) {
            val r = LookRng(c.at("seed").long()!!)
            val got = c.at("out").list().map { r.next() }
            assertEquals(c.at("out").list().map { (it as JsonPrimitive).doubleOrNull }, got, "rng(${c.at("seed")})")
        }
        for (c in expected.at("shades").list()) {
            val k = (c.at("k") as JsonPrimitive).doubleOrNull!!
            assertEquals(c.at("out").str(), lookShade(c.at("hex").str()!!, k), "shade(${c.at("hex").str()}, $k)")
        }
    }

    @Test
    fun teamLooksMatchWeb() {
        val leagues = expected.at("teams").list()
        assertEquals(12, leagues.size)
        for (league in leagues) {
            val got = buildTeamLooks(labelsOf(league.at("labels")))
            val want = league.at("looks").obj()!!
            assertEquals(want.keys, got.keys, "種${league.at("seed")}")
            for ((name, w) in want) assertEquals(lookOf(w), got[name], "種${league.at("seed")}: $name")
        }
        for (c in expected.at("sources").list()) {
            val name = c.at("name").str()!!
            val label = OnlineJson.decodeFromJsonElement(TeamLabel.serializer(), c.at("labels")!!)
            val s = c.at("source")
            assertEquals(
                LookNameSource((s.at("latin") as JsonPrimitive).booleanOrNull!!, s.at("city").str()!!, s.at("nick").str()!!),
                lookNameSource(name, label),
                name,
            )
        }
    }

    @Test
    fun artMatchesWeb() {
        val emblems = expected.at("emblems").list()
        assertTrue(emblems.size >= 10)
        for (c in emblems) {
            val look = lookOf(c.at("look"))
            sameArt(c.at("art"), emblemArt(look), "マーク ${look.name}（${look.style}）")
        }
        val faces = expected.at("faces").list()
        assertEquals(60, faces.size)
        for (c in faces) {
            val seed = c.at("seed").str()!!
            val level = c.at("level").int()
            sameArt(c.at("art"), faceArt(seed, lookOf(c.at("look")), c.at("age").int()!!, level), "顔 $seed（調子$level）")
        }
        for (c in expected.at("conditions").list()) {
            val level = c.at("level").int()
            sameArt(c.at("art"), conditionArt(level), "調子の顔 $level")
        }
    }

    private fun battedOf(e: JsonElement?): LookBatted? =
        e.obj()?.let { LookBatted(it.at("pos").int()!!, it.at("dir").num()!!, it.at("dist").num()!!, it.at("la").num()!!) }

    @Test
    fun stage3ArtMatchesWeb() {
        val s3 = expected.at("stage3")
        for (c in s3.at("crowds").list()) {
            val got = crowdLevel(c.at("rank").int(), c.at("teams").int(), c.at("streak").int()!!)
            assertEquals(c.at("out").num(), got, "客の入り ${c.at("rank")} ${c.at("teams")} ${c.at("streak")}")
        }
        for (c in s3.at("scenes").list()) assertEquals(c.at("scene").str(), stadiumScene(c.at("city").str()), "景色 ${c.at("city")}")
        val stadiums = s3.at("stadiums").list()
        assertEquals(2, stadiums.size)
        for (c in stadiums) {
            val look = lookOf(c.at("look"))
            val art = stadiumArt(look, c.at("scene").str()!!, c.at("crowd").num()!!, c.at("seed").str()!!)
            sameArt(c.at("art"), art, "球場 ${look.name}（${c.at("scene").str()}）")
        }
        val fence = lookOf(s3.at("fieldLooks", "fence"))
        val offense = lookOf(s3.at("fieldLooks", "offense"))
        for (c in s3.at("fields").list()) {
            val art = fieldArt(fence, offense, c.at("bases").int()!!, battedOf(c.at("batted")), c.at("code").str()!!, c.at("runs").int()!!)
            sameArt(c.at("art"), art, "打席速報の図 ${c.at("code").str()} 塁${c.at("bases")}")
        }
    }

    @Test
    fun livePlaysMatchWeb() {
        val s3 = expected.at("stage3")
        for (c in s3.at("phrases").list()) {
            val code = c.at("code").str()!!
            assertEquals(c.at("out").str(), playPhrase(code, c.at("runs").int()!!, battedOf(c.at("batted"))), "実況 $code ${c.at("runs")} ${c.at("batted")}")
        }
        assertEquals(s3.at("bases").list().map { it.str() }, (0..7).map(::basesText))
        val games = s3.at("live").list()
        assertEquals(3, games.size)
        for ((g, c) in games.withIndex()) {
            val game = c.at("game")
            val scenes = liveScenes(game) { it.take(2) }
            assertEquals((c.at("ready") as JsonPrimitive).booleanOrNull, hasLivePlays(game), "試合$g の打席速報")
            assertEquals(c.at("highlights").list().map { it.int() }, highlightIndexes(scenes), "試合$g の見どころ")
            val want = c.at("scenes").list()
            assertEquals(want.size, scenes.size, "試合$g の場面の数")
            for ((i, s) in scenes.withIndex()) {
                val got = buildJsonObject {
                    put("inning", s.inning); put("half", s.half); put("team", s.team); put("offense", s.offense)
                    put("batterId", s.batterId); put("batterName", s.batterName); put("code", s.code); put("runs", s.runs)
                    put("outsBefore", s.outsBefore); put("outs", s.outs); put("bases", s.bases); put("basesAfter", s.basesAfter)
                    put("batted", s.batted?.let { b -> buildJsonObject { put("pos", b.pos); put("dir", b.dir); put("dist", b.dist); put("la", b.la) } } ?: JsonNull)
                    put("scoreBefore", JsonArray(listOf(JsonPrimitive(s.scoreBefore.first), JsonPrimitive(s.scoreBefore.second))))
                    put("score", JsonArray(listOf(JsonPrimitive(s.score.first), JsonPrimitive(s.score.second))))
                    put("phrase", s.phrase); put("situation", s.situation)
                }
                // ⚠ Web の場面の記号は行に無ければ undefined（JSON に出ない）、アプリは空の字
                val w = want[i].obj()!!.let { o -> if (o["code"] == null) JsonObject(o + ("code" to JsonPrimitive(""))) else o }
                same(w, got, "試合$g の場面$i")
            }
        }
    }

    @Test
    fun todayGameMatchesWeb() {
        val s3 = expected.at("stage3")
        val base = s3.at("todayView").obj()!!
        val cases = s3.at("today").list()
        assertTrue(cases.size >= 10)
        for ((i, c) in cases.withIndex()) {
            val view = OnlineJson.decodeFromJsonElement(LeagueView.serializer(), JsonObject(base + c.at("patch").obj()!!))
            val card = todayGameCard(view)
            val want = c.at("card")
            if (want is JsonNull || want == null) {
                assertEquals(null, card, "札$i")
                continue
            }
            assertTrue(card != null, "札$i が出ない")
            fun side(s: TodaySide) = buildJsonObject {
                put("team", s.team); put("record", s.record); put("rank", s.rank); put("teams", s.teams)
                put(
                    "starter",
                    s.starter?.let { p ->
                        buildJsonObject {
                            put("id", p.id); put("name", p.name); put("age", p.age); put("condition", p.condition)
                            put("mark", p.mark); put("line", p.line)
                        }
                    } ?: JsonNull,
                )
            }
            val got = buildJsonObject {
                put("title", card.title); put("when", card.whenText); put("place", card.place); put("home", card.home)
                put("city", card.city); put("crowd", card.crowd); put("note", card.note)
                put("own", side(card.own)); put("foe", side(card.foe))
            }
            same(want, got, "札$i ${c.at("patch")}")
        }
    }

    @Test
    fun storyMatchesWeb() {
        val s4 = expected.at("stage4")
        for (c in s4.at("reporters").list()) {
            val team = c.at("team").str()!!
            val labels = if (c.obj()!!.containsKey("labels")) emptyMap() else labelsOf(expected.at("stage3", "todayView", "teamLabels"))
            val r = c.at("reporter")
            assertEquals(Reporter(r.at("seed").str()!!, r.at("name").str()!!, r.at("age").int()!!, r.at("title").str()!!), reporterOf(team, labels), "番記者 $team")
        }
        val faces = s4.at("reporterFaces").list()
        assertEquals(8, faces.size)
        for (c in faces) {
            val seed = c.at("seed").str()!!
            val art = faceArt(seed, lookOf(c.at("look")), c.at("age").int()!!, c.at("level").int(), suit = true)
            sameArt(c.at("art"), art, "番記者の顔 $seed")
        }
        val base = s4.at("storyView").obj()!!
        val stories = s4.at("stories").list()
        assertTrue(stories.size >= 10)
        for ((i, c) in stories.withIndex()) {
            val view = OnlineJson.decodeFromJsonElement(LeagueView.serializer(), JsonObject(base + c.at("patch").obj()!!))
            assertEquals(c.at("chat").list().map { it.str() }, reporterChat(view), "ひとこと$i ${c.at("patch")}")
            val scene = eventScene(view)
            val want = c.at("scene")
            if (want == null || want is JsonNull) {
                assertEquals(null, scene, "場面$i")
                continue
            }
            assertTrue(scene != null, "場面$i が出ない")
            val got = buildJsonObject {
                put("key", scene.key); put("kind", scene.kind); put("good", scene.good); put("title", scene.title)
                put("heading", scene.heading); put("line", scene.line)
                put(
                    "speaker",
                    buildJsonObject {
                        val p = scene.speaker
                        put("kind", p.kind); put("id", p.id); put("seed", p.seed); put("name", p.name); put("label", p.label); put("age", p.age)
                    },
                )
                put(
                    "star",
                    scene.star?.let { p -> buildJsonObject { put("id", p.id); put("name", p.name); put("age", p.age); put("condition", p.condition) } } ?: JsonNull,
                )
            }
            same(want, got, "場面$i ${c.at("patch")}")
        }
    }
}
