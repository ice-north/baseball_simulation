package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject

/*
 * 先方5項目（2026-11-20）のアプリ側の計算。画面（androidApp の TeamAnalysisScreen.kt・LeagueHistoryScreen.kt・
 * 球団史の折れ線）から使う。どれも PC の写し:
 *   - チーム能力値のレーダー … src/online/TeamAnalysis.jsx（値はサーバーの `teamRatings`。src/online/teamRatings.js）
 *   - 守備範囲 … src/utils/defenseRange.js
 *   - 球団の歩みの縦の位置 … src/online/teamHistory.js
 *   - ゲーム差（すぐ上の球団との差）… src/online/standingsGap.js
 *   - 過去の順位 … src/online/LeagueHistory.jsx の yearTables
 * ⚠ 見せるだけ。強さには効かない
 */

/** レーダーの軸（並び順＝時計回り。src/online/teamRatings.js の RATING_AXES と同じ） */
data class RatingAxis(val key: String, val label: String)

val RATING_AXES: List<RatingAxis> = listOf(
    RatingAxis("starters", "先発投手力"),
    RatingAxis("relief", "リリーフ投手力"),
    RatingAxis("offense", "攻撃力"),
    RatingAxis("defense", "守備力"),
    RatingAxis("speed", "機動性"),
    RatingAxis("bench", "控え戦力"),
)

/** 図のいちばん内側（リーグでいちばん低い球団の位置。PC の INNER と同じ） */
const val RADAR_INNER: Double = 0.15

/** 1球団のチーム能力値（ビューの `teamRatings[球団]`）。無ければ null */
fun teamRatingsOf(raw: JsonObject?, team: String?): Map<String, Int?>? {
    val r = raw?.at("teamRatings", team ?: return null).obj() ?: return null
    return RATING_AXES.associate { it.key to r.at(it.key).num()?.toInt() }
}

/** 全球団のチーム能力値 */
fun allTeamRatings(raw: JsonObject?): Map<String, Map<String, Int?>> =
    raw?.at("teamRatings").obj().orEmpty().keys.mapNotNull { team -> teamRatingsOf(raw, team)?.let { team to it } }.toMap()

/** 同じ部の球団（部が分からない古いビューは全球団） */
fun rivalsOf(view: LeagueView, raw: JsonObject?, team: String): List<String> {
    val names = raw?.at("teamNames").list().mapNotNull { it.str() }.ifEmpty { view.standings.map { it.team } }
    val id = view.teamLeagues[team] ?: return names
    return names.filter { view.teamLeagues[it] == id }
}

/** 部の中の順位（[better] が true なら大きいほど上）。値が無ければ null */
fun rankIn(values: List<Double?>, own: Double?, better: Boolean = true): Int? {
    val list = values.filterNotNull()
    if (own == null || list.isEmpty()) return null
    return list.count { if (better) it > own else it < own } + 1
}

/** 項目ごとのリーグの最低と最高（図の目盛り） */
fun ratingScales(all: Collection<Map<String, Int?>>): Map<String, Pair<Int, Int>> =
    RATING_AXES.associate { a ->
        val list = all.mapNotNull { it[a.key] }
        a.key to if (list.isEmpty()) (0 to 100) else (list.min() to list.max())
    }

/** 図の半径の割合（0〜1。リーグでいちばん低い球団が [RADAR_INNER]、いちばん高い球団が 1） */
fun radarFraction(scales: Map<String, Pair<Int, Int>>, key: String, v: Int?): Double {
    if (v == null) return 0.0
    val (lo, hi) = scales[key] ?: (0 to 100)
    val f = if (hi > lo) (v.coerceIn(lo, hi) - lo).toDouble() / (hi - lo) else 0.5
    return RADAR_INNER + (1 - RADAR_INNER) * f
}

/**
 * JS の Math.round と同じ丸め（.5 は +∞ 側。-2.5 → -2）。
 * ⚠ kotlin.math.round は .5 を偶数へ丸める（2.5 → 2）ので、PC の Math.round と1ずれる（2026-11-20 監査）
 */
fun jsRound(x: Double): Int = kotlin.math.floor(x + 0.5).toInt()

/** 部の平均（項目ごと。PC と同じく Math.round で丸める） */
fun ratingAverage(all: Collection<Map<String, Int?>>): Map<String, Int?> =
    RATING_AXES.associate { a ->
        val list = all.mapNotNull { it[a.key] }
        a.key to if (list.isEmpty()) null else jsRound(list.average())
    }

// ------------------------------------------------------------
// 守備範囲（src/utils/defenseRange.js の写し）
// ------------------------------------------------------------

/** 守備範囲のランク（高い順）。色は PC の守備図と同じ */
data class DefenseGrade(val min: Double, val label: String, val color: Long)

val DEFENSE_GRADES: List<DefenseGrade> = listOf(
    DefenseGrade(0.9, "S", 0xFFEC4899),
    DefenseGrade(0.82, "A", 0xFFF87171),
    DefenseGrade(0.7, "B", 0xFFFB923C),
    DefenseGrade(0.55, "C", 0xFFFACC15),
    DefenseGrade(0.42, "D", 0xFF4ADE80),
    DefenseGrade(0.3, "E", 0xFF60A5FA),
    DefenseGrade(Double.NEGATIVE_INFINITY, "F", 0xFF94A3B8),
)

fun defenseGrade(range: Double): DefenseGrade = DEFENSE_GRADES.first { range >= it.min }

/** 守備適性（本職は100、ほかは適性の値、無ければ0。src/online/lineupEdit.js の positionFitness と同じ） */
fun fitnessAt(player: JsonObject, pos: String): Int =
    if (player.at("position").str() == pos) 100 else player.at("positionFitness", pos).num()?.toInt() ?: 0

/** 守備力・走力・肩を位置ごとの重みで足し、適性で割り引く（0〜1。適性100→そのまま、0→半分） */
fun defenseRange(player: JsonObject, pos: String, fitness: Int = fitnessAt(player, pos)): Double {
    // ⚠ PC は `|| 50`（0 も 50 として扱う）。同じにする
    fun v(x: Double?): Double = x?.takeIf { it != 0.0 } ?: 50.0
    val def = v(player.at("fielding", "defense").num())
    val spd = v(player.at("physical", "speed").num())
    val arm = v(player.at("physical", "arm").num())
    val mult = 0.5 + (fitness / 100.0) * 0.5
    val raw = when (pos) {
        "left", "center", "right" -> (def * 0.3 + spd * 0.5 + arm * 0.2) / 100
        "second", "short" -> (def * 0.4 + spd * 0.3 + arm * 0.3) / 100
        "catcher" -> (def * 0.5 + arm * 0.5) / 100
        else -> (def * 0.5 + spd * 0.25 + arm * 0.25) / 100
    }
    return raw * mult
}

/** 守備分析の並び（捕・一・二・三・遊・左・中・右。打順より守備の穴を探しやすい） */
val DEFENSE_POSITION_ORDER: List<String> = listOf("catcher", "first", "second", "third", "short", "left", "center", "right")

// ------------------------------------------------------------
// 球団の歩み（折れ線）。縦軸はリーグ全体の中の位置（1部1位＝1 … 2部6位＝12）
// ------------------------------------------------------------

/** 1部・2部のそれぞれの球団の数 */
const val TEAMS_PER_LEAGUE: Int = 6

/** 折れ線の1点（[current] は今季の途中） */
data class HistoryPoint(
    val year: Int,
    val league: String?,
    val rank: Int?,
    val slot: Int,
    val wins: Int?,
    val losses: Int?,
    val draws: Int?,
    val champion: Boolean,
    val move: String?,
    val current: Boolean = false,
) {
    /** 点の上に出す短い印（優勝・昇格・降格）。全部の点に数字は付けない（PC の markOf と同じ） */
    val mark: String?
        get() = if (current) "今季" else listOfNotNull(if (rank == 1) "${league}優勝" else null, if (champion) "PO優勝" else null, move)
            .joinToString("・").ifEmpty { null }

    /** 押したときの1行（「3年目　2部1位　40勝20敗　昇格」） */
    val readout: String
        get() = buildString {
            append("${year}年目")
            if (current) append("（今季・途中）")
            append("　${league.orEmpty()}${rank ?: ""}位")
            if (wins != null) append("　${wins}勝${losses ?: 0}敗${if ((draws ?: 0) > 0) "${draws}分" else ""}")
            val tail = listOfNotNull(if (champion) "プレーオフ優勝" else null, move)
            if (tail.isNotEmpty()) append("　" + tail.joinToString("・"))
        }
}

/** 年表の1行 → 縦軸の位置（1始まり。1部1位＝1）。部か順位が分からなければ null */
fun historySlot(league: String?, rank: Int?): Int? {
    val tier = PYRAMID_LEAGUES.indexOfFirst { it.name == league }.takeIf { it >= 0 } ?: return null
    if (rank == null || rank <= 0) return null
    return tier * TEAMS_PER_LEAGUE + rank
}

/** 縦軸の数（部の数 × 球団の数） */
val HISTORY_SLOTS: Int get() = PYRAMID_LEAGUES.size * TEAMS_PER_LEAGUE

/**
 * 折れ線の点（古い順）。年表（新しい順）と、今季の途中の順位（試合があれば）。
 * ⚠ 今季の順位は順位表と同じ並べ方（[LEAGUE_STANDING_ORDER]）
 */
fun historyPoints(seasons: List<TeamSeason>, view: LeagueView?, team: String?): List<HistoryPoint> {
    val done = seasons.reversed().mapNotNull { s ->
        historySlot(s.league, s.rank)?.let { HistoryPoint(s.year, s.league, s.rank, it, s.wins, s.losses, s.draws, s.champion, s.move) }
    }
    val current = run {
        if (view == null || team == null) return@run null
        val id = view.teamLeagues[team] ?: return@run null
        val league = PYRAMID_LEAGUES.firstOrNull { it.id == id } ?: return@run null
        val rows = view.leagueTable(id)
        val row = rows.firstOrNull { it.team == team } ?: return@run null
        if (row.wins + row.losses + row.draws == 0) return@run null
        val rank = rows.indexOf(row) + 1
        // ⚠ 年度更新の前（今季がもう年表にある）は足さない
        if (done.any { it.year == view.year }) return@run null
        HistoryPoint(view.year ?: 0, league.name, rank, historySlot(league.name, rank) ?: return@run null, row.wins, row.losses, row.draws, false, null, current = true)
    }
    return done + listOfNotNull(current)
}

// ------------------------------------------------------------
// ゲーム差・過去の順位
// ------------------------------------------------------------

/** すぐ上の順位の球団とのゲーム差（1位は null）。PC の gamesBehind と同じ */
fun gamesBehindAbove(rows: List<Standing>): List<Double?> =
    rows.mapIndexed { i, row ->
        val above = rows.getOrNull(i - 1) ?: return@mapIndexed null
        (((above.wins - above.losses) - (row.wins - row.losses)) / 2.0) + 0.0
    }

/** ゲーム差の書き方（小数1桁。1位は「—」） */
fun gapText(v: Double?): String {
    if (v == null) return "—"
    val tenths = kotlin.math.round(kotlin.math.abs(v) * 10).toInt()
    return (if (v < 0 && tenths > 0) "-" else "") + "${tenths / 10}.${tenths % 10}"
}

/** 過去の1年の部ごとの順位表 */
data class PastTable(val league: PyramidLeague?, val rows: List<Standing>)

/** 過去の年度の記録（ビューの `history` の1つ）を部ごとに並べる（順位表と同じ並べ方） */
fun pastTables(entry: JsonObject): List<PastTable> {
    val rows = entry.at("standings").list().mapNotNull { it.obj() }.map { s ->
        val w = s.at("wins").int() ?: 0
        val l = s.at("losses").int() ?: 0
        Standing(
            team = s.at("team").str().orEmpty(),
            wins = w,
            losses = l,
            draws = s.at("draws").int() ?: 0,
            winRate = s.at("winRate").num() ?: if (w + l > 0) w.toDouble() / (w + l) else 0.0,
        )
    }
    if (rows.isEmpty()) return emptyList()
    val leagues = entry.at("leagues").obj() ?: return listOf(PastTable(null, rows.sortedWith(LEAGUE_STANDING_ORDER)))
    return PYRAMID_LEAGUES.map { league -> PastTable(league, rows.filter { leagues.at(it.team).str() == league.id }.sortedWith(LEAGUE_STANDING_ORDER)) }
        .filter { it.rows.isNotEmpty() }
}

/** その年の昇格・降格（球団 → 「昇格」/「降格」） */
fun pastMoves(entry: JsonObject): Map<String, String> =
    entry.at("moves").list().mapNotNull { it.obj() }.associate { m ->
        val from = PYRAMID_LEAGUES.indexOfFirst { it.id == m.at("from").str() }
        val to = PYRAMID_LEAGUES.indexOfFirst { it.id == m.at("to").str() }
        m.at("teamId").str().orEmpty() to if (to < from) "昇格" else "降格"
    }

// ------------------------------------------------------------
// 指導者の詳細能力の項目（src/online/coaches.js の COACH_ABILITY_ITEMS と同じ並び・名前）
// ------------------------------------------------------------

data class CoachAbilityItem(val key: String, val label: String, val note: String)

val COACH_ABILITY_ITEMS: List<CoachAbilityItem> = listOf(
    CoachAbilityItem("tactics", "采配", "試合の流れを読む力"),
    CoachAbilityItem("pitchingCoach", "投手指導", "投手を見る・教える力"),
    CoachAbilityItem("battingCoach", "打撃指導", "打者を見る・教える力"),
    CoachAbilityItem("fieldingCoach", "守備走塁指導", "守備と走塁を教える力"),
    CoachAbilityItem("development", "育成", "若手を伸ばす根気"),
    CoachAbilityItem("leadership", "統率", "チームをまとめる力"),
    CoachAbilityItem("rapport", "人望", "選手やコーチに慕われる度合い"),
    CoachAbilityItem("eye", "眼力", "選手の素質を見抜く目"),
)
