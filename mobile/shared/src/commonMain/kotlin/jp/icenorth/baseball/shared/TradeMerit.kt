package jp.icenorth.baseball.shared

import kotlin.math.abs
import kotlin.math.floor

// ============================================================
// 交換案に入れた選手が**相手球団にとって**どんな得になるか（相手に与えるメリット。いしだ 2026-11-24）。
// Web 版 `src/online/tradeMerit.js` の写し（同じ式・同じ文）。変えたら両方を直し、
// `node mobile/tools/expect-logic.mjs > mobile/shared/src/jvmTest/resources/logic-expected.json`
// で期待値を書き出し直す（答え合わせは `LogicTest.tradeMeritMatchesWeb`）。
//
// 測り方（どれも CPU が使う物差し [squadStrength]・[rosterTops] だけ）:
//   - 役割 … 交換のあとの相手の名簿で当たる持ち場（野手の一番手・2人目の捕手・ローテ・抑え・中継ぎの主力・控え）
//   - 一番手との差 … 野手の一番手なら、相手が出す選手を抜いた名簿のその持ち場の一番手との差。空いていれば「空き」
//   - 弱い持ち場 … その持ち場の相手の一番手がリーグの下から3分の1
//   - 戦力 … その選手が抜けた場合と比べた [squadStrength] の差（交換のあとの名簿で）
//   - 交換全体 … 相手の [squadStrength] の伸びと、弱くなる持ち場
// ============================================================

/** 弱い持ち場とみなす順位（読めた球団の下から3分の1） */
const val MERIT_WEAK_RANK = 2.0 / 3.0

/** JS の `Math.round(v * 10)` */
private fun tenths(v: Double): Int = floor(v * 10 + 0.5).toInt()

/** 小数1桁の符号つき（"+3.2"・"-0.4"・"±0"）。⚠ Web と同じ丸め（Math.round と同じ、0.5 は上へ） */
fun signedPoints(v: Double): String {
    val r = tenths(v)
    if (r == 0) return "±0"
    val a = abs(r)
    return "${if (r > 0) "+" else "-"}${a / 10}.${a % 10}"
}

/** 役割の種類（Web の `role.kind` と同じ名前） */
enum class MeritRole(val key: String) { Starter("starter"), BackupCatcher("backupCatcher"), Rotation("rotation"), Closer("closer"), Relief("relief"), Bench("bench") }

data class MeritRoleAt(val slot: String?, val kind: MeritRole, val order: Int)

data class SlotRank(val rank: Int, val teams: Int, val weak: Boolean)

/** 札1つ。tone は good 得・plain ふつう・bad 損 */
data class MeritTag(val text: String, val tone: String)

data class PlayerMerit(
    val id: Long,
    val name: String,
    val role: MeritRoleAt,
    val slot: TradeSlot?,
    val over: Double?,
    val open: Boolean,
    val weak: SlotRank?,
    val gain: Double,
) {
    val tags: List<MeritTag> get() = meritTags(this)
}

data class TradeMerits(val players: List<PlayerMerit>, val gain: Double, val weaker: List<String>, val tags: List<MeritTag>)

private fun roleIn(roster: List<Player>, p: Player): MeritRoleAt {
    if (p.isPitcher) {
        val (rotation, pen) = pitchingStaff(roster)
        val r = rotation.indexOfFirst { it.id == p.id }
        if (r >= 0) return MeritRoleAt("sp", MeritRole.Rotation, r + 1)
        val b = pen.indexOfFirst { it.id == p.id }
        if (b == 0) return MeritRoleAt("cl", MeritRole.Closer, 1)
        if (b in 1..BULLPEN_SIZE) return MeritRoleAt("rp", MeritRole.Relief, b)
        return MeritRoleAt(null, MeritRole.Bench, 0)
    }
    val assigned = fielderAssignment(roster)
    TRADE_SLOTS.firstOrNull { !it.pitcher && assigned[it.key]?.holder?.id == p.id }?.let { return MeritRoleAt(it.key, MeritRole.Starter, 1) }
    val catchers = roster.filter { it.isActive }.mapNotNull { q -> slotStrength(q, "catcher")?.let { q to it } }.sortedByDescending { it.second }
    if (catchers.getOrNull(1)?.first?.id == p.id) return MeritRoleAt("catcher", MeritRole.BackupCatcher, 2)
    return MeritRoleAt(null, MeritRole.Bench, 0)
}

private fun slotRanks(roster: List<Player>, others: Map<String, List<Player>>): Map<String, SlotRank> {
    val tops = rosterTops(roster)
    val rivals = others.values.map { rosterTops(it) }
    val teams = rivals.size + 1
    return TRADE_SLOTS.associate { s ->
        val score = tops[s.key]?.score ?: 0.0
        val rank = 1 + rivals.count { (it[s.key]?.score ?: 0.0) > score }
        s.key to SlotRank(rank, teams, rivals.isNotEmpty() && rank > teams * MERIT_WEAK_RANK)
    }
}

/**
 * 相手に与えるメリット（Web 版 `tradeMerits` と同じ）。
 * @param theirs 相手の名簿（交換の前） @param giving 自球団が出す選手 @param getIds 相手が出す選手
 * @param others 相手以外の球団の名簿（弱い持ち場の順位。空なら出さない）
 */
fun tradeMerits(theirs: List<Player>, giving: List<Player>, getIds: Set<Long>, others: Map<String, List<Player>> = emptyMap()): TradeMerits {
    val base = theirs.filter { it.id !in getIds }
    val after = base + giving
    val baseTops = rosterTops(base)
    val beforeTops = rosterTops(theirs)
    val afterTops = rosterTops(after)
    val ranks = slotRanks(base, others)
    val full = squadStrength(after)
    val players = giving.map { p ->
        val role = roleIn(after, p)
        val slot = role.slot?.let { tradeSlot(it) }
        val strength = slot?.let { slotStrength(p, it.key) }
        val prev = slot?.let { baseTops[it.key] }
        val open = role.kind == MeritRole.Starter && prev?.holder == null
        val over = if (role.kind == MeritRole.Starter && !open && strength != null) strength - prev!!.score else null
        val weak = if (slot != null && role.kind != MeritRole.Bench && role.kind != MeritRole.BackupCatcher) ranks[slot.key]?.takeIf { it.weak } else null
        val gain = full - squadStrength(after.filter { it.id != p.id })
        PlayerMerit(p.id, p.name, role, slot, over, open, weak, gain)
    }
    val gain = squadStrength(after) - squadStrength(theirs)
    val weaker = TRADE_SLOTS.filter { (afterTops[it.key]?.score ?: 0.0) < (beforeTops[it.key]?.score ?: 0.0) - 0.05 }.map { it.label }
    return TradeMerits(players, gain, weaker, summaryTags(gain, weaker, giving.size, getIds.size))
}

/** 役割の札（「遊撃の一番手」「先発ローテ3番手」） */
fun roleText(role: MeritRoleAt, slot: TradeSlot?): String = when (role.kind) {
    MeritRole.Starter -> "${slot?.label}の一番手"
    MeritRole.BackupCatcher -> "2人目の捕手"
    MeritRole.Rotation -> "先発ローテ${role.order}番手"
    MeritRole.Closer -> "抑え（救援の一番手）"
    MeritRole.Relief -> "中継ぎの主力（${role.order}番手）"
    MeritRole.Bench -> "控え"
}

/** 1人ぶんの札（Web の `meritTags` と同じ文） */
fun meritTags(m: PlayerMerit): List<MeritTag> {
    val tags = mutableListOf(MeritTag(roleText(m.role, m.slot), if (m.role.kind == MeritRole.Bench) "plain" else "good"))
    if (m.open) tags += MeritTag("空いていた${m.slot?.label}を埋める", "good")
    else if (m.over != null) tags += MeritTag(if (m.over > 0) "今の一番手より${signedPoints(m.over)}" else "今の一番手と並ぶ", "good")
    m.weak?.let { tags += MeritTag("弱い${m.slot?.label}（${it.rank}位/${it.teams}）を補う", "good") }
    tags += MeritTag("戦力${signedPoints(m.gain)}", if (tenths(m.gain) > 0) "good" else "plain")
    return tags
}

private fun summaryTags(gain: Double, weaker: List<String>, giveCount: Int, getCount: Int): List<MeritTag> {
    if (giveCount == 0 && getCount == 0) return emptyList()
    val r = tenths(gain)
    val tags = mutableListOf(MeritTag("相手の戦力${signedPoints(gain)}", if (r > 0) "good" else if (r < 0) "bad" else "plain"))
    if (weaker.isNotEmpty()) tags += MeritTag("相手の${weaker.joinToString("・")}が弱くなる", "bad")
    return tags
}

/** 交換全体の1文 */
fun meritSummaryText(m: TradeMerits): String {
    val r = tenths(m.gain)
    val helped = m.players.count { it.role.kind != MeritRole.Bench }
    val head = if (r > 0) "相手の戦力が上がる交換です" else if (r < 0) "相手の戦力が下がる交換です" else "相手の戦力は変わりません"
    val tail = when {
        m.players.isEmpty() -> "（出す選手がいない）。"
        helped > 0 -> "（出す${m.players.size}人のうち${helped}人が相手の主力に入る）。"
        else -> "（出す選手は相手では控えになる）。"
    }
    return head + tail
}
