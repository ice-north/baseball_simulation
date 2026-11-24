package jp.icenorth.baseball.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
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
import androidx.compose.ui.platform.LocalDensity
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
import androidx.compose.ui.text.font.FontSynthesis
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import jp.icenorth.baseball.app.R
import jp.icenorth.baseball.shared.CONDITION_TEXT
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
// 新しい見た目（試作）: 球団マーク・選手と指導者の顔・調子の顔・段位の字・見出しと本文の字。
// 描く手順は共通部の `LookArt.kt`（Web 版 `src/online/look/art.js` の写し）。ここは Canvas に描くだけ。
// ⚠ どの部品も**切のときは何も描かない**（呼ぶ側で入／切を分けない。調子の顔 [ConditionFace] だけは
//    [conditionName] の中でしか使わず、入／切はそこで見る）。入／切は端末に覚える
//    （[jp.icenorth.baseball.app.AppViewModel.lookOn]）。既定は切で、切なら今までと同じ画面。
// ⚠ 表示専用。保存もサーバーも触らない。
// ============================================================

/** 見た目の入／切と、球団の見た目の表（ビューの `teamLabels` から作る） */
@Immutable
data class LookState(
    val on: Boolean = false,
    /** 帽子の色を決める球団（自球団）。他球団の選手を出す画面は、部品に `team` を渡して差し替える */
    val capTeam: String? = null,
    val looks: Map<String, TeamLook> = emptyMap(),
) {
    /** リーグの球団の見た目。リーグの外（実在の球団・経歴の行き先）は null（マークを描かない） */
    fun teamLook(name: String?): TeamLook? = name?.let { looks[it] }
}

val LocalLook = compositionLocalOf { LookState() }

internal val LookGraduate = FontFamily(Font(R.font.look_graduate))
private val LookAlfa = FontFamily(Font(R.font.look_alfaslab))
private val LookYellowtail = FontFamily(Font(R.font.look_yellowtail))

/**
 * 本文（日本語は Zen Kaku Gothic New、英数記号は Barlow Semi Condensed）。
 * ⚠ FontFamily は字ごとにフォントを分けられないので、2つを合わせた1つのフォントにしてある（`tools/look-fonts.py`）
 */
private val LookBody = FontFamily(
    Font(R.font.look_body_regular, FontWeight.Normal),
    Font(R.font.look_body_bold, FontWeight.Bold),
)

/** 見出し（M PLUS 1p Black。JIS 第1水準＋画面に出る字に絞ったもの。`tools/look-fonts.py`） */
private val LookHead = FontFamily(Font(R.font.look_head))

/**
 * 入のときの字（Web の `look.css` と同じ考え）: 見出しの型（display・headline・title）を太いゴシックに、
 * 本文と札の型（body・label）を本文の字に。大きさと行の高さは変えない。
 */
internal fun lookTypography(base: Typography): Typography {
    // ⚠ 見出しのフォントは1つの太さしか無い。呼ぶ側の Bold で太字を作らせない
    fun head(s: TextStyle) = s.copy(fontFamily = LookHead, fontSynthesis = FontSynthesis.None)
    fun body(s: TextStyle) = s.copy(fontFamily = LookBody)
    return base.copy(
        displayLarge = head(base.displayLarge), displayMedium = head(base.displayMedium), displaySmall = head(base.displaySmall),
        headlineLarge = head(base.headlineLarge), headlineMedium = head(base.headlineMedium), headlineSmall = head(base.headlineSmall),
        titleLarge = head(base.titleLarge), titleMedium = head(base.titleMedium), titleSmall = head(base.titleSmall),
        bodyLarge = body(base.bodyLarge), bodyMedium = body(base.bodyMedium), bodySmall = body(base.bodySmall),
        labelLarge = body(base.labelLarge), labelMedium = body(base.labelMedium), labelSmall = body(base.labelSmall),
    )
}

private val LocalPlainTypography = staticCompositionLocalOf<Typography?> { null }

/**
 * 入のときだけ、中の字を新しい見た目の字にする。
 * ⚠ 入／切で部品の並びを変えない（いつも MaterialTheme で包み、字の表だけ差しかえる）。並びが変わると、中の画面の状態（開いている面・スクロール）が消える
 */
@Composable
fun LookTypography(content: @Composable () -> Unit) {
    val plain = MaterialTheme.typography
    val on = LocalLook.current.on
    val look = remember(plain) { lookTypography(plain) }
    CompositionLocalProvider(LocalPlainTypography provides plain) {
        MaterialTheme(typography = if (on) look else plain, content = content)
    }
}

/** 入でも今までの字のまま（新聞） */
@Composable
fun PlainTypography(content: @Composable () -> Unit) {
    val plain = LocalPlainTypography.current ?: MaterialTheme.typography
    MaterialTheme(typography = plain, content = content)
}

private fun fontOf(key: String?): FontFamily = when (key) {
    "alfa" -> LookAlfa
    "yellowtail" -> LookYellowtail
    "jp" -> PaperGothic
    else -> LookGraduate
}

internal fun lookColor(hex: String?): Color? =
    hex?.removePrefix("#")?.takeIf { it.length == 6 }?.toLongOrNull(16)?.let { Color(0xFF000000 or it) }

private fun capOf(v: String?) = if (v == "round") StrokeCap.Round else StrokeCap.Butt
private fun joinOf(v: String?) = if (v == "round") StrokeJoin.Round else StrokeJoin.Miter

/** 描く手順の一覧を正方形に描く */
@Composable
fun LookImage(art: LookArt, size: Dp, modifier: Modifier = Modifier) = LookCanvas(art, modifier.size(size))

/**
 * 描く手順の一覧を [modifier] の大きさに描く。絵の縦横の比は変えない。
 * @param crop 枠を埋める（はみ出たところは切る。SVG の `xMidYMid slice`）。false なら枠に収める（`meet`）
 */
@Composable
fun LookCanvas(art: LookArt, modifier: Modifier, crop: Boolean = false) {
    // 字を測る道具は字のある絵（マーク）だけ作る（顔・調子の顔は1画面に何十も出る）
    val measurer = if (art.items.any { it.t == "text" }) rememberTextMeasurer() else null
    val paths = remember(art) { art.items.map { s -> s.d?.let { PathParser().parsePathString(it).toPath() } } }
    // 丸で切り抜く部品は続けて並ぶので、続きを1回の切り抜きでまとめて描く（顔は約25個が続く）
    val runs = remember(art) {
        val out = mutableListOf<IntRange>()
        var start = 0
        for (i in 1..art.items.size) {
            if (i == art.items.size || art.items[i].c != art.items[start].c) {
                out += start until i
                start = i
            }
        }
        out
    }
    val clip = remember(art) {
        art.clip?.let { c ->
            Path().apply { addOval(androidx.compose.ui.geometry.Rect(Offset(c.cx.toFloat(), c.cy.toFloat()), c.r.toFloat())) }
        }
    }
    Canvas(if (crop) modifier.clipToBounds() else modifier) {
        val (bx, by, bw, bh) = art.box.map { it.toFloat() }
        val k = if (crop) maxOf(this.size.width / bw, this.size.height / bh) else minOf(this.size.width / bw, this.size.height / bh)
        // 真ん中に寄せる（正方形の絵を正方形に描くときは0）
        val dx = (this.size.width - bw * k) / 2
        val dy = (this.size.height - bh * k) / 2
        withTransform({
            translate(dx, dy)
            scale(k, k, pivot = Offset.Zero)
            translate(-bx, -by)
        }) {
            for (run in runs) {
                val draw: DrawScope.() -> Unit = { for (i in run) drawItem(art.items[i], paths[i], measurer) }
                if (art.items[run.first].c && clip != null) clipPath(clip, block = draw) else draw()
            }
        }
    }
}

private fun DrawScope.drawItem(s: LookItem, path: Path?, measurer: TextMeasurer?) {
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
            val textMeasurer = measurer ?: return
            // ⚠ 大きさは絵の座標（1 = 絵の1目盛り）。下の拡大で画面の大きさになるので、ここは px で渡す
            val style = TextStyle(
                fontFamily = fontOf(s.font),
                fontWeight = if (s.font == "jp") FontWeight.Black else null,
                fontSize = (s.size ?: 10.0).toFloat().toSp(),
                letterSpacing = (s.ls ?: 0.0).toFloat().toSp(),
            )
            val layout = textMeasurer.measure(text, style)
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

/**
 * 段4の番記者と場面の顔（種・年齢をそのまま渡す。共通部の `LookStory.kt` が作る）。
 * [suit] なら背広（番記者。ネクタイは球団の色）
 */
@Composable
fun StoryFace(seed: String, team: String?, age: Int?, level: Int?, suit: Boolean = false, size: Dp = 56.dp, modifier: Modifier = Modifier) {
    val look = LocalLook.current
    if (!look.on) return
    val cap = look.teamLook(team) ?: NEUTRAL_LOOK
    val art = remember(seed, cap, age, level, suit) { faceArt(seed, cap, age ?: 30, level, suit) }
    LookImage(art, size, modifier.testTag(if (suit) "reporter-face" else "story-face"))
}

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

/** 調子の顔（絵文字の代わり）。⚠ 入／切は呼ぶ側（[conditionName]）が見る。大きさは字の置き場（1.15字）に合わせて広がる */
@Composable
private fun ConditionFace(level: Int?) {
    val art = remember(level) { conditionArt(level) }
    LookImage(art, 16.dp, Modifier.fillMaxSize().testTag("condition-face"))
}

/**
 * 「調子＋名前」の字。入なら調子を顔の絵で、切なら今までの絵文字で頭に付ける。
 * `Text(text, inlineContent = inline)` で使う。
 * ⚠ 切は今までと1字も変えない（調子が分からなくても `"$絵文字$gap$名前"`。頭に空白が残るのも今まで通り）。
 *    入で調子が分からなければ名前だけ。
 */
@Composable
fun conditionName(condition: Int?, name: String, gap: String = " "): Pair<AnnotatedString, Map<String, InlineTextContent>> {
    val on = LocalLook.current.on
    if (!on) return AnnotatedString("${conditionIcon(condition)}$gap$name") to emptyMap()
    val label = condition?.let { CONDITION_TEXT.getOrNull(it) }
    if (label == null || conditionIcon(condition).isEmpty()) return AnnotatedString(name) to emptyMap()
    val text = buildAnnotatedString {
        // 読み上げは調子の言葉（絵文字のときは絵文字が読まれていた）
        appendInlineContent("cond", label)
        append(gap)
        append(name)
    }
    val inline = mapOf(
        "cond" to InlineTextContent(Placeholder(1.15.em, 1.15.em, PlaceholderVerticalAlign.TextCenter)) {
            ConditionFace(condition)
        },
    )
    return text to inline
}

/** 段位の字（能力の数字の頭。S〜F を段位の色の札に） */
@Composable
fun RankChip(value: Int, velocity: Boolean = false, stamina: Boolean = false, modifier: Modifier = Modifier) {
    if (!LocalLook.current.on) return
    RankLetterChip(abilityRank(value, velocity, stamina), modifier)
}

/**
 * 段位の字の札（S〜F）。能力の札と、成績の札（リーグ平均比。`statGrade`）で同じ形。
 * ⚠ 入／切は呼ぶ側が見る
 */
@Composable
fun RankLetterChip(rank: Char, modifier: Modifier = Modifier, size: Dp = 16.dp) {
    Box(
        modifier.size(size).background(rankColor(rank), RoundedCornerShape(3.dp)).testTag("rank-chip"),
        contentAlignment = Alignment.Center,
    ) {
        // ⚠ 札は dp の固定なので、字も dp で決める（端末の文字の大きさの設定で札からはみ出さない）
        val fontSize = with(LocalDensity.current) { (size * 0.69f).toSp() }
        Text(rank.toString(), color = Color(0xFF0F172A), fontFamily = LookGraduate, fontSize = fontSize, lineHeight = fontSize)
    }
}
