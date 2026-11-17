package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlin.math.floor
import kotlin.math.roundToInt

/**
 * 選手成績の表の列。Web 版 src/online/statsView.js の STAT_GROUPS と同じ並び・同じ計算。
 * 値は生の選手 JSON（ビューの roster / team の roster）から引く。
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

private fun raw(category: String, key: String): (JsonObject) -> Double? = { it.at("seasonStats", category, key).num().known() }
private fun metric(category: String, key: String): (JsonObject) -> Double? = { it.at("performance", category, "metrics", key).num().known() }

private fun b(key: String, label: String, asc: Boolean = false) = StatColumn(key, label, ascending = asc, get = raw("batting", key))
private fun p(key: String, label: String, asc: Boolean = false) = StatColumn(key, label, ascending = asc, get = raw("pitching", key))
private fun ability(area: String, key: String, label: String, format: StatFormat = StatFormat.Ability) =
    StatColumn("$area:$key", label, format, get = { it.at(area, key).num().known() })

private val avg = StatColumn("avg", "打率", StatFormat.Rate, get = metric("batting", "avg"))
private val pa = StatColumn("pa", "打席", get = metric("batting", "pa"))
private val obp = StatColumn("obp", "出塁率", StatFormat.Rate, get = metric("batting", "obp"))
private val slg = StatColumn("slg", "長打率", StatFormat.Rate, get = {
    val a = metric("batting", "avg")(it); val i = metric("batting", "iso")(it)
    if (a != null && i != null) a + i else null
})
private val ops = StatColumn("ops", "OPS", StatFormat.Rate, get = {
    val a = metric("batting", "avg")(it); val i = metric("batting", "iso")(it); val o = metric("batting", "obp")(it)
    if (a != null && i != null && o != null) o + a + i else null
})
private val iso = StatColumn("iso", "ISO", StatFormat.Rate, get = metric("batting", "iso"))
private val outs = StatColumn("outs", "投球回", StatFormat.Innings, get = raw("pitching", "inningsPitched"))
private val era = StatColumn("era", "防御率", StatFormat.Decimal, ascending = true, get = metric("pitching", "era"))
private val k9 = StatColumn("k9", "K/9", StatFormat.Decimal, get = metric("pitching", "k9"))
private val bb9 = StatColumn("bb9", "BB/9", StatFormat.Decimal, ascending = true, get = metric("pitching", "bb9"))
private val hr9 = StatColumn("hr9", "被本/9", StatFormat.Decimal, ascending = true, get = metric("pitching", "hr9"))
private val whip = StatColumn("whip", "WHIP", StatFormat.Decimal, ascending = true, get = {
    val h = raw("pitching", "hits")(it); val w = raw("pitching", "walks")(it); val ip = raw("pitching", "inningsPitched")(it)
    if (h != null && w != null && ip != null && ip > 0) (h + w) * 3 / ip else null
})
private val kbb = StatColumn("kbb", "K/BB", StatFormat.Decimal, get = {
    val k = raw("pitching", "strikeouts")(it); val w = raw("pitching", "walks")(it)
    when { k == null || w == null -> null; w > 0 -> k / w; k > 0 -> Double.POSITIVE_INFINITY; else -> null }
})

// 捕手の成績（マスクをかぶった時の投手成績。サーバーの `catcherStats`）。Web 版 statsView.js の caught と同じ
private fun caught(key: String): (JsonObject) -> Double? = { it.at("catcherStats", key).num().known() }

private fun status(batting: Boolean) = StatGroup(
    "state", "調子・疲労",
    listOf(
        StatColumn("condition", "調子", StatFormat.Condition, get = { it.at("condition").num()?.takeIf { v -> v in 0.0..4.0 } }),
        StatColumn("fatigue", "疲労", ascending = true, get = { it.at("fatigue").num().known() }),
        StatColumn("age", "年齢", get = { it.at("age").num().known() }),
        if (batting) ability("physical", "speed", "走力") else ability("pitching", "velocity", "球速", StatFormat.Velocity),
    ),
)

val BATTING_GROUPS: List<StatGroup> = listOf(
    StatGroup("basic", "基本", listOf(avg, b("homeruns", "本塁打"), b("rbis", "打点"), b("stolenBases", "盗塁"))),
    StatGroup("appearances", "出場・安打", listOf(b("games", "試合"), pa, b("atBats", "打数"), b("hits", "安打"))),
    StatGroup("extra", "長打", listOf(b("doubles", "二塁打"), b("triples", "三塁打"), b("homeruns", "本塁打"), slg)),
    StatGroup("discipline", "四死球・犠打", listOf(b("walks", "四球"), b("hitByPitch", "死球"), b("strikeouts", "三振", true), b("sacrificeBunts", "犠打"))),
    StatGroup("sacrifices", "犠打飛・守備補助", listOf(b("sacrificeBunts", "犠打"), b("sacrificeFlies", "犠飛"), b("hitByPitch", "死球"), b("assists", "捕殺"))),
    StatGroup(
        "running", "走塁",
        listOf(
            b("stolenBases", "盗塁"), b("caughtStealing", "盗塁死", true),
            StatColumn("stealRate", "成功率", StatFormat.Percent, get = metric("batting", "stealRate")),
            StatColumn("stealAttempts", "企図", get = metric("batting", "stealAttempts")),
        ),
    ),
    StatGroup("sabers", "打撃指標", listOf(ops, obp, slg, iso)),
    StatGroup(
        "rates", "打席率",
        listOf(
            StatColumn("kRate", "K%", StatFormat.Percent, true, metric("batting", "kRate")),
            StatColumn("bbRate", "BB%", StatFormat.Percent, get = metric("batting", "bbRate")),
            StatColumn("hrRate", "本塁打率", StatFormat.Percent, get = metric("batting", "hrRate")),
            ops,
        ),
    ),
    StatGroup(
        "fielding", "守備",
        listOf(
            b("fieldingChances", "機会"), b("errors", "失策", true),
            StatColumn("fieldRate", "守備率", StatFormat.Rate, get = {
                val c = raw("batting", "fieldingChances")(it); val e = raw("batting", "errors")(it)
                if (c != null && e != null && c > 0 && e <= c) (c - e) / c else null
            }),
            b("games", "試合"),
        ),
    ),
    StatGroup(
        "catching", "捕手",
        listOf(
            StatColumn("caughtOuts", "守備回", StatFormat.Innings, get = caught("outs")),
            StatColumn("catcherEra", "防御率", StatFormat.Decimal, ascending = true, get = caught("era")),
            StatColumn("readRate", "読まれ率", StatFormat.Percent, ascending = true, get = caught("readRate")),
            StatColumn("catcherStarts", "先発", get = caught("starts")),
        ),
    ),
    StatGroup(
        "catchingAllowed", "捕手・被打撃",
        listOf(
            StatColumn("catcherK9", "K/9", StatFormat.Decimal, get = caught("k9")),
            StatColumn("catcherBb9", "BB/9", StatFormat.Decimal, ascending = true, get = caught("bb9")),
            StatColumn("catcherAvg", "被打率", StatFormat.Rate, ascending = true, get = caught("avg")),
            ability("catching", "lead", "リード"),
        ),
    ),
    status(true),
    StatGroup("abilities", "打撃能力", listOf(ability("batting", "meet", "ミート"), ability("batting", "power", "パワー"), ability("batting", "eye", "選球眼"), ability("physical", "speed", "走力"))),
    StatGroup("defense", "守備能力", listOf(ability("fielding", "defense", "守備"), ability("physical", "arm", "肩力"), ability("catching", "lead", "リード"), ability("physical", "recovery", "回復"))),
)

val PITCHING_GROUPS: List<StatGroup> = listOf(
    StatGroup("basic", "基本", listOf(era, outs, p("strikeouts", "奪三振"), p("walks", "四球", true))),
    StatGroup("record", "登板・勝敗", listOf(p("games", "登板"), p("wins", "勝利"), p("losses", "敗戦", true), p("saves", "セーブ"))),
    StatGroup("usage", "先発・対戦打者", listOf(p("gamesStarted", "先発"), p("battersFaced", "対戦打者"), p("hitBatters", "死球", true), p("wildPitches", "暴投", true))),
    StatGroup("relief", "救援", listOf(p("holds", "ホールド"), p("saves", "セーブ"), outs, p("pitches", "投球数"))),
    StatGroup("allowed", "被打撃・失点", listOf(p("hits", "被安打", true), p("homeruns", "被本塁打", true), p("runsAllowed", "失点", true), p("earnedRuns", "自責点", true))),
    StatGroup("quality", "先発・球数", listOf(p("qualityStarts", "QS"), p("highQualityStarts", "HQS"), p("pitches", "投球数"), outs)),
    StatGroup("sabers", "投球指標", listOf(whip, kbb, k9, bb9)),
    StatGroup("rates", "9回換算", listOf(k9, bb9, hr9, era)),
    status(false),
    StatGroup(
        "abilities", "投球能力",
        listOf(
            ability("pitching", "velocity", "球速", StatFormat.Velocity), ability("pitching", "control", "制球"),
            ability("pitching", "stamina", "スタミナ", StatFormat.Stamina), ability("pitching", "spinRate", "回転"),
        ),
    ),
)

/** 主要成績一覧（Web 版 overviewGroup） */
fun overviewGroup(batting: Boolean): StatGroup {
    val ids = if (batting) {
        listOf("games", "pa", "avg", "homeruns", "rbis", "stolenBases", "obp", "slg", "ops", "strikeouts", "walks", "sacrificeBunts")
    } else {
        listOf("games", "era", "wins", "losses", "saves", "holds", "outs", "strikeouts", "walks", "k9", "bb9", "whip")
    }
    val all = (if (batting) BATTING_GROUPS else PITCHING_GROUPS).flatMap { it.columns }
    return StatGroup("overview", "主要", ids.mapNotNull { id -> all.firstOrNull { it.id == id } })
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

/** 既定の並び（出場量の多い順。Web 版 defaultSort） */
fun defaultSortColumn(batting: Boolean): StatColumn = if (batting) pa else outs

val CONDITION_TEXT = listOf("絶不調", "不調", "普通", "好調", "絶好調")

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
