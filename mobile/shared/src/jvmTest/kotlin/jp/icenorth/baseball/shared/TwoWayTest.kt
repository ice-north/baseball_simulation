package jp.icenorth.baseball.shared

import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** 二刀流（投手を野手の枠に・野手を投手起用に）。Web 版 lineupEdit.js / pitchingEdit.js と同じ決まり */
class TwoWayTest {
    private val raw = javaClass.getResource("/view-running.json")!!.readText()
    private val view = OnlineJson.decodeFromString<LeagueView>(raw)
    private val roster = view.roster.map { if (it.isPitcher || it.pitching != null) it else it.copy(pitching = Pitching(velocity = 120, control = 40, stamina = 40)) }

    @Test
    fun pitcherCanPlayTheField() {
        val draft = PlanDraft.from(view.lineup!!, roster)
        val pitcher = roster.first { it.isPitcher && it.isActive }
        val next = draft.replaceBatter(0, pitcher.id)
        assertEquals(pitcher.id, next.slots[0].playerId)
        assertNull(next.problem(roster), "投手を野手の枠に入れると保存できない")
        // 読み直しても投手の枠を空きにしない
        val payload = next.toPayload()
        val reread = PlanDraft.from(payload, roster)
        assertEquals(pitcher.id, reread.slots[0].playerId)
        // 抹消中は投手でも野手でも入れない
        val inactive = roster.map { if (it.id == pitcher.id) it.copy(isActive = false) else it }
        assertTrue(next.problem(inactive) != null)
    }

    @Test
    fun fielderJoinsAndLeavesTheStaff() {
        val draft = PlanDraft.from(view.lineup!!, roster)
        val state = draft.pitching
        val fielders = roster.filter { !it.isPitcher && it.isActive }
        // 加えていない野手は投手起用に入らない
        assertTrue(fielders.none { state.onStaff(it.id) }, "加えていない野手が投手起用に入った")
        val candidates = state.staffCandidates(roster)
        assertEquals(fielders.map { it.id }.toSet(), candidates.map { it.id }.toSet())
        val f = candidates.first()
        val added = state.addToStaff(f)
        assertEquals("auto_r", added.roles[f.id])
        assertEquals(added, added.addToStaff(f), "同じ野手を2回加えた")
        assertEquals(state, state.addToStaff(roster.first { it.isPitcher }), "投手登録を「加えた」")
        // 先発ローテに入れて保存し、読み直すと残る
        val starter = added.setRole(f.id, "auto_s", 0)
        assertEquals(f.id, starter.starters.first())
        val saved = draft.withPitching(starter)
        assertNull(saved.problem(roster))
        val payload = saved.toPayload()
        assertTrue(payload["pitcherRoles"]!!.jsonObject.containsKey(f.id.toString()))
        assertEquals(f.id, payload["starters"]!!.jsonArray.first().jsonPrimitive.long)
        val reread = PlanDraft.from(payload, roster)
        assertTrue(reread.pitching.onStaff(f.id))
        assertEquals(f.id, reread.pitching.starters.first())
        // 外す: ローテからも外れ、役割も消える。投手登録・最後の1人の先発は外せない
        val removed = starter.removeFromStaff(f.id, roster)
        assertFalse(removed.onStaff(f.id))
        assertFalse(f.id in removed.starters)
        val pitcher = roster.first { it.isPitcher && it.isActive }
        assertEquals(starter, starter.removeFromStaff(pitcher.id, roster))
        val lone = PitchingState(listOf(f.id), starter.roles)
        assertEquals(lone, lone.removeFromStaff(f.id, roster))
    }

    @Test
    fun validatesStartersAgainstTheCurrentRosterWhileEditing() {
        val draft = PlanDraft.from(view.lineup!!, roster)
        val starter = draft.pitching.starters.first()
        assertNull(draft.problem(roster))
        // 編集を始めたあとでも、自動更新で知った移籍・抹消を保存前に検査する。
        assertTrue(draft.problem(roster.filter { it.id != starter }) != null)
        assertTrue(draft.problem(roster.map { if (it.id == starter) it.copy(isActive = false) else it }) != null)
        assertTrue(draft.problem(roster.map { if (it.id == starter) it.copy(pitching = null) else it }) != null)
    }
}
