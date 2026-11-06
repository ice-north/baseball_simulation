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


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(model: AppViewModel, onOpenLineup: () -> Unit, onOpenProcedures: () -> Unit, onRename: () -> Unit) {
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
            item(key = "head") { Header(view, model, onRename) }
            val alerts = pendingAlerts(view, model.raw)
            if (alerts.isNotEmpty()) {
                item(key = "alerts") { AlertCard(alerts, onOpenProcedures) }
            }
            if (ownGames.isNotEmpty()) {
                item(key = "next") {
                    Section("次の試合") {
                        ownGames.take(3).forEach { NextGameRow(view, it) }
                        TextButton(onClick = onOpenLineup) { Text("編成を決める →") }
                    }
                }
            }
            if (ownResults.isNotEmpty()) {
                item(key = "results") {
                    Section("最近の試合") { ownResults.take(5).forEach { ResultRow(view, it) } }
                }
            }
            item(key = "standings") { Standings(view) }
            model.raw?.let { raw ->
                val leaders = raw.at("leaders").list().mapNotNull { it.obj() }.filter { it.at("rows").list().isNotEmpty() }
                if (leaders.isNotEmpty()) item(key = "leaders") { Leaders(view, leaders) }
                item(key = "news") { News(view, raw) }
            }
        }
    }
}

@Composable
private fun Header(view: LeagueView, model: AppViewModel, onRename: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(view.teamLabel(view.teamName!!), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "メニュー") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(text = { Text("最新に更新") }, onClick = { menu = false; model.reload(pull = true) })
                        DropdownMenuItem(text = { Text("球団名・名前を変える") }, onClick = { menu = false; onRename() })
                        DropdownMenuItem(text = { Text("ログアウト") }, onClick = { menu = false; model.logout() })
                    }
                }
            }
            val standing = ownStanding(view)
            Text(
                listOfNotNull(
                    view.teamLeagues[view.teamName]?.let { LEAGUE_NAMES[it] },
                    standing,
                    formatTurn(view.currentDate, view.seasonTurns),
                    STATUS_LABELS[view.status] ?: view.status,
                ).joinToString(" · "),
                style = MaterialTheme.typography.bodyMedium,
            )
            Countdown(view.nextAdvanceAt)
        }
    }
}

/** 自球団の部の中の順位と勝敗 */
private fun ownStanding(view: LeagueView): String? {
    val league = view.teamLeagues[view.teamName]
    val rows = view.standings.filter { league == null || view.teamLeagues[it.team] == league }
    val i = rows.indexOfFirst { it.team == view.teamName }
    if (i < 0) return null
    val r = rows[i]
    return "${i + 1}位 ${r.wins}勝${r.losses}敗${if (r.draws > 0) "${r.draws}分" else ""}"
}

/** 自分の番の手続き・初期メンバー選択・返事待ちのトレード */
private fun pendingAlerts(view: LeagueView, raw: JsonObject?): List<String> = buildList {
    if (view.pendingPack != null) add("初期メンバーを選んでください")
    view.phase?.let { phase ->
        val due = formatDeadline(phase.deadline ?: view.phaseDeadline)
        val label = phase.kind?.let { PHASE_LABELS[it] } ?: phase.label ?: "手続き"
        val ready = raw?.at("phase", "submission", "ready").bool() == true
        val campDone = phase.kind == "camp" && (raw?.at("phase", "camp", "rounds").int() ?: 0) >= (raw?.at("phase", "camp", "total").int() ?: CAMP_ROUNDS)
        add(
            when {
                campDone -> "$label: 全クール終了（ほかの球団を待っています）"
                ready -> "$label: 決定済み（変更もできます）"
                else -> "$label を決めてください" + (due?.let { "（締め切り $it）" } ?: "")
            },
        )
    }
    val waiting = raw?.at("trades").list().count { it.at("myTurn").bool() == true }
    if (waiting > 0) add("トレードの提案に返事が必要です（${waiting}件）")
}

@Composable
private fun AlertCard(alerts: List<String>, onOpen: () -> Unit) {
    Card(
        onClick = onOpen,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f)),
    ) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            alerts.forEach { Text(it, fontWeight = FontWeight.SemiBold) }
            Text("手続きを開く →", color = MaterialTheme.colorScheme.secondary, style = MaterialTheme.typography.labelLarge)
        }
    }
}

/** タイトル争い（リーグの上位） */
@Composable
private fun Leaders(view: LeagueView, boards: List<JsonObject>) {
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
private fun News(view: LeagueView, raw: JsonObject) {
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
private fun NotJoined(model: AppViewModel) {
    val joinable = model.raw?.at("joinRequired").bool() == true
    Column(
        Modifier.fillMaxSize().statusBarsPadding().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (joinable) {
            Text("リーグに参加する", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "空いている球団のうち、下の階層で一番弱いものを引き継ぎます。このあと初期メンバーのセットを選び、球団名とプレイヤー名を決めます。",
                textAlign = TextAlign.Center,
            )
            FilledTonalButton(onClick = { model.command("join", JsonObject(emptyMap()), label = "参加しています…", done = "リーグに参加しました") }) { Text("参加する") }
        } else {
            Text("リーグがまだありません", style = MaterialTheme.typography.titleMedium)
            Text("リーグの作成は管理者が Web 版で行います。作成後、下に引っ張ると更新されます。", textAlign = TextAlign.Center)
        }
        TextButton(onClick = model::logout) { Text("別のアカウントでログインし直す") }
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
