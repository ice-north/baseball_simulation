package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject

/**
 * キャンプの方針と練習の割り当て。Web 版 src/season/trainingPolicy.js と
 * src/online/CampPlanner.jsx（menusFor / subMenusFor / clampMenu / clampSub）の写し。
 *
 * ⚠ 成長の計算はしない（1クールずつサーバーの campRound で実行する）。ここは
 *    「方針からどの練習を当てるか」「本人の希望と噛み合うか」を画面に出すためだけ。
 */
private val PHASE_STATS = mapOf(
    "physique" to mapOf(
        "pitcher" to listOf("velocity", "stamina", "bodyStamina", "arm"),
        "fielder" to listOf("speed", "arm", "bodyStamina"),
    ),
    "skill" to mapOf(
        "pitcher" to listOf("control", "defense"),
        "fielder" to listOf("meet", "power", "eye", "defense", "steal"),
    ),
)

private fun rawStat(player: JsonObject, stat: String): Double? = when (stat) {
    "meet", "power", "eye", "steal", "bunt" -> player.at("batting", stat).num()
    "speed", "arm", "bodyStamina" -> player.at("physical", stat).num()
    "defense" -> player.at("fielding", "defense").num()
    "control", "velocity", "stamina" -> player.at("pitching", stat).num()
    else -> null
}

private fun statOf(player: JsonObject, stat: String): Double? {
    val v = rawStat(player, stat) ?: return null
    return when (stat) {
        "velocity" -> (v - 115) * 2.5
        "stamina" -> v / 2
        else -> v
    }
}

data class Poles(val best: String?, val bestValue: Double, val worst: String?, val worstValue: Double)

fun JsonObject.isPitcherJson(): Boolean = at("position").str() == "pitcher"

fun poleStats(player: JsonObject, phase: String): Poles {
    val pool = PHASE_STATS[phase]?.get(if (player.isPitcherJson()) "pitcher" else "fielder").orEmpty()
    var best: String? = null; var bestV = Double.NEGATIVE_INFINITY
    var worst: String? = null; var worstV = Double.POSITIVE_INFINITY
    for (s in pool) {
        val v = statOf(player, s) ?: continue
        if (v > bestV) { bestV = v; best = s }
        if (v < worstV) { worstV = v; worst = s }
    }
    return Poles(best, bestV, worst, worstV)
}

private val INTENSIVE_BY_STAT = mapOf(
    "meet" to "intensive_meet", "power" to "intensive_power", "eye" to "intensive_eye",
    "speed" to "intensive_speed", "defense" to "intensive_defense",
    "control" to "intensive_control", "velocity" to "intensive_velocity",
)
private val BROAD_BY_STAT = mapOf(
    "meet" to "batting", "power" to "batting", "eye" to "batting", "bunt" to "batting",
    "speed" to "baserunning", "steal" to "baserunning",
    "defense" to "fielding", "arm" to "fielding",
    "control" to "control", "stamina" to "control", "velocity" to "velocity",
    "bodyStamina" to "velocity",
)

private fun broadFor(stat: String, isPitcher: Boolean) =
    if (!isPitcher && stat == "bodyStamina") "baserunning" else BROAD_BY_STAT[stat] ?: "batting"

private val SUB_BY_PHASE = mapOf(
    "physique" to mapOf("sharpen" to "weight", "balanced" to "physique", "patch" to "physique"),
    "skill" to mapOf("sharpen" to "eye", "balanced" to "stretch", "patch" to "defense_sub"),
    "range" to mapOf("sharpen" to "breaking", "balanced" to "breaking", "patch" to "subposition"),
)

data class Training(val main: String, val sub: String)

/** 方針（方向性 × 段階）をこの選手の練習に直す（resolveTraining） */
fun resolveTraining(player: JsonObject, direction: String, phase: String): Training {
    val isPitcher = player.isPitcherJson()
    val sub = SUB_BY_PHASE[phase]?.get(direction) ?: "physique"
    if (phase == "range") {
        return Training(if (isPitcher) "newpitch" else if (direction == "sharpen") "fielding" else "baserunning", sub)
    }
    val poles = poleStats(player, phase)
    if (direction == "sharpen" && poles.best != null) {
        return Training(INTENSIVE_BY_STAT[poles.best] ?: broadFor(poles.best, isPitcher), sub)
    }
    if (direction == "patch" && poles.worst != null) return Training(broadFor(poles.worst, isPitcher), sub)
    val main = if (phase == "physique") (if (isPitcher) "velocity" else "baserunning") else (if (isPitcher) "control" else "batting")
    return Training(main, sub)
}

data class Wish(val direction: String, val phase: String)

/** 本人が伸ばしたい方向（playerWish）。正解ではなく、噛み合うとやる気が上がるだけ */
fun playerWish(player: JsonObject): Wish {
    val age = player.at("age").num() ?: 20.0
    val skill = poleStats(player, "skill")
    val phys = poleStats(player, "physique")
    val gap = skill.bestValue - skill.worstValue
    val direction = if (gap >= 22) "sharpen" else if (gap <= 10) "balanced" else "patch"
    val phase = if (age <= 19) "physique" else if (age >= 23) "skill" else if (phys.bestValue < skill.bestValue) "physique" else "skill"
    return Wish(direction, phase)
}

/** 「平凡」の線（PLAIN_SKILL_LINE）。技術の長所がこれ未満なら短所埋めより長所で勝負させる */
const val PLAIN_SKILL_LINE = 55.0

/** おすすめの方針（recommendedPolicy）。希望どおり、ただし平凡な選手の短所埋めだけ長所へ */
fun recommendedPolicy(player: JsonObject): Wish {
    val wish = playerWish(player)
    if (wish.direction == "patch" && poleStats(player, "skill").bestValue < PLAIN_SKILL_LINE) return Wish("sharpen", wish.phase)
    return wish
}

/**
 * その選手に当てる方針（playerPolicy）。mode は recommended / wish / team、
 * overrides は選手ごとの上書き（「合わせる」）で、どの決め方よりも先に効く。
 */
fun playerPolicy(player: JsonObject, mode: String, direction: String, phase: String, overrides: Map<Long, Wish>): Wish =
    overrides[player.pid] ?: when (mode) {
        "wish" -> playerWish(player)
        "recommended" -> recommendedPolicy(player)
        else -> Wish(direction, phase)
    }

enum class MoodTone { Good, Mid, Bad }
data class Mood(val label: String, val tone: MoodTone)

/** 希望と指示の噛み合い（describeMood）。画面には「意欲的・納得・身が入らない」で出す */
fun describeMood(player: JsonObject, direction: String, phase: String): Mood {
    val wish = playerWish(player)
    val hit = (if (wish.direction == direction) 1 else 0) + (if (wish.phase == phase) 1 else 0)
    if (hit == 2) return Mood("意欲的", MoodTone.Good)
    if (hit == 1) return Mood("納得", MoodTone.Mid)
    val discipline = player.at("personality", "discipline").num() ?: 50.0
    return if (discipline >= 70) Mood("納得", MoodTone.Mid) else Mood("身が入らない", MoodTone.Bad)
}

fun menuFits(menu: Menu, isPitcher: Boolean): Boolean =
    if (isPitcher) menu.category != "batting" else menu.category != "pitching"

/** 投手／野手に出すメイン練習 */
fun campMenusFor(isPitcher: Boolean): List<Menu> = CAMP_MENUS.filter { menuFits(it, isPitcher) }

/** その選手に効くサブ練習だけ（変化球系は投手、Cリードは捕手） */
fun campSubMenusFor(player: JsonObject): List<Menu> =
    CAMP_SUB_MENUS.filter { it.only == null || it.only == player.at("position").str() }

/** 出せない・合わないメニューに落ちたら既定へ（clampMenu / clampSub） */
fun clampMenu(key: String?, player: JsonObject): String {
    val pitcher = player.isPitcherJson()
    val menu = CAMP_MENUS.firstOrNull { it.key == key }
    return if (menu != null && menuFits(menu, pitcher)) menu.key else if (pitcher) "control" else "batting"
}

fun clampSub(key: String?, player: JsonObject): String =
    if (key != null && campSubMenusFor(player).any { it.key == key }) key else "physique"

fun campMenuName(key: String?): String =
    (CAMP_MENUS + CAMP_SUB_MENUS).firstOrNull { it.key == key }?.let { "${it.icon} ${it.name}" } ?: (key ?: "")

/** 一人用のキャンプと同じ分け方 */
val CAMP_GROUPS: List<Pair<String, String>> = listOf("pitcher" to "投手", "catcher" to "捕手", "infield" to "内野手", "outfield" to "外野手")

fun campGroupOf(position: String?): String = when (position) {
    "pitcher" -> "pitcher"
    "catcher" -> "catcher"
    "first", "second", "third", "short" -> "infield"
    else -> "outfield"
}
