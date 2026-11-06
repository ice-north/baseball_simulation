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

private val Tokyo = ZoneId.of("Asia/Tokyo")
private val DeadlineFormat = DateTimeFormatter.ofPattern("M/d HH:mm")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(model: AppViewModel, onOpenLineup: () -> Unit) {
    val view = model.view
    PullToRefreshBox(
        isRefreshing = model.refreshing,
        onRefresh = { model.reload(pull = true) },
        modifier = Modifier.fillMaxSize(),
    ) {
        if (view == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("読み込み中…") }
            return@PullToRefreshBox
        }
        if (view.setupRequired || view.teamName == null) {
            NotJoined(model)
            return@PullToRefreshBox
        }
        val team = view.teamName
        val ownGames = view.nextGames.filter { it.home == team || it.away == team }
        val ownResults = view.results.filter { it.home == team || it.away == team }.asReversed()
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize().statusBarsPadding(),
        ) {
            item(key = "head") { Header(view, model) }
            view.phase?.let { phase ->
                item(key = "phase") { PhaseCard(phase.label ?: "手続き", phase.deadline ?: view.phaseDeadline, model.endpoint) }
            }
            if (ownGames.isNotEmpty()) {
                item(key = "next") {
                    Section("次の試合") {
                        ownGames.take(3).forEach { NextGameRow(view, it) }
                        TextButton(onClick = onOpenLineup) { Text("打順を決める →") }
                    }
                }
            }
            if (ownResults.isNotEmpty()) {
                item(key = "results") {
                    Section("最近の試合") { ownResults.take(5).forEach { ResultRow(view, it) } }
                }
            }
            item(key = "standings") { Standings(view) }
        }
    }
}

@Composable
private fun Header(view: LeagueView, model: AppViewModel) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(view.teamLabel(view.teamName!!), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                TextButton(onClick = model::logout) { Text("ログアウト") }
            }
            Text(
                "${formatTurn(view.currentDate, view.seasonTurns)} · ${STATUS_LABELS[view.status] ?: view.status.orEmpty()}",
                style = MaterialTheme.typography.bodyMedium,
            )
            Countdown(view.nextAdvanceAt)
        }
    }
}

/** 次の進行（毎正時）までの残り時間。1秒ごとに数え直す */
@Composable
private fun Countdown(iso: String?) {
    val at = remember(iso) { iso?.let { runCatching { Instant.parse(it) }.getOrNull() } }
    if (at == null) {
        Text("次の進行: 停止中", style = MaterialTheme.typography.bodySmall)
        return
    }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(at) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1000)
        }
    }
    val left = ((at.toEpochMilli() - now) / 1000).coerceAtLeast(0)
    Row(verticalAlignment = Alignment.Bottom) {
        Text("次の進行まで ", style = MaterialTheme.typography.bodyMedium)
        Text(
            if (left == 0L) "進行中…" else "%d:%02d".format(left / 60, left % 60),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.secondary,
        )
    }
}

@Composable
private fun PhaseCard(label: String, deadline: String?, endpoint: String) {
    val context = LocalContext.current
    val due = deadline?.let { runCatching { DeadlineFormat.format(Instant.parse(it).atZone(Tokyo)) }.getOrNull() }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("未完了の手続き: $label", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            if (due != null) Text("締め切り $due", color = MaterialTheme.colorScheme.secondary)
            Text("手続きの画面はアプリでは準備中です。いまは Web 版で決めてください。", style = MaterialTheme.typography.bodySmall)
            FilledTonalButton(onClick = {
                val site = endpoint.substringBefore("/api/") + "/online"
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(site)))
            }) { Text("Web 版を開く") }
        }
    }
}

@Composable
private fun NotJoined(model: AppViewModel) {
    Column(
        Modifier.fillMaxSize().statusBarsPadding().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("まだリーグに参加していません", style = MaterialTheme.typography.titleMedium)
        Text("参加とリーグの作成は Web 版で行ってください。参加後、下に引っ張ると更新されます。", textAlign = TextAlign.Center)
        TextButton(onClick = model::logout) { Text("ログアウト") }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            content()
        }
    }
}

@Composable
private fun NextGameRow(view: LeagueView, game: ScheduledGame) {
    val home = game.home == view.teamName
    val opponent = if (home) game.away else game.home
    val own = if (home) game.homeStarterInfo else game.awayStarterInfo
    val their = if (home) game.awayStarterInfo else game.homeStarterInfo
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                turnOfDate(game.date, view.seasonTurns)?.let { "第${it}ターン" } ?: "",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.width(84.dp),
            )
            Text("${if (home) "vs" else "@"} ${view.teamLabel(opponent)}", fontWeight = FontWeight.SemiBold)
        }
        if (own?.name != null || their?.name != null) {
            Text(
                "先発 ${own?.name ?: "未定"}  対  ${their?.name ?: "未定"}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 84.dp),
            )
        }
    }
}

@Composable
private fun ResultRow(view: LeagueView, game: GameResult) {
    val home = game.home == view.teamName
    val ownScore = (if (home) game.homeScore else game.awayScore) ?: return
    val theirScore = (if (home) game.awayScore else game.homeScore) ?: return
    val opponent = if (home) game.away else game.home
    val (mark, color) = when {
        ownScore > theirScore -> "○" to WinColor
        ownScore < theirScore -> "●" to LoseColor
        else -> "△" to MaterialTheme.colorScheme.onSurfaceVariant
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(mark, color = color, fontWeight = FontWeight.Bold, modifier = Modifier.width(28.dp))
        Text("$ownScore - $theirScore", fontWeight = FontWeight.Bold, modifier = Modifier.width(64.dp))
        Text("${if (home) "vs" else "@"} ${view.teamShort(opponent)}", modifier = Modifier.weight(1f))
        val pitcher = game.decisions?.let { if (ownScore > theirScore) it.winningPitcher else it.losingPitcher }
        pitcher?.name?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun Standings(view: LeagueView) {
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
