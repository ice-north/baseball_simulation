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
    /** リーグからプロ入りした選手（新しい順）。古いサーバーには無い */
    val proDrafted: List<ProDrafted> = emptyList(),
    /** いちばん新しい年の表彰。古いサーバーには無い */
    val honors: Honors? = null,
    /** 今年のプロの便り。古いサーバーには無い */
    val proNews: List<ProNews> = emptyList(),
)

/**
 * プロ入りした選手（NPBのドラフトで指名された人。サーバーの `proDraft.mjs`）。
 * ⚠ 先方要望（2026-11-16）: プロ指名を解禁。リーグ全体で年0〜3人
 */
@Serializable
data class ProDrafted(
    val year: Int = 0,
    val team: String = "",
    val name: String = "",
    val position: String? = null,
    val age: Int? = null,
    val npbTeam: String = "",
    val round: Int? = null,
    /** 育成指名（支配下ではない契約）。独立からの指名は中位〜育成が大半（サーバー proDraft.mjs） */
    val ikusei: Boolean = false,
    val reason: String? = null,
    /** プロでのいちばん新しい年の一行（飾り。サーバー proCareer.mjs）。古いサーバーには無い */
    val after: String? = null,
    /** プロでの歩み（古い順。球団史の方だけ） */
    val career: List<String> = emptyList(),
)

/** 今年のプロの便り（10月から年度更新まで） */
@Serializable
data class ProNews(
    val name: String = "",
    val team: String = "",
    val npbTeam: String = "",
    val text: String = "",
    val highlight: String? = null,
)

/** プロでのその後の行（球団史は全部の年、リーグ全体はいちばん新しい年。Web 版 Chronicle.jsx と同じ） */
fun proDraftedAfter(r: ProDrafted): List<String> = r.career.ifEmpty { listOfNotNull(r.after) }

/** プロ入りの見出し（「3年目　山田（投手・20歳）」。`short` を渡すと元の球団も付ける） */
fun proDraftedHead(r: ProDrafted, short: ((String) -> String)? = null): String =
    "${yearLabel(r.year)}　${r.name}" +
        (r.position?.let { "（${positionLabel(it)}・${r.age ?: "-"}歳）" } ?: "") +
        (short?.let { "　${it(r.team)}" } ?: "")

/** 指名順位（「4位」「育成2位」）。⚠ Web 版 `chronicleText.js` の `draftRankText` と同じ書き方 */
fun draftRankText(r: ProDrafted): String =
    r.round?.let { "${if (r.ikusei) "育成" else ""}${it}位" } ?: ""

/** プロ入りの中身（「読売ジャイアンツ 育成2位指名　20歳の将来性」） */
fun proDraftedBody(r: ProDrafted): String =
    "${r.npbTeam} ${draftRankText(r)}指名" + (r.reason?.takeIf { it.isNotBlank() }?.let { "　$it" } ?: "")

/** 球団史（「team」の窓口の chronicle） */
@Serializable
data class TeamChronicle(
    val seasons: List<TeamSeason> = emptyList(),
    val records: List<TeamRecord> = emptyList(),
    val retired: List<Retired> = emptyList(),
    val milestones: List<Milestone> = emptyList(),
    /** 入退団履歴（新しい順。サーバーの `teamMoves`）。古いサーバーには無い */
    val moves: List<TeamMove> = emptyList(),
    /** この球団からプロ入りした選手（新しい順）。古いサーバーには無い */
    val proDrafted: List<ProDrafted> = emptyList(),
    /** 球団の顔（主将・歴代主将・永久欠番・在籍の長い人。server/teamFace.mjs）。古いサーバーには無い */
    val face: TeamFace? = null,
)

@Serializable
data class FaceCaptain(val id: Long? = null, val name: String = "", val number: Int? = null, val year: Int? = null)

@Serializable
data class RetiredNumber(val number: Int = 0, val name: String = "", val year: Int = 0, val position: String? = null)

@Serializable
data class FaceTenure(val id: Long? = null, val name: String = "", val number: Int? = null, val years: Int = 0, val homegrown: Boolean = false)

@Serializable
data class TeamFace(
    val captain: FaceCaptain? = null,
    val captains: List<FaceCaptain> = emptyList(),
    val retiredNumbers: List<RetiredNumber> = emptyList(),
    val tenure: List<FaceTenure> = emptyList(),
)

/**
 * 球団の顔の行（Web 版 Chronicle.jsx の TeamFace と同じ文）。主将・永久欠番を決めるのは PC の球団史・記録
 */
fun teamFaceLines(f: TeamFace?): List<String> {
    if (f == null) return emptyList()
    val num = { n: Int? -> n?.let { "#$it " } ?: "" }
    return listOfNotNull(
        "主将: " + (f.captain?.let { "${num(it.number)}${it.name}" } ?: "なし"),
        f.captains.takeIf { it.isNotEmpty() }?.let { list -> "歴代主将: " + list.joinToString("・") { "${it.year}年目 ${it.name}" } },
        "永久欠番: " + (f.retiredNumbers.takeIf { it.isNotEmpty() }?.joinToString("・") { "${it.number} ${it.name}（${it.year}年目に引退）" } ?: "まだありません"),
        f.tenure.takeIf { it.isNotEmpty() }?.let { list -> "在籍の長い選手: " + list.joinToString("・") { "${it.name} ${it.years}年" + if (it.homegrown) "（生え抜き）" else "" } },
    )
}

/**
 * 入退団の1行（入団・退団・トレード・引退）。`side` は "in"（入った）/ "out"（出た）、
 * `other` は相手の球団（トレードの相手・入団前の所属）
 */
@Serializable
data class TeamMove(
    val year: Int? = null,
    val month: Int? = null,
    val day: Int? = null,
    val side: String = "",
    val how: String = "",
    val name: String = "",
    val position: String? = null,
    val other: String? = null,
)

/** 入退団の1行の文（「3年目 11月10日　入　山田（投手）入団（前: 東京）」。`short` は球団の短い名前） */
fun teamMoveLine(m: TeamMove, short: (String) -> String): String {
    val time = listOfNotNull(m.year?.let(::yearLabel), m.month?.let { "${it}月${m.day ?: ""}日" }).joinToString(" ")
    val pos = m.position?.let { "（${positionLabel(it)}）" }.orEmpty()
    val other = m.other?.let { if (m.side == "in") "（前: ${short(it)}）" else "（→ ${short(it)}）" }.orEmpty()
    return "$time　${if (m.side == "in") "入" else "出"}　${m.name}$pos　${m.how}$other"
}

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
/** `id` は現役（いま名簿にいる）の選手だけサーバーが付ける。押すと選手の詳細を開く */
data class RecordRow(val name: String = "", val year: Int? = null, val value: Int = 0, val current: Boolean = false, val active: Boolean = false, val id: Long? = null)

@Serializable
data class TeamRecord(val stat: String = "", val label: String = "", val season: List<RecordRow> = emptyList(), val career: List<RecordRow> = emptyList())

data class ChronicleText(val head: String, val body: String)

// ---- 球団史・記録の行（アプリのホームのメニュー「球団史・記録」。PC の src/online/Chronicle.jsx と同じ中身） ----

/** 年の書き方。オンラインの年は1年目からの通し番号なので「1年目」と書く（「1年」だと期間や学年に読める） */
fun yearLabel(year: Int): String = "${year}年目"

/** 歴代記録はシーズン最多・球団通算とも上位10人（サーバーが10人まで返す。PC も10人並べる。server/chronicle.mjs の TEAM_RECORD_ROWS と同じ数） */
const val TEAM_RECORD_ROWS = 10

/** 年表の1行（「2年目　1部2位 64勝53敗3分 プレーオフ優勝」） */
fun TeamSeason.historyLine(): String = "${yearLabel(year)}　$line"

/** シーズン最多の1行（「1位　山田（2年目・今季）　32」） */
fun seasonRecordLine(rank: Int, x: RecordRow): String {
    val note = listOfNotNull(x.year?.let(::yearLabel), "今季".takeIf { x.current }).joinToString("・")
    return "${rank}位　${x.name}${if (note.isEmpty()) "" else "（$note）"}　${x.value}"
}

/** 球団通算の1行（「1位　山田（現役）　120」） */
fun careerRecordLine(rank: Int, x: RecordRow): String = "${rank}位　${x.name}${if (x.active) "（現役）" else ""}　${x.value}"

/** 節目の1行（「2年目 8月28日　山田　シーズン30本塁打に到達」） */
fun milestoneLine(m: Milestone): String = "${yearLabel(m.year)} ${m.month}月${m.day}日　${m.name}　${milestoneText(m)}"

/** 引退した人の見出し（「3年目　山田（36歳）　殿堂入り」） */
fun retiredHead(r: Retired): String = "${yearLabel(r.year)}　${r.name}（${r.age ?: "-"}歳）${if (r.hallOfFame) "　殿堂入り" else ""}"

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
    return view.chronicle.milestones.filter { dayKey(it.year, it.month, it.day) == dayKey(year, d.month, d.day) }
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

/** 表彰を受けた人（サーバー seasonAwards.mjs。ベストナインは label＝守備位置） */
@Serializable
data class Honoree(
    val name: String = "",
    val team: String = "",
    val line: String? = null,
    val label: String? = null,
    val position: String? = null,
    val id: Long? = null,
)

@Serializable
data class HonorBattery(val team: String = "", val pitcher: String = "", val catcher: String = "", val line: String = "")

@Serializable
data class LeagueHonors(
    val league: String = "",
    val mvp: Honoree? = null,
    val rookie: Honoree? = null,
    val bestNine: List<Honoree> = emptyList(),
    val battery: HonorBattery? = null,
)

/** いちばん新しい年の表彰（タイトルと部ごとの表彰）。古いサーバーには無い */
@Serializable
data class Honors(
    val year: Int = 0,
    val titles: List<Honoree> = emptyList(),
    val leagues: List<LeagueHonors> = emptyList(),
)

/** 年間表彰の行（見出し → 中身）。⚠ Web 版 chronicleText.js の honorRows と同じ文 */
fun honorRows(h: Honors?, short: (String) -> String = { it }): List<Pair<String, String>> {
    if (h == null) return emptyList()
    fun who(name: String, team: String) = "${name}（${short(team)}）"
    val rows = mutableListOf<Pair<String, String>>()
    if (h.titles.isNotEmpty())
        rows += "タイトル" to h.titles.joinToString("、") { t -> "${t.label} ${who(t.name, t.team)}" + (t.line?.takeIf { it.isNotEmpty() }?.let { " $it" } ?: "") }
    for (l in h.leagues) {
        l.mvp?.let { rows += "${l.league} MVP" to "${who(it.name, it.team)} ${it.line.orEmpty()}" }
        l.rookie?.let { rows += "${l.league} 新人王" to "${who(it.name, it.team)} ${it.line.orEmpty()}" }
        l.battery?.let { rows += "${l.league} 最優秀バッテリー" to "${it.pitcher}・${it.catcher}（${short(it.team)}） ${it.line}" }
        if (l.bestNine.isNotEmpty()) rows += "${l.league} ベストナイン" to l.bestNine.joinToString("、") { "${it.label.orEmpty()} ${who(it.name, it.team)}" }
    }
    return rows
}

/**
 * オーナー名鑑（ビューの `owners`。サーバーの `server/ownerRecords.mjs`）。古いサーバーには無い。
 * ⚠ 文（`text`）はサーバーが作る。PC・スマホWeb（Chronicle.jsx の Owners）と同じものを出すだけ
 */
@Serializable
data class OwnerRecord(
    val label: String = "",
    val team: String = "",
    /** 見出し（「いしだ（湘南）」。呼び名＝球団名なら球団名だけ） */
    val head: String = "",
    val seasons: Int = 0,
    val champions: Int = 0,
    val milestone: String? = null,
    val text: String = "",
)


/**
 * 今季総括号（ビューの `seasonReview`。サーバーの `server/seasonReview.mjs`）。年度更新のあと〜開幕前だけ。
 * ⚠ 文はサーバーが作る。PC（球団史・記録のいちばん上・ホーム）とスマホWeb（話題）と同じ記事を出すだけ
 */
@Serializable
data class SeasonReview(
    val year: Int = 0,
    val headline: String = "",
    val lead: String = "",
    val articles: List<SeasonReviewArticle> = emptyList(),
)

@Serializable
data class SeasonReviewArticle(val kicker: String = "", val title: String = "", val body: String = "")
