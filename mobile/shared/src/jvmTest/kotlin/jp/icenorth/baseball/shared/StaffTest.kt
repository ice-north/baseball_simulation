package jp.icenorth.baseball.shared

import kotlinx.serialization.json.JsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * 指導者（監督・コーチ）。実際のビュー（2年目のキャンプ。`tools/sim-harness/online-coach-check.mjs` が
 * `WRITE_APP_FIXTURE=1` で書き出す staff-view.json）を読み、紙面の記事まで作って確かめる
 */
class StaffTest {
    private val text = javaClass.getResource("/staff-view.json")!!.readText()
    private val view = OnlineJson.decodeFromString<LeagueView>(text)
    private val raw = OnlineJson.decodeFromString<JsonObject>(text)

    @Test
    fun readsTheStaffView() {
        assertEquals("camp", view.phase?.kind)
        val staff = assertNotNull(view.staff)
        assertEquals(listOf("manager", "pitching", "batting"), staff.seats.map { it.role })
        assertEquals(listOf("lineup", "pitching", "tactics", "tryout", "release", "camp"), staff.modes.map { it.key })
        assertEquals(listOf("self", "advice", "delegate"), staff.modeOptions.map { it.value })
        // キャンプの間は席を動かせて、市場に人がいる
        assertTrue(staff.canEditSeats)
        assertTrue(staff.market.isNotEmpty())
        // 采配の内訳は全項目に文がある。決めた人がいる行は「→」の中身もある
        assertTrue(staff.tactics.isNotEmpty() && staff.tactics.all { it.text.isNotBlank() })
        assertTrue(staff.tactics.filter { it.by != null }.all { it.resolvedLabel != null })
        val manager = assertNotNull(staff.manager)
        assertEquals(7, manager.views.size)
        // 性格は気質・こだわり・任せ方の3つ
        assertEquals(listOf("temper", "stubborn", "trust"), manager.traits.map { it.key })
        // カードの表はビジョン・育成観・性格。見出しと売り込みの文もサーバーの文のまま
        assertTrue(manager.headline.contains("、") && manager.color.endsWith("の野球"))
        assertTrue(manager.vision.startsWith("攻め ") && manager.vision.contains("看板"))
        assertTrue(manager.growth.isNotBlank() && manager.pitch.isNotBlank() && manager.prefs.isNotBlank())
        // コーチは受け持ちの側に印が付く
        assertTrue(staff.seats.filter { it.role != "manager" }.mapNotNull { it.coach }.all { it.vision.contains("受け持ち") })
        assertTrue(manager.history.isNotEmpty(), "1年目の通算が履歴に無い")
        assertNotNull(manager.delegation)
        // リーグ全球団と、キャンプの標準案を出した人
        assertEquals(12, view.leagueStaff?.teams?.size)
        assertNotNull(view.phase?.planBy)
    }

    @Test
    fun modeChangesAreSentTogether() {
        // 任せ方は下書きにためて「任せ方を保存」で1回だけ送る。いまの値と同じもの・知らない分野・席が空いた分野は送らない
        val modes = assertNotNull(view.staff).modes.map { it.copy(effective = "advice", locked = false) }
        val draft = mapOf("camp" to "self", "pitching" to "delegate", "lineup" to "advice", "nope" to "self")
        val changes = staffModeChanges(modes, draft)
        assertEquals(mapOf("pitching" to "delegate", "camp" to "self"), changes)
        val locked = modes.map { if (it.key == "pitching") it.copy(effective = "self", locked = true) else it }
        assertEquals(mapOf("camp" to "self"), staffModeChanges(locked, draft))
        assertEquals("""{"modes":{"pitching":"delegate","camp":"self"}}""", Commands.staffModes(changes).toString())
    }

    @Test
    fun lastOneToDelegateIsAskedFirst() {
        // 2人リーグのキャンプ（実際のビュー）。相手がまだ回しているうちは、任せても手続きは決まらない
        val camp = mapOf("camp" to "delegate")
        assertNull(delegationSettles(view, camp))
        assertTrue(!nobodyElseWaited(view))
        fun withOthers(f: (Member) -> Member) = view.copy(members = view.members.map { if (it.teamName == view.teamName) it else f(it) })
        // 相手が決定済み（4クール終えた・任せた）か CPU が決めるなら、自分が待たれている最後の1人
        val alone = withOthers { it.copy(ready = true) }
        assertTrue(nobodyElseWaited(alone))
        assertEquals("キャンプ", delegationSettles(alone, camp))
        assertEquals("キャンプ", delegationSettles(withOthers { it.copy(ready = true, delegated = true) }, camp))
        assertEquals("キャンプ", delegationSettles(withOthers { it.copy(cpu = true) }, camp))
        // 関係の無い分野・任せない変更・自分が決定済み・すでに任せている・手続きが無いときは聞かない
        assertNull(delegationSettles(alone, mapOf("tryout" to "delegate", "lineup" to "delegate")))
        assertNull(delegationSettles(alone, mapOf("camp" to "self")))
        assertNull(delegationSettles(alone.copy(members = alone.members.map { it.copy(ready = true) }), camp))
        assertNull(delegationSettles(alone.copy(members = alone.members.map { it.copy(cpu = true) }), camp))
        assertNull(delegationSettles(alone.copy(phase = alone.phase!!.copy(delegated = true)), camp))
        assertNull(delegationSettles(alone.copy(phase = null), camp))
        // 契約更改は「退団」の分野、トライアウトは「トライアウト」の分野
        assertEquals("契約更改", delegationSettles(alone.copy(phase = alone.phase!!.copy(kind = "contract")), mapOf("release" to "delegate", "lineup" to "advice")))
        assertEquals("トライアウト", delegationSettles(alone.copy(phase = alone.phase!!.copy(kind = "tryout")), mapOf("tryout" to "delegate")))
        assertNull(delegationSettles(alone.copy(phase = alone.phase!!.copy(kind = "offseason")), mapOf("camp" to "delegate")))
        // 1人リーグ（自分だけ）なら、手続き中に任せるといつも聞く
        assertEquals("キャンプ", delegationSettles(view.copy(members = view.members.filter { it.teamName == view.teamName }), camp))
    }

    @Test
    fun doneTextTellsWhenThePhaseWasDecided() {
        val camp = mapOf("camp" to "delegate")
        assertEquals("任せ方を変えました。キャンプは指導者の案で決まりました", staffModesDoneText(camp, view, view.copy(phase = null)))
        assertEquals("任せ方を変えました", staffModesDoneText(camp, view, view))
        assertEquals("任せ方を変えました", staffModesDoneText(mapOf("lineup" to "delegate"), view, view.copy(phase = null)))
        assertEquals("任せ方を変えました", staffModesDoneText(camp, view.copy(phase = null), view))
    }

    @Test
    fun speakerIsTheManager() {
        val (speaker, _) = commentSpeaker(view)
        assertEquals(view.staff!!.manager!!.shortName, speaker)
        // 指導者のいない古いサーバーは、人の呼び名を監督として
        assertEquals(0, commentSpeaker(view.copy(staff = null)).second)
    }

    @Test
    fun personnelNewsOnlyInCamp() {
        val year = view.year!!
        val fresh = view.leagueStaff!!.events.filter { it.year == year }
        val national = staffNationalArticles(view, offPhase = true, winners = emptySet())
        assertEquals(fresh.isNotEmpty(), national.any { it.kicker == "人事" })
        // 契約更改の間（まだ前の年度更新の話）は出さない
        val contract = view.copy(phase = view.phase!!.copy(kind = "contract"))
        assertTrue(staffNationalArticles(contract, offPhase = true, winners = emptySet()).isEmpty())
        assertTrue(staffLocalArticles(contract, "自", offPhase = true, pen = Pen(1)).isEmpty())
        // 紙面に組んでも落ちない（記事が入るなら全国紙に載る）
        val local = buildFrontPage(view, raw)
        val page = buildNationalPage(view, raw, local)
        assertEquals(fresh.isNotEmpty(), page.articles.any { it.kicker == "人事" })
    }

    @Test
    fun managerMilestoneInSeason() {
        val league = view.leagueStaff!!
        val team = league.teams.first { it.manager != null }
        val reached = view.copy(
            phase = view.phase!!.copy(kind = "season"),
            leagueStaff = league.copy(teams = league.teams.map { if (it.team == team.team) it.copy(manager = it.manager!!.copy(totalWins = 300)) else it }),
        )
        val articles = staffNationalArticles(reached, offPhase = false, winners = setOf(team.team))
        assertTrue(articles.single().title.endsWith("通算300勝"))
        // 負けた日・節目でない日は書かない
        assertTrue(staffNationalArticles(reached, offPhase = false, winners = emptySet()).isEmpty())
    }

    @Test
    fun benchRiftSometimesInSeason() {
        val staff = view.staff!!.copy(rifts = listOf(StaffRift("pitching", "山田監督と佐藤投手コーチ、継投・投球をめぐり考えが割れている")))
        val season = view.copy(phase = view.phase!!.copy(kind = "season"), staff = staff)
        val shown = (1..40).count { seed -> staffLocalArticles(season, "自", offPhase = false, pen = Pen(seed)).any { it.kicker == "ベンチの空気" } }
        // 4日に1日くらい（毎日は書かない・まったく書かないでもない）
        assertTrue(shown in 3..25, "ベンチの空気が40日で${shown}日")
        assertNull(staffLocalArticles(season.copy(staff = staff.copy(rifts = emptyList())), "自", offPhase = false, pen = Pen(1)).firstOrNull())
    }
}
