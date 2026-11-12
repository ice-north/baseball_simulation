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
import androidx.compose.ui.text.style.TextDecoration
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

/**
 * 守備位置の色。投手・捕手・内野・外野で分け、一目で「どこを守る選手か」が分かるようにする。
 * ⚠ 能力のランク色（数字の文字色）と取り違えないよう、位置の色は**札の枠と字**でだけ使う。
 */
fun positionColor(pos: String?): Color = when (positionGroup(pos)) {
    // パワプロと同じ並び（いしだ指定: 投手は赤ピンク、捕手は水色、内野は黄、外野は緑）
    "pitcher" -> Color(0xFFE11D63) // 赤ピンク
    "catcher" -> Color(0xFF0EA5E9) // 水色
    "infield" -> Color(0xFFEAB308) // 黄
    "outfield" -> Color(0xFF16A34A) // 緑
    else -> Color(0xFF475569)
}

/**
 * 守備位置の札。**塗らずに枠と字だけ**を位置の色にする（いしだ指定: 塗りつぶしは強すぎる）。
 * @param filled 強調（守っている位置・本職）。枠を太くし、字を太く。ほかに守れる位置は細い枠
 */
@Composable
fun PosBadge(pos: String?, filled: Boolean = true, small: Boolean = false, onClick: (() -> Unit)? = null) {
    val color = lighten(positionColor(pos))
    val shape = RoundedCornerShape(if (small) 4.dp else 6.dp)
    Box(
        Modifier
            .then(if (small) Modifier.size(width = 20.dp, height = 18.dp) else Modifier.size(width = 34.dp, height = 28.dp))
            .border(if (filled) (if (small) 1.5.dp else 2.dp) else 1.dp, if (filled) color else color.copy(alpha = 0.7f), shape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            positionLabel(pos),
            fontSize = if (small) 11.sp else 15.sp,
            fontWeight = if (filled) FontWeight.Black else FontWeight.Bold,
            color = if (filled) color else color.copy(alpha = 0.85f),
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
        Row {
            Text("疲", fontSize = 10.sp, color = color ?: MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.alignByBaseline())
            Text("$f", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = color ?: MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.alignByBaseline())
        }
    }
}

@Composable
private fun Cell(label: String, value: Int?, width: Int = 32) = AbilityCell(label, value, width)

/**
 * 野手1人の行。**スタメンも控えも同じ部品**で出す（以前の指摘: スタメンと控えで出ている情報が違う）。
 *
 *   1行目: 打順（控えは空き）・守備の札・調子と名前・（選んでいる行があれば）入れ替えたときの適性・疲労
 *   2行目: 能力＝打撃（ミ パ 眼 走）｜守備（守 肩）。守っている位置の適性「適」は札の真下
 *   3行目: 今季成績＝打率 OPS 本 盗 席 と特徴ラベル
 *   4行目: 守れる位置の適性（60以上を高い順）
 *
 * ⚠ **能力・成績・適性を全部出す**（いしだ 2026-11-13: 切り替えながらでは判断が難しい。1人の行が大きくなってよい）。
 *    以前は2行目だけを「能力／今季成績／守備適性」で切り替えていた。
 *
 * @param position 札に出す位置（スタメンは守っている位置、控えは本職）
 * @param fitnessAt 適性を測る位置（スタメンは守っている位置）
 * @param hint 選んでいる行と入れ替えたらどうなるか（名前の右に出す）
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
    /** 選手が居ない枠（抜けた選手の空き）に出す文言 */
    placeholder: String = "?",
    hint: (@Composable () -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    Column(modifier.padding(horizontal = 10.dp, vertical = 6.dp)) {
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
                // ⚠ 本職・ほかに守れる位置の小さな札はここに出さない（いしだ指定: ごちゃごちゃする）。
                //    守れる位置は4行目、守っている位置の適性は札の下の「適」で見る
            }
            hint?.invoke()
            if (player != null) FatigueBadge(player.fatigue)
            if (onInfo != null) IconButton(onClick = onInfo, modifier = Modifier.size(32.dp)) { Text("ⓘ", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            if (draggable) Icon(Icons.Filled.Menu, contentDescription = "長押しで並べ替え", tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(20.dp))
        }
        if (player != null) {
            // 「適」と右の能力は字のベースラインでそろえる
            Row {
                // 守っている位置の適性は、守備の札の真下に（いしだ指定）
                Box(Modifier.alignByBaseline().padding(start = 26.dp, top = 4.dp).width(34.dp), contentAlignment = Alignment.Center) {
                    val fit = player.fitness(fitnessAt)
                    // ⚠ 右の能力の数字（[AbilityNum]）と同じ字の型にして、ベースラインでそろえる（fontSize だけだと数字が下にずれた）
                    Row {
                        Text("適", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.alignByBaseline())
                        Text("$fit", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = fitnessColor(fit), modifier = Modifier.alignByBaseline())
                    }
                }
                Box(Modifier.weight(1f).alignByBaseline().padding(start = 6.dp)) { AbilityRow(player) }
            }
            Column(Modifier.padding(start = 66.dp)) {
                StatsRow(player)
                FitnessRow(player, fitnessAt, withArm = false)
            }
        }
    }
}

/** 打撃（ミ パ 眼 走）と守備（守 肩）を区切り線で分けて並べる（「打」「守」の見出しは付けない。いしだ指定: 知っているので要らない） */
@Composable
fun AbilityRow(player: Player) {
    Box(Modifier.padding(top = 4.dp)) {
        BattingCells(player.batting?.meet, player.batting?.power, player.batting?.eye, player.physical?.speed, player.fielding?.defense, player.physical?.arm)
    }
}

/** 投手の能力（速 制 ス 回転 ＋ 変化球）。野手の [AbilityRow] と同じ並べ方 */
@Composable
fun PitcherAbilityRow(player: Player) {
    val p = player.pitching
    Box(Modifier.padding(top = 4.dp)) {
        PitchingCells(p?.velocity, p?.control, p?.stamina, p?.spinRate, pitchesShort(p?.arsenal.orEmpty().map { it.type to it.level }))
    }
}

/** 投手の今季成績（防 勝-敗 S H 回 K/9）を1行で */
@Composable
fun PitcherStatsRow(player: Player) {
    val m = player.performance?.pitching?.metrics
    val s = player.seasonStats?.pitching
    Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (m == null || m.outs == 0) {
            Muted("今季の登板なし")
        } else {
            StatText("防", m.era?.let { "%.2f".format(it) } ?: "-")
            StatText("", "${s?.wins ?: 0}勝${s?.losses ?: 0}敗")
            if ((s?.saves ?: 0) > 0) StatText("S", "${s?.saves}")
            if ((s?.holds ?: 0) > 0) StatText("H", "${s?.holds}")
            StatText("回", "${m.outs / 3}" + if (m.outs % 3 > 0) ".${m.outs % 3}" else "")
            m.k9?.let { StatText("K/9", "%.1f".format(it)) }
        }
    }
}

/**
 * 今季の成績と、成績の特徴（アベヒ・盗塁B など。サーバーがリーグ平均と比べて付ける）。
 * ⚠ **1行に収める**（いしだ指定: 2行にしない）。特徴は短い形（[shortLabel]）にし、入りきらない分は切る
 */
@Composable
fun StatsRow(player: Player) {
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
 * 守備の数字（守備力・肩）と、**守れる位置**の適性（いしだ指定: 30 のような守れない適性は出さず、代わりに守備と肩を）。
 * 位置は適性60（交代で守れる線）以上だけを、適性の高い順に。守っている位置は低くても出す（赤で気づけるように）。
 * ⚠ 1行に収まらない分（4つ目以降）は下の行へ。「100」が札の中で折り返さないよう幅は固定
 */
@Composable
fun FitnessRow(player: Player, fitnessAt: String, withArm: Boolean = true) {
    // 適性の高い順（いしだ指定）。守っている位置は60未満でも入れる（その順位の場所に赤で）
    val positions = FIELD_POSITIONS.filter { it == fitnessAt || player.fitness(it) >= SUBSTITUTE_MIN_FITNESS }.sortedByDescending { player.fitness(it) }
    Column(Modifier.padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        positions.chunked(if (withArm) 3 else 5).forEachIndexed { i, line ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (!withArm) {
                    // 守備・肩は能力の行に出ているので、位置だけを並べる
                } else if (i == 0) {
                    Cell("守", player.fielding?.defense)
                    Cell("肩", player.physical?.arm)
                    Box(Modifier.padding(horizontal = 4.dp).width(1.dp).height(14.dp).background(MaterialTheme.colorScheme.outlineVariant))
                } else {
                    // 2行目は1行目の位置の並びにそろえる
                    Box(Modifier.width(FITNESS_INDENT))
                }
                line.forEach { pos ->
                    val fit = player.fitness(pos)
                    // ⚠ 札（枠）で囲まず、位置の字を位置の色で（いしだ指定: 枠だと数字と字の高さがずれて見える）。
                    //    字と数字は下の線（ベースライン）でそろえる
                    Row(Modifier.width(46.dp)) {
                        Text(
                            positionLabel(pos),
                            style = MaterialTheme.typography.bodySmall, // 行の高さを能力の数字と同じに（fontSize だけだと 24sp の行になる）
                            fontWeight = FontWeight.Black,
                            color = lighten(positionColor(pos)),
                            textDecoration = if (pos == fitnessAt) TextDecoration.Underline else null,
                            modifier = Modifier.alignByBaseline(),
                        )
                        Text(
                            "$fit",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            softWrap = false,
                            color = fitnessColor(fit),
                            modifier = Modifier.alignByBaseline().padding(start = 3.dp),
                        )
                    }
                }
            }
        }
    }
}

/** 守備適性の行の2行目の字下げ（守備・肩の2マス＋区切り線の幅） */
private val FITNESS_INDENT = 32.dp * 2 + 9.dp // 位置1つは 46dp

@Composable
fun StatText(label: String, value: String) {
    Row {
        Text(label, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.alignByBaseline())
        Text(value, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.alignByBaseline())
    }
}
