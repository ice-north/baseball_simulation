package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TradeNoticeTest {
    private data class T(val id: String, val myTurn: Boolean, val countered: Boolean = false)

    private fun view(vararg trades: T): JsonObject = buildJsonObject {
        putJsonArray("trades") {
            trades.forEach { t -> addJsonObject { put("id", t.id); put("myTurn", t.myTurn); put("countered", t.countered) } }
        }
    }

    @Test
    fun noticesOnlyTradesWaitingForMeAndNotSeenYet() {
        val raw = view(T("trade-1", myTurn = true), T("trade-2", myTurn = false))
        assertEquals(setOf("trade-1:o"), tradeNoticeKeys(raw), "相手の番の提案は知らせない")
        assertEquals(listOf("trade-1"), unseenTrades(raw, emptySet()).map { it.at("id").str() })
        assertTrue(unseenTrades(raw, tradeNoticeKeys(raw)).isEmpty(), "一度知らせたら出さない")
        // 自分の出した提案に逆提案が返ってきたら、同じ id でもまた知らせる
        val countered = view(T("trade-2", myTurn = true, countered = true))
        assertEquals(1, unseenTrades(countered, setOf("trade-1:o")).size)
        assertTrue(unseenTrades(null, emptySet()).isEmpty())
    }

    @Test
    fun readsWhatHappenedToAnOffer() {
        val before = tradeIds(view(T("trade-1", myTurn = true)))
        // CPU球団が受けた: 記録は残らない（前からある提案は数えない）
        assertEquals(OfferOutcome.Accepted, offerOutcome(before, view(T("trade-1", myTurn = true))))
        // CPU球団が逆提案した: 新しい記録が自分の番で残る
        assertEquals(OfferOutcome.Countered, offerOutcome(before, view(T("trade-1", myTurn = true), T("trade-2", myTurn = true, countered = true))))
        // 参加者の球団へ: 新しい記録が相手の番で残る
        assertEquals(OfferOutcome.Offered, offerOutcome(before, view(T("trade-1", myTurn = true), T("trade-3", myTurn = false))))
    }
}
