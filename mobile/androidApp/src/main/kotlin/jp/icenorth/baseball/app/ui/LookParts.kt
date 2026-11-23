package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import jp.icenorth.baseball.app.R
import jp.icenorth.baseball.shared.CoachCard
import jp.icenorth.baseball.shared.LookArt
import jp.icenorth.baseball.shared.LookItem
import jp.icenorth.baseball.shared.NEUTRAL_LOOK
import jp.icenorth.baseball.shared.Player
import jp.icenorth.baseball.shared.TeamLook
import jp.icenorth.baseball.shared.abilityRank
import jp.icenorth.baseball.shared.conditionArt
import jp.icenorth.baseball.shared.conditionIcon
import jp.icenorth.baseball.shared.emblemArt
import jp.icenorth.baseball.shared.faceArt

// ============================================================
// 新しい見た目（試作）: 球団マーク・選手と指導者の顔・調子の顔・段位の字。
// 描く手順は共通部の `LookArt.kt`（Web 版 `src/online/look/art.js` の写し）。ここは Canvas に描くだけ。
// ⚠ どの部品も**切のときは何も描かない**（呼ぶ側で入／切を分けない）。入／切は端末に覚える
//    （[jp.icenorth.baseball.app.AppViewModel.lookOn]）。既定は切で、切なら今までと同じ画面。
// ⚠ 表示専用。保存もサーバーも触らない。
// ============================================================

/** 見た目の入／切と、球団の見た目の表（ビューの `teamLabels` から作る） */
@Immutable
data class LookState(
    val on: Boolean = false,
    /** 帽子の色を決める球団（自球団。他球団の名簿・トレード相手の選手を出す画面では差し替える） */
    val capTeam: String? = null,
    val looks: Map<String, TeamLook> = emptyMap(),
) {
    /** リーグの球団の見た目。リーグの外（実在の球団・経歴の行き先）は null（マークを描かない） */
    fun teamLook(name: String?): TeamLook? = name?.let { looks[it] }
}

val LocalLook = compositionLocalOf { LookState() }

private val LookGraduate = FontFamily(Font(R.font.look_graduate))
private val LookAlfa = FontFamily(Font(R.font.look_alfaslab))
private val LookYellowtail = FontFamily(Font(R.font.look_yellowtail))

private fun fontOf(key: String?): FontFamily = when (key) {
    "alfa" -> LookAlfa
    "yellowtail" -> LookYellowtail
    "jp" -> PaperGothic
    else -> LookGraduate
}

private fun lookColor(hex: String?): Color? =
    hex?.removePrefix("#")?.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { Color(0xFF000000 or it) }

private fun capOf(v: String?) = if (v == "round") StrokeCap.Round else StrokeCap.Butt
private fun joinOf(v: String?) = if (v == "round") StrokeJoin.Round else StrokeJoin.Miter

/** 描く手順の一覧を正方形に描く */
@Composable
fun LookImage(art: LookArt, size: Dp, modifier: Modifier = Modifier) {
    val measurer = rememberTextMeasurer()
    val paths = remember(art) { art.items.map { s -> s.d?.let { PathParser().parsePathString(it).toPath() } } }
    val clip = remember(art) {
        art.clip?.let { c ->
            Path().apply { addOval(androidx.compose.ui.geometry.Rect(Offset(c.cx.toFloat(), c.cy.toFloat()), c.r.toFloat())) }
        }
    }
    Canvas(modifier.size(size)) {
        val (bx, by, bw) = art.box
        val k = this.size.width / bw.toFloat()
        withTransform({
            scale(k, k, pivot = Offset.Zero)
            translate(-bx.toFloat(), -by.toFloat())
        }) {
            art.items.forEachIndexed { i, s ->
                if (s.c && clip != null) clipPath(clip) { drawItem(s, paths[i], measurer) } else drawItem(s, paths[i], measurer)
            }
        }
    }
}

private fun DrawScope.drawItem(s: LookItem, path: Path?, measurer: TextMeasurer) {
    val alpha = (s.op ?: 1.0).toFloat()
    val fill = lookColor(s.fill)
    val stroke = lookColor(s.stroke)
    val line = Stroke(width = (s.sw ?: 1.0).toFloat(), cap = capOf(s.cap), join = joinOf(s.join))
    // 図形は塗ってから縁（SVG と同じ）。字は縁を先に（Web の paint-order: stroke）
    fun paint(block: (Color, androidx.compose.ui.graphics.drawscope.DrawStyle) -> Unit) {
        fill?.let { block(it, Fill) }
        stroke?.let { block(it, line) }
    }
    when (s.t) {
        "path" -> if (path != null) paint { c, st -> drawPath(path, c, alpha = alpha, style = st) }
        "circle" -> paint { c, st -> drawCircle(c, radius = s.r!!.toFloat(), center = Offset(s.cx!!.toFloat(), s.cy!!.toFloat()), alpha = alpha, style = st) }
        "ellipse" -> paint { c, st ->
            drawOval(c, topLeft = Offset((s.cx!! - s.rx!!).toFloat(), (s.cy!! - s.ry!!).toFloat()), size = Size((s.rx!! * 2).toFloat(), (s.ry!! * 2).toFloat()), alpha = alpha, style = st)
        }
        "rect" -> paint { c, st -> drawRect(c, topLeft = Offset(s.x!!.toFloat(), s.y!!.toFloat()), size = Size(s.w!!.toFloat(), s.h!!.toFloat()), alpha = alpha, style = st) }
        "text" -> {
            val text = s.text ?: return
            // ⚠ 大きさは絵の座標（1 = 絵の1目盛り）。下の拡大で画面の大きさになるので、ここは px で渡す
            val style = TextStyle(
                fontFamily = fontOf(s.font),
                fontWeight = if (s.font == "jp") FontWeight.Black else null,
                fontSize = (s.size ?: 10.0).toFloat().toSp(),
                letterSpacing = (s.ls ?: 0.0).toFloat().toSp(),
            )
            val layout = measurer.measure(text, style)
            val topLeft = Offset(s.x!!.toFloat() - layout.size.width / 2f, s.y!!.toFloat() - layout.firstBaseline)
            stroke?.let { drawText(layout, it, topLeft, alpha = alpha, drawStyle = line) }
            fill?.let { drawText(layout, it, topLeft, alpha = alpha) }
        }
    }
}

/** 球団マーク。切のとき・リーグの球団でないときは描かない */
@Composable
fun TeamMark(team: String?, size: Dp = 18.dp, modifier: Modifier = Modifier) {
    val look = LocalLook.current
    if (!look.on) return
    val t = look.teamLook(team) ?: return
    val art = remember(t) { emblemArt(t) }
    LookImage(art, size, modifier.testTag("team-mark"))
}

/** 選手の顔。帽子は [team]（省くと画面の球団）、表情は調子、しわ・ひげ・白髪は年齢 */
@Composable
fun PlayerFace(id: String?, age: Int?, condition: Int?, size: Dp = 26.dp, modifier: Modifier = Modifier, team: String? = LocalLook.current.capTeam) {
    val look = LocalLook.current
    if (!look.on || id == null) return
    val cap = look.teamLook(team) ?: NEUTRAL_LOOK
    val art = remember(id, cap, age, condition) { faceArt("p$id", cap, age ?: 25, condition) }
    LookImage(art, size, modifier.testTag("player-face"))
}

@Composable
fun PlayerFace(player: Player, size: Dp = 26.dp, modifier: Modifier = Modifier, team: String? = LocalLook.current.capTeam) =
    PlayerFace(player.id.toString(), player.age, player.condition, size, modifier, team)

/** 指導者の顔（選手と同じ作り。表情はいつも穏やか） */
@Composable
fun StaffFace(coach: CoachCard, size: Dp = 44.dp, modifier: Modifier = Modifier) {
    val look = LocalLook.current
    if (!look.on) return
    val cap = look.teamLook(coach.team) ?: NEUTRAL_LOOK
    val seed = "c${coach.id.ifEmpty { coach.name }}"
    val art = remember(seed, cap, coach.age) { faceArt(seed, cap, coach.age.takeIf { it > 0 } ?: 50, 3) }
    LookImage(art, size, modifier.testTag("coach-face"))
}

/** 調子の顔（絵文字の代わり） */
@Composable
fun ConditionFace(level: Int?, size: Dp = 16.dp, modifier: Modifier = Modifier) {
    val art = remember(level) { conditionArt(level) }
    LookImage(art, size, modifier.testTag("condition-face"))
}

/**
 * 「調子＋名前」の字。入なら調子を顔の絵で、切なら今までの絵文字で頭に付ける。
 * `Text(text, inlineContent = inline)` で使う。調子が分からなければ名前だけ。
 */
@Composable
fun conditionName(condition: Int?, name: String, gap: String = " "): Pair<AnnotatedString, Map<String, InlineTextContent>> {
    val on = LocalLook.current.on
    if (!on || condition == null || conditionIcon(condition).isEmpty()) {
        val icon = conditionIcon(condition)
        return AnnotatedString(if (icon.isEmpty()) name else "$icon$gap$name") to emptyMap()
    }
    val text = buildAnnotatedString {
        appendInlineContent("cond", "[調子]")
        append(gap)
        append(name)
    }
    val inline = mapOf(
        "cond" to InlineTextContent(Placeholder(1.15.em, 1.15.em, PlaceholderVerticalAlign.TextCenter)) {
            ConditionFace(condition, 18.dp)
        },
    )
    return text to inline
}

/** 段位の字（能力の数字の頭。S〜F を段位の色の札に） */
@Composable
fun RankChip(value: Int, velocity: Boolean = false, stamina: Boolean = false, modifier: Modifier = Modifier) {
    if (!LocalLook.current.on) return
    val rank = abilityRank(value, velocity, stamina)
    Box(
        modifier.size(16.dp).background(rankColor(rank), RoundedCornerShape(3.dp)).testTag("rank-chip"),
        contentAlignment = Alignment.Center,
    ) {
        Text(rank.toString(), color = Color(0xFF0F172A), fontFamily = LookGraduate, fontSize = 11.sp, lineHeight = 11.sp)
    }
}
