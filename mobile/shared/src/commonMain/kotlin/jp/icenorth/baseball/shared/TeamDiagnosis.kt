package jp.icenorth.baseball.shared

import kotlinx.serialization.Serializable

// ============================================================
// チーム診断「なぜ勝てない？」（自球団だけ）。数字と文はサーバーが作る（src/online/teamDiagnosis.js）。
// ⚠ 並びとボタンの見出しは Web 版（src/online/TeamDiagnosis.jsx）と同じにすること
// ============================================================

@Serializable
data class DiagnosisItem(val kind: String = "", val text: String = "", val page: String = "")

@Serializable
data class TeamDiagnosis(
    val games: Int = 0,
    val summary: String = "",
    val items: List<DiagnosisItem> = emptyList(),
    val note: String? = null,
)

/** 直す画面のボタンの見出し（Web 版 PAGE_LABEL と同じ）。知らない画面は null（ボタンを出さない） */
fun diagnosisPageLabel(page: String): String? = when (page) {
    "lineup" -> "スタメン設定"
    "rotation" -> "投手起用"
    "transfer" -> "トレード"
    else -> null
}

/** アプリの編成の面（PlanScreen の PlanTab の名前）。編成で直すものだけ */
fun diagnosisPlanFace(page: String): String? = when (page) {
    "lineup" -> "Order"
    "rotation" -> "Pitching"
    else -> null
}
