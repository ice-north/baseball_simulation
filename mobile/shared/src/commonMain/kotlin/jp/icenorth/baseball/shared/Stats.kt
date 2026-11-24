package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlin.math.floor
import kotlin.math.roundToInt

/**
 * 選手成績の表の列。区分と列の表（[BATTING_GROUPS]・[PITCHING_GROUPS]）は Web 版 src/online/statsView.js の
 * STAT_GROUPS から Tables.kt に書き出す（mobile/tools/gen-tables.mjs）。ここには型と値の引き方だけを置く。
 * 値は生の選手 JSON（ビューの roster / team の roster）から引く。
 * ⚠ 値が Web 版と同じかは expect-stats.mjs の答え（stats-expected.json）を StatsWebTest が比べる。
 */
enum class StatFormat { Count, Rate, Decimal, Percent, Innings, Condition, Ability, Velocity, Stamina }

data class StatColumn(
    val id: String,
    val label: String,
    val format: StatFormat = StatFormat.Count,
    val ascending: Boolean = false,
    val get: (JsonObject) -> Double?,
)

data class StatGroup(val id: String, val label: String, val columns: List<StatColumn>)

private fun Double?.known(): Double? = this?.takeIf { it.isFinite() && it >= 0 }

/** 今季の記録（`seasonStats.<category>.<key>`）。0以上の数だけ */
internal fun statRaw(category: String, key: String): (JsonObject) -> Double? = { it.at("seasonStats", category, key).num().known() }
/** サーバーが計算した指標（`performance.<category>.metrics.<key>`） */
internal fun statMetric(category: String, key: String): (JsonObject) -> Double? = { it.at("performance", category, "metrics", key).num().known() }
/** 捕手の成績（マスクをかぶった時の投手成績。サーバーの `catcherStats`） */
internal fun statCaught(key: String): (JsonObject) -> Double? = { it.at("catcherStats", key).num().known() }
/** 選手の項目そのもの（能力 `batting.meet`・疲労 `fatigue` など） */
internal fun statField(vararg path: String): (JsonObject) -> Double? = { it.at(*path).num().known() }

/**
 * 2つ以上の項目を組み合わせる列（Web 版 statsView.js の同じ id の列の式）。
 * ⚠ gen-tables.mjs は1つの項目だけを読む列しか引き方を書けないので、それ以外はここに同じ id で置く。
 *    無い id を書き出すと組めなくなる（気づける）。
 */
internal object StatComputed {
    val slg: (JsonObject) -> Double? = {
        val a = statMetric("batting", "avg")(it); val i = statMetric("batting", "iso")(it)
        if (a != null && i != null) a + i else null
    }
    val ops: (JsonObject) -> Double? = {
        val a = statMetric("batting", "avg")(it); val i = statMetric("batting", "iso")(it); val o = statMetric("batting", "obp")(it)
        if (a != null && i != null && o != null) o + a + i else null
    }
    val whip: (JsonObject) -> Double? = {
        val h = statRaw("pitching", "hits")(it); val w = statRaw("pitching", "walks")(it); val ip = statRaw("pitching", "inningsPitched")(it)
        if (h != null && w != null && ip != null && ip > 0) (h + w) * 3 / ip else null
    }
    val kbb: (JsonObject) -> Double? = {
        val k = statRaw("pitching", "strikeouts")(it); val w = statRaw("pitching", "walks")(it)
        when { k == null || w == null -> null; w > 0 -> k / w; k > 0 -> Double.POSITIVE_INFINITY; else -> null }
    }
    val fieldRate: (JsonObject) -> Double? = {
        val c = statRaw("batting", "fieldingChances")(it); val e = statRaw("batting", "errors")(it)
        if (c != null && e != null && c > 0 && e <= c) (c - e) / c else null
    }
    val condition: (JsonObject) -> Double? = { it.at("condition").num()?.takeIf { v -> v in 0.0..4.0 } }
}

private fun b(key: String, label: String, asc: Boolean = false) = StatColumn(key, label, ascending = asc, get = statRaw("batting", key))
private fun p(key: String, label: String, asc: Boolean = false) = StatColumn(key, label, ascending = asc, get = statRaw("pitching", key))
private fun ability(area: String, key: String, label: String, format: StatFormat = StatFormat.Ability) =
    StatColumn("$area:$key", label, format, get = statField(area, key))

private val avg = StatColumn("avg", "打率", StatFormat.Rate, get = statMetric("batting", "avg"))
private val era = StatColumn("era", "防御率", StatFormat.Decimal, ascending = true, get = statMetric("pitching", "era"))

private fun columnOf(batting: Boolean, id: String): StatColumn? =
    (if (batting) BATTING_GROUPS else PITCHING_GROUPS).flatMap { it.columns }.firstOrNull { it.id == id }

/** 主要成績一覧（Web 版 overviewGroup。列は Tables.kt の OVERVIEW_*_IDS）。⚠ 見出しはアプリの短い「主要」 */
fun overviewGroup(batting: Boolean): StatGroup {
    val ids = if (batting) OVERVIEW_BATTING_IDS else OVERVIEW_PITCHING_IDS
    return StatGroup("overview", "主要", ids.mapNotNull { columnOf(batting, it) })
}

/**
 * 能力の一覧（アプリだけ。スタメン・トレードの行と同じ並び・同じ1字の見出し）。
 * ⚠ 以前は「打撃能力」「守備能力」が区分の並びの最後にあり、球団の能力をまとめて見る場所が見つけにくかった（いしだ 2026-11-13）
 */
fun abilityOverview(batting: Boolean): StatGroup = if (batting) {
    StatGroup(
        "abilityAll", "能力",
        listOf(
            ability("batting", "meet", "ミ"), ability("batting", "power", "パ"), ability("batting", "eye", "眼"),
            ability("physical", "speed", "走"), ability("fielding", "defense", "守"), ability("physical", "arm", "肩"),
        ),
    )
} else {
    StatGroup(
        "abilityAll", "能力",
        listOf(
            ability("pitching", "velocity", "速", StatFormat.Velocity), ability("pitching", "control", "制"),
            ability("pitching", "stamina", "ス", StatFormat.Stamina), ability("pitching", "spinRate", "回転"),
        ),
    )
}

/** 既定の並び（出場量の多い順。Web 版 defaultSort。列は Tables.kt の DEFAULT_SORT_*） */
fun defaultSortColumn(batting: Boolean): StatColumn =
    columnOf(batting, if (batting) DEFAULT_SORT_BATTING else DEFAULT_SORT_PITCHING)!!

private fun fixed(value: Double, digits: Int): String {
    var factor = 1.0
    repeat(digits) { factor *= 10 }
    val n = (value * factor).roundToInt()
    val whole = n / factor.toInt()
    val frac = (n % factor.toInt()).toString().padStart(digits, '0')
    return if (digits == 0) "$n" else "$whole.$frac"
}

/** 表の文字。能力は数値（色は画面でランクから付ける） */
fun formatStat(column: StatColumn, value: Double?): String = formatStat(column.format, value)

/**
 * 成績の数字の書式（率は .312、小数は 3.45、件数は整数。無い・負は「—」、無限は「∞」）。
 * ⚠ 画面ごとに丸めを書かない（以前は通算の画面が別に書いていた）。Web 版 `statsView.js` の `formatStat`
 */
fun formatStat(format: StatFormat, value: Double?): String {
    if (value == null || value.isNaN()) return "—"
    if (value == Double.POSITIVE_INFINITY) return "∞"
    if (value < 0) return "—"
    return when (format) {
        StatFormat.Condition -> CONDITION_TEXT.getOrNull(value.toInt()) ?: "—"
        StatFormat.Innings -> "${floor(value / 3).toInt()}.${value.toInt() % 3}"
        StatFormat.Rate -> fixed(value, 3).let { if (it.startsWith("0.")) it.substring(1) else it }
        StatFormat.Decimal -> fixed(value, 2)
        StatFormat.Percent -> fixed(value * 100, 1).removeSuffix(".0") + "%"
        else -> fixed(value, 0)
    }
}

/** サーバーの書式の名前（通算ランキングの `format`: rate / decimal / count）を [StatFormat] に */
fun statFormatOf(name: String?): StatFormat = when (name) {
    "rate" -> StatFormat.Rate
    "decimal" -> StatFormat.Decimal
    else -> StatFormat.Count
}

/** 能力の列ならランク（色付け用） */
fun statRank(column: StatColumn, value: Double?): Char? {
    value ?: return null
    return when (column.format) {
        StatFormat.Ability -> abilityRank(value.toInt())
        StatFormat.Velocity -> abilityRank(value.toInt(), velocity = true)
        StatFormat.Stamina -> abilityRank(value.toInt(), stamina = true)
        else -> null
    }
}

/** 並べ替え。値の無い選手は常に末尾、同じ値は元の順（Web 版 sortedRoster） */
fun sortRoster(players: List<JsonObject>, column: StatColumn?, ascending: Boolean): List<JsonObject> {
    column ?: return players
    return players.withIndex().sortedWith { a, b ->
        val va = column.get(a.value); val vb = column.get(b.value)
        when {
            va == null && vb == null -> a.index - b.index
            va == null -> 1
            vb == null -> -1
            else -> {
                val c = va.compareTo(vb)
                (if (ascending) c else -c).takeIf { it != 0 } ?: (a.index - b.index)
            }
        }
    }.map { it.value }
}

/** 今季の成績の1行（契約更改・トライアウトの選手行に添える）。Web 版の `seasonLine` と同じ文 */
fun seasonLine(player: JsonObject): String {
    if (player.at("position").str() == "pitcher") {
        val games = player.at("seasonStats", "pitching", "games").num()?.toInt() ?: 0
        if (games == 0) return "今季 登板なし"
        val outs = player.at("seasonStats", "pitching", "inningsPitched").num().known()?.toInt()
        val era = player.at("performance", "pitching", "metrics", "era").num().known()
        val innings = outs?.let { "${it / 3}.${it % 3}" } ?: "—"
        val eraText = era?.let { fixed(it, 2) } ?: "—"
        return "今季 ${games}登板 ${innings}回 防御率$eraText"
    }
    val games = player.at("seasonStats", "batting", "games").num()?.toInt() ?: 0
    if (games == 0) return "今季 出場なし"
    val avg = player.at("performance", "batting", "metrics", "avg").num().known()
    val hr = player.at("seasonStats", "batting", "homeruns").num()?.toInt() ?: 0
    val avgText = avg?.let { fixed(it, 3).let { t -> if (t.startsWith("0.")) t.substring(1) else t } } ?: "—"
    return "今季 ${games}試合 打率$avgText ${hr}本"
}

private val CONTRACT_GROUP_ORDER = listOf("pitcher", "catcher", "infielder", "outfielder")

/**
 * 契約更改の表の並べ方（Web 版 `contractTable.js` の `sortContractRoster` と同じ）。
 * 列が無ければ守備位置の順（投・捕・内・外、同じ区分は名簿の順）。列があればその値で（無い値は末尾、同じ値は名簿の順）
 */
fun sortContractRoster(roster: List<JsonObject>, column: StatColumn?, ascending: Boolean): List<JsonObject> =
    if (column == null) roster.sortedBy { CONTRACT_GROUP_ORDER.indexOf(rosterGroup(it.at("position").str())) }
    else sortRoster(roster, column, ascending)

private val HANDED = mapOf("left" to "左", "right" to "右", "switch" to "両")

/** 投げ・打ち（「右投左打」）。分からない側は「—」（Web 版 `contractTable.js` の `handed`。右と決めつけない） */
fun handLabel(player: JsonObject): String =
    "${HANDED[player.at("physical", "throws").str()] ?: "—"}投${HANDED[player.at("batting", "bats").str()] ?: "—"}打"

/**
 * 契約更改の表の列（1人1行。Web 版 `src/online/contractTable.js` の `contractColumns` と同じ並び）。
 * ⚠ 先方指摘「名前・投打・年齢・各パラメータ・成績と網羅的に表示し、各能力値ごとにソートできるように」。
 * ⚠ 投手の打撃・野手の投球の能力は「—」（二刀流は両方）。捕手リードは捕手だけ。並べ替えでは「—」が末尾。
 */
fun contractColumns(): List<StatColumn> {
    fun pitches(p: JsonObject) = p.isPitcherJson() || p.at("isTwoWay").bool() == true
    fun bats(p: JsonObject) = !p.isPitcherJson() || p.at("isTwoWay").bool() == true
    fun only(column: StatColumn, test: (JsonObject) -> Boolean) = column.copy(get = { if (test(it)) column.get(it) else null })
    val bestPitch = StatColumn("pitch", "変", get = { p ->
        p.at("pitching", "arsenal").list().mapNotNull { it.obj() }
            .filter { it.at("type").str() != "straight" }
            .mapNotNull { it.at("level").num() }
            .maxOrNull()
    }, format = StatFormat.Ability)
    return listOf(
        StatColumn("age", "齢", ascending = true, get = { it.at("age").num() }),
        only(ability("batting", "meet", "ミ"), ::bats),
        only(ability("batting", "power", "パ"), ::bats),
        only(ability("batting", "eye", "眼"), ::bats),
        only(ability("physical", "speed", "走"), ::bats),
        only(ability("fielding", "defense", "守"), ::bats),
        only(ability("physical", "arm", "肩"), ::bats),
        only(ability("catching", "lead", "リ")) { it.at("position").str() == "catcher" },
        only(ability("pitching", "velocity", "速", StatFormat.Velocity), ::pitches),
        only(ability("pitching", "control", "制"), ::pitches),
        only(ability("pitching", "stamina", "ス", StatFormat.Stamina), ::pitches),
        only(ability("pitching", "spinRate", "回"), ::pitches),
        only(bestPitch, ::pitches),
        ability("physical", "bodyStamina", "体"),
        ability("personality", "mental", "精"),
        StatColumn("games", "試", get = { p -> (if (p.isPitcherJson()) p.at("seasonStats", "pitching", "games") else p.at("seasonStats", "batting", "games")).num() ?: 0.0 }),
        only(avg.copy(label = "率")) { !it.isPitcherJson() },
        only(b("homeruns", "本")) { !it.isPitcherJson() },
        only(b("rbis", "点")) { !it.isPitcherJson() },
        only(era.copy(label = "防")) { it.isPitcherJson() },
        // ⚠ 投手は成績が無ければ0（Web 版の `?? 0`。登板の無い投手が「—」で並べ替えの末尾に回らない）
        only(p("wins", "勝").let { c -> c.copy(get = { c.get(it) ?: 0.0 }) }) { it.isPitcherJson() },
        only(p("saves", "S").let { c -> c.copy(get = { c.get(it) ?: 0.0 }) }) { it.isPitcherJson() },
    )
}
