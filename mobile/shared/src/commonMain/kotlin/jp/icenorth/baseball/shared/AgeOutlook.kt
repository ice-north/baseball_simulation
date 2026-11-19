package jp.icenorth.baseball.shared

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

// ============================================================
// 年齢構成と3年後の見込み（自球団だけ）。数字と文はサーバーが作る（src/online/ageOutlook.js）。
// ⚠ 並びと見出しは Web 版（src/online/AgeOutlook.jsx）と同じにすること
// ============================================================

@Serializable
data class AgeBand(val label: String = "", val pitchers: Int = 0, val fielders: Int = 0)

@Serializable
data class AgeOutlookRow(
    val id: Long? = null,
    val name: String = "",
    val position: String? = null,
    val age: Int = 0,
    val later: Int = 0,
    val peakAge: Int = 0,
    val upside: Int = 0,
    val kind: String = "",
    val veteran: Boolean = false,
)

/** 年齢 × 守備位置の図に置く1人（`group`: 0 投手・1 捕手・2 内野・3 外野） */
@Serializable
data class AgeGridPerson(
    val id: Long? = null,
    val name: String = "",
    val position: String? = null,
    val group: Int = 2,
    val age: Int = 0,
    val later: Int = 0,
    val core: Boolean = false,
    val warn: Boolean = false,
)

@Serializable
data class AgeOutlook(
    val years: Int = 3,
    val bands: List<AgeBand> = emptyList(),
    /** 年齢 × 守備位置の図（古いサーバーには無い → 空。画面は前の帯グラフ） */
    val grid: List<AgeGridPerson> = emptyList(),
    val core: List<AgeOutlookRow> = emptyList(),
    val rising: List<AgeOutlookRow> = emptyList(),
    val lines: List<String> = emptyList(),
    val advice: String = "",
)

/**
 * ビューの `ageOutlook` を読む。無い（名簿が空・途中参加で初期メンバー待ち）・読めないときは null
 * （画面は「まだ見込みを出せません」）
 */
fun ageOutlookOf(raw: JsonObject?): AgeOutlook? =
    raw?.at("ageOutlook").obj()?.let { runCatching { OnlineJson.decodeFromJsonElement(AgeOutlook.serializer(), it) }.getOrNull() }

/** 見込みの言葉（Web 版 AgeOutlook.jsx の KIND_LABEL と同じ） */
fun ageOutlookLabel(r: AgeOutlookRow): String =
    when (r.kind) { "rising" -> "まだ伸びる"; "peak" -> "ピークの近く"; else -> "下り坂の見込み" } + if (r.veteran) "・引退が近い年齢" else ""

const val AGE_OUTLOOK_NOTE = "見込みは成長力とプロ意識から決まるピーク年齢で見ています（乱数なし）。練習や出場で前後します。"

// ---- 年齢 × 守備位置の図（Web 版 src/online/ageOutlook.js の ageGridRows と同じ切り方） ----

/** 横の並び */
val AGE_GRID_GROUPS = listOf("投手", "捕手", "内野", "外野")
/** いちばん上の段（この歳から上をまとめる） */
const val AGE_GRID_TOP = 30
/** 下の段の目安（これより若い人がいればその歳まで伸ばす） */
const val AGE_GRID_BOTTOM = 19

/** 図の1段（`cells` は投手・捕手・内野・外野の4つ） */
data class AgeGridRow(val label: String, val cells: List<List<AgeGridPerson>>)

/**
 * 図の段（上から。上ほど年上、いちばん上は「30以上」）。[later] なら3年後の年齢で並べる。
 * 同じ枠の中は主力が先、次に年上から
 */
fun ageGridRows(people: List<AgeGridPerson>, later: Boolean = false): List<AgeGridRow> {
    fun ageOf(p: AgeGridPerson) = if (later) p.later else p.age
    val youngest = minOf(AGE_GRID_BOTTOM, people.minOfOrNull(::ageOf) ?: AGE_GRID_BOTTOM)
    return (AGE_GRID_TOP downTo youngest).map { age ->
        val top = age == AGE_GRID_TOP
        val here = people.filter { if (top) ageOf(it) >= AGE_GRID_TOP else ageOf(it) == age }
        AgeGridRow(
            label = if (top) "${AGE_GRID_TOP}以上" else "$age",
            cells = AGE_GRID_GROUPS.indices.map { g ->
                here.filter { it.group == g }.sortedWith(compareByDescending<AgeGridPerson> { it.core }.thenByDescending { ageOf(it) })
            },
        )
    }
}
