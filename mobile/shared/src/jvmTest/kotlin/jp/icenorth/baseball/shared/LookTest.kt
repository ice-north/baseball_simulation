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
}
