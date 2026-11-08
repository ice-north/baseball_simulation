package jp.icenorth.baseball.shared

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * 選手の期間ごとの成績の読み方。形はサーバーの action=team の名簿（server/projection.mjs の projectTeamInfo:
 * `periods` に今季・対人通算・過去の年）。Web 版 src/online/CareerStats.jsx と同じ読み方になっていること
 */
class PlayerPeriodsTest {
    private fun obj(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject

    // 2年目の途中: 今季と対人通算（2シーズン、今季は途中なので partial）
    private val veteran = obj(
        """{"id":101,"name":"山田","position":"short","seasonStats":{"batting":{"hits":5}},
        "periods":[
          {"id":"current","label":"今季","seasonStats":{"batting":{"hits":5}}},
          {"id":"career","label":"対人通算","partial":true,"years":2,"seasonStats":{"batting":{"hits":40}},"performance":{"batting":{"metrics":{"avg":0.3}}}},
          {"id":"legacy-career","label":"通算（既存記録）","seasonStats":{"batting":{"hits":400}}}
        ],"publicOnly":true}""",
    )

    // 今季の新人: 対人通算の期間が無い
    private val rookie = obj("""{"id":102,"name":"佐藤","position":"pitcher","periods":[{"id":"current","label":"今季"}]}""")

    @Test
    fun careerComesFromThePeriodsList() {
        val career = careerOf(veteran)
        assertEquals("対人通算", career?.at("label").str())
        assertNull(careerOf(rookie), "記録が1年も無い選手に通算は無い")
    }

    @Test
    fun careerRosterMovesTheCareerNumbersIntoTheTableShape() {
        val rows = careerRoster(listOf(veteran, rookie))
        assertEquals(listOf("山田"), rows.map { it.at("name").str() }, "記録の無い選手は出さない")
        val row = rows.single()
        // 表は seasonStats / performance を読む。今季の 5 ではなく通算の 40
        assertEquals(40, row.at("seasonStats", "batting", "hits").int())
        assertEquals(0.3, row.at("performance", "batting", "metrics", "avg").num())
        // 画面の「通算Nシーズン」「記録の無い試合の分は入っていません」が読む
        assertEquals(2, row.at("career", "years").int())
        assertEquals(true, row.at("career", "partial").bool())
        // 名簿のほかの項目はそのまま
        assertEquals("short", row.at("position").str())
    }

    @Test
    fun theOldCareerFieldIsNotRead() {
        // ⚠ サーバーは `career` の項目を外して `periods` にまとめた。古い形だけの選手は通算に出さない
        val old = obj("""{"id":103,"name":"鈴木","career":{"years":1,"seasonStats":{"batting":{"hits":9}}}}""")
        assertEquals(emptyList(), careerRoster(listOf(old)))
    }

    @Test
    fun onlyOwnPlayersReadTheDetailWindow() {
        // サーバーの action=player は自球団しか返さない（他球団・トレード相手・候補は 404）
        val own = obj("""{"id":201,"name":"自軍","detailAvailable":true}""")
        assertEquals(true, detailReadable(own))
        assertEquals(false, detailReadable(veteran), "他球団の名簿（publicOnly）は読まない")
        assertEquals(false, detailReadable(obj("""{"id":"t-9","name":"候補"}""")), "トライアウト候補は読まない")
        // 自球団の名簿から写した形（印が落ちている）でも、ビューの名簿に居れば読む
        val copied = obj("""{"id":201,"name":"自軍"}""")
        assertEquals(true, detailReadable(copied, listOf(own)))
        assertEquals(false, detailReadable(copied, listOf(obj("""{"id":201,"name":"自軍"}"""))), "印の無い名簿では読まない")
    }

    @Test
    fun otherPlayersUseThePeriodsTheTeamReadCarried() {
        assertEquals(listOf("current", "career", "legacy-career"), localPeriods(veteran).map { it.at("id").str() })
        // 期間が無ければ名簿の今季の数字だけ
        val listed = obj("""{"id":301,"name":"高橋","seasonStats":{"batting":{"hits":7}},"performance":{"batting":{}},"publicSource":"既存の今季記録"}""")
        val only = localPeriods(listed).single()
        assertEquals("今季", only.at("label").str())
        assertEquals(7, only.at("seasonStats", "batting", "hits").int())
        assertEquals("既存の今季記録", only.at("source").str())
        // 数字が何も無い（トライアウト候補など）
        assertEquals(emptyList(), localPeriods(obj("""{"id":"t-9","name":"候補"}""")))
    }
}
