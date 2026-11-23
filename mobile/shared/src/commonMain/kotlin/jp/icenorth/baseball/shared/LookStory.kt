package jp.icenorth.baseball.shared

import kotlin.math.floor

// ============================================================
// 新しい見た目（試作）段4: 番記者と球団の出来事。Web 版 `src/online/look/story.js` の写し。
// 答え合わせは `LookTest`（期待値は mobile/tools/expect-look.mjs が書き出す）。
// 文を変えたら両方を直し、期待値を書き出し直す。
// ⚠ 表示専用。ビューにある順位・レース・指導者・名簿から作る。
// ============================================================

private val SURNAMES = listOf(
    "早瀬", "水野", "片桐", "三宅", "小野寺", "白石", "野村", "高梨", "真田", "宮本", "古川", "岸田",
    "望月", "藤原", "桜井", "杉山", "長尾", "黒田", "秋山", "柳田", "森下", "今井", "大塚", "星野",
)
private val GIVEN = listOf("みのり", "ゆかり", "葵", "真央", "千尋", "遥", "彩", "美咲", "健太", "翔", "大輔", "拓海", "誠", "直樹", "亮", "和也")

/** 球団の番記者。[seed] は顔の種（`faceArt(seed, look, age, suit = true)`） */
data class Reporter(val seed: String, val name: String, val age: Int, val title: String)

private fun LeagueView.shortOf(team: String) = teamLabels[team]?.short?.takeIf { it.isNotEmpty() } ?: team

/** 名字（「小塩 紀洋」→「小塩」） */
private fun surnameOf(name: String?): String = name.orEmpty().split(' ', '　')[0]

/** 球団の番記者。Web 版 `reporterOf` */
fun reporterOf(team: String, labels: Map<String, TeamLabel> = emptyMap()): Reporter {
    val r = LookRng(lookHash("reporter:$team"))
    val surname = r.pick(SURNAMES)
    val given = r.pick(GIVEN)
    val age = 24 + floor(r.next() * 18).toInt()
    val label = labels[team]
    val title = (label?.nickname?.takeIf { it.isNotEmpty() } ?: label?.short?.takeIf { it.isNotEmpty() } ?: team) + "番"
    return Reporter("reporter:$team", "$surname $given", age, title)
}

private val CLINCHED = mapOf(
    "first" to "優勝が決まりました！ 街じゅうがお祭り騒ぎです。",
    "promotion" to "昇格が決まりました！ 来季はいよいよ上の部です。",
    "survive" to "残留が決まりました。ひとまずほっとしましたね。",
    "relegated" to "降格が決まってしまいました…。来季は出直しです。",
)

/** 番記者のひとこと（多くて2つ）。Web 版 `reporterChat` */
fun reporterChat(view: LeagueView): List<String> {
    val me = view.teamName ?: return emptyList()
    val lines = mutableListOf<String>()
    val race = view.races.firstOrNull { it.team == me }
    if (race != null) {
        val rival = race.rival?.takeIf { it.isNotEmpty() }
        lines += when {
            race.clinched -> CLINCHED[race.kind].orEmpty()
            race.kind == "survive" -> "残留マジック${race.magic}。${rival?.let { "${view.shortOf(it)}より先に決めたいですね。" } ?: "もうひと踏ん張りです。"}"
            else -> "マジック${race.magic}が点灯中です。${rival?.let { "${view.shortOf(it)}の結果も気になりますね。" }.orEmpty()}"
        }
    } else {
        val s = view.teamStreaks[me]
        if (s?.kind == "W" && s.count >= 3) lines += "${s.count}連勝中です。ベンチの雰囲気もいいですよ。"
        else if (s?.kind == "L" && s.count >= 3) lines += "${s.count}連敗中…。そろそろ流れを変えたいところです。"
    }
    todayGameCard(view)?.let { card ->
        val whenText = if (card.title == "今日の一戦") "今日は" else "次は"
        val where = if (card.place == "ホーム") "本拠地です" else "${card.city.ifEmpty { "敵地" }}に乗りこみます"
        val starter = card.foe.starter?.let { "相手の先発は${it.name}の予定です。" }.orEmpty()
        lines += "$whenText${view.shortOf(card.foe.team)}戦、$where。$starter"
    }
    return lines.filter { it.isNotEmpty() }.take(2)
}

/** 場面で話す人（監督か、監督が居なければ番記者） */
data class StorySpeaker(val kind: String, val id: String?, val seed: String, val name: String, val label: String, val age: Int)

/** 場面の主役。[seed] は顔の種（選手の顔と同じ） */
data class StoryStar(val id: Long?, val seed: String, val name: String, val age: Int?, val condition: Int?)

/** 球団の出来事の場面。[key] は見た印（同じ場面を2度出さない。端末に覚える） */
data class EventScene(
    val key: String,
    val kind: String,
    val good: Boolean,
    val title: String,
    val heading: String,
    val speaker: StorySpeaker,
    val star: StoryStar?,
    val line: String,
)

/** 今季の主役（打点＋本塁打×2＋勝利×5＋セーブ×2 がいちばん多い選手）。並んだら名簿の先 */
private fun starOf(roster: List<Player>): Player? {
    var best: Player? = null
    var top = 0
    for (p in roster) {
        val b = p.seasonStats?.batting
        val pi = p.seasonStats?.pitching
        val score = (b?.rbis ?: 0) + (b?.homeruns ?: 0) * 2 + (pi?.wins ?: 0) * 5 + (pi?.saves ?: 0) * 2
        if (score > top) {
            top = score
            best = p
        }
    }
    return best
}

/** 上（-1）か下（+1）の部の名前。知らない部なら空 */
private fun leagueAt(id: String?, step: Int): String {
    val i = PYRAMID_LEAGUES.indexOfFirst { it.id == id }
    return if (i < 0) "" else PYRAMID_LEAGUES.getOrNull(i + step)?.name.orEmpty()
}

private class EventText(
    val good: Boolean,
    val heading: (Race) -> String,
    val coach: (String) -> String,
    val reporter: (String) -> String,
)

private val EVENTS = mapOf(
    "first" to EventText(
        true,
        { "${it.leagueName}優勝！" },
        { s -> "「よくやった！ ${if (s.isNotEmpty()) "$s、今季はお前がチームを引っぱってくれた。" else ""}オーナー、来季もこの場所に戻ってきましょう」" },
        { s -> "優勝が決まりました！ ${if (s.isNotEmpty()) "今季の主役は${s}選手。" else ""}街じゅうがお祭り騒ぎです。" },
    ),
    "promotion" to EventText(
        true,
        { "${it.leagueName}優勝！　来季は${leagueAt(it.league, -1).ifEmpty { "上の部" }}へ" },
        { s -> "「ついに上がれるぞ。${if (s.isNotEmpty()) "${s}の活躍がなければ届かなかった。" else ""}オーナー、来季に向けて補強を頼みます」" },
        { s -> "昇格が決まりました！ ${if (s.isNotEmpty()) "${s}選手の活躍が光った1年でした。" else ""}来季はいよいよ上の部です。" },
    ),
    "survive" to EventText(
        true,
        { "${it.leagueName}残留決定" },
        { s -> "「苦しい1年だったが、なんとか踏みとどまった。${if (s.isNotEmpty()) "$s、よく粘ってくれた。" else ""}来季は上を目指しましょう」" },
        { s -> "残留が決まりました。${if (s.isNotEmpty()) "${s}選手の踏ん張りが大きかったですね。" else ""}来季は上を目指しましょう。" },
    ),
    "relegated" to EventText(
        false,
        { "${it.leagueName}降格…　来季は${leagueAt(it.league, 1).ifEmpty { "下の部" }}から" },
        { s -> "「申し訳ない。来季は下からやり直しだ。${if (s.isNotEmpty()) "${s}を中心に、" else ""}もう一度はい上がってみせます」" },
        { s -> "降格が決まってしまいました…。${if (s.isNotEmpty()) "${s}選手を中心に、" else ""}来季は出直しです。" },
    ),
)

/** 球団の出来事の場面（自球団のレースが決まったとき）。無ければ null。Web 版 `eventScene` */
fun eventScene(view: LeagueView): EventScene? {
    val me = view.teamName ?: return null
    val race = view.races.firstOrNull { it.team == me && it.clinched && it.kind in EVENTS } ?: return null
    val def = EVENTS.getValue(race.kind)
    val manager = view.staff?.manager
    val player = starOf(view.roster)
    val s = player?.let { surnameOf(it.name) }.orEmpty()
    val month = view.currentDate?.month
    val year = view.year?.toString().orEmpty()
    val whenText = listOfNotNull(view.year?.let { "${it}年目" }, month?.takeIf { it > 0 }?.let { "${it}月" }).joinToString("・")
    val speaker = if (manager != null) {
        StorySpeaker("coach", manager.id.ifEmpty { null }, "c${manager.id.ifEmpty { manager.name }}", manager.name, "${surnameOf(manager.name)}監督", manager.age.takeIf { it > 0 } ?: 50)
    } else {
        val rep = reporterOf(me, view.teamLabels)
        StorySpeaker("reporter", null, rep.seed, rep.name, "${rep.title}　${rep.name}", rep.age)
    }
    return EventScene(
        key = "$me:$year:${race.kind}",
        kind = race.kind,
        good = def.good,
        title = "球団の出来事${if (whenText.isNotEmpty()) "　$whenText" else ""}",
        heading = def.heading(race),
        speaker = speaker,
        star = player?.let { StoryStar(it.id, "p${it.id}", it.name, it.age, it.condition) },
        line = if (manager != null) def.coach(s) else def.reporter(s),
    )
}
