package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import jp.icenorth.baseball.shared.packWaiting
import jp.icenorth.baseball.shared.CAMP_ROUNDS
import jp.icenorth.baseball.shared.PHASE_LABELS
import jp.icenorth.baseball.shared.at
import jp.icenorth.baseball.shared.bool
import jp.icenorth.baseball.shared.int
import jp.icenorth.baseball.shared.list
import jp.icenorth.baseball.shared.str
import kotlinx.serialization.json.JsonObject
import jp.icenorth.baseball.shared.GameResult
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.buildFrontPage
import jp.icenorth.baseball.shared.buildNationalPage
import jp.icenorth.baseball.shared.BackIssue
import jp.icenorth.baseball.shared.backIssueKey
import jp.icenorth.baseball.shared.Player
import jp.icenorth.baseball.shared.OnlineJson
import androidx.compose.material3.FilterChip
import androidx.compose.material3.AlertDialog
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.lazy.items
import jp.icenorth.baseball.shared.appVersionArticle
import jp.icenorth.baseball.shared.APP_DOWNLOAD_URL
import jp.icenorth.baseball.shared.LINK_APP_UPDATE
import androidx.compose.ui.platform.LocalUriHandler
import jp.icenorth.baseball.shared.loadOwnHistory
import jp.icenorth.baseball.shared.OWN_HISTORY_PAGE
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import androidx.compose.runtime.SideEffect
import jp.icenorth.baseball.shared.FrontPage
import jp.icenorth.baseball.shared.GAME_TIPS
import jp.icenorth.baseball.shared.LINK_GAMES
import jp.icenorth.baseball.shared.LINK_LINEUP
import jp.icenorth.baseball.shared.LINK_TIPS
import androidx.compose.material3.HorizontalDivider


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
        val team = view.teamName.orEmpty() // 上で参加前（null）は返している
        // 1面の主役を書くため、自球団の最新の試合の詳細を読む（終わった試合は変わらないので一度読めば使い回す）。
        // 連勝・連敗と対戦成績のため、今季の自球団の試合も読む（ビューには直近の数試合しか無い）
        val last = view.results.lastOrNull { it.home == team || it.away == team }
        var lastGame by remember { mutableStateOf<JsonObject?>(null) }
        var history by remember { mutableStateOf<Pair<List<GameResult>, Boolean>?>(null) }
        // 次の相手の名簿（地元紙の「警戒警報」）。読めなければ記事を出さないだけ
        val next = view.nextGames.firstOrNull { it.home == team || it.away == team }
        val oppName = next?.let { if (it.home == team) it.away else it.home }
        var opponent by remember(oppName) { mutableStateOf<List<Player>?>(null) }
        LaunchedEffect(oppName, view.revision) {
            val name = oppName ?: return@LaunchedEffect
            opponent = runCatching {
                model.read("team", mapOf("team" to name)).at("roster").list().mapNotNull { e ->
                    runCatching { OnlineJson.decodeFromJsonElement(Player.serializer(), e) }.getOrNull()
                }
            }.onFailure { if (it is kotlinx.coroutines.CancellationException) throw it }.getOrNull()
        }
        // ⚠ 読み終わるまで紙面を作り直さない（詳細の無い紙面を出してから差し替えると、見出しが一瞬で変わって見えた）
        var ready by remember(last?.gameId) { mutableStateOf(last?.gameId == null) }
        LaunchedEffect(last?.gameId, view.year) {
            val id = last?.gameId ?: return@LaunchedEffect
            val year = "${view.year ?: ""}"
            // ⚠ 2つは同時に読む（順に読むと待ち時間が足し算になる）
            coroutineScope {
                val game = async {
                    runCatching { model.read("game", mapOf("id" to "$id", "year" to year)) }
                        .onFailure { if (it is kotlinx.coroutines.CancellationException) throw it }
                        .getOrNull()
                }
                val games = async {
                    runCatching {
                        loadOwnHistory(team) { page ->
                            model.read("games", mapOf("year" to year, "page" to "$page", "scope" to "own", "size" to "$OWN_HISTORY_PAGE"))
                        }
                    }
                        .onFailure { if (it is kotlinx.coroutines.CancellationException) throw it }
                        .getOrNull()
                }
                lastGame = game.await()
                history = games.await()
            }
            ready = true
        }
        // TIPS は紙面のコラムに1本（ホームを開くたびに選び直す。いしだの指定「ホームを表示するたびにランダムで1つ」）
        val tip = remember { GAME_TIPS.random() }
        val alerts = pendingAlerts(view, model.raw)
        // 入っているアプリが最新か（いしだの指定: 紙面の記事で知らせる）
        val app = remember(model.latestApp) { appVersionArticle(model.appBuild, model.latestApp) }
        var shown by remember { mutableStateOf<FrontPage?>(null) }
        val built = if (ready) {
            remember(view, model.raw, lastGame, history, tip, alerts, app, opponent) {
                buildFrontPage(
                    view, model.raw, lastGame, alerts,
                    column = FrontPage.Article("コラム", tip.title, tip.body, LINK_TIPS),
                    history = history?.first,
                    historyComplete = history?.second == true,
                    app = app,
                    opponent = opponent,
                )
            }
        } else null
        SideEffect { if (built != null) shown = built }
        val localPage = built ?: shown
        if (localPage == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("紙面を刷っています…") }
            return@PullToRefreshBox
        }
        // 全国紙（リーグ全体を中立に）。題字の下の行は地元紙と同じ
        val national = remember(localPage, view, model.raw) { buildNationalPage(view, model.raw, localPage) }
        val paper = FrontPage.Paper.entries.firstOrNull { it.name == model.homePaper } ?: FrontPage.Paper.Local
        val page = if (paper == FrontPage.Paper.National) national else localPage
        // バックナンバー（その日の両紙の見出しを端末に残す）
        LaunchedEffect(localPage.headline, national.headline) {
            backIssueKey(view)?.let { key -> model.recordBackIssue(BackIssue(key, localPage.issue, localPage.headline, national.headline)) }
        }
        var showBack by remember { mutableStateOf(false) }
        if (showBack) BackNumberDialog(model.backIssues, localPage.title) { showBack = false }
        val style = homeStyleOf(model.homeStyle)
        val uriHandler = LocalUriHandler.current
        LazyColumn(
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 72.dp), // 左下の TIPS の印に隠れないよう
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize().statusBarsPadding(),
        ) {
            // ⚠ ホームは記事1枚にまとめる（いしだの指定）。球団名・順位・進行の残り時間・手続きの知らせも紙面の中に置く。
            //    数字の表（順位表・タイトル争い・リーグ便り）は試合タブ
            item(key = "paper") {
                PaperTabs(paper, localPage.title) { model.changeHomePaper(it.name) }
            }
            item(key = "page") {
                HomePage(
                    style = style,
                    page = page,
                    nextAdvanceAt = view.nextAdvanceAt,
                    menu = { HomeMenu(model, style, onRename, onOpenTips, onOpenBack = { showBack = true }) },
                    onLink = { link ->
                        when (link) {
                            LINK_LINEUP -> onOpenLineup()
                            LINK_GAMES -> onOpenGames()
                            LINK_TIPS -> onOpenTips()
                            LINK_APP_UPDATE -> runCatching { uriHandler.openUri(APP_DOWNLOAD_URL) }
                        }
                    },
                    onOpenProcedures = onOpenProcedures,
                )
            }
        }
    }
}

/** 地元紙と全国紙の切り替え（紙面の上に小さく。どの見た目でも同じ） */
@Composable
private fun PaperTabs(paper: FrontPage.Paper, localTitle: String, onChange: (FrontPage.Paper) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FrontPage.Paper.entries.forEach { p ->
            FilterChip(
                selected = p == paper,
                onClick = { onChange(p) },
                label = { Text(if (p == FrontPage.Paper.Local) "地元紙　$localTitle" else "全国紙　NEXT STAGE") },
            )
        }
    }
}

/** 紙面のバックナンバー（新しい日から。両紙の1面の見出し） */
@Composable
private fun BackNumberDialog(issues: List<BackIssue>, localTitle: String, onClose: () -> Unit) {
    AlertDialog(
        onDismissRequest = onClose,
        confirmButton = { TextButton(onClick = onClose) { Text("閉じる") } },
        title = { Text("紙面のバックナンバー") },
        text = {
            if (issues.isEmpty()) Text("まだありません。ホームを開くたびに、その日の1面の見出しを残します。")
            else LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(issues.asReversed(), key = { it.key }) { b ->
                    Column {
                        Text("${b.key / 10000}年目 ${b.issue}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("$localTitle：${b.local}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                        Text("NEXT STAGE：${b.national}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        },
    )
}

/** 紙面の右上のメニュー（更新・名前の変更・TIPS・ホームの見た目・ログアウト） */
@Composable
private fun HomeMenu(model: AppViewModel, style: HomeStyle, onRename: () -> Unit, onOpenTips: () -> Unit, onOpenBack: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "メニュー") }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text("最新に更新") }, onClick = { open = false; model.reload(pull = true) })
            DropdownMenuItem(text = { Text("球団名・名前を変える") }, onClick = { open = false; onRename() })
            DropdownMenuItem(text = { Text("ゲームのTIPS") }, onClick = { open = false; onOpenTips() })
            DropdownMenuItem(text = { Text("紙面のバックナンバー") }, onClick = { open = false; onOpenBack() })
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
    // ⚠ 初期メンバーを待っている間は、リーグの手続きはCPUが決める（`Notices.kt` と同じ決まり）
    if (view.pendingPack != null) {
        // ⚠ 選び終えたら「いつ自分の球団になるか」を出す（Web 版のホームの「開幕待ち」と同じ）
        val waiting = packWaiting(raw)
        add(
            if (waiting != null) "開幕待ち: 「${waiting.packName}」で、${packStartText(waiting.joinsAt, waiting.estimated)}あなたの球団になります"
            else "初期メンバーを選んでください",
        )
    } else view.phase?.let { phase ->
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
    // ⚠ シーズン後の手続きの合間・開幕待ちも知らせる（いしだ指摘: いまの段階と次に何が来るのかが分からない）
    if (view.pendingPack == null && view.phase == null && raw?.at("stage", "key").str().let { it != null && it != "season" })
        stageHeadText(raw)?.let { add("オフ: $it") }
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

