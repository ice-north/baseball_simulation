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
}
