package jp.icenorth.baseball.shared

/*
 * 紙面の指導者の記事（就任・解任・勇退・新体制・師弟・対立・節目）。
 * 地元紙（[buildFrontPage]）と全国紙（[buildNationalPage]）から呼ぶ。
 *
 * ⚠ 出来事の文はサーバーが作る（server/coachView.mjs の coachEventText）。ここは見出しを付けて並べるだけ。
 * ⚠ ビューにあるものだけで書く（ビューの staff・leagueStaff）。古いサーバーで無ければ何も書かない。
 */

/**
 * 人事を紙面に出す時期（キャンプの間）と、その年の出来事。
 * ⚠ 入れ替わりは年度更新（ストーブリーグの締め切り）とキャンプで起き、出来事の年は**効き始める年**。
 *    契約更改・トライアウト・ストーブリーグの間は、まだ前の年度更新（ほぼ1年前）の話なので出さない
 */
private fun freshEvents(view: LeagueView, events: List<StaffEvent>): List<StaffEvent> {
    if (view.phase?.kind != "camp") return emptyList()
    val year = view.year ?: return emptyList()
    return events.filter { it.year == year }
}

/** 人事の見出し（解任 → 勇退 → 名選手・師弟・古巣の就任 → 昇格 → ほかの就任 の順で大きく扱う） */
private fun eventHead(e: StaffEvent, short: (String) -> String): String {
    val team = e.team?.let(short).orEmpty()
    val role = e.role?.let { STAFF_ROLE_LABELS[it] }.orEmpty()
    val name = e.name.substringBefore(' ').ifBlank { e.name }
    return when (e.kind) {
        "fire" -> "${team}、${name}監督を解任"
        "retire" -> "${team}・${name}${role}が勇退"
        "resign" -> "${team}・${name}${role}が辞任"
        "release" -> "${team}、${name}${role}と別れ"
        "promote" -> "${team}、${name}が監督に昇格"
        "turn" -> "${team}の${name}、指導者の道へ"
        else -> when {
            e.mentor != null -> "${name}、恩師${e.mentor.substringBefore(' ')}監督の下へ"
            e.homecoming && e.role == ROLE_MANAGER -> "${name}、古巣${team}で初の監督"
            e.homecoming -> "${name}が古巣${team}に${role}で戻る"
            e.role == ROLE_MANAGER -> "${team}の新監督に${name}"
            else -> "${team}の${role}に${name}"
        }
    }
}

private fun weight(e: StaffEvent): Int = when (e.kind) {
    "fire" -> 6
    "retire" -> if (e.role == ROLE_MANAGER) 5 else 2
    "promote" -> 4
    "hire" -> (if (e.role == ROLE_MANAGER) 3 else 1) + (if (e.mentor != null || e.homecoming) 2 else 0)
    "resign" -> 2
    "turn" -> 1
    else -> 0
}

/**
 * 地元紙の指導者の記事。
 * - キャンプ: 自球団のその年の人事と、新監督なら新体制の紹介
 * - シーズン中: 監督とコーチの考えが割れていれば、ときどき（4日に1日くらい）「ベンチの空気」
 */
internal fun staffLocalArticles(view: LeagueView, me: String, offPhase: Boolean, pen: Pen): List<FrontPage.Article> {
    val staff = view.staff ?: return emptyList()
    val out = mutableListOf<FrontPage.Article>()
    val manager = staff.manager
    if (offPhase) {
        val brief = view.leagueStaff?.of(view.teamName)?.manager
        if (manager != null && brief?.isNew == true && view.phase?.kind == "camp") {
            out += FrontPage.Article(
                "新体制",
                pen.pick(listOf("${manager.shortName}新監督、${manager.color}を掲げる", "${me}は${manager.shortName}新体制 ${manager.color}"), 60),
                "今季から指揮を執る${manager.name}監督（${manager.age}歳、${manager.origin}）。${manager.color}が持ち味で、性格は${manager.personality}。" +
                    (manager.delegation?.let { "コーチへの${it}。" } ?: ""),
                LINK_LINEUP,
            )
        }
        val ours = freshEvents(view, staff.events)
        if (ours.isNotEmpty()) {
            val top = ours.maxBy(::weight)
            out += FrontPage.Article("人事", eventHead(top, view::teamShort), ours.joinToString("") { "${it.text}。" }, LINK_LINEUP)
        }
    } else if (staff.rifts.isNotEmpty() && pen.pick(listOf(true, false, false, false), 61)) {
        val rift = pen.pick(staff.rifts, 62)
        out += FrontPage.Article(
            "ベンチの空気",
            if (rift.role == "pitching") "継投をめぐり首脳陣の意見割れる" else "攻め方をめぐり首脳陣の意見割れる",
            "${rift.text}。関係者によると、話し合いは平行線のままだという。",
            LINK_LINEUP,
        )
    }
    return out
}

/**
 * 全国紙の指導者の記事。
 * - キャンプ: リーグ全体のその年の人事（大きい話から）
 * - シーズン中: 最新の試合の日に勝って、監督の通算勝利がちょうど100の倍数になった（節目）
 */
internal fun staffNationalArticles(view: LeagueView, offPhase: Boolean, winners: Set<String>): List<FrontPage.Article> {
    val league = view.leagueStaff ?: return emptyList()
    val out = mutableListOf<FrontPage.Article>()
    if (offPhase) {
        val events = freshEvents(view, league.events).sortedByDescending(::weight)
        if (events.isNotEmpty())
            out += FrontPage.Article("人事", eventHead(events.first(), view::teamShort), events.take(6).joinToString("") { "${it.text}。" }, LINK_GAMES)
    } else {
        val hits = league.teams.filter { it.team in winners }.mapNotNull { t ->
            t.manager?.takeIf { it.totalWins > 0 && it.totalWins % 100 == 0 }?.let { t to it }
        }
        hits.firstOrNull()?.let { (t, m) ->
            out += FrontPage.Article(
                "記録",
                "${view.teamShort(t.team)}・${m.shortName}監督、通算${m.totalWins}勝",
                "${view.teamShort(t.team)}の${m.name}監督が、監督として通算${m.totalWins}勝に到達した。${m.color}の野球で白星を積み重ねてきた。",
                LINK_GAMES,
            )
        }
    }
    return out
}

/** 試合後のひと言の話し手（自球団の監督。いなければ人の呼び名を監督として）と、その人の気質 */
internal fun commentSpeaker(view: LeagueView): Pair<String?, Int> {
    view.staff?.manager?.let { return it.shortName to it.trait("temper") }
    val owner = view.members.firstOrNull { it.teamName == view.teamName }?.label?.takeIf { it.isNotBlank() && !it.startsWith("プレイヤー") }
    return owner to 0
}
