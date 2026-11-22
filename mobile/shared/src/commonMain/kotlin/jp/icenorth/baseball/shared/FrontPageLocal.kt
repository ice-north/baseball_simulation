package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject

/*
 * 地元紙の記事（警戒選手・試合後のひと言・プロ注目・勝敗投手と本塁打の欄）。[buildFrontPage] から使う。
 *
 * ⚠ 言い回しは [Pen] で選ぶ（同じ試合・同じ日なら同じ紙面）。
 * ⚠ 「プロ注目」はサーバーのドラフトの気配（`proWatch`、server/proDraft.mjs）から書く。噂の出た球団が
 *    そのまま指名する式だが、指名は能力の線だけで決まるので、紙面で「指名確実」のように約束する書き方はしない。
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

/** 監督の試合後のひと言（場面と気質で選ぶ。2面の一問一答でも使う） */
internal fun managerQuote(tone: FrontPage.Tone, s: Situation, pen: Pen, temper: Int = 0): String? {
    val f = s.facts
    return when (tone) {
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
            // 監督の気質（短気は大敗で厳しく、我慢強い人は連敗・大敗でも選手をかばう）
            temper >= 1 && s.diff >= 3 -> listOf(if (s.ours <= 1) "打つ方がこれでは勝てない" else "投手陣は猛省しないといけない", "こんな試合をしていては駄目だ", "全員が反省すべき内容だった")
            temper <= -1 && (s.diff >= 3 || s.streak >= 3) -> listOf("こういう日もある。選手を信じる", "焦る必要はない。やってきたことを続ける", "下を向く必要はない")
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
}

/** 試合後のひと言（監督と主役）。決まり文句から場面で選ぶ */
internal fun commentArticle(manager: String?, tone: FrontPage.Tone, s: Situation, pen: Pen, temper: Int = 0): FrontPage.Article? {
    val boss = manager?.let { "${it}監督" } ?: "監督"
    val f = s.facts
    val quote = managerQuote(tone, s, pen, temper) ?: return null
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

/** 光る能力の一言（スカウトが見ている所）。無ければ null（web の local.js の scoutTrait と同じ） */
private fun scoutTrait(p: Player): Pair<String, Int>? {
    if (p.isPitcher) {
        val v = p.pitching?.velocity ?: 0
        val c = p.pitching?.control ?: 0
        return when {
            v >= 150 -> "最速${v}kmの直球" to v - 140
            c >= 75 -> "精密な制球" to c - 65
            v >= 147 -> "${v}kmの速球" to v - 142
            else -> null
        }
    }
    val pw = p.batting?.power ?: 0
    val sp = p.physical?.speed ?: 0
    val mt = p.batting?.meet ?: 0
    return when {
        pw >= 70 -> "長打力" to pw - 60
        sp >= 80 -> "足の速さ" to sp - 70
        mt >= 75 -> "巧みなバットコントロール" to mt - 65
        else -> null
    }
}

/** ドラフトの気配の1人（サーバーの `proWatch` の行。NPB が注目している選手） */
internal data class WatchRow(val id: Long?, val name: String, val team: String, val npb: String, val hot: Boolean)

/** ビューの `proWatch`。古いサーバー（項目が無い）は null */
internal fun watchRows(raw: JsonObject?): List<WatchRow>? {
    val v = raw?.get("proWatch") as? kotlinx.serialization.json.JsonArray ?: return null
    return v.mapNotNull { e ->
        val o = e.obj() ?: return@mapNotNull null
        val name = o.at("name").str() ?: return@mapNotNull null
        val npb = o.at("npb").str() ?: return@mapNotNull null
        WatchRow(o.at("id").long(), name, o.at("team").str().orEmpty(), npb, o.at("level").str() == "hot")
    }
}

/**
 * プロ注目。
 * - `watch`（サーバーの `proWatch`。ドラフトの気配）があれば**本物**: 自球団で NPB が見ている選手の話
 *   （「西武が○○に熱視線！」「○○に中日が接触」）。きのうの試合で活躍していれば毎日「プロ注目の○○が完封」。
 *   見られている選手がいなければ載せない。
 * - `watch` が無い（古いサーバー）ときは飾り: 若くて光る能力のある自球団の選手に、NPBのスカウトが見に来ている。
 * 毎日は載せない（2日に1日くらい。同じ日なら同じ）
 */
internal fun scoutArticle(
    roster: List<Player>, me: String, year: Int?, date: GameDate?, pen: Pen,
    watch: List<WatchRow>? = null, team: String = "", facts: GameFacts? = null, s: Situation? = null,
): FrontPage.Article? {
    if (watch != null) return watchArticle(roster, me, year, date, pen, watch, team, facts, s)
    data class Pick(val p: Player, val trait: String, val score: Int)
    val picks = roster.filter { it.isActive && (it.age ?: 99) <= 26 }.mapNotNull { p ->
        scoutTrait(p)?.let { (trait, score) -> Pick(p, trait, score) }
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

/** きのうの試合での活躍（「完封」「2発」など）。無ければ null */
private fun watchFeat(w: WatchRow, facts: GameFacts?, s: Situation?, tone: FrontPage.Tone): String? {
    if (facts == null) return null
    val ace = facts.ace
    if (tone == FrontPage.Tone.Win && ace != null && ace.name == w.name && facts.complete) return if (s != null && s.theirs == 0) "完封" else "完投"
    val b = facts.batters.firstOrNull { it.name == w.name }
    if (b != null && b.hr >= 2) return "${b.hr}発"
    if (b != null && b.hr == 1) return "一発"
    if (b != null && b.hits >= 3) return "猛打賞"
    if (tone == FrontPage.Tone.Win && ace != null && ace.name == w.name && ace.outs >= 18 && ace.runs <= 1) return "好投"
    return null
}

private fun watchArticle(
    roster: List<Player>, me: String, year: Int?, date: GameDate?, pen: Pen,
    watch: List<WatchRow>, team: String, facts: GameFacts?, s: Situation?,
): FrontPage.Article? {
    val ours = watch.filter { it.team == team }
    if (ours.isEmpty()) return null
    fun playerOf(w: WatchRow) = roster.firstOrNull { (w.id != null && it.id == w.id) || it.name == w.name }
    val tone = when {
        s == null -> FrontPage.Tone.None
        s.ours > s.theirs -> FrontPage.Tone.Win
        s.ours < s.theirs -> FrontPage.Tone.Lose
        else -> FrontPage.Tone.Draw
    }
    // きのう活躍した人がいれば、その話（毎日）
    for (w in ours) {
        val feat = watchFeat(w, facts, s, tone) ?: continue
        val p = playerOf(w)
        val pos = p?.let { positionNoun(it.position) } ?: "選手"
        return FrontPage.Article(
            "プロ注目",
            pen.pick(listOf("プロ注目の${w.name}が$feat", "${w.name}$feat ${w.npb}のスカウトの前で"), 25),
            "${w.npb}が${if (w.hot) "指名の候補に挙げる" else "追いかける"}${pos}・${w.name}が${feat}。" +
                pen.pick(listOf("ネット裏のスカウトは「やはり良いものを持っている」とうなずいた。", "スカウトの評価をまた一つ上げた。", "視察に訪れたスカウトの前で、存在感を見せつけた。"), 26),
            LINK_LINEUP,
        )
    }
    val day = (year ?: 0) * 400 + (date?.month ?: 0) * 31 + (date?.day ?: 0)
    if (Pen(day).pick(listOf(true, false), 20).not()) return null
    val w = Pen(day).pick(ours, 21)
    val p = playerOf(w)
    val pos = p?.let { positionNoun(it.position) } ?: "選手"
    val age = p?.age?.let { "${it}歳の" } ?: ""
    val trait = p?.let { scoutTrait(it)?.first }
    if (w.hot)
        return FrontPage.Article(
            "プロ注目",
            pen.pick(listOf("${w.name}に${w.npb}が接触", "${w.npb}、${w.name}の調査に本腰", "${me}の${w.name}、${w.npb}が指名候補に"), 27),
            "$age$pos・${w.name}に、${w.npb}のスカウトが接触した。${trait ?: "素質"}を高く買い、指名に向けて調査を進めているという。" +
                pen.pick(listOf("秋のドラフトへ、注目が集まる。", "独立リーグから羽ばたく日は近いか。"), 28),
            LINK_LINEUP,
        )
    return FrontPage.Article(
        "プロ注目",
        pen.pick(listOf("${w.npb}が${w.name}に熱視線！", "プロ注目 ${me}の${w.name}", "${w.name}の${trait ?: "素質"}に${w.npb}の目"), 29),
        "$age$pos・${w.name}。${trait ?: "その素質"}に、${w.npb}のスカウトが" +
            pen.pick(listOf("ネット裏で目を光らせた。", "視察に訪れた。", "熱心にメモを取っていた。"), 23) +
            pen.pick(listOf("今後の成長が楽しみだ。", "この先の伸びに注目が集まる。", "独立リーグから羽ばたく日は来るか。"), 24),
        LINK_LINEUP,
    )
}
