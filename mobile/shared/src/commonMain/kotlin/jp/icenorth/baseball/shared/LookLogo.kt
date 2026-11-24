package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin

// ============================================================
// 球団ロゴ（新しい見た目（試作））の**描く側**。Web 版 `src/online/look/logoArt.js` と、
// `logoData.js` の `openLayer`・`logoParts.js` の色と字の幅の写し。答え合わせは `LookTest`
// （期待値は mobile/tools/expect-look.mjs が書き出す）。どちらかを変えたら両方を直す。
// 図形・字の幅の表は `Tables.kt`（mobile/tools/gen-tables.mjs が Web 版から書き出す）。
//
//   ロゴは**部品の重ね**（最大8枚。図形・絵・字）。サーバーが全球団ぶんを色と一緒に
//   ビューの `teamLabels[].logo` に載せてくる（作っていない球団は自動のロゴ）ので、
//   アプリは載ってきた重ねを描くだけ。型・おまかせの候補・作る画面は写していない。
//
//   図形に `tf: [x, y, r, sx, sy, ox, oy]` が付く。意味は
//     「(ox, oy) だけずらす → (sx, sy) 倍にする → r 度回す → (x, y) へ動かす」。
//   `po: 1` の図形は、ふちを先に描いてから塗る。`li` は何枚目の部品か。
//
// ⚠ ビューの読み込みを止めない: ロゴは [JsonElement] のまま受け取り、ここでゆるく読む
//    （形のおかしいロゴが1つあっても、ビュー全体が読めなくなることは無い。読めないロゴは null）。
// ⚠ 字の幅はフォントから測らず表の数で決める（Web と同じ大きさ・同じアーチの字送りにするため）。
// ⚠ 絵の形（`icons`）は別に読む。まだ届いていない絵の部品は飛ばして描く。
// ============================================================

/** 色: 球団の色の番号（0 地・1 差し色・2 縁・3 白・4 黒）か、`hex`（"#rrggbb"） */
data class LogoColor(val index: Int = 0, val hex: String? = null)

/** 部品1枚（保存の形を開いたもの。書いていない項目は既定の値）。Web 版 `openLayer` */
data class LogoLayer(
    /** 種類: 図形の名前・絵の名前・"text" */
    val k: String,
    val x: Double = 50.0,
    val y: Double = 50.0,
    val s: Double = 1.0,
    val r: Double = 0.0,
    val c: LogoColor = LogoColor(),
    /** ふちの色（無ければふち無し） */
    val o: LogoColor? = null,
    val ow: Double = 0.0,
    /** 左右反転 */
    val f: Boolean = false,
    /** 線だけで描く太さ（0 なら塗る） */
    val line: Double = 0.0,
    val t: String = "",
    val font: String = "graduate",
    /** アーチの半径（＋は上の弧、−は下の弧、0 はまっすぐ） */
    val arc: Double = 0.0,
)

/** 1球団のロゴ。`mini` は小さく出すとき（[LOGO_MINI_SIZE] 以下）の重ね、`colors` は球団の色 [地, 差し色, 縁] */
data class TeamLogo(val layers: List<LogoLayer>, val mini: List<LogoLayer> = emptyList(), val colors: List<String>? = null)

private val HEX_COLOR = Regex("^#[0-9a-f]{6}$")
/** 球団の色3つ（どれも "#rrggbb"）。そうでなければ null */
private fun teamColorsOf(e: JsonElement?): List<String>? {
    val list = (e as? JsonArray)?.map { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content ?: "" } ?: return null
    return list.takeIf { it.size == 3 && it.all { c -> HEX_COLOR.matches(c) } }
}
private fun JsonObject.number(key: String, fallback: Double): Double =
    (this[key] as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull?.takeIf { it.isFinite() } ?: fallback
private fun JsonObject.string(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
/** JS の「真」（1・true） */
private fun JsonObject.flag(key: String): Boolean {
    val p = this[key] as? JsonPrimitive ?: return false
    return p.booleanOrNull ?: (!p.isString && (p.doubleOrNull ?: 0.0) != 0.0)
}
private fun logoColorOf(e: JsonElement?): LogoColor? {
    val p = e as? JsonPrimitive ?: return null
    // ⚠ 色でない字（サーバーは通さない）は「無い」と同じに読む（塗りは地の色、ふちは無し）
    if (p.isString) return if (HEX_COLOR.matches(p.content)) LogoColor(hex = p.content) else null
    val n = p.doubleOrNull ?: return null
    return if (n == floor(n) && n in 0.0..4.0) LogoColor(n.toInt()) else LogoColor()
}
private fun logoLayerOf(e: JsonElement): LogoLayer? {
    val o = e as? JsonObject ?: return null
    val k = o.string("k") ?: return null
    return LogoLayer(
        k = k,
        x = o.number("x", 50.0),
        y = o.number("y", 50.0),
        s = o.number("s", 1.0),
        r = o.number("r", 0.0),
        c = logoColorOf(o["c"]) ?: LogoColor(),
        o = logoColorOf(o["o"]),
        ow = o.number("ow", 0.0),
        f = o.flag("f"),
        line = o.number("line", 0.0),
        t = o.string("t") ?: "",
        font = o.string("font") ?: "graduate",
        arc = o.number("arc", 0.0),
    )
}
private fun logoLayersOf(e: JsonElement?, max: Int): List<LogoLayer> =
    (e as? JsonArray)?.take(max)?.mapNotNull { runCatching { logoLayerOf(it) }.getOrNull() }.orEmpty()

/** ビューの `teamLabels[].logo` を読む。部品が1枚も無い・形がおかしいときは null（今までのマークを描く） */
fun teamLogoOf(e: JsonElement?): TeamLogo? {
    val o = e as? JsonObject ?: return null
    val layers = logoLayersOf(o["layers"], LOGO_MAX_LAYERS)
    if (layers.isEmpty()) return null
    return TeamLogo(layers, logoLayersOf(o["mini"], LOGO_MINI_MAX_LAYERS), teamColorsOf(o["colors"]))
}

// ---- 描く手順 ---------------------------------------------------------------
/** 絵の箱は 512×512。ロゴの箱（100）へ縮める倍率 */
private const val ICON_UNIT = 100.0 / 512
/** 色の番号 4（黒） */
private val INK = LogoColor(4)

/** 倍率は小数4桁（絵の倍率は 0.1 前後なので、2桁では粗い）。JS の `Math.round(v * 10000) / 10000` */
private fun r4(v: Double): Double = floor(v * 10000 + 0.5) / 10000

/** 色の番号か "#rrggbb" を色にする。`colors` は球団の色3つ＋白＋黒。Web 版 `colorOf` */
private fun paintOf(colors: List<String>, c: LogoColor?): String = c?.hex ?: colors.getOrNull(c?.index ?: 0) ?: colors[0]

/** 1字の幅（字の大きさを1として）。Web 版 `charWidth` */
fun logoCharWidth(ch: String, font: String): Double {
    val code = if (ch.length == 1) ch[0].code else -1
    if (code in 0x20..0x7e) return (LOGO_CHAR_WIDTHS[font]?.get(code - 0x20) ?: LOGO_OTHER_ASCII_WIDTH) / 1000.0
    return 1.0
}

private fun textItems(L: LogoLayer, colors: List<String>, li: Int): List<LookItem> {
    val fs = lookR2(LOGO_TEXT_UNIT * L.s)
    val dy = lookR2(fs * (if (L.font == "jp") 0.36 else 0.35))
    val fill = paintOf(colors, L.c)
    val edged = L.o != null && L.ow != 0.0
    val stroke = if (edged) paintOf(colors, L.o) else null
    val sw = if (edged) lookR2(L.ow) else null
    val flip = if (L.f) -1.0 else 1.0
    fun one(text: String, tf: List<Double>, filled: Boolean, edge: Boolean) = LookItem(
        t = "text", x = 0.0, y = dy, size = fs, font = L.font, text = text, ls = 0.0, tf = tf, li = li,
        fill = if (filled) fill else null,
        stroke = if (edge) stroke else null,
        sw = if (edge) sw else null,
        join = if (edge) "round" else null,
    )
    if (L.arc == 0.0) return listOf(one(L.t, listOf(lookR2(L.x), lookR2(L.y), lookR2(L.r), flip, 1.0, 0.0, 0.0), true, edged))
    val radius = abs(L.arc)
    val top = L.arc > 0
    val chars = L.t.codePointStrings()
    val widths = chars.map { logoCharWidth(it, L.font) * fs * LOGO_ARC_GAP + L.ow * 0.5 }
    val turn = (L.r * PI) / 180
    var at = -widths.fold(0.0) { a, b -> a + b } / 2 / radius
    val places = chars.mapIndexed { i, ch ->
        val mid = at + widths[i] / 2 / radius
        at += widths[i] / radius
        // 弧の上の点（部品の中心から見て）。部品ごとの回転と反転もここで掛ける
        val px = radius * sin(mid) * flip
        val py = if (top) -radius * cos(mid) else radius * cos(mid)
        val x = L.x + px * cos(turn) - py * sin(turn)
        val y = L.y + px * sin(turn) + py * cos(turn)
        val deg = ((if (top) mid else -mid) * 180 * flip) / PI + L.r
        ch to listOf(lookR2(x), lookR2(y), lookR2(deg), flip, 1.0, 0.0, 0.0)
    }
    // ⚠ ふちは全部の字を先に描く（1字ずつふち→塗りの順だと、隣の字のふちが前の字の塗りに乗る）
    val out = mutableListOf<LookItem>()
    if (edged) for ((ch, tf) in places) out += one(ch, tf, false, true)
    for ((ch, tf) in places) out += one(ch, tf, true, false)
    return out
}

private fun shapeItems(L: LogoLayer, colors: List<String>, icons: Map<String, String>?, li: Int): List<LookItem> {
    val shape = LOGO_SHAPES[L.k]
    val d = shape?.first ?: icons?.get(L.k) ?: return emptyList()
    val unit = if (shape != null) 1.0 else ICON_UNIT
    val off = if (shape != null) -50.0 else -256.0
    val k = L.s * unit
    val tf = listOf(lookR2(L.x), lookR2(L.y), lookR2(L.r), r4((if (L.f) -1 else 1) * k), r4(k), off, off)
    val out = mutableListOf<LookItem>()
    // ⚠ 線の太さは変形で一緒に拡大されるので、倍率で割っておく（どの大きさの部品でもふちは同じ太さ）
    if (L.line != 0.0) {
        out += LookItem(t = "path", d = d, tf = tf, li = li, stroke = paintOf(colors, L.c), sw = lookR2(L.line / k))
    } else {
        val edged = L.o != null && L.ow != 0.0
        out += LookItem(
            t = "path", d = d, tf = tf, li = li, fill = paintOf(colors, L.c),
            stroke = if (edged) paintOf(colors, L.o) else null,
            sw = if (edged) lookR2(L.ow / k) else null,
            join = if (edged) "round" else null,
            po = if (edged) 1 else null,
        )
    }
    shape?.second?.let { d2 ->
        out += LookItem(t = "path", d = d2, tf = tf, li = li, stroke = paintOf(colors, L.o ?: INK), sw = lookR2(2.4 / k), cap = "round")
    }
    return out
}

/**
 * 部品の重ねを描く手順にする。Web 版 `logoArt`
 * @param teamColors 球団の色 [地, 差し色, 縁]
 * @param icons 絵の形（`{ 名前: d }`。まだ無ければ null）
 */
fun logoArt(layers: List<LogoLayer>, teamColors: List<String>, icons: Map<String, String>? = null): LookArt {
    val colors = listOf(teamColors[0], teamColors[1], teamColors[2], LOGO_WHITE, LOGO_INK)
    val items = mutableListOf<LookItem>()
    layers.forEachIndexed { li, L ->
        items += if (L.k == "text") textItems(L, colors, li) else shapeItems(L, colors, icons, li)
    }
    return LookArt(box = LOGO_BOX, clip = null, items = items)
}

/** 重ねに、絵（別に読み込む形）を使う部品があるか。Web 版 `logoNeedsIcons` */
fun logoNeedsIcons(layers: List<LogoLayer>): Boolean = layers.any { it.k != "text" && it.k !in LOGO_SHAPES }

/** 出す大きさに合う重ねを選ぶ。小さいとき（[LOGO_MINI_SIZE] 以下）は小さい版、無ければそのまま。Web 版 `logoLayersFor` */
fun logoLayersFor(logo: TeamLogo, size: Double): List<LogoLayer> =
    if (size <= LOGO_MINI_SIZE && logo.mini.isNotEmpty()) logo.mini else logo.layers
