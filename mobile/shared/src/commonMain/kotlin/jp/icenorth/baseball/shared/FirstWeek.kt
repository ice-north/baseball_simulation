package jp.icenorth.baseball.shared

// ============================================================
// はじめての1週間（途中参戦した人への案内）。⚠ 文と決め方は Web 版（src/online/firstWeek.js）と同じ。
//
// ⚠ 出すのは参加してから7日の間だけ（ビューの joinedAt。リーグを作ったときの人には無い）。
// ⚠ 済んだかどうかは端末に残す（SessionStore）。編成の面を開いたら済み。
// ============================================================

const val FIRST_WEEK_DAYS = 7

/** やること。`face` はアプリの編成の面（PlanScreen の PlanTab の名前） */
data class FirstWeekStep(val id: String, val title: String, val body: String, val face: String)

val FIRST_WEEK_STEPS = listOf(
    FirstWeekStep("lineup", "スタメンを確かめる", "打順と守備位置を見て、疲れた選手や調子の悪い選手を入れ替えます。", "Order"),
    FirstWeekStep("rotation", "投手の役割を決める", "先発ローテと抑え・中継ぎを並べます。先発ごとに球数の目安も選べます。", "Pitching"),
    FirstWeekStep("tactics", "方針・采配を選ぶ", "試合は自動で進むので、打撃・投球・走塁・守備の方針が采配の代わりになります。", "Tactics"),
    FirstWeekStep("staff", "任せ方を決める", "監督・コーチに、分野ごとに「自分で」「意見を聞く」「任せる」を選べます。来られない日は任せておけば進みます。", "Staff"),
)

const val FIRST_WEEK_NOTE = "決めなくても指導者の案で試合は進みます。まずはどこで何を決められるかを見ておきましょう。"

private const val DAY_MS = 24L * 3600 * 1000

/** 「2026-11-16T09:30:47.123Z」→ ミリ秒。読めなければ null（サーバーは UTC の toISOString で書く） */
fun isoToMillis(iso: String?): Long? {
    if (iso == null) return null
    val m = Regex("""^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})""").find(iso) ?: return null
    val (day, h, mi, s) = m.destructured
    val days = dayNumber(day) ?: return null
    return days * DAY_MS + h.toLong() * 3_600_000 + mi.toLong() * 60_000 + s.toLong() * 1000
}

/** 案内を出す期間か（参加してから7日の間） */
fun inFirstWeek(joinedAt: String?, now: Long): Boolean {
    val at = isoToMillis(joinedAt) ?: return false
    return now - at in 0 until FIRST_WEEK_DAYS * DAY_MS
}

data class FirstWeekGuide(val done: Int, val total: Int, val next: FirstWeekStep)

/** 案内に出すもの（出さないときは null）。`done`: 済んだ手順の id、`closed`: 案内を閉じた */
fun firstWeekGuide(joinedAt: String?, done: Set<String>, closed: Boolean, now: Long): FirstWeekGuide? {
    if (!inFirstWeek(joinedAt, now) || closed) return null
    val next = FIRST_WEEK_STEPS.firstOrNull { it.id !in done } ?: return null
    return FirstWeekGuide(FIRST_WEEK_STEPS.count { it.id in done }, FIRST_WEEK_STEPS.size, next)
}

/** 端末に残す鍵（Web 版の firstWeekKey と同じ形） */
fun firstWeekKey(teamName: String, joinedAt: String): String = "online-first-week:$teamName:$joinedAt"

/** 編成の面を開いたときに済みにする手順の id（無ければ null） */
fun firstWeekStepOfFace(face: String): String? = FIRST_WEEK_STEPS.firstOrNull { it.face == face }?.id
