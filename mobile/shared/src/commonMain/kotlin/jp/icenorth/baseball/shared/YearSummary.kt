package jp.icenorth.baseball.shared

import kotlinx.serialization.Serializable

// ============================================================
// その年のまとめ（年度更新の直後に出す）と、その年のNPBドラフトの発表。
// Web 版の `src/online/YearSummary.jsx`・`ProDraftResult.jsx` と同じ。
//
// ⚠ いしだ 2026-11-18「トライアウト後の年度更新の際に、キャンプの結果やオフの成長は
//    要りません。その年の順位、入退団の選手、主なトピックに止めて下さい」。アプリも
//    オフの成長（`lastOffseason` の能力の差）をやめて、これを出す（監査 2026-11-20、いしだ「おすすめで」）。
// ⚠ 中身はサーバーが組む（`server/yearSummary.mjs` → ビューの `yearSummary`）。ここは並べるだけ。
// ============================================================

@Serializable
data class YearSummaryRow(
    val rank: Int = 0,
    val team: String = "",
    val label: String = "",
    val wins: Int = 0,
    val losses: Int = 0,
    val draws: Int = 0,
    val mine: Boolean = false,
)

@Serializable
data class YearSummaryRecord(val wins: Int = 0, val losses: Int = 0, val draws: Int = 0)

@Serializable
data class YearSummaryMove(
    /** in（入団）/ out（退団） */
    val side: String = "",
    /** 「入団」「トレード」「プロ入り」など */
    val how: String = "",
    val name: String = "",
    val position: String? = null,
    /** 入団は「どこから」、退団は「どこへ」 */
    val other: String? = null,
)

@Serializable
data class LeagueMove(val to: String = "", val up: Boolean = false)

@Serializable
data class YearSummary(
    val year: Int = 0,
    val league: String? = null,
    val rank: Int? = null,
    val record: YearSummaryRecord? = null,
    val standings: List<YearSummaryRow> = emptyList(),
    val champion: String? = null,
    val move: LeagueMove? = null,
    val joined: List<YearSummaryMove> = emptyList(),
    val left: List<YearSummaryMove> = emptyList(),
    val topics: List<String> = emptyList(),
)

/**
 * まとめを出す時期か。年度更新（11/30）から**開幕した月の終わり**まで。
 * ⚠ Web 版 `shared.js` の `isYearSummaryTime` と同じ（サーバーも時期の外はビューに載せない）。
 */
fun isYearSummaryTime(summaryYear: Int?, year: Int?, month: Int?): Boolean =
    summaryYear != null && year != null && summaryYear == year - 1 && (month ?: 0) <= SEASON_START_MONTH

/** 見出しの横（「2部 1位（70勝50敗）」） */
fun yearSummaryRankText(s: YearSummary): String? {
    val rank = s.rank ?: return null
    val rec = s.record?.let { "（${it.wins}勝${it.losses}敗${if (it.draws > 0) "${it.draws}分" else ""}）" } ?: ""
    return "${s.league?.let { "$it " } ?: ""}${rank}位$rec"
}

/** 入退団の1行（「入団 山田（投手）← 三陸」） */
fun yearSummaryMoveText(m: YearSummaryMove): String =
    "${m.how} ${m.name}" +
        (m.position?.let { "（${positionLabel(it)}）" } ?: "") +
        (m.other?.let { if (m.side == "in") " ← $it" else " → $it" } ?: "")

/** その年のNPBドラフトで指名された選手（Web 版 `ProDraftResult.jsx` と同じく、その年の行だけ） */
fun proDraftOfYear(chronicle: ChronicleView?, year: Int?): List<ProDrafted> =
    if (year == null) emptyList() else chronicle?.proDrafted.orEmpty().filter { it.year == year }

/**
 * NPBドラフトの発表の1文（Web 版と同じ文）。
 * ⚠ ご褒美は**抜かれた1人ごとに**効く（サーバー `proDraft.mjs` の TEAMMATE_DISCIPLINE=5・TEAMMATE_EXPERIENCE_GAMES=30）
 */
fun proDraftLead(rows: List<ProDrafted>, myTeam: String?, myLabel: String): String {
    if (rows.isEmpty())
        return "このリーグから指名された選手はいませんでした。プロに届く力を付けた選手が出れば、来季の10月に指名される。"
    val mine = rows.count { it.team == myTeam }
    return "このリーグから${rows.size}人がNPBへ。" + if (mine > 0) "${myLabel}からは${mine}人。" else ""
}

fun proDraftReward(mine: Int, myLabel: String): String? =
    if (mine <= 0) null else "プロ入りに触れて、${myLabel}の残った選手はプロ意識+${5 * mine}（100まで）・経験+${30 * mine}試合分。"
