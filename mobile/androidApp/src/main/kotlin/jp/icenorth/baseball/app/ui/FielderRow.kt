package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import jp.icenorth.baseball.shared.FIELDER_REST_FATIGUE
import jp.icenorth.baseball.shared.FIELD_POSITIONS
import jp.icenorth.baseball.shared.Player
import jp.icenorth.baseball.shared.SUBSTITUTE_MIN_FITNESS
import jp.icenorth.baseball.shared.conditionIcon
import jp.icenorth.baseball.shared.fatigueTone
import jp.icenorth.baseball.shared.positionGroup
import jp.icenorth.baseball.shared.positionLabel
import jp.icenorth.baseball.shared.ops3
import jp.icenorth.baseball.shared.rate3
import jp.icenorth.baseball.shared.shortLabel
import jp.icenorth.baseball.shared.subPositions

/**
 * 守備位置の色。投手・捕手・内野・外野で分け、一目で「どこを守る選手か」が分かるようにする。
 * ⚠ 能力のランク色（数字の文字色）と取り違えないよう、位置は**塗りの札**でだけ使う。
 */
fun positionColor(pos: String?): Color = when (positionGroup(pos)) {
    // パワプロと同じ並び（いしだ指定: 投手は赤ピンク、捕手は水色、内野は黄、外野は緑）
    "pitcher" -> Color(0xFFE11D63) // 赤ピンク
    "catcher" -> Color(0xFF0EA5E9) // 水色
    "infield" -> Color(0xFFEAB308) // 黄
    "outfield" -> Color(0xFF16A34A) // 緑
    else -> Color(0xFF475569)
}

/** 守備位置の札。filled＝守っている位置・本職、枠だけ＝ほかに守れる位置 */
@Composable
fun PosBadge(pos: String?, filled: Boolean = true, small: Boolean = false, onClick: (() -> Unit)? = null) {
    val color = positionColor(pos)
    val shape = RoundedCornerShape(if (small) 4.dp else 6.dp)
    Box(
        Modifier
            .then(if (small) Modifier.size(width = 20.dp, height = 18.dp) else Modifier.size(width = 34.dp, height = 28.dp))
            .then(if (filled) Modifier.background(color, shape) else Modifier.border(1.dp, color, shape))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            positionLabel(pos),
            fontSize = if (small) 11.sp else 15.sp,
            fontWeight = FontWeight.Black,
            // 黄の札は白い字だと読めないので黒っぽい字にする
            color = if (filled) (if (positionGroup(pos) == "infield") Color(0xFF1C1917) else Color.White) else color.copy(alpha = 1f).let { lighten(it) },
        )
    }
}

private fun lighten(c: Color) = Color(
    red = c.red + (1f - c.red) * 0.35f,
    green = c.green + (1f - c.green) * 0.35f,
    blue = c.blue + (1f - c.blue) * 0.35f,
)

/** 守備適性の色（Web 版 .online-lineup-fitness と同じ段: 60未満は赤、90以上は緑） */
@Composable
fun fitnessColor(value: Int): Color = when {
    value < SUBSTITUTE_MIN_FITNESS -> MaterialTheme.colorScheme.error
    value >= 90 -> Color(0xFF4ADE80)
    else -> MaterialTheme.colorScheme.onSurface
}

/**
 * 疲労の札。どの行でも**同じ場所（名前の右端）**に出し、縦に目で追えるようにする。
 * 黄＝41以上（成長が鈍り始める）、赤＝休養の線（野手は80）以上。
 */
@Composable
fun FatigueBadge(fatigue: Int?, restAt: Int = FIELDER_REST_FATIGUE) {
    val f = fatigue ?: 0
    val color = when {
        f >= restAt -> MaterialTheme.colorScheme.error
        fatigueTone(f) >= 1 -> MaterialTheme.colorScheme.secondary
        else -> null
    }
    Box(
        Modifier
            .widthIn(min = 46.dp)
            .height(22.dp)
            .then(if (color != null) Modifier.background(color.copy(alpha = 0.18f), RoundedCornerShape(11.dp)) else Modifier)
            .padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text("疲", fontSize = 10.sp, color = color ?: MaterialTheme.colorScheme.onSurfaceVariant)
            Text("$f", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = color ?: MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** 能力1つ（幅をそろえて、行が変わっても同じ能力が縦に並ぶように） */
@Composable
private fun Cell(label: String, value: Int?, width: Int = 34) {
    Box(Modifier.width(width.dp)) { AbilityNum(label, value) }
}

@Composable
private fun GroupLabel(text: String) {
    Text(
        text,
        fontSize = 10.sp,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .padding(end = 4.dp)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(3.dp))
            .padding(horizontal = 3.dp),
    )
}

/**
 * 野手1人の行。**スタメンも控えも交代候補も同じ部品**で出す（以前の指摘: スタメンと控えで出ている情報が違う）。
 *
 *   1行目: 打順（控えは空き）・守備の札・調子と名前・ほかに守れる位置・疲労
 *   2行目: 上の切り替え（[FielderView]）で選んだもの
 *          能力＝打撃（ミ パ 眼 走）｜守備（適性 守 肩）を分けて / 今季成績＝打率 OPS 本 盗 と特徴ラベル /
 *          守備適性＝8つの位置の適性
 *
 * @param position 札に出す位置（スタメンは守っている位置、控えは本職）
 * @param fitnessAt 適性を測る位置（スタメンは守っている位置。交代候補は空いている位置）
 */
@Composable
fun FielderRow(
    order: String?,
    position: String,
    player: Player?,
    fitnessAt: String,
    onPosition: (() -> Unit)? = null,
    onName: (() -> Unit)? = null,
    onInfo: (() -> Unit)? = null,
    draggable: Boolean = false,
    mode: FielderView = FielderView.Ability,
    /** 選手が居ない枠（抜けた選手の空き）に出す文言 */
    placeholder: String = "?",
    modifier: Modifier = Modifier,
) {
    Column(modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                order.orEmpty(),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.width(26.dp),
            )
            PosBadge(position, onClick = onPosition)
            Row(
                Modifier.weight(1f).then(if (onName != null) Modifier.clickable(onClick = onName) else Modifier).padding(start = 8.dp, top = 4.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text(
                    if (player != null) "${conditionIcon(player.condition)} ${player.name}" else placeholder,
                    fontWeight = FontWeight.SemiBold,
                    color = if (player != null) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.error,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false).padding(end = 3.dp),
                )
                // 本職（守っている位置と違うときだけ）と、ほかに守れる位置（適性60以上・高い順に2つまで）
                if (player != null) {
                    if (player.position != position) PosBadge(player.position, small = true)
                    player.subPositions().filter { it != position }.take(2).forEach { PosBadge(it, filled = false, small = true) }
                }
            }
            if (player != null) FatigueBadge(player.fatigue)
            if (onInfo != null) IconButton(onClick = onInfo, modifier = Modifier.size(32.dp)) { Text("ⓘ", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            if (draggable) Icon(Icons.Filled.Menu, contentDescription = "長押しで並べ替え", tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(20.dp))
        }
        if (player != null) {
            when (mode) {
                FielderView.Ability -> AbilityRow(player, fitnessAt)
                FielderView.Stats -> StatsRow(player)
                FielderView.Fitness -> FitnessRow(player, fitnessAt)
            }
        }
    }
}

/** 行の2行目に出すもの。画面が狭いので全部は並べず、上の切り替えで選ぶ（選手成績の画面と同じ考え方） */
enum class FielderView(val label: String) { Ability("能力"), Stats("今季成績"), Fitness("守備適性") }

/** 打撃（ミ パ 眼 走）と守備（適性 守 肩）を分けて並べる */
@Composable
private fun AbilityRow(player: Player, fitnessAt: String) {
    Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        GroupLabel("打")
        Cell("ミ", player.batting?.meet)
        Cell("パ", player.batting?.power)
        Cell("眼", player.batting?.eye)
        Cell("走", player.physical?.speed)
        Box(Modifier.padding(horizontal = 4.dp).width(1.dp).height(14.dp).background(MaterialTheme.colorScheme.outlineVariant))
        GroupLabel("守")
        FitCell("適", player.fitness(fitnessAt))
        Cell("守", player.fielding?.defense)
        Cell("肩", player.physical?.arm)
    }
}

/**
 * 今季の成績と、成績の特徴（アベヒ・盗塁B など。サーバーがリーグ平均と比べて付ける）。
 * ⚠ **1行に収める**（いしだ指定: 2行にしない）。特徴は短い形（[shortLabel]）にし、入りきらない分は切る
 */
@Composable
private fun StatsRow(player: Player) {
    val m = player.performance?.batting?.metrics
    val labels = player.performance?.batting?.labels.orEmpty()
    Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (m == null || m.pa == 0) {
                Muted("今季の打席なし")
            } else {
                StatText("打率", rate3(m.avg))
                StatText("OPS", ops3(m.ops))
                StatText("本", "${m.homeruns}")
                StatText("盗", "${m.stolenBases}")
                StatText("席", "${m.pa}")
            }
        }
        FittingRow(Modifier.weight(1f).padding(start = 8.dp)) {
            labels.take(3).forEach { label ->
                Tag(shortLabel(label.text), if (label.tone == "bad") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
            }
        }
    }
}

/**
 * 右寄せで、**丸ごと入る札だけ**を並べる（入りきらない札は途中で切らずに出さない）。
 * ⚠ 普通の Row に clipToBounds だと、最後の札が半分に切れて「アベ」のように見えた
 */
@Composable
private fun FittingRow(modifier: Modifier, content: @Composable () -> Unit) {
    Layout(content, modifier) { measurables, constraints ->
        val gap = 4.dp.roundToPx()
        val loose = constraints.copy(minWidth = 0, minHeight = 0)
        val placeables = measurables.map { it.measure(loose.copy(maxWidth = androidx.compose.ui.unit.Constraints.Infinity)) }
        val shown = mutableListOf<androidx.compose.ui.layout.Placeable>()
        var used = 0
        for (pl in placeables) {
            val need = used + (if (shown.isEmpty()) 0 else gap) + pl.width
            if (need > constraints.maxWidth) break
            shown += pl
            used = need
        }
        val width = if (constraints.hasBoundedWidth) constraints.maxWidth else used
        val height = (shown.maxOfOrNull { it.height } ?: 0).coerceAtLeast(constraints.minHeight)
        layout(width, height) {
            var x = width - used
            shown.forEach { pl ->
                pl.placeRelative(x, (height - pl.height) / 2)
                x += pl.width + gap
            }
        }
    }
}

/**
 * 8つの守備位置の適性を、位置の色の札と数字で並べる（守っている位置は塗り）。
 * ⚠ 1行に8つは狭い端末で「100」が折り返したので、捕手・内野の5つと外野の3つの2行にする
 */
@Composable
private fun FitnessRow(player: Player, fitnessAt: String) {
    Column(Modifier.padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        listOf(FIELD_POSITIONS.take(5), FIELD_POSITIONS.drop(5)).forEach { line ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                line.forEach { pos ->
                    val fit = player.fitness(pos)
                    Row(Modifier.width(50.dp), verticalAlignment = Alignment.CenterVertically) {
                        PosBadge(pos, filled = pos == fitnessAt, small = true)
                        Text(
                            if (fit > 0) "$fit" else "−",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            softWrap = false,
                            color = if (fit > 0) fitnessColor(fit) else MaterialTheme.colorScheme.outline,
                            modifier = Modifier.padding(start = 3.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FitCell(label: String, fit: Int) {
    Row(Modifier.width(40.dp), verticalAlignment = Alignment.Bottom) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("$fit", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = fitnessColor(fit))
    }
}

@Composable
private fun StatText(label: String, value: String) {
    Row(verticalAlignment = Alignment.Bottom) {
        Text(label, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface)
    }
}
