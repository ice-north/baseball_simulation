package jp.icenorth.baseball.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Badge
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.icenorth.baseball.shared.StatColumn
import jp.icenorth.baseball.shared.abilityRank
import jp.icenorth.baseball.shared.at
import jp.icenorth.baseball.shared.conditionIcon
import jp.icenorth.baseball.shared.formatStat
import jp.icenorth.baseball.shared.int
import jp.icenorth.baseball.shared.positionLabel
import jp.icenorth.baseball.shared.statRank
import jp.icenorth.baseball.shared.str
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val Tokyo = ZoneId.of("Asia/Tokyo")
private val DeadlineFormat = DateTimeFormatter.ofPattern("M/d(E) H:mm", Locale.JAPANESE)

/** 締め切りなどの日時（日本時間） */
fun formatDeadline(iso: String?): String? =
    iso?.let { runCatching { formatDateTime(Instant.parse(it).toEpochMilli()) }.getOrNull() }

/** 日時（日本時間。「11/12(木) 0:00」）。締め切りと同じ書き方 */
fun formatDateTime(epochMillis: Long): String = DeadlineFormat.format(Instant.ofEpochMilli(epochMillis).atZone(Tokyo))

/**
 * 保存・提出などの間、画面全体を塞ぐ。
 * ⚠ 押せないだけでなく、スクロールや戻る操作も止める（途中で別の画面に移ると、
 *    送り終えた結果を受け取る画面が無くなり、保存できたのか分からなくなる）。
 */
@Composable
fun BusyOverlay(label: String) {
    BackHandler(enabled = true) {}
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f))
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) awaitPointerEvent().changes.forEach { it.consume() }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainerHigh, tonalElevation = 6.dp) {
            Row(Modifier.padding(horizontal = 24.dp, vertical = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(28.dp), strokeWidth = 3.dp)
                Text(label.ifEmpty { "保存中…" }, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 16.dp))
            }
        }
    }
}

@Composable
fun Section(title: String? = null, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null, content: @Composable () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer), modifier = modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (title != null || trailing != null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(title.orEmpty(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    trailing?.invoke()
                }
            }
            content()
        }
    }
}

@Composable
fun Muted(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier)
}

@Composable
fun Caption(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 12.dp, bottom = 2.dp, start = 4.dp),
    )
}

/** 能力値。⚠ 文字のランクだけにせず、数字をランクの色で出す（以前の指摘） */
@Composable
fun AbilityNum(label: String?, value: Int?, velocity: Boolean = false, stamina: Boolean = false) {
    // 字の見出しと数字はベースラインでそろえる（下ぞろえだと大きさの違う字の高さがずれる）
    Row {
        if (label != null) Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.alignByBaseline())
        Text(
            value?.toString() ?: "—",
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Bold,
            color = value?.let { rankColor(abilityRank(it, velocity, stamina)) } ?: MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.alignByBaseline(),
        )
    }
}

/**
 * 読み込みに失敗したときの知らせと「読み直す」（試合・選手・成績・指導者・ホームで同じ形）。
 * ⚠ 以前は画面ごとに「読み込めませんでした: …」だけを出していて、読み直すには画面を離れて戻るしかなかった
 */
@Composable
fun LoadFailed(message: String, onRetry: () -> Unit, modifier: Modifier = Modifier, title: String = "読み込めませんでした") {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("$title: $message", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        OutlinedButton(onClick = onRetry) { Text("読み直す") }
    }
}

/** 選手の主な能力を1行で（投手は球速・制球・スタミナ、野手はミート・パワー・走力・守備） */
@Composable
fun AbilityLine(p: JsonObject) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (p.at("position").str() == "pitcher") {
            AbilityNum("速", p.at("pitching", "velocity").int(), velocity = true)
            AbilityNum("制", p.at("pitching", "control").int())
            AbilityNum("ス", p.at("pitching", "stamina").int(), stamina = true)
            // ⚠「回」だけだとキャンプのカードの「回復」と紛らわしいので「回転」。
            //    初期メンバーのパックなど回転を持たない一覧では出さない（「回—」と並んでいた）
            p.at("pitching", "spinRate").int()?.let { AbilityNum("回転", it) }
        } else {
            AbilityNum("ミ", p.at("batting", "meet").int())
            AbilityNum("パ", p.at("batting", "power").int())
            AbilityNum("走", p.at("physical", "speed").int())
            AbilityNum("守", p.at("fielding", "defense").int())
        }
    }
}

/** 名前・年齢・守備位置の1行（押すと選手の詳細） */
@Composable
fun PlayerName(p: JsonObject, onOpen: ((JsonObject) -> Unit)?, modifier: Modifier = Modifier, bold: Boolean = true) {
    Text(
        "${conditionIcon(p.at("condition").int())} ${p.at("name").str().orEmpty()}",
        fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier.then(if (onOpen != null) Modifier.clickable { onOpen(p) } else Modifier),
    )
}

@Composable
fun PlayerSummary(p: JsonObject, onOpen: ((JsonObject) -> Unit)?, trailing: (@Composable () -> Unit)? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                PlayerName(p, onOpen, Modifier.weight(1f, fill = false))
                Muted("  ${p.at("age").int() ?: "-"}歳 ${positionLabel(p.at("position").str())}")
            }
            AbilityLine(p)
        }
        trailing?.invoke()
    }
}

/**
 * 選択肢が数個のものはボタンを並べる（PC版の共通のルール。開かないと何があるか分からないものにしない）。
 * 幅が足りなければ折り返す。
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChoiceRow(options: List<Pair<String, String>>, selected: String?, enabled: Boolean = true, onSelect: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(0.dp)) {
        options.forEach { (key, label) ->
            FilterChip(selected = key == selected, onClick = { onSelect(key) }, enabled = enabled, label = { Text(label) })
        }
    }
}

/** 区分のタブ（成績の区分など）。横に流す */
@Composable
fun ChipTabs(
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    counts: Map<String, Int> = emptyMap(),
) {
    Row(
        modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        options.forEach { (key, label) ->
            val count = counts[key] ?: 0
            FilterChip(
                selected = key == selected,
                onClick = { onSelect(key) },
                label = { Text(label) },
                // 未完了の数（下のタブの数字と同じ数え方）
                trailingIcon = if (count > 0) ({ Badge { Text("$count") } }) else null,
            )
        }
    }
}

private val RowHeight = 40.dp
private val NameWidth = 118.dp

/**
 * 成績の表（PC版の「成績一覧」と同じ1つの形）。名前の列は固定し、数字の列だけ横に流す。
 * 見出しを押すと並べ替え（もう一度押すと逆順）。名前を押すと選手の詳細。
 */
@Composable
fun StatTable(
    players: List<JsonObject>,
    columns: List<StatColumn>,
    sortId: String?,
    ascending: Boolean,
    onSort: (StatColumn) -> Unit,
    onPlayer: (JsonObject) -> Unit,
    highlight: (JsonObject) -> Boolean = { false },
    sub: (JsonObject) -> String = { positionLabel(it.at("position").str()) },
    /** 1人もいないときの文（なぜいないのかは呼ぶ側が知っている） */
    empty: String = "該当する選手がいません",
) {
    val divider = MaterialTheme.colorScheme.outlineVariant
    val hScroll = rememberScrollState()
    // ⚠ 行の高さは文字の大きさの設定に合わせて伸ばす。dp で固定のままだと、端末の文字を大きくしている人では
    //    名前＋「守備 年齢」の2行が行に入りきらず、はみ出した下の行（年齢）に次の行の色付きの背景が重なって切れて見えた
    val rowHeight = RowHeight * androidx.compose.ui.platform.LocalDensity.current.fontScale.coerceAtLeast(1f)
    val colWidth: (StatColumn) -> Dp = { c -> if (c.label.length >= 4) 64.dp else 52.dp }
    Row(Modifier.fillMaxWidth()) {
        Column(Modifier.width(NameWidth)) {
            HeaderCell("選手", NameWidth, TextAlign.Start, null)
            players.forEach { p ->
                Row(
                    Modifier
                        .height(rowHeight)
                        .fillMaxWidth()
                        .background(if (highlight(p)) MaterialTheme.colorScheme.primary.copy(alpha = 0.14f) else Color.Transparent)
                        .clickable { onPlayer(p) }
                        .padding(start = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(
                            "${conditionIcon(p.at("condition").int())}${p.at("name").str().orEmpty()}",
                            fontSize = 13.sp,
                            // ⚠ 行の高さを決めて詰める。既定（本文の24sp）のままだと2行で行の高さを超え、
                            //    下の「守備 年齢」が次の行に食い込んでいた
                            lineHeight = 17.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(sub(p), fontSize = 10.sp, lineHeight = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    }
                }
            }
        }
        Column(Modifier.weight(1f).horizontalScroll(hScroll)) {
            Row {
                columns.forEach { c ->
                    val mark = if (c.id == sortId) (if (ascending) "▲" else "▼") else ""
                    HeaderCell(c.label + mark, colWidth(c), TextAlign.End) { onSort(c) }
                }
            }
            players.forEach { p ->
                Row(
                    Modifier
                        .height(rowHeight)
                        .background(if (highlight(p)) MaterialTheme.colorScheme.primary.copy(alpha = 0.14f) else Color.Transparent),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    columns.forEach { c ->
                        val v = c.get(p)
                        val rank = statRank(c, v)
                        Text(
                            formatStat(c, v),
                            fontSize = 13.sp,
                            textAlign = TextAlign.End,
                            fontWeight = if (rank != null) FontWeight.Bold else FontWeight.Normal,
                            color = rank?.let { rankColor(it) } ?: MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.width(colWidth(c)).padding(end = 6.dp),
                        )
                    }
                }
            }
        }
    }
    if (players.isEmpty()) Muted(empty, Modifier.padding(12.dp))
    Box(Modifier.fillMaxWidth().height(1.dp).border(1.dp, divider))
}

@Composable
private fun HeaderCell(text: String, width: Dp, align: TextAlign, onClick: (() -> Unit)?) {
    Box(
        Modifier
            .width(width)
            .height(32.dp)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 4.dp),
        contentAlignment = if (align == TextAlign.End) Alignment.CenterEnd else Alignment.CenterStart,
    ) {
        Text(text, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, fontWeight = FontWeight.SemiBold)
    }
}

/** 小さな札（「スタメン」「ローテ」「退団予定」など） */
@Composable
fun Tag(text: String, color: Color = MaterialTheme.colorScheme.secondary) {
    Text(
        text,
        fontSize = 10.sp,
        color = color,
        fontWeight = FontWeight.Bold,
        // 札の中で折り返さない（狭いと2行の札になって行の高さが崩れた）
        maxLines = 1,
        softWrap = false,
        modifier = Modifier.border(1.dp, color.copy(alpha = 0.6f), RoundedCornerShape(4.dp)).padding(horizontal = 4.dp, vertical = 1.dp),
    )
}

/**
 * 説明書き・注意書きを開く「ⓘ」。**画面に常に出さず、ここに詰める**（いしだ指定: アプリは狭いので場所が大事。
 * 操作のしかた・決まりごとの説明はここ。画面には数字と状態だけを置く）
 */
@Composable
fun InfoButton(title: String, lines: List<String>, modifier: Modifier = Modifier) {
    var open by rememberSaveable { mutableStateOf(false) }
    // ⚠ 押せる大きさは 48dp（以前は 32dp で、見出しの横の小さな印を押しそこねた）
    Box(
        modifier.size(48.dp).clickable { open = true },
        contentAlignment = Alignment.Center,
    ) {
        Text("ⓘ", fontSize = 18.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    if (open) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { open = false },
            confirmButton = { androidx.compose.material3.TextButton(onClick = { open = false }) { Text("閉じる") } },
            title = { Text(title) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    lines.forEach { Text(it, style = MaterialTheme.typography.bodyMedium) }
                }
            },
        )
    }
}

