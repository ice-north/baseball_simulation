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
import jp.icenorth.baseball.shared.GAME_TIPS
import jp.icenorth.baseball.shared.STATUS_LABELS
import jp.icenorth.baseball.shared.ScheduledGame
import jp.icenorth.baseball.shared.formatTurn
import jp.icenorth.baseball.shared.buildFrontPage
import jp.icenorth.baseball.shared.teamLabel
import jp.icenorth.baseball.shared.teamShort
import jp.icenorth.baseball.shared.turnOfDate
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(model: AppViewModel, onOpenLineup: () -> Unit, onOpenProcedures: () -> Unit, onRename: () -> Unit, onOpenGames: () -> Unit = {}, onOpenTips: () -> Unit = {}) {
    val view = model.view
    // ⚠ ホームを開くたびに選び直す（LazyColumn の項目の中で選ぶと、スクロールで出入りするたびに変わる）
    val tip = remember { GAME_TIPS.random() }
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
        // 1面の主役を書くため、自球団の最新の試合の詳細を読む（終わった試合は変わらないので一度読めば使い回す）
        val last = view.results.lastOrNull { it.home == team || it.away == team }
        var lastGame by remember { mutableStateOf<JsonObject?>(null) }
        LaunchedEffect(last?.gameId, view.year) {
            lastGame = null
            val id = last?.gameId ?: return@LaunchedEffect
            lastGame = runCatching { model.read("game", mapOf("id" to "$id", "year" to "${view.year ?: ""}")) }
                .onFailure { if (it is kotlinx.coroutines.CancellationException) throw it }
                .getOrNull()
        }
        val page = remember(view, model.raw, lastGame) { buildFrontPage(view, model.raw, lastGame) }
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize().statusBarsPadding(),
        ) {
            item(key = "head") { Header(view, model, onRename, onOpenTips) }
            val alerts = pendingAlerts(view, model.raw)
            if (alerts.isNotEmpty()) {
                item(key = "alerts") { AlertCard(alerts, onOpenProcedures) }
            }
            // TIPSは題名だけの1行（押すと中身）。ホームを開くたびに変わる
            item(key = "tip") { HomeTipCard(tip, onOpenAll = onOpenTips) }
            // ⚠ 数字の表（順位表・タイトル争い・リーグ便り）は試合タブへ移した（いしだの指定）。ホームは新聞の紙面
            item(key = "paper") { FrontPageCard(page, onOpenGames = onOpenGames, onOpenLineup = onOpenLineup) }
        }
    }
}

@Composable
private fun Header(view: LeagueView, model: AppViewModel, onRename: () -> Unit, onOpenTips: () -> Unit) {
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
                        DropdownMenuItem(text = { Text("ゲームのTIPS") }, onClick = { menu = false; onOpenTips() })
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

