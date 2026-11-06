package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlin.math.abs
import kotlin.math.round

/**
 * ホームの「スポーツ新聞」の紙面。ビューと、自球団の最新の試合の詳細（あれば）から見出しと記事を作る。
 *
 * ⚠ 数字の表（順位表・タイトル争いの一覧・リーグ便りの全件）は試合タブに置く（いしだの指定:
 *    「数字数字したことは試合タブ、ホームはエンタメ感」）。ここでは数字は記事の文の中に少しだけ入れる。
 * ⚠ 文はビューから決まる（同じビューなら同じ紙面）。乱数で言い回しを変えると、開き直すたびに記事が変わって見える。
 */
data class FrontPage(
    /** 題字の下の日付（「4月23日 第25ターン」） */
    val issue: String,
    /** 大見出し */
    val headline: String,
    /** 袖見出し（連勝・順位など） */
    val kicker: String?,
    /** 小見出し（勝ち投手・主役） */
    val subhead: String?,
    /** リード文 */
    val lead: String?,
    val tone: Tone,
    /** 大見出しの下に出す得点（自球団の最新の試合） */
    val score: Score?,
    val articles: List<Article>,
    /** リーグ短信（同じ日のほかの試合） */
    val shorts: List<String>,
) {
    enum class Tone { Win, Lose, Draw, None }
    data class Score(val away: String, val awayScore: Int, val home: String, val homeScore: Int)
    data class Article(val kicker: String, val title: String, val body: String)
}

private fun one(v: Double?): String = v?.let { (round(it * 10) / 10).toString() } ?: "-"
private fun two(v: Double?): String = v?.let { val r = round(it * 100).toInt(); "${r / 100}.${(abs(r) % 100).toString().padStart(2, '0')}" } ?: "-"

/** 首位とのゲーム差（0なら「首位」） */
private fun gamesBehind(leader: Standing, me: Standing): Double = ((leader.wins - me.wins) + (me.losses - leader.losses)) / 2.0

private fun outsText(outs: Int): String = if (outs % 3 == 0) "${outs / 3}回" else "${outs / 3}回${outs % 3}/3"

fun buildFrontPage(view: LeagueView, raw: JsonObject?, lastGame: JsonObject? = null): FrontPage {
    val team = view.teamName ?: ""
    val me = view.teamShort(team)
    val date = view.currentDate
    val issue = listOfNotNull(
        date?.let { "${it.month}月${it.day}日" },
        turnOfDate(date, view.seasonTurns)?.let { "第${it}ターン" },
    ).joinToString(" ").ifEmpty { formatTurn(date, view.seasonTurns) }

    // 自球団の順位（部の中）
    val league = view.teamLeagues[team]
    val table = view.standings.filter { league == null || view.teamLeagues[it.team] == league }
    val rankIndex = table.indexOfFirst { it.team == team }
    val mine = table.getOrNull(rankIndex)
    val leagueName = league?.let { LEAGUE_NAMES[it] } ?: ""
    val placeText = if (mine != null && mine.gamesPlayed > 0) {
        val gb = gamesBehind(table.first(), mine)
        "${leagueName}${rankIndex + 1}位" + if (rankIndex == 0) "" else "（首位と${one(gb)}差）"
    } else null

    val own = view.results.filter { it.home == team || it.away == team }
    val last = own.lastOrNull()
    val articles = mutableListOf<FrontPage.Article>()

    var headline: String
    var kicker: String? = null
    var subhead: String? = null
    var lead: String? = null
    var tone = FrontPage.Tone.None
    var score: FrontPage.Score? = null

    if (last != null && last.homeScore != null && last.awayScore != null) {
        val home = last.home == team
        val ours = if (home) last.homeScore else last.awayScore
        val theirs = if (home) last.awayScore else last.homeScore
        val opp = view.teamShort(if (home) last.away else last.home)
        val outcome = { r: GameResult ->
            val h = r.home == team
            val a = (if (h) r.homeScore else r.awayScore) ?: 0
            val b = (if (h) r.awayScore else r.homeScore) ?: 0
            a.compareTo(b)
        }
        val now = outcome(last)
        val streak = own.asReversed().takeWhile { outcome(it) == now }.size
        tone = when { now > 0 -> FrontPage.Tone.Win; now < 0 -> FrontPage.Tone.Lose; else -> FrontPage.Tone.Draw }
        val diff = abs(ours - theirs)
        headline = when (tone) {
            FrontPage.Tone.Win -> when {
                theirs == 0 -> "${me}、完封勝利！"
                diff >= 7 -> "${me}打線爆発 ${ours}点大勝"
                diff == 1 -> "${me}、接戦を制す"
                streak >= 3 -> "${me}止まらない${streak}連勝"
                else -> "${me}快勝 ${opp}を下す"
            }
            FrontPage.Tone.Lose -> when {
                ours == 0 -> "${me}、零封負け"
                diff >= 7 -> "${me}投壊 ${theirs}失点の大敗"
                diff == 1 -> "${me}あと一歩 惜敗"
                streak >= 3 -> "${me}${streak}連敗 出口見えず"
                else -> "${me}、${opp}に屈す"
            }
            else -> "${me}、${opp}と痛み分け"
        }
        kicker = listOfNotNull(
            if (streak >= 2 && tone != FrontPage.Tone.Draw) "${streak}${if (tone == FrontPage.Tone.Win) "連勝" else "連敗"}" else null,
            placeText,
        ).joinToString("・").ifEmpty { null }
        score = FrontPage.Score(view.teamShort(last.away), last.awayScore, view.teamShort(last.home), last.homeScore)
        val d = last.decisions
        // 主役（試合の詳細があれば）。無ければ自球団の勝ち投手・負け投手
        subhead = heroLine(lastGame, team) ?: when (tone) {
            FrontPage.Tone.Win -> listOfNotNull(d?.winningPitcher?.name?.let { "勝ち投手 $it" }, d?.savePitcher?.name?.let { "S $it" }).joinToString("　").ifEmpty { null }
            FrontPage.Tone.Lose -> d?.losingPitcher?.name?.let { "負け投手 $it" }
            else -> null
        }
        lead = buildString {
            last.date?.let { append("${it.month}月${it.day}日、") }
            append("${me}は${if (home) "本拠地" else "敵地"}で${opp}と対戦し、${ours}-${theirs}で")
            append(when (tone) { FrontPage.Tone.Win -> "勝利した。"; FrontPage.Tone.Lose -> "敗れた。"; else -> "引き分けた。" })
            if (mine != null) append("これで${mine.wins}勝${mine.losses}敗${if (mine.draws > 0) "${mine.draws}分" else ""}${placeText?.let { "、$it" } ?: ""}。")
        }
    } else {
        // まだ試合が無い（初期メンバー選び・キャンプ・オフ）
        val phase = view.phase?.kind
        headline = when {
            view.pendingPack != null || phase == "pack_select" -> "${me}始動 初期メンバー選びへ"
            phase == "initial_tryout" -> "${me}、初期編成で戦力を整える"
            phase == "offseason" -> "${me}、新シーズンへ"
            phase == "camp" -> "${me}、春季キャンプで鍛錬"
            phase == "contract" -> "${me}、契約更改の季節"
            phase == "tryout" -> "${me}、トライアウトで新戦力探し"
            date != null && date.month < SEASON_START_MONTH -> "開幕へ ${me}準備着々"
            else -> "${me}、次の戦いへ"
        }
        lead = when {
            view.pendingPack != null || phase == "pack_select" -> "新リーグの幕開け。まずは24人の顔ぶれを決めるところから始まる。"
            phase == "camp" -> "開幕を前に、選手たちは汗を流している。誰が伸びるかは練習の選び方次第だ。"
            else -> null
        }
    }

    // 次戦予告
    view.nextGames.firstOrNull { it.home == team || it.away == team }?.let { g ->
        val home = g.home == team
        val opp = view.teamShort(if (home) g.away else g.home)
        val ourStarter = if (home) g.homeStarterInfo else g.awayStarterInfo
        val theirStarter = if (home) g.awayStarterInfo else g.homeStarterInfo
        val pitchers = if (ourStarter?.name != null && theirStarter?.name != null) {
            "先発は${ourStarter.name}（${ourStarter.wins}勝${ourStarter.losses}敗${ourStarter.era?.let { " 防御率${two(it)}" } ?: ""}）、" +
                "${opp}は${theirStarter.name}（${theirStarter.wins}勝${theirStarter.losses}敗）の予想。"
        } else ""
        articles += FrontPage.Article("次戦予告", "次は${opp}戦（${if (home) "本拠地" else "敵地"}）", pitchers.ifEmpty { "先発はまだ決まっていない。" })
    }

    // 順位の行方（数字は文の中に少しだけ）
    if (table.isNotEmpty() && table.first().gamesPlayed > 0 && mine != null) {
        val top = table.first()
        val title = if (rankIndex == 0) "${me}が首位を走る" else "首位は${view.teamShort(top.team)}"
        val second = table.getOrNull(1)
        val body = if (rankIndex == 0 && second != null) {
            "2位の${view.teamShort(second.team)}とは${one(gamesBehind(top, second))}差。"
        } else {
            "${view.teamShort(top.team)}が${top.wins}勝${top.losses}敗で${leagueName}を引っ張る。${me}は${placeText}。"
        }
        articles += FrontPage.Article("順位の行方", title, body)
    }

    // タイトル戦線（自球団の選手が上位に居れば、その話題を優先）
    val boards = raw?.at("leaders").list().mapNotNull { it.obj() }
    val ownLeaders = boards.flatMap { b ->
        b.at("rows").list().mapNotNull { it.obj() }.take(5).withIndex()
            .filter { it.value.at("team").str() == team }
            .map { Triple(b, it.index + 1, it.value) }
    }.sortedBy { it.second }
    if (ownLeaders.isNotEmpty()) {
        val (b, rank, row) = ownLeaders.first()
        val name = row.at("name").str()
        val others = ownLeaders.drop(1).take(2).joinToString("、") { (bb, r, rr) ->
            if (rr.at("name").str() == name) "${name}は${bb.at("label").str()}でも${r}位" else "${rr.at("name").str()}が${bb.at("label").str()}で${r}位"
        }
        articles += FrontPage.Article(
            "タイトル戦線",
            "${name}、${b.at("label").str()}${if (rank == 1) "トップ" else "${rank}位"}",
            "${b.at("label").str()}は${leaderValue(b, row)}でリーグ${rank}位につける。" + if (others.isNotEmpty()) "ほかにも、$others。" else "",
        )
    } else {
        boards.firstOrNull { it.at("id").str() == "avg" }?.let { b ->
            b.at("rows").list().firstOrNull()?.obj()?.let { row ->
                articles += FrontPage.Article("タイトル戦線", "首位打者争い、${row.at("name").str()}が先頭", "${view.teamShort(row.at("team").str().orEmpty())}の${row.at("name").str()}が打率${leaderValue(b, row)}でトップ。${me}の選手は上位5人に居ない。")
            }
        }
    }

    // ベンチの話題（絶好調・成績の特徴・お疲れ）
    val hot = view.roster.filter { it.isActive && it.condition == 4 }.map { it.name }
    val labelled = view.roster.filter { it.isActive }.mapNotNull { p ->
        p.performance?.batting?.labels?.firstOrNull { it.tone == "good" }?.let { "${p.name}（${it.text}）" }
    }
    val tired = view.roster.filter { it.isActive && (it.fatigue ?: 0) >= FIELDER_REST_FATIGUE && !it.isPitcher }.map { it.name }
    val bench = listOfNotNull(
        hot.takeIf { it.isNotEmpty() }?.let { "絶好調は${it.take(3).joinToString("・")}。" },
        labelled.takeIf { it.isNotEmpty() }?.let { "${it.take(2).joinToString("、")}と、持ち味が数字に表れている。" },
        tired.takeIf { it.isNotEmpty() }?.let { "${it.take(3).joinToString("・")}は疲れがたまっており、休養が必要か。" },
    )
    if (bench.isNotEmpty()) {
        articles += FrontPage.Article("ベンチ裏", if (hot.isNotEmpty()) "${hot.first()}が絶好調" else if (tired.isNotEmpty()) "${tired.first()}に疲れ" else "${me}の話題", bench.joinToString(""))
    }

    // リーグ便りの最新1件（全件は試合タブ）
    raw?.at("notices").list().mapNotNull { it.obj() }.firstOrNull()?.let { n ->
        val items = (n["picks"] ?: n["moves"]).list().mapNotNull { it.obj() }
        when (n.at("type").str()) {
            "draft" -> {
                val ours = items.filter { it.at("team").str() == team }
                articles += FrontPage.Article(
                    "ドラフト",
                    if (ours.isNotEmpty()) "${me}から${ours.size}人がプロへ" else "ドラフト会議で${items.size}人が指名",
                    if (ours.isNotEmpty()) ours.take(3).joinToString("、") { "${it.at("name").str()}（${view.teamShort(it.at("npbTeam").str().orEmpty())}）" } + "が指名を受けた。"
                    else "リーグから${items.size}人がNPBの球団へ。詳しくは試合タブのリーグ便りで。",
                )
            }
            "promotion" -> {
                val up = items.filter { it.at("to").str() == "A" }.mapNotNull { it.at("teamId").str() }.map { view.teamShort(it) }
                articles += FrontPage.Article("昇格・降格", if (up.isNotEmpty()) "${up.joinToString("・")}が1部へ" else "入れ替えが決まる", "${items.size}球団の所属が入れ替わった。")
            }
            "trade" -> {
                val teams = n.at("teams").list().mapNotNull { it.str() }.map { view.teamShort(it) }
                articles += FrontPage.Article(
                    "トレード",
                    "${teams.joinToString("と")}がトレード成立",
                    items.take(4).joinToString("、") { "${it.at("name").str()}（→${view.teamShort(it.at("team").str().orEmpty())}）" } + "が移籍する。",
                )
            }
            "tryout" -> {
                val ours = items.filter { it.at("team").str() == team }
                articles += FrontPage.Article(
                    "トライアウト",
                    if (ours.isNotEmpty()) "${me}、トライアウトで${ours.size}人獲得" else "トライアウトで${items.size}人が新天地へ",
                    if (ours.isNotEmpty()) ours.take(4).joinToString("・") { it.at("name").str().orEmpty() } + "が加わる。" else "詳しくは試合タブのリーグ便りで。",
                )
            }
        }
    }

    // リーグ短信: 自球団の最新の試合と同じ日のほかの試合
    val shorts = last?.date?.let { d ->
        view.results.filter { it.date == d && it.home != team && it.away != team && it.homeScore != null && it.awayScore != null }
            .map { "${view.teamShort(it.away)} ${it.awayScore}-${it.homeScore} ${view.teamShort(it.home)}" }
    }.orEmpty()

    return FrontPage(issue, headline, kicker, subhead, lead, tone, score, articles, shorts)
}

private val LEADER_UNITS = mapOf("homeruns" to "本", "rbis" to "打点", "stolenBases" to "個", "wins" to "勝", "strikeouts" to "個", "saves" to "セーブ")

/** タイトルの値を文の中で読める形に（.531 / 2.15 / 12本 / 8個） */
private fun leaderValue(board: JsonObject, row: JsonObject): String {
    val v = row.at("value").num() ?: return "-"
    return when (board.at("digits").int() ?: 0) {
        3 -> rate3(v)
        2 -> two(v)
        1 -> one(v)
        else -> v.toInt().toString() + (LEADER_UNITS[board.at("id").str()] ?: "")
    }
}

/** 試合の詳細から、自球団の主役（本塁打・打点・安打の多い打者、または長く投げた投手）を1行で */
private fun heroLine(game: JsonObject?, team: String): String? {
    val players = game?.at("teams", team).list().mapNotNull { it.obj() }
    if (players.isEmpty()) return null
    val batter = players.maxByOrNull {
        val b = it["batting"].obj()
        (b?.at("homeruns").num() ?: 0.0) * 4 + (b?.at("rbis").num() ?: 0.0) * 2 + (b?.at("hits").num() ?: 0.0)
    }
    val b = batter?.get("batting").obj()
    val hr = b?.at("homeruns").num()?.toInt() ?: 0
    val rbi = b?.at("rbis").num()?.toInt() ?: 0
    val hits = b?.at("hits").num()?.toInt() ?: 0
    val pitcher = players.maxByOrNull { it.at("pitching", "inningsPitched").num() ?: 0.0 }
    val outs = pitcher?.at("pitching", "inningsPitched").num()?.toInt() ?: 0
    val er = pitcher?.at("pitching", "earnedRuns").num()?.toInt() ?: 0
    val k = pitcher?.at("pitching", "strikeouts").num()?.toInt() ?: 0
    // 打者が目立つ（本塁打か3打点以上か3安打以上）なら打者、そうでなければ先発
    return if (batter != null && (hr > 0 || rbi >= 3 || hits >= 3)) {
        "${batter.at("name").str()} " + listOfNotNull(
            "${hits}安打".takeIf { hits > 0 },
            "${hr}本塁打".takeIf { hr > 0 },
            "${rbi}打点".takeIf { rbi > 0 },
        ).joinToString("・") + "の活躍"
    } else if (pitcher != null && outs >= 15) {
        "${pitcher.at("name").str()} ${outsText(outs)}${er}失点${if (k >= 7) "・${k}奪三振" else ""}"
    } else null
}
