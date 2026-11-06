package jp.icenorth.baseball.shared

/**
 * 投手起用の編集（Web 版 src/online/pitchingEdit.js と同じ決まり）。
 *   starters … 先発ローテの順（投手の id）
 *   roles    … 起用できる全投手の役割。ローテの投手は先発の型、ほかは救援の役割
 * - 先発は1〜8人、守護神は1人まで
 */
data class PitchingState(val starters: List<Long>, val roles: Map<Long, String>) {
    fun isStarterRole(role: String?) = role != null && STARTER_ROLES.containsKey(role)

    fun moveStarter(from: Int, to: Int): PitchingState {
        if (from == to || from !in starters.indices || to !in starters.indices) return this
        val next = starters.toMutableList(); next.add(to, next.removeAt(from))
        return copy(starters = next)
    }

    fun setRole(id: Long, role: String, at: Int? = null): PitchingState {
        val current = roles[id]
        if (current == null) {
            if (!isStarterRole(role) && id in starters && starters.size > 1) return copy(starters = starters - id)
            return this
        }
        if (current == role && at == null) return this
        val toStarter = isStarterRole(role)
        val wasStarter = id in starters
        var nextStarters = starters
        if (toStarter && !wasStarter) {
            if (starters.size >= MAX_STARTERS) return this
            nextStarters = starters.toMutableList().apply { add(at ?: size, id) }
        } else if (!toStarter && wasStarter) {
            if (starters.size <= 1) return this
            nextStarters = starters - id
        }
        val nextRoles = roles.toMutableMap()
        nextRoles[id] = role
        if (role == "closer") {
            for ((other, r) in roles) {
                if (r == "closer" && other != id) nextRoles[other] = if (wasStarter || isStarterRole(current)) "auto_r" else current
            }
        }
        return PitchingState(nextStarters, nextRoles)
    }

    /** 2人の持ち場を入れ替える（先発どうし＝順、先発と救援＝持ち場ごと、救援どうし＝役割） */
    fun swap(a: Long, b: Long): PitchingState {
        if (a == b) return this
        val ia = starters.indexOf(a); val ib = starters.indexOf(b)
        if (ia >= 0 && ib >= 0) {
            val next = starters.toMutableList(); next[ia] = b; next[ib] = a
            return copy(starters = next)
        }
        val ra = roles[a]; val rb = roles[b]
        if (ra == null && rb == null) return this
        if (ra == null || rb == null) {
            val (missing, other) = if (ra == null) a to b else b to a
            if (missing !in starters) return this
            return PitchingState(starters.map { if (it == missing) other else it }, roles + (other to "auto_s"))
        }
        val nextStarters = if (ia >= 0 || ib >= 0) starters.map { if (it == a) b else if (it == b) a else it } else starters
        return PitchingState(nextStarters, roles + mapOf(a to rb, b to ra))
    }

    companion object {
        fun roleFor(role: String?, starter: Boolean): String =
            if (role != null && (if (starter) STARTER_ROLES else RELIEF_ROLES).containsKey(role)) role
            else if (starter) "auto_s" else "auto_r"

        /** 保存済みの編成と名簿から作る。名簿に居ない先発も外さない（Web 版 pitchingFromLineup） */
        fun from(starters: List<Long>, savedRoles: Map<Long, String>, pitchers: List<Player>): PitchingState {
            val unique = starters.distinct()
            val roles = pitchers.filter { it.isPitcher && it.isActive }
                .associate { it.id to roleFor(savedRoles[it.id], it.id in unique) }
            return PitchingState(unique, roles)
        }
    }
}

fun roleLabel(role: String?): String = STARTER_ROLES[role] ?: RELIEF_ROLES[role] ?: (role ?: "")
