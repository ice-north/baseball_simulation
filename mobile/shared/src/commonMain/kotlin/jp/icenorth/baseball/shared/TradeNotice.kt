package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject

/** ビューの `trades`（自分が関わる提案の一覧） */
private fun tradesOf(raw: JsonObject?): List<JsonObject> = raw?.at("trades").list().mapNotNull { it.obj() }

/** 一覧にある提案の id */
fun tradeIds(raw: JsonObject?): Set<String> = tradesOf(raw).mapNotNull { it.at("id").str() }.toSet()

/**
 * 届いた提案（自分の番のもの）の印。逆提案が返ってきたときは別の印にして、もう一度知らせる。
 * 知らせたかどうかは端末に覚える（開き直すたびに知らせない）。
 */
private fun noticeKey(trade: JsonObject): String? =
    trade.at("id").str()?.let { "$it:${if (trade.at("countered").bool() == true) "c" else "o"}" }

fun tradeNoticeKeys(raw: JsonObject?): Set<String> =
    tradesOf(raw).filter { it.at("myTurn").bool() == true }.mapNotNull(::noticeKey).toSet()

/** 届いた提案のうち、まだ知らせていないもの */
fun unseenTrades(raw: JsonObject?, seen: Set<String>): List<JsonObject> =
    tradesOf(raw).filter { it.at("myTurn").bool() == true && noticeKey(it) !in seen }

enum class OfferOutcome { Accepted, Countered, Offered }

/**
 * 提案を送ったあとの結果を、送る前の提案の id（[before]）と送ったあとのビューから読み取る。
 * CPU球団はその場で答える: 受けたら記録が残らない（選手が動いただけ）、逆提案なら自分の番の記録が残る。
 * 断ったときはサーバーが失敗で返すので、ここには来ない。参加者の球団へは記録が残って相手の番。
 */
fun offerOutcome(before: Set<String>, raw: JsonObject?): OfferOutcome {
    val added = tradesOf(raw).firstOrNull { it.at("id").str() !in before } ?: return OfferOutcome.Accepted
    return if (added.at("countered").bool() == true) OfferOutcome.Countered else OfferOutcome.Offered
}
