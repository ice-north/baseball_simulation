package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject

/**
 * 投手×捕手の組み合わせ（選手シート）。サーバーの期間の `battery`（server/recordedViews.mjs `batteryFor`）。
 * Web 版 src/online/BatteryStats.jsx と同じ数字・同じ文言（online-stats-view-check が照合する）。
 * ⚠ このゲームに「相性」の仕組みは無い。回数が少ない組は運の差が大きいので薄く出す。
 */
const val BATTERY_MIN_OUTS: Int = 90

val BATTERY_NOTE: String = "${BATTERY_MIN_OUTS / 3}回未満の組は薄く出しています。回数が少ないうちは運の差が大きく出ます。読まれ率は、打者に狙い球を当てられた球の割合で、低いほどリードが効いています。"

data class BatteryLine(
    val key: String,
    val name: String,
    val outs: Int,
    val era: Double?,
    val k9: Double?,
    val bb9: Double?,
    val avg: Double?,
    val readRate: Double?,
    val starts: Int,
    val few: Boolean,
)

data class Battery(val caught: BatteryLine?, val pitchers: List<BatteryLine>, val catchers: List<BatteryLine>)

private fun line(o: JsonObject?): BatteryLine? {
    o ?: return null
    val outs = o.at("outs").num()?.toInt() ?: return null
    return BatteryLine(
        key = o.at("key").str().orEmpty(),
        name = o.at("name").str().orEmpty(),
        outs = outs,
        era = o.at("era").num(),
        k9 = o.at("k9").num(),
        bb9 = o.at("bb9").num(),
        avg = o.at("avg").num(),
        readRate = o.at("readRate").num(),
        starts = o.at("starts").num()?.toInt() ?: 0,
        few = o.at("few").bool() == true,
    )
}

/** 期間（`periods` の1つ）の組み合わせ。無ければ null */
fun batteryOf(period: JsonObject): Battery? {
    val b = period.at("battery").obj() ?: return null
    val rows = { k: String -> b.at(k).list().mapNotNull { line(it.obj()) } }
    return Battery(line(b.at("caught").obj()), rows("pitchers"), rows("catchers"))
}

private val decimal = StatColumn("", "", StatFormat.Decimal) { null }
private val rate = StatColumn("", "", StatFormat.Rate) { null }
private val percent = StatColumn("", "", StatFormat.Percent) { null }
private val inningsColumn = StatColumn("", "", StatFormat.Innings) { null }

fun batteryInnings(outs: Int): String = formatStat(inningsColumn, outs.toDouble())
fun batteryDecimal(v: Double?): String = formatStat(decimal, v)
fun batteryRate(v: Double?): String = formatStat(rate, v)
fun batteryPercent(v: Double?): String = formatStat(percent, v)
