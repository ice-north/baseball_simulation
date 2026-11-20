package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.icenorth.baseball.shared.HISTORY_SLOTS
import jp.icenorth.baseball.shared.HistoryPoint
import jp.icenorth.baseball.shared.PYRAMID_LEAGUES
import jp.icenorth.baseball.shared.RATING_AXES
import jp.icenorth.baseball.shared.TEAMS_PER_LEAGUE
import jp.icenorth.baseball.shared.radarFraction
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/*
 * 先方5項目（2026-11-20）の図。PC の TeamHistoryChart.jsx（球団の歩み）と TeamAnalysis.jsx の TeamRadar の写し。
 * ⚠ 色だけに頼らない: 図の下に、押した点の1行（球団の歩み）・数字の表（レーダー）を出す
 */

private val LineColor = Color(0xFF38BDF8)
private val TitleColor = Color(0xFFFACC15)
private val AverageColor = Color(0xFF94A3B8)

/**
 * 球団の歩み（折れ線）。縦軸はリーグ全体の中の位置（上ほど上位。1部1位がいちばん上）。
 * 1部と2部の帯・境の線・優勝や昇格の印、今季（途中）は点線と白抜きの点。点を押すとその年の成績を下に出す。
 */
@Composable
fun TeamHistoryChart(points: List<HistoryPoint>, modifier: Modifier = Modifier) {
    if (points.isEmpty()) return
    var active by rememberSaveable(points.size) { mutableStateOf<Int?>(null) }
    val measurer = rememberTextMeasurer()
    val ink = MaterialTheme.colorScheme.onSurface
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val band0 = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)
    val band1 = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
    val surface = MaterialTheme.colorScheme.surface
    val small = TextStyle(fontSize = 10.sp, color = muted)
    val markStyle = TextStyle(fontSize = 10.sp, color = ink, fontWeight = FontWeight.Bold)
    val bandStyle = TextStyle(fontSize = 11.sp, color = muted, fontWeight = FontWeight.Bold)
    val padLeft = 40f
    val padRight = 14f
    val padTop = 22f
    val padBottom = 26f
    Column(modifier) {
        Text("球団の歩み（上ほど上位。1部1位がいちばん上）", style = MaterialTheme.typography.labelMedium, color = muted)
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(190.dp)
                .testTag("history-chart")
                .semantics { contentDescription = "球団の歩み。" + points.joinToString("、") { "${it.year}年目${if (it.current) "（今季途中）" else ""} ${it.league}${it.rank}位" } }
                .pointerInput(points) {
                    detectTapGestures { tap ->
                        val left = padLeft * density
                        val w = size.width - left - padRight * density
                        val xs = points.indices.map { i -> left + if (points.size == 1) w / 2 else w * i / (points.size - 1) }
                        active = xs.withIndex().minByOrNull { abs(it.value - tap.x) }?.index
                    }
                },
        ) {
            val d = density
            val left = padLeft * d
            val right = size.width - padRight * d
            val top = padTop * d
            val bottom = size.height - padBottom * d
            val plotW = right - left
            val plotH = bottom - top
            val step = plotH / (HISTORY_SLOTS - 1)
            fun x(i: Int) = left + if (points.size == 1) plotW / 2 else plotW * i / (points.size - 1)
            fun y(slot: Int) = top + step * (slot - 1)
            // 部の帯と名前
            PYRAMID_LEAGUES.forEachIndexed { tier, league ->
                val t = y(tier * TEAMS_PER_LEAGUE + 1) - step / 2
                val b = y((tier + 1) * TEAMS_PER_LEAGUE) + step / 2
                drawRoundRect(if (tier == 0) band0 else band1, Offset(left - 6 * d, t), Size(plotW + 12 * d, b - t), CornerRadius(4 * d))
                val label = measurer.measure(league.name, bandStyle)
                drawText(label, topLeft = Offset(2 * d, (t + b) / 2 - label.size.height / 2))
            }
            // 部の境の線
            (1 until PYRAMID_LEAGUES.size).forEach { tier ->
                val yy = (y(tier * TEAMS_PER_LEAGUE) + y(tier * TEAMS_PER_LEAGUE + 1)) / 2
                drawLine(muted.copy(alpha = 0.6f), Offset(left - 6 * d, yy), Offset(right + 6 * d, yy), strokeWidth = 1.2f * d, pathEffect = PathEffect.dashPathEffect(floatArrayOf(6 * d, 4 * d)))
            }
            // 順位の目盛り（各部の1位と、いちばん下の部の最下位だけ。境では字が重なる）
            (PYRAMID_LEAGUES.indices.map { it * TEAMS_PER_LEAGUE + 1 to "1位" } + listOf(HISTORY_SLOTS to "${TEAMS_PER_LEAGUE}位")).forEach { (slot, text) ->
                val l = measurer.measure(text, small)
                drawText(l, topLeft = Offset(left - 10 * d - l.size.width, y(slot) - l.size.height / 2))
            }
            val done = points.filter { !it.current }
            if (done.size > 1) {
                val path = Path().apply {
                    done.forEachIndexed { i, p -> if (i == 0) moveTo(x(i), y(p.slot)) else lineTo(x(i), y(p.slot)) }
                }
                drawPath(path, LineColor, style = Stroke(width = 2.2f * d))
            }
            // 今季（途中）は最後の終わった年から点線で
            val last = points.last()
            if (last.current && done.isNotEmpty()) {
                drawLine(LineColor, Offset(x(done.size - 1), y(done.last().slot)), Offset(x(points.size - 1), y(last.slot)), strokeWidth = 2f * d, pathEffect = PathEffect.dashPathEffect(floatArrayOf(5 * d, 4 * d)))
            }
            active?.let { i -> if (i in points.indices) drawLine(muted, Offset(x(i), top - 6 * d), Offset(x(i), bottom + 6 * d), strokeWidth = 1f * d) }
            val every = if (points.size > 8) (points.size + 5) / 6 else 1
            points.forEachIndexed { i, p ->
                val cx = x(i)
                val cy = y(p.slot)
                val title = p.champion || p.rank == 1
                val r = (if (title) 5.5f else 4f) * d * if (active == i) 1.3f else 1f
                if (p.current) {
                    drawCircle(surface, r, Offset(cx, cy))
                    drawCircle(LineColor, r, Offset(cx, cy), style = Stroke(2f * d))
                } else drawCircle(if (title) TitleColor else LineColor, r, Offset(cx, cy))
                p.mark?.let { text ->
                    val l = measurer.measure(text, markStyle)
                    val lx = (cx - l.size.width / 2).coerceIn(0f, size.width - l.size.width)
                    drawText(l, topLeft = Offset(lx, cy - r - 2 * d - l.size.height))
                }
                if (i % every == 0 || i == points.size - 1) {
                    val l = measurer.measure("${p.year}年目", small)
                    val lx = (cx - l.size.width / 2).coerceIn(0f, size.width - l.size.width)
                    drawText(l, topLeft = Offset(lx, size.height - l.size.height - 2 * d))
                }
            }
        }
        Text(
            active?.let { points.getOrNull(it)?.readout } ?: "点を押すと、その年の成績が出ます。",
            style = MaterialTheme.typography.bodySmall,
            color = if (active != null) ink else muted,
        )
    }
}

/**
 * チーム能力値のレーダー（この球団と部の平均の2本）。半径は項目ごとにリーグ全球団の中の位置
 * （いちばん低い球団が内側、いちばん高い球団が外周）。数字は下の表で読む。
 * @param scales [jp.icenorth.baseball.shared.ratingScales] で作ったリーグの最低と最高
 */
@Composable
fun TeamRadar(
    ratings: Map<String, Int?>,
    average: Map<String, Int?>?,
    ranks: Map<String, Int?>?,
    scales: Map<String, Pair<Int, Int>>,
    label: String,
    modifier: Modifier = Modifier,
) {
    val measurer = rememberTextMeasurer()
    val ink = MaterialTheme.colorScheme.onSurface
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val grid = MaterialTheme.colorScheme.outlineVariant
    val labelStyle = TextStyle(fontSize = 11.sp, color = ink, fontWeight = FontWeight.Bold)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        // 凡例
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
            LegendDot(LineColor, label)
            LegendDot(AverageColor, "部の平均")
        }
        Canvas(
            Modifier
                .fillMaxWidth()
                .aspectRatio(1.35f)
                .testTag("team-radar")
                .semantics { contentDescription = "チーム能力値。" + RATING_AXES.joinToString("、") { "${it.label}${ratings[it.key] ?: "—"}" } },
        ) {
            val d = density
            val cx = size.width / 2
            val cy = size.height / 2 + 4 * d
            val r = minOf(size.width / 2 - 64 * d, size.height / 2 - 22 * d)
            fun at(i: Int, radius: Float): Offset {
                val a = -PI / 2 + 2 * PI * i / RATING_AXES.size
                return Offset(cx + radius * cos(a).toFloat(), cy + radius * sin(a).toFloat())
            }
            listOf(0.25f, 0.5f, 0.75f, 1f).forEach { f ->
                val path = Path().apply { RATING_AXES.indices.forEach { i -> val p = at(i, r * f); if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y) }; close() }
                drawPath(path, grid, style = Stroke(1f * d))
            }
            RATING_AXES.indices.forEach { i -> drawLine(grid, Offset(cx, cy), at(i, r), strokeWidth = 1f * d) }
            fun shape(values: Map<String, Int?>, color: Color, fill: Float) {
                val path = Path().apply {
                    RATING_AXES.forEachIndexed { i, a -> val p = at(i, r * radarFraction(scales, a.key, values[a.key]).toFloat()); if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y) }
                    close()
                }
                if (fill > 0) drawPath(path, color.copy(alpha = fill))
                drawPath(path, color, style = Stroke(2f * d, pathEffect = if (fill == 0f) PathEffect.dashPathEffect(floatArrayOf(5 * d, 4 * d)) else null))
            }
            average?.let { shape(it, AverageColor, 0f) }
            shape(ratings, LineColor, 0.25f)
            RATING_AXES.forEachIndexed { i, a -> drawCircle(LineColor, 3.5f * d, at(i, r * radarFraction(scales, a.key, ratings[a.key]).toFloat())) }
            RATING_AXES.forEachIndexed { i, a ->
                val p = at(i, r + 12 * d)
                val l = measurer.measure(a.label, labelStyle)
                val lx = when {
                    abs(p.x - cx) < 4 * d -> p.x - l.size.width / 2
                    p.x > cx -> p.x
                    else -> p.x - l.size.width
                }
                drawText(l, topLeft = Offset(lx.coerceIn(0f, size.width - l.size.width), p.y - l.size.height / 2))
            }
        }
        // 数字の表（色だけに頼らない）
        Row(Modifier.fillMaxWidth()) {
            Text("項目", style = MaterialTheme.typography.labelSmall, color = muted, modifier = Modifier.weight(1f))
            Text("値", style = MaterialTheme.typography.labelSmall, color = muted, modifier = Modifier.width(44.dp), textAlign = TextAlign.End)
            Text("部の平均", style = MaterialTheme.typography.labelSmall, color = muted, modifier = Modifier.width(64.dp), textAlign = TextAlign.End)
            Text("部の順位", style = MaterialTheme.typography.labelSmall, color = muted, modifier = Modifier.width(64.dp), textAlign = TextAlign.End)
        }
        RATING_AXES.forEach { a ->
            Row(Modifier.fillMaxWidth()) {
                Text(a.label, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                Text(ratings[a.key]?.toString() ?: "—", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, modifier = Modifier.width(44.dp), textAlign = TextAlign.End)
                Text(average?.get(a.key)?.toString() ?: "—", style = MaterialTheme.typography.bodySmall, color = muted, modifier = Modifier.width(64.dp), textAlign = TextAlign.End)
                Text(ranks?.get(a.key)?.let { "${it}位" } ?: "—", style = MaterialTheme.typography.bodySmall, modifier = Modifier.width(64.dp), textAlign = TextAlign.End)
            }
        }
    }
}

@Composable
private fun LegendDot(color: Color, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(Modifier.size(10.dp).background(color, CircleShape))
        Text(text, style = MaterialTheme.typography.labelMedium)
    }
}
