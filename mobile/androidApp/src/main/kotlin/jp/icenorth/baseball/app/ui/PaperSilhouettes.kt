package jp.icenorth.baseball.app.ui

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import jp.icenorth.baseball.app.R
import jp.icenorth.baseball.shared.SCENE_BATTER
import jp.icenorth.baseball.shared.SCENE_DOWN
import jp.icenorth.baseball.shared.SCENE_HOMER
import jp.icenorth.baseball.shared.SCENE_PITCHER
import jp.icenorth.baseball.shared.SCENE_WALKOFF
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/*
 * 1面の写真に重ねる影絵（いしだ 2026-11-16「影絵の写真的なのでOK」）。
 * 照明の逆光で黒くつぶれた選手の姿を、胴（台形）・手足（太い線）・頭（円）で描く。画像は使わない。
 * ⚠ ポーズの座標は足元が原点・上がマイナス・身長およそ100。
 * ⚠ 絵（res/drawable-nodpi/paper_sil_*.webp。いしだが画像生成で作った影絵。背景を抜いて高さ420pxの WebP に）がある場面は絵を使い、無い場面だけ図形で描く。
 */

private class Pose(
    /** 首x, 首y, 腰x, 腰y, 肩幅, 腰幅 */
    val torso: FloatArray,
    /** 頭の中心と半径 */
    val head: FloatArray,
    /** 手足（点の並び, 付け根の太さ）。先へ行くほど細くする */
    val limbs: List<Pair<List<Offset>, Float>>,
    val bat: Pair<Offset, Offset>? = null,
    /** 帽子のつば */
    val cap: List<Offset>? = null,
    /** 手（グラブ・握りこぶし）: x, y, 半径 */
    val hands: List<FloatArray> = emptyList(),
)

private fun o(x: Number, y: Number) = Offset(x.toFloat(), y.toFloat())
private fun f(vararg v: Number) = FloatArray(v.size) { v[it].toFloat() }

private val HOMER = Pose(
    f(0, -80, 2, -50, 24, 17), f(-1, -90, 8.5),
    listOf(
        listOf(o(2, -52), o(-9, -28), o(-18, -2), o(-26, 0)) to 13f,
        listOf(o(2, -52), o(14, -27), o(11, -4), o(16, 0)) to 13f,
        listOf(o(-4, -77), o(-14, -87), o(-5, -98)) to 7f,
        listOf(o(4, -77), o(10, -88), o(-3, -98)) to 7f,
    ),
    bat = o(-4, -98) to o(42, -80),
    cap = listOf(o(-12, -92), o(0, -99), o(7, -92), o(-2, -87)),
)
private val JUMP = Pose(
    f(0, -84, 0, -55, 23, 16), f(0, -94, 8.5),
    listOf(
        listOf(o(-3, -56), o(-11, -37), o(-6, -19), o(-12, -16)) to 12f,
        listOf(o(3, -56), o(11, -39), o(19, -23), o(24, -18)) to 12f,
        listOf(o(-6, -81), o(-16, -97), o(-19, -113)) to 7f,
        listOf(o(6, -81), o(16, -97), o(20, -113)) to 7f,
    ),
    hands = listOf(f(-19, -114, 3.6), f(20, -114, 3.6)),
)
private val JUMP2 = Pose(
    f(0, -80, 1, -50, 23, 16), f(0, -90, 8.5),
    listOf(
        listOf(o(-2, -52), o(-8, -28), o(-10, -2), o(-16, 0)) to 12f,
        listOf(o(4, -52), o(10, -28), o(12, -2), o(18, 0)) to 12f,
        listOf(o(-6, -77), o(-14, -92), o(-12, -110)) to 7f,
        listOf(o(6, -77), o(16, -66), o(18, -56)) to 7f,
    ),
    hands = listOf(f(-12, -111, 3.6)),
)
private val PITCHER = Pose(
    f(-4, -74, 6, -46, 24, 17), f(1, -84, 8),
    listOf(
        listOf(o(6, -48), o(24, -30), o(30, -2), o(38, 0)) to 13f,
        listOf(o(4, -48), o(-14, -32), o(-30, -20), o(-36, -24)) to 12f,
        listOf(o(-6, -72), o(-18, -80), o(-30, -92)) to 7f,
        listOf(o(4, -72), o(16, -66), o(26, -60)) to 7f,
    ),
    cap = listOf(o(-8, -89), o(6, -92), o(14, -86), o(4, -82)),
    hands = listOf(f(-31, -94, 4.6)),
)
private val DOWN = Pose(
    f(-10, -63, 8, -48, 23, 17), f(-17, -61, 8),
    listOf(
        listOf(o(8, -49), o(4, -26), o(8, -2), o(0, 0)) to 13f,
        listOf(o(10, -49), o(18, -26), o(20, -2), o(12, 0)) to 13f,
        listOf(o(-10, -62), o(-4, -44), o(4, -30)) to 7f,
        listOf(o(-6, -60), o(4, -42), o(14, -30)) to 7f,
    ),
    cap = listOf(o(-27, -62), o(-15, -69), o(-9, -63), o(-21, -57)),
)
private val STANCE = Pose(
    f(2, -78, 4, -49, 24, 17), f(0, -88, 8.5),
    listOf(
        listOf(o(2, -51), o(-8, -27), o(-14, -2), o(-21, 0)) to 13f,
        listOf(o(6, -51), o(14, -27), o(14, -2), o(8, 0)) to 13f,
        listOf(o(-2, -75), o(10, -67), o(14, -80)) to 7f,
        listOf(o(6, -75), o(12, -71), o(14, -80)) to 7f,
    ),
    bat = o(14, -80) to o(24, -114),
    cap = listOf(o(-10, -90), o(2, -97), o(8, -90), o(-2, -85)),
)

/** 場面の人の並び（ポーズ, 横のずれ, 大きさ, 左右反転） */
private data class Figure(val pose: Pose, val dx: Float, val scale: Float, val flip: Boolean)

private fun figuresOf(scene: String): List<Figure> = when (scene) {
    SCENE_HOMER -> listOf(Figure(HOMER, 0f, 1f, false))
    SCENE_WALKOFF -> listOf(Figure(JUMP2, -34f, 0.86f, true), Figure(JUMP, 8f, 1f, false), Figure(JUMP2, 44f, 0.8f, false))
    SCENE_PITCHER -> listOf(Figure(PITCHER, 0f, 1f, false))
    SCENE_DOWN -> listOf(Figure(DOWN, 0f, 1f, false))
    SCENE_BATTER -> listOf(Figure(STANCE, 0f, 1f, false))
    else -> emptyList()
}

/** 場面の人がいるか（描く前に場所を空けるかを決める） */
internal fun hasSilhouette(scene: String?): Boolean = scene != null && figuresOf(scene).isNotEmpty()

/** 場面の横幅（身長100に対して） */
internal fun silhouetteWidth(scene: String?): Float = if (scene == SCENE_WALKOFF) 130f else 75f

/**
 * 影絵を描く。[cx] は人の並びの真ん中、[footY] は足元、[height] は身長（px）。
 * 後ろに照明の照り返しを置いて、観客席の上でも形が読めるようにする。
 */
internal fun DrawScope.drawSilhouettes(scene: String?, cx: Float, footY: Float, height: Float, ink: Color = Color(0xFF07070D)) {
    scene ?: return
    val figures = figuresOf(scene)
    if (figures.isEmpty()) return
    val s = height / 100f
    // 逆光の照り返し
    val glowC = Offset(cx, footY - height * 0.62f)
    drawCircle(
        Brush.radialGradient(listOf(Color(0xFFFFF4D0).copy(alpha = 0.55f), Color(0xFFFFF4D0).copy(alpha = 0.18f), Color.Transparent), center = glowC, radius = height * 0.75f),
        height * 0.75f,
        glowC,
    )
    figures.forEach { fig ->
        val k = s * fig.scale
        val ox = cx + fig.dx * s
        fun p(v: Offset) = Offset(ox + (if (fig.flip) -v.x else v.x) * k, footY + v.y * k)
        val pose = fig.pose
        // 胴（首から腰への台形）
        val t = pose.torso
        val ang = atan2(t[3] - t[1], t[2] - t[0])
        val px = -sin(ang)
        val py = cos(ang)
        val torso = listOf(
            o(t[0] + px * t[4] / 2, t[1] + py * t[4] / 2),
            o(t[2] + px * t[5] / 2, t[3] + py * t[5] / 2),
            o(t[2] - px * t[5] / 2, t[3] - py * t[5] / 2),
            o(t[0] - px * t[4] / 2, t[1] - py * t[4] / 2),
        ).map(::p)
        drawPath(Path().apply { moveTo(torso[0].x, torso[0].y); torso.drop(1).forEach { lineTo(it.x, it.y) }; close() }, ink)
        drawCircle(ink, t[4] / 2 * 0.8f * k, p(o(t[0], t[1])))
        drawCircle(ink, t[5] / 2 * k, p(o(t[2], t[3])))
        // 手足（付け根から先へ細く）
        pose.limbs.forEach { (pts, w) ->
            pts.zipWithNext().forEachIndexed { i, (a, b) ->
                val ww = w * when (i) { 0 -> 1f; 1 -> 0.8f; else -> 0.55f } * k
                drawLine(ink, p(a), p(b), ww, cap = StrokeCap.Round)
            }
        }
        // バット（握りから先へ太く）
        pose.bat?.let { (a, b) ->
            val n = 12
            for (i in 0 until n) {
                val f0 = i / n.toFloat()
                val f1 = (i + 1) / n.toFloat()
                drawLine(ink, p(a + (b - a) * f0), p(a + (b - a) * f1), (2.6f + 2.6f * f0) * k, cap = StrokeCap.Round)
            }
        }
        drawCircle(ink, pose.head[2] * k, p(o(pose.head[0], pose.head[1])))
        pose.cap?.let { c -> val q = c.map(::p); drawPath(Path().apply { moveTo(q[0].x, q[0].y); q.drop(1).forEach { lineTo(it.x, it.y) }; close() }, ink) }
        pose.hands.forEach { h -> drawCircle(ink, h[2] * k, p(o(h[0], h[1]))) }
    }
}

/**
 * 影絵の絵（番号は FrontPage.shots の "s01" など）。同じ番号の2枚目は paper_sil_01b のように足して、ここに並べる。
 */
private val SHOT_IMAGES: Map<String, List<Int>> = mapOf(
    "s01" to listOf(R.drawable.paper_sil_01),
    "s02" to listOf(R.drawable.paper_sil_02, R.drawable.paper_sil_02b),
    "s03" to listOf(R.drawable.paper_sil_03),
)

/** 候補の組から、絵のある最初の組を選び、組の中は [seed] で選ぶ。絵が無ければ null（図形で描く） */
internal fun shotImageRes(shots: List<List<String>>, seed: Int): Int? {
    for (group in shots) {
        val imgs = group.flatMap { SHOT_IMAGES[it].orEmpty() }
        if (imgs.isNotEmpty()) return imgs[Math.floorMod(seed, imgs.size)]
    }
    return null
}

/** 絵の影絵を描く。[left] は左端、[footY] は足元、[height] は絵の高さ（px）。後ろに照り返しを置く */
internal fun DrawScope.drawSilhouetteImage(img: ImageBitmap, left: Float, footY: Float, height: Float) {
    val w = height * img.width / img.height
    val glowC = Offset(left + w / 2, footY - height * 0.6f)
    drawCircle(
        Brush.radialGradient(listOf(Color(0xFFFFF4D0).copy(alpha = 0.55f), Color(0xFFFFF4D0).copy(alpha = 0.18f), Color.Transparent), center = glowC, radius = height * 0.75f),
        height * 0.75f,
        glowC,
    )
    drawImage(
        img,
        srcOffset = IntOffset.Zero,
        srcSize = IntSize(img.width, img.height),
        dstOffset = IntOffset(left.toInt(), (footY - height).toInt()),
        dstSize = IntSize(w.toInt(), height.toInt()),
    )
}
