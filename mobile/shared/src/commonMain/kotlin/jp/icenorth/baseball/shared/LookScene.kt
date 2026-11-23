package jp.icenorth.baseball.shared

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

// ============================================================
// 新しい見た目（試作）段3の絵: 今日の一戦の札の背景（夜の球場）と、打席速報の球場の図。
// Web 版 `src/online/look/sceneArt.js` の写し。答え合わせは `LookTest`（期待値は
// mobile/tools/expect-look.mjs が書き出す）。どちらかの絵を変えたら両方を直し、期待値を書き出し直す。
// ⚠ 乱数を引く回数は客の入りで変えない（客は決まった数だけ引き、入りのぶんだけ描く）。
// ============================================================

/** 山あいの土地（球場の後ろを山にする）。ほかは海 */
private val MOUNTAIN_CITIES = setOf(
    "旭川", "盛岡", "山形", "郡山", "宇都宮", "前橋", "高崎", "川越", "大宮", "八王子", "立川", "相模原",
    "甲府", "長野", "松本", "岐阜", "豊田", "岡崎", "奈良", "十勝", "会津", "上州", "武蔵", "多摩",
    "信州", "飛騨", "丹波", "但馬", "筑豊", "阿蘇", "霧島", "東大阪", "久留米",
)

/** 球場の後ろの景色（"sea" 海・"mountain" 山）。Web 版 `stadiumScene` */
fun stadiumScene(city: String?): String = if (city in MOUNTAIN_CITIES) "mountain" else "sea"

/** 客の入り（0.35〜1）。順位が上・連勝中ほど入る。Web 版 `crowdLevel` */
fun crowdLevel(rank: Int?, teams: Int?, streak: Int = 0): Double {
    val n = maxOf(2, teams?.takeIf { it > 0 } ?: 12)
    val byRank = if (rank != null && rank != 0) 1 - (minOf(n, maxOf(1, rank)) - 1).toDouble() / (n - 1) else 0.5
    val hot = streak.coerceIn(-3, 5) * 0.04
    return lookR2(maxOf(0.35, minOf(1.0, 0.45 + byRank * 0.45 + hot)))
}

private const val STADIUM_W = 760.0
private const val STADIUM_H = 300.0
private const val CROWD_MAX = 420

private fun standTop(x: Double): Double {
    val t = (x - STADIUM_W / 2) / (STADIUM_W / 2)
    return 172 - 64 * (1 - t * t)
}

private fun n(v: Double) = jsNum(v)

/** 夜の球場（760×300）。Web 版 `stadiumArt` */
fun stadiumArt(look: TeamLook, scene: String = "sea", crowd: Double = 0.7, seed: String = ""): LookArt {
    val w = STADIUM_W
    val h = STADIUM_H
    val r = LookRng(lookHash("stadium:${seed.ifEmpty { look.name }}"))
    val items = mutableListOf<LookItem>()
    items += LookItem("rect", x = 0.0, y = 0.0, w = w, h = h, fill = "#070d22")
    for (i in 0 until 8) items += LookItem("rect", x = 0.0, y = 40.0 + i * 14, w = w, h = 160.0, fill = "#2c3f73", op = 0.12)
    repeat(50) {
        val cx = lookR2(r.next() * w)
        val cy = lookR2(r.next() * 95)
        val rad = lookR2(0.3 + r.next() * 1.1)
        items += LookItem("circle", cx = cx, cy = cy, r = rad, fill = "#ffffff", op = lookR2(0.3 + r.next() * 0.6))
    }
    if (scene == "mountain") {
        items += LookItem("path", d = "M0 140 L90 84 L150 116 L240 60 L330 114 L420 78 L520 124 L620 72 L760 120 L760 160 L0 160 Z", fill = "#1a2550")
        items += LookItem("path", d = "M240 60 L258 72 L246 74 Z M620 72 L640 84 L626 86 Z M90 84 L104 93 L94 95 Z", fill = "#dfe6f5", op = 0.7)
    } else {
        items += LookItem("path", d = "M0 128 Q120 108 240 120 Q330 100 420 118 L420 140 L0 140 Z", fill = "#14204a")
        items += LookItem("rect", x = 0.0, y = 128.0, w = w, h = 30.0, fill = "#0c1838")
        repeat(14) {
            val x = lookR2(r.next() * w)
            val y = lookR2(132 + r.next() * 20)
            items += LookItem("rect", x = x, y = y, w = lookR2(10 + r.next() * 30), h = 1.2, fill = "#8fb3ff", op = 0.35)
        }
        items += LookItem("rect", x = w - 120, y = 100.0, w = 6.0, h = 32.0, fill = "#dfe6f5")
        items += LookItem("circle", cx = w - 117, cy = 98.0, r = 4.0, fill = "#fff6c0")
        items += LookItem("path", d = "M${n(w - 117)} 98 L${n(w + 40)} 84 L${n(w + 40)} 112 Z", fill = "#fff6c0", op = 0.12)
    }
    // スタンドと客
    items += LookItem("path", d = "M-20 ${n(h)} L-20 ${n(lookR2(standTop(-20.0)))} Q${n(w / 2)} 44 ${n(w + 20)} ${n(lookR2(standTop(w + 20)))} L${n(w + 20)} ${n(h)} Z", fill = "#1a2140")
    items += LookItem("path", d = "M-20 ${n(lookR2(standTop(-20.0) + 12))} Q${n(w / 2)} 56 ${n(w + 20)} ${n(lookR2(standTop(w + 20) + 12))}", stroke = look.c1, sw = 5.0)
    val colors = listOf(look.c1, look.c2, "#e2e8f0", "#94a3b8", lookShade(look.c1, 0.4), "#f87171")
    val shown = jsRound(CROWD_MAX * crowd.coerceIn(0.0, 1.0))
    for (i in 0 until CROWD_MAX) {
        val x = r.next() * w
        val y = standTop(x) + 14 + r.next() * 40
        val fill = r.pick(colors)
        if (i < shown) items += LookItem("circle", cx = lookR2(x), cy = lookR2(y), r = 1.6, fill = fill, op = 0.85)
    }
    // 旗
    for (i in 0..16) {
        val x = lookR2(i * (w / 16))
        val y = lookR2(standTop(x) + 6)
        items += LookItem(
            "path",
            d = "M${n(x)} ${n(y)} L${n(x)} ${n(lookR2(y - 16))} L${n(lookR2(x + 11))} ${n(lookR2(y - 12))} L${n(x)} ${n(lookR2(y - 8))}",
            fill = if (i % 2 == 1) look.c1 else look.c2,
            stroke = "#1e293b",
            sw = 0.6,
        )
    }
    // 照明塔
    for ((x, top) in listOf(70.0 to 30.0, 200.0 to 14.0, (w - 200) to 14.0, (w - 70) to 30.0)) {
        items += LookItem("rect", x = x - 2, y = top + 20, w = 4.0, h = 190 - top, fill = "#2b3557")
        for (k in 0 until 6) items += LookItem("circle", cx = x, cy = top + 10, r = 72.0 - k * 11, fill = "#fff3b0", op = 0.045)
        items += LookItem("rect", x = x - 18, y = top, w = 36.0, h = 20.0, fill = "#3a4770")
        for (a in 0 until 4) for (b in 0 until 2) items += LookItem("circle", cx = lookR2(x - 13 + a * 8.6), cy = top + 5 + b * 9, r = 3.0, fill = "#fffbe0")
    }
    // 外野フェンス・芝・内野
    items += LookItem("path", d = "M-20 228 Q${n(w / 2)} 168 ${n(w + 20)} 228 L${n(w + 20)} 242 Q${n(w / 2)} 182 -20 242 Z", fill = look.c1)
    items += LookItem("path", d = "M-20 228 Q${n(w / 2)} 168 ${n(w + 20)} 228", stroke = look.c2, sw = 3.0)
    items += LookItem("path", d = "M-20 242 Q${n(w / 2)} 182 ${n(w + 20)} 242 L${n(w + 20)} ${n(h)} L-20 ${n(h)} Z", fill = "#2f8f4e")
    for (i in 0 until 5) {
        items += LookItem("path", d = "M-20 ${252 + i * 12} Q${n(w / 2)} ${194 + i * 14} ${n(w + 20)} ${252 + i * 12}", stroke = "#ffffff", sw = 7.0, op = if (i % 2 == 1) 0.05 else 0.09)
    }
    val cx = w / 2
    items += LookItem("path", d = "M${n(cx)} ${n(h - 6)} L${n(cx - 130)} ${n(h - 42)} L${n(cx)} ${n(h - 78)} L${n(cx + 130)} ${n(h - 42)} Z", fill = "#c98b55")
    items += LookItem("path", d = "M${n(cx)} ${n(h - 18)} L${n(cx - 96)} ${n(h - 44)} L${n(cx)} ${n(h - 68)} L${n(cx + 96)} ${n(h - 44)} Z", fill = "#3a9a57")
    items += LookItem("ellipse", cx = cx, cy = h - 44, rx = 14.0, ry = 5.0, fill = "#c98b55")
    items += LookItem("path", d = "M${n(cx)} ${n(h - 6)} L-40 ${n(h - 130)} M${n(cx)} ${n(h - 6)} L${n(w + 40)} ${n(h - 130)}", stroke = "#ffffff", sw = 1.6, op = 0.85)
    for ((x, y) in listOf((cx - 130) to (h - 42), cx to (h - 78), (cx + 130) to (h - 42))) {
        items += LookItem("rect", x = x - 4, y = y - 3, w = 8.0, h = 6.0, fill = "#ffffff")
    }
    items += LookItem("ellipse", cx = cx, cy = h - 60, rx = 300.0, ry = 90.0, fill = "#ffffff", op = 0.05)
    return LookArt(listOf(0.0, 0.0, w, h), null, items)
}

// ---- 打席速報の球場の図（160×136。左上が (20, 16)） --------------------------
private const val HX = 100.0
private const val HY = 142.0
private const val SCALE = 0.95
private const val BASE_DIST = 27.43

private fun at(dir: Double, dist: Double): Pair<Double, Double> {
    val a = dir * PI / 180
    return lookR2(HX + sin(a) * dist * SCALE) to lookR2(HY - cos(a) * dist * SCALE)
}

/** フェンスまでの距離（両翼100m・中堅122m） */
private fun fenceOf(dir: Double): Double = 100 + 22 * cos(abs(dir) * PI / 90)

/** 打球（`playByPlay` の行の守備位置・向き・飛距離・角度） */
data class LookBatted(val pos: Int, val dir: Double, val dist: Double, val la: Double)

/** 打席速報の球場の図。Web 版 `fieldArt` */
fun fieldArt(fence: TeamLook, offense: TeamLook, bases: Int = 0, batted: LookBatted? = null, code: String = "", runs: Int = 0): LookArt {
    val items = mutableListOf<LookItem>()
    items += LookItem("rect", x = 20.0, y = 16.0, w = 160.0, h = 136.0, fill = "#0b1220")
    val arc = (-45..45 step 5).map { d -> at(d.toDouble(), fenceOf(d.toDouble())) }
    val arcPath = arc.mapIndexed { i, (x, y) -> "${if (i > 0) "L" else "M"}${n(x)} ${n(y)}" }.joinToString(" ")
    items += LookItem("path", d = "M${n(HX)} ${n(HY)} ${arc.joinToString(" ") { (x, y) -> "L${n(x)} ${n(y)}" }} Z", fill = "#2f8f4e")
    items += LookItem("path", d = arcPath, stroke = fence.c1, sw = 4.0, join = "round")
    items += LookItem("path", d = arcPath, stroke = fence.c2, sw = 1.0, join = "round")
    val b1 = at(45.0, BASE_DIST)
    val b2 = at(0.0, BASE_DIST * sqrt(2.0))
    val b3 = at(-45.0, BASE_DIST)
    val dirt = listOf(at(45.0, 38.0), at(0.0, 50.0), at(-45.0, 38.0))
    items += LookItem(
        "path",
        d = "M${n(HX)} ${n(HY + 4)} L${n(dirt[0].first)} ${n(dirt[0].second)} Q${n(HX)} ${n(lookR2(dirt[1].second - 6))} ${n(dirt[2].first)} ${n(dirt[2].second)} Z",
        fill = "#c98b55",
    )
    val g = listOf(at(45.0, 22.0), at(0.0, 31.0), at(-45.0, 22.0))
    items += LookItem(
        "path",
        d = "M${n(HX)} ${n(HY - 4)} L${n(g[0].first)} ${n(g[0].second)} L${n(g[1].first)} ${n(g[1].second)} L${n(g[2].first)} ${n(g[2].second)} Z",
        fill = "#3a9a57",
    )
    val mound = at(0.0, 18.4)
    items += LookItem("circle", cx = mound.first, cy = mound.second, r = 2.6, fill = "#c98b55")
    items += LookItem(
        "path",
        d = "M${n(HX)} ${n(HY)} L${n(arc.first().first)} ${n(arc.first().second)} M${n(HX)} ${n(HY)} L${n(arc.last().first)} ${n(arc.last().second)}",
        stroke = "#ffffff",
        sw = 0.8,
        op = 0.8,
    )
    listOf(b1, b2, b3).forEachIndexed { i, (x, y) ->
        items += LookItem("path", d = "M${n(x)} ${n(lookR2(y - 3.2))} L${n(lookR2(x + 3.2))} ${n(y)} L${n(x)} ${n(lookR2(y + 3.2))} L${n(lookR2(x - 3.2))} ${n(y)} Z", fill = "#ffffff")
        if (bases and (1 shl i) != 0) items += LookItem("circle", cx = x, cy = lookR2(y - 1), r = 5.2, fill = offense.c2, stroke = offense.c1, sw = 1.6)
    }
    items += LookItem("path", d = "M${n(HX - 3)} ${n(HY - 1)} L${n(HX + 3)} ${n(HY - 1)} L${n(HX + 3)} ${n(HY + 1.5)} L${n(HX)} ${n(HY + 4)} L${n(HX - 3)} ${n(HY + 1.5)} Z", fill = "#ffffff")
    if (batted != null) {
        val wall = fenceOf(batted.dir)
        val dist = if (code == "本") wall + 7 else minOf(batted.dist, wall - 2)
        val (x, y) = at(batted.dir, maxOf(8.0, dist))
        if (batted.la < 10) {
            items += LookItem("path", d = "M${n(HX)} ${n(HY - 2)} L${n(x)} ${n(y)}", stroke = "#fde68a", sw = 1.6, cap = "round")
        } else {
            val lift = minOf(60.0, 10 + batted.la * 0.8)
            val (mx, my) = at(batted.dir, maxOf(8.0, dist) / 2)
            items += LookItem("path", d = "M${n(HX)} ${n(HY - 2)} Q${n(mx)} ${n(lookR2(my - lift))} ${n(x)} ${n(y)}", stroke = "#fde68a", sw = 1.6, cap = "round")
        }
        items += LookItem("circle", cx = x, cy = y, r = 3.2, fill = "#ffffff", stroke = "#fde68a", sw = 1.2)
    }
    if (runs > 0) {
        items += LookItem("rect", x = HX + 8, y = HY - 9, w = 26.0, h = 12.0, fill = "#f87171")
        items += LookItem("text", x = HX + 21, y = HY + 0.5, size = 9.0, font = "jp", fill = "#ffffff", text = "${runs}点")
    }
    return LookArt(listOf(20.0, 16.0, 160.0, 136.0), null, items)
}
