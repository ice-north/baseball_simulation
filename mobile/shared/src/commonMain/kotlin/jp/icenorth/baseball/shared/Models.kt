package jp.icenorth.baseball.shared

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * サーバー（server/projection.mjs の projectLeague）が返すビューのうち、アプリが使う部分。
 *
 * ⚠ **知らない項目は捨てる（ignoreUnknownKeys）が、編成（lineup）だけは JsonObject のまま持つ**。
 *    保存は「編成の塊を丸ごと送り返す」形なので、アプリが知らない項目（投手の役割・自動采配など）を
 *    落とすと、保存した瞬間に Web 側で決めた設定が消える。
 */
@Serializable
data class LeagueView(
    val setupRequired: Boolean = false,
    val schema: Int? = null,
    val revision: Int = 0,
    val status: String? = null,
    val teamName: String? = null,
    val year: Int? = null,
    val useDH: Boolean = false,
    val currentDate: GameDate? = null,
    val seasonTurns: Int = SEASON_TURNS,
    val nextAdvanceAt: String? = null,
    val phaseDeadline: String? = null,
    val isAdmin: Boolean = false,
    val writable: Boolean = false,
    val teamLabels: Map<String, TeamLabel> = emptyMap(),
    val teamLeagues: Map<String, String> = emptyMap(),
    val members: List<Member> = emptyList(),
    val standings: List<Standing> = emptyList(),
    val results: List<GameResult> = emptyList(),
    val nextGames: List<ScheduledGame> = emptyList(),
    val roster: List<Player> = emptyList(),
    val lineup: JsonObject? = null,
    val phase: Phase? = null,
    val pendingPack: JsonObject? = null,
)

@Serializable
data class GameDate(val year: Int, val month: Int = 1, val day: Int = 1)

@Serializable
data class TeamLabel(val label: String? = null, val short: String? = null)

@Serializable
data class Member(
    val label: String? = null,
    val teamName: String? = null,
    val displayName: String? = null,
    val ready: Boolean = false,
)

@Serializable
data class Standing(
    val team: String,
    val wins: Int = 0,
    val losses: Int = 0,
    val draws: Int = 0,
    val winRate: Double = 0.0,
    val gamesPlayed: Int = 0,
)

@Serializable
data class PitcherRef(val id: Long? = null, val name: String? = null)

@Serializable
data class Decisions(
    val winningPitcher: PitcherRef? = null,
    val losingPitcher: PitcherRef? = null,
    val savePitcher: PitcherRef? = null,
)

@Serializable
data class GameResult(
    val gameId: Long? = null,
    val date: GameDate? = null,
    val home: String,
    val away: String,
    val homeScore: Int? = null,
    val awayScore: Int? = null,
    val decisions: Decisions? = null,
)

@Serializable
data class StarterInfo(
    val name: String? = null,
    val throws: String? = null,
    val wins: Int = 0,
    val losses: Int = 0,
    val era: Double? = null,
)

@Serializable
data class ScheduledGame(
    val id: Long? = null,
    val date: GameDate? = null,
    val number: Int? = null,
    val home: String,
    val away: String,
    val homeStarterInfo: StarterInfo? = null,
    val awayStarterInfo: StarterInfo? = null,
)

@Serializable
data class Phase(
    val id: String? = null,
    val kind: String? = null,
    val label: String? = null,
    val deadline: String? = null,
)

@Serializable
data class Batting(
    val meet: Int? = null,
    val power: Int? = null,
    val eye: Int? = null,
    val bats: String? = null,
    val steal: Int? = null,
    val bunt: Int? = null,
)

@Serializable
data class Pitching(
    val velocity: Int? = null,
    val control: Int? = null,
    val stamina: Int? = null,
    val form: String? = null,
)

@Serializable
data class Fielding(val defense: Int? = null)

@Serializable
data class Physical(val speed: Int? = null, val arm: Int? = null, val throws: String? = null)

@Serializable
data class BattingMetrics(
    val pa: Int = 0,
    val avg: Double? = null,
    val obp: Double? = null,
    val homeruns: Int = 0,
    val stolenBases: Int = 0,
)

@Serializable
data class PitchingMetrics(val outs: Int = 0, val era: Double? = null, val k9: Double? = null)

@Serializable
data class BattingPerformance(val metrics: BattingMetrics? = null)

@Serializable
data class PitchingPerformance(val metrics: PitchingMetrics? = null)

@Serializable
data class Performance(
    val batting: BattingPerformance? = null,
    val pitching: PitchingPerformance? = null,
)

@Serializable
data class Player(
    val id: Long,
    val name: String,
    val age: Int? = null,
    val position: String,
    val isActive: Boolean = true,
    val condition: Int? = null,
    val fatigue: Int? = null,
    val batting: Batting? = null,
    val pitching: Pitching? = null,
    val fielding: Fielding? = null,
    val physical: Physical? = null,
    val positionFitness: Map<String, Int> = emptyMap(),
    val performance: Performance? = null,
) {
    /** 守備位置の適性。本職は100（Web 版 lineupEdit.js の positionFitness と同じ決まり） */
    fun fitness(pos: String): Int = if (position == pos) 100 else positionFitness[pos] ?: 0
    val isPitcher: Boolean get() = position == "pitcher"
}

@Serializable
data class AuthSession(
    val userId: String,
    val accessToken: String,
    val sessionId: String,
    val refreshToken: String? = null,
    /** アクセストークンの期限（エポックミリ秒）。ローカルの開発サーバーでは無い */
    val expiresAt: Long? = null,
)

@Serializable
data class RefreshResult(
    val accessToken: String,
    val refreshToken: String? = null,
    val expiresAt: Long? = null,
    val userId: String? = null,
)
