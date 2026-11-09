package jp.icenorth.baseball.shared

import kotlinx.serialization.Serializable

/*
 * 指導者（監督・投手コーチ・野手コーチ）。形はサーバー（server/coachView.mjs）の
 * `ownStaffView`（ビューの staff）・`leagueStaffView`（leagueStaff）・`teamStaffView`（team の窓口の staff）。
 *
 * ⚠ 文はサーバーが作る（PC/アプリ同文）。アプリで言い換えないこと。
 * ⚠ 能力を上げる効果は無い。考え方と性格で、采配の「AI判断」・トライアウト・退団・キャンプの案・
 *    トレードの返事が変わるだけ。
 */

/** 考え方・性格の1行（-2〜2。代打・守備固めは -2〜0 の片側） */
@Serializable
data class StaffScale(
    val key: String = "",
    val label: String = "",
    val low: String = "",
    val high: String = "",
    val value: Int = 0,
    val oneSided: Boolean = false,
    val text: String = "",
)

@Serializable
data class CoachHistory(
    val year: Int = 0,
    val team: String? = null,
    val teamLabel: String? = null,
    val role: String? = null,
    val roleLabel: String? = null,
    val text: String = "",
)

@Serializable
data class CoachCard(
    val id: String = "",
    val name: String = "",
    val age: Int = 0,
    val role: String? = null,
    val roleLabel: String = "",
    val team: String? = null,
    val since: Int? = null,
    val specialty: String? = null,
    val specialtyLabel: String = "",
    val origin: String = "",
    val fromPlayer: Boolean = false,
    val legend: Boolean = false,
    /** 「機動力野球・継投は早め」 */
    val color: String = "",
    val personality: String = "",
    /** 監督の席の人だけ（「任せ度50%」） */
    val delegation: String? = null,
    val career: String = "",
    val views: List<StaffScale> = emptyList(),
    val traits: List<StaffScale> = emptyList(),
    val prefs: String = "",
    val playerLine: String? = null,
    val mentor: String? = null,
    val history: List<CoachHistory> = emptyList(),
) {
    /** 呼び名（姓だけ。「山田監督」） */
    val shortName: String get() = name.substringBefore(' ').ifBlank { name }

    /** 性格の値（気質 temper: -2 我慢強い 〜 2 短気 など） */
    fun trait(key: String): Int = traits.firstOrNull { it.key == key }?.value ?: 0
}

@Serializable
data class StaffSeat(val role: String = "", val roleLabel: String = "", val coach: CoachCard? = null)

@Serializable
data class StaffModeOption(val value: String = "", val label: String = "")

/** 分野ごとの任せ方。`effective` が実際に効くもの（受け持ちの席が空いていれば self） */
@Serializable
data class StaffArea(
    val key: String = "",
    val label: String = "",
    val mode: String = "advice",
    val effective: String = "advice",
    val effectiveLabel: String = "",
    val owner: String? = null,
    val ownerLabel: String = "",
    val locked: Boolean = false,
    val note: String? = null,
)

/** 采配の1行（「送りバント: AI判断 → 積極的（山田監督）」）。by が無ければ指導者は決めていない */
@Serializable
data class TacticLine(
    val field: String = "",
    val key: String = "",
    val label: String = "",
    val settingLabel: String = "",
    val valueLabel: String = "",
    val resolvedLabel: String? = null,
    val isStandard: Boolean = false,
    val by: String? = null,
    val text: String = "",
)

@Serializable
data class StaffFront(val ambition: String = "", val patience: String = "")

@Serializable
data class StaffEvent(
    val year: Int = 0,
    /** retire / fire / resign / turn / hire / promote / release */
    val kind: String = "",
    val team: String? = null,
    val role: String? = null,
    val coachId: String? = null,
    val name: String = "",
    val mentor: String? = null,
    val homecoming: Boolean = false,
    val reason: String? = null,
    val text: String = "",
)

@Serializable
data class StaffRift(val role: String = "", val text: String = "")

/** 自分の球団の指導者（ビューの staff） */
@Serializable
data class StaffView(
    val seats: List<StaffSeat> = emptyList(),
    val modeOptions: List<StaffModeOption> = emptyList(),
    val modes: List<StaffArea> = emptyList(),
    val tactics: List<TacticLine> = emptyList(),
    val front: StaffFront? = null,
    val canEditSeats: Boolean = false,
    val market: List<CoachCard> = emptyList(),
    val events: List<StaffEvent> = emptyList(),
    val rifts: List<StaffRift> = emptyList(),
) {
    fun seat(role: String): CoachCard? = seats.firstOrNull { it.role == role }?.coach
    val manager: CoachCard? get() = seat("manager")
    fun mode(area: String): StaffArea? = modes.firstOrNull { it.key == area }
    fun tactic(field: String, key: String): TacticLine? = tactics.firstOrNull { it.field == field && it.key == key }
}

@Serializable
data class StaffBrief(
    val name: String = "",
    val shortName: String = "",
    val color: String = "",
    val delegation: String? = null,
    /** 監督としての通算勝利（今季ぶんを含む） */
    val totalWins: Int = 0,
    /** 今季からの監督 */
    val isNew: Boolean = false,
)

@Serializable
data class TeamStaff(
    val team: String = "",
    val teamLabel: String? = null,
    val manager: StaffBrief? = null,
    val pitching: StaffBrief? = null,
    val batting: StaffBrief? = null,
)

/** リーグ全球団の顔ぶれと最近の人事（ビューの leagueStaff） */
@Serializable
data class LeagueStaff(val teams: List<TeamStaff> = emptyList(), val events: List<StaffEvent> = emptyList()) {
    fun of(team: String?): TeamStaff? = teams.firstOrNull { it.team == team }
}

/** 他球団の指導者（team の窓口の staff）。⚠ 人の球団の采配（tactics）は届かない */
@Serializable
data class TeamStaffView(
    val seats: List<StaffSeat> = emptyList(),
    val front: StaffFront? = null,
    val tactics: List<TacticLine>? = null,
    val events: List<StaffEvent> = emptyList(),
)

/** 手続きの標準案を出した指導者（ビューの phase.planBy） */
@Serializable
data class PlanBy(val mode: String = "advice", val by: String = "", val text: String = "")

const val ROLE_MANAGER = "manager"
val STAFF_ROLE_LABELS = mapOf("manager" to "監督", "pitching" to "投手コーチ", "batting" to "野手コーチ")
