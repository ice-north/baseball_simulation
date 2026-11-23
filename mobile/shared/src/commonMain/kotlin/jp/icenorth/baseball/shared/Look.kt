package jp.icenorth.baseball.shared

// ============================================================
// 新しい見た目（試作）: 球団の色と「帽子のマーク」を球団名から決める。
// Web 版 `src/online/look/rng.js`・`teamLook.js` の写し。答え合わせは `LookTest`
// （期待値は mobile/tools/expect-look.mjs が書き出す）。どちらかを変えたら両方を直す。
//
// ⚠ 表示専用。保存もサーバーも触らない。内部名（名前を付け替えても変わらない）から決める。
// ⚠ ビューの `teamLabels` に載った球団（リーグの12球団）だけ。実在の球団には付けない。
// ============================================================

/** 文字列 → 32 ビットの符号なし整数（FNV-1a。字のコードポイントごと）。Web 版 `hash` */
fun lookHash(s: String): Long {
    var h = -2128831035 // 2166136261
    var i = 0
    while (i < s.length) {
        val c = s[i]
        val cp = if (c.isHighSurrogate() && i + 1 < s.length && s[i + 1].isLowSurrogate()) {
            val code = ((c.code - 0xD800) shl 10) + (s[i + 1].code - 0xDC00) + 0x10000
            i++
            code
        } else c.code
        h = h xor cp
        h *= 16777619
        i++
    }
    return h.toLong() and 0xFFFFFFFFL
}

/** 種から 0 以上 1 未満の数を順に返す（mulberry32）。Web 版 `rng` */
class LookRng(seed: Long) {
    private var a: Int = seed.toInt()
    fun next(): Double {
        a += 0x6D2B79F5
        var t = (a xor (a ushr 15)) * (1 or a)
        t = (t + (t xor (t ushr 7)) * (61 or t)) xor t
        return ((t xor (t ushr 14)).toLong() and 0xFFFFFFFFL) / 4294967296.0
    }
    fun <T> pick(list: List<T>): T = list[kotlin.math.floor(next() * list.size).toInt()]
}

/** 土地の名前 → ローマ字（`pyramidLeague.js` の `CITIES` と同じ並び） */
val CITY_EN: Map<String, String> = linkedMapOf(
    "札幌" to "Sapporo", "千歳" to "Chitose", "苫小牧" to "Tomakomai", "旭川" to "Asahikawa", "函館" to "Hakodate",
    "青森" to "Aomori", "八戸" to "Hachinohe", "盛岡" to "Morioka", "仙台" to "Sendai", "秋田" to "Akita",
    "山形" to "Yamagata", "福島" to "Fukushima", "郡山" to "Koriyama", "水戸" to "Mito", "日立" to "Hitachi",
    "宇都宮" to "Utsunomiya", "前橋" to "Maebashi", "高崎" to "Takasaki", "川越" to "Kawagoe", "大宮" to "Omiya",
    "柏" to "Kashiwa", "船橋" to "Funabashi", "浦安" to "Urayasu", "八王子" to "Hachioji", "立川" to "Tachikawa",
    "横浜" to "Yokohama", "川崎" to "Kawasaki", "相模原" to "Sagamihara", "藤沢" to "Fujisawa", "新潟" to "Niigata",
    "長岡" to "Nagaoka", "富山" to "Toyama", "金沢" to "Kanazawa", "福井" to "Fukui", "甲府" to "Kofu",
    "長野" to "Nagano", "松本" to "Matsumoto", "岐阜" to "Gifu", "静岡" to "Shizuoka", "沼津" to "Numazu",
    "浜松" to "Hamamatsu", "豊田" to "Toyota", "岡崎" to "Okazaki", "豊橋" to "Toyohashi", "四日市" to "Yokkaichi",
    "鈴鹿" to "Suzuka", "大津" to "Otsu", "堺" to "Sakai", "東大阪" to "Higashiosaka", "西宮" to "Nishinomiya",
    "明石" to "Akashi", "姫路" to "Himeji", "奈良" to "Nara", "和歌山" to "Wakayama", "鳥取" to "Tottori",
    "米子" to "Yonago", "松江" to "Matsue", "岡山" to "Okayama", "倉敷" to "Kurashiki", "福山" to "Fukuyama",
    "呉" to "Kure", "下関" to "Shimonoseki", "宇部" to "Ube", "高松" to "Takamatsu", "松山" to "Matsuyama",
    "高知" to "Kochi", "北九州" to "Kitakyushu", "久留米" to "Kurume", "佐賀" to "Saga", "長崎" to "Nagasaki",
    "佐世保" to "Sasebo", "熊本" to "Kumamoto", "大分" to "Oita", "宮崎" to "Miyazaki", "延岡" to "Nobeoka",
    "鹿児島" to "Kagoshima", "那覇" to "Naha", "名護" to "Nago", "石垣" to "Ishigaki",
    "道南" to "Donan", "道東" to "Doto", "十勝" to "Tokachi", "津軽" to "Tsugaru", "三陸" to "Sanriku",
    "庄内" to "Shonai", "会津" to "Aizu", "常総" to "Joso", "上州" to "Joshu", "武蔵" to "Musashi",
    "多摩" to "Tama", "湘南" to "Shonan", "房総" to "Boso", "信州" to "Shinshu", "越前" to "Echizen",
    "能登" to "Noto", "飛騨" to "Hida", "遠州" to "Enshu", "尾張" to "Owari", "三河" to "Mikawa",
    "伊勢" to "Ise", "近江" to "Omi", "北摂" to "Hokusetsu", "河内" to "Kawachi", "丹波" to "Tamba",
    "但馬" to "Tajima", "紀州" to "Kishu", "石見" to "Iwami", "瀬戸内" to "Setouchi", "安芸" to "Aki",
    "周防" to "Suo", "阿波" to "Awa", "讃岐" to "Sanuki", "伊予" to "Iyo", "土佐" to "Tosa",
    "筑豊" to "Chikuho", "島原" to "Shimabara", "天草" to "Amakusa", "阿蘇" to "Aso", "霧島" to "Kirishima",
)

/** 愛称 → 英語（`pyramidLeague.js` の `NICKNAMES` と同じ並び） */
val NICK_EN: Map<String, String> = linkedMapOf(
    "ブレイブス" to "Braves", "ファルコンズ" to "Falcons", "ドルフィンズ" to "Dolphins", "サンダーズ" to "Thunders",
    "ウィングス" to "Wings", "レンジャーズ" to "Rangers", "クルセイダーズ" to "Crusaders", "フェニックス" to "Phoenix",
    "バイパーズ" to "Vipers", "サンライズ" to "Sunrise", "ストライカーズ" to "Strikers", "ナイツ" to "Knights",
    "ハリケーンズ" to "Hurricanes", "シャークス" to "Sharks", "ウルブズ" to "Wolves", "コメッツ" to "Comets",
    "ブリーズ" to "Breeze", "ジェッツ" to "Jets", "キングス" to "Kings", "パンサーズ" to "Panthers",
    "ラビッツ" to "Rabbits", "シーホース" to "Seahorse", "ガーディアンズ" to "Guardians", "アローズ" to "Arrows",
    "ブルズ" to "Bulls", "スターズ" to "Stars", "オーシャンズ" to "Oceans", "ボルケーノズ" to "Volcanoes",
    "クレインズ" to "Cranes", "ホエールズ" to "Whales", "ロケッツ" to "Rockets", "タイフーンズ" to "Typhoons",
    "サムライズ" to "Samurais", "ミラージュ" to "Mirage", "リバティーズ" to "Liberties", "アトラス" to "Atlas",
    "ヴァンガード" to "Vanguard", "セイバーズ" to "Sabers", "ダイヤモンズ" to "Diamonds", "ノヴァ" to "Nova",
    "オライオンズ" to "Orions", "ゼニス" to "Zenith", "タイタンズ" to "Titans", "ペガサス" to "Pegasus",
    "グリフィンズ" to "Griffins", "ユニコーンズ" to "Unicorns", "レイヴンズ" to "Ravens", "ホーネッツ" to "Hornets",
    "バジャーズ" to "Badgers", "オッターズ" to "Otters", "ペンギンズ" to "Penguins", "シーガルズ" to "Seagulls",
    "アルバトロス" to "Albatross", "コンドルズ" to "Condors", "オスプレイズ" to "Ospreys", "ゲイルズ" to "Gales",
    "ドラグーンズ" to "Dragoons", "ランサーズ" to "Lancers", "パイオニアズ" to "Pioneers", "フロンティアズ" to "Frontiers",
    "ヴォヤージャーズ" to "Voyagers", "サミッツ" to "Summits", "キャニオンズ" to "Canyons", "グレイシャーズ" to "Glaciers",
    "オーロラズ" to "Auroras", "エクリプス" to "Eclipse", "メテオズ" to "Meteors", "パルサーズ" to "Pulsars",
    "クエーサーズ" to "Quasars", "ソレイユ" to "Soleil", "センチネルズ" to "Sentinels", "パラディンズ" to "Paladins",
    "ヴァルキリーズ" to "Valkyries", "グラディエーターズ" to "Gladiators", "マスケティアーズ" to "Musketeers",
    "ブリザーズ" to "Blizzards", "クエイクス" to "Quakes", "トルネーダーズ" to "Tornadoes",
)

/** 球団の色の組（地・差し色・縁）。12球団に同じ組が出ないよう、ここから重ならずに配る */
val LOOK_PALETTES: List<List<String>> = listOf(
    listOf("#13294b", "#4aa3df", "#ffffff"),
    listOf("#c8102e", "#ffcc33", "#ffffff"),
    listOf("#0f3d6e", "#f2c14e", "#ffffff"),
    listOf("#14213d", "#e76f2e", "#ffffff"),
    listOf("#3b2a7a", "#e9c46a", "#ffffff"),
    listOf("#1b1b1b", "#d9d9d9", "#c8102e"),
    listOf("#0e7c86", "#f8fafc", "#0b2233"),
    listOf("#1f5f3a", "#f0e2b6", "#b5462b"),
    listOf("#5a3a22", "#f4a259", "#fff4e0"),
    listOf("#7a1f2b", "#e9b949", "#ffffff"),
    listOf("#5b6b2f", "#f3e6c8", "#2b2b2b"),
    listOf("#e4572e", "#1d1d1f", "#ffd166"),
    listOf("#0b6e4f", "#f4d35e", "#ffffff"),
    listOf("#1d4ed8", "#ffffff", "#dc2626"),
    listOf("#0284c7", "#0b1f3a", "#ffffff"),
    listOf("#111111", "#f97316", "#ffffff"),
    listOf("#15803d", "#ffffff", "#facc15"),
    listOf("#1e3a8a", "#ef4444", "#ffffff"),
    listOf("#0f766e", "#fb923c", "#ffffff"),
    listOf("#312e81", "#5eead4", "#ffffff"),
    listOf("#b91c1c", "#111827", "#ffffff"),
    listOf("#1f2937", "#a3e635", "#ffffff"),
    listOf("#075985", "#fb7185", "#ffffff"),
    listOf("#581c87", "#e5e7eb", "#fbbf24"),
)

/** マークの形。script は筆記体の1字だけ */
val LOOK_STYLES = listOf("circle", "shield", "diamond", "script", "block", "slab")
private val LATIN_ONLY = setOf("script", "block", "slab")
private val JP_STYLE = mapOf("script" to "circle", "block" to "shield", "slab" to "diamond")

/** 帽子のマークの書体（graduate / alfa / yellowtail / jp） */
fun lookFontOf(style: String, latin: Boolean): String =
    if (!latin) "jp" else if (style == "script") "yellowtail" else if (style == "slab") "alfa" else "graduate"

/** 1球団の見た目 */
data class TeamLook(
    val name: String,
    val c1: String,
    val c2: String,
    val c3: String,
    val style: String,
    val latin: Boolean,
    val mono: String,
    val font: String,
)

/** 所属の分からない人（候補・浪人中の指導者）の帽子。字は入れない */
val NEUTRAL_LOOK = TeamLook(name = "", c1 = "#475569", c2 = "#cbd5e1", c3 = "#ffffff", style = "circle", latin = true, mono = "", font = "graduate")

/** 字の元になる「土地」と「愛称」。`latin` が false なら表に無い名前（漢字・かなの1字を使う） */
data class LookNameSource(val latin: Boolean, val city: String, val nick: String)

// 長い名前から先に当てる（同じ長さは表の並び。Web 版の安定な並べ替えと同じ）
private val CITY_KEYS = CITY_EN.keys.sortedByDescending { it.length }

private fun latinWord(s: String): String =
    if (s.isNotEmpty() && s[0].let { it in 'A'..'Z' || it in 'a'..'z' }) s.filter { it in 'A'..'Z' || it in 'a'..'z' } else ""

private fun String.noSpace(): String = filterNot { it.isWhitespace() }

/** 文字列をコードポイントごとに分ける（漢字・かなの字を割らない） */
private fun String.codePointStrings(): List<String> {
    val out = mutableListOf<String>()
    var i = 0
    while (i < length) {
        val n = if (this[i].isHighSurrogate() && i + 1 < length && this[i + 1].isLowSurrogate()) 2 else 1
        out += substring(i, i + n)
        i += n
    }
    return out
}

fun lookNameSource(name: String, labels: TeamLabel?): LookNameSource {
    val label = labels?.label?.takeIf { it.isNotEmpty() } ?: name
    // ⚠ 分けずに付け替えた古い球団は `city` が空。表示名の頭が表の土地かを見る
    val city = labels?.city?.takeIf { it.isNotEmpty() } ?: CITY_KEYS.firstOrNull { label.startsWith(it) } ?: ""
    val nickname = labels?.nickname?.takeIf { it.isNotEmpty() }
        ?: if (city.isNotEmpty() && label.startsWith(city)) label.substring(city.length) else ""
    val cityEn = CITY_EN[city] ?: latinWord(city)
    val nickEn = NICK_EN[nickname] ?: latinWord(nickname)
    if (cityEn.isNotEmpty()) return LookNameSource(true, cityEn.uppercase(), nickEn.uppercase())
    return LookNameSource(false, (city.ifEmpty { label }).noSpace(), nickname.noSpace())
}

/** 字の候補（短い順）。重なったら次の候補へ進む。Web 版 `monoCandidates` */
fun lookMonoCandidates(source: LookNameSource): List<String> {
    val list = mutableListOf<String>()
    fun add(m: String) {
        if (m.isNotEmpty() && m !in list) list += m
    }
    if (source.latin) {
        val city = source.city
        val nick = source.nick
        add(city.substring(0, 1))
        if (nick.isNotEmpty()) add("${city[0]}${nick[0]}")
        add("${city[0]}${city[city.length - 1]}")
        for (c in city.drop(1)) add("${city[0]}$c")
        for (c in nick.drop(1)) add("${city[0]}$c")
        return list
    }
    val chars = source.city.codePointStrings()
    add(chars.firstOrNull() ?: "？")
    add(chars.take(2).joinToString(""))
    for (c in chars.drop(2) + source.nick.codePointStrings()) add((chars.firstOrNull() ?: "") + c)
    return list
}

/**
 * ビューの `teamLabels` から全球団の見た目を決める。Web 版 `buildTeamLooks`。
 * 色は12球団で重ならないよう、内部名の値で決めた順に配る（同じ顔ぶれならいつも同じ結果）。
 */
fun buildTeamLooks(teamLabels: Map<String, TeamLabel>): Map<String, TeamLook> {
    val names = teamLabels.keys.sortedWith { a, b ->
        val d = lookHash(a).compareTo(lookHash(b))
        if (d != 0) d else if (a < b) -1 else 1
    }
    class Draft(val name: String, val palette: List<String>, var style: String, val latin: Boolean, val candidates: List<String>, var level: Int = 0) {
        fun mono() = candidates[minOf(level, candidates.size - 1)]
    }
    val used = mutableSetOf<Int>()
    val list = names.map { name ->
        var p = (lookHash("$name:palette") % LOOK_PALETTES.size).toInt()
        var i = 0
        while (i < LOOK_PALETTES.size && p in used) {
            p = (p + 1) % LOOK_PALETTES.size
            i++
        }
        used += p
        val source = lookNameSource(name, teamLabels[name])
        var style = LOOK_STYLES[(lookHash("$name:style") % LOOK_STYLES.size).toInt()]
        if (!source.latin) style = JP_STYLE[style] ?: style
        Draft(name, LOOK_PALETTES[p], style, source.latin, lookMonoCandidates(source))
    }
    // 字: 同じ字の球団があれば、その球団どうしを次の候補へ（全部が別の字になるまで）
    for (round in 0 until 40) {
        val count = list.groupingBy { it.mono() }.eachCount()
        var moved = false
        for (t in list) {
            if ((count[t.mono()] ?: 0) > 1 && t.level < t.candidates.size - 1) {
                t.level++
                moved = true
            }
        }
        if (!moved) break
    }
    return list.associate { t ->
        val mono = t.mono()
        var style = t.style
        if (style == "script" && mono.length > 1) style = "circle"
        if (!t.latin && style in LATIN_ONLY) style = JP_STYLE[style] ?: style
        t.name to TeamLook(t.name, t.palette[0], t.palette[1], t.palette[2], style, t.latin, mono, lookFontOf(style, t.latin))
    }
}
