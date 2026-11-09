package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject

/*
 * 地元紙の記事（警戒選手・試合後のひと言・プロ注目・勝敗投手と本塁打の欄）。[buildFrontPage] から使う。
 *
 * ⚠ 言い回しは [Pen] で選ぶ（同じ試合・同じ日なら同じ紙面）。
 * ⚠ 「プロ注目」は**飾り**（いしだ 2026-11-09「今のところ飾りでOK」）。オンラインは NPB ドラフトをしないので
 *    （server/leagueEngine.mjs）、選手が抜かれることは無い。紙面で「指名確実」のように約束する書き方はしない。
 */

/** 地元紙の題字（「宮崎球報」）。⚠ 実在の新聞の名前に寄せない */
fun localTitle(city: String): String = "${city}球報"

private fun era2(v: Double): String {
    val r = kotlin.math.round(v * 100).toInt()
    return "${r / 100}.${(r % 100).toString().padStart(2, '0')}"
}

/** 直近の試合で当たっている（12打数以上で4割以上） */
internal fun hotRecent(r: RecentForm?): Boolean = r != null && r.atBats >= 12 && r.hits * 1000 >= r.atBats * 400

/** 直近の試合で当たりが止まっている（15打数以上で2安打以下） */
internal fun coldRecent(r: RecentForm?): Boolean = r != null && r.atBats >= 15 && r.hits <= 2

/** 回ごとの得点の表（記録に無ければ null） */
internal fun lineScoreOf(game: JsonObject, view: LeagueView): FrontPage.LineScore? {
    val ls = game.at("lineScore").obj() ?: return null
    val away = ls.at("away").list().mapNotNull { it.int() }
    val home = ls.at("home").list().mapNotNull { it.int() }
    if (away.isEmpty()) return null
    return FrontPage.LineScore(
        view.teamShort(game.at("away").str().orEmpty()),
        view.teamShort(game.at("home").str().orEmpty()),
        away,
        home,
        game.at("walkOff").bool() == true,
    )
}

/**
 * 勝敗投手と本塁打の欄。自球団の選手は今季の数（「3勝1敗」「5号」）、他球団の選手は球団名を添える。
 * ⚠ 号数は今季の本塁打（ビューの名簿）から逆に数える。ビューは試合のあとなので、その試合の本塁打を含む
 */
internal fun boxLines(view: LeagueView, game: JsonObject?, team: String, decisions: Decisions?): List<Pair<String, String>> {
    val own = view.roster.associateBy { it.id }
    fun pitcher(ref: PitcherRef?, mark: String): Pair<String, String>? {
        val name = ref?.name ?: return null
        val p = ref.id?.let { own[it] }
        val st = p?.seasonStats?.pitching
        val tail = when {
            p == null -> null
            mark == "S" -> st?.saves?.takeIf { it > 0 }?.let { "${it}S" }
            else -> st?.let { "${it.wins}勝${it.losses}敗${if (it.saves > 0) "${it.saves}S" else ""}" }
        }
        // ⚠ 他球団の投手は球団名を添える（自球団の欄と見分けるため）
        val whose = if (p == null) game?.let { g -> pitcherTeam(g, ref.id)?.let { "（${view.teamShort(it)}）" } } else null
        return mark to listOfNotNull(name + (whose ?: ""), tail).joinToString(" ")
    }
    val out = listOfNotNull(
        pitcher(decisions?.winningPitcher, "勝"),
        pitcher(decisions?.savePitcher, "S"),
        pitcher(decisions?.losingPitcher, "敗"),
    ).toMutableList()
    val teams = game?.at("teams").obj()
    val homers = teams?.entries?.flatMap { (name, players) ->
        players.list().mapNotNull { it.obj() }.mapNotNull { p ->
            val hr = p.at("batting", "homeruns").int() ?: 0
            if (hr <= 0) return@mapNotNull null
            val id = p.at("id").long()
            val label = p.at("name").str().orEmpty()
            if (name == team) {
                val total = id?.let { own[it] }?.seasonStats?.batting?.homeruns
                if (total != null && total >= hr) "$label ${(total - hr + 1..total).joinToString("・")}号" else label
            } else "$label（${view.teamShort(name)}）"
        }
    }.orEmpty()
    if (homers.isNotEmpty()) out += "本" to homers.joinToString("、")
    return out
}

/** 試合の詳細から、その投手の球団 */
private fun pitcherTeam(game: JsonObject, id: Long?): String? = id?.let { pid ->
    game.at("teams").obj()?.entries?.firstOrNull { (_, players) -> players.list().any { it.at("id").long() == pid } }?.key
}

/** 記事の文に入れる守備位置（「三塁手」「外野手」） */
internal fun positionNoun(pos: String?): String = when (pos) {
    "pitcher" -> "投手"
    "catcher" -> "捕手"
    "first" -> "一塁手"
    "second" -> "二塁手"
    "third" -> "三塁手"
    "short" -> "遊撃手"
    "left", "center", "right" -> "外野手"
    else -> "選手"
}

/** 次の相手の警戒選手。打席の少ない時期（20打席未満）は書かない */
internal fun warningArticle(opp: String, roster: List<Player>, starter: StarterInfo?, pen: Pen): FrontPage.Article? {
    val bats = roster.filter { it.isActive && !it.isPitcher && (it.performance?.batting?.metrics?.pa ?: 0) >= 20 }
    val top = bats.maxByOrNull { it.performance?.batting?.metrics?.ops ?: 0.0 } ?: return null
    val m = top.performance!!.batting!!.metrics!!
    val parts = mutableListOf<String>()
    parts += pen.pick(
        listOf(
            "打率${rate3(m.avg)}、${m.homeruns}本塁打の${top.name}が${opp}打線の中心だ。",
            "${opp}でいちばん怖いのは${top.name}。打率${rate3(m.avg)}、${m.homeruns}本塁打を記録している。",
        ),
        16,
    )
    top.recent?.let { r ->
        if (hotRecent(r)) parts += "ここ${r.games}試合も${r.atBats}打数${r.hits}安打と当たっている。"
        else if (r.hitStreak >= 5) parts += "${r.hitStreak}試合連続安打中と勢いもある。"
    }
    // 2人目: 当たっている打者か、足のある打者
    val second = bats.filter { it != top }.let { rest ->
        rest.filter { hotRecent(it.recent) }.maxByOrNull { it.recent!!.hits }?.let { "${it.name}も最近${it.recent!!.games}試合で${it.recent.hits}安打と好調。" }
            ?: rest.filter { (it.performance?.batting?.metrics?.stolenBases ?: 0) >= 8 }.maxByOrNull { it.performance!!.batting!!.metrics!!.stolenBases }
                ?.let { "足の${it.name}（${it.performance!!.batting!!.metrics!!.stolenBases}盗塁）にも気をつけたい。" }
    }
    second?.let { parts += it }
    if (starter?.name != null && starter.era != null && starter.era < 2.5 && starter.wins + starter.losses >= 3) {
        parts += "先発予想の${starter.name}も防御率${era2(starter.era)}と好調で、簡単には打てない。"
    }
    return FrontPage.Article(
        "警戒警報",
        pen.pick(listOf("${opp}の${top.name}に要注意", "警戒すべきは${top.name}", "${top.name}を抑えられるか", "${opp}打線のカギは${top.name}"), 17),
        parts.joinToString(""),
        LINK_LINEUP,
    )
}

/** 試合後のひと言（監督と主役）。決まり文句から場面で選ぶ */
internal fun commentArticle(manager: String?, tone: FrontPage.Tone, s: Situation, pen: Pen): FrontPage.Article? {
    val boss = manager?.let { "${it}監督" } ?: "監督"
    val f = s.facts
    val quote = when (tone) {
        FrontPage.Tone.Win -> when {
            f?.walkOff == true -> listOf("最後まで諦めなかった選手たちのおかげ", "ベンチもスタンドも一つになった", "しびれる試合を、よく勝ち切ってくれた")
            f?.trailed == true -> listOf("よく追いついて、ひっくり返してくれた", "負けている展開でも下を向かなかった", "粘り強さが出た試合だった")
            s.theirs == 0 -> listOf("投手陣が本当によく投げた", "守りからリズムをつくれた", "バッテリーに尽きる")
            s.diff >= 5 -> listOf("打線がよくつながった", "今日は打つべき人が打った", "この勢いを続けたい")
            s.diff == 1 -> listOf("苦しい試合をものにできた", "こういう試合を拾えるのは大きい", "最後までよく守り切った")
            s.streak >= 3 -> listOf("連勝は意識せず、一つずつ", "いい流れで戦えている", "選手が自信を持ってやれている")
            else -> listOf("投打がかみ合った", "いい形で勝てた", "次もこの形で戦いたい")
        }
        FrontPage.Tone.Lose -> when {
            f?.walkOff == true -> listOf("あと一歩だった。切り替える", "悔しいが、明日がある", "最後に踏ん張れなかった")
            s.ours == 0 -> listOf("相手投手が良かった。次は打つ", "1点が遠かった", "打線のてこ入れも考える")
            s.diff >= 5 -> listOf("完敗。すぐに立て直す", "今日は相手が上だった", "投手陣の踏ん張りが足りなかった")
            s.diff == 1 -> listOf("あと1本が出なかった", "紙一重の試合だった", "勝ち切れなかったのは監督の責任")
            s.streak >= 3 -> listOf("連敗は気にしない。やることをやるだけ", "流れを変える一打が欲しい", "必ず抜け出す")
            else -> listOf("切り替えて次に臨む", "反省して、また明日", "取れる点を取れなかった")
        }
        FrontPage.Tone.Draw -> listOf("勝ち切れなかったのは悔しい", "負けなかったことを前向きに捉える", "痛み分け。次に生かす")
        FrontPage.Tone.None -> return null
    }.let { pen.pick(it, 18) }
    // 主役のひと言（勝った日は決勝打・主役の打者・好投の投手。負けた日は奮闘した打者か投手）
    val hero = f?.winningHit?.takeIf { tone == FrontPage.Tone.Win }?.name
        ?: f?.topBatter?.takeIf { it.hr > 0 || it.rbi >= 2 || it.hits >= 3 }?.name
        ?: f?.ace?.takeIf { it.outs >= 18 }?.name
    val heroLine = hero?.let { name ->
        val pitcher = f?.ace?.name == name && f.topBatter?.name != name
        val pool = when {
            tone == FrontPage.Tone.Win && pitcher -> listOf("「捕手のリードのおかげです」", "「野手に助けてもらいました」", "「次も長い回を投げたい」")
            tone == FrontPage.Tone.Win -> listOf("「チームの勝ちに貢献できてうれしい」", "「打ったのは甘い球。しっかり振れた」", "「次の試合も打てるよう準備します」")
            pitcher -> listOf("「粘り切れず悔しい」", "「次は勝ちにつながる投球を」")
            else -> listOf("「勝ちにつながらず悔しい」", "「明日こそ勝てるように」")
        }
        "${name}は${pen.pick(pool, 19)}と${if (tone == FrontPage.Tone.Win) "笑顔を見せた" else "前を向いた"}。"
    }
    return FrontPage.Article("ひと言", "${boss}「${quote}」", heroLine ?: "${boss}は試合後、そう振り返った。", null)
}

/**
 * プロ注目（飾り）。若くて光る能力のある自球団の選手に、NPBのスカウトが見に来ているという話。
 * 毎日は載せない（2日に1日くらい。同じ日なら同じ）
 */
internal fun scoutArticle(roster: List<Player>, me: String, year: Int?, date: GameDate?, pen: Pen): FrontPage.Article? {
    data class Pick(val p: Player, val trait: String, val score: Int)
    val picks = roster.filter { it.isActive && (it.age ?: 99) <= 26 }.mapNotNull { p ->
        if (p.isPitcher) {
            val v = p.pitching?.velocity ?: 0
            val c = p.pitching?.control ?: 0
            when {
                v >= 150 -> Pick(p, "最速${v}kmの直球", v - 140)
                c >= 75 -> Pick(p, "精密な制球", c - 65)
                v >= 147 -> Pick(p, "${v}kmの速球", v - 142)
                else -> null
            }
        } else {
            val pw = p.batting?.power ?: 0
            val sp = p.physical?.speed ?: 0
            val mt = p.batting?.meet ?: 0
            when {
                pw >= 70 -> Pick(p, "長打力", pw - 60)
                sp >= 80 -> Pick(p, "足の速さ", sp - 70)
                mt >= 75 -> Pick(p, "巧みなバットコントロール", mt - 65)
                else -> null
            }
        }
    }
    if (picks.isEmpty()) return null
    val day = (year ?: 0) * 400 + (date?.month ?: 0) * 31 + (date?.day ?: 0)
    if (Pen(day).pick(listOf(true, false), 20).not()) return null
    val pick = Pen(day).pick(picks.sortedByDescending { it.score }.take(4), 21)
    val p = pick.p
    val scouts = (1 + pick.score / 4).coerceIn(1, 6)
    val pos = positionNoun(p.position)
    val school = p.origin?.highSchool?.let { "${it}出身。" } ?: p.origin?.university?.let { "${it}出身。" } ?: ""
    val potential = if ((p.growthPotential ?: 1.0) >= 1.3) "伸びしろも大きく、" else ""
    return FrontPage.Article(
        "プロ注目",
        pen.pick(listOf("${p.name}に熱視線 NPB${scouts}球団", "プロ注目 ${me}の${p.name}", "${p.name}の${pick.trait}にスカウト集結".takeIf { scouts >= 3 } ?: "${p.name}にスカウトの目"), 22),
        "${p.age}歳の${pos}・${p.name}。$school${pick.trait}に、NPB${scouts}球団のスカウトが" +
            pen.pick(listOf("ネット裏で目を光らせた。", "視察に訪れた。", "熱心にメモを取っていた。"), 23) +
            "${potential}${pen.pick(listOf("今後の成長が楽しみだ。", "この先の伸びに注目が集まる。", "独立リーグから羽ばたく日は来るか。"), 24)}",
        LINK_LINEUP,
    )
}
