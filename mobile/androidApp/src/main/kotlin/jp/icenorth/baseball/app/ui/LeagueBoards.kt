package jp.icenorth.baseball.app.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import jp.icenorth.baseball.app.AppViewModel
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.mutableStateOf
import jp.icenorth.baseball.shared.CAMP_ROUNDS
import jp.icenorth.baseball.shared.PHASE_LABELS
import jp.icenorth.baseball.shared.at
import jp.icenorth.baseball.shared.bool
import jp.icenorth.baseball.shared.int
import jp.icenorth.baseball.shared.list
import jp.icenorth.baseball.shared.num
import jp.icenorth.baseball.shared.obj
import jp.icenorth.baseball.shared.rate3
import jp.icenorth.baseball.shared.str
import kotlinx.serialization.json.JsonObject
import jp.icenorth.baseball.shared.GameResult
import jp.icenorth.baseball.shared.LEAGUE_NAMES
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.STATUS_LABELS
import jp.icenorth.baseball.shared.ScheduledGame
import jp.icenorth.baseball.shared.formatTurn
import jp.icenorth.baseball.shared.teamLabel
import jp.icenorth.baseball.shared.teamShort
import jp.icenorth.baseball.shared.turnOfDate
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter



// 試合タブの「順位表・タイトル争い・リーグ便り」（以前はホームにあった。ホームは新聞の紙面にした）

@Composable
fun StandingsBoard(view: LeagueView) {
    // 2部制なら部ごとに分ける（teamLeagues が無い古いビューは1つの表）
    val groups = if (view.teamLeagues.isEmpty()) {
        listOf("順位" to view.standings)
    } else {
        view.standings.groupBy { view.teamLeagues[it.team] ?: "" }.toSortedMap()
            .map { (id, rows) -> "${LEAGUE_NAMES[id] ?: id} 順位" to rows }
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) { groups.forEach { (title, rows) ->
        Section(title) {
            val top = rows.firstOrNull()
            rows.forEachIndexed { i, row ->
                val own = row.team == view.teamName
                val gap = top?.let { ((it.wins - it.losses) - (row.wins - row.losses)) / 2.0 } ?: 0.0
                Row(
                    Modifier
                        .fillMaxWidth()
                        .background(
                            if (own) MaterialTheme.colorScheme.primary.copy(alpha = 0.18f) else MaterialTheme.colorScheme.surfaceContainer,
                            RoundedCornerShape(6.dp),
                        )
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("${i + 1}", modifier = Modifier.width(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(view.teamShort(row.team), fontWeight = if (own) FontWeight.Bold else FontWeight.Normal, modifier = Modifier.weight(1f))
                    Text("${row.wins}-${row.losses}-${row.draws}", modifier = Modifier.width(80.dp), textAlign = TextAlign.End)
                    Text(if (i == 0 || gap == 0.0) "-" else "%.1f".format(gap), modifier = Modifier.width(44.dp), textAlign = TextAlign.End)
                }
            }
        }
    }
}
}

/** タイトル争い（リーグの上位） */
@Composable
fun LeadersBoard(view: LeagueView, boards: List<JsonObject>) {
    var selected by remember { mutableStateOf(boards.first().at("id").str().orEmpty()) }
    val board = boards.firstOrNull { it.at("id").str() == selected } ?: boards.first()
    val digits = board.at("digits").int() ?: 0
    Section("タイトル争い") {
        ChoiceRow(boards.map { it.at("id").str().orEmpty() to it.at("label").str().orEmpty() }, board.at("id").str()) { selected = it }
        board.at("rows").list().mapNotNull { it.obj() }.take(5).forEachIndexed { i, row ->
            val mine = row.at("team").str() == view.teamName
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${i + 1}", modifier = Modifier.width(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(row.at("name").str().orEmpty(), fontWeight = if (mine) FontWeight.Bold else FontWeight.Normal, color = if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
                Text(view.teamShort(row.at("team").str().orEmpty()), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(end = 12.dp))
                val v = row.at("value").num()
                Text(
                    when {
                        v == null -> "-"
                        digits == 3 -> rate3(v)
                        digits > 0 -> "%.${digits}f".format(v)
                        else -> v.toInt().toString()
                    },
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

private val NOTICE_LABELS = mapOf("draft" to "NPBドラフト", "tryout" to "トライアウト", "promotion" to "昇格・降格", "trade" to "トレード")

/** リーグ便り（ドラフト・トライアウト・昇降格・トレードと、過去のシーズンの最終順位） */
@Composable
fun NewsBoard(view: LeagueView, raw: JsonObject) {
    val notices = raw.at("notices").list().mapNotNull { it.obj() }
    val history = raw.at("history").list().mapNotNull { it.obj() }
    Section("リーグ便り") {
        if (notices.isEmpty() && history.isEmpty()) {
            Muted("リーグの動きがここに届きます。")
            return@Section
        }
        val options = notices.mapIndexed { i, n ->
            "n$i" to "${n.at("year").int() ?: ""}年 ${NOTICE_LABELS[n.at("type").str()] ?: "お知らせ"}"
        } + history.mapIndexed { i, h -> "h$i" to "${h.at("year").int() ?: ""}年の最終順位" }
        var selected by remember { mutableStateOf(options.first().first) }
        var expanded by remember { mutableStateOf(false) }
        val key = options.firstOrNull { it.first == selected }?.first ?: options.first().first
        ChoiceRow(options.take(if (expanded) options.size else 4), key) { selected = it }
        if (options.size > 4 && !expanded) TextButton(onClick = { expanded = true }) { Text("ほかのお知らせ（${options.size - 4}件）") }
        val index = key.drop(1).toInt()
        if (key.startsWith("n")) {
            val notice = notices[index]
            val items = (notice["picks"] ?: notice["moves"]).list().mapNotNull { it.obj() }
            items.forEach { p ->
                if (notice.at("type").str() == "promotion") {
                    val from = p.at("from").str(); val to = p.at("to").str()
                    val up = (from == "B" && to == "A")
                    Text("${view.teamShort(p.at("teamId").str().orEmpty())}  ${LEAGUE_NAMES[from] ?: from} → ${LEAGUE_NAMES[to] ?: to}${if (up) "（昇格）" else "（降格）"}")
                } else {
                    val round = p["round"]?.let { r -> r.int()?.let { "${it}巡" } ?: r.str() }
                    Row {
                        Text(listOfNotNull(round, p.at("name").str()).joinToString(" "), fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Muted("→ ${view.teamShort(p.at("npbTeam").str() ?: p.at("team").str().orEmpty())}")
                    }
                }
            }
        } else {
            history[index].at("standings").list().mapNotNull { it.obj() }.forEachIndexed { i, s ->
                Text("${i + 1}. ${view.teamLabel(s.at("team").str().orEmpty())}　${s.at("wins").int() ?: 0}勝${s.at("losses").int() ?: 0}敗")
            }
        }
    }
}

