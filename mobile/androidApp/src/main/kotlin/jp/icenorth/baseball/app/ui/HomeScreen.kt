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
import jp.icenorth.baseball.shared.buildFrontPage
import jp.icenorth.baseball.shared.FrontPage
import jp.icenorth.baseball.shared.GAME_TIPS
import jp.icenorth.baseball.shared.LINK_GAMES
import jp.icenorth.baseball.shared.LINK_LINEUP
import jp.icenorth.baseball.shared.LINK_TIPS
import androidx.compose.material3.HorizontalDivider
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
        // TIPS は紙面のコラムに1本（ホームを開くたびに選び直す。いしだの指定「ホームを表示するたびにランダムで1つ」）
        val tip = remember { GAME_TIPS.random() }
        val alerts = pendingAlerts(view, model.raw)
        val page = remember(view, model.raw, lastGame, tip, alerts) {
            buildFrontPage(view, model.raw, lastGame, alerts, FrontPage.Article("コラム", tip.title, tip.body, LINK_TIPS))
        }
        val style = homeStyleOf(model.homeStyle)
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize().statusBarsPadding(),
        ) {
            // ⚠ ホームは記事1枚にまとめる（いしだの指定）。球団名・順位・進行の残り時間・手続きの知らせも紙面の中に置く。
            //    数字の表（順位表・タイトル争い・リーグ便り）は試合タブ
            item(key = "page") {
                HomePage(
                    style = style,
                    page = page,
                    nextAdvanceAt = view.nextAdvanceAt,
                    menu = { HomeMenu(model, style, onRename, onOpenTips) },
                    onLink = { link ->
                        when (link) {
                            LINK_LINEUP -> onOpenLineup()
                            LINK_GAMES -> onOpenGames()
                            LINK_TIPS -> onOpenTips()
                        }
                    },
                    onOpenProcedures = onOpenProcedures,
                )
            }
        }
    }
}

/** 紙面の右上のメニュー（更新・名前の変更・TIPS・ホームの見た目・ログアウト） */
@Composable
private fun HomeMenu(model: AppViewModel, style: HomeStyle, onRename: () -> Unit, onOpenTips: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "メニュー") }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text("最新に更新") }, onClick = { open = false; model.reload(pull = true) })
            DropdownMenuItem(text = { Text("球団名・名前を変える") }, onClick = { open = false; onRename() })
            DropdownMenuItem(text = { Text("ゲームのTIPS") }, onClick = { open = false; onOpenTips() })
            HorizontalDivider()
            Text("ホームの見た目", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp))
            HomeStyle.entries.forEach { s ->
                DropdownMenuItem(
                    text = { Text((if (s == style) "● " else "○ ") + s.label) },
                    onClick = { open = false; model.changeHomeStyle(s.name) },
                )
            }
            HorizontalDivider()
            DropdownMenuItem(text = { Text("ログアウト") }, onClick = { open = false; model.logout() })
        }
    }
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

