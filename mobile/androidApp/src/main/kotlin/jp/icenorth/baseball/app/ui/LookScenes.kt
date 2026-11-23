package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.icenorth.baseball.shared.LeagueView
import jp.icenorth.baseball.shared.LiveScene
import jp.icenorth.baseball.shared.NEUTRAL_LOOK
import jp.icenorth.baseball.shared.TodaySide
import jp.icenorth.baseball.shared.at
import jp.icenorth.baseball.shared.hasLivePlays
import jp.icenorth.baseball.shared.str
import jp.icenorth.baseball.shared.fieldArt
import jp.icenorth.baseball.shared.highlightIndexes
import jp.icenorth.baseball.shared.liveScenes
import jp.icenorth.baseball.shared.playTone
import jp.icenorth.baseball.shared.stadiumArt
import jp.icenorth.baseball.shared.stadiumScene
import jp.icenorth.baseball.shared.teamLabel
import jp.icenorth.baseball.shared.teamShort
import jp.icenorth.baseball.shared.todayGameCard
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonObject

// ============================================================
// 新しい見た目（試作）段3: 試合タブの頭の「今日の一戦」の札と、試合の詳しい画面の打席速報。
// Web 版 `src/online/look/TodayGame.jsx`・`LivePlays.jsx` と同じ中身（文と絵は共通部の
// `TodayGame.kt`・`LookPlay.kt`・`LookScene.kt`。Web と答え合わせしてある）。
// ⚠ **切のときは何も出さない**（試合タブも試合の画面も今までと同じ）。表示専用。
// ============================================================

private val Night = Color(0xFF0B1220)
private val NightBar = Color(0xFF131C2F)
private val Gold = Color(0xFFFDE68A)
private val Slate300 = Color(0xFFCBD5E1)
private val Slate400 = Color(0xFF94A3B8)
private val ScoreRed = Color(0xFFF87171)
private val HitYellow = Color(0xFFFACC15)
private val Pressed = Color(0xFF38BDF8)
private val Shade = Shadow(Color.Black, blurRadius = 8f)

private fun toneColor(tone: String) = when (tone) {
    "score" -> ScoreRed
    "hit" -> HitYellow
    else -> Slate400
}

/** 本拠地の夜の球場（照明・旗・フェンスは本拠地の球団の色、後ろの景色は土地で海か山、客の入りは順位と連勝） */
@Composable
fun StadiumBackdrop(team: String, city: String, crowd: Double, modifier: Modifier = Modifier) {
    val look = LocalLook.current
    if (!look.on) return
    val home = look.teamLook(team) ?: NEUTRAL_LOOK
    val art = remember(home, city, crowd, team) { stadiumArt(home, stadiumScene(city), crowd, team) }
    LookCanvas(art, modifier.testTag("stadium-art"), crop = true)
}

/** 打席速報の球場の図（走者・打球）。走者は打席の後、塁の分からない行は前の塁 */
@Composable
fun FieldDiagram(scene: LiveScene, home: String, modifier: Modifier = Modifier) {
    val look = LocalLook.current
    val fence = look.teamLook(home) ?: NEUTRAL_LOOK
    val offense = look.teamLook(scene.team) ?: NEUTRAL_LOOK
    val bases = scene.basesAfter ?: scene.bases ?: 0
    val art = remember(fence, offense, scene) { fieldArt(fence, offense, bases, scene.batted, scene.code, scene.runs) }
    LookCanvas(art, modifier.aspectRatio(160f / 136f).semantics { contentDescription = "球場の図（走者と打球）" }.testTag("field-art"))
}

/**
 * 「今日の一戦」の札（試合タブの頭）。今日の試合が無い日は次の試合を「次の一戦」として出す。
 * @param onLineup 「スタメンを見る」で開く画面（null ならボタンを出さない）
 */
@Composable
fun TodayGameCard(view: LeagueView, onLineup: (() -> Unit)?) {
    val look = LocalLook.current
    if (!look.on) return
    val card = remember(view) { todayGameCard(view) } ?: return
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Night).testTag("today-game")) {
        StadiumBackdrop(card.home, card.city, card.crowd, Modifier.matchParentSize())
        Column {
            Row(
                Modifier.fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.7f), Color.Transparent)))
                    .padding(start = 14.dp, end = 14.dp, top = 10.dp, bottom = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "${card.title}　${card.whenText}",
                    style = MaterialTheme.typography.titleSmall,
                    color = Color.White,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(card.place, fontSize = 12.sp, color = Slate300, maxLines = 1)
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TodaySideBlock(view, card.own, Modifier.weight(1f))
                Text(
                    "VS",
                    fontFamily = LookGraduate,
                    fontSize = 34.sp,
                    color = Gold,
                    style = TextStyle(shadow = Shadow(Color(0xFFB45309), androidx.compose.ui.geometry.Offset(0f, 5f), 0f)),
                )
                TodaySideBlock(view, card.foe, Modifier.weight(1f))
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (card.note.isNotEmpty()) {
                    Text(
                        card.note,
                        fontSize = 12.sp,
                        color = Color.White,
                        modifier = Modifier.background(Night.copy(alpha = 0.8f), RoundedCornerShape(8.dp)).padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
                Spacer(Modifier.weight(1f))
                if (onLineup != null) {
                    Button(
                        onClick = onLineup,
                        colors = ButtonDefaults.buttonColors(containerColor = Gold, contentColor = Color(0xFF422006)),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp),
                        modifier = Modifier.height(32.dp),
                    ) { Text("スタメンを見る ›", fontSize = 13.sp, fontWeight = FontWeight.Bold) }
                }
            }
            Row(Modifier.fillMaxWidth().padding(start = 10.dp, end = 10.dp, bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StarterBlock(card.own, right = false, Modifier.weight(1f))
                StarterBlock(card.foe, right = true, Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun TodaySideBlock(view: LeagueView, side: TodaySide, modifier: Modifier) {
    Column(modifier.padding(vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        TeamMark(side.team, size = 68.dp)
        Text(
            view.teamLabel(side.team),
            style = MaterialTheme.typography.titleSmall.copy(shadow = Shade),
            color = Color.White,
            textAlign = TextAlign.Center,
            maxLines = 2,
        )
        if (side.record.isNotEmpty()) Text(side.record, fontSize = 11.sp, color = Color(0xFFE2E8F0), style = TextStyle(shadow = Shade))
    }
}

@Composable
private fun StarterBlock(side: TodaySide, right: Boolean, modifier: Modifier) {
    val s = side.starter
    val accent = lookColor(LocalLook.current.teamLook(side.team)?.c2) ?: Slate400
    Row(
        modifier.height(IntrinsicSize.Min).clip(RoundedCornerShape(10.dp)).background(Night.copy(alpha = 0.86f)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (!right) Box(Modifier.width(5.dp).fillMaxHeight().background(accent))
        Row(
            Modifier.weight(1f).padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = if (right) Arrangement.spacedBy(8.dp, Alignment.End) else Arrangement.spacedBy(8.dp),
        ) {
            val face: @Composable () -> Unit = { s?.id?.let { id -> PlayerFace(id.toString(), s.age, s.condition, size = 40.dp, team = side.team) } }
            if (!right) face()
            Column(Modifier.weight(1f, fill = false), horizontalAlignment = if (right) Alignment.End else Alignment.Start) {
                Text(s?.mark ?: "先発", fontSize = 10.sp, color = Slate400)
                Text(s?.name ?: "未定", fontSize = 14.sp, color = Color.White, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!s?.line.isNullOrEmpty()) Text(s!!.line, fontSize = 11.sp, color = Slate300, maxLines = 1)
            }
            if (right) face()
        }
        if (right) Box(Modifier.width(5.dp).fillMaxHeight().background(accent))
    }
}

/** 打席速報を出せる試合か（入で、塁と打球の記録がある＝版20からの試合） */
@Composable
fun livePlaysReady(game: JsonObject): Boolean {
    val on = LocalLook.current.on
    return remember(on, game) { on && hasLivePlays(game) }
}

private const val AUTO_MS = 1800L

/**
 * 打席速報（試合を1打席ずつ追う。球場の図に走者と打球の線、実況の1行、その回の流れ）。
 * ⚠ 中身は試合の `plays`（打席ごとの行）。1球ごとの観戦記録は使わない
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LivePlays(view: LeagueView, game: JsonObject) {
    val scenes = remember(game) { liveScenes(game) { view.teamShort(it) } }
    val highlights = remember(scenes) { highlightIndexes(scenes) }
    var index by remember(game) { mutableIntStateOf(0) }
    var auto by remember(game) { mutableStateOf(false) }
    var only by remember(game) { mutableStateOf(false) }
    val order = remember(only, highlights, scenes) { if (only && highlights.isNotEmpty()) highlights else scenes.indices.toList() }
    val at = maxOf(0, order.indexOf(index).takeIf { it >= 0 } ?: order.indexOfFirst { it >= index })
    // 自動で次の打席へ（最後まで来たら止まる）
    LaunchedEffect(auto, at, order) {
        if (!auto) return@LaunchedEffect
        if (at >= order.size - 1) {
            auto = false
            return@LaunchedEffect
        }
        delay(AUTO_MS)
        index = order[at + 1]
    }
    val scene = order.getOrNull(at)?.let { scenes.getOrNull(it) }
    if (scene == null) {
        Muted("この試合の打席の記録はありません。")
        return
    }
    fun go(step: Int) {
        index = order.getOrNull((at + step).coerceIn(0, order.size - 1)) ?: 0
    }
    val away = game.at("away").str().orEmpty()
    val home = game.at("home").str().orEmpty()
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Night).testTag("live-plays"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // 点の札（両球団と点・回・アウト）
        Row(Modifier.fillMaxWidth().background(NightBar).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TeamMark(away, size = 22.dp, modifier = Modifier.padding(end = 4.dp))
            Text(view.teamShort(away), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            Text(" ${scene.score.first} - ${scene.score.second} ", color = Gold, fontWeight = FontWeight.Bold, fontSize = 20.sp)
            Text(view.teamShort(home), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
            TeamMark(home, size = 22.dp, modifier = Modifier.padding(start = 4.dp))
            Spacer(Modifier.weight(1f))
            Text("${scene.inning}回${if (scene.half == "t") "表" else "裏"}", color = Slate300, fontSize = 13.sp)
            val outs = minOf(2, scene.outs)
            Row(Modifier.padding(start = 6.dp).semantics { contentDescription = "${outs}アウト" }, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                repeat(2) { i -> Box(Modifier.size(9.dp).background(if (outs > i) ScoreRed else Color(0xFF334155), CircleShape)) }
            }
        }
        FieldDiagram(scene, home, Modifier.padding(horizontal = 12.dp).widthIn(max = 400.dp).fillMaxWidth().align(Alignment.CenterHorizontally))
        // 実況の1行と点の動き
        val tone = playTone(scene.code, scene.runs)
        Row(Modifier.padding(horizontal = 10.dp).fillMaxWidth().height(IntrinsicSize.Min).clip(RoundedCornerShape(6.dp)).testTag("live-telop")) {
            Box(Modifier.width(6.dp).fillMaxHeight().background(toneColor(tone)))
            Column(
                Modifier.weight(1f)
                    .background(Brush.horizontalGradient(listOf(Color(0xFF1E3A8A).copy(alpha = 0.55f), Color.Transparent)))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Text(
                    "${scene.batterName?.takeIf { it.isNotEmpty() }?.let { "$it　" }.orEmpty()}${scene.phrase}",
                    style = MaterialTheme.typography.titleSmall,
                    color = Color.White,
                )
                Text(scene.situation, fontSize = 12.sp, color = Slate300)
            }
        }
        // その半回の、いまの打席までの流れ（新しい順に4つ）
        val now = order[at]
        val flow = scenes.withIndex().filter { (i, s) -> s.inning == scene.inning && s.half == scene.half && i <= now }.takeLast(4).reversed()
        Column(Modifier.padding(horizontal = 12.dp)) {
            flow.forEach { (i, s) ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        s.code,
                        fontSize = 12.sp,
                        color = Color(0xFF0F172A),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.width(24.dp).background(toneColor(playTone(s.code, s.runs)), RoundedCornerShape(4.dp)),
                    )
                    Text(
                        "${s.batterName?.takeIf { it.isNotEmpty() }?.let { "$it　" }.orEmpty()}${s.phrase}",
                        fontSize = 13.sp,
                        color = if (i == now) Color.White else Slate400,
                        fontWeight = if (i == now) FontWeight.Bold else null,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        // 打席を送る
        FlowRow(
            Modifier.fillMaxWidth().background(NightBar).padding(horizontal = 10.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            LiveButton("◀ 前の打席", enabled = at > 0) { go(-1) }
            LiveButton(if (auto) "■ 止める" else "▶ 自動", pressed = auto) { auto = !auto }
            LiveButton("次の打席 ▶", enabled = at < order.size - 1) { go(1) }
            LiveButton("見どころだけ", pressed = only, enabled = highlights.isNotEmpty()) { only = !only }
            Text("${at + 1} / ${order.size}", fontSize = 12.sp, color = Slate400, modifier = Modifier.align(Alignment.CenterVertically).padding(start = 4.dp))
        }
    }
}

@Composable
private fun LiveButton(label: String, enabled: Boolean = true, pressed: Boolean = false, onClick: () -> Unit) {
    val padding = PaddingValues(horizontal = 10.dp, vertical = 2.dp)
    if (pressed) {
        Button(onClick = onClick, enabled = enabled, contentPadding = padding, modifier = Modifier.height(34.dp), colors = ButtonDefaults.buttonColors(containerColor = Pressed, contentColor = Night)) {
            Text(label, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
    } else {
        OutlinedButton(onClick = onClick, enabled = enabled, contentPadding = padding, modifier = Modifier.height(34.dp)) { Text(label, fontSize = 12.sp) }
    }
}
