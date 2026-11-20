package jp.icenorth.baseball.shared

/**
 * 疲れた野手をその日だけ休ませるときの、守備の組み直し（Web 版 src/online/restPlan.js の写し）。
 *
 * サーバーは試合の日にこれで休ませる人を決める。アプリは同じ計算で「気になる所」に
 * 「休みます／休めません」を出す。答え合わせは LogicTest の restPlanMatchesWeb
 * （期待値は mobile/tools/expect-logic.mjs が書き出す）。どちらかを変えたら両方を直す。
 *
 * ⚠ 足し算の順・比べ方（同点なら先に見つけたほう）まで Web 版と同じにすること。
 *    同点の組み合わせが多いので、順が違うと別の控えを選んでずれる。
 */
object RestPlan {
    /** 守備位置を並べる順（Web 版 FIELD と同じ順） */
    val FIELD = listOf("catcher", "first", "second", "short", "third", "left", "center", "right")
    private const val STAY_BONUS = 20.0
    private const val SHORT_PENALTY = 1000.0
    private const val SPARE_PENALTY = 40.0

    data class Starter(val player: Player, val position: String)
    data class Result(val resting: List<Long>, val assign: Map<Long, String>)
    private data class Field(val shortfall: Double, val value: Double, val assign: Map<Long, String>)

    private fun batting(p: Player): Double = ((p.batting?.meet ?: 50) + (p.batting?.power ?: 50)) / 2.0

    /** 守備位置の割り当てを全部の組み合わせから選ぶ（Web 版 bestFieldAssignment と同じ） */
    fun bestAssignment(
        required: List<Player>,
        optional: List<Player>,
        positions: List<String>,
        score: (Player, String) -> Double,
    ): Pair<Double, Map<Long, String>>? {
        val players = required + optional
        val need = required.size
        val k = positions.size
        if (need > k || players.size < k) return null
        val size = 1 shl k
        val none = Double.NEGATIVE_INFINITY
        var dp = DoubleArray(size) { none }
        dp[0] = 0.0
        val choice = ArrayList<IntArray>()
        for (i in players.indices) {
            val next = DoubleArray(size) { none }
            val pick = IntArray(size) { -2 }
            val values = positions.map { score(players[i], it) }
            for (mask in 0 until size) {
                val base = dp[mask]
                if (base == none) continue
                if (i >= need && base > next[mask]) {
                    next[mask] = base
                    pick[mask] = -1
                }
                for (j in 0 until k) {
                    if (mask and (1 shl j) != 0) continue
                    val to = mask or (1 shl j)
                    val value = base + values[j]
                    if (value > next[to]) {
                        next[to] = value
                        pick[to] = j
                    }
                }
            }
            choice += pick
            dp = next
        }
        val full = size - 1
        if (dp[full] == none) return null
        val assign = HashMap<Long, String>()
        var mask = full
        for (i in players.indices.reversed()) {
            val j = choice[i][mask]
            if (j == -2) return null
            if (j >= 0) {
                assign[players[i].id] = positions[j]
                mask = mask and (1 shl j).inv()
            }
        }
        return dp[full] to assign
    }

    private fun planField(staying: List<Player>, pool: List<Player>, saved: Map<Long, String>): Field? {
        fun score(p: Player, pos: String): Double {
            val fit = p.fitness(pos).toDouble()
            val stays = saved[p.id] == pos
            val short = if (stays) 0.0 else maxOf(0.0, SUBSTITUTE_MIN_FITNESS - fit)
            val fatigue = (p.fatigue ?: 0).toDouble()
            val tired = if (saved.containsKey(p.id)) 0.0
            else fatigue * 0.2 + (if (fatigue >= SUBSTITUTE_FRESH_FATIGUE) SPARE_PENALTY else 0.0)
            return fit + batting(p) * 0.2 + (if (stays) STAY_BONUS else 0.0) - tired - short * SHORT_PENALTY
        }
        val (total, assign) = bestAssignment(staying, pool, FIELD, ::score) ?: return null
        val byId = (staying + pool).associateBy { it.id }
        var shortfall = 0.0
        for ((id, pos) in assign) {
            if (saved[id] == pos) continue
            shortfall += maxOf(0, SUBSTITUTE_MIN_FITNESS - byId.getValue(id).fitness(pos))
        }
        return Field(shortfall, total, assign)
    }

    private fun better(a: List<Double>, b: List<Double>): Boolean {
        val i = a.indices.firstOrNull { a[it] != b[it] } ?: return false
        return a[i] > b[i]
    }

    /**
     * 試合の日に誰を休ませ、守備をどう組むか（Web 版 planRest と同じ）。
     * `starters` は守備に就く先発8人、`bench` は控え（起用できる野手だけを使う）、
     * `leaving` はその日に先発投手として野手の枠を抜ける二刀流の選手（居なければ null）。
     * 休ませる人が居なければ null。
     * ⚠ 起用できない先発が居る打順は組まない・二刀流の先発は守備に残らない（2026-11-20 監査。Web 版の注を参照）
     */
    fun plan(starters: List<Starter>, bench: List<Player>, leaving: Long? = null): Result? {
        val positions = starters.map { it.position }.toSet()
        if (starters.size != FIELD.size || !FIELD.all { it in positions }) return null
        if (!starters.all { it.player.isActive }) return null
        val fielders = bench.filter { it.isActive && !it.isPitcher }
        val fresh = fielders.filter { (it.fatigue ?: 0) < SUBSTITUTE_FRESH_FATIGUE }
        val out = leaving?.takeIf { id -> starters.any { it.player.id == id } }
        // ⚠ 疲れの重い順（同じなら元の並び。Web 版の sort は安定）
        val tired = starters.map { it.player }
            .filter { it.id != out && (it.fatigue ?: 0) >= FIELDER_REST_FATIGUE }
            .sortedByDescending { it.fatigue ?: 0 }
        if (tired.isEmpty()) return null
        val saved = starters.associate { it.player.id to it.position }
        fun forced(p: Player) = (p.fatigue ?: 0) >= FIELDER_FORCE_REST_FATIGUE
        val present = starters.map { it.player }.filter { it.id != out }
        // 二刀流が抜けるだけで下限を割る分は、休ませない理由にしない
        val baseline = if (out == null) 0.0 else listOf(fresh, fielders)
            .mapNotNull { pool -> if (pool.isEmpty()) null else planField(present, pool, saved)?.shortfall }
            .minOrNull() ?: Double.POSITIVE_INFINITY
        val extra = if (out == null) 0 else 1
        var bestKey: List<Double>? = null
        var best: Result? = null
        for (bits in 1 until (1 shl tired.size)) {
            val resting = tired.filterIndexed { i, _ -> bits and (1 shl i) != 0 }
            val restingIds = resting.map { it.id }.toSet()
            val pool = if (resting.any(::forced)) fielders else fresh
            // 控えの人数より多くは休ませられない（守備の組み合わせを数える前に切る）
            if (pool.size < resting.size + extra) continue
            val staying = present.filter { it.id !in restingIds }
            val field = planField(staying, pool, saved) ?: continue
            val key = listOf(
                resting.count(::forced).toDouble(),
                0.0 - field.shortfall, // ⚠ -0.0 にしない（List<Double> の比較で 0.0 と別物になる）
                resting.sumOf { it.fatigue ?: 0 }.toDouble(),
                field.value,
            )
            if (bestKey == null || better(key, bestKey)) {
                bestKey = key
                best = Result(resting.map { it.id }, field.assign)
            }
        }
        val key = bestKey ?: return null
        // ふつうの疲れでは下限を割ってまで休ませない
        if (key[0] == 0.0 && -key[1] > baseline) return null
        return best
    }
}
