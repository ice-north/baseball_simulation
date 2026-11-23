package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlin.math.floor
import kotlin.math.min

// ============================================================
// 新しい見た目（試作）段3: 打席速報。試合の `plays`（サーバーの `inningPlaysOf`）を1打席ずつの場面にして、
// 実況の1行を作る。Web 版 `src/online/look/playByPlay.js` の写し。答え合わせは `LookTest`
// （期待値は mobile/tools/expect-look.mjs が書き出す）。文を変えたら両方を直し、期待値を書き出し直す。
//
// 行の形: [打者の番号, 記号, 点, アウト, 塁（その行の後）, 守備位置, 向き, 飛距離, 角度]。
// 5つ目からは版20で足したもの。前からある試合の行は4つまでなので、打席速報を出さない（`hasLivePlays`）。
// 打球の4つは打球が前へ飛んだ打席だけ、打席の外の行（「走」「刺」）は塁だけ。
// ============================================================

/** 守備位置の番号（1 投手 … 9 ライト）→ 実況の呼び方 */
val LOOK_FIELDERS = listOf("", "ピッチャー", "キャッチャー", "ファースト", "セカンド", "サード", "ショート", "レフト", "センター", "ライト")
private val BASE_NAMES = listOf("一", "二", "三")
private val HOMERS = listOf("", "ソロ", "ツーラン", "スリーラン", "満塁")
private val HIGHLIGHT_CODES = setOf("本", "三", "二", "併")
private val HIT_CODES = setOf("本", "三", "二", "安")
private val OUT_CODES = setOf("振", "犠", "併", "凡", "刺")

/** 打席速報の1場面。Web 版 `liveScenes` の1つ */
data class LiveScene(
    val inning: Int,
    /** "t" 表・"b" 裏 */
    val half: String,
    val team: String,
    /** "away" か "home" */
    val offense: String,
    val batterId: Long?,
    val batterName: String?,
    val code: String,
    val runs: Int,
    val outsBefore: Int,
    val outs: Int,
    /** その行の後の塁（一塁＝1・二塁＝2・三塁＝4 の和）。記録の無い行は null */
    val basesAfter: Int?,
    val batted: LookBatted?,
    val scoreBefore: Pair<Int, Int>,
    /** その打席の後の点（先攻, 後攻） */
    val score: Pair<Int, Int>,
    val phrase: String,
    val situation: String,
)

private fun JsonElement?.wholeOrNull(): Int? = num()?.takeIf { it.isFinite() && floor(it) == it }?.toInt()

/** 打席速報を出せる試合か（版20より前の試合は塁と打球の記録が無い） */
fun hasLivePlays(game: JsonElement?): Boolean =
    game.at("plays").obj()?.values?.any { rows -> rows.list().any { r -> (r as? JsonArray)?.let { it.size >= 5 } == true } } == true

/** 塁の並び（一塁＝1・二塁＝2・三塁＝4 の和）→ 「一・二塁」「満塁」 */
fun basesText(bases: Int): String {
    if (bases == 0) return "走者なし"
    if (bases == 7) return "満塁"
    return BASE_NAMES.filterIndexed { i, _ -> bases and (1 shl i) != 0 }.joinToString("・") + "塁"
}

private fun fieldOf(dir: Double) = when {
    dir < -11 -> "レフト"
    dir > 11 -> "ライト"
    else -> "センター"
}

private fun gapOf(dir: Double) = when {
    dir <= -26 -> "レフト線"
    dir < -8 -> "左中間"
    dir <= 8 -> "センター"
    dir < 26 -> "右中間"
    else -> "ライト線"
}

/** 実況の1行（「レフト前タイムリー！」）。Web 版 `playPhrase` */
fun playPhrase(code: String, runs: Int, batted: LookBatted?): String {
    val pos = batted?.let { LOOK_FIELDERS.getOrNull(it.pos) }.orEmpty()
    val timely = if (runs > 0) "タイムリー" else ""
    val bang = if (runs > 0) "！" else ""
    return when (code) {
        "本" -> "${batted?.let { "${fieldOf(it.dir)}スタンドへ" }.orEmpty()}${HOMERS.getOrNull(min(4, runs)).orEmpty()}ホームラン！"
        "三" -> "${batted?.let { "${gapOf(it.dir)}への" }.orEmpty()}${timely}三塁打$bang"
        "二" -> "${batted?.let { "${gapOf(it.dir)}への" }.orEmpty()}${timely}二塁打$bang"
        "安" ->
            if (batted != null && batted.pos <= 6) "${pos}への内野安打${if (runs > 0) "（${runs}点）" else ""}"
            else "${batted?.let { "${fieldOf(it.dir)}前" }.orEmpty()}${if (runs > 0) "タイムリー！" else "ヒット"}"
        "四" -> if (runs > 0) "押し出しの四球" else "四球を選ぶ"
        "死" -> if (runs > 0) "押し出しの死球" else "死球で出塁"
        "振" -> "三振"
        "犠" -> if (runs > 0) "スクイズ成功！" else "送りバント成功"
        "併" -> if (pos.isNotEmpty()) "${pos}ゴロ併殺打" else "併殺打"
        "失" -> "${if (pos.isNotEmpty()) "${pos}の" else ""}失策で出塁${if (runs > 0) "（${runs}点）" else ""}"
        "走" -> "走者が進んで${runs}点"
        "刺" -> "走者がアウト"
        else -> {
            if (batted == null) return "凡退"
            val kind = if (batted.la < 10) "ゴロ" else if (batted.la < 25) "ライナー" else "フライ"
            when {
                runs > 0 && kind == "フライ" -> "${pos}への犠牲フライ"
                runs > 0 -> "${pos}${kind}の間に${runs}点"
                else -> "$pos$kind"
            }
        }
    }
}

private fun situationText(s: LiveScene, short: (String) -> String, last: Boolean): String {
    if (s.runs > 0) {
        val mine = { p: Pair<Int, Int> -> if (s.offense == "home") p.second else p.first }
        val theirs = { p: Pair<Int, Int> -> if (s.offense == "home") p.first else p.second }
        val before = mine(s.scoreBefore) - theirs(s.scoreBefore)
        val after = mine(s.score) - theirs(s.score)
        // ⚠ 最後の打席で裏の球団が前に出たらサヨナラ。0-0 から点が入ったら先制
        val turn = when {
            last && s.offense == "home" && after > 0 -> "サヨナラ"
            s.scoreBefore == (0 to 0) -> "先制"
            before < 0 && after > 0 -> "逆転"
            before == 0 && after > 0 -> "勝ち越し"
            before < 0 && after == 0 -> "同点"
            else -> ""
        }
        return "${short(s.team)}が${s.runs}点${if (turn.isNotEmpty()) "、$turn" else ""}（${mine(s.score)}-${theirs(s.score)}）"
    }
    if (last) return "試合終了"
    if (s.outs >= 3) return "チェンジ"
    return "${s.outs}死${s.basesAfter?.let(::basesText).orEmpty()}"
}

/** 試合を1打席ずつの場面にする。Web 版 `liveScenes` */
fun liveScenes(game: JsonElement?, short: (String) -> String = { it }): List<LiveScene> {
    val plays = game.at("plays").obj() ?: return emptyList()
    val halves = plays.keys.mapNotNull { key ->
        val inning = key.takeWhile { it.isDigit() }.toIntOrNull() ?: return@mapNotNull null
        val half = key.takeLast(1)
        if (half != "t" && half != "b") null else Triple(key, inning, half)
    }.sortedWith(compareBy<Triple<String, Int, String>> { it.second }.thenBy { if (it.third == "t") 0 else 1 })
    val scenes = mutableListOf<LiveScene>()
    var away = 0
    var home = 0
    for ((key, inning, half) in halves) {
        val offense = if (half == "b") "home" else "away"
        val team = game.at(offense).str().orEmpty()
        val players = game.at("teams", team).list()
        var outs = 0
        for (raw in plays[key].list()) {
            val row = raw as? JsonArray ?: continue
            val cell = { i: Int -> row.getOrNull(i) }
            val index = cell(0).num()?.toInt()
            val code = cell(1).str().orEmpty()
            val runs = cell(2).num()?.toInt() ?: 0
            val before = away to home
            if (offense == "home") home += runs else away += runs
            val outsBefore = outs
            outs = min(3, outs + (cell(3).num()?.toInt() ?: 0))
            val player = index?.let { players.getOrNull(it) }
            val pos = cell(5).wholeOrNull()
            val batted = pos?.let { LookBatted(it, cell(6).num() ?: 0.0, cell(7).num() ?: 0.0, cell(8).num() ?: 0.0) }
            scenes += LiveScene(
                inning = inning,
                half = half,
                team = team,
                offense = offense,
                batterId = player?.at("id").num()?.toLong(),
                batterName = player?.let { it.at("name").str().orEmpty() },
                code = code,
                runs = runs,
                outsBefore = outsBefore,
                outs = outs,
                // 3つ目のアウトの後は走者なし
                basesAfter = if (outs >= 3) 0 else cell(4).wholeOrNull(),
                batted = batted,
                scoreBefore = before,
                score = away to home,
                phrase = playPhrase(code, runs, batted),
                situation = "",
            )
        }
    }
    return scenes.mapIndexed { i, s -> s.copy(situation = situationText(s, short, i == scenes.size - 1)) }
}

/**
 * 送りの並び（全部か見どころだけ。小さい順）での、いまの場面の位置。並びに無ければ、その前でいちばん近いもの。
 * 前に無ければ先頭。Web 版 `orderPosition`
 */
fun orderPosition(order: List<Int>, index: Int): Int = maxOf(0, order.indexOfLast { it <= index })

/** 見どころ（点が入った・長打・併殺）だけの場面の番号 */
fun highlightIndexes(scenes: List<LiveScene>): List<Int> =
    scenes.indices.filter { i -> scenes[i].let { it.runs > 0 || it.code in HIGHLIGHT_CODES } }

/**
 * 打席の色の種類（Web 版 `gamePlays.js` の `playTone`）。点が入った "score"・安打 "hit"・アウト "out"・そのほか "plain"。
 * ⚠ 四球・死球・失策は安打ではない
 */
fun playTone(code: String, runs: Int): String = when {
    runs > 0 -> "score"
    code in HIT_CODES -> "hit"
    code in OUT_CODES -> "out"
    else -> "plain"
}
