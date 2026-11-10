package jp.icenorth.baseball.shared

import kotlinx.serialization.Serializable

// ============================================================
// 年代記: 節目の記録・引退・裏の大会（甲子園・独立リーグ日本一）・優勝や昇格のマジック・球団史。
//
// ⚠ 数字はサーバー（server/chronicle.mjs）が作る。ここは文にするだけ。
// ⚠ 文は Web 版（src/online/chronicleText.js）と同じにすること。
// ============================================================

/** 優勝・昇格・残留のマジックと決定（kind: first / promotion / survive / relegated） */
@Serializable
data class Race(
    val league: String? = null,
    val leagueName: String = "",
    val kind: String = "",
    val team: String = "",
    val magic: Int = 0,
    val clinched: Boolean = false,
    val rival: String? = null,
    val left: Int = 0,
)

/** 節目（kind: career＝このリーグでの通算 / season＝その年） */
@Serializable
data class Milestone(
    val year: Int = 0,
    val month: Int = 0,
    val day: Int = 0,
    val kind: String = "",
    val side: String = "",
    val stat: String = "",
    val label: String = "",
    val value: Int = 0,
    val team: String = "",
    val name: String = "",
    val playerId: Long? = null,
)

@Serializable
data class Retired(
    val year: Int = 0,
    val team: String = "",
    val name: String = "",
    val age: Int? = null,
    val position: String? = null,
    val seasons: Int = 0,
    val line: String? = null,
    val hallOfFame: Boolean = false,
    val secondCareer: String? = null,
)

@Serializable
data class WorldStar(val name: String = "", val school: String = "", val role: String = "", val stageLabel: String = "")

/** 裏の大会（kind: koshien / grand） */
@Serializable
data class WorldNews(
    val kind: String = "",
    val year: Int = 0,
    val month: Int = 0,
    val day: Int = 0,
    val champion: String = "",
    val championPref: String? = null,
    val championLeague: String? = null,
    val runnerUp: String? = null,
    val finalScore: String? = null,
    val teams: Int = 0,
    val ours: String? = null,
    val oursResult: String? = null,
    val oursLostTo: String? = null,
    val star: WorldStar? = null,
)

@Serializable
data class ChronicleView(
    val milestones: List<Milestone> = emptyList(),
    val retired: List<Retired> = emptyList(),
    val world: List<WorldNews> = emptyList(),
)

/** 球団史（「team」の窓口の chronicle） */
@Serializable
data class TeamChronicle(
    val seasons: List<TeamSeason> = emptyList(),
    val records: List<TeamRecord> = emptyList(),
    val retired: List<Retired> = emptyList(),
    val milestones: List<Milestone> = emptyList(),
)

@Serializable
data class TeamSeason(
    val year: Int = 0,
    val league: String? = null,
    val rank: Int? = null,
    val wins: Int? = null,
    val losses: Int? = null,
    val draws: Int? = null,
    val champion: Boolean = false,
    val move: String? = null,
    val titles: List<String> = emptyList(),
) {
    /** 「1部2位 64勝53敗3分 プレーオフ優勝・昇格」 */
    val line: String get() = listOfNotNull(
        listOfNotNull(league, rank?.let { "${it}位" }).joinToString("").ifEmpty { null },
        wins?.let { "${it}勝${losses ?: 0}敗${if ((draws ?: 0) > 0) "${draws}分" else ""}" },
        listOfNotNull(if (champion) "プレーオフ優勝" else null, move).plus(titles).joinToString("・").ifEmpty { null },
    ).joinToString(" ")
}

@Serializable
data class RecordRow(val name: String = "", val year: Int? = null, val value: Int = 0, val current: Boolean = false, val active: Boolean = false)

@Serializable
data class TeamRecord(val stat: String = "", val label: String = "", val season: List<RecordRow> = emptyList(), val career: List<RecordRow> = emptyList())

data class ChronicleText(val head: String, val body: String)

/**
 * 優勝・昇格・残留のマジックと決定。[short] は球団の短い名前
 * ⚠ 決定の文は時期によらない形にする。決着はシーズンを終えたあと（11月の契約更改・トライアウト）も
 *    紙面に残るので、「プレーオフに臨む」のような先の話を書くと、プレーオフが済んだあとに読めてしまう
 */
fun raceText(r: Race, short: (String) -> String): ChronicleText? {
    if (r.team.isEmpty()) return null
    val t = short(r.team)
    val rival = r.rival?.let(short)
    val tail = if (rival != null) "${t}の勝ちと${rival}の負けを合わせて${r.magic}で決まる（残り${r.left}試合）。" else ""
    return when (r.kind) {
        "first" -> if (r.clinched) ChronicleText("${t}、${r.leagueName}1位が決定", "レギュラーシーズン1位の座を手にした。")
        else ChronicleText("${t}、${r.leagueName}1位へマジック${r.magic}", tail)
        "promotion" -> if (r.clinched) ChronicleText("${t}、${r.leagueName}優勝で昇格が決定", "来季は1部で戦う。")
        else ChronicleText("${t}、昇格へマジック${r.magic}", tail)
        "survive" -> if (r.clinched) ChronicleText("${t}、${r.leagueName}残留が決定", "降格圏から抜け出した。")
        else ChronicleText("${t}、残留へマジック${r.magic}", tail)
        "relegated" -> ChronicleText("${t}、2部降格が決定", "来季は2部から出直す。")
        else -> null
    }
}

/** 節目（「通算100安打に到達（このリーグで）」） */
fun milestoneText(m: Milestone): String = if (m.kind == "career") "${m.label}に到達（このリーグで）" else "${m.label}に到達"

/** 裏の大会（甲子園・独立リーグ日本一決定戦） */
fun worldText(w: WorldNews, short: (String) -> String): ChronicleText? = when (w.kind) {
    "koshien" -> {
        val star = w.star?.let { "大会の顔は${it.school}の${it.role}・${it.name}（${it.stageLabel}）。" }.orEmpty()
        ChronicleText(
            "夏の甲子園、${w.champion}${w.championPref?.let { "（$it）" }.orEmpty()}が優勝",
            "${w.runnerUp?.let { "準優勝は${it}。" }.orEmpty()}${star}この世代から、いずれトライアウトに名前が出てくるかもしれない。",
        )
    }
    "grand" -> {
        val ours = w.ours?.let { "このリーグの代表${short(it)}は${w.oursResult ?: "出場"}${w.oursLostTo?.let { l -> "（${l}に敗れた）" }.orEmpty()}。" }.orEmpty()
        ChronicleText(
            "独立リーグ日本一は${w.champion}${w.championLeague?.let { "（$it）" }.orEmpty()}",
            "各地の独立リーグの王者${if (w.teams > 0) "${w.teams}球団" else ""}が争った決定戦。${w.finalScore?.let { "決勝は${it}。" }.orEmpty()}$ours",
        )
    }
    else -> null
}

/** 年の中の通し日（月×100＋日）。年をまたぐ比べは年で分ける */
private fun dayOf(year: Int, month: Int, day: Int): Int = year * 10000 + month * 100 + day

/**
 * 裏の大会のうち、いま紙面に載せるもの（同じ年で、その日から120日以内）。
 * ⚠ 甲子園（8月）と日本一決定戦（10月）はシーズン後の試合の無い時期にあり、その間は
 *    1回の進行でまとめて進む（`IDLE_DAYS_PER_TICK`）。次に紙面を開くのは11月の契約更改なので、
 *    30日で切ると甲子園が一度も載らない
 */
internal fun recentWorld(view: LeagueView): List<WorldNews> {
    val d = view.currentDate ?: return emptyList()
    val year = view.year ?: return emptyList()
    return view.chronicle.world.filter { w ->
        w.year == year && run {
            val days = (d.month - w.month) * 30 + (d.day - w.day)
            days in 0..120
        }
    }
}

/** その日（[date] の試合の日）に届いた節目 */
internal fun milestonesOn(view: LeagueView, date: GameDate?): List<Milestone> {
    val d = date ?: return emptyList()
    val year = view.year ?: return emptyList()
    return view.chronicle.milestones.filter { dayOf(it.year, it.month, it.day) == dayOf(year, d.month, d.day) }
}

/** 節目の記事の本文（「田中が通算100安打（このリーグで）、鈴木がシーズン20本塁打に到達した。」） */
internal fun milestoneBody(list: List<Milestone>, short: ((String) -> String)?): String =
    list.take(4).joinToString("、") { m ->
        "${short?.let { "${it(m.team)}の" }.orEmpty()}${m.name}が${m.label}"
    } + "に到達した。" + if (list.any { it.kind == "career" }) "通算はこのリーグを始めてからの数。" else ""

/** 引退の記事の本文 */
internal fun retiredBody(list: List<Retired>, short: ((String) -> String)?): String =
    list.take(3).joinToString("") { r ->
        "${short?.let { "${it(r.team)}の" }.orEmpty()}${r.name}（${r.age ?: "-"}歳）が現役を退いた。" +
            listOfNotNull(
                r.seasons.takeIf { it > 0 }?.let { "このリーグで${it}年" },
                r.line?.let { "通算$it" },
            ).joinToString("、").let { if (it.isEmpty()) "" else "$it。" } +
            (r.secondCareer?.let { "今後は${it}として球界に残る。" } ?: "") +
            (if (r.hallOfFame) "殿堂入りの成績を残した。" else "")
    } + if (list.size > 3) "ほかに${list.size - 3}人がユニフォームを脱いだ。" else ""
