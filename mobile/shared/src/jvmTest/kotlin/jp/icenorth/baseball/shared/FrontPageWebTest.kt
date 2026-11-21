package jp.icenorth.baseball.shared

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * PC のスポーツ新聞（src/online/paper/。このファイル群 FrontPage*.kt の写し）が、アプリと同じ紙面を作るか。
 * 期待値は mobile/tools/expect-paper.mjs が、紙面の検査と同じ窓口の答え（resources/front/）から書き出す。
 * ⚠ 紙面の文を変えたら PC 版（src/online/paper/）も直し、期待値を書き出し直すこと。
 * ⚠ 行の書き方（[paperLines]）は expect-paper.mjs の paperLines と同じにすること
 */
class FrontPageWebTest {
    private fun res(name: String) = javaClass.getResource("/front/$name")!!.readText()
    private val expected = OnlineJson.parseToJsonElement(res("paper-expected.json")).jsonObject
    private val view = OnlineJson.decodeFromString<LeagueView>(res("view.json"))
    private val raw = OnlineJson.decodeFromString<JsonObject>(res("view.json"))
    private val game = OnlineJson.decodeFromString<JsonObject>(res("game.json"))
    private val opponent = OnlineJson.decodeFromString<JsonObject>(res("team.json")).at("roster").list().mapNotNull { e ->
        runCatching { OnlineJson.decodeFromJsonElement(Player.serializer(), e) }.getOrNull()
    }
    private val history = runBlocking {
        loadOwnHistory(view.teamName!!) { OnlineJson.decodeFromString<JsonObject>(res("games.json")) }
    }

    private fun j(vararg xs: Any?): String = xs.joinToString("|") { it?.toString() ?: "null" }

    private fun paperLines(p: FrontPage): List<String> {
        val out = mutableListOf<String>()
        fun add(vararg xs: Any?) { out += j(*xs) }
        fun art(tag: String, a: FrontPage.Article) = add(tag, a.kicker, a.title, a.body, a.link)
        add("head", p.title, p.badge, p.extra, p.issue, p.team, p.standing, p.status)
        add("top", p.kicker, p.headline, p.subhead, p.lead, p.tone.name)
        p.score?.let { add("score", it.away, it.awayScore, it.home, it.homeScore) }
        p.lineScore?.let { add("line", it.away, it.home, it.awayRuns.joinToString(","), it.homeRuns.joinToString(","), it.walkOff) }
        p.box.forEach { (k, v) -> add("box", k, v) }
        p.articles.forEach { art("article", it) }
        p.shorts.forEach { add("short", it) }
        add("date", p.dateLine, p.issueNo)
        add("big", p.bigHead, p.bigSub, p.leadHead, p.caption)
        p.hero?.let { h -> add("hero", h.title, h.name, h.position, h.lines.joinToString(",") { "${it.first}:${it.second}" }, h.season, h.summary) }
        p.index.forEach { add("index", it) }
        p.results.forEach { add("result", it.away, it.awayScore, it.home, it.homeScore) }
        val front = p.frontArticles
        if (front == null) add("front", null) else front.forEach { add("front", it.kicker) }
        p.teamPage?.let { t ->
            add("team", t.section, t.form.joinToString(","), t.nowNote, t.rotation)
            t.interview?.let { i ->
                add("interview", i.title, i.intro, i.speaker)
                i.qa.forEach { (q, a) -> add("qa", q, a) }
            }
            t.now.forEach { (k, v) -> add("now", k, v) }
            t.conditions.forEach { add("cond", it.arrow, it.name, it.position, it.note) }
            t.pitchers.forEach { (n, note, rest) -> add("pitcher", n, note, rest) }
            t.articles.forEach { art("tarticle", it) }
        }
        p.recordPage?.let { r ->
            add("record", r.game, r.reviewHead, r.review, r.leagueName, r.probablesTitle)
            r.boxes.forEach { b ->
                add("boxteam", b.name, b.totals.joinToString(","))
                b.batters.forEach { add("batter", it.pos, it.name, it.ab, it.h, it.rbi, it.hr, it.sub) }
                b.pitchers.forEach { add("bpitcher", it.name, it.ip, it.h, it.so, it.r, it.pitches) }
            }
            r.notes.forEach { add("note", it) }
            r.relays.forEach { add("relay", it) }
            r.standings.forEach { add("stand", it.rank, it.team, it.w, it.l, it.gb, it.note, it.mine) }
            r.probables.forEach { (x, mine) -> add("prob", x, mine) }
            r.leaders.forEach { b ->
                add("leader", b.title)
                b.rows.forEach { add("lrow", it.name, it.team, it.value, it.mine) }
            }
            r.shorts.forEach { art("rshort", it) }
        }
        return out
    }

    private fun lines(scene: String, paper: String): List<String> = expected.at(scene, paper).list().map { it.str().orEmpty() }

    /** 場面ごとに、ビューのいちばん上の段の項目を差し替える（expect-paper.mjs の `{ ...raw, ...patch }` と同じ） */
    private val patches = OnlineJson.decodeFromString<JsonObject>(res("scenes.json"))

    private fun check(scene: String, game: JsonObject?, history: Pair<List<GameResult>, Boolean>?, opponent: List<Player>?, patch: String? = null) {
        val r = patch?.let { JsonObject(raw + patches.getValue(it).jsonObject) } ?: raw
        val v = patch?.let { OnlineJson.decodeFromJsonElement(LeagueView.serializer(), r) } ?: view
        val local = buildFrontPage(v, r, game, history = history?.first, historyComplete = history?.second ?: false, opponent = opponent)
        val national = buildNationalPage(v, r, local)
        val wantLocal = lines(scene, "local")
        val wantNational = lines(scene, "national")
        assertTrue(wantLocal.size > if (patch == "camp") 10 else 20, "期待値が空に近い（$scene）")
        // ⚠ 1行ずつ比べる（全部を1つの文にすると、どこがずれたか読めない）
        assertEquals(wantLocal.joinToString("\n"), paperLines(local).joinToString("\n"), "地元紙（$scene）が PC 版と違う")
        assertEquals(wantNational.joinToString("\n"), paperLines(national).joinToString("\n"), "全国紙（$scene）が PC 版と違う")
    }

    @Test
    fun fullDayMatchesPc() = check("full", game, history, opponent)

    @Test
    fun withoutDetailMatchesPc() = check("noDetail", null, history, null)

    @Test
    fun withoutHistoryMatchesPc() = check("noHistory", game, null, opponent)

    /** 手続きの時期（キャンプ）の1面と、指導者の人事（新体制・人事の記事） */
    @Test
    fun campMatchesPc() = check("camp", null, history, opponent, patch = "camp")

    /** 勝った日の見出し（ほかの場面は負けた日だけ） */
    @Test
    fun winMatchesPc() = check("win", null, null, opponent, patch = "win")

    /** ドラフトの気配（`proWatch`）があるときのプロ注目の記事（地元紙・全国紙） */
    @Test
    fun watchMatchesPc() = check("watch", game, history, opponent, patch = "watch")
}
