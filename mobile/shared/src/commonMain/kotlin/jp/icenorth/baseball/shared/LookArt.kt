package jp.icenorth.baseball.shared

import kotlinx.serialization.Serializable
import kotlin.math.floor

// ============================================================
// 新しい見た目（試作）の絵: 球団マーク・選手の顔・調子の顔の**描く手順の一覧**。
// Web 版 `src/online/look/art.js` の写し。答え合わせは `LookTest`（期待値は
// mobile/tools/expect-look.mjs が書き出す）。どちらかの絵を変えたら両方を直し、期待値を書き出し直す。
//
//   図形は path / circle / ellipse / rect / text の5種類だけ。`c` の図形は `clip` の丸で切る。
//   字はいつも中央ぞろえ（x が字の中心、y が字の並ぶ線）。
// ⚠ 乱数を引く回数は年齢や調子で変えない（誕生日を境に別人の顔になる）。
// ⚠ 数は Web と同じ形の字にする（`jsNum`）。path の字を Web と字面で比べる。
// ============================================================

/** 図形1つ。項目の名前は Web の一覧と同じ（期待値と JSON で比べる） */
@Serializable
data class LookItem(
    val t: String,
    val d: String? = null,
    val cx: Double? = null,
    val cy: Double? = null,
    val r: Double? = null,
    val rx: Double? = null,
    val ry: Double? = null,
    val x: Double? = null,
    val y: Double? = null,
    val w: Double? = null,
    val h: Double? = null,
    val size: Double? = null,
    val font: String? = null,
    val text: String? = null,
    val ls: Double? = null,
    val fill: String? = null,
    val stroke: String? = null,
    val sw: Double? = null,
    val op: Double? = null,
    val cap: String? = null,
    val join: String? = null,
    val c: Boolean = false,
)

@Serializable
data class LookClip(val cx: Double, val cy: Double, val r: Double)

/** 描く手順の一覧。`box` は見る枠（x, y, 幅, 高さ） */
@Serializable
data class LookArt(val box: List<Double>, val clip: LookClip? = null, val items: List<LookItem>)

/** JS の `Math.round(v * 100) / 100` */
internal fun lookR2(v: Double): Double = floor(v * 100 + 0.5) / 100

/** JS の数の字（小数2桁までの数だけ。`59.8`・`46`・`-2`） */
internal fun jsNum(v: Double): String {
    val cents = floor(kotlin.math.abs(v) * 100 + 0.5).toLong()
    val sign = if (v < 0 && cents != 0L) "-" else ""
    val whole = cents / 100
    val frac = (cents % 100).toInt()
    return when {
        frac == 0 -> "$sign$whole"
        frac % 10 == 0 -> "$sign$whole.${frac / 10}"
        else -> "$sign$whole.${frac.toString().padStart(2, '0')}"
    }
}

/** 色を暗く（k<0）・明るく（k>0）する。Web 版 `shade` */
fun lookShade(hex: String, k: Double): String {
    val n = hex.substring(1).toInt(16)
    val ch = listOf(n shr 16, (n shr 8) and 255, n and 255)
    return "#" + ch.joinToString("") { v ->
        val f = jsRound(if (k < 0) v * (1 + k) else v + (255 - v) * k).coerceIn(0, 255)
        f.toString(16).padStart(2, '0')
    }
}

private fun String.cpCount(): Int = codePointStrings().size

// ---- 球団マーク（帽子のマーク） -----------------------------------------
private fun monoText(look: TeamLook, size: Double, fill: String, stroke: String, sw: Double, dy: Double = 0.0): LookItem {
    val two = look.mono.cpCount() > 1
    val jp = look.font == "jp"
    val fs = if (two) size * (if (jp) 0.5 else 0.62) else if (jp) size * 0.82 else size
    return LookItem(
        t = "text",
        x = 50.0,
        y = lookR2(50 + fs * (if (jp) 0.36 else 0.35) + dy),
        size = lookR2(fs),
        font = look.font,
        fill = fill,
        stroke = stroke,
        sw = sw,
        text = look.mono,
        ls = if (two && !jp) -2.0 else 0.0,
    )
}

/** 球団マーク（100×100）。Web 版 `emblemArt` */
fun emblemArt(look: TeamLook): LookArt {
    val c1 = look.c1
    val c2 = look.c2
    val c3 = look.c3
    val items = mutableListOf<LookItem>()
    when (look.style) {
        "shield" -> {
            items += LookItem(t = "path", d = "M50 4 L90 16 Q90 64 50 96 Q10 64 10 16 Z", fill = c1, stroke = c2, sw = 4.0)
            items += LookItem(t = "path", d = "M50 12 L82 21 Q82 60 50 87 Q18 60 18 21 Z", stroke = c3, sw = 1.5, op = 0.7)
            items += monoText(look, 50.0, c3, c2, 4.0)
        }
        "diamond" -> {
            items += LookItem(t = "path", d = "M50 3 L97 50 L50 97 L3 50 Z", fill = c1, stroke = c2, sw = 4.0)
            items += LookItem(t = "path", d = "M50 14 L86 50 L50 86 L14 50 Z", stroke = c3, sw = 1.5, op = 0.75)
            items += monoText(look, 44.0, c3, c2, 4.0)
        }
        "script" -> {
            items += LookItem(t = "circle", cx = 50.0, cy = 50.0, r = 47.0, fill = c1, stroke = c2, sw = 3.0)
            items += LookItem(t = "text", x = 51.0, y = 70.0, size = 66.0, font = look.font, fill = c2, stroke = lookShade(c1, -0.4), sw = 3.0, text = look.mono, ls = 0.0)
        }
        "block", "slab" -> {
            // 帽子に直接縫った字（丸の地）
            items += LookItem(t = "circle", cx = 50.0, cy = 50.0, r = 47.0, fill = c1, stroke = if (c3 == "#ffffff") c2 else c3, sw = 3.0)
            items += monoText(look, 62.0, c2, c3, 3.0)
        }
        else -> {
            // circle: 二重の輪と両脇の点
            items += LookItem(t = "circle", cx = 50.0, cy = 50.0, r = 47.0, fill = c1, stroke = c2, sw = 3.0)
            items += LookItem(t = "circle", cx = 50.0, cy = 50.0, r = 38.0, stroke = c2, sw = 1.5)
            items += monoText(look, if (look.mono.cpCount() > 1) 52.0 else 46.0, c3, c2, 3.0, 2.0)
            items += LookItem(t = "circle", cx = 17.0, cy = 50.0, r = 2.2, fill = c2)
            items += LookItem(t = "circle", cx = 83.0, cy = 50.0, r = 2.2, fill = c2)
        }
    }
    return LookArt(box = listOf(0.0, 0.0, 100.0, 100.0), clip = null, items = items)
}

// ---- 選手・指導者の顔 ------------------------------------------------------
private val SKINS = listOf("#f7dcc0", "#f3cfae", "#eec29b", "#e2ad84", "#cf9468", "#a8704a")
private val HAIRS = listOf("#1d1916", "#26201b", "#33271f", "#4a3426", "#6b4c33")
/** 番記者の背広 */
private const val SUIT = "#3f3f46"
private const val GREY = "#8a8580"
private const val INK = "#2a211c"

/** 白髪になる見込み（年をとるほど。同じ人は一度白髪になれば戻らない） */
private fun greyChance(age: Int): Double = if (age >= 55) 0.85 else if (age >= 45) 0.6 else if (age >= 36) 0.4 else 0.0

/**
 * 選手の顔（見る枠は 12,11 から 76×76）。Web 版 `faceArt`。
 * @param seed 選手は `p<id>`、指導者は `c<id>`（名前は同名の別人がいるので使わない）
 * @param look 帽子の球団（所属が無ければ `NEUTRAL_LOOK`）
 * @param level 調子（ゲームの段: 4 絶好調 … 0 絶不調、null は普通の顔）
 */
fun faceArt(seed: String, look: TeamLook, age: Int = 25, level: Int? = null, suit: Boolean = false): LookArt {
    val r = LookRng(lookHash(seed))
    // ⚠ 引く回数を固定する（上の注意）。並べた順に引く
    val skinRoll = r.next()
    val skinLight = r.pick(SKINS.subList(0, 4))
    val skinDark = r.pick(SKINS.subList(3, SKINS.size))
    val hairPick = r.pick(HAIRS)
    val greyRoll = r.next()
    val jaw = 19 + r.next() * 4
    val browType = floor(r.next() * 4).toInt()
    val eyeType = floor(r.next() * 4).toInt()
    val hairType = floor(r.next() * 3).toInt()
    val glasses = r.next() < 0.1
    val beardRoll = r.next()

    val skin = if (skinRoll < 0.85) skinLight else skinDark
    val grey = greyRoll < greyChance(age)
    val hair = if (grey) GREY else hairPick
    val beard = when {
        suit -> ""
        age >= 27 && beardRoll < 0.22 -> "beard"
        age >= 24 && beardRoll < 0.4 -> "stubble"
        age >= 30 && beardRoll < 0.5 -> "mustache"
        else -> ""
    }
    // 見本は 0 が絶好調。ゲームは 4 が絶好調なので裏返す
    val cond = if (level != null) 4 - level else 2
    val c1 = look.c1
    val c2 = look.c2
    val c3 = look.c3
    val cap = c1
    val visor = lookShade(c1, -0.25)
    val skinD = lookShade(skin, -0.14)
    val j = lookR2(jaw)
    fun L(d: Double) = jsNum(lookR2(50 - j + d))
    fun R(d: Double) = jsNum(lookR2(50 + j + d))
    fun n(v: Double) = jsNum(v)
    fun n(v: Int) = v.toString()
    val items = mutableListOf<LookItem>()
    fun add(item: LookItem) {
        items += item.copy(c = true)
    }

    items += LookItem(t = "circle", cx = 50.0, cy = 49.0, r = 38.0, fill = lookShade(c1, 0.82))
    // 首と体（ユニフォーム。番記者は背広）
    add(LookItem(t = "rect", x = 43.0, y = 68.0, w = 14.0, h = 14.0, fill = skinD))
    add(LookItem(t = "path", d = "M10 104 Q12 82 36 77 L64 77 Q88 82 90 104 Z", fill = if (suit) SUIT else "#f6f3ec"))
    if (suit) {
        add(LookItem(t = "path", d = "M39 77 L50 95 L61 77 Z", fill = "#ffffff"))
        add(LookItem(t = "path", d = "M48.4 79 L51.6 79 L52.6 91 L50 95 L47.4 91 Z", fill = c1))
        add(LookItem(t = "path", d = "M36 77 L44 90 M64 77 L56 90", stroke = lookShade(SUIT, -0.35), sw = 1.2))
    } else {
        add(LookItem(t = "path", d = "M38 77 L50 90 L62 77", stroke = c1, sw = 3.2, join = "round"))
        val side = if (c2 == "#ffffff" || c2 == "#f8fafc") c1 else c2
        add(LookItem(t = "path", d = "M10 104 Q12 82 36 77", stroke = side, sw = 2.0))
        add(LookItem(t = "path", d = "M90 104 Q88 82 64 77", stroke = side, sw = 2.0))
    }
    // 後ろ髪・耳
    if (hairType == 2) add(LookItem(t = "path", d = "M28 42 Q24 62 32 66 L68 66 Q76 62 72 42 Z", fill = hair))
    add(LookItem(t = "ellipse", cx = lookR2(50 - j - 1), cy = 57.0, rx = 4.0, ry = 6.0, fill = skin))
    add(LookItem(t = "ellipse", cx = lookR2(50 + j + 1), cy = 57.0, rx = 4.0, ry = 6.0, fill = skin))
    // 頭
    add(LookItem(t = "path", d = "M${L(0.0)} 46 Q${L(0.0)} 79 50 80 Q${R(0.0)} 79 ${R(0.0)} 46 Z", fill = skin))
    // もみあげ
    val sb = if (hairType == 0) 6 else 10
    add(LookItem(t = "path", d = "M${L(0.0)} 44 L${L(4.0)} 44 L${L(4.0)} ${46 + sb} Q${L(1.0)} ${46 + sb} ${L(0.0)} ${44 + sb} Z", fill = hair))
    add(LookItem(t = "path", d = "M${R(0.0)} 44 L${R(-4.0)} 44 L${R(-4.0)} ${46 + sb} Q${R(-1.0)} ${46 + sb} ${R(0.0)} ${44 + sb} Z", fill = hair))
    // ひげ
    when (beard) {
        "beard" -> {
            add(LookItem(t = "path", d = "M${L(1.0)} 60 Q${L(3.0)} 82 50 83 Q${R(-3.0)} 82 ${R(-1.0)} 60 Q${R(-4.0)} 76 50 77 Q${L(4.0)} 76 ${L(1.0)} 60 Z", fill = hair, op = 0.9))
            add(LookItem(t = "path", d = "M42 69 Q50 66 58 69 Q50 70 42 69 Z", fill = hair))
        }
        "stubble" ->
            add(LookItem(t = "path", d = "M${L(1.0)} 62 Q${L(3.0)} 81 50 81 Q${R(-3.0)} 81 ${R(-1.0)} 62 Q${R(-4.0)} 74 50 75 Q${L(4.0)} 74 ${L(1.0)} 62 Z", fill = hair, op = 0.22))
        "mustache" ->
            add(LookItem(t = "path", d = "M42 69.5 Q50 65.5 58 69.5 Q50 71 42 69.5 Z", fill = hair))
    }
    if (suit) {
        // 前髪（番記者）。分け目は髪の型で左・右・まん中。
        // 頭の上は帽子が無いので、額から上も肌で描いてから前髪をのせる
        val part = listOf(44, 56, 50)[hairType]
        add(LookItem(t = "path", d = "M${L(0.0)} 48 Q${L(0.0)} 24 50 24 Q${R(0.0)} 24 ${R(0.0)} 48 Z", fill = skin))
        add(LookItem(t = "path", d = "M${L(-2.0)} 52 Q${L(-4.0)} 22 50 21 Q${R(4.0)} 22 ${R(2.0)} 52 Q${R(-1.0)} 40 $part 36 Q${L(1.0)} 40 ${L(-2.0)} 52 Z", fill = hair))
    } else {
        // 帽子（球団の字とつば）
        add(LookItem(t = "path", d = "M${L(-3.0)} 45 Q${L(-3.0)} 19 50 18 Q${R(3.0)} 19 ${R(3.0)} 45 Z", fill = cap))
        add(LookItem(t = "path", d = "M50 18 L50 45", stroke = lookShade(cap, -0.3), sw = 0.8, op = 0.6))
        add(LookItem(t = "circle", cx = 50.0, cy = 18.6, r = 2.3, fill = lookShade(cap, -0.3)))
        if (look.mono.isNotEmpty()) {
            val two = look.mono.cpCount() > 1
            val script = look.style == "script"
            val size = if (look.font == "jp") (if (two) 8.0 else 11.0) else if (two) 10.0 else if (script) 17.0 else 14.0
            add(LookItem(t = "text", x = 50.0, y = if (script) 40.0 else 38.5, size = size, font = look.font, fill = c2, stroke = c3, sw = 0.8, text = look.mono, ls = if (two && look.font != "jp") -0.5 else 0.0))
        }
        add(LookItem(t = "path", d = "M${L(-6.0)} 45 Q50 39 ${R(6.0)} 45 Q${R(7.0)} 50 ${R(2.0)} 50.5 Q50 46 ${L(-2.0)} 50.5 Q${L(-7.0)} 50 ${L(-6.0)} 45 Z", fill = visor))
        add(LookItem(t = "path", d = "M${L(1.0)} 50.5 Q50 47 ${R(-1.0)} 50.5 L${R(-1.0)} 52.5 Q50 49.5 ${L(1.0)} 52.5 Z", fill = "#000000", op = 0.12))
    }
    // 眉
    val by = if (cond == 0) 52.0 else 53.5
    val worried = cond >= 3
    val sad = cond == 4
    val browW = if (browType == 2) 2.6 else 1.8
    val browInk = if (grey) "#6a6560" else INK
    fun brow(x1: Int, y1: Double, x2: Int, y2: Double, c: Double) =
        add(LookItem(t = "path", d = "M$x1 ${n(lookR2(y1))} Q${n(lookR2((x1 + x2) / 2.0))} ${n(lookR2(c))} $x2 ${n(lookR2(y2))}", stroke = browInk, sw = browW, cap = "round"))
    if (worried) {
        brow(36, by, 45, by - (if (sad) 3.0 else 1.6), by - 1)
        brow(64, by, 55, by - (if (sad) 3.0 else 1.6), by - 1)
    } else if (browType == 3) {
        brow(36, by - 1.2, 45, by + 0.8, by - 0.6)
        brow(64, by - 1.2, 55, by + 0.8, by - 0.6)
    } else if (browType == 1) {
        brow(36, by + 0.5, 45, by + 0.5, by - 2.2)
        brow(64, by + 0.5, 55, by + 0.5, by - 2.2)
    } else {
        brow(36, by, 45, by, by - 0.8)
        brow(64, by, 55, by, by - 0.8)
    }
    // 目
    val ey = 59
    fun eye(cx: Int) {
        when {
            cond == 0 ->
                add(LookItem(t = "path", d = "M${n(lookR2(cx - 3.2))} ${n(ey + 0.8)} Q$cx ${n(ey - 3.2)} ${n(lookR2(cx + 3.2))} ${n(ey + 0.8)}", stroke = INK, sw = 2.0, cap = "round"))
            eyeType == 0 -> {
                add(LookItem(t = "ellipse", cx = cx.toDouble(), cy = ey.toDouble(), rx = 2.2, ry = 2.8, fill = INK))
                add(LookItem(t = "circle", cx = lookR2(cx + 0.8), cy = (ey - 1).toDouble(), r = 0.8, fill = "#ffffff"))
            }
            eyeType == 1 -> add(LookItem(t = "circle", cx = cx.toDouble(), cy = ey.toDouble(), r = 1.9, fill = INK))
            eyeType == 2 -> {
                add(LookItem(t = "path", d = "M${n(lookR2(cx - 3.4))} $ey Q$cx ${n(lookR2(ey - 2.4))} ${n(lookR2(cx + 3.4))} $ey", stroke = INK, sw = 1.6, cap = "round"))
                add(LookItem(t = "circle", cx = cx.toDouble(), cy = lookR2(ey + 0.2), r = 1.3, fill = INK))
            }
            else -> {
                add(LookItem(t = "ellipse", cx = cx.toDouble(), cy = ey.toDouble(), rx = 3.0, ry = 2.2, fill = "#ffffff"))
                add(LookItem(t = "circle", cx = cx.toDouble(), cy = ey.toDouble(), r = 1.7, fill = INK))
                add(LookItem(t = "path", d = "M${n(lookR2(cx - 3.2))} ${n(lookR2(ey - 1.2))} Q$cx ${ey - 3} ${n(lookR2(cx + 3.2))} ${n(lookR2(ey - 1.2))}", stroke = INK, sw = 1.0))
            }
        }
    }
    eye(41)
    eye(59)
    // 目じりのしわ（33歳から）・ほうれい線（45歳から）
    if (age >= 33) add(LookItem(t = "path", d = "M33.5 58 l-2 -1 M33.5 60 l-2 1 M66.5 58 l2 -1 M66.5 60 l2 1", stroke = skinD, sw = 0.9))
    if (age >= 45) add(LookItem(t = "path", d = "M43 64 Q40.5 68 42 71.5 M57 64 Q59.5 68 58 71.5", stroke = skinD, sw = 0.9))
    if (glasses) {
        add(LookItem(t = "circle", cx = 41.0, cy = 59.0, r = 5.6, stroke = "#2b2b2b", sw = 1.5))
        add(LookItem(t = "circle", cx = 59.0, cy = 59.0, r = 5.6, stroke = "#2b2b2b", sw = 1.5))
        add(LookItem(t = "path", d = "M46.6 58.5 Q50 57 53.4 58.5", stroke = "#2b2b2b", sw = 1.5))
    }
    // 鼻
    add(LookItem(t = "path", d = "M50 61 Q48 66 50.5 66.6", stroke = skinD, sw = 1.4, cap = "round"))
    // ほお（若い選手と絶好調）
    if (age <= 22 || cond == 0) {
        add(LookItem(t = "circle", cx = 35.0, cy = 66.0, r = 3.4, fill = "#ff8a80", op = 0.35))
        add(LookItem(t = "circle", cx = 65.0, cy = 66.0, r = 3.4, fill = "#ff8a80", op = 0.35))
    }
    // 口
    val my = 72
    when (cond) {
        0 -> {
            add(LookItem(t = "path", d = "M42.5 ${n(my - 1.5)} Q50 ${n(my - 2.5)} 57.5 ${n(my - 1.5)} Q56 ${my + 6} 50 ${my + 6} Q44 ${my + 6} 42.5 ${n(my - 1.5)} Z", fill = "#7a2a22"))
            add(LookItem(t = "path", d = "M43.5 ${n(lookR2(my - 1.2))} Q50 ${my - 2} 56.5 ${n(lookR2(my - 1.2))} L56 ${n(lookR2(my + 0.8))} Q50 ${n(lookR2(my + 0.2))} 44 ${n(lookR2(my + 0.8))} Z", fill = "#ffffff"))
        }
        1 -> add(LookItem(t = "path", d = "M44 ${my - 1} Q50 ${my + 4} 56 ${my - 1}", stroke = INK, sw = 1.7, cap = "round"))
        2 -> add(LookItem(t = "path", d = "M45.5 ${n(lookR2(my + 0.5))} L54.5 ${n(lookR2(my + 0.5))}", stroke = INK, sw = 1.7, cap = "round"))
        3 -> add(LookItem(t = "path", d = "M45 ${my + 2} Q50 ${n(lookR2(my - 1.5))} 55 ${my + 2}", stroke = INK, sw = 1.7, cap = "round"))
        else -> add(LookItem(t = "path", d = "M44 ${n(lookR2(my + 1.5))} q1.5 -2 3 0 t3 0 t3 0 t3 0", stroke = INK, sw = 1.6, cap = "round"))
    }
    // 汗（絶不調）・きらり（絶好調）は丸の外まで出す
    if (cond == 4) items += LookItem(t = "path", d = "M73 36 Q75 42 72 45 Q69 42 72 36 Z", fill = "#5ab4f0", stroke = "#ffffff", sw = 0.8)
    if (cond == 0) items += LookItem(t = "path", d = "M76 20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z", fill = "#ffcf3f", stroke = "#ffffff", sw = 0.6)
    return LookArt(box = listOf(12.0, 11.0, 76.0, 76.0), clip = LookClip(50.0, 49.0, 38.0), items = items)
}

// ---- 調子の顔（絵文字の代わり。24×24） --------------------------------------
/** 調子の色（ゲームの段: 0 絶不調 … 4 絶好調） */
val CONDITION_FACE_COLORS = listOf("#8a6fd1", "#5d9cec", "#f2d54b", "#ffa93a", "#ff5a3c")

/** 調子の顔。Web 版 `conditionArt` */
fun conditionArt(level: Int?): LookArt {
    val c = CONDITION_FACE_COLORS.getOrNull(level ?: -1) ?: "#94a3b8"
    val ink = "#2a1d14"
    val items = mutableListOf<LookItem>()
    if (level == 4) {
        items += LookItem(t = "path", d = "M12 0.5 Q15 3 13.5 5 Q16 4 16 2 Q19 6 15 7.5 L9 7.5 Q5 6 8 2 Q8 4.5 10.5 5 Q9 2.5 12 0.5 Z", fill = "#ffcf3f")
    }
    items += LookItem(t = "circle", cx = 12.0, cy = 12.5, r = 10.0, fill = c, stroke = lookShade(c, -0.35), sw = 1.0)
    fun eyes(y: Double) {
        items += LookItem(t = "circle", cx = 9.0, cy = y, r = 1.3, fill = ink)
        items += LookItem(t = "circle", cx = 15.0, cy = y, r = 1.3, fill = ink)
    }
    when (level) {
        4 -> {
            items += LookItem(t = "path", d = "M7 13 Q12 20 17 13 Z", fill = ink)
            items += LookItem(t = "path", d = "M7.5 9.5 q1.5 -2 3 0 M13.5 9.5 q1.5 -2 3 0", stroke = ink, sw = 1.3, cap = "round")
        }
        3 -> {
            eyes(9.5)
            items += LookItem(t = "path", d = "M8 13.5 Q12 17 16 13.5", stroke = ink, sw = 1.4, cap = "round")
        }
        2 -> {
            eyes(10.0)
            items += LookItem(t = "path", d = "M9 15 L15 15", stroke = ink, sw = 1.4, cap = "round")
        }
        1 -> {
            eyes(10.0)
            items += LookItem(t = "path", d = "M8.5 16 Q12 13 15.5 16", stroke = ink, sw = 1.4, cap = "round")
        }
        else -> {
            items += LookItem(t = "path", d = "M7.5 9 L10.5 10.5 M16.5 9 L13.5 10.5", stroke = ink, sw = 1.3, cap = "round")
            items += LookItem(t = "path", d = "M8 16 q1 -1.5 2 0 t2 0 t2 0 t2 0", stroke = ink, sw = 1.3, cap = "round")
            items += LookItem(t = "path", d = "M19.5 4 Q21.5 7.5 19.5 9 Q17.5 7.5 19.5 4 Z", fill = "#bfe3ff")
        }
    }
    return LookArt(box = listOf(0.0, 0.0, 24.0, 24.0), clip = null, items = items)
}
